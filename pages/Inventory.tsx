import React, { useState, useEffect } from 'react';
import { Product, Category, Unit, StockMovement } from '../types';
import {
  Plus, Search, Edit2, Trash2, Sliders, RefreshCw, AlertTriangle,
  ArrowUpDown, Package, Layers, Info, Check, X, History, BarChart3, TrendingDown, IndianRupee,
  ReceiptIndianRupee
} from 'lucide-react';
import {
  fetchProducts, saveProduct, deleteProduct,
  fetchProductStockMovements, fetchCategories, fetchUnits,
  saveCategory, deleteCategory, toggleCategoryActive, saveUnit, deleteUnit,
  getSettings
} from '../services/dataService';
import { useApp } from '../context/AppContext';
import { PaginationControls } from '../components/PaginationControls';

export const Inventory: React.FC = () => {
  const settings = getSettings();
  const isNonGst = settings.gstType === 'NON_GST';

  const { productsCache, fetchProductsCache, invalidateCache } = useApp();
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');

  // Views & Modals State
  const [view, setView] = useState<'list' | 'upsert'>('list');
  const [currentProduct, setCurrentProduct] = useState<Partial<Product> | null>(null);
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [selectedProductMovements, setSelectedProductMovements] = useState<Product | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Sub-Tab State
  const [activeSubTab, setActiveSubTab] = useState<'items' | 'categories' | 'units'>('items');

  // Categories Master State
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [submittingCat, setSubmittingCat] = useState(false);

  // Units Master State
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Partial<Unit> | null>(null);
  const [unitName, setUnitName] = useState('');
  const [unitShortName, setUnitShortName] = useState('');
  const [submittingUnit, setSubmittingUnit] = useState(false);

  // Use Global Cache State
  const products = productsCache.data;
  const currentPage = productsCache.currentPage;
  const totalPages = productsCache.totalPages;
  const totalItems = productsCache.totalItems;
  const loading = productsCache.isLoading || metadataLoading;
  const searchTerm = productsCache.search;

  useEffect(() => {
    fetchProductsCache();
  }, [productsCache.currentPage, productsCache.search, productsCache.needsRefresh]);

  useEffect(() => {
    loadMetadata();
  }, []);

  const loadMetadata = async () => {
    setMetadataLoading(true);
    try {
      const [catData, unitData] = await Promise.all([
        fetchCategories(true),
        fetchUnits()
      ]);
      setCategories(catData || []);
      setUnits(unitData || []);
    } catch (e) {
      console.error('Failed to load inventory metadata', e);
    } finally {
      setMetadataLoading(false);
    }
  };

  // Categories Master Helper Actions
  const handleOpenCatModal = (cat?: Category) => {
    setEditingCategory(cat || null);
    setCatName(cat ? cat.category_name : '');
    setCatDesc(cat ? cat.description || '' : '');
    setShowCatModal(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setSubmittingCat(true);
    try {
      await saveCategory({
        category_id: editingCategory?.category_id,
        category_name: catName.trim(),
        description: catDesc.trim() || undefined
      });
      setShowCatModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save category');
    } finally {
      setSubmittingCat(false);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      await deleteCategory(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete category. Ensure no products are linked.');
    }
  };

  const handleToggleCatActive = async (id: number) => {
    try {
      await toggleCategoryActive(id);
      await loadMetadata();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle category active status');
    }
  };

  // Units Master Helper Actions
  const handleOpenUnitModal = (unit?: Unit) => {
    setEditingUnit(unit || null);
    setUnitName(unit ? unit.unit_name : '');
    setUnitShortName(unit ? unit.short_name : '');
    setShowUnitModal(true);
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitName.trim() || !unitShortName.trim()) return;
    setSubmittingUnit(true);
    try {
      await saveUnit({
        unit_id: editingUnit?.unit_id,
        unit_name: unitName.trim(),
        short_name: unitShortName.trim()
      });
      setShowUnitModal(false);
      await loadMetadata();
    } catch (err: any) {
      alert(err.message || 'Failed to save unit');
    } finally {
      setSubmittingUnit(false);
    }
  };

  const handleDeleteUnit = async (id: number) => {
    if (!confirm('Are you sure you want to delete this unit?')) return;
    try {
      await deleteUnit(id);
      await loadMetadata();
    } catch (err: any) {
      alert(err.message || 'Failed to delete unit. Ensure no products are linked.');
    }
  };

  const handleCreateNew = () => {
    setCurrentProduct({
      product_name: '',
      product_code: '',
      barcode: '',
      item_description: '',
      purchase_price: 0,
      profit_percentage: 0,
      selling_price: 0,
      current_stock: 0,
      minimum_stock_alert: settings.lowStockLimit !== undefined ? Number(settings.lowStockLimit) : 10,
      cgst_percentage: isNonGst ? 0 : (settings.defaultCgstRate !== undefined ? Number(settings.defaultCgstRate) : 0),
      sgst_percentage: isNonGst ? 0 : (settings.defaultSgstRate !== undefined ? Number(settings.defaultSgstRate) : 0),
      igst_percentage: isNonGst ? 0 : (settings.defaultIgstRate !== undefined ? Number(settings.defaultIgstRate) : 0),
      hsn_code: '',
      allow_negative_stock: !!settings.allowNegativeStock,
      is_active: true
    });
    setErrors([]);
    setView('upsert');
  };

  const handleEdit = (product: Product) => {
    setCurrentProduct({ ...product });
    setErrors([]);
    setView('upsert');
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to permanently delete this product? All stock movements will be deleted.')) {
      try {
        await deleteProduct(id);
        invalidateCache('products');
      } catch (err: any) {
        alert(err.message || 'Failed to delete product. Ensure it is not linked to any purchases or invoices.');
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProduct || !currentProduct.product_name) {
      setErrors(['Product Name is required']);
      return;
    }

    setSaving(true);
    setErrors([]);
    try {
      const productToSave = {
        ...currentProduct,
        cgst_percentage: isNonGst ? 0 : currentProduct.cgst_percentage,
        sgst_percentage: isNonGst ? 0 : currentProduct.sgst_percentage,
        igst_percentage: isNonGst ? 0 : currentProduct.igst_percentage,
      };
      await saveProduct(productToSave as Product);
      invalidateCache('products');
      setView('list');
    } catch (err: any) {
      setErrors([err.message || 'Failed to save product']);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (product: Product) => {
    try {
      const updated = { ...product, is_active: !product.is_active };
      await saveProduct(updated);
      invalidateCache('products');
    } catch (err) {
      console.error(err);
    }
  };

  const handleViewMovements = async (product: Product) => {
    setSelectedProductMovements(product);
    setMovementsLoading(true);
    setShowMovementsModal(true);
    try {
      const data = await fetchProductStockMovements(product.product_id!);
      setMovements(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setMovementsLoading(false);
    }
  };

  // KPIs
  const totalProducts = products.length;
  const totalStockValue = products.reduce((acc, p) => acc + ((Number(p.current_stock) > 0 && Number(p.purchase_price) > 0) ? Number(p.current_stock) * Number(p.purchase_price) : 0), 0);
  const lowStockCount = products.filter(p => Number(p.current_stock) <= Number(p.minimum_stock_alert)).length;
  const outOfStockCount = products.filter(p => Number(p.current_stock) <= 0).length;

  const filteredProducts = products.filter(p => {
    const name = p.product_name || '';
    const code = p.product_code || '';
    const barcode = p.barcode || '';
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      barcode.includes(searchTerm);
    const matchesCategory = !selectedCategory || String(p.category_id) === selectedCategory;

    let matchesStock = true;
    if (stockFilter === 'low') {
      matchesStock = Number(p.current_stock) <= Number(p.minimum_stock_alert);
    } else if (stockFilter === 'out') {
      matchesStock = Number(p.current_stock) <= 0;
    }

    return matchesSearch && matchesCategory && matchesStock;
  });

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-200">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Inventory</h2>
          <p className="text-gray-500">Track and manage items, stock, categories, units, and audit logs.</p>
        </div>
        {view === 'list' && (
          <div>
            {activeSubTab === 'items' && (
              <button
                onClick={handleCreateNew}
                className="bg-blue-600 text-white px-8 py-3 rounded-2xl flex items-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 font-black active:scale-95"
              >
                <Plus size={22} /> Add New Item
              </button>
            )}
            {activeSubTab === 'categories' && (
              <button
                onClick={() => handleOpenCatModal()}
                className="bg-blue-600 text-white px-8 py-3 rounded-2xl flex items-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 font-black active:scale-95"
              >
                <Plus size={22} /> Add Category
              </button>
            )}
            {activeSubTab === 'units' && (
              <button
                onClick={() => handleOpenUnitModal()}
                className="bg-blue-600 text-white px-8 py-3 rounded-2xl flex items-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 font-black active:scale-95"
              >
                <Plus size={22} /> Add Unit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex border-b border-gray-200 no-print">
        <button
          onClick={() => { setActiveSubTab('items'); setView('list'); }}
          className={`px-6 py-3.5 text-sm font-bold border-b-2 transition-all ${activeSubTab === 'items' ? 'border-blue-600 text-blue-600 font-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Items Catalog
        </button>
        <button
          onClick={() => { setActiveSubTab('categories'); setView('list'); }}
          className={`px-6 py-3.5 text-sm font-bold border-b-2 transition-all ${activeSubTab === 'categories' ? 'border-blue-600 text-blue-600 font-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Categories Master
        </button>
        <button
          onClick={() => { setActiveSubTab('units'); setView('list'); }}
          className={`px-6 py-3.5 text-sm font-bold border-b-2 transition-all ${activeSubTab === 'units' ? 'border-blue-600 text-blue-600 font-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Measuring Units
        </button>
      </div>

      {view === 'list' ? (
        <>
          {activeSubTab === 'items' && (
            <>
              {/* KPI Dashboard Card Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
                  <div className="p-4 rounded-2xl bg-blue-50 text-blue-600">
                    <Package size={26} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Products</p>
                    <p className="text-2xl font-black text-gray-900 mt-1">{totalProducts}</p>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
                  <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-600">
                    <ReceiptIndianRupee size={26} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Stock Valuation</p>
                    <p className="text-2xl font-black text-gray-900 mt-1">₹{totalStockValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
                  <div className="p-4 rounded-2xl bg-amber-50 text-amber-600">
                    <AlertTriangle size={26} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Low Stock Items</p>
                    <p className="text-2xl font-black text-gray-900 mt-1">{lowStockCount}</p>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
                  <div className="p-4 rounded-2xl bg-rose-50 text-rose-600">
                    <TrendingDown size={26} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Out of Stock</p>
                    <p className="text-2xl font-black text-gray-900 mt-1">{outOfStockCount}</p>
                  </div>
                </div>
              </div>

              {/* Filters Bar */}
              <div className="bg-white p-6 rounded-[28px] shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-3 items-center flex-1 max-w-2xl">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder="Search by Name, Code, or Barcode..."
                      className="w-full pl-12 pr-4 py-3 border-gray-200 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-600 transition-all text-sm font-medium"
                      value={searchTerm}
                      onChange={e => fetchProductsCache(1, e.target.value)}
                    />
                  </div>

                  <select
                    className="border-gray-200 border rounded-xl px-4 py-3 text-sm font-bold bg-white focus:outline-none"
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                  >
                    <option value="">All Categories</option>
                    {categories.map(c => (
                      <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner">
                  <button
                    onClick={() => setStockFilter('all')}
                    className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${stockFilter === 'all' ? 'bg-white shadow-sm text-gray-900 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    All Products
                  </button>
                  <button
                    onClick={() => setStockFilter('low')}
                    className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${stockFilter === 'low' ? 'bg-white shadow-sm text-amber-600 font-bold' : 'text-gray-500 hover:text-amber-500'}`}
                  >
                    Low Stock
                  </button>
                  <button
                    onClick={() => setStockFilter('out')}
                    className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${stockFilter === 'out' ? 'bg-white shadow-sm text-rose-600 font-bold' : 'text-gray-500 hover:text-rose-500'}`}
                  >
                    Out of Stock
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                  <div className="py-24 text-center">
                    <RefreshCw className="animate-spin text-blue-600 mx-auto" size={36} />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                          <th className="px-8 py-5">Product Details</th>
                          <th className="px-8 py-5">Category</th>
                          <th className="px-8 py-5 text-center">Current Stock</th>
                          <th className="px-8 py-5 text-right">Purchase Price</th>
                          <th className="px-8 py-5 text-right">Selling Price</th>
                          <th className="px-8 py-5 text-right">Margin %</th>
                          <th className="px-8 py-5 text-right">Stock Valuation</th>
                          <th className="px-8 py-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredProducts.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-8 py-20 text-center text-gray-400 font-medium">
                              No products matches filters or stock rules.
                            </td>
                          </tr>
                        ) : (
                          filteredProducts.map(p => {
                            const isLowStock = Number(p.current_stock) <= Number(p.minimum_stock_alert);
                            const isOutOfStock = Number(p.current_stock) <= 0;
                            const stockVal = (Number(p.current_stock) > 0 && Number(p.purchase_price) > 0) ? Number(p.current_stock) * Number(p.purchase_price) : 0;

                            return (
                              <tr key={p.product_id} className="hover:bg-blue-50/30 transition-all">
                                <td className="px-8 py-6">
                                  <div>
                                    <p className="font-black text-gray-900 text-sm">{p.product_name}</p>
                                    <div className="flex gap-2 mt-1">
                                      <span className="font-mono text-[10px] text-gray-400 tracking-wider">Code: {p.product_code}</span>
                                      {p.barcode && <span className="font-mono text-[10px] text-blue-500 bg-blue-50 px-1.5 rounded">Barcode: {p.barcode}</span>}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-8 py-6 whitespace-nowrap text-sm text-gray-600 font-bold">
                                  {p.category_name || <span className="text-gray-300">Uncategorized</span>}
                                </td>
                                <td className="px-8 py-6 whitespace-nowrap text-center">
                                  <span className={`px-3 py-1.5 rounded-xl font-black font-mono text-sm inline-block ${isOutOfStock ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                    isLowStock ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                      'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                    }`}>
                                    {p.current_stock} {p.unit_short_name || 'Units'}
                                  </span>
                                </td>
                                <td className="px-8 py-6 whitespace-nowrap text-right font-mono text-sm font-bold text-gray-700">
                                  ₹{Number(p.purchase_price).toFixed(2)}
                                </td>
                                <td className="px-8 py-6 whitespace-nowrap text-right font-mono text-sm font-black text-gray-900">
                                  ₹{Number(p.selling_price).toFixed(2)}
                                </td>
                                <td className="px-8 py-6 whitespace-nowrap text-right font-mono text-sm font-black">
                                  {(() => {
                                    const cost = Number(p.purchase_price);
                                    const sell = Number(p.selling_price);
                                    if (cost <= 0) return <span className="text-gray-300">—</span>;
                                    const margin = ((sell - cost) / cost) * 100;
                                    return (
                                      <span className={margin >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                                        {margin >= 0 ? '+' : ''}{margin.toFixed(1)}%
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td className="px-8 py-6 whitespace-nowrap text-right font-mono text-sm font-black text-slate-900">
                                  {Number(p.purchase_price) <= 0 ? <span className="text-gray-300">—</span> : `₹${stockVal.toFixed(2)}`}
                                </td>
                                <td className="px-8 py-6 whitespace-nowrap text-right text-sm font-medium">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleViewMovements(p)}
                                      className="text-purple-500 hover:bg-purple-50 p-2 rounded-xl border border-transparent hover:border-purple-100"
                                      title="View Audit Trails"
                                    >
                                      <History size={18} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleEdit(p)}
                                      className="text-blue-500 hover:bg-blue-50 p-2 rounded-xl border border-transparent hover:border-blue-100"
                                      title="Edit Product Details"
                                    >
                                      <Edit2 size={18} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(p.product_id!)}
                                      className="text-red-500 hover:bg-red-50 p-2 rounded-xl border border-transparent hover:border-red-100 transition-colors"
                                      title="Delete"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  limit={25}
                  onPageChange={(page) => fetchProductsCache(page, searchTerm)}
                  loading={loading}
                />
              </div>
            </>
          )}

          {/* Categories Tab Content */}
          {activeSubTab === 'categories' && (
            <div className="space-y-6">
              <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                  <div>
                    <h3 className="font-black text-gray-900 text-lg">Product Categories</h3>
                    <p className="text-xs text-gray-400 font-bold mt-0.5">Define classifications to group items in sales/purchases.</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50/30 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                        <th className="px-8 py-5">Category Name</th>
                        <th className="px-8 py-5">Description</th>
                        <th className="px-8 py-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm font-bold text-gray-700">
                      {categories.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-8 py-16 text-center text-gray-400 font-medium">
                            No product categories found. Create one to organize your inventory.
                          </td>
                        </tr>
                      ) : (
                        categories.map(c => (
                          <tr key={c.category_id} className="hover:bg-blue-50/30 transition-all">
                            <td className="px-8 py-5 font-black text-gray-900">{c.category_name}</td>
                            <td className="px-8 py-5 text-gray-500 font-medium">{c.description || <span className="italic text-gray-300">No description provided</span>}</td>
                            <td className="px-8 py-5 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenCatModal(c)}
                                  className="text-blue-500 hover:bg-blue-50 p-2 rounded-xl border border-transparent hover:border-blue-100"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategory(c.category_id!)}
                                  className="text-gray-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-xl transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Measuring Units Tab Content */}
          {activeSubTab === 'units' && (
            <div className="space-y-6">
              <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                  <div>
                    <h3 className="font-black text-gray-900 text-lg">Measuring Units</h3>
                    <p className="text-xs text-gray-400 font-bold mt-0.5">Standardize units like Pcs, Grams, Box, or Pkts for item tracking.</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50/30 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                        <th className="px-8 py-5">Unit Name</th>
                        <th className="px-8 py-5">Short / Display Code</th>
                        <th className="px-8 py-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm font-bold text-gray-700">
                      {units.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-8 py-16 text-center text-gray-400 font-medium">
                            No measuring units registered.
                          </td>
                        </tr>
                      ) : (
                        units.map(u => (
                          <tr key={u.unit_id} className="hover:bg-blue-50/30 transition-all">
                            <td className="px-8 py-5 font-black text-gray-900">{u.unit_name}</td>
                            <td className="px-8 py-5 font-mono text-sm text-gray-600">{u.short_name}</td>
                            <td className="px-8 py-5 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenUnitModal(u)}
                                  className="text-blue-500 hover:bg-blue-50 p-2 rounded-xl border border-transparent hover:border-blue-100"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUnit(u.unit_id!)}
                                  className="text-gray-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-xl transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Create/Edit Upsert View */
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSave} className="space-y-8">

            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
              <h3 className="text-xl font-bold text-gray-900">
                {currentProduct?.product_id ? 'Edit Product' : 'Create New Product'}
              </h3>

              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl text-red-600 text-sm">
                  {errors.map((e, idx) => <p key={idx}>{e}</p>)}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Product Name*</label>
                  <input
                    type="text"
                    required
                    className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all font-bold text-lg"
                    placeholder="e.g. Premium White Diamond Ring"
                    value={currentProduct?.product_name || ''}
                    onChange={e => setCurrentProduct({ ...currentProduct, product_name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Product Code (SKU)</label>
                  <input
                    type="text"
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                    placeholder="Leave blank to auto-generate"
                    value={currentProduct?.product_code || ''}
                    onChange={e => setCurrentProduct({ ...currentProduct, product_code: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Barcode</label>
                  <input
                    type="text"
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                    placeholder="e.g. 8901234567"
                    value={currentProduct?.barcode || ''}
                    onChange={e => setCurrentProduct({ ...currentProduct, barcode: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Category</label>
                  <select
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none bg-white font-bold"
                    value={currentProduct?.category_id || ''}
                    onChange={e => setCurrentProduct({ ...currentProduct, category_id: parseInt(e.target.value) || undefined })}
                  >
                    <option value="">Select Category...</option>
                    {categories.map(c => (
                      <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Stock Unit</label>
                  <select
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none bg-white font-bold"
                    value={currentProduct?.unit_id || ''}
                    onChange={e => setCurrentProduct({ ...currentProduct, unit_id: parseInt(e.target.value) || undefined })}
                  >
                    <option value="">Select Unit...</option>
                    {units.map(u => (
                      <option key={u.unit_id} value={u.unit_id}>{u.unit_name} ({u.short_name})</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Item Description</label>
                  <textarea
                    rows={3}
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none"
                    placeholder="Describe item attributes (e.g. carat size, purity, metal weight)"
                    value={currentProduct?.item_description || ''}
                    onChange={e => setCurrentProduct({ ...currentProduct, item_description: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Pricing Section */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
              <h3 className="text-xl font-bold text-gray-900">Pricing & Taxes</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Purchase Price (Cost)</label>
                  <input
                    type="text" inputMode="decimal"
                    step="0.01"
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono font-bold"
                    value={currentProduct?.purchase_price || 0}
                    onChange={e => {
                      const cost = parseFloat(e.target.value) || 0;
                      const profit = currentProduct?.profit_percentage || 0;
                      const selling = cost * (1 + profit / 100);
                      setCurrentProduct({ ...currentProduct, purchase_price: cost, selling_price: Number(selling.toFixed(2)) });
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Profit Margin (%)</label>
                  <input
                    type="text" inputMode="decimal"
                    step="0.1"
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono font-bold text-emerald-600"
                    value={currentProduct?.profit_percentage || 0}
                    onChange={e => {
                      const profit = parseFloat(e.target.value) || 0;
                      const cost = currentProduct?.purchase_price || 0;
                      const selling = cost * (1 + profit / 100);
                      setCurrentProduct({ ...currentProduct, profit_percentage: profit, selling_price: Number(selling.toFixed(2)) });
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Selling Price (M.R.P.)</label>
                  <input
                    type="text" inputMode="decimal"
                    step="0.01"
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono font-bold"
                    value={currentProduct?.selling_price || 0}
                    onChange={e => {
                      const selling = parseFloat(e.target.value) || 0;
                      const cost = currentProduct?.purchase_price || 0;
                      const profit = cost > 0 ? ((selling - cost) / cost) * 100 : 0;
                      setCurrentProduct({ ...currentProduct, selling_price: selling, profit_percentage: Number(profit.toFixed(1)) });
                    }}
                  />
                </div>

                {!isNonGst && (
                  <>
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">CGST (%)</label>
                      <input
                        type="text" inputMode="decimal"
                        className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                        value={currentProduct?.cgst_percentage || 0}
                        onChange={e => setCurrentProduct({ ...currentProduct, cgst_percentage: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">SGST (%)</label>
                      <input
                        type="text" inputMode="decimal"
                        className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                        value={currentProduct?.sgst_percentage || 0}
                        onChange={e => setCurrentProduct({ ...currentProduct, sgst_percentage: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">IGST (%)</label>
                      <input
                        type="text" inputMode="decimal"
                        className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                        value={currentProduct?.igst_percentage || 0}
                        onChange={e => setCurrentProduct({ ...currentProduct, igst_percentage: parseFloat(e.target.value) || 0 })}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">HSN Code</label>
                      <input
                        type="text"
                        className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                        placeholder="e.g. 7113"
                        value={currentProduct?.hsn_code || ''}
                        onChange={e => {
                          const cleaned = e.target.value.replace(/\D/g, '').substring(0, 8);
                          setCurrentProduct({ ...currentProduct, hsn_code: cleaned });
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Inventory Controls */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
              <h3 className="text-xl font-bold text-gray-900">Stock & Alerts</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Current Stock</label>
                  <input
                    type="text"
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                    placeholder="e.g. 100"
                    value={currentProduct?.current_stock === undefined ? '' : currentProduct.current_stock}
                    onChange={e => {
                      const cleaned = e.target.value.replace(/\D/g, '');
                      setCurrentProduct({ ...currentProduct, current_stock: parseInt(cleaned) || 0 });
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Low Stock Alert Threshold</label>
                  <input
                    type="text"
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                    placeholder="e.g. 10"
                    value={currentProduct?.minimum_stock_alert === undefined ? '' : currentProduct.minimum_stock_alert}
                    onChange={e => {
                      const cleaned = e.target.value.replace(/\D/g, '');
                      setCurrentProduct({ ...currentProduct, minimum_stock_alert: parseInt(cleaned) || 0 });
                    }}
                  />
                </div>

                <div className="md:col-span-2 flex items-center gap-3 p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                  <input
                    type="checkbox"
                    id="negStock"
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500/20"
                    checked={currentProduct?.allow_negative_stock || false}
                    onChange={e => setCurrentProduct({ ...currentProduct, allow_negative_stock: e.target.checked })}
                  />
                  <label htmlFor="negStock" className="text-sm font-bold text-gray-700 select-none">
                    Allow Negative Stock (Permit checkout when item quantity is 0)
                  </label>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 sticky bottom-4 z-20 bg-white/95 backdrop-blur border border-gray-200 p-4 rounded-2xl shadow-lg">
              <button
                type="button"
                onClick={() => setView('list')}
                className="px-6 py-3 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 font-black transition-all disabled:opacity-50"
              >
                {saving ? <RefreshCw className="animate-spin" size={18} /> : <Check size={18} />}
                Save Product
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stock Audit Trails History Modal */}
      {showMovementsModal && selectedProductMovements && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl max-w-3xl w-full overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <History className="text-purple-600" size={20} /> Stock Movement Audit Trails
                </h3>
                <p className="text-xs text-gray-400 font-bold mt-0.5">{selectedProductMovements.product_name} ({selectedProductMovements.product_code})</p>
              </div>
              <button onClick={() => setShowMovementsModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 max-h-[480px] overflow-y-auto">
              {movementsLoading ? (
                <div className="py-12 text-center">
                  <RefreshCw className="animate-spin text-purple-600 mx-auto" size={28} />
                </div>
              ) : movements.length === 0 ? (
                <div className="py-12 text-center text-gray-400 font-medium">
                  No stock movements found. All records are currently at opening balance.
                </div>
              ) : (
                <div className="border border-gray-100 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      <tr>
                        <th className="px-5 py-3">Timestamp</th>
                        <th className="px-5 py-3">Type</th>
                        <th className="px-5 py-3 text-center">Qty Change</th>
                        <th className="px-5 py-3 text-center">Before</th>
                        <th className="px-5 py-3 text-center">After</th>
                        <th className="px-5 py-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {movements.map((mv) => (
                        <tr key={mv.movement_id} className="hover:bg-purple-50/20">
                          <td className="px-5 py-3.5 whitespace-nowrap text-xs text-gray-500">
                            {new Date(mv.created_at!).toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${mv.movement_type === 'Purchase' || mv.movement_type === 'Purchase In' || mv.movement_type === 'Sale Return In' ? 'bg-green-50 text-green-700 border border-green-100' :
                              mv.movement_type === 'Sale' || mv.movement_type === 'Sale Out' || mv.movement_type === 'Purchase Return Out' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                'bg-purple-50 text-purple-700 border border-purple-100'
                              }`}>
                              {mv.movement_type}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-center font-mono font-black text-sm">
                            {mv.quantity > 0 ? `+${mv.quantity}` : mv.quantity}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-center font-mono text-xs text-gray-500">
                            {mv.stock_before}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-center font-mono font-black text-xs text-gray-800">
                            {mv.stock_after}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-600 italic">
                            {mv.notes || `${mv.reference_type} #${mv.reference_id}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowMovementsModal(false)}
                className="px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-black"
              >
                Close Audit Logs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal Form */}
      {showCatModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-black text-gray-900">
                {editingCategory?.category_id ? 'Edit Category' : 'Create New Category'}
              </h3>
              <button onClick={() => setShowCatModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Category Name*</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gold Jewelry, Loose Diamonds"
                  className="w-full border-gray-200 rounded-xl p-4 border font-bold text-sm focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all"
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Enter a description for this category (optional)"
                  className="w-full border-gray-200 rounded-xl p-4 border text-sm focus:outline-none"
                  value={catDesc}
                  onChange={e => setCatDesc(e.target.value)}
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCatModal(false)}
                  className="px-5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 text-sm font-bold hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCat}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 flex items-center gap-1.5"
                >
                  {submittingCat && <RefreshCw className="animate-spin" size={14} />}
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unit Modal Form */}
      {showUnitModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl max-w-md w-full overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-black text-gray-900">
                {editingUnit?.unit_id ? 'Edit Measuring Unit' : 'Create New Measuring Unit'}
              </h3>
              <button onClick={() => setShowUnitModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUnit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Unit Name*</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grams, Pieces, Carats"
                  className="w-full border-gray-200 rounded-xl p-4 border font-bold text-sm focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all"
                  value={unitName}
                  onChange={e => setUnitName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Short / Display Code*</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. g, pcs, ct"
                  className="w-full border-gray-200 rounded-xl p-4 border font-mono text-sm focus:outline-none"
                  value={unitShortName}
                  onChange={e => setUnitShortName(e.target.value)}
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowUnitModal(false)}
                  className="px-5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 text-sm font-bold hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUnit}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 flex items-center gap-1.5"
                >
                  {submittingUnit && <RefreshCw className="animate-spin" size={14} />}
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
