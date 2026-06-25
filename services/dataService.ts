
import { Customer, CustomerType, Invoice, User, Role, AppSettings, InvoiceStatus, DEFAULT_SETTINGS, MySQLConfig, SaaSUser, SaaSPlan, SaasPayment, AdminMetrics, SaaSLicenseKey, AdminErrorLog, ContactMessage, Supplier, Purchase, PaymentIn, PaymentOut, DaybookEntry, Product, Category, Unit, StockMovement, SalesReturn, PurchaseReturn, BusinessUser, ExpenseCategory, Expense, IncomeCategory, Income } from '../types';
import { db, initDB as initLocalDB } from './db';
import { Logger } from './logger';
import { NotificationService } from './NotificationService';

const getSettingsKey = () => {
    let businessId = localStorage.getItem('business_id') || '1';
    try {
        const stored = localStorage.getItem('simplebill_user');
        if (stored) {
            const user = JSON.parse(stored);
            if (user && (user.businessId || user.companyId)) {
                businessId = String(user.businessId || user.companyId);
            }
        }
    } catch(e) {}
    return `simplebill_settings_${businessId}`;
};

// --- PERFORMANCE & CACHING LAYER ---

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const CACHE: {
    customers: CacheEntry<Customer[]> | null;
    invoices: CacheEntry<Invoice[]> | null;
} = {
    customers: null,
    invoices: null
};

// Request Deduplication Map
const activeRequests: Record<string, Promise<any>> = {};
const CACHE_TTL = 2 * 60 * 1000; // 2 Minutes Cache Validity


const sanitizeConfigForTransport = (config: MySQLConfig) => ({
    host: String(config.host || '').trim(),
    user: String(config.user || '').trim(),
    password: String(config.password || ''),
    database: String(config.database || '').trim()
});

const sanitizeConfigForStorage = (config: MySQLConfig): MySQLConfig => ({
    host: String(config.host || '').trim(),
    user: String(config.user || '').trim(),
    password: '',
    database: String(config.database || '').trim(),
    apiUrl: String(config.apiUrl || '').trim()
});

// --- CORE BRIDGE ---

/**
 * Global Bridge Fetcher (Partitioned or Master)
 */
const mysqlFetch = async (action: string, data: any = {}, explicitConfig?: MySQLConfig) => {
    const settings = getSettings();
    const config = explicitConfig || settings.mysqlConfig;

    // 1. URL Validation
    let apiUrl = config.apiUrl ? config.apiUrl.trim() : '';

    if (!apiUrl) {
        throw new Error("Bridge API URL is missing. Go to Settings > Data Source.");
    }

    // Warning for relative URLs in non-prod environments
    if (apiUrl.startsWith('/') && window.location.hostname !== 'localhost' && !window.location.hostname.includes('vercel.app')) {
        console.warn("Usage of relative API URL detected in development environment. This may fail if not proxied correctly.");
    }

    // Request Deduplication for GET requests
    const requestKey = `${action}-${JSON.stringify(data)}`;
    if (action.startsWith('get_') && activeRequests[requestKey] !== undefined) {
        return activeRequests[requestKey];
    }

    const licenseKey = settings.license.key;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s — handles Vercel cold start + DB connect

    const fetchPromise = (async () => {
        try {
            const storedBusinessId = Number(localStorage.getItem('business_id')) || undefined;
            const isAdmin = typeof licenseKey === 'string' && licenseKey.startsWith('SB-ADMIN');
            const payload: any = {
                config: sanitizeConfigForTransport(config),
                license_key: licenseKey,
                action,
                data
            };
            if (storedBusinessId && !isAdmin) payload.businessId = storedBusinessId;

            const response = await fetch(apiUrl, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify(payload)
            });

            clearTimeout(timeoutId);

            // 2. HTTP Status Check
            if (!response.ok) {
                try {
                    const text = await response.text();
                    const contentType = response.headers.get("content-type");
                    if (contentType && contentType.includes("application/json")) {
                        const json = JSON.parse(text);
                        if (json && json.error) {
                            throw new Error(json.error);
                        }
                    }
                } catch (parseErr: any) {
                    if (parseErr.message && parseErr.message !== 'Failed to parse JSON response') {
                        throw parseErr;
                    }
                }
                throw new Error(`Server returned HTTP ${response.status}: ${response.statusText}`);
            }

            // 3. Content Type Check
            const contentType = response.headers.get("content-type");
            const text = await response.text();

            if (!contentType || !contentType.includes("application/json")) {
                if (text.trim().startsWith("<")) {
                    throw new Error(`Endpoint returned HTML instead of JSON. Check API URL (${apiUrl}). You might be hitting a 404 page or a Mixed Content block (HTTP vs HTTPS).`);
                }
                throw new Error(`Invalid Response Format. Raw output: ${text.substring(0, 100)}...`);
            }

            // 4. JSON Parse
            let result;
            try {
                result = JSON.parse(text);
            } catch (e) {
                throw new Error(`Failed to parse JSON response: ${text.substring(0, 50)}...`);
            }

            if (result.error) throw new Error(result.error);
            return result.data;

        } catch (e: any) {
            clearTimeout(timeoutId);
            let msg = e.message;

            if (e.name === 'AbortError') {
                msg = `Request timed out after 45s (Vercel cold start or slow DB). Action: ${action}. Retrying may help.`;
                // Warn only — this is transient, not a code error
                Logger.warn(`SaaS Bridge [${action}] timed out — cold start likely`);
            } else if (e.name === 'TypeError' && msg === 'Failed to fetch') {
                msg = `Network Error: Could not reach ${apiUrl}. 1) Check your internet. 2) If using PHP Bridge, ensure CORS is enabled. 3) Check if you are mixing HTTP/HTTPS.`;
                Logger.warn(`SaaS Bridge [${action}] network error — failed to fetch`);
            } else {
                Logger.error(`SaaS Bridge Action [${action}] failed`, e);
            }
            throw new Error(msg);
        } finally {
            if (action.startsWith('get_')) {
                delete activeRequests[requestKey];
            }
        }
    })();

    if (action.startsWith('get_')) {
        activeRequests[requestKey] = fetchPromise;
    }

    return fetchPromise;
};

// --- SETTINGS & AUTH ---

