import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { forceEnglishDigits } from './utils/forceEnglishDigits';
import { migrateLocalStorageTextData } from './utils/dataTextMigration';

const BOOT_RECOVERY_KEY = 'al_mohaseb_boot_recovery_once';
const CHUNK_LOAD_ERROR_PATTERN = /(Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|Unexpected token '<')/i;

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

  void clearRuntimeCaches().finally(() => {
    const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
    window.location.replace(cleanUrl);
  });
};

const setupBootRecoveryHandlers = () => {
  if (typeof window === 'undefined') return;

  window.addEventListener(
    'error',
    (event) => {
      const target = event.target as EventTarget | null;
      const isScriptLoadFailure = target instanceof HTMLScriptElement;
      const message = String(event.message || '');
      if (isScriptLoadFailure || CHUNK_LOAD_ERROR_PATTERN.test(message)) {
        triggerBootRecoveryReload();
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: string } | string | null | undefined;
    const message = typeof reason === 'string' ? reason : String(reason?.message || '');
    if (CHUNK_LOAD_ERROR_PATTERN.test(message)) {
      event.preventDefault();
      triggerBootRecoveryReload();
    }
  });
};

const runSafeBootstrap = () => {
  try {
    migrateLocalStorageTextData();
  } catch (error) {
    console.warn('Skipping storage text migration due to a bootstrap error.', error);
  }

  try {
    forceEnglishDigits();
  } catch (error) {
    console.warn('Skipping forceEnglishDigits due to a bootstrap error.', error);
  }
};

runSafeBootstrap();
setupBootRecoveryHandlers();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => registration.update().catch(() => undefined))
        .catch(() => undefined);
      return;
    }

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
    <App />
  </React.StrictMode>
);

try {
  sessionStorage.removeItem(BOOT_RECOVERY_KEY);
} catch {
  // Ignore storage errors after successful mount.
}
