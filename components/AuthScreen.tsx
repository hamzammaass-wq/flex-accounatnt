import React, { useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
} from 'firebase/auth';
import { CheckCircle2, Lock, Mail, User } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { firebaseAuth, isFirebaseAuthEnabled } from '../firebaseClient';
import { translate } from '../utils/i18n';

type AuthMode = 'LOGIN' | 'REGISTER';

const shouldPreferRedirectAuth = (): boolean => {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return standalone || /android|iphone|ipad|ipod/.test(userAgent);
};

const getFirebaseErrorMessage = (error: unknown, language: 'AR' | 'EN'): string => {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code || '')
    : '';
  const fallback = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: string }).message || '')
    : '';

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return language === 'AR' ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : 'Incorrect email or password.';
  }
  if (code === 'auth/email-already-in-use') {
    return language === 'AR' ? 'هذا البريد الإلكتروني مستخدم بالفعل.' : 'This email is already in use.';
  }
  if (code === 'auth/weak-password') {
    return language === 'AR' ? 'كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.' : 'Weak password. Use at least 6 characters.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return language === 'AR' ? 'تم إغلاق نافذة Google قبل إكمال تسجيل الدخول.' : 'The Google sign-in window was closed before completion.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return language === 'AR' ? 'هذا البريد مرتبط بطريقة تسجيل دخول مختلفة.' : 'This email is already linked to a different sign-in method.';
  }
  if (code === 'auth/too-many-requests') {
    return language === 'AR' ? 'تم تعليق المحاولات مؤقتًا بسبب كثرة المحاولات. حاول لاحقًا.' : 'Too many attempts. Try again later.';
  }
  if (code === 'auth/network-request-failed') {
    return language === 'AR' ? 'تعذر الوصول إلى Firebase. تحقق من الاتصال بالإنترنت.' : 'Could not reach Firebase. Check your network connection.';
  }

  return fallback || (language === 'AR'
    ? 'حدث خطأ غير متوقع أثناء المصادقة.'
    : 'Unexpected authentication error.');
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
  const isFirebaseMode = isFirebaseAuthEnabled && Boolean(firebaseAuth);
  const [authMode, setAuthMode] = useState<AuthMode>('LOGIN');
  const [loading, setLoading] = useState(false);
  const [sessionCheckLoading, setSessionCheckLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [biometricSupported, setBiometricSupported] = useState(false);

  const biometricEnabled = companySettings.biometricLoginEnabled ?? false;
  const isSecureContextForBiometric = useMemo(() => (typeof window !== 'undefined' ? window.isSecureContext : false), []);
  const appLanguage = (companySettings.language ?? 'AR') as 'AR' | 'EN';
  const authBusy = loading || sessionCheckLoading;
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(appLanguage, key, params);

  useEffect(() => {
    let cancelled = false;

    const checkRedirectResult = async () => {
      if (!isFirebaseMode || !firebaseAuth) {
        if (!cancelled) {
          setSessionCheckLoading(false);
          setErrorMessage(appLanguage === 'AR'
            ? 'Firebase Authentication غير مهيأ في هذا المشروع.'
            : 'Firebase Authentication is not configured for this project.');
        }
        return;
      }

      setSessionCheckLoading(true);
      try {
        await getRedirectResult(firebaseAuth);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getFirebaseErrorMessage(error, appLanguage));
        }
      } finally {
        if (!cancelled) setSessionCheckLoading(false);
      }
    };

    void checkRedirectResult();
    return () => { cancelled = true; };
  }, [appLanguage, isFirebaseMode]);

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
        if (!cancelled) setBiometricSupported(Boolean(supported));
      } catch {
        if (!cancelled) setBiometricSupported(false);
      }
    };

    void checkSupport();
    return () => { cancelled = true; };
  }, [biometricEnabled, isSecureContextForBiometric]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseAuth) return;

    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, regEmail.trim(), regPassword);
      const fullName = regFullName.trim();
      if (fullName) {
        await updateProfile(credential.user, { displayName: fullName });
      }
      setInfoMessage(appLanguage === 'AR'
        ? 'تم إنشاء الحساب بنجاح. سيتم تسجيل دخولك تلقائيًا.'
        : 'Account created successfully. You will be signed in automatically.');
    } catch (error) {
      setErrorMessage(getFirebaseErrorMessage(error, appLanguage));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseAuth) return;

    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      await signInWithEmailAndPassword(firebaseAuth, loginEmail.trim(), loginPassword);
    } catch (error) {
      setErrorMessage(getFirebaseErrorMessage(error, appLanguage));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!firebaseAuth) return;

    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      if (shouldPreferRedirectAuth()) {
        setInfoMessage(appLanguage === 'AR'
          ? 'سيتم تحويلك إلى Google لإكمال تسجيل الدخول.'
          : 'Redirecting to Google sign-in...');
        await signInWithRedirect(firebaseAuth, provider);
        return;
      }

      try {
        await signInWithPopup(firebaseAuth, provider);
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: string }).code || '')
          : '';
        if (
          code === 'auth/popup-blocked' ||
          code === 'auth/cancelled-popup-request' ||
          code === 'auth/operation-not-supported-in-this-environment'
        ) {
          setInfoMessage(appLanguage === 'AR'
            ? 'سيتم تحويلك إلى Google لأن النافذة المنبثقة غير مدعومة هنا.'
            : 'Switching to redirect-based Google sign-in...');
          await signInWithRedirect(firebaseAuth, provider);
          return;
        }
        throw error;
      }
    } catch (error) {
      setErrorMessage(getFirebaseErrorMessage(error, appLanguage));
      setLoading(false);
    }
  };

  const loginTitle = appLanguage === 'AR' ? 'تسجيل الدخول' : 'Sign In';
  const registerTitle = appLanguage === 'AR' ? 'إنشاء حساب' : 'Create Account';
  const firebaseNote = appLanguage === 'AR'
    ? 'هذه الشاشة تستخدم Firebase Authentication فقط.'
    : 'This screen uses Firebase Authentication only.';
  const registerHelper = appLanguage === 'AR'
    ? 'يمكنك إنشاء الشركة وإعداد بياناتها بعد الدخول.'
    : 'You can create and configure your company after signing in.';

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
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-center text-[11px] font-bold text-amber-700">
            {firebaseNote}
          </div>

          <div className="flex bg-gray-100 rounded-full p-1">
            <button
              type="button"
              onClick={() => setAuthMode('LOGIN')}
              className={`flex-1 text-xs font-bold py-2.5 rounded-full transition-all ${authMode === 'LOGIN' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {loginTitle}
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('REGISTER')}
              className={`flex-1 text-xs font-bold py-2.5 rounded-full transition-all ${authMode === 'REGISTER' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {registerTitle}
            </button>
          </div>

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
                {appLanguage === 'AR' ? 'جار التحقق من جلسة Firebase...' : 'Checking Firebase session...'}
              </div>
            </div>
          ) : (
            <>
              {authMode === 'LOGIN' ? (
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
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                        placeholder={appLanguage === 'AR' ? 'البريد الإلكتروني' : 'Email'}
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
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                        placeholder={appLanguage === 'AR' ? 'كلمة المرور' : 'Password'}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authBusy || !isFirebaseMode}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm px-5 py-3.5 text-center flex items-center justify-center transition-all disabled:opacity-70"
                  >
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : loginTitle}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-3">
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <User className="w-4 h-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        required
                        value={regFullName}
                        onChange={(e) => setRegFullName(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                        placeholder={appLanguage === 'AR' ? 'الاسم الكامل' : 'Full name'}
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
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                        placeholder={appLanguage === 'AR' ? 'البريد الإلكتروني' : 'Email'}
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
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                        placeholder={appLanguage === 'AR' ? 'كلمة المرور (6 أحرف على الأقل)' : 'Password (at least 6 characters)'}
                      />
                    </div>
                  </div>

                  <div className="text-[11px] font-medium text-slate-500 text-center">
                    {registerHelper}
                  </div>

                  <button
                    type="submit"
                    disabled={authBusy || !isFirebaseMode}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm px-5 py-3.5 text-center flex items-center justify-center transition-all disabled:opacity-70"
                  >
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : registerTitle}
                  </button>
                </form>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={authBusy || !isFirebaseMode}
                  className="w-full py-3 bg-white border border-gray-200 rounded-xl text-gray-700 font-bold text-sm hover:bg-gray-50 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
                >
                  <GoogleLogo className="w-5 h-5" />
                  {appLanguage === 'AR' ? 'المتابعة عبر Google' : 'Continue with Google'}
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
          {appLanguage === 'AR' ? 'اتصال آمن ومشفر عبر Firebase' : 'Secure encrypted access via Firebase'}
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
