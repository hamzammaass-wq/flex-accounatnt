import React, { useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
} from 'firebase/auth';
import { BadgeCheck, Building2, CheckCircle2, Clock3, KeyRound, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { firebaseAuth, isFirebaseAuthEnabled } from '../firebaseClient';
import { translate } from '../utils/i18n';
import { clearWorkspaceSnapshotStorage, hasAnyWorkspaceSnapshotRecord } from '../utils/workspaceSnapshotStorage';
import PolicyGuideScreen from './PolicyGuideScreen';
import authScreenLogo from '../AI FLEX LOGO.png';

type AuthMode = 'LOGIN' | 'REGISTER';
type AuthInfoMode = 'NONE' | 'POLICY' | 'USAGE_GUIDE';
type GuestDataPreference = 'KEEP' | 'DELETE';
const GUEST_USER_ID = 'guest_user';
const GUEST_USER_EMAIL = 'guest@smart.local';
const GUEST_TRIAL_DAYS = 14;
const GUEST_TRIAL_START_KEY = 'al_mohaseb_guest_trial_started_at';
const FORCE_EMPTY_BOOTSTRAP_KEY = 'al_mohaseb_force_empty_bootstrap';
const APP_STORAGE_PREFIX = 'al_mohaseb_';
const PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY = 'al_mohaseb_pending_guest_delete_after_redirect';
const SIGNUP_COMPANY_NAME_KEY = 'al_mohaseb_signup_company_name';
const SIGNUP_INTENT_KEY = 'al_mohaseb_signup_intent';
const INITIAL_SETUP_PENDING_KEY = 'al_mohaseb_initial_setup_pending';
const ACCOUNT_DELETED_NOTICE_KEY = 'al_mohaseb_account_deleted_notice';
const SIGNUP_INTENT_REGISTER = 'REGISTER';
const AUTH_SCREEN_LOGO_URL = authScreenLogo;

const safeStorageGet = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeStorageSet = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures and keep auth screen usable.
  }
};

const safeStorageRemove = (key: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures and keep auth screen usable.
  }
};

const safeStorageKeys = (storage: Storage): string[] => {
  try {
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean) as string[];
  } catch {
    return [];
  }
};

