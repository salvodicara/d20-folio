/**
 * A sandbox player's character in the stored shape live data has after the ADR-0009
 * parent cutover: the parent (`revision: 0`, empty `state`, `playStateVersion: 1`)
 * and the `combat/state` child that owns play. Built by the parent-cutover
 * migration's own planner from the portable fixture, so the emulator sandbox can
 * never drift from what a real character looks like.
 */

import type { Timestamp } from "firebase-admin/firestore";

import { planParentCutover } from "../migrate-character-parents.ts";

type RawMap = Record<string, unknown>;

export function sandboxCharacterDocuments(
  uid: string,
  charId: string,
  envelope: RawMap,
  parentFields: RawMap,
  updatedAt: Timestamp
): { parent: RawMap; child: RawMap } {
  const path = `users/${uid}/characters/${charId}`;
  const plan = planParentCutover(
    [{ uid, charId, parent: { path, data: { ...envelope, ...parentFields } } }],
    updatedAt
  );
  if (plan.issues.length > 0) {
    throw new Error(
      `Sandbox character ${charId} does not cut over: ${plan.issues.map((i) => i.code).join(", ")}`
    );
  }
  const parent = plan.documents.find((document) => document.role === "parent")?.after;
  const child = plan.documents.find((document) => document.role === "child")?.after;
  if (!parent || !child)
    throw new Error(`Sandbox character ${charId} has no planned pair`);
  return { parent, child };
}
