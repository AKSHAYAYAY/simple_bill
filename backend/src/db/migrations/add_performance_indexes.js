import 'dotenv/config';
import mysql from 'mysql2/promise';

const masterConn = await mysql.createConnection({
  host:     process.env.MYSQL_HOST,
  user:     process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

const args = process.argv.slice(2);
const allMode = args.includes('--all');
const specificId = args.find(a => a.startsWith('--business-id='))
  ?.split('=')[1];

let businessIds = [];

if (allMode) {
  const [rows] = await masterConn.execute(
    'SELECT business_id FROM businesses ORDER BY business_id ASC'
  );
  businessIds = rows.map(r => r.business_id);
} else if (specificId) {
  businessIds = [Number(specificId)];
} else {
  console.error('Usage: node add_performance_indexes.js --all');
  console.error('       node add_performance_indexes.js --business-id=5');
  process.exit(1);
}

await masterConn.end();

// ── index SQL (same list as Thing 1) ──────────────────────────
const INDEX_SQL = [
  `CREATE INDEX idx_sales_biz_date
       ON sales (business_id, invoice_date, deleted_at)`,
  `CREATE INDEX idx_sales_biz_status
       ON sales (business_id, payment_status, deleted_at)`,
  `CREATE INDEX idx_sales_biz_customer
       ON sales (business_id, customer_id)`,
  `CREATE INDEX idx_purchases_biz_date
       ON purchases (business_id, purchase_date, deleted_at)`,
  `CREATE INDEX idx_purchases_biz_status
       ON purchases (business_id, payment_status, deleted_at)`,
  `CREATE INDEX idx_purchases_biz_supplier
       ON purchases (business_id, supplier_id)`,
  `CREATE INDEX idx_sret_biz_date
       ON sales_returns (business_id, return_date)`,
  `CREATE INDEX idx_pret_biz_date
       ON purchase_returns (business_id, return_date)`,
  `CREATE INDEX idx_sret_biz_status
       ON sales_returns (business_id, refund_status)`,
  `CREATE INDEX idx_pret_biz_status
       ON purchase_returns (business_id, refund_status)`,
  `CREATE INDEX idx_payment_in_biz_date
       ON payment_in (business_id, payment_date)`,
  `CREATE INDEX idx_payment_in_customer
       ON payment_in (business_id, customer_id)`,
  `CREATE INDEX idx_payment_in_supplier
       ON payment_in (business_id, supplier_id)`,
  `CREATE INDEX idx_payment_out_biz_date
       ON payment_out (business_id, payment_date)`,
  `CREATE INDEX idx_payment_out_supplier
       ON payment_out (business_id, supplier_id)`,
  `CREATE INDEX idx_payment_out_customer
       ON payment_out (business_id, customer_id)`,
  `CREATE INDEX idx_daybook_biz_date
       ON day_book (business_id, entry_date)`,
  `CREATE INDEX idx_daybook_ref
       ON day_book (business_id, reference_type, reference_id)`,
  `CREATE INDEX idx_sm_biz_product
       ON stock_movements (business_id, product_id)`,
  `CREATE INDEX idx_sm_biz_date
       ON stock_movements (business_id, created_at)`,
  `CREATE INDEX idx_expenses_biz_date
       ON expenses (business_id, expense_date)`,
  `CREATE INDEX idx_incomes_biz_date
       ON incomes (business_id, income_date)`,
  `CREATE INDEX idx_customers_biz_phone
       ON customers (business_id, phone)`,
  `CREATE INDEX idx_suppliers_biz_phone
       ON suppliers (business_id, phone)`,
];

let passed = 0, failed = 0;

for (const bizId of businessIds) {
  const dbName = `uvuytecv_biz_${bizId}_db`;
  let conn;
  try {
    conn = await mysql.createConnection({
      host:     process.env.MYSQL_HOST,
      user:     process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: dbName,
    });

    for (const sql of INDEX_SQL) {
      try {
        await conn.execute(sql);
      } catch (e) {
        if (e.code !== 'ER_DUP_KEYNAME') throw e;
      }
    }

    console.log(`[OK]   business_id=${bizId} | ${dbName} | ${INDEX_SQL.length} indexes verified`);
    passed++;
  } catch (err) {
    if (err.code === 'ER_BAD_DB_ERROR') {
      console.log(`[SKIP] business_id=${bizId} | ${dbName} does not exist yet`);
    } else {
      console.error(`[FAIL] business_id=${bizId} | ${err.message}`);
      failed++;
    }
  } finally {
    if (conn) await conn.end();
  }
}

console.log(`\nDone. Passed: ${passed}  Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