export const getSettings = (): AppSettings => {
    const stored = localStorage.getItem(getSettingsKey());
    if (stored) {
        const parsed = JSON.parse(stored);
        const merged = { ...DEFAULT_SETTINGS, ...parsed };
        return {
            ...merged,
            mysqlConfig: sanitizeConfigForStorage(merged.mysqlConfig)
        };
    }
    return {
        ...DEFAULT_SETTINGS,
        mysqlConfig: sanitizeConfigForStorage(DEFAULT_SETTINGS.mysqlConfig)
    };
};

export const saveSettings = async (settings: AppSettings, skipCloudSync = false) => {
    const existing = getSettings();
    if (existing.isConfigured && existing.dataSource !== settings.dataSource) {
        if (existing.dataSource === 'CLOUD_MYSQL' && settings.dataSource === 'INDEXED_DB') {
            Logger.warn("Downgrading Data Source from Cloud to Local.");
        }
    }

    const safeSettings: AppSettings = {
        ...settings,
        mysqlConfig: sanitizeConfigForStorage(settings.mysqlConfig)
    };
    localStorage.setItem(getSettingsKey(), JSON.stringify(safeSettings));

    // Attempt background sync if cloud is enabled AND we're not in a login/logout context
    if (!skipCloudSync && ['MYSQL', 'CLOUD_MYSQL'].includes(settings.dataSource)) {
        try {
            // Fire and forget, don't block UI
            mysqlFetch('save_app_settings', {
                companyName: settings.companyName,
                companyGstin: settings.companyGstin || '',
                logoUrl: settings.logoUrl || '',
                taxRate: settings.taxRate.toString(),
                currency: settings.currency,
                countryCode: settings.countryCode,
                invoicePrefix: settings.invoicePrefix,
                terms: settings.terms,
                invoiceHeader: settings.invoiceHeader,
                invoiceFooter: settings.invoiceFooter,
                enableDateTime: settings.enableDateTime
            }).catch(e => console.warn("Background settings sync failed", e));
        } catch (e) {
            // Ignore
        }
    }
};

// --- DATA INITIALIZATION ---

export const verifyConnection = async (config: MySQLConfig) => {
    // Explicitly test the connection using the provided config
    return await mysqlFetch('ping', {}, config);
};

export const initDataLayer = async (settings: AppSettings) => {
    try {
        if (settings.dataSource === 'INDEXED_DB') {
            await initLocalDB();
            return;
        }

        if (settings.dataSource === 'MYSQL' || settings.dataSource === 'CLOUD_MYSQL') {
            if (!settings.license?.key) {
                // During early onboarding there is no tenant license yet.
                // Ping is best-effort — don't block if server is cold-starting.
                try {
                    await mysqlFetch('ping', {}, settings.mysqlConfig);
                } catch (pingErr: any) {
                    Logger.warn('initDataLayer: ping failed (cold start?)', pingErr?.message);
                }
                return;
            }

            // Ping is best-effort — Vercel cold starts can exceed 20s, don't block init.
            try {
                await mysqlFetch('ping', {}, settings.mysqlConfig);
            } catch (pingErr: any) {
                Logger.warn('initDataLayer: ping failed (cold start?)', pingErr?.message);
            }

            // get_app_settings is also best-effort during init; fetchCloudAppSettings
            // (called separately in App.tsx) already handles its own error silently.
            try {
                await mysqlFetch('get_app_settings', {}, settings.mysqlConfig);
            } catch (settingsErr: any) {
                Logger.warn('initDataLayer: get_app_settings failed (non-fatal)', settingsErr?.message);
            }
            return;
        }
    } catch (e) {
        throw e;

    }
};

// --- SUPER ADMIN ACTIONS ---

export const adminLogin = async (password: string): Promise<{ user: User, token: string }> => {
    return await mysqlFetch('admin_login', { password });
};

export const adminGetUsers = async (): Promise<SaaSUser[]> => {
    return await mysqlFetch('admin_get_users');
};

export const adminGetPlans = async (): Promise<SaaSPlan[]> => {
    return await mysqlFetch('admin_get_plans');
};

export const adminGetPayments = async (): Promise<SaasPayment[]> => {
    return await mysqlFetch('admin_get_payments');
};

export const adminGetMetrics = async (): Promise<AdminMetrics> => {
    return await mysqlFetch('admin_get_metrics');
};

export const adminSavePlan = async (plan: SaaSPlan) => {
    return await mysqlFetch('admin_save_plan', plan);
};

export const adminInitSystem = async () => {
    return await mysqlFetch('admin_init_system');
};

export const adminGetLicenses = async (): Promise<SaaSLicenseKey[]> => {
    return await mysqlFetch('admin_get_licenses');
};

export const adminSaveLicense = async (license: Partial<SaaSLicenseKey> & { license_key: string; plan_id: string; status: string }) => {
    return await mysqlFetch('admin_save_license', license);
};

export const adminDeleteLicense = async (license_key: string) => {
    return await mysqlFetch('admin_delete_license', { license_key });
};

export const adminGetErrorLogs = async (): Promise<AdminErrorLog[]> => {
    return await mysqlFetch('admin_get_error_logs');
};

export const adminGetContactMessages = async (): Promise<ContactMessage[]> => {
    return await mysqlFetch('admin_get_contact_messages');
};

// --- USER AUTH ACTIONS ---


export const checkRegistrationEligibility = async (email: string, license: string, phone?: string, explicitConfig?: MySQLConfig) => {
    return await mysqlFetch('check_registration_eligibility', { email, license, phone }, explicitConfig);
};

export const registerSaaSUser = async (email: string, license: string, name: string, password?: string, phone?: string, explicitConfig?: MySQLConfig) => {
    return await mysqlFetch('register_user', { email, license, name, password, phone }, explicitConfig);
};

export const loginSaaSUser = async (email: string, password?: string, explicitConfig?: MySQLConfig) => {
    return await mysqlFetch('login_user', { email, password }, explicitConfig);
};

export const forgotPassword = async (email: string) => {
    return await mysqlFetch('forgot_password', { email });
};

export const resetPassword = async (email: string, token: string, newPassword: string) => {
    return await mysqlFetch('reset_password', { email, token, new_password: newPassword });
};

export const changePassword = async (email: string, currentPassword: string, newPassword: string) => {
    return await mysqlFetch('change_password', { email, current_password: currentPassword, new_password: newPassword });
};

export const submitContactMessage = async (name: string, email: string, message: string, subject?: string) => {
    return await mysqlFetch('submit_contact_message', { name, email, message, subject: subject || 'General Inquiry' });
};

