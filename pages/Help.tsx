
import React, { useState } from 'react';
import {
  User, Lock, Bot, Users, Settings, Package, Truck, UserCheck,
  FileText, RotateCcw, BookOpen, CreditCard, BarChart2, CheckCircle,
  ChevronDown, ChevronUp, Zap, HelpCircle, ExternalLink, Tag,
  ShoppingCart, IndianRupee, ArrowLeftRight, Layers, Bell
} from 'lucide-react';

interface Step {
  id: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  title: string;
  subtitle: string;
  content: React.ReactNode;
}

export const Help: React.FC = () => {
  const [openStep, setOpenStep] = useState<number | null>(1);

  const toggle = (id: number) => setOpenStep(prev => prev === id ? null : id);

  const Bullet = ({ children }: { children: React.ReactNode }) => (
    <li className="flex items-start gap-2.5">
      <CheckCircle size={15} className="text-green-500 shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  );

  const Field = ({ label, hint }: { label: string; hint?: string }) => (
    <div className="flex flex-col gap-0.5 bg-white border border-gray-100 rounded-lg px-3 py-2 shadow-sm">
      <span className="text-xs font-semibold text-gray-800">{label}</span>
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </div>
  );

  const Note = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-start gap-2 bg-amber-50 border-l-4 border-amber-400 rounded-r-xl px-4 py-3 text-xs text-amber-800">
      <Bell size={14} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );

  const steps: Step[] = [
    {
      id: 1,
      icon: User,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      title: 'Complete Your Profile',
      subtitle: 'Set up your personal identity within the system',
      content: (
        <div className="space-y-4">
          <p>Navigate to the <strong>Profile</strong> section from the sidebar. This is the first thing you should do after logging in.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Field label="Full Name" hint="Your display name" />
            <Field label="Phone Number" hint="10-digit mobile" />
            <Field label="Address" hint="Your office/shop address" />
          </div>
          <p>Once filled, click <strong>"Sync Profile"</strong> to save your details to the cloud.</p>
          <Note>Make sure your name and phone match your business registration for compliance.</Note>
        </div>
      ),
    },
    {
      id: 2,
      icon: Lock,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      title: 'Set Your Password & AI Agent',
      subtitle: 'Secure your account and enable the AI assistant',
      content: (
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-gray-800 mb-2">🔐 Change Password</p>
            <p>A temporary password was assigned during account creation. Go to <strong>Profile → Security</strong>, enter your new password, confirm it, and hit <strong>"Update"</strong>.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-2">🤖 AI Agent (Chatbot)</p>
            <p>In the <strong>AI Agent</strong> section, paste your <strong>OpenRouter API Key</strong>. Click <strong>"Test"</strong> to verify the connection, then interact with the live chatbot directly from the panel.</p>
          </div>
          <Note>Your OpenRouter key is stored encrypted. Never share it publicly.</Note>
        </div>
      ),
    },
    {
      id: 3,
      icon: Users,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      title: 'Staff & User Management',
      subtitle: 'Add co-workers, assign roles and control access',
      content: (
        <div className="space-y-4">
          <p>Go to <strong>Staff & Users</strong> from the main menu. Here you can manage your entire team.</p>
          <ul className="space-y-2 text-sm">
            <Bullet><strong>Create Staff Profile:</strong> Enter name, email, phone and assign a login password.</Bullet>
            <Bullet><strong>Assign Roles:</strong> Choose between Admin, Manager, or Staff roles.</Bullet>
            <Bullet><strong>Set Scope:</strong> Restrict access to specific modules (e.g., Billing only, no Settings).</Bullet>
            <Bullet><strong>Manage Access:</strong> Enable/disable users anytime without deleting their data.</Bullet>
          </ul>
          <Note>Admin role has full access. Limit sensitive permissions like Reports and Settings to trusted staff only.</Note>
        </div>
      ),
    },
    {
      id: 4,
      icon: Settings,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      title: 'Configure Settings',
      subtitle: 'Tax, operations, design, and catalog master setup',
      content: (
        <div className="space-y-5">
          {/* Tax */}
          <div>
            <p className="font-semibold text-gray-800 mb-2">📋 Taxation & Compliance</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Field label="Tax Registration Type" hint="Registered (GST) / Unregistered" />
              <Field label="GSTIN Number" hint="15-digit GST number" />
              <Field label="Tax Display Mode" hint="Tax Exclusive / Inclusive" />
              <Field label="Default Sale Tax" hint="CGST + SGST / IGST" />
              <Field label="Invoice Tax Printing" hint="Show Tax Columns" />
              <Field label="Default CGST Rate (%)" hint="e.g. 1.5%" />
              <Field label="Default SGST Rate (%)" hint="e.g. 1.5%" />
              <Field label="Default IGST Rate (%)" hint="e.g. 3%" />
              <Field label="HSN Code Default" hint="For your product type" />
            </div>
          </div>
          {/* Operational */}
          <div>
            <p className="font-semibold text-gray-800 mb-2">⚙️ Operational Settings</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Field label="Invoice Prefix" hint="e.g. INV, BILL, SB" />
              <Field label="Low Stock Limit" hint="Alert threshold units" />
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              {['Auto Round Off Totals', 'Allow Negative Stock', 'Allow Zero Stock Sales'].map(opt => (
                <div key={opt} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2">
                  <div className="w-4 h-4 rounded border-2 border-gray-300 flex items-center justify-center bg-blue-50">
                    <div className="w-2 h-2 rounded-sm bg-blue-500"></div>
                  </div>
                  <span className="text-gray-700 font-medium">{opt}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Location */}
          <div>
            <p className="font-semibold text-gray-800 mb-2">📍 Location Details</p>
            <p className="text-sm">Enter your business address, city, state, and pincode. This appears on all invoices and compliance documents.</p>
          </div>
          {/* Design */}
          <div>
            <p className="font-semibold text-gray-800 mb-2">🎨 Design / Branding</p>
            <ul className="space-y-1.5 text-sm">
              <Bullet>Upload your business logo (transparent PNG recommended).</Bullet>
              <Bullet>Set invoice header text, footer notes, and custom terms & conditions.</Bullet>
              <Bullet>Choose invoice color theme and font style.</Bullet>
            </ul>
          </div>
          {/* Catalog Master */}
          <div>
            <p className="font-semibold text-gray-800 mb-2">📚 Catalog Master</p>
            <ul className="space-y-1.5 text-sm">
              <Bullet><strong>Product Categories:</strong> Create custom categories (e.g., Gold Rings, Silver Chains, Diamonds).</Bullet>
              <Bullet><strong>Measuring Units:</strong> Define units like Gram, Piece, Kg, Carat, Meter as per your business.</Bullet>
              <Bullet><strong>Tax Slabs:</strong> Pre-define GST slabs for quick assignment during product creation.</Bullet>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 5,
      icon: Package,
      color: 'text-teal-600',
      bgColor: 'bg-teal-50',
      borderColor: 'border-teal-200',
      title: 'Inventory – Add Products',
      subtitle: 'Build your product catalog with pricing and stock',
      content: (
        <div className="space-y-4">
          <p>Go to <strong>Inventory → New Product</strong> and fill in the product details:</p>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Basic Info</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Field label="Product Name *" hint="e.g. Premium White Diamond Ring" />
              <Field label="Product Code (SKU)" hint="Leave blank to auto-generate" />
              <Field label="Barcode" hint="e.g. 8901234567" />
              <Field label="Category" hint="Select from Catalog Master" />
              <Field label="Stock Unit" hint="e.g. Gram, Piece, Carat" />
              <Field label="Item Description" hint="Attributes, purity, weight…" />
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Pricing & Taxes</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Field label="Purchase Price (Cost)" hint="Your buying price" />
              <Field label="Profit Margin (%)" hint="Auto-calculates selling price" />
              <Field label="Selling Price (MRP)" hint="Customer-facing price" />
              <Field label="CGST (%)" hint="e.g. 1.5" />
              <Field label="SGST (%)" hint="e.g. 1.5" />
              <Field label="IGST (%)" hint="For interstate sales" />
              <Field label="HSN Code" hint="e.g. 7113 for jewelry" />
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Stock & Alerts</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Initial Opening Stock" hint="Starting quantity" />
              <Field label="Low Stock Alert Threshold" hint="Notify when stock falls below" />
            </div>
          </div>
          <Note>Setting accurate HSN codes ensures GST compliance on all invoices automatically.</Note>
        </div>
      ),
    },
    {
      id: 6,
      icon: Truck,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      title: 'Suppliers – Manage Vendors',
      subtitle: 'Add suppliers and link their product purchases',
      content: (
        <div className="space-y-4">
          <p>Go to <strong>Suppliers</strong> and click <strong>"Add Supplier"</strong>.</p>
          <ul className="space-y-2 text-sm">
            <Bullet>Enter supplier name, phone, email, and GST number.</Bullet>
            <Bullet>Add their complete billing address (for purchase invoices).</Bullet>
            <Bullet>Set payment terms (credit days) if applicable.</Bullet>
            <Bullet>After creating a supplier, go to <strong>"Add Purchase"</strong> — select this supplier and add the products you bought from them.</Bullet>
            <Bullet>Each purchase automatically updates your inventory stock levels.</Bullet>
          </ul>
          <Note>Always record purchases from suppliers to keep your inventory and cost-of-goods data accurate.</Note>
        </div>
      ),
    },
    {
      id: 7,
      icon: UserCheck,
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
      borderColor: 'border-pink-200',
      title: 'Customers & Billing',
      subtitle: 'Add a customer and create your first sale invoice',
      content: (
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-gray-800 mb-1">👤 Add a Customer</p>
            <p className="text-sm">Go to <strong>Customers → Add Customer</strong>. Fill in name, phone, address, and optionally their GSTIN for B2B billing.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">🧾 Create a Sales Invoice</p>
            <ul className="space-y-2 text-sm">
              <Bullet>Navigate to <strong>Sales / Billing → New Invoice</strong>.</Bullet>
              <Bullet>Select the customer from your directory or add a quick walk-in customer.</Bullet>
              <Bullet>Add products from inventory — stock, price, and taxes auto-populate.</Bullet>
              <Bullet>Apply discounts if needed, review the tax breakup (CGST/SGST/IGST).</Bullet>
              <Bullet>Choose payment mode: Cash, UPI, Card, or Credit.</Bullet>
              <Bullet>Click <strong>"Generate Invoice"</strong> to save and print/share as PDF.</Bullet>
            </ul>
          </div>
          <Note>Invoices auto-deduct stock from inventory. Review before finalizing if stock is critical.</Note>
        </div>
      ),
    },
    {
      id: 8,
      icon: RotateCcw,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      title: 'Returns Management',
      subtitle: 'Handle sales returns and purchase returns',
      content: (
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-gray-800 mb-1">↩️ Sales Return</p>
            <p className="text-sm">When a customer returns goods, go to <strong>Sales Return</strong>. Select the original invoice, choose items being returned, and system auto-generates a credit note and restores stock.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">↪️ Purchase Return</p>
            <p className="text-sm">If you return goods to a supplier, go to <strong>Purchase Return</strong>. Link it to the original purchase entry and the system creates a debit note while deducting stock.</p>
          </div>
          <ul className="space-y-2 text-sm">
            <Bullet>All returns are tracked separately for GST reconciliation.</Bullet>
            <Bullet>Credit/Debit notes are printable and GST-compliant.</Bullet>
            <Bullet>Stock levels update automatically on each return.</Bullet>
          </ul>
        </div>
      ),
    },
    {
      id: 9,
      icon: BookOpen,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50',
      borderColor: 'border-cyan-200',
      title: 'Day Book',
      subtitle: "View today's complete transaction log",
      content: (
        <div className="space-y-3">
          <p>The <strong>Day Book</strong> is your real-time daily ledger. It shows every financial transaction recorded today at a glance.</p>
          <ul className="space-y-2 text-sm">
            <Bullet>All sales invoices generated today with amounts and payment mode.</Bullet>
            <Bullet>Purchases recorded, payments made to suppliers.</Bullet>
            <Bullet>Cash inflows and outflows with running balance.</Bullet>
            <Bullet>Returns, adjustments, and any manual entries.</Bullet>
            <Bullet>Use the date picker to review any past day's transactions.</Bullet>
          </ul>
          <Note>Cross-check your Day Book with physical cash at day-end to ensure zero discrepancy.</Note>
        </div>
      ),
    },
    {
      id: 10,
      icon: CreditCard,
      color: 'text-violet-600',
      bgColor: 'bg-violet-50',
      borderColor: 'border-violet-200',
      title: 'Payments – Pay In & Pay Out',
      subtitle: 'Record all money movements against any party',
      content: (
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-gray-800 mb-1">💰 Pay In (Received from Customer)</p>
            <p className="text-sm">Go to <strong>Payments → Pay In</strong>. Select the customer, enter the amount received, choose payment mode (Cash/UPI/Card/Bank), and save. This settles their outstanding invoices.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">💸 Pay Out (Paid to Supplier)</p>
            <p className="text-sm">Go to <strong>Payments → Pay Out</strong>. Select the supplier, enter the amount paid, and record the mode. This updates your payables balance with that vendor.</p>
          </div>
          <ul className="space-y-2 text-sm">
            <Bullet>All payments are linked to party ledgers for accurate balance tracking.</Bullet>
            <Bullet>Partial payments are supported — remaining balance carries forward.</Bullet>
            <Bullet>Payment receipts can be printed or shared via WhatsApp/PDF.</Bullet>
          </ul>
        </div>
      ),
    },
    {
      id: 11,
      icon: BarChart2,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
      borderColor: 'border-rose-200',
      title: 'Reports & Analytics',
      subtitle: 'Deep insights across sales, stock, taxes, and more',
      content: (
        <div className="space-y-4">
          <p>The <strong>Reports</strong> section is your business intelligence hub. Use date filters and category filters to slice data.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: FileText, label: 'Sales Report', desc: 'Invoice-wise and item-wise sales summary with GST breakup.' },
              { icon: ShoppingCart, label: 'Purchase Report', desc: 'All purchases from suppliers with cost and tax details.' },
              { icon: Package, label: 'Stock / Inventory Report', desc: 'Current stock levels, low-stock alerts, and valuation.' },
              { icon: Layers, label: 'GST Report', desc: 'GSTR-1 and GSTR-3B ready data with CGST, SGST, IGST split.' },
              { icon: ArrowLeftRight, label: 'Profit & Loss', desc: 'Revenue vs. cost of goods with gross profit analysis.' },
              { icon: IndianRupee, label: 'Party Ledger', desc: 'Customer/Supplier-wise outstanding balances and history.' },
              { icon: Tag, label: 'Day Book Report', desc: 'Detailed daily cash flow for any selected date range.' },
              { icon: BarChart2, label: 'Top Products', desc: 'Best-selling items by quantity and revenue.' },
            ].map(r => (
              <div key={r.label} className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                <div className="p-2 bg-rose-50 rounded-lg shrink-0">
                  <r.icon size={15} className="text-rose-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{r.label}</p>
                  <p className="text-xs text-gray-500">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <Note>Export any report as CSV or PDF for sharing with your accountant or auditor.</Note>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto pb-16">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-xs font-semibold mb-4">
          <BookOpen size={14} /> Complete Setup Guide
        </div>
        <h2 className="text-3xl font-black text-gray-900">Help & Getting Started</h2>
        <p className="text-gray-500 mt-2 text-sm max-w-xl mx-auto">
          Follow these steps in order to set up SimpleBill for your business. Each step builds on the previous one.
        </p>
      </div>

      {/* Quick Tip Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {[
          { icon: Zap, color: 'from-blue-600 to-blue-700 shadow-blue-100', label: 'Quick Setup', desc: 'Full setup in under 30 minutes following these steps.' },
          { icon: CheckCircle, color: 'from-emerald-600 to-emerald-700 shadow-emerald-100', label: 'GST Ready', desc: 'All invoices, returns, and reports are GST-compliant.' },
          { icon: BarChart2, color: 'from-violet-600 to-violet-700 shadow-violet-100', label: 'Smart Reports', desc: 'Real-time analytics for sales, stock, and profit.' },
        ].map(card => (
          <div key={card.label} className={`bg-gradient-to-br ${card.color} p-5 rounded-2xl text-white shadow-xl`}>
            <card.icon size={24} className="mb-3 opacity-60" />
            <p className="font-bold text-sm">{card.label}</p>
            <p className="text-xs opacity-80 mt-1">{card.desc}</p>
          </div>
        ))}
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map(step => {
          const isOpen = openStep === step.id;
          return (
            <div
              key={step.id}
              className={`rounded-2xl border transition-all duration-200 overflow-hidden ${isOpen ? `${step.borderColor} shadow-md` : 'border-gray-100 bg-white shadow-sm'}`}
            >
              <button
                onClick={() => toggle(step.id)}
                className={`w-full flex items-center gap-4 p-5 text-left transition-colors ${isOpen ? step.bgColor : 'bg-white hover:bg-gray-50'}`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${step.bgColor} ${step.color} font-black text-sm`}>
                  {step.id}
                </div>
                <div className={`p-2 rounded-xl ${step.bgColor} ${step.color} shrink-0`}>
                  <step.icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{step.title}</p>
                  <p className="text-xs text-gray-500 truncate">{step.subtitle}</p>
                </div>
                {isOpen ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pt-2 bg-white text-sm text-gray-600 leading-relaxed">
                  <div className="border-t border-gray-100 pt-4">
                    {step.content}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer CTA */}
      <div className="mt-12 text-center p-8 bg-white rounded-3xl border border-dashed border-gray-200">
        <HelpCircle className="mx-auto text-gray-300 mb-4" size={40} />
        <h4 className="text-lg font-bold text-gray-900">Still need help?</h4>
        <p className="text-gray-500 text-sm mb-6 mt-1">Our support team is available for onboarding, custom features, and enterprise solutions.</p>
        <a
          href="mailto:support@bizbytech.in"
          className="inline-flex items-center gap-2 bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-black transition-all text-sm"
        >
          Contact Support <ExternalLink size={15} />
        </a>
      </div>
    </div>
  );
};
