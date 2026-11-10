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
import { diagnosticsLog } from "@/lib/diagnostics";
import { db } from "@/lib/firebase";
import type { CampaignDoc, EncounterEndReason, EncounterState } from "@/types/campaign";
import type { DamageInstance } from "@/lib/damage-intake";
import type { LocText } from "@/lib/loc-text";

import {
  advanceEncounterTurn,
  toCampaignDoc,
  writeCampaignCombatEffect,
} from "./campaign-io";
import { createSessionRecorder, type SessionRecorder } from "@/lib/session-log";

import { recordCondition } from "./combat-chronicle";
import { useCampaignStore } from "./campaignStore";
import {
  parseEncounterState,
  rosterHpWriteBack,
  type MonsterInput,
  type RosterCombatantInput,
} from "./encounter";
import { readRoster, writeRosterHp } from "./roster-io";
import { sessionLogStoreFor } from "./session-log-source";
import {
  planCancel,
  planEnd,
  planAddMonsters,
  planAddRoster,
  planMonsterCondition,
  planMonsterHp,
  planMonsterInitiative,
  planPcDamageBeat,
  planRemoveUntouched,
  planUndoBeats,
  planReopen,
  planRoll,
  planRollForMissing,
  planUnrollMissing,
  combatPatchFields,
  type CombatFields,
  type CombatPatch,
  type MonsterHpChange,
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
  const ended = await applyMove<EncounterState>(campaignId, (campaign) => {
    const fight = campaign.encounter;
    const patch = planEnd(campaign, { reason, now: Date.now() });
    return patch && fight ? { patch, result: fight } : null;
  });
  if (ended === null) return null;
  const epoch = ended.epoch;
  // The roster creatures' Hit Points go back to their entries (edge-case M19).
  if (ended.rosterLinks) void writeBackRosterHp(campaignId, ended);
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

/**
 * The DM hits a PC from the fight (the new campaign page's DM tools): the hit lands on
 * the PC through its own damage rule (the peer write: Resistance from its sheet as it
 * stands, temporary HP, 0 HP, a Concentration save, Warding Bond's share), then the
 * fight records it, with what the hit sends back to a monster attacker (Armor of
 * Agathys). Typed parts resolve at the write; an untyped hit is one part with no type.
 * Its undo puts the PC's HP back and takes the lines off. Null for anyone but the DM,
 * with no fight running, or when the hit changed nothing.
 */
export async function damagePcFromDm(
  campaignId: string,
  input: {
    uid: string;
    memberUid: string;
    characterId: string;
    maxHp: number;
    parts: ReadonlyArray<DamageInstance>;
    /** The monster that hit, and whether in melee (Armor of Agathys answers that). */
    attacker?: { id: string; melee: boolean };
    action?: LocText;
  }
): Promise<CombatUndo | null> {
  const campaign = useCampaignStore.getState().campaign;
  if (campaign?.id !== campaignId || campaign.dmUid !== input.uid || !campaign.encounter)
    return null;
  const amount = input.parts.reduce((sum, part) => sum + Math.max(0, part.amount), 0);
  if (amount <= 0) return null;
  const { before, after, retaliations } = await writeCampaignCombatEffect(
    input.memberUid,
    input.characterId,
    null,
    input.maxHp,
    {
      kind: "hp",
      operation: {
        kind: "damage",
        amount,
        parts: input.parts,
        ...(input.attacker
          ? {
              hit: {
                attacker: { kind: "monster", combatantId: input.attacker.id },
                attackMode: input.attacker.melee ? "melee" : "ranged",
              },
            }
          : {}),
      },
    }
  );
  const revertHit = () =>
    writeCampaignCombatEffect(input.memberUid, input.characterId, null, input.maxHp, {
      kind: "revert",
      written: after,
      previous: before,
    });
  const eventIds = await applyMove(campaignId, (fresh) => {
    const planned = planPcDamageBeat(fresh, {
      uid: input.uid,
      campaignId,
      targetId: `pc-${input.memberUid}`,
      amount,
      preCurrent: before.hp.current,
      postCurrent: after.hp.current,
      max: input.maxHp,
      tempAbsorbed: Math.max(0, before.hp.temp - after.hp.temp),
      ...(input.attacker ? { attackerId: input.attacker.id } : {}),
      ...(input.action ? { action: input.action } : {}),
      retaliations,
    });
    return planned && { patch: planned.patch, result: planned.eventIds };
  });
  if (eventIds === null) {
    // The fight went meanwhile: the hit stays on the sheet, with nothing to record.
    return async () => {
      await revertHit();
      return true;
    };
  }
  return async () => {
    await revertHit();
    const undone = await applyMove(campaignId, (fresh) => {
      const patch = planUndoBeats(fresh, { uid: input.uid, campaignId, eventIds });
      return patch && { patch, result: true };
    });
    return undone === true;
  };
}

/**
 * The DM's hit (typed parts, through the monster's own defenses) or heal on a monster
 * in the fight. Its undo takes the lines off and gives the HP back. Null for anyone but
 * the DM, with no fight running, or when nothing changed.
 */
export async function changeMonsterHp(
  campaignId: string,
  input: { uid: string; monsterId: string; change: MonsterHpChange }
): Promise<CombatUndo | null> {
  const eventIds = await applyMove(campaignId, (campaign) => {
    const planned = planMonsterHp(campaign, { ...input, campaignId });
    return planned && { patch: planned.patch, result: planned.eventIds };
  });
  if (eventIds === null) return null;
  return async () =>
    (await applyMove(campaignId, (campaign) => {
      const patch = planUndoBeats(campaign, { uid: input.uid, campaignId, eventIds });
      return patch && { patch, result: true };
    })) === true;
}

/** The DM toggles a condition on a monster in the fight; the undo inverts it. */
export async function setMonsterConditionMove(
  campaignId: string,
  input: { uid: string; monsterId: string; conditionId: string; active: boolean }
): Promise<CombatUndo | null> {
  const done = await applyMove(campaignId, (campaign) => {
    const patch = planMonsterCondition(campaign, input);
    return patch && { patch, result: true };
  });
  if (done === null) return null;
  return async () =>
    (await applyMove(campaignId, (campaign) => {
      const patch = planMonsterCondition(campaign, { ...input, active: !input.active });
      return patch && { patch, result: true };
    })) === true;
}

/** The DM sets a monster's initiative; the undo puts the old value back. */
export async function setMonsterInitiativeMove(
  campaignId: string,
  input: { uid: string; monsterId: string; value: number | null }
): Promise<CombatUndo | null> {
  const previous = await applyMove(campaignId, (campaign) => {
    const planned = planMonsterInitiative(campaign, input);
    return planned && { patch: planned.patch, result: { value: planned.previous } };
  });
  if (previous === null) return null;
  return async () =>
    (await applyMove(campaignId, (campaign) => {
      const planned = planMonsterInitiative(campaign, {
        ...input,
        value: previous.value,
      });
      return planned && { patch: planned.patch, result: true };
    })) === true;
}

/**
 * The DM toggles a condition on a PC: written on the PC's own combat state (the peer
 * write), then recorded in the fight. The undo reverts the write and takes the line
 * off. Null for anyone but the DM, or with no fight running.
 */
export async function setPcConditionMove(
  campaignId: string,
  input: {
    uid: string;
    memberUid: string;
    characterId: string;
    maxHp: number;
    conditionId: string;
    active: boolean;
  }
): Promise<CombatUndo | null> {
  const campaign = useCampaignStore.getState().campaign;
  if (campaign?.id !== campaignId || campaign.dmUid !== input.uid || !campaign.encounter)
    return null;
  const { before, after } = await writeCampaignCombatEffect(
    input.memberUid,
    input.characterId,
    null,
    input.maxHp,
    {
      kind: "condition",
      operation: {
        kind: input.active ? "add" : "remove",
        conditionId: input.conditionId,
      },
    }
  );
  const revert = () =>
    writeCampaignCombatEffect(input.memberUid, input.characterId, null, input.maxHp, {
      kind: "revert",
      written: after,
      previous: before,
    });
  const eventIds = await applyMove(campaignId, (fresh) => {
    const fight = fresh.encounter;
    if (!fight || fresh.dmUid !== input.uid) return null;
    const next = recordCondition(
      fight,
      `pc-${input.memberUid}`,
      input.conditionId,
      input.active
    );
    const known = new Set((fight.events ?? []).map((event) => event.id));
    const added = (next.events ?? []).map((e) => e.id).filter((id) => !known.has(id));
    return { patch: { encounter: next }, result: added };
  });
  return async () => {
    await revert();
    if (!eventIds?.length) return true;
    return (
      (await applyMove(campaignId, (fresh) => {
        const patch = planUndoBeats(fresh, { uid: input.uid, campaignId, eventIds });
        return patch && { patch, result: true };
      })) === true
    );
  };
}

/**
 * The DM adds monsters to the running fight (a bestiary entry, a homebrew one, or a
 * quick name/AC/HP): they take their place by initiative. The undo takes them out while
 * nobody has touched them. Null for anyone but the DM, or with no fight running (v1:
 * no staging area).
 */
export async function addMonstersMove(
  campaignId: string,
  input: { uid: string; monster: MonsterInput }
): Promise<CombatUndo | null> {
  const added = await applyMove(campaignId, (campaign) => {
    const planned = planAddMonsters(campaign, input);
    return planned && { patch: planned.patch, result: planned.added };
  });
  if (added === null) return null;
  return async () =>
    (await applyMove(campaignId, (campaign) => {
      const patch = planRemoveUntouched(campaign, { uid: input.uid, ids: added });
      return patch && { patch, result: true };
    })) === true;
}

/** Each roster creature's Hit Points after the fight, back on its entry. A failure is
 *  reported; the fight has already ended. */
async function writeBackRosterHp(
  campaignId: string,
  fight: EncounterState
): Promise<void> {
  try {
    const roster = await readRoster(campaignId);
    await Promise.all(
      rosterHpWriteBack(fight, roster).flatMap(({ rosterId, hp }) =>
        roster[rosterId] ? [writeRosterHp(campaignId, rosterId, hp)] : []
      )
    );
  } catch (error) {
    diagnosticsLog("warn", "campaign.roster-writeback-failed", {
      message: String(error),
    });
  }
}

/**
 * The DM brings a roster creature into the running fight (edge-case M19): with the Hit
 * Points it has now, linked so they go back to its entry when the fight ends. The undo
 * takes it out while nobody has touched it. Null for anyone but the DM, with no fight
 * running, or when the entry is already in it.
 */
export async function addRosterToFight(
  campaignId: string,
  input: { uid: string } & RosterCombatantInput
): Promise<CombatUndo | null> {
  const joined = await applyMove(campaignId, (campaign) => {
    const planned = planAddRoster(campaign, input);
    return (
      planned && {
        patch: planned.patch,
        result: { ids: planned.added, enteredHp: planned.enteredHp },
      }
    );
  });
  if (joined === null) return null;
  return async () =>
    (await applyMove(campaignId, (campaign) => {
      const patch = planRemoveUntouched(campaign, { uid: input.uid, ...joined });
      return patch && { patch, result: true };
    })) === true;
}
