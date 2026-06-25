import { Invoice, InvoiceStatus, AppSettings, DaybookEntry } from '../types';

export interface InvoiceStats {
  totalRevenue: number;     // PAID invoices only
  pendingAmount: number;    // All active non-PAID invoices
  pendingCount: number;     // Count of active non-PAID invoices
  overdueCount: number;     // Count of active invoices that are overdue (due date passed or status is Overdue)
  totalSales: number;       // Sum of all active invoices' total
  totalTax: number;         // Sum of all active invoices' tax (if settings are GST)
  totalTaxable: number;     // Sum of all active invoices' subtotal (taxable amount)
}

export interface DaybookStats {
  inflow: number;
  outflow: number;
  cash: number;
  bank: number;
}

/**
 * Calculates unified financial statistics from invoices, keeping detailed logs of
 * calculations to allow manual verification by the user.
 */
export function calculateInvoiceStats(invoices: Invoice[], settings?: AppSettings): InvoiceStats {
  const gstType = settings?.gstType || 'GST';
  const isNonGst = gstType === 'NON_GST';

  // Filter out DELETED status invoices
  const activeInvoices = invoices.filter(inv => inv.status !== InvoiceStatus.DELETED);

  let totalRevenue = 0;
  let pendingAmount = 0;
  let pendingCount = 0;
  let overdueCount = 0;
  let totalSales = 0;
  let totalTax = 0;
  let totalTaxable = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const revenueInvoices: typeof activeInvoices = [];
  const pendingInvoices: typeof activeInvoices = [];
  const overdueInvoices: typeof activeInvoices = [];
  const salesInvoices: typeof activeInvoices = [];

  activeInvoices.forEach(inv => {
    const total = Number(inv.total) || 0;
    const tax = isNonGst ? 0 : (Number(inv.tax) || 0);
    // If NON_GST, taxable is same as total (excluding shipping/packing charges if we want, but subtotal is cleanest)
    // Wait, let's keep taxable as subtotal (which is total - tax - charges + discounts)
    // Or if NON_GST is true, we override subtotal to be base, or keep subtotal as-is. Let's make sure it matches:
    const subtotal = Number(inv.subtotal) || 0;
    const taxable = isNonGst ? total : subtotal;

    totalSales += total;
    totalTax += tax;
    totalTaxable += taxable;
    salesInvoices.push(inv);

    if (inv.status === InvoiceStatus.PAID) {
      totalRevenue += total;
      revenueInvoices.push(inv);
    } else {
      pendingAmount += total;
      pendingCount += 1;
      pendingInvoices.push(inv);

      // Check overdue conditions: status is Overdue OR dueDate is in the past
      let isOverdue = inv.status === InvoiceStatus.OVERDUE;
      if (!isOverdue && inv.dueDate) {
        const dueDateObj = new Date(inv.dueDate);
        dueDateObj.setHours(0, 0, 0, 0);
        if (dueDateObj < today) {
          isOverdue = true;
        }
      }

      if (isOverdue) {
        overdueCount += 1;
        overdueInvoices.push(inv);
      }
    }
  });

  // Print detailed verification trace logs
  console.group(`Invoice Stats Calculation Trace (${new Date().toLocaleTimeString()})`);
  console.log(`GST Mode: ${gstType} (Is Non-GST: ${isNonGst})`);
  console.log(`Total Active Invoices processed: ${activeInvoices.length}`);
  
  console.group("1. Total Revenue (PAID Invoices Only)");
  console.log(`Total: ₹${totalRevenue.toFixed(2)}`);
  console.table(revenueInvoices.map(i => ({
    "Invoice ID": i.id,
    "Customer ID": i.customerId,
    "Date": i.date,
    "Total Amount": i.total,
    "Status": i.status
  })));
  console.groupEnd();

  console.group("2. Pending Amount & Count (Active non-PAID Invoices)");
  console.log(`Amount: ₹${pendingAmount.toFixed(2)} | Count: ${pendingCount}`);
  console.table(pendingInvoices.map(i => ({
    "Invoice ID": i.id,
    "Customer ID": i.customerId,
    "Due Date": i.dueDate,
    "Total Amount": i.total,
    "Status": i.status
  })));
  console.groupEnd();

  console.group("3. Overdue Count (Due Date passed OR Status is Overdue)");
  console.log(`Count: ${overdueCount}`);
  console.table(overdueInvoices.map(i => ({
    "Invoice ID": i.id,
    "Customer ID": i.customerId,
    "Due Date": i.dueDate,
    "Total Amount": i.total,
    "Status": i.status,
    "Reason": i.status === InvoiceStatus.OVERDUE ? "Status is Overdue" : `Due Date (${i.dueDate}) passed today (${today.toISOString().split('T')[0]})`
  })));
  console.groupEnd();

  console.group("4. Totals (Sales, Tax, Taxable)");
  console.log(`Total Sales: ₹${totalSales.toFixed(2)}`);
  console.log(`Total Tax: ₹${totalTax.toFixed(2)}`);
  console.log(`Total Taxable (Subtotal): ₹${totalTaxable.toFixed(2)}`);
  console.table(salesInvoices.map(i => ({
    "Invoice ID": i.id,
    "Subtotal (Taxable)": i.subtotal,
    "Tax": isNonGst ? 0 : i.tax,
    "Override Tax (NON_GST)": isNonGst ? "YES (Forced 0)" : "NO",
    "Total": i.total,
    "Status": i.status
  })));
  console.groupEnd();

  console.groupEnd();

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    pendingAmount: Math.round(pendingAmount * 100) / 100,
    pendingCount,
    overdueCount,
    totalSales: Math.round(totalSales * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    totalTaxable: Math.round(totalTaxable * 100) / 100,
  };
}

