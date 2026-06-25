import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

async function seed() {
  const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'SimpleBill'
  });

  const hash = await bcrypt.hash('Admin@123', 12);
  
  // 1. Insert into old users table (for existing UI)
  try {
    await pool.execute('INSERT INTO users (email, password_hash, name, tenant_id) VALUES (?, ?, ?, ?)', ['admin@simplebill.com', hash, 'Admin User', 'sb_biz_1_db']);
    console.log('Added to old users table.');
  } catch (e) { console.log('Old users table insert failed (maybe exists):', e.message); }

  // 2. Insert into new app_users table (V3 schema)
  try {
    const [userRes] = await pool.execute('INSERT INTO app_users (full_name, email, phone, password_hash) VALUES (?, ?, ?, ?)', ['Admin User', 'admin@simplebill.com', '9999999999', hash]);
    const userId = userRes.insertId;

    // 3. Create a business
    const [bizRes] = await pool.execute('INSERT INTO businesses (user_id, business_name, owner_name, email) VALUES (?, ?, ?, ?)', [userId, 'Admin Test Business', 'Admin User', 'admin@simplebill.com']);
    const bizId = bizRes.insertId;

    // 4. Link in business_users
    await pool.execute('INSERT INTO business_users (business_id, user_id, role) VALUES (?, ?, ?)', [bizId, userId, 'Owner']);
    console.log(`Added to new V3 tables. User ID: ${userId}, Business ID: ${bizId}`);
    
    // 5. Create the tenant database for this business
    await pool.execute(`CREATE DATABASE IF NOT EXISTS sb_biz_${bizId}_db`);
    console.log(`Created tenant database: sb_biz_${bizId}_db. (Note: You'll need to run the V3 schema inside this DB to use the new APIs)`);
  } catch (e) {
    console.log('New V3 tables insert failed:', e.message);
  }

  process.exit();
}

seed();
