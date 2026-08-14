/**
 * The encounter/adversary world seam — derivation conformance + the engine
 * command boundary end-to-end.
 *
 * (a) `encounterWorldState` projects a REAL legacy encounter document (built
 *     through the actual reducers) into a canonical, parse-proved, frozen
 *     `SharedMaterialState`, preserving the persisted engine layer across
 *     legacy writes and failing CLOSED on a corrupt persisted world.
 * (b) `applyAdversaryDamage` / `applyAdversaryCondition` run the coordinator
 *     over the derived world and commit through the canonical journal, with
 *     the world-owned facts mirrored onto the exact legacy fields (hp trio,
 *     condition chips, chronicle beats) and the dying/dead boundary honored.
 * (c) A booked condition's turn-boundary lifetime expires on the RIGHT turn
 *     under the kernel's own complete-turn boundary machinery, and the mirror
 *     releases the legacy chip.
 * (d) `stepEncounterTurn` fires that SAME boundary from the production turn
 *     stepper — expiries land exactly when the table steps, the chip release
 *     mirrors in the same value, a PC-pointer step ends no canonical turn,
 *     and back-step is the documented legacy-pointer-only degradation.
 * (e) `applyAdversaryHeal` books healing with the exact legacy semantics
 *     (clamp at max, temp untouched, full-HP no-op, 0-HP revive degrades).
 * (f) `undoAdversaryChronicleEvent` reverses an engine-mirrored beat through
 *     its exact journal action (hp trio, temp, occurrences, lifetimes) and
 *     degrades to the legacy arithmetic for a pre-world beat.
 */
import { describe, expect, it } from "vitest";

import {
  addMonster,
  applyHp,
  beginEncounterTurns,
  removeCombatant,
  setMonsterTempHp,
  startEncounter,
} from "@/features/campaigns/encounter";
import {
  applyAdversaryCondition,
  applyAdversaryDamage,
  applyAdversaryHeal,
  mirrorAdversaryCommit,
  stepEncounterTurn,
  undoAdversaryChronicleEvent,
} from "@/features/campaigns/encounter-world-command";
import { undoHpEvent } from "@/features/campaigns/combat-chronicle";
import { encounterMaterialRef, encounterWorldState } from "@/lib/encounter-world-store";
import {
  advanceMechanicsBoundary,
  beginMechanicsBoundary,
  completeMechanicsBoundaryCheckpoint,
} from "@/lib/mechanics-world";
import type { EncounterMonster, EncounterState } from "@/types/campaign";
import type { SharedMaterialState } from "@/types/material-state";
import type { MechanicsBoundaryCommand, MechanicsWorld } from "@/types/mechanics-world";

const CAMPAIGN_ID = "campaign-under-test";
const MATERIAL = encounterMaterialRef(CAMPAIGN_ID);

/** Two picker goblins (srdId) + one hand-typed chief, via the REAL reducers. */
function baseEncounter(): EncounterState {
  let state = startEncounter({}, [], 1_000);
  state = addMonster(state, {
    ac: 15,
    count: 2,
    creatureType: "humanoid",
    initiative: 14,
    maxHp: 10,
    name: "Goblin",
    srdId: "goblin-warrior",
  });
  state = addMonster(state, {
    ac: 13,
    count: 1,
    initiative: 3,
    maxHp: 20,
    name: "Bandit Chief",
  });
  return state;
}

function turnsEncounter(): EncounterState {
  return beginEncounterTurns(baseEncounter(), ["monster-1", "monster-2", "monster-3"]);
}

function monsterIn(state: EncounterState, id: string): EncounterMonster {
  const monster = state.combatants.find((combatant) => combatant.id === id);
  if (!monster || monster.kind !== "monster") throw new Error(`missing ${id}`);
  return monster;
}

function creatureIn(world: Readonly<SharedMaterialState>, id: string) {
  const entity = world.entities[id];
  if (entity?.kind !== "creature") throw new Error(`missing creature ${id}`);
  return entity;
}

function sharedWorld(state: Readonly<SharedMaterialState>): MechanicsWorld {
  return {
    documents: [{ kind: "shared", material: MATERIAL, state }],
    scope: MATERIAL,
  };
}

