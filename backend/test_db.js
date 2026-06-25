import 'dotenv/config';
import { masterPool } from './src/db/ConnectionManager.js';
async function test() {
  const [rows] = await masterPool.execute("SELECT id, source, level, message, context FROM saas_error_logs ORDER BY created_at DESC LIMIT 5");
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}
test();
