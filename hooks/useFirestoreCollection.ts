import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  FirestoreError
} from 'firebase/firestore';
import { firebaseDb } from '../firebaseClient';

export function useFirestoreCollection<T extends { id: string }>(
  companyId: string,
  collectionName: string,
  initialData: T[] = []
) {
  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!firebaseDb || !companyId) {
      setData(initialData);
      return;
    }

    setLoading(true);
    const q = query(collection(firebaseDb, `companies/${companyId}/${collectionName}`));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          ...docSnap.data(),
          id: docSnap.id
        })) as T[];
        setData(items);
        setLoading(false);
      },
      (err) => {
        console.error(`Error fetching ${collectionName}:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [companyId, collectionName]);

  const saveItem = async (item: T) => {
    if (!firebaseDb || !companyId) {
      // Offline / Trial fallback
      setData((prev) => {
        const idx = prev.findIndex((p) => p.id === item.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = item;
          return next;
        }
        return [...prev, item];
      });
      return;
    }

    const docRef = doc(firebaseDb, `companies/${companyId}/${collectionName}`, item.id);
    await setDoc(docRef, item, { merge: true });
  };

  const deleteItem = async (itemId: string) => {
    if (!firebaseDb || !companyId) {
       // Offline / Trial fallback
       setData((prev) => prev.filter((p) => p.id !== itemId));
       return;
    }

    const docRef = doc(firebaseDb, `companies/${companyId}/${collectionName}`, itemId);
    await deleteDoc(docRef);
  };

  return {
    data,
    loading,
    error,
    saveItem,
    deleteItem,
    setData // Exposed for bulk ops or legacy compatibility
  };
}
