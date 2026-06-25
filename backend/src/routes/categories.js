import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';

export const categoryRouter = Router({ mergeParams: true }); // Important: mergeParams to access :businessId

categoryRouter.get('/', asyncHandler(async (req, res) => {
  const includeInactive = req.query.include_inactive === 'true' || req.query.is_active === 'all';
  const queryStr = includeInactive
    ? 'SELECT * FROM categories WHERE business_id = ? ORDER BY category_name ASC'
    : 'SELECT * FROM categories WHERE business_id = ? AND is_active = 1 ORDER BY category_name ASC';
  
  const [rows] = await req.tenantDb.execute(queryStr, [req.businessId]);
  res.json({ success: true, data: rows });
}));

categoryRouter.get('/:id', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    'SELECT * FROM categories WHERE category_id = ? AND business_id = ?',
    [req.params.id, req.businessId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' }});
  }
  res.json({ success: true, data: rows[0] });
}));

categoryRouter.post('/', asyncHandler(async (req, res) => {
  const { category_name, description } = req.body;
  if (!category_name) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Category name is required' }});
  }

  const [result] = await req.tenantDb.execute(
    'INSERT INTO categories (business_id, category_name, description) VALUES (?, ?, ?)',
    [req.businessId, category_name, description || null]
  );
  
  res.status(201).json({ success: true, data: { category_id: result.insertId, category_name, description } });
}));

categoryRouter.put('/:id', asyncHandler(async (req, res) => {
  const { category_name, description } = req.body;
  await req.tenantDb.execute(
    'UPDATE categories SET category_name = ?, description = ? WHERE category_id = ? AND business_id = ?',
    [category_name, description || null, req.params.id, req.businessId]
  );
  res.json({ success: true, message: 'Updated successfully' });
}));

categoryRouter.put('/:id/toggle-active', asyncHandler(async (req, res) => {
  await req.tenantDb.execute(
    'UPDATE categories SET is_active = NOT is_active WHERE category_id = ? AND business_id = ?',
    [req.params.id, req.businessId]
  );
  res.json({ success: true, message: 'Toggled active status' });
}));

categoryRouter.delete('/:id', asyncHandler(async (req, res) => {
  // Check if any product uses this category
  const [products] = await req.tenantDb.execute(
    'SELECT product_id FROM products WHERE category_id = ? AND business_id = ? LIMIT 1',
    [req.params.id, req.businessId]
  );

  if (products.length > 0) {
    return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Cannot delete category while products are assigned to it.' }});
  }

  await req.tenantDb.execute(
    'DELETE FROM categories WHERE category_id = ? AND business_id = ?',
    [req.params.id, req.businessId]
  );
  res.status(204).send();
}));
