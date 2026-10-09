import type { EncounterState } from "@/types/campaign";

import { loggedIds, mirrorEncounter } from "./encounter-mirror";
import { foldSession, type SessionEntry } from "./fold";
import { nextSessionId, type SessionLogStore } from "./recorder";

/**
 * Keeps the session log in step with the DM's live encounter on the DM's device. It
 * subscribes to the open session, and on every encounter change or log snapshot appends
 * what `mirrorEncounter` reports missing. Writes never block or fail the fight: a failed
 * append is reported and retried on the next change.
 */
export function createEncounterMirror(deps: {
  store: SessionLogStore;
  uid: string;
  dmUid: string;
  now?: () => Date;
  onError?: (error: unknown) => void;
}): { update(encounter: EncounterState | null): void; stop(): void } {
  const now = deps.now ?? (() => new Date());
  let encounter: EncounterState | null = null;
  let entries: SessionEntry[] | null = null;
  let written: Set<string> = new Set();
  let sessionId: string | null = null;
  let unsubscribe: (() => void) | null = null;
  let stopped = false;
  const inFlight = new Set<string>();

  const flush = (): void => {
    if (stopped || entries === null || sessionId === null) return;
    const target = sessionId;
    for (const draft of mirrorEncounter(encounter, entries, written)) {
      if (inFlight.has(draft.id)) continue;
      inFlight.add(draft.id);
      deps.store
        .append(target, { ...draft, by: deps.uid, at: now().getTime() })
        .catch((error: unknown) => {
          inFlight.delete(draft.id);
          deps.onError?.(error);
        });
    }
  };

  void deps.store
    .latest()
    .then((head) => {
      if (stopped) return;
      sessionId = nextSessionId(head, now());
      unsubscribe = deps.store.subscribe(
        sessionId,
        (items) => {
          entries = foldSession(items, { dmUid: deps.dmUid });
          written = loggedIds(items);
          flush();
        },
        deps.onError
      );
    })
    .catch((error: unknown) => deps.onError?.(error));

  return {
    update(next) {
      encounter = next;
      flush();
    },
    stop() {
      stopped = true;
      unsubscribe?.();
    },
  };
}
