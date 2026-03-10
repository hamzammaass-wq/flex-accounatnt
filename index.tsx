import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { forceEnglishDigits } from './utils/forceEnglishDigits';
import { migrateLocalStorageTextData } from './utils/dataTextMigration';

migrateLocalStorageTextData();
forceEnglishDigits();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
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