/**
 * Calculates Daybook and Cashbook statistics from daily entry logs.
 */
export function calculateDaybookStats(entries: DaybookEntry[]): DaybookStats {
  let inflow = 0;
  let outflow = 0;
  let cash = 0;
  let bank = 0;

  entries.forEach(e => {
    const cIn = Number(e.cash_in) || 0;
    const cOut = Number(e.cash_out) || 0;
    const bIn = Number(e.bank_in) || 0;
    const bOut = Number(e.bank_out) || 0;

    inflow += cIn + bIn;
    outflow += cOut + bOut;
    cash += cIn - cOut;
    bank += bIn - bOut;
  });

  // Log validation traces and check for negative flows or balances
  console.group(`Daybook Stats Calculation Trace (${new Date().toLocaleTimeString()})`);
  console.log(`Processed ${entries.length} daybook entries`);
  console.log(`Totals -> Inflow: ₹${inflow.toFixed(2)}, Outflow: ₹${outflow.toFixed(2)}`);
  console.log(`Balances -> Cash: ₹${cash.toFixed(2)}, Bank: ₹${bank.toFixed(2)}`);
  
  if (cash < 0) {
    console.warn(`[Daybook Calculation Alert] Negative Cash Balance: ₹${cash.toFixed(2)}`);
  }
  if (bank < 0) {
    console.warn(`[Daybook Calculation Alert] Negative Bank Balance: ₹${bank.toFixed(2)}`);
  }
  console.groupEnd();

  return {
    inflow: Math.round(inflow * 100) / 100,
    outflow: Math.round(outflow * 100) / 100,
    cash: Math.round(cash * 100) / 100,
    bank: Math.round(bank * 100) / 100
  };
}

/**
 * Safely calculates profit percentage, avoiding division by zero or NaN.
 * Returns null if purchase price is 0 or invalid, meaning margin cannot be computed.
 */
export function safeProfit(selling: number | string, purchase: number | string): number | null {
  const s = Number(selling) || 0;
  const p = Number(purchase) || 0;
  if (p <= 0) return null; // no cost = no margin to show
  return ((s - p) / p) * 100;
}
