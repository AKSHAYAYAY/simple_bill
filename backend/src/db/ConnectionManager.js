import mysql from 'mysql2/promise';

const sslConfig = process.env.MYSQL_SSL === 'false'
  ? undefined
  : { rejectUnauthorized: false };

const isServerless = process.env.VERCEL === '1';

export const masterPool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  connectionLimit: isServerless ? 2 : 10,
  idleTimeout: isServerless ? 10000 : 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  waitForConnections: true,
  queueLimit: 0,
  acquireTimeout: 8000,
  ssl: sslConfig,
});

const tenantPools = new Map();

export function getTenantPool(businessId) {
  const id = Number(businessId);
  if (!id || id < 1) throw new Error(`Invalid businessId: ${businessId}`);
  if (tenantPools.has(id)) return tenantPools.get(id);
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: `uvuytecv_biz_${id}_db`,
    connectionLimit: isServerless ? 2 : 5,
    idleTimeout: isServerless ? 10000 : 30000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    waitForConnections: true,
    queueLimit: 0,
    acquireTimeout: 8000,
    ssl: sslConfig,
  });
  tenantPools.set(id, pool);
  console.log(`[TenantPool] Created pool for business_id=${id} (limit=${isServerless ? 2 : 5}, timeout=${isServerless ? 10000 : 30000})`);
  return pool;
}

export async function closeTenantPool(businessId) {
  const id = Number(businessId);
  if (tenantPools.has(id)) {
    await tenantPools.get(id).end();
    tenantPools.delete(id);
  }
}

export async function closeAllTenantPools() {
  for (const [id, pool] of tenantPools) {
    await pool.end();
    tenantPools.delete(id);
  }
}

process.on('SIGTERM', async () => {
  await closeAllTenantPools();
  await masterPool.end();
  process.exit(0);
});
