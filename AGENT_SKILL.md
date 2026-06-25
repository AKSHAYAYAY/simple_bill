# RetailBillbook — Project Skill File for AI Coding Agent
### Give this file to your coding agent at the start of every session

---

## Project Identity

**Name:** RetailBillbook  
**What it is:** Indian retail + wholesale billing SaaS. Multi-tenant, multi-business, GST-aware.  
**Repo:** simple-bill (being upgraded)  
**Live URL:** simple-bill-42gz.vercel.app (old version, do not reference)

---

## Stack — Non-Negotiable

| Layer | Technology | Version |
|---|---|---|
| Frontend | React + Vite + TypeScript | 18+ |
| Backend | Node.js + Express | 20+ |
| Python Worker | FastAPI + Uvicorn | FastAPI 0.115 |
| Database | MySQL (InnoDB) | 8.0+ |
| Auth | JWT (access token 15 min, refresh 7 days) | jsonwebtoken |
| Validation | Zod (Node) + Pydantic (Python) | latest |
| Query style | Raw SQL or Knex.js — NO ORM | — |

**Do NOT suggest:** Prisma, TypeORM, Sequelize, GraphQL, MongoDB, Redis (unless explicitly asked).

---

## Database Schema

**The authoritative schema is `retail_billbook_schema_v3.sql`.** Every table, column, enum, and index in that file is correct. Do not invent columns. Do not change column names. When writing queries, use exact column names from the schema.

### Tables (complete list)
```
app_users          businesses         business_users
customers          suppliers          categories
units              products           purchases
purchase_items     purchase_returns   purchase_return_items
sales              sale_items         sales_returns
sales_return_items payment_in         payment_out
day_book           expense_categories expenses
income_categories  incomes            stock_movements
```

### Views (pre-built, use them)
```
v_supplier_summary    → powers supplier drill-down + supplier spend report
v_customer_summary    → powers customer drill-down + customer outstanding report
```

### Critical schema rules to remember
- `amount_due` is NOT stored on `purchases` or `sales` — compute it: `grand_total - amount_paid` (purchases) or `grand_total - amount_received` (sales)
- `gross_profit` is NOT stored on `sale_items` — compute: `(selling_price - purchase_price) * quantity`
- `total_stock_value` is NOT stored on `products` — compute: `current_stock * purchase_price`
- `gst_percentage` is NOT on `products` — derive: `cgst_percentage + sgst_percentage` (or use `igst_percentage`)
- Soft delete: `purchases.deleted_at` and `sales.deleted_at` — always add `AND deleted_at IS NULL` to queries
- `payment_in`: either `customer_id` OR `supplier_id` must be set, never both (enforced at app layer)
- `payment_out`: either `supplier_id` OR `customer_id` must be set, never both (enforced at app layer)

---

## API Conventions

**Base URL:** `/api/v1`  
**Business-scoped routes prefix:** `/api/v1/b/:businessId/`  
**Auth header:** `Authorization: Bearer <jwt_access_token>`  
**Business header:** `X-Business-Id: <businessId>`

### Standard response envelope — ALWAYS use this shape
```json
// Success
{ "success": true, "data": { ... }, "message": "Created successfully" }

// Success list
{ "success": true, "data": [ ... ], "pagination": { "page": 1, "limit": 20, "total": 340, "total_pages": 17 } }

// Error
{ "success": false, "error": { "code": "INSUFFICIENT_STOCK", "message": "...", "field": "items[2].quantity" } }
```

### HTTP status codes
- 200 OK, 201 Created, 204 No Content (delete)
- 400 Validation error, 401 Unauthenticated, 403 Wrong business/role
- 404 Not found, 409 Conflict (duplicate invoice no), 422 Business logic error (stock, credit limit)
- 500 Internal error

### Error codes (use these exact strings)
```
INSUFFICIENT_STOCK   DUPLICATE_INVOICE_NO   PARTY_NOT_FOUND
PRODUCT_NOT_FOUND    CREDIT_LIMIT_EXCEEDED  INVALID_BUSINESS
AUTH_EXPIRED         VALIDATION_ERROR        ROLE_FORBIDDEN
SOFT_DELETED         LAST_OWNER_CANNOT_LEAVE
```

---

## Middleware Chain (Every Protected Business Route)

```javascript
router.use(authenticateJWT);      // verify token, attach req.user
router.use(resolveBusiness);      // verify user owns businessId, attach req.businessId + req.userRole
// Optional per route:
router.delete('/:id', requireRole('Owner','Admin','Manager'), handler);
```

**`resolveBusiness` middleware must:**
1. Read businessId from `req.headers['x-business-id']`
2. Query: `SELECT role FROM business_users WHERE user_id=? AND business_id=? AND is_active=1`
3. If not found → 403 INVALID_BUSINESS
4. Attach `req.businessId` and `req.userRole`

