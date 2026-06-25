
import React, { useState } from 'react';
import { User, Role } from '../types';
import { ShieldCheck, Lock, Terminal, ShieldAlert, RefreshCw } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { adminLogin } from '../services/dataService';

interface AdminLoginProps {
    onLogin: (user: User) => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin }) => {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Call the PHP Bridge to verify the password securely
            const response = await adminLogin(password);
            if (response && response.user) {
                // Login successful
                onLogin(response.user);
            } else {
                throw new Error("Invalid response from authorization server.");
            }
        } catch (err: any) {
             setError(err.message || 'Access Denied. Invalid credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center mb-8">
                    <div className="h-20 w-20 bg-indigo-600 rounded-[30px] flex items-center justify-center shadow-2xl shadow-indigo-500/20 transform -rotate-12 border border-white/20">
                        <Terminal className="text-white" size={40} />
                    </div>
                </div>
                <h2 className="text-center text-4xl font-black text-white tracking-tighter">SaaS Control Center</h2>
                <p className="mt-2 text-center text-slate-500 font-medium">Enterprise Management Gateway</p>
            </div>

            <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-slate-900/50 backdrop-blur-xl py-10 px-8 border border-white/5 rounded-[40px] shadow-3xl">
                    <form onSubmit={handleLogin} className="space-y-6">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-sm font-bold flex items-center gap-3 animate-in shake">
                                <ShieldAlert size={20} /> {error}
                            </div>
                        )}
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Master Access Secret</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={20} />
                                <input 
                                    type="password"
                                    required
                                    className="w-full pl-12 pr-4 py-4 bg-slate-950 border border-white/5 rounded-2xl text-white font-mono focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                                    placeholder="••••••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center items-center gap-2 py-4 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/10 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {loading ? <RefreshCw className="animate-spin" size={22} /> : 'Authenticate System'}
                        </button>
                    </form>

                    <div className="mt-10 pt-10 border-t border-white/5 text-center">
                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em]">
                            BizByTech Orchestrator v13.0.1 <br/>
                            Secured for {APP_CONFIG.contact.email}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