/** Drive one boundary command to completion (the mechanics-world test recipe). */
function applyBoundary(
  value: Readonly<MechanicsWorld>,
  command: Readonly<MechanicsBoundaryCommand>
) {
  let result = beginMechanicsBoundary(value, command);
  let remaining = 32;
  while (result.status === "checkpoint" && remaining > 0) {
    const completion = completeMechanicsBoundaryCheckpoint(
      result.continuation,
      result.checkpoint.state
    );
    if (!completion) throw new Error("invalid boundary completion");
    result = advanceMechanicsBoundary(result.continuation, completion);
    remaining -= 1;
  }
  if (result.status !== "complete" || result.outcome !== "applied") {
    throw new Error(`boundary did not apply: ${JSON.stringify(result.status)}`);
  }
  return result.state;
}

function sharedStateOf(world: Readonly<MechanicsWorld>): Readonly<SharedMaterialState> {
  const document = world.documents[0];
  if (!document || document.kind !== "shared") throw new Error("missing shared doc");
  return document.state;
}

describe("encounterWorldState derivation conformance", () => {
  it("derives a canonical frozen shared world from a real turns-phase encounter", () => {
    const world = encounterWorldState(turnsEncounter(), CAMPAIGN_ID);
    expect(world).not.toBeNull();
    if (!world) return;
    expect(Object.isFrozen(world)).toBe(true);

    const goblin = creatureIn(world, "monster-1");
    expect(goblin.ordinal).toBe(1);
    expect(goblin.template).toEqual({
      creatureTypeOverride: null,
      kind: "catalogue-monster",
      monsterId: "goblin-warrior",
    });
    expect(goblin.overrides.armorClass).toBe(15);
    expect(goblin.overrides.hitPointMaximum).toBe(10);
    expect(goblin.vitals.hitPoints.current).toBe(10);
    expect(goblin.vitals.zeroHitPoints).toBeNull();

    const chief = creatureIn(world, "monster-3");
    expect(chief.ordinal).toBe(3);
    expect(chief.template.kind).toBe("custom");
    if (chief.template.kind !== "custom") return;
    expect(chief.template.definition.name).toBe("Bandit Chief");
    expect(chief.template.definition.hitPointMaximum).toBe(20);

    const encounter = world.encounter;
    expect(encounter).not.toBeNull();
    if (!encounter) return;
    expect(encounter.phase).toBe("turns");
    expect(encounter.currentCombatantId).toBe("monster-1");
    expect(encounter.order).toEqual(["monster-1", "monster-2", "monster-3"]);
    expect(encounter.round).toBe(1);
    expect(encounter.participants["monster-1"]).toMatchObject({
      initiativeRoll: 14,
      ordinal: 1,
      skipped: false,
    });
    expect(encounter.participants["monster-1"]?.economy.phase).toBe("own-turn");
    expect(encounter.participants["monster-3"]).toMatchObject({ initiativeRoll: 3 });
    expect(encounter.participants["monster-3"]?.economy.phase).toBe("between-turns");
  });

  it("splits an out-of-die initiative total into a legal roll plus entity bonus", () => {
    let legacy = startEncounter({}, [], 1_000);
    legacy = addMonster(legacy, {
      ac: 17,
      count: 1,
      initiative: 25,
      maxHp: 30,
      name: "Champion",
    });
    const world = encounterWorldState(legacy, CAMPAIGN_ID);
    expect(world).not.toBeNull();
    if (!world) return;
    expect(creatureIn(world, "monster-1").overrides.initiativeBonus).toBe(5);
    expect(world.encounter?.participants["monster-1"]?.initiativeRoll).toBe(20);
  });

  it("projects the gathering phase as the canonical initiative posture", () => {
    const world = encounterWorldState(baseEncounter(), CAMPAIGN_ID);
    expect(world).not.toBeNull();
    if (!world) return;
    expect(world.encounter).toMatchObject({
      currentCombatantId: null,
      order: [],
      phase: "initiative",
    });
  });

  it("projects the initiative posture while the pointer rests off the adversaries", () => {
    // A pointer at a roll-less adversary cannot anchor a canonical turn order;
    // the projection keeps the between-turns posture (the kernel's 6s/turn
    // timeline law then carries turn-anchored lifetimes).
    let legacy = startEncounter({}, [], 1_000);
    legacy = addMonster(legacy, {
      ac: 12,
      count: 1,
      initiative: null,
      maxHp: 8,
      name: "Lurker",
    });
    legacy = beginEncounterTurns(legacy, ["monster-1"]);
    expect(legacy.currentCombatantId).toBe("monster-1");
    const world = encounterWorldState(legacy, CAMPAIGN_ID);
    expect(world).not.toBeNull();
    expect(world?.encounter?.phase).toBe("initiative");
  });

  it("fails CLOSED on a corrupt persisted world field", () => {
    const corrupt = { ...turnsEncounter(), world: { bogus: true } };
    expect(encounterWorldState(corrupt, CAMPAIGN_ID)).toBeNull();
  });

  it("keeps the persisted engine layer while adopting later legacy writes", () => {
    const damaged = applyAdversaryDamage(turnsEncounter(), CAMPAIGN_ID, "monster-1", 4);
    const engineWorld = encounterWorldState(damaged, CAMPAIGN_ID);
    expect(engineWorld?.revision).toBe(1);
    // A still-legacy surface heals 2 straight onto the doc (no engine).
    const healedLegacy = applyHp(damaged, "monster-1", 2);
    const reprojected = encounterWorldState(healedLegacy, CAMPAIGN_ID);
    expect(reprojected).not.toBeNull();
    if (!reprojected) return;
    expect(creatureIn(reprojected, "monster-1").vitals.hitPoints.current).toBe(8);
    expect(reprojected.revision).toBe(1);
    expect(reprojected.actions).toHaveLength(1);
  });

  it("sweeps effect occurrences for an adversary removed legacy-side", () => {
    const cursed = applyAdversaryCondition(
      turnsEncounter(),
      CAMPAIGN_ID,
      "monster-2",
      "poisoned",
      { phase: "end", turns: 1 }
    );
    const removed = removeCombatant(cursed, "monster-2");
    const world = encounterWorldState(removed, CAMPAIGN_ID);
    expect(world).not.toBeNull();
    if (!world) return;
    expect(world.entities["monster-2"]).toBeUndefined();
    expect(
      Object.values(world.occurrences).some(
        (occurrence) => occurrence.kind === "condition"
      )
    ).toBe(false);
  });
});

