import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { logger } from './services/logger.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { customerRouter } from './routes/customers.js';
import { invoiceRouter } from './routes/invoices.js';
import { requireAuth } from './middleware/auth.js';
import { requireTenant } from './middleware/tenant.js';
import { resolveBusiness } from './middleware/business.js';
import { categoryRouter } from './routes/categories.js';
import { unitRouter } from './routes/units.js';
import { productRouter } from './routes/products.js';
import { saleRouter } from './routes/sales.js';
import { supplierRouter } from './routes/suppliers.js';
import { purchaseRouter } from './routes/purchases.js';
import { purchaseReturnRouter } from './routes/purchase_returns.js';
import { salesReturnRouter } from './routes/sales_returns.js';
import { paymentRouter } from './routes/payments.js';
import { daybookRouter } from './routes/daybook.js';
import { businessUserRouter } from './routes/users.js';
import { expenseRouter } from './routes/expenses.js';
import { incomeRouter } from './routes/incomes.js';
import { partyLedgerRouter } from './routes/party_ledger.js';
import { businessRouter } from './routes/businesses.js';
import { reportsRouter } from './routes/reports.js';
import legacyHandler from './legacy_bridge.js';
import { provisionTenantDatabase } from './utils/provisionTenant.js';
import { masterPool } from './db/ConnectionManager.js';
import bcrypt from 'bcryptjs';
import { ensureMasterTables } from './db/masterInit.js';
const app = express();

// Path normalization for Vercel serverless environment
app.use((req, res, next) => {
  if (req.query && req.query.catchall) {
    const segments = Array.isArray(req.query.catchall) ? req.query.catchall.join('/') : req.query.catchall;
    const search = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    req.url = '/api/' + segments + search;
  } else if (req.url) {
    req.url = req.url.replace(/^\/api\/index\.js/, '').replace(/^\/index\.js/, '');
    if (!req.url.startsWith('/api')) {
      req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
  }
  next();
});

app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '1mb' }));
const authRateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const appRateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use('/api/v1/auth', authRateLimiter);
app.use('/api/v1/b/:businessId', appRateLimiter);

// Mount legacy bridge to support existing frontend - strictly POST requests to exact /api
app.post('/api', (req, res, next) => {
  // Absolute protection: If it's a V3 REST request, completely bypass the legacy action handler
  if (req.originalUrl && req.originalUrl.includes('/v1/')) return next();
  if (req.url && req.url.includes('/v1/')) return next();

  return legacyHandler(req, res, next);
});

