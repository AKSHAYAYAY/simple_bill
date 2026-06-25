import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeftRight, CheckCircle2, Circle, Loader2, TrendingDown, TrendingUp, X } from 'lucide-react';
import {
  fetchPaymentContext,
  PaymentDirection,
  PaymentPartyType,
  saveLinkedPartyPayment,
  applyReturnAsAdjustment
} from '../services/dataService';
import { formatINR } from '../utils/currency';
import { ErrorPopup } from './ErrorPopup';

type LegacyType = 'in' | 'out';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  type?: LegacyType;
  direction?: PaymentDirection;
  partyType?: PaymentPartyType | 'Customer' | 'Supplier';
  partyId: string | number;
  partyName: string;
  customerId?: number | null;
  supplierId?: number | null;
  onSuccess: (result?: any) => void;
}

type SelectableEntry = {
  id: number;
  invoiceNo: string;
  date: string;
  grandTotal: number;
  paidAmount?: number;
  remaining: number;
  status: string;
  isOverdue?: boolean;
  payloadKey: 'sale_id' | 'purchase_id' | 'return_id';
  isPendingReturn?: boolean;
  returnType?: 'sales' | 'purchase';
  refundAmount?: number;
};

const today = () => new Date().toISOString().slice(0, 10);
const toNumber = (value: any) => Number(value || 0);

const normalisePartyType = (partyType?: PaymentModalProps['partyType']): PaymentPartyType | null => {
  if (!partyType) return null;
  return String(partyType).toLowerCase() === 'supplier' ? 'supplier' : 'customer';
};

// Determine which directions are available for a given party type
const getAvailableDirections = (pt: PaymentPartyType): PaymentDirection[] => {
  if (pt === 'customer') return ['pay_in', 'pay_out']; // pay_in = collect; pay_out = refund return
  return ['pay_out', 'pay_in']; // pay_out = pay supplier; pay_in = collect purchase return refund
};

