import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  getSupplierPaymentContext,
  getSupplierPaymentHistory,
  recordSupplierPayIn,
  recordSupplierPayOut
} from '../services/payment.service.js';

export const supplierRouter = Router({ mergeParams: true });

const sendPaymentError = (res, error) => {
  if (error?.code) {
    return res.status(error.status || 400).json({
      success: false,
      error: { code: error.code, message: error.message }
    });
  }
  throw error;
};

supplierRouter.get('/', asyncHandler(async (req, res) => {
  const { search, is_active, has_balance, page = 1, limit = 25 } = req.query;
  const params = [req.businessId];
  let whereSql = 'WHERE s.business_id = ?';

  if (search) {
    whereSql += ` AND (s.supplier_name LIKE ? OR s.company_name LIKE ? OR s.phone LIKE ? OR s.gst_number LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  if (is_active !== undefined) {
    whereSql += ` AND s.is_active = ?`;
    params.push(is_active === 'true' ? 1 : 0);
  }

  if (has_balance === 'true') {
    whereSql += ` AND COALESCE(pa.balance_due, 0) > 0`;
  }

  // Count total for pagination
  const countSql = `
    SELECT COUNT(*) as total
    FROM suppliers s
    LEFT JOIN (
      SELECT supplier_id, SUM(GREATEST(grand_total - amount_paid, 0)) AS balance_due
      FROM purchases
      WHERE business_id = ? AND deleted_at IS NULL
      GROUP BY supplier_id
    ) pa ON pa.supplier_id = s.supplier_id
    ${whereSql}
  `;
  const [countRows] = await req.tenantDb.execute(countSql, [req.businessId, ...params]);
  const total = countRows[0].total;

  // Retrieve data
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const sql = `
    SELECT
      s.*,
      COALESCE(pa.total_invoices, 0) AS total_invoices,
      COALESCE(pa.total_invoiced, 0) AS total_invoiced,
      COALESCE(pa.total_paid, 0) AS total_paid,
      GREATEST(
        COALESCE(pa.balance_due, 0)
        - COALESCE(adj.adjusted_returns_total, 0)
        + CASE WHEN s.opening_balance_type = 'Payable'
               THEN COALESCE(s.opening_balance, 0)
               ELSE -COALESCE(s.opening_balance, 0)
          END,
        0
      ) AS balance_due,
      pa.last_purchase_date
    FROM suppliers s
    LEFT JOIN (
      SELECT
        supplier_id,
        COUNT(*) AS total_invoices,
        SUM(grand_total) AS total_invoiced,
        SUM(amount_paid) AS total_paid,
        SUM(GREATEST(grand_total - amount_paid, 0)) AS balance_due,
        MAX(purchase_date) AS last_purchase_date
      FROM purchases
      WHERE business_id = ? AND deleted_at IS NULL
      GROUP BY supplier_id
    ) pa ON pa.supplier_id = s.supplier_id
    LEFT JOIN (
      SELECT supplier_id, SUM(grand_total) AS adjusted_returns_total
      FROM purchase_returns
      WHERE business_id = ? AND refund_status = 'Adjusted'
      GROUP BY supplier_id
    ) adj ON adj.supplier_id = s.supplier_id
    ${whereSql}
    ORDER BY s.supplier_name ASC
    LIMIT ${parseInt(limit)} OFFSET ${offset}
  `;

  const [rows] = await req.tenantDb.execute(sql, [req.businessId, req.businessId, ...params]);
  res.json({ 
    success: true, 
    data: rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit))
    }
  });
}));

supplierRouter.post('/', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const data = req.body;
  if (!data.supplier_name) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Supplier name is required' }});
  }

  const [result] = await req.tenantDb.execute(
    `INSERT INTO suppliers (
      business_id, supplier_name, company_name, gst_number, phone, alternate_phone,
      email, address, city, state, pincode, opening_balance, opening_balance_type, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.businessId, data.supplier_name, data.company_name || null, data.gst_number || null,
      data.phone || null, data.alternate_phone || null, data.email || null, data.address || null,
      data.city || null, data.state || null, data.pincode || null, data.opening_balance || 0,
      data.opening_balance_type || 'Payable', data.is_active === false ? 0 : 1
    ]
  );

  res.status(201).json({ success: true, data: { supplier_id: result.insertId, ...data } });
}));

supplierRouter.get('/:id', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    `SELECT
       s.*,
       COALESCE(pa.total_invoices, 0) AS total_invoices,
       COALESCE(pa.total_invoiced, 0) AS total_invoiced,
       COALESCE(pa.total_paid, 0) AS total_paid,
       GREATEST(
         COALESCE(pa.balance_due, 0)
         - COALESCE(adj.adjusted_returns_total, 0)
         + CASE WHEN s.opening_balance_type = 'Payable'
                THEN COALESCE(s.opening_balance, 0)
                ELSE -COALESCE(s.opening_balance, 0)
           END,
         0
       ) AS balance_due,
       pa.last_purchase_date
     FROM suppliers s
     LEFT JOIN (
       SELECT
         supplier_id,
         COUNT(*) AS total_invoices,
         SUM(grand_total) AS total_invoiced,
         SUM(amount_paid) AS total_paid,
         SUM(GREATEST(grand_total - amount_paid, 0)) AS balance_due,
         MAX(purchase_date) AS last_purchase_date
       FROM purchases
       WHERE business_id = ? AND deleted_at IS NULL
       GROUP BY supplier_id
     ) pa ON pa.supplier_id = s.supplier_id
     LEFT JOIN (
       SELECT supplier_id, SUM(grand_total) AS adjusted_returns_total
       FROM purchase_returns
       WHERE business_id = ? AND refund_status = 'Adjusted'
       GROUP BY supplier_id
     ) adj ON adj.supplier_id = s.supplier_id
     WHERE s.supplier_id = ? AND s.business_id = ?`,
    [req.businessId, req.businessId, req.params.id, req.businessId]
  );
  if (!rows.length) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Supplier not found' }});
  res.json({ success: true, data: rows[0] });
}));

