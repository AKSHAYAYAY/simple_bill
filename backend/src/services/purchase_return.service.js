import { withTransaction } from '../utils/transaction.js';
import { generateInvoiceNo } from '../utils/invoiceNumber.js';
import { round2 } from '../utils/taxCalculator.js';

export async function createPurchaseReturn(pool, businessId, returnData) {
  return withTransaction(pool, async (conn) => {
    const {
      supplier_id, purchase_id = null, return_invoice_no = null, return_date,
      payment_mode = 'Cash', refund_status = 'Pending', notes = null, items
    } = returnData;

    // 1. Validate Items
    for (const item of items) {
      if (!item.product_id) {
        throw { status: 400, code: 'VALIDATION_ERROR', message: 'All purchase return items must have a product_id' };
      }

      // Lock product to read stock and perform trigger updates safely
      const [rows] = await conn.execute(
        'SELECT current_stock FROM products WHERE product_id = ? AND business_id = ? FOR UPDATE',
        [item.product_id, businessId]
      );

      if (!rows.length) {
        throw { status: 404, code: 'PRODUCT_NOT_FOUND', message: `Product ID ${item.product_id} not found` };
      }
      
      item._stock_before = Number(rows[0].current_stock);
    }

    // 2. Calculate Totals
    let subtotal = 0;
    let total_cgst = 0;
    let total_sgst = 0;
    let total_igst = 0;

    for (const item of items) {
      const lineTotal = Number(item.purchase_price) * Number(item.quantity);
      const discountAmt = Number(item.discount_amount || 0);
      const itemNet = Math.max(0, lineTotal - discountAmt);
      
      const cgstAmt = itemNet * (Number(item.cgst_percentage || 0) / 100);
      const sgstAmt = itemNet * (Number(item.sgst_percentage || 0) / 100);
      const igstAmt = itemNet * (Number(item.igst_percentage || 0) / 100);
      const taxAmt = cgstAmt + sgstAmt + igstAmt;

      subtotal += itemNet;
      total_cgst += cgstAmt;
      total_sgst += sgstAmt;
      total_igst += igstAmt;

      item._line_total = itemNet + taxAmt;
      item.total_tax = taxAmt;
    }

    const overallDiscount = Number(returnData.discount_amount || 0);
    const grand_total = round2(subtotal + total_cgst + total_sgst + total_igst - overallDiscount);

    // 3. Generate Return Invoice Number if not provided
    const finalInvoiceNo = return_invoice_no || await generateInvoiceNo(conn, businessId, 'PR');

    // 4. Handle Refund Auto-Creation of payment_in
    let payment_in_id = null;
    if (refund_status === 'Refunded') {
      const [paymentRes] = await conn.execute(
        `INSERT INTO payment_in (
          business_id, customer_id, supplier_id, payment_date, payment_mode, amount, reference_no, notes
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
        [
          businessId, supplier_id, return_date, payment_mode, grand_total,
          returnData.reference_no || null, `Refund for Purchase Return ${finalInvoiceNo}`
        ]
      );
      payment_in_id = paymentRes.insertId;
    }

    // 5. Insert Purchase Return Main Record
    const refund_amount = refund_status === 'Refunded' ? grand_total : 0;
    const adjusted_in_purchase_id = refund_status === 'Adjusted' ? (returnData.adjusted_in_purchase_id || null) : null;

    const [returnRes] = await conn.execute(
      `INSERT INTO purchase_returns (
        business_id, supplier_id, purchase_id, return_invoice_no, return_date, payment_mode,
        subtotal, total_cgst, total_sgst, total_igst, grand_total, refund_amount, refund_status,
        payment_in_id, adjusted_in_purchase_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        businessId, supplier_id, purchase_id, finalInvoiceNo, return_date, payment_mode,
        subtotal, total_cgst, total_sgst, total_igst, grand_total, refund_amount, refund_status,
        payment_in_id, adjusted_in_purchase_id, notes
      ]
    );
    const returnId = returnRes.insertId;

    // 6. Insert Return Items and Stock Movements
    for (const item of items) {
      await conn.execute(
        `INSERT INTO purchase_return_items (
          return_id, product_id, quantity, purchase_price, cgst_percentage, sgst_percentage, igst_percentage, total_tax, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          returnId, item.product_id, item.quantity, item.purchase_price,
          item.cgst_percentage || 0, item.sgst_percentage || 0, item.igst_percentage || 0,
          item.total_tax || 0, item._line_total
        ]
      );

      // Trigger trg_purchase_return_stock_deduct automatically decrements products.current_stock
      // We must write the stock_movements audit log
      const qtyReturned = Number(item.quantity);
      const expectedStockAfter = round2(item._stock_before - qtyReturned);
      const [stockRows] = await conn.execute(
        'SELECT current_stock FROM products WHERE product_id = ? AND business_id = ?',
        [item.product_id, businessId]
      );
      const stockAfter = Number(stockRows[0]?.current_stock ?? expectedStockAfter);
      if (stockAfter !== expectedStockAfter) {
        throw { status: 500, code: 'STOCK_INTEGRITY_ERROR', message: `Stock mismatch for product ${item.product_id}: expected ${expectedStockAfter}, got ${stockAfter}` };
      }
      
      await conn.execute(
        `INSERT INTO stock_movements (
          business_id, product_id, movement_type, reference_type, reference_id, quantity, stock_before, stock_after
        ) VALUES (?, ?, 'Purchase Return Out', 'purchase_returns', ?, ?, ?, ?)`,
        [businessId, item.product_id, returnId, qtyReturned, item._stock_before, stockAfter]
      );
    }

    // 7. Insert Day Book Entry
    if (refund_status === 'Refunded') {
      const cash_in = ['Cash'].includes(payment_mode) ? grand_total : 0;
      const bank_in = !['Cash', 'Credit'].includes(payment_mode) ? grand_total : 0;

      await conn.execute(
        `INSERT INTO day_book (
          business_id, entry_date, entry_type, reference_type, reference_id,
          cash_in, bank_in, payment_mode, description
        ) VALUES (?, ?, 'Purchase Return', 'purchase_returns', ?, ?, ?, ?, ?)`,
        [
          businessId, return_date, returnId, cash_in, bank_in, payment_mode, 
          `Refund for Purchase Return ${finalInvoiceNo}`
        ]
      );
    }

    return { return_id: returnId, return_invoice_no: finalInvoiceNo, grand_total, refund_status };
  });
}
