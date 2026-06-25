import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';

export const unitRouter = Router({ mergeParams: true });

unitRouter.get('/', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    'SELECT * FROM units WHERE business_id = ? ORDER BY unit_name ASC',
    [req.businessId]
  );
  res.json({ success: true, data: rows });
}));

unitRouter.post('/', asyncHandler(async (req, res) => {
  const { unit_name, short_name } = req.body;
  if (!unit_name || !short_name) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name and short name required' }});
  }

  const [result] = await req.tenantDb.execute(
    'INSERT INTO units (business_id, unit_name, short_name) VALUES (?, ?, ?)',
    [req.businessId, unit_name, short_name]
  );
  
  res.status(201).json({ success: true, data: { unit_id: result.insertId, unit_name, short_name } });
}));

unitRouter.get('/:id', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    'SELECT * FROM units WHERE unit_id = ? AND business_id = ?',
    [req.params.id, req.businessId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Unit not found' }});
  }
  res.json({ success: true, data: rows[0] });
}));

unitRouter.put('/:id', asyncHandler(async (req, res) => {
  const { unit_name, short_name } = req.body;
  if (!unit_name || !short_name) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name and short name required' }});
  }

  await req.tenantDb.execute(
    'UPDATE units SET unit_name = ?, short_name = ? WHERE unit_id = ? AND business_id = ?',
    [unit_name, short_name, req.params.id, req.businessId]
  );
  res.json({ success: true, message: 'Updated successfully' });
}));

unitRouter.delete('/:id', asyncHandler(async (req, res) => {
  // Check if any product uses this unit
  const [products] = await req.tenantDb.execute(
    'SELECT product_id FROM products WHERE unit_id = ? AND business_id = ? LIMIT 1',
    [req.params.id, req.businessId]
  );

  if (products.length > 0) {
    return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Cannot delete unit while products are assigned to it.' }});
  }

  await req.tenantDb.execute(
    'DELETE FROM units WHERE unit_id = ? AND business_id = ?',
    [req.params.id, req.businessId]
  );
  res.status(204).send();
}));