export const logClientError = async (message: string, context?: any, source = 'CLIENT_APP') => {
    return await mysqlFetch('log_error', { message, context, source, level: 'ERROR' }).catch(() => undefined);
};



// --- FETCHERS & SAVERS ---

export const fetchCloudAppSettings = async (): Promise<Partial<AppSettings> | null> => {
    const settings = getSettings();
    if (!['MYSQL', 'CLOUD_MYSQL'].includes(settings.dataSource)) return null;
    try {
        const data = await mysqlFetch('get_app_settings');
        if (data && data.length > 0) {
            const s = data[0];
            return {
                companyName: s.companyName,
                companyGstin: s.companyGstin,
                logoUrl: s.logoUrl,
                taxRate: parseFloat(s.taxRate || '0'),
                currency: s.currency,
                countryCode: s.countryCode,
                invoicePrefix: s.invoicePrefix,
                terms: s.terms,
                invoiceHeader: s.invoiceHeader,
                invoiceFooter: s.invoiceFooter,
                enableDateTime: !!s.enableDateTime
            };
        }
    } catch (e) {
        // Silent fail
    }
    return null;
};

export const fetchCloudUserProfile = async (email?: string): Promise<Partial<User> | null> => {
    const settings = getSettings();
    if (!['MYSQL', 'CLOUD_MYSQL'].includes(settings.dataSource)) return null;
    try {
        const data = await mysqlFetch('get_profile', email ? { email } : {});
        if (data && data.length > 0) {
            const p = data[0];
            return {
                email: p.email,
                name: p.name,
                role: p.role as Role,
                phone: p.phone,
                avatarUrl: p.avatar_url
            };
        }
    } catch (e) {
        // Silent fail
    }
    return null;
};

export const fetchCustomers = async (forceRefresh = false): Promise<Customer[]> => {
    const settings = getSettings();
    if (settings.dataSource === 'INDEXED_DB') return await db.customers.getAll();

    if (['MYSQL', 'CLOUD_MYSQL'].includes(settings.dataSource)) {
        const now = Date.now();
        if (!forceRefresh && CACHE.customers && (now - CACHE.customers.timestamp < CACHE_TTL)) {
            return [...CACHE.customers.data]; // Return copy to ensure React re-render
        }
        const data = await v3Request('/b/1/customers?limit=1000');
        const mapped = (data || []).map((c: any) => ({
            id: String(c.customer_id),
            name: c.customer_name,
            email: c.email || '',
            phone: c.phone || '',
            address: c.address || '',
            notes: c.notes || '',
            type: (c.customer_type === 'Wholesale Customer' ? 'Business' : 'Retail') as CustomerType,
            gstin: c.gst_number || '',
            total_invoiced: Number(c.total_invoiced || 0),
            total_paid: Number(c.total_paid || 0),
            balance_due: Number(c.balance_due || 0)
        }));
        CACHE.customers = { data: mapped, timestamp: now };
        return [...mapped];
    }
    return [];
};

export const fetchCustomersPaginated = async (page = 1, limit = 25, search = ''): Promise<PaginatedResponse<Customer>> => {
    let query = `?page=${page}&limit=${limit}`;
    if (search) query += `&search=${encodeURIComponent(search)}`;
    const res = await v3RequestPaginated<any>(`/b/1/customers${query}`);
    
    const mapped = res.data.map((c: any) => ({
        id: String(c.customer_id),
        name: c.customer_name,
        email: c.email || '',
        phone: c.phone || '',
        address: c.address || '',
        notes: c.notes || '',
        type: (c.customer_type === 'Wholesale Customer' ? 'Business' : 'Retail') as CustomerType,
        gstin: c.gst_number || '',
        total_invoiced: Number(c.total_invoiced || 0),
        total_paid: Number(c.total_paid || 0),
        balance_due: Number(c.balance_due || 0)
    }));

    return { data: mapped, pagination: res.pagination };
};

