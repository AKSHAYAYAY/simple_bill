import { withTransaction } from '../utils/transaction.js';

const toMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const paymentError = (status, message, code = 'VALIDATION_ERROR') => ({
  status,
  code,
  message
});

const getPaymentStatus = (grandTotal, paidAmount) => {
  const total = toMoney(grandTotal);
  const paid = toMoney(paidAmount);
  if (total > 0 && paid >= total) return 'Paid';
  if (paid > 0) return 'Partial';
  return 'Unpaid';
};

const cashPart = (mode, amount) => (mode === 'Cash' ? amount : 0);
const bankPart = (mode, amount) => (['UPI', 'Bank Transfer', 'Card', 'Cheque', 'Bank'].includes(mode) && mode !== 'Cash' ? amount : 0);
const normaliseMode = (mode = 'Cash') => (mode === 'Bank' ? 'Bank Transfer' : mode);

const requirePositiveAmount = (amount) => {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw paymentError(422, 'Amount must be greater than 0');
  }
  return toMoney(parsed);
};

export async function createPayment(pool, businessId, type, paymentData) {
  return withTransaction(pool, async (conn) => {
    const {
      customer_id = null, supplier_id = null, sale_id = null, purchase_id = null,
      payment_date, payment_mode = 'Cash', amount, reference_no = null, notes = null
    } = paymentData;

    const parsedAmount = requirePositiveAmount(amount);

    if (!customer_id && !supplier_id) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Either customer_id or supplier_id must be provided' };
    }

    const normalisedPaymentMode = normaliseMode(payment_mode);
    const cashAmount = cashPart(normalisedPaymentMode, parsedAmount);
    const bankAmount = bankPart(normalisedPaymentMode, parsedAmount);
    
    let paymentId;

    if (type === 'IN') {
      const [res] = await conn.execute(
        `INSERT INTO payment_in (
          business_id, customer_id, supplier_id, sale_id, payment_date, 
          payment_mode, amount, reference_no, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [businessId, customer_id, supplier_id, sale_id, payment_date, normalisedPaymentMode, parsedAmount, reference_no, notes]
      );
      paymentId = res.insertId;

      await conn.execute(
        `INSERT INTO day_book (
          business_id, entry_date, entry_type, reference_type, reference_id,
          cash_in, bank_in, payment_mode, description
        ) VALUES (?, ?, 'Payment In', 'payment_in', ?, ?, ?, ?, ?)`,
        [businessId, payment_date, paymentId, cashAmount, bankAmount, normalisedPaymentMode, notes || 'Payment Received']
      );
    } else {
      const [res] = await conn.execute(
        `INSERT INTO payment_out (
          business_id, supplier_id, customer_id, purchase_id, payment_date, 
          payment_mode, amount, reference_no, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [businessId, supplier_id, customer_id, purchase_id, payment_date, normalisedPaymentMode, parsedAmount, reference_no, notes]
      );
      paymentId = res.insertId;

      await conn.execute(
        `INSERT INTO day_book (
          business_id, entry_date, entry_type, reference_type, reference_id,
          cash_out, bank_out, payment_mode, description
        ) VALUES (?, ?, 'Payment Out', 'payment_out', ?, ?, ?, ?, ?)`,
        [businessId, payment_date, paymentId, cashAmount, bankAmount, normalisedPaymentMode, notes || 'Payment Made']
      );
    }

    // Optionally update invoice status if sale_id or purchase_id is provided
    if (sale_id && type === 'IN') {
      const [rows] = await conn.execute(
        `SELECT grand_total, amount_received
         FROM sales
         WHERE sale_id = ? AND business_id = ? AND deleted_at IS NULL
         FOR UPDATE`,
        [sale_id, businessId]
      );
      if (!rows.length) throw paymentError(404, 'Sale invoice not found', 'NOT_FOUND');
      const remaining = toMoney(rows[0].grand_total - rows[0].amount_received);
      if (parsedAmount > remaining) {
        throw paymentError(422, `Maximum receivable is ₹${remaining.toFixed(2)} for this invoice`);
      }
      await conn.execute(
        `UPDATE sales 
         SET amount_received = amount_received + ?, 
             payment_status = CASE 
                WHEN amount_received + ? >= grand_total THEN 'Paid' 
                WHEN amount_received + ? > 0 THEN 'Partial'
                ELSE 'Unpaid'
             END,
             updated_at = NOW()
         WHERE sale_id = ? AND business_id = ?`,
        [parsedAmount, parsedAmount, parsedAmount, sale_id, businessId]
      );
    }

    if (purchase_id && type === 'OUT') {
      const [rows] = await conn.execute(
        `SELECT grand_total, amount_paid
         FROM purchases
         WHERE purchase_id = ? AND business_id = ? AND deleted_at IS NULL
         FOR UPDATE`,
        [purchase_id, businessId]
      );
      if (!rows.length) throw paymentError(404, 'Purchase invoice not found', 'NOT_FOUND');
      const remaining = toMoney(rows[0].grand_total - rows[0].amount_paid);
      if (parsedAmount > remaining) {
        throw paymentError(422, `Maximum payable is ₹${remaining.toFixed(2)}. This invoice has ₹${remaining.toFixed(2)} remaining.`);
      }
      await conn.execute(
        `UPDATE purchases 
         SET amount_paid = amount_paid + ?, 
             payment_status = CASE 
                WHEN amount_paid + ? >= grand_total THEN 'Paid' 
                ELSE 'Partial' 
             END,
             updated_at = NOW()
         WHERE purchase_id = ? AND business_id = ?`,
        [parsedAmount, parsedAmount, purchase_id, businessId]
      );
    }

    return { payment_id: paymentId, amount: parsedAmount, payment_mode: normalisedPaymentMode };
  });
}

