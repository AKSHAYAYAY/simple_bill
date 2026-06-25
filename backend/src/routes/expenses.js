import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/requireRole.js';
import { withTransaction } from '../utils/transaction.js';

export const expenseRouter = Router({ mergeParams: true });

// ── EXPENSE CATEGORIES CRUD ──────────────────────────────────────────

expenseRouter.get('/categories', asyncHandler(async (req, res) => {
  const includeInactive = req.query.include_inactive === 'true' || req.query.is_active === 'all';
  const queryStr = includeInactive
    ? 'SELECT * FROM expense_categories WHERE business_id = ? ORDER BY category_name ASC'
    : 'SELECT * FROM expense_categories WHERE business_id = ? AND is_active = 1 ORDER BY category_name ASC';
  
  const [rows] = await req.tenantDb.execute(queryStr, [req.businessId]);
  res.json({ success: true, data: rows });
}));

expenseRouter.post('/categories', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const { category_name, description } = req.body;
  if (!category_name) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Category name is required' }});
  }

  const [result] = await req.tenantDb.execute(
    'INSERT INTO expense_categories (business_id, category_name, description) VALUES (?, ?, ?)',
    [req.businessId, category_name, description || null]
  );
  
  res.status(201).json({ success: true, data: { category_id: result.insertId, category_name, description } });
}));

expenseRouter.put('/categories/:catId', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const { category_name, description } = req.body;
  await req.tenantDb.execute(
    'UPDATE expense_categories SET category_name = ?, description = ? WHERE category_id = ? AND business_id = ?',
    [category_name, description || null, req.params.catId, req.businessId]
  );
  res.json({ success: true, message: 'Expense category updated successfully' });
}));

expenseRouter.put('/categories/:catId/toggle-active', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  await req.tenantDb.execute(
    'UPDATE expense_categories SET is_active = NOT is_active WHERE category_id = ? AND business_id = ?',
    [req.params.catId, req.businessId]
  );
  res.json({ success: true, message: 'Expense category status toggled' });
}));

expenseRouter.delete('/categories/:catId', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  // Check if any active expenses reference this category
  const [expenses] = await req.tenantDb.execute(
    'SELECT expense_id FROM expenses WHERE category_id = ? AND business_id = ? LIMIT 1',
    [req.params.catId, req.businessId]
  );

  if (expenses.length > 0) {
    return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Cannot delete expense category while expenses are assigned to it.' }});
  }

  await req.tenantDb.execute(
    'DELETE FROM expense_categories WHERE category_id = ? AND business_id = ?',
    [req.params.catId, req.businessId]
  );
  res.status(204).send();
}));

// ── EXPENSES TRANSACTIONS CRUD ───────────────────────────────────────

expenseRouter.get('/', asyncHandler(async (req, res) => {
  const { category_id, start_date, end_date } = req.query;
  let queryStr = `
    SELECT e.*, ec.category_name 
    FROM expenses e
    LEFT JOIN expense_categories ec ON e.category_id = ec.category_id
    WHERE e.business_id = ?
  `;
  const params = [req.businessId];

  if (category_id) {
    queryStr += ' AND e.category_id = ?';
    params.push(category_id);
  }
  if (start_date) {
    queryStr += ' AND e.expense_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    queryStr += ' AND e.expense_date <= ?';
    params.push(end_date);
  }

  queryStr += ' ORDER BY e.expense_date DESC, e.expense_id DESC LIMIT 100';

  const [rows] = await req.tenantDb.execute(queryStr, params);
  res.json({ success: true, data: rows });
}));

expenseRouter.get('/:id', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    `SELECT e.*, ec.category_name 
     FROM expenses e
     LEFT JOIN expense_categories ec ON e.category_id = ec.category_id
     WHERE e.expense_id = ? AND e.business_id = ?`,
    [req.params.id, req.businessId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Expense not found' }});
  }
  res.json({ success: true, data: rows[0] });
}));

expenseRouter.post('/', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const { category_id, expense_date, description, amount, payment_mode, reference_no, notes } = req.body;

  if (!expense_date || !amount || amount <= 0) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Date and positive Amount are required.' }});
  }

  const result = await withTransaction(req.tenantDb, async (conn) => {
    // 1. Insert expense record
    const [expRes] = await conn.execute(
      `INSERT INTO expenses (
        business_id, category_id, expense_date, description, amount, payment_mode, reference_no, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.businessId, category_id || null, expense_date, description || null, amount, payment_mode || 'Cash', reference_no || null, notes || null]
    );

    const expenseId = expRes.insertId;
    const isCash = (payment_mode || 'Cash') === 'Cash';
    const cashOut = isCash ? amount : 0;
    const bankOut = !isCash ? amount : 0;

    // 2. Insert corresponding daybook record
    await conn.execute(
      `INSERT INTO day_book (
        business_id, entry_date, entry_type, reference_type, reference_id,
        cash_out, bank_out, payment_mode, description
      ) VALUES (?, ?, 'Expense', 'expenses', ?, ?, ?, ?, ?)`,
      [req.businessId, expense_date, expenseId, cashOut, bankOut, payment_mode || 'Cash', description || 'Expense Transaction']
    );

    return { expense_id: expenseId, category_id, expense_date, amount, payment_mode };
  });

  res.status(201).json({ success: true, data: result, message: 'Expense recorded successfully' });
}));

expenseRouter.put('/:id', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const { category_id, expense_date, description, amount, payment_mode, reference_no, notes } = req.body;

  if (!expense_date || !amount || amount <= 0) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Date and positive Amount are required.' }});
  }

  await withTransaction(req.tenantDb, async (conn) => {
    // 1. Update expense
    await conn.execute(
      `UPDATE expenses 
       SET category_id = ?, expense_date = ?, description = ?, amount = ?, payment_mode = ?, reference_no = ?, notes = ?
       WHERE expense_id = ? AND business_id = ?`,
      [category_id || null, expense_date, description || null, amount, payment_mode || 'Cash', reference_no || null, notes || null, req.params.id, req.businessId]
    );

    const isCash = (payment_mode || 'Cash') === 'Cash';
    const cashOut = isCash ? amount : 0;
    const bankOut = !isCash ? amount : 0;

    // 2. Update daybook entry
    await conn.execute(
      `UPDATE day_book 
       SET entry_date = ?, cash_out = ?, bank_out = ?, payment_mode = ?, description = ?
       WHERE reference_type = 'expenses' AND reference_id = ? AND business_id = ?`,
      [expense_date, cashOut, bankOut, payment_mode || 'Cash', description || 'Expense Transaction', req.params.id, req.businessId]
    );
  });

  res.json({ success: true, message: 'Expense updated successfully' });
}));

expenseRouter.delete('/:id', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  await withTransaction(req.tenantDb, async (conn) => {
    // 1. Delete daybook entry first
    await conn.execute(
      `DELETE FROM day_book WHERE reference_type = 'expenses' AND reference_id = ? AND business_id = ?`,
      [req.params.id, req.businessId]
    );

    // 2. Delete expense
    await conn.execute(
      `DELETE FROM expenses WHERE expense_id = ? AND business_id = ?`,
      [req.params.id, req.businessId]
    );
  });

  res.status(204).send();
}));
