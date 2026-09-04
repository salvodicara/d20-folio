import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { conformMechanic } from "@/lib/combat/mechanic";
import { monsterMechanics } from "@/lib/combat/monster-adapter";
import { initialState } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import { mustEntity } from "@/lib/combat/state";
import type { Action, FoldedState } from "@/lib/combat/types";
import type { MonsterStatBlock } from "@/data/types";
import { testEntity } from "./__helpers__/entities";
import { nextActionId, openingActions, seqFactory } from "./__helpers__/state";

const block: MonsterStatBlock = {
  id: "test-brute",
  cr: 1,
  sizes: ["Medium"],
  type: "humanoid",
  alignment: "unaligned",
  ac: 12,
  hp: { average: 20, formula: "3d8+6" },
  speeds: { walk: 30 },
  abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 10, CHA: 8 },
  actions: [
    {
      id: "club",
      kind: "attack",
      attack: "melee",
      toHit: 5,
      reachFt: 5,
      damage: [{ dice: "1d6+3", damageType: "bludgeoning" }],
    },
    {
      id: "sling",
      kind: "attack",
      attack: "ranged",
      toHit: 3,
      rangeFt: { near: 30, far: 120 },
      damage: [{ dice: "1d4", damageType: "bludgeoning" }],
    },
    {
      id: "roar",
      kind: "save",
      save: "WIS",
      dc: 12,
      damage: [{ dice: "2d6", damageType: "thunder" }],
      onSuccess: "half",
    },
    { id: "paralyzing-gaze", kind: "save", save: "CON", dc: 13, onSuccess: "none" },
    {
      // A use-time damage-type choice: no fixed `damageType` to compile a part from.
      id: "elemental-lash",
      kind: "attack",
      attack: "melee",
      toHit: 5,
      reachFt: 5,
      damage: [{ dice: "1d8", damageChoice: ["fire", "cold"] }],
    },
    {
      // A printed "Success:" outcome that lives in prose, damage clauses or not.
      id: "withering-word",
      kind: "save",
      save: "CHA",
      dc: 13,
      damage: [{ dice: "2d8", damageType: "necrotic" }],
      onSuccess: "special",
    },
    { id: "multiattack", kind: "narrative" },
  ],
  source: "SRD",
};

describe("monsterMechanics — the adapter", () => {
  it("compiles a conformant mechanic", () => {
    const mechanic = monsterMechanics(block);
    const result = conformMechanic(mechanic);
    expect(result.ok).toBe(true);
  });

  it("maps an attack entry to an attack program using its printed to-hit and damage", () => {
    const mechanic = monsterMechanics(block);
    const club = mechanic.active?.find((p) => p.id === "club");
    expect(club?.steps).toEqual([
      {
        id: "hit",
        kind: "attack",
        roll: "roll",
        bonus: 5,
        damage: [{ dice: "damage-0", type: "bludgeoning" }],
      },
    ]);
    expect(club?.targets?.eligibility).toEqual({
      relation: "adjacent",
      between: ["$self", "$target"],
      value: true,
    });
  });

  it("maps a ranged attack entry to visible eligibility, not adjacent", () => {
    const mechanic = monsterMechanics(block);
    const sling = mechanic.active?.find((p) => p.id === "sling");
    expect(sling?.targets?.eligibility).toEqual({
      relation: "visible",
      between: ["$self", "$target"],
      value: true,
    });
  });

  it("maps a save entry to save+damage with the printed DC and half-on-success", () => {
    const mechanic = monsterMechanics(block);
    const roar = mechanic.active?.find((p) => p.id === "roar");
    expect(roar?.steps).toEqual([
      {
        id: "resist",
        kind: "save",
        roll: "save",
        ability: "WIS",
        dc: 12,
        onSuccess: "half",
      },
      {
        id: "harm",
        kind: "damage",
        parts: [{ dice: "damage-0", type: "thunder" }],
        to: "$target",
      },
    ]);
  });

  it("degrades an effect-only save (no damage) to manual-table rather than a save that applies nothing", () => {
    const mechanic = monsterMechanics(block);
    const gaze = mechanic.active?.find((p) => p.id === "paralyzing-gaze");
    expect(gaze?.steps).toEqual([
      {
        id: "resolve",
        kind: "manual-table",
        label: "test-brute.actions.paralyzing-gaze",
      },
    ]);
    expect(gaze?.cost).toEqual([{ kind: "turn", claim: "action" }]);
  });

  it("degrades an attack whose damage type is a use-time choice to manual-table", () => {
    const mechanic = monsterMechanics(block);
    const lash = mechanic.active?.find((p) => p.id === "elemental-lash");
    expect(lash?.steps).toEqual([
      { id: "resolve", kind: "manual-table", label: "test-brute.actions.elemental-lash" },
    ]);
  });

  it("degrades a save with onSuccess: special to manual-table, damage clauses notwithstanding", () => {
    const mechanic = monsterMechanics(block);
    const word = mechanic.active?.find((p) => p.id === "withering-word");
    expect(word?.steps).toEqual([
      {
        id: "resolve",
        kind: "manual-table",
        label: "test-brute.actions.withering-word",
      },
    ]);
  });

  it("degrades a prose-only entry (Multiattack) to manual-table, never drops or half-builds it", () => {
    const mechanic = monsterMechanics(block);
    const multi = mechanic.active?.find((p) => p.id === "multiattack");
    expect(multi?.steps).toEqual([
      { id: "resolve", kind: "manual-table", label: "test-brute.actions.multiattack" },
    ]);
  });

  it("the prototype catalogue's hand-copied Ogre still equals the real corpus entry", async () => {
    // Dynamic on purpose: `src/data/monsters/n-p.ts` is lazy-only under the bundle budget, and
    // the per-range file is imported directly because the `index.ts` barrel pulls the private
    // pack. An import inside a test body is not an eager import, so both guards stay green.
    const { SRD_MONSTERS_N_P } = await import("@/data/monsters/n-p");
    const { ogreStatBlock } = await import("@/data/combat/prototype-catalogue");
    const real = SRD_MONSTERS_N_P.find((entry) => entry.id === "ogre");
    expect(real).toBeDefined();
    expect(ogreStatBlock).toEqual(real);
  });

  it("an adapted attack actually resolves through the reducer", () => {
    const mechanic = monsterMechanics(block);
    const { catalogue } = buildCatalogue([mechanic]);
    const seq = seqFactory("dm");
    const monster = testEntity({
      id: "brute",
      kind: "monster",
      controllerUid: "dm",
      mechanics: ["monster:test-brute"],
    });
    const hero = testEntity({ id: "hero", kind: "pc", hp: 20, ac: 10 });
    let state: FoldedState = initialState();
    for (const action of openingActions(
      "dm",
      seq,
      [monster, hero],
      { brute: 10, hero: 5 },
      ["brute", "hero"]
    )) {
      const result = resolve(state, action, catalogue);
      if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
      state = result.state;
    }
    state = { ...state, relations: [{ kind: "adjacent", a: "brute", b: "hero" }] };
    const attack: Action = {
      kind: "intent",
      id: nextActionId("m"),
      seq: seq(),
      by: "dm",
      entity: "brute",
      mechanic: "monster:test-brute",
      program: "club",
      targets: ["hero"],
      answers: { roll: 15, "damage-0": 6 }, // 15 + 5 = 20 ≥ AC 10
      payment: [],
      window: null,
      basedOn: 0,
    };
    const result = resolve(state, attack, catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.hp).toBe(14);
  });
});
