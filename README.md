# SimpleBill SaaS

SimpleBill currently contains a React UI and now includes a production backend baseline:

- `backend/`: Node.js + Express API (JWT auth, tenant-safe CRUD, MySQL integration)
- `python_worker/`: FastAPI sidecar worker (async/reporting foundation)
- `backend/sql/001_init.sql`: initial schema migration

## Why this change
The previous model exposed DB credentials in frontend settings and passed DB config from browser requests. This repository now includes a secure direction: server-side secrets with environment variables and tenant-bound API access.

## Run backend locally
```bash
cd backend
npm install
cp .env.example .env
npm run start
```

## Run Python worker locally
```bash
cd python_worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```


## Deployment
See `DEPLOYMENT_GUIDE.md` for Vercel and MilesWeb cPanel deployment steps.

## Admin login
Use the hidden super-admin entry point by opening:

- Local: `http://localhost:5173/?admin`
- Hosted: `https://<your-domain>/?admin`


For super-admin operations, see `ADMIN_PORTAL_HELP.md`.
