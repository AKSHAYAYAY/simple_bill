import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Unit, Category, AppSettings, Customer, Invoice, Supplier,
  Purchase, SalesReturn, PurchaseReturn, Product, PaymentIn,
  PaymentOut, Expense, Income
} from '../types';
import {
  fetchUnits, fetchCategories, getSettings,
  fetchCustomersPaginated, fetchInvoicesPaginated,
  fetchSuppliersPaginated, fetchPurchasesPaginated,
  fetchSalesReturnsPaginated, fetchPurchaseReturnsPaginated,
  fetchPaymentsInPaginated, fetchPaymentsOutPaginated,
  fetchProducts
} from '../services/dataService';

// Generic Paginated Cache State Shape
export interface PaginatedCacheState<T> {
  data: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  search: string;
  limit: number;
  lastFetched: number;
  isLoading: boolean;
  needsRefresh: boolean;
}

const initialPaginatedState = {
  data: [],
  currentPage: 1,
  totalPages: 1,
  totalItems: 0,
  search: '',
  limit: 25,
  lastFetched: 0,
  isLoading: false,
  needsRefresh: true
};

const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

interface AppContextType {
  // Static Caches
  units: Unit[];
  categories: Category[];
  settings: AppSettings;
  isStaticLoading: boolean;

  // Paginated Caches
  customersCache: PaginatedCacheState<Customer>;
  invoicesCache: PaginatedCacheState<Invoice>;
  suppliersCache: PaginatedCacheState<Supplier>;
  purchasesCache: PaginatedCacheState<Purchase>;
  salesReturnsCache: PaginatedCacheState<SalesReturn>;
  purchaseReturnsCache: PaginatedCacheState<PurchaseReturn>;
  productsCache: PaginatedCacheState<Product>; // Note: Inventory currently doesn't use standard pagination in dataService, but we can structure it similarly.
  paymentsInCache: PaginatedCacheState<PaymentIn>;
  paymentsOutCache: PaginatedCacheState<PaymentOut>;

  // Methods
  refreshStaticData: () => Promise<void>;
  updateSettingsState: (newSettings: AppSettings) => void;
  invalidateCache: (entity: string | 'all') => void;

