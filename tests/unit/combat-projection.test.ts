/**
 * `projectCharacter` — the sheet's own numbers and action rows become a seated `Entity`,
 * the mechanics it carries into the encounter log, and an honest automated/adjudicated
 * split (stage 6 design §2 D3/D4).
 *
 * Public SRD only, so this suite is identical in both build modes; the six live-team
 * sheets are pack-private and are pinned by the pack's own projection contract.
 */
import { describe, expect, it } from "vitest";
import { MOCK_CHARACTER } from "@/lib/mock";
import { makeCharacterDoc } from "./_helpers";
import { projectCharacter } from "@/lib/combat-projection";
import { resolveActions } from "@/lib/smart-tracker";
import { conformMechanic, type Mechanic, type Program } from "@/lib/combat/mechanic";
import { CORE_MECHANIC_IDS } from "@/data/combat/core-catalogue";
import {
  effectiveAC,
  effectiveMaxHp,
  aggregateCharacterGrants,
} from "@/lib/aggregate-character";
import { effectiveProficiencyBonus } from "@/lib/compute";
import { totalLevel } from "@/lib/classes";

const seat = { uid: "player-1", characterId: "lyra", buildRevision: 4 } as const;

function projected(): ReturnType<typeof projectCharacter> {
  return projectCharacter(MOCK_CHARACTER, seat);
}

function programOf(mechanics: readonly Mechanic[], rowId: string): Program {
  const mechanic = mechanics.find((m) => m.id === `pc:lyra:${rowId}`);
  const program = mechanic?.active?.[0];
  if (!program) throw new Error(`no program for ${rowId}`);
  return program;
}

describe("projectCharacter — the seated entity", () => {
  it("takes its identity from the seat and records the build it was taken from", () => {
    const { entity } = projected();
    expect(entity.id).toBe("lyra");
    expect(entity.kind).toBe("pc");
    expect(entity.label).toBe("character:lyra");
    expect(entity.controllerUid).toBe("player-1");
    expect(entity.controlledBy).toBeNull();
    expect(entity.origin).toEqual({
      kind: "character",
      uid: "player-1",
      characterId: "lyra",
      buildRevision: 4,
    });
  });

  it("is public at the table and starts off the map with a zeroed ledger", () => {
    const { entity } = projected();
    expect(entity.reveal).toEqual({ block: true, hp: true, token: true });
    expect(entity.position).toBeNull();
    expect(entity.concentration).toBeNull();
    expect(entity.overrides).toEqual({});
    expect(entity.turn).toEqual({
      action: 0,
      bonus: 0,
      reaction: 0,
      attacksUsed: 0,
      movementUsed: 0,
      movementExtra: 0,
      claims: [],
    });
  });
});

describe("projectCharacter — stats are the sheet's own numbers", () => {
  const aggSession = {
    activeFeatures: MOCK_CHARACTER.session.activeFeatures,
    grantBundleChoices: MOCK_CHARACTER.session.grantBundleChoices,
    itemResources: MOCK_CHARACTER.session.itemResources,
  };

  it("reads AC and max HP through the same seams the sheet does", () => {
    const { entity } = projected();
    expect(entity.stats.ac).toBe(effectiveAC(MOCK_CHARACTER.character, aggSession));
    expect(entity.stats.maxHp).toBe(effectiveMaxHp(MOCK_CHARACTER.character, aggSession));
    // Pinned so a silent drift in either seam is visible: the mock is AC 17, 62 HP.
    expect(entity.stats.ac).toBe(17);
    expect(entity.stats.maxHp).toBe(62);
  });

  it("reads the proficiency bonus from the character's total level", () => {
    const { entity } = projected();
    expect(entity.stats.proficiency).toBe(
      effectiveProficiencyBonus(
        totalLevel(MOCK_CHARACTER.character),
        MOCK_CHARACTER.character.proficiencyBonusOverride
      )
    );
    expect(entity.stats.proficiency).toBe(4);
  });

  it("carries the caster's DC and spell attack, and the ability modifiers", () => {
    const { entity } = projected();
    expect(entity.stats.spellSaveDc).toBe(17); // 8 + PB 4 + CHA 5
    expect(entity.stats.spellAttack).toBe(9); // PB 4 + CHA 5
    expect(entity.stats.abilities.CHA).toBe(5);
    expect(entity.stats.saves.CHA).toBe(9); // proficient: +5 CHA, +4 PB
    expect(entity.stats.saves.STR).toBe(-1); // not proficient
  });

  it("reports no caster numbers for a character with no spellcasting", () => {
    const { entity } = projectCharacter(makeCharacterDoc(), seat);
    expect(entity.stats.spellSaveDc).toBeNull();
    expect(entity.stats.spellAttack).toBeNull();
  });

  it("derives the defenses from the aggregate plus the build and session overlays", () => {
    const doc = makeCharacterDoc(
      { damageResistanceOverrides: { fire: true, cold: true } },
      { sessionDefenses: { resistance: ["acid"] } }
    );
    const { entity } = projectCharacter(doc, seat);
    expect(entity.stats.resistances).toEqual(["acid", "cold", "fire"]);
    // The aggregate is the same object the rail renders from.
    expect(
      aggregateCharacterGrants(doc.character, doc.session).damageResistances.size
    ).toBe(0);
  });
});