describe("applyAdversaryDamage end-to-end", () => {
  it("books landed damage through the coordinator and mirrors every legacy field", () => {
    const start = turnsEncounter();
    const next = applyAdversaryDamage(start, CAMPAIGN_ID, "monster-1", 4);
    expect(monsterIn(next, "monster-1").hp.current).toBe(6);
    expect(next.world).toBeDefined();
    const world = encounterWorldState(next, CAMPAIGN_ID);
    expect(world).not.toBeNull();
    if (!world) return;
    expect(creatureIn(world, "monster-1").vitals.hitPoints.current).toBe(6);
    expect(world.revision).toBe(1);
    expect(next.events).toHaveLength(1);
    expect(next.events?.[0]).toMatchObject({
      amount: 4,
      current: 6,
      kind: "hp-damage",
      targetId: "monster-1",
    });
  });

  it("absorbs temporary hit points first and records the absorbed share", () => {
    const shielded = setMonsterTempHp(turnsEncounter(), "monster-1", 3);
    const next = applyAdversaryDamage(shielded, CAMPAIGN_ID, "monster-1", 5);
    const monster = monsterIn(next, "monster-1");
    expect(monster.hp.temp).toBe(0);
    expect(monster.hp.current).toBe(8);
    expect(next.events?.[0]).toMatchObject({
      amount: 5,
      current: 8,
      kind: "hp-damage",
      tempAbsorbed: 3,
    });
  });

  it("honors the dying/dead boundary at zero hit points", () => {
    const next = applyAdversaryDamage(turnsEncounter(), CAMPAIGN_ID, "monster-1", 25);
    expect(monsterIn(next, "monster-1").hp.current).toBe(0);
    const world = encounterWorldState(next, CAMPAIGN_ID);
    expect(world).not.toBeNull();
    if (!world) return;
    expect(creatureIn(world, "monster-1").vitals.zeroHitPoints).toEqual({ kind: "dead" });
    expect(next.events?.some((event) => event.kind === "down")).toBe(true);
  });

  it("accumulates across successive engine actions on the persisted journal", () => {
    const first = applyAdversaryDamage(turnsEncounter(), CAMPAIGN_ID, "monster-1", 4);
    const second = applyAdversaryDamage(first, CAMPAIGN_ID, "monster-1", 4);
    expect(monsterIn(second, "monster-1").hp.current).toBe(2);
    expect(encounterWorldState(second, CAMPAIGN_ID)?.revision).toBe(2);
    expect(second.events).toHaveLength(2);
  });

  it("keeps the table running on the legacy arithmetic when the world fails closed", () => {
    const corrupt = { ...turnsEncounter(), world: { bogus: true } };
    const next = applyAdversaryDamage(corrupt, CAMPAIGN_ID, "monster-1", 4);
    expect(monsterIn(next, "monster-1").hp.current).toBe(6);
    // The degraded write is legacy-only: the corrupt world field is untouched.
    expect(next.world).toEqual({ bogus: true });
  });
});

