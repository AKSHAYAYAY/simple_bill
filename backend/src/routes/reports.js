import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';

export const reportsRouter = Router({ mergeParams: true });

// Helper to extract pagination parameters
const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

reportsRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const businessId = req.businessId;
  const db = req.tenantDb;

  const [[salesRow]] = await db.execute(
    `SELECT COALESCE(SUM(grand_total), 0) AS total_sales,
            COUNT(*) AS sales_count
     FROM sales
     WHERE business_id = ? AND DATE(invoice_date) = CURDATE() AND deleted_at IS NULL`,
    [businessId]
  );

  const [[payInRow]] = await db.execute(
    `SELECT COALESCE(SUM(amount), 0) AS today_pay_in
     FROM payment_in
     WHERE business_id = ? AND DATE(payment_date) = CURDATE()`,
    [businessId]
  );

  const [[payOutRow]] = await db.execute(
    `SELECT COALESCE(SUM(amount), 0) AS today_pay_out
     FROM payment_out
     WHERE business_id = ? AND DATE(payment_date) = CURDATE()`,
    [businessId]
  );

  const [[profitRow]] = await db.execute(
    `SELECT COALESCE(SUM(
              (si.selling_price - si.purchase_price) * si.quantity
              - COALESCE(si.discount_amount, 0)
            ), 0) AS today_gross_profit
     FROM sale_items si
     INNER JOIN sales s ON si.sale_id = s.sale_id
     WHERE s.business_id = ? AND DATE(s.invoice_date) = CURDATE() AND s.deleted_at IS NULL`,
    [businessId]
  );

  const [[lowStockRow]] = await db.execute(
    `SELECT COUNT(*) AS low_stock_count
     FROM products
     WHERE business_id = ? AND is_active = 1 AND current_stock <= minimum_stock_alert`,
    [businessId]
  );

  res.json({
    success: true,
    data: {
      total_sales: Number(salesRow.total_sales),
      pay_in: Number(payInRow.today_pay_in),
      pay_out: Number(payOutRow.today_pay_out),
      day_balance: Number(payInRow.today_pay_in) - Number(payOutRow.today_pay_out),
      today_gross_profit: Number(profitRow.today_gross_profit),
      today_sales_count: Number(salesRow.sales_count),
      low_stock_count: Number(lowStockRow.low_stock_count)
    }
  });
}));

reportsRouter.get('/cashbook/balances', asyncHandler(async (req, res) => {
  const [[row]] = await req.tenantDb.execute(
    `SELECT
       COALESCE(SUM(cash_in - cash_out), 0) AS cash_in_vault,
       COALESCE(SUM(bank_in - bank_out), 0) AS bank_balance,
       COALESCE(SUM(cash_in + bank_in), 0) AS total_inflow_alltime,
       COALESCE(SUM(cash_out + bank_out), 0) AS total_outflow_alltime
     FROM day_book
     WHERE business_id = ?`,
    [req.businessId]
  );
  res.json({ success: true, data: row });
}));

reportsRouter.get('/daybook', asyncHandler(async (req, res) => {
  const { from_date, to_date, entry_type, page = 1, limit = 50 } = req.query;
  const pageNumber = Number(page);
  const limitNumber = Number(limit);
  const offset = (pageNumber - 1) * limitNumber;
  const params = [req.businessId];
  let where = 'WHERE db.business_id = ?';

  if (from_date) { where += ' AND db.entry_date >= ?'; params.push(from_date); }
  if (to_date) { where += ' AND db.entry_date <= ?'; params.push(to_date); }
  if (entry_type && entry_type !== 'All') { where += ' AND db.entry_type = ?'; params.push(entry_type); }

  const [[{ total }]] = await req.tenantDb.query(`SELECT COUNT(*) AS total FROM day_book db ${where}`, params);

  const [rows] = await req.tenantDb.query(
    `SELECT db.*, 
            COALESCE(db.cash_in + db.bank_in, 0) AS total_in,
            COALESCE(db.cash_out + db.bank_out, 0) AS total_out
     FROM day_book db ${where}
     ORDER BY db.entry_date DESC, db.day_book_id DESC
     LIMIT ? OFFSET ?`,
    [...params, limitNumber, offset]
  );

  const [[summary]] = await req.tenantDb.query(
    `SELECT COALESCE(SUM(cash_in + bank_in), 0) AS period_inflow,
            COALESCE(SUM(cash_out + bank_out), 0) AS period_outflow
     FROM day_book db ${where}`,
    params
  );

  res.json({ success: true, data: { rows, summary, pagination: { page: pageNumber, limit: limitNumber, total } } });
}));

