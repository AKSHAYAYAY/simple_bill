-- ============================================================
-- Run on: TENANT databases (sb_biz_{id}_db) only.
-- This is executed automatically on registration. Never run manually.
-- ============================================================

-- =========================================
-- INDIAN RETAIL + WHOLESALE BILLING SOFTWARE
-- MYSQL DATABASE DESIGN  —  VERSION 3
-- =========================================
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │  MODEL B  —  Per-Tenant Database (Shared Server, Separate DBs)  │
-- └─────────────────────────────────────────────────────────────────┘
--  Architecture:
--    One MySQL server → one database per tenant
--    Naming convention:  {tenant_prefix}_db
--    Examples:  acme_db  |  ram_db  |  shop123_db
--
--  Auto-provision on signup (run once per tenant):
--    CREATE DATABASE IF NOT EXISTS {tenant_prefix}_db
--        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--    USE {tenant_prefix}_db;
--    SOURCE retail_billbook_v3.sql;
--
--  Isolation:  schema-level — a bug in acme_db cannot touch ram_db
--  Backup:     mysqldump acme_db  (one schema at a time)
--  Scale:      ~500 schemas comfortably on one server
-- ─────────────────────────────────────────────────────────────────
-- Changes from v2:
--  [ARCH]  Model B multi-tenant: one database per tenant; schema is identical across all tenants
--  [NEW]   business_users        — multi-user per business with roles (Owner/Admin/Manager/Staff/Accountant)
--  [NEW]   income_categories     — income type lookup table
--  [NEW]   incomes               — income tracking (was entirely missing)
--  [FIX]   payment_in            — customer_id now nullable; added supplier_id (for purchase-return refunds)
--  [FIX]   payment_out           — supplier_id now nullable; added customer_id (for sales-return refunds)
--  [FIX]   sales_returns         — added payment_out_id FK + adjusted_in_sale_id FK + updated_at
--  [FIX]   purchase_returns      — added payment_in_id FK + adjusted_in_purchase_id FK + updated_at
--  [FIX]   customers             — added opening_balance_type + updated_at
--  [FIX]   suppliers             — added opening_balance_type + updated_at
--  [FIX]   sale_items            — added free_quantity + item_name (custom-item / no product_id fallback)
--                                  removed gross_profit (derived: (selling_price-purchase_price)*quantity)
--  [FIX]   sales_return_items    — added item_name (mirrors sale_items)
--  [FIX]   purchase_items        — added discount_percentage + discount_amount
--  [FIX]   businesses            — added is_active; removed default_gst_percentage (redundant with default_cgst/sgst/igst)
--  [FIX]   categories            — added is_active
--  [FIX]   expense_categories    — added is_active
--  [FIX]   products              — removed gst_percentage (redundant; keep cgst+sgst+igst)
--                                  removed total_stock_value (derived: current_stock * purchase_price)
--                                  renamed allow_negative_selling → allow_negative_stock (naming consistency)
--                                  added UNIQUE(business_id, product_code)
--  [FIX]   purchases             — added updated_at, deleted_at (soft delete); removed amount_due (derived)
--  [FIX]   sales                 — added updated_at, deleted_at (soft delete); removed amount_due (derived)
--  [FIX]   day_book              — added reference_type (polymorphic companion to reference_id)
--  [FIX]   stock_movements       — added reference_type (polymorphic companion to reference_id)
--  [IDX]   Composite (business_id, date) indexes on all major date columns
--  [IDX]   Composite (business_id, barcode) index on products
--  [IDX]   UNIQUE (business_id, invoice_no) on sales, purchases, and all return tables
-- ─────────────────────────────────────────────────────────────────
-- ENUM REFERENCE  (MySQL has no named types; values are defined inline but standardised here)
--
--  payment_mode — invoice level (supports credit terms):
--      'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Credit'
--      Tables: purchases, sales, purchase_returns, sales_returns
--
--  payment_mode — transaction level (actual payment, no credit):
--      'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Cheque'
--      Tables: payment_in, payment_out, expenses, incomes, day_book
--
--  refund_status_enum:
--      'Refunded' | 'Pending' | 'Adjusted'
--      Tables: purchase_returns, sales_returns
--
--  opening_balance_type_enum:
--      'Payable'    — you owe them money  (normal for suppliers)
--      'Receivable' — they owe you money  (normal for customers)
--      Tables: customers, suppliers
-- =========================================

-- =========================================
-- BUSINESS OWNER / APP USER
-- =========================================

CREATE TABLE IF NOT EXISTS app_users (
    user_id       BIGINT        PRIMARY KEY AUTO_INCREMENT,
    full_name     VARCHAR(150)  NOT NULL,
    email         VARCHAR(150)  UNIQUE,
    phone         VARCHAR(20)   UNIQUE,
    password_hash VARCHAR(255),
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- BUSINESSES
-- Changes: added is_active; removed default_gst_percentage (redundant)
-- =========================================

CREATE TABLE IF NOT EXISTS businesses (
    business_id            BIGINT        PRIMARY KEY AUTO_INCREMENT,
    user_id                BIGINT        NOT NULL,

    business_name          VARCHAR(200)  NOT NULL,
    business_type          ENUM('Retail','Wholesale','Retail+Wholesale') DEFAULT 'Retail',
    owner_name             VARCHAR(150),
    gst_number             VARCHAR(30),
    gst_type               ENUM('GST','NON_GST') DEFAULT 'GST',

    address                TEXT,
    city                   VARCHAR(100),
    state                  VARCHAR(100),
    pincode                VARCHAR(20),
    phone                  VARCHAR(20),
    email                  VARCHAR(150),

    invoice_prefix         VARCHAR(20)   DEFAULT 'INV',

    -- allow_negative_stock  : global kill-switch (stock level may go negative)
    -- allow_negative_selling: global default for whether to allow sale when stock = 0
    --   (can be overridden per-product via products.allow_negative_stock)
    allow_negative_stock   BOOLEAN       DEFAULT FALSE,
    allow_negative_selling BOOLEAN       DEFAULT FALSE,
    low_stock_limit        INT           DEFAULT 10,

    -- ── TAX SETTINGS (Business Settings Panel) ──────────────────
    tax_display_mode       ENUM('Tax Inclusive','Tax Exclusive')
                           DEFAULT 'Tax Exclusive',
    default_sale_tax_mode  ENUM('CGST+SGST','IGST','No Tax')
                           DEFAULT 'CGST+SGST',

    -- Per-component default GST rates pre-filled when adding a new product.
    -- default_gst_percentage removed (v3): redundant — derive from cgst+sgst or igst.
    default_cgst_rate      DECIMAL(5,2)  DEFAULT 0,
    default_sgst_rate      DECIMAL(5,2)  DEFAULT 0,
    default_igst_rate      DECIMAL(5,2)  DEFAULT 0,

    show_tax_on_invoice    BOOLEAN       DEFAULT TRUE,
    round_off_invoice      BOOLEAN       DEFAULT TRUE,
    -- ────────────────────────────────────────────────────────────

    is_active              BOOLEAN       DEFAULT TRUE,   -- [NEW v3]
    created_at             TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_business_user FOREIGN KEY (user_id)
        REFERENCES app_users(user_id) ON DELETE CASCADE
);

-- =========================================
-- BUSINESS USERS   [NEW TABLE — v3]
-- Multi-user access per business with roles.
-- A single app_user can be a member of multiple businesses.
-- =========================================

CREATE TABLE IF NOT EXISTS business_users (
    business_user_id BIGINT       PRIMARY KEY AUTO_INCREMENT,
    business_id      BIGINT       NOT NULL,
    user_id          BIGINT       NOT NULL,

    role             ENUM('Owner','Admin','Manager','Accountant','Staff')
                     DEFAULT 'Staff',

    is_active        BOOLEAN      DEFAULT TRUE,
    invited_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    joined_at        TIMESTAMP    NULL,

    -- A user can hold only one role per business
    UNIQUE KEY uq_business_user (business_id, user_id),

    CONSTRAINT fk_bu_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id) ON DELETE CASCADE,

    CONSTRAINT fk_bu_user FOREIGN KEY (user_id)
        REFERENCES app_users(user_id) ON DELETE CASCADE
);

