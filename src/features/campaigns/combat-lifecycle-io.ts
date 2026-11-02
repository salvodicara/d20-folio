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

import { deleteField, doc, runTransaction, serverTimestamp } from "firebase/firestore";

import { DEV_BYPASS_AUTH as DEV_BYPASS } from "@/lib/dev-bypass";
import { db } from "@/lib/firebase";
import { stripUndefined } from "@/lib/strip-undefined";
import type { CampaignDoc, EncounterEndReason } from "@/types/campaign";

import { advanceEncounterTurn, encounterForWrite, toCampaignDoc } from "./campaign-io";
import { useCampaignStore } from "./campaignStore";
import {
  planCancel,
  planEnd,
  planReopen,
  planRoll,
  type CombatPatch,
} from "./combat-lifecycle";

/** The undo of a lifecycle move: true when it was undone, false when it no longer fits. */
export type CombatUndo = () => Promise<boolean>;

type Planner<T> = (campaign: CampaignDoc) => { patch: CombatPatch; result: T } | null;

/** Apply one planned move to the campaign: a transaction in the app, the store locally. */
async function applyMove<T>(campaignId: string, plan: Planner<T>): Promise<T | null> {
  if (import.meta.env.DEV && DEV_BYPASS) {
    const campaign = useCampaignStore.getState().campaign;
    if (!campaign || campaign.id !== campaignId) return null;
    const planned = plan(campaign);
    if (!planned) return null;
    const { endedEncounter, ...rest } = planned.patch;
    useCampaignStore.getState().setCampaign({
      ...campaign,
      ...rest,
      ...("endedEncounter" in planned.patch ? { endedEncounter } : {}),
    });
    return planned.result;
  }
  const ref = doc(db, "campaigns", campaignId);
  return runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists()) return null;
    const planned = plan(toCampaignDoc(snap.id, snap.data()));
    if (!planned) return null;
    txn.update(ref, { ...fieldsFor(planned.patch), updatedAt: serverTimestamp() });
    return planned.result;
  });
}

/** The Firestore write of a patch: whole fields, a null kept fight deleted. */
function fieldsFor(patch: CombatPatch): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if ("encounter" in patch) {
    fields.encounter = patch.encounter
      ? stripUndefined(encounterForWrite(patch.encounter))
      : null;
  }
  if ("endedEncounter" in patch) {
    fields.endedEncounter = patch.endedEncounter
      ? stripUndefined(encounterForWrite(patch.endedEncounter))
      : deleteField();
  }
  if (patch.encounterInit) fields.encounterInit = patch.encounterInit;
  if (patch.encounterSkipped) fields.encounterSkipped = patch.encounterSkipped;
  return fields;
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
