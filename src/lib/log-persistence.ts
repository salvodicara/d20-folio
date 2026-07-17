/**
 * Action Log IndexedDB Persistence
 *
 * Provides a local backup of action log entries in IndexedDB.
 * This ensures logs survive browser close even when offline,
 * independent of Firestore's offline cache.
 *
 * Database: d20-folio-logs
 * Object Store: logs (keyed by characterId)
 */

import type { LogEntry } from "@/types/character";

const DB_NAME = "d20-folio-logs";
const DB_VERSION = 1;
const STORE_NAME = "logs";

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(String(request.error)));
  });

  return dbPromise;
}

/**
 * Save log entries for a character to IndexedDB.
 */
export async function saveLogToIDB(
  characterId: string,
  entries: LogEntry[]
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(entries, characterId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(String(tx.error)));
    });
  } catch {
    // Silently fail — IndexedDB may be unavailable in some contexts
  }
}

/**
 * Load log entries for a character from IndexedDB.
 */
export async function loadLogFromIDB(characterId: string): Promise<LogEntry[] | null> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(characterId);
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as LogEntry[] | null);
      request.onerror = () => reject(new Error(String(request.error)));
    });
  } catch {
    return null;
  }
}

/**
 * Delete log entries for a character from IndexedDB.
 */
export async function clearLogFromIDB(characterId: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(characterId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(String(tx.error)));
    });
  } catch {
    // Silently fail
  }
}
