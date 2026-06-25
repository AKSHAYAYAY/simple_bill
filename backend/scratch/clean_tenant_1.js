import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '103.191.209.249',
  user: process.env.MYSQL_USER || 'uvuytecv_simplebilladm',
  password: process.env.MYSQL_PASSWORD || 'simple.bill.adm',
  database: 'uvuytecv_biz_1_db', // Target the tenant DB
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('Cleaning tenant database uvuytecv_biz_1_db...');

  const conn = await pool.getConnection();
  try {
    await conn.execute('SET FOREIGN_KEY_CHECKS = 0');

    // 1. Get all tables
    const [tables] = await conn.execute(
      `SELECT TABLE_NAME FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = 'uvuytecv_biz_1_db' AND TABLE_TYPE = 'BASE TABLE'`
    );

    console.log(`Found ${tables.length} tables to drop.`);
    for (const t of tables) {
      await conn.execute(`DROP TABLE IF EXISTS \`${t.TABLE_NAME}\``);
      console.log(`  ✓ Dropped table: ${t.TABLE_NAME}`);
    }

    // 2. Get all views
    const [views] = await conn.execute(
      `SELECT TABLE_NAME FROM information_schema.VIEWS 
       WHERE TABLE_SCHEMA = 'uvuytecv_biz_1_db'`
    );

    console.log(`Found ${views.length} views to drop.`);
    for (const v of views) {
      await conn.execute(`DROP VIEW IF EXISTS \`${v.TABLE_NAME}\``);
      console.log(`  ✓ Dropped view: ${v.TABLE_NAME}`);
    }

    await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\nTenant DB uvuytecv_biz_1_db has been completely cleaned and is empty! ✓');
  } finally {
    conn.release();
  }

  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error('Tenant cleanup failed:', err);
  process.exit(1);
});
