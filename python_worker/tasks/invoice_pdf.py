import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
import aiomysql
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def generate_invoice_pdf(sale_id: int, business_id: int, pool: aiomysql.Pool):
    """
    Generates a PDF for a given sale using ReportLab.
    This runs asynchronously in the background.
    """
    try:
        logger.info(f"Starting PDF generation for Sale ID {sale_id} in Business {business_id}")
        
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                # Fetch Sale Data
                await cur.execute(
                    "SELECT * FROM sales WHERE sale_id = %s AND business_id = %s", 
                    (sale_id, business_id)
                )
                sale = await cur.fetchone()
                
                if not sale:
                    logger.error(f"Sale {sale_id} not found!")
                    return
                
                # Fetch Sale Items
                await cur.execute(
                    "SELECT * FROM sale_items WHERE sale_id = %s", 
                    (sale_id,)
                )
                items = await cur.fetchall()

        # Generate PDF using ReportLab
        job_id = f"pdf_{pool.db}_{sale_id}"
        file_path = f"/tmp/{job_id}.pdf"
        
        c = canvas.Canvas(file_path, pagesize=A4)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(50, 800, f"TAX INVOICE: {sale['invoice_no']}")
        
        c.setFont("Helvetica", 12)
        c.drawString(50, 770, f"Date: {sale['invoice_date']}")
        c.drawString(50, 750, f"Payment Status: {sale['payment_status']}")
        
        y = 700
        c.drawString(50, y, "Item Details:")
        y -= 20
        
        for item in items:
            name = item['item_name'] or f"Product ID: {item['product_id']}"
            qty = float(item['quantity'])
            price = float(item['selling_price'])
            total = float(item['total_amount'])
            
            c.drawString(70, y, f"- {name} (Qty: {qty} @ {price}) -> {total}")
            y -= 20
        
        y -= 20
        c.setFont("Helvetica-Bold", 14)
        c.drawString(50, y, f"Grand Total: Rs {float(sale['grand_total']):.2f}")
        
        c.save()
        logger.info(f"Successfully generated PDF: {file_path}")
        
    except Exception as e:
        logger.error(f"Error generating PDF for Sale {sale_id}: {e}")
