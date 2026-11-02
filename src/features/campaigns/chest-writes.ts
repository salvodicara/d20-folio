/**
 * The Firestore writes of a chest move (chest.ts) and of its undo, shared by the app
 * (chest-io.ts) and the rules tests, so both send exactly the same documents.
 */

import {
  arrayRemove,
  arrayUnion,
  doc,
  increment,
  serverTimestamp,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";

import { stripUndefined } from "@/lib/strip-undefined";

import type { ChestCollection, ChestMove } from "./chest";

const docRef = (db: Firestore, campaignId: string, name: ChestCollection, id: string) =>
  doc(db, "campaigns", campaignId, name, id);

/** What a transaction and a write batch both offer. */
export interface Writer {
  set(ref: DocumentReference, data: object): unknown;
  update(ref: DocumentReference, data: Record<string, unknown>): unknown;
  delete(ref: DocumentReference): unknown;
}

export function writeChestMove(
  txn: Writer,
  db: Firestore,
  campaignId: string,
  move: ChestMove
): void {
  for (const created of move.created) {
    txn.set(
      docRef(db, campaignId, created.collection, created.id),
      stripUndefined(created.data)
    );
  }
  for (const change of move.changed) {
    const ref = docRef(db, campaignId, "chest", change.id);
    if (change.after) txn.set(ref, stripUndefined(change.after));
    else txn.delete(ref);
  }
  if (move.treasury) {
    txn.update(doc(db, "campaigns", campaignId), {
      ...Object.fromEntries(
        Object.entries(move.treasury.delta).map(([unit, amount]) => [
          `treasury.${unit}`,
          increment(amount),
        ])
      ),
      treasuryLog: arrayUnion(...move.treasury.entries),
      updatedAt: serverTimestamp(),
    });
  }
}

export function unwriteChestMove(
  txn: Writer,
  db: Firestore,
  campaignId: string,
  move: ChestMove
): void {
  for (const created of move.created)
    txn.delete(docRef(db, campaignId, created.collection, created.id));
  for (const change of move.changed) {
    const ref = docRef(db, campaignId, "chest", change.id);
    if (change.before) txn.set(ref, stripUndefined(change.before));
    else txn.delete(ref);
  }
  if (move.treasury) {
    txn.update(doc(db, "campaigns", campaignId), {
      ...Object.fromEntries(
        Object.entries(move.treasury.delta).map(([unit, amount]) => [
          `treasury.${unit}`,
          increment(-amount),
        ])
      ),
      treasuryLog: arrayRemove(...move.treasury.entries),
      updatedAt: serverTimestamp(),
    });
  }
}
