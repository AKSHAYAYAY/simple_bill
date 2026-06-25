import React, { useState, useEffect } from 'react';
import { Purchase, Supplier, PurchaseItem, Product } from '../types';
import { Plus, Search, Pencil, Trash2, ArrowLeft, RefreshCcw, Save, AlertCircle, Calendar, FileText, User, UserPlus, IndianRupee, Eye } from 'lucide-react';
import { fetchPurchasesPaginated, savePurchase, fetchSuppliers, fetchProducts, saveSupplier, getSettings, fetchCategories, fetchUnits, saveProduct } from '../services/dataService';
import { SearchableSelect } from '../components/SearchableSelect';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PaginationControls } from '../components/PaginationControls';
import { ProductModal } from '../components/ProductModal';
import { Category, Unit } from '../types';
import { PhoneInput } from '../components/PhoneInput';
import { GSTInput, validateGST } from '../components/GSTInput';
import { useApp } from '../context/AppContext';
import { ErrorPopup } from '../components/ErrorPopup';
import { PaymentModal } from '../components/PaymentModal';

export const Purchases: React.FC = () => {
  const {
    purchasesCache, fetchPurchases, invalidateCache,
    suppliersCache, productsCache,
    categories, units, settings, fetchProductsCache, fetchSuppliers
  } = useApp();

  const [showProductModal, setShowProductModal] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const [view, setView] = useState<'list' | 'create' | 'preview'>('list');
  const [currentPurchase, setCurrentPurchase] = useState<Purchase | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentSupplier, setPaymentSupplier] = useState<Supplier | null>(null);

  const [supplierMode, setSupplierMode] = useState<'existing' | 'new'>('existing');
  const [newSupplier, setNewSupplier] = useState({
    supplier_name: '', company_name: '', email: '', phone: '', gst_number: '', address: ''
  });

  // Use Global Cache State
  const purchases = purchasesCache.data;
  const currentPage = purchasesCache.currentPage;
  const totalPages = purchasesCache.totalPages;
  const totalItems = purchasesCache.totalItems;
  const loading = purchasesCache.isLoading;
  const searchTerm = purchasesCache.search;

  const suppliers = suppliersCache.data;
  const products = productsCache.data;

  useEffect(() => {
    fetchPurchases();
    // Pre-load suppliers and products if not loaded
    if (suppliers.length === 0) fetchSuppliers(1, '', false);
    if (products.length === 0) fetchProductsCache(1, '', false);
  }, [purchasesCache.currentPage, purchasesCache.search, purchasesCache.needsRefresh]);

  const handleCreateNew = () => {
    setCurrentPurchase({
      supplier_id: 0,
      purchase_date: new Date().toISOString().split('T')[0],
      reference_number: '',
      payment_terms: 'Immediate',
      subtotal: 0,
      tax_amount: 0,
      discount_amount: 0,
      shipping_charges: 0,
      transport_cost: 0,
      loading_cost: 0,
      other_charges: 0,
      transport_paid_by: 'Business',
      transport_vehicle_no: '',
      transport_notes: '',
      round_off: 0,
      grand_total: 0,
      amount_paid: 0,
      payment_status: 'Unpaid',
      payment_mode: 'Cash',
      items: []
    });
    setSupplierMode('existing');
    setErrors([]);
    setView('create');
  };

  const getProductTaxRates = (prod: Product | null) => {
    if (settings.gstType === 'NON_GST') {
      return { cgst: 0, sgst: 0, igst: 0, taxRate: 0 };
    }

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (prod) {
      cgst = prod.cgst_percentage !== undefined && prod.cgst_percentage !== null ? Number(prod.cgst_percentage) : Number(settings.defaultCgstRate || 0);
      sgst = prod.sgst_percentage !== undefined && prod.sgst_percentage !== null ? Number(prod.sgst_percentage) : Number(settings.defaultSgstRate || 0);
      igst = prod.igst_percentage !== undefined && prod.igst_percentage !== null ? Number(prod.igst_percentage) : Number(settings.defaultIgstRate || 0);
    } else {
      cgst = Number(settings.defaultCgstRate || 0);
      sgst = Number(settings.defaultSgstRate || 0);
      igst = Number(settings.defaultIgstRate || 0);
    }

    if (settings.defaultSaleTaxMode === 'No Tax') {
      return { cgst: 0, sgst: 0, igst: 0, taxRate: 0 };
    } else if (settings.defaultSaleTaxMode === 'IGST') {
      return { cgst: 0, sgst: 0, igst, taxRate: igst };
    } else {
      // CGST+SGST
      return { cgst, sgst, igst: 0, taxRate: cgst + sgst };
    }
  };

  const handleAddItem = () => {
    if (!currentPurchase) return;
    const defaultTaxes = getProductTaxRates(null);

    const newItem: PurchaseItem = {
      product_id: 0,
      quantity: 1,
      free_quantity: 0,
      unit_price: 0,
      purchase_price: 0,
      selling_price: 0,
      profit_percentage: 0,
      tax_rate: defaultTaxes.taxRate,
      cgst_percentage: defaultTaxes.cgst,
      sgst_percentage: defaultTaxes.sgst,
      igst_percentage: defaultTaxes.igst,
      discount: 0,
      discount_amount: 0,
      discount_percentage: 0,
      total_tax: 0,
      description: ''
    };
    const updatedItems = [...currentPurchase.items, newItem];
    calculateTotals(updatedItems, currentPurchase);
  };

  const handleRemoveItem = (index: number) => {
    if (!currentPurchase) return;
    const updatedItems = currentPurchase.items.filter((_, i) => i !== index);
    calculateTotals(updatedItems, currentPurchase);
  };

  const handleUpdateItem = (index: number, field: keyof PurchaseItem, value: any) => {
    if (!currentPurchase) return;
    let updatedItems = [...currentPurchase.items];
    let item = { ...updatedItems[index], [field]: value };

    // Auto calculate profit % if purchase or selling price changes
    if (field === 'purchase_price' || field === 'unit_price' || field === 'selling_price') {
      const pp = field === 'purchase_price' || field === 'unit_price' ? Number(value) : Number(item.purchase_price);
      item.unit_price = pp;
      item.purchase_price = pp;
      const sp = field === 'selling_price' ? Number(value) : Number(item.selling_price);
      if (pp > 0 && sp > 0) {
        item.profit_percentage = Number((((sp - pp) / pp) * 100).toFixed(2));
      }
    }

    // Auto calculate SGST + CGST + IGST total
    if (settings.gstType === 'NON_GST') {
      item.cgst_percentage = 0;
      item.sgst_percentage = 0;
      item.igst_percentage = 0;
      item.tax_rate = 0;
    } else if (field === 'cgst_percentage' || field === 'sgst_percentage' || field === 'igst_percentage') {
      item.tax_rate = Number(item.cgst_percentage || 0) + Number(item.sgst_percentage || 0) + Number(item.igst_percentage || 0);
    }

    updatedItems[index] = item;
    calculateTotals(updatedItems, currentPurchase);
  };

  const handleProductSelect = (index: number, productIdStr: string) => {
    if (!currentPurchase) return;

    if (productIdStr === 'new' || productIdStr === '0') {
      setActiveRowIndex(index);
      setShowProductModal(true);
      return;
    }

    const productId = parseInt(productIdStr);
    const selectedProduct = products.find(p => p.product_id === productId);
    if (!selectedProduct) return;
    const { cgst, sgst, igst, taxRate } = getProductTaxRates(selectedProduct);

    const updatedItems = currentPurchase.items.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          product_id: selectedProduct.product_id!,
          description: selectedProduct.product_name,
          unit_price: Number(selectedProduct.purchase_price || 0),
          purchase_price: Number(selectedProduct.purchase_price || 0),
          selling_price: Number(selectedProduct.selling_price || 0),
          profit_percentage: Number(selectedProduct.profit_percentage || 0),
          tax_rate: taxRate,
          cgst_percentage: cgst,
          sgst_percentage: sgst,
          igst_percentage: igst
        };
      }
      return item;
    });
    calculateTotals(updatedItems, currentPurchase);
  };

  const handleUpdateMetadata = (field: keyof Purchase, value: any) => {
    if (!currentPurchase) return;
    const updated = { ...currentPurchase, [field]: value };
    calculateTotals(updated.items, updated);
  };

  const calculateTotals = (items: PurchaseItem[], purchaseObj: Purchase) => {
    let subtotal = 0;
    let tax_amount = 0;

    const computedItems = items.map(item => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.purchase_price || item.unit_price) || 0;
      const discAmt = Number(item.discount_amount) || 0;

      const lineNet = (qty * price) - discAmt;

      // Calculate tax components
      const isNonGst = settings.gstType === 'NON_GST';
      const cgst = isNonGst ? 0 : lineNet * (Number(item.cgst_percentage) / 100);
      const sgst = isNonGst ? 0 : lineNet * (Number(item.sgst_percentage) / 100);
      const igst = isNonGst ? 0 : lineNet * (Number(item.igst_percentage) / 100);
      const lineTax = cgst + sgst + igst;

      subtotal += lineNet;
      tax_amount += lineTax;

      return {
        ...item,
        cgst_percentage: isNonGst ? 0 : item.cgst_percentage,
        sgst_percentage: isNonGst ? 0 : item.sgst_percentage,
        igst_percentage: isNonGst ? 0 : item.igst_percentage,
        tax_rate: isNonGst ? 0 : item.tax_rate,
        total_tax: lineTax
      };
    });

    const discOverall = Number(purchaseObj.discount_amount) || 0;
    const trans = Number(purchaseObj.transport_cost) || 0;
    const load = Number(purchaseObj.loading_cost) || 0;
    const other = Number(purchaseObj.other_charges) || 0;

    // Grand Total
    const rawTotal = subtotal + tax_amount + trans + load + other - discOverall;
    const grand_total = Math.round(rawTotal);
    const round_off = Number((grand_total - rawTotal).toFixed(2));

    setCurrentPurchase({
      ...purchaseObj,
      items: computedItems,
      subtotal: Number(subtotal.toFixed(2)),
      tax_amount: Number(tax_amount.toFixed(2)),
      grand_total,
      round_off
    });
  };

  const validateForm = () => {
    const errs = [];
    if (supplierMode === 'existing' && (!currentPurchase?.supplier_id || isNaN(Number(currentPurchase.supplier_id)) || Number(currentPurchase.supplier_id) <= 0)) {
      errs.push('Please select a valid supplier');
    }
    if (supplierMode === 'new' && !newSupplier.supplier_name.trim()) {
      errs.push('New Supplier Name is required');
    }
    if (!currentPurchase?.items || currentPurchase.items.length === 0) {
      errs.push('At least one item must be added to the purchase bill');
    }

    currentPurchase?.items.forEach((item, idx) => {
      if (!item.product_id) errs.push(`Row ${idx + 1}: Select a product`);
      if (item.quantity <= 0) errs.push(`Row ${idx + 1}: Quantity must be greater than 0`);
      if ((item.purchase_price || item.unit_price) <= 0) errs.push(`Row ${idx + 1}: Purchase price must be greater than 0`);
    });
    if (Number(currentPurchase?.amount_paid || 0) > Number(currentPurchase?.grand_total || 0)) {
      errs.push(`Amount paid cannot exceed invoice value (₹${Number(currentPurchase?.grand_total || 0).toFixed(2)})`);
    }

    setErrors(errs);
    return errs.length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPurchase || saving) return;
    if (!validateForm()) return;

    setSaving(true);
    setErrors([]);
    window.dispatchEvent(new CustomEvent('simplebill:show-loader', { detail: { message: 'Recording Purchase...' } }));

    let finalPurchase = { ...currentPurchase };

    try {
      if (supplierMode === 'new') {
        const dummyId = Date.now().toString();
        const supplierObj = {
          supplier_name: newSupplier.supplier_name,
          company_name: newSupplier.company_name,
          email: newSupplier.email,
          phone: newSupplier.phone,
          gst_number: newSupplier.gst_number,
          address: newSupplier.address
        } as Supplier;
        // In this app architecture, if we pass new_supplier to purchaseData, the backend will auto-create it!
        // The updated backend service `createPurchase` in purchase.service.js already handles `new_supplier`.
        finalPurchase.new_supplier = supplierObj;
        finalPurchase.supplier_id = 0; // Reset so backend knows to use new_supplier
      }

      await savePurchase(finalPurchase);
      invalidateCache('purchases');
      if (supplierMode === 'new') invalidateCache('suppliers');
      setView('list');
    } catch (err: any) {
      setErrors([err.message || 'Failed to record purchase']);
    } finally {
      setSaving(false);
      window.dispatchEvent(new CustomEvent('simplebill:hide-loader'));
    }
  };

  const handlePreview = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setView('preview');
  };

  const filteredPurchases = purchases;

  const supplierOptions = suppliers.map(s => ({
    id: s.supplier_id!.toString(),
    label: s.supplier_name,
    subLabel: s.phone || s.gst_number
  }));

  if (view === 'preview' && selectedPurchase) {
    return (
      <ErrorBoundary fallback="Unable to load items for this order.">
        <div className="max-w-4xl mx-auto pb-24 animate-in fade-in duration-200">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm mb-6">
            <button onClick={() => setView('list')} className="text-gray-600 hover:text-gray-900 font-bold px-4 py-2 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2">
              <ArrowLeft size={16} /> Back to List
            </button>
            <button onClick={() => window.print()} className="px-6 py-2 bg-slate-900 text-white rounded-xl shadow-lg hover:bg-black font-bold">
              Print Bill
            </button>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            <div className="flex justify-between border-b border-gray-100 pb-6">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-gray-900">PURCHASE BILL</h1>
                <p className="text-sm font-mono text-gray-400">Ref: {selectedPurchase.supplier_invoice_no || selectedPurchase.reference_number || `#${selectedPurchase.purchase_id}`}</p>
              </div>
              <div className="text-right">
                <span className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full ${selectedPurchase.payment_status === 'Paid' ? 'bg-green-100 text-green-700' :
                  selectedPurchase.payment_status === 'Partially Paid' || selectedPurchase.payment_status === 'Partial' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                  {selectedPurchase.payment_status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 text-sm border-b border-gray-100 pb-6">
              <div>
                <p className="font-bold text-gray-400 uppercase text-xs tracking-wider">Supplier</p>
                <p className="font-black text-gray-900 mt-1 text-lg">
                  {suppliers.find(s => s.supplier_id === selectedPurchase.supplier_id)?.supplier_name || selectedPurchase.new_supplier?.supplier_name || 'Unknown Supplier'}
                </p>
                <p className="text-gray-500 font-medium">GST: {suppliers.find(s => s.supplier_id === selectedPurchase.supplier_id)?.gst_number || '-'}</p>
              </div>
              <div className="text-right space-y-2">
                <div>
                  <p className="font-bold text-gray-400 uppercase text-xs tracking-wider">Date of Issue</p>
                  <p className="font-black text-gray-900 mt-1">{new Date(selectedPurchase.purchase_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="font-bold text-gray-400 uppercase text-xs tracking-wider">System ID</p>
                  <p className="font-mono font-medium text-gray-600 mt-1">{selectedPurchase.purchase_invoice_no}</p>
                </div>
              </div>
            </div>

            <div className="border border-gray-100 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-4">Item & Description</th>
                    <th className="px-4 py-4 text-center">Qty / Free</th>
                    <th className="px-4 py-4 text-right">Unit Price</th>
                    <th className="px-4 py-4 text-right">Tax (C+S+I)</th>
                    <th className="px-4 py-4 text-right">Net Line</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedPurchase.items?.map((item, idx) => {
                    const qty = Number(item.quantity);
                    const price = Number(item.purchase_price || item.unit_price);
                    const disc = Number(item.discount_amount || 0);
                    const netBeforeTax = (qty * price) - disc;
                    const c = item.cgst_percentage || 0;
                    const s = item.sgst_percentage || 0;
                    const i = item.igst_percentage || 0;
                    const taxAmt = netBeforeTax * ((c + s + i) / 100);

                    return (
                      <tr key={idx}>
                        <td className="px-4 py-4">
                          <p className="font-bold text-gray-900">{item.description || `Product #${item.product_id}`}</p>
                          {disc > 0 && <p className="text-[10px] text-green-600 font-black">Discount: ₹{disc}</p>}
                        </td>
                        <td className="px-4 py-4 text-center font-mono text-gray-600">
                          {qty} <span className="text-gray-400">/ +{item.free_quantity || 0}</span>
                        </td>
                        <td className="px-4 py-4 text-right font-mono">₹{price.toFixed(2)}</td>
                        <td className="px-4 py-4 text-right font-mono">
                          {c}% + {s}% + {i}%
                          <br />
                          <span className="text-xs text-gray-400">(₹{taxAmt.toFixed(2)})</span>
                        </td>
                        <td className="px-4 py-4 text-right font-mono font-black text-gray-900">
                          ₹{(netBeforeTax + taxAmt).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-8 pt-6">
              <div className="space-y-4">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Transportation & Extras</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600 font-medium">
                    <span>Transport Cost</span>
                    <span className="font-mono">₹{Number(selectedPurchase.transport_cost || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 font-medium">
                    <span>Loading Cost</span>
                    <span className="font-mono">₹{Number(selectedPurchase.loading_cost || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 font-medium">
                    <span>Other Charges</span>
                    <span className="font-mono">₹{Number(selectedPurchase.other_charges || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 font-medium">
                    <span>Paid By</span>
                    <span className="font-bold">{selectedPurchase.transport_paid_by || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-sm bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                <div className="flex justify-between text-gray-500 font-medium">
                  <span>Subtotal (Net)</span>
                  <span className="font-mono">₹{Number(selectedPurchase.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500 font-medium">
                  <span>Total Tax Applied</span>
                  <span className="font-mono">₹{Number(selectedPurchase.tax_amount || 0).toFixed(2)}</span>
                </div>
                {(Number(selectedPurchase.transport_cost || 0) > 0 || Number(selectedPurchase.loading_cost || 0) > 0 || Number(selectedPurchase.other_charges || 0) > 0) ? (
                  <div className="flex justify-between text-gray-500 font-medium">
                    <span>Transport & Extras</span>
                    <span className="font-mono">₹{(Number(selectedPurchase.transport_cost || 0) + Number(selectedPurchase.loading_cost || 0) + Number(selectedPurchase.other_charges || 0)).toFixed(2)}</span>
                  </div>
                ) : null}
                {Number(selectedPurchase.discount_amount || 0) > 0 ? (
                  <div className="flex justify-between text-green-600 font-medium">
                    <span>Overall Discount</span>
                    <span className="font-mono">-₹{Number(selectedPurchase.discount_amount || 0).toFixed(2)}</span>
                  </div>
                ) : null}
                {Number(selectedPurchase.round_off || 0) !== 0 && (
                  <div className="flex justify-between text-gray-500 font-medium">
                    <span>Round Off</span>
                    <span className="font-mono">₹{Number(selectedPurchase.round_off || 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xl font-black text-gray-950 pt-3 border-t border-gray-200">
                  <span>Grand Total</span>
                  <span className="font-mono">₹{Number(selectedPurchase.grand_total || 0).toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-blue-600 font-black pt-3 border-t border-gray-100">
                  <span>Amount Paid</span>
                  <span className="font-mono">₹{Number(selectedPurchase.amount_paid || selectedPurchase.paid_amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-orange-600 font-black pt-1">
                  <span>Balance Due</span>
                  <span className="font-mono">₹{Math.max(0, Number(selectedPurchase.grand_total || 0) - Number(selectedPurchase.amount_paid || selectedPurchase.paid_amount || 0)).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (view === 'create' && currentPurchase) {
    return (
      <div className="max-w-6xl mx-auto pb-24 animate-in fade-in duration-200">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Record Purchase Bill</h2>
            <p className="text-gray-500 text-sm">Add stock seamlessly with detailed tax & logistics tracking.</p>
          </div>
          <button onClick={() => setView('list')} className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-bold transition-all shadow-sm flex items-center gap-2">
            <ArrowLeft size={16} /> Cancel
          </button>
        </div>

        <ErrorPopup errors={errors} onClose={() => setErrors([])} />

        <form onSubmit={handleSave} className="space-y-8">
          {/* Supplier Selection - New / Existing */}
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6 animate-in slide-in-from-top-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-950 flex items-center gap-2">
                <User size={20} className="text-blue-600" /> Supplier Details
              </h3>
              <div className="bg-gray-100 p-1 rounded-xl flex gap-1">
                <button
                  type="button"
                  onClick={() => setSupplierMode('existing')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${supplierMode === 'existing' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  <Search size={14} /> Existing
                </button>
                <button
                  type="button"
                  onClick={() => setSupplierMode('new')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${supplierMode === 'new' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  <UserPlus size={14} /> New Supplier
                </button>
              </div>
            </div>

            {supplierMode === 'existing' ? (
              <div className="max-w-md">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Search Supplier*</label>
                <SearchableSelect
                  options={supplierOptions}
                  value={currentPurchase.supplier_id ? currentPurchase.supplier_id.toString() : ''}
                  onChange={(val) => handleUpdateMetadata('supplier_id', parseInt(val) || 0)}
                  placeholder="Type to search suppliers..."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Supplier Name*</label>
                  <input
                    type="text"
                    required
                    className="w-full border-gray-200 rounded-xl p-3 border focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all font-medium"
                    value={newSupplier.supplier_name}
                    onChange={e => setNewSupplier({ ...newSupplier, supplier_name: e.target.value })}
                    placeholder="E.g. Acme Corp"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Company Name</label>
                  <input
                    type="text"
                    className="w-full border-gray-200 rounded-xl p-3 border focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all font-medium"
                    value={newSupplier.company_name}
                    onChange={e => setNewSupplier({ ...newSupplier, company_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Phone Number</label>
                  <PhoneInput
                    value={newSupplier.phone}
                    onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  />
                </div>
                <div>
                  <GSTInput
                    label="GSTIN (Optional)"
                    value={newSupplier.gst_number}
                    onChange={(e: any) => setNewSupplier({ ...newSupplier, gst_number: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
            <h3 className="text-xl font-bold text-gray-950 flex items-center gap-2">
              <FileText size={20} className="text-blue-600" /> Bill Metadata
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="md:col-span-2">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Reference / Bill #</label>
                <input
                  type="text"
                  className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all font-medium font-mono"
                  value={currentPurchase.supplier_invoice_no || currentPurchase.reference_number || ''}
                  onChange={e => {
                    handleUpdateMetadata('supplier_invoice_no', e.target.value);
                    handleUpdateMetadata('reference_number', e.target.value);
                  }}
                  placeholder="BILL-XYZ-123"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Purchase Date</label>
                <input
                  type="date"
                  required
                  className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all font-medium"
                  value={currentPurchase.purchase_date}
                  onChange={e => handleUpdateMetadata('purchase_date', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ERP Inline Items Table */}
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-950">Line Items</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveRowIndex(null);
                    setShowProductModal(true);
                  }}
                  className="bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 flex items-center gap-2 font-bold shadow-lg shadow-blue-100 transition-all active:scale-95 text-sm"
                >
                  <Plus size={18} /> Add New Item
                </button>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="bg-slate-900 text-white px-5 py-2.5 rounded-xl hover:bg-black flex items-center gap-2 font-bold shadow-lg transition-all active:scale-95 text-sm"
                >
                  <Plus size={18} /> Add Item
                </button>
              </div>
            </div>

            <div className="border border-gray-100 rounded-2xl overflow-x-auto" style={{ minHeight: '500px', maxHeight: '750px', overflowY: 'auto' }}>
              <table className="w-full text-left text-sm min-w-[1200px] border-collapse relative">
                <thead className="bg-slate-900 text-white text-xs font-black uppercase tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-4 w-64 rounded-tl-2xl">Product Details</th>
                    <th className="px-2 py-4 text-center w-20">Qty</th>
                    <th className="px-2 py-4 text-center w-20">Free</th>
                    <th className="px-2 py-4 text-right w-28">Buy Price</th>
                    <th className="px-2 py-4 text-right w-28 text-orange-200">Sell Price</th>
                    <th className="px-2 py-4 text-center w-20 text-green-200">Margin %</th>
                    {settings.gstType !== 'NON_GST' && (
                      <th className="px-2 py-4 text-center w-28">GST (C|S|I)</th>
                    )}
                    <th className="px-2 py-4 text-right w-24">Discount</th>
                    <th className="px-4 py-4 text-right w-36">Net Total</th>
                    <th className="px-4 py-4 text-center w-12 rounded-tr-2xl"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {currentPurchase.items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-24 text-center text-gray-400 font-medium text-lg">
                        No items registered. Click Add Item to start.
                      </td>
                    </tr>
                  ) : (
                    currentPurchase.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/10">
                        <td className="px-2 py-3 align-top">
                          <div className="flex items-start gap-1.5">
                            <div className="flex-1">
                              <SearchableSelect
                                className="w-full text-xs font-black"
                                value={item.product_id ? item.product_id.toString() : ''}
                                onChange={(val) => handleProductSelect(idx, val)}
                                placeholder="Select Product..."
                                options={products.map(p => ({
                                  id: p.product_id!.toString(),
                                  label: p.product_name,
                                  subLabel: `Code: ${p.product_code || 'N/A'} | Stock: ${p.current_stock}`
                                }))}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveRowIndex(idx);
                                setShowProductModal(true);
                              }}
                              className="p-2.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors shrink-0"
                              title="Add New Product"
                            >
                              <Plus size={16} strokeWidth={3} />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center align-top">
                          <input
                            type="text"
                            required
                            className="w-full border-slate-300 rounded-lg p-2 border-2 font-black text-center font-mono text-sm bg-white text-slate-900 focus:border-blue-600 focus:outline-none"
                            value={item.quantity || ''}
                            onChange={e => {
                              const cleaned = e.target.value.replace(/\D/g, '');
                              handleUpdateItem(idx, 'quantity', parseInt(cleaned) || 0);
                            }}
                          />
                        </td>
                        <td className="px-2 py-3 text-center align-top">
                          <input
                            type="text"
                            className="w-full border-slate-300 rounded-lg p-2 border-2 font-black text-center font-mono text-sm bg-slate-50 text-slate-900 focus:border-blue-600 focus:outline-none"
                            value={item.free_quantity || 0}
                            onChange={e => {
                              const cleaned = e.target.value.replace(/\D/g, '');
                              handleUpdateItem(idx, 'free_quantity', parseInt(cleaned) || 0);
                            }}
                          />
                        </td>
                        <td className="px-2 py-3 text-right align-top">
                          <input
                            type="text" inputMode="decimal"
                            required
                            className="w-full border-slate-300 rounded-lg p-2 border-2 font-black text-right font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                            value={item.purchase_price || item.unit_price || ''}
                            onChange={e => handleUpdateItem(idx, 'purchase_price', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-2 py-3 text-right align-top">
                          <input
                            type="text" inputMode="decimal"
                            className="w-full border-slate-300 rounded-lg p-2 border-2 font-black text-right font-mono text-sm text-slate-900 focus:border-orange-500 focus:outline-none bg-orange-50"
                            value={item.selling_price || ''}
                            onChange={e => handleUpdateItem(idx, 'selling_price', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-2 py-3 text-center align-top">
                          <input
                            type="text" inputMode="decimal"
                            disabled
                            className="w-full border-slate-200 rounded-lg p-2 border bg-green-50 text-green-700 font-black text-center font-mono text-sm"
                            value={item.profit_percentage || 0}
                          />
                        </td>
                        {settings.gstType !== 'NON_GST' && (
                          <td className="px-2 py-3 text-center align-top space-y-1">
                            <div className="flex gap-1">
                              <input
                                type="text" inputMode="decimal"
                                className="w-1/3 border-slate-300 rounded md:p-1 border text-xs text-center font-mono focus:border-blue-600 outline-none"
                                placeholder="C"
                                value={item.cgst_percentage || ''}
                                onChange={e => handleUpdateItem(idx, 'cgst_percentage', parseFloat(e.target.value) || 0)}
                              />
                              <input
                                type="text" inputMode="decimal"
                                className="w-1/3 border-slate-300 rounded md:p-1 border text-xs text-center font-mono focus:border-blue-600 outline-none"
                                placeholder="S"
                                value={item.sgst_percentage || ''}
                                onChange={e => handleUpdateItem(idx, 'sgst_percentage', parseFloat(e.target.value) || 0)}
                              />
                              <input
                                type="text" inputMode="decimal"
                                className="w-1/3 border-slate-300 rounded md:p-1 border text-xs text-center font-mono focus:border-blue-600 outline-none"
                                placeholder="I"
                                value={item.igst_percentage || ''}
                                onChange={e => handleUpdateItem(idx, 'igst_percentage', parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </td>
                        )}
                        <td className="px-2 py-3 text-right align-top">
                          <input
                            type="text" inputMode="decimal"
                            className="w-full border-slate-300 rounded-lg p-2 border-2 font-black text-right font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                            value={item.discount_amount || ''}
                            onChange={e => handleUpdateItem(idx, 'discount_amount', parseFloat(e.target.value) || 0)}
                            placeholder="₹0"
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black text-sm text-gray-900 align-top bg-slate-50/50 rounded-lg">
                          ₹{((((item.quantity || 0) * (item.purchase_price || item.unit_price || 0)) - (item.discount_amount || 0)) + (item.total_tax || 0)).toFixed(2)}
                        </td>
                        <td className="px-2 py-3 text-center align-top">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-gray-300 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transportation, Payment Settings & Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

            {/* Logistics Details */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-4">
              <h3 className="text-lg font-bold text-gray-950 border-b border-gray-100 pb-2">Logistics / Transport</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Transport Cost (₹)</label>
                  <input
                    type="text" inputMode="decimal"
                    className="w-full border-gray-200 rounded-lg p-3 border focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition-all font-mono font-bold"
                    value={currentPurchase.transport_cost || ''}
                    onChange={e => handleUpdateMetadata('transport_cost', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Loading</label>
                    <input
                      type="text" inputMode="decimal"
                      className="w-full border-gray-200 rounded-lg p-3 border focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition-all font-mono font-bold"
                      value={currentPurchase.loading_cost || ''}
                      onChange={e => handleUpdateMetadata('loading_cost', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Other</label>
                    <input
                      type="text" inputMode="decimal"
                      className="w-full border-gray-200 rounded-lg p-3 border focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition-all font-mono font-bold"
                      value={currentPurchase.other_charges || ''}
                      onChange={e => handleUpdateMetadata('other_charges', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Paid By</label>
                  <select
                    className="w-full border-gray-200 rounded-lg p-3 border focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition-all font-bold text-sm bg-white"
                    value={currentPurchase.transport_paid_by || 'Business'}
                    onChange={e => handleUpdateMetadata('transport_paid_by', e.target.value)}
                  >
                    <option value="Business">Business (Self)</option>
                    <option value="Supplier">Supplier</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Payment Details */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-4">
              <h3 className="text-lg font-bold text-gray-950 border-b border-gray-100 pb-2">Payment & Discount</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Overall Discount (₹)</label>
                  <input
                    type="text" inputMode="decimal"
                    className="w-full border-gray-200 rounded-lg p-3 border focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition-all font-mono font-bold text-green-600"
                    value={currentPurchase.discount_amount || ''}
                    onChange={e => handleUpdateMetadata('discount_amount', parseFloat(e.target.value) || 0)}
                    placeholder="₹0.00"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Amount Paid Now (₹)</label>
                  <input
                    type="text" inputMode="decimal"
                    className="w-full border-gray-200 rounded-lg p-3 border focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition-all font-mono text-xl font-black text-blue-600"
                    value={currentPurchase.amount_paid || currentPurchase.paid_amount || ''}
                    onChange={e => {
                      const entered = parseFloat(e.target.value) || 0;
                      const capped = Math.min(entered, Number(currentPurchase.grand_total || 0));
                      handleUpdateMetadata('amount_paid', capped);
                    }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Payment Mode</label>
                  <select
                    className="w-full border-gray-200 rounded-xl p-3 border focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition-all font-bold bg-white"
                    value={currentPurchase.payment_mode || 'Cash'}
                    onChange={e => handleUpdateMetadata('payment_mode', e.target.value)}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Summary Breakdown Card */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-3">
              <h3 className="text-lg font-bold text-gray-950 border-b border-gray-100 pb-2">Grand Summary</h3>
              <div className="flex justify-between text-gray-500 font-medium text-sm">
                <span>Subtotal (Net)</span>
                <span className="font-mono">₹{currentPurchase.subtotal.toFixed(2)}</span>
              </div>
              {settings.gstType !== 'NON_GST' && (
                <div className="flex justify-between text-gray-500 font-medium text-sm">
                  <span>Taxes</span>
                  <span className="font-mono">₹{currentPurchase.tax_amount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-500 font-medium text-sm">
                <span>Transport & Extras</span>
                <span className="font-mono">₹{((currentPurchase.transport_cost || 0) + (currentPurchase.loading_cost || 0) + (currentPurchase.other_charges || 0)).toFixed(2)}</span>
              </div>
              {currentPurchase.discount_amount ? (
                <div className="flex justify-between text-green-600 font-medium text-sm">
                  <span>Overall Discount</span>
                  <span className="font-mono">-₹{currentPurchase.discount_amount.toFixed(2)}</span>
                </div>
              ) : null}
              {(currentPurchase.round_off || 0) !== 0 && (
                <div className="flex justify-between text-gray-500 font-medium text-sm">
                  <span>Round Off</span>
                  <span className="font-mono">₹{(currentPurchase.round_off || 0).toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block">Grand Total Due</span>
                    <span className="text-3xl font-black tracking-tight text-gray-900 font-mono">₹{currentPurchase.grand_total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 sticky bottom-4 z-20 bg-white/95 backdrop-blur border border-gray-200 p-4 rounded-2xl shadow-lg">
            <button type="button" onClick={() => setView('list')} className="px-6 py-3 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-bold">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 font-black transition-all disabled:opacity-50">
              {saving ? <RefreshCcw className="animate-spin" size={18} /> : <Save size={18} />}
              Record Bill
            </button>
          </div>
        </form>

        <ProductModal
          isOpen={showProductModal}
          onClose={() => {
            setShowProductModal(false);
            setActiveRowIndex(null);
          }}
          categories={categories}
          units={units}
          onSave={async (prod) => {
            const res = await saveProduct(prod);
            const newProducts = await fetchProducts();
            setProducts(newProducts);
            if (activeRowIndex !== null && res?.product_id) {
              const selectedProd = newProducts.find((p: Product) => p.product_id === res.product_id);
              if (selectedProd && currentPurchase) {
                const { cgst, sgst, igst, taxRate } = getProductTaxRates(selectedProd);

                const updatedItems = [...currentPurchase.items];
                updatedItems[activeRowIndex] = {
                  ...updatedItems[activeRowIndex],
                  product_id: selectedProd.product_id!,
                  description: selectedProd.product_name,
                  unit_price: Number(selectedProd.purchase_price || 0),
                  purchase_price: Number(selectedProd.purchase_price || 0),
                  selling_price: Number(selectedProd.selling_price || 0),
                  profit_percentage: Number(selectedProd.profit_percentage || 0),
                  tax_rate: taxRate,
                  cgst_percentage: cgst,
                  sgst_percentage: sgst,
                  igst_percentage: igst
                };
                calculateTotals(updatedItems, currentPurchase);
              }
            }
            setShowProductModal(false);
            setActiveRowIndex(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Purchases</h2>
          <p className="text-gray-500">Record inbound restocks, transport costs, and payables management.</p>
        </div>
        <button onClick={handleCreateNew} className="bg-blue-600 text-white px-8 py-3 rounded-2xl flex items-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 font-black">
          <Plus size={22} /> Record Purchase
        </button>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 bg-gray-50/30">
          <div className="relative max-w-lg">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by Reference / Bill #..."
              className="w-full pl-12 pr-6 py-4 border-gray-200 border rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-600 transition-all text-sm font-medium"
              value={searchTerm}
              onChange={e => fetchPurchases(1, e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <RefreshCcw className="animate-spin text-blue-600 mx-auto" size={32} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <th className="px-8 py-5">Bill Ref</th>
                  <th className="px-8 py-5">Supplier</th>
                  <th className="px-8 py-5">Date</th>
                  <th className="px-8 py-5">Status</th>
                  <th className="px-8 py-5 text-right">Grand Total</th>
                  <th className="px-8 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-20 text-center text-gray-400 font-medium">
                      No purchase bills recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map(p => (
                    <tr key={p.purchase_id} className="hover:bg-blue-50/30 transition-all">
                      <td className="px-8 py-6 whitespace-nowrap text-sm font-black text-blue-600">
                        <button
                          type="button"
                          onClick={() => handlePreview(p)}
                          className="hover:underline text-left text-blue-600 font-black focus:outline-none"
                        >
                          {p.reference_number || p.supplier_invoice_no || p.purchase_invoice_no || `#${p.purchase_id}`}
                        </button>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-sm font-bold">
                        {suppliers.find(s => s.supplier_id === p.supplier_id) ? (
                          <button
                            type="button"
                            onClick={() => {
                              const supp = suppliers.find(s => s.supplier_id === p.supplier_id);
                              if (supp) {
                                setPaymentSupplier(supp);
                                setShowPaymentModal(true);
                              }
                            }}
                            className="text-gray-900 hover:text-blue-600 hover:underline focus:outline-none transition-all"
                          >
                            {suppliers.find(s => s.supplier_id === p.supplier_id)?.supplier_name}
                          </button>
                        ) : (
                          <span className="text-gray-500 italic">Deleted Vendor</span>
                        )}
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-sm text-gray-500 font-medium">
                        {new Date(p.purchase_date).toLocaleDateString()}
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap">
                        <span className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full ${p.payment_status === 'Paid' ? 'bg-green-100 text-green-700' :
                          p.payment_status === 'Partially Paid' || p.payment_status === 'Partial' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                          {p.payment_status}
                        </span>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-right">
                        <div className="text-base text-gray-900 font-black">
                          ₹{(Number(p.grand_total) || 0).toFixed(2)}
                        </div>
                        {p.payment_status !== 'Paid' && (
                          <div className="text-[10px] text-orange-500 mt-1 uppercase tracking-widest font-black">
                            Due: ₹{(Math.max(0, Number(p.grand_total) - Number(p.amount_paid || p.paid_amount || 0))).toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-3">
                        <button
                          onClick={() => handlePreview(p)}
                          className="text-gray-400 hover:text-slate-900 p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all"
                          title="Preview Bill"
                        >
                          <Eye size={20} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} limit={25} onPageChange={(p) => fetchPurchases(p, searchTerm)} loading={loading} />
      </div>

      <ProductModal
        isOpen={showProductModal}
        onClose={() => {
          setShowProductModal(false);
          setActiveRowIndex(null);
        }}
        categories={categories}
        units={units}
        onSave={async (prod) => {
          const res = await saveProduct(prod);
          const newProducts = await fetchProducts();
          setProducts(newProducts);
          if (activeRowIndex !== null && res?.product_id) {
            const selectedProd = newProducts.find((p: Product) => p.product_id === res.product_id);
            if (selectedProd && currentPurchase) {
              const { cgst, sgst, igst, taxRate } = getProductTaxRates(selectedProd);

              const updatedItems = [...currentPurchase.items];
              updatedItems[activeRowIndex] = {
                ...updatedItems[activeRowIndex],
                product_id: selectedProd.product_id!,
                description: selectedProd.product_name,
                unit_price: Number(selectedProd.purchase_price || 0),
                purchase_price: Number(selectedProd.purchase_price || 0),
                selling_price: Number(selectedProd.selling_price || 0),
                profit_percentage: Number(selectedProd.profit_percentage || 0),
                tax_rate: taxRate,
                cgst_percentage: cgst,
                sgst_percentage: sgst,
                igst_percentage: igst
              };
              calculateTotals(updatedItems, currentPurchase);
            }
          }
          setShowProductModal(false);
          setActiveRowIndex(null);
        }}
      />

      {showPaymentModal && paymentSupplier && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setPaymentSupplier(null);
          }}
          partyType="Supplier"
          partyId={paymentSupplier.supplier_id!}
          partyName={paymentSupplier.supplier_name}
          supplierId={Number(paymentSupplier.supplier_id)}
          direction="pay_out"
          onSuccess={() => {
            setShowPaymentModal(false);
            setPaymentSupplier(null);
            fetchPurchases(currentPage, searchTerm);
          }}
        />
      )}
    </div>
  );
};
