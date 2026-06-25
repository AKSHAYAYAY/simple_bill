import React, { useState, useEffect, useMemo } from 'react';
import { Invoice, AppSettings, InvoiceStatus, COUNTRIES } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
    Calendar, Download, FileText, PieChart, Table, Filter, ArrowUpRight,
    AlertTriangle, TrendingUp, TrendingDown, Search, RefreshCw, X,
    ChevronLeft, ChevronRight, Info, Layers, IndianRupee, Users,
    ShoppingBag, Truck, Percent, FileDown, Eye, ReceiptIndianRupee
} from 'lucide-react';
import { formatINR } from '../utils/currency';
import { calculateInvoiceStats } from '../utils/financialCalculations';
import {
    fetchFastMovingReport,
    fetchSlowMovingReport,
    fetchTopCustomersReport,
    fetchSupplierSpendReport,
    fetchItemProfitabilityReport,
    fetchCategoryProfitabilityReport,
    fetchLowStockReport,
    fetchProductPurchaseHistory,
    fetchProductSalesHistory,
    fetchProductPurchaseReturnHistory,
    fetchProductSalesReturnHistory,
    fetchPurchases
} from '../services/dataService';

interface ReportsProps {
    invoices: Invoice[];
    settings: AppSettings;
}

type TabType = 'overview' | 'fast-moving' | 'slow-moving' | 'top-customers' | 'supplier-spend' | 'item-profitability' | 'category-profitability' | 'low-stock';

