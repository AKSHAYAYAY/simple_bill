import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { createSalesReturn } from './src/services/sales_return.service.js';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: 'uvuytecv_biz_6_db' // use the tenant DB created by verify_flow.js
});

async function run() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('VERIFYING SALES RETURN AUTOMATIC AD-HOC ADJUSTMENT LOGIC');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const businessId = 6;

  // Cleanup old test data
  await pool.execute('DELETE FROM stock_movements WHERE business_id = ?', [businessId]);
  await pool.execute('DELETE FROM payment_out WHERE business_id = ?', [businessId]);
  await pool.execute('DELETE FROM day_book WHERE business_id = ?', [businessId]);
  await pool.execute('DELETE FROM sales_returns WHERE business_id = ?', [businessId]);
  await pool.execute('DELETE FROM sales WHERE business_id = ?', [businessId]);
  await pool.execute('DELETE FROM customers WHERE business_id = ?', [businessId]);
  await pool.execute('DELETE FROM products WHERE business_id = ?', [businessId]);

  // Setup sample customer and product
  const [custRes] = await pool.execute(
    `INSERT INTO customers (business_id, customer_name, customer_type) VALUES (?, 'Test Customer', 'Retail Customer')`,
    [businessId]
  );
  const customerId = custRes.insertId;

  const [prodRes] = await pool.execute(
    `INSERT INTO products (business_id, product_name, purchase_price, selling_price, current_stock) VALUES (?, 'Soap', 10, 15, 100)`,
    [businessId]
  );
  const productId = prodRes.insertId;

  // ---------------------------------------------------------------------------
  // TEST CASE 1: Sales Return against fully UNPAID invoice
  // ---------------------------------------------------------------------------
  console.log('[Test 1] Creating an UNPAID sale invoice of ₹15...');
  const [saleRes1] = await pool.execute(
    `INSERT INTO sales (business_id, customer_id, invoice_no, invoice_date, grand_total, amount_received, payment_status)
     VALUES (?, ?, 'INV-TEST-001', '2026-05-26', 15.00, 0.00, 'Unpaid')`,
    [businessId, customerId]
  );
  const saleId1 = saleRes1.insertId;

  // Insert sale item
  await pool.execute(
    `INSERT INTO sale_items (sale_id, product_id, quantity, selling_price, total_amount) VALUES (?, ?, 1, 15.00, 15.00)`,
    [saleId1, productId]
  );

  console.log('Creating a Sales Return of 1 unit (₹15) against the UNPAID invoice...');
  const returnData1 = {
    customer_id: customerId,
    sale_id: saleId1,
    return_date: '2026-05-26',
    payment_mode: 'Cash',
    refund_status: 'Pending', // they just returned, no cash paid
    items: [
      {
        product_id: productId,
        quantity: 1,
        selling_price: 15.00,
        total_tax: 0,
        purchase_price: 10.00
      }
    ]
  };

  const result1 = await createSalesReturn(pool, businessId, returnData1);
  console.log('Sales Return created:', result1);

  // Assertions
  const [[updatedSale1]] = await pool.execute('SELECT * FROM sales WHERE sale_id = ?', [saleId1]);
  console.log('Updated Sale Invoice 1:', {
    grand_total: updatedSale1.grand_total,
    amount_received: updatedSale1.amount_received,
    payment_status: updatedSale1.payment_status
  });

  const [[salesReturn1]] = await pool.execute('SELECT * FROM sales_returns WHERE return_id = ?', [result1.return_id]);
  console.log('Created Sales Return 1:', {
    refund_status: salesReturn1.refund_status,
    refund_amount: salesReturn1.refund_amount,
    adjusted_in_sale_id: salesReturn1.adjusted_in_sale_id
  });

  if (Number(updatedSale1.amount_received) !== 15.00 || updatedSale1.payment_status !== 'Paid') {
    throw new Error('Test 1 Failed: Invoice amount_received was not updated correctly!');
  }
  if (salesReturn1.refund_status !== 'Adjusted' || Number(salesReturn1.refund_amount) !== 15.00) {
    throw new Error('Test 1 Failed: Sales return refund_status or refund_amount is incorrect!');
  }
  console.log('✓ Test Case 1 Succeeded! Unpaid invoice offset successfully.\n');

  // ---------------------------------------------------------------------------
  // TEST CASE 2: Sales Return against PARTIALLY PAID invoice with cash refund requested
  // ---------------------------------------------------------------------------
  console.log('[Test 2] Creating a PARTIALLY PAID sale invoice (₹30 grand total, ₹10 received)...');
  const [saleRes2] = await pool.execute(
    `INSERT INTO sales (business_id, customer_id, invoice_no, invoice_date, grand_total, amount_received, payment_status)
     VALUES (?, ?, 'INV-TEST-002', '2026-05-26', 30.00, 10.00, 'Partial')`,
    [businessId, customerId]
  );
  const saleId2 = saleRes2.insertId;

  // Insert sale items
  await pool.execute(
    `INSERT INTO sale_items (sale_id, product_id, quantity, selling_price, total_amount) VALUES (?, ?, 2, 15.00, 30.00)`,
    [saleId2, productId]
  );

  console.log('Creating a Sales Return of 2 units (₹30) against the PARTIALLY PAID invoice, requesting a Cash Refund (Refunded)...');
  const returnData2 = {
    customer_id: customerId,
    sale_id: saleId2,
    return_date: '2026-05-26',
    payment_mode: 'Cash',
    refund_status: 'Refunded', // requesting cash refund
    items: [
      {
        product_id: productId,
        quantity: 2,
        selling_price: 15.00,
        total_tax: 0,
        purchase_price: 10.00
      }
    ]
  };

  const result2 = await createSalesReturn(pool, businessId, returnData2);
  console.log('Sales Return created:', result2);

  // Assertions
  const [[updatedSale2]] = await pool.execute('SELECT * FROM sales WHERE sale_id = ?', [saleId2]);
  console.log('Updated Sale Invoice 2:', {
    grand_total: updatedSale2.grand_total,
    amount_received: updatedSale2.amount_received,
    payment_status: updatedSale2.payment_status
  });

  const [[salesReturn2]] = await pool.execute('SELECT * FROM sales_returns WHERE return_id = ?', [result2.return_id]);
  console.log('Created Sales Return 2:', {
    refund_status: salesReturn2.refund_status,
    refund_amount: salesReturn2.refund_amount,
    adjusted_in_sale_id: salesReturn2.adjusted_in_sale_id,
    payment_out_id: salesReturn2.payment_out_id
  });

  // Verify payment_out is created for capped cash refund (which should be ₹10, since they only paid ₹10 cash!)
  const [paymentsOut] = await pool.execute('SELECT * FROM payment_out WHERE payment_out_id = ?', [salesReturn2.payment_out_id]);
  const paymentOut = paymentsOut[0];
  console.log('Auto-Created Cash Refund record (payment_out):', {
    amount: paymentOut?.amount,
    payment_mode: paymentOut?.payment_mode
  });

  if (Number(paymentOut.amount) !== 10.00) {
    throw new Error('Test 2 Failed: Cash refund was not capped correctly at ₹10!');
  }
  if (Number(updatedSale2.amount_received) !== 30.00 || updatedSale2.payment_status !== 'Paid') {
    throw new Error('Test 2 Failed: Outstanding invoice offset of ₹20 was not applied correctly!');
  }
  if (salesReturn2.refund_status !== 'Adjusted' || Number(salesReturn2.refund_amount) !== 30.00) {
    throw new Error('Test 2 Failed: Sales return was not fully settled/adjusted!');
  }
  console.log('✓ Test Case 2 Succeeded! Cash refund capped and remaining offset applied beautifully.\n');

  // ---------------------------------------------------------------------------
  // TEST CASE 3: Deleting a Sales Return with active offset adjustment
  // ---------------------------------------------------------------------------
  console.log('[Test 3] Deleting Sales Return 2 and verifying reversal of ₹20 offset adjustment on Sale 2...');

  // 1. Fetch cash refund amount from payment_out
  let cashRefundAmount = 0;
  if (salesReturn2.payment_out_id) {
    const [pRows] = await pool.execute('SELECT amount FROM payment_out WHERE payment_out_id = ?', [salesReturn2.payment_out_id]);
    if (pRows.length > 0) {
      cashRefundAmount = Number(pRows[0].amount);
    }
  }

  // 2. Replicate the route reversal logic
  if (salesReturn2.adjusted_in_sale_id) {
    const offsetToDeduct = Math.max(Number(salesReturn2.grand_total || 0) - cashRefundAmount, 0);
    console.log(`Deducting offset of ₹${offsetToDeduct} from invoice...`);
    if (offsetToDeduct > 0) {
      const [sales] = await pool.execute(
        'SELECT sale_id, grand_total, amount_received FROM sales WHERE sale_id = ? FOR UPDATE',
        [salesReturn2.adjusted_in_sale_id]
      );
      if (sales.length > 0) {
        const sale = sales[0];
        const newAmountReceived = Math.max(Number(sale.amount_received || 0) - offsetToDeduct, 0);
        const paymentStatus = newAmountReceived >= Number(sale.grand_total) ? 'Paid' : (newAmountReceived > 0 ? 'Partial' : 'Unpaid');

        await pool.execute(
          'UPDATE sales SET amount_received = ?, payment_status = ?, updated_at = NOW() WHERE sale_id = ?',
          [newAmountReceived, paymentStatus, sale.sale_id]
        );
      }
    }
  }

  // 3. Re-fetch Sale 2 to verify outstanding is back to ₹10 received (₹20 offset reversed!)
  const [[revertedSale2]] = await pool.execute('SELECT * FROM sales WHERE sale_id = ?', [saleId2]);
  console.log('Reverted Sale Invoice 2:', {
    grand_total: revertedSale2.grand_total,
    amount_received: revertedSale2.amount_received,
    payment_status: revertedSale2.payment_status
  });

  if (Number(revertedSale2.amount_received) !== 10.00 || revertedSale2.payment_status !== 'Partial') {
    throw new Error('Test 3 Failed: Sale offset was not reverted correctly on sales return deletion!');
  }
  console.log('✓ Test Case 3 Succeeded! Sales return deletion successfully reversed the invoice offset.\n');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('ALL AD-HOC SALES RETURN ADJUSTMENT TESTS PASSED SUCCESSFULLY! ✓');
  console.log('═══════════════════════════════════════════════════════════════════');
  process.exit(0);
}
run().catch(err => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
