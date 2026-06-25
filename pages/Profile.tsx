
import React, { useState, useEffect, useRef } from 'react';
import { User, Role, AppSettings } from '../types';
import { User as UserIcon, Mail, Phone, Save, CheckCircle, AlertCircle, MapPin, RefreshCcw, Camera, Shield, Briefcase, Globe, Lock, Eye, EyeOff, Database, MessageSquare, Send, Key, Terminal } from 'lucide-react';
import { saveUserProfile, changePassword, fetchDatabaseInfo, executeDatabaseQuery, fetchBusinessSettings, saveBusinessSettings } from '../services/dataService';

interface ProfileProps {
  user: User;
  settings: AppSettings;
  onUpdate: (updatedUser: User) => void;
}

export const Profile: React.FC<ProfileProps> = ({ user, settings, onUpdate }) => {
  const [formData, setFormData] = useState<any>({
    ...user,
    phone: user.phone || '',
    address: user.address || '',
    avatarUrl: user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=2563eb&color=fff`
  });

  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Change Password State
  const [pwData, setPwData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwStatus, setPwStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // Chatbot & Database Metadata States
  const [dbCounts, setDbCounts] = useState<any>({
    products: 0,
    purchases: 0,
    sales: 0,
    customers: 0,
    suppliers: 0,
    expenses: 0,
    incomes: 0,
    day_book: 0
  });

  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('openrouter_api_key') || '';
  });

  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant' | 'system', content: string }>>([
    { role: 'assistant', content: "Hello! I am your SimpleBill Database Assistant. I can help explain the database schema, query tables, check fields and relationships, or review statistics. Ask me anything!" }
  ]);
  const [inputMsg, setInputMsg] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [showApiKey, setShowApiKey] = useState(false);
  const [chatError, setChatError] = useState('');
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('openrouter_model') || 'openrouter/free';
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const getStats = async () => {
      try {
        const res = await fetchDatabaseInfo();
        if (res?.success && res?.data) {
          setDbCounts(res.data);
        }
      } catch (err) {
        console.error('Failed to load db-info stats', err);
      }
    };
    getStats();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setTestStatus('failed');
      setChatError('API key is empty');
      return;
    }
    setTestStatus('testing');
    setChatError('');
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'SimpleBill Connection Test'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: 'user', content: 'test connection' }],
          max_tokens: 5
        })
      });
      if (res.ok) {
        setTestStatus('success');
        localStorage.setItem('openrouter_api_key', apiKey.trim());
      } else {
        setTestStatus('failed');
        let errMsg = `Status ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody?.error?.message) {
            errMsg = errBody.error.message;
          }
        } catch (_) { }
        setChatError(`Connection failed: ${errMsg}`);
      }
    } catch (e: any) {
      setTestStatus('failed');
      setChatError(`Network/CORS error: ${e.message || 'Unknown error'}`);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || chatLoading) return;

    const userMessage = inputMsg.trim();
    setInputMsg('');
    setChatError('');

    // Resolve the REAL business ID for this session — never hardcode 1
    let activeBizId = localStorage.getItem('business_id') || '1';
    try {
      const stored = localStorage.getItem('simplebill_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.businessId || parsed?.companyId) {
          activeBizId = String(parsed.businessId || parsed.companyId);
        }
      }
    } catch (_) {}

    const updatedMessages = [...messages, { role: 'user' as const, content: userMessage }];
    setMessages(updatedMessages);
    setChatLoading(true);

    const systemPrompt = `
You are the SimpleBill database schema expert chatbot. You are running on the user's Profile page.
Your job is ONLY to answer database design, table structures, relationships, queries, and statistic questions about their Jewelry/GST SaaS.
You are strictly READ-ONLY. You cannot perform modifications, inserts, updates, or deletes.

HOWEVER, you have access to a secure, read-only SQL query execution tool!
If the user asks for live totals, calculations, summaries, lists, or queries from their live tables (e.g. "total sales", "highest selling product", "recent customers", etc.), you MUST output an SQL command in the exact format:
[RUN_QUERY: <SELECT SQL QUERY>]
The frontend will catch this pattern, run the query securely against their database, and return the data to you in a follow-up background system message so you can answer the user with the actual numbers.

Rules for your SQL queries:
1. Only SELECT queries are allowed. Never use INSERT, UPDATE, DELETE, or any modification statements.
2. CRITICAL: Always filter by business_id = ${activeBizId}. This is the user's actual tenant ID. Never use any other business_id.
3. Keep the SQL clean, single-line, and standard MySQL.
4. Output EXACTLY: [RUN_QUERY: SELECT ...] and nothing else in that turn if you need a query result. Do not output anything else before or after this marker, so the frontend can intercept it cleanly.
5. Always add LIMIT 50 to any query that could return many rows.
6. CRITICAL: When you receive a system message starting with [QUERY_RESULT: ...], you must read the JSON data and answer the user in natural language. DO NOT output [RUN_QUERY: ...] again for the same question.
7. Always format monetary values in Indian Rupees (₹). Do not use Dollars ($).


Here is the exact DDL schema of the application (retail_billbook_schema_v3):

1. app_users: (user_id, name, email, password_hash, role ENUM('SuperAdmin','Admin','Owner','Manager','Staff'), is_active, created_at)
2. businesses: (business_id, user_id, business_name, business_type, owner_name, gst_number, gst_type, address, city, state, pincode, phone, email, invoice_prefix, is_active, created_at)
3. business_users: (business_id, user_id, role, is_active)
4. customers: (customer_id, business_id, customer_name, company_name, gst_number, customer_type ENUM('Retail Customer','Wholesale Customer'), phone, alternate_phone, email, address, city, state, pincode, opening_balance, opening_balance_type ENUM('Payable','Receivable'), credit_limit, is_active)
5. suppliers: (supplier_id, business_id, supplier_name, company_name, gst_number, phone, alternate_phone, email, address, city, state, pincode, opening_balance, opening_balance_type ENUM('Payable','Receivable'), is_active)
6. categories: (category_id, business_id, category_name, description, is_active)
7. units: (unit_id, business_id, unit_name, short_name)
8. products: (product_id, business_id, category_id, unit_id, product_name, product_code, barcode, item_description, purchase_price, profit_percentage, selling_price, current_stock, minimum_stock_alert, cgst_percentage, sgst_percentage, igst_percentage, hsn_code, allow_negative_stock, is_active)
9. purchases: (purchase_id, business_id, supplier_id, purchase_invoice_no, supplier_invoice_no, purchase_date, payment_mode ENUM('Cash','UPI','Card','Bank Transfer','Cheque','Credit'), transport_cost, transport_paid_by, transport_vehicle_no, transport_notes, loading_cost, other_charges, subtotal, total_cgst, total_sgst, total_igst, grand_total, amount_paid, payment_status ENUM('Paid','Partial','Unpaid'), notes)
10. purchase_items: (purchase_item_id, purchase_id, product_id, quantity, free_quantity, purchase_price, selling_price, profit_percentage, discount_percentage, discount_amount, cgst_percentage, sgst_percentage, igst_percentage, total_tax, total_amount)
11. purchase_returns: (return_id, business_id, supplier_id, purchase_id, return_invoice_no, return_date, payment_mode, subtotal, total_cgst, total_sgst, total_igst, grand_total, refund_amount, refund_status ENUM('Refunded','Pending','Adjusted'), payment_in_id, adjusted_in_purchase_id, notes)
12. purchase_return_items: (return_item_id, return_id, product_id, quantity, purchase_price, cgst_percentage, sgst_percentage, igst_percentage, total_tax, total_amount)
13. sales: (sale_id, business_id, customer_id, invoice_no, invoice_date, sale_type ENUM('Normal Sale','Quick Cash Sale'), payment_mode ENUM('Cash','UPI','Card','Bank Transfer','Cheque','Credit'), subtotal, total_cgst, total_sgst, total_igst, discount_amount, transport_cost, delivery_charge, delivery_paid_by, delivery_vehicle_no, delivery_notes, round_off, grand_total, amount_received, payment_status ENUM('Paid','Partial','Unpaid'), notes)
14. sale_items: (sale_item_id, sale_id, product_id, item_name, quantity, free_quantity, selling_price, purchase_price, cgst_percentage, sgst_percentage, igst_percentage, discount_percentage, discount_amount, total_tax, total_amount)
15. sales_returns: (return_id, business_id, customer_id, sale_id, return_invoice_no, return_date, payment_mode, subtotal, total_cgst, total_sgst, total_igst, grand_total, refund_amount, refund_status ENUM('Refunded','Pending','Adjusted'), payment_out_id, adjusted_in_sale_id, notes)
16. sales_return_items: (return_item_id, return_id, product_id, item_name, quantity, selling_price, purchase_price, cgst_percentage, sgst_percentage, igst_percentage, discount_percentage, total_tax, total_amount)
17. payment_in: (payment_in_id, business_id, customer_id, supplier_id, sale_id, payment_date, payment_mode, amount, reference_no, notes)
18. payment_out: (payment_out_id, business_id, supplier_id, customer_id, purchase_id, payment_date, payment_mode, amount, reference_no, notes)
19. day_book: (day_book_id, business_id, entry_date, entry_type ENUM('Sale','Purchase','Payment In','Payment Out','Sales Return','Purchase Return','Expense','Income'), reference_id, reference_type, cash_in, cash_out, bank_in, bank_out, payment_mode, description)
20. expenses: (expense_id, business_id, category_id, expense_date, description, amount, payment_mode, reference_no, notes)
21. incomes: (income_id, business_id, category_id, income_date, description, amount, payment_mode, reference_no, notes)
22. stock_movements: (movement_id, business_id, product_id, movement_type ENUM('Purchase In','Sale Out','Purchase Return Out','Sale Return In','Manual Adjustment'), reference_id, reference_type, quantity, stock_before, stock_after, notes)

Active Business ID of the user is: ${activeBizId} (Tenant DB Isolated)
Active counts in their database (fetched live):
- Total Products: ${dbCounts.products}
- Total Purchases: ${dbCounts.purchases}
- Total Sales: ${dbCounts.sales}
- Total Customers: ${dbCounts.customers}
- Total Suppliers: ${dbCounts.suppliers}
- Total Expenses: ${dbCounts.expenses}
- Total Incomes: ${dbCounts.incomes}
- Day Book Entries: ${dbCounts.day_book}

Reply concisely. Use bullet points and clean Markdown where applicable. Do not try to perform any edits or modify the schema. Simply offer information retrieval.
`;

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'SimpleBill AI Database Assistant'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            ...updatedMessages.map(m => ({ role: m.role, content: m.content }))
          ]
        })
      });

      if (!res.ok) {
        let errMsg = `OpenRouter API responded with status ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody?.error?.message) {
            errMsg = `${errMsg}: ${errBody.error.message}`;
          }
        } catch (_) { }
        throw new Error(errMsg);
      }

      const responseData = await res.json();
      const reply = responseData?.choices?.[0]?.message?.content || 'No response returned from the model.';

      const queryMatch = reply.match(/\[(?:RUN|RAN|EXECUTE)_?QUERY:\s*([\s\S]+?)\]/i);
      if (queryMatch && queryMatch[1]) {
        const match = queryMatch;
        if (match && match[1]) {
          let sqlQuery = match[1].trim();

          // Clean the SQL string of markdown code blocks or wrapper backticks/quotes
          sqlQuery = sqlQuery.replace(/```sql/gi, '');
          sqlQuery = sqlQuery.replace(/```/g, '');
          sqlQuery = sqlQuery.replace(/`/g, '');
          sqlQuery = sqlQuery.trim();
          if ((sqlQuery.startsWith("'") && sqlQuery.endsWith("'")) || (sqlQuery.startsWith('"') && sqlQuery.endsWith('"'))) {
            sqlQuery = sqlQuery.slice(1, -1).trim();
          }
          if (sqlQuery.endsWith(';')) {
            sqlQuery = sqlQuery.slice(0, -1).trim();
          }

          // CRITICAL TENANT FIX: Replace ANY hardcoded business_id the AI generated
          // with the actual logged-in user's business ID. Free LLM models often ignore
          // dynamic system prompt instructions and hardcode business_id = 1.
          sqlQuery = sqlQuery.replace(/business_id\s*=\s*\d+/gi, `business_id = ${activeBizId}`);

          try {
            // Execute query via direct fetch to get the full {success, data, error} envelope.
            // executeDatabaseQuery() uses v3Request which unwraps res.data — we need the full body.
            let chatBizId = localStorage.getItem('business_id') || '1';
            try {
              const stored = localStorage.getItem('simplebill_user');
              if (stored) {
                const parsed = JSON.parse(stored);
                chatBizId = String(parsed?.businessId || parsed?.companyId || chatBizId);
              }
            } catch (_) {}

            const settings = (() => { try { return JSON.parse(localStorage.getItem('simplebill_settings_1') || '{}'); } catch { return {}; } })();
            const apiBase = (settings?.mysqlConfig?.apiUrl || 'http://localhost:3000/api').replace(/\/api$/, '');
            const queryUrl = `${apiBase}/api/v1/b/${chatBizId}/settings/query`;
            const token = localStorage.getItem('access_token');

            const queryFetch = await fetch(queryUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ sql: sqlQuery }),
            });

            const queryRes = await queryFetch.json();

            if (queryRes.success) {
              const queryData = JSON.stringify(queryRes.data);

              const followUpMessages = [
                ...updatedMessages,
                { role: 'assistant' as const, content: reply },
                { role: 'system' as const, content: `[QUERY_RESULT: ${queryData}]` }
              ];

              const res2 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey.trim()}`,
                  'HTTP-Referer': 'http://localhost:5173',
                  'X-Title': 'SimpleBill AI Database Assistant'
                },
                body: JSON.stringify({
                  model: selectedModel,
                  messages: [
                    { role: 'system', content: systemPrompt },
                    ...followUpMessages.map(m => ({ role: m.role, content: m.content }))
                  ]
                })
              });

              if (!res2.ok) {
                let errMsg = `OpenRouter API responded with status ${res2.status}`;
                try {
                  const errBody = await res2.json();
                  if (errBody?.error?.message) {
                    errMsg = `${errMsg}: ${errBody.error.message}`;
                  }
                } catch (_) { }
                throw new Error(errMsg);
              }

              const responseData2 = await res2.json();
              const finalReply = responseData2?.choices?.[0]?.message?.content || 'No response returned from the model.';

              setMessages([
                ...updatedMessages,
                { role: 'assistant', content: finalReply }
              ]);
            } else {
              const errDetail = queryRes.error || queryRes.message || 'Unknown database error';
              setMessages([
                ...updatedMessages,
                { role: 'assistant', content: `❌ *Query failed:* ${errDetail}\n\`\`\`sql\n${sqlQuery}\n\`\`\`` }
              ]);
            }
          } catch (queryErr: any) {
            setMessages([
              ...updatedMessages,
              { role: 'assistant', content: `❌ *Query error:* ${queryErr.message || 'Network error — check backend is running'}` }
            ]);
          }
          return;
        }
      }

      setMessages([...updatedMessages, { role: 'assistant', content: reply }]);
      localStorage.setItem('openrouter_api_key', apiKey.trim());
      localStorage.setItem('openrouter_model', selectedModel);
    } catch (err: any) {
      console.error(err);
      setChatError(err.message || 'Failed to fetch AI response.');
      setMessages([...updatedMessages, { role: 'assistant', content: `Sorry, I encountered an error: ${err.message || 'Unknown network error'}. Please check your OpenRouter API key and internet connection.` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.name.trim()) newErrors.name = 'Full name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email format';
    }

    // India Phone Validation
    if (settings.countryCode === 'IN' && formData.phone) {
      const numericPhone = formData.phone.replace(/\D/g, '');
      if (numericPhone.length !== 10) {
        newErrors.phone = 'India phone number must be exactly 10 digits';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    const updated = { ...formData, companyId: user.companyId } as User;

    try {
      await saveUserProfile(updated);

      // Synchronize profile details into Business settings
      try {
        const bizData = await fetchBusinessSettings();
        if (bizData) {
          const updatedBiz = {
            ...bizData,
            owner_name: updated.name,
            phone: updated.phone || bizData.phone,
            address: updated.address || bizData.address
          };
          await saveBusinessSettings(updatedBiz);
        }
      } catch (bizErr) {
        console.warn("Failed to automatically sync Profile details to Business settings:", bizErr);
      }

      onUpdate(updated);
      setStatus({ type: 'success', message: 'Profile synced to cloud database!' });
      setTimeout(() => setStatus({ type: null, message: '' }), 4000);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Cloud sync failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-12 animate-in fade-in duration-200">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

        {/* Left Side: Original Profile Content */}
        <div className="lg:col-span-2 space-y-8">
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            <div className="relative">
              <img src={formData.avatarUrl} alt="Avatar" className="h-28 w-28 rounded-[32px] object-cover shadow-2xl shadow-blue-200 border-4 border-white" />
              <button className="absolute -bottom-2 -right-2 p-2.5 bg-slate-900 text-white rounded-xl shadow-lg hover:bg-black transition-all">
                <Camera size={18} />
              </button>
            </div>
            <div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tight">Identity & Profile</h2>
              <p className="text-gray-500 font-medium">Manage your personal presence and cloud identity.</p>
              <div className="mt-2 flex items-center justify-center sm:justify-start gap-2">
                <span className="px-3 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-full">{user.role}</span>
                <span className="px-3 py-0.5 bg-green-100 text-green-700 text-[10px] font-black uppercase tracking-widest rounded-full">Verified Account</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} className="bg-white p-8 md:p-10 rounded-[40px] shadow-sm border border-gray-100 space-y-8 animate-in fade-in slide-in-from-bottom-6">
            {status.type && (
              <div className={`p-5 rounded-3xl flex items-center gap-4 animate-in zoom-in ${status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                {status.type === 'success' ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
                <p className="font-bold text-sm">{status.message}</p>
              </div>
            )}

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Display Name</label>
                  <div className="relative">
                    <UserIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      className={`w-full pl-12 pr-4 py-4 rounded-2xl border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-bold text-gray-900 ${errors.name ? 'border-red-500' : 'border-gray-200'}`}
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Your full name"
                    />
                  </div>
                  {errors.name && <p className="text-xs text-red-500 mt-2 font-bold">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Email Identity (Primary)</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input
                      type="email"
                      className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed font-medium"
                      value={formData.email}
                      readOnly
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1"><Shield size={10} /> Email cannot be changed as it is your cloud ID.</p>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Mobile / Office Phone</label>
                  <div className="relative group">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={20} />
                    <input
                      type="text"
                      maxLength={10}
                      placeholder="Enter phone number"
                      className={`w-full pl-12 pr-4 py-4 rounded-2xl border focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-bold ${errors.phone ? 'border-red-500' : 'border-gray-200'}`}
                      value={formData.phone}
                      onChange={e => {
                        const cleaned = e.target.value.replace(/\D/g, '').substring(0, 10);
                        setFormData({ ...formData, phone: cleaned });
                      }}
                    />
                  </div>
                  {errors.phone && <p className="text-xs text-red-500 mt-2 font-bold">{errors.phone}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Company / Professional Address</label>
                  <div className="relative">
                    <MapPin size={18} className="absolute left-4 top-4 text-gray-400" />
                    <textarea
                      className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-medium text-sm"
                      rows={2}
                      value={formData.address}
                      onChange={e => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Street, Building, City, Country"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-xs text-gray-400 max-w-xs text-center sm:text-left">By clicking update, your details will be synchronized across all your devices using SimpleBill Cloud.</p>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto bg-slate-900 text-white px-10 py-4 rounded-2xl font-black hover:bg-black shadow-2xl shadow-blue-100 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  {loading ? <RefreshCcw size={20} className="animate-spin" /> : <Save size={20} />}
                  Sync Profile
                </button>
              </div>
            </div>
          </form>

          {/* Change Password Section */}
          <div className="bg-white p-8 md:p-10 rounded-[40px] shadow-sm border border-gray-100 space-y-6 animate-in fade-in slide-in-from-bottom-6">
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <Lock size={22} className="text-blue-600" /> Change Password
            </h3>

            {pwStatus.type && (
              <div className={`p-4 rounded-2xl flex items-center gap-3 animate-in zoom-in ${pwStatus.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                {pwStatus.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                <p className="font-bold text-sm">{pwStatus.message}</p>
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Current Password</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    className="w-full pl-12 pr-12 py-4 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-medium"
                    value={pwData.currentPassword}
                    onChange={e => setPwData({ ...pwData, currentPassword: e.target.value })}
                    placeholder="Enter your current password"
                  />
                  <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showCurrentPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">New Password</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      className="w-full pl-12 pr-12 py-4 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-medium"
                      value={pwData.newPassword}
                      onChange={e => setPwData({ ...pwData, newPassword: e.target.value })}
                      placeholder="Min 8 characters"
                    />
                    <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showNewPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Confirm New Password</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all font-medium"
                      value={pwData.confirmPassword}
                      onChange={e => setPwData({ ...pwData, confirmPassword: e.target.value })}
                      placeholder="Re-enter new password"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={pwLoading}
                  onClick={async () => {
                    setPwStatus({ type: null, message: '' });
                    if (!pwData.currentPassword) { setPwStatus({ type: 'error', message: 'Current password is required.' }); return; }
                    if (pwData.newPassword.length < 8) { setPwStatus({ type: 'error', message: 'New password must be at least 8 characters.' }); return; }
                    if (pwData.newPassword !== pwData.confirmPassword) { setPwStatus({ type: 'error', message: 'New passwords do not match.' }); return; }
                    if (pwData.currentPassword === pwData.newPassword) { setPwStatus({ type: 'error', message: 'New password cannot be the same as current password.' }); return; }
                    setPwLoading(true);
                    try {
                      await changePassword(user.email, pwData.currentPassword, pwData.newPassword);
                      setPwStatus({ type: 'success', message: 'Password changed successfully! Use the new password on your next login.' });
                      setPwData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    } catch (err: any) {
                      setPwStatus({ type: 'error', message: err.message || 'Failed to change password.' });
                    } finally {
                      setPwLoading(false);
                    }
                  }}
                  className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black hover:bg-black shadow-lg flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  {pwLoading ? <RefreshCcw size={18} className="animate-spin" /> : <Lock size={18} />}
                  Update Password
                </button>
              </div>
            </div>
          </div>

          <div className="bg-blue-50/50 p-8 rounded-[40px] border border-blue-100 flex flex-col md:flex-row gap-8 items-center">
            <div className="p-4 bg-white rounded-3xl shadow-lg shadow-blue-100/50">
              <Shield className="text-blue-600" size={40} />
            </div>
            <div>
              <h4 className="text-xl font-bold text-blue-900 mb-1">Secure Multi-Tenancy</h4>
              <p className="text-sm text-blue-700 leading-relaxed">
                SimpleBill ensures that your profile and business data are isolated using high-grade encryption. No other user can access your workspace or identity records.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Chatbot Sidebar Widget */}
        <div className="lg:col-span-1 bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[760px] animate-in fade-in slide-in-from-bottom-6">
          {/* Header */}
          <div className="p-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col justify-between border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-xl">
                <Database className="text-blue-400 animate-pulse" size={22} />
              </div>
              <div>
                <h3 className="text-base font-black tracking-tight">AI Schema Assistant</h3>
                <p className="text-[10px] text-blue-300 font-bold tracking-wide uppercase">Tenant Database Safe Model</p>
              </div>
            </div>

            {/* Live Mini Stats */}
            <div className="grid grid-cols-4 gap-1 mt-4 pt-3 border-t border-white/10 text-center">
              <div className="bg-white/5 p-1 rounded-lg">
                <span className="block text-[10px] font-black text-gray-400 font-mono">{dbCounts.products}</span>
                <span className="text-[8px] text-gray-400 font-bold uppercase tracking-widest block scale-90">Items</span>
              </div>
              <div className="bg-white/5 p-1 rounded-lg">
                <span className="block text-[10px] font-black text-gray-400 font-mono">{dbCounts.sales}</span>
                <span className="text-[8px] text-gray-400 font-bold uppercase tracking-widest block scale-90">Sales</span>
              </div>
              <div className="bg-white/5 p-1 rounded-lg">
                <span className="block text-[10px] font-black text-gray-400 font-mono">{dbCounts.purchases}</span>
                <span className="text-[8px] text-gray-400 font-bold uppercase tracking-widest block scale-90">Buys</span>
              </div>
              <div className="bg-white/5 p-1 rounded-lg">
                <span className="block text-[10px] font-black text-gray-400 font-mono">{dbCounts.customers}</span>
                <span className="text-[8px] text-gray-400 font-bold uppercase tracking-widest block scale-90">Parties</span>
              </div>
            </div>
          </div>

          {/* API Key Panel (Collapsible settings) */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-slate-900 transition-colors"
              >
                <Key size={14} className="text-blue-500" />
                {showApiKey ? 'Hide Key settings' : 'Manage OpenRouter Key'}
              </button>
              {testStatus === 'success' && (
                <span className="text-[9px] font-black text-green-700 bg-green-50 px-2 py-0.5 rounded-full uppercase tracking-wider">Connected</span>
              )}
              {testStatus === 'failed' && (
                <span className="text-[9px] font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full uppercase tracking-wider">Failed</span>
              )}
            </div>

            {showApiKey && (
              <div className="mt-3 space-y-2.5 animate-in slide-in-from-top-3 duration-200">
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste sk-or-v1-... key here"
                    className="w-full text-xs pr-10 pl-3 py-2 border border-gray-200 focus:outline-none focus:border-blue-500 rounded-xl font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showCurrentPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {/* Model Selector Dropdown */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Selected AI Model</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-gray-200 focus:outline-none focus:border-blue-500 rounded-xl font-bold bg-white text-gray-800"
                  >
                    <option value="openrouter/free">Auto-Select Free Model (FREE)</option>
                    <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B (FREE)</option>
                    <option value="meta-llama/llama-3.2-3b-instruct:free">Llama 3.2 3B (FREE)</option>
                    <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                  </select>
                </div>
                {chatError && (
                  <p className="text-[10px] text-rose-600 font-bold leading-normal bg-rose-50 p-2 rounded-lg border border-rose-100">{chatError}</p>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testStatus === 'testing'}
                    className="px-4 py-1.5 bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-black transition-colors disabled:opacity-50"
                  >
                    {testStatus === 'testing' ? 'Testing...' : 'Test & Save'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/50">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
              >
                <div
                  className={`max-w-[85%] px-4 py-3 rounded-2xl text-xs leading-relaxed ${m.role === 'user'
                      ? 'bg-blue-600 text-white font-medium rounded-tr-none shadow-md shadow-blue-500/10'
                      : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none shadow-sm'
                    }`}
                >
                  {m.role !== 'user' && (
                    <div className="flex items-center gap-1 mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <Terminal size={10} className="text-blue-500" /> Schema Engine
                    </div>
                  )}
                  <p className="whitespace-pre-line select-text font-medium">{m.content}</p>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start animate-pulse">
                <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-none border border-gray-100 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce delay-75"></span>
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce delay-150"></span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Bar */}
          <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                disabled={chatLoading}
                placeholder="Ask about schemas or DB structure..."
                className="flex-1 text-xs border border-gray-200 focus:outline-none focus:border-blue-500 rounded-xl px-3.5 py-3 font-medium placeholder-gray-400"
              />
              <button
                type="submit"
                disabled={!inputMsg.trim() || chatLoading}
                className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-md shadow-blue-500/10 flex items-center justify-center"
              >
                <Send size={16} />
              </button>
            </div>
            <div className="mt-2.5 flex items-center justify-center gap-1 text-[9px] font-bold text-gray-400 uppercase tracking-widest text-center select-none">
              <span>Read-only • Cannot edit or modify data</span>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
};
