/**
 * Firestore adapter for the encounter aggregate (P2 prototype).
 *
 * Clients never write state: they append actions to the encounter document's `log` with
 * `arrayUnion`, which is commutative, offline-queueable and latency-compensated. Reads go
 * through `parseEncounter`, which fails closed on any structural surprise.
 *
 * Design: docs/superpowers/specs/2026-09-02-total-combat-automation-design.md §5.3.
 */
import {
  arrayUnion,
  doc,
  onSnapshot,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import type { Action, Encounter } from "@/lib/combat/types";
import { sortBySeq } from "@/lib/combat/ids";

export interface EncounterRef {
  readonly campaignId: string;
  readonly encounterId: string;
}

export type ParsedEncounter =
  | { readonly ok: true; readonly encounter: Encounter }
  | { readonly ok: false; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural parse of a stored encounter. Semantic legality is the fold's job. */
export function parseEncounter(value: unknown): ParsedEncounter {
  if (!isRecord(value)) return { ok: false, reason: "not-an-object" };
  if (value.schema !== 1) return { ok: false, reason: "unsupported-schema" };
  if (typeof value.id !== "string") return { ok: false, reason: "invalid-id" };
  if (!isRecord(value.host) || typeof value.host.kind !== "string")
    return { ok: false, reason: "invalid-host" };
  if (!Array.isArray(value.log)) return { ok: false, reason: "invalid-log" };
  for (const [index, entry] of value.log.entries()) {
    if (
      !isRecord(entry) ||
      typeof entry.kind !== "string" ||
      typeof entry.id !== "string"
    ) {
      return { ok: false, reason: `invalid-action:${index}` };
    }
    const seq = entry.seq;
    if (
      !isRecord(seq) ||
      typeof seq.ms !== "number" ||
      typeof seq.counter !== "number" ||
      typeof seq.by !== "string"
    ) {
      return { ok: false, reason: `invalid-seq:${index}` };
    }
  }
  if (value.checkpoint !== null && !isRecord(value.checkpoint))
    return { ok: false, reason: "invalid-checkpoint" };
  const encounter = value as unknown as Encounter;
  return {
    ok: true,
    encounter: { ...encounter, log: sortBySeq(encounter.log as Action[]) },
  };
}

function encounterDoc(db: Firestore, ref: EncounterRef) {
  return doc(db, "campaigns", ref.campaignId, "encounters", ref.encounterId);
}

/** One append = one small, commutative write. Works offline through the SDK queue. */
export function appendAction(
  db: Firestore,
  ref: EncounterRef,
  action: Action
): Promise<void> {
  return updateDoc(encounterDoc(db, ref), { log: arrayUnion(action) });
}

/** One listener per fight. Parse failures are surfaced, never silently folded. */
export function subscribeEncounter(
  db: Firestore,
  ref: EncounterRef,
  onValue: (
    parsed: ParsedEncounter | null,
    meta: { fromCache: boolean; hasPendingWrites: boolean }
  ) => void
): () => void {
  return onSnapshot(
    encounterDoc(db, ref),
    { includeMetadataChanges: true },
    (snapshot) => {
      const meta = {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
      };
      onValue(snapshot.exists() ? parseEncounter(snapshot.data()) : null, meta);
    }
  );
}