-- =========================================
-- CUSTOMERS
-- Changes: added opening_balance_type + updated_at
-- =========================================

CREATE TABLE IF NOT EXISTS customers (
    customer_id          BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id          BIGINT        NOT NULL,
    customer_name        VARCHAR(200)  NOT NULL,
    company_name         VARCHAR(200),
    gst_number           VARCHAR(30),
    customer_type        ENUM('Retail Customer','Wholesale Customer')
                         DEFAULT 'Retail Customer',
    phone                VARCHAR(20),
    alternate_phone      VARCHAR(20),
    email                VARCHAR(150),
    address              TEXT,
    city                 VARCHAR(100),
    state                VARCHAR(100),
    pincode              VARCHAR(20),
    opening_balance      DECIMAL(15,2) DEFAULT 0,

    -- opening_balance_type: 'Receivable' = customer owes you (normal for customers)
    --                       'Payable'    = you owe the customer (advance-payment case)
    opening_balance_type ENUM('Payable','Receivable') DEFAULT 'Receivable',  -- [NEW v3]

    credit_limit         DECIMAL(15,2) DEFAULT 0,
    is_active            BOOLEAN       DEFAULT TRUE,
    created_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP              -- [NEW v3]
                         ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_customer_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id) ON DELETE CASCADE
);

-- =========================================
-- SUPPLIERS
-- Changes: added opening_balance_type + updated_at
-- =========================================

CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id          BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id          BIGINT        NOT NULL,
    supplier_name        VARCHAR(200)  NOT NULL,
    company_name         VARCHAR(200),
    gst_number           VARCHAR(30),
    phone                VARCHAR(20),
    alternate_phone      VARCHAR(20),
    email                VARCHAR(150),
    address              TEXT,
    city                 VARCHAR(100),
    state                VARCHAR(100),
    pincode              VARCHAR(20),
    opening_balance      DECIMAL(15,2) DEFAULT 0,

    -- opening_balance_type: 'Payable'    = you owe supplier (normal for suppliers)
    --                       'Receivable' = supplier owes you (advance-payment case)
    opening_balance_type ENUM('Payable','Receivable') DEFAULT 'Payable',     -- [NEW v3]

    is_active            BOOLEAN       DEFAULT TRUE,
    created_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP              -- [NEW v3]
                         ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_supplier_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id) ON DELETE CASCADE
);

-- =========================================
-- CATEGORIES
-- Changes: added is_active
-- =========================================

CREATE TABLE IF NOT EXISTS categories (
    category_id   BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id   BIGINT        NOT NULL,
    category_name VARCHAR(150)  NOT NULL,
    description   TEXT,
    is_active     BOOLEAN       DEFAULT TRUE,                                 -- [NEW v3]

    CONSTRAINT fk_category_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id) ON DELETE CASCADE
);

-- =========================================
-- UNITS
-- (no changes from v2)
-- =========================================

CREATE TABLE IF NOT EXISTS units (
    unit_id     BIGINT       PRIMARY KEY AUTO_INCREMENT,
    business_id BIGINT       NOT NULL,
    unit_name   VARCHAR(50)  NOT NULL,
    short_name  VARCHAR(20),

    CONSTRAINT fk_unit_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id) ON DELETE CASCADE
);

-- =========================================
-- PRODUCTS / INVENTORY
-- Changes:
--   removed gst_percentage      (redundant; use cgst + sgst + igst)
--   removed total_stock_value   (derived: current_stock * purchase_price)
--   renamed allow_negative_selling → allow_negative_stock (naming consistency with businesses table)
--   added UNIQUE(business_id, product_code)
-- =========================================

CREATE TABLE IF NOT EXISTS products (
    product_id           BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id          BIGINT        NOT NULL,
    category_id          BIGINT,
    unit_id              BIGINT,

    product_name         VARCHAR(200)  NOT NULL,
    product_code         VARCHAR(100),              -- SKU / auto-generated in UI
    barcode              VARCHAR(100),
    item_description     TEXT,

    purchase_price       DECIMAL(15,2) DEFAULT 0,
    profit_percentage    DECIMAL(8,2)  DEFAULT 0,
    selling_price        DECIMAL(15,2) DEFAULT 0,

    current_stock        DECIMAL(15,2) DEFAULT 0,
    minimum_stock_alert  DECIMAL(15,2) DEFAULT 10,

    -- gst_percentage removed (v3): redundant — derive as cgst + sgst OR igst
    cgst_percentage      DECIMAL(5,2)  DEFAULT 0,
    sgst_percentage      DECIMAL(5,2)  DEFAULT 0,
    igst_percentage      DECIMAL(5,2)  DEFAULT 0,

    hsn_code             VARCHAR(30),

    -- total_stock_value removed (v3): derived — query as current_stock * purchase_price

    -- allow_negative_stock: renamed from allow_negative_selling (v3) for naming consistency
    --   TRUE = this product can be sold even when its stock is 0 or would go negative
    allow_negative_stock BOOLEAN       DEFAULT FALSE,                         -- [RENAMED v3]

    is_active            BOOLEAN       DEFAULT TRUE,
    created_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP,

    -- Enforce uniqueness of SKU within a business
    UNIQUE KEY uq_product_code (business_id, product_code),                  -- [NEW v3]

    CONSTRAINT fk_product_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id) ON DELETE CASCADE,

    CONSTRAINT fk_product_category FOREIGN KEY (category_id)
        REFERENCES categories(category_id) ON DELETE SET NULL,

    CONSTRAINT fk_product_unit FOREIGN KEY (unit_id)
        REFERENCES units(unit_id) ON DELETE SET NULL
);

