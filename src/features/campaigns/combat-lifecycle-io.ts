/**
 * The combat lifecycle's writes (owner 2026-10-23): any member starts a fight with a
 * roll, passes or steps back a turn, ends it and reopens it. Each move reads the campaign
 * in a transaction, plans the change (`combat-lifecycle.ts`) and writes whole fields, so
 * concurrent moves retry instead of clobbering. Every move returns its undo: the exact
 * inverse move, which refuses (`false`) once the fight has moved on.
 *
 * The fight's contents (creatures, HP, conditions) stay DM-only and keep their own
 * writers in campaign-io.ts and encounter-world-command.ts.
 */

import { doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";

import { DEV_BYPASS_AUTH as DEV_BYPASS } from "@/lib/dev-bypass";
import { updateDevDocument } from "@/lib/dev-document-store";
import { db } from "@/lib/firebase";
import type { CampaignDoc, EncounterEndReason, EncounterState } from "@/types/campaign";

import { advanceEncounterTurn, toCampaignDoc } from "./campaign-io";
import { createSessionRecorder, type SessionRecorder } from "@/lib/session-log";

import { useCampaignStore } from "./campaignStore";
import { parseEncounterState } from "./encounter";
import { sessionLogStoreFor } from "./session-log-source";
import {
  planCancel,
  planEnd,
  planReopen,
  planRoll,
  planRollForMissing,
  planUnrollMissing,
  combatPatchFields,
  type CombatFields,
  type CombatPatch,
} from "./combat-lifecycle";

/** The undo of a lifecycle move: true when it was undone, false when it no longer fits. */
export type CombatUndo = () => Promise<boolean>;

type Planner<T> = (campaign: CampaignDoc & CombatFields) => {
  patch: CombatPatch;
  result: T;
} | null;

const keptFightRef = (campaignId: string) =>
  doc(db, "campaigns", campaignId, "combat", "ended");

/** The kept fight as stored: an ended encounter, or null (absent or unreadable). */
function storedKeptFight(value: unknown): EncounterState | null {
  if (typeof value !== "object" || value === null) return null;
  try {
    const fight = parseEncounterState((value as { fight?: unknown }).fight);
    return fight.ended ? fight : null;
  } catch {
    return null;
  }
}

/** Local development: the kept fight of each campaign, in memory. */
const devKeptFights = new Map<string, EncounterState | null>();
const devKeptListeners = new Map<string, Set<(fight: EncounterState | null) => void>>();
function setDevKeptFight(campaignId: string, fight: EncounterState | null): void {
  devKeptFights.set(campaignId, fight);
  for (const listener of devKeptListeners.get(campaignId) ?? []) listener(fight);
}

/** Apply one planned move to the campaign: a transaction in the app, the store locally. */
async function applyMove<T>(campaignId: string, plan: Planner<T>): Promise<T | null> {
  if (import.meta.env.DEV && DEV_BYPASS) {
    const campaign = useCampaignStore.getState().campaign;
    if (!campaign || campaign.id !== campaignId) return null;
    const planned = plan({
      ...campaign,
      endedEncounter: devKeptFights.get(campaignId) ?? null,
    });
    if (!planned) return null;
    const { endedEncounter, ...fields } = planned.patch;
    useCampaignStore.getState().setCampaign({ ...campaign, ...fields });
    // The local replica too: any other local campaign write re-emits it, and a replica
    // without the move would bring the old rolls back over the store.
    updateDevDocument<CampaignDoc>("campaign", campaignId, campaign, (current) => ({
      ...current,
      ...fields,
    }));
    if ("endedEncounter" in planned.patch)
      setDevKeptFight(campaignId, endedEncounter ?? null);
    return planned.result;
  }
  const ref = doc(db, "campaigns", campaignId);
  const keptRef = keptFightRef(campaignId);
  return runTransaction(db, async (txn) => {
    const [snap, keptSnap] = [await txn.get(ref), await txn.get(keptRef)];
    if (!snap.exists()) return null;
    const planned = plan({
      ...toCampaignDoc(snap.id, snap.data()),
      endedEncounter: storedKeptFight(keptSnap.data()),
    });
    if (!planned) return null;
    const { campaign, kept } = combatPatchFields(planned.patch);
    txn.update(ref, { ...campaign, updatedAt: serverTimestamp() });
    if (kept === null) txn.delete(keptRef);
    else if (kept) txn.set(keptRef, kept);
    return planned.result;
  });
}

/** Follow the campaign's kept fight (the last ended one, `null` when there is none):
 *  the Scontro tab offers to reopen it while no fight runs. */
export function subscribeToEndedCombat(
  campaignId: string,
  callback: (fight: EncounterState | null) => void,
  onError?: (error: Error) => void
): () => void {
  if (import.meta.env.DEV && DEV_BYPASS) {
    const listeners = devKeptListeners.get(campaignId) ?? new Set();
    listeners.add(callback);
    devKeptListeners.set(campaignId, listeners);
    callback(devKeptFights.get(campaignId) ?? null);
    return () => listeners.delete(callback);
  }
  return onSnapshot(
    keptFightRef(campaignId),
    (snap) => callback(storedKeptFight(snap.data())),
    (error) => onError?.(error)
  );
}

/**
 * Record `uid`'s initiative roll (`null` takes it back). The first roll starts the fight
 * with every attached member in it; a late roller joins; the order follows the rolls
 * until the first turn is passed. `bonuses` is each PC's initiative bonus from the
 * encounter view, by combatant id (the stored roll is always the raw d20).
 */
export async function rollIntoCombat(
  campaignId: string,
  input: { uid: string; roll: number | null; bonuses: Readonly<Record<string, number>> }
): Promise<CombatUndo | null> {
  const done = await applyMove(campaignId, (campaign) => {
    const plan = planRoll(campaign, { ...input, now: Date.now() });
    return plan && { patch: plan.patch, result: plan };
  });
  if (!done) return null;
  return async () => {
    if (done.started) {
      const cancelled = await applyMove(campaignId, (campaign) => {
        const patch = planCancel(campaign, { uid: input.uid, epoch: done.epoch });
        return patch && { patch, result: true };
      });
      return cancelled === true;
    }
    const restored = await applyMove(campaignId, (campaign) => {
      if (campaign.encounter?.epoch !== done.epoch) return null;
      if ((campaign.encounterInit?.[input.uid] ?? null) !== input.roll) return null;
      const plan = planRoll(campaign, { ...input, roll: done.previous, now: Date.now() });
      return plan && { patch: plan.patch, result: true };
    });
    return restored === true;
  };
}

/** Pass the turn (anyone at the table in a lifecycle fight). `expectedCurrentId` is the
 *  turn the caller saw: a stale press does nothing. */
export async function passCombatTurn(
  campaignId: string,
  input: { uid: string; isDm: boolean; expectedCurrentId: string | null }
): Promise<CombatUndo | null> {
  return stepTurn(campaignId, "next", input);
}

/** Step the turn back to the previous combatant (and round). */
export async function stepCombatTurnBack(
  campaignId: string,
  input: { uid: string; isDm: boolean; expectedCurrentId: string | null }
): Promise<CombatUndo | null> {
  return stepTurn(campaignId, "prev", input);
}

async function stepTurn(
  campaignId: string,
  dir: "next" | "prev",
  input: { uid: string; isDm: boolean; expectedCurrentId: string | null }
): Promise<CombatUndo | null> {
  const caller = { uid: input.uid, isDm: input.isDm };
  const now = await advanceEncounterTurn(
    campaignId,
    dir,
    caller,
    input.expectedCurrentId
  );
  if (now === undefined) return null;
  return async () =>
    (await advanceEncounterTurn(
      campaignId,
      dir === "next" ? "prev" : "next",
      caller,
      now
    )) !== undefined;
}

/** End the fight now (by hand, or for the reason `encounterEndReason` gave). */
export async function endCombatNow(
  campaignId: string,
  input: { reason?: EncounterEndReason } = {}
): Promise<CombatUndo | null> {
  const reason = input.reason ?? "manual";
  const epoch = await applyMove(campaignId, (campaign) => {
    const patch = planEnd(campaign, { reason, now: Date.now() });
    return patch && { patch, result: campaign.encounter?.epoch ?? 0 };
  });
  if (epoch === null) return null;
  return async () =>
    (await applyMove(campaignId, (campaign) => {
      const patch = planReopen(campaign, { now: Date.now(), epoch });
      return patch && { patch, result: true };
    })) === true;
}

/** Reopen the last ended fight exactly where it stopped. */
export async function reopenLastCombat(campaignId: string): Promise<CombatUndo | null> {
  const reopened = await applyMove(campaignId, (campaign) => {
    const patch = planReopen(campaign, { now: Date.now() });
    const kept = campaign.endedEncounter;
    return patch && kept?.ended
      ? { patch, result: { epoch: kept.epoch, reason: kept.ended.reason } }
      : null;
  });
  if (!reopened) return null;
  return async () =>
    (await applyMove(campaignId, (campaign) => {
      const patch = planEnd(campaign, {
        reason: reopened.reason,
        now: Date.now(),
        epoch: reopened.epoch,
      });
      return patch && { patch, result: true };
    })) === true;
}

/** A fair d20 from the platform's cryptographic randomness (rejection sampling). */
function cryptoD20(): number {
  const limit = Math.floor(0x1_0000_0000 / 20) * 20;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] ?? 0;
    if (value < limit) return (value % 20) + 1;
  }
}

