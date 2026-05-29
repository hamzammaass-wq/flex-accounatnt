import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { firebaseDb } from '../firebaseClient';

export function useFirestoreSyncState<T extends { id?: string }>(
  collectionName: string,
  initialState: T[],
  companyId: string | null
): [T[], React.Dispatch<React.SetStateAction<T[]>>] {
  const [data, setData] = useState<T[]>(initialState);
  const dataRef = useRef(data);
  useEffect(() => {
    if (!firebaseDb || !companyId || companyId === 'cmp_default') return;

    const q = collection(firebaseDb, `companies/${companyId}/${collectionName}`);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id
      })) as T[];
      
      // Merge remote items, preserving local order if needed, but for ERP lists, remote state is source of truth.
      setData(items);
    });

    return () => unsubscribe();
  }, [companyId, collectionName]);

  const setSyncedData = useCallback((action: React.SetStateAction<T[]>) => {
    setData((prev) => {
      const next = typeof action === 'function' ? (action as any)(prev) : action;
      
      if (firebaseDb && companyId && companyId !== 'cmp_default' && !(window as any).__IS_HYDRATING__) {
        // We are online/cloud-enabled, so push differences to Firestore
        const prevMap = new Map(prev.map(p => [p.id, p]));
        const nextMap = new Map(next.map(n => [n.id, n]));

        const toUpsert: T[] = [];
        const toDelete: string[] = [];

        next.forEach(n => {
          if (!n.id) return;
          const p = prevMap.get(n.id);
          if (!p || JSON.stringify(p) !== JSON.stringify(n)) {
            toUpsert.push(n);
          }
        });

        prev.forEach(p => {
          if (p.id && !nextMap.has(p.id)) {
            toDelete.push(p.id);
          }
        });

        if (toUpsert.length > 0 || toDelete.length > 0) {
          // Use batch to execute writes efficiently
          const batch = writeBatch(firebaseDb);
          
          toUpsert.forEach(item => {
            const docRef = doc(firebaseDb, `companies/${companyId}/${collectionName}`, item.id!);
            batch.set(docRef, item, { merge: true });
          });

          toDelete.forEach(id => {
            const docRef = doc(firebaseDb, `companies/${companyId}/${collectionName}`, id);
            batch.delete(docRef);
          });

          batch.commit().catch(err => {
            console.error(`Error syncing ${collectionName} to Firestore:`, err);
          });
        }
      }

      return next;
    });
  }, [companyId, collectionName]);

  return [data, setSyncedData];
}
