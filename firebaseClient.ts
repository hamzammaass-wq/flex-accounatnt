import { getApps, getApp, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  initializeAuth,
  setPersistence,
  type Auth
} from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseApiKey = String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
const firebaseAuthDomain = String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
const firebaseProjectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
const firebaseStorageBucket = String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
const firebaseMessagingSenderId = String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim();
const firebaseAppId = String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim();
const firebaseFunctionsRegion = String(import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1').trim() || 'us-central1';

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
        cachedAuth = initializeAuth(firebaseApp, { 
          persistence: browserLocalPersistence,
          popupRedirectResolver: browserPopupRedirectResolver
        });
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

export const isFirebaseSyncEnabled = Boolean(firebaseDb);

if (firebaseAuth) {
  void setPersistence(firebaseAuth, browserLocalPersistence);
}

export const executeFirestoreWrite = async (
  currentUser: any,
  operations: Array<{ type: 'set' | 'delete'; path: string; data?: any }>
): Promise<void> => {
  if (!currentUser) throw new Error('User not authenticated');
  const token = await currentUser.getIdToken();
  const useBackend = import.meta.env.VITE_USE_CUSTOM_BACKEND === 'true';
  const backendApiUrl = String(import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5000/api').trim();
  const url = useBackend ? `${backendApiUrl}/firestore-write-proxy` : '/api/firestore-write-proxy';

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
  if (!currentUser) throw new Error('User not authenticated');
  const token = await currentUser.getIdToken();
  const backendApiUrl = String(import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5000/api').trim();
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

