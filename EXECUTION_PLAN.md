# RetailBillbook — Complete Execution Plan
### From: simple-bill (basic invoice SaaS) → To: Full retail billing platform
### Stack: React+Vite · Node.js Express · FastAPI Python Worker · MySQL (Model B per-tenant)

---

## Current Codebase State (What Exists)

```
simple-bill-main/
├── Frontend (React+Vite+TS)          root level — pages/, components/, services/
│   ├── pages/Dashboard.tsx           works (basic stats from invoices list)
│   ├── pages/Invoices.tsx            works (creates invoice, items_json blob)
│   ├── pages/Customers.tsx           works (basic CRUD)
│   ├── pages/Reports.tsx             stub (frontend-computed, no DB)
│   ├── pages/Settings.tsx            stub
│   └── services/dataService.ts       action-based calls to legacy_bridge
│
├── Backend (Node.js Express)
│   ├── src/server.js                 mounts routes
│   ├── src/legacy_bridge.js          action switch-case (old code — keep running)
│   ├── src/db/pool.js                single shared MySQL pool
│   ├── src/routes/auth.js            ✅ works (JWT login/register)
│   ├── src/routes/customers.js       ✅ works (tenant_id scoped)
│   └── src/routes/invoices.js        ✅ works (items_json blob)
│
└── Python Worker (FastAPI)
    └── python_worker/main.py         STUB — only has /health and fake /tasks/invoice-summary
```

**Critical gaps to close, in order:**
1. Schema migration (v3 not yet applied)
2. Products + Inventory
3. Sales with normalized items (replace items_json)
4. Suppliers + Purchases
5. Payments + Day Book
6. Returns
7. Reports (DB-driven)
8. Python worker (real PDF + exports)
9. Business settings + tax panel
10. Multi-user roles (business_users table)

---

## Why Python for PDF/Heavy Tasks

Node.js is single-threaded. A PDF render with `puppeteer` or `playwright` blocks the event loop for 200–800ms, which at 10 concurrent users means requests start queuing. Python with `uvicorn` runs async workers and has native support for the best PDF libs (`weasyprint`, `reportlab`) plus Excel (`openpyxl`) and WhatsApp APIs. The pattern: Node receives request → immediately returns `{ job_id, status: "pending" }` → fires HTTP POST to Python worker → Python generates PDF in background → Node polls or frontend polls for result.

**Node does:** Auth, all CRUD, business logic, DB transactions, day book writes.  
**Python does:** PDF generation, Excel export, report data exports, WhatsApp send, future OCR/barcode scanning.

---

## Step 0 — Schema Migration (Do This First)

Run these SQL files against the shared MySQL server in order. Do NOT touch existing `saas_*` tables.

### 002_phase0_add_businesses.sql
```sql
-- Create the businesses table if not yet created
-- Each existing user gets one business row auto-created on next login
CREATE TABLE IF NOT EXISTS businesses (
    business_id  BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id      BIGINT NOT NULL,  -- FK to users.id (existing users table)
    ...  -- all columns from retail_billbook_schema_v3.sql businesses table
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backfill: one business per existing user account
INSERT IGNORE INTO businesses (user_id, business_name, owner_name, invoice_prefix)
SELECT id, CONCAT(name, "'s Business"), name, 'INV'
FROM users;
```

### 003_phase0_add_business_users.sql
```sql
CREATE TABLE IF NOT EXISTS business_users (
    -- from v3 schema
    UNIQUE KEY uq_business_user (business_id, user_id)
);

-- Backfill: Owner role for every existing user → their business
INSERT IGNORE INTO business_users (business_id, user_id, role, is_active, joined_at)
SELECT b.business_id, b.user_id, 'Owner', TRUE, NOW()
FROM businesses b;
```

### 004_phase1_full_tenant_schema.sql
This is `retail_billbook_schema_v3.sql` itself — run it against each existing tenant's database if using Model B, or use as CREATE TABLE IF NOT EXISTS on the shared DB.