// 1. Fast Moving Items
// 1. Fast Moving Items
reportsRouter.get('/fast-moving', asyncHandler(async (req, res) => {
  const { from_date, to_date } = req.query;
  const { page, limit, offset } = getPagination(req.query);

  const filterFrom = from_date || null;
  const filterTo = to_date || null;

  // 1. Fetch total count
  const countSql = `
    SELECT COUNT(DISTINCT si.product_id) AS total
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.sale_id
    WHERE s.business_id = ? 
      AND s.deleted_at IS NULL
      AND (? IS NULL OR s.invoice_date >= ?)
      AND (? IS NULL OR s.invoice_date <= ?)
  `;
  const [countRows] = await req.tenantDb.query(countSql, [
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo
  ]);
  const total = countRows[0]?.total || 0;

  // 2. Fetch rows
  const rowsSql = `
    SELECT 
      p.product_id,
      p.product_name,
      p.product_code,
      p.barcode,
      SUM(si.quantity) AS total_quantity_sold,
      p.current_stock,
      p.purchase_price,
      p.selling_price,
      CASE
        WHEN p.purchase_price IS NULL OR p.purchase_price = 0 THEN NULL
        ELSE ROUND(((p.selling_price - p.purchase_price) / p.purchase_price) * 100, 2)
      END AS gross_margin_percentage
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.sale_id
    INNER JOIN products p ON si.product_id = p.product_id
    WHERE s.business_id = ? 
      AND s.deleted_at IS NULL
      AND (? IS NULL OR s.invoice_date >= ?)
      AND (? IS NULL OR s.invoice_date <= ?)
    GROUP BY p.product_id
    ORDER BY total_quantity_sold DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await req.tenantDb.query(rowsSql, [
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo,
    limit, offset
  ]);

  res.json({
    success: true,
    data: {
      rows: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    }
  });
}));

// 2. Slow Moving / Dead Stock
reportsRouter.get('/slow-moving', asyncHandler(async (req, res) => {
  const { days_stagnant } = req.query;
  const { page, limit, offset } = getPagination(req.query);

  let defaultStagnantDays = 365;
  try {
    const [bizRows] = await req.tenantDb.query('SELECT dead_stock_days FROM businesses WHERE business_id = ?', [req.businessId]);
    if (bizRows.length > 0 && bizRows[0].dead_stock_days !== null && bizRows[0].dead_stock_days !== undefined) {
      defaultStagnantDays = parseInt(bizRows[0].dead_stock_days) || 365;
    }
  } catch (e) {}

  const daysLimit = Math.max(1, parseInt(days_stagnant) || defaultStagnantDays);

  // 1. Fetch active products with stock
  const [products] = await req.tenantDb.query(
    `SELECT product_id, product_name, product_code, current_stock, purchase_price, selling_price, created_at 
     FROM products 
     WHERE business_id = ? AND current_stock > 0 AND is_active = 1`,
    [req.businessId]
  );

  // 2. Fetch all purchases (chronological order)
  const [purchaseItems] = await req.tenantDb.query(
    `SELECT pi.product_id, pi.quantity, p.purchase_date 
     FROM purchase_items pi 
     JOIN purchases p ON pi.purchase_id = p.purchase_id 
     WHERE p.business_id = ? AND p.deleted_at IS NULL 
     ORDER BY p.purchase_date ASC`,
    [req.businessId]
  );

  // 3. Fetch all sales for total consumption count
  const [saleItems] = await req.tenantDb.query(
    `SELECT si.product_id, si.quantity 
     FROM sale_items si 
     JOIN sales s ON si.sale_id = s.sale_id 
     WHERE s.business_id = ? AND s.deleted_at IS NULL`,
    [req.businessId]
  );

  // 4. Fetch all sales returns for subtraction
  const [salesReturnItems] = await req.tenantDb.query(
    `SELECT sri.product_id, sri.quantity 
     FROM sales_return_items sri 
     JOIN sales_returns sr ON sri.return_id = sr.return_id 
     WHERE sr.business_id = ?`,
    [req.businessId]
  );

  // 5. Fetch all purchase returns for subtraction
  const [purchaseReturnItems] = await req.tenantDb.query(
    `SELECT pri.product_id, pri.quantity 
     FROM purchase_return_items pri 
     JOIN purchase_returns pr ON pri.return_id = pr.return_id 
     WHERE pr.business_id = ?`,
    [req.businessId]
  );

  // Group purchases by product
  const purchasesByProduct = {};
  for (const item of purchaseItems) {
    if (!purchasesByProduct[item.product_id]) {
      purchasesByProduct[item.product_id] = [];
    }
    purchasesByProduct[item.product_id].push({
      quantity: parseFloat(item.quantity) || 0,
      date: new Date(item.purchase_date)
    });
  }

  // Aggregate purchase returns by product
  const purchaseReturnsByProduct = {};
  for (const item of purchaseReturnItems) {
    const pid = item.product_id;
    const qty = parseFloat(item.quantity) || 0;
    purchaseReturnsByProduct[pid] = (purchaseReturnsByProduct[pid] || 0) + qty;
  }

  // Group sales by product
  const salesByProduct = {};
  for (const item of saleItems) {
    const pid = item.product_id;
    const qty = parseFloat(item.quantity) || 0;
    salesByProduct[pid] = (salesByProduct[pid] || 0) + qty;
  }

  // Group sales returns by product
  const salesReturnsByProduct = {};
  for (const item of salesReturnItems) {
    const pid = item.product_id;
    const qty = parseFloat(item.quantity) || 0;
    salesReturnsByProduct[pid] = (salesReturnsByProduct[pid] || 0) + qty;
  }

  const processedProducts = [];
  const now = new Date();

  for (const p of products) {
    const currentStock = parseFloat(p.current_stock) || 0;
    const rawSold = salesByProduct[p.product_id] || 0;
    const returnedSold = salesReturnsByProduct[p.product_id] || 0;
    const totalSold = Math.max(0, rawSold - returnedSold);

    const actualPurchases = purchasesByProduct[p.product_id] || [];
    const returnedPurchased = purchaseReturnsByProduct[p.product_id] || 0;
    const totalPurchased = Math.max(0, actualPurchases.reduce((acc, curr) => acc + curr.quantity, 0) - returnedPurchased);

    // Unaccounted stock is considered opening/direct stock from creation date
    const openingStockQty = Math.max(0, currentStock + totalSold - totalPurchased);
    const openingStockDate = new Date(p.created_at);

    // Build inward chronological ledger
    const batches = [];
    if (openingStockQty > 0) {
      batches.push({
        quantity: openingStockQty,
        date: openingStockDate
      });
    }
    batches.push(...actualPurchases);

    if (batches.length === 0) {
      batches.push({
        quantity: currentStock,
        date: openingStockDate
      });
    }

    let oldestUnsoldDate = null;
    const totalInward = batches.reduce((acc, curr) => acc + curr.quantity, 0);

    if (totalInward <= currentStock) {
      oldestUnsoldDate = batches[0].date;
    } else {
      let toConsume = totalInward - currentStock;
      for (const batch of batches) {
        if (toConsume >= batch.quantity) {
          toConsume -= batch.quantity;
        } else {
          oldestUnsoldDate = batch.date;
          break;
        }
      }
      if (!oldestUnsoldDate) {
        oldestUnsoldDate = batches[batches.length - 1].date;
      }
    }

    const diffTime = Math.abs(now - oldestUnsoldDate);
    const daysStagnant = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    processedProducts.push({
      product_id: p.product_id,
      product_name: p.product_name,
      product_code: p.product_code,
      current_stock: currentStock,
      purchase_price: parseFloat(p.purchase_price) || 0,
      selling_price: parseFloat(p.selling_price) || 0,
      days_since_last_sale: daysStagnant
    });
  }

  const filteredProducts = processedProducts.filter(p => p.days_since_last_sale >= daysLimit);
  filteredProducts.sort((a, b) => b.days_since_last_sale - a.days_since_last_sale);

  const total = filteredProducts.length;
  const paginatedRows = filteredProducts.slice(offset, offset + limit);

  res.json({
    success: true,
    data: {
      rows: paginatedRows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    }
  });
}));

// 3. Top Customers
reportsRouter.get('/top-customers', asyncHandler(async (req, res) => {
  const { from_date, to_date } = req.query;
  const { page, limit, offset } = getPagination(req.query);

  const filterFrom = from_date || null;
  const filterTo = to_date || null;

  // 1. Count SQL
  const countSql = `
    SELECT COUNT(DISTINCT s.customer_id) AS total
    FROM sales s
    WHERE s.business_id = ?
      AND s.deleted_at IS NULL
      AND (? IS NULL OR s.invoice_date >= ?)
      AND (? IS NULL OR s.invoice_date <= ?)
  `;
  const [countRows] = await req.tenantDb.query(countSql, [
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo
  ]);
  const total = countRows[0]?.total || 0;

  // 2. Rows SQL
  const rowsSql = `
    SELECT 
      c.customer_id,
      c.customer_name,
      c.company_name,
      c.phone,
      SUM(s.grand_total) AS total_sales_value,
      COUNT(s.sale_id) AS total_invoices
    FROM sales s
    INNER JOIN customers c ON s.customer_id = c.customer_id
    WHERE s.business_id = ?
      AND s.deleted_at IS NULL
      AND (? IS NULL OR s.invoice_date >= ?)
      AND (? IS NULL OR s.invoice_date <= ?)
    GROUP BY c.customer_id
    ORDER BY total_sales_value DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await req.tenantDb.query(rowsSql, [
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo,
    limit, offset
  ]);

  res.json({
    success: true,
    data: {
      rows: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    }
  });
}));

