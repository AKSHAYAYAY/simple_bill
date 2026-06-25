import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/requireRole.js';
import { createSalesReturn } from '../services/sales_return.service.js';
import { withTransaction } from '../utils/transaction.js';

export const salesReturnRouter = Router({ mergeParams: true });

// GET all sales returns with filters
salesReturnRouter.get('/', asyncHandler(async (req, res) => {
  const { customer_id, sale_id, from_date, to_date, refund_status, search } = req.query;
  const params = [req.businessId];

  let sql = `
    SELECT sr.*, c.customer_name, s.invoice_no
    FROM sales_returns sr
    LEFT JOIN customers c ON sr.customer_id = c.customer_id
    LEFT JOIN sales s ON sr.sale_id = s.sale_id
    WHERE sr.business_id = ?
  `;

  if (customer_id) {
    sql += ' AND sr.customer_id = ?';
    params.push(customer_id);
  }
  if (sale_id) {
    sql += ' AND sr.sale_id = ?';
    params.push(sale_id);
  }
  if (from_date && to_date) {
    sql += ' AND sr.return_date BETWEEN ? AND ?';
    params.push(from_date, to_date);
  }
  if (refund_status) {
    sql += ' AND sr.refund_status = ?';
    params.push(refund_status);
  }
  if (search) {
    sql += ' AND (sr.return_invoice_no LIKE ? OR c.customer_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY sr.created_at DESC LIMIT 100';

  const [rows] = await req.tenantDb.execute(sql, params);
  res.json({ success: true, data: rows });
}));

// POST create sales return
salesReturnRouter.post('/', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const returnData = req.body;

  if (!returnData.items || !returnData.items.length) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'At least one item is required for return' }});
  }

  try {
    const result = await createSalesReturn(req.tenantDb, req.businessId, returnData);
    res.status(201).json({ success: true, data: result, message: 'Sales return created successfully' });
  } catch (error) {
    if (error.code) {
      return res.status(error.status || 400).json({ success: false, error });
    }
    throw error;
  }
}));

// GET sales return details
salesReturnRouter.get('/:id', asyncHandler(async (req, res) => {
  const [returns] = await req.tenantDb.execute(
    `SELECT sr.*, c.customer_name, s.invoice_no
     FROM sales_returns sr
     LEFT JOIN customers c ON sr.customer_id = c.customer_id
     LEFT JOIN sales s ON sr.sale_id = s.sale_id
     WHERE sr.return_id = ? AND sr.business_id = ?`,
    [req.params.id, req.businessId]
  );

  if (!returns.length) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sales return not found' }});
  }

  const [items] = await req.tenantDb.execute(
    `SELECT sri.*, p.product_name, p.product_code, u.unit_name
     FROM sales_return_items sri
     LEFT JOIN products p ON sri.product_id = p.product_id
     LEFT JOIN units u ON p.unit_id = u.unit_id
     WHERE sri.return_id = ?`,
    [req.params.id]
  );

  res.json({ success: true, data: { ...returns[0], items } });
}));

