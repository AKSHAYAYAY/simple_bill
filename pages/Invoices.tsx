
import React, { useState, useEffect, useMemo } from 'react';
import { Invoice, Customer, InvoiceStatus, AppSettings, InvoiceItem, Product } from '../types';
import { Plus, Search, Eye, Download, Save, X, Printer, Trash2, User, UserPlus, Info, Trash, AlertCircle, RefreshCcw, IndianRupee } from 'lucide-react';
import { formatINR } from '../utils/currency';
import { ErrorPopup } from '../components/ErrorPopup';
import { saveInvoice, saveCustomer, fetchProducts, fetchInvoicesPaginated, fetchCategories, fetchUnits, saveProduct } from '../services/dataService';
import { InvoicePDF } from '../components/InvoicePDF';
import { SearchableSelect } from '../components/SearchableSelect';
import { PhoneInput } from '../components/PhoneInput';
import { PaginationControls } from '../components/PaginationControls';
import { ProductModal } from '../components/ProductModal';
import { Category, Unit } from '../types';
import { useApp } from '../context/AppContext';
import { PaymentModal } from '../components/PaymentModal';

interface InvoicesProps {
  invoices: Invoice[];
  customers: Customer[];
  settings: AppSettings;
  onRefresh: () => void;
}

const emptyInvoice = (settings: AppSettings): Invoice => {
  const now = new Date();
  const dateStr = settings.enableDateTime
    ? new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16)
    : now.toISOString().split('T')[0];

  return {
    id: '',
    customerId: '',
    date: dateStr,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    items: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    status: InvoiceStatus.DRAFT,
    notes: '',
    overallDiscount: 0,
    packingCharges: 0,
    freightCharges: 0
  };
};

