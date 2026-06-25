# Retail Billbook — API Reference v1
### Based on Database Schema v3 · Model B (Per-Tenant Database)

---

## Conventions

| Item | Rule |
|---|---|
| Base URL | `https://api.yourdomain.com/api/v1` |
| Business scope | All business-level routes use `/b/:businessId/` prefix |
| Auth | `Authorization: Bearer <jwt_access_token>` on every request |
| Content-Type | `application/json` |
| Date format | `YYYY-MM-DD` for all date fields |
| Decimal | All money/quantity fields as numbers (not strings) |
| Soft-delete | `deleted_at IS NOT NULL` rows excluded by default; pass `?include_deleted=true` to include |
| Pagination | All list endpoints accept `?page=1&limit=20` |
| Sorting | `?sort_by=created_at&sort_order=desc` |
| Search | `?search=keyword` on all list endpoints unless noted |

---

## Standard Response Envelope

```json
// Success (single record)
{
  "success": true,
  "data": { ... },
  "message": "Created successfully"
}

// Success (list)
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 340,
    "total_pages": 17
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "invoice_no is required",
    "fields": { "invoice_no": "This field is required" }
  }
}
```

---

## HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 204 | Deleted / No content |
| 400 | Validation error / Bad request |
| 401 | Unauthenticated |
| 403 | Forbidden (wrong business / insufficient role) |
| 404 | Record not found |
| 409 | Conflict (duplicate invoice no, duplicate email, etc.) |
| 422 | Business logic error (e.g. stock would go negative) |
| 500 | Internal server error |

---

## Role Permissions Reference

| Role | Can Read | Can Write | Can Delete | Can Manage Users | Can Change Settings |
|---|---|---|---|---|---|
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manager | ✅ | ✅ | ✅ | ❌ | ❌ |
| Accountant | ✅ | ✅ | ❌ | ❌ | ❌ |
| Staff | ✅ | ✅ (Sales only) | ❌ | ❌ | ❌ |

---

---

# MODULE 1 — AUTHENTICATION

> Tables: `app_users`

---

### `POST /auth/register`
Register a new app user (creates the user account, does NOT create a business yet).

**Request Body**
```json
{
  "full_name": "Ramesh Kumar",
  "email": "ramesh@example.com",
  "phone": "9876543210",
  "password": "SecurePass@123"
}
```

**Response `201`**
```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "full_name": "Ramesh Kumar",
    "email": "ramesh@example.com",
    "phone": "9876543210"
  },
  "message": "Account created. Please verify your phone or email."
}
```

**Logic**
- Hash password with bcrypt before storing
- Optionally send OTP to phone/email for verification
- Does not auto-login; user must call `/auth/login`

---

### `POST /auth/login`
Authenticate and receive access + refresh tokens.

**Request Body**
```json
{
  "email": "ramesh@example.com",
  "password": "SecurePass@123"
}
```
> Either `email` or `phone` accepted.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "expires_in": 900,
    "user": {
      "user_id": 1,
      "full_name": "Ramesh Kumar",
      "email": "ramesh@example.com"
    },
    "businesses": [
      { "business_id": 1, "business_name": "Ram Store", "role": "Owner" }
    ]
  }
}
```

**Logic**
- `access_token` expires in 15 min
- `refresh_token` expires in 7 days
- Return all businesses the user belongs to (via `business_users` + `businesses` join)

---

### `POST /auth/refresh-token`
Exchange a valid refresh token for a new access token.

**Request Body**
```json
{ "refresh_token": "eyJ..." }
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "expires_in": 900
  }
}
```

---

### `POST /auth/logout`
Invalidate the current refresh token (blacklist it server-side).

**Request Body**
```json
{ "refresh_token": "eyJ..." }
```

**Response `204`** — No body

---

### `POST /auth/forgot-password`
Send a password reset OTP/link to email or phone.

**Request Body**
```json
{ "email": "ramesh@example.com" }
```

**Response `200`**
```json
{ "success": true, "message": "Reset OTP sent to registered email." }
```

---

### `POST /auth/reset-password`
Reset password using the OTP/token received.

**Request Body**
```json
{
  "reset_token": "ABC123",
  "new_password": "NewSecurePass@456"
}
```

**Response `200`**
```json
{ "success": true, "message": "Password updated. Please login." }
```

---

### `POST /auth/verify-otp`
Verify phone/email OTP after registration.

**Request Body**
```json
{ "phone": "9876543210", "otp": "483921" }
```

**Response `200`**
```json
{ "success": true, "message": "Verified successfully." }
```

---

---

# MODULE 2 — APP USER (PROFILE)

> Tables: `app_users`

---

### `GET /users/me`
Get the authenticated user's profile.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "full_name": "Ramesh Kumar",
    "email": "ramesh@example.com",
    "phone": "9876543210",
    "created_at": "2025-01-10T08:00:00Z",
    "businesses": [
      { "business_id": 1, "business_name": "Ram Store", "role": "Owner" }
    ]
  }
}
```

---

### `PUT /users/me`
Update name, email, or phone.

**Request Body**
```json
{
  "full_name": "Ramesh Kumar Sharma",
  "email": "ramesh.sharma@example.com",
  "phone": "9876543299"
}
```

**Response `200`** — Updated user object

**Logic**
- Changing email/phone may trigger re-verification

---

### `PUT /users/me/password`
Change password (requires current password).

**Request Body**
```json
{
  "current_password": "OldPass@123",
  "new_password": "NewPass@456"
}
```

**Response `200`**
```json
{ "success": true, "message": "Password changed successfully." }
```

---

---

# MODULE 3 — BUSINESSES

> Tables: `businesses`, `business_users`

---

### `POST /businesses`
Create a new business. Automatically creates an `Owner` entry in `business_users`.

**Request Body**
```json
{
  "business_name": "Ram Kirana Store",
  "business_type": "Retail",
  "owner_name": "Ramesh Kumar",
  "gst_number": "27AAPFU0939F1ZV",
  "gst_type": "GST",
  "address": "12, MG Road",
  "city": "Indore",
  "state": "Madhya Pradesh",
  "pincode": "452001",
  "phone": "0731-2345678",
  "email": "ramstore@example.com",
  "invoice_prefix": "RAM"
}
```

**Response `201`** — Full business object

**Logic**
- Provisions a new tenant database `{prefix}_db` via your provisioning script
- Inserts caller as `Owner` in `business_users`
- Sets all defaults for tax settings, stock settings

---

### `GET /businesses`
List all businesses the authenticated user belongs to.

**Response `200`**
```json
{
  "success": true,
  "data": [
    {
      "business_id": 1,
      "business_name": "Ram Kirana Store",
      "business_type": "Retail",
      "role": "Owner",
      "is_active": true
    }
  ]
}
```

---

### `GET /businesses/:businessId`
Get full details of a single business.

**Response `200`** — Full business object including all settings fields

---

### `PUT /businesses/:businessId`
Update business profile fields.

**Request Body** — any subset of business fields

**Role required:** Owner, Admin

**Response `200`** — Updated business object

---

### `PUT /businesses/:businessId/settings`
Update tax & invoice settings separately (Settings Panel).

**Request Body**
```json
{
  "tax_display_mode": "Tax Exclusive",
  "default_sale_tax_mode": "CGST+SGST",
  "default_cgst_rate": 9,
  "default_sgst_rate": 9,
  "default_igst_rate": 18,
  "show_tax_on_invoice": true,
  "round_off_invoice": true,
  "allow_negative_stock": false,
  "allow_negative_selling": false,
  "low_stock_limit": 5,
  "invoice_prefix": "RAM"
}
```

**Role required:** Owner, Admin

**Response `200`** — Updated settings object

---

### `PUT /businesses/:businessId/toggle-active`
Activate or deactivate a business (`is_active`).

**Role required:** Owner

**Response `200`**
```json
{ "success": true, "data": { "is_active": false } }
```

