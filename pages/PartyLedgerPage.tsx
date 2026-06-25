import React, { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, Mail, Phone, MapPin, Sparkles, AlertCircle } from 'lucide-react';
import { fetchPartyLedger } from '../services/dataService';
import { LedgerColumn } from '../components/LedgerColumn';
import { PaymentModal } from '../components/PaymentModal';

import { useParams, useSearchParams, useNavigate } from 'react-router-dom';

interface PartyLedgerPageProps {
  partyId?: string;
  partyType?: 'Customer' | 'Supplier';
  onBack?: () => void;
}

export const PartyLedgerPage: React.FC<PartyLedgerPageProps> = ({
  partyId: propsPartyId,
  partyType: propsPartyType,
  onBack: propsOnBack
}) => {
  const { partyId: urlPartyId } = useParams<{ partyId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const partyId = propsPartyId || urlPartyId || '';
  const partyType = propsPartyType || (searchParams.get('type') as 'Customer' | 'Supplier') || 'Customer';
  const onBack = propsOnBack || (() => navigate('/payments'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);
  
  // Modal tracking
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'in' | 'out'>('in');

  const loadLedger = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchPartyLedger(partyId, partyType);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve combined party ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, [partyId, partyType]);

  if (loading && !data) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-sm font-bold text-gray-400">Assembling ledger entries...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-red-100 shadow-sm max-w-xl mx-auto space-y-4 text-center mt-12">
        <div className="p-4 bg-red-50 text-red-500 rounded-full w-fit mx-auto">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-lg font-black text-gray-900">Ledger Retrieval Failed</h3>
        <p className="text-gray-500 text-sm">{error}</p>
        <div className="flex gap-3 justify-center pt-2">
          <button
            onClick={onBack}
            className="px-5 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs font-black text-gray-600 active:scale-95 transition-all border"
          >
            Go Back
          </button>
          <button
            onClick={loadLedger}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-black text-white active:scale-95 transition-all shadow-md"
          >
            Retry Fetch
          </button>
        </div>
      </div>
    );
  }

  const { party, invoices = [], purchases = [], payIn = [], payOut = [], returns = [],
          totalInvoiced = 0, totalPurchased = 0, totalPayIn = 0, totalPayOut = 0,
          balance = 0, combinedPayIn = [], combinedPayOut = [] } = data || {};

  const handleOpenModal = (type: 'in' | 'out') => {
    setModalType(type);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-300">
      
      {/* 1. STICKY HEADER CARD */}
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm sticky top-0 z-30 backdrop-blur-md bg-white/95">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-3 bg-gray-50 hover:bg-gray-100 rounded-2xl border border-gray-200/50 text-gray-500 hover:text-gray-800 transition-all active:scale-95 shadow-sm"
              title="Return to Payments"
            >
              <ArrowLeft size={18} />
            </button>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h2 className="text-2xl font-black tracking-tight text-gray-900">{party?.name}</h2>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                  party?.type === 'Both' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200/20' :
                  party?.type === 'Customer' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200/20' :
                  'bg-amber-100 text-amber-700 border border-amber-200/20'
                }`}>
                  <Sparkles size={8} /> {party?.type}
                </span>
              </div>
              
              {/* Party Sub-details list */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-gray-400">
                {party?.phone && (
                  <span className="flex items-center gap-1">
                    <Phone size={12} className="text-gray-300" />
                    <span className="text-gray-500 font-mono">{party.phone}</span>
                  </span>
                )}
                {party?.email && (
                  <span className="flex items-center gap-1">
                    <Mail size={12} className="text-gray-300" />
                    <span className="text-gray-500">{party.email}</span>
                  </span>
                )}
                {party?.address && (
                  <span className="flex items-center gap-1">
                    <MapPin size={12} className="text-gray-300" />
                    <span className="text-gray-500 max-w-[250px] truncate">{party.address}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Quick Refresh Button */}
            <button
              onClick={loadLedger}
              className="p-3 bg-gray-50 hover:bg-gray-100 rounded-2xl border border-gray-200/50 text-gray-400 hover:text-gray-700 transition-all active:scale-95 shadow-sm"
              title="Refresh ledger log"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>

            {/* Dynamic Balance Display */}
            <div className={`p-4 md:px-6 rounded-2xl border flex flex-col justify-center min-w-[200px] ${
              balance > 0 
                ? (partyType === 'Supplier' 
                    ? 'bg-rose-50/50 border-rose-100 text-rose-800' 
                    : 'bg-emerald-50/50 border-emerald-100 text-emerald-800')
                : 'bg-gray-50 border-gray-200/50 text-gray-800'
            }`}>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">
                Current Ledger Balance
              </span>
              <div className="font-mono text-xl font-black">
                ₹{Math.abs(balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] font-bold mt-0.5 uppercase tracking-wide opacity-80">
                {balance > 0 
                  ? (partyType === 'Supplier' ? 'You owe ₹' : 'You will receive ₹') + Math.abs(balance).toLocaleString('en-IN')
                  : 'Settled / Balanced'}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* 2. SPLIT LEDGER SECTION GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Side: PAY OUT (Purchases / Disbursals to Supplier) */}
        <LedgerColumn
          title={partyType === 'Customer' ? 'Pay Out (Refunds / Credits)' : 'Pay Out (Purchases / Payments to Supplier)'}
          type="out"
          entries={combinedPayOut}
          onAddClick={() => handleOpenModal('out')}
        />

        {/* Right Side: PAY IN (Invoices Billed + Cash Received from Customer) */}
        <LedgerColumn
          title={partyType === 'Customer' ? 'Pay In (Invoices Billed + Collections)' : 'Pay In (Purchase Returns / Refunds Received)'}
          type="in"
          entries={combinedPayIn}
          onAddClick={() => handleOpenModal('in')}
        />

      </div>

      {/* 3. MODAL ELEMENT TRIGGER */}
      <PaymentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        type={modalType}
        partyType={partyType}
        partyId={party?.id}
        partyName={party?.name}
        customerId={party?.customerId}
        supplierId={party?.supplierId}
        onSuccess={loadLedger}
      />

    </div>
  );
};
