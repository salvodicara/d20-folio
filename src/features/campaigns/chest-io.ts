/**
 * The party chest's writes and reads (Tesoro). Each move (`chest.ts`) runs in one
 * transaction and returns its undo, which refuses (`false`) once something the move
 * created or changed has moved on (a share already collected, a stack someone took from).
 *
 * `campaigns/{id}/chest` holds the stacks, `pickups` what is on its way to one player's
 * sheet, `chestLog` the item lines of «Chi ha preso cosa». Coins in the chest stay the
 * campaign's `treasury`, logged in `treasuryLog` (which v0.25.0 renders).
 */

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  writeBatch,
  type DocumentReference,
} from "firebase/firestore";

import { DEV_BYPASS_AUTH as DEV_BYPASS } from "@/lib/dev-bypass";
import { db } from "@/lib/firebase";
import type {
  CampaignDoc,
  ChestItem,
  ChestItemRef,
  ChestLogEntry,
  CoinPurse,
  Pickup,
} from "@/types/campaign";

import {
  moveStillCurrent,
  planLoot,
  planPut,
  planTake,
  type ChestCollection,
  type ChestMove,
  type LootDestination,
  type MoveContext,
} from "./chest";
import { unwriteChestMove, writeChestMove } from "./chest-writes";

/** The undo of a chest move: true when undone, false when it no longer fits. */
export type ChestUndo = () => Promise<boolean>;

const docRef = (campaignId: string, name: ChestCollection, id: string) =>
  doc(db, "campaigns", campaignId, name, id);

const context = (uid: string): MoveContext => ({
  uid,
  now: Date.now(),
  newId: () => crypto.randomUUID(),
});

// ─── Local development: the same moves on an in-memory chest ─────────────────

const devDocs = new Map<string, unknown>();
const devListeners = new Set<() => void>();
const devKey = (campaignId: string, name: ChestCollection, id: string) =>
  `${campaignId}/${name}/${id}`;
function devList<T>(campaignId: string, name: ChestCollection): T[] {
  const prefix = `${campaignId}/${name}/`;
  return [...devDocs].flatMap(([key, value]) =>
    key.startsWith(prefix) ? [structuredClone(value) as T] : []
  );
}
const devChanged = () => {
  for (const listener of devListeners) listener();
};

// ─── Writing a move and taking it back ───────────────────────────────────────

function devApply(campaignId: string, move: ChestMove, forward: boolean): void {
  for (const created of move.created) {
    const key = devKey(campaignId, created.collection, created.id);
    if (forward) devDocs.set(key, structuredClone(created.data));
    else devDocs.delete(key);
  }
  for (const change of move.changed) {
    const key = devKey(campaignId, "chest", change.id);
    const value = forward ? change.after : change.before;
    if (value) devDocs.set(key, structuredClone(value));
    else devDocs.delete(key);
  }
  devChanged();
}

/** Every document a move touched, as it is now (null: absent). */
async function readTouched(
  txn: {
    get: (ref: DocumentReference) => Promise<{ exists(): boolean; data(): unknown }>;
  },
  campaignId: string,
  move: ChestMove
): Promise<(name: ChestCollection, id: string) => unknown> {
  const now = new Map<string, unknown>();
  const touched = [
    ...move.created.map((created) => [created.collection, created.id] as const),
    ...move.changed.map((change) => ["chest", change.id] as const),
  ];
  for (const [name, id] of touched) {
    const snap = await txn.get(docRef(campaignId, name, id));
    now.set(`${name}/${id}`, snap.exists() ? snap.data() : null);
  }
  return (name, id) => now.get(`${name}/${id}`) ?? null;
}

function undoFor(campaignId: string, move: ChestMove): ChestUndo {
  return async () => {
    if (import.meta.env.DEV && DEV_BYPASS) {
      const read = (name: ChestCollection, id: string) =>
        devDocs.get(devKey(campaignId, name, id)) ?? null;
      if (!moveStillCurrent(move, read)) return false;
      devApply(campaignId, move, false);
      return true;
    }
    return runTransaction(db, async (txn) => {
      const read = await readTouched(txn, campaignId, move);
      if (!moveStillCurrent(move, read)) return false;
      unwriteChestMove(txn, db, campaignId, move);
      return true;
    });
  };
}

async function commit(
  campaignId: string,
  move: ChestMove | null
): Promise<ChestUndo | null> {
  if (!move) return null;
  if (import.meta.env.DEV && DEV_BYPASS) devApply(campaignId, move, true);
  else {
    // A batch, not a transaction: these moves read nothing first, so they queue offline.
    const batch = writeBatch(db);
    writeChestMove(batch, db, campaignId, move);
    await batch.commit();
  }
  return undoFor(campaignId, move);
}

// ─── The moves ───────────────────────────────────────────────────────────────

/** «Metti nella cassa»: `quantity` of an item into the chest. */
export function putInChest(
  campaignId: string,
  input: { uid: string; item: ChestItemRef; quantity: number; note?: string }
): Promise<ChestUndo | null> {
  return commit(campaignId, planPut(context(input.uid), input));
}