// GET sales return items only
salesReturnRouter.get('/:id/items', asyncHandler(async (req, res) => {
  const [items] = await req.tenantDb.execute(
    `SELECT sri.*, p.product_name, p.product_code, u.unit_name
     FROM sales_return_items sri
     LEFT JOIN products p ON sri.product_id = p.product_id
     LEFT JOIN units u ON p.unit_id = u.unit_id
     WHERE sri.return_id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: items });
}));

// PUT update refund status
salesReturnRouter.put('/:id/refund-status', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const { refund_status, payment_mode, payment_date, reference_no, adjusted_in_sale_id } = req.body;
  const returnId = req.params.id;

  const [returns] = await req.tenantDb.execute(
    'SELECT * FROM sales_returns WHERE return_id = ? AND business_id = ?',
    [returnId, req.businessId]
  );

  if (!returns.length) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sales return not found' }});
  }

  const salesReturn = returns[0];
  let payment_out_id = salesReturn.payment_out_id;
  let final_adjusted_sale_id = salesReturn.adjusted_in_sale_id;

  if (refund_status === 'Refunded' && !payment_out_id) {
    const [paymentRes] = await req.tenantDb.execute(
      `INSERT INTO payment_out (
        business_id, supplier_id, customer_id, payment_date, payment_mode, amount, reference_no, notes
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
      [
        req.businessId, salesReturn.customer_id, payment_date || new Date().toISOString().slice(0, 10),
        payment_mode || 'Cash', salesReturn.grand_total, reference_no || null,
        `Refund for Sales Return ${salesReturn.return_invoice_no}`
      ]
    );
    payment_out_id = paymentRes.insertId;

    // Log to day book
    const cash_out = ['Cash'].includes(payment_mode) ? salesReturn.grand_total : 0;
    const bank_out = !['Cash', 'Credit'].includes(payment_mode) ? salesReturn.grand_total : 0;
    await req.tenantDb.execute(
      `INSERT INTO day_book (
        business_id, entry_date, entry_type, reference_type, reference_id,
        cash_out, bank_out, payment_mode, description
      ) VALUES (?, ?, 'Sales Return', 'sales_returns', ?, ?, ?, ?, ?)`,
      [
        req.businessId, payment_date || new Date().toISOString().slice(0, 10), returnId,
        cash_out, bank_out, payment_mode || 'Cash', `Refund for Sales Return ${salesReturn.return_invoice_no}`
      ]
    );
  } else if (refund_status === 'Adjusted') {
    if (!adjusted_in_sale_id) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'adjusted_in_sale_id is required' }});
    }
    final_adjusted_sale_id = adjusted_in_sale_id;
  }

  const refund_amount = refund_status === 'Refunded' ? salesReturn.grand_total : 0;

  await req.tenantDb.execute(
    `UPDATE sales_returns
     SET refund_status = ?, refund_amount = ?, payment_out_id = ?, adjusted_in_sale_id = ?
     WHERE return_id = ? AND business_id = ?`,
    [refund_status, refund_amount, payment_out_id, final_adjusted_sale_id, returnId, req.businessId]
  );

  res.json({
    success: true,
    data: {
      return_id: Number(returnId),
      refund_status,
      payment_out_id
    }
  });
}));

