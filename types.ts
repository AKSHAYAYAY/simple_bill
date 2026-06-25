
export enum Role {
  ADMIN = 'Admin',
  ACCOUNTANT = 'Accountant',
  CLIENT = 'Client',
  SUPER_ADMIN = 'SuperAdmin'
}

export enum InvoiceStatus {
  DRAFT = 'Draft',
  SENT = 'Sent',
  UNPAID = 'Unpaid',
  PARTIAL = 'Partial',
  PAID = 'Paid',
  OVERDUE = 'Overdue',
  DELETED = 'Deleted',
}

export type CustomerType = 'Retail' | 'Business';

export interface User {
  email: string;
  name: string;
  role: Role;
  phone?: string;
  address?: string;
  companyId?: string;
  avatarUrl?: string;
}

export interface SaaSUser {
  email: string;
  license_key: string;
  name: string;
  created_at: string;
}

export interface SaaSPlan {
  id: string;
  name: string;
  price: string;
  description: string;
  features: string; // JSON string
  isPopular: boolean;
}

export interface SaasPayment {
  id: number;
  email: string;
  amount: string;
  plan_id: string;
  status: string;
  transaction_ref: string;
  timestamp: string;
}


export interface SaaSLicenseKey {
  license_key: string;
  plan_id: string;
  status: string;
  assigned_email?: string | null;
  assigned_at?: string | null;
  max_users?: number;
  created_at: string;
  updated_at: string;
}

export interface AdminErrorLog {
  id: number;
  source: string;
  level: string;
  message: string;
  context?: string | null;
  created_at: string;
}

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
}
export interface AdminMetrics {
  totalTenants: number;
  activeTenants24h: number;
  totalRevenue: number;
  totalPayments: number;
  successPayments: number;
  pendingPayments: number;
  mtdRevenue: number;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  address: string;
  phone: string;
  type: CustomerType;
  notes?: string;
  gstin?: string;
  company_name?: string;
  alternate_phone?: string;
  city?: string;
  state?: string;
  pincode?: string;
  opening_balance?: number;
  opening_balance_type?: 'Receivable' | 'Payable';
  is_active?: boolean;
  credit_limit?: number;
  total_invoices?: number;
  total_invoiced?: number;
  total_paid?: number;
  balance_due?: number;
}

export interface InvoiceItem {
  id: string;
  productId?: number;
  description: string;
  quantity: number;
  freeQuantity?: number;
  price: number;
  purchasePrice?: number;
  taxRate: number;
  discount?: number;
}

export interface Invoice {
  id: string;
  sale_id?: number;
  customerId: string;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  paymentMode?: 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Credit';
  amountReceived?: number;
  notes?: string;
  overallDiscount?: number;
  packingCharges?: number;
  freightCharges?: number;
}

export interface Subscription {
  id: number;
  planName: string;
  status: 'Active' | 'Expired' | 'Pending';
  startDate: string;
  expiryDate: string;
  amount: number;
}

export interface PaymentDetail {
  id: number;
  invoiceId: string;
  paymentDate: string;
  method: string;
  amount: number;
  transactionRef: string;
}

export interface MySQLConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  apiUrl: string;
}

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  currency: string;
  fyStartMonth: number;
}

export const COUNTRIES: CountryOption[] = [
  { code: 'US', name: 'United States', flag: '🇺🇸', currency: 'USD', fyStartMonth: 1 },
  { code: 'IN', name: 'India', flag: '🇮🇳', currency: 'INR', fyStartMonth: 4 },
  { code: 'UK', name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP', fyStartMonth: 4 },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', currency: 'CAD', fyStartMonth: 1 },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', currency: 'AUD', fyStartMonth: 7 },
  { code: 'EU', name: 'Europe', flag: '🇪🇺', currency: 'EUR', fyStartMonth: 1 },
];

export type DataSource = 'GOOGLE_SHEETS' | 'INDEXED_DB' | 'MYSQL' | 'CLOUD_MYSQL';

export interface LicenseInfo {
  key: string;
  plan: 'FREE' | 'PRO' | 'ENTERPRISE';
  status: 'ACTIVE' | 'EXPIRED' | 'INVALID';
  expiryDate: string | null;
  maxUsers?: number;
}