-- =========================================
-- PURCHASES
-- Changes: added updated_at, deleted_at (soft delete); removed amount_due (derived)
-- NOTE: amount_due is derived — compute in application as: grand_total - amount_paid
-- =========================================

CREATE TABLE IF NOT EXISTS purchases (
    purchase_id         BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id         BIGINT        NOT NULL,
    supplier_id         BIGINT        NOT NULL,

    purchase_invoice_no VARCHAR(100)  NOT NULL,
    supplier_invoice_no VARCHAR(100),
    purchase_date       DATE          NOT NULL,

    payment_mode        ENUM('Cash','UPI','Card','Bank Transfer','Cheque','Credit')
                        DEFAULT 'Cash',

    -- Invoice-level transport (Bhada) — NOT per item
    transport_cost      DECIMAL(15,2) DEFAULT 0,
    transport_paid_by   ENUM('Business','Supplier') DEFAULT 'Business',
    transport_vehicle_no VARCHAR(50),
    transport_notes     TEXT,

    loading_cost        DECIMAL(15,2) DEFAULT 0,
    other_charges       DECIMAL(15,2) DEFAULT 0,

    subtotal            DECIMAL(18,2) DEFAULT 0,
    total_cgst          DECIMAL(18,2) DEFAULT 0,
    total_sgst          DECIMAL(18,2) DEFAULT 0,
    total_igst          DECIMAL(18,2) DEFAULT 0,

    grand_total         DECIMAL(18,2) DEFAULT 0,
    amount_paid         DECIMAL(18,2) DEFAULT 0,
    -- amount_due removed (v3): derived — grand_total - amount_paid

    payment_status      ENUM('Paid','Partial','Unpaid') DEFAULT 'Unpaid',

    notes               TEXT,
    created_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP              -- [NEW v3]
                        ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMP     NULL DEFAULT NULL,                     -- [NEW v3] soft delete

    -- Enforce uniqueness of purchase invoice number within a business
    UNIQUE KEY uq_purchase_invoice (business_id, purchase_invoice_no),      -- [NEW v3]

    CONSTRAINT fk_purchase_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id),

    CONSTRAINT fk_purchase_supplier FOREIGN KEY (supplier_id)
        REFERENCES suppliers(supplier_id)
);

-- =========================================
-- PURCHASE ITEMS
-- Changes: added discount_percentage + discount_amount
-- =========================================

CREATE TABLE IF NOT EXISTS purchase_items (
    purchase_item_id  BIGINT        PRIMARY KEY AUTO_INCREMENT,
    purchase_id       BIGINT        NOT NULL,
    product_id        BIGINT        NOT NULL,

    quantity          DECIMAL(15,2) NOT NULL,
    free_quantity     DECIMAL(15,2) DEFAULT 0,

    purchase_price    DECIMAL(15,2) NOT NULL,
    selling_price     DECIMAL(15,2) NOT NULL,
    profit_percentage DECIMAL(8,2)  DEFAULT 0,

    discount_percentage DECIMAL(5,2)  DEFAULT 0,                            -- [NEW v3]
    discount_amount     DECIMAL(15,2) DEFAULT 0,                            -- [NEW v3]

    cgst_percentage   DECIMAL(5,2)  DEFAULT 0,
    sgst_percentage   DECIMAL(5,2)  DEFAULT 0,
    igst_percentage   DECIMAL(5,2)  DEFAULT 0,

    total_tax         DECIMAL(15,2) DEFAULT 0,
    total_amount      DECIMAL(18,2) NOT NULL,

    CONSTRAINT fk_purchase_item_purchase FOREIGN KEY (purchase_id)
        REFERENCES purchases(purchase_id) ON DELETE CASCADE,

    -- RESTRICT — cannot delete a product that has purchase history
    CONSTRAINT fk_purchase_item_product FOREIGN KEY (product_id)
        REFERENCES products(product_id) ON DELETE RESTRICT
);

-- =========================================
-- PURCHASE RETURNS
-- Changes:
--   added payment_in_id FK      — links the refund payment received from supplier
--   added adjusted_in_purchase_id FK — links the purchase the return value is adjusted against
--   added updated_at
--   added UNIQUE(business_id, return_invoice_no)
-- =========================================

CREATE TABLE IF NOT EXISTS purchase_returns (
    return_id                BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id              BIGINT        NOT NULL,
    supplier_id              BIGINT        NOT NULL,
    purchase_id              BIGINT,                   -- original purchase (nullable)

    return_invoice_no        VARCHAR(100)  NOT NULL,
    return_date              DATE          NOT NULL,

    payment_mode             ENUM('Cash','UPI','Card','Bank Transfer','Cheque','Credit')
                             DEFAULT 'Cash',

    subtotal                 DECIMAL(18,2) DEFAULT 0,
    total_cgst               DECIMAL(18,2) DEFAULT 0,
    total_sgst               DECIMAL(18,2) DEFAULT 0,
    total_igst               DECIMAL(18,2) DEFAULT 0,

    grand_total              DECIMAL(18,2) DEFAULT 0,
    refund_amount            DECIMAL(18,2) DEFAULT 0,
    refund_status            ENUM('Refunded','Pending','Adjusted') DEFAULT 'Pending',

    -- payment_in_id: the payment_in record where supplier refunded us cash/UPI/etc.
    --   NULL when refund_status = 'Adjusted' (adjusted against another purchase)
    payment_in_id            BIGINT        NULL,                            -- [NEW v3]

    -- adjusted_in_purchase_id: the purchase invoice this return value is adjusted against
    --   NULL when refund_status = 'Refunded' (supplier actually paid back)
    adjusted_in_purchase_id  BIGINT        NULL,                           -- [NEW v3]

    notes                    TEXT,
    created_at               TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP     DEFAULT CURRENT_TIMESTAMP        -- [NEW v3]
                             ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_purchase_return_invoice (business_id, return_invoice_no), -- [NEW v3]

    CONSTRAINT fk_pret_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id),

    CONSTRAINT fk_pret_supplier FOREIGN KEY (supplier_id)
        REFERENCES suppliers(supplier_id),

    -- Original purchase may be deleted later; keep return record intact
    CONSTRAINT fk_pret_purchase FOREIGN KEY (purchase_id)
        REFERENCES purchases(purchase_id) ON DELETE SET NULL,

    -- Foreign key to payment_in added via ALTER TABLE at EOF

    CONSTRAINT fk_pret_adjusted_purchase FOREIGN KEY (adjusted_in_purchase_id) -- [NEW v3]
        REFERENCES purchases(purchase_id) ON DELETE SET NULL
);

