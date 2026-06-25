import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

export class AppError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export async function provisionTenantDatabase(masterPool, businessId) {
  const dbName = `uvuytecv_biz_${businessId}_db`;

  try {
    // 1. Create the database (Commented out for MilesWeb hosting: database must be pre-created manually)
    /*
    try {
      await masterPool.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } catch (dbErr) {
      console.warn(`[Provisioner] Database creation warning (may already exist):`, dbErr.message);
    }
    */

    // 2. Connect to the new tenant DB
    const tenantConn = await mysql.createConnection({
      host:     process.env.MYSQL_HOST,
      user:     process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: dbName,
      multipleStatements: true,   // needed to run the full schema file
      ssl: process.env.MYSQL_SSL === 'false' ? undefined : { rejectUnauthorized: false }
    });

    // 3. Read the tenant schema SQL file
    let schemaPath = path.join(process.cwd(), 'sql', '002_tenant_schema.sql');
    if (!fs.existsSync(schemaPath)) {
      schemaPath = path.join(process.cwd(), 'backend', 'sql', '002_tenant_schema.sql');
    }
    if (!fs.existsSync(schemaPath)) {
      // Fallback relative to file URL pathname
      const dirname = path.dirname(new URL(import.meta.url).pathname);
      schemaPath = path.resolve(dirname, '../../sql/002_tenant_schema.sql');
    }

    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // 4. Parse schemaSql to handle DELIMITER commands manually
    let currentDelimiter = ';';
    const statements = [];
    let currentStatement = '';

    const lines = schemaSql.split('\n');
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

    // 5. Execute all statements one-by-one
    for (const stmt of statements) {
      if (stmt.trim()) {
        await tenantConn.query(stmt);
      }
    }

    // 6. Sync metadata from master database into tenant database to support foreign keys / joins
    // Fetch business record
    const [bizRows] = await masterPool.execute(
      'SELECT * FROM businesses WHERE business_id = ? LIMIT 1',
      [businessId]
    );
    if (bizRows.length === 0) {
      throw new Error(`Business not found in master database with ID: ${businessId}`);
    }
    const b = bizRows[0];

    // Fetch user record
    const [userRows] = await masterPool.execute(
      'SELECT * FROM app_users WHERE user_id = ? LIMIT 1',
      [b.user_id]
    );
    if (userRows.length > 0) {
      const u = userRows[0];
      await tenantConn.execute(
        `INSERT IGNORE INTO app_users
           (user_id, full_name, email, phone, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [u.user_id, u.full_name, u.email, u.phone, u.password_hash, u.created_at]
      );
    }

    // Sync business record
    await tenantConn.execute(
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

    // Sync business_users links
    const [buRows] = await masterPool.execute(
      'SELECT * FROM business_users WHERE business_id = ?',
      [businessId]
    );
    for (const bu of buRows) {
      await tenantConn.execute(
        `INSERT IGNORE INTO business_users
           (business_user_id, business_id, user_id, role, is_active, invited_at, joined_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          bu.business_user_id || bu.id,
          bu.business_id,
          bu.user_id,
          bu.role,
          bu.is_active,
          bu.invited_at || bu.joined_at,
          bu.joined_at,
        ]
      );
    }

    await tenantConn.end();

    console.log(`[Provisioner] Tenant DB ${dbName} created, schema applied, and metadata synced ✓`);
    return dbName;
  } catch (err) {
    console.error(`[Provisioner] Tenant database provisioning failed for ${dbName}:`, err);
    throw new AppError('PROVISIONING_FAILED', 'Could not set up your account database.');
  }
}
