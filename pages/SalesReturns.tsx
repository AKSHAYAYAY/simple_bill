import React, { useState, useEffect } from 'react';
import { SalesReturn, SalesReturnItem, Customer, Product, Invoice } from '../types';
import { 
  Plus, Search, Eye, Trash2, ArrowLeft, RefreshCw, Save, AlertCircle, Calendar, 
  RotateCcw, IndianRupee, User, FileText, Check, PlusCircle
} from 'lucide-react';
import { 
  fetchSalesReturnsPaginated, saveSalesReturn, deleteSalesReturn, updateSalesReturnRefundStatus,
  fetchCustomers, fetchProducts, fetchInvoices, fetchSalesReturnById
} from '../services/dataService';
import { SearchableSelect } from '../components/SearchableSelect';
import { PaginationControls } from '../components/PaginationControls';
import { useApp } from '../context/AppContext';

export const SalesReturns: React.FC = () => {
  const { salesReturnsCache, fetchSalesReturns, invalidateCache } = useApp();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Invoice[]>([]);
  const [view, setView] = useState<'list' | 'create' | 'preview'>('list');
  const [currentReturn, setCurrentReturn] = useState<Partial<SalesReturn> | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<SalesReturn | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // Use Global Cache State
  const returns = salesReturnsCache.data;
  const currentPage = salesReturnsCache.currentPage;
  const totalPages = salesReturnsCache.totalPages;
  const totalItems = salesReturnsCache.totalItems;
  const loading = salesReturnsCache.isLoading;
  const searchTerm = salesReturnsCache.search;
  const limit = 25;

  useEffect(() => {
    fetchSalesReturns();
  }, [salesReturnsCache.currentPage, salesReturnsCache.search, salesReturnsCache.needsRefresh]);

  const loadMetadata = async () => {
    setIsLoadingMetadata(true);
    try {
      const [custData, prodData, salesData] = await Promise.all([
        fetchCustomers(),
        fetchProducts({ is_active: 'true' }),
        fetchInvoices()
      ]);
      setCustomers(custData || []);
      setProducts(prodData || []);
      setSales(salesData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const handleCreateNew = async () => {
    if (customers.length === 0) await loadMetadata();
    
    setCurrentReturn({
      customer_id: customers[0]?.id ? Number(customers[0].id) : undefined,
      sale_id: undefined,
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
    const newItem: SalesReturnItem = {
      product_id: undefined,
      item_name: '',
      quantity: 1,
      selling_price: 0,
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

  const handleUpdateItem = (index: number, field: keyof SalesReturnItem, value: any) => {
    if (!currentReturn) return;
    const updatedItems = (currentReturn.items || []).map((item, i) => {
      if (i !== index) return item;
      
      const updated = { ...item, [field]: value };
      
      // Auto-pull values if product changes
      if (field === 'product_id' && value) {
        const prod = products.find(p => p.product_id === Number(value));
        if (prod) {
          updated.item_name = prod.product_name;
          updated.selling_price = Number(prod.selling_price);
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

  const calculateTotals = (items: SalesReturnItem[]) => {
    if (!currentReturn) return;
    
    let subtotal = 0;
    let total_cgst = 0;
    let total_sgst = 0;
    let total_igst = 0;

    const updatedItems = items.map(item => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.selling_price) || 0;
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

    if (!currentReturn.customer_id) {
      setErrors(['Please select a customer']);
      return;
    }
    if (!currentReturn.items || currentReturn.items.length === 0) {
      setErrors(['Sales Return must have at least one item']);
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
      await saveSalesReturn(currentReturn);
      invalidateCache('salesReturns');
      setView('list');
    } catch (err: any) {
      setErrors([err.message || 'Failed to register sales return']);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this sales return? This will reverse stock restores and Daybook records.')) {
      try {
        await deleteSalesReturn(id);
        invalidateCache('salesReturns');
      } catch (err: any) {
        alert(err.message || 'Failed to delete return');
      }
    }
  };

  const handlePreview = async (ret: SalesReturn) => {
    setLoading(true);
    try {
      const fullReturn = await fetchSalesReturnById(ret.return_id!);
      setSelectedReturn(fullReturn);
      setView('preview');
    } catch (e: any) {
      alert(e.message || 'Failed to fetch sales return details');
    } finally {
      setLoading(false);
    }
  };

  const filteredReturns = returns;

  if (view === 'preview' && selectedReturn) {
    return (
      <div className="max-w-4xl mx-auto pb-24 animate-in fade-in duration-200">
        <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm mb-6">
          <button onClick={() => setView('list')} className="text-gray-600 hover:text-gray-900 font-bold px-4 py-2 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2">
            <ArrowLeft size={16} /> Back to List
          </button>
          <button onClick={() => window.print()} className="px-6 py-2 bg-slate-900 text-white rounded-xl shadow-lg hover:bg-black font-bold">
            Print Return Note
          </button>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex justify-between border-b border-gray-100 pb-6">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-gray-900">SALES RETURN NOTE</h1>
              <p className="text-sm font-mono text-gray-400">Return Ref: #{selectedReturn.return_invoice_no}</p>
              {selectedReturn.invoice_no && <p className="text-xs text-gray-400 mt-1">Linked Invoice: {selectedReturn.invoice_no}</p>}
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
              <p className="font-bold text-gray-400 uppercase text-xs tracking-wider">Customer</p>
              <p className="font-black text-gray-900 mt-1">{selectedReturn.customer_name || 'Walk-in Customer'}</p>
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
                  <th className="px-6 py-4 text-right">Selling Price</th>
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
                    <td className="px-6 py-4 text-right font-mono">₹{Number(item.selling_price).toFixed(2)}</td>
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
    );
  }

  if (view === 'create' && currentReturn) {
    return (
      <div className="max-w-6xl mx-auto pb-24 animate-in fade-in duration-200">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Raise Sales Return</h2>
            <p className="text-gray-500 text-sm">Create credit notes and auto-restore customer returns back into active inventory.</p>
          </div>
          <button onClick={() => setView('list')} className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-bold shadow-sm flex items-center gap-2">
            <ArrowLeft size={16} /> Cancel
          </button>
        </div>

        {errors.length > 0 && (
          <div className="mb-6 bg-red-50 border border-red-100 p-4 rounded-2xl">
            <div className="flex gap-2 text-red-700 font-bold items-center mb-2">
              <AlertCircle size={18} /> Fix these items:
            </div>
            <ul className="list-disc pl-6 text-sm text-red-600">
              {errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-8">
          {/* Party selection */}
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <User size={20} className="text-blue-600" /> Customer & Sale Context
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Customer*</label>
                <SearchableSelect
                  options={customers.map(c => ({ id: c.id, label: c.name, subLabel: c.phone }))}
                  value={String(currentReturn.customer_id || '')}
                  onChange={(id) => setCurrentReturn({ ...currentReturn, customer_id: Number(id) })}
                  placeholder="Select customer..."
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Original Invoice (Optional)</label>
                 <select
                  className="w-full border-gray-200 rounded-xl p-4 border focus:outline-none bg-white font-bold"
                  value={currentReturn.sale_id || ''}
                  onChange={e => setCurrentReturn({ ...currentReturn, sale_id: parseInt(e.target.value) || undefined })}
                >
                  <option value="">No linked invoice</option>
                  {sales.filter(s => String(s.customerId) === String(currentReturn.customer_id)).map(s => (
                    <option key={s.id} value={s.sale_id}>#{s.id} (Total: ₹{s.total})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ERP Inline Items Table Section */}
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">Line Items</h3>
              <button
                type="button"
                onClick={handleAddItem}
                className="bg-slate-900 text-white px-6 py-2.5 rounded-xl hover:bg-black flex items-center gap-2 font-bold shadow-lg transition-all"
              >
                <Plus size={18} /> Add Item
              </button>
            </div>

            <div className="border border-gray-100 rounded-2xl overflow-x-auto" style={{ minHeight: '500px', maxHeight: '750px', overflowY: 'auto' }}>
              <table className="w-full text-left text-sm min-w-[700px] border-collapse relative">
                <thead className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 w-1/3">Product / Code</th>
                    <th className="px-6 py-4 text-center w-20">Quantity</th>
                    <th className="px-6 py-4 text-right w-32">Selling Price</th>
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
                            value={item.selling_price || 0}
                            onChange={e => handleUpdateItem(idx, 'selling_price', parseFloat(e.target.value) || 0)}
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
                    placeholder="SR-XXXX (Auto-generated)"
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
                      <option value="Pending">Adjust in Next Invoice (Store Credit)</option>
                      <option value="Refunded">Paid / Refunded Cash</option>
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

                  {currentReturn.refund_status === 'Pending' && (
                    <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-xl p-3 font-bold">
                      This return will be saved as customer credit and can be applied on the next invoice.
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Internal Notes</label>
                  <textarea
                    rows={2}
                    className="w-full border-gray-200 rounded-xl p-3 border focus:outline-none text-sm"
                    placeholder="Provide details about return context (e.g. damaged transit, size issue)"
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
                      Auto Cash Refund Out
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
    );
  }

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Sales Returns</h2>
          <p className="text-gray-500">Record customer credit notes and track return stock updates.</p>
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
              placeholder="Search by Return Ref or Customer Name..."
              className="w-full pl-12 pr-6 py-4 border-gray-200 border rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-600 transition-all text-sm font-medium"
              value={searchTerm}
              onChange={e => fetchSalesReturns(1, e.target.value)}
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
                  <th className="px-8 py-5">Customer</th>
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
                      No sales returns registered yet.
                    </td>
                  </tr>
                ) : (
                  filteredReturns.map(r => (
                    <tr key={r.return_id} className="hover:bg-blue-50/30 transition-all">
                      <td className="px-8 py-6 whitespace-nowrap text-sm font-black text-blue-600">
                        {r.return_invoice_no}
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-sm font-bold text-gray-900">
                        {r.customer_name || 'Walk-in Customer'}
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
                            title="Preview Credit Note"
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
          onPageChange={(page) => fetchSalesReturns(page, searchTerm)}
          loading={loading}
        />
      </div>
    </div>
  );
};