supplierRouter.get('/:id/payment-context', asyncHandler(async (req, res) => {
  try {
    const data = await getSupplierPaymentContext(req.tenantDb, req.businessId, req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    return sendPaymentError(res, error);
  }
}));

supplierRouter.get('/:id/payment-history', asyncHandler(async (req, res) => {
  const data = await getSupplierPaymentHistory(req.tenantDb, req.businessId, req.params.id);
  res.json({ success: true, data });
}));

supplierRouter.post('/:id/pay-out', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  try {
    const data = await recordSupplierPayOut(req.tenantDb, req.businessId, req.params.id, req.body || {});
    res.status(201).json({ success: true, data, message: data.message || 'Supplier payment recorded successfully' });
  } catch (error) {
    return sendPaymentError(res, error);
  }
}));

supplierRouter.post('/:id/pay-in', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  try {
    const data = await recordSupplierPayIn(req.tenantDb, req.businessId, req.params.id, req.body || {});
    res.status(201).json({ success: true, data, message: 'Supplier refund recorded successfully' });
  } catch (error) {
    return sendPaymentError(res, error);
  }
}));

supplierRouter.put('/:id', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const data = req.body;
  await req.tenantDb.execute(
    `UPDATE suppliers SET 
      supplier_name = ?, company_name = ?, gst_number = ?, phone = ?, alternate_phone = ?,
      email = ?, address = ?, city = ?, state = ?, pincode = ?, opening_balance = ?, 
      opening_balance_type = ?
    WHERE supplier_id = ? AND business_id = ?`,
    [
      data.supplier_name, data.company_name || null, data.gst_number || null, data.phone || null,
      data.alternate_phone || null, data.email || null, data.address || null, data.city || null,
      data.state || null, data.pincode || null, data.opening_balance || 0, data.opening_balance_type || 'Payable',
      req.params.id, req.businessId
    ]
  );
  res.json({ success: true, message: 'Updated successfully' });
}));

supplierRouter.put('/:id/toggle-active', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  await req.tenantDb.execute(
    'UPDATE suppliers SET is_active = NOT is_active WHERE supplier_id = ? AND business_id = ?',
    [req.params.id, req.businessId]
  );
  res.json({ success: true, message: 'Toggled active status' });
}));

// Quick Summary logic based on the View
supplierRouter.get('/:id/summary', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    `SELECT
       COALESCE(pa.total_invoices, 0) AS total_invoices,
       COALESCE(pa.total_invoiced, 0) AS total_invoiced,
       COALESCE(pa.total_paid, 0) AS total_paid,
       COALESCE(pa.balance_due, 0) AS balance_due,
       pa.last_purchase_date
     FROM suppliers s
     LEFT JOIN (
       SELECT
         supplier_id,
         COUNT(*) AS total_invoices,
         SUM(grand_total) AS total_invoiced,
         SUM(amount_paid) AS total_paid,
         SUM(GREATEST(grand_total - amount_paid, 0)) AS balance_due,
         MAX(purchase_date) AS last_purchase_date
       FROM purchases
       WHERE business_id = ? AND deleted_at IS NULL
       GROUP BY supplier_id
     ) pa ON pa.supplier_id = s.supplier_id
     WHERE s.supplier_id = ? AND s.business_id = ?`,
    [req.businessId, req.params.id, req.businessId]
  );
  if (!rows.length) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Supplier not found' }});
  res.json({ success: true, data: rows[0] });
}));

// Ledger combines opening balance + day book entries (purchases, payments out)
supplierRouter.get('/:id/ledger', asyncHandler(async (req, res) => {
  // Advanced ledger query using day_book and purchases left for implementation specifics, 
  // currently we return the base summary data for the ledger header.
  const [summaryRows] = await req.tenantDb.execute('SELECT * FROM v_supplier_summary WHERE supplier_id = ? AND business_id = ?', [req.params.id, req.businessId]);
  
  const [entries] = await req.tenantDb.execute(
    `SELECT entry_date as date, entry_type as type, 
            CASE WHEN entry_type = 'Purchase' THEN 'Purchase' ELSE 'Payment Out' END as reference_type,
            reference_id, 
            COALESCE(cash_out, 0) + COALESCE(bank_out, 0) as credit, 
            0 as debit
     FROM day_book 
     WHERE business_id = ? AND (
        (entry_type = 'Purchase' AND reference_id IN (SELECT purchase_id FROM purchases WHERE supplier_id = ?)) OR
        (entry_type = 'Payment Out' AND reference_id IN (SELECT payment_out_id FROM payment_out WHERE supplier_id = ?))
     )
     ORDER BY entry_date ASC`,
    [req.businessId, req.params.id, req.params.id]
  );

  res.json({ 
    success: true, 
    data: { 
      supplier: summaryRows[0],
      entries 
    }
  });
}));