export async function getSupplierPaymentContext(pool, businessId, supplierId) {
  const [supplierRows] = await pool.execute(
    `SELECT supplier_id, supplier_name, phone, opening_balance, opening_balance_type
     FROM suppliers
     WHERE supplier_id = ? AND business_id = ?`,
    [supplierId, businessId]
  );
  if (!supplierRows.length) throw paymentError(404, 'Supplier not found', 'NOT_FOUND');

  const [outstandingPurchases] = await pool.execute(
    `SELECT purchase_id, purchase_invoice_no, purchase_date, grand_total, amount_paid,
            GREATEST(grand_total - amount_paid, 0) AS remaining,
            payment_status,
            DATEDIFF(CURDATE(), purchase_date) AS days_old,
            (DATEDIFF(CURDATE(), purchase_date) > 30 AND payment_status != 'Paid') AS is_overdue
     FROM purchases
     WHERE supplier_id = ? AND business_id = ?
       AND payment_status != 'Paid'
       AND deleted_at IS NULL
       AND grand_total > amount_paid
     ORDER BY purchase_date ASC`,
    [supplierId, businessId]
  );

  const [pendingReturnRefunds] = await pool.execute(
    `SELECT return_id, return_invoice_no, return_date, grand_total, refund_amount, refund_status
     FROM purchase_returns
     WHERE supplier_id = ? AND business_id = ?
       AND refund_status = 'Pending'
     ORDER BY return_date ASC`,
    [supplierId, businessId]
  );

  return {
    supplier: supplierRows[0],
    outstanding_purchases: outstandingPurchases,
    pending_return_refunds: pendingReturnRefunds,
    total_outstanding: toMoney(outstandingPurchases.reduce((sum, row) => sum + Number(row.remaining || 0), 0)),
    total_pending_refunds: toMoney(pendingReturnRefunds.reduce((sum, row) => sum + (Number(row.grand_total || 0) - Number(row.refund_amount || 0)), 0))
  };
}

