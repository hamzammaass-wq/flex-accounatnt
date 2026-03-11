import React, { useEffect, useMemo, useState } from 'react';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import { Building2, CheckCircle2, Lock, Mail, User } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import type { UserRole } from '../types';
import { translate } from '../utils/i18n';
import { supabase } from '@/supabaseClient';
import {
  createCloudCompanyMembership,
  getCloudAccountState,
  getCloudProfileCompany,
  upsertCloudProfile,
} from '../utils/cloudAccount';

type AuthMode = 'LOGIN' | 'REGISTER';
type OAuthProvider = 'google';
type PendingCloudSetup = {
  userId: string;
  provider: OAuthProvider | null;
  email: string;
  fullName: string;
  companyName: string;
  role: UserRole;
};

const AUTH_CALLBACK_QUERY_KEYS = ['code', 'error', 'error_code', 'error_description', 'state'];

const decodeUrlValue = (value: string): string => {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
};

const getAuthCallbackError = (): string => {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  const errorDescription = url.searchParams.get('error_description');
  const errorCode = url.searchParams.get('error');
  if (errorDescription) return decodeUrlValue(errorDescription);
  if (errorCode) return decodeUrlValue(errorCode);
  return '';
};

const clearAuthCallbackQuery = (): void => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  let changed = false;
  AUTH_CALLBACK_QUERY_KEYS.forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });
  if (!changed) return;
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
};

const getAuthRedirectUrl = (): string => {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
};

const getProviderFromUser = (authUser: SupabaseAuthUser): OAuthProvider | null => {
  const provider = authUser.app_metadata?.provider;
  if (provider === 'google') return provider;
  return null;
};

const getDefaultFullName = (authUser: SupabaseAuthUser): string => {
  const metadata = authUser.user_metadata ?? {};
  const candidates = [
    metadata.full_name,
    metadata.name,
    metadata.display_name,
    metadata.user_name
  ];
  const match = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  if (typeof match === 'string') return match.trim();
  return authUser.email?.split('@')[0] || '';
};

const getDefaultCompanyName = (authUser: SupabaseAuthUser): string => {
  const metadata = authUser.user_metadata ?? {};
  const candidates = [
    metadata.company_name,
    metadata.company,
    metadata.organization,
    metadata.org_name
  ];
  const match = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  return typeof match === 'string' ? match.trim() : '';
};

const GoogleLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.4l2.6-2.5C16.7 3.3 14.6 2.4 12 2.4 6.9 2.4 2.8 6.6 2.8 11.9s4.1 9.5 9.2 9.5c5.3 0 8.8-3.7 8.8-8.9 0-.6-.1-1.1-.1-1.6H12Z" />
    <path fill="#34A853" d="M3.8 7.3l3.2 2.3c.9-1.8 2.8-3 5-3 1.8 0 3.1.8 3.8 1.4l2.6-2.5C16.7 3.3 14.6 2.4 12 2.4c-3.5 0-6.6 2-8.2 4.9Z" />
    <path fill="#FBBC05" d="M2.8 11.9c0 1.5.4 3 1 4.2l3.7-2.9c-.2-.4-.3-.9-.3-1.3 0-.5.1-1 .3-1.5L3.8 7.3c-.6 1.3-1 2.9-1 4.6Z" />
    <path fill="#4285F4" d="M12 21.4c2.5 0 4.7-.8 6.3-2.3l-3.1-2.4c-.8.6-1.9 1-3.2 1-2.2 0-4.1-1.4-4.9-3.4l-3.7 2.8c1.6 3 4.7 4.3 8.6 4.3Z" />
  </svg>
);