export interface AppSettings {
  companyName: string;
  companyGstin?: string;
  logoUrl: string;
  taxRate: number;
  currency: string;
  countryCode: string;
  invoicePrefix: string;
  terms: string;
  invoiceHeader: string;
  invoiceFooter: string;
  sheetId: string;
  clientId: string;
  apiKey: string;
  dataSource: DataSource;
  mysqlConfig: MySQLConfig;
  license: LicenseInfo;
  enableDateTime?: boolean;
  isConfigured: boolean;
  taxDisplayMode?: string;
  showTaxOnInvoice?: boolean;
  gstType?: string;
  defaultCgstRate?: number;
  defaultSgstRate?: number;
  defaultIgstRate?: number;
  defaultSaleTaxMode?: string;
  allowNegativeStock?: boolean;
  allowNegativeSelling?: boolean;
  lowStockLimit?: number;
  deadStockDays?: number;
  roundOffInvoice?: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  companyName: 'My Company Inc.',
  companyGstin: '',
  logoUrl: '',
  taxRate: 5,
  currency: 'INR',
  countryCode: 'IN',
  invoicePrefix: 'INV-',
  terms: 'Payment due within 30 days.',
  invoiceHeader: '',
  invoiceFooter: 'Thank you for your business!',
  sheetId: '',
  clientId: '',
  apiKey: '',
  dataSource: 'INDEXED_DB',
  mysqlConfig: {
    host: '',
    user: '',
    password: '',
    database: '',
    apiUrl: '/api'
  },
  license: {
    key: '',
    plan: 'FREE',
    status: 'INVALID',
    expiryDate: null
  },
  enableDateTime: false,
  isConfigured: false,
  taxDisplayMode: 'Tax Exclusive',
  showTaxOnInvoice: true,
  gstType: 'GST',
  defaultCgstRate: 0,
  defaultSgstRate: 0,
  defaultIgstRate: 0,
  defaultSaleTaxMode: 'CGST+SGST',
  allowNegativeStock: false,
  allowNegativeSelling: false,
  lowStockLimit: 10,
  deadStockDays: 365,
  roundOffInvoice: true
};

export interface Supplier {
  supplier_id?: number;
  supplier_name: string;
  company_name?: string;
  gst_number?: string;
  phone?: string;
  alternate_phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  opening_balance?: number;
  opening_balance_type?: 'Receivable' | 'Payable';
  is_active?: boolean;
  total_invoices?: number;
  total_invoiced?: number;
  total_paid?: number;
  balance_due?: number;
}

export interface PurchaseItem {
  id?: string;
  product_id: number;
  quantity: number;
  free_quantity?: number;
  unit_price: number;
  purchase_price?: number;
  selling_price?: number;
  profit_percentage?: number;
  tax_rate: number;
  cgst_percentage?: number;
  sgst_percentage?: number;
  igst_percentage?: number;
  discount?: number;
  discount_percentage?: number;
  discount_amount?: number;
  total_tax?: number;
  description?: string;
  new_product?: { product_name: string };
}

export interface Purchase {
  purchase_id?: number;
  supplier_id: number;
  new_supplier?: {
    supplier_name: string;
    company_name?: string;
    email?: string;
    phone?: string;
    gst_number?: string;
    address?: string;
  };
  purchase_date: string;
  reference_number?: string;
  purchase_invoice_no?: string;
  supplier_invoice_no?: string;
  payment_terms?: string;
  subtotal: number;
  tax_amount: number;
  discount_amount?: number;
  shipping_charges?: number;
  transport_cost?: number;
  loading_cost?: number;
  other_charges?: number;
  transport_paid_by?: string;
  transport_vehicle_no?: string;
  transport_notes?: string;
  round_off?: number;
  grand_total: number;
  paid_amount?: number;
  amount_paid?: number;
  payment_status?: 'Unpaid' | 'Partial' | 'Partially Paid' | 'Paid';
  payment_mode?: 'Cash' | 'Bank' | 'Split';
  notes?: string;
  items: PurchaseItem[];
}

export interface PaymentIn {
  payment_id?: number;
  sale_id?: number;
  customer_id?: number;
  supplier_id?: number;
  party_type?: 'Customer' | 'Supplier';
  party_name?: string;
  linked_invoice_no?: string | null;
  linked_return_no?: string | null;
  payment_date: string;
  amount: number;
  payment_mode: 'Cash' | 'Bank';
  reference_number?: string;
  reference_no?: string;
  notes?: string;
}

export interface PaymentOut {
  payment_id?: number;
  purchase_id?: number;
  supplier_id?: number;
  customer_id?: number;
  party_type?: 'Customer' | 'Supplier';
  party_name?: string;
  linked_invoice_no?: string | null;
  linked_return_no?: string | null;
  payment_date: string;
  amount: number;
  payment_mode: 'Cash' | 'Bank';
  reference_number?: string;
  reference_no?: string;
  notes?: string;
}

