# SimpleBill Deployment Guide

This document explains how to deploy SimpleBill on:
1. **Vercel** (recommended for this repository)
2. **MilesWeb cPanel** (Node + MySQL hosting path)

---

## 1) Vercel Deployment (Recommended)

### Prerequisites
- GitHub repository with this project
- Vercel account
- MySQL database reachable from Vercel functions

### Step-by-step
1. Push your branch to GitHub.
2. In Vercel, click **Add New Project** and import this repository.
3. In project settings, configure:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
4. Add environment variables in **Project Settings → Environment Variables**:
   - `MYSQL_HOST=<your-mysql-host>`
   - `MYSQL_USER=<your-mysql-user>`
   - `MYSQL_PASSWORD=<your-mysql-password>`
   - `MYSQL_DATABASE=<your-mysql-database>`
   - `CORS_ORIGIN=https://<your-vercel-domain>`
   - `ADMIN_SECRET=<strong-admin-secret>` (required for super-admin login)
   - `ALLOW_CLIENT_DB_CONFIG=false` (recommended; keeps DB creds server-side only)
5. Deploy project.
6. After deploy, verify endpoints:
   - `https://<your-domain>/api` (POST action endpoint)
   - App UI at `https://<your-domain>/`


### Common issue fixes (after security hardening)
- **Super Admin login fails for `bizbytech.admin`:**
  - If `ADMIN_SECRET` is set in Vercel, that value overrides default `bizbytech.admin`.
  - Use the exact value from Vercel env and redeploy.
- **DB connection fails after removing UI DB creds:**
  - Set all four env vars (`MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`) in Vercel Project → Environment Variables.
  - Keep `ALLOW_CLIENT_DB_CONFIG=false` unless you explicitly want browser-provided DB config (not recommended).
  - Redeploy after env changes.

### Post-deploy checks
- Register user flow works (license/email/phone uniqueness).
- Login works.
- Customers & invoices CRUD works.
- Settings save and profile save works.

---

## 2) MilesWeb cPanel Deployment

> Use this method if your cPanel package supports Node.js app hosting.

### Prerequisites
- cPanel access
- Node.js selector available in cPanel
- MySQL DB created in cPanel and credentials ready

### Step-by-step
1. In cPanel, create (or verify) MySQL DB and user:
   - DB Host: `<your-mysql-host>`
   - DB Name: `<your-mysql-database>`
   - DB User: `<your-mysql-user>`
   - DB Password: `<your-mysql-password>`
2. Upload project files to cPanel `public_html` (or app directory) using File Manager / Git deploy.
3. If Node app manager exists:
   - Create Node app (Node 18+)
   - Set startup file for API route handling according to hosting setup
   - Install dependencies with `npm install`
4. Set environment variables in cPanel Node app config:
   - `MYSQL_HOST=<your-mysql-host>`
   - `MYSQL_USER=<your-mysql-user>`
   - `MYSQL_PASSWORD=<your-mysql-password>`
   - `MYSQL_DATABASE=<your-mysql-database>`
   - `CORS_ORIGIN=https://<your-domain>`
5. Build frontend:
   - `npm run build`
6. Serve `dist/` as static app from your domain.
7. Ensure `/api` route points to Node handler (reverse proxy/rewrite in cPanel config).

### cPanel routing notes
- Frontend routes should rewrite to `index.html`.
- API route `/api` must be excluded from SPA rewrite.

---

## 3) Database bootstrap

Before first production use, ensure the following tables exist:
- `master_users_registry`
- `saas_user_profiles`
- `saas_app_settings`
- `saas_license_keys`
- `saas_contact_messages`
- `saas_error_logs`
- tenant tables auto-create on first registration/login actions.

You can initialize by invoking admin actions through the app flow.

---

## 4) Verification checklist (both platforms)

- [ ] New user registration blocked on duplicate license.
- [ ] New user registration blocked on duplicate email.
- [ ] New user registration blocked on duplicate phone.
- [ ] Successful registration creates tenant-prefixed tables.
- [ ] Login returns user + license.
- [ ] Customer save enforces duplicate phone checks inside tenant.
- [ ] Invoice CRUD works.
- [ ] App settings and profile save/load work.
