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
  console.log('Starting V3 manual seeding against remote database...\n');

  // 1. Fetch all users from master_users_registry
  const [legacyUsers] = await pool.execute('SELECT * FROM master_users_registry');
  console.log(`Found ${legacyUsers.length} legacy users in master_users_registry.\n`);

  for (const u of legacyUsers) {
    const email = u.email;
    const name = u.name;
    const phone = u.phone;
    const passwordHash = u.password_hash;
    const createdAt = u.created_at || new Date();

    console.log(`Processing user: ${email} (${name})...`);

    // Let's decide IDs
    let userId;
    let businessId;

    if (email.toLowerCase() === 'assigned@email.com') {
      userId = 1;
      businessId = 1; // Map to pre-existing uvuytecv_biz_1_db
    } else if (email.toLowerCase() === 'aakshayjain99@gmail.com') {
      userId = 5;
      businessId = 5;
    } else if (email.toLowerCase() === 'test@gmail.com') {
      userId = 7;
      businessId = 7;
    } else if (email.toLowerCase() === 'test1@gmail.com') {
      userId = 8;
      businessId = 8;
    } else {
      continue;
    }

    // A. Insert into app_users
    await pool.execute(
      `INSERT IGNORE INTO app_users (user_id, full_name, email, phone, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, name, email, phone || null, passwordHash, createdAt]
    );
    console.log(`  ✓ Inserted into app_users (user_id = ${userId})`);

    // B. Insert into businesses
    await pool.execute(
      `INSERT IGNORE INTO businesses (business_id, user_id, business_name, owner_name, email, phone, business_type, gst_type, invoice_prefix, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Retail', 'GST', 'INV', 1, ?)`,
      [businessId, userId, `${name} Business`, name, email, phone || null, createdAt]
    );
    console.log(`  ✓ Inserted into businesses (business_id = ${businessId})`);

    // C. Insert into business_users
    await pool.execute(
      `INSERT IGNORE INTO business_users (business_id, user_id, role, is_active, invited_at, joined_at)
       VALUES (?, ?, 'Owner', 1, ?, ?)`,
      [businessId, userId, createdAt, createdAt]
    );
    console.log(`  ✓ Inserted into business_users\n`);
  }

  console.log('Manual seeding completed successfully!');
  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
