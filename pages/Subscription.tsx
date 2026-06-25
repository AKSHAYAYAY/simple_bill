
import React, { useState } from 'react';
import { Key, ShieldCheck, Lock, CheckCircle2, ArrowLeft } from 'lucide-react';
import { verifyLicenseKey } from '../services/licenseService';
import { AppSettings } from '../types';
import { saveSettings } from '../services/dataService';

interface SubscriptionProps {
  settings: AppSettings;
  onActivation: (updatedSettings: AppSettings) => void;
  onNavigate?: (page: string) => void;
}

export const Subscription: React.FC<SubscriptionProps> = ({ settings, onActivation, onNavigate }) => {
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;

    setLoading(true);
    setError('');

    try {
      const license = await verifyLicenseKey(keyInput);
      
      if (license.status === 'ACTIVE') {
        const newSettings = { ...settings, license };
        saveSettings(newSettings);
        onActivation(newSettings);
      } else {
        setError('Invalid License Key. Please check your email or contact support.');
      }
    } catch (err) {
      setError('Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col justify-center py-12 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)]">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
            <div className="h-16 w-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-6">
                <Lock className="text-white" size={32} />
            </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Activate SimpleBill</h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Enter your license key to unlock your workspace.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-lg sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleActivate}>
            <div>
              <label htmlFor="license" className="block text-sm font-medium text-gray-700">
                License Key
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Key className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  id="license"
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md p-3 border"
                  placeholder="SB-PRO-XXXX-XXXX"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
                <div className="rounded-md bg-red-50 p-4">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <ShieldCheck className="h-5 w-5 text-red-400" />
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-red-800">{error}</h3>
                        </div>
                    </div>
                </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading || !keyInput}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying...' : 'Activate License'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Don't have a key?</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3">
               <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                  <h4 className="font-bold text-blue-900 flex items-center gap-2">
                     <CheckCircle2 size={16} /> Pro Plan
                  </h4>
                  <p className="text-sm text-blue-700 mt-1 mb-3">
                      Unlock unlimited invoices, PDF exports, and Google Sheets Sync.
                  </p>
                  {onNavigate && (
                      <button 
                        onClick={() => onNavigate('pricing')} 
                        className="w-full bg-white text-blue-600 font-semibold py-2 rounded border border-blue-200 hover:bg-blue-50"
                      >
                          View Pricing Plans
                      </button>
                  )}
               </div>
            </div>

            {onNavigate && (
                <div className="mt-6 text-center">
                    <button 
                        onClick={() => onNavigate('home')} 
                        className="text-gray-400 hover:text-gray-600 text-sm font-medium flex items-center justify-center gap-1 mx-auto"
                    >
                        <ArrowLeft size={14} /> Back to Home
                    </button>
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