**Important:** Add `IF NOT EXISTS` to every `CREATE TABLE` in v3 so it is idempotent.

---

## Step 1 — Backend: Restructure + Middleware

### File changes in backend/src/

**Create: `src/middleware/business.js`**
```javascript
// Injects req.businessId from JWT payload
// Validates user actually belongs to this business via business_users
module.exports = async (req, res, next) => {
  const businessId = req.headers['x-business-id'] || req.user.default_business_id;
  // SELECT 1 FROM business_users WHERE user_id=? AND business_id=? AND is_active=1
  // If not found → 403
  req.businessId = businessId;
  req.userRole = row.role;
  next();
};
```

**Update: `src/routes/auth.js`**
- On login: return `businesses[]` array (join business_users + businesses)
- JWT payload: `{ user_id, email, default_business_id }`

**Create: `src/utils/transaction.js`**
```javascript
async function withTransaction(pool, fn) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    conn.release();
    return result;
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
}
module.exports = { withTransaction };
```

**Create: `src/utils/invoiceNumber.js`**
```javascript
// Generates INV-20260515-0001 style numbers
// Queries count of today's invoices for this business and increments
```

**Create: `src/utils/taxCalculator.js`**
```javascript
// Pure functions: calculateItemTax(item, taxMode), applyRoundOff(total, enabled)
// taxMode = 'CGST+SGST' | 'IGST' | 'No Tax'
// tax_display_mode = 'Tax Inclusive' | 'Tax Exclusive'
```

---

## Step 2 — Products + Inventory Routes

**New file: `src/routes/products.js`**  
Mount at: `/api/v1/b/:businessId/products`  
Middleware chain: `authenticateJWT → requireBusiness`

| Endpoint | What it does |
|---|---|
| `GET /products` | List with `?search=&category_id=&low_stock=true&page=&limit=` |
| `POST /products` | Create product; auto-generate SKU if product_code not provided |
| `GET /products/low-stock` | WHERE current_stock < minimum_stock_alert |
| `GET /products/barcode/:barcode` | Barcode lookup for scanner support |
| `GET /products/code/:code` | SKU lookup |
| `GET /products/:id` | Single product detail |
| `GET /products/:id/report` | Purchase history + sales history + return history tabs |
| `PUT /products/:id` | Update (does NOT change stock — use adjust-stock) |
| `PUT /products/:id/toggle-active` | Soft deactivate |
| `DELETE /products/:id` | Only if no purchase_items or sale_items FK — throw error with message otherwise |
| `POST /products/:id/adjust-stock` | Manual stock adjustment: inserts stock_movements row |
| `GET /products/:id/stock-movements` | Full audit trail |

**New files: `src/routes/categories.js` and `src/routes/units.js`**  
Standard CRUD + toggle-active. No special logic.

**Frontend changes:**
- New page `pages/Inventory.tsx`
- Item search dropdown in Invoices.tsx changes from free-text to `GET /products?search=` debounced call
- Product form: Name, Category, Unit, SKU (auto), Cost Price, Margin %, Sale Price, GST fields (pre-filled from business tax settings)

---

## Step 3 — Enhanced Sales (Normalize items_json → sale_items)

This is the most important structural change. The `invoices` table stays for legacy_bridge compatibility. New sales go into the `sales` + `sale_items` tables.

**Feature flag approach:** Add `?version=v2` to new sale endpoints. Old frontend continues using legacy_bridge → `invoices`. New frontend pages use `/api/v1/b/:businessId/sales`.

