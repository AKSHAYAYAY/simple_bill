import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { masterPool, getTenantPool } from '../db/ConnectionManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path from backend/src/utils/ → up 3 levels → project root → schema file
const SCHEMA_PATH = path.resolve(__dirname, '../../../retail_billbook_schema_v3.sql');

/**
 * Provisions a new isolated tenant database for a business.
 *
 * Steps:
 *  1. Insert business record into master DB → get business_id
 *  2. CREATE DATABASE sb_biz_{id}_db
 *  3. Run retail_billbook_schema_v3.sql on the new DB
 *  4. Sync user + business + business_user records to tenant DB (FK integrity)
 *  5. Link user as Owner in master business_users
 *
 * @param {object} opts
 * @param {number} opts.userId        - Existing app_users.user_id in master DB
 * @param {string} opts.businessName  - Legal business name
 * @param {string} [opts.ownerName]   - Owner display name
 * @param {string} [opts.email]       - Business email
 * @param {string} [opts.phone]       - Business phone
 * @returns {{ businessId: number, tenantDbName: string }}
 */
export async function provisionTenantDatabase({ userId, businessName, ownerName, email, phone }) {
  // ── Step 1: Create master business record ─────────────────────────────────
  const [bizResult] = await masterPool.execute(
    `INSERT INTO businesses
       (user_id, business_name, owner_name, email, phone, business_type, gst_type, invoice_prefix, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, 'Retail', 'GST', 'INV', 1, NOW())`,
    [userId, businessName, ownerName || businessName, email || null, phone || null]
  );

  const businessId = bizResult.insertId;
  const tenantDbName = `uvuytecv_biz_${businessId}_db`;

  // ── Step 2: Create isolated database (Commented out for MilesWeb hosting: database must be pre-created manually) ──────────────────────────────────────
  // masterPool can run DDL regardless of its own database context
  // await masterPool.execute(`CREATE DATABASE IF NOT EXISTS \`${tenantDbName}\``);

  // ── Step 3: Execute full schema on the new tenant DB ──────────────────────
  if (!fs.existsSync(SCHEMA_PATH)) {
    throw new Error(`Schema file not found at: ${SCHEMA_PATH}`);
  }

  let schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  // Strip any USE <db>; statements so they don't redirect away from tenant DB
  schema = schema.replace(/^\s*USE\s+[^;]+;\s*$/gim, '');

  const tenantConn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: tenantDbName,
    multipleStatements: true,
    ssl: process.env.MYSQL_SSL === 'false' ? undefined : { rejectUnauthorized: false },
  });

  try {
    let currentDelimiter = ';';
    const statements = [];
    let currentStatement = '';

    const lines = schema.split('\n');
    for (let line of lines) {
      if (line.trim().toUpperCase().startsWith('DELIMITER ')) {
        currentDelimiter = line.trim().substring(10).trim();
        continue;
      }
      currentStatement += line + '\n';
      if (line.trim().endsWith(currentDelimiter)) {
        const stmt = currentStatement.trim();
        statements.push(stmt.substring(0, stmt.length - currentDelimiter.length));
        currentStatement = '';
      }
    }
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    for (const stmt of statements) {
      if (stmt.trim()) {
        await tenantConn.query(stmt);
      }
    }

    // Ensure stock triggers exist even if schema snapshots missed them.
    const triggerSql = [
      `DROP TRIGGER IF EXISTS trg_sale_stock_update`,
      `CREATE TRIGGER trg_sale_stock_update
       AFTER INSERT ON sale_items FOR EACH ROW
       BEGIN
         UPDATE products SET current_stock = current_stock - NEW.quantity
         WHERE product_id = NEW.product_id;
       END`,
      `DROP TRIGGER IF EXISTS trg_purchase_stock_update`,
      `CREATE TRIGGER trg_purchase_stock_update
       AFTER INSERT ON purchase_items FOR EACH ROW
       BEGIN
         UPDATE products SET current_stock = current_stock + NEW.quantity + COALESCE(NEW.free_quantity, 0)
         WHERE product_id = NEW.product_id;
       END`,
      `DROP TRIGGER IF EXISTS trg_sale_return_stock_restore`,
      `CREATE TRIGGER trg_sale_return_stock_restore
       AFTER INSERT ON sales_return_items FOR EACH ROW
       BEGIN
         UPDATE products SET current_stock = current_stock + NEW.quantity
         WHERE product_id = NEW.product_id;
       END`,
      `DROP TRIGGER IF EXISTS trg_purchase_return_stock_deduct`,
      `CREATE TRIGGER trg_purchase_return_stock_deduct
       AFTER INSERT ON purchase_return_items FOR EACH ROW
       BEGIN
         UPDATE products SET current_stock = current_stock - NEW.quantity
         WHERE product_id = NEW.product_id;
       END`,
    ];
    for (const stmt of triggerSql) {
      await tenantConn.query(stmt);
    }
  } finally {
    await tenantConn.end();
  }

  // ── Step 4: Link owner in master business_users ───────────────────────────
  await masterPool.execute(
    `INSERT IGNORE INTO business_users
       (business_id, user_id, role, is_active, invited_at, joined_at)
     VALUES (?, ?, 'Owner', 1, NOW(), NOW())`,
    [businessId, userId]
  );

  // ── Step 5: Sync master records into tenant DB (for FK integrity) ─────────
  const tenantPool = await getTenantPool(businessId);

  // Sync app_user
  const [userRows] = await masterPool.execute(
    'SELECT * FROM app_users WHERE user_id = ?',
    [userId]
  );
  if (userRows.length > 0) {
    const u = userRows[0];
    await tenantPool.execute(
      `INSERT IGNORE INTO app_users
         (user_id, full_name, email, phone, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [u.user_id, u.full_name, u.email, u.phone, u.password_hash, u.created_at]
    );
  }

  // Sync business record
  const [bizRows] = await masterPool.execute(
    'SELECT * FROM businesses WHERE business_id = ?',
    [businessId]
  );
  if (bizRows.length > 0) {
    const b = bizRows[0];
    await tenantPool.execute(
      `INSERT IGNORE INTO businesses
         (business_id, user_id, business_name, owner_name, email, phone,
          business_type, gst_type, invoice_prefix, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.business_id, b.user_id, b.business_name, b.owner_name,
        b.email, b.phone, b.business_type || 'Retail', b.gst_type || 'GST',
        b.invoice_prefix || 'INV', b.is_active ?? 1, b.created_at,
      ]
    );
  }

  // Sync business_users link
  const [buRows] = await masterPool.execute(
    'SELECT * FROM business_users WHERE business_id = ? AND user_id = ?',
    [businessId, userId]
  );
  if (buRows.length > 0) {
    const bu = buRows[0];
    await tenantPool.execute(
      `INSERT IGNORE INTO business_users
         (business_user_id, business_id, user_id, role, is_active, invited_at, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        bu.business_user_id || bu.id,
        bu.business_id,
        bu.user_id,
        bu.role,
        bu.is_active,
        bu.invited_at || bu.joined_at || null,
        bu.joined_at
      ]
    );
  }

  return { businessId, tenantDbName };
}