export const fetchInvoices = async (forceRefresh = false): Promise<Invoice[]> => {
    const settings = getSettings();
    if (settings.dataSource === 'INDEXED_DB') return (await db.invoices.getAll()).filter(i => i.status !== InvoiceStatus.DELETED);

    if (['MYSQL', 'CLOUD_MYSQL'].includes(settings.dataSource)) {
        const now = Date.now();
        if (!forceRefresh && CACHE.invoices && (now - CACHE.invoices.timestamp < CACHE_TTL)) {
            return [...CACHE.invoices.data]; // Return copy to ensure React re-render
        }
        
        // Fetch using V3 sales endpoint
        const rawSales = await v3Request('/b/1/sales?limit=1000');
        const parsedData = (rawSales || []).map((sale: any) => {
            const items = (sale.items || []).map((item: any) => ({
                id: String(item.product_id || ''),
                productId: item.product_id ? Number(item.product_id) : undefined,
                description: item.item_name || '',
                quantity: Number(item.quantity || 0),
                price: Number(item.selling_price || 0),
                purchasePrice: Number(item.purchase_price || 0),
                taxRate: Number(item.cgst_percentage || 0) + Number(item.sgst_percentage || 0) + Number(item.igst_percentage || 0),
                discount: Number(item.discount_amount || 0)
            }));

            let status = InvoiceStatus.UNPAID;
            if (sale.payment_status === 'Paid') {
                status = InvoiceStatus.PAID;
            } else if (sale.payment_status === 'Partial') {
                status = InvoiceStatus.PARTIAL;
            }

            return {
                id: sale.invoice_no,
                sale_id: sale.sale_id,
                customerId: String(sale.customer_id || ''),
                date: sale.invoice_date,
                dueDate: sale.due_date || new Date(new Date(sale.invoice_date).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                items,
                subtotal: Number(sale.subtotal || 0),
                tax: Number(sale.total_cgst || 0) + Number(sale.total_sgst || 0) + Number(sale.total_igst || 0),
                total: Number(sale.grand_total || 0),
                status,
                paymentMode: sale.payment_mode,
                amountReceived: Number(sale.amount_received || 0),
                notes: sale.notes || '',
                overallDiscount: Number(sale.discount_amount || 0),
                packingCharges: Number(sale.delivery_charge || 0),
                freightCharges: Number(sale.transport_cost || 0)
            };
        });

        CACHE.invoices = { data: parsedData, timestamp: now };
        return [...parsedData];
    }
    return [];
};

export const fetchInvoicesPaginated = async (page = 1, limit = 25, search = ''): Promise<PaginatedResponse<Invoice>> => {
    let query = `?page=${page}&limit=${limit}`;
    if (search) query += `&search=${encodeURIComponent(search)}`;
    const res = await v3RequestPaginated<any>(`/b/1/sales${query}`);
    
    const mapped = res.data.map((sale: any) => {
        const items = (sale.items || []).map((item: any) => ({
            id: String(item.product_id || ''),
            productId: item.product_id ? Number(item.product_id) : undefined,
            description: item.item_name || '',
            quantity: Number(item.quantity || 0),
            price: Number(item.selling_price || 0),
            purchasePrice: Number(item.purchase_price || 0),
            taxRate: Number(item.cgst_percentage || 0) + Number(item.sgst_percentage || 0) + Number(item.igst_percentage || 0),
            discount: Number(item.discount_amount || 0)
        }));

        let status = InvoiceStatus.UNPAID;
        if (sale.payment_status === 'Paid') {
            status = InvoiceStatus.PAID;
        } else if (sale.payment_status === 'Partial') {
            status = InvoiceStatus.PARTIAL;
        }

        return {
            id: String(sale.sale_id),
            customerId: String(sale.customer_id),
            date: sale.invoice_date.split('T')[0],
            dueDate: (sale.due_date || sale.invoice_date).split('T')[0],
            items,
            subtotal: Number(sale.subtotal || 0),
            tax: Number(sale.tax_amount || 0),
            total: Number(sale.grand_total || 0),
            status,
            amountReceived: Number(sale.amount_received || 0),
            notes: sale.notes || '',
            overallDiscount: Number(sale.discount_amount || 0),
            packingCharges: Number(sale.delivery_charge || 0),
            freightCharges: Number(sale.transport_cost || 0),
            amountPaid: Number(sale.amount_paid || 0),
            paymentMode: sale.payment_mode || 'Cash'
        };
    });

    return { data: mapped, pagination: res.pagination };
};

export const saveInvoice = async (invoice: Invoice): Promise<void> => {
    const settings = getSettings();
    if (['MYSQL', 'CLOUD_MYSQL'].includes(settings.dataSource)) {
        CACHE.invoices = null; // Invalidate cache to force fresh fetch
        
        // Map Invoice to V3 Sale payload
        const items = (invoice.items || []).map((item: any) => {
            const tax = Number(item.taxRate || 0);
            const cgst = tax / 2;
            const sgst = tax / 2;
            const subtotalLine = Math.max(0, Number(item.quantity || 0) * Number(item.price || 0) - Number(item.discount || 0));
            const totalTaxLine = subtotalLine * (tax / 100);
            return {
                product_id: item.productId ? Number(item.productId) : null,
                item_name: item.description || '',
                quantity: Number(item.quantity || 0),
                selling_price: Number(item.price || 0),
                purchase_price: Number(item.purchasePrice || 0),
                cgst_percentage: cgst,
                sgst_percentage: sgst,
                igst_percentage: 0,
                discount_amount: Number(item.discount || 0),
                total_tax: totalTaxLine
            };
        });
        
        const amountReceived = invoice.amountReceived !== undefined ? Number(invoice.amountReceived) : (invoice.status === InvoiceStatus.PAID ? Number(invoice.total || 0) : 0);
        
        const saleData = {
            customer_id: isNaN(Number(invoice.customerId)) ? null : Number(invoice.customerId),
            invoice_date: invoice.date ? invoice.date.slice(0, 10) : undefined, // pass user-selected date (YYYY-MM-DD)
            items,
            sale_type: 'Normal Sale',
            payment_mode: invoice.paymentMode || 'Cash',
            discount_amount: Number(invoice.overallDiscount || 0),
            transport_cost: Number(invoice.freightCharges || 0),
            delivery_charge: Number(invoice.packingCharges || 0),
            amount_received: amountReceived,
            notes: invoice.notes || ''
        };
        
        await v3Request('/b/1/sales', 'POST', saleData);
        return;
    }
    if (settings.dataSource === 'INDEXED_DB') return await db.invoices.save(invoice);
};

export const deleteInvoice = async (id: string): Promise<void> => {
    const settings = getSettings();
    if (['MYSQL', 'CLOUD_MYSQL'].includes(settings.dataSource)) {
        CACHE.invoices = null; // Invalidate cache to force fresh fetch
        await v3Request(`/b/1/sales/${id}`, 'DELETE');
        return;
    }
    if (settings.dataSource === 'INDEXED_DB') return await db.invoices.softDelete(id);
};

export const saveCustomer = async (customer: Customer): Promise<any> => {
    const settings = getSettings();
    if (['MYSQL', 'CLOUD_MYSQL'].includes(settings.dataSource)) {
        CACHE.customers = null; // Invalidate cache to force fresh fetch
        const v3Data = {
            customer_name: customer.name,
            customer_type: customer.type === 'Business' ? 'Wholesale Customer' : 'Retail Customer',
            email: customer.email || null,
            phone: customer.phone || null,
            address: customer.address || null,
            gst_number: customer.gstin || null,
            company_name: customer.type === 'Business' ? customer.name : null,
            opening_balance: 0.00,
            opening_balance_type: 'Receivable',
            is_active: 1
        };

        const isNew = !customer.id || isNaN(Number(customer.id)) || Number(customer.id) > 1000000000000;
        if (!isNew) {
            await v3Request(`/b/1/customers/${customer.id}`, 'PUT', v3Data);
            return customer.id;
        } else {
            const resData = await v3Request('/b/1/customers', 'POST', v3Data);
            return resData?.customer_id;
        }
    }
    if (settings.dataSource === 'INDEXED_DB') {
        await db.customers.save(customer);
        return customer.id;
    }
};

export const saveUserProfile = async (user: User): Promise<void> => {
    const settings = getSettings();
    if (['MYSQL', 'CLOUD_MYSQL'].includes(settings.dataSource)) {
        await mysqlFetch('save_profile', {
            email: user.email,
            name: user.name,
            role: user.role,
            phone: user.phone || '',
            avatar_url: user.avatarUrl || ''
        });
    }
};


export const stripSensitiveSettings = (settings: AppSettings): AppSettings => ({
    ...settings,
    mysqlConfig: sanitizeConfigForStorage(settings.mysqlConfig)
});

// --- V3 REST API ROUTER CONNECTORS ---

const getV3Url = (path: string) => {
    const settings = getSettings();
    const base = settings.mysqlConfig.apiUrl || 'http://localhost:3000/api';
    return base.replace(/\/api$/, '') + '/api/v1' + path;
};

const v3Request = async (path: string, method = 'GET', body?: any) => {
    let businessId = localStorage.getItem('business_id') || '1';
    let email = '';
    try {
        const stored = localStorage.getItem('simplebill_user');
        if (stored) {
            const user = JSON.parse(stored);
            if (user && (user.businessId || user.companyId)) {
                businessId = String(user.businessId || user.companyId);
            }
            if (user && user.email) {
                email = user.email;
            }
        }
    } catch(e) {}
    
    let resolvedPath = path;
    if (resolvedPath.startsWith('/b/1/')) {
        resolvedPath = resolvedPath.replace('/b/1/', `/b/${businessId}/`);
    }

    const url = getV3Url(resolvedPath);
    const token = localStorage.getItem('access_token');
    const response = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'x-business-id': businessId,
            'x-user-email': email,
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) {
        const errorText = await response.text();
        let errorObj;
        try {
            errorObj = JSON.parse(errorText);
        } catch {
            // Ignore
        }
        const message = NotificationService.error(errorObj?.error?.message || errorObj?.error || `HTTP ${response.status}: ${response.statusText}`);
        throw new Error(message);
    }
    const res = await response.json();
    if (!res.success) throw new Error(NotificationService.error(res.error?.message || 'Request failed'));
    return res.data;
};

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

