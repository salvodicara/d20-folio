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
  /** A player's device: the fight's markers only (start, rounds, end), each sent after
   *  the one before has landed, so a device joining mid-fight writes them in order. */
  markersOnly?: boolean;
}): { update(encounter: EncounterState | null): void; stop(): void } {
  const now = deps.now ?? (() => new Date());
  let encounter: EncounterState | null = null;
  let entries: SessionEntry[] | null = null;
  let written: Set<string> = new Set();
  let sessionId: string | null = null;
  let unsubscribe: (() => void) | null = null;
  let stopped = false;
  const inFlight = new Set<string>();

  let chain: Promise<void> = Promise.resolve();
  const flush = (): void => {
    if (stopped || entries === null || sessionId === null) return;
    const target = sessionId;
    const drafts = mirrorEncounter(encounter, entries, written, {
      markersOnly: deps.markersOnly === true,
    });
    if (deps.markersOnly) {
      // One after the other: the start lands before its rounds, each round before the next.
      for (const draft of drafts) {
        if (inFlight.has(draft.id)) continue;
        inFlight.add(draft.id);
        chain = chain.then(() =>
          stopped
            ? undefined
            : deps.store
                .append(target, { ...draft, by: deps.uid, at: now().getTime() })
                .catch((error: unknown) => {
                  inFlight.delete(draft.id);
                  deps.onError?.(error);
                })
        );
      }
      return;
    }
    for (const draft of drafts) {
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
          // Hidden lines still happened: the mirror must not record them again.
          entries = foldSession(items, { dmUid: deps.dmUid }, { includeHidden: true });
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