export interface DaybookEntry {
  id: number;
  entry_date: string;
  entry_type: string;
  reference_id?: number;
  description: string;
  cash_in?: number;
  cash_out?: number;
  bank_in?: number;
  bank_out?: number;
}

export interface Category {
  category_id?: number;
  category_name: string;
  description?: string;
  is_active?: boolean;
}

export interface Unit {
  unit_id?: number;
  unit_name: string;
  short_name: string;
}

export interface Product {
  product_id?: number;
  category_id?: number;
  unit_id?: number;
  product_name: string;
  product_code: string;
  barcode?: string;
  item_description?: string;
  purchase_price: number;
  profit_percentage?: number;
  selling_price: number;
  current_stock: number;
  minimum_stock_alert?: number;
  cgst_percentage?: number;
  sgst_percentage?: number;
  igst_percentage?: number;
  hsn_code?: string;
  allow_negative_stock?: boolean;
  is_active?: boolean;
  category_name?: string;
  unit_name?: string;
  unit_short_name?: string;
  stock_value?: number;
  low_stock_alert?: boolean;
}

export interface StockMovement {
  movement_id?: number;
  product_id: number;
  movement_type: 'Sale' | 'Purchase' | 'Purchase In' | 'Sale Out' | 'Sale Return In' | 'Purchase Return Out' | 'Adjustment' | 'Manual Adjustment';
  reference_type?: string;
  reference_id?: number;
  quantity: number;
  stock_before: number;
  stock_after: number;
  notes?: string;
  created_at?: string;
}

export interface SalesReturnItem {
  item_id?: number;
  return_id?: number;
  product_id?: number;
  item_name?: string;
  quantity: number;
  selling_price: number;
  purchase_price?: number;
  cgst_percentage?: number;
  sgst_percentage?: number;
  igst_percentage?: number;
  discount_percentage?: number;
  total_tax?: number;
  total_amount?: number;
  product_name?: string;
  product_code?: string;
  unit_name?: string;
}

export interface SalesReturn {
  return_id?: number;
  customer_id?: number;
  sale_id?: number;
  return_invoice_no: string;
  return_date: string;
  payment_mode: 'Cash' | 'Bank' | 'Credit' | 'UPI' | 'Card';
  subtotal: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  grand_total: number;
  refund_amount?: number;
  refund_status: 'Refunded' | 'Pending' | 'Adjusted';
  payment_out_id?: number;
  adjusted_in_sale_id?: number;
  notes?: string;
  customer_name?: string;
  invoice_no?: string;
  items: SalesReturnItem[];
  created_at?: string;
}

export interface PurchaseReturnItem {
  item_id?: number;
  return_id?: number;
  product_id?: number;
  item_name?: string;
  quantity: number;
  purchase_price: number;
  cgst_percentage?: number;
  sgst_percentage?: number;
  igst_percentage?: number;
  discount_percentage?: number;
  total_tax?: number;
  total_amount?: number;
  product_name?: string;
  product_code?: string;
  unit_name?: string;
}

export interface PurchaseReturn {
  return_id?: number;
  supplier_id?: number;
  purchase_id?: number;
  return_invoice_no: string;
  return_date: string;
  payment_mode: 'Cash' | 'Bank' | 'Credit' | 'UPI' | 'Card';
  subtotal: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  grand_total: number;
  refund_amount?: number;
  refund_status: 'Refunded' | 'Pending' | 'Adjusted';
  payment_in_id?: number;
  adjusted_in_purchase_id?: number;
  notes?: string;
  supplier_name?: string;
  purchase_invoice_no?: string;
  items: PurchaseReturnItem[];
  created_at?: string;
}

export interface BusinessUser {
  business_user_id: number;
  user_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: 'Owner' | 'Admin' | 'Manager' | 'Accountant' | 'Staff';
  is_active: boolean;
  invited_at: string;
  joined_at: string | null;
}

export interface ExpenseCategory {
  category_id?: number;
  category_name: string;
  description?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface Expense {
  expense_id?: number;
  category_id?: number;
  expense_date: string;
  description?: string;
  amount: number;
  payment_mode: 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Cheque';
  reference_no?: string;
  notes?: string;
  category_name?: string;
  created_at?: string;
}

export interface IncomeCategory {
  category_id?: number;
  category_name: string;
  description?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface Income {
  income_id?: number;
  category_id?: number;
  income_date: string;
  description?: string;
  amount: number;
  payment_mode: 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Cheque';
  reference_no?: string;
  notes?: string;
  category_name?: string;
  created_at?: string;
}
