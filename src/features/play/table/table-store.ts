/**
 * The table store — one per mounted play screen (stage 6 design §4).
 *
 * It is the ONE place the play surface talks to the encounter document: it holds the newest
 * snapshot, the fold of it, the viewer's role, and the two verbs that change anything
 * (`dispatch`, `undo`). Everything the surface shows is `fold.state`; everything it does is an
 * `Action` this store stamps and appends.
 *
 * Two boundaries are load-bearing:
 *
 * 1. **No `@/lib/firebase` here.** The `Firestore` instance, the document reference, the seq
 *    clock, the wall clock and the catalogue are all INJECTED — the same discipline
 *    `combat-io.ts` follows — so a unit test drives the store with fakes and the app wires the
 *    real ones in `use-table.ts`. This module is the only consumer of that indirection; nothing
 *    below it may reach for a singleton.
 * 2. **The fold is memoised on the log's content**, not on the snapshot object. `subscribeEncounter`
 *    delivers a local append twice — once pending, once acknowledged — with byte-identical
 *    content and a fresh object each time (its own header says so). Re-folding the second one
 *    doubles the work of every local append for no new information, so the store fingerprints
 *    the log ids, their stamps and the checkpoint's horizon, and reuses the previous
 *    `FoldResult` when nothing but `pending` moved.
 *
 * Compaction (design §2 D8) lives here too, because this is the only object that sees every
 * settled snapshot: a DM-capable role attempts `checkpointEncounter` when the document has
 * outgrown its budget. It is opportunistic, single-flight, and never fatal.
 */
import { createStore, type StoreApi } from "zustand/vanilla";
import type { DocumentReference, Firestore } from "firebase/firestore";
import {
  appendAction,
  checkpointEncounter,
  encounterRef,
  newActionId,
  subscribeEncounter,
  type EncounterSnapshot,
} from "@/lib/combat-io";
import type { Catalogue } from "@/lib/combat/catalogue";
import {
  CHECKPOINT_GRACE_MS,
  checkpointThrough,
  compact,
  shouldCompact,
} from "@/lib/combat/checkpoint";
import { fold, type FoldResult } from "@/lib/combat/fold";
import { seqKey, type ActionId, type Seq } from "@/lib/combat/ids";
import type { Action, Encounter } from "@/lib/combat/types";

/** One live table per campaign (design §2 D5): no pointer field, no encounter list. */
export const LIVE_ENCOUNTER_ID = "live";

/** `campaigns/{campaignId}/encounters/live` — the campaign's table. */
export function liveTableRef(db: Firestore, campaignId: string): DocumentReference {
  return encounterRef(db, campaignId, LIVE_ENCOUNTER_ID);
}

/** `Omit` over a union collapses it to its common keys, so the omission distributes instead. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An action without its envelope: the store mints `id`, `seq` and `by` itself. */
export type ActionBody = DistributiveOmit<Action, "id" | "seq" | "by">;

export interface TableRole {
  readonly uid: string;
  /** Whether this viewer may compact and overrule — `uid === campaign.dmUid || admin` (D6). */
  readonly dm: boolean;
}

export interface TableState {
  /** The newest thing the listener delivered, presentation state included (`pending`). */
  readonly snapshot: EncounterSnapshot | null;
  /** The fold of the newest READABLE encounter; `null` until one arrives, or once it is gone. */
  readonly fold: FoldResult | null;
  readonly role: TableRole;
  /**
   * Stamp `body` with an identity and an ordering, append it to the table's log, and return
   * the id it was stamped with.
   *
   * The id is not a convenience: an `intent` answers each of its inputs with the id of the
   * `roll` action that settled it, so the caller that appends the rolls has to learn those ids
   * to build the intent that spends them.
   */
  dispatch(body: ActionBody): Promise<ActionId>;
  /** Append `{ kind: "undo" }` — undo is a log-level fact, never a rewrite (design §3). */
  undo(of: ActionId, reason: string | null): Promise<void>;
  /**
   * Open the ONE listener on the table document and return its teardown (golden rule 24).
   *
   * Creating the store does NOT subscribe: a React owner must be able to create the store while
   * rendering and open the listener from an effect, so that a remount (StrictMode's, above all)
   * re-opens a listener the previous cleanup closed. Calling `connect` while already connected
   * opens nothing new; the teardown is idempotent and anything delivered after it is ignored.
   */
  connect(): () => void;
}

