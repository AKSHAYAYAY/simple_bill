import { withTransaction } from '../utils/transaction.js';
import { generateInvoiceNo } from '../utils/invoiceNumber.js';
import { applyRoundOff, round2 } from '../utils/taxCalculator.js';

const normaliseMode = (mode = 'Cash') => (mode === 'Bank' ? 'Bank Transfer' : mode);

export async function createPurchase(pool, businessId, purchaseData) {
  return withTransaction(pool, async (conn) => {
    // Mapped properties for robustness
    const supplier_invoice_no = purchaseData.supplier_invoice_no || purchaseData.reference_number || null;
    const amount_paid = Number(purchaseData.amount_paid !== undefined ? purchaseData.amount_paid : (purchaseData.paid_amount !== undefined ? purchaseData.paid_amount : 0));

    let {
      supplier_id, new_supplier, items, payment_mode = 'Cash',
      transport_cost = 0, loading_cost = 0, other_charges = 0,
      transport_paid_by = 'Business', transport_vehicle_no = null,
      transport_notes = null, notes = null
    } = purchaseData;
    payment_mode = normaliseMode(payment_mode);

    // Auto-create supplier if inline new_supplier data is supplied and no supplier_id given
    if (!supplier_id && new_supplier && new_supplier.supplier_name) {
      const [supRes] = await conn.execute(
        `INSERT INTO suppliers (
          business_id, supplier_name, company_name, gst_number,
          phone, alternate_phone, email, address, city, state, pincode,
          opening_balance, opening_balance_type, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          businessId,
          new_supplier.supplier_name,
          new_supplier.company_name || null,
          new_supplier.gst_number || null,
          new_supplier.phone || null,
          new_supplier.alternate_phone || null,
          new_supplier.email || null,
          new_supplier.address || null,
          new_supplier.city || null,
          new_supplier.state || null,
          new_supplier.pincode || null,
          new_supplier.opening_balance || 0,
          new_supplier.opening_balance_type || 'Payable',
          1
        ]
      );
      supplier_id = supRes.insertId;
    }

    // 1. Validate and Map Items
    for (const [i, item] of items.entries()) {
      if (!item.product_id && item.description && item.description.trim()) {
        // Auto-create product inline (purchases require real products for stock tracking)
        const productCode = `PRD-${Date.now().toString().slice(-6)}-${i}`;
        const [prodRes] = await conn.execute(
          `INSERT INTO products (
            business_id, product_name, product_code, purchase_price, selling_price, current_stock, is_active
          ) VALUES (?, ?, ?, ?, ?, 0, 1)`,
          [
            businessId, item.description.trim(), productCode, 
            item.purchase_price || item.unit_price || 0, item.selling_price || item.purchase_price || item.unit_price || 0
          ]
        );
        item.product_id = prodRes.insertId;
        item._stock_before = 0;
      } else if (!item.product_id) {
        throw { status: 400, code: 'VALIDATION_ERROR', message: 'All purchase items must have a product_id or a valid description for new product' };
      } else {
        // Lock existing product to safely update its purchase_price later if needed
        const [rows] = await conn.execute(
          'SELECT current_stock FROM products WHERE product_id = ? AND business_id = ? FOR UPDATE',
          [item.product_id, businessId]
        );

        if (!rows.length) {
          throw { status: 404, code: 'PRODUCT_NOT_FOUND', message: `Product ID ${item.product_id} not found` };
        }
        
        item._stock_before = Number(rows[0].current_stock);
      }

      // Robust mapping for item fields:
      const purchase_price = Number(item.purchase_price !== undefined ? item.purchase_price : (item.unit_price !== undefined ? item.unit_price : 0));
      const quantity = Number(item.quantity || 0);
      const free_quantity = Number(item.free_quantity || 0);

      // CGST/SGST/IGST mapping
      let tax_rate = Number(item.tax_rate !== undefined ? item.tax_rate : 0);
      let cgst_percentage = Number(item.cgst_percentage !== undefined ? item.cgst_percentage : 0);
      let sgst_percentage = Number(item.sgst_percentage !== undefined ? item.sgst_percentage : 0);
      let igst_percentage = Number(item.igst_percentage !== undefined ? item.igst_percentage : 0);

      if (tax_rate > 0 && cgst_percentage === 0 && sgst_percentage === 0 && igst_percentage === 0) {
        cgst_percentage = tax_rate / 2;
        sgst_percentage = tax_rate / 2;
      } else if (cgst_percentage > 0 || sgst_percentage > 0 || igst_percentage > 0) {
        tax_rate = cgst_percentage + sgst_percentage + igst_percentage;
      }

      const lineTotal = purchase_price * quantity;
      const discountAmt = Number(item.discount_amount || 0);
      const lineNet = Math.max(0, lineTotal - discountAmt);
      const cgstAmt = lineNet * (cgst_percentage / 100);
      const sgstAmt = lineNet * (sgst_percentage / 100);
      const igstAmt = lineNet * (igst_percentage / 100);
      const total_tax = cgstAmt + sgstAmt + igstAmt;
      const line_total = lineNet + total_tax;

      item.purchase_price = purchase_price;
      item.quantity = quantity;
      item.free_quantity = free_quantity;
      item.cgst_percentage = cgst_percentage;
      item.sgst_percentage = sgst_percentage;
      item.igst_percentage = igst_percentage;
      item.total_tax = total_tax;
      item._line_total = line_total;
    }

    // 2. Calculate Totals
    let subtotal = 0;
    let total_cgst = 0;
    let total_sgst = 0;
    let total_igst = 0;

    for (const item of items) {
      const lineTotal = item.purchase_price * item.quantity;
      const discountAmt = Number(item.discount_amount || 0);
      const lineNet = Math.max(0, lineTotal - discountAmt);
      
      subtotal += lineNet;
      total_cgst += lineNet * ((Number(item.cgst_percentage) || 0) / 100);
      total_sgst += lineNet * ((Number(item.sgst_percentage) || 0) / 100);
      total_igst += lineNet * ((Number(item.igst_percentage) || 0) / 100);
    }

    const overallDiscount = Number(purchaseData.discount_amount || 0);
    const rawTotal = subtotal + total_cgst + total_sgst + total_igst + Number(transport_cost) + Number(loading_cost) + Number(other_charges) - overallDiscount;
    const { round_off, grand_total } = applyRoundOff(rawTotal, true);
    if (Number(amount_paid) > grand_total) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: `Payment ₹${amount_paid} cannot exceed invoice total ₹${grand_total}`, field: 'amount_paid' };
    }

    let payment_status = 'Unpaid';
    if (amount_paid >= grand_total) payment_status = 'Paid';
    else if (amount_paid > 0) payment_status = 'Partial';

    // 3. Generate Invoice Number (Internal)
    const purchase_invoice_no = await generateInvoiceNo(conn, businessId, 'PO');
    const purchase_date = purchaseData.purchase_date || new Date().toISOString().slice(0, 10);

    // 4. Insert Purchase Main Record
    const [purchaseRes] = await conn.execute(
      `INSERT INTO purchases (
        business_id, supplier_id, purchase_invoice_no, supplier_invoice_no, purchase_date, payment_mode,
        transport_cost, transport_paid_by, transport_vehicle_no, transport_notes,
        loading_cost, other_charges, subtotal, total_cgst, total_sgst, total_igst,
        grand_total, amount_paid, payment_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        businessId, supplier_id, purchase_invoice_no, supplier_invoice_no, purchase_date, payment_mode,
        transport_cost, transport_paid_by, transport_vehicle_no, transport_notes,
        loading_cost, other_charges, subtotal, total_cgst, total_sgst, total_igst,
        grand_total, amount_paid, payment_status, notes
      ]
    );
    const purchaseId = purchaseRes.insertId;

    // 5. Insert Purchase Items and Stock Movements
    for (const item of items) {
      await conn.execute(
        `INSERT INTO purchase_items (
          purchase_id, product_id, quantity, free_quantity, purchase_price, selling_price,
          profit_percentage, discount_percentage, discount_amount, cgst_percentage,
          sgst_percentage, igst_percentage, total_tax, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchaseId, item.product_id, item.quantity, item.free_quantity || 0,
          item.purchase_price, item.selling_price || 0, item.profit_percentage || 0,
          item.discount_percentage || 0, item.discount_amount || 0,
          item.cgst_percentage || 0, item.sgst_percentage || 0, item.igst_percentage || 0,
          item.total_tax || 0, item._line_total
        ]
      );

      // Trigger trg_purchase_stock_update automatically updates products.current_stock
      // We must write the stock_movements audit log
      const qtyChange = Number(item.quantity) + Number(item.free_quantity || 0);
      const expectedStockAfter = round2(item._stock_before + qtyChange);
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
        ) VALUES (?, ?, 'Purchase In', 'purchases', ?, ?, ?, ?)`,
        [businessId, item.product_id, purchaseId, qtyChange, item._stock_before, stockAfter]
      );
      
      // Optionally update the product's default purchase price / selling price based on this latest purchase
      await conn.execute(
        'UPDATE products SET purchase_price = ?, selling_price = ? WHERE product_id = ? AND business_id = ?',
        [item.purchase_price, item.selling_price || item.purchase_price, item.product_id, businessId]
      );
    }

    // 6. Insert Payment Out and Day Book Entry
    if (amount_paid > 0) {
      const cash_out = ['Cash'].includes(payment_mode) ? amount_paid : 0;
      const bank_out = !['Cash', 'Credit'].includes(payment_mode) ? amount_paid : 0;
      const [paymentRes] = await conn.execute(
        `INSERT INTO payment_out (
          business_id, supplier_id, purchase_id, payment_date,
          payment_mode, amount, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          businessId, supplier_id, purchaseId, purchase_date,
          payment_mode, amount_paid, notes || `Payment for Purchase PO ${purchase_invoice_no}`
        ]
      );

      await conn.execute(
        `INSERT INTO day_book (
          business_id, entry_date, entry_type, reference_type, reference_id,
          cash_out, bank_out, payment_mode, description
        ) VALUES (?, ?, 'Payment Out', 'payment_out', ?, ?, ?, ?, ?)`,
        [
          businessId, purchase_date, paymentRes.insertId, cash_out, bank_out, payment_mode, 
          `Payment for Purchase PO ${purchase_invoice_no}`
        ]
      );
    }

    return { purchase_id: purchaseId, purchase_invoice_no, grand_total, payment_status };
  });
}

export async function deletePurchase(pool, businessId, purchaseId) {
  return withTransaction(pool, async (conn) => {
    // 1. Lock the purchase record to prevent race conditions
    const [purchases] = await conn.execute(
      'SELECT purchase_id, purchase_invoice_no, grand_total, deleted_at FROM purchases WHERE purchase_id = ? AND business_id = ? FOR UPDATE',
      [purchaseId, businessId]
    );
    if (!purchases.length) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Purchase not found' };
    }
    const purchase = purchases[0];
    if (purchase.deleted_at) {
      return { success: true, message: 'Purchase already deleted' };
    }

    // 2. Lock and retrieve purchase items
    const [items] = await conn.execute(
      'SELECT product_id, quantity, free_quantity FROM purchase_items WHERE purchase_id = ?',
      [purchaseId]
    );

    // 3. Deduct stock for products in the purchase (verify negative stock cap)
    for (const item of items) {
      if (item.product_id) {
        // Lock product
        const [prods] = await conn.execute(
          'SELECT product_id, current_stock, allow_negative_stock, product_name FROM products WHERE product_id = ? AND business_id = ? FOR UPDATE',
          [item.product_id, businessId]
        );
        if (prods.length > 0) {
          const product = prods[0];
          const stockBefore = Number(product.current_stock);
          const quantityToDeduct = Number(item.quantity) + Number(item.free_quantity || 0);
          const stockAfter = stockBefore - quantityToDeduct;

          // Prevent negative stock if allow_negative_stock is false
          if (!product.allow_negative_stock && stockAfter < 0) {
            throw {
              status: 422,
              code: 'INSUFFICIENT_STOCK',
              message: `Cannot delete purchase. Deducting ${quantityToDeduct} units of ${product.product_name} would result in negative stock. Current stock is ${stockBefore}.`
            };
          }

          // Update product stock
          await conn.execute(
            'UPDATE products SET current_stock = ? WHERE product_id = ? AND business_id = ?',
            [stockAfter, item.product_id, businessId]
          );

          // Write a stock movement audit log for the cancellation/reversal
          await conn.execute(
            `INSERT INTO stock_movements (
              business_id, product_id, movement_type, reference_type, reference_id, quantity, stock_before, stock_after, notes
            ) VALUES (?, ?, 'Manual Adjustment', 'purchases', ?, ?, ?, ?, ?)`,
            [
              businessId, item.product_id, purchaseId,
              quantityToDeduct,
              stockBefore, stockAfter,
              `Reversal due to deletion of purchase PO ${purchase.purchase_invoice_no}`
            ]
          );
        }
      }
    }

    // 4. Retrieve linked payment_out records to clear their day_book entries
    const [payments] = await conn.execute(
      'SELECT payment_out_id FROM payment_out WHERE purchase_id = ? AND business_id = ?',
      [purchaseId, businessId]
    );
    if (payments.length > 0) {
      const paymentIds = payments.map(p => p.payment_out_id);
      const placeholders = paymentIds.map(() => '?').join(',');
      await conn.execute(
        `DELETE FROM day_book WHERE reference_type = 'payment_out' AND reference_id IN (${placeholders}) AND business_id = ?`,
        [...paymentIds, businessId]
      );
      await conn.execute(
        `DELETE FROM payment_out WHERE purchase_id = ? AND business_id = ?`,
        [purchaseId, businessId]
      );
    }

    // 5. Remove linked daybook entries
    await conn.execute(
      "DELETE FROM day_book WHERE reference_type = 'purchases' AND reference_id = ? AND business_id = ?",
      [purchaseId, businessId]
    );

    // 6. Mark the purchase as deleted
    await conn.execute(
      'UPDATE purchases SET deleted_at = NOW() WHERE purchase_id = ? AND business_id = ?',
      [purchaseId, businessId]
    );

    return { success: true, message: 'Purchase deleted successfully' };
  });
}
