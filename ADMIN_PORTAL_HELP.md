# Admin Portal Help (BizByTech)

This document explains how to use the Super Admin portal for platform operations.

## 1) Open Admin Portal
- Local: `http://localhost:5173/?admin`
- Hosted: `https://<your-domain>/?admin`

## 2) Login
- Enter the **Master Access Secret**.
- Secret source:
  - `ADMIN_SECRET` environment variable (recommended in production)
  - fallback default: `bizbytech.admin` (change this immediately in production)

## 3) Portal Tabs

### Tenants Registry
- View all registered SaaS tenants.
- Search by email, name, or license key.

### Offerings Master
- View and manage pricing plans.
- Save plan metadata used across the product.

### Revenue Audit
- Review payment transactions and status.

### Global System
Contains operational controls:

1. **Run Master Initialization**
   - Creates required global tables if missing.
   - Seeds default plan catalog.

2. **Verify Bridge Connection**
   - Validates API bridge + MySQL connectivity using current admin-configured credentials.

3. **Bridge Configuration (Admin Only)**
   - Set Bridge API URL, DB host, DB name, DB user, DB password.
   - Use **Verify Connection** before **Save Bridge Config**.
   - Saving updates the platform connection profile used by customer login/registration workflows.

## 4) Security Recommendations
- Always set `ADMIN_SECRET` in production.
- Rotate admin secret periodically.
- Restrict admin URL behind IP allowlist/WAF where possible.
- Ensure HTTPS only and secure database network rules.

## 5) Troubleshooting
- **Invalid credentials**: verify `ADMIN_SECRET` value in deployment env.
- **Bridge verify failed**: check API URL, DB host/user/password/database, and firewall allowlist.
- **500 on customer actions**: verify admin bridge config and rerun master initialization if tables are missing.

## 6) Production Features Implemented
- **Resilient DB initialization**: Global system initialization creates missing global tables (`master_users_registry`, `saas_user_profiles`, `saas_app_settings`, `saas_plans`, `saas_payments`, `saas_login_activity`) safely using `IF NOT EXISTS`.
- **Tenant activity monitoring**: Admin tenant dashboard shows total tenants, active tenants in last 24h, and activation ratio.
- **New offering creation**: Offerings tab supports creating a new plan with ID/name/price/features and persisting it to `saas_plans`.
- **Revenue report**: Revenue tab includes total revenue, month-to-date revenue, pending settlements, success rate, and transaction-level records.