describe("projectCharacter — vitals", () => {
  it("takes HP, temp HP, death saves and exhaustion from the session", () => {
    const { entity } = projected();
    expect(entity.vitals.hp).toBe(MOCK_CHARACTER.session.hp.current);
    expect(entity.vitals.tempHp).toEqual({
      amount: MOCK_CHARACTER.session.hp.temp,
      source: null,
    });
    expect(entity.vitals.deathSaves).toEqual({
      successes: MOCK_CHARACTER.session.deathSucc,
      failures: MOCK_CHARACTER.session.deathFail,
    });
    expect(entity.vitals.life).toBe("alive");
  });

  it("derives the life state at 0 HP from the death saves", () => {
    const life = (hp: number, deathSucc: number, deathFail: number): string =>
      projectCharacter(
        makeCharacterDoc({}, { hp: { current: hp, temp: 0 }, deathSucc, deathFail }),
        seat
      ).entity.vitals.life;
    expect(life(1, 0, 0)).toBe("alive");
    expect(life(0, 0, 0)).toBe("dying");
    expect(life(0, 3, 0)).toBe("stable");
    expect(life(0, 0, 3)).toBe("dead");
  });

  it("carries no temp HP when the sheet holds none", () => {
    const { entity } = projectCharacter(makeCharacterDoc(), seat);
    expect(entity.vitals.tempHp).toBeNull();
  });
});

describe("projectCharacter — resources", () => {
  it("turns each spell-slot row into the pool the reducer spends", () => {
    const { entity } = projected();
    expect(entity.resources["slot-1"]).toEqual({
      current: 2,
      max: 4,
      recharge: "long",
    });
    expect(entity.resources["slot-5"]).toEqual({
      current: 1,
      max: 1,
      recharge: "long",
    });
  });

  it("keeps a Pact Magic pool separate from the standard slot of the same level", () => {
    const doc = makeCharacterDoc(
      {
        spellSlots: [
          { level: 1, total: 4 },
          { level: 1, total: 2, pactMagic: true },
        ],
      },
      { spellSlots: { "1": { used: 1 } } }
    );
    const { entity } = projectCharacter(doc, seat);
    expect(entity.resources["slot-1"]).toEqual({ current: 3, max: 4, recharge: "long" });
    expect(entity.resources["pact-1"]).toEqual({ current: 1, max: 2, recharge: "short" });
  });

  it("carries every tracker by its own id, with its recharge", () => {
    const { entity } = projected();
    expect(entity.resources["bard-bardic-inspiration"]).toEqual({
      current: 3,
      max: 5,
      recharge: "short",
    });
    expect(entity.resources["fighter-action-surge"]?.recharge).toBe("short");
  });
});

