/**
 * The DM's side of the party's magic items (edge-case M20,
 * docs/architecture/2026-11-dm-state-and-roster.md), one document per physical copy,
 * keyed by its instanceId: `campaigns/{c}/dmItems/{id}` (DM only: is this copy cursed,
 * its rolled artifact properties, notes) and `campaigns/{c}/itemReveals/{id}`
 * (members read, the DM writes what is revealed). Both wait for the v0.26 rules
 * deploy (`combatEffectsV26On`): before it, nothing is read or written. Imports only
 * the Firestore functions it uses, so the shared eager Firebase chunk stays small.
 */
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";

import { combatEffectsV26On } from "@/lib/deployed-rules";
import { db } from "@/lib/firebase";
import {
  parseDmItemState,
  parseItemReveal,
  type DmItemState,
  type ItemReveal,
} from "@/lib/item-overlays";

type Docs<T> = Readonly<Record<string, T>>;

/** A copy's id as a document id (the rules accept 1–128 of [A-Za-z0-9_-]). */
const validId = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id);

function listen<T>(
  campaignId: string,
  sub: "dmItems" | "itemReveals",
  parse: (raw: unknown) => T,
  onDocs: (docs: Docs<T>) => void,
  onError: (error: Error) => void
): () => void {
  if (!combatEffectsV26On()) {
    onDocs({});
    return () => undefined;
  }
  return onSnapshot(
    collection(db, "campaigns", campaignId, sub),
    (snap) =>
      onDocs(
        Object.fromEntries(snap.docs.map((stored) => [stored.id, parse(stored.data())]))
      ),
    onError
  );
}

/** The DM's hidden state of every copy in the campaign (the DM's device only). */
export function subscribeDmItems(
  campaignId: string,
  onDocs: (docs: Docs<DmItemState>) => void,
  onError: (error: Error) => void
): () => void {
  return listen(campaignId, "dmItems", parseDmItemState, onDocs, onError);
}

/** What the DM has revealed of every copy (every member). */
export function subscribeItemReveals(
  campaignId: string,
  onDocs: (docs: Docs<ItemReveal>) => void,
  onError: (error: Error) => void
): () => void {
  return listen(campaignId, "itemReveals", parseItemReveal, onDocs, onError);
}

async function write(
  campaignId: string,
  sub: "dmItems" | "itemReveals",
  instanceId: string,
  data: DmItemState | ItemReveal
): Promise<boolean> {
  if (!combatEffectsV26On() || !validId(instanceId)) return false;
  const ref = doc(db, "campaigns", campaignId, sub, instanceId);
  if (Object.keys(data).length === 0) await deleteDoc(ref);
  else await setDoc(ref, data);
  return true;
}

/** Store the DM's hidden state of one copy (empty: the document goes). */
export function writeDmItem(
  campaignId: string,
  instanceId: string,
  state: DmItemState
): Promise<boolean> {
  return write(campaignId, "dmItems", instanceId, state);
}

/** Store what is revealed of one copy; its undo writes the previous reveal back. */
export function writeItemReveal(
  campaignId: string,
  instanceId: string,
  reveal: ItemReveal
): Promise<boolean> {
  return write(campaignId, "itemReveals", instanceId, reveal);
}
