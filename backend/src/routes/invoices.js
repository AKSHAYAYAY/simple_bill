import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const invoiceRouter = Router();

invoiceRouter.get('/', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT id, customer_id, status, total, due_date, items_json FROM invoices WHERE tenant_id = ? ORDER BY created_at DESC', [req.tenantId]);
  res.json(rows.map((r) => ({ ...r, items: JSON.parse(r.items_json || '[]') })));
}));

invoiceRouter.post('/', [
  body('id').notEmpty(),
  body('customerId').notEmpty(),
  body('total').isFloat({ min: 0 }),
  body('items').isArray()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }

  const { id, customerId, status = 'Draft', total, dueDate, items } = req.body;
  await pool.execute(
    `INSERT INTO invoices (id, tenant_id, customer_id, status, total, due_date, items_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), total = VALUES(total), due_date = VALUES(due_date), items_json = VALUES(items_json)`,
    [id, req.tenantId, customerId, status, total, dueDate || null, JSON.stringify(items)]
  );

  res.status(201).json({ message: 'Saved' });
}));