const v3RequestPaginated = async <T>(path: string, method = 'GET', body?: any): Promise<PaginatedResponse<T>> => {
    let businessId = localStorage.getItem('business_id') || '1';
    let email = '';
    try {
        const stored = localStorage.getItem('simplebill_user');
        if (stored) {
            const user = JSON.parse(stored);
            businessId = String(user.businessId || user.companyId || businessId);
            email = user.email || '';
        }
    } catch(e) {}
    
    let resolvedPath = path;
    if (resolvedPath.startsWith('/b/1/')) {
        resolvedPath = resolvedPath.replace('/b/1/', `/b/${businessId}/`);
    }

    const url = getV3Url(resolvedPath);
    const token = localStorage.getItem('access_token');
    const response = await fetch(url, {
        method,
        headers: { 
            'Content-Type': 'application/json', 
            'x-business-id': businessId, 
            'x-user-email': email,
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) {
        let errorObj;
        try { errorObj = await response.json(); } catch { }
        const message = NotificationService.error(errorObj?.error?.message || errorObj?.error || `HTTP ${response.status}: ${response.statusText}`);
        throw new Error(message);
    }
    const res = await response.json();
    if (!res.success) throw new Error(NotificationService.error(res.error?.message || 'Request failed'));
    return { data: res.data, pagination: res.pagination || { page: 1, limit: res.data.length, total: res.data.length, totalPages: 1 } };
};

export const fetchSuppliers = async (): Promise<Supplier[]> => {
    return await v3Request('/b/1/suppliers?limit=1000');
};

export const fetchSuppliersPaginated = async (page = 1, limit = 25, search = ''): Promise<PaginatedResponse<Supplier>> => {
    let query = `?page=${page}&limit=${limit}`;
    if (search) query += `&search=${encodeURIComponent(search)}`;
    return await v3RequestPaginated(`/b/1/suppliers${query}`);
};

export const saveSupplier = async (supplier: Supplier): Promise<void> => {
    if (supplier.supplier_id) {
        await v3Request(`/b/1/suppliers/${supplier.supplier_id}`, 'PUT', supplier);
    } else {
        await v3Request('/b/1/suppliers', 'POST', supplier);
    }
};

export const fetchPurchases = async (filters?: { supplier_id?: string | number }): Promise<Purchase[]> => {
    let query = '?limit=1000';
    if (filters?.supplier_id) {
        query += `&supplier_id=${filters.supplier_id}`;
    }
    return await v3Request(`/b/1/purchases${query}`);
};

export const fetchPurchasesPaginated = async (page = 1, limit = 25, search = ''): Promise<PaginatedResponse<Purchase>> => {
    let query = `?page=${page}&limit=${limit}`;
    if (search) query += `&search=${encodeURIComponent(search)}`;
    return await v3RequestPaginated(`/b/1/purchases${query}`);
};

export const savePurchase = async (purchase: Purchase): Promise<void> => {
    const items = (purchase.items || []).map((item: any) => {
        const cgst = Number(item.cgst_percentage || 0);
        const sgst = Number(item.sgst_percentage || 0);
        const igst = Number(item.igst_percentage || 0);
        const tax = cgst + sgst + igst;
        const purchasePrice = Number(item.purchase_price ?? item.unit_price ?? 0);
        const discountAmount = Number(item.discount_amount ?? item.discount ?? 0);
        const subtotalLine = Number(item.quantity || 0) * purchasePrice - discountAmount;
        const totalTaxLine = subtotalLine * (tax / 100);
        return {
            product_id: Number(item.product_id),
            quantity: Number(item.quantity || 0),
            free_quantity: Number(item.free_quantity || 0),
            purchase_price: purchasePrice,
            selling_price: Number(item.selling_price || purchasePrice),
            profit_percentage: Number(item.profit_percentage || 0),
            discount_percentage: Number(item.discount_percentage || 0),
            discount_amount: discountAmount,
            cgst_percentage: cgst,
            sgst_percentage: sgst,
            igst_percentage: igst,
            total_tax: totalTaxLine,
            total_amount: subtotalLine + totalTaxLine
        };
    });

    const amountPaid = Number(purchase.amount_paid ?? purchase.paid_amount ?? 0);

    const purchaseData = {
        supplier_id: Number(purchase.supplier_id),
        new_supplier: purchase.new_supplier,
        supplier_invoice_no: purchase.supplier_invoice_no || purchase.reference_number || null,
        reference_number: purchase.reference_number || purchase.supplier_invoice_no || null,
        items,
        payment_mode: purchase.payment_mode || 'Cash',
        transport_cost: Number(purchase.transport_cost ?? purchase.shipping_charges ?? 0),
        loading_cost: Number(purchase.loading_cost || 0),
        other_charges: Number(purchase.other_charges || 0),
        transport_paid_by: purchase.transport_paid_by || 'Business',
        transport_vehicle_no: purchase.transport_vehicle_no || null,
        transport_notes: purchase.transport_notes || null,
        amount_paid: amountPaid,
        notes: purchase.notes || null
    };

    await v3Request('/b/1/purchases', 'POST', purchaseData);
};

export const fetchPaymentsIn = async (): Promise<PaymentIn[]> => {
    return await v3Request('/b/1/payments/in?limit=1000');
};

export const fetchPaymentsInPaginated = async (page = 1, limit = 25, search = ''): Promise<PaginatedResponse<PaymentIn>> => {
    let query = `?page=${page}&limit=${limit}`;
    if (search) query += `&search=${encodeURIComponent(search)}`;
    return await v3RequestPaginated<PaymentIn>(`/b/1/payments/in${query}`);
};

export const savePaymentIn = async (payment: PaymentIn): Promise<void> => {
    await v3Request('/b/1/payments/in', 'POST', payment);
};

export const fetchPaymentsOut = async (): Promise<PaymentOut[]> => {
    return await v3Request('/b/1/payments/out?limit=1000');
};

export const fetchPaymentsOutPaginated = async (page = 1, limit = 25, search = ''): Promise<PaginatedResponse<PaymentOut>> => {
    let query = `?page=${page}&limit=${limit}`;
    if (search) query += `&search=${encodeURIComponent(search)}`;
    return await v3RequestPaginated<PaymentOut>(`/b/1/payments/out${query}`);
};

export const savePaymentOut = async (payment: PaymentOut): Promise<void> => {
    await v3Request('/b/1/payments/out', 'POST', payment);
};

export type PaymentPartyType = 'customer' | 'supplier';
export type PaymentDirection = 'pay_in' | 'pay_out';

export const fetchPaymentContext = async (partyType: PaymentPartyType, partyId: number): Promise<any> => {
    const path = partyType === 'supplier'
        ? `/b/1/suppliers/${partyId}/payment-context`
        : `/b/1/customers/${partyId}/payment-context`;
    return await v3Request(path);
};

export const saveLinkedPartyPayment = async (
    partyType: PaymentPartyType,
    partyId: number,
    direction: PaymentDirection,
    payment: any
): Promise<any> => {
    const path = partyType === 'supplier'
        ? `/b/1/suppliers/${partyId}/${direction === 'pay_in' ? 'pay-in' : 'pay-out'}`
        : `/b/1/customers/${partyId}/${direction === 'pay_in' ? 'pay-in' : 'pay-out'}`;
    return await v3Request(path, 'POST', payment);
};

export const fetchDaybook = async (dateFrom?: string, dateTo?: string): Promise<DaybookEntry[]> => {
    const query = (dateFrom && dateTo) ? `?date_from=${dateFrom}&date_to=${dateTo}` : '';
    return await v3Request(`/b/1/daybook${query}`);
};

export const fetchPartyLedger = async (partyId: string, type: 'Customer' | 'Supplier'): Promise<any> => {
    return await v3Request(`/b/1/party-ledger/${partyId}?type=${type}`);
};

// --- PRODUCTS & INVENTORY ---
export const fetchProducts = async (filters: any = {}): Promise<Product[]> => {
    const query = new URLSearchParams(filters).toString();
    return await v3Request(`/b/1/products${query ? '?' + query : ''}`);
};

export const saveProduct = async (product: Partial<Product>): Promise<Product> => {
    if (product.product_id) {
        return await v3Request(`/b/1/products/${product.product_id}`, 'PUT', product);
    } else {
        return await v3Request('/b/1/products', 'POST', product);
    }
};

export const deleteProduct = async (id: number): Promise<void> => {
    await v3Request(`/b/1/products/${id}`, 'DELETE');
};

export const fetchProductStockMovements = async (id: number): Promise<StockMovement[]> => {
    return await v3Request(`/b/1/products/${id}/stock-movements`);
};

// --- CATEGORIES & UNITS ---
export const fetchCategories = async (includeInactive = false): Promise<Category[]> => {
    return await v3Request(`/b/1/categories${includeInactive ? '?include_inactive=true' : ''}`);
};

export const saveCategory = async (category: Partial<Category>): Promise<any> => {
    if (category.category_id) {
        return await v3Request(`/b/1/categories/${category.category_id}`, 'PUT', category);
    }
    return await v3Request('/b/1/categories', 'POST', category);
};

export const deleteCategory = async (id: number): Promise<void> => {
    await v3Request(`/b/1/categories/${id}`, 'DELETE');
};

export const toggleCategoryActive = async (id: number): Promise<void> => {
    await v3Request(`/b/1/categories/${id}/toggle-active`, 'PUT');
};

export const fetchUnits = async (): Promise<Unit[]> => {
    return await v3Request('/b/1/units');
};

export const saveUnit = async (unit: Partial<Unit>): Promise<any> => {
    if (unit.unit_id) {
        return await v3Request(`/b/1/units/${unit.unit_id}`, 'PUT', unit);
    }
    return await v3Request('/b/1/units', 'POST', unit);
};

export const deleteUnit = async (id: number): Promise<void> => {
    await v3Request(`/b/1/units/${id}`, 'DELETE');
};

// --- SALES RETURNS ---
export const fetchSalesReturns = async (filters: any = {}): Promise<SalesReturn[]> => {
    const query = new URLSearchParams({ ...filters, limit: '1000' }).toString();
    return await v3Request(`/b/1/sales-returns?${query}`);
};

export const fetchSalesReturnsPaginated = async (page = 1, limit = 25, search = ''): Promise<PaginatedResponse<SalesReturn>> => {
    let query = `?page=${page}&limit=${limit}`;
    if (search) query += `&search=${encodeURIComponent(search)}`;
    return await v3RequestPaginated<SalesReturn>(`/b/1/sales-returns${query}`);
};

export const saveSalesReturn = async (returnData: Partial<SalesReturn>): Promise<any> => {
    return await v3Request('/b/1/sales-returns', 'POST', returnData);
};

export const fetchSalesReturnById = async (id: number): Promise<SalesReturn> => {
    return await v3Request(`/b/1/sales-returns/${id}`);
};

export const deleteSalesReturn = async (id: number): Promise<void> => {
    await v3Request(`/b/1/sales-returns/${id}`, 'DELETE');
};

export const updateSalesReturnRefundStatus = async (id: number, updateData: {
    refund_status: 'Refunded' | 'Pending' | 'Adjusted';
    payment_mode?: string;
    payment_date?: string;
    reference_no?: string;
    adjusted_in_sale_id?: number;
}): Promise<any> => {
    return await v3Request(`/b/1/sales-returns/${id}/refund-status`, 'PUT', updateData);
};

export const applyReturnAsAdjustment = async (
    returnType: 'sales' | 'purchase',
    returnId: number,
    linkedIdOrAllocations: number | { id: number; amount: number }[]
): Promise<any> => {
    if (returnType === 'sales') {
        if (typeof linkedIdOrAllocations === 'number') {
            return await v3Request(`/b/1/sales-returns/${returnId}/apply-adjustment`, 'POST', { sale_id: linkedIdOrAllocations });
        } else {
            return await v3Request(`/b/1/sales-returns/${returnId}/apply-adjustment`, 'POST', {
                allocations: linkedIdOrAllocations.map(a => ({ sale_id: a.id, amount: a.amount }))
            });
        }
    } else {
        if (typeof linkedIdOrAllocations === 'number') {
            return await v3Request(`/b/1/purchase-returns/${returnId}/apply-adjustment`, 'POST', { purchase_id: linkedIdOrAllocations });
        } else {
            return await v3Request(`/b/1/purchase-returns/${returnId}/apply-adjustment`, 'POST', {
                allocations: linkedIdOrAllocations.map(a => ({ purchase_id: a.id, amount: a.amount }))
            });
        }
    }
};

// --- PURCHASE RETURNS ---
export const fetchPurchaseReturns = async (filters: any = {}): Promise<PurchaseReturn[]> => {
    const query = new URLSearchParams({ ...filters, limit: '1000' }).toString();
    return await v3Request(`/b/1/purchase-returns?${query}`);
};

export const fetchPurchaseReturnsPaginated = async (page = 1, limit = 25, search = ''): Promise<PaginatedResponse<PurchaseReturn>> => {
    let query = `?page=${page}&limit=${limit}`;
    if (search) query += `&search=${encodeURIComponent(search)}`;
    return await v3RequestPaginated<PurchaseReturn>(`/b/1/purchase-returns${query}`);
};

export const savePurchaseReturn = async (returnData: Partial<PurchaseReturn>): Promise<any> => {
    return await v3Request('/b/1/purchase-returns', 'POST', returnData);
};

export const fetchPurchaseReturnById = async (id: number): Promise<PurchaseReturn> => {
    return await v3Request(`/b/1/purchase-returns/${id}`);
};

export const deletePurchaseReturn = async (id: number): Promise<void> => {
    await v3Request(`/b/1/purchase-returns/${id}`, 'DELETE');
};

export const updatePurchaseReturnRefundStatus = async (id: number, updateData: {
    refund_status: 'Refunded' | 'Pending' | 'Adjusted';
    payment_mode?: string;
    payment_date?: string;
    reference_no?: string;
    adjusted_in_purchase_id?: number;
}): Promise<any> => {
    return await v3Request(`/b/1/purchase-returns/${id}/refund-status`, 'PUT', updateData);
};

// --- BUSINESS USERS (STAFF) ---
export const fetchBusinessUsers = async (): Promise<BusinessUser[]> => {
    return await v3Request('/b/1/users');
};

export const inviteBusinessUser = async (inviteData: {
    email?: string;
    phone?: string;
    role: 'Owner' | 'Admin' | 'Manager' | 'Accountant' | 'Staff';
}): Promise<{ business_user_id: number; status: 'invited' | 'active' }> => {
    return await v3Request('/b/1/users/invite', 'POST', inviteData);
};

export const updateBusinessUserRole = async (userId: number, role: 'Owner' | 'Admin' | 'Manager' | 'Accountant' | 'Staff'): Promise<void> => {
    await v3Request(`/b/1/users/${userId}/role`, 'PUT', { role });
};

export const toggleBusinessUserActive = async (userId: number): Promise<{ is_active: boolean }> => {
    return await v3Request(`/b/1/users/${userId}/toggle-active`, 'PUT');
};

export const deleteBusinessUser = async (userId: number): Promise<void> => {
    await v3Request(`/b/1/users/${userId}`, 'DELETE');
};

// --- EXPENSES ---
export const fetchExpenseCategories = async (includeInactive = false): Promise<ExpenseCategory[]> => {
    return await v3Request(`/b/1/expenses/categories${includeInactive ? '?include_inactive=true' : ''}`);
};

export const saveExpenseCategory = async (cat: Partial<ExpenseCategory>): Promise<any> => {
    if (cat.category_id) {
        return await v3Request(`/b/1/expenses/categories/${cat.category_id}`, 'PUT', cat);
    }
    return await v3Request('/b/1/expenses/categories', 'POST', cat);
};

export const deleteExpenseCategory = async (id: number): Promise<void> => {
    await v3Request(`/b/1/expenses/categories/${id}`, 'DELETE');
};

export const toggleExpenseCategoryActive = async (id: number): Promise<void> => {
    await v3Request(`/b/1/expenses/categories/${id}/toggle-active`, 'PUT');
};

export const fetchExpenses = async (filters: any = {}): Promise<Expense[]> => {
    const query = new URLSearchParams(filters).toString();
    return await v3Request(`/b/1/expenses${query ? '?' + query : ''}`);
};

export const saveExpense = async (expense: Partial<Expense>): Promise<any> => {
    if (expense.expense_id) {
        return await v3Request(`/b/1/expenses/${expense.expense_id}`, 'PUT', expense);
    }
    return await v3Request('/b/1/expenses', 'POST', expense);
};

export const deleteExpense = async (id: number): Promise<void> => {
    await v3Request(`/b/1/expenses/${id}`, 'DELETE');
};

// --- INCOMES ---
export const fetchIncomeCategories = async (includeInactive = false): Promise<IncomeCategory[]> => {
    return await v3Request(`/b/1/incomes/categories${includeInactive ? '?include_inactive=true' : ''}`);
};

export const saveIncomeCategory = async (cat: Partial<IncomeCategory>): Promise<any> => {
    if (cat.category_id) {
        return await v3Request(`/b/1/incomes/categories/${cat.category_id}`, 'PUT', cat);
    }
    return await v3Request('/b/1/incomes/categories', 'POST', cat);
};

export const deleteIncomeCategory = async (id: number): Promise<void> => {
    await v3Request(`/b/1/incomes/categories/${id}`, 'DELETE');
};

export const toggleIncomeCategoryActive = async (id: number): Promise<void> => {
    await v3Request(`/b/1/incomes/categories/${id}/toggle-active`, 'PUT');
};

export const fetchIncomes = async (filters: any = {}): Promise<Income[]> => {
    const query = new URLSearchParams(filters).toString();
    return await v3Request(`/b/1/incomes${query ? '?' + query : ''}`);
};

export const saveIncome = async (income: Partial<Income>): Promise<any> => {
    if (income.income_id) {
        return await v3Request(`/b/1/incomes/${income.income_id}`, 'PUT', income);
    }
    return await v3Request('/b/1/incomes', 'POST', income);
};

export const deleteIncome = async (id: number): Promise<void> => {
    await v3Request(`/b/1/incomes/${id}`, 'DELETE');
};

export const fetchBusinessSettings = async (): Promise<any> => {
    return await v3Request('/b/1/settings');
};

export const saveBusinessSettings = async (settings: any): Promise<any> => {
    return await v3Request('/b/1/settings', 'PUT', settings);
};

export const fetchDatabaseInfo = async (): Promise<any> => {
    return await v3Request('/b/1/settings/db-info');
};

export const executeDatabaseQuery = async (sql: string, params?: any[]): Promise<any> => {
    return await v3Request('/b/1/settings/query', 'POST', { sql, params });
};

// --- ADVANCED REPORTS SERVICES ---
export const fetchDashboardReports = async (): Promise<any> => {
    let businessId = localStorage.getItem('business_id') || '1';
    try {
        const stored = localStorage.getItem('simplebill_user');
        if (stored) {
            const user = JSON.parse(stored);
            if (user && (user.businessId || user.companyId)) {
                businessId = String(user.businessId || user.companyId);
            }
        }
    } catch(e) {}

    const now = Date.now();
    const key = `dashboard_reports_cache_${businessId}`;
    const raw = sessionStorage.getItem(key);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed?.timestamp && (now - parsed.timestamp) < 30000 && parsed?.data) {
                return parsed.data;
            }
        } catch {}
    }
    const data = await v3Request('/b/1/reports/dashboard');
    sessionStorage.setItem(key, JSON.stringify({ timestamp: now, data }));
    return data;
};

