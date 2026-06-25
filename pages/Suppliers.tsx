import React, { useState, useEffect } from 'react';
import { Supplier, AppSettings } from '../types';
import {
  Plus, Search, Pencil, User, Trash2, ArrowLeft, RefreshCcw, Save, AlertCircle,
  Phone, Mail, MapPin, IndianRupee, Globe, HelpCircle, ShieldAlert
} from 'lucide-react';
import { fetchSuppliersPaginated, saveSupplier } from '../services/dataService';
import { PaginationControls } from '../components/PaginationControls';
import { formatDueAmount } from '../utils/currency';
import { PhoneInput } from '../components/PhoneInput';
import { GSTInput, validateGST } from '../components/GSTInput';
import { PaymentModal } from '../components/PaymentModal';
import { ErrorPopup } from '../components/ErrorPopup';
import { useApp } from '../context/AppContext';

interface SuppliersProps {
  onViewLedger?: (partyId: string, partyType: 'Customer' | 'Supplier') => void;
}

export const Suppliers: React.FC<SuppliersProps> = ({ onViewLedger }) => {
  const { suppliersCache, fetchSuppliers, invalidateCache } = useApp();
  const [view, setView] = useState<'list' | 'create'>('list');
  const [currentSupplier, setCurrentSupplier] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Use Global Cache State
  const suppliers = suppliersCache.data;
  const currentPage = suppliersCache.currentPage;
  const totalPages = suppliersCache.totalPages;
  const totalItems = suppliersCache.totalItems;
  const loading = suppliersCache.isLoading;
  const searchTerm = suppliersCache.search;

  // Quick Payment Out States
  const [activePaymentSupplier, setActivePaymentSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    fetchSuppliers();
  }, [suppliersCache.currentPage, suppliersCache.search, suppliersCache.needsRefresh]);

  const handleEdit = (supplier: Supplier) => {
    setCurrentSupplier(supplier);
    setErrors([]);
    setView('create');
  };

  const handleCreateNew = () => {
    setCurrentSupplier({
      supplier_name: '',
      company_name: '',
      gst_number: '',
      phone: '',
      alternate_phone: '',
      email: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      opening_balance: 0,
      opening_balance_type: 'Payable',
      is_active: true
    });
    setErrors([]);
    setView('create');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSupplier) return;

    // Strict Validations
    const validationErrors: string[] = [];
    if (!currentSupplier.supplier_name.trim()) {
      validationErrors.push('Supplier Name is required.');
    }
    if (!currentSupplier.phone?.trim()) {
      validationErrors.push('Primary Phone number is required.');
    }
    if (currentSupplier.pincode && currentSupplier.pincode.length !== 6) {
      validationErrors.push('Pincode must be exactly 6 digits.');
    }
    const gstError = validateGST(currentSupplier.gst_number || '');
    if (gstError) validationErrors.push(gstError);

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    setErrors([]);
    window.dispatchEvent(new CustomEvent('simplebill:show-loader', { detail: { message: 'Saving Supplier...' } }));
    try {
      await saveSupplier(currentSupplier);
      invalidateCache('suppliers');
      setView('list');
    } catch (err: any) {
      setErrors([err.message || 'Failed to save supplier details.']);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
      window.dispatchEvent(new CustomEvent('simplebill:hide-loader'));
    }
  };

  const filteredSuppliers = suppliers;

  if (view === 'create' && currentSupplier) {
    return (
      <div className="max-w-4xl mx-auto pb-24 animate-in fade-in duration-200">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">
              {currentSupplier.supplier_id ? 'Edit Supplier' : 'Add New Supplier'}
            </h2>
            <p className="text-gray-500 text-sm">Register vendor details for purchasing and stock audits.</p>
          </div>
          <button onClick={() => setView('list')} className="px-6 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-bold transition-all shadow-sm flex items-center gap-2">
            <ArrowLeft size={16} /> Back
          </button>
        </div>

        <ErrorPopup errors={errors} onClose={() => setErrors([])} />

        <form onSubmit={handleSave} className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Supplier Name*</label>
              <input
                type="text"
                required
                className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium text-lg bg-white"
                value={currentSupplier.supplier_name}
                onChange={e => {
                  const val = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                  setCurrentSupplier({ ...currentSupplier, supplier_name: val });
                }}
                placeholder="e.g. Ram Prasad & Sons"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Company Name</label>
              <input
                type="text"
                className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium"
                value={currentSupplier.company_name || ''}
                onChange={e => setCurrentSupplier({ ...currentSupplier, company_name: e.target.value })}
                placeholder="e.g. RPS Enterprises"
              />
            </div>

            <div>
              <GSTInput
                label="GSTIN"
                value={currentSupplier.gst_number || ''}
                onChange={(e: any) => setCurrentSupplier({ ...currentSupplier, gst_number: e.target.value })}
                placeholder="15-character GSTIN"
              />
            </div>

            <div>
                  <PhoneInput
                    label="Mobile / Phone*"
                    required
                    value={currentSupplier.phone || ''}
                    onChange={(e: any) => setCurrentSupplier({ ...currentSupplier, phone: e.target.value })}
                    placeholder="Primary phone"
                    maxLength={10}
                  />
            </div>

            <div>
              <PhoneInput
                label="Alternate Phone"
                value={currentSupplier.alternate_phone || ''}
                onChange={(e: any) => setCurrentSupplier({ ...currentSupplier, alternate_phone: e.target.value })}
                placeholder="Alternate phone"
                maxLength={10}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Address</label>
              <textarea
                className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium"
                rows={2}
                value={currentSupplier.address || ''}
                onChange={e => setCurrentSupplier({ ...currentSupplier, address: e.target.value })}
                placeholder="101 Commercial Street"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">City</label>
              <input
                type="text"
                className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium"
                value={currentSupplier.city || ''}
                onChange={e => {
                  const val = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                  setCurrentSupplier({ ...currentSupplier, city: val });
                }}
                placeholder="e.g. Surat"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">State</label>
              <input
                type="text"
                className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium"
                value={currentSupplier.state || ''}
                onChange={e => {
                  const val = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                  setCurrentSupplier({ ...currentSupplier, state: val });
                }}
                placeholder="e.g. Gujarat"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Pincode</label>
              <input
                type="text"
                className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium font-mono"
                value={currentSupplier.pincode || ''}
                onChange={e => {
                  const cleaned = e.target.value.replace(/\D/g, '').substring(0, 6);
                  setCurrentSupplier({ ...currentSupplier, pincode: cleaned });
                }}
                placeholder="6-digit PIN code"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email</label>
              <input
                type="email"
                className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium"
                value={currentSupplier.email || ''}
                onChange={e => setCurrentSupplier({ ...currentSupplier, email: e.target.value })}
                placeholder="vendor@company.com"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Opening Balance</label>
              <input
                type="text"
                className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium"
                value={currentSupplier.opening_balance === undefined ? '' : currentSupplier.opening_balance}
                onChange={e => {
                  const cleaned = e.target.value.replace(/\D/g, ''); // Numeric only, no dot point
                  setCurrentSupplier({ ...currentSupplier, opening_balance: parseInt(cleaned) || 0 });
                }}
                placeholder="e.g. 15000"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Balance Type</label>
              <select
                className="w-full border-gray-200 rounded-xl p-4 border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-bold bg-white"
                value={currentSupplier.opening_balance_type || 'Payable'}
                onChange={e => setCurrentSupplier({ ...currentSupplier, opening_balance_type: e.target.value as any })}
              >
                <option value="Payable">Payable (We owe them)</option>
                <option value="Receivable">Receivable (They owe us)</option>
              </select>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <input
                type="checkbox"
                id="is_active"
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={currentSupplier.is_active !== false}
                onChange={e => setCurrentSupplier({ ...currentSupplier, is_active: e.target.checked })}
              />
              <label htmlFor="is_active" className="text-sm font-bold text-gray-700">Active (Authorized for purchase orders)</label>
            </div>
          </div>

          <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
            <button type="button" onClick={() => setView('list')} className="px-6 py-3 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-bold">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 font-black transition-all disabled:opacity-50 active:scale-95 shadow-lg shadow-blue-100">
              {saving ? <RefreshCcw className="animate-spin" size={18} /> : <Save size={18} />}
              Save Supplier Details
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
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Suppliers (Vendors)</h2>
          <p className="text-gray-500">Manage vendors, opening balances, and real-time ledger histories.</p>
        </div>
        <button onClick={handleCreateNew} className="bg-blue-600 text-white px-8 py-3 rounded-2xl flex items-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 font-black active:scale-95">
          <Plus size={22} /> Add Supplier
        </button>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 bg-gray-50/30">
          <div className="relative max-w-lg">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by Supplier or Company Name..."
              className="w-full pl-12 pr-6 py-4 border-gray-200 border rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-600 transition-all text-sm font-medium"
              value={searchTerm}
              onChange={e => fetchSuppliers(1, e.target.value)}
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
                  <th className="px-8 py-5">Supplier</th>
                  <th className="px-8 py-5">Company</th>
                  <th className="px-8 py-5">Contact Details</th>
                  <th className="px-8 py-5">GSTIN</th>
                  <th className="px-8 py-5 text-right">Balance Due</th>
                  <th className="px-8 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-20 text-center text-gray-400 font-medium">
                      No suppliers registered yet.
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map(s => (
                    <tr key={s.supplier_id} className="hover:bg-blue-50/30 transition-all">
                      <td className="px-8 py-6 whitespace-nowrap text-sm font-black text-gray-900">
                        <div className="flex flex-col">
                          <span
                            onClick={() => onViewLedger && onViewLedger(String(s.supplier_id), 'Supplier')}
                            className="flex items-center gap-1.5 hover:text-blue-600 hover:underline cursor-pointer"
                          >
                            {s.supplier_name}
                            {s.is_active === false && (
                              <span className="bg-red-50 text-red-500 text-[8px] font-black uppercase px-2 py-0.5 rounded border border-red-100">Inactive</span>
                            )}
                          </span>
                          {(s.city || s.state) && (
                            <span className="text-[10px] text-gray-400 font-bold flex items-center gap-0.5 mt-0.5"><MapPin size={10} /> {s.city}, {s.state} {s.pincode}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-sm text-gray-500 font-medium">
                        {s.company_name || 'N/A'}
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-xs text-gray-500 font-medium space-y-1">
                        {s.phone && <div className="flex items-center gap-1 font-bold text-gray-700"><Phone size={12} /> {s.phone}</div>}
                        {s.alternate_phone && <div className="text-[10px] text-gray-400 pl-4">Alt: {s.alternate_phone}</div>}
                        {s.email && <div className="flex items-center gap-1 text-[10px] text-gray-400"><Mail size={12} /> {s.email}</div>}
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-sm font-bold font-mono">
                        {s.gst_number || '-'}
                      </td>
                      <td className={`px-8 py-6 whitespace-nowrap text-right text-base font-black ${(Number(s.balance_due) || 0) < 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                        {formatDueAmount(s.balance_due)}
                      </td>
                      <td className="px-8 py-6 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => { window.location.href = '/purchases'; }}
                            className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3.5 py-1.5 rounded-xl border border-blue-100 transition-all font-black text-xs flex items-center gap-1 shadow-sm active:scale-95"
                          >
                            <Plus size={14} /> Purchase
                          </button>
                          <button
                            onClick={() => setActivePaymentSupplier(s)}
                            className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3.5 py-1.5 rounded-xl border border-emerald-100 transition-all font-black text-xs flex items-center gap-1 shadow-sm active:scale-95"
                          >
                            <IndianRupee size={14} /> Pay Out
                          </button>
                          <button
                            onClick={() => handleEdit(s)}
                            className="text-gray-400 hover:text-blue-600 p-2 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all"
                          >
                            <Pencil size={18} />
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
        <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} limit={25} onPageChange={(page) => fetchSuppliers(page, searchTerm)} loading={loading} />
      </div>

      {/* Invoice-linked supplier payout modal */}
      {activePaymentSupplier && (
        <PaymentModal
          isOpen={!!activePaymentSupplier}
          onClose={() => setActivePaymentSupplier(null)}
          partyType="supplier"
          direction="pay_out"
          partyId={activePaymentSupplier.supplier_id || ''}
          supplierId={activePaymentSupplier.supplier_id}
          partyName={activePaymentSupplier.supplier_name}
          onSuccess={async () => {
            setActivePaymentSupplier(null);
            invalidateCache('suppliers');
          }}
        />
      )}
    </div>
  );
};