export async function getCustomerPaymentContext(pool, businessId, customerId) {
  const [customerRows] = await pool.execute(
    `SELECT customer_id, customer_name, phone, opening_balance, opening_balance_type
     FROM customers
     WHERE customer_id = ? AND business_id = ?`,
    [customerId, businessId]
  );
  if (!customerRows.length) throw paymentError(404, 'Customer not found', 'NOT_FOUND');

  const [outstandingInvoices] = await pool.execute(
    `SELECT sale_id, invoice_no, invoice_date, grand_total, amount_received,
            GREATEST(grand_total - amount_received, 0) AS remaining,
            payment_status,
            DATE_ADD(invoice_date, INTERVAL 30 DAY) AS due_date,
            DATEDIFF(DATE_ADD(invoice_date, INTERVAL 30 DAY), CURDATE()) AS days_until_due,
            (DATEDIFF(CURDATE(), invoice_date) > 30 AND payment_status != 'Paid') AS is_overdue
     FROM sales
     WHERE customer_id = ? AND business_id = ?
       AND payment_status != 'Paid'
       AND deleted_at IS NULL
       AND grand_total > amount_received
     ORDER BY invoice_date ASC`,
    [customerId, businessId]
  );

  const [pendingReturnRefunds] = await pool.execute(
    `SELECT return_id, return_invoice_no, return_date, grand_total, refund_amount, refund_status
     FROM sales_returns
     WHERE customer_id = ? AND business_id = ?
       AND refund_status = 'Pending'
     ORDER BY return_date ASC`,
    [customerId, businessId]
  );

  const totalOutstanding = toMoney(outstandingInvoices.reduce((sum, row) => sum + Number(row.remaining || 0), 0));
  const opening = Number(customerRows[0].opening_balance || 0);

  return {
    customer: customerRows[0],
    outstanding_invoices: outstandingInvoices,
    pending_return_refunds: pendingReturnRefunds,
    total_outstanding: totalOutstanding,
    total_pending_refunds: toMoney(pendingReturnRefunds.reduce((sum, row) => sum + (Number(row.grand_total || 0) - Number(row.refund_amount || 0)), 0)),
    total_due_including_opening: toMoney(totalOutstanding + opening)
  };
}

