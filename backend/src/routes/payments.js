import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { requireRole } from '../middleware/requireRole.js';
import { createPayment } from '../services/payment.service.js';

export const paymentRouter = Router({ mergeParams: true });

paymentRouter.get('/in', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    `SELECT
       pi.*,
       c.customer_name,
       s.supplier_name,
       sale.invoice_no AS linked_invoice_no,
       pr.return_invoice_no AS linked_return_no
     FROM payment_in pi
     LEFT JOIN customers c ON c.customer_id = pi.customer_id
     LEFT JOIN suppliers s ON s.supplier_id = pi.supplier_id
     LEFT JOIN sales sale ON sale.sale_id = pi.sale_id
     LEFT JOIN purchase_returns pr ON pr.payment_in_id = pi.payment_in_id
     WHERE pi.business_id = ?
     ORDER BY pi.payment_date DESC, pi.created_at DESC
     LIMIT 100`,
    [req.businessId]
  );
  const mapped = rows.map(r => ({
    ...r,
    payment_id: r.payment_in_id,
    reference_number: r.reference_no,
    payment_mode: r.payment_mode === 'Cash' ? 'Cash' : 'Bank',
    party_type: r.customer_id ? 'Customer' : 'Supplier',
    party_name: r.customer_id ? r.customer_name : r.supplier_name
  }));
  res.json({ success: true, data: mapped });
}));

paymentRouter.post('/in', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const data = { ...req.body };
  // Ensure date is set
  if (!data.payment_date) {
    data.payment_date = new Date().toISOString().slice(0, 10);
  }
  if (data.reference_number) {
    data.reference_no = data.reference_number;
  }
  if (data.payment_mode === 'Bank') {
    data.payment_mode = 'Bank Transfer';
  }

  try {
    const result = await createPayment(req.tenantDb, req.businessId, 'IN', data);
    res.status(201).json({ success: true, data: result, message: 'Payment In recorded successfully' });
  } catch (error) {
    if (error.code) return res.status(error.status || 400).json({ success: false, error });
    throw error;
  }
}));

paymentRouter.get('/out', asyncHandler(async (req, res) => {
  const [rows] = await req.tenantDb.execute(
    `SELECT
       po.*,
       s.supplier_name,
       c.customer_name,
       p.purchase_invoice_no AS linked_invoice_no,
       sr.return_invoice_no AS linked_return_no
     FROM payment_out po
     LEFT JOIN suppliers s ON s.supplier_id = po.supplier_id
     LEFT JOIN customers c ON c.customer_id = po.customer_id
     LEFT JOIN purchases p ON p.purchase_id = po.purchase_id
     LEFT JOIN sales_returns sr ON sr.payment_out_id = po.payment_out_id
     WHERE po.business_id = ?
     ORDER BY po.payment_date DESC, po.created_at DESC
     LIMIT 100`,
    [req.businessId]
  );
  const mapped = rows.map(r => ({
    ...r,
    payment_id: r.payment_out_id,
    reference_number: r.reference_no,
    payment_mode: r.payment_mode === 'Cash' ? 'Cash' : 'Bank',
    party_type: r.supplier_id ? 'Supplier' : 'Customer',
    party_name: r.supplier_id ? r.supplier_name : r.customer_name
  }));
  res.json({ success: true, data: mapped });
}));

paymentRouter.post('/out', requireRole('Owner', 'Admin', 'Manager'), asyncHandler(async (req, res) => {
  const data = { ...req.body };
  if (!data.payment_date) {
    data.payment_date = new Date().toISOString().slice(0, 10);
  }
  if (data.reference_number) {
    data.reference_no = data.reference_number;
  }
  if (data.payment_mode === 'Bank') {
    data.payment_mode = 'Bank Transfer';
  }

  try {
    const result = await createPayment(req.tenantDb, req.businessId, 'OUT', data);
    res.status(201).json({ success: true, data: result, message: 'Payment Out recorded successfully' });
  } catch (error) {
    if (error.code) return res.status(error.status || 400).json({ success: false, error });
    throw error;
  }
}));