---

---

# MODULE 4 — BUSINESS USERS (MULTI-USER ACCESS)

> Tables: `business_users`, `app_users`

---

### `GET /b/:businessId/users`
List all users who have access to this business.

**Role required:** Owner, Admin

**Response `200`**
```json
{
  "success": true,
  "data": [
    {
      "business_user_id": 1,
      "user_id": 1,
      "full_name": "Ramesh Kumar",
      "email": "ramesh@example.com",
      "phone": "9876543210",
      "role": "Owner",
      "is_active": true,
      "joined_at": "2025-01-10T08:00:00Z"
    }
  ]
}
```

---

### `POST /b/:businessId/users/invite`
Invite a user to the business by phone or email. If the user already has an account, add them directly. If not, send an invite link.

**Role required:** Owner, Admin

**Request Body**
```json
{
  "phone": "9876540001",
  "role": "Staff"
}
```

**Response `201`**
```json
{
  "success": true,
  "data": {
    "business_user_id": 5,
    "status": "invited",
    "invited_at": "2025-05-15T10:00:00Z"
  }
}
```

---

### `PUT /b/:businessId/users/:userId/role`
Change a user's role within the business.

**Role required:** Owner, Admin

**Request Body**
```json
{ "role": "Manager" }
```

**Response `200`** — Updated `business_user` object

---

### `PUT /b/:businessId/users/:userId/toggle-active`
Enable or disable a user's access to this business.

**Role required:** Owner, Admin

**Response `200`**
```json
{ "success": true, "data": { "is_active": false } }
```

---

### `DELETE /b/:businessId/users/:userId`
Remove a user from this business. Cannot remove the last Owner.

**Role required:** Owner

**Response `204`**

---

---

# MODULE 5 — CUSTOMERS

> Tables: `customers`, `sales`, `payment_in`, `sales_returns`

---

### `POST /b/:businessId/customers`
Create a new customer.

**Request Body**
```json
{
  "customer_name": "Suresh Patel",
  "company_name": "Patel Traders",
  "customer_type": "Wholesale Customer",
  "gst_number": "24AADCP2534R1ZZ",
  "phone": "9898989898",
  "alternate_phone": "0731-1234567",
  "email": "suresh@pateltraders.com",
  "address": "45, Cloth Market",
  "city": "Surat",
  "state": "Gujarat",
  "pincode": "395003",
  "opening_balance": 5000,
  "opening_balance_type": "Receivable",
  "credit_limit": 50000
}
```

**Response `201`** — Full customer object

---

### `GET /b/:businessId/customers`
List all customers with search & filter.

**Query Params**
- `?search=suresh` — searches name, company, phone, GST
- `?customer_type=Wholesale Customer`
- `?is_active=true`
- `?city=Surat`
- `?has_balance=true` — only customers with outstanding balance

**Response `200`** — Paginated customer list with `balance_due` appended per record

---

### `GET /b/:businessId/customers/:customerId`
Get single customer details.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "customer_id": 3,
    "customer_name": "Suresh Patel",
    "opening_balance": 5000,
    "opening_balance_type": "Receivable",
    "credit_limit": 50000,
    "balance_due": 12500,
    "total_billed": 75000,
    "total_received": 67500,
    ...
  }
}
```

**Logic** — `balance_due` computed as `opening_balance + total_billed - total_received`

---

### `PUT /b/:businessId/customers/:customerId`
Update customer details.

**Request Body** — Any subset of customer fields

**Response `200`** — Updated customer object

---

### `DELETE /b/:businessId/customers/:customerId`
Delete customer. Blocked if the customer has linked sales, payments, or returns.

**Response `204`** or `409` with reason

---

### `PUT /b/:businessId/customers/:customerId/toggle-active`
Activate or deactivate a customer.

**Response `200`**
```json
{ "success": true, "data": { "is_active": false } }
```

---

### `GET /b/:businessId/customers/:customerId/ledger`
Full transaction ledger for a customer (sales, payments, returns, opening balance).

**Query Params**
- `?from_date=2025-04-01&to_date=2025-04-30`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "customer_id": 3,
    "customer_name": "Suresh Patel",
    "opening_balance": 5000,
    "opening_balance_type": "Receivable",
    "closing_balance": 12500,
    "entries": [
      {
        "date": "2025-04-02",
        "type": "Sale",
        "reference_no": "RAM-0041",
        "debit": 18000,
        "credit": 0,
        "running_balance": 23000
      },
      {
        "date": "2025-04-05",
        "type": "Payment In",
        "reference_no": "PAY-0012",
        "debit": 0,
        "credit": 10000,
        "running_balance": 13000
      },
      {
        "date": "2025-04-10",
        "type": "Sales Return",
        "reference_no": "SR-0003",
        "debit": 0,
        "credit": 500,
        "running_balance": 12500
      }
    ]
  }
}
```

---

### `GET /b/:businessId/customers/:customerId/summary`
Quick financial summary of a customer (used in the customer card / drill-down).

**Response `200`**
```json
{
  "success": true,
  "data": {
    "total_invoices": 14,
    "total_billed": 75000,
    "total_received": 62500,
    "total_returns": 2500,
    "balance_due": 12500,
    "last_sale_date": "2025-04-02"
  }
}
```

---

---

# MODULE 6 — SUPPLIERS

> Tables: `suppliers`, `purchases`, `payment_out`, `purchase_returns`

---

### `POST /b/:businessId/suppliers`
Create a new supplier.

**Request Body**
```json
{
  "supplier_name": "Vijay Wholesale",
  "company_name": "Vijay Enterprises",
  "gst_number": "27AAACV1234R1ZZ",
  "phone": "9811122233",
  "alternate_phone": "",
  "email": "vijay@wholesale.com",
  "address": "Plot 5, APMC Yard",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400001",
  "opening_balance": 15000,
  "opening_balance_type": "Payable"
}
```

**Response `201`** — Full supplier object

---

### `GET /b/:businessId/suppliers`
List all suppliers with search & filter.

**Query Params**
- `?search=vijay`
- `?is_active=true`
- `?has_balance=true`

**Response `200`** — Paginated supplier list with `balance_due` appended

---

### `GET /b/:businessId/suppliers/:supplierId`
Get single supplier with computed balance.

**Response `200`** — Full supplier + `balance_due`, `total_invoiced`, `total_paid`

---

### `PUT /b/:businessId/suppliers/:supplierId`
Update supplier details.

**Response `200`** — Updated supplier object

---

### `DELETE /b/:businessId/suppliers/:supplierId`
Delete supplier. Blocked if linked to any purchase, payment, or return.

**Response `204`** or `409`

---

### `PUT /b/:businessId/suppliers/:supplierId/toggle-active`

**Response `200`** — `{ is_active: false }`

---

### `GET /b/:businessId/suppliers/:supplierId/ledger`
Full transaction ledger for a supplier.

**Query Params** — `from_date`, `to_date`

**Response `200`** — Same structure as customer ledger (entries: Purchase = debit to supplier, Payment Out = credit, Purchase Return = credit)

---

