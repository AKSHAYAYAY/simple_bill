import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/requireRole.js';
import { createSale, deleteSale } from '../services/sale.service.js';
// (Mock fetch for Python worker since we don't have it fully built in Node's fetch yet, or we use standard fetch in Node 18+)

export const saleRouter = Router({ mergeParams: true });

saleRouter.get('/', asyncHandler(async (req, res) => {
  const { date_from, date_to, customer_id, status, payment_mode, search, page = 1, limit = 25 } = req.query;
  const params = [req.businessId];
  let baseSql = 'FROM sales WHERE business_id = ? AND deleted_at IS NULL';

  if (date_from && date_to) {
    baseSql += ' AND invoice_date BETWEEN ? AND ?';
    params.push(date_from, date_to);
  }
  if (customer_id) {
    baseSql += ' AND customer_id = ?';
    params.push(customer_id);
  }
  if (status) {
    baseSql += ' AND payment_status = ?';
    params.push(status);
  }
  if (payment_mode) {
    baseSql += ' AND payment_mode = ?';
    params.push(payment_mode);
  }
  if (search) {
    baseSql += ' AND invoice_no LIKE ?';
    const term = `%${search}%`;
    params.push(term);
  }

  // Count total for pagination
  const [countRows] = await req.tenantDb.execute(`SELECT COUNT(*) as total ${baseSql}`, params);
  const total = countRows[0].total;

  // Retrieve data
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const sql = `SELECT * ${baseSql} ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;

  const [rows] = await req.tenantDb.execute(sql, params);
  
  if (rows.length > 0) {
    const saleIds = rows.map(r => r.sale_id);
    const placeholders = saleIds.map(() => '?').join(',');
    const [items] = await req.tenantDb.execute(
      `SELECT * FROM sale_items WHERE sale_id IN (${placeholders})`,
      saleIds
    );
    
    const itemsBySaleId = {};
    items.forEach(item => {
      if (!itemsBySaleId[item.sale_id]) {
        itemsBySaleId[item.sale_id] = [];
      }
      itemsBySaleId[item.sale_id].push(item);
    });
    
    rows.forEach(row => {
      row.items = itemsBySaleId[row.sale_id] || [];
    });
  }
  
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

saleRouter.post('/', requireRole('Owner', 'Admin', 'Manager', 'Staff'), asyncHandler(async (req, res) => {
  const saleData = req.body;
  
  if (!saleData.items || !saleData.items.length) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'At least one item is required' }});
  }

  try {
    const saleResult = await createSale(req.tenantDb, req.businessId, saleData);

    // Fire and forget PDF generation (Python worker)
    // We catch the error so it doesn't fail the Node response
    fetch('http://127.0.0.1:8001/tasks/generate-invoice-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sale_id: saleResult.sale_id, business_id: req.businessId, tenant_db: req.tenantDbName })
    }).catch(err => console.warn('PDF worker unavailable:', err.message));

    res.status(201).json({ success: true, data: saleResult, message: 'Sale created successfully' });
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ success: false, error: { code: 'FK_CONSTRAINT_FAILED', message: 'The selected Customer or Product does not exist.' }});
    }
    // Pass application specific errors properly
    if (error.code) {
      return res.status(error.status || 400).json({ success: false, error });
    }
    throw error;
  }
}));

saleRouter.get('/:id', asyncHandler(async (req, res) => {
  const [sales] = await req.tenantDb.execute(
    'SELECT * FROM sales WHERE sale_id = ? AND business_id = ? AND deleted_at IS NULL',
    [req.params.id, req.businessId]
  );

  if (!sales.length) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sale not found' }});
  }

  const [items] = await req.tenantDb.execute(
    'SELECT * FROM sale_items WHERE sale_id = ?',
    [req.params.id]
  );

  res.json({ success: true, data: { ...sales[0], items } });
}));

saleRouter.delete('/:id', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const idStr = req.params.id;
  const isNumeric = /^\d+$/.test(idStr);
  let saleId = idStr;

  if (!isNumeric) {
    const [rows] = await req.tenantDb.execute(
      'SELECT sale_id FROM sales WHERE invoice_no = ? AND business_id = ?',
      [idStr, req.businessId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sale not found' }});
    }
    saleId = rows[0].sale_id;
  }

  await deleteSale(req.tenantDb, req.businessId, saleId);
  res.status(204).send();
}));

// ── RESTORE a soft-deleted sale ──────────────────────────────────────
saleRouter.post('/:id/restore', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const { withTransaction } = await import('../utils/transaction.js');

  try {
    await withTransaction(req.tenantDb, async (conn) => {
      // 1. Fetch soft-deleted sale
      const [sales] = await conn.execute(
        'SELECT * FROM sales WHERE sale_id = ? AND business_id = ? FOR UPDATE',
        [req.params.id, req.businessId]
      );
      if (!sales.length) {
        throw { status: 404, code: 'NOT_FOUND', message: 'Sale not found' };
      }
      const sale = sales[0];
      if (!sale.deleted_at) {
        throw { status: 409, code: 'ALREADY_ACTIVE', message: 'Sale is not deleted; nothing to restore.' };
      }

      // 2. Fetch sale items
      const [items] = await conn.execute(
        'SELECT * FROM sale_items WHERE sale_id = ?',
        [sale.sale_id]
      );

      // 3. Re-deduct stock for each product item
      for (const item of items) {
        if (!item.product_id) continue;
        const [prods] = await conn.execute(
          'SELECT current_stock, allow_negative_stock, product_name FROM products WHERE product_id = ? AND business_id = ? FOR UPDATE',
          [item.product_id, req.businessId]
        );
        if (!prods.length) continue;
        const product = prods[0];
        const stockBefore = Number(product.current_stock);
        const qty = Number(item.quantity);
        const stockAfter = stockBefore - qty;

        if (!product.allow_negative_stock && stockAfter < 0) {
          throw {
            status: 422, code: 'INSUFFICIENT_STOCK',
            message: `Cannot restore sale. ${product.product_name} only has ${stockBefore} units but ${qty} are needed.`
          };
        }

        await conn.execute(
          'UPDATE products SET current_stock = ? WHERE product_id = ? AND business_id = ?',
          [stockAfter, item.product_id, req.businessId]
        );
        await conn.execute(
          `INSERT INTO stock_movements (
            business_id, product_id, movement_type, reference_type, reference_id, quantity, stock_before, stock_after, notes
          ) VALUES (?, ?, 'Sale Out', 'sales', ?, ?, ?, ?, ?)`,
          [req.businessId, item.product_id, sale.sale_id, qty, stockBefore, stockAfter, `Restored sale ${sale.invoice_no}`]
        );
      }

      // 4. Re-create payment_in if sale had amount received
      if (Number(sale.amount_received) > 0) {
        const cash_in = sale.payment_mode === 'Cash' ? sale.amount_received : 0;
        const bank_in = !['Cash', 'Credit'].includes(sale.payment_mode) ? sale.amount_received : 0;

        const [paymentRes] = await conn.execute(
          `INSERT INTO payment_in (
            business_id, customer_id, sale_id, payment_date, payment_mode, amount, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [req.businessId, sale.customer_id || null, sale.sale_id, sale.invoice_date,
           sale.payment_mode, sale.amount_received, `Restored payment for Invoice ${sale.invoice_no}`]
        );
        await conn.execute(
          `INSERT INTO day_book (
            business_id, entry_date, entry_type, reference_type, reference_id,
            cash_in, bank_in, payment_mode, description
          ) VALUES (?, ?, 'Payment In', 'payment_in', ?, ?, ?, ?, ?)`,
          [req.businessId, sale.invoice_date, paymentRes.insertId, cash_in, bank_in,
           sale.payment_mode, `Restored payment for Invoice ${sale.invoice_no}`]
        );
      }

      // 5. Clear deleted_at to restore
      await conn.execute(
        'UPDATE sales SET deleted_at = NULL, updated_at = NOW() WHERE sale_id = ? AND business_id = ?',
        [sale.sale_id, req.businessId]
      );
    });

    res.json({ success: true, message: 'Sale restored successfully' });
  } catch (error) {
    if (error.code) {
      return res.status(error.status || 400).json({ success: false, error });
    }
    throw error;
  }
}));