export const fetchFastMovingReport = async (filters: { from_date?: string; to_date?: string; page?: number; limit?: number }): Promise<any> => {
    const params = new URLSearchParams();
    if (filters.from_date) params.append('from_date', filters.from_date);
    if (filters.to_date) params.append('to_date', filters.to_date);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));
    const query = params.toString();
    return await v3Request(`/b/1/reports/fast-moving${query ? '?' + query : ''}`);
};

export const fetchSlowMovingReport = async (filters: { days_stagnant?: number; page?: number; limit?: number }): Promise<any> => {
    const params = new URLSearchParams();
    if (filters.days_stagnant) params.append('days_stagnant', String(filters.days_stagnant));
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));
    const query = params.toString();
    return await v3Request(`/b/1/reports/slow-moving${query ? '?' + query : ''}`);
};

export const fetchTopCustomersReport = async (filters: { from_date?: string; to_date?: string; page?: number; limit?: number }): Promise<any> => {
    const params = new URLSearchParams();
    if (filters.from_date) params.append('from_date', filters.from_date);
    if (filters.to_date) params.append('to_date', filters.to_date);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));
    const query = params.toString();
    return await v3Request(`/b/1/reports/top-customers${query ? '?' + query : ''}`);
};

export const fetchSupplierSpendReport = async (filters: { from_date?: string; to_date?: string; page?: number; limit?: number }): Promise<any> => {
    const params = new URLSearchParams();
    if (filters.from_date) params.append('from_date', filters.from_date);
    if (filters.to_date) params.append('to_date', filters.to_date);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));
    const query = params.toString();
    return await v3Request(`/b/1/reports/supplier-spend${query ? '?' + query : ''}`);
};