const AuthScreen: React.FC = () => {
  const { companySettings } = useAccounting();
  const [authMode, setAuthMode] = useState<AuthMode>('LOGIN');
  const [loading, setLoading] = useState(false);
  const [sessionCheckLoading, setSessionCheckLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [pendingCloudSetup, setPendingCloudSetup] = useState<PendingCloudSetup | null>(null);

  const [regCompanyName, setRegCompanyName] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const biometricEnabled = companySettings.biometricLoginEnabled ?? false;
  const isSecureContextForBiometric = useMemo(() => (typeof window !== 'undefined' ? window.isSecureContext : false), []);
  const [biometricSupported, setBiometricSupported] = useState(false);

  const appLanguage = companySettings.language ?? 'AR';
  const authBusy = loading || sessionCheckLoading;
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(appLanguage, key, params);

  const getProviderLabel = (provider: OAuthProvider | null): string => {
    if (provider === 'google') return 'Google';
    return appLanguage === 'AR' ? 'الحساب السحابي' : 'cloud account';
  };

  const buildPendingCloudSetup = (
    authUser: SupabaseAuthUser,
    profileCompanyName?: string
  ): PendingCloudSetup => {
    return {
      userId: authUser.id,
      provider: getProviderFromUser(authUser),
      email: authUser.email || '',
      fullName: getDefaultFullName(authUser),
      companyName: profileCompanyName?.trim() || getDefaultCompanyName(authUser),
      role: 'ADMIN'
    };
  };

  useEffect(() => {
    let cancelled = false;

    const inspectCloudSession = async () => {
      setSessionCheckLoading(true);

      const callbackError = getAuthCallbackError();
      if (callbackError && !cancelled) {
        setErrorMessage(callbackError);
      }

      try {
        let session = (await supabase.auth.getSession()).data.session;
        const authCode = typeof window !== 'undefined'
          ? new URL(window.location.href).searchParams.get('code')
          : null;

        if (!session && authCode) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
          if (error) throw new Error(error.message);
          session = data.session;
        }

        if (!session?.user || cancelled) return;

        const { profile, memberships } = await getCloudAccountState(session.user.id);
        if (cancelled) return;

        if (!memberships.length) {
          const profileCompany = getCloudProfileCompany(profile);
          setPendingCloudSetup(buildPendingCloudSetup(session.user, profileCompany?.name));
          setAuthMode('REGISTER');
        }
      } catch (err: any) {
        if (!cancelled) {
          setErrorMessage(err.message || 'تعذر التحقق من جلسة الدخول السحابية.');
        }
      } finally {
        clearAuthCallbackQuery();
        if (!cancelled) setSessionCheckLoading(false);
      }
    };

    inspectCloudSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkSupport = async () => {
      if (!biometricEnabled) {
        if (!cancelled) setBiometricSupported(false);
        return;
      }
      const hasWebAuthn = typeof window !== 'undefined' && 'PublicKeyCredential' in window && !!navigator.credentials;
      if (!hasWebAuthn || !isSecureContextForBiometric) {
        if (!cancelled) setBiometricSupported(false);
        return;
      }
      try {
        const platformFn = (window.PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable;
        const supported = typeof platformFn === 'function' ? await platformFn.call(window.PublicKeyCredential) : true;
        if (!cancelled) setBiometricSupported(!!supported);
      } catch {
        if (!cancelled) setBiometricSupported(false);
      }
    };
    checkSupport();
    return () => { cancelled = true; };
  }, [biometricEnabled, isSecureContextForBiometric]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: regEmail,
        password: regPassword,
        options: {
          data: {
            full_name: regFullName.trim(),
            company_name: regCompanyName.trim(),
          }
        }
      });

      if (authError) throw new Error(authError.message);
      if (!authData.user) throw new Error('فشل إنشاء المستخدم.');

      if (authData.session) {
        await upsertCloudProfile({
          id: authData.user.id,
          fullName: regFullName.trim()
        });
        await createCloudCompanyMembership({
          userId: authData.user.id,
          company: { name: regCompanyName.trim() },
          role: 'ADMIN'
        });
        window.location.reload();
        return;
      }

      setAuthMode('LOGIN');
      setLoginEmail(regEmail);
      setLoginPassword('');
      setInfoMessage('تم إنشاء الحساب. فعّل البريد الإلكتروني ثم سجّل الدخول.');
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ غير متوقع أثناء التسجيل.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (authError) throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
      if (!authData.user) throw new Error('تعذر إكمال تسجيل الدخول.');

      const { profile, memberships } = await getCloudAccountState(authData.user.id);

      if (!memberships.length) {
        const profileCompany = getCloudProfileCompany(profile);
        setPendingCloudSetup(buildPendingCloudSetup(authData.user, profileCompany?.name));
        setAuthMode('REGISTER');
        return;
      }

      window.location.reload();
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ غير متوقع أثناء الدخول.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAuthRedirectUrl(),
          queryParams: { prompt: 'select_account' }
        }
      });

      if (error) throw new Error(error.message);
    } catch (err: any) {
      setErrorMessage(err.message || 'تعذر بدء تسجيل الدخول عبر Google.');
      setLoading(false);
    }
  };

  const handleCompleteCloudSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingCloudSetup) return;

    const fullName = pendingCloudSetup.fullName.trim();
    const companyName = pendingCloudSetup.companyName.trim();
    if (!fullName || !companyName) {
      setErrorMessage('أدخل الاسم الكامل واسم الشركة لإكمال التسجيل.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || session.user.id !== pendingCloudSetup.userId) {
        throw new Error('انتهت جلسة الدخول. أعد المحاولة.');
      }

      await upsertCloudProfile({
        id: session.user.id,
        fullName
      });
      await createCloudCompanyMembership({
        userId: session.user.id,
        company: { name: companyName },
        role: pendingCloudSetup.role
      });

      window.location.reload();
    } catch (err: any) {
      setErrorMessage(err.message || 'تعذر إكمال تهيئة الحساب السحابي.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelCloudSetup = async () => {
    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
      setPendingCloudSetup(null);
      setAuthMode('LOGIN');
      clearAuthCallbackQuery();
    } catch (err: any) {
      setErrorMessage(err.message || 'تعذر تسجيل الخروج.');
    } finally {
      setLoading(false);
    }
  };

  const googleActionLabel = (): string => {
    if (appLanguage !== 'AR') return 'Continue with Google';
    return 'المتابعة عبر Google';
  };

  return (
    <div className="min-h-dvh bg-[#0f172a] flex flex-col items-center justify-center p-4 sm:p-6 font-tajawal relative overflow-x-hidden overflow-y-auto w-full">
      <div className="fixed top-[-10%] right-[-10%] w-[400px] h-[400px] bg-blue-600/20 rounded-full blur-[120px] animate-pulse pointer-events-none"></div>
      <div className="fixed bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse delay-700 pointer-events-none"></div>

      <div className="w-full max-w-sm relative z-10 pt-10 pb-10">
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-10 duration-700">
          <img
            src="/brand/aiflex-erp-logo.svg"
            alt={t('auth.appName')}
            className="w-full max-w-[23rem] mx-auto drop-shadow-[0_0_36px_rgba(34,211,238,0.2)]"
          />
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-2xl space-y-6 animate-in zoom-in-95 duration-500 delay-300">
          {!pendingCloudSetup && !sessionCheckLoading && (
            <div className="flex bg-gray-100 rounded-full p-1 mb-4">
              <button
                onClick={() => setAuthMode('LOGIN')}
                className={`flex-1 text-xs font-bold py-2.5 rounded-full transition-all ${authMode === 'LOGIN' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                تسجيل الدخول
              </button>
              <button
                onClick={() => setAuthMode('REGISTER')}
                className={`flex-1 text-xs font-bold py-2.5 rounded-full transition-all ${authMode === 'REGISTER' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                إنشاء شركة
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="bg-red-50 text-red-600 text-[11px] font-bold p-3 rounded-xl border border-red-100 text-center">
              {errorMessage}
            </div>
          )}

          {infoMessage && (
            <div className="bg-emerald-50 text-emerald-700 text-[11px] font-bold p-3 rounded-xl border border-emerald-100 text-center">
              {infoMessage}
            </div>
          )}

          {sessionCheckLoading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-10 h-10 border-2 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
              <div className="text-sm font-black text-slate-700">
                {appLanguage === 'AR' ? 'جار التحقق من جلسة الدخول...' : 'Checking your session...'}
              </div>
              <div className="text-[11px] text-slate-500">
                {appLanguage === 'AR' ? 'سيتم تحويلك تلقائيًا عند اكتمال التحقق.' : 'You will continue automatically once the check is complete.'}
              </div>
            </div>
          ) : pendingCloudSetup ? (
            <form onSubmit={handleCompleteCloudSetup} className="space-y-4">
              <div className="text-center space-y-2">
                <div className="text-lg font-black text-slate-900">
                  {appLanguage === 'AR'
                    ? `إكمال التسجيل عبر ${getProviderLabel(pendingCloudSetup.provider)}`
                    : `Complete ${getProviderLabel(pendingCloudSetup.provider)} sign up`}
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  {appLanguage === 'AR'
                    ? 'تم التحقق من الحساب السحابي. بقي ربطه باسمك وشركتك داخل النظام.'
                    : 'Your cloud account is verified. Finish linking it to your company in the app.'}
                </div>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <User className="w-4 h-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={pendingCloudSetup.fullName}
                    onChange={(e) => setPendingCloudSetup(prev => prev ? { ...prev, fullName: e.target.value } : prev)}
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                    placeholder="الاسم الكامل"
                  />
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <Building2 className="w-4 h-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={pendingCloudSetup.companyName}
                    onChange={(e) => setPendingCloudSetup(prev => prev ? { ...prev, companyName: e.target.value } : prev)}
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                    placeholder="اسم الشركة / المؤسسة"
                  />
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <Mail className="w-4 h-4 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    value={pendingCloudSetup.email}
                    readOnly
                    className="w-full bg-gray-100 border border-gray-200 text-gray-500 text-sm rounded-xl block pr-10 p-3"
                    placeholder="البريد الإلكتروني"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={authBusy}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm px-5 py-3.5 text-center flex items-center justify-center transition-all disabled:opacity-70"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : (appLanguage === 'AR' ? 'إكمال التفعيل السحابي' : 'Finish cloud setup')}
              </button>

              <button
                type="button"
                onClick={handleCancelCloudSetup}
                disabled={authBusy}
                className="w-full py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 font-bold text-xs hover:bg-gray-100 transition-all disabled:opacity-70"
              >
                {appLanguage === 'AR' ? 'العودة وتسجيل الخروج' : 'Cancel and sign out'}
              </button>
            </form>
          ) : (
            <>
              {authMode === 'LOGIN' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-3">
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <Mail className="w-4 h-4 text-gray-400" />
                      </div>
                      <input
                        type="email"
                        required
                        value={loginEmail}
                        onChange={e => setLoginEmail(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                        placeholder="البريد الإلكتروني"
                      />
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <Lock className="w-4 h-4 text-gray-400" />
                      </div>
                      <input
                        type="password"
                        required
                        value={loginPassword}
                        onChange={e => setLoginPassword(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                        placeholder="كلمة المرور"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authBusy}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm px-5 py-3.5 text-center flex items-center justify-center transition-all disabled:opacity-70"
                  >
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'دخول مباشر'}
                  </button>
                </form>
              )}

              {authMode === 'REGISTER' && (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-3">
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <Building2 className="w-4 h-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        required
                        value={regCompanyName}
                        onChange={e => setRegCompanyName(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                        placeholder="اسم الشركة / المؤسسة"
                      />
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <User className="w-4 h-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        required
                        value={regFullName}
                        onChange={e => setRegFullName(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                        placeholder="الاسم الكامل لمدير النظام"
                      />
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <Mail className="w-4 h-4 text-gray-400" />
                      </div>
                      <input
                        type="email"
                        required
                        value={regEmail}
                        onChange={e => setRegEmail(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                        placeholder="البريد الإلكتروني للإدارة"
                      />
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <Lock className="w-4 h-4 text-gray-400" />
                      </div>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={regPassword}
                        onChange={e => setRegPassword(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                        placeholder="كلمة مرور الدخول للمنصة (6 أحرف على الأقل)"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authBusy}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm px-5 py-3.5 text-center flex items-center justify-center transition-all disabled:opacity-70"
                  >
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'تسجيل وتفعيل النظام السحابي'}
                  </button>
                </form>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={authBusy}
                  className="w-full py-3 bg-white border border-gray-200 rounded-xl text-gray-700 font-bold text-sm hover:bg-gray-50 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
                >
                  <GoogleLogo className="w-5 h-5" />
                  {googleActionLabel()}
                </button>
              </div>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-gray-100"></div>
                <span className="flex-shrink mx-4 text-[10px] text-gray-300 font-bold uppercase tracking-widest">{t('auth.or')}</span>
                <div className="flex-grow border-t border-gray-100"></div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 text-[10px] text-gray-400 font-bold mt-6">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          اتصال سحابي آمن ومشفر
          {biometricSupported ? (
            <span className="text-[10px] text-blue-300">
              {appLanguage === 'AR' ? 'يدعم البصمة على هذا الجهاز' : 'Biometrics supported on this device'}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;

