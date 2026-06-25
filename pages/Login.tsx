
import React, { useState, useEffect, useCallback } from 'react';
import { saveSettings, checkRegistrationEligibility, registerSaaSUser, loginSaaSUser, forgotPassword, resetPassword, getSettings } from '../services/dataService';
import { verifyLicenseKey } from '../services/licenseService';
import { User, AppSettings, Role } from '../types';
import { ShieldCheck, Lock, Mail, Key, User as UserIcon, RefreshCw, Copy, CheckCircle, ArrowLeft, Calculator, Phone, AlertCircle } from 'lucide-react';

const normalizePhoneInput = (value: string) => {
    const digits = value.replace(/[^0-9+]/g, '');
    const pureNumbers = digits.replace(/\D/g, '');
    if (pureNumbers.length > 10) {
        alert("Phone number cannot be more than 10 digits");
        // Maintain any + prefix but limit numbers to 10
        const isPlus = digits.startsWith('+');
        return (isPlus ? '+' : '') + pureNumbers.slice(0, 10);
    }
    return digits;
};
const isValidPhone = (value: string) => /^\+?[0-9]{7,15}$/.test(value);
const isValidLicense = (value: string) => /^SB-(FREE|PRO|ENT)-[A-Z0-9]{6,}$/i.test(value.trim());

interface LoginProps {
    onLogin: (user: User, updatedSettings?: AppSettings) => void;
    settings: AppSettings;
}

