import os
import aiomysql
from fastapi import FastAPI, BackgroundTasks
from contextlib import asynccontextmanager
from pydantic import BaseModel
from dotenv import load_dotenv

# We import the PDF generator task
from tasks.invoice_pdf import generate_invoice_pdf

load_dotenv(dotenv_path='../.env')

app = FastAPI(title="RetailBillbook Worker", version="2.0.0")

# DB pools map: dynamically cached tenant pools
tenant_pools = {}

async def get_tenant_pool(tenant_db: str):
    if tenant_db not in tenant_pools:
        # Create a new pool for this tenant
        pool = await aiomysql.create_pool(
            host=os.getenv('DB_HOST', 'localhost'),
            port=int(os.getenv('DB_PORT', 3306)),
            user=os.getenv('DB_USER', 'root'),
            password=os.getenv('DB_PASS', ''),
            db=tenant_db,
            autocommit=True,
            minsize=1,
            maxsize=5
        )
        tenant_pools[tenant_db] = pool
    return tenant_pools[tenant_db]

@asynccontextmanager
async def lifespan(app):
    yield
    # Cleanup all pools on shutdown
    for pool in tenant_pools.values():
        pool.close()
        await pool.wait_closed()

app = FastAPI(lifespan=lifespan)

class InvoiceJobPayload(BaseModel):
    sale_id: int
    business_id: int
    tenant_db: str

@app.get('/health')
def health():
    return {"status": "ok", "tenant_pools_cached": len(tenant_pools)}

@app.post("/tasks/generate-invoice-pdf")
async def generate_invoice_pdf_task(payload: InvoiceJobPayload, bg: BackgroundTasks):
    pool = await get_tenant_pool(payload.tenant_db)
    # Fire and forget the heavy PDF generation
    bg.add_task(generate_invoice_pdf, payload.sale_id, payload.business_id, pool)
    
    return { 
        "job_id": f"pdf_{payload.tenant_db}_{payload.sale_id}", 
        "status": "queued" 
    }

@app.get("/tasks/status/{job_id}")
async def job_status(job_id: str):
    # In a real production app, we would query Redis or a job_status table.
    # For now, check if file exists. Format: pdf_sb_biz_101_db_45.pdf
    filename = f"{job_id}.pdf"
    file_path = os.path.join('/tmp', filename)
    
    if os.path.exists(file_path):
        return { "status": "ready", "url": f"/download/{filename}" }
    
    return { "status": "pending" }