const directionLabel = (direction: PaymentDirection, partyType: PaymentPartyType): string => {
  if (partyType === 'customer') {
    return direction === 'pay_in' ? 'Collect Payment (Pay In)' : 'Issue Refund (Pay Out)';
  }
  return direction === 'pay_out' ? 'Pay Supplier (Pay Out)' : 'Receive Refund (Pay In)';
};

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  type,
  direction,
  partyType,
  partyId,
  partyName,
  customerId,
  supplierId,
  onSuccess
}) => {
  const resolvedPartyType = normalisePartyType(partyType)
    || (supplierId ? 'supplier' : 'customer');
  const resolvedPartyId = resolvedPartyType === 'supplier'
    ? Number(supplierId || partyId)
    : Number(customerId || partyId);

  const initialDirection: PaymentDirection = direction || (type === 'out' ? 'pay_out' : 'pay_in');
  const [activeDirection, setActiveDirection] = useState<PaymentDirection>(initialDirection);
  const availableDirections = getAvailableDirections(resolvedPartyType);

  const [context, setContext] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [applyingAdjustment, setApplyingAdjustment] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<SelectableEntry | null>(null);
  const [isStandalone, setStandalone] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Bank'>('Cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [error, setError] = useState('');
  // Adjustment flow state
  const [adjustmentReturnEntry, setAdjustmentReturnEntry] = useState<SelectableEntry | null>(null);
  const [adjustmentTargetEntries, setAdjustmentTargetEntries] = useState<{ id: number; label: string; remaining: number; invoiceNo: string; date: string }[]>([]);
  const [allocations, setAllocations] = useState<Record<number, number>>({});
  const [showAdjustmentPanel, setShowAdjustmentPanel] = useState(false);

  // Reload context when direction changes
  useEffect(() => {
    if (!isOpen || !resolvedPartyId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setContext(null);
    setSelectedEntry(null);
    setStandalone(false);
    setAmount('');
    setShowAdjustmentPanel(false);
    setAdjustmentReturnEntry(null);
    setAllocations({});
    fetchPaymentContext(resolvedPartyType, resolvedPartyId)
      .then(data => { if (!cancelled) setContext(data); })
      .catch(err => { if (!cancelled) setError(err.message || 'Failed to load payment details.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, resolvedPartyId, resolvedPartyType, activeDirection]);

  // Build selectable entries for the ACTIVE direction
  const entries = useMemo<SelectableEntry[]>(() => {
    if (!context) return [];
    const dir = activeDirection;

    // Customer Pay In: outstanding invoices
    if (resolvedPartyType === 'customer' && dir === 'pay_in') {
      return (context.outstanding_invoices || []).map((item: any) => ({
        id: Number(item.sale_id),
        invoiceNo: item.invoice_no,
        date: item.invoice_date,
        grandTotal: toNumber(item.grand_total),
        paidAmount: toNumber(item.amount_received),
        remaining: toNumber(item.remaining),
        status: item.payment_status,
        isOverdue: !!item.is_overdue,
        payloadKey: 'sale_id' as const
      }));
    }

    // Customer Pay Out: pending sales return refunds
    if (resolvedPartyType === 'customer' && dir === 'pay_out') {
      return (context.pending_return_refunds || []).map((item: any) => ({
        id: Number(item.return_id),
        invoiceNo: item.return_invoice_no,
        date: item.return_date,
        grandTotal: toNumber(item.grand_total),
        paidAmount: toNumber(item.refund_amount || 0),
        remaining: toNumber(item.grand_total) - toNumber(item.refund_amount || 0),
        status: 'Pending Refund',
        payloadKey: 'return_id' as const,
        isPendingReturn: true,
        returnType: 'sales' as const,
        refundAmount: toNumber(item.refund_amount || 0)
      }));
    }

    // Supplier Pay Out: outstanding purchases
    if (resolvedPartyType === 'supplier' && dir === 'pay_out') {
      return (context.outstanding_purchases || []).map((item: any) => ({
        id: Number(item.purchase_id),
        invoiceNo: item.purchase_invoice_no,
        date: item.purchase_date,
        grandTotal: toNumber(item.grand_total),
        paidAmount: toNumber(item.amount_paid),
        remaining: toNumber(item.remaining),
        status: item.payment_status,
        isOverdue: !!item.is_overdue,
        payloadKey: 'purchase_id' as const
      }));
    }

    // Supplier Pay In: pending purchase return refunds (supplier owes us)
    if (resolvedPartyType === 'supplier' && dir === 'pay_in') {
      return (context.pending_return_refunds || []).map((item: any) => ({
        id: Number(item.return_id),
        invoiceNo: item.return_invoice_no,
        date: item.return_date,
        grandTotal: toNumber(item.grand_total),
        paidAmount: toNumber(item.refund_amount || 0),
        remaining: toNumber(item.grand_total) - toNumber(item.refund_amount || 0),
        status: 'Pending Refund',
        payloadKey: 'return_id' as const,
        isPendingReturn: true,
        returnType: 'purchase' as const,
        refundAmount: toNumber(item.refund_amount || 0)
      }));
    }

    return [];
  }, [context, activeDirection, resolvedPartyType]);

  // Build adjustment target options (invoices to apply return credit against)
  const buildAdjustmentTargets = () => {
    if (!context) return [];
    if (resolvedPartyType === 'customer') {
      return (context.outstanding_invoices || []).map((item: any) => ({
        id: Number(item.sale_id),
        label: `${item.invoice_no} — ${formatINR(toNumber(item.remaining))} remaining`,
        remaining: toNumber(item.remaining),
        invoiceNo: item.invoice_no,
        date: item.invoice_date
      }));
    }
    // supplier: apply against outstanding purchases
    return (context.outstanding_purchases || []).map((item: any) => ({
      id: Number(item.purchase_id),
      label: `${item.purchase_invoice_no} — ${formatINR(toNumber(item.remaining))} remaining`,
      remaining: toNumber(item.remaining),
      invoiceNo: item.purchase_invoice_no,
      date: item.purchase_date
    }));
  };

  const title = useMemo(() => {
    if (resolvedPartyType === 'supplier' && activeDirection === 'pay_out') return `Pay Out to ${partyName}`;
    if (resolvedPartyType === 'supplier' && activeDirection === 'pay_in') return `Receive Refund from ${partyName}`;
    if (resolvedPartyType === 'customer' && activeDirection === 'pay_out') return `Issue Refund to ${partyName}`;
    return `Collect Payment from ${partyName}`;
  }, [partyName, activeDirection, resolvedPartyType]);

  if (!isOpen) return null;

  const selectEntry = (entry: SelectableEntry) => {
    setSelectedEntry(entry);
    setStandalone(false);
    setAmount('');
    setError('');
    setShowAdjustmentPanel(false);
  };

  const selectStandalone = () => {
    setSelectedEntry(null);
    setStandalone(true);
    setAmount('');
    setError('');
    setShowAdjustmentPanel(false);
  };

  const openAdjustmentPanel = (entry: SelectableEntry) => {
    setAdjustmentReturnEntry(entry);
    setAdjustmentTargetEntries(buildAdjustmentTargets());
    setAllocations({});
    setShowAdjustmentPanel(true);
    setError('');
  };

  const submitAdjustment = async () => {
    if (!adjustmentReturnEntry) return;

    const activeAllocations = Object.entries(allocations)
      .filter(([_, amount]) => amount > 0)
      .map(([id, amount]) => ({ id: Number(id), amount }));

    if (activeAllocations.length === 0) {
      setError('Please select at least one invoice and specify a positive amount.');
      return;
    }

    const totalAllocated = activeAllocations.reduce((sum, item) => sum + item.amount, 0);
    if (totalAllocated > adjustmentReturnEntry.remaining + 0.01) {
      setError(`Allocated total ₹${totalAllocated.toFixed(2)} exceeds available return credit ₹${adjustmentReturnEntry.remaining.toFixed(2)}`);
      return;
    }

    setApplyingAdjustment(true);
    window.dispatchEvent(new CustomEvent('simplebill:show-loader', { detail: { message: 'Applying Adjustment...' } }));
    try {
      const result = await applyReturnAsAdjustment(
        adjustmentReturnEntry.returnType || 'sales',
        adjustmentReturnEntry.id,
        activeAllocations
      );
      onSuccess(result);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to apply adjustment.');
    } finally {
      setApplyingAdjustment(false);
      window.dispatchEvent(new CustomEvent('simplebill:hide-loader'));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parsedAmount = Number(amount);
    if (!selectedEntry && !isStandalone) {
      setError('Select an invoice, return, or choose manual payment entry first.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }
    let finalAmount = parsedAmount;
    if (selectedEntry && parsedAmount > selectedEntry.remaining) {
      finalAmount = selectedEntry.remaining;
      setAmount(String(selectedEntry.remaining));
    }
    if (isStandalone && !notes.trim()) {
      setError('A remark is required for a manual payment entry.');
      return;
    }

    const payload: any = {
      amount: finalAmount,
      payment_mode: paymentMode,
      payment_date: paymentDate,
      reference_no: referenceNo.trim() || undefined,
      notes: notes.trim() || undefined,
      is_standalone: isStandalone
    };
    if (selectedEntry) payload[selectedEntry.payloadKey] = selectedEntry.id;

    setSubmitting(true);
    window.dispatchEvent(new CustomEvent('simplebill:show-loader', { detail: { message: 'Recording Payment...' } }));
    try {
      const result = await saveLinkedPartyPayment(resolvedPartyType, resolvedPartyId, activeDirection, payload);
      onSuccess(result);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
      window.dispatchEvent(new CustomEvent('simplebill:hide-loader'));
    }
  };

  const submitLabel = activeDirection === 'pay_out' ? 'Record Payment Out' : 'Record Payment In';
  const canEnterAmount = !!selectedEntry || isStandalone;
  const accentColor = activeDirection === 'pay_in' ? 'emerald' : 'rose';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-3xl shadow-2xl border border-gray-100 flex flex-col">

        {/* Accent bar */}
        <div className={`h-1.5 w-full flex-shrink-0 ${activeDirection === 'pay_in' ? 'bg-emerald-500' : 'bg-rose-500'}`} />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-xl font-black text-gray-900 tracking-tight">{title}</h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Link payment to an invoice/return, or record a manual entry.
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex-shrink-0">
              <X size={20} />
            </button>
          </div>

          {/* Direction Tabs — only show if party supports both directions */}
          {availableDirections.length > 1 && (
            <div className="flex bg-gray-100 p-1 rounded-2xl shadow-inner">
              {availableDirections.map(dir => {
                const isActive = dir === activeDirection;
                const isIn = dir === 'pay_in';
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => {
                      setActiveDirection(dir);
                      setSelectedEntry(null);
                      setStandalone(false);
                      setAmount('');
                      setError('');
                      setShowAdjustmentPanel(false);
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all ${
                      isActive
                        ? `bg-white shadow-md ${isIn ? 'text-emerald-700' : 'text-rose-700'}`
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {isIn ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {directionLabel(dir, resolvedPartyType)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6">
          <ErrorPopup errors={error ? [error] : []} onClose={() => setError('')} title="Payment Error:" />

          {/* Adjustment panel overlay */}
          {showAdjustmentPanel && adjustmentReturnEntry && (() => {
            const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + val, 0);
            const remainingReturnCredit = Math.max(adjustmentReturnEntry.remaining - totalAllocated, 0);
            const isOverAllocated = totalAllocated > adjustmentReturnEntry.remaining + 0.01;

            const handleCheckboxToggle = (targetId: number, targetRemaining: number) => {
              setAllocations(prev => {
                const next = { ...prev };
                if (next[targetId] !== undefined) {
                  delete next[targetId];
                } else {
                  const currentAllocTotal = Object.entries(next).reduce((sum, [id, val]) => sum + (Number(id) === targetId ? 0 : val), 0);
                  const creditRemaining = Math.max(adjustmentReturnEntry.remaining - currentAllocTotal, 0);
                  next[targetId] = Math.min(targetRemaining, creditRemaining);
                }
                return next;
              });
            };

            const handleAmountChange = (targetId: number, valStr: string, targetRemaining: number) => {
              const valNum = Number(valStr);
              if (isNaN(valNum) || valNum < 0) return;
              setAllocations(prev => ({
                ...prev,
                [targetId]: valNum
              }));
            };

            return (
              <div className="mb-5 p-5 bg-amber-50 border border-amber-200 rounded-2xl space-y-4 animate-in slide-in-from-top-2">
                <div className="flex items-center gap-2 text-amber-800">
                  <ArrowLeftRight size={16} />
                  <p className="text-sm font-black">Apply Return Credit as Adjustment</p>
                </div>
                <p className="text-xs text-amber-700 font-medium">
                  Allocate credit from return <b>{adjustmentReturnEntry.invoiceNo}</b> (Remaining credit: {formatINR(adjustmentReturnEntry.remaining)}) across one or more open invoices.
                </p>

                {adjustmentTargetEntries.length === 0 ? (
                  <p className="text-xs font-bold text-amber-700 italic">No open invoices found for this party.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {adjustmentTargetEntries.map(t => {
                      const isChecked = allocations[t.id] !== undefined;
                      const currentVal = allocations[t.id] ?? 0;
                      return (
                        <div key={t.id} className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${isChecked ? 'bg-amber-100/30 border-amber-300' : 'bg-white border-gray-100'}`}>
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => handleCheckboxToggle(t.id, t.remaining)}
                              className="mt-0.5 flex-shrink-0"
                            >
                              {isChecked ? <CheckCircle2 size={16} className="text-amber-700" /> : <Circle size={16} className="text-gray-300" />}
                            </button>
                            <div className="min-w-0">
                              <p className="text-xs font-black text-gray-900 truncate">{t.invoiceNo}</p>
                              <p className="text-[10px] text-gray-400 font-bold">{t.date}</p>
                              <p className="text-[10px] text-amber-700 font-bold mt-0.5">Remaining: {formatINR(t.remaining)}</p>
                            </div>
                          </div>
                          {isChecked && (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-xs text-gray-500 font-bold">₹</span>
                              <input
                                type="number"
                                className="w-24 border border-amber-300 rounded-lg px-2 py-1 text-xs font-black bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                                value={currentVal || ''}
                                placeholder="0.00"
                                max={t.remaining}
                                min={0}
                                step="any"
                                onChange={e => handleAmountChange(t.id, e.target.value, t.remaining)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {adjustmentTargetEntries.length > 0 && (
                  <div className="p-3 bg-amber-100/50 rounded-xl space-y-1.5 text-xs text-amber-800 font-semibold border border-amber-200/50">
                    <div className="flex justify-between">
                      <span>Available Return Credit:</span>
                      <span className="font-bold">{formatINR(adjustmentReturnEntry.remaining)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Credit Allocated:</span>
                      <span className={`font-black ${isOverAllocated ? 'text-red-600' : 'text-amber-900'}`}>
                        {formatINR(totalAllocated)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-amber-200/60 pt-1.5">
                      <span>Remaining Unallocated Credit:</span>
                      <span className={`font-black ${isOverAllocated ? 'text-red-600' : 'text-emerald-800'}`}>
                        {formatINR(remainingReturnCredit)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowAdjustmentPanel(false); setError(''); }}
                    className="flex-1 py-2.5 bg-white border border-amber-200 rounded-xl text-xs font-black text-amber-700 hover:bg-amber-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitAdjustment}
                    disabled={applyingAdjustment || totalAllocated <= 0 || isOverAllocated}
                    className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {applyingAdjustment && <Loader2 size={14} className="animate-spin" />}
                    Apply Adjustment
                  </button>
                </div>
              </div>
            );
          })()}

          {loading ? (
            <div data-testid="payment-modal-skeleton" className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="border border-gray-100 rounded-2xl p-4 animate-pulse">
                  <div className="h-4 bg-gray-100 rounded w-2/5 mb-3" />
                  <div className="h-3 bg-gray-100 rounded w-4/5 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 mb-5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                  {activeDirection === 'pay_in' ? 'Open Invoices / Returns' : 'Pending Items to Pay / Refund'}
                </h4>
                <span className="text-xs font-bold text-gray-500">{entries.length} items</span>
              </div>

              {entries.map(entry => {
                const active = selectedEntry?.id === entry.id && selectedEntry?.payloadKey === entry.payloadKey;
                return (
                  <div
                    key={`${entry.payloadKey}-${entry.id}`}
                    className={`w-full text-left p-4 rounded-2xl border transition-all ${
                      active ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-gray-50 hover:bg-white hover:border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => selectEntry(entry)}
                        className="flex gap-3 flex-1 text-left"
                      >
                        {active ? <CheckCircle2 size={18} className="text-blue-600 mt-0.5 flex-shrink-0" /> : <Circle size={18} className="text-gray-300 mt-0.5 flex-shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-black text-gray-900 truncate">{entry.invoiceNo}</p>
                          <p className="text-xs text-gray-500 font-bold mt-0.5">{entry.date}</p>
                        </div>
                      </button>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                          entry.isOverdue ? 'bg-red-100 text-red-700' : 'bg-white text-gray-500 border border-gray-100'
                        }`}>
                          {entry.isOverdue ? 'Overdue' : entry.status}
                        </span>
                        {/* For pending returns: show "Adjust" button */}
                        {entry.isPendingReturn && (
                          <button
                            type="button"
                            onClick={() => openAdjustmentPanel(entry)}
                            className="text-[10px] font-black bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded-full flex items-center gap-1 transition-all"
                          >
                            <ArrowLeftRight size={10} />
                            Adjust
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                      <span className="font-bold text-gray-500">Total: <b className="text-gray-900">{formatINR(entry.grandTotal)}</b></span>
                      <span className="font-bold text-gray-500">Paid: <b className="text-gray-900">{formatINR(entry.paidAmount || 0)}</b></span>
                      <span className="font-black text-emerald-700">Remaining: {formatINR(entry.remaining)}</span>
                    </div>
                  </div>
                );
              })}

              {entries.length === 0 && (
                <div className="py-6 text-center text-sm text-gray-400 font-medium italic border border-dashed border-gray-200 rounded-2xl">
                  No pending {activeDirection === 'pay_in' ? 'invoices/returns' : 'invoices to pay'} found for this party.
                </div>
              )}

              {/* Manual payment option */}
              <button
                type="button"
                onClick={selectStandalone}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${
                  isStandalone ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-gray-50 hover:bg-white hover:border-gray-200'
                }`}
              >
                <div className="flex gap-3">
                  {isStandalone ? <CheckCircle2 size={18} className="text-blue-600 mt-0.5" /> : <Circle size={18} className="text-gray-300 mt-0.5" />}
                  <div>
                    <p className="text-sm font-black text-gray-900">Manual payment entry</p>
                    <p className="text-xs text-gray-500 font-bold mt-1">No invoice link. A remark is required for audit trail.</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Amount / Date / Mode row — only shown in the main form flow (not adjustment panel) */}
          {!showAdjustmentPanel && (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1 space-y-1.5">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Amount *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={!canEnterAmount || submitting}
                    value={amount}
                    onChange={e => {
                      const val = e.target.value;
                      const parsed = Number(val);
                      if (selectedEntry && !isNaN(parsed) && parsed > selectedEntry.remaining) {
                        setAmount(String(selectedEntry.remaining));
                      } else {
                        setAmount(val);
                      }
                    }}
                    placeholder="0.00"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono font-bold disabled:opacity-50"
                  />
                  {selectedEntry && <p className="text-[11px] text-gray-500 font-bold">Max {formatINR(selectedEntry.remaining)}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Mode</label>
                  <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-2xl">
                    {(['Cash', 'Bank'] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPaymentMode(mode)}
                        className={`py-2.5 rounded-xl text-xs font-black transition-all ${paymentMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Reference</label>
                  <input
                    type="text"
                    value={referenceNo}
                    onChange={e => setReferenceNo(e.target.value)}
                    placeholder="Transaction / cheque number"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Remark</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Remark for ledger"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose} className="flex-1 py-3.5 bg-gray-50 hover:bg-gray-100 rounded-2xl text-xs font-black text-gray-600 border">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || loading}
                  className={`flex-1 py-3.5 rounded-2xl text-xs font-black text-white shadow-md disabled:opacity-50 flex items-center justify-center gap-2 ${
                    activeDirection === 'pay_in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  {submitting ? 'Recording...' : submitLabel}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
