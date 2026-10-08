/**
 * Firestore adapter for the session log: `campaigns/{campaignId}/sessionLogs/{sessionId}`
 * holds `{ schema: 1, log: LogItem[], lastAt }`. Appends use `arrayUnion` inside a merge
 * write, which works offline, creates the document on the first gesture and gives every
 * client the same order. The rules allow exactly one own item per write.
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
  setDoc,
  type Firestore,
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
  return item.type === "retract" && typeof item.target === "string";
}

export function createFirestoreSessionLogStore(
  db: Firestore,
  campaignId: string
): SessionLogStore {
  const logs = collection(db, "campaigns", campaignId, "sessionLogs");
  return {
    async latest(): Promise<SessionHead | null> {
      const snap = await getDocs(query(logs, orderBy("lastAt", "desc"), limit(1)));
      const head = snap.docs[0];
      return head ? { id: head.id, lastAt: Number(head.data().lastAt) } : null;
    },
    async append(sessionId, item) {
      await setDoc(
        doc(logs, sessionId),
        { schema: 1, log: arrayUnion(item), lastAt: item.at },
        { merge: true }
      );
    },
    subscribe(sessionId, onItems) {
      return onSnapshot(doc(logs, sessionId), (snap) => {
        const log: unknown = snap.data()?.log;
        onItems(Array.isArray(log) ? log.filter(isLogItem) : []);
      });
    },
  };
}
