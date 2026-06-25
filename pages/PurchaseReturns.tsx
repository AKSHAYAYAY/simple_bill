import React, { useState, useEffect } from 'react';
import { PurchaseReturn, PurchaseReturnItem, Supplier, Product, Purchase } from '../types';
import { 
  Plus, Search, Eye, Trash2, ArrowLeft, RefreshCw, Save, AlertCircle, Calendar, 
  RotateCcw, IndianRupee, Truck, FileText, Check, PlusCircle
} from 'lucide-react';
import { 
  fetchPurchaseReturnsPaginated, savePurchaseReturn, deletePurchaseReturn, updatePurchaseReturnRefundStatus,
  fetchSuppliers, fetchProducts, fetchPurchases, fetchPurchaseReturnById 
} from '../services/dataService';
import { SearchableSelect } from '../components/SearchableSelect';
import { PaginationControls } from '../components/PaginationControls';
import { useApp } from '../context/AppContext';

export const PurchaseReturns: React.FC = () => {
  const { purchaseReturnsCache, fetchPurchaseReturns, invalidateCache } = useApp();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [view, setView] = useState<'list' | 'create' | 'preview'>('list');
  const [currentReturn, setCurrentReturn] = useState<Partial<PurchaseReturn> | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<PurchaseReturn | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // Use Global Cache State
  const returns = purchaseReturnsCache.data;
  const currentPage = purchaseReturnsCache.currentPage;
  const totalPages = purchaseReturnsCache.totalPages;
  const totalItems = purchaseReturnsCache.totalItems;
  const loading = purchaseReturnsCache.isLoading;
  const searchTerm = purchaseReturnsCache.search;
  const limit = 25;

  useEffect(() => {
    fetchPurchaseReturns();
  }, [purchaseReturnsCache.currentPage, purchaseReturnsCache.search, purchaseReturnsCache.needsRefresh]);

  const loadMetadata = async () => {
    setIsLoadingMetadata(true);
    try {
      const [suppData, prodData, purchData] = await Promise.all([
        fetchSuppliers(),
        fetchProducts({ is_active: 'true' }),
        fetchPurchases()
      ]);
      setSuppliers(suppData || []);
      setProducts(prodData || []);
      setPurchases(purchData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const handleCreateNew = async () => {
    if (suppliers.length === 0) await loadMetadata();
    
    setCurrentReturn({
      supplier_id: suppliers[0]?.supplier_id || undefined,
      purchase_id: undefined,
      return_invoice_no: '',
      return_date: new Date().toISOString().split('T')[0],
      payment_mode: 'Cash',
      refund_status: 'Pending',
      notes: '',
      subtotal: 0,
      total_cgst: 0,
      total_sgst: 0,
      total_igst: 0,
      grand_total: 0,
      items: []
    });
    setErrors([]);
    setView('create');
  };

  const handleAddItem = () => {
    if (!currentReturn) return;
    const newItem: PurchaseReturnItem = {
      product_id: undefined,
      item_name: '',
      quantity: 1,
      purchase_price: 0,
      cgst_percentage: 0,
      sgst_percentage: 0,
      igst_percentage: 0,
      discount_percentage: 0,
      total_tax: 0,
      total_amount: 0
    };
    const updatedItems = [...(currentReturn.items || []), newItem];
    calculateTotals(updatedItems);
  };

  const handleRemoveItem = (index: number) => {
    if (!currentReturn) return;
    const updatedItems = (currentReturn.items || []).filter((_, i) => i !== index);
    calculateTotals(updatedItems);
  };

  const handleUpdateItem = (index: number, field: keyof PurchaseReturnItem, value: any) => {
    if (!currentReturn) return;
    const updatedItems = (currentReturn.items || []).map((item, i) => {
      if (i !== index) return item;
      
      const updated = { ...item, [field]: value };
      
      // Auto-pull values if product changes
      if (field === 'product_id' && value) {
        const prod = products.find(p => p.product_id === Number(value));
        if (prod) {
          updated.item_name = prod.product_name;
          updated.purchase_price = Number(prod.purchase_price);
          updated.cgst_percentage = Number(prod.cgst_percentage);
          updated.sgst_percentage = Number(prod.sgst_percentage);
          updated.igst_percentage = Number(prod.igst_percentage);
        }
      }
      return updated;
    });
    calculateTotals(updatedItems);
  };

  const calculateTotals = (items: PurchaseReturnItem[]) => {
    if (!currentReturn) return;
    
    let subtotal = 0;
    let total_cgst = 0;
    let total_sgst = 0;
    let total_igst = 0;

    const updatedItems = items.map(item => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.purchase_price) || 0;
      const discPercent = Number(item.discount_percentage) || 0;
      
      const rawSub = qty * price;
      const discAmt = rawSub * (discPercent / 100);
      const lineNet = rawSub - discAmt;
      
      // Tax calculation
      const cgstVal = Number(item.cgst_percentage) || 0;
      const sgstVal = Number(item.sgst_percentage) || 0;
      const igstVal = Number(item.igst_percentage) || 0;
      
      const totalTaxPercent = cgstVal + sgstVal + igstVal;
      const total_tax = lineNet * (totalTaxPercent / 100);
      const total_amount = lineNet + total_tax;

      subtotal += lineNet;
      total_cgst += lineNet * (cgstVal / 100);
      total_sgst += lineNet * (sgstVal / 100);
      total_igst += lineNet * (igstVal / 100);

      return {
        ...item,
        total_tax: Number(total_tax.toFixed(2)),
        total_amount: Number(total_amount.toFixed(2))
      };
    });

    const rawTotal = subtotal + total_cgst + total_sgst + total_igst;
    const grand_total = Math.round(rawTotal);

    setCurrentReturn({
      ...currentReturn,
      items: updatedItems,
      subtotal: Number(subtotal.toFixed(2)),
      total_cgst: Number(total_cgst.toFixed(2)),
      total_sgst: Number(total_sgst.toFixed(2)),
      total_igst: Number(total_igst.toFixed(2)),
      grand_total
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentReturn || saving) return;

    if (!currentReturn.supplier_id) {
      setErrors(['Please select a supplier']);
      return;
    }
    if (!currentReturn.items || currentReturn.items.length === 0) {
      setErrors(['Purchase Return must have at least one item']);
      return;
    }

    const invalidItems = currentReturn.items.some(item => !item.product_id || item.quantity <= 0);
    if (invalidItems) {
      setErrors(['All items must have a product selected and quantity greater than zero']);
      return;
    }

    setSaving(true);
    setErrors([]);
    try {
      await savePurchaseReturn(currentReturn);
      invalidateCache('purchaseReturns');
      setView('list');
    } catch (err: any) {
      setErrors([err.message || 'Failed to register purchase return']);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this purchase return? This will reverse stock deductions and Daybook records.')) {
      try {
        await deletePurchaseReturn(id);
        invalidateCache('purchaseReturns');
      } catch (err: any) {
        alert(err.message || 'Failed to delete return');
      }
    }
  };

  const handlePreview = async (ret: PurchaseReturn) => {
    setLoading(true);
    try {
      const fullReturn = await fetchPurchaseReturnById(ret.return_id!);
      setSelectedReturn(fullReturn);
      setView('preview');
    } catch (e: any) {
      alert(e.message || 'Failed to fetch purchase return details');
    } finally {
      setLoading(false);
    }
  };

  const filteredReturns = returns;

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-200">
      
      {/* View PDF / Printable Credit Note */}
      {view === 'preview' && selectedReturn && (
        <div className="max-w-4xl mx-auto pb-24">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm mb-6">
            <button onClick={() => setView('list')} className="text-gray-600 hover:text-gray-900 font-bold px-4 py-2 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2">
              <span className="text-lg">&larr;</span> Back to List
            </button>
            <button onClick={() => window.print()} className="px-6 py-2 bg-slate-900 text-white rounded-xl shadow-lg hover:bg-black font-bold">
              Print Return Note
            </button>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            <div className="flex justify-between border-b border-gray-100 pb-6">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-gray-900">PURCHASE RETURN NOTE</h1>
                <p className="text-sm font-mono text-gray-400">Return Ref: #{selectedReturn.return_invoice_no}</p>
                {selectedReturn.purchase_invoice_no && <p className="text-xs text-gray-400 mt-1">Linked Bill: {selectedReturn.purchase_invoice_no}</p>}
              </div>
              <div className="text-right">
                <span className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full ${
                  selectedReturn.refund_status === 'Refunded' ? 'bg-green-100 text-green-700' : 
                  selectedReturn.refund_status === 'Adjusted' ? 'bg-blue-100 text-blue-700' :
                  'bg-orange-100 text-orange-700'
                }`}>
                  {selectedReturn.refund_status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="font-bold text-gray-400 uppercase text-xs tracking-wider">Supplier / Vendor</p>
                <p className="font-black text-gray-900 mt-1">{selectedReturn.supplier_name || 'Vendor'}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-400 uppercase text-xs tracking-wider">Date of Return</p>
                <p className="font-black text-gray-900 mt-1">{new Date(selectedReturn.return_date).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="border border-gray-100 rounded-2xl overflow-hidden mt-6">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Item Details</th>
                    <th className="px-6 py-4 text-center">Returned Qty</th>
                    <th className="px-6 py-4 text-right">Purchase Price</th>
                    <th className="px-6 py-4 text-right">Tax %</th>
                    <th className="px-6 py-4 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedReturn.items?.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4">
                        <p className="font-bold text-gray-900">{item.item_name || `Product ID ${item.product_id}`}</p>
                        {item.product_code && <span className="font-mono text-[10px] text-gray-400">{item.product_code}</span>}
                      </td>
                      <td className="px-6 py-4 text-center font-mono">{item.quantity}</td>
                      <td className="px-6 py-4 text-right font-mono">₹{Number(item.purchase_price).toFixed(2)}</td>
                      <td className="px-6 py-4 text-right font-mono">{(Number(item.cgst_percentage) + Number(item.sgst_percentage) + Number(item.igst_percentage))}%</td>
                      <td className="px-6 py-4 text-right font-mono font-black">₹{Number(item.total_amount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-6">
              <div className="w-80 space-y-3 text-sm">
                <div className="flex justify-between text-gray-500 font-medium">
                  <span>Subtotal</span>
                  <span>₹{Number(selectedReturn.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500 font-medium">
                  <span>CGST</span>
                  <span>₹{Number(selectedReturn.total_cgst || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500 font-medium">
                  <span>SGST</span>
                  <span>₹{Number(selectedReturn.total_sgst || 0).toFixed(2)}</span>
                </div>
                {Number(selectedReturn.total_igst || 0) > 0 && (
                  <div className="flex justify-between text-gray-500 font-medium">
                    <span>IGST</span>
                    <span>₹{Number(selectedReturn.total_igst || 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-black text-gray-950 pt-3 border-t border-gray-100">
                  <span>Grand Total</span>
                  <span>₹{Number(selectedReturn.grand_total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'create' && currentReturn && (
        <div className="max-w-6xl mx-auto pb-24">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tight">Debit Note / Purchase Return</h2>
              <p className="text-gray-500 text-sm">Create debit notes and automatically deduct returned stocks from inventory logs.</p>
            </div>
            <button onClick={() => setView('list')} className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-bold shadow-sm flex items-center gap-2">
              <span>&larr;</span> Cancel
            </button>
          </div>

          {errors.length > 0 && (
            <div className="mb-6 bg-red-50 border border-red-100 p-4 rounded-2xl">
              <div className="flex gap-2 text-red-700 font-bold items-center mb-2">
                <span className="font-bold">Fix these items:</span>
              </div>
              <ul className="list-disc pl-6 text-sm text-red-600">
                {errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-8">
            {/* Supplier / context */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Truck size={20} className="text-blue-600" /> Supplier & Bill Context
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Supplier / Vendor*</label>
                  <SearchableSelect
                    options={suppliers.map(s => ({ id: String(s.supplier_id), label: s.supplier_name, subLabel: s.company_name }))}
                    value={String(currentReturn.supplier_id || '')}
                    onChange={(id) => setCurrentReturn({ ...currentReturn, supplier_id: Number(id) })}
                    placeholder="Select supplier..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Original Purchase Bill (Optional)</label>
                  <select
                    className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none bg-white font-bold"
                    value={currentReturn.purchase_id || ''}
                    onChange={e => setCurrentReturn({ ...currentReturn, purchase_id: parseInt(e.target.value) || undefined })}
                  >
                    <option value="">No linked bill</option>
                    {purchases.filter(p => Number(p.supplier_id) === Number(currentReturn.supplier_id)).map(p => (
                      <option key={p.purchase_id} value={p.purchase_id}>{p.reference_number || `#${p.purchase_id}`} (Total: ₹{p.grand_total})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ERP Inline Items Table */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">Line Items</h3>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="bg-slate-900 text-white px-6 py-2.5 rounded-xl hover:bg-black flex items-center gap-2 font-bold shadow-lg transition-all"
                >
                  <span className="text-lg">+</span> Add Item
                </button>
              </div>

              <div className="border border-gray-100 rounded-2xl overflow-x-auto" style={{ minHeight: '500px', maxHeight: '750px', overflowY: 'auto' }}>
                <table className="w-full text-left text-sm min-w-[700px] border-collapse relative">
                  <thead className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-4 w-1/3">Product / Code</th>
                      <th className="px-6 py-4 text-center w-20">Quantity</th>
                      <th className="px-6 py-4 text-right w-32">Purchase Cost</th>
                      <th className="px-6 py-4 text-right w-24">Discount %</th>
                      <th className="px-6 py-4 text-right w-24">CGST %</th>
                      <th className="px-6 py-4 text-right w-24">SGST %</th>
                      <th className="px-6 py-4 text-right w-36">Line Total</th>
                      <th className="px-6 py-4 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(!currentReturn.items || currentReturn.items.length === 0) ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-gray-400 font-medium">
                          No items added yet. Click Add Item to begin.
                        </td>
                      </tr>
                    ) : (
                      currentReturn.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/10">
                          <td className="px-4 py-3">
                            <SearchableSelect
                              options={products.map(p => ({
                                id: p.product_id!.toString(),
                                label: p.product_name,
                                subLabel: `Code: ${p.product_code || 'N/A'}`
                              }))}
                              value={item.product_id ? item.product_id.toString() : ''}
                              onChange={val => handleUpdateItem(idx, 'product_id', val ? parseInt(val) : undefined)}
                              placeholder="Select Item..."
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="text"
                              required
                              className="w-full border-gray-200 rounded-xl p-2 border font-bold text-center font-mono text-sm bg-white"
                              value={item.quantity || ''}
                              onChange={e => {
                                const cleaned = e.target.value.replace(/\D/g, '');
                                handleUpdateItem(idx, 'quantity', parseInt(cleaned) || 0);
                              }}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="text" inputMode="decimal"
                              required
                              min="0"
                              step="0.01"
                              className="w-full border-gray-200 rounded-xl p-2 border font-bold text-right font-mono text-sm"
                              value={item.purchase_price || 0}
                              onChange={e => handleUpdateItem(idx, 'purchase_price', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="text" inputMode="decimal"
                              min="0"
                              max="100"
                              className="w-full border-gray-200 rounded-xl p-2 border font-bold text-right font-mono text-sm text-red-500"
                              value={item.discount_percentage || 0}
                              onChange={e => handleUpdateItem(idx, 'discount_percentage', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="text" inputMode="decimal"
                              className="w-full border-gray-200 rounded-xl p-2 border font-mono text-right text-sm"
                              value={item.cgst_percentage || 0}
                              onChange={e => handleUpdateItem(idx, 'cgst_percentage', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="text" inputMode="decimal"
                              className="w-full border-gray-200 rounded-xl p-2 border font-mono text-right text-sm"
                              value={item.sgst_percentage || 0}
                              onChange={e => handleUpdateItem(idx, 'sgst_percentage', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-black text-sm text-gray-900">
                            ₹{Number(item.total_amount || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center">
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

            {/* Vertical Downward Stack for Metadata and Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Return Metadata (Downwards Stacked card) */}
              <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <FileText size={20} className="text-blue-600" /> Return Metadata
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Return Invoice # (Optional)</label>
                    <input
                      type="text"
                      className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-mono"
                      placeholder="PR-XXXX (Auto-generated)"
                      value={currentReturn.return_invoice_no || ''}
                      onChange={e => setCurrentReturn({ ...currentReturn, return_invoice_no: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Return Date</label>
                      <input
                        type="date"
                        required
                        className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none font-bold"
                        value={currentReturn.return_date || ''}
                        onChange={e => setCurrentReturn({ ...currentReturn, return_date: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Refund Status</label>
                      <select
                        className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none bg-white font-bold"
                        value={currentReturn.refund_status || 'Pending'}
                        onChange={e => setCurrentReturn({ ...currentReturn, refund_status: e.target.value as any })}
                      >
                        <option value="Pending">Pending Refund</option>
                        <option value="Refunded">Received / Refunded Cash</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Refund Mode</label>
                      <select
                        className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none bg-white font-bold"
                        value={currentReturn.payment_mode || 'Cash'}
                        onChange={e => setCurrentReturn({ ...currentReturn, payment_mode: e.target.value as any })}
                      >
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank Transfer</option>
                        <option value="UPI">UPI Payment</option>
                        <option value="Card">Credit Card</option>
                      </select>
                    </div>

                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Internal Notes</label>
                    <textarea
                      rows={2}
                      className="w-full border-gray-200 rounded-xl p-3 border focus:outline-none text-sm"
                      placeholder="Provide details about return context (e.g. supplier defect, stock error)"
                      value={currentReturn.notes || ''}
                      onChange={e => setCurrentReturn({ ...currentReturn, notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Refund Breakdowns / Summary (Downwards Stacked card) */}
              <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6 flex flex-col justify-between">
                <h3 className="text-xl font-bold text-gray-900">Summary Breakdown</h3>
                <div className="space-y-4">
                  <div className="flex justify-between text-gray-500 font-medium pb-2 border-b border-gray-50">
                    <span>Subtotal Net</span>
                    <span className="font-mono">₹{currentReturn.subtotal?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 font-medium pb-2 border-b border-gray-50">
                    <span>CGST Total</span>
                    <span className="font-mono">₹{currentReturn.total_cgst?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 font-medium pb-2 border-b border-gray-50">
                    <span>SGST Total</span>
                    <span className="font-mono">₹{currentReturn.total_sgst?.toFixed(2)}</span>
                  </div>
                  {(currentReturn.total_igst || 0) > 0 && (
                    <div className="flex justify-between text-gray-500 font-medium pb-2 border-b border-gray-50">
                      <span>IGST Total</span>
                      <span className="font-mono">₹{currentReturn.total_igst?.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="pt-4 flex justify-between items-end">
                    <div>
                      <span className="text-xs font-black text-blue-600 uppercase tracking-widest block">Refund Credit Total</span>
                      <span className="text-4xl font-black tracking-tight text-gray-900 font-mono">₹{currentReturn.grand_total?.toFixed(2)}</span>
                    </div>
                    {currentReturn.refund_status === 'Refunded' && (
                      <span className="inline-block text-[10px] uppercase tracking-widest bg-emerald-500 text-white px-3 py-1 rounded-full font-bold shadow-lg shadow-emerald-100">
                        Auto Cash Refund In
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 sticky bottom-4 z-20 bg-white/95 backdrop-blur border border-gray-200 p-4 rounded-2xl shadow-lg">
              <button type="button" onClick={() => setView('list')} className="px-6 py-3 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-bold">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 font-black transition-all disabled:opacity-50">
                {saving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                Record Return
              </button>
            </div>
          </form>
        </div>
      )}

      {view === 'list' && (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tight">Purchase Returns</h2>
              <p className="text-gray-500">Record supplier debit notes and track returns stock reductions.</p>
            </div>
            <button onClick={handleCreateNew} className="bg-blue-600 text-white px-8 py-3 rounded-2xl flex items-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 font-black">
              <Plus size={22} /> Raise Return
            </button>
          </div>

          <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-50 bg-gray-50/30">
              <div className="relative max-w-lg">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search by Return Ref or Supplier Name..."
                  className="w-full pl-12 pr-6 py-4 border-gray-200 border rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-600 transition-all text-sm font-medium"
                  value={searchTerm}
                  onChange={e => fetchPurchaseReturns(1, e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="py-20 text-center">
                <RefreshCw className="animate-spin text-blue-600 mx-auto" size={32} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50/50 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      <th className="px-8 py-5">Return Ref</th>
                      <th className="px-8 py-5">Supplier / Vendor</th>
                      <th className="px-8 py-5">Date</th>
                      <th className="px-8 py-5">Refund Status</th>
                      <th className="px-8 py-5 text-right">Grand Total</th>
                      <th className="px-8 py-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredReturns.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-8 py-20 text-center text-gray-400 font-medium">
                          No purchase returns registered yet.
                        </td>
                      </tr>
                    ) : (
                      filteredReturns.map(r => (
                        <tr key={r.return_id} className="hover:bg-blue-50/30 transition-all">
                          <td className="px-8 py-6 whitespace-nowrap text-sm font-black text-blue-600">
                            {r.return_invoice_no}
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-sm font-bold text-gray-900">
                            {r.supplier_name || 'Vendor'}
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-sm text-gray-500 font-medium">
                            {new Date(r.return_date).toLocaleDateString()}
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap">
                            <span className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full ${
                              r.refund_status === 'Refunded' ? 'bg-green-100 text-green-700' :
                              r.refund_status === 'Adjusted' ? 'bg-blue-100 text-blue-700' :
                              'bg-orange-100 text-orange-700'
                            }`}>
                              {r.refund_status}
                            </span>
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-right text-base font-black text-gray-900 font-mono">
                            ₹{(Number(r.grand_total) || 0).toFixed(2)}
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handlePreview(r)}
                                className="text-gray-400 hover:text-slate-900 p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all"
                                title="Preview Debit Note"
                              >
                                <Eye size={18} />
                              </button>
                              <button
                                onClick={() => handleDelete(r.return_id!)}
                                className="text-gray-300 hover:text-red-500 p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all"
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              limit={limit}
              onPageChange={(page) => fetchPurchaseReturns(page, searchTerm)}
              loading={loading}
            />
          </div>
        </>
      )}
    </div>
  );
};
