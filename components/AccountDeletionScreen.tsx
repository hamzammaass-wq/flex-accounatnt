import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ExternalLink, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import {
  deleteUser as firebaseDeleteUser,
  EmailAuthProvider,
  getRedirectResult,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reauthenticateWithRedirect
} from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore';
import { useAccounting } from '../contexts/AccountingContext';
import { firebaseAuth, firebaseDb, isFirebaseAuthEnabled } from '../firebaseClient';
import { isCodeEmail, extractCodeFromEmail } from '../utils/i18n';

interface AccountDeletionScreenProps {
  language: 'AR' | 'EN';
  onBack: () => void;
}

const RESET_ALL_QUERY_PARAM = 'resetAllData';
const OPEN_ACCOUNT_DELETION_QUERY_PARAM = 'openAccountDeletion';
const PENDING_ACCOUNT_DELETE_REAUTH_KEY = 'al_mohaseb_pending_account_delete_reauth';
const ACCOUNT_DELETED_NOTICE_KEY = 'al_mohaseb_account_deleted_notice';
const GUEST_USER_ID = 'guest_user';
const WORKSPACE_SYNC_COLLECTION = 'workspace_sync_snapshots';
const WORKSPACE_SUBSCRIPTIONS_COLLECTION = 'workspace_subscriptions';
const SUBSCRIPTION_ADMINS_COLLECTION = 'subscription_admins';

const isSafariOrIOS = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /ipad|iphone|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium') && !ua.includes('crios') && !ua.includes('fxios');
  return isIOS || isSafari;
};

const shouldPreferRedirectAuth = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isSafariOrIOS()) return false;
  const standalone = (typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false) || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return standalone || /android|iphone|ipad|ipod/.test(userAgent);
};

const openPublicPage = (path: string) => {
  if (typeof window === 'undefined') return;
  window.open(path, '_blank', 'noopener,noreferrer');
};

