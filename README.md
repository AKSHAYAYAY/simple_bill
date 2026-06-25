# SimpleBill

A multi-tenant SaaS billing and inventory management platform built for small businesses. Manage invoices, purchases, customers, suppliers, inventory, payments, and reports — all in one place.

## Tech Stack

- **Frontend** — React + TypeScript + Vite
- **Backend** — Node.js + Express (JWT auth, tenant-safe CRUD, MySQL)
- **Worker** — FastAPI (Python) for async tasks and PDF generation
- **Database** — MySQL

## Project Structure

```
├── backend/               # Node.js + Express API
│   ├── src/
│   │   ├── routes/        # API route handlers
│   │   ├── middleware/    # Auth, tenant, role guards
│   │   ├── services/      # Business logic
│   │   └── db/            # DB pool, migrations, provisioner
│   ├── sql/               # Schema migrations
│   └── .env.example       # Environment variable template
├── python_worker/         # FastAPI sidecar (PDF, reporting)
├── components/            # Shared React components
├── pages/                 # Page-level React components
├── services/              # Frontend API service layer
└── utils/                 # Utility helpers
```

## Getting Started

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in your values
npm run start
```

### 2. Python Worker

```bash
cd python_worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

### 3. Frontend

```bash
npm install
npm run dev
```

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Description |
|---|---|
| `MYSQL_HOST` | Database host |
| `MYSQL_USER` | Database user |
| `MYSQL_PASSWORD` | Database password |
| `MYSQL_DATABASE` | Database name |
| `JWT_SECRET` | Strong secret for access tokens |
| `JWT_REFRESH_SECRET` | Strong secret for refresh tokens |
| `ADMIN_SECRET` | Super-admin password |
| `PYTHON_WORKER_URL` | URL of the FastAPI worker |

## Features

- Multi-tenant architecture — each business gets isolated data
- Invoice generation with PDF export
- Purchase & sales management with returns
- Customer & supplier ledger
- Inventory tracking
- Expense & income tracking (cashbook)
- Payment management
- Reports & analytics
- Staff management with role-based access
- JWT authentication with refresh tokens

## Admin Access

Super-admin login:

- Local: `http://localhost:5173/?admin`
- Production: `https://<your-domain>/?admin`

## Deployment

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for Vercel and cPanel deployment steps.