-- =========================================
-- PURCHASE RETURN ITEMS
-- (no changes from v2)
-- =========================================

CREATE TABLE IF NOT EXISTS purchase_return_items (
    return_item_id  BIGINT        PRIMARY KEY AUTO_INCREMENT,
    return_id       BIGINT        NOT NULL,
    product_id      BIGINT        NOT NULL,

    quantity        DECIMAL(15,2) NOT NULL,
    purchase_price  DECIMAL(15,2) NOT NULL,

    cgst_percentage DECIMAL(5,2)  DEFAULT 0,
    sgst_percentage DECIMAL(5,2)  DEFAULT 0,
    igst_percentage DECIMAL(5,2)  DEFAULT 0,

    total_tax       DECIMAL(15,2) DEFAULT 0,
    total_amount    DECIMAL(18,2) NOT NULL,

    CONSTRAINT fk_pri_return  FOREIGN KEY (return_id)
        REFERENCES purchase_returns(return_id) ON DELETE CASCADE,

    CONSTRAINT fk_pri_product FOREIGN KEY (product_id)
        REFERENCES products(product_id) ON DELETE RESTRICT
);

-- =========================================
-- SALES
-- Changes: added updated_at, deleted_at (soft delete); removed amount_due (derived)
-- NOTE: amount_due is derived — compute in application as: grand_total - amount_received
-- =========================================

CREATE TABLE IF NOT EXISTS sales (
    sale_id          BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id      BIGINT        NOT NULL,
    customer_id      BIGINT,                     -- NULL = walk-in / quick cash

    invoice_no       VARCHAR(100)  NOT NULL,
    invoice_date     DATE          NOT NULL,

    sale_type        ENUM('Normal Sale','Quick Cash Sale') DEFAULT 'Normal Sale',

    payment_mode     ENUM('Cash','UPI','Card','Bank Transfer','Cheque','Credit')
                     DEFAULT 'Cash',

    subtotal         DECIMAL(18,2) DEFAULT 0,
    total_cgst       DECIMAL(18,2) DEFAULT 0,
    total_sgst       DECIMAL(18,2) DEFAULT 0,
    total_igst       DECIMAL(18,2) DEFAULT 0,

    discount_amount  DECIMAL(18,2) DEFAULT 0,

    -- Invoice-level transport / Bhada
    transport_cost   DECIMAL(18,2) DEFAULT 0,
    delivery_charge  DECIMAL(18,2) DEFAULT 0,
    delivery_paid_by ENUM('Business','Customer') DEFAULT 'Customer',
    delivery_vehicle_no VARCHAR(50),
    delivery_notes   TEXT,

    round_off        DECIMAL(8,2)  DEFAULT 0,     -- round-off adjustment (±)
    grand_total      DECIMAL(18,2) DEFAULT 0,
    amount_received  DECIMAL(18,2) DEFAULT 0,
    -- amount_due removed (v3): derived — grand_total - amount_received

    payment_status   ENUM('Paid','Partial','Unpaid') DEFAULT 'Paid',

    notes            TEXT,
    created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP                -- [NEW v3]
                     ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP     NULL DEFAULT NULL,                       -- [NEW v3] soft delete

    -- Enforce uniqueness of sale invoice number within a business
    UNIQUE KEY uq_sale_invoice (business_id, invoice_no),                  -- [NEW v3]

    CONSTRAINT fk_sales_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id),

    CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id)
        REFERENCES customers(customer_id) ON DELETE SET NULL
);

-- =========================================
-- SALE ITEMS
-- Changes:
--   added free_quantity  (mirrors purchase_items; e.g. "Buy 10 Get 2 Free")
--   added item_name      (nullable fallback when product_id is NULL / custom item)
--   removed gross_profit (derived: (selling_price - purchase_price) * quantity)
-- =========================================

CREATE TABLE IF NOT EXISTS sale_items (
    sale_item_id        BIGINT        PRIMARY KEY AUTO_INCREMENT,
    sale_id             BIGINT        NOT NULL,
    product_id          BIGINT,                   -- NULL = custom / ad-hoc item

    -- item_name: required when product_id IS NULL (custom item); optional override otherwise
    item_name           VARCHAR(200)  NULL,                                 -- [NEW v3]

    quantity            DECIMAL(15,2) NOT NULL,
    free_quantity       DECIMAL(15,2) DEFAULT 0,                            -- [NEW v3]
    selling_price       DECIMAL(15,2) NOT NULL,
    purchase_price      DECIMAL(15,2) DEFAULT 0,

    cgst_percentage     DECIMAL(5,2)  DEFAULT 0,
    sgst_percentage     DECIMAL(5,2)  DEFAULT 0,
    igst_percentage     DECIMAL(5,2)  DEFAULT 0,

    discount_percentage DECIMAL(5,2)  DEFAULT 0,
    discount_amount     DECIMAL(15,2) DEFAULT 0,

    total_tax           DECIMAL(15,2) DEFAULT 0,
    total_amount        DECIMAL(18,2) NOT NULL,

    -- gross_profit removed (v3): derive as (selling_price - purchase_price) * quantity

    CONSTRAINT fk_sale_item_sale FOREIGN KEY (sale_id)
        REFERENCES sales(sale_id) ON DELETE CASCADE,

    CONSTRAINT fk_sale_item_product FOREIGN KEY (product_id)
        REFERENCES products(product_id) ON DELETE SET NULL
);

-- =========================================
-- SALES RETURNS
-- Changes:
--   added payment_out_id FK     — links the payment_out record where we refunded the customer
--   added adjusted_in_sale_id FK — links the sale the return value is adjusted against
--   added updated_at
--   added UNIQUE(business_id, return_invoice_no)
-- =========================================