// POST apply sales return credit as adjustment against one or more sales (no cash flow)
salesReturnRouter.post('/:id/apply-adjustment', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const returnId = req.params.id;
  let allocations = req.body.allocations;

  if (!allocations) {
    const { sale_id } = req.body;
    if (!sale_id) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Either sale_id or allocations is required' }});
    }
    allocations = [{ sale_id, amount: null }];
  }

  if (!Array.isArray(allocations) || !allocations.length) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Allocations must be a non-empty array' }});
  }

  try {
    const result = await withTransaction(req.tenantDb, async (conn) => {
      // Lock and fetch the sales return
      const [returns] = await conn.execute(
        'SELECT * FROM sales_returns WHERE return_id = ? AND business_id = ? FOR UPDATE',
        [returnId, req.businessId]
      );
      if (!returns.length) {
        throw { status: 404, code: 'NOT_FOUND', message: 'Sales return not found' };
      }
      const salesReturn = returns[0];
      if (salesReturn.refund_status !== 'Pending') {
        throw { status: 422, code: 'ALREADY_SETTLED', message: `This return is already ${salesReturn.refund_status}. Cannot re-apply.` };
      }

      const returnGrandTotal = Number(salesReturn.grand_total);
      const currentRefundAmount = Number(salesReturn.refund_amount || 0);
      const remainingReturnCredit = Math.max(returnGrandTotal - currentRefundAmount, 0);

      if (remainingReturnCredit <= 0) {
        throw { status: 422, code: 'NO_CREDIT_AVAILABLE', message: 'No adjustment credit remaining on this return.' };
      }

      let totalAllocated = 0;
      const processedAllocations = [];

      for (const alloc of allocations) {
        const saleId = Number(alloc.sale_id);
        if (!saleId) {
          throw { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid sale_id in allocations' };
        }

        // Lock and fetch the target sale
        const [sales] = await conn.execute(
          'SELECT sale_id, invoice_no, grand_total, amount_received FROM sales WHERE sale_id = ? AND business_id = ? AND deleted_at IS NULL FOR UPDATE',
          [saleId, req.businessId]
        );
        if (!sales.length) {
          throw { status: 404, code: 'NOT_FOUND', message: `Target sale ID ${saleId} not found` };
        }
        const sale = sales[0];
        const saleRemaining = Math.max(Number(sale.grand_total) - Number(sale.amount_received), 0);

        let amountToApply = alloc.amount !== undefined && alloc.amount !== null ? Number(alloc.amount) : null;
        if (amountToApply === null) {
          amountToApply = Math.min(remainingReturnCredit, saleRemaining);
        }

        if (amountToApply <= 0) {
          throw { status: 400, code: 'VALIDATION_ERROR', message: `Allocation amount for invoice ${sale.invoice_no} must be greater than zero` };
        }

        if (amountToApply > saleRemaining + 0.01) {
          throw { status: 422, code: 'EXCEEDS_INVOICE_BALANCE', message: `Cannot apply ₹${amountToApply.toFixed(2)} to invoice ${sale.invoice_no} which has only ₹${saleRemaining.toFixed(2)} remaining.` };
        }

        totalAllocated += amountToApply;
        processedAllocations.push({
          sale,
          amountToApply,
          saleRemaining
        });
      }

      if (totalAllocated > remainingReturnCredit + 0.01) {
        throw { status: 422, code: 'EXCEEDS_RETURN_CREDIT', message: `Total allocated credit (₹${totalAllocated.toFixed(2)}) exceeds available return credit (₹${remainingReturnCredit.toFixed(2)})` };
      }

      // Apply changes
      for (const p of processedAllocations) {
        const newAmountReceived = Number(p.sale.amount_received) + p.amountToApply;
        const paymentStatus = newAmountReceived >= Number(p.sale.grand_total) ? 'Paid' : 'Partial';

        await conn.execute(
          'UPDATE sales SET amount_received = ?, payment_status = ?, updated_at = NOW() WHERE sale_id = ? AND business_id = ?',
          [newAmountReceived, paymentStatus, p.sale.sale_id, req.businessId]
        );
      }

      const newRefundAmount = currentRefundAmount + totalAllocated;
      const newRefundStatus = (newRefundAmount >= returnGrandTotal - 0.01) ? 'Adjusted' : 'Pending';
      const firstSaleId = processedAllocations[0].sale.sale_id;

      await conn.execute(
        'UPDATE sales_returns SET refund_status = ?, refund_amount = ?, adjusted_in_sale_id = ?, updated_at = NOW() WHERE return_id = ? AND business_id = ?',
        [newRefundStatus, newRefundAmount, firstSaleId, returnId, req.businessId]
      );

      return {
        return_id: Number(returnId),
        refund_status: newRefundStatus,
        refund_amount: newRefundAmount,
        credit_applied: totalAllocated,
        allocations: processedAllocations.map(p => ({
          sale_id: p.sale.sale_id,
          invoice_no: p.sale.invoice_no,
          amount_applied: p.amountToApply
        }))
      };
    });

    res.json({
      success: true,
      data: result,
      message: `₹${result.credit_applied.toFixed(2)} credit from sales return successfully adjusted against ${result.allocations.length} invoice(s).`
    });
  } catch (error) {
    if (error.code) {
      return res.status(error.status || 400).json({ success: false, error });
    }
    throw error;
  }
}));

