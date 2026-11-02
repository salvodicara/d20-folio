/**
 * The one place that decides where a campaign's session log lives: Firestore in the
 * app, an in-memory store under dev bypass (so the DM mirror, the player recorder and the
 * report all work end-to-end locally, with no backend). One store per campaign per page
 * load, so every reader and writer on the device shares it.
 */

import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { db } from "@/lib/firebase";
import { createMemorySessionLogStore, type SessionLogStore } from "@/lib/session-log";
import { createFirestoreSessionLogStore } from "@/lib/session-log-io";
import { makeDevEvening } from "@/features/campaigns/dev-fixture";

/** Dev bypass: an in-memory log, holding the opt-in played evening when it is asked for. */
function devStore(): SessionLogStore {
  const store = createMemorySessionLogStore();
  const evening = makeDevEvening();
  if (evening) for (const item of evening.items) void store.append(evening.day, item);
  return store;
}

const stores = new Map<string, SessionLogStore>();

export function sessionLogStoreFor(campaignId: string): SessionLogStore {
  let store = stores.get(campaignId);
  if (!store) {
    store = DEV_BYPASS_AUTH ? devStore() : createFirestoreSessionLogStore(db, campaignId);
    stores.set(campaignId, store);
  }
  return store;
}

/** Save a session's text (the Diario's «Cronaca della sessione») on its play log: the
 *  one session record. `logId` is the play log's id (`2026-11-02`, `2026-11-02-2`). */
export function saveSessionNotes(
  campaignId: string,
  logId: string,
  notes: string
): Promise<void> {
  return sessionLogStoreFor(campaignId).saveNotes(logId, notes);
}