export const Invoices: React.FC<InvoicesProps> = ({ invoices, customers, settings, onRefresh }) => {
  const { invoicesCache, fetchInvoices, invalidateCache } = useApp();
  const [view, setView] = useState<'list' | 'create' | 'preview'>('list');
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);

  // Use Global Cache State
  const data = invoicesCache.data;
  const currentPage = invoicesCache.currentPage;
  const totalPages = invoicesCache.totalPages;
  const totalItems = invoicesCache.totalItems;
  const loadingData = invoicesCache.isLoading;
  const searchTerm = invoicesCache.search;

  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);

  const getEffectiveInvoiceStatus = (inv: Invoice): InvoiceStatus => {
    if (inv.status === InvoiceStatus.PAID) return InvoiceStatus.PAID;
    if (inv.status === InvoiceStatus.DELETED) return InvoiceStatus.DELETED;

    if (inv.dueDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDateObj = new Date(inv.dueDate);
      dueDateObj.setHours(0, 0, 0, 0);
      if (dueDateObj < today) {
        return InvoiceStatus.OVERDUE;
      }
    }
    return inv.status;
  };

  useEffect(() => {
    fetchInvoices();
  }, [invoicesCache.currentPage, invoicesCache.search, invoicesCache.needsRefresh]);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const [prodData, catData, unitData] = await Promise.all([
          fetchProducts({ is_active: 'true' }),
          fetchCategories(),
          fetchUnits()
        ]);
        setProducts(prodData || []);
        setCategories(catData || []);
        setUnits(unitData || []);
      } catch (e) {
        console.error("Failed to load products/categories/units in Invoices page", e);
      }
    };
    loadProducts();
  }, []);

  useEffect(() => {
    if (!currentInvoice?.date) return;
    const issue = new Date(currentInvoice.date);
    if (Number.isNaN(issue.getTime())) return;
    const due = new Date(issue);
    due.setDate(due.getDate() + 30);
    const dueDate = due.toISOString().split('T')[0];
    if (currentInvoice.dueDate !== dueDate) {
      setCurrentInvoice({ ...currentInvoice, dueDate });
    }
  }, [currentInvoice?.date]);

  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [newCustomer, setNewCustomer] = useState<Customer>({
    id: '', name: '', email: '', address: '', phone: '', type: 'Retail', gstin: ''
  });

  const formatCurrency = (amount: number) => formatINR(amount);

  const generateInvoiceId = () => {
    return Date.now().toString().slice(-6);
  };

  const getDefaultTaxRate = (activeSettings: AppSettings): number => {
    if (activeSettings.gstType === 'NON_GST' || activeSettings.defaultSaleTaxMode === 'No Tax') {
      return 0;
    }
    if (activeSettings.defaultSaleTaxMode === 'IGST') {
      return Number(activeSettings.defaultIgstRate || 0);
    }
    // CGST+SGST
    return Number(activeSettings.defaultCgstRate || 0) + Number(activeSettings.defaultSgstRate || 0);
  };

  const getProductTaxRate = (prod: Product, activeSettings: AppSettings): number => {
    if (activeSettings.gstType === 'NON_GST' || activeSettings.defaultSaleTaxMode === 'No Tax') {
      return 0;
    }
    if (activeSettings.defaultSaleTaxMode === 'IGST') {
      return prod.igst_percentage !== undefined && prod.igst_percentage !== null
        ? Number(prod.igst_percentage)
        : Number(activeSettings.defaultIgstRate || 0);
    }
    // CGST+SGST
    const cgst = prod.cgst_percentage !== undefined && prod.cgst_percentage !== null
      ? Number(prod.cgst_percentage)
      : Number(activeSettings.defaultCgstRate || 0);
    const sgst = prod.sgst_percentage !== undefined && prod.sgst_percentage !== null
      ? Number(prod.sgst_percentage)
      : Number(activeSettings.defaultSgstRate || 0);
    return cgst + sgst;
  };

  const handleAddItem = () => {
    if (!currentInvoice) return;
    const newItem: InvoiceItem = {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      price: 0,
      purchasePrice: 0,
      taxRate: getDefaultTaxRate(settings),
      discount: 0
    };
    const newItems = [...currentInvoice.items, newItem];
    calculateTotals(newItems, currentInvoice.overallDiscount, currentInvoice.packingCharges, currentInvoice.freightCharges);
  };

  const handleUpdateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    if (!currentInvoice) return;
    const newItems = currentInvoice.items.map(item => {
      if (item.id === id) return { ...item, [field]: value };
      return item;
    });
    calculateTotals(newItems, currentInvoice.overallDiscount, currentInvoice.packingCharges, currentInvoice.freightCharges);
  };

  const handleRemoveItem = (id: string) => {
    if (!currentInvoice) return;
    const newItems = currentInvoice.items.filter(i => i.id !== id);
    calculateTotals(newItems, currentInvoice.overallDiscount, currentInvoice.packingCharges, currentInvoice.freightCharges);
  };

  const roundTwoDecimals = (num: number) => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  };

  const calculateTotals = (items: InvoiceItem[], overallDiscount = 0, packingCharges = 0, freightCharges = 0) => {
    if (!currentInvoice) return;

    let subtotal = 0;
    let totalTax = 0;

    items.forEach(item => {
      const qty = Math.max(0, Number(item.quantity) || 0);
      const price = Math.max(0, Number(item.price) || 0);
      const discount = Math.max(0, Number(item.discount) || 0);

      const itemGross = price * qty;
      const itemNet = Math.max(0, itemGross - discount);
      const taxRate = settings.gstType === 'NON_GST' ? 0 : (Number(item.taxRate) || 0);
      const itemTax = itemNet * taxRate / 100;

      subtotal += itemNet;
      totalTax += itemTax;
    });

    subtotal = roundTwoDecimals(subtotal || 0);
    totalTax = roundTwoDecimals(totalTax || 0);

    const charges = (Number(packingCharges) || 0) + (Number(freightCharges) || 0);
    const discounts = (Number(overallDiscount) || 0);

    const total = roundTwoDecimals((subtotal + totalTax + charges - discounts) || 0);

    setCurrentInvoice({
      ...currentInvoice,
      items,
      subtotal,
      tax: totalTax,
      total,
      overallDiscount,
      packingCharges,
      freightCharges
    });
  };

  const validateForm = (): boolean => {
    const errors: string[] = [];

    if (customerMode === 'new') {
      if (!newCustomer.name.trim()) errors.push("Customer name is required.");
      if (newCustomer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomer.email)) errors.push("Invalid customer email format.");

      // Phone Validation
      if (newCustomer.phone) {
        const numericPhone = newCustomer.phone.replace(/\D/g, '');
        if (numericPhone.length !== 10) {
          errors.push("Phone number must be exactly 10 digits.");
        }
      }
      // GSTIN Validation
      if (newCustomer.gstin) {
        const cleanedGst = newCustomer.gstin.trim().toUpperCase();
        if (cleanedGst.length !== 15) {
          errors.push("GSTIN number must be exactly 15 characters.");
        }
      }
    } else {
      if (!currentInvoice?.customerId || isNaN(Number(currentInvoice.customerId)) || Number(currentInvoice.customerId) <= 0) {
        errors.push("Please select a valid existing customer.");
      }
    }

    if (!currentInvoice || currentInvoice.items.length === 0) {
      errors.push("Invoice must have at least one item.");
    } else {
      currentInvoice.items.forEach((item, idx) => {
        if (!item.description.trim()) errors.push(`Item #${idx + 1} description is empty.`);
        if (item.quantity <= 0) errors.push(`Item #${idx + 1} quantity must be greater than zero.`);
        if (item.price <= 0) errors.push(`Item #${idx + 1} selling price must be greater than zero.`);
      });
    }

    if (!currentInvoice?.date) errors.push("Issue date is required.");
    if (!currentInvoice?.dueDate) errors.push("Due date is required.");

    setFormErrors(errors);
    return errors.length === 0;
  };

  const handleSave = async () => {
    if (!currentInvoice) return;
    if (!validateForm()) return;

    if (isNaN(currentInvoice.total) || currentInvoice.total < 0) {
      setFormErrors(["Invalid invoice total. Please check item prices and quantities."]);
      return;
    }

    setSaving(true);
    window.dispatchEvent(new CustomEvent('simplebill:show-loader', { detail: { message: 'Creating Invoice...' } }));

    let finalInvoice = { ...currentInvoice };

    try {
      if (customerMode === 'new') {
        const newCustomerId = Date.now().toString();
        const customerToSave = { ...newCustomer, id: newCustomerId };
        const savedId = await saveCustomer(customerToSave);
        finalInvoice.customerId = savedId ? String(savedId) : newCustomerId;
      }

      await saveInvoice(finalInvoice);
      onRefresh();
      invalidateCache('invoices'); // Mark cache as stale so it re-fetches
      setView('list');
      window.dispatchEvent(new CustomEvent('simplebill:notification', { detail: { kind: 'success', message: `Invoice ${finalInvoice.id} saved successfully` } }));
      setCustomerMode('existing');
      setNewCustomer({ id: '', name: '', email: '', address: '', phone: '', type: 'Retail', gstin: '' });
      setFormErrors([]);
    } catch (e: any) {
      setFormErrors([e.message || "Failed to save invoice."]);
    } finally {
      setSaving(false);
      window.dispatchEvent(new CustomEvent('simplebill:hide-loader'));
    }
  };



  const filteredInvoices = useMemo(() => {
    if (selectedStatus === 'All') return data;
    return data.filter(inv => {
      const status = getEffectiveInvoiceStatus(inv);
      return status.toLowerCase() === selectedStatus.toLowerCase();
    });
  }, [data, selectedStatus]);

  const prepareCreateView = () => {
    const newInv = emptyInvoice(settings);
    newInv.id = generateInvoiceId();
    setCurrentInvoice(newInv);
    setCustomerMode('existing');
    setFormErrors([]);
    setView('create');
  }



  if (view === 'preview' && currentInvoice) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm no-print">
          <button onClick={() => setView('list')} className="text-gray-600 hover:text-gray-900 font-bold px-4 py-2 hover:bg-gray-50 rounded-lg transition-colors">
            &larr; Back to List
          </button>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="px-6 py-2 bg-slate-900 text-white rounded-xl flex items-center gap-2 shadow-lg hover:bg-black font-bold">
              <Printer size={16} /> Print or Save PDF
            </button>
          </div>
        </div>
        <InvoicePDF
          invoice={currentInvoice}
          customer={customers.find(c => c.id === currentInvoice.customerId)}
          settings={settings}
        />
      </div>
    );
  }

  if (view === 'create' && currentInvoice) {
    return (
      <div className="max-w-6xl mx-auto pb-24">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Create New Invoice</h2>
            <p className="text-gray-500 text-sm">Fill in the details below to generate your invoice.</p>
          </div>
          <div className="flex w-full md:w-auto gap-3">
            <button onClick={() => setView('list')} className="flex-1 md:flex-none px-6 py-3 bg-white border border-gray-200 rounded-2xl text-gray-700 hover:bg-gray-50 font-bold transition-all shadow-sm">
              Cancel
            </button>
          </div>
        </div>

        <ErrorPopup errors={formErrors} onClose={() => setFormErrors([])} />


        <div className="space-y-8">
          {/* Client Details Section */}
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 animate-in slide-in-from-top-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <User size={22} className="text-blue-600" /> Client Details
              </h3>
              <div className="flex bg-gray-100 p-1 rounded-xl w-full sm:w-auto shadow-inner">
                <button
                  type="button"
                  onClick={() => setCustomerMode('existing')}
                  className={`flex-1 sm:flex-none px-6 py-2 text-sm font-bold rounded-lg transition-all ${customerMode === 'existing' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Existing
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerMode('new')}
                  className={`flex-1 sm:flex-none px-6 py-2 text-sm font-bold rounded-lg transition-all ${customerMode === 'new' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  + Add New
                </button>
              </div>
            </div>

            {customerMode === 'existing' ? (
              <div className="space-y-4">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Select Client from Database</label>
                <SearchableSelect
                  options={customers.map(c => ({ id: c.id, label: c.name, subLabel: c.email }))}
                  value={currentInvoice.customerId}
                  onChange={(id) => setCurrentInvoice({ ...currentInvoice, customerId: id })}
                  placeholder="Start typing name..."
                  className="text-lg"
                />
                {currentInvoice.customerId && (
                  <div className="mt-6 p-6 bg-blue-50/30 rounded-2xl border border-blue-100 text-sm text-gray-600 animate-in fade-in slide-in-from-top-4">
                    {(() => {
                      const c = customers.find(cust => cust.id === currentInvoice.customerId);
                      return c ? (
                        <div className="flex flex-col sm:flex-row justify-between gap-4">
                          <div>
                            <p className="font-black text-gray-900 text-lg mb-1">{c.name}</p>
                            <p className="flex items-center gap-2 text-gray-500 font-medium">
                              {c.email}
                            </p>
                            <p className="mt-2 text-gray-500 italic max-w-xs">{c.address}</p>
                          </div>
                          <div className="text-right">
                            <span className="inline-block text-[10px] uppercase tracking-widest bg-blue-600 text-white px-3 py-1 rounded-full font-bold shadow-lg shadow-blue-100">{c.type}</span>
                            {c.gstin && <p className="mt-2 text-gray-700 font-bold font-mono">GST: {c.gstin}</p>}
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Full Name or Company*</label>
                  <input
                    className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all text-lg"
                    value={newCustomer.name}
                    onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                    placeholder="e.g. Acme Corp LLC"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Email Address</label>
                  <input
                    className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all text-lg"
                    value={newCustomer.email}
                    onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    placeholder="hello@acme.com"
                  />
                </div>
                <div>
                  <PhoneInput
                    label="Phone Number"
                    value={newCustomer.phone}
                    onChange={(e: any) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    placeholder="e.g. 9876543210"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Billing Address</label>
                  <textarea
                    className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all text-lg"
                    rows={2}
                    value={newCustomer.address}
                    onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })}
                    placeholder="123 Business Way, Suite 100"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ERP Inline Items Table */}
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold text-gray-900">Line Items</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveRowId(null);
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
              <table className="w-full text-left text-sm min-w-[900px] border-collapse relative">
                <thead className="bg-slate-900 text-white text-xs font-black uppercase tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-4 w-1/3 rounded-tl-2xl">Product / Details</th>
                    <th className="px-2 py-4 text-center w-16">Qty</th>
                    <th className="px-4 py-4 text-right w-32">Price</th>
                    <th className="px-4 py-4 text-right w-32">Cost Price</th>
                    <th className="px-4 py-4 text-right w-24">Disc.</th>
                    {settings.gstType !== 'NON_GST' && (
                      <th className="px-4 py-4 text-right w-24">Tax%</th>
                    )}
                    <th className="px-4 py-4 text-right w-32">Total</th>
                    <th className="px-4 py-4 text-center w-12 rounded-tr-2xl"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {currentInvoice.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-24 text-center text-gray-400 font-medium text-lg">
                        No items added yet. Click Add New Item to begin.
                      </td>
                    </tr>
                  ) : (
                    currentInvoice.items.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-blue-50/10">
                        <td className="px-2 py-3 space-y-2 align-top">
                          <div className="flex items-start gap-1.5 mb-2">
                            <div className="flex-1">
                              <SearchableSelect
                                className="w-full text-xs font-black"
                                value={item.productId ? item.productId.toString() : ''}
                                placeholder="Custom item or select product..."
                                onChange={(val) => {
                                  if (val) {
                                    const prod = products.find(p => p.product_id?.toString() === val);
                                    if (prod) {
                                      const newItems = currentInvoice.items.map(it => {
                                        if (it.id === item.id) {
                                          return {
                                            ...it,
                                            productId: prod.product_id,
                                            description: prod.product_name,
                                            price: Number(prod.selling_price),
                                            purchasePrice: Number(prod.purchase_price || 0),
                                            taxRate: getProductTaxRate(prod, settings)
                                          };
                                        }
                                        return it;
                                      });
                                      calculateTotals(newItems, currentInvoice.overallDiscount, currentInvoice.packingCharges, currentInvoice.freightCharges);
                                    }
                                  } else {
                                    const newItems = currentInvoice.items.map(it => {
                                      if (it.id === item.id) {
                                        return { ...it, productId: undefined };
                                      }
                                      return it;
                                    });
                                    calculateTotals(newItems, currentInvoice.overallDiscount, currentInvoice.packingCharges, currentInvoice.freightCharges);
                                  }
                                }}
                                options={[
                                  ...products.map(p => ({
                                    id: p.product_id!.toString(),
                                    label: p.product_name,
                                    subLabel: `Code: ${p.product_code || 'N/A'} | Stock: ${p.current_stock}`
                                  }))
                                ]}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveRowId(item.id);
                                setShowProductModal(true);
                              }}
                              className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors shrink-0"
                              title="Add New Product"
                            >
                              <Plus size={16} strokeWidth={3} />
                            </button>
                          </div>
                          <input
                            type="text"
                            required
                            placeholder="Description / Product Details"
                            className="w-full border-gray-300 rounded-lg p-2 border text-sm font-bold text-slate-800"
                            value={item.description}
                            onChange={e => handleUpdateItem(item.id, 'description', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-3 text-center align-top">
                          <input
                            type="text"
                            required
                            className="w-full border-slate-300 rounded-lg p-2 border-2 font-black text-center font-mono text-sm bg-white text-slate-900 focus:border-blue-600 focus:outline-none"
                            value={item.quantity}
                            onChange={e => {
                              const cleaned = e.target.value.replace(/\D/g, '');
                              handleUpdateItem(item.id, 'quantity', parseInt(cleaned) || 0);
                            }}
                          />
                        </td>
                        <td className="px-2 py-3 text-right align-top">
                          <input
                            type="text" inputMode="decimal"
                            required
                            min="0"
                            step="0.01"
                            className="w-full border-slate-300 rounded-lg p-2 border-2 font-black text-right font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                            value={item.price}
                            onChange={e => handleUpdateItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-2 py-3 text-right align-top">
                          <input
                            type="text" inputMode="decimal"
                            min="0"
                            className="w-full border-slate-300 rounded-lg p-2 border-2 font-black text-right font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none bg-amber-50"
                            value={item.purchasePrice || 0}
                            onChange={e => handleUpdateItem(item.id, 'purchasePrice', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-2 py-3 text-right align-top">
                          <input
                            type="text" inputMode="decimal"
                            min="0"
                            className="w-full border-red-200 bg-red-50/20 rounded-lg p-2 border-2 font-black text-right font-mono text-sm text-red-600 focus:border-red-500 focus:outline-none"
                            value={item.discount || 0}
                            onChange={e => handleUpdateItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        {settings.gstType !== 'NON_GST' && (
                          <td className="px-2 py-3 text-right align-top">
                            <input
                              type="text" inputMode="decimal"
                              min="0"
                              className="w-full border-emerald-200 bg-emerald-50/20 rounded-lg p-2 border-2 font-black text-right font-mono text-sm text-emerald-700 focus:border-emerald-500 focus:outline-none"
                              value={item.taxRate}
                              onChange={e => handleUpdateItem(item.id, 'taxRate', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-right font-mono font-black text-base text-slate-900 bg-slate-50/50 rounded-lg align-top">
                          {formatCurrency((item.quantity * item.price - (item.discount || 0)) * (1 + item.taxRate / 100))}
                        </td>
                        <td className="px-2 py-3 text-center align-top">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
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

          {/* Downward Stacked Cards for Metadata & Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Metadata Card */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
              <h3 className="text-xl font-bold text-gray-900">Invoice Metadata</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Invoice Reference</label>
                  <input
                    type="text"
                    className="w-full border-gray-200 rounded-xl p-4 border text-sm font-mono bg-gray-50 text-gray-500"
                    value={currentInvoice.id}
                    readOnly
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Issue Date</label>
                    <input
                      type={settings.enableDateTime ? "datetime-local" : "date"}
                      className="w-full border-gray-200 rounded-xl p-4 border text-sm focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/5 transition-all font-medium"
                      value={currentInvoice.date}
                      onChange={e => setCurrentInvoice({ ...currentInvoice, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Payment Mode</label>
                    <select
                      className="w-full border-gray-200 rounded-xl p-4 border text-sm focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/5 transition-all font-black bg-white"
                      value={currentInvoice.paymentMode || 'Cash'}
                      onChange={e => setCurrentInvoice({ ...currentInvoice, paymentMode: e.target.value as any })}
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Card">Card</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Credit">Credit</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Payment Status</label>
                    <input
                      type="text"
                      className="w-full border-gray-200 rounded-xl p-4 border text-sm font-bold bg-gray-50 text-gray-700"
                      value={currentInvoice.status}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Amount Received</label>
                    <input
                      type="text" inputMode="decimal"
                      min="0"
                      className="w-full border-gray-200 rounded-xl p-4 border text-sm focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/5 transition-all font-bold"
                      value={currentInvoice.amountReceived || 0}
                      onChange={e => {
                        const entered = parseFloat(e.target.value) || 0;
                        const amount = Math.min(entered, Number(currentInvoice.total || 0));
                        let newStatus = InvoiceStatus.UNPAID;
                        if (amount >= currentInvoice.total) newStatus = InvoiceStatus.PAID;
                        else if (amount > 0) newStatus = InvoiceStatus.PARTIAL;
                        setCurrentInvoice({ ...currentInvoice, amountReceived: amount, status: newStatus });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Card */}
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
              <h3 className="text-xl font-bold mb-6 text-gray-900">Summary</h3>
              <div className="space-y-4">
                <div className="flex justify-between text-gray-500 pb-2 border-b border-gray-50">
                  <span className="text-sm font-medium">Subtotal (Net)</span>
                  <span className="font-mono">{formatCurrency(currentInvoice.subtotal)}</span>
                </div>
                {settings.gstType !== 'NON_GST' && (
                  <div className="flex justify-between text-gray-500 pb-2 border-b border-gray-50">
                    <span className="text-sm font-medium">Applied Taxes</span>
                    <span className="font-mono">{formatCurrency(currentInvoice.tax)}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Overall Discount Applied</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">{({ INR: '₹', USD: '₹', GBP: '£', EUR: '€', CAD: 'C$', AUD: 'A$' } as Record<string, string>)[settings.currency] || '₹'}</span>
                      <input
                        type="text" inputMode="decimal"
                        min="0"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-right font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                        value={currentInvoice.overallDiscount}
                        onChange={e => calculateTotals(currentInvoice.items, parseFloat(e.target.value) || 0, currentInvoice.packingCharges, currentInvoice.freightCharges)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Transport Cost</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">{({ INR: '₹', USD: '₹', GBP: '£', EUR: '€', CAD: 'C$', AUD: 'A$' } as Record<string, string>)[settings.currency] || '₹'}</span>
                      <input
                        type="text" inputMode="decimal"
                        min="0"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-right font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                        value={currentInvoice.freightCharges}
                        onChange={e => calculateTotals(currentInvoice.items, currentInvoice.overallDiscount, currentInvoice.packingCharges, parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </div>

                {Number(currentInvoice.freightCharges || 0) > 0 && (
                  <div className="flex justify-between text-gray-500 pb-2 border-b border-gray-50">
                    <span className="text-sm font-medium">Transport Cost</span>
                    <span className="font-mono">{formatCurrency(Number(currentInvoice.freightCharges || 0))}</span>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-50">
                  <div className="flex justify-between items-end">
                    <div>
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block">Grand Total Due</span>
                      <span className="text-4xl font-black tracking-tight text-gray-900 font-mono">{formatCurrency(currentInvoice.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 sticky bottom-4 z-20">
            <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-2xl shadow-lg p-4 flex flex-col sm:flex-row gap-3 justify-end">
              <button onClick={() => setView('list')} className="px-6 py-3 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-bold transition-all">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 font-black transition-all disabled:opacity-50">
                {saving ? <RefreshCcw size={18} className="animate-spin" /> : <Save size={18} />}
                Save Invoice
              </button>
            </div>
          </div>
        </div>

        <ProductModal
          isOpen={showProductModal}
          onClose={() => {
            setShowProductModal(false);
            setActiveRowId(null);
          }}
          categories={categories}
          units={units}
          onSave={async (prod) => {
            const res = await saveProduct(prod);
            const newProducts = await fetchProducts({ is_active: 'true' });
            setProducts(newProducts);
            if (activeRowId && res?.product_id) {
              const selectedProd = newProducts.find((p: Product) => p.product_id === res.product_id);
              if (selectedProd && currentInvoice) {
                const itemTaxRate = getProductTaxRate(selectedProd, settings);
                const newItems = currentInvoice.items.map(it => {
                  if (it.id === activeRowId) {
                    return {
                      ...it,
                      productId: selectedProd.product_id,
                      description: selectedProd.product_name,
                      price: Number(selectedProd.selling_price || 0),
                      purchasePrice: Number(selectedProd.purchase_price || 0),
                      taxRate: itemTaxRate,
                    };
                  }
                  return it;
                });
                calculateTotals(newItems, currentInvoice.overallDiscount, currentInvoice.packingCharges, currentInvoice.freightCharges);
              }
            }
            setShowProductModal(false);
            setActiveRowId(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Invoices</h2>
          <p className="text-gray-500">Track and manage your business revenue</p>
        </div>
        <button
          onClick={prepareCreateView}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl flex items-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 font-black active:scale-95"
        >
          <Plus size={22} /> Create Invoice
        </button>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 bg-gray-50/30 flex flex-wrap gap-4 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by Invoice ID or Customer Name..."
              className="w-full pl-12 pr-6 py-4 border-gray-200 border rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-600 transition-all text-sm font-medium"
              value={searchTerm}
              onChange={(e) => fetchInvoices(1, e.target.value)}
            />
          </div>

          {/* Status Filter Toggle Bar */}
          <div className="flex bg-gray-100 p-1.5 rounded-2xl w-fit shadow-inner">
            <button
              onClick={() => setSelectedStatus('All')}
              className={`px-5 py-2 text-xs font-black rounded-xl transition-all ${selectedStatus === 'All' ? 'bg-white shadow-md text-blue-600 font-black' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedStatus(InvoiceStatus.DRAFT)}
              className={`px-5 py-2 text-xs font-black rounded-xl transition-all ${selectedStatus === InvoiceStatus.DRAFT ? 'bg-white shadow-md text-slate-600 font-black' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              Draft
            </button>
            <button
              onClick={() => setSelectedStatus(InvoiceStatus.SENT)}
              className={`px-5 py-2 text-xs font-black rounded-xl transition-all ${selectedStatus === InvoiceStatus.SENT ? 'bg-white shadow-md text-indigo-600 font-black' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              Sent
            </button>
            <button
              onClick={() => setSelectedStatus(InvoiceStatus.OVERDUE)}
              className={`px-5 py-2 text-xs font-black rounded-xl transition-all ${selectedStatus === InvoiceStatus.OVERDUE ? 'bg-white shadow-md text-red-600 font-black animate-pulse' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              Overdue
            </button>
            <button
              onClick={() => setSelectedStatus(InvoiceStatus.PAID)}
              className={`px-5 py-2 text-xs font-black rounded-xl transition-all ${selectedStatus === InvoiceStatus.PAID ? 'bg-white shadow-md text-green-600 font-black' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              Paid
            </button>
          </div>
        </div>

        {loadingData ? (
          <div className="py-24 text-center">
            <RefreshCcw className="animate-spin text-blue-600 mx-auto" size={36} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <th className="px-8 py-5">Reference</th>
                  <th className="px-8 py-5">Customer</th>
                  <th className="px-8 py-5">Issue Date</th>
                  <th className="px-8 py-5">Status</th>
                  <th className="px-8 py-5 text-right">Total Amount</th>
                  <th className="px-8 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-20 text-center text-gray-400 font-medium">
                      No matching invoices found in your database.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-blue-50/30 transition-all group">
                      <td className="px-8 py-6 whitespace-nowrap text-sm font-black text-blue-600">
                        #{inv.id}
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-sm font-bold">
                        {customers.find(c => c.id === inv.customerId) ? (
                          <button
                            type="button"
                            onClick={() => {
                              const cust = customers.find(c => c.id === inv.customerId);
                              if (cust) {
                                setPaymentCustomer(cust);
                                setShowPaymentModal(true);
                              }
                            }}
                            className="text-gray-900 hover:text-blue-600 hover:underline focus:outline-none transition-all"
                          >
                            {customers.find(c => c.id === inv.customerId)?.name}
                          </button>
                        ) : (
                          <span className="text-gray-500 italic">Deleted Client</span>
                        )}
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-sm text-gray-500 font-medium">
                        {new Date(inv.date).toLocaleDateString()}
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap">
                        {(() => {
                          const status = getEffectiveInvoiceStatus(inv);
                          return (
                            <span className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full ${status === InvoiceStatus.PAID ? 'bg-green-100 text-green-700 shadow-sm shadow-green-100' :
                              status === InvoiceStatus.OVERDUE ? 'bg-red-100 text-red-700 shadow-sm shadow-red-100 animate-pulse' :
                                status === InvoiceStatus.DRAFT ? 'bg-slate-100 text-slate-700 shadow-sm shadow-slate-100' :
                                  status === InvoiceStatus.SENT ? 'bg-indigo-100 text-indigo-700 shadow-sm shadow-indigo-100' :
                                    'bg-orange-100 text-orange-700 shadow-sm shadow-orange-100'
                              }`}>
                              {status}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-right">
                        <div className="text-lg text-gray-900 font-black tracking-tight">
                          {formatCurrency(inv.total)}
                        </div>
                        {(() => {
                          const status = getEffectiveInvoiceStatus(inv);
                          if (status !== InvoiceStatus.PAID && status !== InvoiceStatus.DRAFT) {
                            const due = inv.total - (inv.amountReceived || 0);
                            if (due > 0) {
                              return (
                                <div className="text-[10px] text-orange-500 mt-1 uppercase tracking-widest font-black">
                                  Due: {formatCurrency(due)}
                                </div>
                              );
                            }
                          }
                          return null;
                        })()}
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-3">
                        <button
                          onClick={() => { setCurrentInvoice(inv); setView('preview'); }}
                          className="text-gray-400 hover:text-slate-900 p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all"
                          title="Preview PDF"
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
        <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} limit={25} onPageChange={(page) => fetchInvoices(page, searchTerm)} loading={loadingData} />
      </div>

      {showPaymentModal && paymentCustomer && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setPaymentCustomer(null);
          }}
          partyType="Customer"
          partyId={paymentCustomer.id}
          partyName={paymentCustomer.name}
          customerId={Number(paymentCustomer.id)}
          direction="pay_in"
          onSuccess={() => {
            setShowPaymentModal(false);
            setPaymentCustomer(null);
            fetchInvoices(currentPage, searchTerm);
          }}
        />
      )}
    </div>
  );
};
