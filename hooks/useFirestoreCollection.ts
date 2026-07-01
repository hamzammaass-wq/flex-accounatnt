import { useState, useEffect } from 'react';
import { callBackendApi } from '../firebaseClient';

export function useFirestoreCollection<T extends { id: string }>(
  companyId: string,
  collectionName: string,
  initialData: T[] = []
) {
  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!companyId) {
      setData(initialData);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const fetchCollection = async () => {
      try {
        const response = await callBackendApi(null, `/companies/${companyId}/${collectionName}`);
        if (isMounted) {
          setData(response.data || []);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error(`Error fetching ${collectionName}:`, err);
          setError(err);
          setLoading(false);
        }
      }
    };

    fetchCollection();

    return () => {
      isMounted = false;
    };
  }, [companyId, collectionName]);

  const saveItem = async (item: T) => {
    if (!companyId) {
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

    try {
      await callBackendApi(null, `/companies/${companyId}/${collectionName}/${item.id}`, 'PUT', item);
      setData((prev) => {
        const idx = prev.findIndex((p) => p.id === item.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = item;
          return next;
        }
        return [...prev, item];
      });
    } catch (err) {
      console.error(`Error saving item in ${collectionName}:`, err);
      throw err;
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!companyId) {
       // Offline / Trial fallback
       setData((prev) => prev.filter((p) => p.id !== itemId));
       return;
    }

    try {
      await callBackendApi(null, `/companies/${companyId}/${collectionName}/${itemId}`, 'DELETE');
      setData((prev) => prev.filter((p) => p.id !== itemId));
    } catch (err) {
      console.error(`Error deleting item in ${collectionName}:`, err);
      throw err;
    }
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