---

## Role Permissions

| Role | Read | Write | Delete | Manage Users | Settings |
|---|---|---|---|---|---|
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manager | ✅ | ✅ | ✅ | ❌ | ❌ |
| Accountant | ✅ | ✅ | ❌ | ❌ | ❌ |
| Staff | ✅ | Sales only | ❌ | ❌ | ❌ |

---

## Transaction Pattern (Sale, Purchase, Returns — ALWAYS atomic)

```javascript
// src/utils/transaction.js
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
```

**Every sale, purchase, or return MUST:**
1. Insert main record (sales / purchases / sales_returns / purchase_returns)
2. Insert item records (sale_items / purchase_items / etc.)
3. DB triggers handle `current_stock` update automatically
4. App must ALSO insert `stock_movements` row with `stock_before` and `stock_after`
5. App must ALSO insert `day_book` row

All 5 steps inside ONE transaction. If any step fails, everything rolls back.

---

## Day Book Rules

- Day book is APPEND ONLY — never UPDATE or DELETE rows
- Every financial transaction writes a day_book row inside its own transaction
- `cash_in` / `bank_in`: set based on `payment_mode` ('Cash' → cash_in, everything else → bank_in)
- `reference_type` must be set ('sales', 'purchases', 'payment_in', 'payment_out', 'expenses', 'incomes', 'sales_returns', 'purchase_returns')
- `reference_id` must be the PK of the source record
- There is NO `POST /day-book` endpoint — writes only happen via service functions

---

## GST Calculation Logic

```javascript
// src/utils/taxCalculator.js

function calculateItemTax(item, taxMode, taxDisplayMode) {
  const rate = (taxMode === 'IGST') ? item.igst_percentage : (item.cgst_percentage + item.sgst_percentage);
  
  if (taxDisplayMode === 'Tax Inclusive') {
    // Price already includes GST — extract it
    const basePrice = item.selling_price / (1 + rate / 100);
    const taxAmount = item.selling_price - basePrice;
    return { base: round2(basePrice), tax: round2(taxAmount) };
  } else {
    // Tax Exclusive — add tax on top
    const taxAmount = item.selling_price * rate / 100;
    return { base: item.selling_price, tax: round2(taxAmount) };
  }
}

function applyRoundOff(rawTotal, enabled) {
  if (!enabled) return { round_off: 0, grand_total: rawTotal };
  const rounded = Math.round(rawTotal);
  return { round_off: round2(rounded - rawTotal), grand_total: rounded };
}

function round2(n) { return Math.round(n * 100) / 100; }
```

**Tax mode comes from `businesses.default_sale_tax_mode`.**  
User can override per-item at billing time.  
If `gst_type = 'NON_GST'` → all tax percentages = 0.

---

## Stock Validation (Before Sale — MANDATORY)

```javascript
async function validateStock(conn, businessId, items) {
  for (const [i, item] of items.entries()) {
    if (!item.product_id) continue; // custom/ad-hoc item, skip
    const [rows] = await conn.execute(
      'SELECT current_stock, allow_negative_stock, product_name FROM products WHERE product_id=? AND business_id=?',
      [item.product_id, businessId]
    );
    if (!rows.length) throw new AppError('PRODUCT_NOT_FOUND', `Product ${item.product_id} not found`);
    const product = rows[0];
    if (!product.allow_negative_stock && product.current_stock < item.quantity) {
      throw new AppError('INSUFFICIENT_STOCK',
        `${product.product_name} has only ${product.current_stock} units. Requested: ${item.quantity}`,
        `items[${i}].quantity`
      );
    }
  }
}
```

Also check `businesses.allow_negative_stock` as a global override before per-product check.

---

## Invoice Number Generation

```javascript
// src/utils/invoiceNumber.js
async function generateInvoiceNo(conn, businessId, prefix) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [[{ count }]] = await conn.execute(
    'SELECT COUNT(*) as count FROM sales WHERE business_id=? AND DATE(invoice_date) = CURDATE()',
    [businessId]
  );
  const seq = String(count + 1).padStart(4, '0');
  return `${prefix}-${today}-${seq}`;
  // Example: INV-20260515-0001
}
```

Call this INSIDE the transaction before the INSERT to avoid race conditions.

---

## Python Worker Contract

**Node calls Python via HTTP (internal only, never exposed to browser).**

```javascript
// Fire and forget pattern — ALWAYS in Node
fetch('http://localhost:8001/tasks/generate-invoice-pdf', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sale_id, business_id, tenant_db })
}).catch(err => logger.warn('PDF worker unavailable', err));
// Do NOT await — return the sale response immediately
```

