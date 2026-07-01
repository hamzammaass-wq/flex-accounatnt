import React from 'react';
import ReactDOM from 'react-dom/client';
import { signOut as firebaseSignOut } from 'firebase/auth';
import App from './App';
import './index.css';
import { firebaseAuth } from './firebaseClient';
import { forceEnglishDigits } from './utils/forceEnglishDigits';
import { migrateLocalStorageTextData } from './utils/dataTextMigration';
import { recordRuntimeError } from './utils/runtimeErrorMonitor';

const BOOT_RECOVERY_KEY = 'al_mohaseb_boot_recovery_once';
const CHUNK_LOAD_ERROR_PATTERN = /(Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed)/i;
const CURRENT_USER_STORAGE_KEY = 'al_mohaseb_user';
const INITIAL_SETUP_PENDING_KEY = 'al_mohaseb_initial_setup_pending';
const FORCE_EMPTY_BOOTSTRAP_KEY = 'al_mohaseb_force_empty_bootstrap';
const PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY = 'al_mohaseb_pending_guest_delete_after_redirect';

const clearRuntimeCaches = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
    } catch {
      // Ignore cleanup failures and continue with page reload.
    }
  }

  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
      // Ignore cleanup failures and continue with page reload.
    }
  }
};

const triggerBootRecoveryReload = () => {
  if (typeof window === 'undefined') return;
  if (sessionStorage.getItem(BOOT_RECOVERY_KEY) === '1') return;
  sessionStorage.setItem(BOOT_RECOVERY_KEY, '1');

  try {
    const lastReload = localStorage.getItem('al_mohaseb_last_recovery_reload');
    if (lastReload) {
      const diff = Date.now() - Number(lastReload);
      if (diff < 15000) return;
    }
    localStorage.setItem('al_mohaseb_last_recovery_reload', String(Date.now()));
  } catch {
    // Ignore storage failures
  }

  void clearRuntimeCaches().finally(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('cb', String(Date.now()));
      window.location.replace(url.toString());
    } catch {
      const cleanUrl = `${window.location.origin}${window.location.pathname}?cb=${Date.now()}${window.location.hash}`;
      window.location.replace(cleanUrl);
    }
  });
};

const reloadClean = () => {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('cb', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    const cleanUrl = `${window.location.origin}${window.location.pathname}?cb=${Date.now()}${window.location.hash}`;
    window.location.replace(cleanUrl);
  }
};

const recoverToLogin = async () => {
  if (typeof window === 'undefined') return;

  try {
    if (firebaseAuth) {
      await firebaseSignOut(firebaseAuth);
    }
  } catch {
    // Ignore sign-out failures and continue to local recovery.
  }

  try {
    localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    localStorage.removeItem(INITIAL_SETUP_PENDING_KEY);
    localStorage.removeItem(FORCE_EMPTY_BOOTSTRAP_KEY);
    localStorage.removeItem(PENDING_GUEST_DELETE_AFTER_REDIRECT_KEY);
    sessionStorage.removeItem(BOOT_RECOVERY_KEY);
  } catch {
    // Ignore storage failures and still retry navigation.
  }

  reloadClean();
};

type AppErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

type AppErrorBoundaryProps = React.PropsWithChildren<Record<string, never>>;

