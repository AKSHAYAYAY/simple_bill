import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/requireRole.js';

export const productRouter = Router({ mergeParams: true });

// Helper to construct the SELECT query for products
const selectProductsSql = `
  SELECT 
    p.*,
    (p.current_stock * p.purchase_price) AS stock_value,
    (p.current_stock <= p.minimum_stock_alert) AS low_stock_alert,
    c.category_name,
    u.unit_name,
    u.short_name AS unit_short_name
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.category_id
  LEFT JOIN units u ON p.unit_id = u.unit_id
  WHERE p.business_id = ?
`;

productRouter.get('/', asyncHandler(async (req, res) => {
  const { search, category_id, is_active, low_stock, out_of_stock, sort_by = 'product_name', sort_order = 'ASC' } = req.query;
  const params = [req.businessId];
  let sql = selectProductsSql;

  if (search) {
    sql += ` AND (p.product_name LIKE ? OR p.product_code LIKE ? OR p.barcode LIKE ? OR p.item_description LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  if (category_id) {
    sql += ` AND p.category_id = ?`;
    params.push(category_id);
  }

  if (is_active !== undefined) {
    sql += ` AND p.is_active = ?`;
    params.push(is_active === 'true' ? 1 : 0);
  }

  if (low_stock === 'true') {
    sql += ` AND p.current_stock <= p.minimum_stock_alert`;
  }

  if (out_of_stock === 'true') {
    sql += ` AND p.current_stock <= 0`;
  }

  // Safe sorting
  const allowedSorts = ['product_name', 'current_stock', 'selling_price', 'created_at'];
  const sortCol = allowedSorts.includes(sort_by) ? sort_by : 'product_name';
  const order = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  sql += ` ORDER BY p.${sortCol} ${order}`;

  const [rows] = await req.tenantDb.execute(sql, params);
  res.json({ success: true, data: rows });
}));

productRouter.post('/', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const data = req.body;
  if (!data.product_name) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Product name is required' }});
  }

  // Auto-generate product_code if missing
  let productCode = data.product_code;
  if (!productCode) {
    productCode = `PRD-${Date.now().toString().slice(-6)}`;
  }

  const [result] = await req.tenantDb.execute(
    `INSERT INTO products (
      business_id, category_id, unit_id, product_name, product_code, barcode, 
      item_description, purchase_price, profit_percentage, selling_price, 
      current_stock, minimum_stock_alert, cgst_percentage, sgst_percentage, igst_percentage, 
      hsn_code, allow_negative_stock, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.businessId, data.category_id || null, data.unit_id || null, data.product_name, productCode, 
      data.barcode || null, data.item_description || null, data.purchase_price || 0, data.profit_percentage || 0, 
      data.selling_price || 0, data.current_stock || 0, data.minimum_stock_alert || 10, 
      data.cgst_percentage || 0, data.sgst_percentage || 0, data.igst_percentage || 0, 
      data.hsn_code || null, data.allow_negative_stock ? 1 : 0, data.is_active === false ? 0 : 1
    ]
  );

  res.status(201).json({ success: true, data: { product_id: result.insertId, ...data, product_code: productCode }, message: 'Product created' });
}));

productRouter.get('/barcode/:barcode', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    `${selectProductsSql} AND p.barcode = ?`,
    [req.businessId, req.params.barcode]
  );
  if (!rows.length) return res.status(404).json({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' }});
  res.json({ success: true, data: rows[0] });
}));

productRouter.get('/:id', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    `${selectProductsSql} AND p.product_id = ?`,
    [req.businessId, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' }});
  res.json({ success: true, data: rows[0] });
}));

productRouter.put('/:id', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const data = req.body;
  await req.tenantDb.execute(
    `UPDATE products SET 
      category_id = ?, unit_id = ?, product_name = ?, product_code = ?, barcode = ?, 
      item_description = ?, purchase_price = ?, profit_percentage = ?, selling_price = ?, 
      current_stock = ?, minimum_stock_alert = ?, cgst_percentage = ?, sgst_percentage = ?, igst_percentage = ?, 
      hsn_code = ?, allow_negative_stock = ?
    WHERE product_id = ? AND business_id = ?`,
    [
      data.category_id || null, data.unit_id || null, data.product_name, data.product_code, data.barcode || null, 
      data.item_description || null, data.purchase_price || 0, data.profit_percentage || 0, data.selling_price || 0, 
      data.current_stock || 0, data.minimum_stock_alert || 10, data.cgst_percentage || 0, data.sgst_percentage || 0, data.igst_percentage || 0, 
      data.hsn_code || null, data.allow_negative_stock ? 1 : 0, 
      req.params.id, req.businessId
    ]
  );
  res.json({ success: true, message: 'Updated successfully' });
}));

