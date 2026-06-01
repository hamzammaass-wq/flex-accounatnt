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
  companyId: string | null,
  userId: string | null
): [T[], React.Dispatch<React.SetStateAction<T[]>>] {
  const [data, setData] = useState<T[]>(initialState);
  const dataRef = useRef(data);
  useEffect(() => {
    let isSubscribed = true;

    // CRITICAL FIX: Don't reset data if Firebase is not ready
    // This was causing data loss on page refresh
    if (!firebaseDb || !companyId || !userId) {
      console.warn(`[Sync] Firebase not ready for ${collectionName}. DB=${!!firebaseDb}, Company=${!!companyId}, User=${!!userId}`);
      return;
    }

    setData(initialState);

    const q = collection(firebaseDb, `users/${userId}/companies/${companyId}/${collectionName}`);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!isSubscribed) return;
      
      try {
        const items = snapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id
        })) as T[];
        
        setData(prev => {
          // Automatic cloud seeding: If Firestore is empty, push initialState to cloud!
          // This ensures new companies get the default chart of accounts, currencies, units, etc.
          if (items.length === 0 && initialState.length > 0 && !snapshot.metadata.hasPendingWrites) {
            console.log(`[Sync] Seeding initial data to Firestore collection: ${collectionName}`);
            const batch = writeBatch(firebaseDb!);
            let count = 0;
            initialState.forEach(item => {
              if (!item.id) return;
              const docRef = doc(firebaseDb!, `users/${userId}/companies/${companyId}/${collectionName}`, item.id);
              const cleanItem = JSON.parse(JSON.stringify(item));
              batch.set(docRef, cleanItem, { merge: true });
              count++;
            });
            if (count > 0) {
              batch.commit().catch(err => {
                console.error(`Failed to seed ${collectionName}`, err);
                if (typeof window !== 'undefined') {
                  alert(`خطأ في مزامنة البيانات الأولية (${collectionName}): ${err.message}`);
                }
              });
            }
            return initialState;
          }

          // Auto-repair missing system items if the collection is partially populated
          if (items.length > 0 && initialState.length > 0 && !snapshot.metadata.hasPendingWrites) {
            const missingItems = initialState.filter(initItem => !items.some(item => item.id === initItem.id));
            if (missingItems.length > 0) {
              console.log(`[Sync] Repairing ${missingItems.length} missing system items in ${collectionName}`);
              const batch = writeBatch(firebaseDb!);
              missingItems.forEach(item => {
                if (!item.id) return;
                const docRef = doc(firebaseDb!, `users/${userId}/companies/${companyId}/${collectionName}`, item.id);
                const cleanItem = JSON.parse(JSON.stringify(item));
                batch.set(docRef, cleanItem, { merge: true });
              });
              batch.commit().catch(err => console.error(`Failed to repair ${collectionName}`, err));
              return [...items, ...missingItems];
            }
          }
          return items;
        });
      } catch (err) {
        console.error(`Error processing snapshot for ${collectionName}:`, err);
      }
    }, (error) => {
      console.error(`Firestore connection error (${collectionName}):`, error);
      if (typeof window !== 'undefined') {
        alert(`مشكلة في الاتصال بالسحابة (${collectionName}). تأكد من إيقاف مانع الإعلانات أو الـ VPN. التفاصيل: ${error.message}`);
      }
    });

    return () => unsubscribe();
  }, [companyId, collectionName, userId]);

  const setSyncedData = useCallback((action: React.SetStateAction<T[]>) => {
    setData((prev) => {
      const next = typeof action === 'function' ? (action as any)(prev) : action;

      // CRITICAL CHECK: Ensure Firebase is connected before saving
      if (!firebaseDb) {
        console.error(`[Sync ERROR] Firebase DB is not initialized! Data for ${collectionName} will NOT be saved.`);
        if (typeof window !== 'undefined') {
          alert(`⚠️ خطأ حرج: قاعدة البيانات غير متصلة!\nالبيانات لن تُحفظ. تحقق من إعدادات Firebase.`);
        }
        return next; // Return without saving
      }

      if (!companyId) {
        console.error(`[Sync ERROR] No company selected! Data for ${collectionName} will NOT be saved.`);
        return next;
      }

      if (!userId) {
        console.error(`[Sync ERROR] No user logged in! Data for ${collectionName} will NOT be saved.`);
        if (typeof window !== 'undefined') {
          alert(`⚠️ يجب تسجيل الدخول لحفظ البيانات!`);
        }
        return next;
      }

      if (!(window as any).__IS_HYDRATING__) {
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
          console.log(`[Sync] Saving changes to ${collectionName}: ${toUpsert.length} upserts, ${toDelete.length} deletes`);

          // Use batch to execute writes efficiently
          const batch = writeBatch(firebaseDb);

          toUpsert.forEach(item => {
            const docRef = doc(firebaseDb, `users/${userId}/companies/${companyId}/${collectionName}`, item.id!);
            const cleanItem = JSON.parse(JSON.stringify(item));
            batch.set(docRef, cleanItem, { merge: true });
          });

          toDelete.forEach(id => {
            const docRef = doc(firebaseDb, `users/${userId}/companies/${companyId}/${collectionName}`, id);
            batch.delete(docRef);
          });

          batch.commit()
            .then(() => {
              console.log(`[Sync SUCCESS] ${collectionName}: ${toUpsert.length + toDelete.length} changes saved to cloud`);
            })
            .catch(err => {
              console.error(`[Sync ERROR] Failed to sync ${collectionName}:`, err);
              if (typeof window !== 'undefined') {
                alert(`❌ خطأ في الحفظ السحابي (${collectionName}):\n${err.message || 'حدث خطأ غير معروف'}\n\nتحقق من الاتصال بالإنترنت.`);
              }
            });
        }
      }

      return next;
    });
  }, [companyId, collectionName, userId]);

  return [data, setSyncedData];
}
