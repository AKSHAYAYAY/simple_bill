import React, { useState, useMemo } from 'react';
import { Customer, AppSettings } from '../types';
import { 
  Plus, Search, Mail, MapPin, Phone, X, Briefcase, User, LayoutGrid, 
  Table as TableIcon, ArrowUp, ArrowDown, AlertCircle, IndianRupee, Check, RefreshCcw, Pencil
} from 'lucide-react';
import { ErrorPopup } from '../components/ErrorPopup';
import { saveCustomer, fetchCustomersPaginated } from '../services/dataService';
import { PaginationControls } from '../components/PaginationControls';
import { PhoneInput } from '../components/PhoneInput';
import { GSTInput, validateGST } from '../components/GSTInput';
import { NumericInput } from '../components/NumericInput';
import { PaymentModal } from '../components/PaymentModal';
import { useApp } from '../context/AppContext';

interface CustomersProps {
  settings: AppSettings;
  onRefresh: () => void;
  onViewLedger?: (partyId: string, partyType: 'Customer' | 'Supplier') => void;
}

export const Customers: React.FC<CustomersProps> = ({ settings, onRefresh, onViewLedger }) => {
  const { customersCache, fetchCustomers, invalidateCache } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Customer; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  
  // Use Global Cache State
  const data = customersCache.data;
  const currentPage = customersCache.currentPage;
  const totalPages = customersCache.totalPages;
  const totalItems = customersCache.totalItems;
  const loadingData = customersCache.isLoading;
  const searchTerm = customersCache.search;

  React.useEffect(() => {
    fetchCustomers();
  }, [customersCache.currentPage, customersCache.search, customersCache.needsRefresh]);

  
  const [newCustomer, setNewCustomer] = useState<Customer>({
    id: '', 
    name: '', 
    company_name: '',
    email: '', 
    address: '', 
    phone: '', 
    alternate_phone: '',
    city: '',
    state: '',
    pincode: '',
    opening_balance: 0,
    opening_balance_type: 'Receivable',
    credit_limit: 0,
    is_active: true,
    notes: '', 
    type: 'Retail', 
    gstin: ''
  });

  // Quick Payment In States
  const [activePaymentCustomer, setActivePaymentCustomer] = useState<Customer | null>(null);

  const validate = () => {
      const errs: string[] = [];
      if (!newCustomer.name.trim()) errs.push("Customer Name is required.");
      if (!newCustomer.phone?.trim()) errs.push("Primary Phone number is required.");
      if (newCustomer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomer.email)) errs.push("Invalid email format.");
      
      // Strict Length Validations
      if (newCustomer.phone && newCustomer.phone.length !== 10) {
          errs.push("Primary Phone number must be exactly 10 digits.");
      }
      if (newCustomer.alternate_phone && newCustomer.alternate_phone.length !== 10) {
          errs.push("Alternate Phone number must be exactly 10 digits.");
      }
      if (newCustomer.pincode && newCustomer.pincode.length !== 6) {
          errs.push("Pincode must be exactly 6 digits.");
      }
      if (newCustomer.gstin && newCustomer.gstin.length !== 15) {
          errs.push("GSTIN must be exactly 15 characters.");
      }

      setErrors(errs);
      return errs.length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    window.dispatchEvent(new CustomEvent('simplebill:show-loader', { detail: { message: 'Saving Customer...' } }));
    try {
        const customerToSave = { ...newCustomer, id: newCustomer.id || Date.now().toString() };
        await saveCustomer(customerToSave);
        setShowForm(false);
        setNewCustomer({ 
          id: '', name: '', company_name: '', email: '', address: '', phone: '', 
          alternate_phone: '', city: '', state: '', pincode: '', opening_balance: 0, 
          opening_balance_type: 'Receivable', credit_limit: 0, is_active: true, 
          notes: '', type: 'Retail', gstin: '' 
        });
        setErrors([]);
        invalidateCache('customers');
        onRefresh();
    } catch (e: any) {
        setErrors([e.message || "Failed to save customer."]);
    } finally {
        setSaving(false);
        window.dispatchEvent(new CustomEvent('simplebill:hide-loader'));
    }
  };

  const handleEdit = (customer: Customer) => {
    setNewCustomer({
      ...customer,
      company_name: customer.company_name || '',
      alternate_phone: customer.alternate_phone || '',
      city: customer.city || '',
      state: customer.state || '',
      pincode: customer.pincode || '',
      opening_balance: customer.opening_balance || 0,
      opening_balance_type: customer.opening_balance_type || 'Receivable',
      credit_limit: customer.credit_limit || 0,
      is_active: customer.is_active !== false,
      notes: customer.notes || '',
      gstin: customer.gstin || ''
    });
    setErrors([]);
    setShowForm(true);
  };

  const handleSort = (key: keyof Customer) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const processedCustomers = useMemo(() => {
    let sortedData = [...data];
    sortedData.sort((a, b) => {
      const aValue = (a[sortConfig.key] || '').toString().toLowerCase();
      const bValue = (b[sortConfig.key] || '').toString().toLowerCase();
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sortedData;
  }, [data, sortConfig]);

  const SortIcon = ({ column }: { column: keyof Customer }) => {
    if (sortConfig.key !== column) return <div className="w-4" />;
    return sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Customers (Clients)</h2>
            <p className="text-gray-500">Manage client identities, credit limits, and collection schedules.</p>
        </div>
        <button 
          onClick={() => {
            setNewCustomer({
              id: '', name: '', company_name: '', email: '', address: '', phone: '', 
              alternate_phone: '', city: '', state: '', pincode: '', opening_balance: 0, 
              opening_balance_type: 'Receivable', credit_limit: 0, is_active: true, 
              notes: '', type: 'Retail', gstin: ''
            });
            setErrors([]);
            setShowForm(true);
          }}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl flex items-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 font-black active:scale-95"
        >
          <Plus size={22} /> Add Customer
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div className="relative w-full sm:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Search by name, email, or phone..." 
              className="w-full pl-12 pr-6 py-4 border border-gray-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-600 transition-all font-medium text-sm"
              value={searchTerm}
              onChange={(e) => fetchCustomers(1, e.target.value)}
            />
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner">
            <button 
                onClick={() => setViewMode('table')}
                className={`p-3 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
                title="List View"
            >
                <TableIcon size={20} />
            </button>
            <button 
                onClick={() => setViewMode('grid')}
                className={`p-3 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
                title="Grid View"
            >
                <LayoutGrid size={20} />
            </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[100] backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] shadow-2xl max-w-2xl w-full p-8 md:p-10 animate-in zoom-in duration-200 overflow-y-auto max-h-[90vh] relative border border-white/20">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                {newCustomer.id ? 'Edit Customer Details' : 'Add New Customer'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-all"><X /></button>
            </div>

            {errors.length > 0 && <ErrorPopup errors={errors} onClose={() => setErrors([])} />}

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <button
                    className={`flex items-center justify-center gap-3 p-4 border-2 rounded-2xl transition-all font-bold ${newCustomer.type === 'Retail' ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-lg shadow-blue-50' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}
                    onClick={() => setNewCustomer({...newCustomer, type: 'Retail'})}
                >
                    <User size={18} /> Retail
                </button>
                <button
                    className={`flex items-center justify-center gap-3 p-4 border-2 rounded-2xl transition-all font-bold ${newCustomer.type === 'Business' ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-lg shadow-indigo-50' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}
                    onClick={() => setNewCustomer({...newCustomer, type: 'Business'})}
                >
                    <Briefcase size={18} /> Business / Wholesale
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Customer Name*</label>
                    <input 
                      className="w-full border-gray-200 rounded-2xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-medium bg-white"
                      value={newCustomer.name} 
                      onChange={e => {
                        const val = e.target.value.replace(/[^a-zA-Z\s]/g, ''); // Text only
                        setNewCustomer({...newCustomer, name: val});
                      }}
                      placeholder="Enter legal name"
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Company / Firm Name</label>
                    <input 
                      className="w-full border-gray-200 rounded-2xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-medium bg-white"
                      value={newCustomer.company_name || ''} 
                      onChange={e => setNewCustomer({...newCustomer, company_name: e.target.value})}
                      placeholder="Optional"
                    />
                </div>

                <div>
                  <PhoneInput
                    label="Mobile / Phone*"
                    required
                    value={newCustomer.phone}
                    onChange={(e: any) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    placeholder="Primary phone"
                    maxLength={10}
                  />
                </div>
                <div>
                  <PhoneInput
                    label="Alternate Phone"
                    value={newCustomer.alternate_phone || ''}
                    onChange={(e: any) => setNewCustomer({ ...newCustomer, alternate_phone: e.target.value })}
                    placeholder="Alternate phone"
                    maxLength={10}
                  />
                </div>


                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email</label>
                    <input 
                      type="email"
                      className="w-full border-gray-200 rounded-2xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-medium bg-white"
                      value={newCustomer.email || ''} 
                      onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
                      placeholder="john@example.com"
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Address</label>
                    <textarea 
                      className="w-full border-gray-200 rounded-2xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-medium bg-white"
                      rows={2}
                      value={newCustomer.address} 
                      onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                      placeholder="Billing street address"
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">City</label>
                    <input 
                      type="text"
                      className="w-full border-gray-200 rounded-2xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-medium bg-white"
                      value={newCustomer.city || ''} 
                      onChange={e => {
                        const val = e.target.value.replace(/[^a-zA-Z\s]/g, ''); // Text only
                        setNewCustomer({...newCustomer, city: val});
                      }}
                      placeholder="e.g. Bangalore"
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">State</label>
                    <input 
                      type="text"
                      className="w-full border-gray-200 rounded-2xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-medium bg-white"
                      value={newCustomer.state || ''} 
                      onChange={e => {
                        const val = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                        setNewCustomer({...newCustomer, state: val});
                      }}
                      placeholder="e.g. Karnataka"
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Pincode</label>
                    <input 
                      type="text"
                      className="w-full border-gray-200 rounded-2xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-medium font-mono bg-white"
                      value={newCustomer.pincode || ''} 
                      onChange={e => {
                        const cleaned = e.target.value.replace(/\D/g, '').substring(0, 6);
                        setNewCustomer({...newCustomer, pincode: cleaned});
                      }}
                      placeholder="6-digit PIN code"
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Credit Limit (₹)</label>
                    <input 
                      type="text"
                      className="w-full border-gray-200 rounded-2xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-medium bg-white"
                      value={newCustomer.credit_limit === undefined ? '' : newCustomer.credit_limit} 
                      onChange={e => {
                        const cleaned = e.target.value.replace(/\D/g, ''); // Integer only
                        setNewCustomer({...newCustomer, credit_limit: parseInt(cleaned) || 0});
                      }}
                      placeholder="e.g. 50000"
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Opening Balance (₹)</label>
                    <input 
                      type="text"
                      className="w-full border-gray-200 rounded-2xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-medium bg-white"
                      value={newCustomer.opening_balance === undefined ? '' : newCustomer.opening_balance} 
                      onChange={e => {
                        const cleaned = e.target.value.replace(/\D/g, ''); // Integer only
                        setNewCustomer({...newCustomer, opening_balance: parseInt(cleaned) || 0});
                      }}
                      placeholder="e.g. 10000"
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Balance Type</label>
                    <select
                      className="w-full border-gray-200 rounded-2xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-bold bg-white"
                      value={newCustomer.opening_balance_type || 'Receivable'}
                      onChange={e => setNewCustomer({...newCustomer, opening_balance_type: e.target.value as any})}
                    >
                      <option value="Receivable">Receivable (Customer owes us)</option>
                      <option value="Payable">Payable (We owe customer / Advance)</option>
                    </select>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input 
                  type="checkbox" 
                  id="cust_is_active" 
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                  checked={newCustomer.is_active !== false} 
                  onChange={e => setNewCustomer({ ...newCustomer, is_active: e.target.checked })} 
                />
                <label htmlFor="cust_is_active" className="text-sm font-bold text-gray-700">Active (Authorized for sale invoicing)</label>
              </div>

              <button 
                onClick={handleSave} 
                disabled={saving}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl hover:bg-black font-black shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {saving ? <RefreshCcw className="animate-spin" size={18} /> : <Check size={18} />}
                {newCustomer.id ? 'Update Customer Details' : 'Save Customer to Database'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'table' ? (
        <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                        <tr>
                            <th className="px-8 py-5 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('name')}>
                              <div className="flex items-center gap-1">Client Identity <SortIcon column="name" /></div>
                            </th>
                            <th className="px-8 py-5 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('type')}>
                              <div className="flex items-center gap-1">Classification <SortIcon column="type" /></div>
                            </th>
                            <th className="px-8 py-5 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('email')}>
                              <div className="flex items-center gap-1">Contact Email <SortIcon column="email" /></div>
                            </th>
                            <th className="px-8 py-5 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('phone')}>
                              <div className="flex items-center gap-1">Phone <SortIcon column="phone" /></div>
                            </th>
                            <th className="px-8 py-5">Tax ID / GSTIN</th>
                            <th className="px-8 py-5 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {processedCustomers.length === 0 ? (
                            <tr><td colSpan={6} className="text-center py-20 text-gray-400 font-medium italic">No client records found in your cloud database.</td></tr>
                        ) : processedCustomers.map(customer => (
                            <tr key={customer.id} className="hover:bg-blue-50/30 transition-all group">
                                <td className="px-8 py-6">
                                    <div 
                                      onClick={() => onViewLedger && onViewLedger(customer.id!, 'Customer')}
                                      className="font-bold text-gray-900 hover:text-blue-600 hover:underline cursor-pointer flex items-center gap-1.5"
                                    >
                                      {customer.name}
                                      {customer.is_active === false && (
                                        <span className="bg-red-50 text-red-500 text-[8px] font-black uppercase px-2 py-0.5 rounded border border-red-100">Inactive</span>
                                      )}
                                    </div>
                                    {(customer.city || customer.state) ? (
                                      <div className="text-[10px] text-gray-400 font-bold flex items-center gap-0.5 mt-0.5"><MapPin size={10} /> {customer.city}, {customer.state} {customer.pincode}</div>
                                    ) : customer.address && (
                                      <div className="text-[10px] text-gray-400 font-medium truncate max-w-[200px] mt-0.5">{customer.address}</div>
                                    )}
                                </td>
                                <td className="px-8 py-6">
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                        customer.type === 'Business' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                                    }`}>
                                        {customer.type}
                                    </span>
                                </td>
                                <td className="px-8 py-6 text-gray-600 font-medium">{customer.email || '-'}</td>
                                <td className="px-8 py-6 text-gray-600 font-mono text-xs">
                                  <div>{customer.phone}</div>
                                  {customer.alternate_phone && <div className="text-[10px] text-gray-400">Alt: {customer.alternate_phone}</div>}
                                </td>
                                <td className="px-8 py-6 text-gray-600 font-mono text-xs font-bold">{customer.gstin || '-'}</td>
                                <td className="px-8 py-6 text-right whitespace-nowrap text-sm font-medium">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => setActivePaymentCustomer(customer)}
                                      className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3.5 py-1.5 rounded-xl border border-emerald-100 transition-all font-black text-xs flex items-center gap-1 shadow-sm active:scale-95"
                                    >
                                      <IndianRupee size={14} /> Pay In
                                    </button>
                                    <button
                                      onClick={() => handleEdit(customer)}
                                      className="text-gray-400 hover:text-blue-600 p-2 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all"
                                    >
                                      <Pencil size={16} />
                                    </button>
                                  </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="bg-gray-50/50 px-8 py-4 border-t border-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest flex justify-between items-center">
                <span>Total Entries: {totalItems}</span>
                <span>Sorted By: {sortConfig.key} ({sortConfig.direction})</span>
            </div>
            <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} limit={25} onPageChange={(page) => fetchCustomers(page, searchTerm)} loading={loadingData} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in">
            {processedCustomers.map(customer => (
            <div key={customer.id} className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 hover:shadow-xl hover:shadow-blue-100/30 transition-all relative group">
                <div className="absolute top-8 right-8">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${customer.type === 'Business' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {customer.type}
                    </span>
                </div>
                <h3 
                  onClick={() => onViewLedger && onViewLedger(customer.id!, 'Customer')}
                  className="font-black text-gray-900 text-xl pr-16 mb-6 leading-tight group-hover:text-blue-600 transition-colors cursor-pointer hover:underline"
                >
                  {customer.name}
                  {customer.is_active === false && (
                    <span className="ml-2 bg-red-50 text-red-500 text-[8px] font-black uppercase px-2 py-0.5 rounded border border-red-100">Inactive</span>
                  )}
                </h3>
                <div className="space-y-4 text-sm text-gray-600">
                    <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-2xl">
                        <div className="p-2 bg-white rounded-lg text-blue-500 shadow-sm"><Mail size={16} /></div>
                        <span className="truncate font-medium">{customer.email || 'No Email'}</span>
                    </div>
                    <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-2xl">
                        <div className="p-2 bg-white rounded-lg text-emerald-500 shadow-sm"><Phone size={16} /></div>
                        <div className="font-mono text-xs">
                          <div>{customer.phone || 'No Phone'}</div>
                          {customer.alternate_phone && <div className="text-[10px] text-gray-400">Alt: {customer.alternate_phone}</div>}
                        </div>
                    </div>
                    {customer.gstin && (
                        <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-2xl">
                            <div className="p-2 bg-white rounded-lg text-indigo-500 shadow-sm"><Briefcase size={16} /></div>
                            <span className="font-mono text-xs font-black">{customer.gstin}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-2xl">
                        <div className="p-2 bg-white rounded-lg text-slate-500 shadow-sm"><MapPin size={16} /></div>
                        <span className="truncate text-xs font-medium">
                          {customer.city || customer.state ? `${customer.city}, ${customer.state} ${customer.pincode}` : customer.address || 'No Address'}
                        </span>
                    </div>
                    <div className="pt-2 flex justify-between items-center">
                      <button
                        onClick={() => setActivePaymentCustomer(customer)}
                        className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-4 py-2 rounded-xl border border-emerald-100 transition-all font-black text-xs flex items-center gap-1 shadow-sm active:scale-95"
                      >
                        <IndianRupee size={14} /> Record Pay In
                      </button>
                      <button
                        onClick={() => handleEdit(customer)}
                        className="text-xs text-blue-600 font-bold hover:underline"
                      >
                        Edit Profile
                      </button>
                    </div>
                </div>
            </div>
            ))}
        </div>
      )}

      {/* Invoice-linked customer pay-in modal */}
      {activePaymentCustomer && (
        <PaymentModal
          isOpen={!!activePaymentCustomer}
          onClose={() => setActivePaymentCustomer(null)}
          partyType="customer"
          direction="pay_in"
          partyId={activePaymentCustomer.id}
          customerId={Number(activePaymentCustomer.id)}
          partyName={activePaymentCustomer.name}
          onSuccess={async () => {
            setActivePaymentCustomer(null);
            invalidateCache('customers');
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
