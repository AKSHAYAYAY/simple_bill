# Reports and Metrics Implementation Guide

This document outlines the architecture, data flow, and computation logic for all financial calculations, reports, daybook aggregates, and dashboard metrics across the SimpleBill codebase.

---

## 1. Architecture Overview

SimpleBill handles calculations using a hybrid model:
1. **Frontend Calculations:** Simple, instantaneous client-side calculations (like invoice-level taxes, pending invoice amounts, and date-range metrics filters) are performed directly in React components or specialized utility files.
2. **Backend Database-Level Calculations:** Heavy aggregations, cross-table joins, and database-wide metrics (such as customer outstanding balance, product/category profitability, and dead stock) are computed in the Express backend using raw SQL queries to ensure performance and accuracy.

---

## 2. Dashboard Metrics

The dashboard displays high-level business metrics populated from both the frontend invoice cache and backend aggregate endpoints:

### Client-Side Stats (Calculated on Invoices Array)
* **File:** [financialCalculations.ts](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/utils/financialCalculations.ts) via `calculateInvoiceStats`
* **Computed Metrics:**
  * **Total Revenue:** Sum of the `total` of all `PAID` invoices.
  * **Pending Invoices (Amount):** Sum of the outstanding due amount on all non-`PAID` active invoices.
  * **Paid Invoices (Count):** Count of invoices with `status === InvoiceStatus.PAID`.
  * **Overdue Invoices (Count):** Count of invoices whose due dates have passed or status is marked `Overdue`.

### Server-Side Stats (Dashboard Endpoint)
* **Endpoint:** `GET /api/v1/b/:businessId/reports/dashboard`
* **File:** [reports.js](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/backend/src/routes/reports.js)
* **Computed Metrics:**
  * **Today's Sales:** Raw SQL query summing the `grand_total` of all sales invoices where `invoice_date = CURDATE()`.
  * **Today's Pay In:** Sum of `amount` from `payment_in` where `payment_date = CURDATE()`.
  * **Today's Pay Out:** Sum of `amount` from `payment_out` where `payment_date = CURDATE()`.
  * **Day Balance:** The difference between `Today's Pay In` and `Today's Pay Out`.
  * **Customer Outstanding:** Total sum of outstanding balances across unpaid/partially paid sales.
  * **Supplier Outstanding:** Total sum of outstanding balances across unpaid/partially paid purchase bills.
  * **Low Stock Count:** Count of products where `current_stock <= minimum_stock_alert`.

---

## 3. Payments Registry & Today's Cash Flow Metrics

The Payments Registry tracks collections (incoming cash/bank) and payouts (outgoing cash/bank to suppliers):

* **File:** [Payments.tsx](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/pages/Payments.tsx)
* **Computed Metrics:**
  * **Today's Pays In:** Sum of all customer payments received today.
  * **Today's Payouts:** Sum of all supplier payments paid today.
  * **Customer Due:** Outstanding receivable balance sum from customers list.
  * **Vendor Due:** Outstanding payable balance sum from suppliers list.

### Why "Today's Pays In" & "Today's Payouts" were showing ₹0.00
#### The Issue:
The frontend was comparing dates using UTC-based strings rather than localized dates:
1. `todayStr` was calculated as `new Date().toISOString().split('T')[0]` (which evaluates to the date in **UTC** time zone).
2. The comparison logic checked:
   ```typescript
   const dateStr = typeof p.payment_date === 'string' 
     ? p.payment_date 
     : new Date(p.payment_date).toISOString().split('T')[0];
   return dateStr.startsWith(todayStr);
   ```
3. Because the API returns `payment_date` as a string formatted with UTC time offset (e.g. `"2026-05-22T18:30:00.000Z"` for a local entry made on `2026-05-23`), `typeof p.payment_date === 'string'` was `true`.
4. It skipped date parsing entirely and checked if `"2026-05-22T18:30:00.000Z"` started with `"2026-05-23"`, resulting in a mismatch and showing `₹0.00`.

#### The Fix:
We replaced this logic with a timezone-safe comparison that format dates relative to the **client's local timezone**:
```typescript
const getLocalDateStr = (dObj: Date) => {
  const year = dObj.getFullYear();
  const month = String(dObj.getMonth() + 1).padStart(2, '0');
  const day = String(dObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const todayStr = getLocalDateStr(new Date());
```
Both today's date and the payment date are converted into local `YYYY-MM-DD` strings before exact equality checks, restoring correct calculations.

---

## 4. Cashbook & Daybook Transactions

The daybook registers every cash and bank movement in chronological order:

* **Backend Endpoint:** `GET /api/v1/b/:businessId/daybook`
* **File:** [daybook.js](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/backend/src/routes/daybook.js)
* **Aggregation Logic:** 
  The backend filters the `day_book` table by business ID and date range, then aggregates the totals using an in-memory reducer:
  ```javascript
  const aggregates = rows.reduce((acc, row) => {
    acc.cash_in += Number(row.cash_in || 0);
    acc.cash_out += Number(row.cash_out || 0);
    acc.bank_in += Number(row.bank_in || 0);
    acc.bank_out += Number(row.bank_out || 0);
    return acc;
  }, { cash_in: 0, cash_out: 0, bank_in: 0, bank_out: 0 });
  ```
  This returns totals for cash-in, cash-out, net-cash, bank-in, bank-out, and net-bank, which are rendered inside the Daybook view ([CashbookExpenses.tsx](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/pages/CashbookExpenses.tsx)).

---

## 5. Advanced Business Reports

The Reports tab handles 7 specialized business analytical sheets:

* **File:** [Reports.tsx](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/pages/Reports.tsx)
* **Backend File:** [reports.js](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/backend/src/routes/reports.js)

| Report Sheet | Metric Calculated | Method / SQL logic |
| :--- | :--- | :--- |
| **Fast Moving Items** | Quantity sold per product | SQL: `SUM(sale_items.quantity)` grouped by product, sorted descending. |
| **Slow Moving / Dead Stock** | Stagnancy (days since last sale) | SQL: `DATEDIFF(NOW(), MAX(sales.invoice_date))` for items with `current_stock > 0`. |
| **Top Customers** | Customer contribution value | SQL: `SUM(sales.grand_total)` grouped by customer, sorted descending. |
| **Supplier Spend** | Total procurements spend | SQL: `SUM(purchases.grand_total)` grouped by supplier, sorted descending. |
| **Item Profitability** | Revenue, Cost, Profit, Margin | SQL: `SUM(qty * selling_price) - SUM(qty * purchase_price)` per item. |
| **Category Profitability** | Margin grouped by category | SQL: Same as item profitability but grouped on `categories.category_id`. |
| **Low Stock Alerts** | Stock deficit quantity | SQL: `(minimum_stock_alert - current_stock)` where `current_stock <= minimum_stock_alert`. |
