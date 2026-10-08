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

const stores = new Map<string, SessionLogStore>();

export function sessionLogStoreFor(campaignId: string): SessionLogStore {
  let store = stores.get(campaignId);
  if (!store) {
    store = DEV_BYPASS_AUTH
      ? createMemorySessionLogStore()
      : createFirestoreSessionLogStore(db, campaignId);
    stores.set(campaignId, store);
  }
  return store;
}
