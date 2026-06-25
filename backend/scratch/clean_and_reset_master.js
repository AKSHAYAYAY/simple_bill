import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '103.191.209.249',
  user: process.env.MYSQL_USER || 'uvuytecv_simplebilladm',
  password: process.env.MYSQL_PASSWORD || 'simple.bill.adm',
  database: process.env.MYSQL_DATABASE || 'uvuytecv_simplebill',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('Cleaning and resetting remote master database tables...');

  const tables = [
    'business_users',
    'businesses',
    'app_users',
    'master_users_registry',
    'saas_user_profiles',
    'saas_login_activity',
    'saas_license_keys',
    'saas_error_logs'
  ];

  const conn = await pool.getConnection();
  try {
    await conn.execute('SET FOREIGN_KEY_CHECKS = 0');

    for (const table of tables) {
      try {
        await conn.execute(`TRUNCATE TABLE \`${table}\``);
        console.log(`  ✓ Truncated table: ${table}`);
      } catch (err) {
        console.log(`  ⚠ Failed to truncate ${table} (trying DELETE):`, err.message);
        await conn.execute(`DELETE FROM \`${table}\``);
      }
    }

    // Reset auto-increment
    await conn.execute('ALTER TABLE app_users AUTO_INCREMENT = 1');
    await conn.execute('ALTER TABLE businesses AUTO_INCREMENT = 1');
    await conn.execute('ALTER TABLE business_users AUTO_INCREMENT = 1');
    console.log('  ✓ Reset auto-increment counters to 1.');

    // Seed clean active licenses
    const licenses = [
      ['SB-PRO-123456', 'PRO'],
      ['SB-PRO-ABC124', 'PRO'],
      ['SB-PRO-123457', 'PRO'],
      ['SB-PRO-123458', 'PRO'],
      ['SB-FREE-123456', 'FREE']
    ];

    for (const [key, plan] of licenses) {
      await conn.execute(
        `INSERT INTO saas_license_keys (license_key, plan_id, status, created_at, updated_at)
         VALUES (?, ?, 'ACTIVE', NOW(), NOW())`,
        [key, plan]
      );
    }
    console.log('  ✓ Seeded clean active license keys.');

    await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\nMaster DB has been reset to a perfectly clean state! ✓');
  } finally {
    conn.release();
  }

  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error('Reset failed:', err);
  process.exit(1);
});
