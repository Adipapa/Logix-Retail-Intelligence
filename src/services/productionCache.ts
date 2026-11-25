import type {
  ProductionMetadataResponse,
  ProductionMonitorResponse,
  ProductionReportsResponse,
} from "./api";

export interface ProductionCacheSnapshot {
  version: string;
  savedAt: string;
  reports: ProductionReportsResponse;
  metadata: ProductionMetadataResponse;
  monitor: ProductionMonitorResponse;
}

const DB_NAME = "logix-retail-cache";
const STORE_NAME = "production";

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser does not support IndexedDB."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open local production cache."));
  });
}

export async function readProductionCache(userId: string): Promise<ProductionCacheSnapshot | null> {
  const db = await openCacheDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(userId);
      request.onsuccess = () => resolve((request.result as ProductionCacheSnapshot | undefined) ?? null);
      request.onerror = () => reject(request.error || new Error("Unable to read local production cache."));
    });
  } finally {
    db.close();
  }
}

export async function writeProductionCache(userId: string, snapshot: ProductionCacheSnapshot): Promise<void> {
  const db = await openCacheDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(snapshot, userId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to save local production cache."));
      transaction.onabort = () => reject(transaction.error || new Error("Local production cache save was aborted."));
    });
  } finally {
    db.close();
  }
}
