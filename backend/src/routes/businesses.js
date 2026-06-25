import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { masterPool } from '../db/ConnectionManager.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const businessRouter = Router();

// GET /api/v1/b/:businessId/settings
businessRouter.get('/', asyncHandler(async (req, res) => {
  try {
    await req.tenantDb.query('ALTER TABLE businesses ADD COLUMN dead_stock_days INT DEFAULT 365');
  } catch (e) {}

  const [rows] = await req.tenantDb.execute(
    'SELECT * FROM businesses WHERE business_id = ?',
    [req.businessId]
  );

  if (rows.length === 0) {
    // Fallback to master database
    const [masterRows] = await masterPool.execute(
      'SELECT * FROM businesses WHERE business_id = ?',
      [req.businessId]
    );
    if (masterRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Business settings not found' } });
    }
    return res.json({ success: true, data: { ...masterRows[0], dead_stock_days: masterRows[0].dead_stock_days !== undefined ? masterRows[0].dead_stock_days : 365 } });
  }

  return res.json({ success: true, data: { ...rows[0], dead_stock_days: rows[0].dead_stock_days !== undefined ? rows[0].dead_stock_days : 365 } });
}));

// PUT /api/v1/b/:businessId/settings
businessRouter.put('/', [
  body('business_name').notEmpty().withMessage('Business Legal Name is required.'),
  body('invoice_prefix').notEmpty().withMessage('Invoice Prefix is required.'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email address format.')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: errors.array()[0].msg } });
  }

  try {
    await req.tenantDb.query('ALTER TABLE businesses ADD COLUMN dead_stock_days INT DEFAULT 365');
  } catch (e) {}
  try {
    await masterPool.query('ALTER TABLE businesses ADD COLUMN dead_stock_days INT DEFAULT 365');
  } catch (e) {}

  const {
    business_name,
    business_type,
    owner_name,
    gst_number,
    gst_type,
    address,
    city,
    state,
    pincode,
    phone,
    email,
    invoice_prefix,
    allow_negative_stock,
    allow_negative_selling,
    low_stock_limit,
    dead_stock_days,
    tax_display_mode,
    default_sale_tax_mode,
    default_cgst_rate,
    default_sgst_rate,
    default_igst_rate,
    show_tax_on_invoice,
    round_off_invoice
  } = req.body;

  const updateParams = [
    business_name,
    business_type || 'Retail',
    owner_name || null,
    gst_number || null,
    gst_type || 'GST',
    address || null,
    city || null,
    state || null,
    pincode || null,
    phone || null,
    email || null,
    invoice_prefix || 'INV',
    allow_negative_stock ? 1 : 0,
    allow_negative_selling ? 1 : 0,
    parseInt(low_stock_limit, 10) || 10,
    parseInt(dead_stock_days, 10) || 365,
    tax_display_mode || 'Tax Exclusive',
    default_sale_tax_mode || 'CGST+SGST',
    parseFloat(default_cgst_rate) || 0,
    parseFloat(default_sgst_rate) || 0,
    parseFloat(default_igst_rate) || 0,
    show_tax_on_invoice ? 1 : 0,
    round_off_invoice ? 1 : 0,
    req.businessId
  ];

  const updateSql = `
    UPDATE businesses SET
      business_name = ?,
      business_type = ?,
      owner_name = ?,
      gst_number = ?,
      gst_type = ?,
      address = ?,
      city = ?,
      state = ?,
      pincode = ?,
      phone = ?,
      email = ?,
      invoice_prefix = ?,
      allow_negative_stock = ?,
      allow_negative_selling = ?,
      low_stock_limit = ?,
      dead_stock_days = ?,
      tax_display_mode = ?,
      default_sale_tax_mode = ?,
      default_cgst_rate = ?,
      default_sgst_rate = ?,
      default_igst_rate = ?,
      show_tax_on_invoice = ?,
      round_off_invoice = ?
    WHERE business_id = ?
  `;

  // 1. Update in Tenant isolated DB
  await req.tenantDb.execute(updateSql, updateParams);

  // 2. Update in Master Registry DB to ensure perfect synchronization
  await masterPool.execute(updateSql, updateParams);

  // 3. Fetch latest data to return
  const [updatedRows] = await req.tenantDb.execute(
    'SELECT * FROM businesses WHERE business_id = ?',
    [req.businessId]
  );

  return res.json({ success: true, data: updatedRows[0], message: 'Business settings updated successfully.' });
}));

// GET /api/v1/b/:businessId/settings/db-info (Safe database stats endpoint for chatbot)
businessRouter.get('/db-info', asyncHandler(async (req, res) => {
  const businessId = req.businessId;
  const queries = {
    products: 'SELECT COUNT(*) as count FROM products WHERE business_id = ?',
    purchases: 'SELECT COUNT(*) as count FROM purchases WHERE business_id = ?',
    sales: 'SELECT COUNT(*) as count FROM sales WHERE business_id = ?',
    customers: 'SELECT COUNT(*) as count FROM customers WHERE business_id = ?',
    suppliers: 'SELECT COUNT(*) as count FROM suppliers WHERE business_id = ?',
    expenses: 'SELECT COUNT(*) as count FROM expenses WHERE business_id = ?',
    incomes: 'SELECT COUNT(*) as count FROM incomes WHERE business_id = ?',
    day_book: 'SELECT COUNT(*) as count FROM day_book WHERE business_id = ?'
  };

  const dbInfo = {};
  for (const [table, sql] of Object.entries(queries)) {
    try {
      const [rows] = await req.tenantDb.execute(sql, [businessId]);
      dbInfo[table] = rows[0]?.count || 0;
    } catch (err) {
      dbInfo[table] = 0;
    }
  }

  res.json({ success: true, data: dbInfo });
}));

// POST /api/v1/b/:businessId/settings/query (Execute read-only SQL queries from the chatbot)
businessRouter.post('/query', asyncHandler(async (req, res) => {
  let { sql, params } = req.body;
  console.log('--- Chatbot SQL raw:', JSON.stringify(sql));
  if (!sql) {
    return res.status(400).json({ success: false, error: 'SQL query string is required' });
  }

  // Strict read-only query check (Case-insensitive check for write keywords)
  const forbiddenKeywords = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'rename', 'replace', 'truncate', 'grant', 'revoke'];
  const normalizedSql = sql.toLowerCase();
  for (const keyword of forbiddenKeywords) {
    if (normalizedSql.includes(keyword)) {
      return res.status(403).json({ success: false, error: `Forbidden: Writing or structural modifications are not allowed. Found forbidden keyword: '${keyword}'` });
    }
  }

  // Ensure it starts with SELECT or SHOW or DESCRIBE or EXPLAIN
  const allowedStart = normalizedSql.trim();
  if (!allowedStart.startsWith('select') && !allowedStart.startsWith('show') && !allowedStart.startsWith('describe') && !allowedStart.startsWith('explain')) {
    return res.status(403).json({ success: false, error: 'Forbidden: Only SELECT, SHOW, DESCRIBE, or EXPLAIN queries are allowed.' });
  }

  // TENANT SAFETY: Replace any hardcoded business_id = <number> with the correct tenant ID.
  // This prevents AI-generated SQL from leaking data across tenants, even if the frontend
  // sanitization was bypassed. This is the authoritative server-side enforcement.
  sql = sql.replace(/business_id\s*=\s*\d+/gi, `business_id = ${req.businessId}`);
  console.log('--- Chatbot SQL sanitized:', JSON.stringify(sql));

  try {
    const [rows] = await req.tenantDb.execute(sql, params || []);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}));