/**
 * The DM's «Tira per chi manca»: a d20 for every PC who has not rolled, each with that
 * PC's bonus, so a fight never stalls. The rolls are made inside the move, so its undo
 * knows exactly which rows it filled. Null for anyone but the DM, or when nobody is
 * missing.
 */
export async function rollForMissing(
  campaignId: string,
  input: { uid: string; bonuses: Readonly<Record<string, number>> },
  d20: () => number = cryptoD20,
  /** Where the session-log lines go (the campaign's session log in the app). */
  recorder: Pick<SessionRecorder, "record" | "retract"> = createSessionRecorder({
    store: sessionLogStoreFor(campaignId),
    uid: input.uid,
  })
): Promise<CombatUndo | null> {
  const done = await applyMove(campaignId, (campaign) => {
    const plan = planRollForMissing(campaign, { ...input, now: Date.now(), d20 });
    return plan && { patch: plan.patch, result: plan };
  });
  if (!done) return null;
  // One report line per roll: "Il Master tira per Lyra: 14" (written at once; a
  // v0.25.0 report shows it as a neutral newer-version line).
  const lines = await Promise.all(
    Object.entries(done.rolled).map(([uid, roll]) =>
      recorder
        .record({
          kind: "initiative",
          actor: `pc-${uid}`,
          roll,
          total: roll + (input.bonuses[`pc-${uid}`] ?? 0),
          rolledBy: "dm",
        })
        .catch(() => null)
    )
  );
  return async () => {
    const undone =
      (await applyMove(campaignId, (campaign) => {
        const patch = planUnrollMissing(campaign, {
          rolled: done.rolled,
          started: done.started,
          epoch: done.epoch,
          bonuses: input.bonuses,
          now: Date.now(),
        });
        return patch && { patch, result: true };
      })) === true;
    if (undone) {
      await Promise.all(
        lines.flatMap((id) => (id ? [recorder.retract(id).catch(() => null)] : []))
      );
    }
    return undone;
  };
}
