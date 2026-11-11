/**
 * The spends ledger's I/O: `users/{uid}/characters/{charId}/combat/spends`
 * (docs/architecture/2026-11-cross-device-hits.md). A separate document from
 * `combat/state`, so the owner's whole-document overwrite of its combat state never
 * touches it. Peers append inside the hit's transaction; the owner removes what it
 * folded with `arrayRemove`, which keeps any entry appended meanwhile.
 */
import {
  arrayRemove,
  doc,
  onSnapshot,
  runTransaction,
  updateDoc,
} from "firebase/firestore";

import { DEV_BYPASS_AUTH as IMPORTED_DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import {
  readDevDocument,
  subscribeDevDocument,
  updateDevDocument,
} from "@/lib/dev-document-store";
import { db } from "@/lib/firebase";
import type { PeerSpend } from "@/types/combat-state";

const DEV_SPENDS_COLLECTION = "combat-spends";

function devBypassEnabled(): boolean {
  return import.meta.env.PROD ? false : IMPORTED_DEV_BYPASS_AUTH;
}

/** Ref to the character's spends ledger. */
export function peerSpendsRef(uid: string, charId: string) {
  return doc(db, "users", uid, "characters", charId, "combat", "spends");
}

/** The ledger's entries, read defensively: a malformed entry is dropped. */
export function parsePeerSpends(data: unknown): PeerSpend[] {
  if (typeof data !== "object" || data === null) return [];
  const entries = (data as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((raw): PeerSpend[] => {
    if (typeof raw !== "object" || raw === null) return [];
    const entry = raw as Record<string, unknown>;
    if (typeof entry.id !== "string" || entry.id === "") return [];
    if (
      entry.kind === "tracker" &&
      typeof entry.trackerId === "string" &&
      typeof entry.amount === "number" &&
      Number.isInteger(entry.amount)
    ) {
      return [
        {
          id: entry.id,
          kind: "tracker",
          trackerId: entry.trackerId,
          amount: entry.amount,
        },
      ];
    }
    if (
      (entry.kind === "state-end" || entry.kind === "state-restore") &&
      typeof entry.key === "string"
    ) {
      return [{ id: entry.id, kind: entry.kind, key: entry.key }];
    }
    if (
      (entry.kind === "concentration-end" || entry.kind === "concentration-restore") &&
      typeof entry.spell === "string" &&
      entry.spell !== ""
    ) {
      return [{ id: entry.id, kind: entry.kind, spell: entry.spell }];
    }
    return [];
  });
}

/** Watch the ledger; an absent document is an empty ledger. */
export function subscribePeerSpends(
  uid: string,
  charId: string,
  cb: (entries: PeerSpend[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (devBypassEnabled()) {
    return subscribeDevDocument<Record<string, unknown>>(
      DEV_SPENDS_COLLECTION,
      `${uid}/${charId}`,
      (data) => cb(parsePeerSpends(data))
    );
  }
  return onSnapshot(
    peerSpendsRef(uid, charId),
    (snap) => cb(snap.exists() ? parsePeerSpends(snap.data()) : []),
    (err) => onError?.(err)
  );
}

/**
 * The ledger as the server holds it now, read once. A remote hit's own snapshot can
 * outrun a ledger listener that fell silent, so the owner's sheet reads it again
 * (`useCharacterSubscription`). The read goes through a transaction because that is a
 * direct lookup: `getDocFromServer` waits on a listener of its own, and that listener
 * lags with the silent one (rehearsal 2026-11-11). An absent document is an empty ledger.
 */
export async function readPeerSpends(uid: string, charId: string): Promise<PeerSpend[]> {
  if (devBypassEnabled())
    return parsePeerSpends(readDevDocument(DEV_SPENDS_COLLECTION, `${uid}/${charId}`));
  const snap = await runTransaction(db, (txn) => txn.get(peerSpendsRef(uid, charId)));
  return snap.exists() ? parsePeerSpends(snap.data()) : [];
}

/** Remove the entries the owner's sheet has folded; a concurrent append stays. */
export async function removeFoldedPeerSpends(
  uid: string,
  charId: string,
  entries: ReadonlyArray<PeerSpend>
): Promise<void> {
  if (entries.length === 0) return;
  if (devBypassEnabled()) {
    const folded = new Set(entries.map((entry) => entry.id));
    updateDevDocument<Record<string, unknown>>(
      DEV_SPENDS_COLLECTION,
      `${uid}/${charId}`,
      { entries: [] },
      (current) => ({
        entries: parsePeerSpends(current).filter((entry) => !folded.has(entry.id)),
      })
    );
    return;
  }
  await updateDoc(peerSpendsRef(uid, charId), { entries: arrayRemove(...entries) });
}
