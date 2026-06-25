import { withTransaction } from '../utils/transaction.js';
import { generateInvoiceNo } from '../utils/invoiceNumber.js';
import { round2 } from '../utils/taxCalculator.js';

export async function createSalesReturn(pool, businessId, returnData) {
  return withTransaction(pool, async (conn) => {
    const {
      customer_id, sale_id = null, return_invoice_no = null, return_date,
      payment_mode = 'Cash', refund_status = 'Pending', notes = null, items
    } = returnData;

    // 1. Validate and lock stock for products
    for (const item of items) {
      if (item.product_id) {
        const [rows] = await conn.execute(
          'SELECT current_stock FROM products WHERE product_id = ? AND business_id = ? FOR UPDATE',
          [item.product_id, businessId]
        );

        if (!rows.length) {
          throw { status: 404, code: 'PRODUCT_NOT_FOUND', message: `Product ID ${item.product_id} not found` };
        }
        
        item._stock_before = Number(rows[0].current_stock);
      }
    }

    // 2. Calculate Totals
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

    const overallDiscount = Number(returnData.discount_amount || 0);
    const grand_total = round2(subtotal + total_cgst + total_sgst + total_igst - overallDiscount);

    // 3. Generate Return Invoice Number if not provided
    const finalInvoiceNo = return_invoice_no || await generateInvoiceNo(conn, businessId, 'SR');

    // 4. Handle Refund & Offset Auto-Creation
    let final_refund_status = refund_status;
    let final_refund_amount = 0;
    let final_adjusted_sale_id = null;
    let payment_out_id = null;
    let actual_refund_cash_amount = 0;

    if (sale_id) {
      const [sales] = await conn.execute(
        'SELECT sale_id, invoice_no, grand_total, amount_received, payment_status FROM sales WHERE sale_id = ? AND business_id = ? AND deleted_at IS NULL FOR UPDATE',
        [sale_id, businessId]
      );

      if (sales.length > 0) {
        const sale = sales[0];
        const amount_paid_cash = Number(sale.amount_received || 0);
        const amount_outstanding = Math.max(Number(sale.grand_total || 0) - amount_paid_cash, 0);

        if (amount_outstanding > 0) {
          // Original Invoice is unpaid or partially paid
          if (refund_status === 'Refunded') {
            // Cash refund requested, but we cap it at what they actually paid in cash
            const cash_refund_amount = Math.min(grand_total, amount_paid_cash);
            const offset_amount = Math.max(grand_total - cash_refund_amount, 0);

            if (cash_refund_amount > 0) {
              const [paymentRes] = await conn.execute(
                `INSERT INTO payment_out (
                  business_id, supplier_id, customer_id, payment_date, payment_mode, amount, reference_no, notes
                ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
                [
                  businessId, customer_id || null, return_date, payment_mode, cash_refund_amount,
                  returnData.reference_no || null, `Refund for Sales Return ${finalInvoiceNo}`
                ]
              );
              payment_out_id = paymentRes.insertId;
              actual_refund_cash_amount = cash_refund_amount;
            }

            if (offset_amount > 0) {
              const new_amount_received = amount_paid_cash + offset_amount;
              const paymentStatus = new_amount_received >= Number(sale.grand_total) ? 'Paid' : 'Partial';

              await conn.execute(
                'UPDATE sales SET amount_received = ?, payment_status = ?, updated_at = NOW() WHERE sale_id = ?',
                [new_amount_received, paymentStatus, sale_id]
              );
            }

            final_refund_status = 'Adjusted';
            final_refund_amount = grand_total;
            final_adjusted_sale_id = sale_id;
          } else {
            // Default/Pending/Adjusted: Apply credit to offset outstanding balance on this invoice
            const offset_amount = Math.min(grand_total, amount_outstanding);
            const remaining_credit = Math.max(grand_total - offset_amount, 0);

            if (offset_amount > 0) {
              const new_amount_received = amount_paid_cash + offset_amount;
              const paymentStatus = new_amount_received >= Number(sale.grand_total) ? 'Paid' : 'Partial';

              await conn.execute(
                'UPDATE sales SET amount_received = ?, payment_status = ?, updated_at = NOW() WHERE sale_id = ?',
                [new_amount_received, paymentStatus, sale_id]
              );
            }

            if (remaining_credit === 0) {
              final_refund_status = 'Adjusted';
              final_refund_amount = grand_total;
              final_adjusted_sale_id = sale_id;
            } else {
              final_refund_status = 'Pending';
              final_refund_amount = offset_amount;
              final_adjusted_sale_id = sale_id;
            }
          }
        } else {
          // Original Invoice is fully paid
          if (refund_status === 'Refunded') {
            const [paymentRes] = await conn.execute(
              `INSERT INTO payment_out (
                business_id, supplier_id, customer_id, payment_date, payment_mode, amount, reference_no, notes
              ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
              [
                businessId, customer_id || null, return_date, payment_mode, grand_total,
                returnData.reference_no || null, `Refund for Sales Return ${finalInvoiceNo}`
              ]
            );
            payment_out_id = paymentRes.insertId;
            final_refund_amount = grand_total;
            actual_refund_cash_amount = grand_total;
          } else if (refund_status === 'Adjusted') {
            final_refund_amount = grand_total;
            final_adjusted_sale_id = returnData.adjusted_in_sale_id || null;
          } else {
            final_refund_amount = 0;
            final_adjusted_sale_id = null;
          }
        }
      }
    } else {
      // No sale_id provided (ad-hoc customer return)
      if (refund_status === 'Refunded') {
        const [paymentRes] = await conn.execute(
          `INSERT INTO payment_out (
            business_id, supplier_id, customer_id, payment_date, payment_mode, amount, reference_no, notes
          ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
          [
            businessId, customer_id || null, return_date, payment_mode, grand_total,
            returnData.reference_no || null, `Refund for Sales Return ${finalInvoiceNo}`
          ]
        );
        payment_out_id = paymentRes.insertId;
        final_refund_amount = grand_total;
        actual_refund_cash_amount = grand_total;
      } else if (refund_status === 'Adjusted') {
        final_refund_amount = grand_total;
        final_adjusted_sale_id = returnData.adjusted_in_sale_id || null;
      } else {
        final_refund_amount = 0;
        final_adjusted_sale_id = null;
      }
    }

    // 5. Insert Sales Return Main Record
    const [returnRes] = await conn.execute(
      `INSERT INTO sales_returns (
        business_id, customer_id, sale_id, return_invoice_no, return_date, payment_mode,
        subtotal, total_cgst, total_sgst, total_igst, grand_total, refund_amount, refund_status,
        payment_out_id, adjusted_in_sale_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        businessId, customer_id || null, sale_id, finalInvoiceNo, return_date, payment_mode,
        subtotal, total_cgst, total_sgst, total_igst, grand_total, final_refund_amount, final_refund_status,
        payment_out_id, final_adjusted_sale_id, notes
      ]
    );
    const returnId = returnRes.insertId;

    // 6. Insert Return Items and Stock Movements
    for (const item of items) {
      await conn.execute(
        `INSERT INTO sales_return_items (
          return_id, product_id, item_name, quantity, selling_price, purchase_price, cgst_percentage, sgst_percentage, igst_percentage, discount_percentage, total_tax, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          returnId, item.product_id || null, item.item_name || null, item.quantity, item.selling_price, item.purchase_price || 0,
          item.cgst_percentage || 0, item.sgst_percentage || 0, item.igst_percentage || 0, item.discount_percentage || 0,
          item.total_tax || 0, item._line_total
        ]
      );

      // Trigger trg_sale_return_stock_restore automatically increments products.current_stock
      // We must write the stock_movements audit log
      if (item.product_id) {
        const qtyReturned = Number(item.quantity);
        const expectedStockAfter = round2(item._stock_before + qtyReturned);
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
          ) VALUES (?, ?, 'Sale Return In', 'sales_returns', ?, ?, ?, ?)`,
          [businessId, item.product_id, returnId, qtyReturned, item._stock_before, stockAfter]
        );
      }
    }

    // 7. Insert Day Book Entry
    if (actual_refund_cash_amount > 0) {
      const cash_out = ['Cash'].includes(payment_mode) ? actual_refund_cash_amount : 0;
      const bank_out = !['Cash', 'Credit'].includes(payment_mode) ? actual_refund_cash_amount : 0;

      await conn.execute(
        `INSERT INTO day_book (
          business_id, entry_date, entry_type, reference_type, reference_id,
          cash_out, bank_out, payment_mode, description
        ) VALUES (?, ?, 'Sales Return', 'sales_returns', ?, ?, ?, ?, ?)`,
        [
          businessId, return_date, returnId, cash_out, bank_out, payment_mode, 
          `Refund for Sales Return ${finalInvoiceNo}`
        ]
      );
    }

    return { return_id: returnId, return_invoice_no: finalInvoiceNo, grand_total, refund_status: final_refund_status };
  });
}