class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  declare props: Readonly<AppErrorBoundaryProps>;
  public state: AppErrorBoundaryState = { hasError: false, errorMessage: '' };

  public static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error || '')
    };
  }

  public componentDidCatch(error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error || 'Unknown render error'));
    recordRuntimeError({
      kind: 'react-boundary',
      message: err.message,
      stack: err.stack,
      source: 'AppErrorBoundary'
    });
    console.error('App crashed during render. Showing recovery screen.', error);

    if (CHUNK_LOAD_ERROR_PATTERN.test(err.message)) {
      triggerBootRecoveryReload();
    }
  }

  public render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-dvh bg-[#071120] flex items-center justify-center p-4 text-white">
        <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 shadow-[0_28px_90px_rgba(2,6,23,0.58)] backdrop-blur-md">
          <div className="text-center space-y-3">
            <div className="text-2xl font-black">تعذر فتح الشاشة</div>
            <p className="text-sm leading-7 text-slate-300">
              حدث خلل أثناء تحميل التطبيق. يمكنك إعادة المحاولة مباشرة أو العودة إلى شاشة الدخول بدون فقدان بيانات الشركة.
            </p>
            {this.state.errorMessage ? (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs font-bold text-amber-100">
                {this.state.errorMessage}
              </div>
            ) : null}
          </div>

          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={() => reloadClean()}
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-500"
            >
              إعادة تحميل الصفحة
            </button>
            <button
              type="button"
              onClick={() => void recoverToLogin()}
              className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10"
            >
              فتح شاشة الدخول
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const setupBootRecoveryHandlers = () => {
  if (typeof window === 'undefined') return;

  const BOOT_TIME = Date.now();

  // Detect rapid page crashes and prevent infinite reload loops
  try {
    const crashCount = Number(sessionStorage.getItem('al_mohaseb_crash_count') || '0');
    const lastCrashTime = Number(sessionStorage.getItem('al_mohaseb_last_crash_time') || '0');
    const timeSinceLastCrash = Date.now() - lastCrashTime;

    // Reset counter if last crash was more than 5 minutes ago
    if (timeSinceLastCrash > 300000) {
      sessionStorage.setItem('al_mohaseb_crash_count', '0');
    }

    // If we've crashed too many times recently, show error instead of reloading
    if (crashCount >= 3 && timeSinceLastCrash < 60000) {
      console.error('[CRITICAL] Too many crashes detected. Please clear browser cache or contact support.');
      document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-center: center; min-height: 100vh; background: #071120; color: white; padding: 20px; font-family: Cairo, sans-serif; text-align: center;">
          <div style="max-width: 500px;">
            <h1 style="font-size: 24px; margin-bottom: 16px;">⚠️ خطأ حرج</h1>
            <p style="font-size: 14px; margin-bottom: 24px;">تم اكتشاف عدة محاولات فاشلة لتحميل التطبيق. الرجاء:</p>
            <ul style="text-align: right; font-size: 14px; margin-bottom: 24px;">
              <li>إعادة تشغيل المتصفح</li>
              <li>مسح ذاكرة التخزين المؤقت (Clear Cache)</li>
              <li>التحقق من اتصال الإنترنت</li>
              <li>تعطيل برامج حظر الإعلانات</li>
            </ul>
            <button onclick="sessionStorage.clear(); location.reload();" style="background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: bold; cursor: pointer;">
              إعادة المحاولة
            </button>
          </div>
        </div>
      `;
      return;
    }
  } catch (err) {
    console.error('Failed to check crash count:', err);
  }

  window.addEventListener(
    'error',
    (event) => {
      const target = event.target as EventTarget | null;
      let isLocalScriptLoadFailure = false;
      if (target instanceof HTMLScriptElement) {
        const src = target.src || '';
        const isLocal = src.startsWith(window.location.origin) || src.startsWith('/') || !/^https?:\/\//i.test(src);
        if (isLocal) {
          isLocalScriptLoadFailure = true;
        }
      }
      const message = String(event.message || '');
      const source = [event.filename, event.lineno, event.colno].filter(Boolean).join(':');

      recordRuntimeError({
        kind: 'window-error',
        message: message || 'Window error',
        stack: event.error instanceof Error ? event.error.stack : undefined,
        source: source || (isLocalScriptLoadFailure ? 'script-load' : 'window')
      });

      // Track crash count for infinite reload prevention
      try {
        const crashCount = Number(sessionStorage.getItem('al_mohaseb_crash_count') || '0');
        sessionStorage.setItem('al_mohaseb_crash_count', String(crashCount + 1));
        sessionStorage.setItem('al_mohaseb_last_crash_time', String(Date.now()));
      } catch (err) {
        // Ignore storage errors
      }

      // Only reload for script load/chunk errors during the initial boot phase (first 15 seconds)
      const isInitialBootPhase = Date.now() - BOOT_TIME < 15000;
      if (isInitialBootPhase && (isLocalScriptLoadFailure || CHUNK_LOAD_ERROR_PATTERN.test(message))) {
        triggerBootRecoveryReload();
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: string } | string | null | undefined;
    const message = typeof reason === 'string' ? reason : String(reason?.message || '');

    recordRuntimeError({
      kind: 'unhandled-rejection',
      message: message || 'Unhandled promise rejection',
      stack: reason && typeof reason === 'object' && 'stack' in reason ? String((reason as { stack?: unknown }).stack || '') : undefined,
      source: 'window.unhandledrejection'
    });

    // Only reload for chunk rejection errors during the initial boot phase (first 15 seconds)
    const isInitialBootPhase = Date.now() - BOOT_TIME < 15000;
    if (isInitialBootPhase && CHUNK_LOAD_ERROR_PATTERN.test(message)) {
      event.preventDefault();
      triggerBootRecoveryReload();
    }
  });
};

const runSafeBootstrap = () => {
  try {
    migrateLocalStorageTextData();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error || 'bootstrap migration failed'));
    recordRuntimeError({ kind: 'bootstrap', message: err.message, stack: err.stack, source: 'migrateLocalStorageTextData' });
    console.warn('Skipping storage text migration due to a bootstrap error.', error);
  }

  try {
    forceEnglishDigits();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error || 'bootstrap forceEnglishDigits failed'));
    recordRuntimeError({ kind: 'bootstrap', message: err.message, stack: err.stack, source: 'forceEnglishDigits' });
    console.warn('Skipping forceEnglishDigits due to a bootstrap error.', error);
  }
};

runSafeBootstrap();
setupBootRecoveryHandlers();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {

    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        return Promise.all(
          registrations.map((registration) => registration.unregister().catch(() => false))
        );
      })
      .catch(() => undefined);

    if ('caches' in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => undefined);
    }
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

