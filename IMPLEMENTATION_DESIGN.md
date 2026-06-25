
# Implementation Design

## 1. Unified Bridge Protocol
JSON Payload:
```json
{
  "action": "string",
  "license_key": "string",
  "data": { ... },
  "config": { ... }
}
```

## 2. Database Schema (Optimized v2)

### Global Tables (Shared)
- `master_users_registry`: Auth credentials (Email, Password Hash, License).
- `saas_plans`: Subscription plans.
- `saas_payments`: Payment history.
- **`saas_app_settings`**: Configuration per tenant.
  - PK: `license_key`
  - Columns: `companyName`, `logoUrl`, `taxRate`, `currency`, `countryCode`, `invoicePrefix`, `enableDateTime`, etc.
- **`saas_user_profiles`**: User details.
  - PK: `email`
  - Index: `license_key`
  - Columns: `name`, `role`, `phone`, `avatar_url`.

### Tenant Tables (Partitioned)
Prefix: Derived from License Key (e.g., `sbfree123_`)
- `{prefix}customers`: Client database.
- `{prefix}invoices`: Invoice records with JSON items.
- `{prefix}loginactivity`: Audit logs.

## 3. API Logic Changes
- **get_app_settings**: `SELECT * FROM saas_app_settings WHERE license_key = ?`
- **get_profile**: `SELECT * FROM saas_user_profiles WHERE license_key = ? LIMIT 1`
- **save_profile**: `REPLACE INTO saas_user_profiles ...`

## 4. License Management (Super Admin)
- New admin actions:
  - `admin_get_licenses`
  - `admin_save_license`
  - `admin_delete_license`
- Validation rules:
  - License format: `SB-(FREE|PRO|ENT)-XXXXXX+`
  - Plan: `FREE|PRO|ENT|ENTERPRISE`
  - Status: `ACTIVE|INACTIVE|EXPIRED`
  - Optional `assigned_email` must be valid email.
- Registration checks license existence, active status, and assigned_email match before onboarding.

## 5. Contact Us + Error Observability
### Tables
- `saas_contact_messages`
  - stores `name,email,subject,message,status,created_at`.
- `saas_error_logs`
  - stores `source,level,message,context,created_at`.

### Actions
- `submit_contact_message`: Public website contact form -> DB.
- `admin_get_contact_messages`: admin reads inbox.
- `log_error`: client-side/server-side structured logging.
- `admin_get_error_logs`: admin reads latest errors.
