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
  return null;
};

export const writeWorkspaceSnapshotRecord = async (companyId: string, snapshot: unknown): Promise<boolean> => {
  return false;
};

export const deleteWorkspaceSnapshotRecord = async (companyId: string): Promise<boolean> => {
  return true;
};

export const hasAnyWorkspaceSnapshotRecord = async (): Promise<boolean> => {
  return false;
};

export const clearWorkspaceSnapshotStorage = async (): Promise<void> => {
  pendingWrites.clear();
};
