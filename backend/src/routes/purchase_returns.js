import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/requireRole.js';
import { createPurchaseReturn } from '../services/purchase_return.service.js';
import { withTransaction } from '../utils/transaction.js';

export const purchaseReturnRouter = Router({ mergeParams: true });

// GET all purchase returns with filters
purchaseReturnRouter.get('/', asyncHandler(async (req, res) => {
  const { supplier_id, purchase_id, from_date, to_date, refund_status, search } = req.query;
  const params = [req.businessId];
  
  let sql = `
    SELECT pr.*, s.supplier_name, p.purchase_invoice_no
    FROM purchase_returns pr
    LEFT JOIN suppliers s ON pr.supplier_id = s.supplier_id
    LEFT JOIN purchases p ON pr.purchase_id = p.purchase_id
    WHERE pr.business_id = ?
  `;

  if (supplier_id) {
    sql += ' AND pr.supplier_id = ?';
    params.push(supplier_id);
  }
  if (purchase_id) {
    sql += ' AND pr.purchase_id = ?';
    params.push(purchase_id);
  }
  if (from_date && to_date) {
    sql += ' AND pr.return_date BETWEEN ? AND ?';
    params.push(from_date, to_date);
  }
  if (refund_status) {
    sql += ' AND pr.refund_status = ?';
    params.push(refund_status);
  }
  if (search) {
    sql += ' AND (pr.return_invoice_no LIKE ? OR s.supplier_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY pr.created_at DESC LIMIT 100';

  const [rows] = await req.tenantDb.execute(sql, params);
  res.json({ success: true, data: rows });
}));

// POST create purchase return
purchaseReturnRouter.post('/', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const returnData = req.body;

  if (!returnData.items || !returnData.items.length) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'At least one item is required for return' }});
  }

  try {
    const result = await createPurchaseReturn(req.tenantDb, req.businessId, returnData);
    res.status(201).json({ success: true, data: result, message: 'Purchase return created successfully' });
  } catch (error) {
    if (error.code) {
      return res.status(error.status || 400).json({ success: false, error });
    }
    throw error;
  }
}));

// GET purchase return details
purchaseReturnRouter.get('/:id', asyncHandler(async (req, res) => {
  const [returns] = await req.tenantDb.execute(
    `SELECT pr.*, s.supplier_name, p.purchase_invoice_no
     FROM purchase_returns pr
     LEFT JOIN suppliers s ON pr.supplier_id = s.supplier_id
     LEFT JOIN purchases p ON pr.purchase_id = p.purchase_id
     WHERE pr.return_id = ? AND pr.business_id = ?`,
    [req.params.id, req.businessId]
  );

  if (!returns.length) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Purchase return not found' }});
  }

  const [items] = await req.tenantDb.execute(
    `SELECT pri.*, p.product_name, p.product_code, u.unit_name
     FROM purchase_return_items pri
     JOIN products p ON pri.product_id = p.product_id
     LEFT JOIN units u ON p.unit_id = u.unit_id
     WHERE pri.return_id = ?`,
    [req.params.id]
  );

  res.json({ success: true, data: { ...returns[0], items } });
}));

// GET purchase return items only
purchaseReturnRouter.get('/:id/items', asyncHandler(async (req, res) => {
  const [items] = await req.tenantDb.execute(
    `SELECT pri.*, p.product_name, p.product_code, u.unit_name
     FROM purchase_return_items pri
     JOIN products p ON pri.product_id = p.product_id
     LEFT JOIN units u ON p.unit_id = u.unit_id
     WHERE pri.return_id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: items });
}));

// PUT update refund status
purchaseReturnRouter.put('/:id/refund-status', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const { refund_status, payment_mode, payment_date, reference_no, adjusted_in_purchase_id } = req.body;
  const returnId = req.params.id;

  const [returns] = await req.tenantDb.execute(
    'SELECT * FROM purchase_returns WHERE return_id = ? AND business_id = ?',
    [returnId, req.businessId]
  );

  if (!returns.length) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Purchase return not found' }});
  }

  const purchaseReturn = returns[0];
  let payment_in_id = purchaseReturn.payment_in_id;
  let final_adjusted_purchase_id = purchaseReturn.adjusted_in_purchase_id;

  if (refund_status === 'Refunded' && !payment_in_id) {
    const [paymentRes] = await req.tenantDb.execute(
      `INSERT INTO payment_in (
        business_id, customer_id, supplier_id, payment_date, payment_mode, amount, reference_no, notes
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
      [
        req.businessId, purchaseReturn.supplier_id, payment_date || new Date().toISOString().slice(0, 10),
        payment_mode || 'Cash', purchaseReturn.grand_total, reference_no || null,
        `Refund for Purchase Return ${purchaseReturn.return_invoice_no}`
      ]
    );
    payment_in_id = paymentRes.insertId;

    // Log to day book
    const cash_in = ['Cash'].includes(payment_mode) ? purchaseReturn.grand_total : 0;
    const bank_in = !['Cash', 'Credit'].includes(payment_mode) ? purchaseReturn.grand_total : 0;
    await req.tenantDb.execute(
      `INSERT INTO day_book (
        business_id, entry_date, entry_type, reference_type, reference_id,
        cash_in, bank_in, payment_mode, description
      ) VALUES (?, ?, 'Purchase Return', 'purchase_returns', ?, ?, ?, ?, ?)`,
      [
        req.businessId, payment_date || new Date().toISOString().slice(0, 10), returnId,
        cash_in, bank_in, payment_mode || 'Cash', `Refund for Purchase Return ${purchaseReturn.return_invoice_no}`
      ]
    );
  } else if (refund_status === 'Adjusted') {
    if (!adjusted_in_purchase_id) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'adjusted_in_purchase_id is required' }});
    }
    final_adjusted_purchase_id = adjusted_in_purchase_id;
  }

  const refund_amount = refund_status === 'Refunded' ? purchaseReturn.grand_total : 0;

  await req.tenantDb.execute(
    `UPDATE purchase_returns
     SET refund_status = ?, refund_amount = ?, payment_in_id = ?, adjusted_in_purchase_id = ?
     WHERE return_id = ? AND business_id = ?`,
    [refund_status, refund_amount, payment_in_id, final_adjusted_purchase_id, returnId, req.businessId]
  );

  res.json({
    success: true,
    data: {
      return_id: Number(returnId),
      refund_status,
      payment_in_id
    }
  });
}));