productRouter.put('/:id/toggle-active', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  await req.tenantDb.execute(
    'UPDATE products SET is_active = NOT is_active WHERE product_id = ? AND business_id = ?',
    [req.params.id, req.businessId]
  );
  res.json({ success: true, message: 'Toggled active status' });
}));

productRouter.delete('/:id', requireRole('Owner', 'Admin'), asyncHandler(async (req, res) => {
  try {
    await req.tenantDb.execute(
      'DELETE FROM products WHERE product_id = ? AND business_id = ?',
      [req.params.id, req.businessId]
    );
    res.status(204).send();
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ success: false, error: { code: 'FOREIGN_KEY_VIOLATION', message: 'Cannot delete product linked to existing sales or purchases.' }});
    }
    throw err;
  }
}));

productRouter.get('/:id/stock-movements', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    'SELECT * FROM stock_movements WHERE product_id = ? AND business_id = ? ORDER BY created_at DESC',
    [req.params.id, req.businessId]
  );
  res.json({ success: true, data: rows });
}));

productRouter.get('/:id/purchase-history', asyncHandler(async (req, res) => {
  const { from_date, to_date } = req.query;
  const filterFrom = from_date || null;
  const filterTo = to_date || null;

  const sql = `
    SELECT 
      p.purchase_id,
      p.purchase_invoice_no,
      p.purchase_date,
      pi.quantity,
      pi.purchase_price,
      pi.total_amount,
      s.supplier_name
    FROM purchase_items pi
    INNER JOIN purchases p ON pi.purchase_id = p.purchase_id
    INNER JOIN suppliers s ON p.supplier_id = s.supplier_id
    WHERE pi.product_id = ? 
      AND p.business_id = ?
      AND p.deleted_at IS NULL
      AND (? IS NULL OR p.purchase_date >= ?)
      AND (? IS NULL OR p.purchase_date <= ?)
    ORDER BY p.purchase_date DESC
  `;

  const [rows] = await req.tenantDb.query(sql, [
    req.params.id,
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo
  ]);
  res.json({ success: true, data: rows });
}));

productRouter.get('/:id/sales-history', asyncHandler(async (req, res) => {
  const { from_date, to_date } = req.query;
  const filterFrom = from_date || null;
  const filterTo = to_date || null;

  const sql = `
    SELECT 
      s.sale_id,
      s.invoice_no,
      s.invoice_date,
      si.quantity,
      si.selling_price,
      si.total_amount,
      c.customer_name
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.sale_id
    LEFT JOIN customers c ON s.customer_id = c.customer_id
    WHERE si.product_id = ? 
      AND s.business_id = ?
      AND s.deleted_at IS NULL
      AND (? IS NULL OR s.invoice_date >= ?)
      AND (? IS NULL OR s.invoice_date <= ?)
    ORDER BY s.invoice_date DESC
  `;

  const [rows] = await req.tenantDb.query(sql, [
    req.params.id,
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo
  ]);
  res.json({ success: true, data: rows });
}));

productRouter.get('/:id/purchase-return-history', asyncHandler(async (req, res) => {
  const { from_date, to_date } = req.query;
  const filterFrom = from_date || null;
  const filterTo = to_date || null;

  const sql = `
    SELECT 
      pr.return_id,
      pr.return_invoice_no,
      pr.return_date,
      pri.quantity,
      pri.purchase_price,
      pri.total_amount,
      s.supplier_name
    FROM purchase_return_items pri
    INNER JOIN purchase_returns pr ON pri.return_id = pr.return_id
    INNER JOIN suppliers s ON pr.supplier_id = s.supplier_id
    WHERE pri.product_id = ? 
      AND pr.business_id = ?
      AND (? IS NULL OR pr.return_date >= ?)
      AND (? IS NULL OR pr.return_date <= ?)
    ORDER BY pr.return_date DESC
  `;

  const [rows] = await req.tenantDb.query(sql, [
    req.params.id,
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo
  ]);
  res.json({ success: true, data: rows });
}));

productRouter.get('/:id/sales-return-history', asyncHandler(async (req, res) => {
  const { from_date, to_date } = req.query;
  const filterFrom = from_date || null;
  const filterTo = to_date || null;

  const sql = `
    SELECT 
      sr.return_id,
      sr.return_invoice_no,
      sr.return_date,
      sri.quantity,
      sri.selling_price,
      sri.total_amount,
      c.customer_name
    FROM sales_return_items sri
    INNER JOIN sales_returns sr ON sri.return_id = sr.return_id
    LEFT JOIN customers c ON sr.customer_id = c.customer_id
    WHERE sri.product_id = ? 
      AND sr.business_id = ?
      AND (? IS NULL OR sr.return_date >= ?)
      AND (? IS NULL OR sr.return_date <= ?)
    ORDER BY sr.return_date DESC
  `;

  const [rows] = await req.tenantDb.query(sql, [
    req.params.id,
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo
  ]);
  res.json({ success: true, data: rows });
}));
