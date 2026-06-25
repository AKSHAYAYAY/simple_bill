
import React, { useState } from 'react';
import { AppSettings, DataSource } from '../types';
import { saveSettings, initDataLayer, getSettings, verifyConnection } from '../services/dataService';
import { Sheet, HardDrive, Settings, AlertTriangle, PlusCircle, HelpCircle, ExternalLink, Server, CheckCircle2, Cloud, ArrowRight, RefreshCcw, ArrowLeft } from 'lucide-react';

interface SetupProps {
  settings: AppSettings;
  onComplete: (settings: AppSettings) => void;
}

export const Setup: React.FC<SetupProps> = ({ settings, onComplete }) => {
  const [mode, setMode] = useState<DataSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  
  const [cloudConfig, setCloudConfig] = useState({
      clientId: settings.clientId || '',
      apiKey: settings.apiKey || '',
      sheetId: settings.sheetId || ''
  });

  // Always use fresh settings from storage to avoid stale props from App component during first run
  const [mysqlConfig, setMysqlConfig] = useState(getSettings().mysqlConfig);

  const handleLocalSetup = () => {
      const newSettings = { ...getSettings(), dataSource: 'INDEXED_DB' as DataSource, isConfigured: true };
      saveSettings(newSettings);
      onComplete(newSettings);
  };

  const handleManagedCloudSetup = async () => {
    setLoading(true);
    setLoadingMsg("Verifying Cloud Connection...");
    setError('');
    // Use the potentially updated mysqlConfig from local storage/state
    const currentSettings = getSettings();
    const tempSettings = { ...currentSettings, dataSource: 'CLOUD_MYSQL' as DataSource, mysqlConfig: currentSettings.mysqlConfig };
    
    try {
        await verifyConnection(tempSettings.mysqlConfig);
        
        setLoadingMsg("Initializing SaaS Workspace...");
        await initDataLayer(tempSettings);
        
        const finalSettings = { ...tempSettings, isConfigured: true };
        await saveSettings(finalSettings);
        setSuccess(true);
        setTimeout(() => onComplete(finalSettings), 1500);
    } catch (err: any) {
        setError(err.message || "SaaS Cluster connection failed.");
    } finally {
        setLoading(false);
        setLoadingMsg('');
    }
  };

  const handleMysqlSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoadingMsg("Testing Database Credentials...");
    setError('');
    
    const tempSettings = { ...getSettings(), dataSource: 'MYSQL' as DataSource, mysqlConfig };
    
    try {
        // Step 1: Explicitly test the connection first
        await verifyConnection(mysqlConfig);
        
        // Step 2: Initialize
        setLoadingMsg("Initializing Database Schema...");
        await initDataLayer(tempSettings);
        
        const finalSettings = { ...tempSettings, isConfigured: true };
        await saveSettings(finalSettings);
        setSuccess(true);
        setTimeout(() => onComplete(finalSettings), 2000);
    } catch (err: any) {
        setError(err.message || "Remote bridge verification failed.");
    } finally {
        setLoading(false);
        setLoadingMsg('');
    }
  };

  return (
    <div className="flex flex-col justify-center py-12 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)] animate-in fade-in">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Onboarding: Storage Setup</h2>
        <p className="mt-2 text-sm text-gray-500 font-medium italic">
            Note: This choice is permanent for this registered license key.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-2xl sm:rounded-3xl sm:px-10 border border-gray-100">
           
           {success ? (
               <div className="text-center py-8 animate-in zoom-in">
                   <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-100">
                       <CheckCircle2 className="text-green-600" size={32} />
                   </div>
                   <h3 className="text-xl font-black text-gray-900">Provisioning Complete</h3>
                   <p className="text-gray-500 mt-1">SaaS Workspace Initialized Successfully.</p>
               </div>
           ) : !mode ? (
               <div className="space-y-4">
                  <div className="flex flex-col gap-4">
                    {error && (
                        <div className="p-4 bg-red-50 text-red-700 border border-red-100 rounded-xl text-xs font-bold flex flex-col gap-2 items-start animate-in shake">
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={16} className="shrink-0" />
                                <span>{error}</span>
                            </div>
                            <button 
                                onClick={handleLocalSetup}
                                className="text-blue-600 hover:underline mt-1"
                            >
                                Switch to Local Storage (Offline Mode) &rarr;
                            </button>
                        </div>
                    )}
                    
                    <button 
                        onClick={handleManagedCloudSetup}
                        disabled={loading}
                        className="w-full flex items-start p-5 border border-blue-500 rounded-2xl bg-blue-50/50 hover:bg-blue-100/50 transition-all text-left ring-2 ring-blue-100 active:scale-95 disabled:opacity-70 disabled:active:scale-100"
                    >
                        <div className="p-3 rounded-xl bg-blue-600 text-white shadow-lg">
                            <Cloud size={24} />
                        </div>
                        <div className="ml-4">
                            <h3 className="font-black text-blue-900 text-sm">BizByTech Managed SaaS</h3>
                            <p className="text-xs text-blue-700 font-medium">Auto-partitioned, zero maintenance.</p>
                        </div>
                        {loading ? <RefreshCcw className="ml-auto mt-3 animate-spin text-blue-600" size={18} /> : <ArrowRight size={18} className="ml-auto mt-3 text-blue-400 opacity-50" />}
                    </button>
                    {loading && loadingMsg && (
                        <div className="text-center text-xs font-bold text-blue-600 animate-pulse">{loadingMsg}</div>
                    )}
                  </div>

                  <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                    <div className="relative flex justify-center text-[10px] uppercase font-black text-gray-400 tracking-widest"><span className="px-3 bg-white">Advanced Configuration</span></div>
                  </div>

                  {[
                    { id: 'MYSQL', icon: Server, color: 'purple', title: 'Bring Your Own DB (BYODB)', desc: 'Host on your own MySQL Cluster.' },
                    { id: 'INDEXED_DB', icon: HardDrive, color: 'gray', title: 'Local Storage Only', desc: 'No Cloud features. Desktop only.' }
                  ].map(ds => (
                    <button 
                      key={ds.id}
                      onClick={() => ds.id === 'INDEXED_DB' ? handleLocalSetup() : setMode(ds.id as DataSource)}
                      className="w-full group flex items-start p-5 border border-gray-200 rounded-2xl hover:border-gray-400 hover:bg-gray-50 transition-all text-left active:scale-95"
                    >
                        <div className={`p-3 rounded-xl bg-gray-100 text-gray-500 group-hover:bg-white transition-all`}>
                            <ds.icon size={20} />
                        </div>
                        <div className="ml-4">
                            <h3 className="font-black text-gray-900 text-sm">{ds.title}</h3>
                            <p className="text-xs text-gray-500">{ds.desc}</p>
                        </div>
                    </button>
                  ))}
               </div>
           ) : (
                <form onSubmit={handleMysqlSetup} className="space-y-4 animate-in fade-in slide-in-from-top-4">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <h3 className="text-lg font-black text-gray-900">Custom SaaS Bridge</h3>
                        </div>
                        <button 
                            type="button" 
                            onClick={() => setMode(null)} 
                            className="text-gray-500 hover:text-gray-900 text-sm font-bold flex items-center gap-1 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-all"
                        >
                            <ArrowLeft size={16}/> Back to Options
                        </button>
                    </div>
                    {error && (
                        <div className="p-4 bg-red-50 text-red-700 border border-red-100 rounded-xl text-xs font-bold flex gap-2 items-start animate-in shake">
                            <AlertTriangle size={16} className="shrink-0" />
                            {error}
                        </div>
                    )}
                    <div className="space-y-3">
                        <input className="w-full border-gray-200 border rounded-xl p-4 text-sm font-mono focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all" placeholder="MySQL Host (e.g. localhost)" value={mysqlConfig.host} onChange={e => setMysqlConfig({...mysqlConfig, host: e.target.value})} />
                        <input className="w-full border-gray-200 border rounded-xl p-4 text-sm font-mono focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all" placeholder="Database Name" value={mysqlConfig.database} onChange={e => setMysqlConfig({...mysqlConfig, database: e.target.value})} />
                        <input className="w-full border-gray-200 border rounded-xl p-4 text-sm font-mono focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all" placeholder="SaaS DB Username" value={mysqlConfig.user} onChange={e => setMysqlConfig({...mysqlConfig, user: e.target.value})} />
                        <input type="password" className="w-full border-gray-200 border rounded-xl p-4 text-sm font-mono focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all" placeholder="SaaS DB Password" value={mysqlConfig.password} onChange={e => setMysqlConfig({...mysqlConfig, password: e.target.value})} />
                        <div className="relative">
                            <input className="w-full border-gray-200 border rounded-xl p-4 text-sm font-mono bg-gray-50 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all pr-12" placeholder="Full API Bridge URL (https://...)" value={mysqlConfig.apiUrl} onChange={e => setMysqlConfig({...mysqlConfig, apiUrl: e.target.value})} />
                            <HelpCircle className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                        </div>
                    </div>
                    <div className="pt-2 text-center space-y-2">
                        {loading && <div className="text-xs font-bold text-blue-600 animate-pulse">{loadingMsg}</div>}
                        <button 
                            type="submit" 
                            disabled={loading} 
                            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                        >
                            {loading ? <RefreshCcw size={20} className="animate-spin mx-auto" /> : 'Connect & Initialize SaaS'}
                        </button>
                    </div>
                </form>
           )}
        </div>
      </div>
    </div>
  );
};
