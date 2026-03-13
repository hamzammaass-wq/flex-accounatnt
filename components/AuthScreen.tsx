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
import { DEFAULT_BRAND_LOGO_URL } from '../utils/brandAssets';
import { translate } from '../utils/i18n';

type AuthMode = 'LOGIN' | 'REGISTER';
type GuestDataPreference = 'KEEP' | 'DELETE';
const GUEST_USER_ID = 'guest_user';
const GUEST_USER_EMAIL = 'guest@smart.local';
const GUEST_TRIAL_DAYS = 14;
const GUEST_TRIAL_START_KEY = 'al_mohaseb_guest_trial_started_at';
const FORCE_EMPTY_BOOTSTRAP_KEY = 'al_mohaseb_force_empty_bootstrap';
const APP_STORAGE_PREFIX = 'al_mohaseb_';
const PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY = 'al_mohaseb_pending_guest_delete_after_redirect';
const SIGNUP_TRIAL_SELECTION_KEY = 'al_mohaseb_signup_trial_selection_days';

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

interface AuthScreenProps {
  guestTrialExpired?: boolean;
  guestTrialDaysLeft?: number;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ guestTrialExpired = false, guestTrialDaysLeft = GUEST_TRIAL_DAYS }) => {
  const { companySettings, setCurrentUser, currentCompanyId } = useAccounting();
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
  const [signupTrialEnabled, setSignupTrialEnabled] = useState(true);
  const [guestDataPreference, setGuestDataPreference] = useState<GuestDataPreference>('KEEP');
  const [hasGuestWorkspaceData, setHasGuestWorkspaceData] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);

  const biometricEnabled = companySettings.biometricLoginEnabled ?? false;
  const isSecureContextForBiometric = useMemo(() => (typeof window !== 'undefined' ? window.isSecureContext : false), []);
  const appLanguage = (companySettings.language ?? 'AR') as 'AR' | 'EN';
  const authBusy = loading || sessionCheckLoading;
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(appLanguage, key, params);
  const trialStatusText = appLanguage === 'AR'
    ? `تجربة الضيف متبقي لها ${guestTrialDaysLeft} يوم.`
    : `Guest trial has ${guestTrialDaysLeft} day(s) left.`;
  const trialExpiredText = appLanguage === 'AR'
    ? 'انتهت تجربة الضيف (14 يوم). يرجى إنشاء حساب أو تسجيل الدخول للمتابعة.'
    : 'Guest trial (14 days) has ended. Please create an account or sign in to continue.';

  const removeAppPrefixedStorage = () => {
    if (typeof window === 'undefined') return;
    const removeMatching = (storage: Storage) => {
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean) as string[];
      keys.forEach((key) => {
        if (key.startsWith(APP_STORAGE_PREFIX)) {
          storage.removeItem(key);
        }
      });
    };

    removeMatching(window.localStorage);
    removeMatching(window.sessionStorage);
  };

  const applyGuestDataDecision = (decision: GuestDataPreference) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY);
    if (decision === 'DELETE') {
      removeAppPrefixedStorage();
      localStorage.setItem(FORCE_EMPTY_BOOTSTRAP_KEY, '1');
      setHasGuestWorkspaceData(false);
    }
  };

  const persistSignupTrialSelection = (enabled: boolean) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SIGNUP_TRIAL_SELECTION_KEY, enabled ? '14' : '0');
  };

  const resolveGuestTrialWindow = () => {
    if (typeof window === 'undefined') {
      const now = new Date();
      const endsAt = new Date(now.getTime() + GUEST_TRIAL_DAYS * 24 * 60 * 60 * 1000);
      return { startedAt: now.toISOString(), endsAt: endsAt.toISOString(), expired: false };
    }

    const now = new Date();
    const fallbackStart = now.toISOString();
    const storedStart = localStorage.getItem(GUEST_TRIAL_START_KEY) || fallbackStart;
    const startDate = new Date(storedStart);
    const validStart = Number.isFinite(startDate.getTime()) ? startDate : now;
    const endsAt = new Date(validStart.getTime() + GUEST_TRIAL_DAYS * 24 * 60 * 60 * 1000);
    return {
      startedAt: validStart.toISOString(),
      endsAt: endsAt.toISOString(),
      expired: now.getTime() > endsAt.getTime()
    };
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasWorkspace = Object.keys(localStorage).some((key) => key.startsWith('al_mohaseb_workspace_'));
    const hasTrialMeta = Boolean(localStorage.getItem(GUEST_TRIAL_START_KEY));
    setHasGuestWorkspaceData(hasWorkspace || hasTrialMeta);
  }, []);

  useEffect(() => {
    if (!guestTrialExpired) return;
    setErrorMessage(trialExpiredText);
  }, [guestTrialExpired, trialExpiredText]);

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
        const redirectResult = await getRedirectResult(firebaseAuth);
        if (redirectResult && typeof window !== 'undefined') {
          const pendingDelete = localStorage.getItem(PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY) === '1';
          if (pendingDelete) {
            const pendingSignupTrialSelection = localStorage.getItem(SIGNUP_TRIAL_SELECTION_KEY);
            localStorage.removeItem(PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY);
            applyGuestDataDecision('DELETE');
            if (pendingSignupTrialSelection !== null) {
              localStorage.setItem(SIGNUP_TRIAL_SELECTION_KEY, pendingSignupTrialSelection);
            }
            window.location.replace(`${window.location.pathname}${window.location.hash}`);
            return;
          }
        }
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

      const shouldDeleteGuestData = hasGuestWorkspaceData && guestDataPreference === 'DELETE';
      if (hasGuestWorkspaceData) {
        applyGuestDataDecision(guestDataPreference);
      }
      persistSignupTrialSelection(signupTrialEnabled);
      if (shouldDeleteGuestData && typeof window !== 'undefined') {
        window.location.replace(`${window.location.pathname}${window.location.hash}`);
        return;
      }

      setInfoMessage(appLanguage === 'AR'
        ? 'تم إنشاء الحساب بنجاح. سيتم تسجيل الدخول تلقائيًا.'
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
      const shouldDeleteGuestData = hasGuestWorkspaceData && guestDataPreference === 'DELETE';
      if (hasGuestWorkspaceData) {
        applyGuestDataDecision(guestDataPreference);
      }
      if (shouldDeleteGuestData && typeof window !== 'undefined') {
        window.location.replace(`${window.location.pathname}${window.location.hash}`);
        return;
      }
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
    if (authMode === 'REGISTER') {
      persistSignupTrialSelection(signupTrialEnabled);
    }
    const shouldDeleteGuestData = hasGuestWorkspaceData && guestDataPreference === 'DELETE';
    if (!shouldDeleteGuestData && typeof window !== 'undefined') {
      localStorage.removeItem(PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY);
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      if (shouldPreferRedirectAuth()) {
        if (shouldDeleteGuestData && typeof window !== 'undefined') {
          localStorage.setItem(PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY, '1');
        }
        setInfoMessage(appLanguage === 'AR'
          ? 'سيتم تحويلك إلى Google لإكمال تسجيل الدخول.'
          : 'Redirecting to Google sign-in...');
        await signInWithRedirect(firebaseAuth, provider);
        return;
      }

      try {
        await signInWithPopup(firebaseAuth, provider);
        if (hasGuestWorkspaceData) {
          applyGuestDataDecision(guestDataPreference);
        }
        if (shouldDeleteGuestData && typeof window !== 'undefined') {
          window.location.replace(`${window.location.pathname}${window.location.hash}`);
          return;
        }
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: string }).code || '')
          : '';
        if (
          code === 'auth/popup-blocked' ||
          code === 'auth/cancelled-popup-request' ||
          code === 'auth/operation-not-supported-in-this-environment'
        ) {
          if (shouldDeleteGuestData && typeof window !== 'undefined') {
            localStorage.setItem(PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY, '1');
          }
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

  const handleGuestLogin = () => {
    setErrorMessage('');
    setInfoMessage('');

    const trial = resolveGuestTrialWindow();
    if (trial.expired) {
      setErrorMessage(trialExpiredText);
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(GUEST_TRIAL_START_KEY, trial.startedAt);
    }

    setCurrentUser({
      id: GUEST_USER_ID,
      name: 'Guest User',
      email: GUEST_USER_EMAIL,
      role: 'ADMIN',
      status: 'ACTIVE',
      companyId: currentCompanyId || 'cmp_default',
      lastActive: new Date().toISOString(),
      guestTrialStartedAt: trial.startedAt,
      guestTrialEndsAt: trial.endsAt
    });
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
            src={DEFAULT_BRAND_LOGO_URL}
            alt={t('auth.appName')}
            className="w-full max-w-[23rem] mx-auto drop-shadow-[0_0_36px_rgba(34,211,238,0.2)]"
          />
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-2xl space-y-6 animate-in zoom-in-95 duration-500 delay-300">
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-center text-[11px] font-bold text-amber-700">
            {firebaseNote}
          </div>

          {(hasGuestWorkspaceData || guestTrialExpired) && (
            <div className={`rounded-2xl px-4 py-3 text-[11px] font-bold border text-center ${guestTrialExpired
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-blue-200 bg-blue-50 text-blue-700'
              }`}>
              {guestTrialExpired ? trialExpiredText : trialStatusText}
            </div>
          )}

          {hasGuestWorkspaceData && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-[11px] font-black text-slate-700 text-center">
                {appLanguage === 'AR'
                  ? 'عند التسجيل: اختر ما تريد فعله ببيانات تجربة الضيف'
                  : 'On sign-in/register: choose what to do with guest trial data'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGuestDataPreference('KEEP')}
                  className={`rounded-xl border px-3 py-2 text-[11px] font-black transition ${guestDataPreference === 'KEEP'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 bg-white text-slate-600'
                    }`}
                >
                  {appLanguage === 'AR' ? 'الاحتفاظ بالبيانات' : 'Keep data'}
                </button>
                <button
                  type="button"
                  onClick={() => setGuestDataPreference('DELETE')}
                  className={`rounded-xl border px-3 py-2 text-[11px] font-black transition ${guestDataPreference === 'DELETE'
                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                    : 'border-gray-200 bg-white text-slate-600'
                    }`}
                >
                  {appLanguage === 'AR' ? 'حذف البيانات' : 'Delete data'}
                </button>
              </div>
            </div>
          )}

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

                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 space-y-2">
                    <div className="text-[11px] font-black text-indigo-700 text-center">
                      {appLanguage === 'AR' ? 'خيار ما بعد التسجيل' : 'Post-registration option'}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSignupTrialEnabled(true)}
                        className={`rounded-lg border px-2 py-2 text-[11px] font-black transition ${signupTrialEnabled
                          ? 'border-indigo-300 bg-white text-indigo-700'
                          : 'border-indigo-100 bg-indigo-50 text-indigo-500'
                          }`}
                      >
                        {appLanguage === 'AR' ? 'تجربة 14 يوم' : '14-day trial'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSignupTrialEnabled(false)}
                        className={`rounded-lg border px-2 py-2 text-[11px] font-black transition ${!signupTrialEnabled
                          ? 'border-rose-300 bg-white text-rose-700'
                          : 'border-indigo-100 bg-indigo-50 text-indigo-500'
                          }`}
                      >
                        {appLanguage === 'AR' ? 'بدون تجربة' : 'No trial'}
                      </button>
                    </div>
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
                <button
                  type="button"
                  onClick={handleGuestLogin}
                  disabled={authBusy || guestTrialExpired}
                  className="w-full py-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-bold text-sm hover:bg-slate-200 transition-all disabled:opacity-70"
                >
                  {t('auth.guestLogin')}
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