**New file: `src/services/sale.service.js`**
```javascript
async function createSale(pool, businessId, saleData) {
  return withTransaction(pool, async (conn) => {
    // 1. Get business settings (tax mode, round_off)
    // 2. Validate stock per item (SELECT current_stock WHERE product_id=?)
    //    - If current_stock < qty AND allow_negative_stock = false → throw INSUFFICIENT_STOCK
    // 3. Calculate totals using taxCalculator.js
    // 4. Generate invoice_no using invoiceNumber.js
    // 5. INSERT into sales
    // 6. For each item: INSERT into sale_items
    //    - DB trigger handles current_stock deduction
    // 7. INSERT stock_movements for each item
    // 8. INSERT day_book entry
    // 9. If amount_due > 0 → update customer balance (future: payment_out table)
    // 10. Return full sale with items
  });
}
```

**New file: `src/routes/sales.js`**

| Endpoint | What it does |
|---|---|
| `POST /sales` | Full atomic transaction (see sale.service.js above) |
| `GET /sales` | List with `?date_from=&date_to=&customer_id=&status=&payment_mode=` |
| `GET /sales/:id` | Detail with items (join sale_items + products) |
| `PUT /sales/:id` | Edit — only if payment_status != 'Paid' AND deleted_at IS NULL |
| `DELETE /sales/:id` | Soft delete (set deleted_at = NOW()); reverse stock via stock_movements |
| `POST /sales/:id/restore` | Clear deleted_at; re-apply stock |
| `POST /sales/:id/record-payment` | Record additional payment; update amount_received, payment_status |
| `POST /sales/quick-cash` | Quick cash sale: no items, no stock impact, just sales + day_book entry |
| `GET /sales/:id/invoice-pdf` | Check if PDF is ready (polls Python worker result) |

**Frontend changes:**
- Invoice creation form: product rows now search from DB
- Payment summary panel: live GST calculation based on business.default_sale_tax_mode
- "Generate Bill" → POST /sales → on success navigate to sale detail for print

---

## Step 4 — Suppliers + Purchases

**New file: `src/services/purchase.service.js`**  
Same transaction pattern as sale.service.js.

```javascript
async function createPurchase(pool, businessId, purchaseData) {
  return withTransaction(pool, async (conn) => {
    // 1. Auto-generate purchase_invoice_no
    // 2. Calculate subtotal + taxes per item + transport + other_charges
    // 3. grand_total = subtotal + taxes + transport + other_charges
    // 4. amount_due = grand_total - amount_paid
    // 5. payment_status = Paid|Partial|Unpaid
    // 6. INSERT into purchases
    // 7. For each item: INSERT into purchase_items
    //    - DB trigger (trg_product_selling_price) auto-calculates selling_price
    //    - DB trigger (trg_purchase_stock_update) adds stock
    // 8. INSERT stock_movements
    // 9. INSERT day_book
    // 10. If amount_due > 0 → create payment_out record (optional, if supplier balance tracking)
  });
}
```

**New files: `src/routes/suppliers.js` and `src/routes/purchases.js`**

Supplier ledger endpoint (`GET /suppliers/:id/ledger`) queries `v_supplier_summary` VIEW and returns:
- Summary block (total invoiced, total paid, balance due)
- All purchase invoices for that supplier (paginated)
- All payment_out entries for that supplier (paginated)
- All purchase returns for that supplier (paginated)

This powers both the Account screen supplier click AND the Reports > Supplier Spend drill-down.

**Frontend changes:**
- New page `pages/Purchases.tsx` (matches Purchase Management UI from reference screenshots)
- New page `pages/Suppliers.tsx`
- Supplier drill-down panel (same layout as account screen)

---

## Step 5 — Payments + Day Book

**New file: `src/routes/payments.js`**

```
POST /payment-in    → record money received from customer OR from supplier (purchase return refund)
GET  /payment-in    → list with date/party filters
POST /payment-out   → record money paid to supplier OR to customer (sale return refund)  
GET  /payment-out   → list with date/party filters
```

**Key logic for payment_in:**
- If `customer_id` is set → normal receipt from customer
- If `supplier_id` is set → supplier refunded us (purchase return cash back)
- Exactly one of the two must be set (validate at app layer)
- After INSERT → write day_book entry (cash_in or bank_in based on payment_mode)

