
# Project Planner: SimpleBill SaaS

## Current Status
- **Frontend:** React + Vite (Stable)
- **Backend:** Node.js (Vercel) & PHP Bridge (Unified Protocol)
- **Database:** MySQL (Remote)
- **Focus:** Robustness, Validation, and UI Refresh Consistency.

## Completed Tasks
- **Validation:** Implemented strict server-side validation for duplicate License Keys, Emails, and Phone numbers during registration.
- **Table Refresh:** Implemented cache invalidation strategies in the frontend `dataService` to ensure UI tables refresh immediately after saves/deletes.
- **Reference Integrity:** Updated data fetchers to return array copies to guarantee React state updates trigger re-renders.
- **Customer Integrity:** Added backend enforcement to prevent duplicate customers with the same phone number.

## Optimization: Global Schema
Refactoring single-row tenant tables to global tables to reduce database clutter (inode usage) and improve manageability.

1.  **Global Settings:** Move `{prefix}app_settings` -> `saas_app_settings` (Global).
2.  **Global Profiles:** Move `{prefix}user_profiles` -> `saas_user_profiles` (Global).
3.  **Tenant Tables:** Keep `{prefix}customers`, `{prefix}invoices`, `{prefix}loginactivity` as they grow with usage.

## Execution Steps
1.  **Schema Update:** Update `ensureGlobalTables` in Node/PHP to create new global tables.
2.  **Logic Redirect:** Point API actions (`save_app_settings`, `get_profile`, etc.) to new tables.
3.  **Registration Hook:** Create profile entry on user registration.
4.  **Cleanup:** Remove old table definitions from `ensureTenantTables`.

## New Scope (Feb 2026)
- Add **full CRUD + assignment flow** for `saas_license_keys` in Super Admin portal.
- Ensure registration validates against `saas_license_keys` and enforces `assigned_email` ownership.
- Add persistent **Contact Us** submission pipeline (`saas_contact_messages`) + admin inbox.
- Add centralized **error logger** table (`saas_error_logs`) and admin observability page.

## Execution Plan Addendum
1. Extend global schema bootstrap with contact + error log tables.
2. Add admin APIs: get/save/delete license, get contact messages, get error logs.
3. Add public API: submit contact message.
4. Add API/client error capture action (`log_error`) and fallback capture in server error handler.
5. Add admin UI tabs: License Vault, Contact Inbox, Error Logger.