// POST apply purchase return credit as adjustment against one or more purchases (no cash flow)
purchaseReturnRouter.post('/:id/apply-adjustment', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const returnId = req.params.id;
  let allocations = req.body.allocations;

  if (!allocations) {
    const { purchase_id } = req.body;
    if (!purchase_id) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Either purchase_id or allocations is required' }});
    }
    allocations = [{ purchase_id, amount: null }];
  }

  if (!Array.isArray(allocations) || !allocations.length) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Allocations must be a non-empty array' }});
  }

  try {
    const result = await withTransaction(req.tenantDb, async (conn) => {
      // Lock and fetch the purchase return
      const [returns] = await conn.execute(
        'SELECT * FROM purchase_returns WHERE return_id = ? AND business_id = ? FOR UPDATE',
        [returnId, req.businessId]
      );
      if (!returns.length) {
        throw { status: 404, code: 'NOT_FOUND', message: 'Purchase return not found' };
      }
      const purchaseReturn = returns[0];
      if (purchaseReturn.refund_status !== 'Pending') {
        throw { status: 422, code: 'ALREADY_SETTLED', message: `This return is already ${purchaseReturn.refund_status}. Cannot re-apply.` };
      }

      const returnGrandTotal = Number(purchaseReturn.grand_total);
      const currentRefundAmount = Number(purchaseReturn.refund_amount || 0);
      const remainingReturnCredit = Math.max(returnGrandTotal - currentRefundAmount, 0);

      if (remainingReturnCredit <= 0) {
        throw { status: 422, code: 'NO_CREDIT_AVAILABLE', message: 'No adjustment credit remaining on this return.' };
      }

      let totalAllocated = 0;
      const processedAllocations = [];

      for (const alloc of allocations) {
        const purchaseId = Number(alloc.purchase_id);
        if (!purchaseId) {
          throw { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid purchase_id in allocations' };
        }

        // Lock and fetch the target purchase
        const [purchases] = await conn.execute(
          'SELECT purchase_id, purchase_invoice_no, grand_total, amount_paid FROM purchases WHERE purchase_id = ? AND business_id = ? AND deleted_at IS NULL FOR UPDATE',
          [purchaseId, req.businessId]
        );
        if (!purchases.length) {
          throw { status: 404, code: 'NOT_FOUND', message: `Target purchase ID ${purchaseId} not found` };
        }
        const purchase = purchases[0];
        const purchaseRemaining = Math.max(Number(purchase.grand_total) - Number(purchase.amount_paid), 0);

        let amountToApply = alloc.amount !== undefined && alloc.amount !== null ? Number(alloc.amount) : null;
        if (amountToApply === null) {
          amountToApply = Math.min(remainingReturnCredit, purchaseRemaining);
        }

        if (amountToApply <= 0) {
          throw { status: 400, code: 'VALIDATION_ERROR', message: `Allocation amount for purchase invoice ${purchase.purchase_invoice_no} must be greater than zero` };
        }

        if (amountToApply > purchaseRemaining + 0.01) {
          throw { status: 422, code: 'EXCEEDS_INVOICE_BALANCE', message: `Cannot apply ₹${amountToApply.toFixed(2)} to purchase invoice ${purchase.purchase_invoice_no} which has only ₹${purchaseRemaining.toFixed(2)} remaining.` };
        }

        totalAllocated += amountToApply;
        processedAllocations.push({
          purchase,
          amountToApply,
          purchaseRemaining
        });
      }

      if (totalAllocated > remainingReturnCredit + 0.01) {
        throw { status: 422, code: 'EXCEEDS_RETURN_CREDIT', message: `Total allocated credit (₹${totalAllocated.toFixed(2)}) exceeds available return credit (₹${remainingReturnCredit.toFixed(2)})` };
      }

      // Apply changes
      for (const p of processedAllocations) {
        const newAmountPaid = Number(p.purchase.amount_paid) + p.amountToApply;
        const paymentStatus = newAmountPaid >= Number(p.purchase.grand_total) ? 'Paid' : (newAmountPaid > 0 ? 'Partial' : 'Unpaid');

        await conn.execute(
          'UPDATE purchases SET amount_paid = ?, payment_status = ?, updated_at = NOW() WHERE purchase_id = ? AND business_id = ?',
          [newAmountPaid, paymentStatus, p.purchase.purchase_id, req.businessId]
        );
      }

      const newRefundAmount = currentRefundAmount + totalAllocated;
      const newRefundStatus = (newRefundAmount >= returnGrandTotal - 0.01) ? 'Adjusted' : 'Pending';
      const firstPurchaseId = processedAllocations[0].purchase.purchase_id;

      await conn.execute(
        'UPDATE purchase_returns SET refund_status = ?, refund_amount = ?, adjusted_in_purchase_id = ?, updated_at = NOW() WHERE return_id = ? AND business_id = ?',
        [newRefundStatus, newRefundAmount, firstPurchaseId, returnId, req.businessId]
      );

      return {
        return_id: Number(returnId),
        refund_status: newRefundStatus,
        refund_amount: newRefundAmount,
        credit_applied: totalAllocated,
        allocations: processedAllocations.map(p => ({
          purchase_id: p.purchase.purchase_id,
          purchase_invoice_no: p.purchase.purchase_invoice_no,
          amount_applied: p.amountToApply
        }))
      };
    });

    res.json({
      success: true,
      data: result,
      message: `₹${result.credit_applied.toFixed(2)} credit from purchase return successfully adjusted against ${result.allocations.length} purchase(s).`
    });
  } catch (error) {
    if (error.code) {
      return res.status(error.status || 400).json({ success: false, error });
    }
    throw error;
  }
}));