**New file: `src/routes/daybook.js`**
```
GET /day-book           → entries with ?date_from=&date_to=&type= filters
GET /day-book/summary   → aggregated: cash_in, bank_in, cash_out, bank_out for date range
```

Day book is READ ONLY from API. All writes happen inside other service functions (sale.service, purchase.service, etc.). Never expose a `POST /day-book` endpoint — it would allow arbitrary manual entries that bypass business logic.

**Frontend: Account Search screen**  
The 4 tiles (Cash In / Bank In / Cash Out / Bank Out) call `GET /day-book/summary?date=today`.  
Payment Received and Payment Given tables call `GET /payment-in` and `GET /payment-out`.

---

## Step 6 — Returns

**New files: `src/routes/sales-returns.js` and `src/routes/purchase-returns.js`**

**Sales return transaction:**
```javascript
// 1. INSERT into sales_returns
// 2. For each item: INSERT into sales_return_items
//    - DB trigger (trg_sale_return_stock_restore) adds stock back
// 3. INSERT stock_movements (Sale Return In)
// 4. Determine refund_status:
//    - 'Refunded' → also INSERT payment_out (customer_id set, supplier_id NULL)
//    - 'Adjusted' → link to adjusted_in_sale_id, no payment_out
//    - 'Pending' → no payment action yet
// 5. INSERT day_book
```

**Purchase return transaction:**
```javascript
// 1. INSERT into purchase_returns
// 2. For each item: INSERT into purchase_return_items  
//    - DB trigger (trg_purchase_return_stock_deduct) removes stock
// 3. INSERT stock_movements (Purchase Return Out)
// 4. Determine refund_status:
//    - 'Refunded' → INSERT payment_in (supplier_id set, customer_id NULL)
//    - 'Adjusted' → link to adjusted_in_purchase_id
//    - 'Pending' → no payment action
// 5. INSERT day_book
```

---

## Step 7 — Reports (DB-driven)

**New file: `src/routes/reports.js`**

All report endpoints are GET-only with `?from=&to=` date range filters. No writes.

| Endpoint | SQL basis |
|---|---|
| `GET /reports/dashboard` | SUM(grand_total) today + day_book summary + payment totals |
| `GET /reports/sales` | sales grouped by date, with total |
| `GET /reports/sales/by-product` | sale_items GROUP BY product_id ORDER BY SUM(qty) DESC |
| `GET /reports/sales/by-customer` | sales GROUP BY customer_id |
| `GET /reports/purchases` | purchases grouped by date |
| `GET /reports/purchases/by-supplier` | purchases GROUP BY supplier_id → same as supplier-spend |
| `GET /reports/profit-loss` | SUM(sale gross_profit) - SUM(expenses.amount) |
| `GET /reports/stock` | products with current_stock, min_stock, stock_value |
| `GET /reports/gst` | sale_items GST breakup by CGST/SGST/IGST |
| `GET /reports/outstanding/customers` | v_customer_summary WHERE balance_due > 0 |
| `GET /reports/outstanding/suppliers` | v_supplier_summary WHERE balance_due > 0 |

**Dashboard tiles:**  
On mount, frontend fires these 5 parallel calls:
```javascript
Promise.all([
  GET /reports/dashboard,           // today's sales, day balance
  GET /payment-in?date=today,       // payment in tile
  GET /payment-out?date=today,      // payment out tile
  GET /day-book?date=today&limit=10 // recent activity
])
```

---

## Step 8 — Python Worker (Real Implementation)

The existing `python_worker/main.py` is a stub. Replace its contents entirely.

**`python_worker/main.py`** — new structure:
```python
from fastapi import FastAPI, BackgroundTasks
from contextlib import asynccontextmanager
import aiomysql  # async MySQL

app = FastAPI(title="RetailBillbook Worker", version="2.0.0")

# DB pool shared across requests
db_pool = None

@asynccontextmanager
async def lifespan(app):
    global db_pool
    db_pool = await aiomysql.create_pool(host=..., user=..., ...)
    yield
    db_pool.close()

app = FastAPI(lifespan=lifespan)
```