### `GET /b/:businessId/suppliers/:supplierId/summary`
Quick financial summary of a supplier.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "total_invoices": 8,
    "total_invoiced": 125000,
    "total_paid": 110000,
    "total_returns": 3000,
    "balance_due": 15000,
    "last_purchase_date": "2025-04-15"
  }
}
```

---

---

# MODULE 7 — CATEGORIES

> Tables: `categories`

---

### `POST /b/:businessId/categories`

**Request Body**
```json
{
  "category_name": "Beverages",
  "description": "Cold drinks, juices, water"
}
```

**Response `201`**

---

### `GET /b/:businessId/categories`

**Query Params** — `?is_active=true`, `?search=bev`

**Response `200`** — List of categories with product count per category

---

### `GET /b/:businessId/categories/:categoryId`

**Response `200`** — Single category + `product_count`

---

### `PUT /b/:businessId/categories/:categoryId`

**Request Body** — `{ category_name, description }`

**Response `200`**

---

### `DELETE /b/:businessId/categories/:categoryId`
Blocked if products are linked. Suggest setting `is_active = false` instead.

**Response `204`** or `409`

---

### `PUT /b/:businessId/categories/:categoryId/toggle-active`

**Response `200`** — `{ is_active: false }`

---

---

# MODULE 8 — UNITS

> Tables: `units`

---

### `POST /b/:businessId/units`

**Request Body** — `{ unit_name: "Kilogram", short_name: "kg" }`

**Response `201`**

---

### `GET /b/:businessId/units`

**Response `200`** — Full list (no pagination needed; typically small)

---

### `PUT /b/:businessId/units/:unitId`

**Request Body** — `{ unit_name, short_name }`

**Response `200`**

---

### `DELETE /b/:businessId/units/:unitId`
Blocked if linked to any product.

**Response `204`** or `409`

---

---

# MODULE 9 — PRODUCTS / INVENTORY

> Tables: `products`, `categories`, `units`, `stock_movements`

---

### `POST /b/:businessId/products`
Add a new product to inventory.

**Request Body**
```json
{
  "category_id": 2,
  "unit_id": 1,
  "product_name": "Parle G Biscuit 100g",
  "product_code": "PRD-001",
  "barcode": "8901719100009",
  "item_description": "Glucose biscuit 100g pack",
  "purchase_price": 8.50,
  "profit_percentage": 15,
  "selling_price": 10.00,
  "current_stock": 500,
  "minimum_stock_alert": 50,
  "cgst_percentage": 9,
  "sgst_percentage": 9,
  "igst_percentage": 18,
  "hsn_code": "19053100",
  "allow_negative_stock": false
}
```

**Response `201`** — Full product object

**Logic**
- If `selling_price` is not provided, compute from `purchase_price + (purchase_price * profit_percentage / 100)`
- If `current_stock > 0` on creation, insert an `Opening Stock` entry in `stock_movements`
- `product_code` must be unique per business (enforced by DB UNIQUE constraint)

---

### `GET /b/:businessId/products`
List products with rich filters.

**Query Params**
- `?search=parle` — searches name, code, barcode, description
- `?category_id=2`
- `?is_active=true`
- `?low_stock=true` — products where `current_stock <= minimum_stock_alert`
- `?out_of_stock=true` — `current_stock <= 0`
- `?sort_by=product_name&sort_order=asc`

**Response `200`**
```json
{
  "success": true,
  "data": [
    {
      "product_id": 11,
      "product_name": "Parle G Biscuit 100g",
      "product_code": "PRD-001",
      "barcode": "8901719100009",
      "current_stock": 500,
      "selling_price": 10.00,
      "purchase_price": 8.50,
      "stock_value": 4250.00,
      "category_name": "Biscuits",
      "unit_name": "Piece",
      "low_stock_alert": false
    }
  ]
}
```

**Logic**
- `stock_value` is computed on read: `current_stock * purchase_price` (not stored)

---

### `GET /b/:businessId/products/:productId`
Get full product details.

**Response `200`** — Full product object + `stock_value` + `category_name` + `unit_name`

---

### `GET /b/:businessId/products/barcode/:barcode`
Look up a product by its barcode (scan event from UI).

**Response `200`** — Full product object

**Logic**
- Fast lookup via `idx_product_barcode_biz` index on `(business_id, barcode)`

---

### `GET /b/:businessId/products/code/:productCode`
Look up a product by SKU/product code.

**Response `200`** — Full product object

---

### `PUT /b/:businessId/products/:productId`
Update product details.

**Request Body** — Any subset of product fields (not `current_stock` — use adjustment endpoint)

**Response `200`** — Updated product object

---

### `PUT /b/:businessId/products/:productId/toggle-active`
Mark product as inactive (soft delete for products).

**Response `200`** — `{ is_active: false }`

---

### `DELETE /b/:businessId/products/:productId`
Hard delete. Blocked if linked to any sale, purchase, or return.

**Response `204`** or `409`

---

### `POST /b/:businessId/products/:productId/adjust-stock`
Manually adjust stock (addition or subtraction).

**Request Body**
```json
{
  "adjustment_type": "Add",
  "quantity": 50,
  "notes": "Received extra goods from supplier walk-in"
}
```
> `adjustment_type`: `"Add"` or `"Remove"`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "product_id": 11,
    "stock_before": 500,
    "stock_after": 550,
    "movement_id": 103
  }
}
```

**Logic**
- Inserts a `Manual Adjustment` row into `stock_movements` with `reference_type = NULL`
- Applies `allow_negative_stock` rule if `adjustment_type = Remove` and stock would go negative

---

### `GET /b/:businessId/products/low-stock`
List all products where `current_stock <= minimum_stock_alert`.

**Response `200`** — Product list sorted by `current_stock ASC`

---

### `GET /b/:businessId/products/:productId/stock-movements`
Stock movement history for a single product.

**Query Params** — `from_date`, `to_date`, `movement_type`

**Response `200`**
```json
{
  "success": true,
  "data": [
    {
      "movement_id": 45,
      "movement_type": "Purchase In",
      "reference_type": "purchases",
      "reference_id": 12,
      "reference_no": "PO-0012",
      "quantity": 100,
      "stock_before": 200,
      "stock_after": 300,
      "created_at": "2025-04-01T10:30:00Z"
    }
  ]
}
```

---

---

# MODULE 10 — PURCHASES

> Tables: `purchases`, `purchase_items`, `suppliers`, `stock_movements`, `day_book`, `payment_out`

---

### `POST /b/:businessId/purchases`
Create a new purchase (goods received from supplier).

**Request Body**
```json
{
  "supplier_id": 2,
  "purchase_invoice_no": "PO-2025-001",
  "supplier_invoice_no": "SUP-INV-445",
  "purchase_date": "2025-04-01",
  "payment_mode": "Credit",
  "transport_cost": 200,
  "transport_paid_by": "Business",
  "transport_vehicle_no": "MP09GA1234",
  "loading_cost": 50,
  "other_charges": 0,
  "notes": "Bulk order for summer season",
  "amount_paid": 0,
  "items": [
    {
      "product_id": 11,
      "quantity": 100,
      "free_quantity": 5,
      "purchase_price": 8.50,
      "selling_price": 10.00,
      "profit_percentage": 17.6,
      "discount_percentage": 2,
      "discount_amount": 17,
      "cgst_percentage": 9,
      "sgst_percentage": 9,
      "igst_percentage": 0,
      "total_tax": 148.75,
      "total_amount": 981.75
    }
  ]
}
```

**Response `201`** — Full purchase object with items

**Logic**
- Auto-generate `purchase_invoice_no` if not provided (using `invoice_prefix`)
- `UNIQUE(business_id, purchase_invoice_no)` enforced by DB
- Trigger `trg_purchase_stock_update` adds stock for each item
- Inserts `Purchase In` rows in `stock_movements`
- Inserts a `Purchase` entry in `day_book`
- Computes `subtotal`, `total_cgst`, `total_sgst`, `total_igst`, `grand_total` server-side
- If `amount_paid > 0` AND `payment_mode != Credit`, also inserts a `payment_out` record

---

### `GET /b/:businessId/purchases`
List purchases with filters.

**Query Params**
- `?supplier_id=2`
- `?from_date=2025-04-01&to_date=2025-04-30`
- `?payment_status=Unpaid`
- `?payment_mode=Credit`
- `?search=PO-2025`
- `?include_deleted=true`

**Response `200`** — Paginated list; each record includes `amount_due = grand_total - amount_paid`

---

