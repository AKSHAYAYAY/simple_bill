import React, { useState, useEffect } from 'react';
import { AppSettings, COUNTRIES, DataSource, Category, Unit } from '../types';
import { 
  Save, Building2, Palette, Database, Sheet, HardDrive, Key, CheckCircle, AlertTriangle, 
  Bug, Server, RefreshCcw, Wifi, WifiOff, Cloud, Globe, FileText, Layout, CreditCard, 
  Trash2, Lock, Layers, Plus, Edit2, Check, X, Tag, Scale 
} from 'lucide-react';
import { 
  saveSettings, initDataLayer, 
  fetchCategories, saveCategory, deleteCategory, toggleCategoryActive,
  fetchUnits, saveUnit, deleteUnit,
  fetchBusinessSettings, saveBusinessSettings
} from '../services/dataService';
import { Logger, LogEntry } from '../services/logger';
import { PhoneInput } from '../components/PhoneInput';
import { GSTInput, validateGST } from '../components/GSTInput';

interface SettingsProps {
  settings: AppSettings;
  onUpdate: (s: AppSettings) => void;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onUpdate }) => {
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'design' | 'data' | 'license' | 'logs' | 'masters'>('profile');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  // Business Settings State
  const [businessData, setBusinessData] = useState<any>({
    business_name: '',
    business_type: 'Retail',
    owner_name: '',
    gst_number: '',
    gst_type: 'GST',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    invoice_prefix: 'INV',
    allow_negative_stock: false,
    allow_negative_selling: false,
    low_stock_limit: 10,
    dead_stock_days: 365,
    tax_display_mode: 'Tax Exclusive',
    default_sale_tax_mode: 'CGST+SGST',
    default_cgst_rate: 0,
    default_sgst_rate: 0,
    default_igst_rate: 0,
    show_tax_on_invoice: true,
    round_off_invoice: true,
    is_active: true
  });
  const [loadingBusiness, setLoadingBusiness] = useState(false);

  // Catalog Masters States
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loadingMasters, setLoadingMasters] = useState(false);

  // Category form states
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [submittingCat, setSubmittingCat] = useState(false);

  // Unit form states
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [unitName, setUnitName] = useState('');
  const [unitShortName, setUnitShortName] = useState('');
  const [submittingUnit, setSubmittingUnit] = useState(false);

  useEffect(() => {
    if (activeTab === 'logs') {
      setLogs(Logger.getLogs());
    } else if (activeTab === 'masters') {
      loadMastersData();
    } else if (activeTab === 'profile') {
      loadBusinessData();
    }
  }, [activeTab]);

  const loadBusinessData = async () => {
    setLoadingBusiness(true);
    try {
      const data = await fetchBusinessSettings();
      if (data) {
        setBusinessData({
          ...data,
          allow_negative_stock: !!data.allow_negative_stock,
          allow_negative_selling: !!data.allow_negative_selling,
          show_tax_on_invoice: !!data.show_tax_on_invoice,
          round_off_invoice: !!data.round_off_invoice,
          is_active: !!data.is_active,
          dead_stock_days: data.dead_stock_days !== undefined ? Number(data.dead_stock_days) : 365
        });
        
        // Keep AppSettings in sync minimally for legacy uses
        setFormData(prev => ({
          ...prev,
          companyName: data.business_name,
          companyGstin: data.gst_number || '',
          taxDisplayMode: data.tax_display_mode,
          showTaxOnInvoice: !!data.show_tax_on_invoice,
          gstType: data.gst_type,
          defaultCgstRate: data.default_cgst_rate,
          defaultSgstRate: data.default_sgst_rate,
          defaultIgstRate: data.default_igst_rate,
          defaultSaleTaxMode: data.default_sale_tax_mode,
          allowNegativeStock: !!data.allow_negative_stock,
          allowNegativeSelling: !!data.allow_negative_selling,
          lowStockLimit: data.low_stock_limit,
          deadStockDays: data.dead_stock_days !== undefined ? Number(data.dead_stock_days) : 365,
          roundOffInvoice: !!data.round_off_invoice
        }));
      }
    } catch (e) {
      console.error('Failed to load business settings:', e);
    } finally {
      setLoadingBusiness(false);
    }
  };

  const handleSaveBusiness = async () => {
    if (!businessData.phone?.trim()) {
      alert('Business phone is required.');
      return;
    }
    const cleanPhone = businessData.phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      alert('Provide 10 digits only for the business phone number.');
      return;
    }
    if (businessData.gst_type === 'GST') {
      const gstError = validateGST(businessData.gst_number || '', true);
      if (gstError) {
        alert(gstError);
        return;
      }
    }
    window.dispatchEvent(new CustomEvent('simplebill:show-loader', { detail: { message: 'Saving Settings...' } }));
    try {
      await saveBusinessSettings(businessData);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      
      // Update AppSettings local copy
      const newSettings: AppSettings = {
        ...formData,
        companyName: businessData.business_name,
        companyGstin: businessData.gst_number || '',
        taxDisplayMode: businessData.tax_display_mode,
        showTaxOnInvoice: !!businessData.show_tax_on_invoice,
        gstType: businessData.gst_type,
        defaultCgstRate: businessData.default_cgst_rate,
        defaultSgstRate: businessData.default_sgst_rate,
        defaultIgstRate: businessData.default_igst_rate,
        defaultSaleTaxMode: businessData.default_sale_tax_mode,
        allowNegativeStock: !!businessData.allow_negative_stock,
        allowNegativeSelling: !!businessData.allow_negative_selling,
        lowStockLimit: businessData.low_stock_limit,
        deadStockDays: businessData.dead_stock_days !== undefined ? Number(businessData.dead_stock_days) : 365,
        roundOffInvoice: !!businessData.round_off_invoice
      };
      setFormData(newSettings);
      onUpdate(newSettings);
      saveSettings(newSettings);
    } catch (e: any) {
      alert(e.message || 'Failed to save business settings');
    } finally {
      window.dispatchEvent(new CustomEvent('simplebill:hide-loader'));
    }
  };

  const loadMastersData = async () => {
    setLoadingMasters(true);
    try {
      const [catData, unitData] = await Promise.all([
        fetchCategories(true),
        fetchUnits()
      ]);
      setCategories(catData || []);
      setUnits(unitData || []);
    } catch (e) {
      console.error('Failed to load settings masters:', e);
    } finally {
      setLoadingMasters(false);
    }
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
      setShowCatForm(false);
      setCatName('');
      setCatDesc('');
      setEditingCategory(null);
      await loadMastersData();
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
      await loadMastersData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete category');
    }
  };

  const handleToggleCatActive = async (id: number) => {
    try {
      await toggleCategoryActive(id);
      await loadMastersData();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle category status');
    }
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
      setShowUnitForm(false);
      setUnitName('');
      setUnitShortName('');
      setEditingUnit(null);
      await loadMastersData();
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
      await loadMastersData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete unit');
    }
  };

  const validate = () => {
    const errors: string[] = [];
    if (!formData.companyName.trim()) errors.push("Business Legal Name is required.");
    if (formData.logoUrl && !formData.logoUrl.startsWith('http') && !formData.logoUrl.startsWith('data:')) errors.push("Logo URL must be a valid link starting with http/https, or an uploaded image.");
    if (!formData.invoicePrefix.trim()) errors.push("Invoice Reference Prefix is required (e.g. INV-).");
    if (formData.dataSource === 'MYSQL' && !formData.mysqlConfig.apiUrl.startsWith('http')) errors.push("MySQL Bridge URL must be a valid full URL.");

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleCredentialChange = (updater: (prev: AppSettings) => AppSettings) => {
    setFormData(prev => {
      const next = updater(prev);
      setTestStatus('idle');
      setTestError('');
      return next;
    });
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      await initDataLayer(formData);
      setTestStatus('success');
    } catch (err: any) {
      setTestStatus('error');
      setTestError(err.message || 'Verification of cloud bridge failed.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    window.dispatchEvent(new CustomEvent('simplebill:show-loader', { detail: { message: 'Saving Settings...' } }));
    try {
      onUpdate(formData);
      await saveSettings(formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to save settings');
    } finally {
      window.dispatchEvent(new CustomEvent('simplebill:hide-loader'));
    }
  };

  const isSaveDisabled = !['INDEXED_DB', 'CLOUD_MYSQL'].includes(formData.dataSource) && testStatus !== 'success';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Workspace Settings</h2>
          <p className="text-gray-500 text-sm">Manage business branding, identity, and cloud storage.</p>
        </div>
        <button
          type="button"
          onClick={activeTab === 'profile' ? handleSaveBusiness : handleSubmit}
          disabled={activeTab !== 'profile' && isSaveDisabled}
          className={`px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all active:scale-95 ${activeTab !== 'profile' && isSaveDisabled ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100'
            }`}
        >
          <Save size={18} /> {saved ? 'Verified & Saved' : 'Save Configuration'}
        </button>
      </div>

      {validationErrors.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 animate-in slide-in-from-top-2">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold mb-1">Configuration Issues Found:</p>
            <ul className="list-disc pl-4 space-y-1">
              {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit overflow-x-auto">
        {[
          { id: 'profile', icon: Building2, label: 'Profile' },
          { id: 'design', icon: Palette, label: 'Design' },
          { id: 'masters', icon: Layers, label: 'Catalog Masters' },
          { id: 'license', icon: Key, label: 'License' },
          { id: 'logs', icon: Bug, label: 'Logs' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === tab.id ? 'bg-white shadow text-blue-600 font-black' : 'text-gray-500 hover:text-gray-900'}`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {activeTab === 'profile' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-8 animate-in fade-in">
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-2 pb-4 border-b border-gray-100"><Building2 className="text-blue-500" /> Business Profile & Settings</h3>
            
            {loadingBusiness ? (
              <div className="py-12 flex justify-center"><RefreshCcw className="animate-spin text-blue-500" size={24} /></div>
            ) : (
              <div className="space-y-8">
                {/* 1. Basic Info */}
                <div>
                  <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Core Identity</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">Business Name*</label>
                      <input className="w-full border border-gray-200 rounded-xl p-3 focus:border-blue-600 font-bold bg-gray-50" value={businessData.business_name} onChange={e => setBusinessData({ ...businessData, business_name: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">Business Type</label>
                      <select className="w-full border border-gray-200 rounded-xl p-3 focus:border-blue-600 font-bold bg-white" value={businessData.business_type} onChange={e => setBusinessData({ ...businessData, business_type: e.target.value })}>
                        <option value="Retail">Retail</option>
                        <option value="Wholesale">Wholesale</option>
                        <option value="Retail+Wholesale">Retail+Wholesale</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">Owner Name</label>
                      <input className="w-full border border-gray-200 rounded-xl p-3 focus:border-blue-600 font-medium" value={businessData.owner_name} onChange={e => setBusinessData({ ...businessData, owner_name: e.target.value })} />
                    </div>
                    <div>
                      <PhoneInput
                        label="Business Phone"
                        required
                        value={businessData.phone || ''}
                        onChange={(e: any) => setBusinessData({ ...businessData, phone: e.target.value })}
                        maxLength={10}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">Email Address</label>
                      <input className="w-full border border-gray-200 rounded-xl p-3 focus:border-blue-600 font-medium" value={businessData.email} onChange={e => setBusinessData({ ...businessData, email: e.target.value })} />
                    </div>
                  </div>
                </div>

                {/* 2. Taxation & Compliance */}
                <div className="pt-6 border-t border-gray-100">
                  <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Taxation & Compliance</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">Tax Registration Type</label>
                      <select className="w-full border border-gray-200 rounded-xl p-3 focus:border-blue-600 font-bold bg-white" value={businessData.gst_type} onChange={e => setBusinessData({ ...businessData, gst_type: e.target.value })}>
                        <option value="GST">Registered (GST)</option>
                        <option value="NON_GST">Unregistered (Non-GST)</option>
                      </select>
                    </div>
                    {businessData.gst_type === 'GST' && (
                      <div>
                        <GSTInput
                          label="Business GST Number"
                          required
                          value={businessData.gst_number || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBusinessData({ ...businessData, gst_number: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                  {businessData.gst_type === 'GST' && (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Tax Display Mode</label>
                        <select className="w-full border border-gray-200 rounded-lg p-2 text-sm font-bold bg-white" value={businessData.tax_display_mode} onChange={e => setBusinessData({ ...businessData, tax_display_mode: e.target.value })}>
                          <option value="Tax Exclusive">Tax Exclusive</option>
                          <option value="Tax Inclusive">Tax Inclusive</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Default Sale Tax</label>
                        <select className="w-full border border-gray-200 rounded-lg p-2 text-sm font-bold bg-white" value={businessData.default_sale_tax_mode} onChange={e => setBusinessData({ ...businessData, default_sale_tax_mode: e.target.value })}>
                          <option value="CGST+SGST">CGST + SGST</option>
                          <option value="IGST">IGST</option>
                          <option value="No Tax">No Tax</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Invoice Tax Printing</label>
                        <label className="flex items-center gap-2 mt-2">
                          <input type="checkbox" className="w-4 h-4 rounded text-blue-600" checked={businessData.show_tax_on_invoice} onChange={e => setBusinessData({ ...businessData, show_tax_on_invoice: e.target.checked })} />
                          <span className="text-sm font-bold text-gray-700">Show Tax Columns</span>
                        </label>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Default CGST Rate (%)</label>
                        <input type="text" inputMode="decimal" step="0.01" className="w-full border border-gray-200 rounded-lg p-2 text-sm font-bold bg-white" value={businessData.default_cgst_rate} onChange={e => setBusinessData({ ...businessData, default_cgst_rate: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Default SGST Rate (%)</label>
                        <input type="text" inputMode="decimal" step="0.01" className="w-full border border-gray-200 rounded-lg p-2 text-sm font-bold bg-white" value={businessData.default_sgst_rate} onChange={e => setBusinessData({ ...businessData, default_sgst_rate: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Default IGST Rate (%)</label>
                        <input type="text" inputMode="decimal" step="0.01" className="w-full border border-gray-200 rounded-lg p-2 text-sm font-bold bg-white" value={businessData.default_igst_rate} onChange={e => setBusinessData({ ...businessData, default_igst_rate: Number(e.target.value) })} />
                      </div>
                    </div>
                    </>
                  )}
                </div>

                {/* 3. Operational Preferences */}
                <div className="pt-6 border-t border-gray-100">
                  <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Operational Settings</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">Invoice Prefix</label>
                      <input className="w-full border border-gray-200 rounded-xl p-3 focus:border-blue-600 font-mono font-bold" value={businessData.invoice_prefix} onChange={e => setBusinessData({ ...businessData, invoice_prefix: e.target.value })} placeholder="INV" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">Low Stock Alert Limit</label>
                      <input type="text" inputMode="decimal" className="w-full border border-gray-200 rounded-xl p-3 focus:border-blue-600 font-mono font-bold" value={businessData.low_stock_limit} onChange={e => setBusinessData({ ...businessData, low_stock_limit: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">Dead Stock Days</label>
                      <input type="text" inputMode="decimal" className="w-full border border-gray-200 rounded-xl p-3 focus:border-blue-600 font-mono font-bold" value={businessData.dead_stock_days} onChange={e => setBusinessData({ ...businessData, dead_stock_days: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-3 pt-2">
                      <label className="flex items-center gap-3">
                        <input type="checkbox" className="w-5 h-5 rounded text-blue-600" checked={businessData.round_off_invoice} onChange={e => setBusinessData({ ...businessData, round_off_invoice: e.target.checked })} />
                        <span className="text-sm font-bold text-gray-700">Auto Round-Off Invoices</span>
                      </label>
                      <label className="flex items-center gap-3">
                        <input type="checkbox" className="w-5 h-5 rounded text-red-500" checked={businessData.allow_negative_stock} onChange={e => setBusinessData({ ...businessData, allow_negative_stock: e.target.checked })} />
                        <span className="text-sm font-bold text-gray-700">Allow Negative Stock</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* 4. Address Details */}
                <div className="pt-6 border-t border-gray-100">
                  <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Location</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">Registered Address</label>
                      <textarea rows={2} className="w-full border border-gray-200 rounded-xl p-3 focus:border-blue-600 font-medium" value={businessData.address} onChange={e => setBusinessData({ ...businessData, address: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">City</label>
                      <input className="w-full border border-gray-200 rounded-xl p-3 focus:border-blue-600 font-medium" value={businessData.city} onChange={e => setBusinessData({ ...businessData, city: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">State</label>
                      <input className="w-full border border-gray-200 rounded-xl p-3 focus:border-blue-600 font-medium" value={businessData.state} onChange={e => setBusinessData({ ...businessData, state: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">Pincode</label>
                      <input className="w-full border border-gray-200 rounded-xl p-3 focus:border-blue-600 font-medium" value={businessData.pincode} onChange={e => setBusinessData({ ...businessData, pincode: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'design' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-8 animate-in fade-in">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Palette className="text-blue-500" /> Branding & Templates</h3>
              <p className="text-xs text-gray-500 mt-1">Configure your invoice layout, letterheads, default terms, and upload logos.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Form Controls Column */}
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Logo (Upload Image or Paste URL)</label>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3 items-center">
                      <input className="flex-1 border border-gray-200 rounded-xl p-4 font-mono text-sm" value={formData.logoUrl} onChange={e => setFormData({ ...formData, logoUrl: e.target.value })} placeholder="https://... or upload below" />
                      <label className="px-5 py-3 bg-blue-600 text-white rounded-xl font-bold cursor-pointer hover:bg-blue-700 transition-all active:scale-95 shadow-sm text-sm whitespace-nowrap">
                        Upload File
                        <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 500 * 1024) { alert('Logo file must be under 500KB.'); return; }
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const result = ev.target?.result as string;
                            if (result) setFormData({ ...formData, logoUrl: result });
                          };
                          reader.readAsDataURL(file);
                        }} />
                      </label>
                    </div>
                    {formData.logoUrl && (
                      <div className="flex items-center gap-4">
                        <img src={formData.logoUrl} alt="Logo Preview" className="h-16 w-16 object-contain rounded-2xl border bg-gray-50 p-2 shadow-inner" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        <button type="button" onClick={() => setFormData({ ...formData, logoUrl: '' })} className="text-xs text-red-500 font-bold hover:underline">Remove Logo</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Invoice Prefix</label>
                    <input className="w-full border border-gray-200 rounded-xl p-4 font-mono font-bold text-blue-600" value={formData.invoicePrefix} onChange={e => setFormData({ ...formData, invoicePrefix: e.target.value })} placeholder="INV-" />
                  </div>
                  <div className="flex items-center gap-3 pt-6 md:pt-8">
                    <input type="checkbox" id="enableDateTime" className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={formData.enableDateTime} onChange={e => setFormData({ ...formData, enableDateTime: e.target.checked })} />
                    <label htmlFor="enableDateTime" className="text-sm font-bold text-gray-700">Display detailed timestamps</label>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Letterhead Text (Header Address)</label>
                    <textarea className="w-full border border-gray-200 rounded-xl p-4 text-sm font-medium" rows={2} value={formData.invoiceHeader} onChange={e => setFormData({ ...formData, invoiceHeader: e.target.value })} placeholder="e.g. Registered Office Address..." />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Default Legal Terms</label>
                    <textarea className="w-full border border-gray-200 rounded-xl p-4 text-sm font-medium" rows={3} value={formData.terms} onChange={e => setFormData({ ...formData, terms: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Invoice Footer (Thank You Note)</label>
                    <textarea className="w-full border border-gray-200 rounded-xl p-4 text-sm font-medium" rows={2} value={formData.invoiceFooter} onChange={e => setFormData({ ...formData, invoiceFooter: e.target.value })} placeholder="Thank you for your business!" />
                  </div>
                </div>
              </div>

              {/* Real-time Visual Print Preview Column */}
              <div className="border border-gray-100 rounded-3xl bg-slate-50 p-6 flex flex-col space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <FileText size={16} className="text-blue-600" /> Live Print Layout Preview
                  </h4>
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-150 animate-pulse">
                    Live
                  </span>
                </div>
                <div className="bg-white border border-gray-150 rounded-2xl p-6 shadow-md font-sans text-[11px] text-gray-700 flex flex-col justify-between min-h-[480px]">
                  {/* Top Header */}
                  <div>
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        {formData.logoUrl ? (
                          <img src={formData.logoUrl} alt="Logo" className="h-8 w-auto mb-2 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : (
                          <div className="h-8 w-16 border border-dashed border-gray-250 rounded-lg flex items-center justify-center text-[7px] text-gray-400 font-bold mb-2 uppercase tracking-wide">NO LOGO</div>
                        )}
                        <h5 className="font-extrabold text-gray-900 text-sm">{formData.companyName || 'Business Legal Name'}</h5>
                        {formData.invoiceHeader ? (
                          <p className="text-gray-500 mt-1 whitespace-pre-line leading-relaxed max-w-[200px]">{formData.invoiceHeader}</p>
                        ) : (
                          <p className="text-gray-300 mt-1 italic">Configure letterhead address...</p>
                        )}
                        {formData.companyGstin && (
                          <p className="text-gray-500 font-bold mt-1">GSTIN: {formData.companyGstin}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider bg-gray-100 px-2 py-0.5 rounded">TAX INVOICE</span>
                        <p className="font-mono text-gray-600 font-bold mt-1 text-sm">#{formData.invoicePrefix || 'INV-'}1001</p>
                        <p className="text-gray-400 mt-2 text-[10px]">Date: {formData.enableDateTime ? new Date().toLocaleString() : new Date().toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="border-t border-b border-gray-100 py-2 mb-4 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Bill To</p>
                        <p className="font-bold text-gray-800">Walk-in Customer</p>
                        <p className="text-gray-400 text-[10px]">Phone: 9876543210</p>
                      </div>
                    </div>

                    {/* Table */}
                    <table className="w-full mb-4">
                      <thead>
                        <tr className="border-b border-gray-100 text-gray-400 font-bold text-[8px] uppercase tracking-wider text-left">
                          <th className="pb-1.5">Description</th>
                          <th className="pb-1.5 text-center w-10">Qty</th>
                          <th className="pb-1.5 text-right w-16">Price</th>
                          <th className="pb-1.5 text-right w-16">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-[10px]">
                        <tr>
                          <td className="py-1.5 text-gray-800 font-medium">Premium Products</td>
                          <td className="py-1.5 text-center text-gray-500">2</td>
                          <td className="py-1.5 text-right text-gray-500">₹150.00</td>
                          <td className="py-1.5 text-right font-bold text-gray-850">₹300.00</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 text-gray-800 font-medium">Consulting Hours</td>
                          <td className="py-1.5 text-center text-gray-500">1</td>
                          <td className="py-1.5 text-right text-gray-500">₹200.00</td>
                          <td className="py-1.5 text-right font-bold text-gray-850">₹200.00</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="flex justify-end text-[10px]">
                      <div className="w-40 space-y-1 text-right">
                        <div className="flex justify-between text-gray-500">
                          <span>Subtotal:</span>
                          <span>₹500.00</span>
                        </div>
                        <div className="flex justify-between text-gray-500">
                          <span>Tax (GST 18%):</span>
                          <span>₹90.00</span>
                        </div>
                        <div className="flex justify-between text-xs font-black text-gray-900 pt-1 border-t border-gray-150">
                          <span>Grand Total:</span>
                          <span>₹590.00</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom footer */}
                  <div className="mt-6 pt-3 border-t border-gray-100 grid grid-cols-2 gap-4 text-[9px] text-gray-500">
                    <div>
                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Terms & Conditions</p>
                      <p className="leading-relaxed max-w-[180px]">{formData.terms || 'Goods once sold will not be taken back.'}</p>
                    </div>
                    <div className="text-right flex flex-col justify-end">
                      {formData.invoiceFooter ? (
                        <p className="italic font-bold text-slate-700">{formData.invoiceFooter}</p>
                      ) : (
                        <p className="italic text-gray-300">Thank you for your business!</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'masters' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Layers className="text-blue-500" /> Catalog Masters
                </h3>
                <p className="text-gray-500 text-xs mt-0.5">Manage Categories and Measuring Units used across your inventory catalog.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Product Categories Column */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-gray-900 text-sm flex items-center gap-1.5">
                    <Tag size={16} className="text-indigo-600" /> Product Categories
                  </h4>
                  <button 
                    onClick={() => {
                      setEditingCategory(null);
                      setCatName('');
                      setCatDesc('');
                      setShowCatForm(true);
                    }}
                    className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-xl border border-indigo-100 font-bold hover:bg-indigo-100 transition-all flex items-center gap-1 active:scale-95"
                  >
                    <Plus size={14} /> Add Category
                  </button>
                </div>

                {showCatForm && (
                  <form onSubmit={handleSaveCategory} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4 animate-in slide-in-from-top-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{editingCategory ? 'Edit Category' : 'Create Category'}</span>
                      <button type="button" onClick={() => setShowCatForm(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Category Name*</label>
                      <input 
                        type="text" 
                        required
                        className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-600 font-bold bg-white"
                        placeholder="e.g. Gold Hallmark"
                        value={catName}
                        onChange={e => setCatName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Description</label>
                      <input 
                        type="text"
                        className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-600 font-medium bg-white"
                        placeholder="Optional details..."
                        value={catDesc}
                        onChange={e => setCatDesc(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button type="button" onClick={() => setShowCatForm(false)} className="px-4 py-2 border rounded-xl text-xs font-bold text-gray-700">Cancel</button>
                      <button type="submit" disabled={submittingCat} className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 transition-all">
                        {submittingCat ? 'Saving...' : 'Save Category'}
                      </button>
                    </div>
                  </form>
                )}

                {loadingMasters ? (
                  <div className="py-12 text-center text-gray-400 font-medium flex items-center justify-center gap-2"><RefreshCcw className="animate-spin text-blue-600" size={16} /> Loading...</div>
                ) : categories.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400 italic bg-gray-50 rounded-2xl border border-dashed">No categories defined yet.</div>
                ) : (
                  <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50 max-h-[350px] overflow-y-auto">
                    {categories.map(c => (
                      <div key={c.category_id} className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-all">
                        <div>
                          <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                            {c.category_name}
                            <button
                              onClick={() => handleToggleCatActive(c.category_id!)}
                              className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${c.is_active ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-100 text-gray-400'}`}
                            >
                              {c.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </div>
                          {c.description && <p className="text-[11px] text-gray-500 font-medium mt-0.5">{c.description}</p>}
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setEditingCategory(c);
                              setCatName(c.category_name);
                              setCatDesc(c.description || '');
                              setShowCatForm(true);
                            }}
                            className="text-gray-400 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded-lg transition-all"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={() => handleDeleteCategory(c.category_id!)}
                            className="text-gray-300 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Measuring Units Column */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-gray-900 text-sm flex items-center gap-1.5">
                    <Scale size={16} className="text-amber-600" /> Measuring Units
                  </h4>
                  <button 
                    onClick={() => {
                      setEditingUnit(null);
                      setUnitName('');
                      setUnitShortName('');
                      setShowUnitForm(true);
                    }}
                    className="text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-xl border border-amber-100 font-bold hover:bg-amber-100 transition-all flex items-center gap-1 active:scale-95"
                  >
                    <Plus size={14} /> Add Unit
                  </button>
                </div>

                {showUnitForm && (
                  <form onSubmit={handleSaveUnit} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4 animate-in slide-in-from-top-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{editingUnit ? 'Edit Unit' : 'Create Unit'}</span>
                      <button type="button" onClick={() => setShowUnitForm(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Unit Name*</label>
                        <input 
                          type="text" 
                          required
                          className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-600 font-bold bg-white"
                          placeholder="e.g. Grams"
                          value={unitName}
                          onChange={e => setUnitName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Short Code*</label>
                        <input 
                          type="text" 
                          required
                          className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-600 font-bold bg-white"
                          placeholder="e.g. g"
                          value={unitShortName}
                          onChange={e => setUnitShortName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button type="button" onClick={() => setShowUnitForm(false)} className="px-4 py-2 border rounded-xl text-xs font-bold text-gray-700">Cancel</button>
                      <button type="submit" disabled={submittingUnit} className="px-5 py-2 bg-amber-600 text-white rounded-xl text-xs font-black hover:bg-amber-700 transition-all">
                        {submittingUnit ? 'Saving...' : 'Save Unit'}
                      </button>
                    </div>
                  </form>
                )}

                {loadingMasters ? (
                  <div className="py-12 text-center text-gray-400 font-medium flex items-center justify-center gap-2"><RefreshCcw className="animate-spin text-blue-600" size={16} /> Loading...</div>
                ) : units.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400 italic bg-gray-50 rounded-2xl border border-dashed">No measuring units defined yet.</div>
                ) : (
                  <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-50 max-h-[350px] overflow-y-auto">
                    {units.map(u => (
                      <div key={u.unit_id} className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-all">
                        <div>
                          <div className="font-bold text-gray-900 text-sm">{u.unit_name}</div>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">Short Code: <span className="font-black text-indigo-600">{u.short_name}</span></p>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setEditingUnit(u);
                              setUnitName(u.unit_name);
                              setUnitShortName(u.short_name);
                              setShowUnitForm(true);
                            }}
                            className="text-gray-400 hover:text-amber-600 p-1.5 hover:bg-amber-50 rounded-lg transition-all"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={() => handleDeleteUnit(u.unit_id!)}
                            className="text-gray-300 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'license' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in space-y-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><CreditCard className="text-blue-500" /> Plan & Identity</h3>
            <div className="flex flex-col md:flex-row items-center gap-8 p-8 bg-slate-900 text-white rounded-[40px] relative overflow-hidden shadow-2xl shadow-blue-200">
              <div className="absolute right-0 top-0 opacity-10 translate-x-4 -translate-y-4">
                <Key size={180} />
              </div>
              <div className="relative z-10 flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <span className="bg-blue-600 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">{formData.license.plan}</span>
                  <span className="bg-emerald-600 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">{formData.license.status}</span>
                </div>
                <h4 className="text-3xl font-black font-mono tracking-tighter mb-2">{formData.license.key}</h4>
                <p className="text-slate-400 text-sm">Unique Activation Token used for SaaS partitioning.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Bug className="text-red-500" /> SaaS Audit Trail</h3>
              <button onClick={() => Logger.clearLogs()} className="text-red-600 text-xs font-bold flex items-center gap-1 hover:underline"><Trash2 size={14} /> Wipe Session Logs</button>
            </div>
            <div className="bg-slate-950 rounded-[32px] p-6 h-96 overflow-y-auto font-mono text-[10px] leading-relaxed">
              {logs.length === 0 ? <p className="text-slate-600 italic">No system events logged for this session.</p> : logs.map((log, i) => (
                <div key={i} className={`mb-3 pb-3 border-b border-slate-900 ${log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARN' ? 'text-amber-400' : 'text-slate-500'}`}>
                  <span className="text-slate-700">[{new Date(log.timestamp).toLocaleTimeString()}]</span> <span className="font-black">{log.level}:</span> {log.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