// 4. Supplier Spend
reportsRouter.get('/supplier-spend', asyncHandler(async (req, res) => {
  const { from_date, to_date } = req.query;
  const { page, limit, offset } = getPagination(req.query);

  const filterFrom = from_date || null;
  const filterTo = to_date || null;

  // 1. Count SQL
  const countSql = `
    SELECT COUNT(DISTINCT p.supplier_id) AS total
    FROM purchases p
    WHERE p.business_id = ?
      AND p.deleted_at IS NULL
      AND (? IS NULL OR p.purchase_date >= ?)
      AND (? IS NULL OR p.purchase_date <= ?)
  `;
  const [countRows] = await req.tenantDb.query(countSql, [
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo
  ]);
  const total = countRows[0]?.total || 0;

  // 2. Rows SQL
  const rowsSql = `
    SELECT 
      sup.supplier_id,
      sup.supplier_name,
      sup.company_name,
      sup.gst_number,
      SUM(p.grand_total) AS total_spend_value,
      COUNT(p.purchase_id) AS total_invoices
    FROM purchases p
    INNER JOIN suppliers sup ON p.supplier_id = sup.supplier_id
    WHERE p.business_id = ?
      AND p.deleted_at IS NULL
      AND (? IS NULL OR p.purchase_date >= ?)
      AND (? IS NULL OR p.purchase_date <= ?)
    GROUP BY sup.supplier_id
    ORDER BY total_spend_value DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await req.tenantDb.query(rowsSql, [
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo,
    limit, offset
  ]);

  res.json({
    success: true,
    data: {
      rows: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    }
  });
}));

// 5. Item Profitability
reportsRouter.get('/profitability/items', asyncHandler(async (req, res) => {
  const { from_date, to_date } = req.query;
  const { page, limit, offset } = getPagination(req.query);

  const filterFrom = from_date || null;
  const filterTo = to_date || null;

  // 1. Count SQL
  const countSql = `
    SELECT COUNT(DISTINCT si.product_id) AS total
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.sale_id
    WHERE s.business_id = ?
      AND s.deleted_at IS NULL
      AND (? IS NULL OR s.invoice_date >= ?)
      AND (? IS NULL OR s.invoice_date <= ?)
  `;
  const [countRows] = await req.tenantDb.query(countSql, [
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo
  ]);
  const total = countRows[0]?.total || 0;

  // 2. Rows SQL
  const rowsSql = `
    SELECT 
      p.product_id,
      p.product_name,
      SUM(si.quantity) AS total_quantity_sold,
      SUM(si.quantity * si.purchase_price) AS total_cost,
      SUM((si.selling_price * si.quantity) - COALESCE(si.discount_amount, 0)) AS total_revenue,
      SUM(((si.selling_price - si.purchase_price) * si.quantity) - COALESCE(si.discount_amount, 0)) AS gross_profit,
      CASE
        WHEN SUM(si.total_amount) IS NULL OR SUM(si.total_amount) = 0 THEN NULL
        ELSE ROUND((SUM(((si.selling_price - si.purchase_price) * si.quantity) - COALESCE(si.discount_amount, 0)) / SUM(si.total_amount)) * 100, 2)
      END AS margin_percentage
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.sale_id
    INNER JOIN products p ON si.product_id = p.product_id
    WHERE s.business_id = ?
      AND s.deleted_at IS NULL
      AND (? IS NULL OR s.invoice_date >= ?)
      AND (? IS NULL OR s.invoice_date <= ?)
    GROUP BY p.product_id
    ORDER BY gross_profit DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await req.tenantDb.query(rowsSql, [
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo,
    limit, offset
  ]);

  res.json({
    success: true,
    data: {
      rows: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    }
  });
}));