CREATE TABLE IF NOT EXISTS sales_returns (
    return_id            BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id          BIGINT        NOT NULL,
    customer_id          BIGINT,
    sale_id              BIGINT,                     -- original sale reference

    return_invoice_no    VARCHAR(100)  NOT NULL,
    return_date          DATE          NOT NULL,

    payment_mode         ENUM('Cash','UPI','Card','Bank Transfer','Cheque','Credit')
                         DEFAULT 'Cash',

    subtotal             DECIMAL(18,2) DEFAULT 0,
    total_cgst           DECIMAL(18,2) DEFAULT 0,
    total_sgst           DECIMAL(18,2) DEFAULT 0,
    total_igst           DECIMAL(18,2) DEFAULT 0,

    grand_total          DECIMAL(18,2) DEFAULT 0,
    refund_amount        DECIMAL(18,2) DEFAULT 0,
    refund_status        ENUM('Refunded','Pending','Adjusted') DEFAULT 'Pending',

    -- payment_out_id: the payment_out record where we paid the customer their refund
    --   NULL when refund_status = 'Adjusted' (adjusted against another sale)
    payment_out_id       BIGINT        NULL,                                -- [NEW v3]

    -- adjusted_in_sale_id: the sale invoice this return value is adjusted against
    --   NULL when refund_status = 'Refunded' (customer was actually paid back)
    adjusted_in_sale_id  BIGINT        NULL,                               -- [NEW v3]

    notes                TEXT,
    created_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP            -- [NEW v3]
                         ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_sale_return_invoice (business_id, return_invoice_no),    -- [NEW v3]

    CONSTRAINT fk_sret_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id),

    CONSTRAINT fk_sret_customer FOREIGN KEY (customer_id)
        REFERENCES customers(customer_id) ON DELETE SET NULL,

    CONSTRAINT fk_sret_sale FOREIGN KEY (sale_id)
        REFERENCES sales(sale_id) ON DELETE SET NULL,

    -- Foreign key to payment_out added via ALTER TABLE at EOF

    CONSTRAINT fk_sret_adjusted_sale FOREIGN KEY (adjusted_in_sale_id)    -- [NEW v3]
        REFERENCES sales(sale_id) ON DELETE SET NULL
);

-- =========================================
-- SALES RETURN ITEMS
-- Changes: added item_name (mirrors sale_items)
-- =========================================

CREATE TABLE IF NOT EXISTS sales_return_items (
    return_item_id      BIGINT        PRIMARY KEY AUTO_INCREMENT,
    return_id           BIGINT        NOT NULL,
    product_id          BIGINT,

    -- item_name: required when product_id IS NULL; optional otherwise
    item_name           VARCHAR(200)  NULL,                                 -- [NEW v3]

    quantity            DECIMAL(15,2) NOT NULL,
    selling_price       DECIMAL(15,2) NOT NULL,
    purchase_price      DECIMAL(15,2) DEFAULT 0,

    cgst_percentage     DECIMAL(5,2)  DEFAULT 0,
    sgst_percentage     DECIMAL(5,2)  DEFAULT 0,
    igst_percentage     DECIMAL(5,2)  DEFAULT 0,

    discount_percentage DECIMAL(5,2)  DEFAULT 0,
    total_tax           DECIMAL(15,2) DEFAULT 0,
    total_amount        DECIMAL(18,2) NOT NULL,

    CONSTRAINT fk_sri_return  FOREIGN KEY (return_id)
        REFERENCES sales_returns(return_id) ON DELETE CASCADE,

    CONSTRAINT fk_sri_product FOREIGN KEY (product_id)
        REFERENCES products(product_id) ON DELETE SET NULL
);

-- =========================================
-- PAYMENT IN
-- Changes:
--   customer_id now NULLABLE (was NOT NULL)
--   added supplier_id (nullable) — for purchase-return refunds (supplier pays you back)
--
-- Constraint rules:
--   Normal receipt from customer : customer_id IS NOT NULL, supplier_id IS NULL
--   Purchase-return refund        : supplier_id IS NOT NULL, customer_id IS NULL
-- =========================================

CREATE TABLE IF NOT EXISTS payment_in (
    payment_in_id BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id   BIGINT        NOT NULL,

    -- Either customer_id or supplier_id must be set (enforced at app level)
    customer_id   BIGINT        NULL,                                       -- [CHANGED v3: was NOT NULL]
    supplier_id   BIGINT        NULL,                                       -- [NEW v3]

    sale_id       BIGINT,

    payment_date  DATE          NOT NULL,
    payment_mode  ENUM('Cash','UPI','Card','Bank Transfer','Cheque')
                  DEFAULT 'Cash',

    amount        DECIMAL(18,2) NOT NULL,
    reference_no  VARCHAR(100),
    notes         TEXT,
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pin_business  FOREIGN KEY (business_id)
        REFERENCES businesses(business_id) ON DELETE CASCADE,

    CONSTRAINT fk_pin_customer  FOREIGN KEY (customer_id)
        REFERENCES customers(customer_id) ON DELETE RESTRICT,

    CONSTRAINT fk_pin_supplier  FOREIGN KEY (supplier_id)                  -- [NEW v3]
        REFERENCES suppliers(supplier_id) ON DELETE RESTRICT,

    CONSTRAINT fk_pin_sale      FOREIGN KEY (sale_id)
        REFERENCES sales(sale_id) ON DELETE SET NULL
);

-- =========================================
-- PAYMENT OUT
-- Changes:
--   supplier_id now NULLABLE (was NOT NULL)
--   added customer_id (nullable) — for sales-return refunds (you pay customer back)
--
-- Constraint rules:
--   Normal payment to supplier    : supplier_id IS NOT NULL, customer_id IS NULL
--   Sales-return refund to customer: customer_id IS NOT NULL, supplier_id IS NULL
-- =========================================

CREATE TABLE IF NOT EXISTS payment_out (
    payment_out_id BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id    BIGINT        NOT NULL,

    -- Either supplier_id or customer_id must be set (enforced at app level)
    supplier_id    BIGINT        NULL,                                      -- [CHANGED v3: was NOT NULL]
    customer_id    BIGINT        NULL,                                      -- [NEW v3]

    purchase_id    BIGINT,

    payment_date   DATE          NOT NULL,
    payment_mode   ENUM('Cash','UPI','Card','Bank Transfer','Cheque')
                   DEFAULT 'Cash',

    amount         DECIMAL(18,2) NOT NULL,
    reference_no   VARCHAR(100),
    notes          TEXT,
    created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pout_business  FOREIGN KEY (business_id)
        REFERENCES businesses(business_id) ON DELETE CASCADE,

    CONSTRAINT fk_pout_supplier  FOREIGN KEY (supplier_id)
        REFERENCES suppliers(supplier_id) ON DELETE RESTRICT,

    CONSTRAINT fk_pout_customer  FOREIGN KEY (customer_id)                 -- [NEW v3]
        REFERENCES customers(customer_id) ON DELETE RESTRICT,

    CONSTRAINT fk_pout_purchase  FOREIGN KEY (purchase_id)
        REFERENCES purchases(purchase_id) ON DELETE SET NULL
);

