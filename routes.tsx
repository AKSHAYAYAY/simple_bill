import React, { lazy } from 'react';
import { RouteObject, Navigate } from 'react-router-dom';

// Lazily load named exports for maximum performance and code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Invoices = lazy(() => import('./pages/Invoices').then(m => ({ default: m.Invoices })));
const Customers = lazy(() => import('./pages/Customers').then(m => ({ default: m.Customers })));
const Suppliers = lazy(() => import('./pages/Suppliers').then(m => ({ default: m.Suppliers })));
const Inventory = lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const Purchases = lazy(() => import('./pages/Purchases').then(m => ({ default: m.Purchases })));
const SalesReturns = lazy(() => import('./pages/SalesReturns').then(m => ({ default: m.SalesReturns })));
const PurchaseReturns = lazy(() => import('./pages/PurchaseReturns').then(m => ({ default: m.PurchaseReturns })));
const Payments = lazy(() => import('./pages/Payments').then(m => ({ default: m.Payments })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Reports = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const Help = lazy(() => import('./pages/Help').then(m => ({ default: m.Help })));
const StaffManagement = lazy(() => import('./pages/StaffManagement').then(m => ({ default: m.StaffManagement })));
const CashbookExpenses = lazy(() => import('./pages/CashbookExpenses').then(m => ({ default: m.CashbookExpenses })));
const PartyLedgerPage = lazy(() => import('./pages/PartyLedgerPage').then(m => ({ default: m.PartyLedgerPage })));

interface PrivateRoutesProps {
  invoices: any[];
  customers: any[];
  settings: any;
  user: any;
  loadData: () => Promise<void>;
  handleUpdateUser: (u: any) => void;
  setSettings: (s: any) => void;
  handleViewLedger: (partyId: string, partyType: 'Customer' | 'Supplier') => void;
}

export const getPrivateRoutes = (props: PrivateRoutesProps): RouteObject[] => [
  {
    index: true,
    element: <Navigate to="/dashboard" replace />
  },
  {
    path: 'dashboard',
    element: <Dashboard invoices={props.invoices} user={props.user} settings={props.settings} />
  },
  {
    path: 'invoices',
    element: <Invoices invoices={props.invoices} customers={props.customers} settings={props.settings} onRefresh={props.loadData} />
  },
  {
    path: 'customers',
    element: <Customers settings={props.settings} onRefresh={props.loadData} onViewLedger={props.handleViewLedger} />
  },
  {
    path: 'suppliers',
    element: <Suppliers onViewLedger={props.handleViewLedger} />
  },
  {
    path: 'inventory',
    element: <Inventory />
  },
  {
    path: 'purchases',
    element: <Purchases />
  },
  {
    path: 'sales-returns',
    element: <SalesReturns />
  },
  {
    path: 'purchase-returns',
    element: <PurchaseReturns />
  },
  {
    path: 'payments',
    element: <Payments onViewLedger={props.handleViewLedger} />
  },
  {
    path: 'party/:partyId',
    element: <PartyLedgerPage />
  },
  {
    path: 'cashbook',
    element: <CashbookExpenses />
  },
  {
    path: 'settings',
    element: <Settings settings={props.settings} onUpdate={props.setSettings} />
  },
  {
    path: 'staff',
    element: <StaffManagement />
  },
  {
    path: 'reports',
    element: <Reports invoices={props.invoices} settings={props.settings} />
  },
  {
    path: 'profile',
    element: <Profile user={props.user} settings={props.settings} onUpdate={props.handleUpdateUser} />
  },
  {
    path: 'help',
    element: <Help />
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />
  }
];
