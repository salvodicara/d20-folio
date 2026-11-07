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

import type { DamageRetaliation } from "@/lib/combat-transition";
import type { DamageInstance } from "@/lib/damage-intake";
import type { LocText } from "@/lib/loc-text";
import { stripUndefined } from "@/lib/strip-undefined";
import type { CampaignDoc, EncounterEndReason, EncounterState } from "@/types/campaign";

import {
  addMonster,
  parseEncounterState,
  removeCombatant,
  setInitiative,
  setMonsterCondition,
  type EncounterPcSeed,
  type MonsterInput,
} from "./encounter";
import { endCombat, reopenCombat, rollInitiative } from "./encounter-lifecycle";
import { recordCondition, recordPcHp, undoHpEvent } from "./combat-chronicle";
import {
  applyAdversaryDamageParts,
  applyAdversaryHeal,
  landRetaliations,
  undoAdversaryChronicleEvent,
} from "./encounter-world-command";

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

/** Whose initiative is missing: every PC in the fight without a roll, or, with no fight
 *  running, every member with an attached character. The rolls an ended fight leaves
 *  behind are kept for its reopen; they are not rolls for the next fight (a roll that
 *  starts one also ignores them). */
export function missingRollers(campaign: CombatFields): string[] {
  if (!campaign.encounter) return attached(campaign).uids;
  const rolled = campaign.encounterInit ?? {};
  return campaign.encounter.combatants
    .flatMap((c) => (c.kind === "pc" ? [c.memberUid] : []))
    .filter((uid) => rolled[uid] === undefined);
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

/** A hit the DM landed on a PC through the peer write, as the fight records it. */
export interface PcDamageBeat {
  uid: string;
  campaignId: string;
  /** The PC's combatant id (`pc-<uid>`). */
  targetId: string;
  amount: number;
  /** The PC's HP before and after the write (its own damage rule decided them). */
  preCurrent: number;
  postCurrent: number;
  max: number;
  tempAbsorbed?: number;
  /** The creature that hit, when the DM named one. */
  attackerId?: string;
  action?: LocText;
  /** What the hit sends back to its attacker (Armor of Agathys), landed here. */
  retaliations: ReadonlyArray<DamageRetaliation>;
}

/**
 * The fight's side of the DM's hit on a PC: the beat (and the fall, at 0), and what the
 * hit sends back landed on the attacker, in one write. Returns the lines it added, for
 * its undo. Null for anyone but the DM, or with no fight running.
 */
export function planPcDamageBeat(
  campaign: CombatFields & Pick<CampaignDoc, "dmUid">,
  beat: PcDamageBeat
): { patch: CombatPatch; eventIds: string[] } | null {
  const fight = campaign.encounter;
  if (!fight || beat.uid !== campaign.dmUid) return null;
  const recorded = recordPcHp(fight, {
    targetId: beat.targetId,
    kind: "damage",
    amount: beat.amount,
    preCurrent: beat.preCurrent,
    postCurrent: beat.postCurrent,
    max: beat.max,
    ...(beat.tempAbsorbed ? { tempAbsorbed: beat.tempAbsorbed } : {}),
    ...(beat.attackerId ? { attackerId: beat.attackerId } : {}),
    ...(beat.action ? { action: beat.action } : {}),
  });
  const next = landRetaliations(recorded, beat.campaignId, beat.retaliations);
  const before = new Set((fight.events ?? []).map((event) => event.id));
  const eventIds = (next.events ?? [])
    .map((event) => event.id)
    .filter((id) => !before.has(id));
  return { patch: { encounter: next }, eventIds };
}

/**
 * The undo of a DM move's lines: each line it added comes off the fight, newest first,
 * and a monster's HP line gives the HP back. Null for anyone but the DM, or when the
 * fight is gone.
 */
export function planUndoBeats(
  campaign: CombatFields & Pick<CampaignDoc, "dmUid">,
  input: { uid: string; campaignId: string; eventIds: ReadonlyArray<string> }
): CombatPatch | null {
  const fight = campaign.encounter;
  if (!fight || input.uid !== campaign.dmUid) return null;
  let next = fight;
  for (const id of [...input.eventIds].reverse()) {
    const event = next.events?.find((candidate) => candidate.id === id);
    if (!event) continue;
    const target =
      "targetId" in event
        ? next.combatants.find((combatant) => combatant.id === event.targetId)
        : undefined;
    const undone =
      target?.kind === "monster"
        ? undoAdversaryChronicleEvent(next, input.campaignId, id)
        : event.kind === "hp-damage" || event.kind === "hp-heal"
          ? undoHpEvent(next, id)
          : next;
    next = {
      ...undone,
      events: (undone.events ?? []).filter((candidate) => candidate.id !== id),
    };
  }
  return { encounter: next };
}

/** What the DM does to a monster's Hit Points: a hit (typed parts, through its own
 *  defenses) or a heal. */
export type MonsterHpChange =
  | { kind: "damage"; parts: ReadonlyArray<DamageInstance>; attackerId?: string }
  | { kind: "heal"; amount: number };

/**
 * The DM's hit or heal on a monster, with the lines it adds for its undo
 * ({@link planUndoBeats}). Null for anyone but the DM, with no fight running, or when
 * nothing changed.
 */
export function planMonsterHp(
  campaign: CombatFields & Pick<CampaignDoc, "dmUid">,
  input: { uid: string; campaignId: string; monsterId: string; change: MonsterHpChange }
): { patch: CombatPatch; eventIds: string[] } | null {
  const fight = campaign.encounter;
  if (!fight || input.uid !== campaign.dmUid) return null;
  const { change } = input;
  const next =
    change.kind === "damage"
      ? applyAdversaryDamageParts(fight, input.campaignId, input.monsterId, change.parts)
      : applyAdversaryHeal(fight, input.campaignId, input.monsterId, change.amount);
  if (next === fight) return null;
  const before = new Set((fight.events ?? []).map((event) => event.id));
  const eventIds = (next.events ?? [])
    .map((event) => event.id)
    .filter((id) => !before.has(id));
  return { patch: { encounter: next }, eventIds };
}

/**
 * The DM puts a condition on a monster, or takes it off, with its line in the fight. Its
 * undo is the same move inverted. Null for anyone but the DM, with no fight running,
 * or when the monster already has (or lacks) it.
 */
export function planMonsterCondition(
  campaign: CombatFields & Pick<CampaignDoc, "dmUid">,
  input: { uid: string; monsterId: string; conditionId: string; active: boolean }
): CombatPatch | null {
  const fight = campaign.encounter;
  if (!fight || input.uid !== campaign.dmUid) return null;
  const monster = fight.combatants.find((c) => c.id === input.monsterId);
  if (monster?.kind !== "monster") return null;
  if (monster.conditions.includes(input.conditionId) === input.active) return null;
  const next = recordCondition(
    setMonsterCondition(fight, input.monsterId, input.conditionId, input.active),
    input.monsterId,
    input.conditionId,
    input.active
  );
  return { encounter: next };
}

/**
 * The DM sets a monster's initiative (the turn order follows), handing back the old
 * value for the undo. Null for anyone but the DM, with no fight running, or when the
 * value is the same.
 */
export function planMonsterInitiative(
  campaign: CombatFields & Pick<CampaignDoc, "dmUid">,
  input: { uid: string; monsterId: string; value: number | null }
): { patch: CombatPatch; previous: number | null } | null {
  const fight = campaign.encounter;
  if (!fight || input.uid !== campaign.dmUid) return null;
  const monster = fight.combatants.find((c) => c.id === input.monsterId);
  if (monster?.kind !== "monster" || monster.initiative === input.value) return null;
  return {
    patch: { encounter: setInitiative(fight, input.monsterId, input.value) },
    previous: monster.initiative,
  };
}

/**
 * The DM adds monsters to the running fight (each takes its place by initiative), naming
 * the new creatures for the undo. v1 adds only during a fight: there is no staging area
 * yet. Null for anyone but the DM, or with no fight running.
 */
export function planAddMonsters(
  campaign: CombatFields & Pick<CampaignDoc, "dmUid">,
  input: { uid: string; monster: MonsterInput }
): { patch: CombatPatch; added: string[] } | null {
  const fight = campaign.encounter;
  if (!fight || input.uid !== campaign.dmUid) return null;
  const next = addMonster(fight, input.monster);
  const known = new Set(fight.combatants.map((c) => c.id));
  const added = next.combatants.map((c) => c.id).filter((id) => !known.has(id));
  return added.length > 0 ? { patch: { encounter: next }, added } : null;
}

/**
 * The undo of an add: the creatures leave while nobody has touched them (full HP, no
 * condition, no line in the fight names them). Null when any was touched, for anyone but
 * the DM, or with no fight running.
 */
export function planRemoveUntouched(
  campaign: CombatFields & Pick<CampaignDoc, "dmUid">,
  input: { uid: string; ids: ReadonlyArray<string> }
): CombatPatch | null {
  const fight = campaign.encounter;
  if (!fight || input.uid !== campaign.dmUid) return null;
  const named = new Set(
    (fight.events ?? []).flatMap((event) => [
      ...("targetId" in event ? [event.targetId] : []),
      ...("attackerId" in event && event.attackerId ? [event.attackerId] : []),
      ...("actor" in event && typeof event.actor === "string" ? [event.actor] : []),
    ])
  );
  let next = fight;
  for (const id of input.ids) {
    const creature = fight.combatants.find((c) => c.id === id);
    if (!creature) continue;
    if (
      creature.kind !== "monster" ||
      creature.hp.current !== creature.hp.max ||
      creature.conditions.length > 0 ||
      named.has(id)
    )
      return null;
    next = removeCombatant(next, id);
  }
  return { encounter: next };
}
