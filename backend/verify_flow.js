import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const BASE_URL = 'http://localhost:3000';

async function testRequest(endpoint, method = 'GET', body = null, headers = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Request to ${endpoint} failed with status ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function verifyFlow() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('STARTING V3 MULTI-TENANT END-TO-END VERIFICATION FLOW');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // STEP 1: Verify Health Check Route
  console.log('[Step 1] Hitting GET /api/health to verify master DB & 12 tables...');
  const health = await testRequest('/api/health');
  console.log('Health check response:', health);
  if (health.status !== 'ok') {
    throw new Error(`Health check is degraded: ${JSON.stringify(health)}`);
  }
  console.log('✓ Health check is healthy and all 12 master tables exist!\n');

  // Generate unique credentials for this run
  const timestamp = Date.now();
  const email = `test_owner_${timestamp}@bizbytech.in`;
  const password = `testPassword123!`;
  const name = `V3 Owner ${timestamp}`;
  const businessName = `V3 Retailer ${timestamp}`;
  const phone = `999${String(timestamp).slice(-7)}`;

  // EMULATE MILESWEB MANUAL PROVISIONING: Pre-create the database before calling register API
  console.log('[Step 1b] Emulating MilesWeb manual DB creation for the next tenant...');
  const verifyPool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: process.env.MYSQL_SSL === 'false' ? undefined : { rejectUnauthorized: false }
  });
  const [autoIncRows] = await verifyPool.execute(`
    SELECT AUTO_INCREMENT
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = 'businesses'
  `, [process.env.MYSQL_DATABASE || 'SimpleBill']);
  const nextBizId = autoIncRows[0]?.AUTO_INCREMENT || 1;
  const tempDbName = `uvuytecv_biz_${nextBizId}_db`;
  await verifyPool.execute(`CREATE DATABASE IF NOT EXISTS \`${tempDbName}\``);
  await verifyPool.end();
  console.log(`✓ Pre-created database \`${tempDbName}\` manually on MySQL Server!\n`);

  // STEP 2: Register a new user & business
  console.log(`[Step 2] Registering new user: ${email}...`);
  const registrationBody = {
    email,
    password,
    name,
    phone,
    businessName,
    licenseKey: `SB-PRO-${timestamp}`
  };
  const regResult = await testRequest('/api/v1/auth/register', 'POST', registrationBody);
  console.log('Registration response:', regResult);
  const businessId = regResult.data.business_id;
  const dbName = regResult.data.db_name;
  console.log(`✓ Registration succeeded! Business ID: ${businessId}, Tenant DB: ${dbName}\n`);

  // STEP 3: Log in to get the Access Token
  console.log('[Step 3] Logging in to get access token...');
  const loginBody = { email, password };
  const loginResult = await testRequest('/api/v1/auth/login', 'POST', loginBody);
  console.log('Login response businesses list:', loginResult.data.businesses);
  const accessToken = loginResult.data.access_token;
  const authHeaders = {
    'Authorization': `Bearer ${accessToken}`,
    'X-Business-Id': String(businessId)
  };
  console.log('✓ Login succeeded and access token received!\n');

  // STEP 4: Create a Customer
  console.log('[Step 4] Creating a Customer in the isolated tenant DB...');
  const customerBody = {
    customer_name: 'John Doe V3',
    phone: `987${String(timestamp).slice(-7)}`,
    email: 'johndoe@v3.com',
    customer_type: 'Retail Customer'
  };
  const customerResult = await testRequest(`/api/v1/b/${businessId}/customers`, 'POST', customerBody, authHeaders);
  console.log('Customer creation response:', customerResult);
  const customerId = customerResult.data.customer_id;
  console.log(`✓ Customer created! Customer ID: ${customerId}\n`);

  // STEP 5: Create a Product
  console.log('[Step 5] Creating a Product in the isolated tenant DB...');
  const productBody = {
    product_name: 'V3 Premium Soap',
    purchase_price: 10.00,
    selling_price: 15.00,
    current_stock: 100.00,
    minimum_stock_alert: 5.00
  };
  const productResult = await testRequest(`/api/v1/b/${businessId}/products`, 'POST', productBody, authHeaders);
  console.log('Product creation response:', productResult);
  const productId = productResult.data.product_id;
  console.log(`✓ Product created! Product ID: ${productId}\n`);

  // STEP 6: Create a Sale
  console.log('[Step 6] Creating a Sale (reducing stock)...');
  const saleBody = {
    invoice_date: new Date().toISOString().slice(0, 10),
    payment_mode: 'Cash',
    amount_received: 15.00,
    subtotal: 15.00,
    grand_total: 15.00,
    customer_id: customerId,
    items: [
      {
        product_id: productId,
        quantity: 1,
        selling_price: 15.00,
        purchase_price: 10.00,
        total_amount: 15.00
      }
    ]
  };
  const saleResult = await testRequest(`/api/v1/b/${businessId}/sales`, 'POST', saleBody, authHeaders);
  console.log('Sale creation response:', saleResult);
  console.log('✓ Sale recorded successfully!\n');

  // STEP 7: Verify Stock Updates & Day Book Entries (Triggers & Stock verification)
  console.log('[Step 7] Verifying current stock was decremented from 100 to 99 via triggers...');
  const productInfo = await testRequest(`/api/v1/b/${businessId}/products/${productId}`, 'GET', null, authHeaders);
  console.log('Product Info (Stock Verification):', productInfo.data);
  const currentStock = Number(productInfo.data.current_stock);
  if (currentStock !== 99) {
    throw new Error(`Expected current stock to be 99, but got: ${currentStock}`);
  }
  console.log('✓ Trigger verification succeeded! Stock is exactly 99.\n');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('ALL V3 MULTI-TENANT VERIFICATION FLOWS COMPLETED SUCCESSFULLY! ✓');
  console.log('═══════════════════════════════════════════════════════════════════');
}

verifyFlow().catch(err => {
  console.error('\n❌ VERIFICATION FLOW FAILED:', err);
  process.exit(1);
});
