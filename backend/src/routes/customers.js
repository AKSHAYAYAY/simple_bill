import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  getCustomerPaymentContext,
  getCustomerPaymentHistory,
  recordCustomerPayIn,
  recordCustomerPayOut
} from '../services/payment.service.js';

export const customerRouter = Router({ mergeParams: true });

const sendPaymentError = (res, error) => {
  if (error?.code) {
    return res.status(error.status || 400).json({
      success: false,
      error: { code: error.code, message: error.message }
    });
  }
  throw error;
};

customerRouter.get('/', asyncHandler(async (req, res) => {
  const { search, is_active, has_balance, page = 1, limit = 25 } = req.query;
  const params = [req.businessId];
  let whereSql = 'WHERE c.business_id = ?';

  if (search) {
    whereSql += ` AND (c.customer_name LIKE ? OR c.company_name LIKE ? OR c.phone LIKE ? OR c.gst_number LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  if (is_active !== undefined) {
    whereSql += ` AND c.is_active = ?`;
    params.push(is_active === 'true' ? 1 : 0);
  }

  if (has_balance === 'true') {
    whereSql += ` AND COALESCE(sa.balance_due, 0) > 0`;
  }

  // Count total for pagination
  const countSql = `
    SELECT COUNT(*) as total
    FROM customers c
    LEFT JOIN (
      SELECT customer_id, SUM(GREATEST(grand_total - amount_received, 0)) AS balance_due
      FROM sales
      WHERE business_id = ? AND deleted_at IS NULL
      GROUP BY customer_id
    ) sa ON sa.customer_id = c.customer_id
    ${whereSql}
  `;
  const [countRows] = await req.tenantDb.execute(countSql, [req.businessId, ...params]);
  const total = countRows[0].total;

  // Retrieve data
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const sql = `
    SELECT
      c.*,
      COALESCE(sa.total_invoices, 0) AS total_invoices,
      COALESCE(sa.total_billed, 0) AS total_billed,
      COALESCE(sa.total_billed, 0) AS total_invoiced,
      COALESCE(sa.total_received, 0) AS total_received,
      COALESCE(sa.total_received, 0) AS total_paid,
      GREATEST(
        COALESCE(sa.balance_due, 0)
        - COALESCE(adj.adjusted_returns_total, 0)
        + CASE WHEN c.opening_balance_type = 'Receivable' OR c.opening_balance_type = 'To Receive'
               THEN COALESCE(c.opening_balance, 0)
               ELSE -COALESCE(c.opening_balance, 0)
          END,
        0
      ) AS balance_due,
      sa.last_sale_date
    FROM customers c
    LEFT JOIN (
      SELECT
        customer_id,
        COUNT(*) AS total_invoices,
        SUM(grand_total) AS total_billed,
        SUM(amount_received) AS total_received,
        SUM(GREATEST(grand_total - amount_received, 0)) AS balance_due,
        MAX(invoice_date) AS last_sale_date
      FROM sales
      WHERE business_id = ? AND deleted_at IS NULL
      GROUP BY customer_id
    ) sa ON sa.customer_id = c.customer_id
    LEFT JOIN (
      SELECT customer_id, SUM(grand_total) AS adjusted_returns_total
      FROM sales_returns
      WHERE business_id = ? AND refund_status = 'Adjusted'
      GROUP BY customer_id
    ) adj ON adj.customer_id = c.customer_id
    ${whereSql}
    ORDER BY c.customer_name ASC
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

customerRouter.post('/', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const data = req.body;
  if (!data.customer_name) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Customer name is required' }});
  }

  if (data.phone) {
    const trimmedPhone = String(data.phone).trim();
    if (trimmedPhone) {
      const [existing] = await req.tenantDb.execute(
        `SELECT customer_id, customer_name FROM customers WHERE business_id = ? AND phone = ? LIMIT 1`,
        [req.businessId, trimmedPhone]
      );
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_PHONE',
            message: `Phone number ${trimmedPhone} is already associated with customer "${existing[0].customer_name}"`
          }
        });
      }
    }
  }

  const [result] = await req.tenantDb.execute(
    `INSERT INTO customers (
      business_id, customer_name, company_name, gst_number, customer_type, phone, alternate_phone,
      email, address, city, state, pincode, opening_balance, opening_balance_type, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.businessId, data.customer_name, data.company_name || null, data.gst_number || null,
      data.customer_type || 'Retail', data.phone || null, data.alternate_phone || null,
      data.email || null, data.address || null, data.city || null, data.state || null,
      data.pincode || null, data.opening_balance || 0, data.opening_balance_type || 'Receivable',
      data.is_active === false ? 0 : 1
    ]
  );

  res.status(201).json({ success: true, data: { customer_id: result.insertId, ...data } });
}));

customerRouter.get('/:id', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    `SELECT
       c.*,
       COALESCE(sa.total_invoices, 0) AS total_invoices,
       COALESCE(sa.total_billed, 0) AS total_billed,
       COALESCE(sa.total_billed, 0) AS total_invoiced,
       COALESCE(sa.total_received, 0) AS total_received,
       COALESCE(sa.total_received, 0) AS total_paid,
       GREATEST(
         COALESCE(sa.balance_due, 0)
         - COALESCE(adj.adjusted_returns_total, 0)
         + CASE WHEN c.opening_balance_type = 'Receivable' OR c.opening_balance_type = 'To Receive'
                THEN COALESCE(c.opening_balance, 0)
                ELSE -COALESCE(c.opening_balance, 0)
           END,
         0
       ) AS balance_due,
       sa.last_sale_date
     FROM customers c
     LEFT JOIN (
       SELECT
         customer_id,
         COUNT(*) AS total_invoices,
         SUM(grand_total) AS total_billed,
         SUM(amount_received) AS total_received,
         SUM(GREATEST(grand_total - amount_received, 0)) AS balance_due,
         MAX(invoice_date) AS last_sale_date
       FROM sales
       WHERE business_id = ? AND deleted_at IS NULL
       GROUP BY customer_id
     ) sa ON sa.customer_id = c.customer_id
     LEFT JOIN (
       SELECT customer_id, SUM(grand_total) AS adjusted_returns_total
       FROM sales_returns
       WHERE business_id = ? AND refund_status = 'Adjusted'
       GROUP BY customer_id
     ) adj ON adj.customer_id = c.customer_id
     WHERE c.customer_id = ? AND c.business_id = ?`,
    [req.businessId, req.params.id, req.businessId, req.params.id, req.businessId]
  );
  if (!rows.length) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' }});
  res.json({ success: true, data: rows[0] });
}));

customerRouter.get('/:id/payment-context', asyncHandler(async (req, res) => {
  try {
    const data = await getCustomerPaymentContext(req.tenantDb, req.businessId, req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    return sendPaymentError(res, error);
  }
}));

customerRouter.get('/:id/payment-history', asyncHandler(async (req, res) => {
  const data = await getCustomerPaymentHistory(req.tenantDb, req.businessId, req.params.id);
  res.json({ success: true, data });
}));

customerRouter.post('/:id/pay-in', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  try {
    const data = await recordCustomerPayIn(req.tenantDb, req.businessId, req.params.id, req.body || {});
    res.status(201).json({ success: true, data, message: data.message || 'Customer payment recorded successfully' });
  } catch (error) {
    return sendPaymentError(res, error);
  }
}));

customerRouter.post('/:id/pay-out', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  try {
    const data = await recordCustomerPayOut(req.tenantDb, req.businessId, req.params.id, req.body || {});
    res.status(201).json({ success: true, data, message: 'Customer refund recorded successfully' });
  } catch (error) {
    return sendPaymentError(res, error);
  }
}));

customerRouter.put('/:id', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const data = req.body;

  if (data.phone) {
    const trimmedPhone = String(data.phone).trim();
    if (trimmedPhone) {
      const [existing] = await req.tenantDb.execute(
        `SELECT customer_id, customer_name FROM customers WHERE business_id = ? AND phone = ? AND customer_id != ? LIMIT 1`,
        [req.businessId, trimmedPhone, req.params.id]
      );
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_PHONE',
            message: `Phone number ${trimmedPhone} is already associated with customer "${existing[0].customer_name}"`
          }
        });
      }
    }
  }

  await req.tenantDb.execute(
    `UPDATE customers SET 
      customer_name = ?, company_name = ?, gst_number = ?, customer_type = ?, phone = ?, alternate_phone = ?,
      email = ?, address = ?, city = ?, state = ?, pincode = ?, opening_balance = ?, 
      opening_balance_type = ?
    WHERE customer_id = ? AND business_id = ?`,
    [
      data.customer_name, data.company_name || null, data.gst_number || null, data.customer_type || 'Retail',
      data.phone || null, data.alternate_phone || null, data.email || null, data.address || null,
      data.city || null, data.state || null, data.pincode || null, data.opening_balance || 0,
      data.opening_balance_type || 'To Receive', req.params.id, req.businessId
    ]
  );
  res.json({ success: true, message: 'Updated successfully' });
}));

customerRouter.put('/:id/toggle-active', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  await req.tenantDb.execute(
    'UPDATE customers SET is_active = NOT is_active WHERE customer_id = ? AND business_id = ?',
    [req.params.id, req.businessId]
  );
  res.json({ success: true, message: 'Toggled active status' });
}));

customerRouter.get('/:id/summary', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    `SELECT
       COALESCE(sa.total_invoices, 0) AS total_invoices,
       COALESCE(sa.total_billed, 0) AS total_billed,
       COALESCE(sa.total_billed, 0) AS total_invoiced,
       COALESCE(sa.total_received, 0) AS total_received,
       COALESCE(sa.total_received, 0) AS total_paid,
       COALESCE(sa.balance_due, 0) AS balance_due,
       sa.last_sale_date
     FROM customers c
     LEFT JOIN (
       SELECT
         customer_id,
         COUNT(*) AS total_invoices,
         SUM(grand_total) AS total_billed,
         SUM(amount_received) AS total_received,
         SUM(GREATEST(grand_total - amount_received, 0)) AS balance_due,
         MAX(invoice_date) AS last_sale_date
       FROM sales
       WHERE business_id = ? AND deleted_at IS NULL
       GROUP BY customer_id
     ) sa ON sa.customer_id = c.customer_id
     WHERE c.customer_id = ? AND c.business_id = ?`,
    [req.businessId, req.params.id, req.businessId]
  );
  if (!rows.length) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' }});
  res.json({ success: true, data: rows[0] });
}));

customerRouter.get('/:id/ledger', asyncHandler(async (req, res) => {
  const [summaryRows] = await req.tenantDb.execute('SELECT * FROM v_customer_summary WHERE customer_id = ? AND business_id = ?', [req.params.id, req.businessId]);
  
  const [entries] = await req.tenantDb.execute(
    `SELECT entry_date as date, entry_type as type, 
            CASE WHEN entry_type = 'Sale' THEN 'Sale' ELSE 'Payment In' END as reference_type,
            reference_id, 
            COALESCE(cash_in, 0) + COALESCE(bank_in, 0) as debit, 
            0 as credit
     FROM day_book 
     WHERE business_id = ? AND (
        (entry_type = 'Sale' AND reference_id IN (SELECT sale_id FROM sales WHERE customer_id = ?)) OR
        (entry_type = 'Payment In' AND reference_id IN (SELECT payment_in_id FROM payment_in WHERE customer_id = ?))
     )
     ORDER BY entry_date ASC`,
    [req.businessId, req.params.id, req.params.id]
  );

  res.json({ 
    success: true, 
    data: { 
      customer: summaryRows[0],
      entries 
    }
  });
}));
