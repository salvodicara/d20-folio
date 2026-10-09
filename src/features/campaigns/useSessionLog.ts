/**
 * The open session of a campaign, live: its folded lines and a way to append to it.
 * Every member reads it (the Combat Chronicle is a view of it); the session is resolved
 * the same way the writers resolve it (`nextSessionId`), again whenever `key` changes
 * (a new encounter), so a reader and the DM mirror always look at the same document.
 * Failures go to diagnostics and leave the feed empty; they never touch the fight.
 */

import { useCallback, useEffect, useState } from "react";

import { diagnosticsLog } from "@/lib/diagnostics";
import {
  foldSession,
  nextSessionId,
  type LogItem,
  type SessionEntry,
} from "@/lib/session-log";
import { sessionLogStoreFor } from "@/features/campaigns/session-log-source";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An item to append; `id` defaults to a fresh one, `by`/`at` are stamped here. */
export type SessionDraft = DistributiveOmit<LogItem, "id" | "by" | "at"> & {
  id?: string;
};

export interface SessionLogView {
  entries: SessionEntry[];
  /** Append in call order (Firestore keeps the send order); a no-op until the session
   *  is resolved or without a signed-in user. */
  append(drafts: SessionDraft[]): Promise<void>;
}

export function useSessionLog(
  campaignId: string,
  uid: string | undefined,
  dmUid: string | undefined,
  key: unknown
): SessionLogView {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<SessionEntry[]>([]);

  useEffect(() => {
    const onError = (error: unknown): void =>
      diagnosticsLog("warn", "session-log.read-failed", { message: String(error) });
    let stopped = false;
    let unsubscribe: (() => void) | null = null;
    let store: ReturnType<typeof sessionLogStoreFor>;
    try {
      store = sessionLogStoreFor(campaignId);
    } catch (error) {
      onError(error);
      return;
    }
    void store
      .latest()
      .then((head) => {
        if (stopped) return;
        const id = nextSessionId(head, new Date());
        setSessionId(id);
        unsubscribe = store.subscribe(
          id,
          (items) => setEntries(foldSession(items, { dmUid })),
          onError
        );
      })
      .catch(onError);
    return () => {
      stopped = true;
      unsubscribe?.();
    };
  }, [campaignId, dmUid, key]);

  const append = useCallback(
    async (drafts: SessionDraft[]): Promise<void> => {
      if (!sessionId || !uid) return;
      const store = sessionLogStoreFor(campaignId);
      const writes = drafts.map((draft) =>
        store.append(sessionId, {
          ...draft,
          id: draft.id ?? crypto.randomUUID(),
          by: uid,
          at: Date.now(),
        })
      );
      await Promise.all(writes);
    },
    [campaignId, sessionId, uid]
  );

  return { entries, append };
}