-- =========================================
-- DAY BOOK
-- Changes: added reference_type (polymorphic companion to reference_id)
-- =========================================

CREATE TABLE IF NOT EXISTS day_book (
    day_book_id   BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id   BIGINT        NOT NULL,

    entry_date    DATE          NOT NULL,

    entry_type    ENUM(
                      'Sale',
                      'Purchase',
                      'Payment In',
                      'Payment Out',
                      'Sales Return',
                      'Purchase Return',
                      'Expense',
                      'Income'
                  ) NOT NULL,

    -- Polymorphic reference: reference_type tells you which table reference_id points to
    reference_id   BIGINT,
    reference_type ENUM(                                                    -- [NEW v3]
                       'sales',
                       'purchases',
                       'payment_in',
                       'payment_out',
                       'sales_returns',
                       'purchase_returns',
                       'expenses',
                       'incomes'
                   ) NULL,

    cash_in      DECIMAL(18,2) DEFAULT 0,
    cash_out     DECIMAL(18,2) DEFAULT 0,
    bank_in      DECIMAL(18,2) DEFAULT 0,
    bank_out     DECIMAL(18,2) DEFAULT 0,

    payment_mode ENUM('Cash','UPI','Card','Bank Transfer','Cheque')
                 DEFAULT 'Cash',

    description  TEXT,
    created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_daybook_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id) ON DELETE CASCADE
);

-- =========================================
-- EXPENSE CATEGORIES
-- Changes: added is_active
-- =========================================

CREATE TABLE IF NOT EXISTS expense_categories (
    category_id   BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id   BIGINT        NOT NULL,
    category_name VARCHAR(150)  NOT NULL,
    description   TEXT,
    is_active     BOOLEAN       DEFAULT TRUE,                               -- [NEW v3]
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_expcat_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id) ON DELETE CASCADE
);

-- =========================================
-- EXPENSES
-- (no structural changes; payment_mode standardised)
-- =========================================

CREATE TABLE IF NOT EXISTS expenses (
    expense_id   BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id  BIGINT        NOT NULL,
    category_id  BIGINT,

    expense_date DATE          NOT NULL,
    description  VARCHAR(255),
    amount       DECIMAL(15,2) NOT NULL,

    payment_mode ENUM('Cash','UPI','Card','Bank Transfer','Cheque')
                 DEFAULT 'Cash',

    reference_no VARCHAR(100),
    notes        TEXT,
    created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_exp_business  FOREIGN KEY (business_id)
        REFERENCES businesses(business_id) ON DELETE CASCADE,

    CONSTRAINT fk_exp_category  FOREIGN KEY (category_id)
        REFERENCES expense_categories(category_id) ON DELETE SET NULL
);

-- =========================================
-- STOCK MOVEMENTS
-- Changes: added reference_type (polymorphic companion to reference_id)
-- =========================================

CREATE TABLE IF NOT EXISTS stock_movements (
    movement_id    BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id    BIGINT        NOT NULL,
    product_id     BIGINT        NOT NULL,

    movement_type  ENUM(
                       'Purchase In',
                       'Sale Out',
                       'Purchase Return Out',
                       'Sale Return In',
                       'Manual Adjustment'
                   ) NOT NULL,

    -- Polymorphic reference: reference_type tells you which table reference_id points to
    reference_id   BIGINT,
    reference_type ENUM(                                                    -- [NEW v3]
                       'purchases',
                       'sales',
                       'purchase_returns',
                       'sales_returns'
                   ) NULL,

    quantity       DECIMAL(15,2) NOT NULL,     -- always positive; direction = movement_type
    stock_before   DECIMAL(15,2) DEFAULT 0,
    stock_after    DECIMAL(15,2) DEFAULT 0,

    notes          TEXT,
    created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sm_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id),

    CONSTRAINT fk_sm_product  FOREIGN KEY (product_id)
        REFERENCES products(product_id)
);

-- =========================================
-- INCOME CATEGORIES   [NEW TABLE — v3]
-- =========================================

CREATE TABLE IF NOT EXISTS income_categories (
    category_id   BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id   BIGINT        NOT NULL,
    category_name VARCHAR(150)  NOT NULL,    -- Interest, Commission, Rental, Other …
    description   TEXT,
    is_active     BOOLEAN       DEFAULT TRUE,
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_inccat_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id) ON DELETE CASCADE
);

-- =========================================
-- INCOMES   [NEW TABLE — v3]
-- Tracks non-sales income: interest, commission, rental, etc.
-- =========================================

CREATE TABLE IF NOT EXISTS incomes (
    income_id    BIGINT        PRIMARY KEY AUTO_INCREMENT,
    business_id  BIGINT        NOT NULL,
    category_id  BIGINT,

    income_date  DATE          NOT NULL,
    description  VARCHAR(255),
    amount       DECIMAL(15,2) NOT NULL,

    payment_mode ENUM('Cash','UPI','Card','Bank Transfer','Cheque')
                 DEFAULT 'Cash',

    reference_no VARCHAR(100),
    notes        TEXT,
    created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_inc_business FOREIGN KEY (business_id)
        REFERENCES businesses(business_id) ON DELETE CASCADE,

    CONSTRAINT fk_inc_category FOREIGN KEY (category_id)
        REFERENCES income_categories(category_id) ON DELETE SET NULL
);

-- =========================================
-- INDEXES
-- =========================================

-- ── Product lookups ──────────────────────────────────────────────
CREATE INDEX idx_product_name          ON products(product_name);
CREATE INDEX idx_product_code          ON products(product_code);
-- Composite barcode search scoped to a business
CREATE INDEX idx_product_barcode_biz   ON products(business_id, barcode);  -- [NEW v3]

-- ── Invoice date range queries scoped to a business ──────────────
CREATE INDEX idx_purchase_biz_date     ON purchases(business_id, purchase_date); -- [NEW v3]
CREATE INDEX idx_sale_biz_date         ON sales(business_id, invoice_date);       -- [NEW v3]
CREATE INDEX idx_pret_biz_date         ON purchase_returns(business_id, return_date); -- [NEW v3]
CREATE INDEX idx_sret_biz_date         ON sales_returns(business_id, return_date);    -- [NEW v3]

-- ── Soft-delete filtered queries ─────────────────────────────────
CREATE INDEX idx_purchases_deleted_at  ON purchases(deleted_at);           -- [NEW v3]
CREATE INDEX idx_sales_deleted_at      ON sales(deleted_at);               -- [NEW v3]

-- ── Legacy single-column date indexes (kept for compatibility) ────
CREATE INDEX idx_sale_date             ON sales(invoice_date);
CREATE INDEX idx_purchase_date         ON purchases(purchase_date);
CREATE INDEX idx_daybook_date          ON day_book(entry_date);
CREATE INDEX idx_expense_date          ON expenses(expense_date);
CREATE INDEX idx_income_date           ON incomes(income_date);            -- [NEW v3]