/** «Prendi»: `quantity` of a chest stack, on its way to the taker's own sheet. */
export async function takeFromChest(
  campaignId: string,
  input: { uid: string; chestItemId: string; quantity: number }
): Promise<ChestUndo | null> {
  const ctx = context(input.uid);
  if (import.meta.env.DEV && DEV_BYPASS) {
    const current = devDocs.get(devKey(campaignId, "chest", input.chestItemId)) ?? null;
    return commit(campaignId, planTake(ctx, current as ChestItem | null, input));
  }
  const move = await runTransaction(db, async (txn) => {
    const snap = await txn.get(docRef(campaignId, "chest", input.chestItemId));
    const planned = planTake(
      ctx,
      snap.exists() ? (snap.data() as ChestItem) : null,
      input
    );
    if (planned) writeChestMove(txn, db, campaignId, planned);
    return planned;
  });
  return move ? undoFor(campaignId, move) : null;
}

/** «Bottino»: what was found, to oneself, to the chest, or split in equal shares among
 *  the members with an attached character (the remainder and the items to the chest). */
export function distributeLoot(
  campaign: Pick<CampaignDoc, "id" | "memberDetails">,
  input: {
    uid: string;
    coins: CoinPurse;
    items: ReadonlyArray<{ item: ChestItemRef; quantity: number }>;
    to: LootDestination;
  }
): Promise<ChestUndo | null> {
  const sharers = Object.entries(campaign.memberDetails).flatMap(([uid, member]) =>
    member.characterId && member.character ? [uid] : []
  );
  return commit(campaign.id, planLoot(context(input.uid), { ...input, sharers }));
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export interface ChestContents {
  items: ChestItem[];
  /** What waits for each player, named shares included. */
  pickups: Pickup[];
}

/** Follow the chest: its stacks and every pickup still waiting to be collected. */
export function subscribeToChest(
  campaignId: string,
  callback: (contents: ChestContents) => void,
  onError?: (error: Error) => void
): () => void {
  if (import.meta.env.DEV && DEV_BYPASS) {
    const emit = () =>
      callback({
        items: devList<ChestItem>(campaignId, "chest"),
        pickups: devList<Pickup>(campaignId, "pickups"),
      });
    devListeners.add(emit);
    emit();
    return () => devListeners.delete(emit);
  }
  let items: ChestItem[] | null = null;
  let pickups: Pickup[] | null = null;
  const emit = () => {
    if (items && pickups) callback({ items, pickups });
  };
  const fail = (error: Error) => onError?.(error);
  const stopItems = onSnapshot(
    collection(db, "campaigns", campaignId, "chest"),
    (snap) => {
      items = snap.docs.map((d) => d.data() as ChestItem);
      emit();
    },
    fail
  );
  const stopPickups = onSnapshot(
    collection(db, "campaigns", campaignId, "pickups"),
    (snap) => {
      pickups = snap.docs.map((d) => d.data() as Pickup);
      emit();
    },
    fail
  );
  return () => {
    stopItems();
    stopPickups();
  };
}

/** Follow the item lines of «Chi ha preso cosa», newest first. */
export function subscribeToChestLog(
  campaignId: string,
  callback: (entries: ChestLogEntry[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (import.meta.env.DEV && DEV_BYPASS) {
    const emit = () =>
      callback(
        devList<ChestLogEntry>(campaignId, "chestLog").sort((a, b) => b.at - a.at)
      );
    devListeners.add(emit);
    emit();
    return () => devListeners.delete(emit);
  }
  return onSnapshot(
    query(
      collection(db, "campaigns", campaignId, "chestLog"),
      orderBy("at", "desc"),
      limit(200)
    ),
    (snap) => callback(snap.docs.map((d) => d.data() as ChestLogEntry)),
    (error) => onError?.(error)
  );
}

/**
 * Collect `uid`'s pickups: each one is taken out of the campaign in its own transaction
 * (so two open devices never collect it twice) and then handed to `deliver`, which puts
 * it into the sheet. The sheet calls this when it loads.
 */
export async function collectPickups(
  campaignId: string,
  uid: string,
  pending: readonly Pickup[],
  deliver: (pickup: Pickup) => void
): Promise<number> {
  let collected = 0;
  for (const waiting of pending) {
    if (waiting.ownerUid !== uid) continue;
    if (import.meta.env.DEV && DEV_BYPASS) {
      const key = devKey(campaignId, "pickups", waiting.id);
      if (!devDocs.has(key)) continue;
      devDocs.delete(key);
      devChanged();
      deliver(waiting);
      collected++;
      continue;
    }
    const taken = await runTransaction(db, async (txn) => {
      const ref = docRef(campaignId, "pickups", waiting.id);
      const snap = await txn.get(ref);
      if (!snap.exists()) return null;
      txn.delete(ref);
      return snap.data() as Pickup;
    });
    if (taken) {
      deliver(taken);
      collected++;
    }
  }
  return collected;
}