app.get('/api/health', async (req, res) => {
  try {
    // Check master DB
    await masterPool.execute('SELECT 1');

    // Check the 12 required tables exist
    const [tables] = await masterPool.execute(
      `SELECT TABLE_NAME FROM information_schema.tables
       WHERE table_schema = DATABASE()`
    );
    const tableNames = tables.map(t => t.TABLE_NAME || t.table_name);
    const required = [
      'app_users', 'businesses', 'business_users',
      'master_users_registry', 'saas_user_profiles', 'saas_app_settings',
      'saas_plans', 'saas_payments', 'saas_login_activity',
      'saas_license_keys', 'saas_contact_messages', 'saas_error_logs'
    ];
    const missing = required.filter(t => !tableNames.includes(t));

    res.json({
      status: missing.length === 0 ? 'ok' : 'degraded',
      master_db: 'connected',
      missing_tables: missing,
      table_count: tableNames.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/invoices', requireAuth, requireTenant, invoiceRouter);

// New V3 Business Routes
app.use('/api/v1/b/:businessId/categories', requireAuth, resolveBusiness, categoryRouter);
app.use('/api/v1/b/:businessId/units', requireAuth, resolveBusiness, unitRouter);
app.use('/api/v1/b/:businessId/products', requireAuth, resolveBusiness, productRouter);
app.use('/api/v1/b/:businessId/sales', requireAuth, resolveBusiness, saleRouter);
app.use('/api/v1/b/:businessId/suppliers', requireAuth, resolveBusiness, supplierRouter);
app.use('/api/v1/b/:businessId/purchases', requireAuth, resolveBusiness, purchaseRouter);
app.use('/api/v1/b/:businessId/purchase-returns', requireAuth, resolveBusiness, purchaseReturnRouter);
app.use('/api/v1/b/:businessId/sales-returns', requireAuth, resolveBusiness, salesReturnRouter);
app.use('/api/v1/b/:businessId/payments', requireAuth, resolveBusiness, paymentRouter);
app.use('/api/v1/b/:businessId/daybook', requireAuth, resolveBusiness, daybookRouter);
app.use('/api/v1/b/:businessId/users', requireAuth, resolveBusiness, businessUserRouter);
app.use('/api/v1/b/:businessId/expenses', requireAuth, resolveBusiness, expenseRouter);
app.use('/api/v1/b/:businessId/incomes', requireAuth, resolveBusiness, incomeRouter);
app.use('/api/v1/b/:businessId/customers', requireAuth, resolveBusiness, customerRouter);
app.use('/api/v1/b/:businessId/party-ledger', requireAuth, resolveBusiness, partyLedgerRouter);
app.use('/api/v1/b/:businessId/settings', requireAuth, resolveBusiness, businessRouter);
app.use('/api/v1/b/:businessId/reports', requireAuth, resolveBusiness, reportsRouter);

// ── Super-Admin: Provision a new client tenant (user + isolated DB) ─────────
// Protected by X-Admin-Secret header (must match ADMIN_SECRET in .env)
app.post('/api/v1/admin/provision-client', async (req, res) => {
  try {
    if (req.headers['x-admin-secret'] !== (process.env.ADMIN_SECRET || 'bizbytech.admin')) {
      return res.status(401).json({ success: false, error: 'Unauthorized: invalid admin secret' });
    }

    const { name, email, phone, password, business_name } = req.body || {};
    if (!name || !email || !password || !business_name) {
      return res.status(400).json({ success: false, error: 'Required: name, email, password, business_name' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    // Check for duplicate email
    const [existing] = await masterPool.execute(
      'SELECT user_id FROM app_users WHERE email = ? LIMIT 1',
      [email.trim().toLowerCase()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: `User already exists: ${email}` });
    }

    // Create app_user
    const passwordHash = await bcrypt.hash(password, 10);
    const [userResult] = await masterPool.execute(
      'INSERT INTO app_users (full_name, email, phone, password_hash, created_at) VALUES (?, ?, ?, ?, NOW())',
      [name.trim(), email.trim().toLowerCase(), phone?.trim() || null, passwordHash]
    );
    const newUserId = userResult.insertId;

    // Provision tenant DB
    const { businessId, tenantDbName } = await provisionTenantDatabase({
      userId: newUserId,
      businessName: business_name.trim(),
      ownerName: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
    });

    logger.info(`Admin provisioned new client: userId=${newUserId}, businessId=${businessId}, db=${tenantDbName}`);

    return res.status(201).json({
      success: true,
      data: { userId: newUserId, businessId, tenantDbName, message: 'Client provisioned successfully.' }
    });
  } catch (err) {
    logger.error('Admin provision-client failed', { message: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Super-Admin: List all V3 provisioned businesses ──────────────────────────
app.get('/api/v1/admin/businesses', async (req, res) => {
  try {
    if (req.headers['x-admin-secret'] !== (process.env.ADMIN_SECRET || 'bizbytech.admin')) {
      return res.status(401).json({ success: false, error: 'Unauthorized: invalid admin secret' });
    }
    const [rows] = await masterPool.execute(`
      SELECT
        b.business_id,
        b.business_name,
        b.owner_name,
        b.email,
        b.phone,
        b.is_active,
        b.created_at,
        CONCAT('uvuytecv_biz_', b.business_id, '_db') AS tenant_db,
        u.full_name AS user_full_name,
        u.email     AS user_email
      FROM businesses b
      LEFT JOIN business_users bu ON bu.business_id = b.business_id AND bu.role = 'Owner'
      LEFT JOIN app_users u       ON u.user_id = bu.user_id
      ORDER BY b.created_at DESC
    `);
    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('Admin list businesses failed', { message: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Express global error handler ─────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { message: err.message });
  if (err?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_RECORD',
        message: 'This record already exists. Please check unique fields such as phone, GSTIN, invoice number, or code.'
      }
    });
  }
  res.status(500).json({ error: 'Internal server error' });
});

async function startServer() {
  try {
    await ensureMasterTables(masterPool);
    logger.info('[DB] Master tables verified/created ✓');
  } catch (err) {
    logger.error('[DB] Master table init failed:', { error: err.message });
    // Do NOT crash the server — tables may already exist
  }
  const server = app.listen(env.port, () => {
    logger.info(`SimpleBill API listening on port ${env.port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${env.port} is already in use. Kill the old process first: lsof -ti :${env.port} | xargs kill -9`);
      process.exit(1);
    } else {
      throw err;
    }
  });
}

// Only start the HTTP server when running locally (not on Vercel)
if (process.env.VERCEL !== '1') {
  startServer();
}

// Export app so Vercel can use it as a serverless handler
export default app;