-- ── Party name searches ──────────────────────────────────────────
CREATE INDEX idx_customer_name         ON customers(customer_name);
CREATE INDEX idx_supplier_name         ON suppliers(supplier_name);

-- ── Return lookups by party ──────────────────────────────────────
CREATE INDEX idx_pret_supplier         ON purchase_returns(supplier_id);
CREATE INDEX idx_sret_customer         ON sales_returns(customer_id);

-- ── Payment lookups ──────────────────────────────────────────────
CREATE INDEX idx_pin_customer          ON payment_in(customer_id);
CREATE INDEX idx_pin_supplier          ON payment_in(supplier_id);         -- [NEW v3]
CREATE INDEX idx_pout_supplier         ON payment_out(supplier_id);
CREATE INDEX idx_pout_customer         ON payment_out(customer_id);        -- [NEW v3]

-- ── Day book polymorphic lookups ─────────────────────────────────
CREATE INDEX idx_daybook_ref           ON day_book(reference_type, reference_id); -- [NEW v3]

-- ── Stock movement polymorphic lookups ───────────────────────────
CREATE INDEX idx_sm_ref                ON stock_movements(reference_type, reference_id); -- [NEW v3]
CREATE INDEX idx_sm_product_biz        ON stock_movements(business_id, product_id);

-- =========================================
-- VIEW: v_supplier_summary
-- Powers the Supplier Report drill-down screen.
-- =========================================

CREATE OR REPLACE VIEW v_supplier_summary AS
SELECT
    s.supplier_id,
    s.business_id,
    s.supplier_name,
    s.company_name,
    s.phone,
    s.email,
    s.gst_number,
    s.city,
    s.state,
    s.opening_balance,
    s.opening_balance_type,                                                -- [NEW v3]
    s.is_active,

    -- Total value of all purchase invoices from this supplier (excluding soft-deleted)
    COALESCE(SUM(CASE WHEN p.deleted_at IS NULL THEN p.grand_total END), 0) AS total_invoiced,

    -- Amount paid at time of purchase entry
    COALESCE(SUM(CASE WHEN p.deleted_at IS NULL THEN p.amount_paid END), 0) AS total_paid_on_invoices,

    -- Standalone payment-out entries against this supplier
    COALESCE((
        SELECT SUM(po.amount)
        FROM payment_out po
        WHERE po.supplier_id = s.supplier_id
    ), 0) AS total_standalone_payments,

    -- Combined total paid = invoice payments + standalone
    COALESCE(SUM(CASE WHEN p.deleted_at IS NULL THEN p.amount_paid END), 0)
    + COALESCE((
        SELECT SUM(po.amount)
        FROM payment_out po
        WHERE po.supplier_id = s.supplier_id
    ), 0) AS total_paid,

    -- Net due = opening + invoiced - paid
    -- For 'Payable' opening_balance: we owe them, so balance is additive
    -- Application should negate if opening_balance_type = 'Receivable'
    s.opening_balance
    + COALESCE(SUM(CASE WHEN p.deleted_at IS NULL THEN p.grand_total END), 0)
    - (
        COALESCE(SUM(CASE WHEN p.deleted_at IS NULL THEN p.amount_paid END), 0)
        + COALESCE((
            SELECT SUM(po.amount)
            FROM payment_out po
            WHERE po.supplier_id = s.supplier_id
        ), 0)
    ) AS balance_due,

    COUNT(DISTINCT CASE WHEN p.deleted_at IS NULL THEN p.purchase_id END) AS total_invoices,
    MAX(CASE WHEN p.deleted_at IS NULL THEN p.purchase_date END)          AS last_purchase_date

FROM suppliers s
LEFT JOIN purchases p ON s.supplier_id = p.supplier_id

GROUP BY
    s.supplier_id, s.business_id, s.supplier_name, s.company_name,
    s.phone, s.email, s.gst_number, s.city, s.state,
    s.opening_balance, s.opening_balance_type, s.is_active;

-- =========================================
-- VIEW: v_customer_summary   [NEW — v3]
-- Powers the Customer Report drill-down screen.
-- =========================================

CREATE OR REPLACE VIEW v_customer_summary AS
SELECT
    c.customer_id,
    c.business_id,
    c.customer_name,
    c.company_name,
    c.phone,
    c.email,
    c.gst_number,
    c.city,
    c.state,
    c.opening_balance,
    c.opening_balance_type,
    c.credit_limit,
    c.is_active,

    -- Total sales billed to this customer (excluding soft-deleted)
    COALESCE(SUM(CASE WHEN s.deleted_at IS NULL THEN s.grand_total END), 0) AS total_billed,

    -- Amount received at time of sale entry
    COALESCE(SUM(CASE WHEN s.deleted_at IS NULL THEN s.amount_received END), 0) AS total_received_on_invoices,

    -- Standalone payment-in entries from this customer
    COALESCE((
        SELECT SUM(pi.amount)
        FROM payment_in pi
        WHERE pi.customer_id = c.customer_id
    ), 0) AS total_standalone_receipts,

    -- Combined total received
    COALESCE(SUM(CASE WHEN s.deleted_at IS NULL THEN s.amount_received END), 0)
    + COALESCE((
        SELECT SUM(pi.amount)
        FROM payment_in pi
        WHERE pi.customer_id = c.customer_id
    ), 0) AS total_received,

    -- Net balance = opening + billed - received
    -- 'Receivable' opening_balance: customer owes us, so it's additive
    c.opening_balance
    + COALESCE(SUM(CASE WHEN s.deleted_at IS NULL THEN s.grand_total END), 0)
    - (
        COALESCE(SUM(CASE WHEN s.deleted_at IS NULL THEN s.amount_received END), 0)
        + COALESCE((
            SELECT SUM(pi.amount)
            FROM payment_in pi
            WHERE pi.customer_id = c.customer_id
        ), 0)
    ) AS balance_due,

    COUNT(DISTINCT CASE WHEN s.deleted_at IS NULL THEN s.sale_id END) AS total_invoices,
    MAX(CASE WHEN s.deleted_at IS NULL THEN s.invoice_date END)        AS last_sale_date

FROM customers c
LEFT JOIN sales s ON c.customer_id = s.customer_id

GROUP BY
    c.customer_id, c.business_id, c.customer_name, c.company_name,
    c.phone, c.email, c.gst_number, c.city, c.state,
    c.opening_balance, c.opening_balance_type, c.credit_limit, c.is_active;

