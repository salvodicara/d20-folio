/**
 * The campaign's creature roster (edge-case M19): `campaigns/{c}/roster/{id}`
 * (members read, the DM writes) and `dmRoster/{id}` (the DM only), one document per
 * creature. Both wait for the v0.26 rules deploy (`combatEffectsV26On`): before it,
 * nothing is read or written. Imports only the Firestore functions it uses.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { combatEffectsV26On } from "@/lib/deployed-rules";
import { db } from "@/lib/firebase";
import {
  parseDmRosterEntry,
  parseRosterEntry,
  type DmRosterEntry,
  type RosterEntry,
} from "@/lib/play/campaign-roster";

type Docs<T> = Readonly<Record<string, T>>;

/** An entry id as a document id (the rules accept 1–128 of [A-Za-z0-9_-]). */
const validId = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id);

/** The roster the party knows (every member). Malformed entries are dropped. */
export function subscribeRoster(
  campaignId: string,
  onDocs: (docs: Docs<RosterEntry>) => void,
  onError: (error: Error) => void
): () => void {
  if (!combatEffectsV26On()) {
    onDocs({});
    return () => undefined;
  }
  return onSnapshot(
    collection(db, "campaigns", campaignId, "roster"),
    (snap) =>
      onDocs(
        Object.fromEntries(
          snap.docs.flatMap((stored) => {
            const entry = parseRosterEntry(stored.data());
            return entry ? [[stored.id, entry] as const] : [];
          })
        )
      ),
    onError
  );
}

/** The roster the party knows, read once (the end-of-fight HP write-back). */
export async function readRoster(campaignId: string): Promise<Docs<RosterEntry>> {
  if (!combatEffectsV26On()) return {};
  const snap = await getDocs(collection(db, "campaigns", campaignId, "roster"));
  return Object.fromEntries(
    snap.docs.flatMap((stored) => {
      const entry = parseRosterEntry(stored.data());
      return entry ? [[stored.id, entry] as const] : [];
    })
  );
}

/** What only the DM knows of each creature (the DM's device only). */
export function subscribeDmRoster(
  campaignId: string,
  onDocs: (docs: Docs<DmRosterEntry>) => void,
  onError: (error: Error) => void
): () => void {
  if (!combatEffectsV26On()) {
    onDocs({});
    return () => undefined;
  }
  return onSnapshot(
    collection(db, "campaigns", campaignId, "dmRoster"),
    (snap) =>
      onDocs(
        Object.fromEntries(
          snap.docs.map((stored) => [stored.id, parseDmRosterEntry(stored.data())])
        )
      ),
    onError
  );
}

/** Store a creature the party knows; null removes it (with its DM side). */
export async function writeRosterEntry(
  campaignId: string,
  entryId: string,
  entry: RosterEntry | null
): Promise<boolean> {
  if (!combatEffectsV26On() || !validId(entryId)) return false;
  const known = doc(db, "campaigns", campaignId, "roster", entryId);
  if (entry) await setDoc(known, entry);
  else {
    await deleteDoc(known);
    await deleteDoc(doc(db, "campaigns", campaignId, "dmRoster", entryId));
  }
  return true;
}

/**
 * A creature's Hit Points after a fight (the end-of-fight write-back): only that field,
 * so an edit to the entry made meanwhile on another device (its name, its notes) stays.
 */
export async function writeRosterHp(
  campaignId: string,
  entryId: string,
  hp: NonNullable<RosterEntry["hp"]>
): Promise<boolean> {
  if (!combatEffectsV26On() || !validId(entryId)) return false;
  await updateDoc(doc(db, "campaigns", campaignId, "roster", entryId), { hp });
  return true;
}

/** Store what only the DM knows of a creature (empty: the document goes). */
export async function writeDmRosterEntry(
  campaignId: string,
  entryId: string,
  entry: DmRosterEntry
): Promise<boolean> {
  if (!combatEffectsV26On() || !validId(entryId)) return false;
  const ref = doc(db, "campaigns", campaignId, "dmRoster", entryId);
  if (Object.keys(entry).length === 0) await deleteDoc(ref);
  else await setDoc(ref, entry);
  return true;
}