  // Entity specific fetchers
  fetchCustomers: (page?: number, search?: string) => Promise<void>;
  fetchInvoices: (page?: number, search?: string) => Promise<void>;
  fetchSuppliers: (page?: number, search?: string) => Promise<void>;
  fetchPurchases: (page?: number, search?: string) => Promise<void>;
  fetchSalesReturns: (page?: number, search?: string) => Promise<void>;
  fetchPurchaseReturns: (page?: number, search?: string) => Promise<void>;
  fetchPaymentsIn: (page?: number, search?: string) => Promise<void>;
  fetchPaymentsOut: (page?: number, search?: string) => Promise<void>;
  fetchProductsCache: (page?: number, search?: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Static State
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [isStaticLoading, setIsStaticLoading] = useState(false);

  // Paginated Cache States
  const [customersCache, setCustomersCache] = useState<PaginatedCacheState<Customer>>(initialPaginatedState);
  const [invoicesCache, setInvoicesCache] = useState<PaginatedCacheState<Invoice>>(initialPaginatedState);
  const [suppliersCache, setSuppliersCache] = useState<PaginatedCacheState<Supplier>>(initialPaginatedState);
  const [purchasesCache, setPurchasesCache] = useState<PaginatedCacheState<Purchase>>(initialPaginatedState);
  const [salesReturnsCache, setSalesReturnsCache] = useState<PaginatedCacheState<SalesReturn>>(initialPaginatedState);
  const [purchaseReturnsCache, setPurchaseReturnsCache] = useState<PaginatedCacheState<PurchaseReturn>>(initialPaginatedState);
  const [productsCache, setProductsCache] = useState<PaginatedCacheState<Product>>({ ...initialPaginatedState, limit: 1000 }); // Inventory is usually fully loaded for search
  const [paymentsInCache, setPaymentsInCache] = useState<PaginatedCacheState<PaymentIn>>(initialPaginatedState);
  const [paymentsOutCache, setPaymentsOutCache] = useState<PaginatedCacheState<PaymentOut>>(initialPaginatedState);

  const fetchStaticData = async () => {
    const isConfigured = localStorage.getItem('access_token') !== null;
    if (!isConfigured) return;
    setIsStaticLoading(true);
    try {
      const [fetchedUnits, fetchedCategories] = await Promise.all([
        fetchUnits().catch(() => []),
        fetchCategories().catch(() => [])
      ]);
      setUnits(fetchedUnits || []);
      setCategories(fetchedCategories || []);
    } catch (err: any) {
      console.warn('[AppContext] Failed to pre-fetch static configurations:', err.message);
    } finally {
      setIsStaticLoading(false);
    }
  };

  useEffect(() => {
    fetchStaticData();
  }, []);

  const refreshStaticData = async () => {
    await fetchStaticData();
  };

  const updateSettingsState = (newSettings: AppSettings) => {
    setSettings(newSettings);
  };

  // Invalidation Helper
  const invalidateCache = useCallback((entity: string | 'all') => {
    const updateFn = (prev: any) => ({ ...prev, needsRefresh: true });
    if (entity === 'all' || entity === 'customers') setCustomersCache(updateFn);
    if (entity === 'all' || entity === 'invoices') setInvoicesCache(updateFn);
    if (entity === 'all' || entity === 'suppliers') setSuppliersCache(updateFn);
    if (entity === 'all' || entity === 'purchases') setPurchasesCache(updateFn);
    if (entity === 'all' || entity === 'salesReturns') setSalesReturnsCache(updateFn);
    if (entity === 'all' || entity === 'purchaseReturns') setPurchaseReturnsCache(updateFn);
    if (entity === 'all' || entity === 'products') setProductsCache(updateFn);
    if (entity === 'all' || entity === 'paymentsIn') setPaymentsInCache(updateFn);
    if (entity === 'all' || entity === 'paymentsOut') setPaymentsOutCache(updateFn);
  }, []);

  // Generic Fetcher
  const fetchEntity = async <T,>(
    cacheState: PaginatedCacheState<T>,
    setCacheState: React.Dispatch<React.SetStateAction<PaginatedCacheState<T>>>,
    fetchFunction: (page: number, limit: number, search: string) => Promise<{ data: T[], pagination?: any }>,
    targetPage?: number,
    targetSearch?: string,
    force: boolean = false
  ) => {
    const page = targetPage !== undefined ? targetPage : cacheState.currentPage;
    const search = targetSearch !== undefined ? targetSearch : cacheState.search;

    const isStale = (Date.now() - cacheState.lastFetched) > CACHE_TTL;
    const isPageChange = page !== cacheState.currentPage;
    const isSearchChange = search !== cacheState.search;

    if (!force && !cacheState.needsRefresh && !isStale && !isPageChange && !isSearchChange && cacheState.lastFetched > 0) {
      // Data is valid and conditions match, skip network request
      if (targetPage !== undefined || targetSearch !== undefined) {
        setCacheState(prev => ({ ...prev, currentPage: page, search }));
      }
      return;
    }

    setCacheState(prev => ({ ...prev, isLoading: true, currentPage: page, search }));
    try {
      const result = await fetchFunction(page, cacheState.limit, search);
      setCacheState(prev => ({
        ...prev,
        data: result.data,
        currentPage: page,
        search: search,
        totalPages: result.pagination?.totalPages || 1,
        totalItems: result.pagination?.total || result.data.length,
        lastFetched: Date.now(),
        isLoading: false,
        needsRefresh: false
      }));
    } catch (e) {
      console.error('Failed to fetch paginated data:', e);
      setCacheState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const fetchProductsEntity = async (
    targetPage?: number,
    targetSearch?: string,
    force: boolean = false
  ) => {
    const page = targetPage !== undefined ? targetPage : productsCache.currentPage;
    const search = targetSearch !== undefined ? targetSearch : productsCache.search;
    const isStale = (Date.now() - productsCache.lastFetched) > CACHE_TTL;

    if (!force && !productsCache.needsRefresh && !isStale && productsCache.lastFetched > 0) {
      return;
    }

    setProductsCache(prev => ({ ...prev, isLoading: true }));
    try {
      // fetchProducts currently uses a different signature in dataService, usually getting all products.
      // We will emulate it.
      const result = await fetchProducts();
      // Apply local search if needed
      let filtered = result;
      if (search) {
        const lowerSearch = search.toLowerCase();
        filtered = result.filter(p => p.product_name.toLowerCase().includes(lowerSearch) || p.product_code?.toLowerCase().includes(lowerSearch));
      }

      setProductsCache(prev => ({
        ...prev,
        data: filtered,
        currentPage: page,
        search: search,
        totalPages: 1,
        totalItems: filtered.length,
        lastFetched: Date.now(),
        isLoading: false,
        needsRefresh: false
      }));
    } catch (e) {
      setProductsCache(prev => ({ ...prev, isLoading: false }));
    }
  };


  const fetchCustomers = (p?: number, s?: string) => fetchEntity(customersCache, setCustomersCache, fetchCustomersPaginated, p, s);
  const fetchInvoices = (p?: number, s?: string) => fetchEntity(invoicesCache, setInvoicesCache, fetchInvoicesPaginated, p, s);
  const fetchSuppliers = (p?: number, s?: string) => fetchEntity(suppliersCache, setSuppliersCache, fetchSuppliersPaginated, p, s);
  const fetchPurchases = (p?: number, s?: string) => fetchEntity(purchasesCache, setPurchasesCache, fetchPurchasesPaginated, p, s);
  const fetchSalesReturns = (p?: number, s?: string) => fetchEntity(salesReturnsCache, setSalesReturnsCache, fetchSalesReturnsPaginated, p, s);
  const fetchPurchaseReturns = (p?: number, s?: string) => fetchEntity(purchaseReturnsCache, setPurchaseReturnsCache, fetchPurchaseReturnsPaginated, p, s);
  const fetchPaymentsIn = (p?: number, s?: string) => fetchEntity(paymentsInCache, setPaymentsInCache, fetchPaymentsInPaginated, p, s);
  const fetchPaymentsOut = (p?: number, s?: string) => fetchEntity(paymentsOutCache, setPaymentsOutCache, fetchPaymentsOutPaginated, p, s);
  const fetchProductsCache = (p?: number, s?: string) => fetchProductsEntity(p, s);

  return (
    <AppContext.Provider
      value={{
        units,
        categories,
        settings,
        isStaticLoading,
        customersCache,
        invoicesCache,
        suppliersCache,
        purchasesCache,
        salesReturnsCache,
        purchaseReturnsCache,
        productsCache,
        paymentsInCache,
        paymentsOutCache,
        refreshStaticData,
        updateSettingsState,
        invalidateCache,
        fetchCustomers,
        fetchInvoices,
        fetchSuppliers,
        fetchPurchases,
        fetchSalesReturns,
        fetchPurchaseReturns,
        fetchPaymentsIn,
        fetchPaymentsOut,
        fetchProductsCache
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
