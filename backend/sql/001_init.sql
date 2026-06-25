-- ============================================================
-- SimpleBill / Accounting 360 — MASTER DATABASE INIT
-- Run this ONCE on your master MySQL database.
-- This creates the 12 global tables (9 SaaS + 3 routing).
-- Tenant operational tables (products, sales, etc.) are created
-- automatically when a new business registers.
-- ============================================================

CREATE TABLE IF NOT EXISTS master_users_registry (
  email VARCHAR(255) PRIMARY KEY,
  license_key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  reset_token VARCHAR(100),
  reset_expiry DATETIME,
  created_at DATETIME
);

CREATE TABLE IF NOT EXISTS saas_user_profiles (
  email VARCHAR(255) PRIMARY KEY,
  license_key VARCHAR(100),
  name VARCHAR(255),
  role VARCHAR(50),
  phone VARCHAR(50),
  avatar_url TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX(license_key)
);

CREATE TABLE IF NOT EXISTS saas_app_settings (
  license_key VARCHAR(100) PRIMARY KEY,
  companyName VARCHAR(255),
  companyGstin VARCHAR(50),
  logoUrl TEXT,
  taxRate VARCHAR(10),
  currency VARCHAR(10),
  countryCode VARCHAR(10),
  invoicePrefix VARCHAR(20),
  terms TEXT,
  invoiceHeader TEXT,
  invoiceFooter TEXT,
  enableDateTime TINYINT(1) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS saas_plans (
  id VARCHAR(60) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  price VARCHAR(60) NOT NULL,
  description TEXT,
  features LONGTEXT,
  isPopular TINYINT(1) DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saas_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  plan_id VARCHAR(60) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'SUCCESS',
  transaction_ref VARCHAR(150),
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_saas_payments_status (status),
  INDEX idx_saas_payments_time (timestamp)
);

CREATE TABLE IF NOT EXISTS saas_login_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  license_key VARCHAR(100) NOT NULL,
  action VARCHAR(40) NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_saas_activity_license_time (license_key, timestamp),
  INDEX idx_saas_activity_action_time (action, timestamp)
);

CREATE TABLE IF NOT EXISTS saas_license_keys (
  license_key VARCHAR(100) PRIMARY KEY,
  plan_id VARCHAR(60) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  assigned_email VARCHAR(255),
  assigned_at DATETIME,
  max_users INT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_saas_license_plan_status (plan_id, status)
);

CREATE TABLE IF NOT EXISTS saas_contact_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  message TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'NEW',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_saas_contact_created (created_at)
);

CREATE TABLE IF NOT EXISTS saas_error_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(60) NOT NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'ERROR',
  message TEXT NOT NULL,
  context LONGTEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_saas_error_created (created_at),
  INDEX idx_saas_error_source (source)
);

CREATE TABLE IF NOT EXISTS app_users (
  user_id       BIGINT PRIMARY KEY AUTO_INCREMENT,
  full_name     VARCHAR(150) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  phone         VARCHAR(20) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS businesses (
  business_id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id                  BIGINT NOT NULL,
  business_name            VARCHAR(200) NOT NULL,
  business_type            ENUM('Retail','Wholesale','Retail+Wholesale') DEFAULT 'Retail',
  owner_name               VARCHAR(150),
  gst_number               VARCHAR(30),
  gst_type                 ENUM('GST','NON_GST') DEFAULT 'GST',
  address                  TEXT,
  city                     VARCHAR(100),
  state                    VARCHAR(100),
  pincode                  VARCHAR(20),
  phone                    VARCHAR(20),
  email                    VARCHAR(150),
  invoice_prefix           VARCHAR(20) DEFAULT 'INV',
  allow_negative_stock     BOOLEAN DEFAULT FALSE,
  allow_negative_selling   BOOLEAN DEFAULT FALSE,
  low_stock_limit          INT DEFAULT 10,
  tax_display_mode         ENUM('Tax Inclusive','Tax Exclusive') DEFAULT 'Tax Exclusive',
  default_sale_tax_mode    ENUM('CGST+SGST','IGST','No Tax') DEFAULT 'CGST+SGST',
  default_gst_percentage   DECIMAL(5,2) DEFAULT 0,
  default_cgst_rate        DECIMAL(5,2) DEFAULT 0,
  default_sgst_rate        DECIMAL(5,2) DEFAULT 0,
  default_igst_rate        DECIMAL(5,2) DEFAULT 0,
  show_tax_on_invoice      BOOLEAN DEFAULT TRUE,
  round_off_invoice        BOOLEAN DEFAULT TRUE,
  is_active                BOOLEAN DEFAULT TRUE,
  created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_biz_user (user_id),
  CONSTRAINT fk_biz_user FOREIGN KEY (user_id)
    REFERENCES app_users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_users (
  business_user_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  business_id      BIGINT NOT NULL,
  user_id          BIGINT NOT NULL,
  role             ENUM('Owner','Admin','Manager','Accountant','Staff') DEFAULT 'Owner',
  is_active        BOOLEAN DEFAULT TRUE,
  invited_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  joined_at        TIMESTAMP NULL,
  UNIQUE KEY uq_business_user (business_id, user_id),
  CONSTRAINT fk_bu_business FOREIGN KEY (business_id)
    REFERENCES businesses(business_id) ON DELETE CASCADE,
  CONSTRAINT fk_bu_user FOREIGN KEY (user_id)
    REFERENCES app_users(user_id) ON DELETE CASCADE
);