### `GET /b/:businessId/purchases/:purchaseId`
Get full purchase with all items.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "purchase_id": 12,
    "supplier_name": "Vijay Wholesale",
    "purchase_invoice_no": "PO-2025-001",
    "purchase_date": "2025-04-01",
    "subtotal": 850.00,
    "total_cgst": 76.50,
    "total_sgst": 76.50,
    "grand_total": 1003.00,
    "amount_paid": 0,
    "amount_due": 1003.00,
    "payment_status": "Unpaid",
    "items": [ { ... } ]
  }
}
```

---

### `PUT /b/:businessId/purchases/:purchaseId`
Update a purchase (allowed only if no linked return exists).

**Request Body** — Full purchase object with items

**Response `200`**

**Logic**
- Reverse previous stock changes, then apply new item quantities
- Regenerate `stock_movements` entries
- Regenerate `day_book` entry

---

### `DELETE /b/:businessId/purchases/:purchaseId`
Soft delete a purchase (`deleted_at = NOW()`).

**Response `200`**

**Logic**
- Blocked if a `purchase_return` exists against this purchase
- Reverses all stock additions made by this purchase's items
- Marks `deleted_at`; record is excluded from all reports unless `?include_deleted=true`

---

### `POST /b/:businessId/purchases/:purchaseId/restore`
Undo a soft delete.

**Response `200`** — Restored purchase

**Logic**
- Clears `deleted_at`
- Re-applies stock additions
- Re-inserts `day_book` entry

---

### `POST /b/:businessId/purchases/:purchaseId/record-payment`
Record an additional payment against a purchase (partial / full settlement).

**Request Body**
```json
{
  "amount": 500,
  "payment_mode": "UPI",
  "payment_date": "2025-04-10",
  "reference_no": "UPI-TXN-9988"
}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "payment_out_id": 22,
    "amount_paid_now": 500,
    "total_amount_paid": 500,
    "amount_due": 503,
    "payment_status": "Partial"
  }
}
```

**Logic**
- Creates a `payment_out` record linked to this `purchase_id` and `supplier_id`
- Updates `purchases.amount_paid` and `payment_status`
- Inserts `Payment Out` entry in `day_book`

---

---

# MODULE 11 — PURCHASE RETURNS

> Tables: `purchase_returns`, `purchase_return_items`, `payment_in`, `purchases`, `stock_movements`, `day_book`

---

### `POST /b/:businessId/purchase-returns`
Record a return of goods to a supplier.

**Request Body**
```json
{
  "supplier_id": 2,
  "purchase_id": 12,
  "return_invoice_no": "PR-2025-001",
  "return_date": "2025-04-05",
  "payment_mode": "Cash",
  "refund_status": "Refunded",
  "notes": "Damaged goods returned",
  "items": [
    {
      "product_id": 11,
      "quantity": 10,
      "purchase_price": 8.50,
      "cgst_percentage": 9,
      "sgst_percentage": 9,
      "total_tax": 15.30,
      "total_amount": 98.30
    }
  ]
}
```

**Response `201`** — Full return object

**Logic**
- Trigger `trg_purchase_return_stock_deduct` removes stock for each item
- Inserts `Purchase Return Out` rows in `stock_movements`
- If `refund_status = Refunded`:
  - Auto-create a `payment_in` record with `supplier_id` set (supplier pays you back)
  - Sets `payment_in_id` on the return record
- If `refund_status = Adjusted`:
  - Expects `adjusted_in_purchase_id` in body; sets that FK on the return
- Inserts `Purchase Return` entry in `day_book`

---

### `GET /b/:businessId/purchase-returns`
List all purchase returns.

**Query Params** — `supplier_id`, `from_date`, `to_date`, `refund_status`, `search`

**Response `200`** — Paginated list

---

### `GET /b/:businessId/purchase-returns/:returnId`
Get full return with items.

**Response `200`** — Return object + items + linked `payment_in` + linked `purchase`

---

### `PUT /b/:businessId/purchase-returns/:returnId`
Update a return (before it is finalised / refund received).

**Response `200`**

---

### `DELETE /b/:businessId/purchase-returns/:returnId`
Delete a return.

**Response `204`**

**Logic**
- Reverses stock deductions
- Deletes linked `payment_in` if one was auto-created
- Removes `day_book` entry

---

---

# MODULE 12 — SALES

> Tables: `sales`, `sale_items`, `customers`, `stock_movements`, `day_book`, `payment_in`

---

### `POST /b/:businessId/sales`
Create a new sale invoice.

**Request Body**
```json
{
  "customer_id": 3,
  "invoice_no": "RAM-0041",
  "invoice_date": "2025-04-02",
  "sale_type": "Normal Sale",
  "payment_mode": "Credit",
  "discount_amount": 100,
  "transport_cost": 0,
  "delivery_charge": 0,
  "round_off": -0.50,
  "amount_received": 0,
  "notes": "",
  "items": [
    {
      "product_id": 11,
      "item_name": null,
      "quantity": 20,
      "free_quantity": 0,
      "selling_price": 10.00,
      "purchase_price": 8.50,
      "cgst_percentage": 9,
      "sgst_percentage": 9,
      "discount_percentage": 0,
      "discount_amount": 0,
      "total_tax": 36,
      "total_amount": 236
    },
    {
      "product_id": null,
      "item_name": "Custom Packing Charge",
      "quantity": 1,
      "free_quantity": 0,
      "selling_price": 20,
      "purchase_price": 0,
      "cgst_percentage": 0,
      "sgst_percentage": 0,
      "discount_percentage": 0,
      "discount_amount": 0,
      "total_tax": 0,
      "total_amount": 20
    }
  ]
}
```

**Response `201`** — Full sale object with items

**Logic**
- `product_id = null` with `item_name` set → custom line item (no stock tracking)
- `UNIQUE(business_id, invoice_no)` enforced
- Trigger `trg_sale_stock_update` deducts stock for each item where `product_id IS NOT NULL`
- Check `allow_negative_stock` at business + product level before deducting
- If `amount_received > 0`, auto-create a `payment_in` record with `customer_id`
- Inserts `Sale` entry in `day_book`
- Inserts `Sale Out` rows in `stock_movements`
- `customer_id = null` = Quick Cash Sale (walk-in)

---

### `GET /b/:businessId/sales`
List sales with filters.

**Query Params**
- `?customer_id=3`
- `?from_date=2025-04-01&to_date=2025-04-30`
- `?payment_status=Unpaid`
- `?payment_mode=Credit`
- `?sale_type=Normal Sale`
- `?search=RAM-0041`
- `?include_deleted=true`

**Response `200`** — Paginated list; each row includes `amount_due = grand_total - amount_received`

---

### `GET /b/:businessId/sales/:saleId`
Get full sale with items.

**Response `200`** — Full sale object + items + `amount_due` + `customer` details

---

### `PUT /b/:businessId/sales/:saleId`
Edit a sale. Only allowed if no return exists against it.

**Response `200`**

**Logic**
- Reverse stock deductions for old items; re-apply for updated items
- Regenerate `day_book` and `stock_movements` entries

---

### `DELETE /b/:businessId/sales/:saleId`
Soft delete a sale.

**Response `200`**

**Logic**
- Blocked if a linked `sales_return` exists
- Reverses stock deductions
- Sets `deleted_at`

---

### `POST /b/:businessId/sales/:saleId/restore`
Undo soft delete.

**Response `200`**

**Logic** — Clears `deleted_at`, re-deducts stock, re-inserts `day_book`

---

### `POST /b/:businessId/sales/:saleId/record-payment`
Record a payment received against a sale.

**Request Body**
```json
{
  "amount": 1000,
  "payment_mode": "Cash",
  "payment_date": "2025-04-08",
  "reference_no": ""
}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "payment_in_id": 31,
    "amount_received_now": 1000,
    "total_amount_received": 1000,
    "amount_due": 15500,
    "payment_status": "Partial"
  }
}
```

**Logic**
- Creates `payment_in` with `customer_id` and `sale_id`
- Updates `sales.amount_received` and `payment_status`
- Inserts `Payment In` in `day_book`

---

---

# MODULE 13 — SALES RETURNS

> Tables: `sales_returns`, `sales_return_items`, `payment_out`, `sales`, `stock_movements`, `day_book`

---

### `POST /b/:businessId/sales-returns`
Record a return from a customer.

**Request Body**
```json
{
  "customer_id": 3,
  "sale_id": 41,
  "return_invoice_no": "SR-2025-001",
  "return_date": "2025-04-10",
  "payment_mode": "Cash",
  "refund_status": "Refunded",
  "notes": "Customer returned damaged item",
  "items": [
    {
      "product_id": 11,
      "item_name": null,
      "quantity": 2,
      "selling_price": 10.00,
      "purchase_price": 8.50,
      "cgst_percentage": 9,
      "sgst_percentage": 9,
      "discount_percentage": 0,
      "total_tax": 3.60,
      "total_amount": 23.60
    }
  ]
}
```

**Response `201`** — Full return object

**Logic**
- Trigger `trg_sale_return_stock_restore` adds back stock for each item where `product_id IS NOT NULL`
- Inserts `Sale Return In` rows in `stock_movements`
- If `refund_status = Refunded`:
  - Auto-create `payment_out` with `customer_id` (you pay customer back)
  - Sets `payment_out_id` on the return record
- If `refund_status = Adjusted`:
  - Expects `adjusted_in_sale_id`; sets that FK
- Inserts `Sales Return` entry in `day_book`

---

### `GET /b/:businessId/sales-returns`
List all sales returns.

**Query Params** — `customer_id`, `from_date`, `to_date`, `refund_status`, `search`

**Response `200`** — Paginated list

---

### `GET /b/:businessId/sales-returns/:returnId`
Get full return with items.

**Response `200`** — Return + items + linked `payment_out` + linked sale

---

### `PUT /b/:businessId/sales-returns/:returnId`

**Response `200`**

---

### `DELETE /b/:businessId/sales-returns/:returnId`

**Response `204`**

**Logic** — Reverses stock additions; removes auto-created `payment_out` if any

---

---

# MODULE 14 — PAYMENT IN

> Tables: `payment_in`, `customers`, `suppliers`, `sales`, `day_book`

Used for:
1. Recording standalone customer payment receipts
2. Auto-created by sale record-payment endpoint
3. Auto-created by purchase-return (supplier refund in)

---

### `POST /b/:businessId/payment-in`
Record a standalone payment received.

**Request Body**
```json
{
  "customer_id": 3,
  "supplier_id": null,
  "sale_id": null,
  "payment_date": "2025-04-12",
  "payment_mode": "UPI",
  "amount": 5000,
  "reference_no": "UPI-REF-1122",
  "notes": "Monthly settlement"
}
```
> `customer_id` OR `supplier_id` must be set (not both). Enforced at app level.

**Response `201`** — Full payment object

**Logic**
- Inserts `Payment In` entry in `day_book`
- If `customer_id` is set: updates customer's running balance
- If `supplier_id` is set: this is a purchase-return refund; link back to purchase return is via `purchase_returns.payment_in_id`

---

### `GET /b/:businessId/payment-in`
List all payment-in records.

**Query Params**
- `?customer_id=3`
- `?supplier_id=2`
- `?from_date=&to_date=`
- `?payment_mode=UPI`

**Response `200`** — Paginated list

---

### `GET /b/:businessId/payment-in/:paymentInId`

**Response `200`** — Full payment object with customer/supplier details

---

### `PUT /b/:businessId/payment-in/:paymentInId`
Update payment details (date, mode, amount, notes).

**Response `200`**

**Logic** — Adjusts `day_book` entry accordingly

---

### `DELETE /b/:businessId/payment-in/:paymentInId`
Delete a standalone payment.

**Response `204`**

**Logic**
- Blocked if this payment was auto-created by a sale or purchase-return (use that parent to manage it)
- Removes `day_book` entry

---

---

# MODULE 15 — PAYMENT OUT

> Tables: `payment_out`, `suppliers`, `customers`, `purchases`, `day_book`

Used for:
1. Recording standalone supplier payments
2. Auto-created by purchase record-payment endpoint
3. Auto-created by sales-return (customer refund out)

---

### `POST /b/:businessId/payment-out`
Record a standalone payment made.

**Request Body**
```json
{
  "supplier_id": 2,
  "customer_id": null,
  "purchase_id": null,
  "payment_date": "2025-04-14",
  "payment_mode": "Bank Transfer",
  "amount": 10000,
  "reference_no": "NEFT-TXN-4455",
  "notes": "Settlement for March purchases"
}
```
> `supplier_id` OR `customer_id` must be set (not both).

**Response `201`**

**Logic**
- Inserts `Payment Out` entry in `day_book`

---

### `GET /b/:businessId/payment-out`
List all payment-out records.

**Query Params** — `supplier_id`, `customer_id`, `from_date`, `to_date`, `payment_mode`

**Response `200`** — Paginated list

---

### `GET /b/:businessId/payment-out/:paymentOutId`

**Response `200`** — Full payment object

---

### `PUT /b/:businessId/payment-out/:paymentOutId`

**Response `200`**

---

### `DELETE /b/:businessId/payment-out/:paymentOutId`

**Response `204`**

---

---

# MODULE 16 — DAY BOOK

> Tables: `day_book`

All entries are auto-inserted by other modules. This module provides read + filter access.

---

### `GET /b/:businessId/day-book`
List all day book entries with filters.

**Query Params**
- `?from_date=2025-04-01&to_date=2025-04-30`
- `?entry_type=Sale`
- `?payment_mode=Cash`
- `?search=RAM-0041`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "day_book_id": 101,
        "entry_date": "2025-04-02",
        "entry_type": "Sale",
        "reference_type": "sales",
        "reference_id": 41,
        "reference_no": "RAM-0041",
        "cash_in": 0,
        "cash_out": 0,
        "bank_in": 0,
        "bank_out": 0,
        "payment_mode": "Credit",
        "description": "Sale to Suresh Patel"
      }
    ],
    "summary": {
      "total_cash_in": 25000,
      "total_cash_out": 10000,
      "total_bank_in": 50000,
      "total_bank_out": 20000,
      "net_cash": 15000,
      "net_bank": 30000
    }
  }
}
```

