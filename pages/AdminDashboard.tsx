import React, { useMemo, useState, useEffect } from 'react';
import { adminGetUsers, adminGetPlans, adminGetPayments, adminSavePlan, adminInitSystem, adminGetMetrics, adminGetLicenses, adminSaveLicense, adminDeleteLicense, adminGetErrorLogs, adminGetContactMessages, getSettings, saveSettings, verifyConnection, initDataLayer } from '../services/dataService';
import { SaaSUser, SaaSPlan, SaasPayment, MySQLConfig, AdminMetrics, SaaSLicenseKey, AdminErrorLog, ContactMessage } from '../types';
import { Users, CreditCard, Settings, HardDrive, ShieldCheck, Search, Plus, RefreshCw, AlertCircle, Database, ExternalLink, Mail, IndianRupee, Activity, KeyRound, Trash2, Bug, MessageCircle } from 'lucide-react';
import { APP_CONFIG } from '../config';

const EMPTY_METRICS: AdminMetrics = {
  totalTenants: 0,
  activeTenants24h: 0,
  totalRevenue: 0,
  totalPayments: 0,
  successPayments: 0,
  pendingPayments: 0,
  mtdRevenue: 0
};

const blankPlan: SaaSPlan = {
  id: '',
  name: '',
  price: '$0',
  description: '',
  features: '[]',
  isPopular: false
};

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tenants' | 'plans' | 'licenses' | 'payments' | 'contact' | 'logs' | 'system'>('tenants');
  const [users, setUsers] = useState<SaaSUser[]>([]);
  const [plans, setPlans] = useState<SaaSPlan[]>([]);
  const [payments, setPayments] = useState<SaasPayment[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [systemStatus, setSystemStatus] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [mysqlConfig, setMysqlConfig] = useState<MySQLConfig>(getSettings().mysqlConfig);
  const [showNewPlanForm, setShowNewPlanForm] = useState(false);
  const [planDraft, setPlanDraft] = useState<SaaSPlan>(blankPlan);

  const [licenses, setLicenses] = useState<SaaSLicenseKey[]>([]);
  const [errorLogs, setErrorLogs] = useState<AdminErrorLog[]>([]);
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([]);
  const [licenseDraft, setLicenseDraft] = useState<{ license_key: string; plan_id: string; status: string; assigned_email: string; max_users: number }>({
    license_key: '',
    plan_id: 'FREE',
    status: 'ACTIVE',
    assigned_email: '',
    max_users: 1
  });
  const [licenseFormError, setLicenseFormError] = useState<string | null>(null);

  useEffect(() => {
    loadGlobalData();
  }, []);

  const loadGlobalData = async () => {
    setLoading(true);
    try {
      const [u, p, pay, m, l, logs, contacts] = await Promise.all([adminGetUsers(), adminGetPlans(), adminGetPayments(), adminGetMetrics(), adminGetLicenses(), adminGetErrorLogs(), adminGetContactMessages()]);
      setUsers(u || []);
      setPlans(p || []);
      setPayments(pay || []);
      setMetrics(m || EMPTY_METRICS);
      setLicenses(l || []);
      setErrorLogs(logs || []);
      setContactMessages(contacts || []);
    } catch (e) {
      console.error('Failed to load admin data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleInitSystem = async () => {
    if (!window.confirm('WARNING: This will re-run DDL to create missing tables and seed default plans. Continue?')) return;
    setLoading(true);
    try {
      await adminInitSystem();
      await Promise.all(APP_CONFIG.pricing.map((p) => adminSavePlan({
        id: p.name.toUpperCase(),
        name: p.name,
        price: p.price,
        description: p.description,
        features: JSON.stringify(p.features),
        isPopular: p.popular
      })));
      setSystemStatus('System DDL executed and default offerings seeded.');
      setTimeout(() => setSystemStatus(null), 5000);
      await loadGlobalData();
    } catch (e: any) {
      setSystemStatus(`Initialization failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyBridgeConnection = async () => {
    setLoading(true);
    setConnectionError(null);
    setConnectionStatus(null);
    try {
      await verifyConnection(mysqlConfig);
      setConnectionStatus('Bridge connection is healthy.');
    } catch (e: any) {
      setConnectionError(e.message || 'Bridge verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBridgeConfig = async () => {
    setLoading(true);
    setConnectionError(null);
    setConnectionStatus(null);
    try {
      const current = getSettings();
      const updatedSettings = { ...current, mysqlConfig, dataSource: 'CLOUD_MYSQL' as const };
      await verifyConnection(mysqlConfig);
      await initDataLayer(updatedSettings);
      await saveSettings(updatedSettings);
      setConnectionStatus('Bridge configuration verified and saved.');
    } catch (e: any) {
      setConnectionError(e.message || 'Failed to save bridge configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNewPlan = async () => {
    const normalizedId = planDraft.id.trim() || planDraft.name.trim().toUpperCase().replace(/\s+/g, '_');
    if (!normalizedId || !planDraft.name.trim()) {
      setSystemStatus('Plan ID/Name is required.');
      return;
    }

    let features = planDraft.features;
    if (!features.trim().startsWith('[')) {
      const lines = features.split('\n').map((f) => f.trim()).filter(Boolean);
      features = JSON.stringify(lines);
    } else {
      JSON.parse(features);
    }

    setLoading(true);
    try {
      await adminSavePlan({ ...planDraft, id: normalizedId, features });
      setPlanDraft(blankPlan);
      setShowNewPlanForm(false);
      setSystemStatus('Offering saved successfully.');
      await loadGlobalData();
    } catch (e: any) {
      setSystemStatus(`Failed to save offering: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };



  const handleSaveLicense = async () => {
    const normalizedLicense = licenseDraft.license_key.trim().toUpperCase();
    if (!normalizedLicense) {
      setLicenseFormError('License key is required.');
      return;
    }
    if (!/^SB-(FREE|PRO|ENT)-[A-Z0-9]{6,}$/.test(normalizedLicense)) {
      setLicenseFormError('License key format must be SB-FREE/PRO/ENT-XXXXXX.');
      return;
    }
    if (licenseDraft.assigned_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(licenseDraft.assigned_email.trim())) {
      setLicenseFormError('Assigned email format is invalid.');
      return;
    }

    setLicenseFormError(null);
    setLoading(true);
    try {
      await adminSaveLicense({
        license_key: normalizedLicense,
        plan_id: licenseDraft.plan_id,
        status: licenseDraft.status,
        assigned_email: licenseDraft.assigned_email.trim() || undefined,
        max_users: Number(licenseDraft.max_users) || 1
      });
      setLicenseDraft({ license_key: '', plan_id: 'FREE', status: 'ACTIVE', assigned_email: '', max_users: 1 });
      setSystemStatus('License saved successfully.');
      await loadGlobalData();
    } catch (e: any) {
      setLicenseFormError(e.message || 'Failed to save license.');
      setSystemStatus(`Failed to save license: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLicense = async (licenseKey: string) => {
    if (!window.confirm(`Delete license ${licenseKey}?`)) return;
    setLoading(true);
    try {
      await adminDeleteLicense(licenseKey);
      setSystemStatus('License deleted.');
      await loadGlobalData();
    } catch (e: any) {
      setSystemStatus(`Failed to delete license: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
    || u.name.toLowerCase().includes(searchTerm.toLowerCase())
    || u.license_key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const revenueSummary = useMemo(() => {
    const success = payments.filter((p) => String(p.status).toUpperCase() === 'SUCCESS');
    const total = success.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const successRate = payments.length ? Math.round((success.length / payments.length) * 100) : 100;
    return {
      total,
      successRate
    };
  }, [payments]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="bg-slate-900/50 border-b border-white/5 py-4 px-8 flex justify-between items-center sticky top-0 z-50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/10">
            <Settings className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">SaaS Command Center</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Platform Orchestrator • BizByTech</p>
          </div>
        </div>
        <button onClick={loadGlobalData} className="p-2.5 bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all"><RefreshCw size={20} className={loading ? 'animate-spin' : ''} /></button>
      </header>

      <div className="flex">
        <aside className="w-64 bg-slate-900/30 border-r border-white/5 min-h-[calc(100vh-73px)] p-6 space-y-2">
          {[
            { id: 'tenants', label: 'Tenants Registry', icon: Users },
            { id: 'plans', label: 'Offerings Master', icon: CreditCard },
            { id: 'licenses', label: 'License Vault', icon: KeyRound },
            { id: 'payments', label: 'Revenue Audit', icon: IndianRupee },
            { id: 'contact', label: 'Contact Inbox', icon: MessageCircle },
            { id: 'logs', label: 'Error Logger', icon: Bug },
            { id: 'system', label: 'Global System', icon: HardDrive }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all text-sm ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'}`}
            >
              <item.icon size={18} /> {item.label}
            </button>
          ))}
        </aside>

        <main className="flex-1 p-8">
          {systemStatus && <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 font-bold text-sm flex items-center gap-3"><ShieldCheck size={20} /> {systemStatus}</div>}

          {activeTab === 'tenants' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl"><p className="text-[10px] uppercase text-slate-500 font-black">Total Tenants</p><p className="text-3xl font-black text-white">{metrics.totalTenants}</p></div>
                <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl"><p className="text-[10px] uppercase text-slate-500 font-black">Active (24h)</p><p className="text-3xl font-black text-emerald-400">{metrics.activeTenants24h}</p></div>
                <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl"><p className="text-[10px] uppercase text-slate-500 font-black">Activation Ratio</p><p className="text-3xl font-black text-indigo-400">{metrics.totalTenants ? Math.round((metrics.activeTenants24h / metrics.totalTenants) * 100) : 0}%</p></div>
              </div>

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div><h2 className="text-3xl font-black text-white">Tenant Activity Monitoring</h2><p className="text-slate-500 text-sm font-medium">Realtime operational visibility on tenant engagement.</p></div>
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                  <input className="w-full pl-12 pr-4 py-3.5 bg-slate-900 border border-white/5 rounded-2xl text-sm" placeholder="Search by email, name or token..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
              </div>

              <div className="bg-slate-900/50 border border-white/5 rounded-[40px] overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 border-b border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest"><tr><th className="px-8 py-5">Onboarding Date</th><th className="px-8 py-5">Tenant Identity</th><th className="px-8 py-5">License</th><th className="px-8 py-5 text-right">Action</th></tr></thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredUsers.length === 0 ? <tr><td colSpan={4} className="px-8 py-20 text-center text-slate-500 font-bold">No tenants registered yet.</td></tr> : filteredUsers.map((u, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-8 py-6 text-slate-500 font-mono text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                        <td className="px-8 py-6"><div className="font-bold text-white">{u.name}</div><div className="text-xs text-slate-500">{u.email}</div></td>
                        <td className="px-8 py-6"><span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-500/5 px-3 py-1.5 rounded-lg border border-indigo-500/20">{u.license_key}</span></td>
                        <td className="px-8 py-6 text-right"><button className="text-slate-500 hover:text-white p-2"><Mail size={18} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'plans' && (
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <div><h2 className="text-3xl font-black text-white">SaaS Offerings</h2><p className="text-slate-500 text-sm font-medium">Create and maintain production pricing catalogs.</p></div>
                <button onClick={() => setShowNewPlanForm((v) => !v)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2"><Plus size={20} /> New Offering</button>
              </div>

              {showNewPlanForm && (
                <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-6 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <input className="px-4 py-3 rounded-xl bg-slate-950 border border-white/10" placeholder="Plan ID (e.g. PRO_MONTHLY)" value={planDraft.id} onChange={(e) => setPlanDraft({ ...planDraft, id: e.target.value })} />
                    <input className="px-4 py-3 rounded-xl bg-slate-950 border border-white/10" placeholder="Display Name" value={planDraft.name} onChange={(e) => setPlanDraft({ ...planDraft, name: e.target.value })} />
                    <input className="px-4 py-3 rounded-xl bg-slate-950 border border-white/10" placeholder="Price (e.g. $49/mo)" value={planDraft.price} onChange={(e) => setPlanDraft({ ...planDraft, price: e.target.value })} />
                    <input className="px-4 py-3 rounded-xl bg-slate-950 border border-white/10" placeholder="Description" value={planDraft.description} onChange={(e) => setPlanDraft({ ...planDraft, description: e.target.value })} />
                    <textarea className="px-4 py-3 rounded-xl bg-slate-950 border border-white/10 md:col-span-2 min-h-24" placeholder="Features JSON array or newline-separated list" value={planDraft.features} onChange={(e) => setPlanDraft({ ...planDraft, features: e.target.value })} />
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={planDraft.isPopular} onChange={(e) => setPlanDraft({ ...planDraft, isPopular: e.target.checked })} /> Mark as Featured</label>
                  <button onClick={handleSaveNewPlan} disabled={loading} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-xl font-black text-white disabled:opacity-50">{loading ? 'Saving...' : 'Save Offering'}</button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plans.length === 0 ? <div className="col-span-3 py-20 text-center border-2 border-dashed border-white/5 rounded-[40px] text-slate-600 font-bold italic">No active plans found in master DB. Use Global System initialization.</div> : plans.map((plan) => (
                  <div key={plan.id} className="bg-slate-900/50 border border-white/5 p-8 rounded-[40px] space-y-6 relative overflow-hidden">
                    {plan.isPopular && <div className="absolute top-0 right-1/2 translate-x-1/2 bg-indigo-600 text-[8px] font-black uppercase tracking-widest px-4 py-1.5 rounded-b-xl">Featured</div>}
                    <div><h3 className="text-2xl font-black text-white">{plan.name}</h3><p className="text-slate-500 text-xs mt-1">{plan.description}</p></div>
                    <div className="text-4xl font-black text-indigo-400 font-mono tracking-tighter">{plan.price}</div>
                    <div className="space-y-3 pt-6 border-t border-white/5">{JSON.parse(plan.features || '[]').map((f: string, idx: number) => <div key={idx} className="flex items-center gap-3 text-xs text-slate-400"><ShieldCheck size={14} className="text-emerald-500" /> {f}</div>)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'licenses' && (
            <div className="space-y-6">
              <div><h2 className="text-3xl font-black text-white">License Key Management</h2><p className="text-slate-500 text-sm font-medium">Create, assign and revoke SaaS license keys for customer onboarding.</p></div>

               <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-6 space-y-4">
                 <div className="grid md:grid-cols-5 gap-4">
                   <input className="px-4 py-3 rounded-xl bg-slate-950 border border-white/10" placeholder="SB-PRO-ABC123" value={licenseDraft.license_key} onChange={(e) => setLicenseDraft({ ...licenseDraft, license_key: e.target.value })} />
                   <select 
                     className="px-4 py-3 rounded-xl bg-slate-950 border border-white/10" 
                     value={licenseDraft.plan_id} 
                     onChange={(e) => {
                       const plan = e.target.value;
                       const suggested = plan === 'ENT' ? 10 : plan === 'PRO' ? 3 : 1;
                       setLicenseDraft({ ...licenseDraft, plan_id: plan, max_users: suggested });
                     }}
                   >
                     <option value="FREE">FREE</option>
                     <option value="PRO">PRO</option>
                     <option value="ENT">ENT</option>
                   </select>
                   <select className="px-4 py-3 rounded-xl bg-slate-950 border border-white/10" value={licenseDraft.status} onChange={(e) => setLicenseDraft({ ...licenseDraft, status: e.target.value })}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option><option value="EXPIRED">EXPIRED</option></select>
                   <input className="px-4 py-3 rounded-xl bg-slate-950 border border-white/10" placeholder="assigned@email.com" value={licenseDraft.assigned_email} onChange={(e) => setLicenseDraft({ ...licenseDraft, assigned_email: e.target.value })} />
                   <input type="text" inputMode="decimal" min={1} className="px-4 py-3 rounded-xl bg-slate-950 border border-white/10" placeholder="Max Seats" value={licenseDraft.max_users} onChange={(e) => setLicenseDraft({ ...licenseDraft, max_users: parseInt(e.target.value, 10) || 1 })} />
                 </div>
                 {licenseFormError && <div className="text-sm text-red-400 font-bold">{licenseFormError}</div>}
                 <button onClick={handleSaveLicense} disabled={loading} className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold text-sm text-white disabled:opacity-50">{loading ? 'Saving...' : 'Save License'}</button>
               </div>

              <div className="bg-slate-900/50 border border-white/5 rounded-[28px] overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 border-b border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest"><tr><th className="px-6 py-4">License</th><th className="px-6 py-4">Plan</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Assigned</th><th className="px-6 py-4">Max Seats</th><th className="px-6 py-4 text-right">Action</th></tr></thead>
                  <tbody className="divide-y divide-white/5">
                    {licenses.length === 0 ? <tr><td colSpan={6} className="px-8 py-12 text-center text-slate-500 font-bold">No license keys found.</td></tr> : licenses.map((l) => (
                      <tr key={l.license_key}><td className="px-6 py-4 font-mono text-xs text-indigo-300">{l.license_key}</td><td className="px-6 py-4">{l.plan_id}</td><td className="px-6 py-4">{l.status}</td><td className="px-6 py-4 text-xs text-slate-400">{l.assigned_email || '-'}</td><td className="px-6 py-4 font-semibold text-slate-300">{l.max_users || (l.plan_id === 'ENT' ? 10 : l.plan_id === 'PRO' ? 3 : 1)} seat(s)</td><td className="px-6 py-4 text-right"><button onClick={() => handleDeleteLicense(l.license_key)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'contact' && (
            <div className="space-y-6">
              <div><h2 className="text-3xl font-black text-white">Contact Us Inbox</h2><p className="text-slate-500 text-sm font-medium">Messages submitted from public contact page.</p></div>
              <div className="bg-slate-900/50 border border-white/5 rounded-[28px] overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 border-b border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest"><tr><th className="px-6 py-4">Date</th><th className="px-6 py-4">Sender</th><th className="px-6 py-4">Subject</th><th className="px-6 py-4">Message</th></tr></thead>
                  <tbody className="divide-y divide-white/5">{contactMessages.length === 0 ? <tr><td colSpan={4} className="px-8 py-12 text-center text-slate-500 font-bold">No messages yet.</td></tr> : contactMessages.map((m) => (<tr key={m.id}><td className="px-6 py-4 text-xs text-slate-500">{new Date(m.created_at).toLocaleString()}</td><td className="px-6 py-4"><div className="font-bold text-white">{m.name}</div><div className="text-xs text-slate-500">{m.email}</div></td><td className="px-6 py-4">{m.subject}</td><td className="px-6 py-4 text-xs text-slate-400 max-w-lg">{m.message}</td></tr>))}</tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-6">
              <div><h2 className="text-3xl font-black text-white">Error Logger</h2><p className="text-slate-500 text-sm font-medium">Platform API/client exceptions captured for debugging.</p></div>
              <div className="space-y-3">{errorLogs.length === 0 ? <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-8 text-center text-slate-500 font-bold">No error logs recorded.</div> : errorLogs.map((l) => (<div key={l.id} className="bg-slate-900/50 border border-white/5 rounded-2xl p-4"><div className="flex items-center justify-between"><div className="font-bold text-white text-sm">[{l.level}] {l.source}</div><div className="text-xs text-slate-500">{new Date(l.created_at).toLocaleString()}</div></div><p className="text-sm text-slate-300 mt-2">{l.message}</p>{l.context && <pre className="mt-2 text-[11px] text-slate-500 overflow-auto whitespace-pre-wrap">{l.context}</pre>}</div>))}</div>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="space-y-6">
              <div><h2 className="text-3xl font-black text-white">Revenue Report</h2><p className="text-slate-500 text-sm font-medium">Production finance telemetry for subscriptions.</p></div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Revenue</p><p className="text-3xl font-black text-white mt-1">${Number(metrics.totalRevenue || revenueSummary.total).toFixed(2)}</p></div>
                <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">MTD Revenue</p><p className="text-3xl font-black text-indigo-400 mt-1">${Number(metrics.mtdRevenue).toFixed(2)}</p></div>
                <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pending Settlements</p><p className="text-3xl font-black text-amber-400 mt-1">{metrics.pendingPayments}</p></div>
                <div className="bg-slate-900 border border-white/5 p-6 rounded-3xl"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Success Rate</p><p className="text-3xl font-black text-emerald-400 mt-1">{metrics.totalPayments ? Math.round((metrics.successPayments / metrics.totalPayments) * 100) : revenueSummary.successRate}%</p></div>
              </div>

              <div className="bg-slate-900/50 border border-white/5 rounded-[40px] overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 border-b border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest"><tr><th className="px-8 py-5">Date</th><th className="px-8 py-5">Subscriber</th><th className="px-8 py-5">Plan</th><th className="px-8 py-5">Reference</th><th className="px-8 py-5">Status</th><th className="px-8 py-5 text-right">Amount</th></tr></thead>
                  <tbody className="divide-y divide-white/5">
                    {payments.length === 0 ? <tr><td colSpan={6} className="px-8 py-20 text-center text-slate-500 font-bold italic">No financial records found.</td></tr> : payments.map((pay, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-8 py-6 text-slate-500 font-mono text-xs">{new Date(pay.timestamp).toLocaleDateString()}</td>
                        <td className="px-8 py-6 font-bold text-white">{pay.email}</td>
                        <td className="px-8 py-6 uppercase font-black text-[10px] text-indigo-400">{pay.plan_id}</td>
                        <td className="px-8 py-6 font-mono text-xs text-slate-500">{pay.transaction_ref}</td>
                        <td className="px-8 py-6 text-xs font-bold">{pay.status}</td>
                        <td className="px-8 py-6 text-right font-black text-white">{pay.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="space-y-8">
              <div><h2 className="text-3xl font-black text-white">System Operations</h2><p className="text-slate-500 text-sm font-medium">Platform-wide orchestration and health maintenance.</p></div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-slate-900/50 border border-white/5 p-10 rounded-[40px] flex flex-col items-center text-center space-y-6">
                  <div className="h-20 w-20 bg-indigo-600/10 rounded-[32px] flex items-center justify-center border border-indigo-500/20"><Database className="text-indigo-500" size={40} /></div>
                  <div><h3 className="text-xl font-black text-white">Resilient DB Bootstrap</h3><p className="text-sm text-slate-500 mt-2">Creates missing global tables safely (`IF NOT EXISTS`) and seeds base offerings.</p></div>
                  <button onClick={handleInitSystem} disabled={loading} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl">{loading ? <RefreshCw className="animate-spin mx-auto" size={20} /> : 'Run Master Initialization'}</button>
                </div>

                <div className="bg-slate-900/50 border border-white/5 p-10 rounded-[40px] flex flex-col items-center text-center space-y-6">
                  <div className="h-20 w-20 bg-emerald-500/10 rounded-[32px] flex items-center justify-center border border-emerald-500/20"><Activity className="text-emerald-500" size={40} /></div>
                  <div><h3 className="text-xl font-black text-white">Cluster Health Check</h3><p className="text-sm text-slate-500 mt-2">Verifies bridge endpoint + MySQL credentials before save.</p></div>
                  <button onClick={handleVerifyBridgeConnection} disabled={loading} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-2xl disabled:opacity-50">{loading ? <RefreshCw className="animate-spin mx-auto" size={18} /> : <span className="flex justify-center items-center gap-2"><ExternalLink size={18} /> Verify Bridge Connection</span>}</button>
                </div>
              </div>

              <div className="bg-slate-900/50 border border-white/5 p-8 rounded-[40px] space-y-6">
                <div><h3 className="text-xl font-black text-white">Bridge Configuration (Admin Only)</h3><p className="text-sm text-slate-500 mt-1">Manage bridge endpoint only. Database credentials must be provided via secure server environment variables.</p></div>
                {connectionStatus && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-2xl text-sm font-bold">{connectionStatus}</div>}
                {connectionError && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-2xl text-sm font-bold">{connectionError}</div>}
                <div className="space-y-4">
                  <input className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-white/10 text-sm" placeholder="Bridge API URL" value={mysqlConfig.apiUrl} onChange={(e) => setMysqlConfig({ ...mysqlConfig, apiUrl: e.target.value })} />
                  <div className="text-xs text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                    Security mode: DB host/user/password are not editable in UI and must be supplied using secure backend environment variables (e.g. MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE).
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleVerifyBridgeConnection} disabled={loading} className="px-5 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-sm disabled:opacity-50">{loading ? 'Verifying...' : 'Verify Connection'}</button>
                  <button onClick={handleSaveBridgeConfig} disabled={loading} className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold text-sm text-white disabled:opacity-50">{loading ? 'Saving...' : 'Save Bridge Config'}</button>
                </div>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/20 p-8 rounded-[40px] flex items-start gap-5">
                <div className="p-4 bg-amber-500/10 rounded-3xl"><AlertCircle className="text-amber-500" size={32} /></div>
                <div className="flex-1"><h4 className="text-amber-400 font-black text-lg">System-Wide Modification Policy</h4><p className="text-sm text-amber-400/60 mt-1 leading-relaxed font-medium">Initialization creates missing resources, does not drop data, and should be run after infrastructure resets/migrations.</p></div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