export const Login: React.FC<LoginProps> = ({ onLogin, settings }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const [view, setView] = useState<'login' | 'register' | 'forgot' | 'reset'>('register');

    // Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [regName, setRegName] = useState('');

    // Auto-fill license from settings if available
    // If settings.license.key is available, we use that. If not, we allow user to type it.
    const [regLicense, setRegLicense] = useState(settings.license?.key || '');
    const [regPhone, setRegPhone] = useState('');

    // Registration Success State
    const [generatedPassword, setGeneratedPassword] = useState('');
    const [eligibilityMsg, setEligibilityMsg] = useState('');
    const [registeredBusinessId, setRegisteredBusinessId] = useState<string>('1');

    // Reset Password State
    const [resetToken, setResetToken] = useState('');
    const [newPassword, setNewPassword] = useState('');


    // Captcha State
    const [captchaQuestion, setCaptchaQuestion] = useState('');
    const [captchaAnswer, setCaptchaAnswer] = useState<number | null>(null);
    const [userCaptcha, setUserCaptcha] = useState('');

    const phoneError = React.useMemo(() => {
        if (!regPhone) return '';
        let localNumber = regPhone.replace(/\D/g, '');
        if (settings.countryCode === 'IN') {
            if (localNumber.startsWith('91') && localNumber.length > 10) {
                localNumber = localNumber.substring(2);
            }
            if (localNumber.length !== 10) {
                return 'Provide 10 digits only.';
            }
        } else {
            if (!isValidPhone(regPhone)) {
                return 'Format must be 7-15 digits (optional + prefix).';
            }
        }
        return '';
    }, [regPhone, settings.countryCode]);

    const generateCaptcha = useCallback(() => {
        const num1 = Math.floor(Math.random() * 10) + 1;
        const num2 = Math.floor(Math.random() * 10) + 1;
        setCaptchaQuestion(`${num1} + ${num2}`);
        setCaptchaAnswer(num1 + num2);
        setUserCaptcha('');
    }, []);

    useEffect(() => {
        if (view === 'login' || view === 'reset') {
            generateCaptcha();
        }
    }, [view, generateCaptcha]);

    useEffect(() => {
        if (view === 'register') {
            setRegLicense(settings.license?.key || '');
            setEligibilityMsg('');
        }
    }, [settings.license?.key, view]);

    const generateSecurePassword = () => {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
        let pass = "";
        for (let i = 0; i < 12; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return pass;
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (parseInt(userCaptcha) !== captchaAnswer) {
            setError("Incorrect captcha answer. Please try again.");
            generateCaptcha();
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await loginSaaSUser(email.trim(), password, settings.mysqlConfig);

            if (response && response.license_key) {
                const licenseInfo = await verifyLicenseKey(response.license_key);

                const currentSettings = getSettings();
                const newSettings: AppSettings = {
                    ...currentSettings,
                    isConfigured: true,
                    dataSource: 'CLOUD_MYSQL',
                    mysqlConfig: settings.mysqlConfig,
                    license: licenseInfo
                };

                await saveSettings(newSettings, true); // skipCloudSync: don't overwrite cloud tenant settings during login

                // Extract businessId from the JWT payload — most reliable source
                // (server always embeds the real ID there even if response.businessId is missing)
                let bizId = response.businessId;
                if (response.access_token) {
                    try {
                        const jwtPayload = JSON.parse(atob(response.access_token.split('.')[1]));
                        bizId = jwtPayload.default_business_id || bizId;
                    } catch { /* ignore malformed token */ }
                }

                // Set localStorage FIRST so companyId in the user object is always correct
                if (response.access_token) {
                    localStorage.setItem('access_token', response.access_token);
                }
                if (response.refresh_token) {
                    localStorage.setItem('refresh_token', response.refresh_token);
                }
                if (bizId) {
                    localStorage.setItem('business_id', String(bizId));
                }

                const user: User = {
                    name: response.name,
                    email: response.email,
                    role: Role.ADMIN,
                    avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(response.name)}&background=0D8ABC&color=fff`,
                    companyId: String(bizId || localStorage.getItem('business_id') || '1')
                };

                onLogin(user, newSettings);
            } else {
                throw new Error("Invalid response from server.");
            }
        } catch (err: any) {
            setError(err.message || 'Login failed. Please check your credentials.');
            generateCaptcha();
        } finally {
            setLoading(false);
        }
    };


    const validateRegistrationEligibility = async () => {
        const finalLicense = regLicense.trim();
        const finalEmail = email.trim();
        const finalPhone = regPhone.trim();

        if (!finalEmail) throw new Error('Email is required.');
        if (!finalLicense) throw new Error('License key is required.');
        if (!isValidLicense(finalLicense)) throw new Error('License key format must be SB-FREE/PRO/ENT-XXXXXX');
        
        if (finalPhone) {
            let localNumber = finalPhone.replace(/\D/g, '');
            if (settings.countryCode === 'IN') {
                if (localNumber.startsWith('91') && localNumber.length > 10) {
                    localNumber = localNumber.substring(2);
                }
                if (localNumber.length !== 10) {
                    throw new Error('Provide 10 digits only.');
                }
            } else {
                if (!isValidPhone(finalPhone)) {
                    throw new Error('Format must be 7-15 digits (optional + prefix).');
                }
            }
        }

        await checkRegistrationEligibility(finalEmail, finalLicense, finalPhone, settings.mysqlConfig);
        setEligibilityMsg('Eligibility verified. You can continue registration.');
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Use the input value OR the hidden value from state
            const finalLicense = regLicense.trim();
            const finalEmail = email.trim();
            const finalName = regName.trim();
            const finalPhone = regPhone.trim();

            await validateRegistrationEligibility();

            const license = await verifyLicenseKey(finalLicense);
            if (license.status !== 'ACTIVE') {
                throw new Error('Invalid license key.');
            }

            const tempPass = generateSecurePassword();
            setGeneratedPassword(tempPass);

            const response = await registerSaaSUser(finalEmail, finalLicense, finalName, tempPass, finalPhone, settings.mysqlConfig);
            
            if (response && response.businessId) {
                setRegisteredBusinessId(String(response.businessId));
            }
            if (response && response.access_token) {
                localStorage.setItem('access_token', response.access_token);
            }
            if (response && response.refresh_token) {
                localStorage.setItem('refresh_token', response.refresh_token);
            }
            if (response && response.businessId) {
                localStorage.setItem('business_id', String(response.businessId));
            }

            const currentSettings = getSettings();
            const newSettings = {
                ...currentSettings,
                license,
                mysqlConfig: settings.mysqlConfig,
                isConfigured: true,
                dataSource: 'CLOUD_MYSQL' as const
            };
            await saveSettings(newSettings, true); // skipCloudSync: don't overwrite cloud tenant settings during registration
        } catch (err: any) {
            setError(err.message || "Registration failed.");
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteRegistration = () => {
        const user: User = {
            name: regName.trim(),
            email: email.trim(),
            role: Role.ADMIN,
            avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(regName.trim())}&background=2563eb&color=fff`,
            companyId: registeredBusinessId
        };
        const currentSettings = getSettings();
        onLogin(user, currentSettings);
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await forgotPassword(email.trim());
            if (res.debug_token) {
                setSuccessMsg(`Your reset token is: ${res.debug_token}`);
            } else {
                setSuccessMsg("Reset instructions sent to your email.");
            }
            setView('reset');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (parseInt(userCaptcha) !== captchaAnswer) {
            setError("Incorrect captcha answer. Please try again.");
            generateCaptcha();
            return;
        }

        setLoading(true);
        setError('');
        try {
            await resetPassword(email.trim(), resetToken.trim(), newPassword);
            setSuccessMsg("Password updated. Please login.");
            setView('login');
        } catch (err: any) {
            setError(err.message);
            generateCaptcha();
        } finally {
            setLoading(false);
        }
    };


    if (generatedPassword) {
        return (
            <div className="flex flex-col justify-center py-12 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)] animate-in fade-in">
                <div className="sm:mx-auto sm:w-full sm:max-w-md">
                    <div className="bg-white py-8 px-4 shadow-2xl sm:rounded-2xl sm:px-10 border border-green-100 text-center">
                        <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="text-green-600" size={32} />
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 mb-2">Registration Complete!</h2>

                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl mb-6 text-left">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Your Generated Password</p>
                            <div className="flex justify-between items-center bg-white border border-gray-300 p-3 rounded-lg">
                                <code className="text-lg font-mono font-bold text-blue-600">{generatedPassword}</code>
                                <button onClick={() => { navigator.clipboard.writeText(generatedPassword); alert("Copied!"); }} className="text-gray-400 hover:text-blue-600">
                                    <Copy size={20} />
                                </button>
                            </div>
                            <p className="text-xs text-red-500 mt-2 font-medium">Save this safely. We cannot recover it.</p>
                        </div>

                        <button onClick={handleCompleteRegistration} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg active:scale-95">
                            Continue to Workspace &rarr;
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col justify-center py-12 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)] animate-in fade-in">
            <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
                <div className="flex justify-center mb-6 relative">
                    <div className="h-16 w-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl">
                        <ShieldCheck className="text-white" size={32} />
                    </div>
                </div>
                <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                    {view === 'register' ? 'Create SaaS Account' : view === 'login' ? 'Sign In' : view === 'forgot' ? 'Recover Account' : 'Set New Password'}
                </h2>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow-2xl sm:rounded-2xl sm:px-10 border border-gray-100">

                    {(view === 'login' || view === 'register') && (
                        <div className="flex border-b border-gray-100 mb-8">
                            <button
                                className={`flex-1 pb-4 text-sm font-bold border-b-2 transition-all ${view === 'register' ? 'border-blue-600 text-blue-600' : 'text-gray-400'}`}
                                onClick={() => setView('register')}
                            >
                                Register
                            </button>
                            <button
                                className={`flex-1 pb-4 text-sm font-bold border-b-2 transition-all ${view === 'login' ? 'border-blue-600 text-blue-600' : 'text-gray-400'}`}
                                onClick={() => setView('login')}
                            >
                                Log In
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="mb-6 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-xs font-bold animate-in shake border border-red-100 flex gap-2">
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <div>{error}</div>
                        </div>
                    )}
                    {successMsg && <div className="mb-6 bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm font-bold">{successMsg}</div>}

                    {view === 'login' && (
                        <form onSubmit={handleLoginSubmit} className="space-y-5">
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input type="email" required className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input type="password" required className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
                            </div>

                            {/* Math Captcha */}
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Calculator size={18} className="text-blue-600" />
                                    <span className="text-sm font-bold text-gray-700">{captchaQuestion} = </span>
                                </div>
                                <input
                                    type="text" inputMode="decimal"
                                    required
                                    className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-center font-bold"
                                    placeholder="?"
                                    value={userCaptcha}
                                    onChange={e => setUserCaptcha(e.target.value)}
                                />
                                <button type="button" onClick={generateCaptcha} className="text-gray-400 hover:text-blue-600">
                                    <RefreshCw size={16} />
                                </button>
                            </div>


                            <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all">
                                {loading ? <RefreshCw className="animate-spin mx-auto" /> : 'Log In'}
                            </button>
                            <div className="text-center">
                                <button type="button" onClick={() => setView('forgot')} className="text-xs text-blue-600 hover:underline">Forgot Password?</button>
                            </div>
                        </form>
                    )}

                    {view === 'register' && (
                        <form onSubmit={handleRegisterSubmit} className="space-y-5">
                            <div className="relative">
                                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input type="text" required className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl" placeholder="Full Name" value={regName} onChange={e => setRegName(e.target.value)} />
                            </div>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input type="email" required className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input 
                                        type="tel" 
                                        required 
                                        className={`w-full pl-10 pr-4 py-3 border rounded-xl transition-all ${
                                            phoneError ? 'border-red-300 focus:ring-red-500/10 focus:border-red-500' : 'border-gray-200 focus:ring-blue-500/10 focus:border-blue-500'
                                        }`}
                                        placeholder="Mobile Number (e.g. +919876543210)" 
                                        value={regPhone} 
                                        onChange={e => setRegPhone(normalizePhoneInput(e.target.value))} 
                                    />
                                </div>
                                {phoneError && (
                                    <p className="text-[10px] text-red-500 font-bold ml-1 flex items-center gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <AlertCircle size={10} className="shrink-0" /> {phoneError}
                                    </p>
                                )}
                            </div>

                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    required
                                    pattern="^SB-(FREE|PRO|ENT)-[A-Za-z0-9]{6,}$"
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl font-mono"
                                    placeholder="Activation / License Key"
                                    value={regLicense}
                                    onChange={e => setRegLicense(e.target.value.toUpperCase())}
                                />
                            </div>

                            <div className="space-y-2">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        setLoading(true);
                                        setError('');
                                        try {
                                            await validateRegistrationEligibility();
                                        } catch (err: any) {
                                            setEligibilityMsg('');
                                            setError(err.message || 'Eligibility check failed.');
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                    disabled={loading}
                                    className="w-full py-3 border border-blue-200 text-blue-700 rounded-xl font-bold hover:bg-blue-50 disabled:opacity-50"
                                >
                                    Check Eligibility
                                </button>
                                {eligibilityMsg && <p className="text-sm text-emerald-600 font-semibold">{eligibilityMsg}</p>}
                            </div>

                            <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all">
                                {loading ? <RefreshCw className="animate-spin mx-auto" /> : 'Provision Account'}
                            </button>
                        </form>
                    )}

                    {view === 'forgot' && (
                        <form onSubmit={handleForgotPassword} className="space-y-5">
                            <p className="text-sm text-gray-500 text-center">Enter your email address to receive a reset token.</p>
                            <input type="email" required className="w-full px-4 py-3 border border-gray-200 rounded-xl" placeholder="Your Email" value={email} onChange={e => setEmail(e.target.value)} />
                            <button type="submit" className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-black transition-all">Send Reset Token</button>
                            <button type="button" onClick={() => setView('login')} className="w-full text-xs text-gray-500 hover:text-gray-900 flex items-center justify-center gap-1">
                                <ArrowLeft size={14} /> Back to Login
                            </button>
                        </form>
                    )}

                    {view === 'reset' && (
                        <form onSubmit={handleResetPassword} className="space-y-5">
                            <input type="text" required className="w-full px-4 py-3 border border-gray-200 rounded-xl font-mono" placeholder="Token" value={resetToken} onChange={e => setResetToken(e.target.value)} />
                            <input type="password" required className="w-full px-4 py-3 border border-gray-200 rounded-xl" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />

                            {/* Math Captcha */}
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Calculator size={18} className="text-blue-600" />
                                    <span className="text-sm font-bold text-gray-700">{captchaQuestion} = </span>
                                </div>
                                <input
                                    type="text" inputMode="decimal"
                                    required
                                    className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-center font-bold"
                                    placeholder="?"
                                    value={userCaptcha}
                                    onChange={e => setUserCaptcha(e.target.value)}
                                />
                                <button type="button" onClick={generateCaptcha} className="text-gray-400 hover:text-blue-600">
                                    <RefreshCw size={16} />
                                </button>
                            </div>

                            <button type="submit" className="w-full py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition-all">Update Password</button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};