// 6. Category Profitability
reportsRouter.get('/profitability/categories', asyncHandler(async (req, res) => {
  const { from_date, to_date } = req.query;
  const { page, limit, offset } = getPagination(req.query);

  const filterFrom = from_date || null;
  const filterTo = to_date || null;

  // 1. Count SQL
  const countSql = `
    SELECT COUNT(DISTINCT p.category_id) AS total
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.sale_id
    INNER JOIN products p ON si.product_id = p.product_id
    WHERE s.business_id = ?
      AND s.deleted_at IS NULL
      AND (? IS NULL OR s.invoice_date >= ?)
      AND (? IS NULL OR s.invoice_date <= ?)
  `;
  const [countRows] = await req.tenantDb.query(countSql, [
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo
  ]);
  const total = countRows[0]?.total || 0;

  // 2. Rows SQL
  const rowsSql = `
    SELECT 
      c.category_id,
      c.category_name,
      SUM(si.quantity) AS total_quantity_sold,
      SUM(si.quantity * si.purchase_price) AS total_cost,
      SUM((si.selling_price * si.quantity) - COALESCE(si.discount_amount, 0)) AS total_revenue,
      SUM(((si.selling_price - si.purchase_price) * si.quantity) - COALESCE(si.discount_amount, 0)) AS gross_profit,
      CASE
        WHEN SUM(si.total_amount) IS NULL OR SUM(si.total_amount) = 0 THEN NULL
        ELSE ROUND((SUM(((si.selling_price - si.purchase_price) * si.quantity) - COALESCE(si.discount_amount, 0)) / SUM(si.total_amount)) * 100, 2)
      END AS margin_percentage
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.sale_id
    INNER JOIN products p ON si.product_id = p.product_id
    INNER JOIN categories c ON p.category_id = c.category_id
    WHERE s.business_id = ?
      AND s.deleted_at IS NULL
      AND (? IS NULL OR s.invoice_date >= ?)
      AND (? IS NULL OR s.invoice_date <= ?)
    GROUP BY c.category_id
    ORDER BY gross_profit DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await req.tenantDb.query(rowsSql, [
    req.businessId,
    filterFrom, filterFrom,
    filterTo, filterTo,
    limit, offset
  ]);

  res.json({
    success: true,
    data: {
      rows: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    }
  });
}));

// 7. Low Stock Alerts
reportsRouter.get('/low-stock', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);

  // 1. Count SQL
  const countSql = `
    SELECT COUNT(*) AS total
    FROM products p
    WHERE p.business_id = ? 
      AND p.current_stock <= p.minimum_stock_alert
      AND p.is_active = 1
  `;
  const [countRows] = await req.tenantDb.query(countSql, [req.businessId]);
  const total = countRows[0]?.total || 0;

  // 2. Rows SQL
  const rowsSql = `
    SELECT 
      p.product_id,
      p.product_name,
      p.barcode,
      p.minimum_stock_alert AS low_stock_limit,
      p.current_stock,
      (p.minimum_stock_alert - p.current_stock) AS deficit_quantity
    FROM products p
    WHERE p.business_id = ? 
      AND p.current_stock <= p.minimum_stock_alert
      AND p.is_active = 1
    ORDER BY deficit_quantity DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await req.tenantDb.query(rowsSql, [req.businessId, limit, offset]);

  res.json({
    success: true,
    data: {
      rows: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    }
  });
}));
