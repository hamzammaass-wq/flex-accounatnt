import { useState, useEffect, useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { firebaseDb, firebaseAuth, executeFirestoreWrite, callBackendApi, isFirebaseAuthEnabled } from '../firebaseClient';

let lastAlertTime = 0;
let lastAlertMessage = '';

export const showSyncAlertOnce = (message: string) => {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (message === lastAlertMessage && now - lastAlertTime < 5000) {
    return; // Skip duplicate alert within 5 seconds
  }
  lastAlertTime = now;
  lastAlertMessage = message;
  alert(message);
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs))
  ]);
};

export function useFirestoreSyncState<T extends { id?: string }>(
  collectionName: string,
  initialState: T[],
  companyId: string | null,
  userId: string | null
): [T[], Dispatch<SetStateAction<T[]>>] {
  const [data, setData] = useState<T[]>(initialState);

  // Keep a ref to the latest state to allow synchronous state checks outside React's render phase
  const dataRef = useRef<T[]>(initialState);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const useBackend = import.meta.env.VITE_USE_CUSTOM_BACKEND === 'true' && isFirebaseAuthEnabled;

  // Track Firebase auth UID locally so this hook re-runs when auth state changes.
  // This replaces the old onAuthStateChanged retry inside the main useEffect,
  // which caused a race condition during user switching: the hook's listener fired
  // before the parent component could clear the stale company ID.
  const [firebaseUid, setFirebaseUid] = useState<string | null>(
    firebaseAuth?.currentUser?.uid ?? null
  );

  useEffect(() => {
    if (!firebaseAuth) return;
    const unsub = firebaseAuth.onAuthStateChanged((u: any) => {
      setFirebaseUid(u?.uid ?? null);
    });
    return unsub;
  }, []);

  // CRITICAL: Use refs so setSyncedData ALWAYS uses the latest userId/companyId
  // Without refs, setSyncedData captures stale values from its closure,
  // which causes writes to be skipped when userId/companyId update after mount.
  const userIdRef = useRef<string | null>(userId);
  const companyIdRef = useRef<string | null>(companyId);
  const collectionNameRef = useRef<string>(collectionName);

  // Keep refs in sync with latest prop values on every render
  userIdRef.current = userId;
  companyIdRef.current = companyId;
  collectionNameRef.current = collectionName;

  // Track the previous Firestore path so we know when user/company truly changes
  const previousPathRef = useRef<string | null>(null);

  // Refs to batch concurrent mutations within the same tick into a single microtask batch write
  const pendingPrevRef = useRef<T[] | null>(null);
  const isWriteScheduledRef = useRef<boolean>(false);

  useEffect(() => {
    if (isFirebaseAuthEnabled && firebaseAuth) {
      if (!firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== userId) {
        // Wait until auth state is synchronized with the requested userId to avoid permission errors
        return;
      }
    }

    let isSubscribed = true;

    const currentPath = `users/${userId}/companies/${companyId}/${collectionName}`;

    // Only reset data to initialState when the path truly changes
    // (user switches company or logs in as a different user).
    // Do NOT reset on first mount — keep current state until backend/Firestore responds.
    const pathChanged = previousPathRef.current !== null && previousPathRef.current !== currentPath;
    if (pathChanged) {
      console.log(`[Sync] Path changed for ${collectionName}. Resetting to initialState.`);
      setData(initialState);
      dataRef.current = initialState;
    }
    previousPathRef.current = currentPath;

    if (useBackend) {
      if (!companyId) return;
      const user = firebaseAuth?.currentUser;
      if (!user) {
        return;
      }

      callBackendApi(user, `/companies/${companyId}/collections/${collectionName}`)
        .then((items) => {
          if (!isSubscribed) return;
          if ((!items || items.length === 0) && initialState.length > 0) {
            console.log(`[Backend Sync] Seeding initial data for ${collectionName} in company ${companyId}`);
            setData(initialState);
            dataRef.current = initialState;
            
            // Seed to backend
            callBackendApi(user, `/companies/${companyId}/collections/${collectionName}/sync`, 'POST', {
              upserts: initialState,
              deletes: []
            })
              .then(() => {
                console.log(`[Backend Sync] Successfully seeded initial data for ${collectionName}`);
              })
              .catch((err) => {
                console.error(`[Backend Sync] Failed to seed initial data for ${collectionName}:`, err);
              });
          } else {
            // Auto-repair missing system items
            const missingItems = initialState.length > 0
              ? initialState.filter(initItem => !items.some((item: any) => item.id === initItem.id))
              : [];
              
            if (missingItems.length > 0) {
              console.log(`[Backend Sync] Repairing ${missingItems.length} missing system items in ${collectionName}`);
              const updatedData = [...items, ...missingItems];
              setData(updatedData);
              dataRef.current = updatedData;
              
              callBackendApi(user, `/companies/${companyId}/collections/${collectionName}/sync`, 'POST', {
                upserts: missingItems,
                deletes: []
              })
                .then(() => {
                  console.log(`[Backend Sync] Successfully repaired missing system items for ${collectionName}`);
                })
                .catch((err) => {
                  console.error(`[Backend Sync] Failed to repair system items for ${collectionName}:`, err);
                });
            } else {
              setData(items || []);
              dataRef.current = items || [];
            }
          }
        })
        .catch((err: any) => {
          console.error(`[Backend Sync] Fetch error for ${collectionName}:`, err);
          if (typeof window !== 'undefined') {
            showSyncAlertOnce(`❌ مشكلة في الاتصال بالسيرفر لقسم (${collectionName}). التفاصيل: ${err.message || err}`);
          }
        });

      return () => {
        isSubscribed = false;
      };
    }

    if (!firebaseDb || !companyId || !userId) {
      console.warn(`[Sync] Firebase not ready for ${collectionName}. DB=${!!firebaseDb}, Company=${!!companyId}, User=${!!userId}`);
      return;
    }

    const q = collection(firebaseDb, currentPath);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!isSubscribed) return;

      try {
        const items = snapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id
        })) as T[];

        setData(prev => {
          let nextVal = items;

          // Automatic cloud seeding: If Firestore is empty, push initialState to cloud
          if (items.length === 0 && initialState.length > 0 && !snapshot.metadata.hasPendingWrites) {
            console.log(`[Sync] Seeding initial data to Firestore collection: ${collectionName}`);
            const ops: Array<{ type: 'set' | 'delete'; path: string; data?: any }> = [];
            initialState.forEach(item => {
              if (!item.id) return;
              const path = `users/${userId}/companies/${companyId}/${collectionName}/${item.id}`;
              const cleanItem = JSON.parse(JSON.stringify(item));
              ops.push({ type: 'set', path, data: cleanItem });
            });
            const user = firebaseAuth?.currentUser;
            if (user && ops.length > 0) {
              withTimeout(
                executeFirestoreWrite(user, ops),
                15000,
                'انتهت مهلة تهيئة البيانات السحابية. يرجى التحقق من اتصال الإنترنت.'
              ).catch(err => {
                console.error(`Failed to seed ${collectionName}`, err);
              });
            }
            nextVal = initialState;
          }

          // Auto-repair missing system items if the collection is partially populated
          else if (items.length > 0 && initialState.length > 0 && !snapshot.metadata.hasPendingWrites) {
            const missingItems = initialState.filter(initItem => !items.some(item => item.id === initItem.id));
            if (missingItems.length > 0) {
              console.log(`[Sync] Repairing ${missingItems.length} missing system items in ${collectionName}`);
              const ops: Array<{ type: 'set' | 'delete'; path: string; data?: any }> = [];
              missingItems.forEach(item => {
                if (!item.id) return;
                const path = `users/${userId}/companies/${companyId}/${collectionName}/${item.id}`;
                const cleanItem = JSON.parse(JSON.stringify(item));
                ops.push({ type: 'set', path, data: cleanItem });
              });
              const user = firebaseAuth?.currentUser;
              if (user && ops.length > 0) {
                withTimeout(
                  executeFirestoreWrite(user, ops),
                  15000,
                  'انتهت مهلة إصلاح البيانات السحابية. يرجى التحقق من اتصال الإنترنت.'
                ).catch(err => console.error(`Failed to repair ${collectionName}`, err));
              }
              nextVal = [...items, ...missingItems];
            }
          }

          dataRef.current = nextVal;
          return nextVal;
        });
      } catch (err) {
        console.error(`Error processing snapshot for ${collectionName}:`, err);
      }
    }, (error) => {
      console.error(`Firestore connection error (${collectionName}):`, error);
      if (typeof window !== 'undefined') {
        showSyncAlertOnce(`مشكلة في الاتصال بالسحابة (${collectionName}). تأكد من إيقاف مانع الإعلانات أو الـ VPN. التفاصيل: ${error.message}`);
      }
    });

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, [companyId, collectionName, userId, firebaseUid]);

  const setSyncedData = useCallback((action: SetStateAction<T[]>) => {
    // 1. Calculate next state using our synchronously updated dataRef.current
    const prev = dataRef.current;
    const next = typeof action === 'function' ? (action as any)(prev) : action;

    // 2. Update the React state and our ref immediately
    setData(next);
    dataRef.current = next;

    // 3. Extract the latest values from refs
    const currentUserId = userIdRef.current;
    const currentCompanyId = companyIdRef.current;
    const currentCollectionName = collectionNameRef.current;

    if (!currentUserId || currentUserId === 'guest_user') {
      // Quietly allow guest user mutations in-memory without error logs/popups,
      // but log to console for debugging.
      console.log(`[Sync Info] Guest user mode: changes to ${currentCollectionName} kept in memory.`);
      return;
    }

    if (!useBackend && !firebaseDb) {
      const isFirebaseDisabled = typeof window !== 'undefined' && window.localStorage.getItem('disableFirebase') === 'true';
      if (isFirebaseDisabled) {
        console.warn(`[Sync Info] Firebase DB is intentionally disabled. Data for ${currentCollectionName} kept in memory.`);
      } else {
        console.error(`[Sync ERROR] Firebase DB is not initialized! Data for ${currentCollectionName} will NOT be saved.`);
        if (typeof window !== 'undefined') {
          showSyncAlertOnce(`⚠️ خطأ حرج: قاعدة البيانات غير متصلة!\nالبيانات لن تُحفظ. تحقق من إعدادات Firebase.`);
        }
      }
      return;
    }

    if (!currentCompanyId) {
      console.error(`[Sync ERROR] No company selected! Data for ${currentCollectionName} will NOT be saved.`);
      return;
    }

    // 4. Perform the write in the event thread (outside render, batched in a microtask)
    if (!(window as any).__IS_HYDRATING__) {
      // Capture the state *before* this tick's updates began
      if (pendingPrevRef.current === null) {
        pendingPrevRef.current = prev;
      }

      if (!isWriteScheduledRef.current) {
        isWriteScheduledRef.current = true;

        Promise.resolve().then(() => {
          isWriteScheduledRef.current = false;
          
          const initialPrev = pendingPrevRef.current;
          pendingPrevRef.current = null;

          if (initialPrev === null) return;

          const finalNext = dataRef.current;

          const prevMap = new Map(initialPrev.map(p => [p.id, p]));
          const nextMap = new Map(finalNext.map((n: T) => [n.id, n]));

          const toUpsert: T[] = [];
          const toDelete: string[] = [];

          finalNext.forEach((n: T) => {
            if (!n.id) return;
            const p = prevMap.get(n.id);
            if (!p || JSON.stringify(p) !== JSON.stringify(n)) {
              toUpsert.push(n);
            }
          });

          initialPrev.forEach(p => {
            if (p.id && !nextMap.has(p.id)) {
              toDelete.push(p.id);
            }
          });

          // Fetch absolute latest ref values for writing
          const activeUserId = userIdRef.current;
          const activeCompanyId = companyIdRef.current;
          const activeCollectionName = collectionNameRef.current;

          if (activeUserId && activeCompanyId && (toUpsert.length > 0 || toDelete.length > 0)) {
            const user = firebaseAuth?.currentUser;
            if (user) {
              if (useBackend) {
                // Call Custom Backend Sync API
                callBackendApi(user, `/companies/${activeCompanyId}/collections/${activeCollectionName}/sync`, 'POST', {
                  upserts: toUpsert,
                  deletes: toDelete
                })
                  .then(() => {
                    console.log(`[Backend Sync SUCCESS] ${activeCollectionName} changes synced to custom backend ✅`);
                  })
                  .catch(err => {
                    console.error(`[Backend Sync ERROR] Failed to sync ${activeCollectionName}:`, err);
                    // Suppress transient membership/permission errors during user switching
                    const errMsg = err.message || '';
                    if (errMsg.includes('Forbidden') || errMsg.includes('not a member') || errMsg.includes('foreign key')) {
                      console.warn(`[Backend Sync] Suppressed transient error for ${activeCollectionName} (likely user switch in progress)`);
                      return;
                    }
                    if (typeof window !== 'undefined') {
                      showSyncAlertOnce(`❌ خطأ في الحفظ على السيرفر الخلفي (${activeCollectionName}):\n${err.message}`);
                    }
                  });
              } else {
                // Call Firestore Proxy API (old method)
                if (activeUserId !== 'guest_user') {
                  console.log(`[Sync] Saving to Firestore via Proxy: ${activeCollectionName} user=${activeUserId} company=${activeCompanyId} upserts=${toUpsert.length} deletes=${toDelete.length}`);

                  const ops: Array<{ type: 'set' | 'delete'; path: string; data?: any }> = [];

                  toUpsert.forEach(item => {
                    const path = `users/${activeUserId}/companies/${activeCompanyId}/${activeCollectionName}/${item.id!}`;
                    const cleanItem = JSON.parse(JSON.stringify(item));
                    ops.push({ type: 'set', path, data: cleanItem });
                  });

                  toDelete.forEach(id => {
                    const path = `users/${activeUserId}/companies/${activeCompanyId}/${activeCollectionName}/${id}`;
                    ops.push({ type: 'delete', path });
                  });

                  withTimeout(
                    executeFirestoreWrite(user, ops),
                    15000,
                    `انتهت مهلة حفظ البيانات في السحابة لقسم (${activeCollectionName}). يرجى التحقق من اتصال الإنترنت.`
                  )
                    .then(() => {
                      console.log(`[Sync SUCCESS] ${activeCollectionName}: ${toUpsert.length + toDelete.length} changes saved to cloud ✅`);
                    })
                    .catch(err => {
                      console.error(`[Sync ERROR] Failed to sync ${activeCollectionName}:`, err);
                      if (typeof window !== 'undefined') {
                        showSyncAlertOnce(`❌ خطأ في الحفظ السحابي (${activeCollectionName}):\n${err.message || 'حدث خطأ غير معروف'}`);
                      }
                    });
                }
              }
            }
          }
        });
      }
    }
  // setSyncedData never needs to be recreated — it reads from refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [data, setSyncedData];
}