---

### `GET /b/:businessId/day-book/summary`
Tile-level summary for a given date or range (used on Dashboard).

**Query Params** — `?date=2025-04-15` or `?from_date=&to_date=`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "total_sales": 45000,
    "total_purchases": 30000,
    "total_payment_in": 20000,
    "total_payment_out": 15000,
    "total_expenses": 3000,
    "total_incomes": 1000,
    "net_cash_flow": 18000
  }
}
```

---

### `GET /b/:businessId/day-book/export`
Export day book as CSV or PDF for a date range.

**Query Params** — `?from_date=&to_date=&format=csv`

**Response** — File download (binary stream)

---

---

# MODULE 17 — EXPENSE CATEGORIES

> Tables: `expense_categories`

---

### `POST /b/:businessId/expense-categories`

**Request Body** — `{ category_name: "Electricity Bill", description: "" }`

**Response `201`**

---

### `GET /b/:businessId/expense-categories`

**Query Params** — `?is_active=true`

**Response `200`** — List with `expense_count` per category

---

### `PUT /b/:businessId/expense-categories/:categoryId`

**Response `200`**

---

### `DELETE /b/:businessId/expense-categories/:categoryId`

Blocked if expenses are linked. Suggest deactivate instead.

**Response `204`** or `409`

---

### `PUT /b/:businessId/expense-categories/:categoryId/toggle-active`

**Response `200`**

---

---

# MODULE 18 — EXPENSES

> Tables: `expenses`, `expense_categories`, `day_book`

---

### `POST /b/:businessId/expenses`
Record a business expense.

**Request Body**
```json
{
  "category_id": 3,
  "expense_date": "2025-04-05",
  "description": "Monthly electricity bill",
  "amount": 3500,
  "payment_mode": "UPI",
  "reference_no": "BESCOM-APR25",
  "notes": ""
}
```

**Response `201`**

**Logic**
- Inserts `Expense` entry in `day_book` (cash_out or bank_out depending on payment_mode)

---

### `GET /b/:businessId/expenses`
List expenses with filters.

**Query Params**
- `?category_id=3`
- `?from_date=&to_date=`
- `?payment_mode=UPI`

**Response `200`** — Paginated list

---

### `GET /b/:businessId/expenses/:expenseId`

**Response `200`** — Full expense + category name

---

### `PUT /b/:businessId/expenses/:expenseId`

**Response `200`**

---

### `DELETE /b/:businessId/expenses/:expenseId`

**Response `204`**

**Logic** — Removes `day_book` entry

---

---

# MODULE 19 — INCOME CATEGORIES

> Tables: `income_categories`

---

### `POST /b/:businessId/income-categories`

**Request Body** — `{ category_name: "Commission", description: "" }`

**Response `201`**

---

### `GET /b/:businessId/income-categories`

**Query Params** — `?is_active=true`

**Response `200`** — List with `income_count` per category

---

### `PUT /b/:businessId/income-categories/:categoryId`

**Response `200`**

---

### `DELETE /b/:businessId/income-categories/:categoryId`

**Response `204`** or `409`

---

### `PUT /b/:businessId/income-categories/:categoryId/toggle-active`

**Response `200`**

---

---

# MODULE 20 — INCOMES

> Tables: `incomes`, `income_categories`, `day_book`

---

### `POST /b/:businessId/incomes`
Record a non-sale income entry.

**Request Body**
```json
{
  "category_id": 5,
  "income_date": "2025-04-20",
  "description": "Commission from Vijay Wholesale",
  "amount": 1500,
  "payment_mode": "Bank Transfer",
  "reference_no": "NEFT-9900",
  "notes": ""
}
```

**Response `201`**

**Logic**
- Inserts `Income` entry in `day_book`

---

### `GET /b/:businessId/incomes`
List all income entries.

**Query Params** — `category_id`, `from_date`, `to_date`, `payment_mode`

**Response `200`** — Paginated list

---

### `GET /b/:businessId/incomes/:incomeId`

**Response `200`**

---

### `PUT /b/:businessId/incomes/:incomeId`

**Response `200`**

---

### `DELETE /b/:businessId/incomes/:incomeId`

**Response `204`**

---

---

# MODULE 21 — STOCK MOVEMENTS

> Tables: `stock_movements`, `products`

All rows are auto-inserted by purchase/sale/return/adjustment triggers. This module provides read access only (except manual adjustment which is under Products).

---

### `GET /b/:businessId/stock-movements`
Full stock movement log across all products.

**Query Params**
- `?product_id=11`
- `?movement_type=Sale Out`
- `?reference_type=sales`
- `?from_date=&to_date=`

**Response `200`** — Paginated list with product name, reference details

---

### `GET /b/:businessId/stock-movements/:movementId`

**Response `200`** — Single movement record with product + reference details

---

---

# MODULE 22 — REPORTS

All report endpoints support `?from_date=&to_date=` and `?export=pdf|csv`.

---

## 22.1 Dashboard Summary

### `GET /b/:businessId/reports/dashboard`
Top-level KPI tiles for the Home/Dashboard screen.

**Query Params** — `?period=today|week|month|year` or custom `from_date/to_date`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "period": "month",
    "total_sales": 450000,
    "total_purchases": 300000,
    "total_expenses": 15000,
    "total_incomes": 8000,
    "total_payment_in": 380000,
    "total_payment_out": 290000,
    "gross_profit": 150000,
    "net_profit": 143000,
    "total_outstanding_from_customers": 70000,
    "total_outstanding_to_suppliers": 55000,
    "low_stock_products": 12,
    "out_of_stock_products": 3
  }
}
```