describe("applyAdversaryCondition end-to-end", () => {
  it("books a condition with a turn-boundary lifetime and mirrors the chip", () => {
    const next = applyAdversaryCondition(
      turnsEncounter(),
      CAMPAIGN_ID,
      "monster-2",
      "poisoned",
      { phase: "end", turns: 1 }
    );
    expect(monsterIn(next, "monster-2").conditions).toEqual(["poisoned"]);
    expect(next.events?.[0]).toMatchObject({
      conditionId: "poisoned",
      kind: "condition-gain",
      targetId: "monster-2",
    });
    const world = encounterWorldState(next, CAMPAIGN_ID);
    expect(world).not.toBeNull();
    if (!world) return;
    const condition = Object.values(world.occurrences).find(
      (occurrence) => occurrence.kind === "condition"
    );
    expect(condition).toMatchObject({ conditionId: "poisoned", ending: null });
    expect(condition?.endRules).toEqual([
      {
        clock: { epoch: 1, material: MATERIAL },
        combatant: { entityId: "monster-2", material: MATERIAL, ordinal: 2 },
        kind: "turn-boundary",
        phase: "end",
        round: 1,
      },
    ]);
  });

  it("freezes the lifetime to the 6s/turn timeline law while no turn order runs", () => {
    const next = applyAdversaryCondition(
      baseEncounter(),
      CAMPAIGN_ID,
      "monster-2",
      "restrained",
      { phase: "end", turns: 2 }
    );
    const world = encounterWorldState(next, CAMPAIGN_ID);
    expect(world).not.toBeNull();
    if (!world) return;
    const condition = Object.values(world.occurrences).find(
      (occurrence) => occurrence.kind === "condition"
    );
    expect(condition?.endRules).toEqual([
      {
        clock: { epoch: 0, material: MATERIAL },
        elapsedSeconds: 12,
        kind: "time-reached",
      },
    ]);
  });

  it("expires on the right turn under the kernel's complete-turn boundary", () => {
    const cursed = applyAdversaryCondition(
      turnsEncounter(),
      CAMPAIGN_ID,
      "monster-2",
      "poisoned",
      { phase: "end", turns: 1 }
    );
    const world = encounterWorldState(cursed, CAMPAIGN_ID);
    expect(world).not.toBeNull();
    if (!world) return;

    const command = {
      excludeCurrent: null,
      kind: "complete-turn",
      material: MATERIAL,
    } as const;
    // Completing monster-1's turn hands the turn to monster-2; the condition
    // (until the END of monster-2's turn, round 1) is still standing.
    const afterFirst = applyBoundary(sharedWorld(world), command);
    const midState = sharedStateOf(afterFirst.world);
    expect(midState.encounter?.currentCombatantId).toBe("monster-2");
    expect(
      Object.values(midState.occurrences).some(
        (occurrence) => occurrence.kind === "condition" && occurrence.ending === null
      )
    ).toBe(true);

    // Completing monster-2's own turn crosses its end boundary: the condition
    // (and its root) leave the world in the boundary's end wave.
    const afterSecond = applyBoundary(afterFirst.world, command);
    const endState = sharedStateOf(afterSecond.world);
    expect(endState.encounter?.currentCombatantId).toBe("monster-3");
    expect(
      Object.values(endState.occurrences).some(
        (occurrence) => occurrence.kind === "condition"
      )
    ).toBe(false);

    // The mirror releases the engine-held legacy chip in the same discipline.
    const mirrored = mirrorAdversaryCommit(cursed, world, endState);
    expect(monsterIn(mirrored, "monster-2").conditions).toEqual([]);
    expect(
      mirrored.events?.some(
        (event) => event.kind === "condition-loss" && event.targetId === "monster-2"
      )
    ).toBe(true);
  });
});

