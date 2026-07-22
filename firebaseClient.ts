import { getApps, getApp, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  initializeAuth,
  setPersistence,
  type Auth
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseApiKey = String(import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCNYpPDb30fqY0_DkFaLXKGLCH5s5ItWh4').trim();
const firebaseAuthDomain = String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'smart-account-cc181.firebaseapp.com').trim();
const firebaseProjectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || 'smart-account-cc181').trim();
const firebaseStorageBucket = String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'smart-account-cc181.firebasestorage.app').trim();
const firebaseMessagingSenderId = String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '879535686153').trim();
const firebaseAppId = String(import.meta.env.VITE_FIREBASE_APP_ID || '1:879535686153:web:5dd72b985ee2c5d4d3eed8').trim();
const firebaseFunctionsRegion = String(import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1').trim() || 'us-central1';

// 1. Graceful Initialization Failure: Halt immediately if config is completely missing/malformed
if (!firebaseApiKey || !firebaseProjectId) {
  console.error("CRITICAL ERROR: Firebase Configuration is missing. Halting Firebase initialization to prevent infinite retry loops.");
  if (typeof window !== 'undefined') {
    window.document.body.innerHTML = `
      <div style="padding: 20px; font-family: sans-serif; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 5px; margin: 20px;">
        <h2>Configuration Error</h2>
        <p>The application failed to initialize because critical environment variables (Firebase API Key) are missing.</p>
        <p>Please check your CI/CD pipeline secrets or local .env file.</p>
      </div>
    `;
  }
}

export const isFirebaseAuthEnabled = Boolean(
  firebaseApiKey && firebaseAuthDomain && firebaseProjectId && firebaseAppId
) && (typeof window === 'undefined' || window.localStorage.getItem('disableFirebase') !== 'true');

const getDynamicAuthDomain = () => {
  if (typeof window === 'undefined') return firebaseAuthDomain;
  const hostname = window.location.hostname;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.endsWith('.local')
  ) {
    return firebaseAuthDomain;
  }
  return hostname;
};

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: getDynamicAuthDomain(),
  projectId: firebaseProjectId,
  storageBucket: firebaseStorageBucket,
  messagingSenderId: firebaseMessagingSenderId,
  appId: firebaseAppId
};

export const firebaseApp = isFirebaseAuthEnabled
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

let cachedAuth: Auth | null = null;

export const firebaseAuth: Auth | null = isFirebaseAuthEnabled && firebaseApp
  ? (function() {
      if (cachedAuth) return cachedAuth;
      try {
        if (Capacitor.isNativePlatform()) {
          cachedAuth = initializeAuth(firebaseApp, { 
            persistence: [indexedDBLocalPersistence, browserLocalPersistence]
          });
        } else {
          cachedAuth = initializeAuth(firebaseApp, { 
            persistence: browserLocalPersistence,
            popupRedirectResolver: browserPopupRedirectResolver
          });
        }
        return cachedAuth;
      } catch (e) {
        cachedAuth = getAuth(firebaseApp);
        return cachedAuth;
      }
    })()
  : null;

export const firebaseDb: Firestore | null = isFirebaseAuthEnabled && firebaseApp
  ? getFirestore(firebaseApp)
  : null;

// CRITICAL: Log Firebase initialization status
if (typeof window !== 'undefined') {
  if (firebaseDb) {
    console.log('[Firebase] ✅ Firestore connected successfully to project:', firebaseProjectId);
  } else {
    if (window.localStorage.getItem('disableFirebase') === 'true') {
      console.log('[Firebase] Firestore is intentionally disabled via localStorage flag.');
    } else {
      console.error('[Firebase] ❌ Firestore NOT initialized! Check environment variables.');
      console.error('[Firebase] Debug info:', {
        hasApiKey: !!firebaseApiKey,
        hasAuthDomain: !!firebaseAuthDomain,
        hasProjectId: !!firebaseProjectId,
        hasAppId: !!firebaseAppId,
        isAuthEnabled: isFirebaseAuthEnabled,
        hasApp: !!firebaseApp
      });
    }
  }
}

// Offline persistence disabled as per user request to enforce 100% live server communication
// if (firebaseDb) {
//   enableIndexedDbPersistence(firebaseDb).catch((err) => {
//     console.warn('Firebase persistence warning:', err.code);
//   });
// }

export const firebaseStorage: FirebaseStorage | null = isFirebaseAuthEnabled && firebaseApp && firebaseStorageBucket
  ? getStorage(firebaseApp)
  : null;

export const firebaseFunctions: Functions | null = isFirebaseAuthEnabled && firebaseApp
  ? getFunctions(firebaseApp, firebaseFunctionsRegion)
  : null;

export const isFirebaseSyncEnabled = false;

if (firebaseAuth && !Capacitor.isNativePlatform()) {
  void setPersistence(firebaseAuth, browserLocalPersistence);
}

export const getBackendApiUrl = (): string => {
  const rawUrl = String(import.meta.env.VITE_BACKEND_API_URL || '').trim();
  const defaultUrl = rawUrl || 'http://localhost:5000/api';
  if (Capacitor.isNativePlatform()) {
    if (defaultUrl.startsWith('/') || defaultUrl.includes('localhost') || defaultUrl.includes('127.0.0.1')) {
      const projectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || 'smart-account-cc181').trim();
      // Use Firebase Hosting URL to leverage rewrites and avoid CORS/path-stripping issues
      return `https://${projectId}.web.app/api`;
    }
  }
  return defaultUrl;
};

export const getAbsoluteUrl = (path: string): string => {
  if (Capacitor.isNativePlatform() && path.startsWith('/')) {
    const projectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || 'smart-account-cc181').trim();
    // Use Firebase Hosting URL
    return `https://${projectId}.web.app/api${path.replace(/^\/api/, '')}`;
  }
  return path;
};

export const executeFirestoreWrite = async (
  currentUser: any,
  operations: Array<{ type: 'set' | 'delete'; path: string; data?: any }>
): Promise<void> => {
  const fbUser = firebaseAuth?.currentUser || currentUser;
  if (!fbUser) throw new Error('User not authenticated');
  
  let token: string;
  if (typeof fbUser.getIdToken === 'function') {
    token = await fbUser.getIdToken();
  } else if (firebaseAuth?.currentUser && typeof firebaseAuth.currentUser.getIdToken === 'function') {
    token = await firebaseAuth.currentUser.getIdToken();
  } else {
    throw new Error('User object does not support getIdToken');
  }

  const useBackend = import.meta.env.VITE_USE_CUSTOM_BACKEND === 'true' && isFirebaseAuthEnabled;
  const backendApiUrl = getBackendApiUrl();
  const url = useBackend ? `${backendApiUrl}/firestore-write-proxy` : getAbsoluteUrl('/api/firestore-write-proxy');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ operations })
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error ${response.status}`);
  }
};


export const callBackendApi = async (
  currentUser: any,
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any
): Promise<any> => {
  const fbUser = firebaseAuth?.currentUser || currentUser;
  if (!fbUser) throw new Error('User not authenticated');
  
  let token: string;
  if (typeof fbUser.getIdToken === 'function') {
    token = await fbUser.getIdToken();
  } else if (firebaseAuth?.currentUser && typeof firebaseAuth.currentUser.getIdToken === 'function') {
    token = await firebaseAuth.currentUser.getIdToken();
  } else {
    throw new Error('User object does not support getIdToken');
  }

  const backendApiUrl = getBackendApiUrl();
  const response = await fetch(`${backendApiUrl}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error ${response.status}`);
  }
  return response.json();
};

