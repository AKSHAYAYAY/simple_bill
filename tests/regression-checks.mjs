import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('data service saves customers and invoices through current API flow', async () => {
  const source = await read('services/dataService.ts');
  assert.match(source, /await v3Request\('\/b\/1\/sales', 'POST', saleData\)/, 'saveInvoice should post to V3 sales API');
  assert.match(source, /await v3Request\('\/b\/1\/customers', 'POST', v3Data\)/, 'saveCustomer should post to V3 customers API');
});

test('register view always renders editable license input without config button exposure', async () => {
  const source = await read('pages/Login.tsx');
  assert.match(source, /placeholder="Activation \/ License Key"/, 'license input should exist in register form');
  assert.doesNotMatch(source, /Server Connection Settings/, 'customer registration page should not expose server settings access');
  assert.doesNotMatch(source, /view === 'config'/, 'config view should not be part of customer login/register flow');
});

test('API bridge supports plural save action pattern', async () => {
  const source = await read('api/index.js');
  assert.match(source, /if \(action\.startsWith\('save_'\)\)/, 'save action router should exist');
  assert.match(source, /\['invoices', 'customers'\]/, 'save action router should explicitly allow invoices and customers tables');
});

test('admin dashboard provides bridge config management actions', async () => {
  const source = await read('pages/AdminDashboard.tsx');
  assert.match(source, /handleSaveBridgeConfig/, 'admin dashboard should support saving bridge config');
  assert.match(source, /handleVerifyBridgeConnection/, 'admin dashboard should support verification action');
  assert.match(source, /Bridge Configuration \(Admin Only\)/, 'admin-only bridge config section should be present');
});


test('admin API exposes production metrics and resilient bootstrap tables', async () => {
  const source = await read('api/index.js');
  assert.match(source, /admin_get_metrics/, 'admin metrics action should be available');
  assert.match(source, /CREATE TABLE IF NOT EXISTS saas_plans/, 'global bootstrap should include plans table');
  assert.match(source, /CREATE TABLE IF NOT EXISTS saas_payments/, 'global bootstrap should include payments table');
  assert.match(source, /CREATE TABLE IF NOT EXISTS saas_login_activity/, 'global bootstrap should include tenant activity table');
});

test('inventory stock edits happen through product form only', async () => {
  const inventory = await read('pages/Inventory.tsx');
  const productsRoute = await read('backend/src/routes/products.js');
  assert.doesNotMatch(inventory, /handleOpenAdjustStock|handleAdjustStockSubmit|adjustProductStock/, 'manual stock adjustment UI should be removed');
  assert.match(inventory, />Current Stock</, 'product edit form should expose current stock');
  assert.match(productsRoute, /current_stock = \?/, 'product update API should persist current_stock edits');
});

test('supplier form uses shared phone and GST inputs without 10 digit cap', async () => {
  const suppliers = await read('pages/Suppliers.tsx');
  const phoneInput = await read('components/PhoneInput.tsx');
  assert.match(suppliers, /<PhoneInput/, 'supplier form should use shared PhoneInput');
  assert.match(suppliers, /<GSTInput/, 'supplier form should use shared GSTInput');
  assert.doesNotMatch(suppliers, /must be exactly 10 digits|substring\(0,\s*10\)/, 'supplier form should not enforce a 10 digit phone cap');
  assert.doesNotMatch(phoneInput, /maxLength=\{10\}|slice\(0,\s*10\)|pattern="\[0-9\]\{10\}"/, 'shared PhoneInput should not hard-code 10 digits');
});

test('invoice form removes free quantity and stores editable purchase price plus transport cost', async () => {
  const invoices = await read('pages/Invoices.tsx');
  const dataService = await read('services/dataService.ts');
  const pdf = await read('components/InvoicePDF.tsx');
  assert.doesNotMatch(invoices, /Free Qty|Free Quantity|freeQuantity/, 'invoice form should not expose free quantity');
  assert.doesNotMatch(pdf, /Free Qty|freeQuantity/, 'invoice PDF should not expose free quantity');
  assert.match(invoices, /Cost Price/, 'invoice form should expose cost price per item');
  assert.match(dataService, /purchase_price: Number\(item\.purchasePrice/, 'invoice save should send sale_items.purchase_price');
  assert.match(invoices, /Transport Cost/, 'invoice form should label transport cost in the totals area');
  assert.match(dataService, /transport_cost: Number\(invoice\.freightCharges/, 'invoice save should send transport_cost');
});

test('purchase save preserves partial payment and creates payment out record', async () => {
  const dataService = await read('services/dataService.ts');
  const purchaseService = await read('backend/src/services/purchase.service.js');
  assert.match(dataService, /const amountPaid = Number\(purchase\.amount_paid \?\? purchase\.paid_amount \?\? 0\)/, 'frontend should send entered amount_paid');
  assert.match(purchaseService, /if \(amount_paid >= grand_total\) payment_status = 'Paid'/, 'backend should mark paid when amount covers total');
  assert.match(purchaseService, /else if \(amount_paid > 0\) payment_status = 'Partial'/, 'backend should mark partial when amount is positive');
  assert.match(purchaseService, /INSERT INTO payment_out/, 'backend should insert payment_out for paid purchase amount');
});

test('profit percentages return N/A when denominator is not valid', async () => {
  const reportsRoute = await read('backend/src/routes/reports.js');
  const reportsPage = await read('pages/Reports.tsx');
  assert.match(reportsRoute, /WHEN p\.purchase_price IS NULL OR p\.purchase_price = 0 THEN NULL/, 'fast moving margin should be null when cost is zero');
  assert.match(reportsRoute, /WHEN SUM\(si\.total_amount\) IS NULL OR SUM\(si\.total_amount\) = 0 THEN NULL/, 'profitability margin should be null when revenue is zero');
  assert.match(reportsPage, /return Number\.isFinite\(num\) \? `\$\{num\}%` : 'N\/A'/, 'reports UI should render invalid percentages as N/A');
});