export const fetchItemProfitabilityReport = async (filters: { from_date?: string; to_date?: string; page?: number; limit?: number }): Promise<any> => {
    const params = new URLSearchParams();
    if (filters.from_date) params.append('from_date', filters.from_date);
    if (filters.to_date) params.append('to_date', filters.to_date);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));
    const query = params.toString();
    return await v3Request(`/b/1/reports/profitability/items${query ? '?' + query : ''}`);
};

export const fetchCategoryProfitabilityReport = async (filters: { from_date?: string; to_date?: string; page?: number; limit?: number }): Promise<any> => {
    const params = new URLSearchParams();
    if (filters.from_date) params.append('from_date', filters.from_date);
    if (filters.to_date) params.append('to_date', filters.to_date);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));
    const query = params.toString();
    return await v3Request(`/b/1/reports/profitability/categories${query ? '?' + query : ''}`);
};

export const fetchLowStockReport = async (filters: { page?: number; limit?: number }): Promise<any> => {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));
    const query = params.toString();
    return await v3Request(`/b/1/reports/low-stock${query ? '?' + query : ''}`);
};

export const fetchProductPurchaseHistory = async (id: number, filters?: { from_date?: string; to_date?: string }): Promise<any> => {
    const params = new URLSearchParams();
    if (filters?.from_date) params.append('from_date', filters.from_date);
    if (filters?.to_date) params.append('to_date', filters.to_date);
    const query = params.toString();
    return await v3Request(`/b/1/products/${id}/purchase-history${query ? '?' + query : ''}`);
};

