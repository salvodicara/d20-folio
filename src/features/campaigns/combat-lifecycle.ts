/**
 * The combat lifecycle's campaign moves (owner 2026-10-23, `encounter-lifecycle.ts`): a
 * roll starts or joins the fight, anyone ends it, anyone reopens it. Pure plans over the
 * campaign document: each returns the whole fields to write, or null when there is
 * nothing to do. `combat-lifecycle-io.ts` writes them in one transaction.
 *
 * An ended fight moves to its own document (`campaigns/{id}/combat/ended`, the "kept
 * fight") and `encounter` goes back to null, so a client that predates `ended` (v0.25.0)
 * reads the fight as over, exactly as after a DM's end.
 * The moves a member may make are the ones firestore.rules grants (`memberStartsFight`,
 * `memberJoinsOrResorts`, `memberCancelsFight`, `memberEndsFight`, `memberReopensFight`).
 */

import { stripUndefined } from "@/lib/strip-undefined";
import type { CampaignDoc, EncounterEndReason, EncounterState } from "@/types/campaign";

import { parseEncounterState, type EncounterPcSeed } from "./encounter";
import { endCombat, reopenCombat, rollInitiative } from "./encounter-lifecycle";

/** What a lifecycle move writes: campaign fields, and the kept fight (`null` deletes it). */
export interface CombatPatch {
  encounter?: EncounterState | null;
  endedEncounter?: EncounterState | null;
  encounterInit?: Record<string, number>;
  encounterSkipped?: Record<string, boolean>;
}

/** What a move reads: the campaign's fight fields and the kept fight, when there is one. */
export type CombatFields = Pick<
  CampaignDoc,
  "encounter" | "encounterInit" | "memberDetails"
> & {
  endedEncounter?: EncounterState | null;
};

/** The members with an attached character: who is in a fight that starts now. */
function attached(campaign: CombatFields): {
  seeds: Record<string, EncounterPcSeed>;
  uids: string[];
} {
  const seeds: Record<string, EncounterPcSeed> = {};
  const uids: string[] = [];
  for (const [uid, member] of Object.entries(campaign.memberDetails)) {
    if (member.characterId && member.character) {
      seeds[uid] = { characterId: member.characterId };
      uids.push(uid);
    }
  }
  return { seeds, uids };
}

/** Every rolled PC's initiative total (raw roll + the view's bonus), by combatant id. */
function totals(
  init: Readonly<Record<string, number>>,
  bonuses: Readonly<Record<string, number>>
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(init).map(([uid, roll]) => [
      `pc-${uid}`,
      roll + (bonuses[`pc-${uid}`] ?? 0),
    ])
  );
}

export interface RollPlan {
  patch: CombatPatch;
  /** This roll started the fight (its undo cancels it). */
  started: boolean;
  /** The roller's roll before this one (its undo restores it). */
  previous: number | null;
  epoch: number;
}

/**
 * Record `uid`'s initiative roll (`null` takes it back). With no fight running it starts
 * one; a roller not in the fight joins it; the order follows. A fight the DM runs by hand
 * (no `clock`) only records the roll: its order is the DM's.
 */
export function planRoll(
  campaign: CombatFields,
  input: {
    uid: string;
    roll: number | null;
    /** Each PC's initiative bonus from the encounter view, by combatant id. */
    bonuses: Readonly<Record<string, number>>;
    now: number;
  }
): RollPlan | null {
  const { uid, roll, now } = input;
  const live = campaign.encounter ?? null;
  const previous = campaign.encounterInit?.[uid] ?? null;
  if (!live && roll === null) return null;
  const starting = !live;
  const others = Object.entries(starting ? {} : (campaign.encounterInit ?? {})).filter(
    ([other]) => other !== uid
  );
  const init: Record<string, number> = Object.fromEntries(
    roll === null ? others : [...others, [uid, roll]]
  );
  if (live && live.clock === undefined) {
    return {
      patch: { encounterInit: init },
      started: false,
      previous,
      epoch: live.epoch,
    };
  }
  const { seeds, uids } = attached(campaign);
  if (starting && !seeds[uid]) return null;
  const fight = rollInitiative(live, {
    combatantId: `pc-${uid}`,
    pcInitiatives: totals(init, input.bonuses),
    seeds,
    attachedUids: uids,
    now,
  });
  return {
    patch: starting
      ? { encounter: fight, encounterInit: init, encounterSkipped: {} }
      : { encounter: fight, encounterInit: init },
    started: starting,
    previous,
    epoch: fight.epoch,
  };
}

/**
 * The undo of a roll that started the fight: the fight goes, while nobody has fought in
 * it yet (no creature, no beat, no turn passed) and the roll is still the only one.
 */
export function planCancel(
  campaign: CombatFields,
  input: { uid: string; epoch: number }
): CombatPatch | null {
  const fight = campaign.encounter;
  if (!fight || fight.epoch !== input.epoch) return null;
  const rolled = Object.keys(campaign.encounterInit ?? {});
  if (fight.nextMonsterOrdinal !== 1 || (fight.events?.length ?? 0) > 0) return null;
  if (fight.clock?.turnsBegun || rolled.some((other) => other !== input.uid)) return null;
  return { encounter: null, encounterInit: {} };
}

