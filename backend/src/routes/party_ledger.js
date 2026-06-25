import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';

export const partyLedgerRouter = Router({ mergeParams: true });

partyLedgerRouter.get('/:partyId', asyncHandler(async (req, res) => {
  const { partyId } = req.params;
  const { type } = req.query; // 'Customer' or 'Supplier'

  if (!type) {
    return res.status(400).json({ success: false, error: 'Query parameter "type" (Customer or Supplier) is required' });
  }

  let customerId = null;
  let supplierId = null;
  let partyName = '';
  let partyClassification = type;
  let partyPhone = '';
  let partyEmail = '';
  let partyAddress = '';
  let openingBalance = 0;
  let openingBalanceType = 'Receivable';

  // 1. Resolve Primary Party & check if they are "Both"
  if (type === 'Customer') {
    const [cRows] = await req.tenantDb.execute(
      'SELECT * FROM customers WHERE customer_id = ? AND business_id = ?',
      [partyId, req.businessId]
    );
    if (cRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    const customer = cRows[0];
    customerId = customer.customer_id;
    partyName = customer.customer_name;
    partyPhone = customer.phone || '';
    partyEmail = customer.email || '';
    partyAddress = customer.address || '';
    openingBalance = Number(customer.opening_balance || 0);
    openingBalanceType = customer.opening_balance_type || 'Receivable';

    // Check if there is a matching supplier by name or phone
    if (partyPhone) {
      const [sRows] = await req.tenantDb.execute(
        'SELECT * FROM suppliers WHERE business_id = ? AND (supplier_name = ? OR (phone IS NOT NULL AND phone = ?))',
        [req.businessId, partyName, partyPhone]
      );
      if (sRows.length > 0) {
        supplierId = sRows[0].supplier_id;
        partyClassification = 'Both';
      }
    }
  } else {
    const [sRows] = await req.tenantDb.execute(
      'SELECT * FROM suppliers WHERE supplier_id = ? AND business_id = ?',
      [partyId, req.businessId]
    );
    if (sRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Supplier not found' });
    }
    const supplier = sRows[0];
    supplierId = supplier.supplier_id;
    partyName = supplier.supplier_name;
    partyPhone = supplier.phone || '';
    partyEmail = supplier.email || '';
    partyAddress = supplier.address || '';
    openingBalance = Number(supplier.opening_balance || 0);
    openingBalanceType = supplier.opening_balance_type || 'Payable';

    // Check if there is a matching customer by name or phone
    if (partyPhone) {
      const [cRows] = await req.tenantDb.execute(
        'SELECT * FROM customers WHERE business_id = ? AND (customer_name = ? OR (phone IS NOT NULL AND phone = ?))',
        [req.businessId, partyName, partyPhone]
      );
      if (cRows.length > 0) {
        customerId = cRows[0].customer_id;
        partyClassification = 'Both';
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // LEDGER LOGIC — correct separation:
  //
  // invoices   = Sales bills sent to customer        → customer OWES you
  // payIn      = Cash actually RECEIVED from customer / supplier refund
  // payOut     = Cash actually PAID to supplier / customer refund
  // purchases  = Purchase bills from supplier        → you OWE supplier
  // returns    = All credit notes (sales/purchase returns)
  //
  // The "invoice" grand_total should NEVER be counted as "received cash".
  // Only payment_in records represent real cash collected.
  // ──────────────────────────────────────────────────────────────────────
  const invoices = [];   // Sales bills (debit to customer)
  const payIn = [];      // Actual cash received
  const payOut = [];     // Actual cash paid out
  const purchases = [];  // Purchase bills (debit to business)
  const returns = [];    // All credit notes

  // ── CUSTOMER SIDE ──────────────────────────────────────────────────
  if (customerId) {
    // Sales Invoices — billed amounts (NOT cash received)
    const [salesRows] = await req.tenantDb.execute(
      `SELECT sale_id AS id, invoice_date AS date, 'invoice' AS type,
              invoice_no, grand_total, amount_received, payment_status,
              CONCAT('Invoice #', invoice_no) AS description,
              grand_total AS amount
       FROM sales
       WHERE customer_id = ? AND business_id = ? AND deleted_at IS NULL
       ORDER BY invoice_date DESC`,
      [customerId, req.businessId]
    );
    salesRows.forEach(i => invoices.push({ ...i, amount: Number(i.amount) }));

    // Payments In — only rows from payment_in table (real cash received)
    const [pmtInRows] = await req.tenantDb.execute(
      `SELECT payment_in_id AS id, payment_date AS date, 'payment_in' AS type,
              CONCAT('Payment In #', payment_in_id,
                IF(notes IS NOT NULL AND notes != '', CONCAT(' (', notes, ')'), '')) AS description,
              amount, sale_id AS linked_sale_id
       FROM payment_in
       WHERE customer_id = ? AND business_id = ?
       ORDER BY payment_date DESC`,
      [customerId, req.businessId]
    );
    pmtInRows.forEach(p => payIn.push({ ...p, amount: Number(p.amount) }));

    // Sales Returns — credit notes for customer
    const [srRows] = await req.tenantDb.execute(
      `SELECT return_id AS id, return_date AS date, 'sales_return' AS type,
              CONCAT('Sales Return #', return_invoice_no) AS description,
              grand_total AS amount, refund_status
       FROM sales_returns
       WHERE customer_id = ? AND business_id = ?
       ORDER BY return_date DESC`,
      [customerId, req.businessId]
    );
    srRows.forEach(r => returns.push({ ...r, amount: Number(r.amount) }));
    // Cash refunds go to payOut (real cash sent back to customer)
    srRows.filter(r => r.refund_status === 'Refunded').forEach(r =>
      payOut.push({ ...r, type: 'refund', description: `Refund: ${r.description}`, amount: Number(r.amount) })
    );
  }

  // ── SUPPLIER SIDE ──────────────────────────────────────────────────
  if (supplierId) {
    // Purchase Invoices — bills received from supplier
    const [purchaseRows] = await req.tenantDb.execute(
      `SELECT purchase_id AS id, purchase_date AS date, 'purchase' AS type,
              purchase_invoice_no, grand_total, amount_paid, payment_status,
              CONCAT('Purchase #', purchase_invoice_no,
                IF(supplier_invoice_no IS NOT NULL AND supplier_invoice_no != '',
                   CONCAT(' (Ref: ', supplier_invoice_no, ')'), '')) AS description,
              grand_total AS amount
       FROM purchases
       WHERE supplier_id = ? AND business_id = ? AND deleted_at IS NULL
       ORDER BY purchase_date DESC`,
      [supplierId, req.businessId]
    );
    purchaseRows.forEach(p => purchases.push({ ...p, amount: Number(p.amount) }));

    // Payments Out — real cash paid to supplier
    const [pmtOutRows] = await req.tenantDb.execute(
      `SELECT payment_out_id AS id, payment_date AS date, 'payment_out' AS type,
              CONCAT('Payment Out #', payment_out_id,
                IF(notes IS NOT NULL AND notes != '', CONCAT(' (', notes, ')'), '')) AS description,
              amount, purchase_id AS linked_purchase_id
       FROM payment_out
       WHERE supplier_id = ? AND business_id = ?
       ORDER BY payment_date DESC`,
      [supplierId, req.businessId]
    );
    pmtOutRows.forEach(p => payOut.push({ ...p, amount: Number(p.amount) }));

    // Purchase Returns — credit from supplier
    const [prRows] = await req.tenantDb.execute(
      `SELECT return_id AS id, return_date AS date, 'purchase_return' AS type,
              CONCAT('Purchase Return #', return_invoice_no) AS description,
              grand_total AS amount, refund_status
       FROM purchase_returns
       WHERE supplier_id = ? AND business_id = ?
       ORDER BY return_date DESC`,
      [supplierId, req.businessId]
    );
    prRows.forEach(r => returns.push({ ...r, amount: Number(r.amount) }));
    // Cash refunds from supplier go to payIn (real cash received from supplier)
    prRows.filter(r => r.refund_status === 'Refunded').forEach(r =>
      payIn.push({ ...r, type: 'refund', description: `Refund from ${r.description}`, amount: Number(r.amount) })
    );
  }

  // Sort each list latest first
  const sortByDateDesc = (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime();
  invoices.sort(sortByDateDesc);
  purchases.sort(sortByDateDesc);
  payIn.sort(sortByDateDesc);
  payOut.sort(sortByDateDesc);
  returns.sort(sortByDateDesc);

  // ── BALANCE CALCULATION ─────────────────────────────────────────────
  // Customer: balance_due = total_invoiced + opening_due − total_received
  // Supplier: balance_due = total_purchased − opening_due − total_paid
  const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0);
  const totalPurchased = purchases.reduce((s, p) => s + p.amount, 0);
  const totalPayIn = payIn.filter(p => p.type === 'payment_in').reduce((s, p) => s + p.amount, 0);
  const totalPayOut = payOut.filter(p => p.type === 'payment_out').reduce((s, p) => s + p.amount, 0);
  const totalReturns = returns.reduce((s, r) => s + r.amount, 0);

  const openingDue = (openingBalanceType === 'Receivable' || openingBalanceType === 'To Receive')
    ? openingBalance    // customer owes you
    : -openingBalance;  // you owe supplier

  const customerBalance = Math.max(totalInvoiced + openingDue - totalPayIn, 0);
  const supplierBalance = Math.max(totalPurchased - openingDue - totalPayOut, 0);
  const balance = type === 'Customer' ? customerBalance : supplierBalance;

  res.json({
    success: true,
    data: {
      party: {
        id: partyId,
        name: partyName,
        type: partyClassification,
        phone: partyPhone,
        email: partyEmail,
        address: partyAddress,
        customerId,
        supplierId,
        openingBalance,
        openingBalanceType
      },
      // Separated ledger lists
      invoices,       // Sales bills  → customer owes you (NOT collected cash)
      purchases,      // Purchase bills → you owe supplier (NOT paid cash)
      payIn,          // Real cash collected (payment_in + purchase_return refunds)
      payOut,         // Real cash paid out (payment_out + sales_return refunds)
      returns,        // All credit notes
      // Totals
      totalInvoiced,
      totalPurchased,
      totalPayIn,
      totalPayOut,
      totalReturns,
      balance,        // Net outstanding
      // For backwards-compat with old frontend code that expects combined arrays
      combinedPayIn: [...invoices.map(i => ({ ...i, type: 'invoice' })), ...payIn],
      combinedPayOut: [...purchases.map(p => ({ ...p, type: 'purchase' })), ...payOut]
    }
  });
}));
