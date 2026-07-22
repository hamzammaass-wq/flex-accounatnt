import React, { useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { BadgeCheck, Building2, CheckCircle2, Clock3, KeyRound, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { firebaseAuth, firebaseDb, isFirebaseAuthEnabled } from '../firebaseClient';
import { doc, getDoc } from 'firebase/firestore';
import { translate, isCodeEmail, extractCodeFromEmail } from '../utils/i18n';
import { clearWorkspaceSnapshotStorage, hasAnyWorkspaceSnapshotRecord } from '../utils/workspaceSnapshotStorage';
import PolicyGuideScreen from './PolicyGuideScreen';
import authScreenLogo from '../FLEX ACCOUNTANT LOGO.png';

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

const isMobile = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
};

const isIOSStandalone = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /ipad|iphone|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false) || (navigator as any).standalone === true;
  return isIOS && standalone;
};

const shouldPreferRedirectAuth = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isIOSStandalone()) return false;
  if (isMobile()) return true;
  const standalone = (typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false) || (navigator as any).standalone === true;
  return standalone;
};

const getFirebaseErrorMessage = (error: unknown, language: 'AR' | 'EN'): string => {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code || '')
    : '';
  const fallback = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: string }).message || '')
    : '';
  const currentHost = typeof window !== 'undefined' ? window.location.host : '';

  if (
    code === 'auth/missing-initial-state' || 
    code === 'auth/web-storage-unsupported' || 
    fallback.toLowerCase().includes('missing initial state') ||
    fallback.toLowerCase().includes('storage-partitioned')
  ) {
    return language === 'AR'
      ? 'تعذر إكمال تسجيل الدخول عبر Google بسبب قيود الخصوصية وحظر ملفات تعريف الارتباط في متصفحك (Safari/iOS). يرجى تسجيل الدخول باستخدام البريد الإلكتروني.'
      : 'Could not complete Google sign-in due to browser privacy/cookie restrictions (Safari/iOS). Please sign in using your Email.';
  }

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
  const [loginType, setLoginType] = useState<'EMAIL' | 'CODE'>('EMAIL');
  const [registerType, setRegisterType] = useState<'EMAIL' | 'CODE'>('EMAIL');
  const [loginCode, setLoginCode] = useState('');
  const [regCode, setRegCode] = useState('');
  const [guestDataPreference] = useState<GuestDataPreference>('KEEP');
  const [hasGuestWorkspaceData, setHasGuestWorkspaceData] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [infoMode, setInfoMode] = useState<AuthInfoMode>('NONE');
  const [showIosGuide, setShowIosGuide] = useState(false);

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

      if (Capacitor.isNativePlatform()) {
        if (!cancelled) setSessionCheckLoading(false);
        return;
      }

      setSessionCheckLoading(true);
      try {
        const redirectResult = await getRedirectResult(firebaseAuth);
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

            } else {

            }
          }
        }
      } catch (error) {
        console.error('[Redirect Auth Error]', error);
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

    persistSignupCompanyName(regCompanyName);

    try {
      let emailToUse = regEmail.trim();
      if (registerType === 'CODE') {
        const trimmedCode = regCode.trim();
        if (!trimmedCode) {
          setErrorMessage(appLanguage === 'AR' ? 'يرجى إدخال كود الحساب.' : 'Please enter the account code.');
          setLoading(false);
          return;
        }
        if (!/^[a-zA-Z0-9_.-]{3,}$/.test(trimmedCode)) {
          setErrorMessage(
            appLanguage === 'AR'
              ? 'يجب أن يتكون كود الحساب من 3 أحرف أو أرقام على الأقل، بدون مسافات أو رموز خاصة.'
              : 'Account code must be at least 3 characters or numbers, without spaces or special characters.'
          );
          setLoading(false);
          return;
        }
        emailToUse = `code_${trimmedCode.toLowerCase()}@smart.local`;
      }

      const credential = await createUserWithEmailAndPassword(firebaseAuth, emailToUse, regPassword);
      const fullName = regFullName.trim();
      if (fullName) {
        await updateProfile(credential.user, { displayName: fullName });
      }


      const shouldDeleteGuestData = hasGuestWorkspaceData && guestDataPreference === 'DELETE';
      if (hasGuestWorkspaceData) {
        await applyGuestDataDecision(guestDataPreference);
      }
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
      let emailToUse = loginEmail.trim();
      if (loginType === 'CODE') {
        const trimmedCode = loginCode.trim().toLowerCase();
        if (!trimmedCode) {
          setErrorMessage(appLanguage === 'AR' ? 'يرجى إدخال كود الحساب.' : 'Please enter the account code.');
          setLoading(false);
          return;
        }

        let mappedEmail = '';
        try {
          if (firebaseDb) {
            const snap = await getDoc(doc(firebaseDb, 'account_codes', trimmedCode));
            if (snap.exists()) {
              mappedEmail = snap.data().email || '';
            }
          }
        } catch (dbErr) {
          console.warn('[Account Code Lookup Failed]', dbErr);
        }

        emailToUse = mappedEmail || `code_${trimmedCode}@smart.local`;
      }
      await signInWithEmailAndPassword(firebaseAuth, emailToUse, loginPassword);
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

    if (authMode === 'REGISTER') {
      if (!regCompanyName.trim()) {
        setErrorMessage(appLanguage === 'AR' ? 'يرجى إدخال اسم الشركة.' : 'Please enter the company name.');
        return;
      }
      persistSignupCompanyName(regCompanyName);
    }

    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');
    const shouldDeleteGuestData = hasGuestWorkspaceData && guestDataPreference === 'DELETE';
    if (!shouldDeleteGuestData && typeof window !== 'undefined') {
      localStorage.removeItem(PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY);
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        if (result.credential?.idToken) {
          const credential = GoogleAuthProvider.credential(result.credential.idToken);
          const userCred = await signInWithCredential(firebaseAuth, credential);
          if (authMode === 'REGISTER') {
            const additionalInfo = getAdditionalUserInfo(userCred);
            if (additionalInfo?.isNewUser) {

            } else {

            }
          }
          if (hasGuestWorkspaceData) {
            await applyGuestDataDecision(guestDataPreference);
          }
          if (shouldDeleteGuestData && typeof window !== 'undefined') {
            window.location.replace(`${window.location.pathname}${window.location.hash}`);
            return;
          }
        } else {
          throw new Error('No ID token returned from Google Sign-In.');
        }
        return;
      }

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

          } else {

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
    } catch (error: any) {
      console.error('[Google Sign-In Error]', error);
      if (authMode === 'REGISTER') {

      }
      setErrorMessage(getFirebaseErrorMessage(error, appLanguage));
    } finally {
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
        tone: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
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
        tone: 'border-rose-500/20 bg-rose-500/5 text-rose-400',
        icon: ShieldCheck,
        description: appLanguage === 'AR'
          ? 'الحساب موجود لكن الوصول موقوف ويحتاج مراجعة أو تفعيل من الإدارة.'
          : 'The account exists, but access is suspended and needs activation or review.'
      };
    }

    if (companyAccessStatus === 'TRIAL') {
      return {
        badge: appLanguage === 'AR' ? 'تجربة مجانية' : 'Free trial',
        tone: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
        icon: Clock3,
        description: appLanguage === 'AR'
          ? `التجربة فعالة حاليًا والمتبقي ${companyAccessDaysLeft} يوم.`
          : `The trial is currently active with ${companyAccessDaysLeft} day(s) left.`
      };
    }

    return {
      badge: appLanguage === 'AR' ? 'بحاجة إلى تفعيل' : 'Needs activation',
      tone: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
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
    <div className="min-h-dvh bg-[#071120] flex items-center justify-center p-4 sm:p-6 font-tajawal relative overflow-x-hidden w-full">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.14),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.12),transparent_24%),linear-gradient(180deg,#071120_0%,#0b1630_100%)] pointer-events-none"></div>
      <div className="fixed top-[-8%] right-[-10%] w-[440px] h-[440px] bg-cyan-400/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="fixed bottom-[-10%] left-[-12%] w-[440px] h-[440px] bg-violet-500/12 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-center gap-10 lg:gap-16 w-full max-w-6xl my-auto pt-8 pb-10">
        
        {/* Landing Page Info for Google OAuth Review */}
        <div className="w-full max-w-lg lg:max-w-xl text-center lg:text-right space-y-6 text-white animate-in fade-in slide-in-from-right-10 duration-700 mx-auto lg:mx-0" dir={appLanguage === 'AR' ? 'rtl' : 'ltr'}>
          <div className="inline-flex px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold mb-2">
            {appLanguage === 'AR' ? 'الإصدار السحابي' : 'Cloud Edition'}
          </div>
          <h1 className="text-4xl lg:text-5xl font-black leading-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
            {appLanguage === 'AR' ? 'نظام فليكس المحاسبي' : 'Flex Accountant System'}
          </h1>
          <p className="text-lg text-slate-300 font-medium leading-relaxed">
            {appLanguage === 'AR' 
              ? 'الحل السحابي المتكامل لإدارة أعمالك التجارية. تتبع المبيعات، المشتريات، المخزون، والحسابات بكل سهولة وأمان، ومن أي مكان.' 
              : 'The complete cloud solution for managing your business. Track sales, purchases, inventory, and accounts with ease and security, from anywhere.'}
          </p>
          <div className="grid grid-cols-2 gap-4 pt-4">
             <div className="bg-slate-900/50 border border-slate-800/80 p-5 rounded-2xl flex flex-col items-center lg:items-start text-center lg:text-right transition-all hover:bg-slate-800/50">
                <Building2 className="w-8 h-8 text-cyan-400 mb-3" />
                <h3 className="font-bold text-sm text-slate-200">{appLanguage === 'AR' ? 'إدارة متكاملة' : 'Complete Management'}</h3>
                <p className="text-xs text-slate-400 mt-1">{appLanguage === 'AR' ? 'لجميع الأنشطة التجارية' : 'For all business types'}</p>
             </div>
             <div className="bg-slate-900/50 border border-slate-800/80 p-5 rounded-2xl flex flex-col items-center lg:items-start text-center lg:text-right transition-all hover:bg-slate-800/50">
                <BadgeCheck className="w-8 h-8 text-emerald-400 mb-3" />
                <h3 className="font-bold text-sm text-slate-200">{appLanguage === 'AR' ? 'تقارير دقيقة' : 'Accurate Reports'}</h3>
                <p className="text-xs text-slate-400 mt-1">{appLanguage === 'AR' ? 'متابعة الأرباح والخسائر' : 'Track P&L in real-time'}</p>
             </div>
          </div>
        </div>

        {/* Auth Form Container */}
        <div className="w-full max-w-lg relative mx-auto lg:mx-0 flex flex-col">
          <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-10 duration-700">
            <img
              src={AUTH_SCREEN_LOGO_URL}
              alt={t('auth.appName')}
              className="mx-auto w-full max-w-[20rem] sm:max-w-[22rem] rounded-[2rem] border border-cyan-300/10 shadow-[0_28px_90px_rgba(2,6,23,0.58)] object-contain"
            />
          </div>

          <div className="bg-slate-900/40 backdrop-blur-xl p-6 sm:p-8 rounded-[2.5rem] border border-slate-800/80 shadow-[0_30px_100px_rgba(0,0,0,0.6)] space-y-6 animate-in zoom-in-95 duration-500 delay-300 w-full">
          <div className={`rounded-[1.6rem] border px-4 py-4 ${accessStatusMeta.tone}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-black opacity-80 text-slate-300">
                  {appLanguage === 'AR' ? 'حالة الوصول الحالية' : 'Current access status'}
                </div>
                <div className="mt-1 text-sm font-black text-white">{currentCompany?.name || t('auth.appName')}</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-950/80 border border-slate-800 px-3 py-1 text-[11px] font-black shadow-sm text-slate-300">
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
              ? 'border-red-500/20 bg-red-500/5 text-red-400'
              : 'border-blue-500/20 bg-blue-500/5 text-blue-400'
              }`}>
              {guestTrialExpired ? trialExpiredText : trialStatusText}
            </div>
          )}

          <div className="grid grid-cols-2 bg-slate-950/40 border border-slate-800/50 rounded-full p-1 gap-1">
            <button
              type="button"
              onClick={() => setAuthMode('LOGIN')}
              className={`flex-1 text-xs font-bold py-2.5 rounded-full transition-all ${authMode === 'LOGIN' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {loginTitle}
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('REGISTER')}
              className={`flex-1 text-xs font-bold py-2.5 rounded-full transition-all ${authMode === 'REGISTER' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {registerTitle}
            </button>
          </div>

          {errorMessage && (
            <div className="bg-red-500/10 text-red-400 text-[11px] font-bold p-3 rounded-xl border border-red-500/20 text-center animate-in fade-in duration-300">
              {errorMessage}
            </div>
          )}

          {infoMessage && (
            <div className="bg-emerald-500/10 text-emerald-400 text-[11px] font-bold p-3 rounded-xl border border-emerald-500/20 text-center animate-in fade-in duration-300">
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
                  <div className="grid grid-cols-2 bg-slate-950/20 border border-slate-800/60 rounded-xl p-1 gap-1 mb-2">
                    <button
                      type="button"
                      onClick={() => setLoginType('EMAIL')}
                      className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${loginType === 'EMAIL' ? 'bg-slate-800 text-white shadow-sm border border-slate-700' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      {appLanguage === 'AR' ? 'البريد الإلكتروني' : 'Email'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoginType('CODE')}
                      className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${loginType === 'CODE' ? 'bg-slate-800 text-white shadow-sm border border-slate-700' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      {appLanguage === 'AR' ? 'كود الحساب' : 'Account Code'}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {loginType === 'EMAIL' ? (
                      <div className="relative">
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          <Mail className="w-4 h-4 text-slate-400" />
                        </div>
                        <input
                          type="email"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className="w-full bg-slate-950/50 border border-slate-700/50 text-white text-sm rounded-2xl focus:ring-4 focus:ring-blue-500/30 focus:border-blue-400 block pr-10 p-4 placeholder-slate-500 transition-all duration-300 hover:border-slate-600 shadow-inner"
                          placeholder={appLanguage === 'AR' ? 'البريد الإلكتروني' : 'Email'}
                        />
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          <KeyRound className="w-4 h-4 text-slate-400" />
                        </div>
                        <input
                          type="text"
                          required
                          value={loginCode}
                          onChange={(e) => setLoginCode(e.target.value)}
                          className="w-full bg-slate-950/50 border border-slate-700/50 text-white text-sm rounded-2xl focus:ring-4 focus:ring-blue-500/30 focus:border-blue-400 block pr-10 p-4 placeholder-slate-500 transition-all duration-300 hover:border-slate-600 shadow-inner"
                          placeholder={appLanguage === 'AR' ? 'كود الحساب' : 'Account Code'}
                        />
                      </div>
                    )}
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <Lock className="w-4 h-4 text-slate-400" />
                      </div>
                      <input
                        type="password"
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full bg-slate-950/50 border border-slate-700/50 text-white text-sm rounded-2xl focus:ring-4 focus:ring-blue-500/30 focus:border-blue-400 block pr-10 p-4 placeholder-slate-500 transition-all duration-300 hover:border-slate-600 shadow-inner"
                        placeholder={appLanguage === 'AR' ? 'كلمة المرور' : 'Password'}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authBusy || !isFirebaseMode}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black rounded-2xl text-sm px-5 py-4 text-center flex items-center justify-center transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(37,99,235,0.4)] disabled:opacity-70 disabled:hover:scale-100"
                  >
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : loginTitle}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="grid grid-cols-2 bg-slate-950/20 border border-slate-800/60 rounded-xl p-1 gap-1 mb-2">
                    <button
                      type="button"
                      onClick={() => setRegisterType('EMAIL')}
                      className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${registerType === 'EMAIL' ? 'bg-slate-800 text-white shadow-sm border border-slate-700' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      {appLanguage === 'AR' ? 'البريد الإلكتروني' : 'Email'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegisterType('CODE')}
                      className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${registerType === 'CODE' ? 'bg-slate-800 text-white shadow-sm border border-slate-700' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      {appLanguage === 'AR' ? 'كود الحساب' : 'Account Code'}
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <Building2 className="w-4 h-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        required
                        value={regCompanyName}
                        onChange={(e) => setRegCompanyName(e.target.value)}
                        className="w-full bg-slate-950/50 border border-slate-700/50 text-white text-sm rounded-2xl focus:ring-4 focus:ring-blue-500/30 focus:border-blue-400 block pr-10 p-4 placeholder-slate-500 transition-all duration-300 hover:border-slate-600 shadow-inner"
                        placeholder={appLanguage === 'AR' ? 'اسم الشركة' : 'Company name'}
                      />
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <User className="w-4 h-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        required
                        value={regFullName}
                        onChange={(e) => setRegFullName(e.target.value)}
                        className="w-full bg-slate-950/50 border border-slate-700/50 text-white text-sm rounded-2xl focus:ring-4 focus:ring-blue-500/30 focus:border-blue-400 block pr-10 p-4 placeholder-slate-500 transition-all duration-300 hover:border-slate-600 shadow-inner"
                        placeholder={appLanguage === 'AR' ? 'الاسم الكامل' : 'Full name'}
                      />
                    </div>
                    {registerType === 'EMAIL' ? (
                      <div className="relative">
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          <Mail className="w-4 h-4 text-slate-400" />
                        </div>
                        <input
                          type="email"
                          required
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          className="w-full bg-slate-950/50 border border-slate-700/50 text-white text-sm rounded-2xl focus:ring-4 focus:ring-blue-500/30 focus:border-blue-400 block pr-10 p-4 placeholder-slate-500 transition-all duration-300 hover:border-slate-600 shadow-inner"
                          placeholder={appLanguage === 'AR' ? 'البريد الإلكتروني' : 'Email'}
                        />
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          <KeyRound className="w-4 h-4 text-slate-400" />
                        </div>
                        <input
                          type="text"
                          required
                          value={regCode}
                          onChange={(e) => setRegCode(e.target.value)}
                          className="w-full bg-slate-950/50 border border-slate-700/50 text-white text-sm rounded-2xl focus:ring-4 focus:ring-blue-500/30 focus:border-blue-400 block pr-10 p-4 placeholder-slate-500 transition-all duration-300 hover:border-slate-600 shadow-inner"
                          placeholder={appLanguage === 'AR' ? 'كود الحساب' : 'Account Code'}
                        />
                      </div>
                    )}
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <Lock className="w-4 h-4 text-slate-400" />
                      </div>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full bg-slate-950/50 border border-slate-700/50 text-white text-sm rounded-2xl focus:ring-4 focus:ring-blue-500/30 focus:border-blue-400 block pr-10 p-4 placeholder-slate-500 transition-all duration-300 hover:border-slate-600 shadow-inner"
                        placeholder={appLanguage === 'AR' ? 'كلمة المرور (6 أحرف على الأقل)' : 'Password (at least 6 characters)'}
                      />
                    </div>
                  </div>

                  <div className="text-[11px] font-medium text-slate-400 text-center">
                    {registerHelper}
                  </div>

                  <button
                    type="submit"
                    disabled={authBusy || !isFirebaseMode}
                    className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black rounded-2xl text-sm px-5 py-4 text-center flex items-center justify-center transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] disabled:opacity-70 disabled:hover:scale-100"
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
                  className="w-full py-3.5 bg-slate-950/60 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-200 font-bold text-sm hover:bg-slate-900 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
                >
                  <GoogleLogo className="w-5 h-5" />
                  {appLanguage === 'AR' ? 'المتابعة عبر Google' : 'Continue with Google'}
                </button>
                <button
                  type="button"
                  onClick={handleGuestLogin}
                  disabled={authBusy || guestTrialExpired}
                  data-testid="auth-guest-login"
                  className="w-full py-3.5 bg-slate-800/40 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-300 font-bold text-sm hover:bg-slate-800/60 transition-all disabled:opacity-70"
                >
                  {t('auth.guestLogin')}
                </button>
              </div>

              {/* Download Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 mt-6 pt-6 border-t border-slate-800/60 w-full justify-center">
                <a
                  href="https://play.google.com/store/apps/details?id=com.smartaccountant.erp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 py-3 px-5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-200 transition-all hover:bg-slate-900 group flex-1"
                >
                  <svg viewBox="0 0 512 512" className="w-6 h-6 group-hover:scale-110 transition-transform">
                    <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z" fill="#00f076" />
                  </svg>
                  <div className="text-left leading-tight" dir="ltr">
                    <div className="text-[10px] text-slate-400 font-medium">GET IT ON</div>
                    <div className="text-sm font-bold">Google Play</div>
                  </div>
                </a>
                <button
                  type="button"
                  onClick={() => setShowIosGuide(true)}
                  className="flex items-center justify-center gap-3 py-3 px-5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-200 transition-all hover:bg-slate-900 group flex-1"
                >
                  <svg viewBox="0 0 384 512" className="w-6 h-6 fill-current group-hover:scale-110 transition-transform">
                    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
                  </svg>
                  <div className="text-left leading-tight" dir="ltr">
                    <div className="text-[10px] text-slate-400 font-medium">Download on the</div>
                    <div className="text-sm font-bold">App Store</div>
                  </div>
                </button>
              </div>

              <div className="text-center text-[11px] text-slate-400 font-bold leading-6 mt-4">
                <a
                  href="/pricing.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-blue-400 transition-colors"
                >
                  {appLanguage === 'AR' ? 'الأسعار' : 'Pricing'}
                </a>
                <span className="mx-2 text-slate-600">|</span>
                <a
                  href="/privacy-policy.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-blue-400 transition-colors"
                >
                  {appLanguage === 'AR' ? 'سياسة الخصوصية' : 'Privacy Policy'}
                </a>
                <span className="mx-2 text-slate-600">|</span>
                <a
                  href="/terms-of-service.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-blue-400 transition-colors"
                >
                  {appLanguage === 'AR' ? 'شروط الخدمة' : 'Terms of Service'}
                </a>
                <span className="mx-2 text-slate-600">|</span>
                <a
                  href="/refund-policy.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-blue-400 transition-colors"
                >
                  {appLanguage === 'AR' ? 'سياسة الاسترجاع' : 'Refund Policy'}
                </a>
                <span className="mx-2 text-slate-600">|</span>
                <a
                  href="/account-deletion.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-blue-400 transition-colors"
                >
                  {appLanguage === 'AR' ? 'حذف الحساب' : 'Account Deletion'}
                </a>
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

      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-700/50 rounded-[2rem] p-6 max-w-sm w-full shadow-2xl relative" dir={appLanguage === 'AR' ? 'rtl' : 'ltr'}>
            <button
              onClick={() => setShowIosGuide(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center shadow-inner">
                <svg viewBox="0 0 384 512" className="w-8 h-8 fill-current text-white"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
              </div>
            </div>
            <h3 className="text-xl font-bold text-white text-center mb-2">
              {appLanguage === 'AR' ? 'تثبيت التطبيق على iOS' : 'Install App on iOS'}
            </h3>
            <p className="text-sm text-slate-300 text-center mb-6">
              {appLanguage === 'AR' 
                ? 'للحصول على أفضل تجربة، يمكنك تثبيت التطبيق على الشاشة الرئيسية لجهازك.' 
                : 'For the best experience, you can install the app on your home screen.'}
            </p>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">1</div>
                <div className="text-sm text-slate-300">
                  {appLanguage === 'AR' 
                    ? <>افتح متصفح <strong>Safari</strong></>
                    : <>Open the <strong>Safari</strong> browser</>}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">2</div>
                <div className="text-sm text-slate-300 flex-1">
                  {appLanguage === 'AR' 
                    ? <>اضغط على زر المشاركة في أسفل الشاشة</>
                    : <>Tap the Share button at the bottom of the screen</>}
                  <div className="mt-2 flex justify-center">
                    <div className="bg-slate-800 rounded-lg p-2">
                      <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">3</div>
                <div className="text-sm text-slate-300">
                  {appLanguage === 'AR' 
                    ? <>اختر <strong>"إضافة إلى الصفحة الرئيسية"</strong> (Add to Home Screen)</>
                    : <>Select <strong>"Add to Home Screen"</strong></>}
                  <div className="mt-2 flex justify-center">
                    <div className="bg-slate-800 rounded-lg p-2">
                      <svg className="w-5 h-5 text-slate-200" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowIosGuide(false)}
              className="w-full mt-6 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
            >
              {appLanguage === 'AR' ? 'حسناً، فهمت' : 'Got it'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthScreen;

