/**
 * `projectMonster` — a typed stat block becomes a seated `Entity` plus the
 * executable definitions it carries into the log (stage 6 design §2 D2/D3).
 */
import { describe, expect, it } from "vitest";
import type { MonsterStatBlock } from "@/data/types";
import { conformMechanic } from "@/lib/combat/mechanic";
import { projectMonster } from "@/lib/combat/monster-entity";
import { CORE_MECHANIC_IDS } from "@/data/combat/core-catalogue";
import { ogreStatBlock } from "@/data/combat/prototype-catalogue";

const seat = { id: "monster-3", label: "monster:ogre", controllerUid: "dm" } as const;

/** A goblin-shaped block exercising what the ogre does not: save proficiencies,
 *  a deviating save override, typed defenses and a condition immunity. */
const goblin: MonsterStatBlock = {
  id: "goblin-warrior",
  cr: 0.5,
  sizes: ["Small"],
  type: "fey",
  alignment: "chaotic-neutral",
  ac: 15,
  hp: { average: 7, formula: "2d6" },
  speeds: { walk: 30, climb: 20 },
  abilityScores: { STR: 8, DEX: 15, CON: 10, INT: 10, WIS: 8, CHA: 8 },
  saveProficiencies: ["DEX"],
  saveOverrides: { WIS: 3 },
  damageResistances: ["fire"],
  damageImmunities: ["poison"],
  damageVulnerabilities: ["radiant"],
  conditionImmunities: ["charmed", { id: "frightened", note: "with-mind-blank" }],
  actions: [
    {
      id: "scimitar",
      kind: "attack",
      attack: "melee",
      toHit: 4,
      reachFt: 5,
      damage: [{ dice: "1d6+2", damageType: "slashing" }],
    },
    { id: "nimble-escape", kind: "narrative" },
  ],
  source: "SRD",
};

describe("projectMonster — derived stats", () => {
  it("reads AC, average HP and the walking speed straight from the block", () => {
    const { entity } = projectMonster(ogreStatBlock, seat);
    expect(entity.stats.ac).toBe(11);
    expect(entity.stats.maxHp).toBe(68);
    expect(entity.stats.speed).toBe(40);
    expect(entity.vitals.hp).toBe(68);
  });

  it("derives the proficiency bonus from CR", () => {
    expect(projectMonster(ogreStatBlock, seat).entity.stats.proficiency).toBe(2);
    expect(projectMonster(goblin, seat).entity.stats.proficiency).toBe(2);
    expect(
      projectMonster({ ...ogreStatBlock, cr: 9 }, seat).entity.stats.proficiency
    ).toBe(4);
  });

  it("derives ability modifiers from the printed scores", () => {
    const { entity } = projectMonster(ogreStatBlock, seat);
    expect(entity.stats.abilities).toEqual({
      STR: 4,
      DEX: -1,
      CON: 3,
      INT: -3,
      WIS: -2,
      CHA: -2,
    });
  });

  it("adds the proficiency bonus to proficient saves; an override wins", () => {
    const { entity } = projectMonster(goblin, seat);
    expect(entity.stats.saves.DEX).toBe(4); // +2 mod, proficient, PB 2
    expect(entity.stats.saves.STR).toBe(-1); // not proficient
    expect(entity.stats.saves.WIS).toBe(3); // printed override beats -1
  });

  it("carries the typed defenses", () => {
    const { entity } = projectMonster(goblin, seat);
    expect(entity.stats.resistances).toEqual(["fire"]);
    expect(entity.stats.immunities).toEqual(["poison"]);
    expect(entity.stats.vulnerabilities).toEqual(["radiant"]);
    expect(entity.stats.conditionImmunities).toEqual(["charmed", "frightened"]);
  });

  it("has one attack per Attack action until Multiattack is structured", () => {
    expect(projectMonster(ogreStatBlock, seat).entity.stats.attacksPerAction).toBe(1);
  });

  it("reports no spell numbers for a block that prints none", () => {
    const { entity } = projectMonster(ogreStatBlock, seat);
    expect(entity.stats.spellSaveDc).toBeNull();
    expect(entity.stats.spellAttack).toBeNull();
  });

  it("reads the spell numbers a Spellcasting entry prints", () => {
    const caster: MonsterStatBlock = {
      ...ogreStatBlock,
      actions: [
        ...ogreStatBlock.actions,
        { id: "spellcasting", kind: "spellcasting", ability: "CHA", dc: 15, toHit: 7 },
      ],
    };
    const { entity } = projectMonster(caster, seat);
    expect(entity.stats.spellSaveDc).toBe(15);
    expect(entity.stats.spellAttack).toBe(7);
  });
});

