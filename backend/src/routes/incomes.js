import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/requireRole.js';
import { withTransaction } from '../utils/transaction.js';

export const incomeRouter = Router({ mergeParams: true });

// ── INCOME CATEGORIES CRUD ───────────────────────────────────────────

incomeRouter.get('/categories', asyncHandler(async (req, res) => {
  const includeInactive = req.query.include_inactive === 'true' || req.query.is_active === 'all';
  const queryStr = includeInactive
    ? 'SELECT * FROM income_categories WHERE business_id = ? ORDER BY category_name ASC'
    : 'SELECT * FROM income_categories WHERE business_id = ? AND is_active = 1 ORDER BY category_name ASC';
  
  const [rows] = await req.tenantDb.execute(queryStr, [req.businessId]);
  res.json({ success: true, data: rows });
}));

incomeRouter.post('/categories', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const { category_name, description } = req.body;
  if (!category_name) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Category name is required' }});
  }

  const [result] = await req.tenantDb.execute(
    'INSERT INTO income_categories (business_id, category_name, description) VALUES (?, ?, ?)',
    [req.businessId, category_name, description || null]
  );
  
  res.status(201).json({ success: true, data: { category_id: result.insertId, category_name, description } });
}));

incomeRouter.put('/categories/:catId', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const { category_name, description } = req.body;
  await req.tenantDb.execute(
    'UPDATE income_categories SET category_name = ?, description = ? WHERE category_id = ? AND business_id = ?',
    [category_name, description || null, req.params.catId, req.businessId]
  );
  res.json({ success: true, message: 'Income category updated successfully' });
}));

incomeRouter.put('/categories/:catId/toggle-active', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  await req.tenantDb.execute(
    'UPDATE income_categories SET is_active = NOT is_active WHERE category_id = ? AND business_id = ?',
    [req.params.catId, req.businessId]
  );
  res.json({ success: true, message: 'Income category status toggled' });
}));

incomeRouter.delete('/categories/:catId', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  // Check if any incomes reference this category
  const [incomes] = await req.tenantDb.execute(
    'SELECT income_id FROM incomes WHERE category_id = ? AND business_id = ? LIMIT 1',
    [req.params.catId, req.businessId]
  );

  if (incomes.length > 0) {
    return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Cannot delete income category while incomes are assigned to it.' }});
  }

  await req.tenantDb.execute(
    'DELETE FROM income_categories WHERE category_id = ? AND business_id = ?',
    [req.params.catId, req.businessId]
  );
  res.status(204).send();
}));

// ── INCOME TRANSACTIONS CRUD ─────────────────────────────────────────

incomeRouter.get('/', asyncHandler(async (req, res) => {
  const { category_id, start_date, end_date } = req.query;
  let queryStr = `
    SELECT i.*, ic.category_name 
    FROM incomes i
    LEFT JOIN income_categories ic ON i.category_id = ic.category_id
    WHERE i.business_id = ?
  `;
  const params = [req.businessId];

  if (category_id) {
    queryStr += ' AND i.category_id = ?';
    params.push(category_id);
  }
  if (start_date) {
    queryStr += ' AND i.income_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    queryStr += ' AND i.income_date <= ?';
    params.push(end_date);
  }

  queryStr += ' ORDER BY i.income_date DESC, i.income_id DESC LIMIT 100';

  const [rows] = await req.tenantDb.execute(queryStr, params);
  res.json({ success: true, data: rows });
}));

incomeRouter.get('/:id', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    `SELECT i.*, ic.category_name 
     FROM incomes i
     LEFT JOIN income_categories ic ON i.category_id = ic.category_id
     WHERE i.income_id = ? AND i.business_id = ?`,
    [req.params.id, req.businessId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Income entry not found' }});
  }
  res.json({ success: true, data: rows[0] });
}));

incomeRouter.post('/', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const { category_id, income_date, description, amount, payment_mode, reference_no, notes } = req.body;

  if (!income_date || !amount || amount <= 0) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Date and positive Amount are required.' }});
  }

  const result = await withTransaction(req.tenantDb, async (conn) => {
    // 1. Insert income record
    const [incRes] = await conn.execute(
      `INSERT INTO incomes (
        business_id, category_id, income_date, description, amount, payment_mode, reference_no, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.businessId, category_id || null, income_date, description || null, amount, payment_mode || 'Cash', reference_no || null, notes || null]
    );

    const incomeId = incRes.insertId;
    const isCash = (payment_mode || 'Cash') === 'Cash';
    const cashIn = isCash ? amount : 0;
    const bankIn = !isCash ? amount : 0;

    // 2. Insert corresponding daybook record
    await conn.execute(
      `INSERT INTO day_book (
        business_id, entry_date, entry_type, reference_type, reference_id,
        cash_in, bank_in, payment_mode, description
      ) VALUES (?, ?, 'Income', 'incomes', ?, ?, ?, ?, ?)`,
      [req.businessId, income_date, incomeId, cashIn, bankIn, payment_mode || 'Cash', description || 'Income Transaction']
    );

    return { income_id: incomeId, category_id, income_date, amount, payment_mode };
  });

  res.status(201).json({ success: true, data: result, message: 'Income recorded successfully' });
}));

incomeRouter.put('/:id', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const { category_id, income_date, description, amount, payment_mode, reference_no, notes } = req.body;

  if (!income_date || !amount || amount <= 0) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Date and positive Amount are required.' }});
  }

  await withTransaction(req.tenantDb, async (conn) => {
    // 1. Update income
    await conn.execute(
      `UPDATE incomes 
       SET category_id = ?, income_date = ?, description = ?, amount = ?, payment_mode = ?, reference_no = ?, notes = ?
       WHERE income_id = ? AND business_id = ?`,
      [category_id || null, income_date, description || null, amount, payment_mode || 'Cash', reference_no || null, notes || null, req.params.id, req.businessId]
    );

    const isCash = (payment_mode || 'Cash') === 'Cash';
    const cashIn = isCash ? amount : 0;
    const bankIn = !isCash ? amount : 0;

    // 2. Update daybook entry
    await conn.execute(
      `UPDATE day_book 
       SET entry_date = ?, cash_in = ?, bank_in = ?, payment_mode = ?, description = ?
       WHERE reference_type = 'incomes' AND reference_id = ? AND business_id = ?`,
      [income_date, cashIn, bankIn, payment_mode || 'Cash', description || 'Income Transaction', req.params.id, req.businessId]
    );
  });

  res.json({ success: true, message: 'Income updated successfully' });
}));

incomeRouter.delete('/:id', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  await withTransaction(req.tenantDb, async (conn) => {
    // 1. Delete daybook entry first
    await conn.execute(
      `DELETE FROM day_book WHERE reference_type = 'incomes' AND reference_id = ? AND business_id = ?`,
      [req.params.id, req.businessId]
    );

    // 2. Delete income record
    await conn.execute(
      `DELETE FROM incomes WHERE income_id = ? AND business_id = ?`,
      [req.params.id, req.businessId]
    );
  });

  res.status(204).send();
}));