const AccountDeletionScreen: React.FC<AccountDeletionScreenProps> = ({ language, onBack }) => {
  const { currentUser, companies, logout } = useAccounting();
  const [password, setPassword] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const isArabic = language === 'AR';
  const tr = (ar: string, en: string) => (isArabic ? ar : en);

  const authUser = firebaseAuth?.currentUser || null;
  const isGuestAccount = !currentUser || currentUser.id === GUEST_USER_ID;

  const authProvider = useMemo(() => {
    const providerIds = new Set(
      (authUser?.providerData || [])
        .map(provider => provider.providerId)
        .filter(Boolean)
    );
    if (providerIds.has('password')) return 'password';
    if (providerIds.has('google.com')) return 'google';
    return providerIds.values().next().value || 'unknown';
  }, [authUser]);

  const redirectToCleanState = () => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete(OPEN_ACCOUNT_DELETION_QUERY_PARAM);
    url.searchParams.set(RESET_ALL_QUERY_PARAM, '1');
    window.location.replace(`${url.pathname}?${url.searchParams.toString()}`);
  };

  const getFriendlyErrorMessage = (error: unknown) => {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: string }).code || '')
      : '';
    const fallback = typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: string }).message || '')
      : '';

    if (
      code === 'auth/missing-initial-state' || 
      code === 'auth/web-storage-unsupported' || 
      fallback.toLowerCase().includes('missing initial state') ||
      fallback.toLowerCase().includes('storage-partitioned')
    ) {
      return tr(
        'تعذر إكمال العملية بسبب قيود الخصوصية وحظر ملفات تعريف الارتباط في متصفحك (Safari/iOS). يرجى استخدام تسجيل الدخول بالبريد الإلكتروني.',
        'Could not complete the process due to browser privacy/cookie restrictions (Safari/iOS). Please use Email sign-in.'
      );
    }

    if (
      code === 'auth/popup-blocked' || 
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      return tr(
        'تم حظر نافذة التحقق بواسطة المتصفح (Safari/iOS). يرجى إلغاء تفعيل "حظر النوافذ المنبثقة" في إعدادات متصفح سفاري لإكمال العملية.',
        'The verification popup was blocked by the browser (Safari/iOS). Please disable "Block Pop-ups" in Safari/browser settings to proceed.'
      );
    }

    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return tr('كلمة المرور غير صحيحة.', 'Incorrect password.');
    }
    if (code === 'auth/popup-closed-by-user') {
      return tr('تم إغلاق نافذة التحقق قبل إكمال العملية.', 'The verification window was closed before completion.');
    }
    if (code === 'auth/requires-recent-login') {
      return tr('يلزم إعادة التحقق من هويتك قبل حذف الحساب. أعد المحاولة الآن.', 'You need to verify your identity again before deleting the account. Please try again.');
    }
    if (code === 'auth/network-request-failed') {
      return tr('تعذر الوصول إلى خدمة المصادقة. تحقق من الاتصال بالإنترنت.', 'Could not reach the authentication service. Check your internet connection.');
    }

    return fallback || tr('تعذر إكمال حذف الحساب حاليًا.', 'Could not complete account deletion right now.');
  };

  const cleanupCloudArtifacts = async (userId: string) => {
    if (!firebaseDb) return;
    const cleanupTasks = [
      deleteDoc(doc(firebaseDb, WORKSPACE_SUBSCRIPTIONS_COLLECTION, userId)),
      deleteDoc(doc(firebaseDb, SUBSCRIPTION_ADMINS_COLLECTION, userId)),
      ...companies.map(company => deleteDoc(doc(firebaseDb, WORKSPACE_SYNC_COLLECTION, `${company.id}_${userId}`)))
    ];
    await Promise.allSettled(cleanupTasks);
  };

  const finalizeAccountDeletion = async () => {
    if (!isFirebaseAuthEnabled || !firebaseAuth?.currentUser) {
      await Promise.resolve(logout());
      redirectToCleanState();
      return;
    }

    const activeAuthUser = firebaseAuth.currentUser;
    await cleanupCloudArtifacts(activeAuthUser.uid);
    await firebaseDeleteUser(activeAuthUser);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(ACCOUNT_DELETED_NOTICE_KEY, '1');
    }
    redirectToCleanState();
  };

  const reauthenticateBeforeDeletion = async () => {
    if (!firebaseAuth?.currentUser) return;

    if (authProvider === 'password') {
      const email = firebaseAuth.currentUser.email || currentUser?.email || '';
      if (!email) {
        throw new Error(tr('تعذر تحديد البريد الإلكتروني للحساب الحالي.', 'Could not resolve the current account email.'));
      }
      if (!password.trim()) {
        throw new Error(tr('أدخل كلمة المرور الحالية أولًا.', 'Enter your current password first.'));
      }
      const credential = EmailAuthProvider.credential(email, password);
      await reauthenticateWithCredential(firebaseAuth.currentUser, credential);
      return;
    }

    if (authProvider === 'google') {
      const provider = new GoogleAuthProvider();
      if (shouldPreferRedirectAuth()) {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(PENDING_ACCOUNT_DELETE_REAUTH_KEY, '1');
        }
        await reauthenticateWithRedirect(firebaseAuth.currentUser, provider);
        return;
      }

      await reauthenticateWithPopup(firebaseAuth.currentUser, provider);
    }
  };

  const handleDeleteAccount = async () => {
    setErrorMessage('');
    setInfoMessage('');

    if (!confirmChecked) {
      setErrorMessage(tr('يرجى تأكيد أنك تفهم أثر حذف الحساب قبل المتابعة.', 'Please confirm that you understand the effect of deleting the account before continuing.'));
      return;
    }

    if (!window.confirm(tr(
      'سيتم حذف حساب الدخول لهذا التطبيق وتسجيل خروجك من هذا الجهاز. هل تريد المتابعة؟',
      'This will delete this app login account and sign you out on this device. Do you want to continue?'
    ))) {
      return;
    }

    setBusy(true);
    try {
      if (!isGuestAccount && isFirebaseAuthEnabled && firebaseAuth?.currentUser) {
        await reauthenticateBeforeDeletion();
        if (typeof window !== 'undefined' && window.sessionStorage.getItem(PENDING_ACCOUNT_DELETE_REAUTH_KEY) === '1') {
          return;
        }
      }

      await finalizeAccountDeletion();
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !firebaseAuth) return;
    if (window.sessionStorage.getItem(PENDING_ACCOUNT_DELETE_REAUTH_KEY) !== '1') return;

    let cancelled = false;

    const resumeAfterRedirect = async () => {
      setBusy(true);
      setErrorMessage('');
      setInfoMessage(tr('تم التحقق من الهوية. جارٍ إكمال حذف الحساب...', 'Identity verified. Finishing account deletion...'));

      try {
        await getRedirectResult(firebaseAuth);
        if (cancelled) return;
        window.sessionStorage.removeItem(PENDING_ACCOUNT_DELETE_REAUTH_KEY);
        await finalizeAccountDeletion();
      } catch (error) {
        if (cancelled) return;
        window.sessionStorage.removeItem(PENDING_ACCOUNT_DELETE_REAUTH_KEY);
        setInfoMessage('');
        setErrorMessage(getFriendlyErrorMessage(error));
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    };

    void resumeAfterRedirect();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-[2rem] border border-rose-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs font-black text-rose-500">{tr('الخصوصية وإدارة الحساب', 'Privacy and account management')}</div>
            <h2 className="mt-1 text-xl font-black text-slate-900">{tr('حذف الحساب', 'Delete account')}</h2>
            <p className="mt-2 text-sm font-bold leading-7 text-slate-500">
              {tr(
                'يمكنك من هنا حذف حساب الدخول لهذا التطبيق من داخل النظام مباشرة، مع إزالة بيانات الجلسة المحلية من هذا الجهاز.',
                'From here you can delete the app sign-in account directly inside the app and remove the local session data from this device.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {tr('عودة', 'Back')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-rose-600">
            <Trash2 className="h-5 w-5" />
            <h3 className="text-base font-black">{tr('حذف الحساب الحالي', 'Delete current account')}</h3>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold leading-7 text-slate-600">
            <div>
              {isCodeEmail(currentUser?.email) ? (
                <>{tr('كود الحساب الحالي', 'Current account code')}: <span className="dir-ltr inline-block text-left">{extractCodeFromEmail(currentUser?.email)}</span></>
              ) : (
                <>{tr('الحساب الحالي', 'Current account')}: <span className="dir-ltr inline-block text-left">{currentUser?.email || '-'}</span></>
              )}
            </div>
            <div>
              {tr('طريقة الدخول', 'Sign-in method')}: {
                isCodeEmail(currentUser?.email) 
                  ? tr('كود الحساب وكلمة المرور', 'Account code and password')
                  : authProvider === 'password'
                    ? tr('بريد إلكتروني وكلمة مرور', 'Email and password')
                    : authProvider === 'google'
                      ? 'Google'
                      : tr('غير محددة', 'Unknown')
              }
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-black leading-6 text-amber-800">
            {tr(
              'سيتم حذف حساب الدخول من التطبيق، ومسح بيانات الجلسة المحلية من هذا الجهاز. بيانات الشركات المشتركة أو السجلات التي تخص مؤسستك قد تبقى خاضعة لسياسة المؤسسة والنسخ الاحتياطية.',
              'The app sign-in account will be deleted and local session data on this device will be cleared. Shared company data or records belonging to your organization may remain subject to company policy and backups.'
            )}
          </div>

          {authProvider === 'password' && !isGuestAccount && (
            <div className="mt-4">
              <label className="mb-2 block px-1 text-[11px] font-black text-slate-500">
                {tr('أدخل كلمة المرور الحالية للتأكيد', 'Enter your current password to confirm')}
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={tr('كلمة المرور الحالية', 'Current password')}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-10 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                />
              </div>
            </div>
          )}

          {authProvider === 'google' && !isGuestAccount && (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-black leading-6 text-blue-700">
              {tr(
                'سيتم طلب التحقق من حساب Google قبل تنفيذ الحذف. على الهاتف قد يتم نقلك مؤقتًا إلى شاشة Google ثم العودة للتطبيق.',
                'Google verification will be requested before deletion. On mobile you may be redirected briefly to Google and then returned to the app.'
              )}
            </div>
          )}

          <label className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(event) => setConfirmChecked(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
            />
            <span className="text-sm font-bold leading-7 text-slate-600">
              {tr(
                'أفهم أن حذف الحساب سيوقف وصولي بهذا الحساب إلى التطبيق على هذا الجهاز، وأن العملية لا يمكن التراجع عنها من داخل التطبيق.',
                'I understand that deleting the account will stop access with this account on this device, and the action cannot be undone from inside the app.'
              )}
            </span>
          </label>

          {infoMessage && (
            <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs font-black text-sky-700">
              {infoMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-black text-rose-700">
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={() => { void handleDeleteAccount(); }}
            disabled={busy}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {isGuestAccount
              ? tr('مسح بيانات الجهاز المحلية', 'Clear local device data')
              : tr('حذف الحساب الآن', 'Delete account now')}
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
              <h3 className="text-base font-black text-slate-900">{tr('روابط عامة للنشر', 'Public publishing links')}</h3>
            </div>
            <p className="mt-3 text-sm font-bold leading-7 text-slate-500">
              {tr(
                'هذه الصفحات العامة مخصصة للنشر في المتجرين ومراجعة المستخدمين، ويمكن فتحها أيضًا خارج التطبيق.',
                'These public pages are meant for store submission and user review, and they can also be opened outside the app.'
              )}
            </p>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => openPublicPage('/privacy-policy.html')}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700"
              >
                <span>{tr('صفحة سياسة الخصوصية العامة', 'Public privacy policy page')}</span>
                <ExternalLink className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => openPublicPage('/account-deletion.html')}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700"
              >
                <span>{tr('صفحة حذف الحساب العامة', 'Public account deletion page')}</span>
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-base font-black text-slate-900">{tr('ما الذي سيحدث؟', 'What happens next?')}</h3>
            </div>
            <ul className="mt-4 space-y-3 text-sm font-bold leading-7 text-slate-600">
              <li>{tr('1. يتم التحقق من هويتك قبل حذف الحساب.', '1. Your identity is verified before account deletion.')}</li>
              <li>{tr('2. يتم حذف حساب الدخول ومسح بيانات الجلسة المحلية من هذا الجهاز.', '2. The sign-in account is deleted and local session data is cleared from this device.')}</li>
              <li>{tr('3. إذا احتجت صفحة عامة، يمكنك استخدام الرابط المنشور في المتجر أو الرابطين أعلاه.', '3. If you need a public page, you can use the store-published link or the two links above.')}</li>
            </ul>
            <button
              type="button"
              onClick={() => openPublicPage(`/?${OPEN_ACCOUNT_DELETION_QUERY_PARAM}=1`)}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700"
            >
              <ExternalLink className="h-4 w-4" />
              {tr('فتح التطبيق على شاشة حذف الحساب', 'Open the app on the account deletion screen')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountDeletionScreen;
