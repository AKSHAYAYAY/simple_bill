import React from 'react';
import { FileText, ShoppingCart, CreditCard, RotateCcw, ArrowDownRight, ArrowUpRight, AlertCircle } from 'lucide-react';

export interface LedgerEntryData {
  id: number;
  date: string;
  type: 'invoice' | 'purchase' | 'payment' | 'payment_in' | 'payment_out' | 'sales_return' | 'purchase_return' | 'return' | 'refund';
  description: string;
  amount: number;
  payment_status?: string;
  amount_received?: number;
  grand_total?: number;
}

interface LedgerEntryProps {
  entry: LedgerEntryData;
  colorType: 'in' | 'out'; // 'in' = Emerald/Green, 'out' = Rose/Red
}

export const LedgerEntry: React.FC<LedgerEntryProps> = ({ entry, colorType }) => {
  const isInvoice = entry.type === 'invoice';
  const isPurchase = entry.type === 'purchase';
  const isPayment = entry.type === 'payment_in' || entry.type === 'payment_out' || entry.type === 'payment';
  const isReturn = entry.type === 'sales_return' || entry.type === 'purchase_return' || entry.type === 'return';
  const isRefund = entry.type === 'refund';

  const getIcon = () => {
    if (isInvoice)  return <FileText size={16} className="text-blue-500" />;
    if (isPurchase) return <ShoppingCart size={16} className="text-orange-500" />;
    if (isPayment)  return <CreditCard size={16} className="text-violet-500" />;
    if (isReturn)   return <RotateCcw size={16} className="text-rose-500" />;
    if (isRefund)   return <AlertCircle size={16} className="text-amber-500" />;
    return <CreditCard size={16} className="text-gray-400" />;
  };

  const getTypeBadge = () => {
    if (isInvoice)                        return { label: 'Invoice',         css: 'bg-blue-50 text-blue-700' };
    if (isPurchase)                       return { label: 'Purchase',        css: 'bg-orange-50 text-orange-700' };
    if (entry.type === 'payment_in')      return { label: 'Payment In',      css: 'bg-violet-50 text-violet-700' };
    if (entry.type === 'payment_out')     return { label: 'Payment Out',     css: 'bg-rose-50 text-rose-700' };
    if (entry.type === 'payment')         return { label: 'Payment',         css: 'bg-violet-50 text-violet-700' };
    if (entry.type === 'sales_return')    return { label: 'Sales Return',    css: 'bg-rose-50 text-rose-700' };
    if (entry.type === 'purchase_return') return { label: 'Purchase Return', css: 'bg-amber-50 text-amber-700' };
    if (isReturn)                         return { label: 'Return',          css: 'bg-rose-50 text-rose-700' };
    if (isRefund)                         return { label: 'Refund',          css: 'bg-amber-50 text-amber-700' };
    return { label: entry.type, css: 'bg-gray-50 text-gray-700' };
  };

  const badge = getTypeBadge();

  const formattedDate = new Date(entry.date).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  // Invoices show their payment status, not "Received"
  const getStatusLabel = () => {
    if (isInvoice) {
      if (entry.payment_status === 'Paid')    return { text: 'Fully Paid',  color: 'text-emerald-500' };
      if (entry.payment_status === 'Partial') return { text: 'Partial',     color: 'text-amber-500'   };
      return                                         { text: 'Billed',      color: 'text-blue-500'    };
    }
    if (isPurchase) {
      if (entry.payment_status === 'Paid')    return { text: 'Fully Paid',  color: 'text-emerald-500' };
      if (entry.payment_status === 'Partial') return { text: 'Partial',     color: 'text-amber-500'   };
      return                                         { text: 'Unpaid',      color: 'text-rose-500'    };
    }
    if (isRefund) return { text: 'Refunded',    color: 'text-amber-500'   };
    if (isReturn) return { text: 'Credit Note', color: 'text-rose-500'    };
    return colorType === 'in'
      ? { text: 'Received', color: 'text-emerald-500' }
      : { text: 'Paid Out', color: 'text-rose-500'    };
  };

  const status = getStatusLabel();

  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-100 hover:shadow-md transition-all duration-200 flex justify-between items-start group">
      <div className="space-y-2">
        {/* Row 1: Date & Type badge */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest font-mono">
            {formattedDate}
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${badge.css}`}>
            {getIcon()}
            {badge.label}
          </span>
        </div>

        {/* Row 2: Description */}
        <p className="text-sm font-bold text-gray-800 leading-tight group-hover:text-blue-600 transition-colors">
          {entry.description}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right space-y-1 pl-4">
        <div className={`flex items-center justify-end gap-1.5 font-mono text-base font-black ${
          isInvoice  ? 'text-blue-600'   :
          isPurchase ? 'text-orange-600' :
          colorType === 'in' ? 'text-emerald-600' : 'text-rose-600'
        }`}>
          {/* No +/- prefix for raw invoice/purchase amounts — they are obligations, not flows */}
          {!isInvoice && !isPurchase && (colorType === 'in' ? '+' : '-')}
          ₹{Number(entry.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
        <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider ${status.color}`}>
          {status.text}
          {!isInvoice && !isPurchase && (
            colorType === 'in'
              ? <ArrowDownRight size={10} className="text-emerald-500" />
              : <ArrowUpRight size={10} className="text-rose-500" />
          )}
        </span>
      </div>
    </div>
  );
};