export interface TableStoreDeps {
  readonly db: Firestore;
  readonly ref: DocumentReference;
  readonly role: TableRole;
  readonly catalogue: Catalogue;
  readonly seq: () => Seq;
  readonly now: () => number;
}

/**
 * What must change for the fold to change: which actions the document holds, in which stamped
 * order, and how far back the checkpoint has closed the past. Deliberately NOT the actions'
 * contents — an action is immutable once appended, and `pending` is not part of it.
 */
function fingerprint(encounter: Encounter): string {
  const through = encounter.checkpoint ? seqKey(encounter.checkpoint.through) : "-";
  const ids = encounter.log.map((action) => `${action.id}@${seqKey(action.seq)}`);
  return `${through}|${ids.join(",")}`;
}

export function createTableStore(deps: TableStoreDeps): StoreApi<TableState> {
  const { db, ref, role, catalogue, seq, now } = deps;
  let memo: { readonly print: string; readonly result: FoldResult } | null = null;
  let compacting = false;
  let live = false;
  let release: (() => void) | null = null;

  async function append(body: ActionBody): Promise<ActionId> {
    const action = { ...body, id: newActionId(), seq: seq(), by: role.uid } as Action;
    await appendAction(ref, action);
    return action.id;
  }

  function connect(): () => void {
    if (!live) {
      live = true;
      release = subscribeEncounter(ref, receive);
    }
    return () => {
      live = false;
      release?.();
      release = null;
    };
  }

  const store = createStore<TableState>(() => ({
    snapshot: null,
    fold: null,
    role,
    dispatch: append,
    undo: async (of, reason) => {
      await append({ kind: "undo", of, reason });
    },
    connect,
  }));

  /**
   * Opportunistic compaction, on the DM's client only.
   *
   * Single-flight: a second settled snapshot arriving mid-transaction must not open a second
   * one against the same expected checkpoint. A failure — offline, a rules denial, a lost
   * compare-and-set — leaves the document exactly as it was, so it is neither surfaced nor
   * retried here: the next settled snapshot that still outgrows the budget tries again. The
   * catch is what keeps a rejected promise out of a Firestore callback.
   */
  function maybeCompact(encounter: Encounter): void {
    if (!role.dm || compacting || !shouldCompact(encounter)) return;
    const through = checkpointThrough(encounter, CHECKPOINT_GRACE_MS, now());
    if (through === null) return;
    compacting = true;
    void checkpointEncounter(
      db,
      ref,
      compact(encounter, catalogue, through),
      encounter.checkpoint?.through ?? null
    )
      .catch(() => undefined)
      .finally(() => {
        compacting = false;
      });
  }

  function receive(snapshot: EncounterSnapshot): void {
    if (!live) return;
    if (snapshot.kind !== "encounter") {
      // A quarantined document or a listener error is one snapshot the client could not read,
      // not proof the table changed: the surface keeps showing the last fold it held. Only
      // `missing` — the document is gone — clears it.
      store.setState(
        snapshot.kind === "missing" ? { snapshot, fold: null } : { snapshot }
      );
      return;
    }
    const print = fingerprint(snapshot.encounter);
    const result =
      memo !== null && memo.print === print
        ? memo.result
        : fold(snapshot.encounter, catalogue);
    memo = { print, result };
    store.setState({ snapshot, fold: result });
    if (!snapshot.pending) maybeCompact(snapshot.encounter);
  }

  return store;
}
