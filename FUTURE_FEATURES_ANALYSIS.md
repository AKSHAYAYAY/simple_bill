# SimpleBill Feature Status & Architectural Analysis

This analysis outlines which features currently exist in the codebase, where their logic resides, and how to manage or implement them if they need expansion.

---

## 1. Taxation & Compliance (Non-GST Option)

### Current Architecture Status: **Partially Supported (UI-Conditional & Formula Disabled)**
* **Settings Configuration:** In [Settings.tsx](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/pages/Settings.tsx) (under *Taxation & Compliance*), users can toggle between **Registered (GST)** and **Unregistered (Non-GST)**. This modifies `gst_type` to `'NON_GST'` in the database settings.
* **Invoice & Sourcing Screens:**
  * In [Invoices.tsx](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/pages/Invoices.tsx) and [Purchases.tsx](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/pages/Purchases.tsx), when `gstType === 'NON_GST'`, the taxation mode defaults to "No Tax", tax values are set to `0`, and all GST columns (CGST, SGST, IGST) are hidden from the item grids using conditional rendering.
* **Product Editing:**
  * In [ProductModal.tsx](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/components/ProductModal.tsx), the tax percentage fields are hidden if `gstType === 'NON_GST'`.
* **Financial Calculations:**
  * In [financialCalculations.ts](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/utils/financialCalculations.ts), tax values default to `0` when `NON_GST` is active.

### Missing/Gaps:
* **Reports Dashboard:** The **Tax Breakdown** panel and the "Tax Component" columns in the **Sales Register** on [Reports.tsx](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/pages/Reports.tsx) are still visible under `NON_GST` mode, though they display `₹0.00` tax values.

### How to Manage/Add (Hiding GST in Reports):
To completely hide GST breakdowns when `NON_GST` is selected, add conditional checks around the components in [Reports.tsx](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/pages/Reports.tsx):
```tsx
// Wrap the Tax Breakdown column in Reports.tsx:
{settings.gstType !== 'NON_GST' && (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
    {/* Tax Breakdown elements */}
  </div>
)}
```

---

## 2. Low Stock Alerts (Global vs. Product-Specific)

### Current Architecture Status: **Fully Supported**
* **Global Default Alert Setup:** Admin can configure a global threshold under **Settings** > **Operational Settings** > **Low Stock Alert Limit** (`low_stock_limit`). This value is saved in the database settings table.
* **Product-Specific Override:** 
  * In [ProductModal.tsx](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/components/ProductModal.tsx), when creating or editing a product, the `minimum_stock_alert` field defaults to the global setting.
  * The user can override this limit manually for any specific product.
* **Low Stock Reporting:**
  * In [reports.js](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/backend/src/routes/reports.js) (`/low-stock` endpoint), the backend queries products where `current_stock <= minimum_stock_alert` (which checks the product-specific override column, defaulting to the global schema setting of `10` or the frontend initial value of `5`).

---

## 3. Negative Stock Selling

### Current Architecture Status: **Fully Supported**
* **Global Checkboxes:** In **Settings** > **Operational Settings**, the checkboxes **Allow Negative Stock** and **Allow Zero Stock Sales** represent global operational states.
* **Product-Specific Rule:**
  * In the database `products` table, there is an `allow_negative_stock` column.
  * In [ProductModal.tsx](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/components/ProductModal.tsx), users can select the **Allow Negative Stock** checkbox to enable or disable negative checkouts for that specific product.
* **Backend Transaction Enforcement:**
  * In [sale.service.js](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/backend/src/services/sale.service.js) (lines 55-62), during a checkout transaction, the backend executes:
    ```javascript
    const product = rows[0];
    if (!product.allow_negative_stock && product.current_stock < item.quantity) {
      throw {
        status: 422,
        code: 'INSUFFICIENT_STOCK',
        message: `${product.product_name} has only ${product.current_stock} units. Requested: ${item.quantity}`
      };
    }
    ```
    If negative stock selling is disabled for a product, checkouts are blocked at database level.

---

## 4. Multi-Currency Options

### Current Architecture Status: **Partially Supported (Settings Configured but UI Rupee Hardcoded)**
* **Settings Support:** In `types.ts`, `AppSettings` stores a `currency` field. Predefined countries (US, IN, UK, CA, AU, EU) are mapped to currencies (`USD`, `INR`, `GBP`, `CAD`, `AUD`, `EUR`) in the configuration.
* **UI & Formatters Gaps:** 
  * The Rupee symbol (`₹`) is hardcoded in several React components (e.g. `Dashboard.tsx`, `Payments.tsx`, `Reports.tsx`).
  * Currency numbers are formatted using the `formatINR` function in [currency.ts](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/utils/currency.ts), which hardcodes the Indian Numbering System (`en-IN` locale) and the `'INR'` currency code.

### How to Manage/Add (Adding Multi-Currency Formatting):
1. **Refactor Currency Utility:** Replace [currency.ts](file:///Users/bizbytech/Bizbytech/fullstack/SimpleBill/simple-bill/utils/currency.ts) with a dynamic currency formatter that reads the user's active `currency` setting:
   ```typescript
   export function formatCurrency(
     amount: number | null | undefined, 
     currencyCode: string = 'INR', 
     locale: string = 'en-IN'
   ): string {
     const value = Number(amount) || 0;
     return new Intl.NumberFormat(locale, {
       style: 'currency',
       currency: currencyCode,
     }).format(value);
   }
   ```
2. **Remove Hardcoded Symbols:** Replace static `₹` symbols in UI components with a settings-derived value (e.g. `const symbol = getCurrencySymbol(settings.currency)`).

---

## 5. Lucide Logos and Branding Customization

### Current Architecture Status: **Fully Supported**
* **Lucide Integration:** Icons and logos are imported from the modern `lucide-react` package (e.g. `Building2`, `Palette`, `Layers`, `TrendingUp`, etc.) and rendered cleanly.
* **Dynamic Logo Customization:**
  * Admin users can upload custom brand logos (PNG, JPEG, WebP, SVG) or paste direct logo URLs in **Settings** > **Design**.
  * File uploads are automatically converted into Base64 data URLs on the client side and saved directly into database business settings.
  * This logo is dynamically rendered on printed invoices, purchase registers, and billing layouts.