describe("stepEncounterTurn — engine-first turn advancement", () => {
  it("expires exactly the lifetime booked for the crossed boundary and mirrors the chip", () => {
    // Poisoned until the END of monster-2's turn, booked during monster-1's turn.
    const cursed = applyAdversaryCondition(
      turnsEncounter(),
      CAMPAIGN_ID,
      "monster-2",
      "poisoned",
      { phase: "end", turns: 1 }
    );

    // Step 1 — monster-1's turn ends, the pointer hands to monster-2: the
    // boundary COMMITS (a journal action; revision bumps) but the condition
    // still stands, chip intact.
    const first = stepEncounterTurn(cursed, CAMPAIGN_ID, "next");
    expect(first.currentCombatantId).toBe("monster-2");
    expect(monsterIn(first, "monster-2").conditions).toEqual(["poisoned"]);
    const firstWorld = encounterWorldState(first, CAMPAIGN_ID);
    expect(firstWorld).not.toBeNull();
    if (!firstWorld) return;
    expect(firstWorld.revision).toBe(2);
    expect(
      Object.values(firstWorld.occurrences).some(
        (occurrence) => occurrence.kind === "condition"
      )
    ).toBe(true);

    // Step 2 — monster-2's OWN turn ends: the lifetime expires in the boundary's
    // end wave, the chip releases and the condition-loss beat lands with its
    // committing action stamped, all in the same encounter value.
    const second = stepEncounterTurn(first, CAMPAIGN_ID, "next");
    expect(second.currentCombatantId).toBe("monster-3");
    expect(monsterIn(second, "monster-2").conditions).toEqual([]);
    const loss = second.events?.find((event) => event.kind === "condition-loss");
    expect(loss).toMatchObject({ conditionId: "poisoned", targetId: "monster-2" });
    expect(loss?.engineActionId).toBeDefined();
    const secondWorld = encounterWorldState(second, CAMPAIGN_ID);
    expect(secondWorld).not.toBeNull();
    if (!secondWorld) return;
    expect(secondWorld.revision).toBe(3);
    expect(
      Object.values(secondWorld.occurrences).some(
        (occurrence) => occurrence.kind === "condition"
      )
    ).toBe(false);
  });

  it("a step off a PC pointer ends no canonical turn (narrow member write shape)", () => {
    let state = startEncounter({ hero: { characterId: "char-hero" } }, ["hero"], 1_000);
    state = addMonster(state, {
      ac: 15,
      count: 1,
      initiative: 12,
      maxHp: 10,
      name: "Goblin",
      srdId: "goblin-warrior",
    });
    state = beginEncounterTurns(state, ["pc-hero", "monster-1"]);
    expect(state.currentCombatantId).toBe("pc-hero");
    const next = stepEncounterTurn(state, CAMPAIGN_ID, "next");
    // The pointer moved, but NOTHING engine-owned was written: no world field,
    // no combatants edit, no events — exactly the two turn fields a player's
    // own-turn advance is allowed to change under `turnFieldsOnlyChanged`.
    expect(next.currentCombatantId).toBe("monster-1");
    expect(next.world).toBeUndefined();
    expect(next.combatants).toBe(state.combatants);
    expect(next.events).toBe(state.events);
  });

  it("back-step rewinds ONLY the legacy pointer (the documented degradation)", () => {
    const cursed = applyAdversaryCondition(
      turnsEncounter(),
      CAMPAIGN_ID,
      "monster-2",
      "poisoned",
      { phase: "end", turns: 1 }
    );
    const forward = stepEncounterTurn(cursed, CAMPAIGN_ID, "next");
    const back = stepEncounterTurn(forward, CAMPAIGN_ID, "prev");
    // The pointer rewound; the engine world is BYTE-IDENTICAL to the forward
    // step's (no boundary un-fire) and the standing condition is untouched.
    expect(back.currentCombatantId).toBe("monster-1");
    expect(back.world).toBe(forward.world);
    expect(back.events).toBe(forward.events);
    expect(monsterIn(back, "monster-2").conditions).toEqual(["poisoned"]);
  });

  it("keeps stepping on the legacy pointer when the world fails closed", () => {
    const corrupt = { ...turnsEncounter(), world: { bogus: true } };
    const next = stepEncounterTurn(corrupt, CAMPAIGN_ID, "next");
    expect(next.currentCombatantId).toBe("monster-2");
    // Fail-closed: the corrupt world field is untouched, nothing expired.
    expect(next.world).toEqual({ bogus: true });
  });
});

