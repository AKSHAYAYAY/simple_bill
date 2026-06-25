import React, { useMemo, useState, useEffect } from 'react';
import { Invoice, InvoiceStatus, User, AppSettings } from '../types';
import { Calendar, ShieldCheck, ArrowRight, ReceiptIndianRupee, ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { ServiceCard } from '../components/ServiceCard';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { formatINR } from '../utils/currency';
import { fetchDashboardReports } from '../services/dataService';

interface DashboardProps {
  invoices: Invoice[];
  user: User;
  settings: AppSettings;
  onNavigate?: (route: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ invoices, user, settings, onNavigate: propsOnNavigate }) => {
  const navigate = useNavigate();
  const onNavigate = propsOnNavigate || ((route: string) => navigate('/' + route));
  const formatCurrency = (amount: number) => formatINR(amount, { decimals: 0 });
  const [dashData, setDashData] = useState<any>(null);

  useEffect(() => {
    fetchDashboardReports()
      .then(res => setDashData(res))
      .catch(err => console.error("Failed to load dashboard metrics:", err));
  }, []);

  const currencySymbol = '₹';
  const profitPct = (dashData?.total_sales ?? 0) > 0
    ? (((dashData?.today_gross_profit ?? 0) / (dashData?.total_sales ?? 0)) * 100).toFixed(1)
    : null;

  const todayDateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Service grid config matching the user specifications
  const services = [
    {
      title: 'Sales',
      description: 'Create and manage sales',
      iconName: 'FileText' as const,
      route: 'invoices'
    },
    {
      title: 'Purchases',
      description: 'Track supplier purchases',
      iconName: 'ShoppingCart' as const,
      route: 'purchases'
    },
    {
      title: 'Payments',
      description: 'Manage incoming & outgoing payments',
      iconName: 'CreditCard' as const,
      route: 'payments'
    },
    {
      title: 'Sales Returns',
      description: 'Handle product returns',
      iconName: 'RotateCcw' as const,
      route: 'sales-returns'
    },
    {
      title: 'Customers',
      description: 'Manage customer records',
      iconName: 'Users' as const,
      route: 'customers'
    },
    {
      title: 'Inventory',
      description: 'Track stock & items',
      iconName: 'Boxes' as const,
      route: 'inventory'
    },
    {
      title: 'Suppliers',
      description: 'Manage supplier data',
      iconName: 'Truck' as const,
      route: 'suppliers'
    },
    {
      title: 'Reports',
      description: 'View business insights',
      iconName: 'BarChart3' as const,
      route: 'reports'
    },
    {
      title: 'Daybook',
      description: 'Daily transaction ledger',
      iconName: 'BookOpen' as const,
      route: 'cashbook'
    }
  ];

  const StatCard = ({ title, value, subtitle, icon: Icon, customIcon, color, tooltip }: any) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5" title={tooltip}>{title}</p>
          <h3 className="text-2xl font-black text-gray-900 tracking-tight">{value}</h3>
        </div>
        <div className={`p-3.5 rounded-2xl text-white ${color} shadow-sm flex-shrink-0`}>
          {customIcon ? (
            <span className="text-xl font-black leading-none block w-6 h-6 text-center">{customIcon}</span>
          ) : (
            <Icon size={24} />
          )}
        </div>
      </div>
      {subtitle && (
        <p className="text-xs text-gray-400 font-bold mt-3 border-t border-gray-50 pt-2">{subtitle}</p>
      )}
    </div>
  );

  // Framer motion containers
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  return (
    <div className="space-y-8 pb-16 animate-in fade-in duration-300">
      
      {/* 1. TOP HERO BANNER */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-3xl p-8 md:p-10 shadow-xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_40%)]" />
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-2.5 px-3 py-1 bg-white/10 rounded-full w-fit backdrop-blur-md border border-white/5">
            <ShieldCheck size={14} className="text-blue-200" />
            <span className="text-[10px] font-black tracking-widest uppercase text-blue-100">Merchant Hub Verified</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            Welcome back, {user.name} 👋
          </h1>
          <p className="text-blue-100 text-sm md:text-base font-medium max-w-xl leading-relaxed">
            Manage your billing system, keep track of supplier restocks, and review daily accounts from a single command center.
          </p>
        </div>
        
        <div className="relative z-10 bg-white/10 border border-white/10 p-5 rounded-2xl backdrop-blur-md flex flex-col justify-between min-w-[220px]">
          <div className="flex items-center gap-2 text-blue-100 text-xs font-bold uppercase tracking-wider mb-3">
            <Calendar size={14} /> {todayDateStr}
          </div>
          <div className="pt-2 border-t border-white/10 flex justify-between items-center">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-blue-200">Active Sales</span>
              <p className="text-2xl font-black font-mono mt-0.5">{invoices.length}</p>
            </div>
            <button 
              onClick={() => onNavigate('invoices')}
              className="p-2 bg-white text-blue-600 rounded-xl hover:bg-blue-50 active:scale-95 transition-all shadow-sm"
              title="Create Sale"
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. THE 4 METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Sales"
          value={formatCurrency(dashData?.total_sales ?? 0)}
          subtitle={`${dashData?.today_sales_count ?? 0} sales billed today`}
          icon={ReceiptIndianRupee}
          color="bg-blue-500"
          tooltip="Sum of grand_total of all invoices created today, regardless of payment status."
        />
        <StatCard
          title="Day Balance"
          value={formatCurrency(dashData?.day_balance ?? 0)}
          subtitle="Net cash movement today"
          icon={Wallet}
          color={(dashData?.day_balance ?? 0) < 0 ? 'bg-red-500' : 'bg-emerald-500'}
          tooltip="Pay In minus Pay Out. Positive = net cash gain today. Negative = net cash out today."
        />
        <StatCard
          title="Payment In"
          value={formatCurrency(dashData?.pay_in ?? 0)}
          subtitle="Cash & bank received today"
          icon={ArrowDownLeft}
          color="bg-green-500"
          tooltip="Total cash and bank receipts recorded in today's day book entries."
        />
        <StatCard
          title="Payment Out"
          value={formatCurrency(dashData?.pay_out ?? 0)}
          subtitle="Cash & bank paid today"
          icon={ArrowUpRight}
          color="bg-orange-400"
          tooltip="Total cash and bank payments recorded in today's day book."
        />
      </div>

      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Today's Gross Profit</p>
            <h3 className={`text-2xl font-black tracking-tight ${(dashData?.today_gross_profit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(dashData?.today_gross_profit ?? 0)}
            </h3>
          </div>
          <div className={`p-3.5 rounded-2xl text-white shadow-sm flex-shrink-0 ${(dashData?.today_gross_profit ?? 0) >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}>
            <span className="text-xl font-black leading-none block w-6 h-6 text-center">%</span>
          </div>
        </div>
        {profitPct !== null && (
          <p className="text-xs text-gray-400 font-bold mt-3 border-t border-gray-50 pt-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black mr-1 ${Number(profitPct) >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {Number(profitPct) >= 0 ? '+' : ''}{profitPct}%
            </span>
            margin on today's revenue
          </p>
        )}
        {profitPct === null && (
          <p className="text-xs text-gray-400 font-bold mt-3 border-t border-gray-50 pt-2">No sales recorded today</p>
        )}
      </div>


      {/* 3. SERVICES GRID NAVIGATION SECTION */}
      <div className="space-y-4">
        <div>
          <h3 className="text-xl font-black text-gray-900 tracking-tight">Business Services Grid</h3>
          <p className="text-gray-500 text-sm">Select a module to launch its dedicated workflow registry.</p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        >
          {services.map((service, index) => (
            <ServiceCard
              key={index}
              title={service.title}
              description={service.description}
              iconName={service.iconName}
              route={service.route}
              onClick={onNavigate}
            />
          ))}
        </motion.div>
      </div>

      {/* 4. RECENT ACTIVITY LIST FOOTER */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-black text-gray-900 tracking-tight">Recent Activity Feed</h3>
            <p className="text-gray-500 text-xs">Real-time log of the latest generated sales invoices.</p>
          </div>
          <button 
            onClick={() => onNavigate('invoices')}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
          >
            View all sales
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...invoices]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 3)
            .map(inv => (
              <div key={inv.id} className="flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50/20 rounded-2xl border border-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    inv.status === InvoiceStatus.PAID ? 'bg-green-500' :
                    inv.status === InvoiceStatus.OVERDUE ? 'bg-red-500' : 'bg-orange-400'
                  }`} />
                  <div>
                    <p className="text-sm font-black text-gray-900">Sale #{inv.id}</p>
                    <p className="text-[10px] text-gray-400 font-bold font-mono">{new Date(inv.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-gray-900">{formatCurrency(inv.total)}</span>
                  <span className="block text-[9px] uppercase font-bold tracking-widest text-gray-400 mt-0.5">{inv.status}</span>
                </div>
              </div>
            ))}
        </div>
      </div>

    </div>
  );
};
