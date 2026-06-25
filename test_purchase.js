import { pool } from './backend/src/db/pool.js';
import { createPurchase } from './backend/src/services/purchase.service.js';

async function run() {
  const businessId = 1; // Assuming 1
  try {
    const [products] = await pool.execute('SELECT product_id FROM products WHERE business_id = ? LIMIT 1', [businessId]);
    if (!products.length) {
      console.log('No products found for business 1. Inserting one...');
      const [res] = await pool.execute('INSERT INTO products (business_id, product_name) VALUES (?, ?)', [businessId, 'Test Product']);
      products.push({ product_id: res.insertId });
    }
    const productId = products[0].product_id;

    const purchaseData = {
      supplier_id: 0,
      new_supplier: {
        supplier_name: 'Test Supplier ' + Date.now()
      },
      items: [
        {
          product_id: productId,
          quantity: 1,
          purchase_price: 10
        }
      ]
    };

    console.log('Calling createPurchase...');
    const result = await createPurchase(pool, businessId, purchaseData);
    console.log('Success:', result);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}
run();
