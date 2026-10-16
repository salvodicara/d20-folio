/**
 * Firestore adapter for the session log: `campaigns/{campaignId}/sessionLogs/{sessionId}`
 * holds `{ schema: 1, log: LogItem[], lastAt }`. Appends use `arrayUnion` inside a merge
 * write, which works offline, creates the document on the first gesture and gives every
 * client the same order. The rules allow exactly one own item per write.
 *
 * Phase 3b (docs/architecture/session-log-per-event.md): readers also accept one
 * document per item under `{sessionId}/items/{itemId}`, read in server order
 * (`serverAt`) after the head's array. Writers still append to the array.
 */

import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Firestore,
  type QuerySnapshot,
} from "firebase/firestore";

import type { LogItem, SessionHead, SessionLogStore } from "@/lib/session-log";

/** Shared input: keep only items with the envelope the fold relies on. */
function isLogItem(value: unknown): value is LogItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.by !== "string") return false;
  if (typeof item.at !== "number") return false;
  const hasEvent = typeof item.event === "object" && item.event !== null;
  if (item.type === "event") return hasEvent;
  if (item.type === "correct") return hasEvent && typeof item.target === "string";
  if (item.type === "move")
    return (
      typeof item.target === "string" &&
      (item.after === null || typeof item.after === "string")
    );
  return (
    (item.type === "retract" || item.type === "hide" || item.type === "show") &&
    typeof item.target === "string"
  );
}

/** The document a per-event item is stored as: the item, stamped with the server's time. */
export function perEventItemDoc(item: LogItem): Record<string, unknown> {
  return { ...item, serverAt: serverTimestamp() };
}

/** The head's array items, in their order. */
function arrayItems(log: unknown): LogItem[] {
  return Array.isArray(log) ? log.filter(isLogItem) : [];
}

/** The per-event items in server order, then by id. A write still pending on this
 *  device counts at its estimated server time, so it shows at once. */
function perEventItems(snap: QuerySnapshot): LogItem[] {
  return snap.docs
    .map((d) => {
      const { serverAt, ...item } = d.data({ serverTimestamps: "estimate" });
      const ms = serverAt instanceof Timestamp ? serverAt.toMillis() : Number.MAX_VALUE;
      return { id: d.id, ms, item };
    })
    .sort((a, b) => a.ms - b.ms || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((entry) => entry.item)
    .filter(isLogItem);
}

export function createFirestoreSessionLogStore(
  db: Firestore,
  campaignId: string
): SessionLogStore {
  const logs = collection(db, "campaigns", campaignId, "sessionLogs");
  const items = (sessionId: string) => collection(logs, sessionId, "items");
  return {
    async latest(): Promise<SessionHead | null> {
      const snap = await getDocs(query(logs, orderBy("lastAt", "desc"), limit(1)));
      const head = snap.docs[0];
      return head ? { id: head.id, lastAt: Number(head.data().lastAt) } : null;
    },
    async recent(count) {
      const snap = await getDocs(query(logs, orderBy("lastAt", "desc"), limit(count)));
      return Promise.all(
        snap.docs.map(async (d) => ({
          id: d.id,
          lastAt: Number(d.data().lastAt),
          items: [
            ...arrayItems(d.data().log),
            ...perEventItems(await getDocs(items(d.id))),
          ],
        }))
      );
    },
    async append(sessionId, item) {
      await setDoc(
        doc(logs, sessionId),
        { schema: 1, log: arrayUnion(item), lastAt: item.at },
        { merge: true }
      );
    },
    subscribe(sessionId, onItems, onError) {
      // Two listeners, one log: emit once both have answered, then on every change.
      let head: LogItem[] | null = null;
      let perEvent: LogItem[] | null = null;
      const emit = () => {
        if (head && perEvent) onItems([...head, ...perEvent]);
      };
      const stopHead = onSnapshot(
        doc(logs, sessionId),
        (snap) => {
          head = arrayItems(snap.data()?.log);
          emit();
        },
        (error) => onError?.(error)
      );
      const stopItems = onSnapshot(
        items(sessionId),
        (snap) => {
          perEvent = perEventItems(snap);
          emit();
        },
        (error) => onError?.(error)
      );
      return () => {
        stopHead();
        stopItems();
      };
    },
  };
}