---

## 22.2 Sales Report

### `GET /b/:businessId/reports/sales`
Aggregate sales data with grouping options.

**Query Params**
- `?from_date=&to_date=`
- `?group_by=day|week|month|customer|product|payment_mode`
- `?customer_id=` `?payment_mode=` `?payment_status=`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_invoices": 85,
      "total_sales_value": 450000,
      "total_discount": 5000,
      "total_tax_collected": 40500,
      "total_received": 380000,
      "total_due": 70000
    },
    "grouped": [
      { "label": "2025-04-01", "sales_value": 18000, "invoices": 4 }
    ]
  }
}
```

---

### `GET /b/:businessId/reports/sales/by-product`
Top-selling products report.

**Query Params** — `from_date`, `to_date`, `limit` (top N products), `sort_by=quantity|amount`

**Response `200`**
```json
{
  "success": true,
  "data": [
    {
      "product_id": 11,
      "product_name": "Parle G Biscuit 100g",
      "total_quantity_sold": 800,
      "total_sale_amount": 8000,
      "total_profit": 1200
    }
  ]
}
```

---

### `GET /b/:businessId/reports/sales/by-customer`
Sales breakdown per customer.

**Query Params** — `from_date`, `to_date`

**Response `200`** — List of customers with `total_billed`, `total_received`, `balance_due`

---

## 22.3 Purchase Report

### `GET /b/:businessId/reports/purchases`
Aggregate purchase data.

**Query Params** — `from_date`, `to_date`, `group_by=day|month|supplier`, `supplier_id`, `payment_status`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_invoices": 30,
      "total_purchase_value": 300000,
      "total_paid": 250000,
      "total_due": 50000
    },
    "grouped": [ ... ]
  }
}
```

---

### `GET /b/:businessId/reports/purchases/by-product`
Most purchased products report.

**Response `200`** — Ranked product list with `total_quantity_purchased`, `total_purchase_amount`

---

### `GET /b/:businessId/reports/purchases/by-supplier`
Purchase breakdown per supplier.

**Response `200`** — Mirrors `v_supplier_summary` view output

---

## 22.4 Profit & Loss Report

### `GET /b/:businessId/reports/profit-loss`
Full income statement for a period.

**Query Params** — `from_date`, `to_date`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "period": { "from": "2025-04-01", "to": "2025-04-30" },
    "revenue": {
      "gross_sales": 450000,
      "sales_returns": 5000,
      "net_sales": 445000,
      "other_incomes": 8000,
      "total_revenue": 453000
    },
    "cost": {
      "gross_purchases": 300000,
      "purchase_returns": 3000,
      "net_purchases": 297000,
      "opening_stock_value": 120000,
      "closing_stock_value": 130000,
      "cost_of_goods_sold": 287000
    },
    "gross_profit": 166000,
    "expenses": {
      "total_expenses": 15000,
      "breakdown": [
        { "category": "Electricity Bill", "amount": 3500 },
        { "category": "Rent", "amount": 10000 },
        { "category": "Other", "amount": 1500 }
      ]
    },
    "net_profit": 151000,
    "net_profit_percentage": 33.33
  }
}
```

---

## 22.5 Stock / Inventory Report

### `GET /b/:businessId/reports/stock`
Full stock valuation report.

**Query Params** — `?category_id=` `?is_active=` `?low_stock=true`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_products": 120,
      "total_stock_value": 450000,
      "low_stock_count": 12,
      "out_of_stock_count": 3
    },
    "products": [
      {
        "product_id": 11,
        "product_name": "Parle G Biscuit 100g",
        "category_name": "Biscuits",
        "current_stock": 500,
        "unit_name": "Piece",
        "purchase_price": 8.50,
        "selling_price": 10.00,
        "stock_value": 4250.00,
        "minimum_stock_alert": 50,
        "low_stock_alert": false
      }
    ]
  }
}
```

---

### `GET /b/:businessId/reports/stock/movement-summary`
Stock-in vs Stock-out summary per product for a period.

