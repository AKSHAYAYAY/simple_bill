import React from 'react';
import { Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { LedgerEntry, LedgerEntryData } from './LedgerEntry';

interface LedgerColumnProps {
  title: string;
  type: 'in' | 'out';
  entries: LedgerEntryData[];
  onAddClick: () => void;
}

export const LedgerColumn: React.FC<LedgerColumnProps> = ({
  title,
  type,
  entries,
  onAddClick
}) => {
  const totalBilled = entries
    .filter(e => e.type === 'invoice' || e.type === 'purchase')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    
  const totalPayments = entries
    .filter(e => e.type !== 'invoice' && e.type !== 'purchase')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <div className="bg-gray-50/50 rounded-3xl p-6 border border-gray-100 flex flex-col h-[650px] relative">
      
      {/* Column Header */}
      <div className="flex justify-between items-start pb-4 border-b border-gray-100 mb-4 shrink-0">
        <div>
          <h4 className="text-base font-black text-gray-900 tracking-tight flex items-center gap-2">
            {type === 'in' ? (
              <span className="p-1 bg-emerald-100 text-emerald-700 rounded-lg"><TrendingDown size={16} /></span>
            ) : (
              <span className="p-1 bg-rose-100 text-rose-700 rounded-lg"><TrendingUp size={16} /></span>
            )}
            {title}
          </h4>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
        <div className="text-right flex gap-4">
          <div>
            <div className={`font-mono text-base font-black text-slate-800`}>
              ₹{totalBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Total Billed</div>
          </div>
          <div>
            <div className={`font-mono text-base font-black ${
              type === 'in' ? 'text-emerald-600' : 'text-rose-600'
            }`}>
              ₹{totalPayments.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Total {type === 'in' ? 'Collected' : 'Paid'}</div>
          </div>
        </div>
      </div>


      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1.5 scrollbar-thin">
        {entries.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2">
            <div className={`p-4 rounded-full ${
              type === 'in' ? 'bg-emerald-50 text-emerald-300' : 'bg-rose-50 text-rose-300'
            }`}>
              {type === 'in' ? <TrendingDown size={28} /> : <TrendingUp size={28} />}
            </div>
            <p className="text-sm font-bold text-gray-400 italic">No transactions recorded yet.</p>
            <p className="text-xs text-gray-400 max-w-[200px]">Click the action button below to insert a raw entry manually.</p>
          </div>
        ) : (
          entries.map((entry, index) => (
            <LedgerEntry
              key={index}
              entry={entry}
              colorType={type}
            />
          ))
        )}
      </div>

      {/* Action Trigger Button */}
      <div className="pt-4 shrink-0">
        <button
          onClick={onAddClick}
          className={`w-full py-3.5 rounded-2xl text-xs font-black text-white active:scale-98 transition-all flex items-center justify-center gap-2 shadow-lg ${
            type === 'in'
              ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10'
              : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/10'
          }`}
        >
          <Plus size={16} />
          {type === 'in' ? 'Record Pay In (Collection)' : 'Record Pay Out (Payout)'}
        </button>
      </div>

    </div>
  );
};