-- ─────────────────────────────────────────────────────────────────
-- QUICK-REFERENCE: amount_due at application layer
-- ─────────────────────────────────────────────────────────────────
--   purchases:  amount_due = grand_total - amount_paid
--   sales:      amount_due = grand_total - amount_received
--   These are not stored columns (removed in v3); compute on read.
-- ─────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────
-- HOW TO USE v_supplier_summary
-- ─────────────────────────────────────────────────────────────────
-- Supplier Spend report (list):
--   SELECT supplier_name, total_invoiced, total_paid, balance_due
--   FROM v_supplier_summary
--   WHERE business_id = ?
--   ORDER BY total_invoiced DESC;
--
-- Supplier Detail drill-down (click on a supplier):
--   SELECT * FROM v_supplier_summary
--   WHERE supplier_id = ? AND business_id = ?;
--
-- All invoices for that supplier:
--   SELECT purchase_invoice_no, purchase_date, grand_total,
--          amount_paid, grand_total - amount_paid AS amount_due, payment_status
--   FROM purchases
--   WHERE supplier_id = ? AND business_id = ? AND deleted_at IS NULL
--   ORDER BY purchase_date DESC;
-- ─────────────────────────────────────────────────────────────────

-- =========================================
-- TRIGGERS
-- =========================================

DELIMITER $$

-- Auto-calculate selling price from profit % on purchase item entry
CREATE TRIGGER trg_product_selling_price
BEFORE INSERT ON purchase_items
FOR EACH ROW
BEGIN
    SET NEW.selling_price = NEW.purchase_price +
        ((NEW.purchase_price * NEW.profit_percentage) / 100);
END$$

-- Add stock when a purchase item is saved
CREATE TRIGGER trg_purchase_stock_update
AFTER INSERT ON purchase_items
FOR EACH ROW
BEGIN
    UPDATE products
    SET current_stock = current_stock + NEW.quantity
    WHERE product_id = NEW.product_id;
END$$

-- Deduct stock when a sale item is saved
-- NOTE: product_id may be NULL for custom items — guard accordingly
CREATE TRIGGER trg_sale_stock_update
AFTER INSERT ON sale_items
FOR EACH ROW
BEGIN
    IF NEW.product_id IS NOT NULL THEN
        UPDATE products
        SET current_stock = current_stock - NEW.quantity
        WHERE product_id = NEW.product_id;
    END IF;
END$$

-- Deduct stock when a purchase is returned to supplier
-- (goods leave your godown → stock goes DOWN)
CREATE TRIGGER trg_purchase_return_stock_deduct
AFTER INSERT ON purchase_return_items
FOR EACH ROW
BEGIN
    UPDATE products
    SET current_stock = current_stock - NEW.quantity
    WHERE product_id = NEW.product_id;
END$$

-- Add stock back when a customer returns a sale item
-- (goods come back to your godown → stock goes UP)
-- NOTE: product_id may be NULL for custom items — guard accordingly
CREATE TRIGGER trg_sale_return_stock_restore
AFTER INSERT ON sales_return_items
FOR EACH ROW
BEGIN
    IF NEW.product_id IS NOT NULL THEN
        UPDATE products
        SET current_stock = current_stock + NEW.quantity
        WHERE product_id = NEW.product_id;
    END IF;
END$$

DELIMITER ;

-- =========================================
-- =========================================
-- ALTER TABLES FOR FOREIGN KEYS TO AVOID CYCLIC DEPENDENCIES
-- =========================================

ALTER TABLE purchase_returns
    ADD CONSTRAINT fk_pret_payment_in FOREIGN KEY (payment_in_id)
    REFERENCES payment_in(payment_in_id) ON DELETE SET NULL;

ALTER TABLE sales_returns
    ADD CONSTRAINT fk_sret_payment_out FOREIGN KEY (payment_out_id)
    REFERENCES payment_out(payment_out_id) ON DELETE SET NULL;
-- retail_billbook v3
-- =========================================

-- ── Sales ─────────────────────────────────────────────────────────
CREATE INDEX idx_sales_biz_date
    ON sales (business_id, invoice_date, deleted_at);

CREATE INDEX idx_sales_biz_status
    ON sales (business_id, payment_status, deleted_at);

CREATE INDEX idx_sales_biz_customer
    ON sales (business_id, customer_id);

-- ── Purchases ─────────────────────────────────────────────────────
CREATE INDEX idx_purchases_biz_date
    ON purchases (business_id, purchase_date, deleted_at);

CREATE INDEX idx_purchases_biz_status
    ON purchases (business_id, payment_status, deleted_at);

CREATE INDEX idx_purchases_biz_supplier
    ON purchases (business_id, supplier_id);

-- ── Returns ───────────────────────────────────────────────────────
CREATE INDEX idx_sret_biz_date
    ON sales_returns (business_id, return_date);

CREATE INDEX idx_pret_biz_date
    ON purchase_returns (business_id, return_date);

CREATE INDEX idx_sret_biz_status
    ON sales_returns (business_id, refund_status);

CREATE INDEX idx_pret_biz_status
    ON purchase_returns (business_id, refund_status);

-- ── Payments ──────────────────────────────────────────────────────
CREATE INDEX idx_payment_in_biz_date
    ON payment_in (business_id, payment_date);

CREATE INDEX idx_payment_in_customer
    ON payment_in (business_id, customer_id);

CREATE INDEX idx_payment_in_supplier
    ON payment_in (business_id, supplier_id);

CREATE INDEX idx_payment_out_biz_date
    ON payment_out (business_id, payment_date);

CREATE INDEX idx_payment_out_supplier
    ON payment_out (business_id, supplier_id);

CREATE INDEX idx_payment_out_customer
    ON payment_out (business_id, customer_id);

-- ── Day Book ──────────────────────────────────────────────────────
CREATE INDEX idx_daybook_biz_date
    ON day_book (business_id, entry_date);

CREATE INDEX idx_daybook_ref
    ON day_book (business_id, reference_type, reference_id);

-- ── Stock ─────────────────────────────────────────────────────────
CREATE INDEX idx_sm_biz_product
    ON stock_movements (business_id, product_id);

CREATE INDEX idx_sm_biz_date
    ON stock_movements (business_id, created_at);

-- ── Expenses / Incomes ────────────────────────────────────────────
CREATE INDEX idx_expenses_biz_date
    ON expenses (business_id, expense_date);

CREATE INDEX idx_incomes_biz_date
    ON incomes (business_id, income_date);

-- ── Customers / Suppliers search ──────────────────────────────────
CREATE INDEX idx_customers_biz_phone
    ON customers (business_id, phone);

CREATE INDEX idx_suppliers_biz_phone
    ON suppliers (business_id, phone);
