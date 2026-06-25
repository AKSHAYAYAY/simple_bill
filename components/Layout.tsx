import React, { useState } from 'react';
import { User, Role } from '../types';
import { 
  LayoutDashboard, FileText, Users, Settings, LogOut, PieChart, HelpCircle, 
  Menu, X, UserCircle, ShoppingBag, IndianRupee, BookOpen, Package, 
  RotateCcw, RotateCw, Wallet 
} from 'lucide-react';
import { APP_CONFIG } from '../config';
import { NavLink, Link, useLocation, useNavigate, Outlet } from 'react-router-dom';

interface LayoutProps {
  children?: React.ReactNode;
  user: User;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [Role.ADMIN, Role.ACCOUNTANT, Role.CLIENT] },
    { id: 'invoices', label: 'Sales', icon: FileText, roles: [Role.ADMIN, Role.ACCOUNTANT, Role.CLIENT] },
    { id: 'sales-returns', label: 'Sales Returns', icon: RotateCcw, roles: [Role.ADMIN, Role.ACCOUNTANT] },
    { id: 'inventory', label: 'Inventory', icon: Package, roles: [Role.ADMIN, Role.ACCOUNTANT] },
    { id: 'purchases', label: 'Purchases', icon: ShoppingBag, roles: [Role.ADMIN, Role.ACCOUNTANT] },
    { id: 'purchase-returns', label: 'Purchase Returns', icon: RotateCw, roles: [Role.ADMIN, Role.ACCOUNTANT] },
    { id: 'payments', label: 'Payments', icon: IndianRupee, roles: [Role.ADMIN, Role.ACCOUNTANT] },
    { id: 'cashbook', label: 'Cash & Operations', icon: Wallet, roles: [Role.ADMIN, Role.ACCOUNTANT] },
    { id: 'reports', label: 'Reports', icon: PieChart, roles: [Role.ADMIN, Role.ACCOUNTANT] },
    { id: 'profile', label: 'Profile', icon: UserCircle, roles: [Role.ADMIN, Role.ACCOUNTANT, Role.CLIENT] },
    { id: 'settings', label: 'Settings', icon: Settings, roles: [Role.ADMIN] },
    { id: 'staff', label: 'Staff & Users', icon: Users, roles: [Role.ADMIN] },
    { id: 'help', label: 'Help & Guide', icon: HelpCircle, roles: [Role.ADMIN, Role.ACCOUNTANT, Role.CLIENT] },
  ];

  const filteredNav = navItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="flex h-[100dvh] bg-gray-50 overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-slate-900 text-white p-4 flex justify-between items-center z-50 no-print">
        <div className="flex items-center gap-2">
          <Link to="/dashboard" className="text-xl font-bold tracking-tight text-blue-400">{APP_CONFIG.name}</Link>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-slate-300 hover:text-white">
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Overlay (Mobile) */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:inset-auto no-print
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 hidden md:block border-b border-slate-800">
          <Link to="/dashboard" className="text-2xl font-bold tracking-tight text-blue-400 block">{APP_CONFIG.name}</Link>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 font-bold">Cloud Billing Suite</p>
        </div>

        {/* Mobile Menu Header spacer */}
        <div className="h-16 md:hidden"></div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto py-6">
          {filteredNav.map(item => (
            <NavLink
              key={item.id}
              to={"/" + item.id}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => `
                w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                ${isActive 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
              `}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <NavLink
            to="/profile"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) => `
              flex items-center gap-3 mb-4 w-full p-2 rounded-lg transition-colors
              ${isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}
            `}
          >
            <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="overflow-hidden text-left">
              <p className="text-sm font-bold truncate">{user.name}</p>
              <p className="text-[10px] text-slate-550 truncate">{user.email}</p>
            </div>
          </NavLink>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-red-900/20 hover:text-red-400 rounded-md transition-all border border-transparent hover:border-red-900/50"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-gray-50 relative pt-16 md:pt-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-full">
          {children || <Outlet />}
        </div>
      </main>
    </div>
  );
};