describe("projectMonster — the seated entity", () => {
  it("takes its identity from the seat and its origin from the block", () => {
    const { entity } = projectMonster(ogreStatBlock, seat);
    expect(entity.id).toBe("monster-3");
    expect(entity.kind).toBe("monster");
    expect(entity.label).toBe("monster:ogre");
    expect(entity.controllerUid).toBe("dm");
    expect(entity.controlledBy).toBeNull();
    expect(entity.origin).toEqual({ kind: "monster", srdId: "ogre" });
  });

  it("shows the token but hides the block and the HP, and takes no square", () => {
    const { entity } = projectMonster(ogreStatBlock, seat);
    expect(entity.reveal).toEqual({ block: false, hp: false, token: true });
    expect(entity.position).toBeNull();
  });

  it("starts with a zeroed turn ledger and an untouched life", () => {
    const { entity } = projectMonster(ogreStatBlock, seat);
    expect(entity.turn).toEqual({
      action: 0,
      bonus: 0,
      reaction: 0,
      attacksUsed: 0,
      movementUsed: 0,
      movementExtra: 0,
      claims: [],
    });
    expect(entity.vitals).toEqual({
      hp: 68,
      tempHp: null,
      deathSaves: { successes: 0, failures: 0 },
      life: "alive",
      exhaustion: 0,
    });
    expect(entity.concentration).toBeNull();
    expect(entity.overrides).toEqual({});
    expect(entity.resources).toEqual({});
  });
});

describe("projectMonster — the mechanics it carries", () => {
  it("re-keys every action to this seat and adds the core set", () => {
    const { entity, mechanics } = projectMonster(ogreStatBlock, seat);
    expect(mechanics.map((m) => m.id)).toEqual([
      "monster:monster-3:greatclub",
      "monster:monster-3:javelin",
    ]);
    expect(entity.mechanics).toEqual([
      "monster:monster-3:greatclub",
      "monster:monster-3:javelin",
      ...CORE_MECHANIC_IDS,
    ]);
  });

  it("never emits an id in the `core:` namespace", () => {
    const { mechanics } = projectMonster(goblin, seat);
    expect(mechanics.filter((m) => m.id.startsWith("core:"))).toEqual([]);
  });

  it("keeps two seats of the same block apart", () => {
    const a = projectMonster(goblin, { ...seat, id: "monster-1" });
    const b = projectMonster(goblin, { ...seat, id: "monster-2" });
    expect(a.mechanics[0]?.id).toBe("monster:monster-1:scimitar");
    expect(b.mechanics[0]?.id).toBe("monster:monster-2:scimitar");
  });

  it("emits one conforming mechanic per action, labelled by its catalogue key", () => {
    const { mechanics } = projectMonster(goblin, seat);
    expect(mechanics).toHaveLength(2);
    for (const mechanic of mechanics) {
      expect(conformMechanic(mechanic).ok, mechanic.id).toBe(true);
      expect(mechanic.source).toBe("monster");
      expect(mechanic.active).toHaveLength(1);
    }
    expect(mechanics[1]?.label).toBe("goblin-warrior.actions.nimble-escape");
  });

  it("preserves the adapter's programs verbatim", () => {
    const { mechanics } = projectMonster(goblin, seat);
    expect(mechanics[0]?.active?.[0]).toMatchObject({
      id: "scimitar",
      trigger: { kind: "invocation", economy: "action" },
      steps: [
        {
          id: "hit",
          kind: "attack",
          bonus: 4,
          damage: [{ dice: "damage-0", type: "slashing" }],
        },
      ],
    });
    // A prose-only entry stays adjudicated, never half-built.
    expect(mechanics[1]?.active?.[0]?.steps[0]).toEqual({
      id: "resolve",
      kind: "manual-table",
      label: "goblin-warrior.actions.nimble-escape",
    });
  });
});
