const WORKSPACE_DB_NAME = 'al_mohaseb_workspace_storage';
const WORKSPACE_STORE_NAME = 'company_workspace_snapshots';
const WORKSPACE_DB_VERSION = 1;
const INDEXED_DB_OPERATION_TIMEOUT_MS = 2500;

let openDatabasePromise: Promise<IDBDatabase | null> | null = null;
const pendingWrites = new Map<string, Promise<boolean>>();

const canUseIndexedDb = (): boolean => (
  typeof window !== 'undefined' &&
  typeof window.indexedDB !== 'undefined'
);

const resetOpenDatabasePromise = () => {
  openDatabasePromise = null;
};

const withIndexedDbTimeout = <T>(
  fallback: T,
  operation: (finish: (value: T) => void, didTimeout: () => boolean) => void,
  onTimeout?: () => void
): Promise<T> => new Promise((resolve) => {
  let settled = false;
  let timedOut = false;

  const finish = (value: T) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(value);
  };

  const timer = setTimeout(() => {
    if (settled) return;
    timedOut = true;
    onTimeout?.();
    finish(fallback);
  }, INDEXED_DB_OPERATION_TIMEOUT_MS);

  try {
    operation(finish, () => timedOut);
  } catch {
    finish(fallback);
  }
});

const resolveDatabaseHandle = async (): Promise<IDBDatabase | null> => {
  if (!canUseIndexedDb()) return null;
  if (openDatabasePromise) return openDatabasePromise;

  openDatabasePromise = withIndexedDbTimeout<IDBDatabase | null>(
    null,
    (finish, didTimeout) => {
      const request = window.indexedDB.open(WORKSPACE_DB_NAME, WORKSPACE_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(WORKSPACE_STORE_NAME)) {
          db.createObjectStore(WORKSPACE_STORE_NAME);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        if (didTimeout()) {
          try {
            db.close();
          } catch {
            // Ignore close failures after timeout cleanup.
          }
          return;
        }
        db.onversionchange = () => {
          try {
            db.close();
          } catch {
            // Ignore close failures and reopen on the next request.
          }
          resetOpenDatabasePromise();
        };
        finish(db);
      };

      request.onerror = () => {
        resetOpenDatabasePromise();
        finish(null);
      };

      request.onblocked = () => {
        resetOpenDatabasePromise();
        finish(null);
      };
    },
    () => {
      resetOpenDatabasePromise();
    }
  );

  return openDatabasePromise;
};

const writeWorkspaceSnapshotRecordNow = async (companyId: string, snapshot: unknown): Promise<boolean> => {
  const db = await resolveDatabaseHandle();
  if (!db) return false;

  return withIndexedDbTimeout<boolean>(false, (finish) => {
    const transaction = db.transaction(WORKSPACE_STORE_NAME, 'readwrite');
    transaction.oncomplete = () => finish(true);
    transaction.onerror = () => finish(false);
    transaction.onabort = () => finish(false);
    transaction.objectStore(WORKSPACE_STORE_NAME).put(snapshot, companyId);
  });
};

export const readWorkspaceSnapshotRecord = async (companyId: string): Promise<unknown | null> => {
  if (!companyId) return null;

  const db = await resolveDatabaseHandle();
  if (!db) return null;

  return withIndexedDbTimeout<unknown | null>(null, (finish) => {
    const transaction = db.transaction(WORKSPACE_STORE_NAME, 'readonly');
    transaction.onabort = () => finish(null);
    transaction.onerror = () => finish(null);
    const request = transaction.objectStore(WORKSPACE_STORE_NAME).get(companyId);
    request.onsuccess = () => finish(request.result ?? null);
    request.onerror = () => finish(null);
  });
};

export const writeWorkspaceSnapshotRecord = async (companyId: string, snapshot: unknown): Promise<boolean> => {
  if (!companyId) return false;

  const previous = pendingWrites.get(companyId) || Promise.resolve(true);
  const next = previous
    .catch(() => false)
    .then(() => writeWorkspaceSnapshotRecordNow(companyId, snapshot));

  pendingWrites.set(companyId, next);

  try {
    return await next;
  } finally {
    if (pendingWrites.get(companyId) === next) {
      pendingWrites.delete(companyId);
    }
  }
};

export const deleteWorkspaceSnapshotRecord = async (companyId: string): Promise<boolean> => {
  if (!companyId) return false;

  const db = await resolveDatabaseHandle();
  if (!db) return false;

  return withIndexedDbTimeout<boolean>(false, (finish) => {
    const transaction = db.transaction(WORKSPACE_STORE_NAME, 'readwrite');
    transaction.oncomplete = () => finish(true);
    transaction.onerror = () => finish(false);
    transaction.onabort = () => finish(false);
    transaction.objectStore(WORKSPACE_STORE_NAME).delete(companyId);
  });
};

export const hasAnyWorkspaceSnapshotRecord = async (): Promise<boolean> => {
  const db = await resolveDatabaseHandle();
  if (!db) return false;

  return withIndexedDbTimeout<boolean>(false, (finish) => {
    const transaction = db.transaction(WORKSPACE_STORE_NAME, 'readonly');
    transaction.onabort = () => finish(false);
    transaction.onerror = () => finish(false);
    const request = transaction.objectStore(WORKSPACE_STORE_NAME).count();
    request.onsuccess = () => finish(Number(request.result || 0) > 0);
    request.onerror = () => finish(false);
  });
};

export const clearWorkspaceSnapshotStorage = async (): Promise<void> => {
  pendingWrites.clear();

  if (!canUseIndexedDb()) return;

  try {
    const db = await resolveDatabaseHandle();
    if (db) {
      try {
        db.close();
      } catch {
        // Ignore close failures and continue deleting the database.
      }
    }
  } catch {
    // Ignore read/open failures and continue deleting the database.
  } finally {
    resetOpenDatabasePromise();
  }

  await withIndexedDbTimeout<void>(undefined, (finish) => {
    const request = window.indexedDB.deleteDatabase(WORKSPACE_DB_NAME);
    request.onsuccess = () => finish(undefined);
    request.onerror = () => finish(undefined);
    request.onblocked = () => finish(undefined);
  });
};
