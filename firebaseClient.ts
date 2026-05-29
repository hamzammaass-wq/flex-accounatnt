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
);

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: firebaseAuthDomain,
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

export const firebaseAuth: Auth | null = isFirebaseAuthEnabled && firebaseApp
  ? (function() {
      try {
        return initializeAuth(firebaseApp, { 
          persistence: browserLocalPersistence,
          popupRedirectResolver: browserPopupRedirectResolver
        });
      } catch (e) {
        return getAuth(firebaseApp);
      }
    })()
  : null;

export const firebaseDb: Firestore | null = isFirebaseAuthEnabled && firebaseApp
  ? getFirestore(firebaseApp)
  : null;

if (firebaseDb) {
  enableIndexedDbPersistence(firebaseDb).catch((err) => {
    console.warn('Firebase persistence warning:', err.code);
  });
}

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
