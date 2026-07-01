import { useState, useEffect, useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { firebaseAuth, callBackendApi } from '../firebaseClient';

let lastAlertTime = 0;

export const showSyncAlertOnce = (message: string) => {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  
  console.warn(`[Sync Alert] ${message}`);
  
  if (now - lastAlertTime < 60000) {
    return;
  }
  
  lastAlertTime = now;
  alert(message);
};

export function useFirestoreSyncState<T extends { id?: string }>(
  collectionName: string,
  initialState: T[],
  companyId: string | null,
  userId: string | null
): [T[], Dispatch<SetStateAction<T[]>>] {
  const [data, setData] = useState<T[]>(initialState);
  const dataRef = useRef<T[]>(initialState);
  const lastDataUpdateTimeRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastDataUpdateTimeRef.current > 50) {
      dataRef.current = data;
      lastDataUpdateTimeRef.current = now;
    } else {
      const timer = setTimeout(() => {
        dataRef.current = data;
        lastDataUpdateTimeRef.current = Date.now();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [data]);

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

  const userIdRef = useRef<string | null>(userId);
  const companyIdRef = useRef<string | null>(companyId);
  const collectionNameRef = useRef<string>(collectionName);

  userIdRef.current = userId;
  companyIdRef.current = companyId;
  collectionNameRef.current = collectionName;

  const previousPathRef = useRef<string | null>(null);
  const pendingPrevRef = useRef<T[] | null>(null);
  const isWriteScheduledRef = useRef<boolean>(false);

  useEffect(() => {
    let isSubscribed = true;
    const currentPath = `users/${userId}/companies/${companyId}/${collectionName}`;

    const pathChanged = previousPathRef.current !== null && previousPathRef.current !== currentPath;
    if (pathChanged) {
      console.log(`[Sync] Path changed for ${collectionName}. Resetting to initialState.`);
      setData(initialState);
      dataRef.current = initialState;
    }
    previousPathRef.current = currentPath;

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
  }, [companyId, collectionName, userId, firebaseUid]);

  const setSyncedData = useCallback((action: SetStateAction<T[]>) => {
    const prev = dataRef.current;
    const next = typeof action === 'function' ? (action as any)(prev) : action;

    setData(next);
    dataRef.current = next;

    const currentUserId = userIdRef.current;
    const currentCompanyId = companyIdRef.current;
    const currentCollectionName = collectionNameRef.current;

    if (!currentUserId || currentUserId === 'guest_user') {
      console.log(`[Sync Info] Guest user mode: changes to ${currentCollectionName} kept in memory.`);
      return;
    }

    if (!currentCompanyId) {
      console.error(`[Sync ERROR] No company selected! Data for ${currentCollectionName} will NOT be saved.`);
      return;
    }

    if (!(window as any).__IS_HYDRATING__) {
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

          const activeUserId = userIdRef.current;
          const activeCompanyId = companyIdRef.current;
          const activeCollectionName = collectionNameRef.current;

          if (activeUserId && activeCompanyId && (toUpsert.length > 0 || toDelete.length > 0)) {
            const user = firebaseAuth?.currentUser;
            if (user) {
              callBackendApi(user, `/companies/${activeCompanyId}/collections/${activeCollectionName}/sync`, 'POST', {
                upserts: toUpsert,
                deletes: toDelete
              })
                .then(() => {
                  console.log(`[Backend Sync SUCCESS] ${activeCollectionName} changes synced to custom backend ✅`);
                })
                .catch(err => {
                  console.error(`[Backend Sync ERROR] Failed to sync ${activeCollectionName}:`, err);
                  const errMsg = err.message || '';
                  if (errMsg.includes('Forbidden') || errMsg.includes('not a member') || errMsg.includes('foreign key')) {
                    console.warn(`[Backend Sync] Suppressed transient error for ${activeCollectionName} (likely user switch in progress)`);
                    return;
                  }
                  if (typeof window !== 'undefined') {
                    showSyncAlertOnce(`❌ خطأ في الحفظ على السيرفر الخلفي (${activeCollectionName}):\n${err.message}`);
                  }
                });
            }
          }
        });
      }
    }
  }, []);

  return [data, setSyncedData];
}
