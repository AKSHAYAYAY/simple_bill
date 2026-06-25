# SimpleBill V3 Architecture Plan: Per-Tenant Database Model

This document outlines the architecture and implementation steps to shift SimpleBill to a true multi-tenant setup (**Model B**). Under this model, **every business gets its own isolated MySQL database**, while a **single unified backend server** manages traffic and dynamically routes queries to the correct database.

---

## 1. Core Architecture Design

### The "Two-Tier" Database Strategy
You will have one MySQL server instance, but it will contain two types of databases:

1. **Master Database (`simplebill_master`)**
   - Manages global data across the entire SaaS platform.
   - Tables: `app_users`, `saas_license_keys`, `businesses` (mapping users to their databases).
   - *Purpose*: Authentication, subscription management, and tenant discovery.

2. **Tenant Databases (`sb_{tenant_id}_db`)**
   - One dedicated database per user/business.
   - Example: `sb_biz_101_db`, `sb_biz_102_db`.
   - Contains exactly the schema defined in `retail_billbook_schema_v3.sql`.
   - *Purpose*: 100% isolation of business data (Invoices, Customers, Stock).

### Single Unified Server (Node.js/Express)
You only run **one Node.js server**. The server acts as a traffic router. It knows which database to talk to based on who is logged in.

---

## 2. Dynamic Database Provisioning (The Onboarding Flow)

When a new user signs up or activates a license, the Node.js server must automatically set up their workspace.

**Step-by-Step Flow:**
1. **User Registers:** User submits email, password, and license key.
2. **Master DB Entry:** Insert user into `simplebill_master.app_users`.
3. **Generate Tenant ID:** Generate a unique ID (e.g., `biz_101`).
4. **Database Creation:** Server runs `CREATE DATABASE sb_biz_101_db`.
5. **Schema Execution:** Server connects to the newly created `sb_biz_101_db` and executes the `retail_billbook_schema_v3.sql` script to create all tables (Invoices, Products, etc.).
6. **Save Mapping:** Save the mapping (`user_id` -> `sb_biz_101_db`) in the Master Database.

---

## 3. Request Routing & Connection Management

Since there is only one Node.js server and potentially hundreds of databases, we need a robust routing mechanism. We will follow the conventions outlined in `AGENT_SKILL.md`.

### API URL Structure
All routes belonging to a specific business will be prefixed with `/b/:businessId`. For example:
- `GET /api/v1/b/:businessId/invoices`
- `POST /api/v1/b/:businessId/customers`

### The Middleware Chain
Every protected business route goes through a strict middleware chain:
```javascript
router.use(authenticateJWT);      // 1. Verify token, attach req.user
router.use(resolveBusiness);      // 2. Verify user owns businessId, attach pool
// Optional per route:
router.delete('/:id', requireRole('Owner','Admin','Manager'), handler);
```

**`resolveBusiness` Middleware Responsibilities:**
1. Read `businessId` from the URL params or `req.headers['x-business-id']`.
2. Connect to the **Master DB** and verify that `req.user.user_id` has access to `businessId` (via `business_users` table).
3. Retrieve the specific `tenant_db` name (e.g., `sb_biz_101_db`) for that business.
4. Fetch or create a connection pool for `sb_biz_101_db` using the **Dynamic Connection Pool Manager**.
5. Attach `req.businessId`, `req.userRole`, and most importantly `req.tenantDb` (the connection pool) to the request.

### Dynamic Connection Pool Manager (LRU Cache)
To prevent the server from opening too many connections and running out of memory:
- It caches MySQL connection pools in memory.
- If a user from `biz_101` makes a request, it checks if a pool for `sb_biz_101_db` exists. If yes, it reuses it. If no, it creates a new one.
- *Best Practice*: Use an LRU (Least Recently Used) cache to close and remove database connections for tenants who haven't been active in the last 2 hours.

---

## 4. Execution Plan (Step-by-Step Transition)
Based on `EXECUTION_PLAN.md`, here are the phases for implementation:

### Phase 0: Schema Migration
- Create `businesses` and `business_users` in the master DB.
- Backfill existing users into the new multi-tenant architecture.

### Phase 1: Backend Restructure & Middleware
- Build the `resolveBusiness` middleware to intercept `/b/:businessId` and inject the tenant database pool.
- Create `src/utils/transaction.js` to ensure atomic transactions across sales, stock, and daybook updates.

### Phase 2: Products + Inventory Routes (`/api/v1/b/:businessId/products`)
- Implement CRUD for products, categories, and units.
- Implement stock adjustments (`/products/:id/adjust-stock`) and audit trails (`stock_movements`).

### Phase 3: Enhanced Sales (Normalized `sale_items`)
- Deprecate the legacy `items_json` blob.
- Implement `POST /sales` as a full atomic transaction:
  1. Validate stock.
  2. Insert into `sales` and `sale_items`.
  3. Deduct stock and insert into `stock_movements`.
  4. Write to `day_book`.
  5. Fire-and-forget call to Python worker for PDF generation.

### Phase 4: Suppliers + Purchases
- Implement `POST /purchases` matching the atomic transaction logic of sales, but updating stock upwards.
- Build Supplier Ledgers combining `v_supplier_summary`, purchases, and `payment_out`.

### Phase 5: Payments + Day Book
- Implement `payment_in` (cash from customers) and `payment_out` (cash to suppliers).
- Integrate `day_book` logic so that all financial changes append to the day book automatically.

### Phase 6: Python Worker Integration
- Set up FastAPI worker to handle heavy tasks asynchronously (e.g., `POST /tasks/generate-invoice-pdf`).
- This ensures the Node.js event loop is never blocked by PDF generation.

---

## Why this Architecture? (Benefits)
1. **Ultimate Security:** A bug in the code cannot accidentally expose Business A's invoices to Business B. They are in physically different databases.
2. **Easy Backups:** You can backup/restore a specific business's data (`mysqldump sb_biz_101_db`) without touching the rest of the system.
3. **Clean Schema:** No more messy table prefixes (`sbfreeakshay_invoices`). Tables are just named `invoices`, `customers`, etc.
4. **Scalability:** A single MySQL server can comfortably host 1000+ lightweight schemas. If one server fills up, you can easily put new tenant databases on a second MySQL server.
