import type { Breadcrumb } from "./types";

const DB_NAME = "d20-folio-diagnostics";
const DB_VERSION = 1;
const STORE = "breadcrumbs";
const KEY = "ring";
let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(String(request.error)));
  });
  return dbPromise;
}

export async function persistBreadcrumbs(list: readonly Breadcrumb[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put([...list], KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(String(tx.error)));
    });
  } catch {
    // IndexedDB unavailable (private mode, quota) — breadcrumbs stay in memory.
  }
}

export async function loadBreadcrumbs(): Promise<Breadcrumb[] | null> {
  try {
    const db = await getDB();
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    return await new Promise((resolve, reject) => {
      request.onsuccess = () =>
        resolve(Array.isArray(request.result) ? (request.result as Breadcrumb[]) : null);
      request.onerror = () => reject(new Error(String(request.error)));
    });
  } catch {
    return null;
  }
}