export async function recordSupplierPayOut(pool, businessId, supplierId, data) {
  return withTransaction(pool, async (conn) => {
    const amount = requirePositiveAmount(data.amount);
    const paymentMode = normaliseMode(data.payment_mode);
    const paymentDate = data.payment_date || new Date().toISOString().slice(0, 10);
    const purchaseId = data.is_standalone ? null : data.purchase_id || null;

    const [supplierRows] = await conn.execute(
      'SELECT supplier_id, supplier_name FROM suppliers WHERE supplier_id = ? AND business_id = ?',
      [supplierId, businessId]
    );
    if (!supplierRows.length) throw paymentError(404, 'Supplier not found', 'NOT_FOUND');

    let purchase = null;
    if (purchaseId) {
      const [purchaseRows] = await conn.execute(
        `SELECT purchase_id, purchase_invoice_no, grand_total, amount_paid
         FROM purchases
         WHERE purchase_id = ? AND supplier_id = ? AND business_id = ? AND deleted_at IS NULL
         FOR UPDATE`,
        [purchaseId, supplierId, businessId]
      );
      if (!purchaseRows.length) throw paymentError(404, 'Purchase invoice not found', 'NOT_FOUND');
      purchase = purchaseRows[0];
      const remaining = toMoney(purchase.grand_total - purchase.amount_paid);
      if (amount > remaining) {
        throw paymentError(422, `Maximum payable is ₹${remaining.toFixed(2)}. This invoice has ₹${remaining.toFixed(2)} remaining.`);
      }
    }

    const [paymentRes] = await conn.execute(
      `INSERT INTO payment_out (
        business_id, supplier_id, customer_id, purchase_id, payment_date,
        payment_mode, amount, reference_no, notes
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      [businessId, supplierId, purchaseId, paymentDate, paymentMode, amount, data.reference_no || null, data.notes || null]
    );

    let purchaseUpdated = null;
    if (purchase) {
      const newAmountPaid = toMoney(Number(purchase.amount_paid || 0) + amount);
      const status = getPaymentStatus(purchase.grand_total, newAmountPaid);
      await conn.execute(
        `UPDATE purchases
         SET amount_paid = ?, payment_status = ?, updated_at = NOW()
         WHERE purchase_id = ? AND business_id = ?`,
        [newAmountPaid, status, purchase.purchase_id, businessId]
      );
      purchaseUpdated = {
        purchase_id: purchase.purchase_id,
        purchase_invoice_no: purchase.purchase_invoice_no,
        new_amount_paid: newAmountPaid,
        remaining: toMoney(Number(purchase.grand_total || 0) - newAmountPaid),
        payment_status: status
      };
    }

    await conn.execute(
      `INSERT INTO day_book (
        business_id, entry_date, entry_type, reference_type, reference_id,
        cash_out, bank_out, payment_mode, description
      ) VALUES (?, ?, 'Payment Out', 'payment_out', ?, ?, ?, ?, ?)`,
      [
        businessId,
        paymentDate,
        paymentRes.insertId,
        cashPart(paymentMode, amount),
        bankPart(paymentMode, amount),
        paymentMode,
        `Payment to ${supplierRows[0].supplier_name}${purchase ? ` for ${purchase.purchase_invoice_no}` : ' (standalone)'}`
      ]
    );

    return {
      payment_out_id: paymentRes.insertId,
      amount,
      purchase_updated: purchaseUpdated,
      message: `Payment of ₹${amount.toFixed(2)} recorded${purchase ? ` for ${purchase.purchase_invoice_no}` : ''}`
    };
  });
}

export async function recordCustomerPayIn(pool, businessId, customerId, data) {
  return withTransaction(pool, async (conn) => {
    const amount = requirePositiveAmount(data.amount);
    const paymentMode = normaliseMode(data.payment_mode);
    const paymentDate = data.payment_date || new Date().toISOString().slice(0, 10);
    const saleId = data.is_standalone ? null : data.sale_id || null;

    const [customerRows] = await conn.execute(
      'SELECT customer_id, customer_name FROM customers WHERE customer_id = ? AND business_id = ?',
      [customerId, businessId]
    );
    if (!customerRows.length) throw paymentError(404, 'Customer not found', 'NOT_FOUND');

    let sale = null;
    if (saleId) {
      const [saleRows] = await conn.execute(
        `SELECT sale_id, invoice_no, grand_total, amount_received
         FROM sales
         WHERE sale_id = ? AND customer_id = ? AND business_id = ? AND deleted_at IS NULL
         FOR UPDATE`,
        [saleId, customerId, businessId]
      );
      if (!saleRows.length) throw paymentError(404, 'Sale invoice not found', 'NOT_FOUND');
      sale = saleRows[0];
      const remaining = toMoney(sale.grand_total - sale.amount_received);
      if (amount > remaining) {
        throw paymentError(422, `Maximum receivable is ₹${remaining.toFixed(2)} for invoice ${sale.invoice_no}`);
      }
    }

    const [paymentRes] = await conn.execute(
      `INSERT INTO payment_in (
        business_id, customer_id, supplier_id, sale_id, payment_date,
        payment_mode, amount, reference_no, notes
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      [businessId, customerId, saleId, paymentDate, paymentMode, amount, data.reference_no || null, data.notes || null]
    );

    let saleUpdated = null;
    if (sale) {
      const newAmountReceived = toMoney(Number(sale.amount_received || 0) + amount);
      const status = getPaymentStatus(sale.grand_total, newAmountReceived);
      await conn.execute(
        `UPDATE sales
         SET amount_received = ?, payment_status = ?, updated_at = NOW()
         WHERE sale_id = ? AND business_id = ?`,
        [newAmountReceived, status, sale.sale_id, businessId]
      );
      saleUpdated = {
        sale_id: sale.sale_id,
        invoice_no: sale.invoice_no,
        new_amount_received: newAmountReceived,
        remaining: toMoney(Number(sale.grand_total || 0) - newAmountReceived),
        payment_status: status
      };
    }

    await conn.execute(
      `INSERT INTO day_book (
        business_id, entry_date, entry_type, reference_type, reference_id,
        cash_in, bank_in, payment_mode, description
      ) VALUES (?, ?, 'Payment In', 'payment_in', ?, ?, ?, ?, ?)`,
      [
        businessId,
        paymentDate,
        paymentRes.insertId,
        cashPart(paymentMode, amount),
        bankPart(paymentMode, amount),
        paymentMode,
        `Received from ${customerRows[0].customer_name}${sale ? ` for ${sale.invoice_no}` : ' (standalone)'}`
      ]
    );

    return {
      payment_in_id: paymentRes.insertId,
      amount,
      sale_updated: saleUpdated,
      message: `₹${amount.toFixed(2)} received from ${customerRows[0].customer_name}${sale ? ` for ${sale.invoice_no}` : ''}`
    };
  });
}

export async function recordSupplierPayIn(pool, businessId, supplierId, data) {
  return withTransaction(pool, async (conn) => {
    const amount = requirePositiveAmount(data.amount);
    const paymentMode = normaliseMode(data.payment_mode);
    const paymentDate = data.payment_date || new Date().toISOString().slice(0, 10);
    const returnId = data.is_standalone ? null : data.return_id || null;

    const [supplierRows] = await conn.execute(
      'SELECT supplier_id, supplier_name FROM suppliers WHERE supplier_id = ? AND business_id = ?',
      [supplierId, businessId]
    );
    if (!supplierRows.length) throw paymentError(404, 'Supplier not found', 'NOT_FOUND');

    let purchaseReturn = null;
    if (returnId) {
      const [returnRows] = await conn.execute(
        `SELECT return_id, return_invoice_no, grand_total, refund_status
         FROM purchase_returns
         WHERE return_id = ? AND supplier_id = ? AND business_id = ?
         FOR UPDATE`,
        [returnId, supplierId, businessId]
      );
      if (!returnRows.length) throw paymentError(404, 'Purchase return not found', 'NOT_FOUND');
      purchaseReturn = returnRows[0];
      if (purchaseReturn.refund_status !== 'Pending') {
        throw paymentError(422, 'This purchase return is already settled.');
      }
      const maxRefund = toMoney(purchaseReturn.grand_total);
      if (amount > maxRefund) {
        throw paymentError(422, `Maximum receivable refund is ₹${maxRefund.toFixed(2)} for return ${purchaseReturn.return_invoice_no}`);
      }
    }

    const [paymentRes] = await conn.execute(
      `INSERT INTO payment_in (
        business_id, customer_id, supplier_id, sale_id, payment_date,
        payment_mode, amount, reference_no, notes
      ) VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, ?)`,
      [businessId, supplierId, paymentDate, paymentMode, amount, data.reference_no || null, data.notes || null]
    );

    let returnUpdated = null;
    if (purchaseReturn) {
      await conn.execute(
        `UPDATE purchase_returns
         SET refund_status = 'Refunded', refund_amount = ?, payment_in_id = ?, updated_at = NOW()
         WHERE return_id = ? AND business_id = ?`,
        [amount, paymentRes.insertId, purchaseReturn.return_id, businessId]
      );
      returnUpdated = { return_id: purchaseReturn.return_id, return_invoice_no: purchaseReturn.return_invoice_no, refund_status: 'Refunded' };
    }

    await conn.execute(
      `INSERT INTO day_book (
        business_id, entry_date, entry_type, reference_type, reference_id,
        cash_in, bank_in, payment_mode, description
      ) VALUES (?, ?, 'Purchase Return', 'payment_in', ?, ?, ?, ?, ?)`,
      [
        businessId,
        paymentDate,
        paymentRes.insertId,
        cashPart(paymentMode, amount),
        bankPart(paymentMode, amount),
        paymentMode,
        `Refund from ${supplierRows[0].supplier_name}${purchaseReturn ? ` for ${purchaseReturn.return_invoice_no}` : ' (standalone)'}`
      ]
    );

    return { payment_in_id: paymentRes.insertId, amount, return_updated: returnUpdated };
  });
}

export async function recordCustomerPayOut(pool, businessId, customerId, data) {
  return withTransaction(pool, async (conn) => {
    const amount = requirePositiveAmount(data.amount);
    const paymentMode = normaliseMode(data.payment_mode);
    const paymentDate = data.payment_date || new Date().toISOString().slice(0, 10);
    const returnId = data.is_standalone ? null : data.return_id || null;

    const [customerRows] = await conn.execute(
      'SELECT customer_id, customer_name FROM customers WHERE customer_id = ? AND business_id = ?',
      [customerId, businessId]
    );
    if (!customerRows.length) throw paymentError(404, 'Customer not found', 'NOT_FOUND');

    let salesReturn = null;
    if (returnId) {
      const [returnRows] = await conn.execute(
        `SELECT return_id, return_invoice_no, grand_total, refund_status
         FROM sales_returns
         WHERE return_id = ? AND customer_id = ? AND business_id = ?
         FOR UPDATE`,
        [returnId, customerId, businessId]
      );
      if (!returnRows.length) throw paymentError(404, 'Sales return not found', 'NOT_FOUND');
      salesReturn = returnRows[0];
      if (salesReturn.refund_status !== 'Pending') {
        throw paymentError(422, 'This sales return is already settled.');
      }
      const maxRefund = toMoney(salesReturn.grand_total);
      if (amount > maxRefund) {
        throw paymentError(422, `Maximum payable refund is ₹${maxRefund.toFixed(2)} for return ${salesReturn.return_invoice_no}`);
      }
    }

    const [paymentRes] = await conn.execute(
      `INSERT INTO payment_out (
        business_id, supplier_id, customer_id, purchase_id, payment_date,
        payment_mode, amount, reference_no, notes
      ) VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, ?)`,
      [businessId, customerId, paymentDate, paymentMode, amount, data.reference_no || null, data.notes || null]
    );

    let returnUpdated = null;
    if (salesReturn) {
      await conn.execute(
        `UPDATE sales_returns
         SET refund_status = 'Refunded', refund_amount = ?, payment_out_id = ?, updated_at = NOW()
         WHERE return_id = ? AND business_id = ?`,
        [amount, paymentRes.insertId, salesReturn.return_id, businessId]
      );
      returnUpdated = { return_id: salesReturn.return_id, return_invoice_no: salesReturn.return_invoice_no, refund_status: 'Refunded' };
    }

    await conn.execute(
      `INSERT INTO day_book (
        business_id, entry_date, entry_type, reference_type, reference_id,
        cash_out, bank_out, payment_mode, description
      ) VALUES (?, ?, 'Sales Return', 'payment_out', ?, ?, ?, ?, ?)`,
      [
        businessId,
        paymentDate,
        paymentRes.insertId,
        cashPart(paymentMode, amount),
        bankPart(paymentMode, amount),
        paymentMode,
        `Refund to ${customerRows[0].customer_name}${salesReturn ? ` for ${salesReturn.return_invoice_no}` : ' (standalone)'}`
      ]
    );

    return { payment_out_id: paymentRes.insertId, amount, return_updated: returnUpdated };
  });
}

export async function getSupplierPaymentHistory(pool, businessId, supplierId) {
  const [rows] = await pool.execute(
    `SELECT 'payment_out' AS direction, po.payment_out_id AS id, po.payment_date,
            po.payment_mode, po.amount, po.reference_no, po.notes,
            p.purchase_invoice_no AS linked_invoice_no, NULL AS linked_return_no
     FROM payment_out po
     LEFT JOIN purchases p ON po.purchase_id = p.purchase_id
     WHERE po.supplier_id = ? AND po.business_id = ?
     UNION ALL
     SELECT 'payment_in' AS direction, pi.payment_in_id AS id, pi.payment_date,
            pi.payment_mode, pi.amount, pi.reference_no, pi.notes,
            NULL AS linked_invoice_no, pr.return_invoice_no AS linked_return_no
     FROM payment_in pi
     LEFT JOIN purchase_returns pr ON pi.payment_in_id = pr.payment_in_id
     WHERE pi.supplier_id = ? AND pi.business_id = ?
     ORDER BY payment_date DESC`,
    [supplierId, businessId, supplierId, businessId]
  );
  return rows;
}

export async function getCustomerPaymentHistory(pool, businessId, customerId) {
  const [rows] = await pool.execute(
    `SELECT 'payment_in' AS direction, pi.payment_in_id AS id, pi.payment_date,
            pi.payment_mode, pi.amount, pi.reference_no, pi.notes,
            s.invoice_no AS linked_invoice_no, NULL AS linked_return_no
     FROM payment_in pi
     LEFT JOIN sales s ON pi.sale_id = s.sale_id
     WHERE pi.customer_id = ? AND pi.business_id = ?
     UNION ALL
     SELECT 'payment_out' AS direction, po.payment_out_id AS id, po.payment_date,
            po.payment_mode, po.amount, po.reference_no, po.notes,
            NULL AS linked_invoice_no, sr.return_invoice_no AS linked_return_no
     FROM payment_out po
     LEFT JOIN sales_returns sr ON po.payment_out_id = sr.payment_out_id
     WHERE po.customer_id = ? AND po.business_id = ?
     ORDER BY payment_date DESC`,
    [customerId, businessId, customerId, businessId]
  );
  return rows;
}
