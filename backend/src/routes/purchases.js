import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/requireRole.js';
import { createPurchase, deletePurchase } from '../services/purchase.service.js';

export const purchaseRouter = Router({ mergeParams: true });

purchaseRouter.get('/', asyncHandler(async (req, res) => {
  const { date_from, date_to, supplier_id, status, payment_mode, search, page = 1, limit = 25 } = req.query;
  const params = [req.businessId];
  let baseSql = 'FROM purchases WHERE business_id = ? AND deleted_at IS NULL';

  if (date_from && date_to) {
    baseSql += ' AND purchase_date BETWEEN ? AND ?';
    params.push(date_from, date_to);
  }
  if (supplier_id) {
    baseSql += ' AND supplier_id = ?';
    params.push(supplier_id);
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
    baseSql += ' AND (reference_number LIKE ? OR supplier_invoice_no LIKE ? OR purchase_invoice_no LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  // Count total for pagination
  const [countRows] = await req.tenantDb.execute(`SELECT COUNT(*) as total ${baseSql}`, params);
  const total = countRows[0].total;

  // Retrieve data
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const sql = `SELECT * ${baseSql} ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;

  const [rows] = await req.tenantDb.execute(sql, params);
 
  if (rows.length > 0) {
    const purchaseIds = rows.map(r => r.purchase_id);
    const placeholders = purchaseIds.map(() => '?').join(',');
    const [items] = await req.tenantDb.execute(
      `SELECT pi.*, p.product_name AS description, p.product_code, p.product_name AS item_name
       FROM purchase_items pi
       LEFT JOIN products p ON pi.product_id = p.product_id
       WHERE pi.purchase_id IN (${placeholders})`,
      purchaseIds
    );

    const itemsByPurchaseId = {};
    items.forEach(item => {
      if (!itemsByPurchaseId[item.purchase_id]) {
        itemsByPurchaseId[item.purchase_id] = [];
      }
      itemsByPurchaseId[item.purchase_id].push({
        ...item,
        unit_price: Number(item.purchase_price),
        tax_rate: Number(item.cgst_percentage) + Number(item.sgst_percentage) + Number(item.igst_percentage)
      });
    });

    rows.forEach(row => {
      row.items = itemsByPurchaseId[row.purchase_id] || [];
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

purchaseRouter.post('/', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const purchaseData = req.body;
  
  if (!purchaseData.items || !purchaseData.items.length) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'At least one item is required' }});
  }

  try {
    const purchaseResult = await createPurchase(req.tenantDb, req.businessId, purchaseData);
    res.status(201).json({ success: true, data: purchaseResult, message: 'Purchase created successfully' });
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ success: false, error: { code: 'FK_CONSTRAINT_FAILED', message: 'The selected Supplier or Product does not exist.' }});
    }
    if (error.code) {
      return res.status(error.status || 400).json({ success: false, error });
    }
    throw error;
  }
}));

purchaseRouter.get('/:id', asyncHandler(async (req, res) => {
  const [purchases] = await req.tenantDb.execute(
    'SELECT * FROM purchases WHERE purchase_id = ? AND business_id = ? AND deleted_at IS NULL',
    [req.params.id, req.businessId]
  );

  if (!purchases.length) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Purchase not found' }});
  }

  const [items] = await req.tenantDb.execute(
    `SELECT pi.*, p.product_name AS description, p.product_code, p.product_name AS item_name
     FROM purchase_items pi
     LEFT JOIN products p ON pi.product_id = p.product_id
     WHERE pi.purchase_id = ?`,
    [req.params.id]
  );

  const mappedItems = items.map(item => ({
    ...item,
    unit_price: Number(item.purchase_price),
    tax_rate: Number(item.cgst_percentage) + Number(item.sgst_percentage) + Number(item.igst_percentage)
  }));

  res.json({ success: true, data: { ...purchases[0], items: mappedItems } });
}));

purchaseRouter.delete('/:id', requireRole('Owner', 'Admin'), asyncHandler(async (req, res) => {
  try {
    await deletePurchase(req.tenantDb, req.businessId, req.params.id);
    res.status(204).send();
  } catch (error) {
    if (error.code) {
      return res.status(error.status || 400).json({ success: false, error });
    }
    throw error;
  }
}));

// ── RESTORE a soft-deleted purchase ──────────────────────────────────
purchaseRouter.post('/:id/restore', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const { withTransaction } = await import('../utils/transaction.js');

  try {
    await withTransaction(req.tenantDb, async (conn) => {
      // 1. Fetch soft-deleted purchase
      const [purchases] = await conn.execute(
        'SELECT * FROM purchases WHERE purchase_id = ? AND business_id = ? FOR UPDATE',
        [req.params.id, req.businessId]
      );
      if (!purchases.length) {
        throw { status: 404, code: 'NOT_FOUND', message: 'Purchase not found' };
      }
      const purchase = purchases[0];
      if (!purchase.deleted_at) {
        throw { status: 409, code: 'ALREADY_ACTIVE', message: 'Purchase is not deleted; nothing to restore.' };
      }

      // 2. Fetch purchase items
      const [items] = await conn.execute(
        'SELECT * FROM purchase_items WHERE purchase_id = ?',
        [purchase.purchase_id]
      );

      // 3. Re-add stock for each product item
      for (const item of items) {
        if (!item.product_id) continue;
        const [prods] = await conn.execute(
          'SELECT current_stock, product_name FROM products WHERE product_id = ? AND business_id = ? FOR UPDATE',
          [item.product_id, req.businessId]
        );
        if (!prods.length) continue;
        const stockBefore = Number(prods[0].current_stock);
        const qty = Number(item.quantity) + Number(item.free_quantity || 0);
        const stockAfter = stockBefore + qty;

        await conn.execute(
          'UPDATE products SET current_stock = ? WHERE product_id = ? AND business_id = ?',
          [stockAfter, item.product_id, req.businessId]
        );
        await conn.execute(
          `INSERT INTO stock_movements (
            business_id, product_id, movement_type, reference_type, reference_id, quantity, stock_before, stock_after, notes
          ) VALUES (?, ?, 'Purchase In', 'purchases', ?, ?, ?, ?, ?)`,
          [req.businessId, item.product_id, purchase.purchase_id, qty, stockBefore, stockAfter,
           `Restored purchase ${purchase.purchase_invoice_no}`]
        );
      }

      // 4. Re-create payment_out if purchase had amount paid
      if (Number(purchase.amount_paid) > 0) {
        const cash_out = purchase.payment_mode === 'Cash' ? purchase.amount_paid : 0;
        const bank_out = !['Cash', 'Credit'].includes(purchase.payment_mode) ? purchase.amount_paid : 0;

        const [paymentRes] = await conn.execute(
          `INSERT INTO payment_out (
            business_id, supplier_id, purchase_id, payment_date, payment_mode, amount, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [req.businessId, purchase.supplier_id, purchase.purchase_id, purchase.purchase_date,
           purchase.payment_mode, purchase.amount_paid, `Restored payment for PO ${purchase.purchase_invoice_no}`]
        );
        await conn.execute(
          `INSERT INTO day_book (
            business_id, entry_date, entry_type, reference_type, reference_id,
            cash_out, bank_out, payment_mode, description
          ) VALUES (?, ?, 'Payment Out', 'payment_out', ?, ?, ?, ?, ?)`,
          [req.businessId, purchase.purchase_date, paymentRes.insertId, cash_out, bank_out,
           purchase.payment_mode, `Restored payment for PO ${purchase.purchase_invoice_no}`]
        );
      }

      // 5. Clear deleted_at to restore
      await conn.execute(
        'UPDATE purchases SET deleted_at = NULL, updated_at = NOW() WHERE purchase_id = ? AND business_id = ?',
        [purchase.purchase_id, req.businessId]
      );
    });

    res.json({ success: true, message: 'Purchase restored successfully' });
  } catch (error) {
    if (error.code) {
      return res.status(error.status || 400).json({ success: false, error });
    }
    throw error;
  }
}));