describe("applyAdversaryHeal end-to-end", () => {
  it("restores current HP exactly, leaves temp untouched, and mirrors the beat", () => {
    const shielded = setMonsterTempHp(turnsEncounter(), "monster-1", 3);
    const damaged = applyAdversaryDamage(shielded, CAMPAIGN_ID, "monster-1", 7);
    expect(monsterIn(damaged, "monster-1").hp).toEqual({ current: 6, max: 10, temp: 0 });
    const reshielded = setMonsterTempHp(damaged, "monster-1", 2);
    const healed = applyAdversaryHeal(reshielded, CAMPAIGN_ID, "monster-1", 3);
    const monster = monsterIn(healed, "monster-1");
    // Healing raises CURRENT only; the fresh temp pool is untouched.
    expect(monster.hp).toEqual({ current: 9, max: 10, temp: 2 });
    const beat = healed.events?.at(-1);
    expect(beat).toMatchObject({
      amount: 3,
      current: 9,
      kind: "hp-heal",
      targetId: "monster-1",
    });
    expect(beat?.engineActionId).toBeDefined();
    const world = encounterWorldState(healed, CAMPAIGN_ID);
    expect(world).not.toBeNull();
    if (!world) return;
    expect(creatureIn(world, "monster-1").vitals.hitPoints.current).toBe(9);
    expect(world.revision).toBe(2);
  });

  it("clamps at the maximum — no overheal beyond max", () => {
    const damaged = applyAdversaryDamage(turnsEncounter(), CAMPAIGN_ID, "monster-1", 4);
    const healed = applyAdversaryHeal(damaged, CAMPAIGN_ID, "monster-1", 100);
    expect(monsterIn(healed, "monster-1").hp.current).toBe(10);
    // The beat records the RESTORED share (4), never the requested 100.
    expect(healed.events?.at(-1)).toMatchObject({
      amount: 4,
      current: 10,
      kind: "hp-heal",
    });
  });

  it("a full-HP heal is a clean no-op (no beat, same value)", () => {
    const start = turnsEncounter();
    const healed = applyAdversaryHeal(start, CAMPAIGN_ID, "monster-1", 5);
    expect(monsterIn(healed, "monster-1").hp.current).toBe(10);
    expect(healed.events).toBeUndefined();
  });

  it("revives a 0-HP adversary through the documented legacy degradation", () => {
    const down = applyAdversaryDamage(turnsEncounter(), CAMPAIGN_ID, "monster-1", 25);
    expect(monsterIn(down, "monster-1").hp.current).toBe(0);
    const revived = applyAdversaryHeal(down, CAMPAIGN_ID, "monster-1", 5);
    expect(monsterIn(revived, "monster-1").hp.current).toBe(5);
    // The revive is legacy-only: the persisted world still holds the death
    // commit (revision 1) and adopts the legacy write at the next derivation.
    expect(revived.world).toBe(down.world);
    const world = encounterWorldState(revived, CAMPAIGN_ID);
    expect(world?.revision).toBe(1);
    expect(world ? creatureIn(world, "monster-1").vitals.hitPoints.current : null).toBe(
      5
    );
  });

  it("keeps healing on the legacy arithmetic when the world fails closed", () => {
    const corrupt = {
      ...applyHp(turnsEncounter(), "monster-1", -4),
      world: { bogus: true },
    };
    const healed = applyAdversaryHeal(corrupt, CAMPAIGN_ID, "monster-1", 2);
    expect(monsterIn(healed, "monster-1").hp.current).toBe(8);
    expect(healed.world).toEqual({ bogus: true });
  });
});

