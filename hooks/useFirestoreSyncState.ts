import { useState, useEffect, useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { firebaseAuth, callBackendApi } from '../firebaseClient';

let lastAlertTime = 0;
const GUEST_USER_ID = 'guest_user';

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

const getLocalSnapshotCollection = <T>(
  companyId: string | null,
  collectionName: string,
  userId: string | null
): T[] | null => {
  if (typeof window === 'undefined' || !companyId || userId !== GUEST_USER_ID) return null;
  try {
    const raw = localStorage.getItem(`al_mohaseb_workspace_${companyId}`) ||
                localStorage.getItem(`smart_account_workspace_snapshot_${companyId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed[collectionName])) {
      return parsed[collectionName] as T[];
    }
  } catch {
    // Ignore JSON parse errors
  }
  return null;
};

export function useFirestoreSyncState<T extends { id?: string }>(
  collectionName: string,
  initialState: T[],
  companyId: string | null,
  userId: string | null,
  queryParams?: {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
  }
): [T[], Dispatch<SetStateAction<T[]>>, boolean, boolean] {
  const [data, setData] = useState<T[]>(() => {
    const local = getLocalSnapshotCollection<T>(companyId, collectionName, userId);
    return (local && local.length > 0) ? local : initialState;
  });
  const dataRef = useRef<T[]>(data);
  const lastDataUpdateTimeRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

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



  const userIdRef = useRef<string | null>(userId);
  const companyIdRef = useRef<string | null>(companyId);
  const collectionNameRef = useRef<string>(collectionName);

  userIdRef.current = userId;
  companyIdRef.current = companyId;
  collectionNameRef.current = collectionName;

  const previousPathRef = useRef<string | null>(null);
  const pendingPrevRef = useRef<T[] | null>(null);
  const isWriteScheduledRef = useRef<boolean>(false);

  const limit = queryParams?.limit;
  const page = queryParams?.page;
  const providedOffset = queryParams?.offset;
  const offset = providedOffset !== undefined ? providedOffset : (page !== undefined && limit !== undefined ? (page - 1) * limit : undefined);
  const startDate = queryParams?.startDate;
  const endDate = queryParams?.endDate;

  useEffect(() => {
    let isSubscribed = true;
    const currentPath = `users/${userId}/companies/${companyId}/${collectionName}`;

    const pathChanged = previousPathRef.current !== null && previousPathRef.current !== currentPath;
    if (pathChanged) {
      console.log(`[Sync] Path changed for ${collectionName}. Resetting to initialState.`);
      const local = getLocalSnapshotCollection<T>(companyId, collectionName, userId);
      const nextData = (local && local.length > 0) ? local : initialState;
      setData(nextData);
      dataRef.current = nextData;
      setHasMore(true);
    }
    previousPathRef.current = currentPath;

    if (!companyId) return;

    const isPaginated = limit !== undefined && offset !== undefined;
    if (isPaginated && offset > 0 && !hasMore && !pathChanged) {
      return;
    }

    const user = firebaseAuth?.currentUser;
    if (!user) {
      const local = getLocalSnapshotCollection<T>(companyId, collectionName, userId);
      if (local && local.length > 0 && dataRef.current.length === 0) {
        setData(local);
        dataRef.current = local;
      }
      return;
    }

    let url = `/companies/${companyId}/collections/${collectionName}`;
    const params = new URLSearchParams();
    if (limit !== undefined) params.append('limit', String(limit));
    if (offset !== undefined) params.append('offset', String(offset));
    if (page !== undefined) params.append('page', String(page));
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const queryString = params.toString();
    if (queryString) url += `?${queryString}`;

    setLoading(true);
    callBackendApi(user, url)
      .then((items) => {
        if (!isSubscribed) return;
        setLoading(false);

        const fetchedCount = items ? items.length : 0;
        const currentLimit = limit ?? 20;
        if (fetchedCount < currentLimit) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }

        if ((!items || items.length === 0) && initialState.length > 0 && (!offset || offset === 0)) {
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
          const missingItems = initialState.length > 0 && (!offset || offset === 0)
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
            if (offset && offset > 0) {
              setData(prev => {
                const existingIds = new Set(prev.map(x => x.id));
                const newItems = (items || []).filter((x: any) => !existingIds.has(x.id));
                if (newItems.length === 0) {
                  return prev;
                }
                const combined = [...prev, ...newItems];
                dataRef.current = combined;
                return combined;
              });
            } else {
              setData(items || []);
              dataRef.current = items || [];
            }
          }
        }
      })
      .catch((err: any) => {
        if (!isSubscribed) return;
        setLoading(false);
        console.error(`[Backend Sync] Fetch error for ${collectionName}:`, err);
        if (typeof window !== 'undefined') {
          showSyncAlertOnce(`❌ مشكلة في الاتصال بالسيرفر لقسم (${collectionName}). التفاصيل: ${err.message || err}`);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [companyId, collectionName, userId, limit, offset, startDate, endDate]);

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

  return [data, setSyncedData, loading, hasMore];
}
