import React, { useState, useEffect } from 'react';
import { Expense, ExpenseCategory, Income, IncomeCategory, DaybookEntry } from '../types';
import {
  Search, RefreshCcw, ArrowUpRight, ArrowDownLeft, Landmark,
  Plus, Edit2, Trash2, Tag, Check, X, FileText, TrendingDown, ReceiptIndianRupee, TrendingUp, Calendar, Filter
} from 'lucide-react';
import {
  fetchExpenses, saveExpense, deleteExpense, fetchExpenseCategories, saveExpenseCategory, deleteExpenseCategory, toggleExpenseCategoryActive,
  fetchIncomes, saveIncome, deleteIncome, fetchIncomeCategories, saveIncomeCategory, deleteIncomeCategory, toggleIncomeCategoryActive,
  fetchDaybook, fetchDashboardReports
} from '../services/dataService';
import { calculateDaybookStats as calculateCentralDaybookStats } from '../utils/financialCalculations';

type ActiveTab = 'daybook' | 'cashbook' | 'expenses' | 'incomes';

export const CashbookExpenses: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('daybook');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const getLocalDateString = (d: Date = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Daybook/Cashbook States
  const [daybookEntries, setDaybookEntries] = useState<DaybookEntry[]>([]);
  const [cashBalance, setCashBalance] = useState(0);
  const [bankBalance, setBankBalance] = useState(0);
  const [totalInflow, setTotalInflow] = useState(0);
  const [totalOutflow, setTotalOutflow] = useState(0);
  const [todayProfit, setTodayProfit] = useState<number | null>(null);
  const [todaySalesCount, setTodaySalesCount] = useState<number>(0);

  // Expense States
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showExpenseCatModal, setShowExpenseCatModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Partial<Expense> | null>(null);
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [newExpenseCatName, setNewExpenseCatName] = useState('');
  const [newExpenseCatDesc, setNewExpenseCatDesc] = useState('');
  const [selectedExpenseCat, setSelectedExpenseCat] = useState('');

  // Income States
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<IncomeCategory[]>([]);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showIncomeCatModal, setShowIncomeCatModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Partial<Income> | null>(null);
  const [submittingIncome, setSubmittingIncome] = useState(false);
  const [newIncomeCatName, setNewIncomeCatName] = useState('');
  const [newIncomeCatDesc, setNewIncomeCatDesc] = useState('');
  const [selectedIncomeCat, setSelectedIncomeCat] = useState('');

  // Transaction Form States
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txAmount, setTxAmount] = useState('');
  const [txCategoryId, setTxCategoryId] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txPaymentMode, setTxPaymentMode] = useState<'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Cheque'>('Cash');
  const [txReferenceNo, setTxReferenceNo] = useState('');
  const [txNotes, setTxNotes] = useState('');

  useEffect(() => {
    loadAllData();
  }, [activeTab]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'daybook') {
        const todayStr = getLocalDateString();
        const dbData = await fetchDaybook(todayStr, todayStr);
        setDaybookEntries(dbData || []);
        calculateDaybookStats(dbData || []);
        
        try {
          const dash = await fetchDashboardReports();
          if (dash) {
            setTodayProfit(Number(dash.today_gross_profit));
            setTodaySalesCount(Number(dash.today_sales_count));
          }
        } catch (err) {
          console.error("Failed to load daybook profit metrics:", err);
        }
      } else if (activeTab === 'cashbook') {
        const dbData = await fetchDaybook();
        setDaybookEntries(dbData || []);
        calculateDaybookStats(dbData || []);
      } else if (activeTab === 'expenses') {
        const [expData, expCats] = await Promise.all([
          fetchExpenses(),
          fetchExpenseCategories(true)
        ]);
        setExpenses(expData || []);
        setExpenseCategories(expCats || []);
      } else if (activeTab === 'incomes') {
        const [incData, incCats] = await Promise.all([
          fetchIncomes(),
          fetchIncomeCategories(true)
        ]);
        setIncomes(incData || []);
        setIncomeCategories(incCats || []);
      }
    } catch (e) {
      console.error('Error loading operational data:', e);
    } finally {
      setLoading(false);
    }
  };

  const calculateDaybookStats = (data: DaybookEntry[]) => {
    const stats = calculateCentralDaybookStats(data);
    setTotalInflow(stats.inflow);
    setTotalOutflow(stats.outflow);
    setCashBalance(stats.cash);
    setBankBalance(stats.bank);
  };

  // --- EXPENSE CRUD HANDLERS ---
  const handleOpenExpenseModal = (exp?: Expense) => {
    if (exp) {
      setEditingExpense(exp);
      setTxDate(exp.expense_date);
      setTxAmount(exp.amount.toString());
      setTxCategoryId(exp.category_id?.toString() || '');
      setTxDescription(exp.description || '');
      setTxPaymentMode(exp.payment_mode);
      setTxReferenceNo(exp.reference_no || '');
      setTxNotes(exp.notes || '');
    } else {
      setEditingExpense(null);
      setTxDate(new Date().toISOString().slice(0, 10));
      setTxAmount('');
      setTxCategoryId('');
      setTxDescription('');
      setTxPaymentMode('Cash');
      setTxReferenceNo('');
      setTxNotes('');
    }
    setShowExpenseModal(true);
  };

  const handleSaveExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAmount || parseFloat(txAmount) <= 0) return;
    setSubmittingExpense(true);
    window.dispatchEvent(new CustomEvent('simplebill:show-loader', { detail: { message: 'Saving Expense...' } }));

    const expensePayload: Partial<Expense> = {
      expense_id: editingExpense?.expense_id,
      category_id: txCategoryId ? parseInt(txCategoryId) : undefined,
      expense_date: txDate,
      amount: parseFloat(txAmount),
      payment_mode: txPaymentMode,
      description: txDescription || undefined,
      reference_no: txReferenceNo || undefined,
      notes: txNotes || undefined
    };

    try {
      await saveExpense(expensePayload);
      setShowExpenseModal(false);
      loadAllData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setSubmittingExpense(false);
      window.dispatchEvent(new CustomEvent('simplebill:hide-loader'));
    }
  };

  const handleDeleteExpenseClick = async (id: number) => {
    if (!confirm('Are you sure you want to delete this expense transaction? This will revert daybook logs.')) return;
    try {
      await deleteExpense(id);
      loadAllData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete expense');
    }
  };

  const handleCreateExpenseCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpenseCatName) return;

    try {
      await saveExpenseCategory({
        category_name: newExpenseCatName,
        description: newExpenseCatDesc || undefined
      });
      setNewExpenseCatName('');
      setNewExpenseCatDesc('');
      const cats = await fetchExpenseCategories(true);
      setExpenseCategories(cats);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create category');
    }
  };

  const handleToggleExpenseCatActive = async (id: number) => {
    try {
      await toggleExpenseCategoryActive(id);
      const cats = await fetchExpenseCategories(true);
      setExpenseCategories(cats);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle category');
    }
  };

  const handleDeleteExpenseCat = async (id: number) => {
    if (!confirm('Are you sure you want to delete this expense category?')) return;
    try {
      await deleteExpenseCategory(id);
      const cats = await fetchExpenseCategories(true);
      setExpenseCategories(cats);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Category cannot be deleted while assigned to expenses.');
    }
  };

  // --- INCOME CRUD HANDLERS ---
  const handleOpenIncomeModal = (inc?: Income) => {
    if (inc) {
      setEditingIncome(inc);
      setTxDate(inc.income_date);
      setTxAmount(inc.amount.toString());
      setTxCategoryId(inc.category_id?.toString() || '');
      setTxDescription(inc.description || '');
      setTxPaymentMode(inc.payment_mode);
      setTxReferenceNo(inc.reference_no || '');
      setTxNotes(inc.notes || '');
    } else {
      setEditingIncome(null);
      setTxDate(new Date().toISOString().slice(0, 10));
      setTxAmount('');
      setTxCategoryId('');
      setTxDescription('');
      setTxPaymentMode('Cash');
      setTxReferenceNo('');
      setTxNotes('');
    }
    setShowIncomeModal(true);
  };

  const handleSaveIncomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAmount || parseFloat(txAmount) <= 0) return;
    setSubmittingIncome(true);
    window.dispatchEvent(new CustomEvent('simplebill:show-loader', { detail: { message: 'Saving Income...' } }));

    const incomePayload: Partial<Income> = {
      income_id: editingIncome?.income_id,
      category_id: txCategoryId ? parseInt(txCategoryId) : undefined,
      income_date: txDate,
      amount: parseFloat(txAmount),
      payment_mode: txPaymentMode,
      description: txDescription || undefined,
      reference_no: txReferenceNo || undefined,
      notes: txNotes || undefined
    };

    try {
      await saveIncome(incomePayload);
      setShowIncomeModal(false);
      loadAllData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save income');
    } finally {
      setSubmittingIncome(false);
      window.dispatchEvent(new CustomEvent('simplebill:hide-loader'));
    }
  };

  const handleDeleteIncomeClick = async (id: number) => {
    if (!confirm('Are you sure you want to delete this income transaction? This will revert daybook logs.')) return;
    try {
      await deleteIncome(id);
      loadAllData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete income');
    }
  };

  const handleCreateIncomeCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIncomeCatName) return;

    try {
      await saveIncomeCategory({
        category_name: newIncomeCatName,
        description: newIncomeCatDesc || undefined
      });
      setNewIncomeCatName('');
      setNewIncomeCatDesc('');
      const cats = await fetchIncomeCategories(true);
      setIncomeCategories(cats);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create category');
    }
  };

  const handleToggleIncomeCatActive = async (id: number) => {
    try {
      await toggleIncomeCategoryActive(id);
      const cats = await fetchIncomeCategories(true);
      setIncomeCategories(cats);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle category');
    }
  };

  const handleDeleteIncomeCat = async (id: number) => {
    if (!confirm('Are you sure you want to delete this income category?')) return;
    try {
      await deleteIncomeCategory(id);
      const cats = await fetchIncomeCategories(true);
      setIncomeCategories(cats);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Category cannot be deleted while assigned to income entries.');
    }
  };

  // --- FILTERS & SEARCH ---
  const filteredDaybook = daybookEntries.filter(e =>
    e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.entry_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = e.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.category_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedExpenseCat ? e.category_id?.toString() === selectedExpenseCat : true;
    return matchesSearch && matchesCategory;
  });

  const filteredIncomes = incomes.filter(i => {
    const matchesSearch = i.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.category_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedIncomeCat ? i.category_id?.toString() === selectedIncomeCat : true;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8 pb-16 animate-in fade-in duration-200">

      {/* Title Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Cashbook & Operations</h2>
          <p className="text-gray-500">Log miscellaneous expenses, non-invoice income, and audit liquid capital flow.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadAllData}
            className="p-3.5 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all text-gray-600 shadow-sm"
            title="Refresh Registry"
          >
            <RefreshCcw size={18} />
          </button>

          {activeTab === 'expenses' && (
            <>
              <button
                onClick={() => setShowExpenseCatModal(true)}
                className="px-5 py-3.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-2xl hover:bg-gray-100 flex items-center gap-2 font-bold text-sm shadow-sm transition-all"
              >
                <Tag size={16} /> Manage Categories
              </button>
              <button
                onClick={() => handleOpenExpenseModal()}
                className="px-6 py-3.5 bg-red-600 text-white rounded-2xl hover:bg-red-700 flex items-center gap-2 font-black text-sm shadow-lg shadow-red-600/10 transition-all"
              >
                <Plus size={18} /> Record Expense
              </button>
            </>
          )}

          {activeTab === 'incomes' && (
            <>
              <button
                onClick={() => setShowIncomeCatModal(true)}
                className="px-5 py-3.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-2xl hover:bg-gray-100 flex items-center gap-2 font-bold text-sm shadow-sm transition-all"
              >
                <Tag size={16} /> Manage Categories
              </button>
              <button
                onClick={() => handleOpenIncomeModal()}
                className="px-6 py-3.5 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 flex items-center gap-2 font-black text-sm shadow-lg shadow-emerald-600/10 transition-all"
              >
                <Plus size={18} /> Record Income
              </button>
            </>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex gap-2 p-1.5 bg-gray-100/80 rounded-2xl max-w-2xl shadow-inner">
        <button
          onClick={() => { setActiveTab('daybook'); setSearchTerm(''); }}
          className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${activeTab === 'daybook' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Daybook Ledger
        </button>
        <button
          onClick={() => { setActiveTab('cashbook'); setSearchTerm(''); }}
          className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${activeTab === 'cashbook' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Liquid Cashbook
        </button>
        <button
          onClick={() => { setActiveTab('expenses'); setSearchTerm(''); }}
          className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${activeTab === 'expenses' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-red-500'}`}
        >
          Expenses Register
        </button>
        <button
          onClick={() => { setActiveTab('incomes'); setSearchTerm(''); }}
          className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${activeTab === 'incomes' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-emerald-500'}`}
        >
          Other Income
        </button>
      </div>

      {/* Interactive Operational Balance Tiles */}
      {(activeTab === 'daybook' || activeTab === 'cashbook') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
              <ArrowDownLeft size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Inflow</p>
              <p className="text-2xl font-black text-gray-900 mt-1">₹{totalInflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl">
              <ArrowUpRight size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Outflow</p>
              <p className="text-2xl font-black text-gray-900 mt-1">₹{totalOutflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
              <ReceiptIndianRupee size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cash In Vault</p>
              <p className="text-2xl font-black text-gray-900 mt-1">₹{cashBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Landmark size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Bank Balance</p>
              <p className="text-2xl font-black text-gray-900 mt-1">₹{bankBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      )}

      {/* 2.5 TODAY'S GROSS PROFIT BAR */}
      {activeTab === 'daybook' && todayProfit !== null && (todayProfit !== 0 || todaySalesCount > 0) && (
        <div className="bg-white border border-gray-100 p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <TrendingUp size={18} />
            </div>
            <div>
              <p className="text-sm font-black text-gray-900">Today's Gross Profit</p>
              <p className="text-xs text-gray-400 font-bold">Based on cost price of items sold today</p>
            </div>
          </div>
          <div className="text-right">
            <span className={`text-xl font-black font-mono ${todayProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {todayProfit >= 0 ? '+' : ''}₹{todayProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 bg-red-50 text-red-600 rounded-2xl">
              <TrendingDown size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Expenses logged</p>
              <p className="text-2xl font-black text-gray-900 mt-1">₹{expenses.reduce((sum, e) => sum + Number(e.amount), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 bg-gray-50 text-gray-600 rounded-2xl">
              <Tag size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Expense Categories</p>
              <p className="text-2xl font-black text-gray-900 mt-1">{expenseCategories.length} Active</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 bg-orange-50 text-orange-600 rounded-2xl">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Transaction Count</p>
              <p className="text-2xl font-black text-gray-900 mt-1">{expenses.length} Bills</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'incomes' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Other Income</p>
              <p className="text-2xl font-black text-gray-900 mt-1">₹{incomes.reduce((sum, i) => sum + Number(i.amount), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 bg-gray-50 text-gray-600 rounded-2xl">
              <Tag size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Income Categories</p>
              <p className="text-2xl font-black text-gray-900 mt-1">{incomeCategories.length} Categories</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Transactions logged</p>
              <p className="text-2xl font-black text-gray-900 mt-1">{incomes.length} Entries</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Table Register Grid */}
      <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">

        {/* Search & Filter Bar */}
        <div className="p-6 border-b border-gray-50 flex flex-wrap gap-4 items-center justify-between bg-gray-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder={`Search operations register...`}
              className="w-full pl-12 pr-4 py-3 border-gray-200 border rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-600 transition-all text-sm font-medium"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {activeTab === 'expenses' && (
            <div className="flex gap-2">
              <select
                className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-xs font-black text-gray-700 focus:outline-none"
                value={selectedExpenseCat}
                onChange={e => setSelectedExpenseCat(e.target.value)}
              >
                <option value="">All Categories</option>
                {expenseCategories.map(c => (
                  <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'incomes' && (
            <div className="flex gap-2">
              <select
                className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-xs font-black text-gray-700 focus:outline-none"
                value={selectedIncomeCat}
                onChange={e => setSelectedIncomeCat(e.target.value)}
              >
                <option value="">All Categories</option>
                {incomeCategories.map(c => (
                  <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-24 text-center">
            <RefreshCcw className="animate-spin text-blue-600 mx-auto" size={36} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            {(activeTab === 'daybook' || activeTab === 'cashbook') && (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                    <th className="px-8 py-5">Date</th>
                    <th className="px-8 py-5">Transaction Type</th>
                    <th className="px-8 py-5">Description</th>
                    <th className="px-8 py-5 text-right">Cash Movement</th>
                    <th className="px-8 py-5 text-right">Bank Movement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm font-bold text-gray-700">
                  {filteredDaybook.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center text-gray-400 font-medium">No transaction histories found matching criteria.</td>
                    </tr>
                  ) : (
                    filteredDaybook.map(e => {
                      const cIn = Number(e.cash_in) || 0;
                      const cOut = Number(e.cash_out) || 0;
                      const bIn = Number(e.bank_in) || 0;
                      const bOut = Number(e.bank_out) || 0;

                      return (
                        <tr key={e.id} className="hover:bg-blue-50/30 transition-all">
                          <td className="px-8 py-5 whitespace-nowrap text-gray-500 font-medium">
                            {new Date(e.entry_date).toLocaleDateString()}
                          </td>
                          <td className="px-8 py-5 whitespace-nowrap">
                            <span className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-xl ${e.entry_type === 'Sale' || e.entry_type === 'Payment In' || e.entry_type === 'Income'
                                ? 'bg-green-50 text-green-700 border border-green-100'
                                : 'bg-red-50 text-red-700 border border-red-100'
                              }`}>
                              {e.entry_type}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-gray-900 font-black">{e.description}</td>
                          <td className="px-8 py-5 whitespace-nowrap text-right font-mono">
                            {cIn > 0 && <span className="text-green-600">+₹{cIn.toFixed(2)}</span>}
                            {cOut > 0 && <span className="text-rose-600">-₹{cOut.toFixed(2)}</span>}
                            {cIn === 0 && cOut === 0 && <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-8 py-5 whitespace-nowrap text-right font-mono">
                            {bIn > 0 && <span className="text-green-600">+₹{bIn.toFixed(2)}</span>}
                            {bOut > 0 && <span className="text-rose-600">-₹{bOut.toFixed(2)}</span>}
                            {bIn === 0 && bOut === 0 && <span className="text-gray-300">-</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'expenses' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                    <th className="px-8 py-5">Date</th>
                    <th className="px-8 py-5">Category</th>
                    <th className="px-8 py-5">Description</th>
                    <th className="px-8 py-5 text-center">Payment Mode</th>
                    <th className="px-8 py-5 text-right">Amount</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm font-bold text-gray-700">
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-20 text-center text-gray-400 font-medium">No expenses logged yet. Click Record Expense to create one.</td>
                    </tr>
                  ) : (
                    filteredExpenses.map(e => (
                      <tr key={e.expense_id} className="hover:bg-red-50/20 transition-all">
                        <td className="px-8 py-5 whitespace-nowrap text-gray-500 font-medium">
                          {new Date(e.expense_date).toLocaleDateString()}
                        </td>
                        <td className="px-8 py-5 whitespace-nowrap">
                          <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-xl text-xs font-bold border border-gray-200">
                            {e.category_name || 'Uncategorized'}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-gray-900 font-black">
                          {e.description || <span className="italic text-gray-300 font-bold">No description</span>}
                          {e.reference_no && <span className="block font-mono text-[10px] text-gray-400 tracking-wider">Ref: {e.reference_no}</span>}
                        </td>
                        <td className="px-8 py-5 whitespace-nowrap text-center text-xs font-mono font-black text-slate-500">{e.payment_mode}</td>
                        <td className="px-8 py-5 whitespace-nowrap text-right font-mono font-black text-rose-600 text-base">₹{Number(e.amount).toFixed(2)}</td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleOpenExpenseModal(e)}
                              className="text-blue-500 hover:bg-blue-50 p-2 rounded-xl border border-transparent hover:border-blue-100"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteExpenseClick(e.expense_id!)}
                              className="text-gray-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-xl transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'incomes' && (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                    <th className="px-8 py-5">Date</th>
                    <th className="px-8 py-5">Category</th>
                    <th className="px-8 py-5">Description</th>
                    <th className="px-8 py-5 text-center">Payment Mode</th>
                    <th className="px-8 py-5 text-right">Amount</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm font-bold text-gray-700">
                  {filteredIncomes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-20 text-center text-gray-400 font-medium">No income operations logged yet. Click Record Income to create one.</td>
                    </tr>
                  ) : (
                    filteredIncomes.map(i => (
                      <tr key={i.income_id} className="hover:bg-emerald-50/20 transition-all">
                        <td className="px-8 py-5 whitespace-nowrap text-gray-500 font-medium">
                          {new Date(i.income_date).toLocaleDateString()}
                        </td>
                        <td className="px-8 py-5 whitespace-nowrap">
                          <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-xl text-xs font-bold border border-gray-200">
                            {i.category_name || 'Uncategorized'}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-gray-900 font-black">
                          {i.description || <span className="italic text-gray-300 font-bold">No description</span>}
                          {i.reference_no && <span className="block font-mono text-[10px] text-gray-400 tracking-wider">Ref: {i.reference_no}</span>}
                        </td>
                        <td className="px-8 py-5 whitespace-nowrap text-center text-xs font-mono font-black text-slate-500">{i.payment_mode}</td>
                        <td className="px-8 py-5 whitespace-nowrap text-right font-mono font-black text-emerald-600 text-base">₹{Number(i.amount).toFixed(2)}</td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleOpenIncomeModal(i)}
                              className="text-blue-500 hover:bg-blue-50 p-2 rounded-xl border border-transparent hover:border-blue-100"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteIncomeClick(i.income_id!)}
                              className="text-gray-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-xl transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* --- RECORD EXPENSE MODAL --- */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl max-w-lg w-full overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <TrendingDown className="text-red-600" size={22} /> {editingExpense ? 'Modify Expense Record' : 'Record New Expense'}
              </h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveExpenseSubmit} className="p-6 space-y-5 max-h-[500px] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Expense Date*</label>
                  <input
                    type="date"
                    required
                    className="w-full border-gray-200 rounded-xl p-4 border text-sm font-bold focus:outline-none"
                    value={txDate}
                    onChange={e => setTxDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Category</label>
                  <select
                    className="w-full border-gray-200 rounded-xl p-4 border text-sm font-bold bg-white focus:outline-none"
                    value={txCategoryId}
                    onChange={e => setTxCategoryId(e.target.value)}
                  >
                    <option value="">Uncategorized</option>
                    {expenseCategories.filter(c => c.is_active).map(c => (
                      <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Amount (₹)*</label>
                <input
                  type="text" inputMode="decimal"
                  step="0.01"
                  required
                  placeholder="0.00"
                  className="w-full border-gray-200 rounded-xl p-4 border font-black text-lg focus:outline-none"
                  value={txAmount}
                  onChange={e => setTxAmount(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Description / Title*</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Office Rent, Electric Bill"
                  className="w-full border-gray-200 rounded-xl p-4 border font-bold text-sm focus:outline-none"
                  value={txDescription}
                  onChange={e => setTxDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Payment Mode</label>
                  <select
                    className="w-full border-gray-200 rounded-xl p-4 border text-sm font-bold bg-white focus:outline-none"
                    value={txPaymentMode}
                    onChange={e => setTxPaymentMode(e.target.value as any)}
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Reference No</label>
                  <input
                    type="text"
                    placeholder="e.g. TXN9201"
                    className="w-full border-gray-200 rounded-xl p-4 border font-mono text-sm focus:outline-none"
                    value={txReferenceNo}
                    onChange={e => setTxReferenceNo(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Audit Notes</label>
                <textarea
                  rows={2}
                  placeholder="Internal audit notes (optional)"
                  className="w-full border-gray-200 rounded-xl p-4 border text-sm focus:outline-none"
                  value={txNotes}
                  onChange={e => setTxNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-3 justify-end pt-2 sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 text-sm font-bold hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingExpense}
                  className="px-6 py-2.5 bg-red-600 text-white rounded-xl text-sm font-black hover:bg-red-700 flex items-center gap-1.5"
                >
                  {submittingExpense && <RefreshCcw className="animate-spin" size={14} />}
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- RECORD INCOME MODAL --- */}
      {showIncomeModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl max-w-lg w-full overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <TrendingUp className="text-emerald-600" size={22} /> {editingIncome ? 'Modify Income Record' : 'Record New Income'}
              </h3>
              <button onClick={() => setShowIncomeModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveIncomeSubmit} className="p-6 space-y-5 max-h-[500px] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Income Date*</label>
                  <input
                    type="date"
                    required
                    className="w-full border-gray-200 rounded-xl p-4 border text-sm font-bold focus:outline-none"
                    value={txDate}
                    onChange={e => setTxDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Category</label>
                  <select
                    className="w-full border-gray-200 rounded-xl p-4 border text-sm font-bold bg-white focus:outline-none"
                    value={txCategoryId}
                    onChange={e => setTxCategoryId(e.target.value)}
                  >
                    <option value="">Uncategorized</option>
                    {incomeCategories.filter(c => c.is_active).map(c => (
                      <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Amount (₹)*</label>
                <input
                  type="text" inputMode="decimal"
                  step="0.01"
                  required
                  placeholder="0.00"
                  className="w-full border-gray-200 rounded-xl p-4 border font-black text-lg focus:outline-none"
                  value={txAmount}
                  onChange={e => setTxAmount(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Description / Title*</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bank Interest, Asset Rental Commission"
                  className="w-full border-gray-200 rounded-xl p-4 border font-bold text-sm focus:outline-none"
                  value={txDescription}
                  onChange={e => setTxDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Payment Mode</label>
                  <select
                    className="w-full border-gray-200 rounded-xl p-4 border text-sm font-bold bg-white focus:outline-none"
                    value={txPaymentMode}
                    onChange={e => setTxPaymentMode(e.target.value as any)}
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Reference No</label>
                  <input
                    type="text"
                    placeholder="e.g. UPI8830"
                    className="w-full border-gray-200 rounded-xl p-4 border font-mono text-sm focus:outline-none"
                    value={txReferenceNo}
                    onChange={e => setTxReferenceNo(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Audit Notes</label>
                <textarea
                  rows={2}
                  placeholder="Internal audit notes (optional)"
                  className="w-full border-gray-200 rounded-xl p-4 border text-sm focus:outline-none"
                  value={txNotes}
                  onChange={e => setTxNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-3 justify-end pt-2 sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={() => setShowIncomeModal(false)}
                  className="px-5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 text-sm font-bold hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingIncome}
                  className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-black hover:bg-emerald-700 flex items-center gap-1.5"
                >
                  {submittingIncome && <RefreshCcw className="animate-spin" size={14} />}
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MANAGE EXPENSE CATEGORIES MODAL --- */}
      {showExpenseCatModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl max-w-2xl w-full overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[600px]">
            <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-black text-gray-900">Manage Expense Categories</h3>
              <button onClick={() => setShowExpenseCatModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">

              {/* Form Left */}
              <form onSubmit={handleCreateExpenseCategory} className="space-y-4">
                <h4 className="font-black text-sm text-gray-900">Add New Category</h4>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Category Name*</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rent, Office Supplies"
                    className="w-full border-gray-200 rounded-xl p-4 border font-bold text-sm focus:outline-none"
                    value={newExpenseCatName}
                    onChange={e => setNewExpenseCatName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Description</label>
                  <textarea
                    rows={3}
                    placeholder="Optional description"
                    className="w-full border-gray-200 rounded-xl p-4 border text-sm focus:outline-none"
                    value={newExpenseCatDesc}
                    onChange={e => setNewExpenseCatDesc(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-slate-900 text-white rounded-xl text-sm font-black hover:bg-black transition-all"
                >
                  Create Category
                </button>
              </form>

              {/* List Right */}
              <div className="space-y-4 flex flex-col">
                <h4 className="font-black text-sm text-gray-900">Category Registry</h4>
                <div className="border border-gray-100 rounded-2xl overflow-y-auto max-h-[300px] flex-1 divide-y divide-gray-50">
                  {expenseCategories.length === 0 ? (
                    <p className="p-6 text-center text-xs text-gray-400 font-bold">No custom categories registered.</p>
                  ) : (
                    expenseCategories.map(cat => (
                      <div key={cat.category_id} className="p-4 flex items-center justify-between hover:bg-gray-50/50">
                        <div>
                          <p className="font-bold text-sm text-gray-900">{cat.category_name}</p>
                          {cat.description && <p className="text-[10px] text-gray-400 font-medium">{cat.description}</p>}
                        </div>
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={() => handleToggleExpenseCatActive(cat.category_id!)}
                            className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${cat.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}
                          >
                            {cat.is_active ? 'Active' : 'Inactive'}
                          </button>
                          <button
                            onClick={() => handleDeleteExpenseCat(cat.category_id!)}
                            className="text-gray-300 hover:text-red-500 p-1 rounded hover:bg-gray-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MANAGE INCOME CATEGORIES MODAL --- */}
      {showIncomeCatModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl max-w-2xl w-full overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[600px]">
            <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-black text-gray-900">Manage Income Categories</h3>
              <button onClick={() => setShowIncomeCatModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">

              {/* Form Left */}
              <form onSubmit={handleCreateIncomeCategory} className="space-y-4">
                <h4 className="font-black text-sm text-gray-900">Add New Category</h4>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Category Name*</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rent Earned, Dividends"
                    className="w-full border-gray-200 rounded-xl p-4 border font-bold text-sm focus:outline-none"
                    value={newIncomeCatName}
                    onChange={e => setNewIncomeCatName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Description</label>
                  <textarea
                    rows={3}
                    placeholder="Optional description"
                    className="w-full border-gray-200 rounded-xl p-4 border text-sm focus:outline-none"
                    value={newIncomeCatDesc}
                    onChange={e => setNewIncomeCatDesc(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-slate-900 text-white rounded-xl text-sm font-black hover:bg-black transition-all"
                >
                  Create Category
                </button>
              </form>

              {/* List Right */}
              <div className="space-y-4 flex flex-col">
                <h4 className="font-black text-sm text-gray-900">Category Registry</h4>
                <div className="border border-gray-100 rounded-2xl overflow-y-auto max-h-[300px] flex-1 divide-y divide-gray-50">
                  {incomeCategories.length === 0 ? (
                    <p className="p-6 text-center text-xs text-gray-400 font-bold">No custom categories registered.</p>
                  ) : (
                    incomeCategories.map(cat => (
                      <div key={cat.category_id} className="p-4 flex items-center justify-between hover:bg-gray-50/50">
                        <div>
                          <p className="font-bold text-sm text-gray-900">{cat.category_name}</p>
                          {cat.description && <p className="text-[10px] text-gray-400 font-medium">{cat.description}</p>}
                        </div>
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={() => handleToggleIncomeCatActive(cat.category_id!)}
                            className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${cat.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}
                          >
                            {cat.is_active ? 'Active' : 'Inactive'}
                          </button>
                          <button
                            onClick={() => handleDeleteIncomeCat(cat.category_id!)}
                            className="text-gray-300 hover:text-red-500 p-1 rounded hover:bg-gray-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