describe("projectCharacter — the action adapter", () => {
  it("emits one conforming mechanic per row, keyed to this character", () => {
    const { mechanics } = projected();
    for (const mechanic of mechanics) {
      expect(conformMechanic(mechanic).ok, mechanic.id).toBe(true);
      expect(mechanic.id.startsWith("pc:lyra:")).toBe(true);
      expect(mechanic.active).toHaveLength(1);
    }
  });

  it("records where each row's content came from", () => {
    const { mechanics } = projected();
    // Lyra's rows are all catalogue content.
    expect(mechanics.every((m) => m.source === "srd")).toBe(true);
    const doc = makeCharacterDoc({
      weapons: [
        {
          custom: true,
          name: "Nonna's cleaver",
          quantity: 1,
          damageDie: "1d6",
          damageType: "slashing",
          attackStat: "STR",
          properties: "",
          instanceId: "cleaver-1",
        },
      ],
    });
    const homebrew = projectCharacter(doc, seat).mechanics.filter(
      (m) => m.source === "homebrew"
    );
    expect(homebrew).toHaveLength(1);
    expect(homebrew[0]?.label).toBe("custom:Nonna's cleaver");
  });

  it("never emits an id in the `core:` namespace, and lists the core set on the entity", () => {
    const { entity, mechanics } = projected();
    expect(mechanics.filter((m) => m.id.startsWith("core:"))).toEqual([]);
    expect(entity.mechanics.slice(-CORE_MECHANIC_IDS.length)).toEqual([
      ...CORE_MECHANIC_IDS,
    ]);
    expect(entity.mechanics).toHaveLength(mechanics.length + CORE_MECHANIC_IDS.length);
  });

  it("does not project the base actions the core catalogue already gives everyone", () => {
    const { mechanics } = projected();
    const ids = new Set(mechanics.map((m) => m.id));
    for (const row of [
      "base-dash",
      "base-dodge",
      "base-disengage",
      "base-help",
      "base-hide",
    ]) {
      expect(ids.has(`pc:lyra:${row}`), row).toBe(false);
    }
    // A base action with no core mechanic still reaches the table, adjudicated.
    expect(ids.has("pc:lyra:base-ready")).toBe(true);
  });

  it("gives every weapon row the sheet's own attack bonus and typed damage", () => {
    const { mechanics } = projected();
    const rows = resolveActions(MOCK_CHARACTER, "combat").filter(
      (row) => row.source === "weapon" && row.summary.attackBonus !== undefined
    );
    expect(rows.length).toBeGreaterThan(0);
    let automated = 0;
    for (const row of rows) {
      const step = programOf(mechanics, row.id).steps[0];
      if (step?.kind !== "attack") continue;
      automated += 1;
      expect(step.bonus, row.id).toBe(row.summary.attackBonus);
      expect(step.damage, row.id).toEqual([
        { dice: "damage", type: row.summary.damageType },
      ]);
      const dice = programOf(mechanics, row.id).inputs?.find((i) => i.id === "damage");
      expect(dice, row.id).toEqual({
        id: "damage",
        kind: "dice",
        formula: row.summary.damage,
      });
    }
    expect(automated).toBe(rows.length - 1); // every row but the flat-damage Unarmed Strike
  });

  it("claims an attack of the Attack action for a weapon, the printed economy otherwise", () => {
    const { mechanics } = projected();
    expect(programOf(mechanics, "weapon-rapier").cost).toEqual([
      { kind: "turn", claim: "attack" },
    ]);
    expect(programOf(mechanics, "weapon-dagger-offhand").cost).toEqual([
      { kind: "turn", claim: "bonus" },
    ]);
    expect(programOf(mechanics, "base-opportunity-attack").cost).toEqual([
      { kind: "turn", claim: "reaction" },
    ]);
  });

  it("reaches a melee target through reach and a ranged one through sight", () => {
    const { mechanics } = projected();
    expect(programOf(mechanics, "weapon-rapier").targets?.eligibility).toEqual({
      relation: "adjacent",
      between: ["$self", "$target"],
      value: true,
    });
    expect(programOf(mechanics, "weapon-shortbow").targets?.eligibility).toEqual({
      relation: "visible",
      between: ["$self", "$target"],
      value: true,
    });
  });

  it("leaves a flat-damage attack to the table (the reducer rolls every damage part)", () => {
    const { mechanics } = projected();
    expect(programOf(mechanics, "unarmed-strike").steps[0]?.kind).toBe("manual-table");
  });

  it("turns a single-target save spell into save + damage against the caster's DC", () => {
    const program = programOf(projected().mechanics, "spell-vicious-mockery");
    expect(program.targets?.count).toBe(1);
    expect(program.steps).toEqual([
      {
        id: "resist",
        kind: "save",
        roll: "save",
        ability: "WIS",
        dc: "spell",
        onSuccess: "negate",
      },
      {
        id: "harm",
        kind: "damage",
        parts: [{ dice: "damage", type: "psychic" }],
        to: "$target",
      },
    ]);
    expect(program.inputs).toEqual([
      { id: "save", kind: "d20", for: "save", ability: "WIS", perTarget: true },
      { id: "damage", kind: "dice", formula: "2d6" },
    ]);
  });

  it("turns a typed area into the shape the reducer derives cells from", () => {
    const { mechanics } = projected();
    const thunderwave = programOf(mechanics, "spell-thunderwave");
    expect(thunderwave.targets).toEqual({
      count: "area",
      eligibility: { all: [] },
      area: { kind: "cube", origin: "origin", sizeFt: 15 },
    });
    expect(thunderwave.inputs?.[0]).toEqual({ id: "origin", kind: "position" });
    expect(thunderwave.steps[0]).toMatchObject({ kind: "save", onSuccess: "half" });
    const shatter = programOf(mechanics, "spell-shatter");
    expect(shatter.targets).toMatchObject({
      area: { kind: "sphere", origin: "origin", radiusFt: 10 },
    });
  });

  it("aims a cone or a line with a second position", () => {
    const doc = makeCharacterDoc(
      {
        spellcasting: {
          ability: "INT",
          preparedCaster: true,
          preparedMax: 4,
          saveDCOverride: null,
          attackBonusOverride: null,
        },
        classes: [{ classId: "wizard", level: 5 }],
        spellSlots: [{ level: 3, total: 2 }],
        spells: [{ srdId: "lightning-bolt", prepared: true }],
      },
      {}
    );
    const program = projectCharacter(doc, seat).mechanics.find(
      (m) => m.id === "pc:lyra:spell-lightning-bolt"
    )?.active?.[0];
    expect(program?.targets).toMatchObject({
      area: { kind: "line", origin: "origin", aim: "aim", lengthFt: 100, widthFt: 5 },
    });
    expect(program?.inputs?.slice(0, 2)).toEqual([
      { id: "origin", kind: "position" },
      { id: "aim", kind: "position" },
    ]);
  });

  it("marks a slot cost as upcastable only when the spell's damage scales", () => {
    const { mechanics } = projected();
    expect(programOf(mechanics, "spell-thunderwave").cost).toContainEqual({
      kind: "slot",
      level: 1,
      upcast: true,
    });
    expect(programOf(mechanics, "spell-hypnotic-pattern").cost).toContainEqual({
      kind: "slot",
      level: 3,
    });
  });

  it("charges concentration and a tracker where the row does", () => {
    const { mechanics } = projected();
    expect(programOf(mechanics, "spell-hypnotic-pattern").cost).toContainEqual({
      kind: "concentration",
    });
    expect(programOf(mechanics, "bard-bardic-inspiration-bonus").cost).toContainEqual({
      kind: "resource",
      id: "bard-bardic-inspiration",
      amount: 1,
    });
  });

  it("applies a flat heal, and leaves a rolled one to the table", () => {
    const doc = makeCharacterDoc({
      classes: [{ classId: "cleric", level: 11 }],
      spellcasting: {
        ability: "WIS",
        preparedCaster: true,
        preparedMax: 12,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
      spellSlots: [{ level: 6, total: 1 }],
      spells: [{ srdId: "heal", prepared: true }],
    });
    const program = projectCharacter(doc, seat).mechanics.find(
      (m) => m.id === "pc:lyra:spell-heal"
    )?.active?.[0];
    expect(program?.steps).toEqual([
      { id: "mend", kind: "heal", amount: 70, to: "$target" },
    ]);
    // Healing Word rolls 2d4+CHA: `heal.amount` is an `Expr`, which has no dice.
    expect(programOf(projected().mechanics, "spell-healing-word").steps[0]?.kind).toBe(
      "manual-table"
    );
  });

  it("adjudicates a row that also applies a condition, rather than applying half of it", () => {
    const { mechanics } = projected();
    for (const row of ["spell-sleep", "spell-fear", "base-grapple"]) {
      expect(programOf(mechanics, row).steps[0]?.kind, row).toBe("manual-table");
    }
  });

  it("labels an adjudicated row by a stable reference, never a display string", () => {
    const { mechanics } = projected();
    const sleep = programOf(mechanics, "spell-sleep").steps[0];
    expect(sleep).toEqual({
      id: "resolve",
      kind: "manual-table",
      label: "srd:spell:sleep:name",
    });
    // An engine literal has no catalogue key: its stable action id is the reference.
    expect(programOf(mechanics, "base-ready").steps[0]).toMatchObject({
      label: "action:base-ready",
    });
  });
});

describe("projectCharacter — coverage", () => {
  it("reports one row per emitted step, and nothing unsupported", () => {
    const { mechanics, coverage } = projected();
    expect(coverage.filter((row) => row.status === "unsupported")).toEqual([]);
    for (const mechanic of mechanics) {
      expect(
        coverage.some((row) => row.mechanic === mechanic.id),
        mechanic.id
      ).toBe(true);
    }
  });

  it("splits the character's actions into automated and table-adjudicated", () => {
    const { coverage } = projected();
    const steps = coverage.filter((row) => row.step !== "*");
    const adjudicated = steps.filter((row) => row.status === "table");
    expect(adjudicated.length).toBeGreaterThan(0);
    expect(steps.length).toBeGreaterThan(adjudicated.length);
  });
});