**Query Params** — `from_date`, `to_date`, `product_id`, `category_id`

**Response `200`**
```json
{
  "success": true,
  "data": [
    {
      "product_id": 11,
      "product_name": "Parle G Biscuit 100g",
      "opening_stock": 300,
      "stock_in": 250,
      "stock_out": 50,
      "closing_stock": 500
    }
  ]
}
```

---

## 22.6 GST Report

### `GET /b/:businessId/reports/gst`
CGST / SGST / IGST summary for tax filing.

**Query Params** — `from_date`, `to_date`, `?type=sales|purchases|all`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "period": { "from": "2025-04-01", "to": "2025-04-30" },
    "sales_tax": {
      "total_taxable_value": 400000,
      "total_cgst": 18000,
      "total_sgst": 18000,
      "total_igst": 0,
      "total_tax": 36000
    },
    "purchase_tax": {
      "total_taxable_value": 270000,
      "total_cgst": 12150,
      "total_sgst": 12150,
      "total_igst": 0,
      "total_tax": 24300
    },
    "net_gst_payable": 11700,
    "hsn_summary": [
      {
        "hsn_code": "19053100",
        "description": "Biscuits",
        "taxable_value": 50000,
        "cgst": 2250,
        "sgst": 2250,
        "igst": 0
      }
    ]
  }
}
```

---

## 22.7 Expense Report

### `GET /b/:businessId/reports/expenses`
Expense summary grouped by category or date.

**Query Params** — `from_date`, `to_date`, `group_by=category|day|month`, `category_id`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "total_expenses": 15000,
    "grouped": [
      { "category": "Rent", "amount": 10000, "count": 1 },
      { "category": "Electricity", "amount": 3500, "count": 1 },
      { "category": "Other", "amount": 1500, "count": 3 }
    ]
  }
}
```

---

## 22.8 Income Report

### `GET /b/:businessId/reports/incomes`
Non-sale income summary.

**Query Params** — `from_date`, `to_date`, `group_by=category|day|month`, `category_id`

**Response `200`** — Same structure as expense report

---

## 22.9 Outstanding Reports

### `GET /b/:businessId/reports/outstanding/customers`
All customers with unpaid/partial balances.

**Query Params** — `?min_balance=1000` `?sort_by=balance_due`

**Response `200`** — Customer list from `v_customer_summary` where `balance_due > 0`

---

### `GET /b/:businessId/reports/outstanding/suppliers`
All suppliers with unpaid balances.

**Query Params** — `?min_balance=1000`

**Response `200`** — Supplier list from `v_supplier_summary` where `balance_due > 0`

---

## 22.10 Payment Report

### `GET /b/:businessId/reports/payments`
Combined payment in + payment out summary.

**Query Params** — `from_date`, `to_date`, `payment_mode`, `?type=in|out|all`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "total_payment_in": 380000,
    "total_payment_out": 290000,
    "net": 90000,
    "by_mode": [
      { "payment_mode": "Cash", "payment_in": 80000, "payment_out": 60000 },
      { "payment_mode": "UPI", "payment_in": 200000, "payment_out": 150000 },
      { "payment_mode": "Bank Transfer", "payment_in": 100000, "payment_out": 80000 }
    ]
  }
}
```

---

## 22.11 Returns Report

### `GET /b/:businessId/reports/returns`
Combined sales returns + purchase returns summary.

**Query Params** — `from_date`, `to_date`, `?type=sales|purchases|all`, `refund_status`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "sales_returns": {
      "count": 8,
      "total_value": 5000,
      "refunded": 3000,
      "adjusted": 2000,
      "pending": 0
    },
    "purchase_returns": {
      "count": 4,
      "total_value": 3000,
      "refunded": 1000,
      "adjusted": 2000,
      "pending": 0
    }
  }
}
```

---

---

# MODULE 23 — UTILITIES & MISC

---

### `GET /b/:businessId/invoice/next-number`
Get the next available auto-generated invoice number for a given type.

**Query Params** — `?type=sale|purchase|sale_return|purchase_return`

**Response `200`**
```json
{ "success": true, "data": { "next_invoice_no": "RAM-0042" } }
```

**Logic**
- Reads `invoice_prefix` from business
- Queries `MAX(invoice_no)` from the relevant table
- Returns `prefix + (max + 1)` padded to 4 digits

---

### `GET /b/:businessId/search`
Global search across customers, suppliers, products, invoices.

**Query Params** — `?q=suresh`

**Response `200`**
```json
{
  "success": true,
  "data": {
    "customers": [ { "customer_id": 3, "customer_name": "Suresh Patel" } ],
    "suppliers": [],
    "products": [ { "product_id": 11, "product_name": "Parle G Biscuit" } ],
    "sales": [ { "sale_id": 41, "invoice_no": "RAM-0041" } ],
    "purchases": []
  }
}
```

---

### `GET /b/:businessId/export/backup`
Export full business data as JSON for manual backup.

**Role required:** Owner

**Response** — JSON file download

---

---

# QUICK REFERENCE — ALL ENDPOINTS