export const Reports: React.FC<ReportsProps> = ({ invoices, settings }) => {
    const currentCountry = COUNTRIES.find(c => c.code === settings.countryCode) || COUNTRIES[0];
    const isNonGST = settings.gstType === 'NON_GST';

    // Main Active Tab
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    // Date range filters for API reports
    const [dateRange, setDateRange] = useState(() => {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1); // 1st day of month
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0); // Last day of month
        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
        };
    });

    // Preset selection tracker (for showing visual active state in presets)
    const [presetType, setPresetType] = useState<'thisMonth' | 'lastMonth' | 'thisFY' | 'custom'>('thisMonth');

    // Executed filters (Pre-fetched rolling vs run action)
    const [executedDates, setExecutedDates] = useState({
        start: '',
        end: ''
    });

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(10);
    const [totalRecords, setTotalRecords] = useState(0);

    // Common states
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [reportData, setReportData] = useState<any[]>([]);

    // Specific report state overrides
    const [daysStagnant, setDaysStagnant] = useState(settings.deadStockDays !== undefined ? Number(settings.deadStockDays) : 365);

    // Modal / Detail drawer states
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailTab, setDetailTab] = useState<'purchases' | 'sales' | 'purchase-returns' | 'sales-returns'>('purchases');
    const [detailHistory, setDetailHistory] = useState<{
        purchases?: any[];
        sales?: any[];
        purchaseReturns?: any[];
        salesReturns?: any[];
    }>({});

    // Formatting currency
    const formatCurrency = (val: number) => {
        return formatINR(val);
    };
    const formatPercent = (val: any) => {
        if (val === null || val === undefined) return '—';
        const num = Number(val);
        return Number.isFinite(num) ? `${num}%` : '—';
    };

    // Preset Date Ranges Handler
    const setPresetRange = (type: 'thisMonth' | 'lastMonth' | 'thisFY') => {
        const today = new Date();
        let start, end;

        if (type === 'thisMonth') {
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        } else if (type === 'lastMonth') {
            start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
        } else { // This FY
            const fyStartMonth = currentCountry.fyStartMonth - 1;
            const currentYear = today.getFullYear();
            const startYear = today.getMonth() < fyStartMonth ? currentYear - 1 : currentYear;
            start = new Date(startYear, fyStartMonth, 1);
            end = new Date(startYear + 1, fyStartMonth, 0);
        }

        const newStart = start.toISOString().split('T')[0];
        const newEnd = end.toISOString().split('T')[0];

        setDateRange({ start: newStart, end: newEnd });
        setPresetType(type);
    };

    // Load data for the active report tab
    const loadReportData = async (useExecuted = false) => {
        setLoading(true);
        try {
            const start = useExecuted ? dateRange.start : '';
            const end = useExecuted ? dateRange.end : '';

            // Set executed date trackers for user information
            setExecutedDates({ start, end });

            let result: any = { data: [], pagination: { total: 0 } };

            switch (activeTab) {
                case 'fast-moving':
                    result = await fetchFastMovingReport({
                        from_date: start || undefined,
                        to_date: end || undefined,
                        page: currentPage,
                        limit: pageSize
                    });
                    break;
                case 'slow-moving':
                    result = await fetchSlowMovingReport({
                        days_stagnant: daysStagnant,
                        page: currentPage,
                        limit: pageSize
                    });
                    break;
                case 'top-customers':
                    result = await fetchTopCustomersReport({
                        from_date: start || undefined,
                        to_date: end || undefined,
                        page: currentPage,
                        limit: pageSize
                    });
                    break;
                case 'supplier-spend':
                    result = await fetchSupplierSpendReport({
                        from_date: start || undefined,
                        to_date: end || undefined,
                        page: currentPage,
                        limit: pageSize
                    });
                    break;
                case 'item-profitability':
                    result = await fetchItemProfitabilityReport({
                        from_date: start || undefined,
                        to_date: end || undefined,
                        page: currentPage,
                        limit: pageSize
                    });
                    break;
                case 'category-profitability':
                    result = await fetchCategoryProfitabilityReport({
                        from_date: start || undefined,
                        to_date: end || undefined,
                        page: currentPage,
                        limit: pageSize
                    });
                    break;
                case 'low-stock':
                    result = await fetchLowStockReport({
                        page: currentPage,
                        limit: pageSize
                    });
                    break;
                default:
                    break;
            }

            setReportData(result?.rows || []);
            setTotalRecords(result?.pagination?.total || 0);
        } catch (e: any) {
            console.error("Failed to load report", e);
        } finally {
            setLoading(false);
        }
    };

    // Trigger run report manually
    const handleRunReport = () => {
        setCurrentPage(1);
        loadReportData(true);
    };

    // Trigger clear filters manually
    const handleClearFilters = () => {
        setDateRange(() => {
            const today = new Date();
            const start = new Date(today.getFullYear(), today.getMonth(), 1);
            const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            return {
                start: start.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0]
            };
        });
        setPresetType('thisMonth');
        setDaysStagnant(settings.deadStockDays !== undefined ? Number(settings.deadStockDays) : 365);
        setCurrentPage(1);
        // Timeout to ensure state updates before loading data without executed parameter (returns default snap)
        setTimeout(() => {
            loadReportData(false);
        }, 50);
    };

    // Automatically load data when tab changes or page changes
    useEffect(() => {
        if (activeTab !== 'overview') {
            loadReportData(!!executedDates.start);
        }
    }, [activeTab, currentPage]);

    // Handle lazy load detail history
    const loadDetailHistory = async (itemId: number) => {
        setDetailLoading(true);
        try {
            const filters = {
                from_date: executedDates.start || undefined,
                to_date: executedDates.end || undefined
            };

            const [purchases, sales, purchaseReturns, salesReturns] = await Promise.all([
                fetchProductPurchaseHistory(itemId, filters).catch(() => ({ data: [] })),
                fetchProductSalesHistory(itemId, filters).catch(() => ({ data: [] })),
                fetchProductPurchaseReturnHistory(itemId, filters).catch(() => ({ data: [] })),
                fetchProductSalesReturnHistory(itemId, filters).catch(() => ({ data: [] }))
            ]);

            setDetailHistory({
                purchases: Array.isArray(purchases) ? purchases : (purchases?.data || []),
                sales: Array.isArray(sales) ? sales : (sales?.data || []),
                purchaseReturns: Array.isArray(purchaseReturns) ? purchaseReturns : (purchaseReturns?.data || []),
                salesReturns: Array.isArray(salesReturns) ? salesReturns : (salesReturns?.data || [])
            });
        } catch (e) {
            console.error("Failed loading detail history logs", e);
        } finally {
            setDetailLoading(false);
        }
    };

    // Handle clicking a row for drilldown contexts
    const handleRowClick = async (item: any) => {
        setSelectedItem(item);
        setDetailTab('purchases');
        setDetailHistory({});

        // Depending on report, load deep dive metrics
        if (activeTab === 'fast-moving' || activeTab === 'item-profitability' || activeTab === 'slow-moving') {
            const productId = item.product_id;
            if (productId) {
                await loadDetailHistory(productId);
            }
        } else if (activeTab === 'top-customers') {
            // Fetch party ledger invoices dynamically or filter client side
            setDetailLoading(true);
            try {
                const customerId = item.customer_id;
                // Query sales invoices of this customer
                const filteredInvs = invoices.filter(inv => String(inv.customerId) === String(customerId));
                setDetailHistory({ sales: filteredInvs });
            } catch (e) {
                console.error("Customer ledger query error", e);
            } finally {
                setDetailLoading(false);
            }
        } else if (activeTab === 'supplier-spend') {
            setDetailLoading(true);
            try {
                const supplierId = item.supplier_id;
                const result = await fetchPurchases({ supplier_id: supplierId });
                const purchasesList = Array.isArray(result) ? result : ((result as any)?.data || []);
                setDetailHistory({ purchases: purchasesList });
            } catch (e) {
                console.error("Supplier spend drilldown error", e);
            } finally {
                setDetailLoading(false);
            }
        }
    };

    // CSV Exporters
    const exportCSV = (data: any[], headers: string[], mapper: (row: any) => any[], filename: string) => {
        const rows = data.map(mapper);
        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(cell => {
                const cellStr = String(cell || '');
                return cellStr.includes(',') ? `"${cellStr.replace(/"/g, '""')}"` : cellStr;
            }).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportSalesRegister = () => {
        exportCSV(
            filteredInvoices,
            ['Date', 'Invoice #', 'Customer ID', 'Subtotal', 'Tax', 'Total', 'Status'],
            inv => [inv.date, inv.id, inv.customerId, inv.subtotal, inv.tax, inv.total, inv.status],
            `sales_report_${dateRange.start}_${dateRange.end}.csv`
        );
    };

    const handleExportActiveReport = () => {
        if (reportData.length === 0) return;
        const nowStr = new Date().toISOString().split('T')[0];

        switch (activeTab) {
            case 'fast-moving':
                exportCSV(
                    reportData,
                    ['Product ID', 'Product Name', 'Code', 'Barcode', 'Quantity Sold', 'Stock Balance', 'Purchase Cost', 'Retail Price', 'Gross Margin %'],
                    row => [row.product_id, row.product_name, row.product_code, row.barcode, row.total_quantity_sold, row.current_stock, row.purchase_price, row.selling_price, row.gross_margin_percentage],
                    `fast_moving_report_${nowStr}.csv`
                );
                break;
            case 'slow-moving':
                exportCSV(
                    reportData,
                    ['Product ID', 'Product Name', 'Code', 'Stock Balance', 'Purchase Price', 'Selling Price', 'Days Stagnant'],
                    row => [row.product_id, row.product_name, row.product_code, row.current_stock, row.purchase_price, row.selling_price, row.days_since_last_sale],
                    `slow_moving_report_${nowStr}.csv`
                );
                break;
            case 'top-customers':
                exportCSV(
                    reportData,
                    ['Customer ID', 'Customer Name', 'Company Name', 'Phone', 'Total Invoiced Value', 'Invoice Count'],
                    row => [row.customer_id, row.customer_name, row.company_name, row.phone, row.total_sales_value, row.total_invoices],
                    `top_customers_report_${nowStr}.csv`
                );
                break;
            case 'supplier-spend':
                exportCSV(
                    reportData,
                    ['Supplier ID', 'Supplier Name', 'Company', 'GSTIN', 'Total Sourcing Value', 'Invoice Count'],
                    row => [row.supplier_id, row.supplier_name, row.company_name, row.gst_number, row.total_spend_value, row.total_invoices],
                    `supplier_spend_report_${nowStr}.csv`
                );
                break;
            case 'item-profitability':
                exportCSV(
                    reportData,
                    ['Product ID', 'Product Name', 'Quantity Sold', 'Cost Basis', 'Revenue Basis', 'Gross Profit', 'Margin %'],
                    row => [row.product_id, row.product_name, row.total_quantity_sold, row.total_cost, row.total_revenue, row.gross_profit, row.margin_percentage],
                    `item_profitability_report_${nowStr}.csv`
                );
                break;
            case 'category-profitability':
                exportCSV(
                    reportData,
                    ['Category ID', 'Category Name', 'Units Sold', 'Total Cost Value', 'Total Revenue Value', 'Gross Margin Profit', 'Margin %'],
                    row => [row.category_id, row.category_name, row.total_quantity_sold, row.total_cost, row.total_revenue, row.gross_profit, row.margin_percentage],
                    `category_profitability_report_${nowStr}.csv`
                );
                break;
            case 'low-stock':
                exportCSV(
                    reportData,
                    ['Product ID', 'Product Name', 'Barcode', 'Minimum Alert Stock', 'Current Stock Balance', 'Deficit Quantity'],
                    row => [row.product_id, row.product_name, row.barcode, row.low_stock_limit, row.current_stock, row.deficit_quantity],
                    `low_stock_alert_report_${nowStr}.csv`
                );
                break;
            default:
                break;
        }
    };

    // Overview data computations (Preserved and augmented)
    const filteredInvoices = useMemo(() => {
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        end.setHours(23, 59, 59, 999);

        return invoices.filter(inv => {
            if (inv.status === InvoiceStatus.DELETED) return false;
            const d = new Date(inv.date);
            return d >= start && d <= end;
        });
    }, [invoices, dateRange]);

    const stats = useMemo(() => {
        const invStats = calculateInvoiceStats(filteredInvoices, settings);

        const chartDataMap = new Map<string, { sales: number, tax: number }>();
        filteredInvoices.forEach(inv => {
            const d = new Date(inv.date);
            const dayDiff = (new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime()) / (1000 * 3600 * 24);

            const key = dayDiff < 32
                ? d.toLocaleDateString('default', { day: 'numeric', month: 'short' })
                : d.toLocaleDateString('default', { month: 'short', year: '2-digit' });

            const cur = chartDataMap.get(key) || { sales: 0, tax: 0 };
            const taxVal = settings.gstType === 'NON_GST' ? 0 : (Number(inv.tax) || 0);
            chartDataMap.set(key, { sales: cur.sales + Number(inv.total), tax: cur.tax + taxVal });
        });

        const chartData = Array.from(chartDataMap.entries()).map(([name, val]) => ({
            name,
            sales: val.sales,
            tax: val.tax
        }));

        return {
            totalSales: invStats.totalSales,
            totalTax: invStats.totalTax,
            totalTaxable: invStats.totalTaxable,
            paidAmount: invStats.totalRevenue,
            pendingAmount: invStats.pendingAmount,
            invoiceCount: filteredInvoices.length,
            chartData
        };
    }, [filteredInvoices, dateRange, settings]);

    const taxSummary = useMemo(() => {
        const summary = new Map<number, { taxable: number, tax: number }>();

        filteredInvoices.forEach(inv => {
            inv.items.forEach(item => {
                const current = summary.get(item.taxRate) || { taxable: 0, tax: 0 };
                const itemTotal = item.price * item.quantity;
                const itemTax = itemTotal * (item.taxRate / 100);

                summary.set(item.taxRate, {
                    taxable: current.taxable + itemTotal,
                    tax: current.tax + itemTax
                });
            });
        });

        return Array.from(summary.entries())
            .map(([rate, vals]) => ({ rate, ...vals }))
            .sort((a, b) => a.rate - b.rate);
    }, [filteredInvoices]);

    // Local Search Filtering for rendered tables
    const filteredReportData = useMemo(() => {
        if (!searchQuery.trim()) return reportData;
        const query = searchQuery.toLowerCase().trim();
        return reportData.filter(row => {
            return (
                String(row.product_name || '').toLowerCase().includes(query) ||
                String(row.product_code || '').toLowerCase().includes(query) ||
                String(row.barcode || '').toLowerCase().includes(query) ||
                String(row.customer_name || '').toLowerCase().includes(query) ||
                String(row.supplier_name || '').toLowerCase().includes(query) ||
                String(row.category_name || '').toLowerCase().includes(query) ||
                String(row.company_name || '').toLowerCase().includes(query)
            );
        });
    }, [reportData, searchQuery]);

    return (
        <div className="space-y-6 pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* STUNNING PREMIUM PANEL HEADER */}
            <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 rounded-2xl shadow-xl border border-indigo-900/50 text-white animate-in fade-in duration-300">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.18),rgba(255,255,255,0))]"></div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-300">
                            <Layers size={12} className="animate-pulse" /> MODULE 22 ANALYTICS
                        </div>
                        <h2 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-indigo-200">
                            Advanced Reports Panels
                        </h2>
                        <p className="text-indigo-200/70 text-sm max-w-2xl font-medium">
                            Synthesized real-time ledger intelligence, category margin structures, and inventory velocity panels for multi-tenant retail operations.
                        </p>
                    </div>

                    {/* Pre-fetched snap vs Active Date range run triggers */}
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => setPresetRange('thisMonth')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${presetType === 'thisMonth' ? 'bg-white text-indigo-950 shadow-md scale-105' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                        >
                            This Month
                        </button>
                        <button
                            onClick={() => setPresetRange('lastMonth')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${presetType === 'lastMonth' ? 'bg-white text-indigo-950 shadow-md scale-105' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                        >
                            Last Month
                        </button>
                        <button
                            onClick={() => setPresetRange('thisFY')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${presetType === 'thisFY' ? 'bg-white text-indigo-950 shadow-md scale-105' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                        >
                            This FY
                        </button>
                    </div>
                </div>

                {/* DATE SELECTOR BAR */}
                <div className="relative z-10 mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 items-end gap-4 p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md">
                    <div>
                        <label className="block text-[11px] font-bold tracking-wider text-indigo-200 uppercase mb-1.5">Start Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 text-indigo-300" size={16} />
                            <input
                                type="date"
                                className="w-full pl-10 pr-3 py-2 bg-indigo-950/40 border border-indigo-800/40 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                value={dateRange.start}
                                onChange={e => {
                                    setDateRange({ ...dateRange, start: e.target.value });
                                    setPresetType('custom');
                                }}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold tracking-wider text-indigo-200 uppercase mb-1.5">End Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 text-indigo-300" size={16} />
                            <input
                                type="date"
                                className="w-full pl-10 pr-3 py-2 bg-indigo-950/40 border border-indigo-800/40 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                value={dateRange.end}
                                onChange={e => {
                                    setDateRange({ ...dateRange, end: e.target.value });
                                    setPresetType('custom');
                                }}
                            />
                        </div>
                    </div>

                    {activeTab === 'slow-moving' ? (
                        <div>
                            <label className="block text-[11px] font-bold tracking-wider text-indigo-200 uppercase mb-1.5">Days Stagnant</label>
                            <input
                                type="text" inputMode="decimal"
                                className="w-full px-3 py-2 bg-indigo-950/40 border border-indigo-800/40 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                value={daysStagnant}
                                onChange={e => setDaysStagnant(Number(e.target.value))}
                                min={30}
                            />
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-indigo-200/80 text-xs py-2">
                            <Info size={16} className="text-indigo-400 flex-shrink-0" />
                            <span>
                                {executedDates.start ? `Run Active: ${executedDates.start} to ${executedDates.end}` : 'Default snapshot: Current Month'}
                            </span>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={handleRunReport}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
                        >
                            <RefreshCw size={15} /> Run Report
                        </button>
                        <button
                            onClick={handleClearFilters}
                            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-indigo-100 rounded-lg text-sm font-bold transition-all"
                            title="Reset filters"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            </div>

            {/* TAB SELECTOR LIST */}
            <div className="flex space-x-1.5 bg-slate-100 p-1.5 rounded-xl overflow-x-auto shadow-inner border border-slate-200/60 scrollbar-none">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'overview' ? 'bg-white shadow text-indigo-600 scale-105' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
                >
                    <PieChart size={14} /> Overview & Sales
                </button>
                <button
                    onClick={() => { setActiveTab('fast-moving'); setCurrentPage(1); }}
                    className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'fast-moving' ? 'bg-white shadow text-indigo-600 scale-105' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
                >
                    <TrendingUp size={14} /> Fast Moving Items
                </button>
                <button
                    onClick={() => { setActiveTab('slow-moving'); setCurrentPage(1); }}
                    className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'slow-moving' ? 'bg-white shadow text-indigo-600 scale-105' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
                >
                    <TrendingDown size={14} /> Slow / Dead Stock
                </button>
                <button
                    onClick={() => { setActiveTab('top-customers'); setCurrentPage(1); }}
                    className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'top-customers' ? 'bg-white shadow text-indigo-600 scale-105' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
                >
                    <Users size={14} /> Top Customers
                </button>
                <button
                    onClick={() => { setActiveTab('supplier-spend'); setCurrentPage(1); }}
                    className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'supplier-spend' ? 'bg-white shadow text-indigo-600 scale-105' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
                >
                    <Truck size={14} /> Supplier Spend
                </button>
                <button
                    onClick={() => { setActiveTab('item-profitability'); setCurrentPage(1); }}
                    className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'item-profitability' ? 'bg-white shadow text-indigo-600 scale-105' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
                >
                    <IndianRupee size={14} /> Item Profitability
                </button>
                <button
                    onClick={() => { setActiveTab('category-profitability'); setCurrentPage(1); }}
                    className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'category-profitability' ? 'bg-white shadow text-indigo-600 scale-105' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
                >
                    <Layers size={14} /> Category Margin
                </button>
                <button
                    onClick={() => { setActiveTab('low-stock'); setCurrentPage(1); }}
                    className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'low-stock' ? 'bg-white shadow text-indigo-600 scale-105' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
                >
                    <AlertTriangle size={14} /> Low Stock Alerts
                </button>
            </div>

            {/* OVERVIEW PANEL - PRESERVED TAB CAPABILITY */}
            {activeTab === 'overview' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-indigo-50 to-white p-5 rounded-2xl shadow-sm border border-indigo-100 flex justify-between items-center">
                            <div>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Sales</p>
                                <h3 className="text-2xl font-black text-indigo-950 mt-1">{formatCurrency(stats.totalSales)}</h3>
                            </div>
                            <div className="p-3 bg-indigo-500/10 text-indigo-600 rounded-xl"><ReceiptIndianRupee size={20} /></div>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-50 to-white p-5 rounded-2xl shadow-sm border border-indigo-100 flex justify-between items-center">
                            <div>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Tax Collected</p>
                                <h3 className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(stats.totalTax)}</h3>
                            </div>
                            <div className="p-3 bg-indigo-500/10 text-slate-600 rounded-xl"><Percent size={20} /></div>
                        </div>
                        <div className="bg-gradient-to-br from-green-50 to-white p-5 rounded-2xl shadow-sm border border-green-100 flex justify-between items-center">
                            <div>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Revenue (Paid)</p>
                                <h3 className="text-2xl font-black text-green-700 mt-1">{formatCurrency(stats.paidAmount)}</h3>
                            </div>
                            <div className="p-3 bg-green-500/10 text-green-600 rounded-xl"><ShoppingBag size={20} /></div>
                        </div>
                        <div className="bg-gradient-to-br from-orange-50 to-white p-5 rounded-2xl shadow-sm border border-orange-100 flex justify-between items-center">
                            <div>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Pending Balance</p>
                                <h3 className="text-2xl font-black text-orange-600 mt-1">{formatCurrency(stats.pendingAmount)}</h3>
                            </div>
                            <div className="p-3 bg-orange-500/10 text-orange-600 rounded-xl"><AlertTriangle size={20} /></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 lg:col-span-2">
                            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                                <TrendingUp size={18} className="text-indigo-500" /> Daily Revenue Trend
                            </h3>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats.chartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#94a3b8" fontSize={11} fontWeight={600} tickLine={false} axisLine={false} tickFormatter={(val) => formatINR(val, { decimals: 0, compact: true })} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(99,102,241,0.05)' }}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                            formatter={(value: any) => [formatINR(value)]}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 600, paddingTop: '10px' }} />
                                        <Bar dataKey="sales" name="Total Sales" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={24} />
                                        {!isNonGST && <Bar dataKey="tax" name="Tax Component" fill="#cbd5e1" radius={[6, 6, 0, 0]} barSize={24} />}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* TAX SUMMARY TABLE */}
                        {!isNonGST && <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                                    <Percent size={18} className="text-indigo-500" /> Tax Breakdown
                                </h3>
                                <div className="space-y-4">
                                    {taxSummary.length === 0 ? (
                                        <p className="text-slate-400 text-sm text-center py-10">No items detected.</p>
                                    ) : taxSummary.map(row => (
                                        <div key={row.rate} className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all">
                                            <div>
                                                <p className="text-xs font-black text-slate-700">GST/VAT {row.rate}%</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">Taxable: {formatCurrency(row.taxable)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-slate-900">{formatCurrency(row.tax)}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">Total: {formatCurrency(row.taxable + row.tax)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="pt-4 border-t border-slate-100">
                                <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                                    <span>Total Taxable:</span>
                                    <span>{formatCurrency(stats.totalTaxable)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm font-black text-slate-800 mt-1.5">
                                    <span>Total Tax:</span>
                                    <span className="text-red-500">{formatCurrency(stats.totalTax)}</span>
                                </div>
                            </div>
                        </div>}
                    </div>

                    {/* DETAILED REGISTER TABLE */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50/50">
                            <div>
                                <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                                    <FileText size={18} className="text-indigo-500" /> Sales Register
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">Itemized transaction logs for audited period</p>
                            </div>
                            <button
                                onClick={exportSalesRegister}
                                className="flex items-center justify-center gap-2 text-xs bg-white border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 text-slate-700 font-bold active:scale-95 transition-all"
                            >
                                <Download size={14} /> Export CSV
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-xs uppercase tracking-wider">
                                        <th className="px-5 py-4">Date</th>
                                        <th className="px-5 py-4">Invoice #</th>
                                        <th className="px-5 py-4">Customer</th>
                                        <th className="px-5 py-4 text-right">Taxable Amount</th>
                                        {!isNonGST && <th className="px-5 py-4 text-right">Tax component</th>}
                                        <th className="px-5 py-4 text-right">Invoice Total</th>
                                        <th className="px-5 py-4 text-center">Payment Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredInvoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={isNonGST ? 6 : 7} className="text-center py-12 text-slate-400 font-medium">
                                                No records found in selected range.
                                            </td>
                                        </tr>
                                    ) : filteredInvoices.map(inv => (
                                        <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="px-5 py-4 text-slate-600 font-medium">{new Date(inv.date).toLocaleDateString()}</td>
                                            <td className="px-5 py-4 font-bold text-indigo-600">#{inv.id}</td>
                                            <td className="px-5 py-4 text-slate-500 font-semibold">{inv.customerId || 'Walk-in customer'}</td>
                                            <td className="px-5 py-4 text-right text-slate-900 font-medium">{Number(inv.subtotal).toFixed(2)}</td>
                                            {!isNonGST && <td className="px-5 py-4 text-right text-red-500 font-medium">{Number(inv.tax).toFixed(2)}</td>}
                                            <td className="px-5 py-4 text-right font-black text-slate-900">{Number(inv.total).toFixed(2)}</td>
                                            <td className="px-5 py-4 text-center">
                                                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase ${inv.status === InvoiceStatus.PAID ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                    {inv.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-50 font-black text-slate-800 border-t border-slate-100">
                                    <tr>
                                        <td colSpan={3} className="px-5 py-4 text-right">Totals:</td>
                                        <td className="px-5 py-4 text-right text-slate-900">{stats.totalTaxable.toFixed(2)}</td>
                                        {!isNonGST && <td className="px-5 py-4 text-right text-red-500">{stats.totalTax.toFixed(2)}</td>}
                                        <td className="px-5 py-4 text-right text-indigo-600">{stats.totalSales.toFixed(2)}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* DYNAMIC MODULE 22 TABULAR REPORTS */}
            {activeTab !== 'overview' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in duration-300">
                    {/* Toolbar search & exports */}
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search report content..."
                                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none transition-all font-medium text-slate-700 placeholder-slate-400"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={handleExportActiveReport}
                                disabled={reportData.length === 0}
                                className="flex items-center justify-center gap-2 text-xs bg-white border border-slate-200 px-4 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 font-bold active:scale-95 transition-all disabled:opacity-40"
                            >
                                <Download size={14} /> Export CSV
                            </button>
                        </div>
                    </div>

                    {/* TABLE PANELS LAYOUT */}
                    <div className="overflow-x-auto">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <RefreshCw size={24} className="animate-spin text-indigo-600" />
                                <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Calculating margins...</p>
                            </div>
                        ) : filteredReportData.length === 0 ? (
                            <div className="text-center py-16 text-slate-400 font-bold text-xs uppercase tracking-wider">
                                No records identified. Check date range filters.
                            </div>
                        ) : (
                            <table className="w-full text-sm text-left border-collapse">
                                {/* FAST MOVING ITEMS HEADERS */}
                                {activeTab === 'fast-moving' && (
                                    <>
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-xs uppercase tracking-wider">
                                                <th className="px-5 py-4">Product Name</th>
                                                <th className="px-5 py-4">Item Code</th>
                                                <th className="px-5 py-4">Barcode</th>
                                                <th className="px-5 py-4 text-center">Quantity Sold</th>
                                                <th className="px-5 py-4 text-right">In-Stock Balance</th>
                                                <th className="px-5 py-4 text-right">Cost Price</th>
                                                <th className="px-5 py-4 text-right">Retail Price</th>
                                                <th className="px-5 py-4 text-right">Calculated Gross Margin</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredReportData.map(row => (
                                                <tr
                                                    key={row.product_id}
                                                    onClick={() => handleRowClick(row)}
                                                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                                                >
                                                    <td className="px-5 py-4 font-bold text-slate-800">{row.product_name}</td>
                                                    <td className="px-5 py-4 text-slate-500 font-semibold">{row.product_code || 'N/A'}</td>
                                                    <td className="px-5 py-4 text-slate-500 font-mono">{row.barcode || 'N/A'}</td>
                                                    <td className="px-5 py-4 text-center text-indigo-600 font-extrabold">{row.total_quantity_sold}</td>
                                                    <td className="px-5 py-4 text-right text-slate-700 font-bold">{row.current_stock}</td>
                                                    <td className="px-5 py-4 text-right text-slate-900 font-medium">{formatCurrency(row.purchase_price)}</td>
                                                    <td className="px-5 py-4 text-right text-slate-900 font-medium">{formatCurrency(row.selling_price)}</td>
                                                    <td className="px-5 py-4 text-right text-green-600 font-black">{formatPercent(row.gross_margin_percentage)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </>
                                )}

                                {/* SLOW / DEAD STOCK HEADERS */}
                                {activeTab === 'slow-moving' && (
                                    <>
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-xs uppercase tracking-wider">
                                                <th className="px-5 py-4">Product Name</th>
                                                <th className="px-5 py-4">Item Code</th>
                                                <th className="px-5 py-4 text-center">In-Stock Balance</th>
                                                <th className="px-5 py-4 text-right">Cost Price</th>
                                                <th className="px-5 py-4 text-right">Retail Price</th>
                                                <th className="px-5 py-4 text-center">Days Stagnant</th>
                                                <th className="px-5 py-4 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredReportData.map(row => (
                                                <tr
                                                    key={row.product_id}
                                                    onClick={() => handleRowClick(row)}
                                                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                                                >
                                                    <td className="px-5 py-4 font-bold text-slate-800">{row.product_name}</td>
                                                    <td className="px-5 py-4 text-slate-500 font-semibold">{row.product_code || 'N/A'}</td>
                                                    <td className="px-5 py-4 text-center text-slate-700 font-bold">{row.current_stock}</td>
                                                    <td className="px-5 py-4 text-right text-slate-900 font-medium">{formatCurrency(row.purchase_price)}</td>
                                                    <td className="px-5 py-4 text-right text-slate-900 font-medium">{formatCurrency(row.selling_price)}</td>
                                                    <td className="px-5 py-4 text-center text-amber-600 font-extrabold">{row.days_since_last_sale} days</td>
                                                    <td className="px-5 py-4 text-center">
                                                        <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-red-50 text-red-600 border border-red-150">
                                                            DEAD STOCK
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </>
                                )}

                                {/* TOP CUSTOMERS HEADERS */}
                                {activeTab === 'top-customers' && (
                                    <>
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-xs uppercase tracking-wider">
                                                <th className="px-5 py-4">Customer Name</th>
                                                <th className="px-5 py-4">Company Name</th>
                                                <th className="px-5 py-4">Contact Phone</th>
                                                <th className="px-5 py-4 text-center">Invoices count</th>
                                                <th className="px-5 py-4 text-right">Total Purchase Value</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredReportData.map(row => (
                                                <tr
                                                    key={row.customer_id}
                                                    onClick={() => handleRowClick(row)}
                                                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                                                >
                                                    <td className="px-5 py-4 font-bold text-indigo-950">{row.customer_name}</td>
                                                    <td className="px-5 py-4 text-slate-500 font-semibold">{row.company_name || 'Individual'}</td>
                                                    <td className="px-5 py-4 text-slate-500 font-semibold">{row.phone || 'N/A'}</td>
                                                    <td className="px-5 py-4 text-center text-slate-700 font-bold">{row.total_invoices} bills</td>
                                                    <td className="px-5 py-4 text-right text-indigo-600 font-black">{formatCurrency(row.total_sales_value)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </>
                                )}

                                {/* SUPPLIER SPEND ANALYSIS */}
                                {activeTab === 'supplier-spend' && (
                                    <>
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-xs uppercase tracking-wider">
                                                <th className="px-5 py-4">Supplier Name</th>
                                                <th className="px-5 py-4">Company</th>
                                                <th className="px-5 py-4">GST Number</th>
                                                <th className="px-5 py-4 text-center">Purchase Orders</th>
                                                <th className="px-5 py-4 text-right">Total Sourcing spend</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredReportData.map(row => (
                                                <tr
                                                    key={row.supplier_id}
                                                    onClick={() => handleRowClick(row)}
                                                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                                                >
                                                    <td className="px-5 py-4 font-bold text-slate-800">{row.supplier_name}</td>
                                                    <td className="px-5 py-4 text-slate-500 font-semibold">{row.company_name || 'N/A'}</td>
                                                    <td className="px-5 py-4 text-slate-500 font-mono">{row.gst_number || 'N/A'}</td>
                                                    <td className="px-5 py-4 text-center text-slate-700 font-bold">{row.total_invoices} bills</td>
                                                    <td className="px-5 py-4 text-right text-indigo-600 font-black">{formatCurrency(row.total_spend_value)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </>
                                )}

                                {/* ITEM PROFITABILITY MATRIX */}
                                {activeTab === 'item-profitability' && (
                                    <>
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-xs uppercase tracking-wider">
                                                <th className="px-5 py-4">Product Name</th>
                                                <th className="px-5 py-4 text-center">Units Sold</th>
                                                <th className="px-5 py-4 text-right">Total Cost Basis</th>
                                                <th className="px-5 py-4 text-right">Total Revenue Basis</th>
                                                <th className="px-5 py-4 text-right">Calculated Gross Profit</th>
                                                <th className="px-5 py-4 text-right">Net Margin Percentage</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredReportData.map(row => (
                                                <tr
                                                    key={row.product_id}
                                                    onClick={() => handleRowClick(row)}
                                                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                                                >
                                                    <td className="px-5 py-4 font-bold text-slate-800">{row.product_name}</td>
                                                    <td className="px-5 py-4 text-center text-slate-700 font-bold">{row.total_quantity_sold}</td>
                                                    <td className="px-5 py-4 text-right text-slate-500 font-semibold">{formatCurrency(row.total_cost)}</td>
                                                    <td className="px-5 py-4 text-right text-slate-900 font-bold">{formatCurrency(row.total_revenue)}</td>
                                                    <td className="px-5 py-4 text-right text-indigo-600 font-black">{formatCurrency(row.gross_profit)}</td>
                                                    <td className="px-5 py-4 text-right text-green-600 font-black">{formatPercent(row.margin_percentage)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </>
                                )}

                                {/* CATEGORY PROFITABILITY */}
                                {activeTab === 'category-profitability' && (
                                    <>
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-xs uppercase tracking-wider">
                                                <th className="px-5 py-4">Category Name</th>
                                                <th className="px-5 py-4 text-center">Total units Sold</th>
                                                <th className="px-5 py-4 text-right">Gross Cost Value</th>
                                                <th className="px-5 py-4 text-right">Gross Revenue Value</th>
                                                <th className="px-5 py-4 text-right">Category gross profit</th>
                                                <th className="px-5 py-4 text-right">Averaged Gross Margin</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredReportData.map(row => (
                                                <tr key={row.category_id} className="hover:bg-slate-50/40">
                                                    <td className="px-5 py-4 font-bold text-indigo-950">{row.category_name}</td>
                                                    <td className="px-5 py-4 text-center text-slate-700 font-bold">{row.total_quantity_sold}</td>
                                                    <td className="px-5 py-4 text-right text-slate-500 font-semibold">{formatCurrency(row.total_cost)}</td>
                                                    <td className="px-5 py-4 text-right text-slate-900 font-bold">{formatCurrency(row.total_revenue)}</td>
                                                    <td className="px-5 py-4 text-right text-indigo-600 font-black">{formatCurrency(row.gross_profit)}</td>
                                                    <td className="px-5 py-4 text-right text-indigo-500 font-black">{formatPercent(row.margin_percentage)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </>
                                )}

                                {/* LOW STOCK ALERTS PANEL */}
                                {activeTab === 'low-stock' && (
                                    <>
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-xs uppercase tracking-wider">
                                                <th className="px-5 py-4">Product Name</th>
                                                <th className="px-5 py-4">Barcode</th>
                                                <th className="px-5 py-4 text-center">Safety Alert Limit</th>
                                                <th className="px-5 py-4 text-center">Current stock Balance</th>
                                                <th className="px-5 py-4 text-center text-red-500">Deficit Deficit</th>
                                                <th className="px-5 py-4 text-center">Restock Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredReportData.map(row => (
                                                <tr key={row.product_id} className="hover:bg-slate-50/40">
                                                    <td className="px-5 py-4 font-bold text-red-950 flex items-center gap-2">
                                                        <AlertTriangle size={14} className="text-red-500 animate-bounce" /> {row.product_name}
                                                    </td>
                                                    <td className="px-5 py-4 text-slate-500 font-mono">{row.barcode || 'N/A'}</td>
                                                    <td className="px-5 py-4 text-center text-slate-500 font-semibold">{row.low_stock_limit} units</td>
                                                    <td className="px-5 py-4 text-center text-slate-900 font-bold">{row.current_stock} units</td>
                                                    <td className="px-5 py-4 text-center text-red-600 font-black bg-red-50/20">{row.deficit_quantity} units</td>
                                                    <td className="px-5 py-4 text-center">
                                                        <span className="inline-flex px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200">
                                                            Needs Restocking
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </>
                                )}
                            </table>
                        )}
                    </div>

                    {/* DETERMINISTIC PAGINATION NAVIGATION CONTROLS */}
                    {!loading && totalRecords > pageSize && (
                        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50/30">
                            <span className="font-bold text-slate-500">
                                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} results
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3.5 py-1.5 border border-slate-200 rounded-lg font-bold hover:bg-white bg-slate-50 text-slate-600 active:scale-95 disabled:opacity-40 transition-all"
                                >
                                    <ChevronLeft size={13} className="inline mr-1" /> Prev
                                </button>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalRecords / pageSize), prev + 1))}
                                    disabled={currentPage >= Math.ceil(totalRecords / pageSize)}
                                    className="px-3.5 py-1.5 border border-slate-200 rounded-lg font-bold hover:bg-white bg-slate-50 text-slate-600 active:scale-95 disabled:opacity-40 transition-all"
                                >
                                    Next <ChevronRight size={13} className="inline ml-1" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* MASTER-DETAIL CONTEXT DRAWER / DIALOG MODAL */}
            {selectedItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-3xl h-full bg-white shadow-2xl flex flex-col justify-between border-l border-slate-200 animate-in slide-in-from-right duration-300">
                        {/* Header */}
                        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-slate-950">
                                    {selectedItem.product_name || selectedItem.customer_name || selectedItem.supplier_name || 'Detail audit ledger'}
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {selectedItem.product_code || selectedItem.company_name || 'Deep historical transaction matching'}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="p-2 text-slate-400 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:shadow-sm active:scale-95 transition-all"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Modal Body with multi tabs */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Summary cards depending on type */}
                            {selectedItem.product_id && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Stock</p>
                                        <p className="text-base font-black text-indigo-950 mt-1">{selectedItem.current_stock} units</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Standard Cost</p>
                                        <p className="text-base font-black text-indigo-950 mt-1">{formatCurrency(selectedItem.purchase_price)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Retail price</p>
                                        <p className="text-base font-black text-indigo-950 mt-1">{formatCurrency(selectedItem.selling_price)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gross Margin</p>
                                        <p className="text-base font-black text-green-600 mt-1">
                                            {formatPercent(selectedItem.gross_margin_percentage ?? selectedItem.margin_percentage)}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {selectedItem.customer_id && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Company Name</p>
                                        <p className="text-base font-black text-indigo-950 mt-1">{selectedItem.company_name || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phone</p>
                                        <p className="text-base font-black text-indigo-950 mt-1">{selectedItem.phone || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Sales</p>
                                        <p className="text-base font-black text-indigo-950 mt-1">{formatCurrency(selectedItem.total_sales_value)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Invoices</p>
                                        <p className="text-base font-black text-green-600 mt-1">
                                            {selectedItem.total_invoices || '0'} bills
                                        </p>
                                    </div>
                                </div>
                            )}

                            {selectedItem.supplier_id && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Company Name</p>
                                        <p className="text-base font-black text-indigo-950 mt-1">{selectedItem.company_name || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GST Number</p>
                                        <p className="text-base font-black text-indigo-950 mt-1">{selectedItem.gst_number || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Spend</p>
                                        <p className="text-base font-black text-indigo-950 mt-1">{formatCurrency(selectedItem.total_spend_value)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Bills</p>
                                        <p className="text-base font-black text-green-600 mt-1">
                                            {selectedItem.total_invoices || '0'} bills
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Subtabs nested transaction list */}
                            {selectedItem.product_id && (
                                <div className="space-y-4">
                                    <div className="flex border-b border-slate-100 gap-2">
                                        <button
                                            onClick={() => setDetailTab('purchases')}
                                            className={`pb-2.5 text-xs font-bold transition-all relative ${detailTab === 'purchases' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Purchase History
                                        </button>
                                        <button
                                            onClick={() => setDetailTab('sales')}
                                            className={`pb-2.5 text-xs font-bold transition-all relative ${detailTab === 'sales' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Sales History
                                        </button>
                                        <button
                                            onClick={() => setDetailTab('purchase-returns')}
                                            className={`pb-2.5 text-xs font-bold transition-all relative ${detailTab === 'purchase-returns' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Purchase Returns
                                        </button>
                                        <button
                                            onClick={() => setDetailTab('sales-returns')}
                                            className={`pb-2.5 text-xs font-bold transition-all relative ${detailTab === 'sales-returns' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Sales Returns
                                        </button>
                                    </div>

                                    {detailLoading ? (
                                        <div className="flex justify-center items-center py-12">
                                            <RefreshCw size={20} className="animate-spin text-indigo-600" />
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto border border-slate-100 rounded-xl">
                                            <table className="w-full text-xs text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                                                        <th className="px-4 py-3">Date</th>
                                                        <th className="px-4 py-3">Ref Invoice #</th>
                                                        <th className="px-4 py-3">Associate Party</th>
                                                        <th className="px-4 py-3 text-center">Quantity</th>
                                                        <th className="px-4 py-3 text-right">Unit Price</th>
                                                        <th className="px-4 py-3 text-right">Total Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                                    {detailTab === 'purchases' && (
                                                        detailHistory.purchases?.length === 0 ? (
                                                            <tr><td colSpan={6} className="text-center py-8 text-slate-400">No purchases found.</td></tr>
                                                        ) : detailHistory.purchases?.map((row, idx) => (
                                                            <tr key={idx} className="hover:bg-slate-50">
                                                                <td className="px-4 py-3">{new Date(row.purchase_date).toLocaleDateString()}</td>
                                                                <td className="px-4 py-3 font-bold text-indigo-600">#{row.purchase_invoice_no || row.purchase_id}</td>
                                                                <td className="px-4 py-3 font-semibold">{row.supplier_name}</td>
                                                                <td className="px-4 py-3 text-center font-bold">{row.quantity}</td>
                                                                <td className="px-4 py-3 text-right">{formatCurrency(row.purchase_price)}</td>
                                                                <td className="px-4 py-3 text-right font-bold text-indigo-900">{formatCurrency(row.total_amount)}</td>
                                                            </tr>
                                                        ))
                                                    )}

                                                    {detailTab === 'sales' && (
                                                        detailHistory.sales?.length === 0 ? (
                                                            <tr><td colSpan={6} className="text-center py-8 text-slate-400">No sales found.</td></tr>
                                                        ) : detailHistory.sales?.map((row, idx) => (
                                                            <tr key={idx} className="hover:bg-slate-50">
                                                                <td className="px-4 py-3">{new Date(row.invoice_date).toLocaleDateString()}</td>
                                                                <td className="px-4 py-3 font-bold text-indigo-600">#{row.invoice_no || row.sale_id}</td>
                                                                <td className="px-4 py-3 font-semibold">{row.customer_name || 'Walk-in Customer'}</td>
                                                                <td className="px-4 py-3 text-center font-bold">{row.quantity}</td>
                                                                <td className="px-4 py-3 text-right">{formatCurrency(row.selling_price)}</td>
                                                                <td className="px-4 py-3 text-right font-bold text-indigo-900">{formatCurrency(row.total_amount)}</td>
                                                            </tr>
                                                        ))
                                                    )}

                                                    {detailTab === 'purchase-returns' && (
                                                        detailHistory.purchaseReturns?.length === 0 ? (
                                                            <tr><td colSpan={6} className="text-center py-8 text-slate-400">No purchase returns found.</td></tr>
                                                        ) : detailHistory.purchaseReturns?.map((row, idx) => (
                                                            <tr key={idx} className="hover:bg-slate-50">
                                                                <td className="px-4 py-3">{new Date(row.return_date).toLocaleDateString()}</td>
                                                                <td className="px-4 py-3 font-bold text-indigo-600">#{row.return_invoice_no || row.return_id}</td>
                                                                <td className="px-4 py-3 font-semibold">{row.supplier_name}</td>
                                                                <td className="px-4 py-3 text-center font-bold">{row.quantity}</td>
                                                                <td className="px-4 py-3 text-right">{formatCurrency(row.purchase_price)}</td>
                                                                <td className="px-4 py-3 text-right font-bold text-red-500">{formatCurrency(row.total_amount)}</td>
                                                            </tr>
                                                        ))
                                                    )}

                                                    {detailTab === 'sales-returns' && (
                                                        detailHistory.salesReturns?.length === 0 ? (
                                                            <tr><td colSpan={6} className="text-center py-8 text-slate-400">No sales returns found.</td></tr>
                                                        ) : detailHistory.salesReturns?.map((row, idx) => (
                                                            <tr key={idx} className="hover:bg-slate-50">
                                                                <td className="px-4 py-3">{new Date(row.return_date).toLocaleDateString()}</td>
                                                                <td className="px-4 py-3 font-bold text-indigo-600">#{row.return_invoice_no || row.return_id}</td>
                                                                <td className="px-4 py-3 font-semibold">{row.customer_name || 'Walk-in Customer'}</td>
                                                                <td className="px-4 py-3 text-center font-bold">{row.quantity}</td>
                                                                <td className="px-4 py-3 text-right">{formatCurrency(row.selling_price)}</td>
                                                                <td className="px-4 py-3 text-right font-bold text-red-500">{formatCurrency(row.total_amount)}</td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Customer direct invoices preview/download list */}
                            {selectedItem.customer_id && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Associated Sales Timeline</h4>
                                    {detailLoading ? (
                                        <div className="flex justify-center items-center py-12">
                                            <RefreshCw size={20} className="animate-spin text-indigo-600" />
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto border border-slate-100 rounded-xl">
                                            <table className="w-full text-xs text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                                                        <th className="px-4 py-3">Bill Date</th>
                                                        <th className="px-4 py-3">Invoice Number</th>
                                                        <th className="px-4 py-3 text-right">Grand Total</th>
                                                        <th className="px-4 py-3 text-center">Status</th>
                                                        <th className="px-4 py-3 text-center">Quick Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                                    {detailHistory.sales?.length === 0 ? (
                                                        <tr><td colSpan={5} className="text-center py-8 text-slate-400">No invoices on file.</td></tr>
                                                    ) : detailHistory.sales?.map((invoice, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50">
                                                            <td className="px-4 py-3">{new Date(invoice.date).toLocaleDateString()}</td>
                                                            <td className="px-4 py-3 font-bold text-indigo-600">#{invoice.id}</td>
                                                            <td className="px-4 py-3 text-right font-black">{formatCurrency(invoice.total)}</td>
                                                            <td className="px-4 py-3 text-center">
                                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold ${invoice.status === InvoiceStatus.PAID ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                                    {invoice.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-center flex items-center justify-center gap-2">
                                                                <button
                                                                    className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100"
                                                                    title="Web Preview"
                                                                    onClick={() => window.open(`/invoice/${invoice.id}`, '_blank')}
                                                                >
                                                                    <Eye size={14} />
                                                                </button>
                                                                <button
                                                                    className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100"
                                                                    title="Download PDF"
                                                                    onClick={() => {
                                                                        // Mock PDF exporter triggering
                                                                        const csv = `Invoice Date,Invoice No,Total\n${invoice.date},${invoice.id},${invoice.total}`;
                                                                        const blob = new Blob([csv], { type: 'text/csv' });
                                                                        const url = window.URL.createObjectURL(blob);
                                                                        const link = document.createElement('a');
                                                                        link.href = url;
                                                                        link.download = `Invoice_${invoice.id}.csv`;
                                                                        link.click();
                                                                    }}
                                                                >
                                                                    <FileDown size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Supplier direct purchases timeline list */}
                            {selectedItem.supplier_id && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Associated Purchases Timeline</h4>
                                    {detailLoading ? (
                                        <div className="flex justify-center items-center py-12">
                                            <RefreshCw size={20} className="animate-spin text-indigo-600" />
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto border border-slate-100 rounded-xl">
                                            <table className="w-full text-xs text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                                                        <th className="px-4 py-3">Bill Date</th>
                                                        <th className="px-4 py-3">Purchase Invoice Number</th>
                                                        <th className="px-4 py-3 text-right">Grand Total</th>
                                                        <th className="px-4 py-3 text-center">Status</th>
                                                        <th className="px-4 py-3 text-center">Quick Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                                    {detailHistory.purchases?.length === 0 ? (
                                                        <tr><td colSpan={5} className="text-center py-8 text-slate-400">No purchases on file.</td></tr>
                                                    ) : detailHistory.purchases?.map((purchase, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50">
                                                            <td className="px-4 py-3">{new Date(purchase.purchase_date).toLocaleDateString()}</td>
                                                            <td className="px-4 py-3 font-bold text-indigo-600">#{purchase.purchase_invoice_no || purchase.purchase_id}</td>
                                                            <td className="px-4 py-3 text-right font-black">{formatCurrency(purchase.grand_total)}</td>
                                                            <td className="px-4 py-3 text-center">
                                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold ${purchase.payment_status === 'Paid' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                                    {purchase.payment_status || 'Unpaid'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-center flex items-center justify-center gap-2">
                                                                <button
                                                                    className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100"
                                                                    title="Web Preview"
                                                                    onClick={() => window.open(`/purchase/${purchase.purchase_id}`, '_blank')}
                                                                >
                                                                    <Eye size={14} />
                                                                </button>
                                                                <button
                                                                    className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100"
                                                                    title="Download CSV"
                                                                    onClick={() => {
                                                                        const csv = `Purchase Date,Purchase Invoice No,Total\n${purchase.purchase_date},${purchase.purchase_invoice_no || purchase.purchase_id},${purchase.grand_total}`;
                                                                        const blob = new Blob([csv], { type: 'text/csv' });
                                                                        const url = window.URL.createObjectURL(blob);
                                                                        const link = document.createElement('a');
                                                                        link.href = url;
                                                                        link.download = `Purchase_${purchase.purchase_id}.csv`;
                                                                        link.click();
                                                                    }}
                                                                >
                                                                    <FileDown size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer button close */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/10 active:scale-95 transition-all"
                            >
                                Close Deep Audit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
