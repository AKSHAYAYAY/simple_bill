
import React from 'react';
import { Invoice, Customer, AppSettings } from '../types';
import { APP_CONFIG } from '../config';
import { formatINR } from '../utils/currency';

interface InvoicePDFProps {
  invoice: Invoice;
  customer?: Customer;
  settings: AppSettings;
}

export const InvoicePDF: React.FC<InvoicePDFProps> = ({ invoice, customer, settings }) => {
  const currency = settings.currency || 'USD';
  const hasItemDiscounts = invoice.items.some(i => (i.discount || 0) > 0);

  const formattedDate = settings.enableDateTime
    ? new Date(invoice.date).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : new Date(invoice.date).toLocaleDateString();

  return (
    <div className="bg-white p-8 max-w-4xl mx-auto border shadow-sm print:shadow-none print:border-none relative flex flex-col min-h-[1100px]">
      {/* Main Header */}
      <div className="flex justify-between items-start mb-12 mt-6">
        <div>
          {settings.logoUrl && (
            <img src={settings.logoUrl} alt="Logo" className="h-12 w-auto mb-4" onError={(e) => (e.currentTarget.style.display = 'none')} />
          )}
          <h2 className="text-xl font-bold text-gray-800">{settings.companyName}</h2>
          {settings.invoiceHeader && (
            <p className="text-gray-500 text-sm mt-1">{settings.invoiceHeader}</p>
          )}
          {settings.companyGstin && (
            <p className="text-gray-500 text-sm font-medium mt-1">GSTIN: {settings.companyGstin}</p>
          )}
        </div>
        <div className="text-right">
          <h1 className="text-4xl font-bold text-gray-200 mb-2">INVOICE</h1>
          <p className="text-gray-600 font-mono text-lg">#{settings.invoicePrefix}{invoice.id}</p>
          <div className="mt-4 text-sm">
            <p className="text-gray-500">Date Issued:</p>
            <p className="font-medium">{formattedDate}</p>
            <p className="text-gray-500 mt-2">Due Date:</p>
            <p className="font-medium">{new Date(invoice.dueDate).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Bill To */}
      <div className="mb-12">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Bill To</h3>
        {customer ? (
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-lg text-gray-900">{customer.name}</p>
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{customer.type}</span>
            </div>
            {customer.gstin && (
              <p className="text-gray-800 font-medium text-sm mt-1">GSTIN: {customer.gstin}</p>
            )}
            <p className="text-gray-600 mt-1">{customer.address}</p>
            <p className="text-gray-600">{customer.email}</p>
          </div>
        ) : (
          <p className="text-red-500">Customer not found</p>
        )}
      </div>

      {/* Items */}
      <table className="w-full mb-12">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="text-left py-3 text-sm font-semibold text-gray-600">Description</th>
            <th className="text-center py-3 text-sm font-semibold text-gray-600 w-16">Qty</th>
            <th className="text-right py-3 text-sm font-semibold text-gray-600 w-24">Price</th>
            {hasItemDiscounts && (
              <th className="text-right py-3 text-sm font-semibold text-gray-600 w-24">Discount</th>
            )}
            <th className="text-right py-3 text-sm font-semibold text-gray-600 w-16">Tax</th>
            <th className="text-right py-3 text-sm font-semibold text-gray-600 w-32">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {invoice.items.map(item => {
            const itemGross = item.price * item.quantity;
            const itemNet = itemGross - (item.discount || 0);
            return (
              <tr key={item.id}>
                <td className="py-4 text-gray-800">{item.description}</td>
                <td className="py-4 text-center text-gray-600">{item.quantity}</td>
                <td className="py-4 text-right text-gray-600">
                  {formatINR(item.price)}
                </td>
                {hasItemDiscounts && (
                  <td className="py-4 text-right text-red-500 text-sm">
                    {item.discount && item.discount > 0 ? `-${formatINR(item.discount)}` : ''}
                  </td>
                )}
                <td className="py-4 text-right text-gray-500 text-sm">
                  {item.taxRate}%
                </td>
                <td className="py-4 text-right font-medium text-gray-900">
                  {formatINR(itemNet)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-12">
        <div className="w-64 space-y-2">
          <div className="flex justify-between text-gray-600 text-sm">
            <span>Subtotal (Net)</span>
            <span>{formatINR(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-600 text-sm">
            <span>Total Tax</span>
            <span>{formatINR(invoice.tax)}</span>
          </div>

          {(invoice.overallDiscount || 0) > 0 && (
            <div className="flex justify-between text-red-600 text-sm">
              <span>Overall Discount</span>
              <span>-{formatINR(invoice.overallDiscount!)}</span>
            </div>
          )}
          {(invoice.packingCharges || 0) > 0 && (
            <div className="flex justify-between text-gray-600 text-sm">
              <span>Packing Charges</span>
              <span>{formatINR(invoice.packingCharges!)}</span>
            </div>
          )}
          {(invoice.freightCharges || 0) > 0 && (
            <div className="flex justify-between text-gray-600 text-sm">
              <span>Freight / Transport Charges</span>
              <span>{formatINR(invoice.freightCharges!)}</span>
            </div>
          )}

          <div className="flex justify-between text-xl font-bold text-gray-900 pt-3 border-t border-gray-200">
            <span>Grand Total</span>
            <span>{formatINR(invoice.total)}</span>
          </div>
        </div>
      </div>

      <div className="mt-auto">
        {/* Footer Content */}
        <div className="pt-8 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Terms & Conditions</h3>
              <p className="text-gray-600 text-sm">{settings.terms}</p>
            </div>
            {settings.invoiceFooter && (
              <div className="text-right flex flex-col justify-end">
                <p className="text-gray-500 text-sm italic">{settings.invoiceFooter}</p>
              </div>
            )}
          </div>
        </div>

        {/* Branding Footer */}
        <div className="mt-8 pt-4 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-400">
            {APP_CONFIG.branding.footerText} • {APP_CONFIG.branding.supportText}
          </p>
        </div>
      </div>
    </div>
  );
};