/** End the running fight, keeping it so it can reopen. */
export function planEnd(
  campaign: CombatFields,
  input: { reason: EncounterEndReason; now: number; epoch?: number }
): CombatPatch | null {
  const fight = campaign.encounter;
  if (!fight || (input.epoch !== undefined && fight.epoch !== input.epoch)) return null;
  return { encounter: null, endedEncounter: endCombat(fight, input.reason, input.now) };
}

/** Reopen the last ended fight exactly where it stopped, while no other fight runs. */
export function planReopen(
  campaign: CombatFields,
  input: { now: number; epoch?: number }
): CombatPatch | null {
  const kept = campaign.endedEncounter;
  if (campaign.encounter || !kept?.ended) return null;
  if (input.epoch !== undefined && kept.epoch !== input.epoch) return null;
  return { encounter: reopenCombat(kept, input.now), endedEncounter: null };
}

/** The Firestore writes of a patch: the campaign's fields, and the kept-fight document
 *  (`undefined` untouched, `null` deleted). Each fight is checked by the encounter parser
 *  first, so a write never stores a fight readers would reject. */
export function combatPatchFields(patch: CombatPatch): {
  campaign: Record<string, unknown>;
  kept?: { fight: unknown } | null;
} {
  const fight = (state: EncounterState) => stripUndefined(parseEncounterState(state));
  const campaign: Record<string, unknown> = {};
  if ("encounter" in patch)
    campaign.encounter = patch.encounter ? fight(patch.encounter) : null;
  if (patch.encounterInit) campaign.encounterInit = patch.encounterInit;
  if (patch.encounterSkipped) campaign.encounterSkipped = patch.encounterSkipped;
  if (!("endedEncounter" in patch)) return { campaign };
  return {
    campaign,
    kept: patch.endedEncounter ? { fight: fight(patch.endedEncounter) } : null,
  };
}

export interface MissingRollPlan {
  patch: CombatPatch;
  /** The rolls this move made, by member uid (the raw d20). */
  rolled: Record<string, number>;
  /** This move started the fight. */
  started: boolean;
  epoch: number;
}

/** Whose initiative is missing: every PC in the fight (or, with no fight yet, every
 *  member with an attached character) without a roll. */
function missingRollers(campaign: CombatFields): string[] {
  const rolled = campaign.encounterInit ?? {};
  const uids = campaign.encounter
    ? campaign.encounter.combatants.flatMap((c) => (c.kind === "pc" ? [c.memberUid] : []))
    : attached(campaign).uids;
  return uids.filter((uid) => rolled[uid] === undefined);
}

/**
 * The DM's «Tira per chi manca»: a d20 for every PC who has not rolled, each with that
 * PC's own bonus, as if each had rolled it; the first one starts the fight when none
 * runs. Null for anyone but the DM, or when nobody is missing.
 */
export function planRollForMissing(
  campaign: CombatFields & Pick<CampaignDoc, "dmUid">,
  input: {
    uid: string;
    bonuses: Readonly<Record<string, number>>;
    now: number;
    /** One d20 roll (crypto-random in the app, fixed in tests). */
    d20: () => number;
  }
): MissingRollPlan | null {
  if (input.uid !== campaign.dmUid) return null;
  const missing = missingRollers(campaign);
  if (missing.length === 0) return null;
  let current: CombatFields = campaign;
  let patch: CombatPatch = {};
  let started = false;
  const rolled: Record<string, number> = {};
  for (const uid of missing) {
    const roll = input.d20();
    const plan = planRoll(current, { uid, roll, bonuses: input.bonuses, now: input.now });
    if (!plan) continue;
    started ||= plan.started;
    rolled[uid] = roll;
    patch = { ...patch, ...plan.patch };
    current = { ...current, ...plan.patch };
  }
  const epoch = current.encounter?.epoch;
  if (Object.keys(rolled).length === 0 || epoch === undefined) return null;
  return { patch, rolled, started, epoch };
}

/**
 * The undo of {@link planRollForMissing}: the rows it filled empty again, while each
 * still holds its roll in the same fight (a player who has re-rolled since keeps it, and
 * the undo refuses). A move that started the fight takes it away, while nobody has
 * fought in it and its rolls are still the only ones.
 */
export function planUnrollMissing(
  campaign: CombatFields,
  input: {
    rolled: Readonly<Record<string, number>>;
    started: boolean;
    epoch: number;
    bonuses: Readonly<Record<string, number>>;
    now: number;
  }
): CombatPatch | null {
  const fight = campaign.encounter;
  if (!fight || fight.epoch !== input.epoch) return null;
  const init = campaign.encounterInit ?? {};
  const mine = Object.entries(input.rolled);
  if (mine.some(([uid, roll]) => init[uid] !== roll)) return null;
  if (input.started) {
    const others = Object.keys(init).filter((uid) => input.rolled[uid] === undefined);
    if (others.length > 0 || fight.nextMonsterOrdinal !== 1) return null;
    if ((fight.events?.length ?? 0) > 0 || fight.clock?.turnsBegun) return null;
    return { encounter: null, encounterInit: {} };
  }
  let current: CombatFields = campaign;
  let patch: CombatPatch = {};
  for (const [uid] of mine) {
    const plan = planRoll(current, {
      uid,
      roll: null,
      bonuses: input.bonuses,
      now: input.now,
    });
    if (!plan) return null;
    patch = { ...patch, ...plan.patch };
    current = { ...current, ...plan.patch };
  }
  return patch;
}
