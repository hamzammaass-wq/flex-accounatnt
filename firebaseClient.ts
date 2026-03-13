import { getApps, getApp, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseApiKey = String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
const firebaseAuthDomain = String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
const firebaseProjectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
const firebaseStorageBucket = String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
const firebaseMessagingSenderId = String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim();
const firebaseAppId = String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim();

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
  ? getAuth(firebaseApp)
  : null;

export const firebaseDb: Firestore | null = isFirebaseAuthEnabled && firebaseApp
  ? getFirestore(firebaseApp)
  : null;

export const isFirebaseSyncEnabled = Boolean(firebaseDb);

if (firebaseAuth) {
  void setPersistence(firebaseAuth, browserLocalPersistence);
}