// DELETE a purchase return
purchaseReturnRouter.delete('/:id', requireRole('Owner', 'Admin'), asyncHandler(async (req, res) => {
  const returnId = req.params.id;

  const [returns] = await req.tenantDb.execute(
    'SELECT * FROM purchase_returns WHERE return_id = ? AND business_id = ?',
    [returnId, req.businessId]
  );

  if (!returns.length) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Purchase return not found' }});
  }

  const purchaseReturn = returns[0];

  // We should do this in a transaction to reverse stock and remove payments/daybook entries
  const conn = req.tenantDb;
  
  // 1. Get return items
  const [items] = await conn.execute('SELECT * FROM purchase_return_items WHERE return_id = ?', [returnId]);

  // 2. Delete the purchase_return record (will cascade delete items due to FK)
  await conn.execute('DELETE FROM purchase_returns WHERE return_id = ? AND business_id = ?', [returnId, req.businessId]);

  // 3. Reverse stock movements (the trigger trg_purchase_return_stock_deduct only works ON INSERT,
  // so we must manually restore stock on delete since there is no AFTER DELETE trigger!)
  for (const item of items) {
    await conn.execute(
      'UPDATE products SET current_stock = current_stock + ? WHERE product_id = ? AND business_id = ?',
      [item.quantity, item.product_id, req.businessId]
    );

    // Get current stock for audit movement log
    const [prodRows] = await conn.execute('SELECT current_stock FROM products WHERE product_id = ?', [item.product_id]);
    const stockAfter = prodRows.length ? Number(prodRows[0].current_stock) : 0;
    const stockBefore = stockAfter - Number(item.quantity);

    await conn.execute(
      `INSERT INTO stock_movements (
        business_id, product_id, movement_type, reference_type, reference_id, quantity, stock_before, stock_after, notes
      ) VALUES (?, ?, 'Manual Adjustment', 'purchase_returns', ?, ?, ?, ?, 'Deleted Purchase Return')`,
      [req.businessId, item.product_id, returnId, item.quantity, stockBefore, stockAfter]
    );
  }

  // 4. Remove auto-created payment_in and day book entries
  if (purchaseReturn.payment_in_id) {
    await conn.execute('DELETE FROM payment_in WHERE payment_in_id = ?', [purchaseReturn.payment_in_id]);
  }
  await conn.execute(
    "DELETE FROM day_book WHERE reference_type = 'purchase_returns' AND reference_id = ?",
    [returnId]
  );

  res.status(204).send();
}));
