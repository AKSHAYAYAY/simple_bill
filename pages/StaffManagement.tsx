import React, { useState, useEffect } from 'react';
import { fetchBusinessUsers, inviteBusinessUser, updateBusinessUserRole, toggleBusinessUserActive, deleteBusinessUser, getSettings } from '../services/dataService';
import { BusinessUser } from '../types';
import { UserPlus, Shield, Trash2, UserX, UserCheck, RefreshCw, Mail, Phone, ShieldAlert, Search, X, Users, AlertCircle, CheckCircle } from 'lucide-react';

export const StaffManagement: React.FC = () => {
    const [users, setUsers] = useState<BusinessUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [invitePhone, setInvitePhone] = useState('');
    const [inviteRole, setInviteRole] = useState<'Owner' | 'Admin' | 'Manager' | 'Accountant' | 'Staff'>('Staff');
    const [submittingInvite, setSubmittingInvite] = useState(false);
    const settings = getSettings();
    const maxUsers = settings.license?.maxUsers || (settings.license?.plan === 'ENTERPRISE' ? 10 : settings.license?.plan === 'PRO' ? 3 : 1);
    const currentCount = users.length;
    const isSeatLimitReached = currentCount >= maxUsers;
    const seatsPercent = Math.min(100, Math.round((currentCount / maxUsers) * 100));

    const loadUsers = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await fetchBusinessUsers();
            setUsers(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load business staff.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleInviteSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setSubmittingInvite(true);

        try {
            if (!inviteEmail && !invitePhone) {
                throw new Error('Please enter either an email address or mobile number.');
            }

            await inviteBusinessUser({
                email: inviteEmail ? inviteEmail.trim() : undefined,
                phone: invitePhone ? invitePhone.trim() : undefined,
                role: inviteRole
            });

            setSuccess('Staff member invited successfully!');
            setIsModalOpen(false);
            setInviteEmail('');
            setInvitePhone('');
            setInviteRole('Staff');
            loadUsers();
        } catch (err: any) {
            setError(err.message || 'Failed to send invitation.');
        } finally {
            setSubmittingInvite(false);
        }
    };

    const handleRoleChange = async (userId: number, role: 'Owner' | 'Admin' | 'Manager' | 'Accountant' | 'Staff') => {
        setError('');
        setSuccess('');
        try {
            await updateBusinessUserRole(userId, role);
            setSuccess('User permission level updated.');
            loadUsers();
        } catch (err: any) {
            setError(err.message || 'Failed to change staff role.');
        }
    };

    const handleToggleActive = async (userId: number) => {
        setError('');
        setSuccess('');
        try {
            const res = await toggleBusinessUserActive(userId);
            setSuccess(`User has been ${res.is_active ? 'activated' : 'suspended'}.`);
            loadUsers();
        } catch (err: any) {
            setError(err.message || 'Failed to toggle active status.');
        }
    };

    const handleDelete = async (userId: number, name: string) => {
        if (!confirm(`Are you sure you want to remove ${name} from the business?`)) return;
        setError('');
        setSuccess('');
        try {
            await deleteBusinessUser(userId);
            setSuccess('Staff member removed successfully.');
            loadUsers();
        } catch (err: any) {
            setError(err.message || 'Failed to remove user.');
        }
    };

    const filteredUsers = users.filter(u => {
        const term = searchTerm.toLowerCase();
        return (
            (u.full_name || '').toLowerCase().includes(term) ||
            (u.email || '').toLowerCase().includes(term) ||
            (u.phone || '').toLowerCase().includes(term)
        );
    });

    const getRoleColor = (role: string) => {
        switch (role) {
            case 'Owner': return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'Admin': return 'bg-red-100 text-red-800 border-red-200';
            case 'Manager': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'Accountant': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            default: return 'bg-slate-100 text-slate-800 border-slate-200';
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in">
            {/* Header section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
                        <Users className="text-blue-600" size={32} />
                        Staff & User Management
                    </h1>
                    <p className="text-sm text-slate-500 font-medium mt-1">
                        Control access, assign permission levels, and invite staff members to your workspace.
                    </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {isSeatLimitReached && (
                        <span className="text-[10px] font-black uppercase tracking-wider text-rose-500 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl">
                            Seat Limit Reached
                        </span>
                    )}
                    <button
                        onClick={() => {
                            setError('');
                            setSuccess('');
                            if (isSeatLimitReached) {
                                setError(`Seat limit reached! Your current plan allows a maximum of ${maxUsers} user login(s). Please upgrade subscription in the Admin panel to add more seats.`);
                                return;
                            }
                            setIsModalOpen(true);
                        }}
                        className={`flex items-center gap-2 px-5 py-3 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all text-sm shrink-0 ${
                            isSeatLimitReached ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                    >
                        <UserPlus size={18} />
                        Invite Staff Member
                    </button>
                </div>
            </div>

            {/* Notification messages */}
            {error && (
                <div className="mb-6 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm font-semibold border border-red-100 flex items-center gap-2 animate-in shake">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                </div>
            )}
            {success && (
                <div className="mb-6 bg-emerald-50 text-emerald-800 px-4 py-3 rounded-xl text-sm font-semibold border border-emerald-100 flex items-center gap-2 animate-in slide-in-from-top-4">
                    <CheckCircle size={18} />
                    <span>{success}</span>
                </div>
            )}

            {/* Stats section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <Users size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Users</p>
                        <p className="text-2xl font-black text-slate-900">{users.length}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <UserCheck size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Users</p>
                        <p className="text-2xl font-black text-slate-900">{users.filter(u => u.is_active).length}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                        <Mail size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Pending Invites</p>
                        <p className="text-2xl font-black text-slate-900">{users.filter(u => !u.joined_at).length}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                        <Shield size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 font-bold">License Seats</p>
                        <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-2xl font-black text-slate-900">{currentCount}</span>
                            <span className="text-xs text-slate-400 font-bold">/ {maxUsers} Seats</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all duration-500 ${seatsPercent >= 100 ? 'bg-rose-500' : seatsPercent >= 80 ? 'bg-amber-500' : 'bg-indigo-600'}`}
                                style={{ width: `${seatsPercent}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Search filter card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
                <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full sm:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by name, email, or phone number..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                        />
                    </div>
                    <button
                        onClick={loadUsers}
                        className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-white px-3 py-2 rounded-lg border border-slate-100 hover:border-blue-100 transition-all bg-slate-50 active:scale-95"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Sync Registry
                    </button>
                </div>

                {/* Users List Table */}
                <div className="overflow-x-auto">
                    {loading && users.length === 0 ? (
                        <div className="py-24 text-center">
                            <RefreshCw className="animate-spin text-blue-600 mx-auto mb-4" size={32} />
                            <p className="text-sm font-semibold text-slate-500">Synchronizing team member registry...</p>
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="py-24 text-center px-4">
                            <UserX className="text-slate-300 mx-auto mb-4" size={48} />
                            <p className="text-lg font-bold text-slate-700">No staff members found</p>
                            <p className="text-sm text-slate-400 mt-1">Try refining your search query or invite a new employee.</p>
                        </div>
                    ) : (
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-black uppercase text-slate-400 tracking-wider">
                                    <th className="py-4 px-6">Name / Identity</th>
                                    <th className="py-4 px-6">Contact Info</th>
                                    <th className="py-4 px-6">Role & Scope</th>
                                    <th className="py-4 px-6">Status</th>
                                    <th className="py-4 px-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-sm font-medium text-slate-700">
                                {filteredUsers.map(u => (
                                    <tr key={u.user_id} className="hover:bg-slate-50/50 transition-all">
                                        <td className="py-5 px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-white shadow-md">
                                                    {(u.full_name || 'U').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-extrabold text-slate-900">{u.full_name || 'Invited User'}</p>
                                                    <p className="text-xs text-slate-400 font-bold">User ID: #{u.user_id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-5 px-6">
                                            <div className="flex flex-col gap-1">
                                                {u.email && (
                                                    <span className="flex items-center gap-1.5 text-xs text-slate-600">
                                                        <Mail size={12} className="text-slate-400" />
                                                        {u.email}
                                                    </span>
                                                )}
                                                {u.phone && (
                                                    <span className="flex items-center gap-1.5 text-xs text-slate-600">
                                                        <Phone size={12} className="text-slate-400" />
                                                        {u.phone}
                                                    </span>
                                                )}
                                                {!u.email && !u.phone && <span className="text-xs text-slate-400 font-semibold italic">No contact details</span>}
                                            </div>
                                        </td>
                                        <td className="py-5 px-6">
                                            <select
                                                value={u.role}
                                                onChange={e => handleRoleChange(u.user_id, e.target.value as any)}
                                                className={`text-xs font-bold border rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer ${getRoleColor(u.role)}`}
                                            >
                                                <option value="Owner">Owner</option>
                                                <option value="Admin">Admin</option>
                                                <option value="Manager">Manager</option>
                                                <option value="Accountant">Accountant</option>
                                                <option value="Staff">Staff</option>
                                            </select>
                                        </td>
                                        <td className="py-5 px-6">
                                            <div className="flex items-center gap-2">
                                                {!u.joined_at ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100 animate-pulse">
                                                        Pending Invite
                                                    </span>
                                                ) : u.is_active ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100">
                                                        Suspended
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-5 px-6 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleToggleActive(u.user_id)}
                                                    title={u.is_active ? 'Deactivate Account' : 'Activate Account'}
                                                    className={`p-2 rounded-lg border transition-all ${
                                                        u.is_active
                                                            ? 'border-slate-200 text-slate-400 hover:text-amber-600 hover:bg-amber-50 hover:border-amber-100'
                                                            : 'border-slate-200 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-100'
                                                    }`}
                                                >
                                                    {u.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(u.user_id, u.full_name || u.email || '')}
                                                    title="Remove from Business"
                                                    className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 transition-all"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Invite Staff Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="bg-slate-50 px-6 py-5 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Invite Team Member</h3>
                                <p className="text-xs text-slate-400 font-semibold mt-0.5">Send a workspace access invitation.</p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl active:scale-95 transition-all"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleInviteSubmit} className="p-6 space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="email"
                                        placeholder="employee@company.com"
                                        value={inviteEmail}
                                        onChange={e => setInviteEmail(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mobile Number</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="tel"
                                        placeholder="+919876543210"
                                        value={invitePhone}
                                        onChange={e => {
                                            const v = e.target.value;
                                            const pureNumbers = v.replace(/\D/g, '');
                                            if (pureNumbers.length > 10) {
                                                alert("Phone number cannot be more than 10 digits");
                                                setInvitePhone((v.startsWith('+') ? '+' : '') + pureNumbers.slice(0, 10));
                                            } else {
                                                setInvitePhone(v.replace(/[^0-9+]/g, ''));
                                            }
                                        }}
                                        className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Permission Role</label>
                                <div className="relative">
                                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <select
                                        value={inviteRole}
                                        onChange={e => setInviteRole(e.target.value as any)}
                                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-slate-700 cursor-pointer"
                                    >
                                        <option value="Staff">Staff (Sales Entry Only)</option>
                                        <option value="Accountant">Accountant (Read/Write financial records)</option>
                                        <option value="Manager">Manager (Read/Write all masters)</option>
                                        <option value="Admin">Administrator (All permissions)</option>
                                        <option value="Owner">Owner (All permissions + business delete)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100/50 flex gap-3 text-xs text-blue-700 font-medium leading-relaxed">
                                <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                                <p>
                                    Invitations grant instant access if the email/phone is already registered on SimpleBill. Otherwise, a placeholder user will be staged.
                                </p>
                            </div>

                            <div className="flex gap-3 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-3 border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 font-bold rounded-xl active:scale-95 transition-all text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingInvite}
                                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all text-sm shadow-lg shadow-blue-500/10 flex justify-center items-center"
                                >
                                    {submittingInvite ? <RefreshCw className="animate-spin" size={18} /> : 'Send Invite'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