// DELETE a sales return
salesReturnRouter.delete('/:id', requireRole('Owner', 'Admin'), asyncHandler(async (req, res) => {
  const returnId = req.params.id;

  const [returns] = await req.tenantDb.execute(
    'SELECT * FROM sales_returns WHERE return_id = ? AND business_id = ?',
    [returnId, req.businessId]
  );

  if (!returns.length) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sales return not found' }});
  }

  const salesReturn = returns[0];
  const conn = req.tenantDb;

  // 1. Get return items
  const [items] = await conn.execute('SELECT * FROM sales_return_items WHERE return_id = ?', [returnId]);

  // 2. Fetch cash refund amount from payment_out if it exists
  let cashRefundAmount = 0;
  if (salesReturn.payment_out_id) {
    const [paymentRows] = await conn.execute('SELECT amount FROM payment_out WHERE payment_out_id = ?', [salesReturn.payment_out_id]);
    if (paymentRows.length > 0) {
      cashRefundAmount = Number(paymentRows[0].amount);
    }
  }

  // 3. Reverse invoice adjustment offset if applied
  if (salesReturn.adjusted_in_sale_id) {
    const offsetToDeduct = Math.max(Number(salesReturn.grand_total || 0) - cashRefundAmount, 0);
    if (offsetToDeduct > 0) {
      const [sales] = await conn.execute(
        'SELECT sale_id, grand_total, amount_received FROM sales WHERE sale_id = ? AND business_id = ? FOR UPDATE',
        [salesReturn.adjusted_in_sale_id, req.businessId]
      );
      if (sales.length > 0) {
        const sale = sales[0];
        const newAmountReceived = Math.max(Number(sale.amount_received || 0) - offsetToDeduct, 0);
        const paymentStatus = newAmountReceived >= Number(sale.grand_total) ? 'Paid' : (newAmountReceived > 0 ? 'Partial' : 'Unpaid');

        await conn.execute(
          'UPDATE sales SET amount_received = ?, payment_status = ?, updated_at = NOW() WHERE sale_id = ?',
          [newAmountReceived, paymentStatus, sale.sale_id]
        );
      }
    }
  }

  // 4. Delete the sales_return record (will cascade delete items due to FK)
  await conn.execute('DELETE FROM sales_returns WHERE return_id = ? AND business_id = ?', [returnId, req.businessId]);

  // 5. Reverse stock movements (the trigger trg_sale_return_stock_restore only works ON INSERT,
  // so we must manually decrement stock on delete since there is no AFTER DELETE trigger!)
  for (const item of items) {
    if (item.product_id) {
      await conn.execute(
        'UPDATE products SET current_stock = current_stock - ? WHERE product_id = ? AND business_id = ?',
        [item.quantity, item.product_id, req.businessId]
      );

      // Get current stock for audit movement log
      const [prodRows] = await conn.execute('SELECT current_stock FROM products WHERE product_id = ?', [item.product_id]);
      const stockAfter = prodRows.length ? Number(prodRows[0].current_stock) : 0;
      const stockBefore = stockAfter + Number(item.quantity);

      await conn.execute(
        `INSERT INTO stock_movements (
          business_id, product_id, movement_type, reference_type, reference_id, quantity, stock_before, stock_after, notes
        ) VALUES (?, ?, 'Manual Adjustment', 'sales_returns', ?, ?, ?, ?, 'Deleted Sales Return')`,
        [req.businessId, item.product_id, returnId, item.quantity, stockBefore, stockAfter]
      );
    }
  }

  // 6. Remove auto-created payment_out and day book entries
  if (salesReturn.payment_out_id) {
    await conn.execute('DELETE FROM payment_out WHERE payment_out_id = ?', [salesReturn.payment_out_id]);
  }
  await conn.execute(
    "DELETE FROM day_book WHERE reference_type = 'sales_returns' AND reference_id = ?",
    [returnId]
  );

  res.status(204).send();
}));
