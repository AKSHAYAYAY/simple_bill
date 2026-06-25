/**
 * Executes a function within a MySQL transaction.
 * Automatically handles commit on success and rollback on failure.
 * 
 * @param {import('mysql2/promise').Pool} pool - The tenant database pool
 * @param {Function} fn - The callback function that receives the connection and performs queries
 * @returns {Promise<any>} - The result of the callback function
 */
export async function withTransaction(pool, fn) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