export const fetchProductSalesHistory = async (id: number, filters?: { from_date?: string; to_date?: string }): Promise<any> => {
    const params = new URLSearchParams();
    if (filters?.from_date) params.append('from_date', filters.from_date);
    if (filters?.to_date) params.append('to_date', filters.to_date);
    const query = params.toString();
    return await v3Request(`/b/1/products/${id}/sales-history${query ? '?' + query : ''}`);
};

export const fetchProductPurchaseReturnHistory = async (id: number, filters?: { from_date?: string; to_date?: string }): Promise<any> => {
    const params = new URLSearchParams();
    if (filters?.from_date) params.append('from_date', filters.from_date);
    if (filters?.to_date) params.append('to_date', filters.to_date);
    const query = params.toString();
    return await v3Request(`/b/1/products/${id}/purchase-return-history${query ? '?' + query : ''}`);
};

export const fetchProductSalesReturnHistory = async (id: number, filters?: { from_date?: string; to_date?: string }): Promise<any> => {
    const params = new URLSearchParams();
    if (filters?.from_date) params.append('from_date', filters.from_date);
    if (filters?.to_date) params.append('to_date', filters.to_date);
    const query = params.toString();
    return await v3Request(`/b/1/products/${id}/sales-return-history${query ? '?' + query : ''}`);
};