| # | Method | Endpoint | Description |
|---|---|---|---|
| 1 | POST | `/auth/register` | Register new user |
| 2 | POST | `/auth/login` | Login + get tokens |
| 3 | POST | `/auth/refresh-token` | Refresh access token |
| 4 | POST | `/auth/logout` | Logout / invalidate token |
| 5 | POST | `/auth/forgot-password` | Send reset OTP |
| 6 | POST | `/auth/reset-password` | Reset with OTP |
| 7 | POST | `/auth/verify-otp` | Verify phone/email OTP |
| 8 | GET | `/users/me` | Get own profile |
| 9 | PUT | `/users/me` | Update profile |
| 10 | PUT | `/users/me/password` | Change password |
| 11 | POST | `/businesses` | Create business |
| 12 | GET | `/businesses` | List my businesses |
| 13 | GET | `/businesses/:id` | Get business details |
| 14 | PUT | `/businesses/:id` | Update business |
| 15 | PUT | `/businesses/:id/settings` | Update settings |
| 16 | PUT | `/businesses/:id/toggle-active` | Activate/deactivate |
| 17 | GET | `/b/:bId/users` | List business users |
| 18 | POST | `/b/:bId/users/invite` | Invite user |
| 19 | PUT | `/b/:bId/users/:uid/role` | Change role |
| 20 | PUT | `/b/:bId/users/:uid/toggle-active` | Enable/disable access |
| 21 | DELETE | `/b/:bId/users/:uid` | Remove user |
| 22 | POST | `/b/:bId/customers` | Create customer |
| 23 | GET | `/b/:bId/customers` | List customers |
| 24 | GET | `/b/:bId/customers/:id` | Get customer |
| 25 | PUT | `/b/:bId/customers/:id` | Update customer |
| 26 | DELETE | `/b/:bId/customers/:id` | Delete customer |
| 27 | PUT | `/b/:bId/customers/:id/toggle-active` | Toggle active |
| 28 | GET | `/b/:bId/customers/:id/ledger` | Customer ledger |
| 29 | GET | `/b/:bId/customers/:id/summary` | Customer summary |
| 30 | POST | `/b/:bId/suppliers` | Create supplier |
| 31 | GET | `/b/:bId/suppliers` | List suppliers |
| 32 | GET | `/b/:bId/suppliers/:id` | Get supplier |
| 33 | PUT | `/b/:bId/suppliers/:id` | Update supplier |
| 34 | DELETE | `/b/:bId/suppliers/:id` | Delete supplier |
| 35 | PUT | `/b/:bId/suppliers/:id/toggle-active` | Toggle active |
| 36 | GET | `/b/:bId/suppliers/:id/ledger` | Supplier ledger |
| 37 | GET | `/b/:bId/suppliers/:id/summary` | Supplier summary |
| 38 | POST | `/b/:bId/categories` | Create category |
| 39 | GET | `/b/:bId/categories` | List categories |
| 40 | GET | `/b/:bId/categories/:id` | Get category |
| 41 | PUT | `/b/:bId/categories/:id` | Update category |
| 42 | DELETE | `/b/:bId/categories/:id` | Delete category |
| 43 | PUT | `/b/:bId/categories/:id/toggle-active` | Toggle active |
| 44 | POST | `/b/:bId/units` | Create unit |
| 45 | GET | `/b/:bId/units` | List units |
| 46 | PUT | `/b/:bId/units/:id` | Update unit |
| 47 | DELETE | `/b/:bId/units/:id` | Delete unit |
| 48 | POST | `/b/:bId/products` | Add product |
| 49 | GET | `/b/:bId/products` | List products |
| 50 | GET | `/b/:bId/products/:id` | Get product |
| 51 | GET | `/b/:bId/products/barcode/:barcode` | Barcode lookup |
| 52 | GET | `/b/:bId/products/code/:code` | SKU lookup |
| 53 | PUT | `/b/:bId/products/:id` | Update product |
| 54 | PUT | `/b/:bId/products/:id/toggle-active` | Toggle active |
| 55 | DELETE | `/b/:bId/products/:id` | Delete product |
| 56 | POST | `/b/:bId/products/:id/adjust-stock` | Manual stock adjustment |
| 57 | GET | `/b/:bId/products/low-stock` | Low stock list |
| 58 | GET | `/b/:bId/products/:id/stock-movements` | Product movement log |
| 59 | POST | `/b/:bId/purchases` | Create purchase |
| 60 | GET | `/b/:bId/purchases` | List purchases |
| 61 | GET | `/b/:bId/purchases/:id` | Get purchase |
| 62 | PUT | `/b/:bId/purchases/:id` | Update purchase |
| 63 | DELETE | `/b/:bId/purchases/:id` | Soft delete purchase |
| 64 | POST | `/b/:bId/purchases/:id/restore` | Restore purchase |
| 65 | POST | `/b/:bId/purchases/:id/record-payment` | Pay supplier for purchase |
| 66 | POST | `/b/:bId/purchase-returns` | Create purchase return |
| 67 | GET | `/b/:bId/purchase-returns` | List purchase returns |
| 68 | GET | `/b/:bId/purchase-returns/:id` | Get purchase return |
| 69 | PUT | `/b/:bId/purchase-returns/:id` | Update return |
| 70 | DELETE | `/b/:bId/purchase-returns/:id` | Delete return |
| 71 | POST | `/b/:bId/sales` | Create sale |
| 72 | GET | `/b/:bId/sales` | List sales |
| 73 | GET | `/b/:bId/sales/:id` | Get sale |
| 74 | PUT | `/b/:bId/sales/:id` | Update sale |
| 75 | DELETE | `/b/:bId/sales/:id` | Soft delete sale |
| 76 | POST | `/b/:bId/sales/:id/restore` | Restore sale |
| 77 | POST | `/b/:bId/sales/:id/record-payment` | Receive payment from customer |
| 78 | POST | `/b/:bId/sales-returns` | Create sales return |
| 79 | GET | `/b/:bId/sales-returns` | List sales returns |
| 80 | GET | `/b/:bId/sales-returns/:id` | Get sales return |
| 81 | PUT | `/b/:bId/sales-returns/:id` | Update return |
| 82 | DELETE | `/b/:bId/sales-returns/:id` | Delete return |
| 83 | POST | `/b/:bId/payment-in` | Create payment in |
| 84 | GET | `/b/:bId/payment-in` | List payments in |
| 85 | GET | `/b/:bId/payment-in/:id` | Get payment in |
| 86 | PUT | `/b/:bId/payment-in/:id` | Update payment in |
| 87 | DELETE | `/b/:bId/payment-in/:id` | Delete payment in |
| 88 | POST | `/b/:bId/payment-out` | Create payment out |
| 89 | GET | `/b/:bId/payment-out` | List payments out |
| 90 | GET | `/b/:bId/payment-out/:id` | Get payment out |
| 91 | PUT | `/b/:bId/payment-out/:id` | Update payment out |
| 92 | DELETE | `/b/:bId/payment-out/:id` | Delete payment out |
| 93 | GET | `/b/:bId/day-book` | Day book list |
| 94 | GET | `/b/:bId/day-book/summary` | Day book summary tiles |
| 95 | GET | `/b/:bId/day-book/export` | Export day book |
| 96 | POST | `/b/:bId/expense-categories` | Create expense category |
| 97 | GET | `/b/:bId/expense-categories` | List expense categories |
| 98 | PUT | `/b/:bId/expense-categories/:id` | Update expense category |
| 99 | DELETE | `/b/:bId/expense-categories/:id` | Delete expense category |
| 100 | PUT | `/b/:bId/expense-categories/:id/toggle-active` | Toggle active |
| 101 | POST | `/b/:bId/expenses` | Create expense |
| 102 | GET | `/b/:bId/expenses` | List expenses |
| 103 | GET | `/b/:bId/expenses/:id` | Get expense |
| 104 | PUT | `/b/:bId/expenses/:id` | Update expense |
| 105 | DELETE | `/b/:bId/expenses/:id` | Delete expense |
| 106 | POST | `/b/:bId/income-categories` | Create income category |
| 107 | GET | `/b/:bId/income-categories` | List income categories |
| 108 | PUT | `/b/:bId/income-categories/:id` | Update income category |
| 109 | DELETE | `/b/:bId/income-categories/:id` | Delete income category |
| 110 | PUT | `/b/:bId/income-categories/:id/toggle-active` | Toggle active |
| 111 | POST | `/b/:bId/incomes` | Create income |
| 112 | GET | `/b/:bId/incomes` | List incomes |
| 113 | GET | `/b/:bId/incomes/:id` | Get income |
| 114 | PUT | `/b/:bId/incomes/:id` | Update income |
| 115 | DELETE | `/b/:bId/incomes/:id` | Delete income |
| 116 | GET | `/b/:bId/stock-movements` | Full stock movement log |
| 117 | GET | `/b/:bId/stock-movements/:id` | Get single movement |
| 118 | GET | `/b/:bId/reports/dashboard` | Dashboard KPI tiles |
| 119 | GET | `/b/:bId/reports/sales` | Sales report |
| 120 | GET | `/b/:bId/reports/sales/by-product` | Sales by product |
| 121 | GET | `/b/:bId/reports/sales/by-customer` | Sales by customer |
| 122 | GET | `/b/:bId/reports/purchases` | Purchase report |
| 123 | GET | `/b/:bId/reports/purchases/by-product` | Purchases by product |
| 124 | GET | `/b/:bId/reports/purchases/by-supplier` | Purchases by supplier |
| 125 | GET | `/b/:bId/reports/profit-loss` | P&L statement |
| 126 | GET | `/b/:bId/reports/stock` | Stock valuation |
| 127 | GET | `/b/:bId/reports/stock/movement-summary` | Stock in/out summary |
| 128 | GET | `/b/:bId/reports/gst` | GST report |
| 129 | GET | `/b/:bId/reports/expenses` | Expense report |
| 130 | GET | `/b/:bId/reports/incomes` | Income report |
| 131 | GET | `/b/:bId/reports/outstanding/customers` | Customer outstanding |
| 132 | GET | `/b/:bId/reports/outstanding/suppliers` | Supplier outstanding |
| 133 | GET | `/b/:bId/reports/payments` | Payment summary |
| 134 | GET | `/b/:bId/reports/returns` | Returns summary |
| 135 | GET | `/b/:bId/invoice/next-number` | Next invoice number |
| 136 | GET | `/b/:bId/search` | Global search |
| 137 | GET | `/b/:bId/export/backup` | Full data backup |

---

*Total: **137 endpoints** across 23 modules*
*Schema: retail_billbook_v3 · Architecture: Model B (Per-Tenant Database)*
