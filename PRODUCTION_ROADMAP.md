# SimpleBill Production Plan (Implemented Baseline)

## Critical bugs/issues found in current app strategy
1. Database credentials are embedded in frontend defaults (`types.ts`), allowing any user to inspect secrets.
2. Frontend sends raw MySQL connection details in every request (`services/dataService.ts`), violating zero-trust API design.
3. Two backend paths (Node + PHP bridge) increase attack surface and maintenance overhead.
4. CORS is fully open in old API (`*`), without origin hardening.
5. No JWT-based access control enforcing tenant boundaries on the server.
6. Limited request validation and weak operational controls (rate-limiting, structured logs, health endpoint).

## Production architecture (recommended)
- React SPA (no secrets) -> `/api/v1/*`
- Node.js Express API as single backend
- MySQL with strict tenant filtering (`tenant_id` in all business tables)
- Python worker for async/support workloads (reporting/PDF/automation)

## What has been implemented in this repository
- New production backend scaffold in `backend/` with:
  - Env-based configuration
  - JWT auth + refresh token endpoints
  - Tenant-scoped customer/invoice APIs
  - Security middleware (`helmet`, `rate-limit`, CORS)
  - SQL migration bootstrap script
- New Python worker baseline in `python_worker/` for task offloading.
- Frontend default secrets removed from committed source.

## Next implementation steps
1. Migrate frontend API calls from bridge `action` model to REST endpoints in `backend/src/routes/*`.
2. Add refresh-token persistence/revocation table for secure logout/device sessions.
3. Add email verification and reset flows.
4. Add integration tests and CI pipeline.
5. Deploy Node API + worker + MySQL with staging/prod environments.