describe("undoAdversaryChronicleEvent — exact revert through the journal", () => {
  it("undoes a damage beat exactly: hp trio restored, line dropped, journal reversed", () => {
    const shielded = setMonsterTempHp(turnsEncounter(), "monster-1", 3);
    const damaged = applyAdversaryDamage(shielded, CAMPAIGN_ID, "monster-1", 5);
    expect(monsterIn(damaged, "monster-1").hp).toEqual({ current: 8, max: 10, temp: 0 });
    const beat = damaged.events?.[0];
    expect(beat?.engineActionId).toBeDefined();
    const undone = undoAdversaryChronicleEvent(damaged, CAMPAIGN_ID, "0");
    // Temp AND current restore exactly (5 = 3 temp + 2 hp), the line is gone.
    expect(monsterIn(undone, "monster-1").hp).toEqual({ current: 10, max: 10, temp: 3 });
    expect(undone.events).toEqual([]);
    const world = encounterWorldState(undone, CAMPAIGN_ID);
    expect(world).not.toBeNull();
    if (!world) return;
    expect(creatureIn(world, "monster-1").vitals.hitPoints).toEqual({
      current: 10,
      temporary: { current: 3, sourceOccurrence: null },
    });
    // The journal reflects the revert: the action stands at generation 2.
    expect(world.actions.map(({ generation }) => generation)).toEqual([2]);
  });

  it("drops the derived down line once the target stands again", () => {
    const down = applyAdversaryDamage(turnsEncounter(), CAMPAIGN_ID, "monster-1", 25);
    expect(down.events?.map((event) => event.kind)).toEqual(["hp-damage", "down"]);
    const undone = undoAdversaryChronicleEvent(down, CAMPAIGN_ID, "0");
    expect(monsterIn(undone, "monster-1").hp.current).toBe(10);
    expect(undone.events).toEqual([]);
  });

  it("undoes a booked condition: chip released, occurrence and lifetime gone", () => {
    const cursed = applyAdversaryCondition(
      turnsEncounter(),
      CAMPAIGN_ID,
      "monster-2",
      "poisoned",
      { phase: "end", turns: 1 }
    );
    const undone = undoAdversaryChronicleEvent(cursed, CAMPAIGN_ID, "0");
    expect(monsterIn(undone, "monster-2").conditions).toEqual([]);
    expect(undone.events).toEqual([]);
    const world = encounterWorldState(undone, CAMPAIGN_ID);
    expect(world).not.toBeNull();
    if (!world) return;
    expect(
      Object.values(world.occurrences).some(
        (occurrence) => occurrence.kind === "condition"
      )
    ).toBe(false);
  });

  it("undoes a turn-boundary expiry: the chip relights and the lifetime stands again", () => {
    const cursed = applyAdversaryCondition(
      turnsEncounter(),
      CAMPAIGN_ID,
      "monster-2",
      "poisoned",
      { phase: "end", turns: 1 }
    );
    const first = stepEncounterTurn(cursed, CAMPAIGN_ID, "next");
    const second = stepEncounterTurn(first, CAMPAIGN_ID, "next");
    expect(monsterIn(second, "monster-2").conditions).toEqual([]);
    const loss = second.events?.find((event) => event.kind === "condition-loss");
    expect(loss).toBeDefined();
    if (!loss) return;
    const undone = undoAdversaryChronicleEvent(second, CAMPAIGN_ID, loss.id);
    expect(monsterIn(undone, "monster-2").conditions).toEqual(["poisoned"]);
    const world = encounterWorldState(undone, CAMPAIGN_ID);
    expect(world).not.toBeNull();
    if (!world) return;
    expect(
      Object.values(world.occurrences).some(
        (occurrence) => occurrence.kind === "condition" && occurrence.ending === null
      )
    ).toBe(true);
  });

  it("degrades to the legacy arithmetic for a beat that predates the world layer", () => {
    // A legacy-authored beat (no engineActionId) built straight onto the doc.
    const legacy: EncounterState = {
      ...turnsEncounter(),
      combatants: turnsEncounter().combatants.map((combatant) =>
        combatant.kind === "monster" && combatant.id === "monster-1"
          ? { ...combatant, hp: { ...combatant.hp, current: 6 } }
          : combatant
      ),
      events: [
        {
          amount: 4,
          current: 6,
          id: "0",
          kind: "hp-damage",
          max: 10,
          round: 1,
          targetId: "monster-1",
        },
      ],
    };
    const undone = undoAdversaryChronicleEvent(legacy, CAMPAIGN_ID, "0");
    expect(undone).toEqual(undoHpEvent(legacy, "0"));
    expect(monsterIn(undone, "monster-1").hp.current).toBe(10);
  });
});