**Python worker endpoints Node may call:**
```
POST /tasks/generate-invoice-pdf    → { sale_id, business_id, tenant_db }
POST /tasks/export-excel            → { report_type, business_id, date_from, date_to }
GET  /tasks/status/:job_id          → returns { status: "pending"|"ready"|"error", url? }
GET  /health                        → { status: "ok" }
```

**Python gets its own aiomysql connection pool — it does NOT share Node's pool.**

---

## Frontend API Call Pattern

```typescript
// services/api.ts — base Axios instance
const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Authorization': `Bearer ${getToken()}`, 'X-Business-Id': getBusinessId() }
});

// All calls follow this pattern:
const { data } = await api.get(`/b/${businessId}/products`, { params: { search, page, limit } });
const products = data.data;  // data.data because envelope wraps in data property
```

**Product search in sale/purchase forms:**
```typescript
// Debounced — fires 300ms after user stops typing
const searchProducts = useDebouncedCallback(async (q: string) => {
  if (q.length < 2) return;
  const res = await api.get(`/b/${businessId}/products`, { params: { search: q, limit: 20 } });
  setProductOptions(res.data.data);
}, 300);
// Each product option includes: product_id, product_name, selling_price, current_stock, unit_name, cgst_percentage, sgst_percentage, igst_percentage
// Show "(Stock: N)" next to product name in dropdown
```

---

## Existing Files — Do Not Break

| File | Status | Rule |
|---|---|---|
| `backend/src/legacy_bridge.js` | Keep running | Old frontend uses it. Do not delete. Gradually empty as frontend migrates. |
| `backend/src/routes/auth.js` | Keep + extend | Add businesses[] to login response |
| `backend/src/routes/customers.js` | Keep + extend | Update to use businessId from JWT |
| `backend/src/routes/invoices.js` | Keep running | Old invoices endpoint. New sales go to /sales |
| `backend/src/db/pool.js` | Keep | All new code imports the same pool |
| `pages/Login.tsx` | Keep | No changes needed |
| `pages/AdminDashboard.tsx` | Keep | SaaS admin portal, separate from tenant features |

---

## Coding Standards

**Node.js:**
- Use `async/await` everywhere, never callbacks
- Wrap all route handlers in `asyncHandler(handler)` (already exists in `src/middleware/async-handler.js`)
- All errors thrown as `new AppError(code, message, field?)` — caught by global error middleware
- All list endpoints must support `?page=1&limit=20&sort_by=created_at&sort_order=desc`
- Never use `SELECT *` — always name columns explicitly

**TypeScript (Frontend):**
- Define types for all API response shapes in `types.ts`
- Use React Query for server state (`useQuery`, `useMutation`)
- Form state via React Hook Form
- No `any` types

**Python:**
- All DB calls use `async with db_pool.acquire() as conn`
- All endpoints validate input with Pydantic models
- PDF templates in `python_worker/templates/` as Jinja2 HTML files
- Log all errors with context (sale_id, business_id)

---

## What NOT to Do

- ❌ Do NOT store `amount_due` — always derive it
- ❌ Do NOT write to `day_book` from a route handler directly — only from service functions inside transactions
- ❌ Do NOT expose Python worker port externally — internal HTTP only
- ❌ Do NOT await Python worker calls in Node request handlers
- ❌ Do NOT query without `AND business_id = ?` scope
- ❌ Do NOT query sales/purchases without `AND deleted_at IS NULL`
- ❌ Do NOT generate invoice numbers outside a transaction
- ❌ Do NOT put business logic in Express route handlers — only in service files
- ❌ Do NOT use `items_json` for new sales — that is legacy only
- ❌ Do NOT delete `legacy_bridge.js` until the frontend is fully migrated

---

## Quick Reference: Which Table Powers Which Screen

| UI Screen | Primary Table | Supporting |
|---|---|---|
| Dashboard tiles | `day_book` (summary) | `sales`, `payment_in`, `payment_out` |
| Account screen (party list) | `customers` + `suppliers` | `v_customer_summary`, `v_supplier_summary` |
| Account search (4 tiles) | `day_book` | — |
| Supplier ledger drill-down | `v_supplier_summary` | `purchases`, `payment_out` |
| Customer ledger drill-down | `v_customer_summary` | `sales`, `payment_in` |
| New Sale | `sales` + `sale_items` | `products` (search), `customers` (search) |
| New Purchase | `purchases` + `purchase_items` | `products`, `suppliers` |
| Inventory list | `products` | `categories`, `units` |
| Item Report (4 tabs) | `purchase_items`, `sale_items`, `purchase_return_items`, `sales_return_items` | — |
| Day Book | `day_book` | — |
| Reports > Fast Moving | `sale_items` GROUP BY product | `products` |
| Reports > Supplier Spend | `v_supplier_summary` | — |
| Reports > GST | `sale_items` | `sales` |
| Reports > Profit/Loss | `sale_items` (profit) + `expenses` | `incomes` |
