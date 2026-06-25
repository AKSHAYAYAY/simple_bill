import { withTransaction } from '../utils/transaction.js';
import { generateInvoiceNo } from '../utils/invoiceNumber.js';
import { calculateItemTax, applyRoundOff, round2 } from '../utils/taxCalculator.js';

export async function createSale(pool, businessId, saleData) {
  return withTransaction(pool, async (conn) => {
    let {
      customer_id, new_customer, items, sale_type = 'Normal Sale', payment_mode = 'Cash',
      discount_amount = 0, transport_cost = 0, delivery_charge = 0,
      delivery_paid_by = 'Customer', delivery_vehicle_no = null,
      delivery_notes = null, round_off_enabled = true, amount_received = 0,
      notes = null, invoice_date: invoice_date_input = null
    } = saleData;

    // Auto-create customer if inline new_customer data is supplied and no customer_id given
    if (!customer_id && new_customer && new_customer.customer_name) {
      const [custRes] = await conn.execute(
        `INSERT INTO customers (
          business_id, customer_name, company_name, gst_number, customer_type,
          phone, alternate_phone, email, address, city, state, pincode,
          opening_balance, opening_balance_type, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          businessId,
          new_customer.customer_name,
          new_customer.company_name || null,
          new_customer.gst_number || null,
          new_customer.customer_type || 'Retail',
          new_customer.phone || null,
          new_customer.alternate_phone || null,
          new_customer.email || null,
          new_customer.address || null,
          new_customer.city || null,
          new_customer.state || null,
          new_customer.pincode || null,
          new_customer.opening_balance || 0,
          new_customer.opening_balance_type || 'To Receive',
          1
        ]
      );
      customer_id = custRes.insertId;
    }

    // 1. Validate Stock for all items
    for (const [i, item] of items.entries()) {
      if (!item.product_id) continue; // Custom item, no stock check

      const [rows] = await conn.execute(
        'SELECT current_stock, allow_negative_stock, product_name, purchase_price FROM products WHERE product_id = ? AND business_id = ? FOR UPDATE',
        [item.product_id, businessId]
      );
      if (!rows.length) throw { status: 404, code: 'PRODUCT_NOT_FOUND', message: `Product ID ${item.product_id} not found` };
      
      const product = rows[0];
      if (!product.allow_negative_stock && product.current_stock < item.quantity) {
        throw {
          status: 422,
          code: 'INSUFFICIENT_STOCK',
          message: `${product.product_name} has only ${product.current_stock} units. Requested: ${item.quantity}`,
          field: `items[${i}].quantity`
        };
      }
      
      // Store current stock and purchase price for logic later
      item._stock_before = Number(product.current_stock);
      item._purchase_price = Number(product.purchase_price || 0);
    }

    // 2. Calculate Totals (Mocking tax calculator logic based on payload)
    let subtotal = 0;
    let total_cgst = 0;
    let total_sgst = 0;
    let total_igst = 0;

    for (const item of items) {
      const lineTotal = Number(item.selling_price) * Number(item.quantity);
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

    const overallDiscount = Number(discount_amount || 0);
    const rawTotal = subtotal + total_cgst + total_sgst + total_igst + Number(transport_cost) + Number(delivery_charge) - overallDiscount;
    const { round_off, grand_total } = applyRoundOff(rawTotal, round_off_enabled);

    if (Number(amount_received) > grand_total) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: `Payment ₹${amount_received} cannot exceed invoice total ₹${grand_total}`, field: 'amount_received' };
    }

    let payment_status = 'Unpaid';
    if (amount_received >= grand_total) payment_status = 'Paid';
    else if (amount_received > 0) payment_status = 'Partial';

    // 3. Generate Invoice Number
    const invoice_no = await generateInvoiceNo(conn, businessId, 'INV');
    // Use the date supplied by the frontend (allows backdating); fall back to today
    const invoice_date = invoice_date_input || new Date().toISOString().slice(0, 10);

    // 4. Insert Sale Main Record
    const [saleRes] = await conn.execute(
      `INSERT INTO sales (
        business_id, customer_id, invoice_no, invoice_date, sale_type, payment_mode,
        subtotal, total_cgst, total_sgst, total_igst, discount_amount, transport_cost,
        delivery_charge, delivery_paid_by, delivery_vehicle_no, delivery_notes,
        round_off, grand_total, amount_received, payment_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        businessId, customer_id || null, invoice_no, invoice_date, sale_type, payment_mode,
        subtotal, total_cgst, total_sgst, total_igst, discount_amount, transport_cost,
        delivery_charge, delivery_paid_by, delivery_vehicle_no, delivery_notes,
        round_off, grand_total, amount_received, payment_status, notes
      ]
    );
    const saleId = saleRes.insertId;

    // 5. Insert Sale Items and Stock Movements
    for (const item of items) {
      const itemPurchasePrice = (item.purchase_price !== undefined && item.purchase_price !== null && Number(item.purchase_price) > 0)
        ? Number(item.purchase_price)
        : (item._purchase_price || 0);

      await conn.execute(
        `INSERT INTO sale_items (
          sale_id, product_id, item_name, quantity, free_quantity, selling_price, purchase_price,
          cgst_percentage, sgst_percentage, igst_percentage, discount_percentage, discount_amount,
          total_tax, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          saleId, item.product_id || null, item.item_name || null, item.quantity, 0,
          item.selling_price, itemPurchasePrice, item.cgst_percentage || 0, item.sgst_percentage || 0,
          item.igst_percentage || 0, item.discount_percentage || 0, item.discount_amount || 0,
          item.total_tax || 0, item._line_total
        ]
      );

      if (item.product_id) {
        // Trigger trg_sale_stock_deduct will automatically update current_stock in DB
        // But we must write the stock_movements audit log
        const expectedStockAfter = round2(item._stock_before - Number(item.quantity));
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
          ) VALUES (?, ?, 'Sale Out', 'sales', ?, ?, ?, ?)`,
          [
            businessId, item.product_id, saleId, 
            Number(item.quantity), 
            item._stock_before, stockAfter
          ]
        );
      }
    }

    // 6. Insert Payment In and Day Book Entry
    if (amount_received > 0) {
      const cash_in = ['Cash'].includes(payment_mode) ? amount_received : 0;
      const bank_in = !['Cash', 'Credit'].includes(payment_mode) ? amount_received : 0;

      const [paymentRes] = await conn.execute(
        `INSERT INTO payment_in (
          business_id, customer_id, sale_id, payment_date,
          payment_mode, amount, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          businessId, customer_id || null, saleId, invoice_date,
          payment_mode, amount_received, notes || `Payment for Sale Invoice ${invoice_no}`
        ]
      );

      await conn.execute(
        `INSERT INTO day_book (
          business_id, entry_date, entry_type, reference_type, reference_id,
          cash_in, bank_in, payment_mode, description
        ) VALUES (?, ?, 'Payment In', 'payment_in', ?, ?, ?, ?, ?)`,
        [
          businessId, invoice_date, paymentRes.insertId, cash_in, bank_in, payment_mode, 
          `Payment for Sale Invoice ${invoice_no}`
        ]
      );
    }

    return { sale_id: saleId, invoice_no, grand_total, payment_status };
  });
}

export async function deleteSale(pool, businessId, saleId) {
  return withTransaction(pool, async (conn) => {
    // 1. Lock the sale record to prevent race conditions
    const [sales] = await conn.execute(
      'SELECT sale_id, invoice_no, grand_total, deleted_at FROM sales WHERE sale_id = ? AND business_id = ? FOR UPDATE',
      [saleId, businessId]
    );
    if (!sales.length) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Sale not found' };
    }
    const sale = sales[0];
    if (sale.deleted_at) {
      return { success: true, message: 'Sale already deleted' };
    }

    // 2. Lock and retrieve sale items
    const [items] = await conn.execute(
      'SELECT product_id, quantity FROM sale_items WHERE sale_id = ?',
      [saleId]
    );

    // 3. Revert stock for products in the sale
    for (const item of items) {
      if (item.product_id) {
        // Lock product
        const [prods] = await conn.execute(
          'SELECT product_id, current_stock, product_name FROM products WHERE product_id = ? AND business_id = ? FOR UPDATE',
          [item.product_id, businessId]
        );
        if (prods.length > 0) {
          const product = prods[0];
          const stockBefore = Number(product.current_stock);
          const quantityToRestore = Number(item.quantity);
          const stockAfter = stockBefore + quantityToRestore;

          // Update product stock
          await conn.execute(
            'UPDATE products SET current_stock = ? WHERE product_id = ? AND business_id = ?',
            [stockAfter, item.product_id, businessId]
          );

          // Write a stock movement audit log for the cancellation/reversal
          await conn.execute(
            `INSERT INTO stock_movements (
              business_id, product_id, movement_type, reference_type, reference_id, quantity, stock_before, stock_after, notes
            ) VALUES (?, ?, 'Manual Adjustment', 'sales', ?, ?, ?, ?, ?)`,
            [
              businessId, item.product_id, saleId,
              quantityToRestore,
              stockBefore, stockAfter,
              `Reversal due to deletion of invoice ${sale.invoice_no}`
            ]
          );
        }
      }
    }

    // 4. Retrieve linked payment_in records to clear their day_book entries
    const [payments] = await conn.execute(
      'SELECT payment_in_id FROM payment_in WHERE sale_id = ? AND business_id = ?',
      [saleId, businessId]
    );
    if (payments.length > 0) {
      const paymentIds = payments.map(p => p.payment_in_id);
      const placeholders = paymentIds.map(() => '?').join(',');
      await conn.execute(
        `DELETE FROM day_book WHERE reference_type = 'payment_in' AND reference_id IN (${placeholders}) AND business_id = ?`,
        [...paymentIds, businessId]
      );
      await conn.execute(
        `DELETE FROM payment_in WHERE sale_id = ? AND business_id = ?`,
        [saleId, businessId]
      );
    }

    // 4.5. Remove any legacy daybook entries created with reference_type 'sales'
    await conn.execute(
      "DELETE FROM day_book WHERE reference_type = 'sales' AND reference_id = ? AND business_id = ?",
      [saleId, businessId]
    );

    // 6. Mark the sale as deleted
    await conn.execute(
      'UPDATE sales SET deleted_at = NOW() WHERE sale_id = ? AND business_id = ?',
      [saleId, businessId]
    );

    return { success: true, message: 'Sale deleted successfully' };
  });
}
