import React, { useState, useEffect, useMemo } from 'react';
import { PaymentIn, PaymentOut, Customer, Supplier } from '../types';
import { 
  Plus, Search, ArrowLeft, RefreshCcw,
  TrendingUp, TrendingDown, IndianRupee, Users, Award, ShieldAlert, ArrowRight, Wallet, AlertCircle
} from 'lucide-react';

import { 
  fetchCustomers as fetchCustomersFull, fetchSuppliers as fetchSuppliersFull
} from '../services/dataService';
import { formatINR, formatDueAmount } from '../utils/currency';
import { PaymentModal } from '../components/PaymentModal';
import { useApp } from '../context/AppContext';
import { PaginationControls } from '../components/PaginationControls';

interface PaymentsProps {
  onViewLedger?: (partyId: string, partyType: 'Customer' | 'Supplier') => void;
}

export const Payments: React.FC<PaymentsProps> = ({ onViewLedger }) => {
  const {
    paymentsInCache, fetchPaymentsIn,
    paymentsOutCache, fetchPaymentsOut,
    customersCache, fetchCustomers: fetchCustomersCache,
    suppliersCache, fetchSuppliers: fetchSuppliersCache,
    invalidateCache
  } = useApp();

  const [activeTab, setActiveTab] = useState<'in' | 'out' | 'ledger'>('ledger');
  const [view, setView] = useState<'list' | 'create'>('list');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [entityId, setEntityId] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [modalPayment, setModalPayment] = useState<{
    partyType: 'customer' | 'supplier';
    direction: 'pay_in' | 'pay_out';
    partyId: number;
    partyName: string;
  } | null>(null);
  const [selectedPartyType, setSelectedPartyType] = useState<'customer' | 'supplier'>('customer');
  
  // Need full lists for the Create Dropdown
  const [dropdownCustomers, setDropdownCustomers] = useState<Customer[]>([]);
  const [dropdownSuppliers, setDropdownSuppliers] = useState<Supplier[]>([]);

  // Derived cache states
  const paymentsIn = paymentsInCache.data;
  const paymentsOut = paymentsOutCache.data;
  const customers = customersCache.data;
  const suppliers = suppliersCache.data;
  
  const isLoading = paymentsInCache.isLoading || paymentsOutCache.isLoading || customersCache.isLoading || suppliersCache.isLoading;

  useEffect(() => {
    fetchPaymentsIn();
    fetchPaymentsOut();
    fetchCustomersCache();
    fetchSuppliersCache();
  }, []);

  const loadDropdownMetadata = async () => {
    try {
      const [cust, supp] = await Promise.all([
        fetchCustomersFull(true),
        fetchSuppliersFull()
      ]);
      setDropdownCustomers(cust || []);
      setDropdownSuppliers(supp || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateNew = async (preSelectedType?: 'in' | 'out', preSelectedId?: string) => {
    if (dropdownCustomers.length === 0) {
      await loadDropdownMetadata();
    }
    
    const targetTab = preSelectedType || (activeTab === 'out' ? 'out' : 'in');
    if (preSelectedType) {
      setActiveTab(preSelectedType);
    }

    const defaultPartyType = targetTab === 'in' ? 'customer' : 'supplier';
    setSelectedPartyType(defaultPartyType);

    if (preSelectedId && targetTab === 'in') {
      const customer = dropdownCustomers.find(c => String(c.id) === String(preSelectedId)) || customers.find(c => String(c.id) === String(preSelectedId));
      if (customer) {
        setModalPayment({
          partyType: 'customer',
          direction: 'pay_in',
          partyId: Number(customer.id),
          partyName: customer.name
        });
        return;
      }
    }

    if (preSelectedId && targetTab === 'out') {
      const supplier = dropdownSuppliers.find(s => String(s.supplier_id) === String(preSelectedId)) || suppliers.find(s => String(s.supplier_id) === String(preSelectedId));
      if (supplier?.supplier_id) {
        setModalPayment({
          partyType: 'supplier',
          direction: 'pay_out',
          partyId: Number(supplier.supplier_id),
          partyName: supplier.supplier_name
        });
        return;
      }
    }

    // Default selection
    const defaultCust = dropdownCustomers[0] || customers[0];
    const defaultSupp = dropdownSuppliers[0] || suppliers[0];
    setEntityId(defaultPartyType === 'customer' ? (defaultCust?.id || '') : (defaultSupp?.supplier_id?.toString() || ''));
    setErrors([]);
    setView('create');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityId) {
      setErrors([`Please select a ${selectedPartyType}`]);
      return;
    }

    setErrors([]);

    if (selectedPartyType === 'customer') {
      const customer = dropdownCustomers.find(c => String(c.id) === String(entityId)) || customers.find(c => String(c.id) === String(entityId));
      if (!customer) {
        setErrors(['Selected customer was not found.']);
        return;
      }
      setModalPayment({
        partyType: 'customer',
        direction: activeTab === 'in' ? 'pay_in' : 'pay_out',
        partyId: Number(customer.id),
        partyName: customer.name
      });
      setView('list');
      return;
    }

    const supplier = dropdownSuppliers.find(s => String(s.supplier_id) === String(entityId)) || suppliers.find(s => String(s.supplier_id) === String(entityId));
    if (!supplier?.supplier_id) {
      setErrors(['Selected supplier was not found.']);
      return;
    }
    setModalPayment({
      partyType: 'supplier',
      direction: activeTab === 'in' ? 'pay_in' : 'pay_out',
      partyId: Number(supplier.supplier_id),
      partyName: supplier.supplier_name
    });
    setView('list');
  };

  // --- STATS CALCULATIONS ---
  const stats = useMemo(() => {
    const getLocalDateStr = (dObj: Date) => {
      const year = dObj.getFullYear();
      const month = String(dObj.getMonth() + 1).padStart(2, '0');
      const day = String(dObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const todayStr = getLocalDateStr(new Date());
    
    const todayPaysIn = paymentsIn
      .filter(p => {
        if (!p.payment_date) return false;
        try {
          const dateStr = getLocalDateStr(new Date(p.payment_date));
          return dateStr === todayStr;
        } catch {
          return false;
        }
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const todayPaysOut = paymentsOut
      .filter(p => {
        if (!p.payment_date) return false;
        try {
          const dateStr = getLocalDateStr(new Date(p.payment_date));
          return dateStr === todayStr;
        } catch {
          return false;
        }
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const totalCustomerOutstanding = customers.reduce((sum, c) => sum + Number(c.balance_due || 0), 0);
    const totalSupplierOutstanding = suppliers.reduce((sum, s) => sum + Number(s.balance_due || 0), 0);

    return {
      todayPaysIn,
      todayPaysOut,
      totalCustomerOutstanding,
      totalSupplierOutstanding
    };
  }, [paymentsIn, paymentsOut, customers, suppliers]);

  // --- COMBINED LEDGER VIEW ---
  const combinedLedger = useMemo(() => {
    const list: any[] = [];
    customers.forEach(c => {
      list.push({
        id: c.id,
        name: c.name,
        type: 'Customer',
        phone: c.phone || 'No Phone',
        total_billed: c.total_invoiced || 0,
        total_paid: c.total_paid || 0,
        balance_due: c.balance_due || 0
      });
    });
    suppliers.forEach(s => {
      list.push({
        id: String(s.supplier_id),
        name: s.supplier_name,
        type: 'Supplier',
        phone: s.phone || 'No Phone',
        total_billed: s.total_invoiced || 0,
        total_paid: s.total_paid || 0,
        balance_due: s.balance_due || 0
      });
    });

    return list;
  }, [customers, suppliers]);

  const handleSearch = (term: string) => {
    setLedgerSearch(term);
    if (activeTab === 'ledger') {
      fetchCustomersCache(1, term);
      fetchSuppliersCache(1, term);
    } else if (activeTab === 'in') {
      fetchPaymentsIn(1, term);
    } else {
      fetchPaymentsOut(1, term);
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Payments Registry</h2>
          <p className="text-gray-500">Record customer collections (IN), vendor payouts (OUT), and audit party ledgers.</p>
        </div>
        {view === 'list' && (
          <div className="flex gap-3 flex-wrap">
            <button 
              onClick={() => handleCreateNew('in')} 
              className="bg-emerald-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 font-black active:scale-95 text-sm"
            >
              <Plus size={18} /> Record Collection (IN)
            </button>
            <button 
              onClick={() => handleCreateNew('out')} 
              className="bg-rose-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-rose-700 transition-all shadow-xl shadow-rose-100 font-black active:scale-95 text-sm"
            >
              <Plus size={18} /> Record Payout (OUT)
            </button>
          </div>
        )}
      </div>

      {view === 'list' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Today's Pays In */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-600">
              <TrendingUp size={26} />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Today's Pays In</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{formatINR(stats.todayPaysIn)}</p>
            </div>
          </div>

          {/* Card 2: Today's Payouts */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 rounded-2xl bg-rose-50 text-rose-600">
              <TrendingDown size={26} />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Today's Payouts</p>
              <p className="text-2xl font-black text-rose-600 mt-1">{formatINR(stats.todayPaysOut)}</p>
            </div>
          </div>

          {/* Card 3: Total Customer Outstanding */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 rounded-2xl bg-indigo-50 text-indigo-600">
              <Users size={26} />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Customer Due</p>
              <p className="text-2xl font-black text-indigo-600 mt-1">{formatDueAmount(stats.totalCustomerOutstanding)}</p>
            </div>
          </div>

          {/* Card 4: Total Supplier Outstanding */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 rounded-2xl bg-amber-50 text-amber-600">
              <Wallet size={26} />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Vendor Due</p>
              <p className="text-2xl font-black text-amber-600 mt-1">{formatDueAmount(stats.totalSupplierOutstanding)}</p>
            </div>
          </div>
        </div>
      )}

      {view === 'create' ? (
        <div className="max-w-xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-black text-gray-900">Record {activeTab === 'in' ? 'Cash In (Collection)' : 'Cash Out (Payout)'}</h3>
            <button onClick={() => setView('list')} className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 font-bold hover:bg-gray-50 flex items-center gap-2 transition-all">
              <ArrowLeft size={16} /> Back
            </button>
          </div>

          {errors.length > 0 && (
            <div className="mb-6 bg-red-50 border border-red-100 p-4 rounded-2xl">
              <div className="flex gap-2 text-red-700 font-bold items-center mb-2">
                <AlertCircle size={18} /> Errors:
              </div>
              <ul className="list-disc pl-6 text-sm text-red-600">
                {errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}

          <form onSubmit={handleSave} className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2.5 ml-1">
                Party Type
              </label>
              <div className="flex bg-gray-100 p-1.5 rounded-2xl w-full border border-gray-200 shadow-inner">
                <button
                  type="button"
                  onClick={async () => {
                    setSelectedPartyType('customer');
                    if (dropdownCustomers.length === 0) await loadDropdownMetadata();
                    setEntityId(dropdownCustomers[0]?.id || customers[0]?.id || '');
                  }}
                  className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
                    selectedPartyType === 'customer' ? 'bg-white shadow-md text-blue-600 font-black' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Customer
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setSelectedPartyType('supplier');
                    if (dropdownSuppliers.length === 0) await loadDropdownMetadata();
                    setEntityId(dropdownSuppliers[0]?.supplier_id?.toString() || suppliers[0]?.supplier_id?.toString() || '');
                  }}
                  className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
                    selectedPartyType === 'supplier' ? 'bg-white shadow-md text-blue-600 font-black' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Supplier
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                Select {selectedPartyType === 'customer' ? 'Customer' : 'Supplier'}*
              </label>
              <select
                required
                className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all font-bold bg-white"
                value={entityId}
                onChange={e => setEntityId(e.target.value)}
              >
                <option value="">Select...</option>
                {selectedPartyType === 'customer' 
                  ? (dropdownCustomers.length > 0 ? dropdownCustomers : customers).map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                  : (dropdownSuppliers.length > 0 ? dropdownSuppliers : suppliers).map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)
                }
              </select>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-900">
                Next you will select the invoice or return to link, then enter the payment amount.
              </p>
              <p className="text-xs font-medium text-blue-700 mt-1">
                The amount field is capped to the remaining invoice balance, so overpayment is blocked.
              </p>
            </div>

            <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" onClick={() => setView('list')} className="px-6 py-3 border border-gray-200 rounded-xl text-gray-700 font-bold">Cancel</button>
              <button type="submit" className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 font-black transition-all">
                Select Invoice
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex bg-gray-100 p-1.5 rounded-2xl w-fit shadow-inner">
            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-8 py-3 text-sm font-black rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'ledger' ? 'bg-white shadow-md text-blue-600 font-black' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users size={16} /> Party-wise Outstanding Ledger
            </button>
            <button
              onClick={() => setActiveTab('in')}
              className={`px-8 py-3 text-sm font-black rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'in' ? 'bg-white shadow-md text-emerald-600 font-black' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <TrendingUp size={16} /> Collections (Cash In)
            </button>
            <button
              onClick={() => setActiveTab('out')}
              className={`px-8 py-3 text-sm font-black rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'out' ? 'bg-white shadow-md text-rose-600 font-black' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <TrendingDown size={16} /> Payouts (Cash Out)
            </button>
          </div>

          <div className="bg-white p-6 rounded-[28px] shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center justify-between">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text"
                placeholder={activeTab === 'ledger' ? "Search ledger by party name..." : "Search transactions..."}
                className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-600 transition-all font-medium text-sm"
                value={ledgerSearch}
                onChange={e => handleSearch(e.target.value)}
              />
            </div>
            {activeTab === 'ledger' && (
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Showing {combinedLedger.length} active ledger parties
              </span>
            )}
          </div>

          <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
            {isLoading ? (
              <div className="py-20 text-center">
                <RefreshCcw className="animate-spin text-blue-600 mx-auto" size={32} />
              </div>
            ) : activeTab === 'ledger' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                      <th className="px-8 py-5">Party Details</th>
                      <th className="px-8 py-5">Classification</th>
                      <th className="px-8 py-5 text-right">Total Billed / Invoiced</th>
                      <th className="px-8 py-5 text-right">Total Paid</th>
                      <th className="px-8 py-5 text-right">Outstanding Due</th>
                      <th className="px-8 py-5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {combinedLedger.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-8 py-20 text-center text-gray-400 font-medium italic">No matching ledger records found.</td>
                      </tr>
                    ) : (
                      combinedLedger.map((party, i) => (
                        <tr key={i} className="hover:bg-blue-50/30 transition-all">
                          <td className="px-8 py-6">
                            <div 
                              onClick={() => onViewLedger && onViewLedger(party.id, party.type === 'Supplier' ? 'Supplier' : 'Customer')}
                              className="font-bold text-gray-900 hover:text-blue-600 hover:underline cursor-pointer flex items-center gap-1.5"
                            >
                              {party.name}
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono mt-0.5">{party.phone}</div>
                          </td>
                          <td className="px-8 py-6">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                              party.type === 'Customer' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {party.type}
                            </span>
                          </td>
                          <td className="px-8 py-6 text-right font-mono text-sm text-gray-600">
                            {formatINR(party.total_billed)}
                          </td>
                          <td className="px-8 py-6 text-right font-mono text-sm text-gray-600">
                            {formatINR(party.total_paid)}
                          </td>
                          <td className={`px-8 py-6 text-right font-mono text-sm font-black ${
                            Number(party.balance_due || 0) > 0 
                              ? (party.type === 'Customer' ? 'text-indigo-600' : 'text-amber-600') 
                              : Number(party.balance_due || 0) < 0
                                ? 'text-emerald-600'
                                : 'text-gray-400'
                          }`}>
                            {formatDueAmount(party.balance_due)}
                          </td>
                          <td className="px-8 py-6 text-center">
                            <button
                              onClick={() => handleCreateNew(party.type === 'Customer' ? 'in' : 'out', party.id)}
                              className={`px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
                                party.type === 'Customer' 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100' 
                                  : 'bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100'
                              }`}
                            >
                              {party.type === 'Customer' ? 'Record Pay In' : 'Record Pay Out'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <PaginationControls
                  currentPage={customersCache.currentPage}
                  totalPages={Math.max(customersCache.totalPages, suppliersCache.totalPages)}
                  totalItems={customersCache.totalItems + suppliersCache.totalItems}
                  limit={25}
                  onPageChange={(page) => {
                    fetchCustomersCache(page, ledgerSearch);
                    fetchSuppliersCache(page, ledgerSearch);
                  }}
                  loading={customersCache.isLoading || suppliersCache.isLoading}
                />
              </div>
            ) : activeTab === 'in' ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50/50 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                      <th className="px-8 py-5">Payment Ref</th>
                      <th className="px-8 py-5">Party</th>
                      <th className="px-8 py-5">Date</th>
                      <th className="px-8 py-5">Mode</th>
                      <th className="px-8 py-5">Linked To</th>
                      <th className="px-8 py-5 text-right">Amount</th>
                      <th className="px-8 py-5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paymentsIn.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-8 py-20 text-center text-gray-400 font-medium">No pay-in records found.</td>
                      </tr>
                    ) : (
                      paymentsIn.map(p => (
                        <tr key={p.payment_id} className="hover:bg-blue-50/30 transition-all">
                          <td className="px-8 py-6 whitespace-nowrap text-sm font-mono font-bold text-gray-400">
                            #{p.payment_id}
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-sm font-black text-gray-900">
                            <div>{p.party_name || customers.find(c => c.id === p.customer_id?.toString())?.name || suppliers.find(s => s.supplier_id === p.supplier_id)?.supplier_name || `Party #${p.customer_id || p.supplier_id}`}</div>
                            <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{p.party_type || (p.customer_id ? 'Customer' : 'Supplier')}</div>
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-sm text-gray-500 font-medium">
                            {new Date(p.payment_date).toLocaleDateString()}
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap">
                            <span className={`px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${
                              p.payment_mode === 'Cash' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                            }`}>
                              {p.payment_mode}
                            </span>
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-xs font-bold text-gray-500">
                            {p.linked_invoice_no || p.linked_return_no || 'Manual'}
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-right text-base font-black text-green-600">
                            +{formatINR(p.amount)}
                          </td>
                          <td className="px-8 py-6 text-sm text-gray-500 font-medium">
                            {p.notes || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <PaginationControls
                  currentPage={paymentsInCache.currentPage}
                  totalPages={paymentsInCache.totalPages}
                  totalItems={paymentsInCache.totalItems}
                  limit={25}
                  onPageChange={(page) => fetchPaymentsIn(page, ledgerSearch)}
                  loading={paymentsInCache.isLoading}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50/50 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                      <th className="px-8 py-5">Payment Ref</th>
                      <th className="px-8 py-5">Party</th>
                      <th className="px-8 py-5">Date</th>
                      <th className="px-8 py-5">Mode</th>
                      <th className="px-8 py-5">Linked To</th>
                      <th className="px-8 py-5 text-right">Amount</th>
                      <th className="px-8 py-5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paymentsOut.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-8 py-20 text-center text-gray-400 font-medium">No pay-out records found.</td>
                      </tr>
                    ) : (
                      paymentsOut.map(p => (
                        <tr key={p.payment_id} className="hover:bg-blue-50/30 transition-all">
                          <td className="px-8 py-6 whitespace-nowrap text-sm font-mono font-bold text-gray-400">
                            #{p.payment_id}
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-sm font-black text-gray-900">
                            <div>{p.party_name || suppliers.find(s => s.supplier_id === p.supplier_id)?.supplier_name || customers.find(c => c.id === p.customer_id?.toString())?.name || `Party #${p.supplier_id || p.customer_id}`}</div>
                            <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{p.party_type || (p.supplier_id ? 'Supplier' : 'Customer')}</div>
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-sm text-gray-500 font-medium">
                            {new Date(p.payment_date).toLocaleDateString()}
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap">
                            <span className={`px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${
                              p.payment_mode === 'Cash' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                            }`}>
                              {p.payment_mode}
                            </span>
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-xs font-bold text-gray-500">
                            {p.linked_invoice_no || p.linked_return_no || 'Manual'}
                          </td>
                          <td className="px-8 py-6 whitespace-nowrap text-right text-base font-black text-red-600">
                            -{formatINR(p.amount)}
                          </td>
                          <td className="px-8 py-6 text-sm text-gray-500 font-medium">
                            {p.notes || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <PaginationControls
                  currentPage={paymentsOutCache.currentPage}
                  totalPages={paymentsOutCache.totalPages}
                  totalItems={paymentsOutCache.totalItems}
                  limit={25}
                  onPageChange={(page) => fetchPaymentsOut(page, ledgerSearch)}
                  loading={paymentsOutCache.isLoading}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {modalPayment && (
        <PaymentModal
          isOpen={!!modalPayment}
          onClose={() => setModalPayment(null)}
          partyType={modalPayment.partyType}
          direction={modalPayment.direction}
          partyId={modalPayment.partyId}
          customerId={modalPayment.partyType === 'customer' ? modalPayment.partyId : undefined}
          supplierId={modalPayment.partyType === 'supplier' ? modalPayment.partyId : undefined}
          partyName={modalPayment.partyName}
          onSuccess={async () => {
            setModalPayment(null);
            invalidateCache('paymentsIn');
            invalidateCache('paymentsOut');
            invalidateCache('customers');
            invalidateCache('suppliers');
            if (activeTab === 'in') fetchPaymentsIn();
            else if (activeTab === 'out') fetchPaymentsOut();
            else {
              fetchCustomersCache();
              fetchSuppliersCache();
            }
          }}
        />
      )}
    </div>
  );
};
