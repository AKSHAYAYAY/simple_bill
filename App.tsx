import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PublicHeader } from './components/PublicHeader';
import { Login } from './pages/Login';
import { AdminLogin } from './pages/AdminLogin';
import { AdminDashboard } from './pages/AdminDashboard';
import { Subscription } from './pages/Subscription';
import { Setup } from './pages/Setup';
import { Pricing } from './pages/Pricing';
import { Contact } from './pages/Contact';

// Lazily load named exports for maximum performance and code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Invoices = lazy(() => import('./pages/Invoices').then(m => ({ default: m.Invoices })));
const Customers = lazy(() => import('./pages/Customers').then(m => ({ default: m.Customers })));
const Suppliers = lazy(() => import('./pages/Suppliers').then(m => ({ default: m.Suppliers })));
const Inventory = lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const Purchases = lazy(() => import('./pages/Purchases').then(m => ({ default: m.Purchases })));
const SalesReturns = lazy(() => import('./pages/SalesReturns').then(m => ({ default: m.SalesReturns })));
const PurchaseReturns = lazy(() => import('./pages/PurchaseReturns').then(m => ({ default: m.PurchaseReturns })));
const Payments = lazy(() => import('./pages/Payments').then(m => ({ default: m.Payments })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Reports = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const Help = lazy(() => import('./pages/Help').then(m => ({ default: m.Help })));
const StaffManagement = lazy(() => import('./pages/StaffManagement').then(m => ({ default: m.StaffManagement })));
const CashbookExpenses = lazy(() => import('./pages/CashbookExpenses').then(m => ({ default: m.CashbookExpenses })));
const PartyLedgerPage = lazy(() => import('./pages/PartyLedgerPage').then(m => ({ default: m.PartyLedgerPage })));
const PurchaseDetail = lazy(() => import('./pages/PurchaseDetail').then(m => ({ default: m.PurchaseDetail })));
const SaleDetail = lazy(() => import('./pages/SaleDetail').then(m => ({ default: m.SaleDetail })));

import { User, AppSettings, Customer, Invoice, DEFAULT_SETTINGS, Role } from './types';
import { getSettings, fetchCustomers, fetchInvoices, initDataLayer, fetchCloudAppSettings, saveSettings, fetchBusinessSettings } from './services/dataService';
import { checkLicenseStatus } from './services/licenseService';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { BlockingLoader } from './components/BlockingLoader';

function AppContent() {
    const [user, setUser] = useState<User | null>(null);
    const [settings, setSettings] = useState<AppSettings>(getSettings());
    const [dataLayerInitialized, setDataLayerInitialized] = useState(false);
    const [isLicensed, setIsLicensed] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);
    const [sessionLoading, setSessionLoading] = useState(true);

    // Data State
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState<{ kind: string; message: string } | null>(null);

    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if ((window as any).simplebill_isDirty) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        };

        const handleInput = (e: Event) => {
            const target = e.target as HTMLElement;
            if (!target) return;
            
            const placeholder = target.getAttribute('placeholder') || '';
            const type = target.getAttribute('type') || '';
            const id = target.getAttribute('id') || '';
            const className = target.className || '';

            const isSearch = 
                placeholder.toLowerCase().includes('search') || 
                type === 'search' || 
                id.toLowerCase().includes('search') ||
                className.toLowerCase().includes('search');

            if (!isSearch && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
                (window as any).simplebill_isDirty = true;
            }
        };

        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target) return;

            if (
                target.closest('button[type="submit"]') ||
                target.closest('button')?.textContent?.toLowerCase().includes('cancel') ||
                target.closest('button')?.textContent?.toLowerCase().includes('back') ||
                target.closest('button')?.textContent?.toLowerCase().includes('save') ||
                target.closest('button')?.textContent?.toLowerCase().includes('record') ||
                target.closest('button')?.textContent?.toLowerCase().includes('create') ||
                target.closest('button')?.textContent?.toLowerCase().includes('update') ||
                target.closest('a') ||
                target.closest('[role="menuitem"]')
            ) {
                (window as any).simplebill_isDirty = false;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('input', handleInput);
        window.addEventListener('change', handleInput);
        window.addEventListener('click', handleClick);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('input', handleInput);
            window.removeEventListener('change', handleInput);
            window.removeEventListener('click', handleClick);
        };
    }, []);

    useEffect(() => {
        (window as any).simplebill_isDirty = false;
    }, [location.pathname]);

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            setNotification(detail);
            if (detail?.kind !== 'loading') {
                window.setTimeout(() => setNotification(null), 4500);
            }
        };
        window.addEventListener('simplebill:notification', handler);
        return () => window.removeEventListener('simplebill:notification', handler);
    }, []);

    const notificationLayer = notification && (
        <div className={`fixed top-5 right-5 z-[100] max-w-sm rounded-2xl border px-5 py-4 shadow-2xl font-bold text-sm ${
            notification.kind === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
            notification.kind === 'duplicate' ? 'bg-orange-50 text-orange-800 border-orange-200' :
            notification.kind === 'loading' ? 'bg-white text-slate-800 border-slate-200' :
            'bg-red-50 text-red-800 border-red-200'
        }`}>
            {notification.message}
        </div>
    );

    // Check for admin route (hidden)
    const isAdminPath = window.location.search.includes('?admin') || window.location.hash === '#admin';

    // 1. License Check
    useEffect(() => {
        const status = checkLicenseStatus(settings.license);
        const valid = status === 'ACTIVE';
        setIsLicensed(valid);
    }, [settings.license]);

    // 2. Data Layer Init & Session Restoration
    useEffect(() => {
        const restoreSession = async () => {
            // Skip auto-restore for admin path — admin has its own login flow
            if (isAdminPath) {
                setSessionLoading(false);
                return;
            }
            try {
                // Ensure data source directories exist, etc.
                await initDataLayer(settings);

                if (settings.dataSource === 'MYSQL' || settings.dataSource === 'CLOUD_MYSQL') {
                    // Check if saved access_token is still valid before restoring session
                    const savedToken = localStorage.getItem('access_token');
                    if (savedToken) {
                        try {
                            const tokenParts = savedToken.split('.');
                            if (tokenParts.length === 3) {
                                const payload = JSON.parse(atob(tokenParts[1]));
                                if (payload.exp && Date.now() >= payload.exp * 1000) {
                                    // Token is expired — clear everything and force re-login
                                    localStorage.removeItem('simplebill_user');
                                    localStorage.removeItem('business_id');
                                    localStorage.removeItem('access_token');
                                    localStorage.removeItem('refresh_token');
                                    setDataLayerInitialized(true);
                                    return;
                                }
                            }
                        } catch {
                            // Malformed token — clear and force re-login
                            localStorage.removeItem('simplebill_user');
                            localStorage.removeItem('business_id');
                            localStorage.removeItem('access_token');
                            localStorage.removeItem('refresh_token');
                            setDataLayerInitialized(true);
                            return;
                        }
                    }

                    // Try to restore user session
                    const savedUser = localStorage.getItem('simplebill_user');
                    if (savedUser) {
                        const restoredUser = JSON.parse(savedUser);
                        setUser(restoredUser);

                        // Sync cloud settings — if User2 has no cloud settings, reset tenant fields to defaults
                        const cloudSettings = await fetchCloudAppSettings();
                        if (cloudSettings) {
                            let merged = { ...settings, ...cloudSettings };
                            if (restoredUser.role !== Role.SUPER_ADMIN) {
                                const bSettings = await fetchBusinessSettings();
                                if (bSettings) {
                                    merged = {
                                        ...merged,
                                        companyName: bSettings.business_name || merged.companyName,
                                        companyGstin: bSettings.gst_number || merged.companyGstin,
                                        taxDisplayMode: bSettings.tax_display_mode,
                                        showTaxOnInvoice: !!bSettings.show_tax_on_invoice,
                                        gstType: bSettings.gst_type,
                                        defaultCgstRate: bSettings.default_cgst_rate,
                                        defaultSgstRate: bSettings.default_sgst_rate,
                                        defaultIgstRate: bSettings.default_igst_rate,
                                        defaultSaleTaxMode: bSettings.default_sale_tax_mode,
                                        allowNegativeStock: !!bSettings.allow_negative_stock,
                                        allowNegativeSelling: !!bSettings.allow_negative_selling,
                                        lowStockLimit: bSettings.low_stock_limit,
                                        roundOffInvoice: !!bSettings.round_off_invoice
                                    };
                                }
                            }
                            setSettings(merged);
                            await saveSettings(merged, true); // skipCloudSync: just caching cloud data locally
                        } else {
                            // No cloud settings for this license — reset tenant-specific fields to defaults
                            const cleanSettings: AppSettings = {
                                ...settings,
                                companyName: DEFAULT_SETTINGS.companyName,
                                companyGstin: DEFAULT_SETTINGS.companyGstin,
                                logoUrl: DEFAULT_SETTINGS.logoUrl,
                                currency: DEFAULT_SETTINGS.currency,
                                countryCode: DEFAULT_SETTINGS.countryCode,
                                invoicePrefix: DEFAULT_SETTINGS.invoicePrefix,
                                invoiceHeader: DEFAULT_SETTINGS.invoiceHeader,
                                invoiceFooter: DEFAULT_SETTINGS.invoiceFooter,
                                terms: DEFAULT_SETTINGS.terms,
                                enableDateTime: DEFAULT_SETTINGS.enableDateTime,
                                taxRate: DEFAULT_SETTINGS.taxRate,
                            };
                            setSettings(cleanSettings);
                            await saveSettings(cleanSettings, true); // skipCloudSync: just cleaning local cache
                        }

                        // Pre-fetch data so dashboard renders immediately with real numbers
                        try {
                            const [c, i] = await Promise.all([fetchCustomers(true), fetchInvoices(true)]);
                            setCustomers(c || []);
                            setInvoices(i || []);
                        } catch (_dataErr) {
                            // Non-fatal: data will be retried by the loadData effect
                        }
                    } else {
                        // Saved session is stale — clear it
                        localStorage.removeItem('simplebill_user');
                        localStorage.removeItem('business_id');
                        localStorage.removeItem('access_token');
                        localStorage.removeItem('refresh_token');
                        localStorage.removeItem('user_email');
                    }
                } else if (settings.dataSource === 'INDEXED_DB') {
                    const savedUser = localStorage.getItem('simplebill_user');
                    if (savedUser) {
                        setUser(JSON.parse(savedUser));
                    }
                }

                setDataLayerInitialized(true);
            } catch (err: any) {
                setInitError(err.message);
            } finally {
                setSessionLoading(false);
            }
        };

        restoreSession();
    }, [settings.dataSource, settings.apiKey, settings.clientId, isLicensed, settings.isConfigured, settings.license.key]);

    // 3. Data Loading
    useEffect(() => {
        if (user && user.role !== Role.SUPER_ADMIN && dataLayerInitialized && isLicensed && settings.isConfigured) {
            loadData();
        }
    }, [user?.email, dataLayerInitialized, settings.dataSource, isLicensed, settings.isConfigured, user?.role]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [c, i] = await Promise.all([fetchCustomers(), fetchInvoices()]);
            setCustomers(c || []);
            setInvoices(i || []);
        } catch (e: any) {
            setInitError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async (u: User, updatedSettings?: AppSettings) => {
        setUser(u);
        localStorage.setItem('simplebill_user', JSON.stringify(u));
        if (u?.companyId) localStorage.setItem('business_id', String(u.companyId));
        if (updatedSettings) {
            setSettings(updatedSettings);
        }
        
        navigate('/dashboard');

        // Re-initialize data layer, fetch cloud settings, and load data after login
        if (u.role !== Role.SUPER_ADMIN) {
            try {
                const currentSettings = updatedSettings || settings;
                await initDataLayer(currentSettings);
                setDataLayerInitialized(true);

                // CRITICAL: Fetch this user's cloud settings to prevent cross-contamination
                const cloudSettings = await fetchCloudAppSettings();
                if (cloudSettings) {
                    let merged: AppSettings = { ...currentSettings, ...cloudSettings };
                    const bSettings = await fetchBusinessSettings();
                    if (bSettings) {
                        merged = {
                            ...merged,
                            companyName: bSettings.business_name || merged.companyName,
                            companyGstin: bSettings.gst_number || merged.companyGstin,
                            taxDisplayMode: bSettings.tax_display_mode,
                            showTaxOnInvoice: !!bSettings.show_tax_on_invoice,
                            gstType: bSettings.gst_type,
                            defaultCgstRate: bSettings.default_cgst_rate,
                            defaultSgstRate: bSettings.default_sgst_rate,
                            defaultIgstRate: bSettings.default_igst_rate,
                            defaultSaleTaxMode: bSettings.default_sale_tax_mode,
                            allowNegativeStock: !!bSettings.allow_negative_stock,
                            allowNegativeSelling: !!bSettings.allow_negative_selling,
                            lowStockLimit: bSettings.low_stock_limit,
                            roundOffInvoice: !!bSettings.round_off_invoice
                        };
                    }
                    setSettings(merged);
                    await saveSettings(merged, true); // skipCloudSync: just caching cloud data locally
                } else {
                    // New user with no cloud settings yet — reset tenant display fields to defaults
                    const cleanSettings: AppSettings = {
                        ...currentSettings,
                        companyName: DEFAULT_SETTINGS.companyName,
                        companyGstin: DEFAULT_SETTINGS.companyGstin,
                        logoUrl: DEFAULT_SETTINGS.logoUrl,
                        currency: DEFAULT_SETTINGS.currency,
                        countryCode: DEFAULT_SETTINGS.countryCode,
                        invoicePrefix: DEFAULT_SETTINGS.invoicePrefix,
                        invoiceHeader: DEFAULT_SETTINGS.invoiceHeader,
                        invoiceFooter: DEFAULT_SETTINGS.invoiceFooter,
                        terms: DEFAULT_SETTINGS.terms,
                        enableDateTime: DEFAULT_SETTINGS.enableDateTime,
                        taxRate: DEFAULT_SETTINGS.taxRate,
                        defaultCgstRate: DEFAULT_SETTINGS.defaultCgstRate,
                        defaultSgstRate: DEFAULT_SETTINGS.defaultSgstRate,
                        defaultIgstRate: DEFAULT_SETTINGS.defaultIgstRate,
                        defaultSaleTaxMode: DEFAULT_SETTINGS.defaultSaleTaxMode,
                        allowNegativeStock: DEFAULT_SETTINGS.allowNegativeStock,
                        allowNegativeSelling: DEFAULT_SETTINGS.allowNegativeSelling,
                        lowStockLimit: DEFAULT_SETTINGS.lowStockLimit,
                        roundOffInvoice: DEFAULT_SETTINGS.roundOffInvoice
                    };
                    setSettings(cleanSettings);
                    await saveSettings(cleanSettings, true); // skipCloudSync: don't overwrite cloud with defaults
                }

                const [c, i] = await Promise.all([fetchCustomers(true), fetchInvoices(true)]);
                setCustomers(c || []);
                setInvoices(i || []);
            } catch (e: any) {
                setInitError(e.message);
            }
        }
    };

    const handleLogout = () => {
        setUser(null);
        setCustomers([]);
        setInvoices([]);
        setInitError(null);
        setDataLayerInitialized(false);
        localStorage.removeItem('simplebill_user');
        localStorage.removeItem('business_id');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_email');

        const cleanSettings: AppSettings = {
            ...settings,
            companyName: DEFAULT_SETTINGS.companyName,
            companyGstin: DEFAULT_SETTINGS.companyGstin,
            logoUrl: DEFAULT_SETTINGS.logoUrl,
            currency: DEFAULT_SETTINGS.currency,
            countryCode: DEFAULT_SETTINGS.countryCode,
            invoicePrefix: DEFAULT_SETTINGS.invoicePrefix,
            invoiceHeader: DEFAULT_SETTINGS.invoiceHeader,
            invoiceFooter: DEFAULT_SETTINGS.invoiceFooter,
            terms: DEFAULT_SETTINGS.terms,
            enableDateTime: DEFAULT_SETTINGS.enableDateTime,
            taxRate: DEFAULT_SETTINGS.taxRate,
            defaultCgstRate: DEFAULT_SETTINGS.defaultCgstRate,
            defaultSgstRate: DEFAULT_SETTINGS.defaultSgstRate,
            defaultIgstRate: DEFAULT_SETTINGS.defaultIgstRate,
            defaultSaleTaxMode: DEFAULT_SETTINGS.defaultSaleTaxMode,
            allowNegativeStock: DEFAULT_SETTINGS.allowNegativeStock,
            allowNegativeSelling: DEFAULT_SETTINGS.allowNegativeSelling,
            lowStockLimit: DEFAULT_SETTINGS.lowStockLimit,
            roundOffInvoice: DEFAULT_SETTINGS.roundOffInvoice
        };
        setSettings(cleanSettings);
        void saveSettings(cleanSettings, true); // skipCloudSync: just cleaning local cache on logout
        navigate('/');
    };

    const handleUpdateUser = (updatedUser: User) => {
        setUser(updatedUser);
        localStorage.setItem('simplebill_user', JSON.stringify(updatedUser));
        if (updatedUser?.companyId) localStorage.setItem('business_id', String(updatedUser.companyId));
    };

    const handleViewLedger = (partyId: string, partyType: 'Customer' | 'Supplier') => {
        navigate(`/party/${partyId}?type=${partyType}`);
    };

    // ADMIN OVERRIDE
    if (user?.role === Role.SUPER_ADMIN) {
        return <AdminDashboard />;
    }

    // Admin Login Gateway
    if (isAdminPath && !user) {
        return <AdminLogin onLogin={(u) => handleLogin(u)} />;
    }

    if (sessionLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-500 font-medium">Restoring secure session...</p>
            </div>
        );
    }

    const renderPrivateView = () => {
        if (!isLicensed) {
            return (
                <div className="min-h-screen bg-gray-50 pt-16">
                    <Subscription settings={settings} onActivation={(newSettings) => setSettings(newSettings)} onNavigate={(p) => navigate(p === 'home' ? '/' : '/' + p)} />
                </div>
            );
        }

        if (!settings.isConfigured) {
            return (
                <div className="min-h-screen bg-gray-50 pt-16">
                    <Setup settings={settings} onComplete={(newSettings) => setSettings(newSettings)} />
                </div>
            );
        }

        if (initError) {
            return (
                <Layout user={user!} onLogout={handleLogout}>
                    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 bg-white rounded-xl border border-red-100 shadow-sm">
                        <div className="bg-red-50 p-4 rounded-full text-red-600 mb-4">
                            <AlertTriangle size={48} />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Sync Error</h2>
                        <p className="text-gray-600 mb-6 max-w-md">{initError}</p>
                        <div className="flex flex-wrap justify-center gap-4">
                            <button onClick={() => window.location.reload()} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium shadow-md transition-all active:scale-95">
                                <RefreshCcw size={18} /> Retry Connection
                            </button>
                            <button onClick={() => navigate('/settings')} className="bg-white border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50 font-medium">
                                Edit Credentials
                            </button>
                        </div>
                    </div>
                </Layout>
            );
        }

        return (
            <Suspense fallback={
                <div className="flex h-full items-center justify-center min-h-[400px]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            }>
                <Routes>
                    <Route element={<Layout user={user!} onLogout={handleLogout} />}>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/dashboard" element={<Dashboard invoices={invoices} user={user!} settings={settings} />} />
                        <Route path="/invoices" element={<Invoices invoices={invoices} customers={customers} settings={settings} onRefresh={loadData} />} />
                        <Route path="/sales/:saleId" element={<SaleDetail />} />
                        <Route path="/customers" element={<Customers settings={settings} onRefresh={loadData} onViewLedger={handleViewLedger} />} />
                        <Route path="/suppliers" element={<Suppliers onViewLedger={handleViewLedger} />} />
                        <Route path="/inventory" element={<Inventory />} />
                        <Route path="/purchases" element={<Purchases />} />
                        <Route path="/purchases/:purchaseId" element={<PurchaseDetail />} />
                        <Route path="/sales-returns" element={<SalesReturns />} />
                        <Route path="/purchase-returns" element={<PurchaseReturns />} />
                        <Route path="/payments" element={<Payments onViewLedger={handleViewLedger} />} />
                        <Route path="/party/:partyId" element={<PartyLedgerPage />} />
                        <Route path="/cashbook" element={<CashbookExpenses />} />
                        <Route path="/settings" element={<Settings settings={settings} onUpdate={setSettings} />} />
                        <Route path="/staff" element={<StaffManagement />} />
                        <Route path="/reports" element={<Reports invoices={invoices} settings={settings} />} />
                        <Route path="/profile" element={<Profile user={user!} settings={settings} onUpdate={handleUpdateUser} />} />
                        <Route path="/help" element={<Help />} />
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Route>
                </Routes>
            </Suspense>
        );
    };

    if (!user) {
        return (
            <div className="min-h-screen bg-gray-50">
                {notificationLayer}
                <BlockingLoader />
                <PublicHeader activePage="" onNavigate={(p) => navigate(p === 'home' ? '/' : '/' + p)} />
                <div className="pt-16">
                    <Routes>
                        <Route path="/" element={<Login onLogin={handleLogin} settings={settings} />} />
                        <Route path="/pricing" element={<Pricing onSelectPlan={() => navigate('/')} />} />
                        <Route path="/contact" element={<Contact />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </div>
            </div>
        );
    }

    return (
        <>
            {notificationLayer}
            <BlockingLoader />
            {renderPrivateView()}
        </>
    );
}

import { AppProvider } from './context/AppContext';

export const App: React.FC = () => {
    return (
        <BrowserRouter>
            <AppProvider>
                <AppContent />
            </AppProvider>
        </BrowserRouter>
    );
};

export default App;