**`python_worker/tasks/invoice_pdf.py`** — new file:
```python
from weasyprint import HTML  # or reportlab for more control
import jinja2

async def generate_invoice_pdf(sale_id: int, business_id: int, tenant_db: str):
    # 1. Fetch sale + items from DB (using db_pool)
    # 2. Render HTML template with Jinja2
    # 3. Convert HTML → PDF with WeasyPrint
    # 4. Save to /tmp/invoices/{sale_id}.pdf
    # 5. Update a job_status table or return URL
```

**New FastAPI routes:**

```python
@app.post("/tasks/generate-invoice-pdf")
async def generate_invoice_pdf_task(payload: InvoiceJobPayload, bg: BackgroundTasks):
    bg.add_task(generate_invoice_pdf, payload.sale_id, payload.business_id)
    return { "job_id": f"pdf_{payload.sale_id}", "status": "queued" }

@app.get("/tasks/status/{job_id}")
async def job_status(job_id: str):
    # Check if file exists at /tmp/invoices/{sale_id}.pdf
    # Return { "status": "ready", "url": "..." } or { "status": "pending" }

@app.post("/tasks/export-excel")
async def export_excel(payload: ExportPayload, bg: BackgroundTasks):
    # Uses openpyxl to generate report .xlsx
    bg.add_task(generate_excel_report, payload)
    return { "job_id": f"export_{payload.report_type}_{payload.business_id}", "status": "queued" }
```

**Node → Python communication:**
```javascript
// In sale.service.js, after successful sale INSERT:
// Fire-and-forget (do not await — keep sale creation fast)
fetch(`http://localhost:8001/tasks/generate-invoice-pdf`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sale_id: saleId, business_id: businessId })
}).catch(err => logger.warn('PDF worker unavailable', err));
// Return sale data immediately; PDF is generated async
```

**Frontend polling:**
```javascript
// After sale created, frontend polls every 2 seconds:
const poll = setInterval(async () => {
  const res = await api.get(`/sales/${saleId}/invoice-pdf`);
  if (res.data.status === 'ready') {
    clearInterval(poll);
    window.open(res.data.url);
  }
}, 2000);
setTimeout(() => clearInterval(poll), 30000); // give up after 30s
```

**`requirements.txt`** — update to add:
```
fastapi==0.115.0
uvicorn==0.30.6
pydantic==2.9.2
aiomysql==0.2.0
weasyprint==62.3
jinja2==3.1.4
openpyxl==3.1.5
```

---

## Step 9 — Business Settings + Tax Panel

**New file: `src/routes/businesses.js`**

```
GET    /businesses                   → list all businesses for logged-in user
POST   /businesses                   → create new business (also creates business_users Owner row)
GET    /businesses/:id               → get business details + tax settings
PUT    /businesses/:id               → update general profile
PUT    /businesses/:id/settings      → update tax settings only (separate endpoint → separate form)
PUT    /businesses/:id/toggle-active → deactivate
```

**Tax settings fields the form must expose:**
- GST Type: GST / NON-GST (toggle)
- Tax Display Mode: Tax Exclusive / Tax Inclusive (toggle)
- Default Sale Tax Mode: CGST+SGST / IGST / No Tax (radio)
- Default CGST Rate: 0 / 2.5 / 6 / 9 / 14 (dropdown, auto-sets SGST to same)
- Default IGST Rate: auto = CGST + SGST
- Show Tax on Invoice: Yes/No toggle
- Round Off Invoice: Yes/No toggle
- Allow Negative Stock: Yes/No toggle
- Low Stock Limit: number input
- Invoice Prefix: text input

When saved, `businesses.default_cgst_rate` etc. are stored. When a user opens the New Product form, the product GST fields pre-fill from these values.

---

## Step 10 — Multi-User Roles

**New file: `src/routes/business-users.js`**

```
GET    /b/:businessId/users                          → list users in this business
POST   /b/:businessId/users/invite                   → create app_users row if email not found, insert business_users
PUT    /b/:businessId/users/:userId/role             → change role (Owner/Admin only)
PUT    /b/:businessId/users/:userId/toggle-active    → suspend access
DELETE /b/:businessId/users/:userId                  → remove (cannot remove last Owner)
```

**Role enforcement middleware:**
```javascript
// src/middleware/requireRole.js
module.exports = (...allowedRoles) => (req, res, next) => {
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' }});
  }
  next();
};

