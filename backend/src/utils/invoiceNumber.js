/**
 * Generates a sequential invoice number for a specific business.
 * Format: {prefix}-YYYYMMDD-XXXX (e.g., INV-20260515-0001)
 * 
 * @param {import('mysql2/promise').Connection} conn - The active transaction connection
 * @param {number} businessId - The business ID
 * @param {string} prefix - The invoice prefix from business settings (e.g., 'INV')
 * @returns {Promise<string>} - The generated invoice number
 */
export async function generateInvoiceNo(conn, businessId, prefix = 'INV') {
  // Use YYYYMMDD format for the date component
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  
  let tableName = 'sales';
  let dateFieldName = 'invoice_date';
  let numberFieldName = 'invoice_no';
  
  if (prefix === 'PO') {
    tableName = 'purchases';
    dateFieldName = 'purchase_date';
    numberFieldName = 'purchase_invoice_no';
  } else if (prefix === 'PR') {
    tableName = 'purchase_returns';
    dateFieldName = 'return_date';
    numberFieldName = 'return_invoice_no';
  } else if (prefix === 'SR') {
    tableName = 'sales_returns';
    dateFieldName = 'return_date';
    numberFieldName = 'return_invoice_no';
  }
  
  // Count how many records were made today for this business in the correct table to determine sequence
  const [[{ count }]] = await conn.execute(
    `SELECT COUNT(*) as count FROM ${tableName} WHERE business_id = ? AND DATE(${dateFieldName}) = CURDATE()`,
    [businessId]
  );
  
  let seqNum = count + 1;
  let finalInvoiceNo = '';
  let exists = true;
  
  // Defensive loop: find the next available sequence number that does not exist in the database
  while (exists) {
    const seqStr = String(seqNum).padStart(4, '0');
    finalInvoiceNo = `${prefix}-${todayStr}-${seqStr}`;
    
    const [rows] = await conn.execute(
      `SELECT 1 FROM ${tableName} WHERE business_id = ? AND ${numberFieldName} = ?`,
      [businessId, finalInvoiceNo]
    );
    
    if (rows.length === 0) {
      exists = false;
    } else {
      seqNum++;
    }
  }
  
  return finalInvoiceNo;
}