const shouldPreferRedirectAuth = (): boolean => {
  if (typeof window === 'undefined') return false;
  const standalone = (typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false) || (navigator as any).standalone === true;
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
  const currentHost = typeof window !== 'undefined' ? window.location.host : '';

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
  if (code === 'auth/unauthorized-domain') {
    return language === 'AR'
      ? `هذا النطاق غير مصرح به في Firebase Authentication${currentHost ? ` (${currentHost})` : ''}. أضفه من Firebase Console > Authentication > Settings > Authorized domains ثم أعد المحاولة.`
      : `This domain is not authorized in Firebase Authentication${currentHost ? ` (${currentHost})` : ''}. Add it in Firebase Console > Authentication > Settings > Authorized domains, then try again.`;
  }
  if (code === 'auth/operation-not-allowed') {
    return language === 'AR'
      ? 'طريقة تسجيل الدخول هذه غير مفعلة في Firebase. فعّل مزود Email/Password أو Google من Firebase Console.'
      : 'This sign-in method is not enabled in Firebase. Enable the Email/Password or Google provider in Firebase Console.';
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
  const {
    companySettings,
    setCurrentUser,
    currentCompanyId,
    currentCompany,
    companyAccessStatus,
    companyAccessDaysLeft,
    companyAccessEndsAt
  } = useAccounting();
  const isFirebaseMode = isFirebaseAuthEnabled && Boolean(firebaseAuth);
  const [authMode, setAuthMode] = useState<AuthMode>('LOGIN');
  const [loading, setLoading] = useState(false);
  const [sessionCheckLoading, setSessionCheckLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [guestDataPreference] = useState<GuestDataPreference>('KEEP');
  const [hasGuestWorkspaceData, setHasGuestWorkspaceData] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [infoMode, setInfoMode] = useState<AuthInfoMode>('NONE');

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

  const markSignupFlowIntent = () => {
    if (typeof window === 'undefined') return;
    safeStorageSet(SIGNUP_INTENT_KEY, SIGNUP_INTENT_REGISTER);
  };

  const clearSignupFlowIntent = () => {
    if (typeof window === 'undefined') return;
    safeStorageRemove(SIGNUP_INTENT_KEY);
  };

  const markInitialSetupPending = () => {
    if (typeof window === 'undefined') return;
    safeStorageSet(INITIAL_SETUP_PENDING_KEY, '1');
    clearSignupFlowIntent();
  };

  const removeAppPrefixedStorage = async () => {
    if (typeof window === 'undefined') return;
    const removeMatching = (storage: Storage) => {
      const keys = safeStorageKeys(storage);
      keys.forEach((key) => {
        if (key.startsWith(APP_STORAGE_PREFIX)) {
          try {
            storage.removeItem(key);
          } catch {
            // Ignore per-key cleanup failures.
          }
        }
      });
    };

    removeMatching(window.localStorage);
    removeMatching(window.sessionStorage);
    await clearWorkspaceSnapshotStorage();
  };

  const applyGuestDataDecision = async (decision: GuestDataPreference) => {
    if (typeof window === 'undefined') return;
    safeStorageRemove(PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY);
    if (decision === 'DELETE') {
      await removeAppPrefixedStorage();
      safeStorageSet(FORCE_EMPTY_BOOTSTRAP_KEY, '1');
      setHasGuestWorkspaceData(false);
    }
  };

  const persistSignupCompanyName = (name: string) => {
    if (typeof window === 'undefined') return;
    const normalized = name.trim();
    if (normalized) {
      safeStorageSet(SIGNUP_COMPANY_NAME_KEY, normalized);
    } else {
      safeStorageRemove(SIGNUP_COMPANY_NAME_KEY);
    }
  };

  const resolveGuestTrialWindow = () => {
    if (typeof window === 'undefined') {
      const now = new Date();
      const endsAt = new Date(now.getTime() + GUEST_TRIAL_DAYS * 24 * 60 * 60 * 1000);
      return { startedAt: now.toISOString(), endsAt: endsAt.toISOString(), expired: false };
    }

    const now = new Date();
    const fallbackStart = now.toISOString();
    const storedStart = safeStorageGet(GUEST_TRIAL_START_KEY) || fallbackStart;
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
    let cancelled = false;

    const detectGuestWorkspaceData = async () => {
      const hasWorkspaceInLocalStorage = safeStorageKeys(window.localStorage)
        .some((key) => key.startsWith('al_mohaseb_workspace_'));
      const hasWorkspaceInIndexedDb = await hasAnyWorkspaceSnapshotRecord();
      const hasTrialMeta = Boolean(safeStorageGet(GUEST_TRIAL_START_KEY));
      if (!cancelled) {
        setHasGuestWorkspaceData(hasWorkspaceInLocalStorage || hasWorkspaceInIndexedDb || hasTrialMeta);
      }
    };

    void detectGuestWorkspaceData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const deletedNotice = safeStorageGet(ACCOUNT_DELETED_NOTICE_KEY);
    if (deletedNotice !== '1') return;
    setInfoMessage(appLanguage === 'AR'
      ? 'تم حذف الحساب من هذا الجهاز بنجاح. يمكنك تسجيل الدخول بحساب آخر في أي وقت.'
      : 'The account was deleted successfully from this device. You can sign in with another account at any time.');
    safeStorageRemove(ACCOUNT_DELETED_NOTICE_KEY);
  }, [appLanguage]);

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
        const redirectResult = await Promise.race([
          getRedirectResult(firebaseAuth),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
        ]);
        if (redirectResult && typeof window !== 'undefined') {
          const pendingDelete = localStorage.getItem(PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY) === '1';
          if (pendingDelete) {
            localStorage.removeItem(PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY);
            await applyGuestDataDecision('DELETE');
            window.location.replace(`${window.location.pathname}${window.location.hash}`);
            return;
          }

          const pendingSignup = localStorage.getItem(SIGNUP_INTENT_KEY) === SIGNUP_INTENT_REGISTER;
          if (pendingSignup) {
            const additionalInfo = getAdditionalUserInfo(redirectResult);
            if (additionalInfo?.isNewUser) {
              markInitialSetupPending();
            } else {
              clearSignupFlowIntent();
            }
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
    if (!regCompanyName.trim()) {
      setErrorMessage(appLanguage === 'AR' ? 'يرجى إدخال اسم الشركة.' : 'Please enter the company name.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, regEmail.trim(), regPassword);
      const fullName = regFullName.trim();
      if (fullName) {
        await updateProfile(credential.user, { displayName: fullName });
      }
      markInitialSetupPending();

      const shouldDeleteGuestData = hasGuestWorkspaceData && guestDataPreference === 'DELETE';
      if (hasGuestWorkspaceData) {
        await applyGuestDataDecision(guestDataPreference);
      }
      persistSignupCompanyName(regCompanyName);
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
        await applyGuestDataDecision(guestDataPreference);
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
      persistSignupCompanyName(regCompanyName);
      markSignupFlowIntent();
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
        const result = await signInWithPopup(firebaseAuth, provider);
        if (authMode === 'REGISTER') {
          const additionalInfo = getAdditionalUserInfo(result);
          if (additionalInfo?.isNewUser) {
            markInitialSetupPending();
          } else {
            clearSignupFlowIntent();
          }
        }
        if (hasGuestWorkspaceData) {
          await applyGuestDataDecision(guestDataPreference);
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
      if (authMode === 'REGISTER') {
        clearSignupFlowIntent();
      }
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
    ? 'أدخل اسم الشركة ليتم تجهيز أول مساحة عمل لك تلقائيًا بعد التسجيل.'
    : 'Add the company name so your first workspace is prepared automatically after sign-up.';
  const accessStatusMeta = useMemo(() => {
    if (companyAccessStatus === 'ACTIVE') {
      return {
        badge: appLanguage === 'AR' ? 'اشتراك نشط' : 'Subscription active',
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        icon: BadgeCheck,
        description: companyAccessDaysLeft > 0
          ? (appLanguage === 'AR'
            ? `الوصول مفعل حاليًا، والمتبقي ${companyAccessDaysLeft} يوم.`
            : `Access is active and has ${companyAccessDaysLeft} day(s) remaining.`)
          : (appLanguage === 'AR'
            ? 'الوصول مفعل حاليًا على هذه الشركة.'
            : 'Access is currently active for this company.')
      };
    }

    if (companyAccessStatus === 'SUSPENDED') {
      return {
        badge: appLanguage === 'AR' ? 'موقوف' : 'Suspended',
        tone: 'border-rose-200 bg-rose-50 text-rose-700',
        icon: ShieldCheck,
        description: appLanguage === 'AR'
          ? 'الحساب موجود لكن الوصول موقوف ويحتاج مراجعة أو تفعيل من الإدارة.'
          : 'The account exists, but access is suspended and needs activation or review.'
      };
    }

    if (companyAccessStatus === 'TRIAL') {
      return {
        badge: appLanguage === 'AR' ? 'تجربة مجانية' : 'Free trial',
        tone: 'border-blue-200 bg-blue-50 text-blue-700',
        icon: Clock3,
        description: appLanguage === 'AR'
          ? `التجربة فعالة حاليًا والمتبقي ${companyAccessDaysLeft} يوم.`
          : `The trial is currently active with ${companyAccessDaysLeft} day(s) left.`
      };
    }

    return {
      badge: appLanguage === 'AR' ? 'بحاجة إلى تفعيل' : 'Needs activation',
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
      icon: KeyRound,
      description: appLanguage === 'AR'
        ? 'يمكنك إنشاء الحساب الآن، ثم تفعيل الاشتراك لاحقًا من إدارة الشركة.'
        : 'You can create the account now and activate the subscription later from company settings.'
    };
  }, [appLanguage, companyAccessDaysLeft, companyAccessStatus]);
  const accessEndsAtLabel = companyAccessEndsAt
    ? new Date(companyAccessEndsAt).toLocaleDateString('en-GB')
    : '';
  const AccessStatusIcon = accessStatusMeta.icon;
  if (infoMode !== 'NONE') {
    return (
      <PolicyGuideScreen
        mode={infoMode === 'POLICY' ? 'POLICY' : 'USAGE_GUIDE'}
        language={appLanguage}
        onBack={() => setInfoMode('NONE')}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-[#071120] flex flex-col items-center justify-center p-4 sm:p-6 font-tajawal relative overflow-x-hidden overflow-y-auto w-full">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.14),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.12),transparent_24%),linear-gradient(180deg,#071120_0%,#0b1630_100%)] pointer-events-none"></div>
      <div className="fixed top-[-8%] right-[-10%] w-[440px] h-[440px] bg-cyan-400/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="fixed bottom-[-10%] left-[-12%] w-[440px] h-[440px] bg-violet-500/12 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="w-full max-w-lg relative z-10 pt-8 pb-10">
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-10 duration-700">
          <img
            src={AUTH_SCREEN_LOGO_URL}
            alt={t('auth.appName')}
            className="mx-auto w-full max-w-[22rem] sm:max-w-[25rem] rounded-[2rem] border border-cyan-300/10 shadow-[0_28px_90px_rgba(2,6,23,0.58)] object-contain"
          />
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-2xl space-y-6 animate-in zoom-in-95 duration-500 delay-300">
          <div className={`rounded-[1.6rem] border px-4 py-4 ${accessStatusMeta.tone}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-black opacity-80">
                  {appLanguage === 'AR' ? 'حالة الوصول الحالية' : 'Current access status'}
                </div>
                <div className="mt-1 text-sm font-black">{currentCompany?.name || t('auth.appName')}</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 text-[11px] font-black shadow-sm">
                <AccessStatusIcon className="w-3.5 h-3.5" />
                {accessStatusMeta.badge}
              </span>
            </div>
            <p className="mt-3 text-[12px] font-bold leading-6">
              {accessStatusMeta.description}
            </p>
            {accessEndsAtLabel ? (
              <div className="mt-3 text-[11px] font-black opacity-80">
                {appLanguage === 'AR' ? 'ينتهي في' : 'Ends on'}: {accessEndsAtLabel}
              </div>
            ) : null}
          </div>

          {(hasGuestWorkspaceData || guestTrialExpired) && (
            <div className={`rounded-2xl px-4 py-3 text-[11px] font-bold border text-center ${guestTrialExpired
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-blue-200 bg-blue-50 text-blue-700'
              }`}>
              {guestTrialExpired ? trialExpiredText : trialStatusText}
            </div>
          )}

          <div className="grid grid-cols-2 bg-gray-100 rounded-full p-1 gap-1">
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
                        <Building2 className="w-4 h-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        required
                        value={regCompanyName}
                        onChange={(e) => setRegCompanyName(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block pr-10 p-3"
                        placeholder={appLanguage === 'AR' ? 'اسم الشركة' : 'Company name'}
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
                <button
                  type="button"
                  onClick={handleGuestLogin}
                  disabled={authBusy || guestTrialExpired}
                  data-testid="auth-guest-login"
                  className="w-full py-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-bold text-sm hover:bg-slate-200 transition-all disabled:opacity-70"
                >
                  {t('auth.guestLogin')}
                </button>
              </div>

              <div className="text-center text-[11px] text-slate-500 font-bold leading-6">
                <button
                  type="button"
                  onClick={() => setInfoMode('POLICY')}
                  className="underline hover:text-slate-700 transition-colors"
                >
                  {appLanguage === 'AR' ? 'سياسة الخصوصية' : 'Privacy Policy'}
                </button>
                <span className="mx-2 text-slate-400">|</span>
                <button
                  type="button"
                  onClick={() => setInfoMode('USAGE_GUIDE')}
                  className="underline hover:text-slate-700 transition-colors"
                >
                  {appLanguage === 'AR' ? 'دليل الاستخدام' : 'Usage Guide'}
                </button>
                <span className="mx-2 text-slate-400">|</span>
                <button
                  type="button"
                  onClick={() => window.open('/account-deletion.html', '_blank', 'noopener,noreferrer')}
                  className="underline hover:text-slate-700 transition-colors"
                >
                  {appLanguage === 'AR' ? 'حذف الحساب' : 'Account Deletion'}
                </button>
              </div>

            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 text-[10px] text-gray-400 font-bold mt-6">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          {firebaseNote}
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