// Usage in routes:
router.delete('/:userId', requireRole('Owner','Admin'), handler);
router.put('/:userId/role', requireRole('Owner'), handler);
router.post('/sale', requireRole('Owner','Admin','Manager','Staff'), handler);
router.delete('/sale/:id', requireRole('Owner','Admin','Manager'), handler);
```

---

## Final Folder Structure After All Steps

```
simple-bill/
├── [root — Frontend React+Vite]
│   ├── pages/
│   │   ├── Dashboard.tsx         updated: real DB stats via 5 parallel calls
│   │   ├── Invoices.tsx          updated: product search from DB, GST panel, real totals
│   │   ├── Customers.tsx         existing (minor updates for ledger view)
│   │   ├── Inventory.tsx         NEW step 2
│   │   ├── Purchases.tsx         NEW step 4
│   │   ├── Suppliers.tsx         NEW step 4
│   │   ├── DayBook.tsx           NEW step 5
│   │   ├── Returns.tsx           NEW step 6
│   │   ├── Reports.tsx           updated step 7 (real DB data)
│   │   └── Settings.tsx          updated step 9 (tax panel)
│   └── services/
│       └── dataService.ts        migrate actions → REST calls per feature
│
├── backend/
│   ├── src/
│   │   ├── routes/               one file per module (see above)
│   │   ├── services/             sale.service.js, purchase.service.js
│   │   ├── utils/                transaction.js, invoiceNumber.js, taxCalculator.js
│   │   ├── middleware/           auth.js (existing), business.js (new), requireRole.js (new)
│   │   ├── legacy_bridge.js      keep until all frontend pages migrated (empty gradually)
│   │   └── server.js             mount all new routes under /api/v1/
│   └── sql/
│       ├── 001_init.sql          existing
│       ├── 002_phase0_add_businesses.sql
│       ├── 003_phase0_add_business_users.sql
│       └── 004_retail_billbook_v3.sql  (v3 schema with IF NOT EXISTS)
│
└── python_worker/
    ├── main.py                   rewritten (async, real tasks)
    ├── tasks/
    │   ├── invoice_pdf.py        new
    │   └── report_export.py      new
    ├── templates/
    │   └── invoice.html          Jinja2 HTML template for PDF
    ├── db/
    │   └── connection.py         aiomysql pool
    └── requirements.txt          updated with weasyprint, openpyxl, aiomysql
```

---

## Key Rules for Every New Route File

1. Every query MUST include `AND business_id = req.businessId` — no exceptions
2. Soft-delete queries MUST include `AND deleted_at IS NULL` unless `?include_deleted=true`
3. All writes to `sales`, `purchases`, `returns` MUST also write a `day_book` row inside the same transaction
4. Stock changes MUST also write a `stock_movements` row (triggers handle `current_stock`, app writes the audit row)
5. `amount_due` is NEVER stored — always computed as `grand_total - amount_paid` (or `amount_received` for sales)
6. Response format ALWAYS: `{ success: true, data: ..., message: "..." }` or `{ success: false, error: { code, message, field? } }`
7. Python worker calls are ALWAYS fire-and-forget — never await them in a request handler
