/**
 * reconcileBuildChoices — Bio-tab build edits keep the WHOLE sheet consistent.
 *
 * Owner (2026-06-08): "make sure the changes in the bio tab (all of them) are
 * correctly recomputed by the engine. Check edge cases: e.g. if you change class
 * then subclass gets invalidated etc." These tests pin every cascade: class /
 * subclass / level / race changes re-derive the fixed fields and drop the picks
 * the new build can't have, while a manual override survives an unrelated edit.
 */
import { describe, it, expect } from "vitest";
import { asRaceId } from "@/data/srd-names";
import type { CharacterData, SessionState, SrdSpellRef } from "@/types/character";
import {
  reconcileBuildChoices,
  reconcileSessionAfterBuild,
  fightingStyleEntitlement,
} from "@/lib/reconcile-build";
import { fightingStyleOptions } from "@/lib/views/level-up-view";
import { buildScenario, DEV_SCENARIOS, type ScenarioSpec } from "@/lib/dev-scenarios";
import { MOCK_CHARACTER } from "@/lib/mock";
import { classTableIndex } from "@/data/classes";
import { primaryClassEntry, totalLevel } from "@/lib/classes";
import { invocationsKnownAt } from "@/lib/invocation-pick";
import { metamagicKnownAt } from "@/lib/metamagic-pick";
import { weaponMasteryCountForClass } from "@/lib/weapon-mastery-pick";
import { inferHpMax } from "@/lib/character-infer";
import { getExpandedSpellsThroughLevel } from "@/lib/expanded-spells";
import { conc } from "./__helpers__/concentration";

/** Apply a level change to the primary class entry (R4 — level lives on the entry). */
function withLevel(c: CharacterData, level: number): CharacterData {
  const classes = c.classes.map((e, i) => (i === 0 ? { ...e, level } : e));
  return reconcileBuildChoices(c, { ...c, classes });
}

/** Set a pick on the primary class entry of a character (R4 — picks live on entries). */
function withPick(
  c: CharacterData,
  key: "maneuverChoices" | "invocationChoices" | "metamagicChoices" | "weaponMasteries",
  ids: string[]
): CharacterData {
  const classes = c.classes.map((e, i) => (i === 0 ? { ...e, [key]: ids } : e));
  return { ...c, classes };
}

/** Read a pick off the primary class entry. */
function pickOf(
  c: CharacterData,
  key: "maneuverChoices" | "invocationChoices" | "metamagicChoices" | "weaponMasteries"
): string[] {
  return primaryClassEntry(c)[key] ?? [];
}

function spec(key: string): ScenarioSpec {
  const s = DEV_SCENARIOS[key];
  if (!s) throw new Error(`scenario ${key} missing`);
  return s;
}

function scenario(key: string): CharacterData {
  return buildScenario(spec(key)).character;
}

function build(s: ScenarioSpec): CharacterData {
  return buildScenario(s).character;
}

/** Apply a class change the way `BioTab.SrdClassSelect.onChange` does (R4 — edits the
 *  primary `classes[]` entry's classId + clears the now-invalid subclass). */
function changeClass(prev: CharacterData, classId: string): CharacterData {
  const level = primaryClassEntry(prev).level;
  return reconcileBuildChoices(prev, { ...prev, classes: [{ classId, level }] });
}

function featureIds(c: CharacterData): string[] {
  return c.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []));
}

describe("reconcileBuildChoices — CLASS change re-derives the fixed fields", () => {
  it("re-derives saving throws + hit die for the new class", () => {
    const cleric = scenario("life-cleric"); // WIS/CHA saves, d8
    const wiz = changeClass(cleric, "wizard"); // INT/WIS saves, d6
    expect(wiz.savingThrows).toEqual(classTableIndex.get("wizard")?.savingThrows);
    expect(wiz.hitDieType).toBe(6);
  });

  it("swaps the class/subclass feature set (old class features gone, new in)", () => {
    const cleric = scenario("life-cleric");
    const before = featureIds(cleric);
    const wiz = changeClass(cleric, "wizard");
    const after = featureIds(wiz);
    // A cleric channel-divinity feature is gone; a wizard feature is present.
    expect(before.some((id) => id.startsWith("cleric-"))).toBe(true);
    expect(after.some((id) => id.startsWith("cleric-"))).toBe(false);
    expect(after.some((id) => id.startsWith("wizard-"))).toBe(true);
  });

  it("re-derives the spellcasting ability (WIS cleric → INT wizard)", () => {
    const cleric = scenario("life-cleric");
    expect(cleric.spellcasting?.ability).toBe("WIS");
    const wiz = changeClass(cleric, "wizard");
    expect(wiz.spellcasting?.ability).toBe("INT");
  });

  it("clears the chosen spell list (it belonged to the old class)", () => {
    const cleric = build({ ...spec("life-cleric"), spells: [{ srdId: "guidance" }] });
    expect(cleric.spells.length).toBeGreaterThan(0);
    const wiz = changeClass(cleric, "wizard");
    expect(wiz.spells).toEqual([]);
  });

  it("caster → non-caster nulls spellcasting + empties spell slots", () => {
    const wiz = scenario("evoker-wizard");
    expect(wiz.spellcasting).not.toBeNull();
    const fighter = changeClass(wiz, "fighter");
    expect(fighter.spellcasting).toBeNull();
    expect(fighter.spellSlots).toEqual([]);
  });

  it("non-caster → caster derives the spell slots", () => {
    const fighter = scenario("champion"); // Fighter 10, non-caster
    const cleric = changeClass(fighter, "cleric");
    expect(cleric.spellSlots.length).toBeGreaterThan(0);
    expect(cleric.spellcasting?.ability).toBe("WIS");
  });
});

describe("reconcileBuildChoices — capability-scoped picks reset", () => {
  // (The maneuver reset pins — a pack subclass capability —
  // live in `content-pack/tests/unit/reconcile-build.pack.test.ts`.)

  it("clears Warlock invocations on a class change", () => {
    const lock = build({
      name: "W",
      raceId: "human",
      classId: "warlock",
      subclassId: "fiend-patron",
      level: 5,
      background: "acolyte",
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 16 },
    });
    const withInv = withPick(lock, "invocationChoices", ["agonizing-blast"]);
    const wiz = changeClass(withInv, "wizard");
    expect(pickOf(wiz, "invocationChoices")).toEqual([]);
  });

  it("clears Sorcerer metamagic on a class change", () => {
    const sorc = build({
      name: "S",
      raceId: "human",
      classId: "sorcerer",
      level: 5,
      background: "sage",
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 16 },
    });
    const withMeta = withPick(sorc, "metamagicChoices", ["quickened-spell"]);
    const cleric = changeClass(withMeta, "cleric");
    expect(pickOf(cleric, "metamagicChoices")).toEqual([]);
  });

  it("KEEPS the picks when the build still supports them (no spurious reset)", () => {
    const sorc = build({
      name: "S",
      raceId: "human",
      classId: "sorcerer",
      level: 5,
      background: "sage",
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 16 },
    });
    const withMeta = withPick(sorc, "metamagicChoices", ["quickened-spell"]);
    // A no-op reconcile (same build) must not wipe a still-valid pick.
    const same = reconcileBuildChoices(withMeta, { ...withMeta });
    expect(pickOf(same, "metamagicChoices")).toEqual(["quickened-spell"]);
  });
});

describe("reconcileBuildChoices — LEVEL change re-derives, preserves overrides", () => {
  it("adds higher-level features and grows spell slots on level up", () => {
    const cleric = scenario("life-cleric"); // L5
    const before = cleric.features.length;
    const beforeTopSlot = Math.max(...cleric.spellSlots.map((s) => s.level));
    const up = withLevel(cleric, 7);
    expect(up.features.length).toBeGreaterThan(before);
    expect(Math.max(...up.spellSlots.map((s) => s.level))).toBeGreaterThanOrEqual(
      beforeTopSlot
    );
  });

  it("removes features above the new level on level down", () => {
    const cleric = scenario("life-cleric"); // L5
    const down = withLevel(cleric, 1);
    expect(down.features.length).toBeLessThan(cleric.features.length);
  });

  it("does NOT reset manual save toggles on a level change (no class change)", () => {
    const cleric = scenario("life-cleric");
    const withSaveOverride: CharacterData = {
      ...cleric,
      savingThrows: [...cleric.savingThrows, "DEX"], // a manual extra proficiency
    };
    const up = withLevel(withSaveOverride, 6);
    expect(up.savingThrows).toContain("DEX");
  });

  it("preserves a spellcasting save-DC override across a level change, resets it on class change", () => {
    const cleric = scenario("life-cleric");
    const withDc: CharacterData = {
      ...cleric,
      spellcasting: cleric.spellcasting
        ? { ...cleric.spellcasting, saveDCOverride: 20 }
        : null,
    };
    const up = withLevel(withDc, 6);
    expect(up.spellcasting?.saveDCOverride).toBe(20);
    const wiz = changeClass(withDc, "wizard");
    expect(wiz.spellcasting?.saveDCOverride).toBeNull();
  });
});

describe("reconcileBuildChoices — preserves chosen feats + custom; race Speed", () => {
  it("keeps a chosen (general) feat and a custom feature across a class change", () => {
    // A GENERAL-category feat (Actor) — picked via an ASI, not build-granted. (An
    // ORIGIN feat like Tough is correctly dropped by syncOriginFeats when the
    // background doesn't grant it, which is why this uses a general feat.)
    const cleric = scenario("life-cleric");
    const withExtras: CharacterData = {
      ...cleric,
      features: [
        ...cleric.features,
        { srdId: "actor" },
        { custom: true, name: "Heirloom", description: "A boon." },
      ] as CharacterData["features"],
    };
    const wiz = changeClass(withExtras, "wizard");
    expect(featureIds(wiz)).toContain("actor");
    expect(wiz.features.some((f) => "custom" in f)).toBe(true);
  });

  it("re-derives Speed on a species change", () => {
    const cleric = scenario("life-cleric"); // Human, 30
    const dwarf = reconcileBuildChoices(cleric, { ...cleric, race: asRaceId("dwarf") });
    // Dwarves still walk 30 ft in 2024, but the value is re-derived from the species.
    expect(dwarf.speed).toBe("30");
  });

  it("keeps choices-only skills across a class change (JoaT is derived, #57)", () => {
    // Stored `skills` is CHOICES-ONLY — JoaT half-proficiency is DERIVED at
    // render (#57), never baked — so the mock Bard carries NO halfProficiency.
    const bard = MOCK_CHARACTER.character;
    expect(Object.values(bard.skills)).not.toContain("halfProficiency");
    const fighter = changeClass(bard, "fighter");
    // No baked half ever existed, so none lingers; the explicit picks survive.
    expect(Object.values(fighter.skills)).not.toContain("halfProficiency");
    expect(Object.values(fighter.skills)).toContain("expertise");
  });

  it("defensively STRIPS a stray baked half-proficiency on a build change", () => {
    // A not-yet-migrated doc may still carry a baked half. A scope change strips
    // it (the derived half is re-supplied at render), keeping real picks.
    const bard = MOCK_CHARACTER.character;
    const withStrayHalf = {
      ...bard,
      skills: { ...bard.skills, nature: "halfProficiency" as const },
    };
    const fighter = changeClass(withStrayHalf, "fighter");
    expect(fighter.skills.nature).toBeUndefined();
    expect(Object.values(fighter.skills)).toContain("expertise");
  });

  it("is idempotent — reconciling an already-reconciled build changes nothing", () => {
    // First reconcile fills the build-implied gaps the scenario fixture omits
    // (e.g. the background's Origin feat); a SECOND reconcile is then a no-op.
    const cleric = scenario("life-cleric");
    const r1 = reconcileBuildChoices(cleric, { ...cleric });
    const r2 = reconcileBuildChoices(r1, { ...r1 });
    expect(r2.savingThrows).toEqual(r1.savingThrows);
    expect(featureIds(r2).sort()).toEqual(featureIds(r1).sort());
    expect(r2.spellSlots).toEqual(r1.spellSlots);
    expect(r2.spellcasting?.ability).toBe(r1.spellcasting?.ability);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL DOWN — the owner's 2026-06-12 mandate: "huge bugs when you decrease the
// level from the bio tab — some things stay in a weird state". Every choice
// recorded ABOVE the new level is STALE and must be pruned/reset with its
// downstream effects; every derived value must recompute at the new level.
// Table-driven per artifact family; expectations derive from the SAME
// entitlement functions the pickers use (single source of truth).
// ─────────────────────────────────────────────────────────────────────────────

/** Non-custom spell srd ids of a character. */
function spellIds(c: CharacterData): string[] {
  return c.spells.flatMap((s) => ("custom" in s ? [] : [s.srdId]));
}

/** A non-custom spell ref by id (throws if absent — test fixture guard). */
function spellRef(c: CharacterData, id: string): SrdSpellRef {
  const ref = c.spells.find((s) => !("custom" in s) && s.srdId === id);
  if (!ref || "custom" in ref) throw new Error(`spell ${id} missing`);
  return ref;
}

describe("reconcileBuildChoices — LEVEL DOWN clears the subclass below its gain level", () => {
  // (The maneuver-subclass variant — with the subclass-scoped maneuver picks
  // falling with the subclass — lives in
  // `content-pack/tests/unit/reconcile-build.pack.test.ts`.)
  it("clears the subclass (and its features) below subclassLevel", () => {
    const champ = scenario("champion"); // Fighter 10, Champion (gained at 3)
    const down = withLevel(champ, 2);
    expect(primaryClassEntry(down).subclassId).toBeUndefined();
    // The subclass features are gone from features[].
    const champFeatureIds = classTableIndex
      .get("fighter")
      ?.subclasses.find((s) => s.id === "champion")?.featureIds;
    expect(champFeatureIds?.length).toBeGreaterThan(0);
    for (const id of champFeatureIds ?? []) {
      expect(featureIds(down)).not.toContain(id);
    }
  });

  it("KEEPS the subclass at/above its gain level", () => {
    const champ = scenario("champion");
    const down = withLevel(champ, 3);
    expect(primaryClassEntry(down).subclassId).toBe("champion");
  });
});

describe("reconcileBuildChoices — LEVEL DOWN clamps per-level pick entitlements", () => {
  // (The maneuver clamp — a pack subclass capability — lives in
  // `content-pack/tests/unit/reconcile-build.pack.test.ts`.)

  it("clamps Warlock invocations AND drops ones whose level prerequisite is no longer met", () => {
    const lock = build({
      name: "W",
      raceId: "human",
      classId: "warlock",
      subclassId: "fiend-patron",
      level: 5,
      background: "acolyte",
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 16 },
    }); // Warlock 5
    const withInv = withPick(lock, "invocationChoices", [
      "agonizing-blast",
      "ascendant-step", // "Level 5+ Warlock"
      "armor-of-shadows",
    ]);
    const down = withLevel(withInv, 2);
    const kept = pickOf(down, "invocationChoices");
    expect(kept).not.toContain("ascendant-step"); // prereq Level 5+ — invalid at 2
    expect(kept.length).toBeLessThanOrEqual(invocationsKnownAt(2));
    expect(kept).toContain("agonizing-blast"); // earliest picks survive
  });

  it("clamps Sorcerer metamagic to the new level's known total", () => {
    const sorc10 = build({ ...spec("font-sorcerer"), level: 10 });
    const picks = ["careful-spell", "quickened-spell", "subtle-spell", "twinned-spell"];
    expect(picks.length).toBe(metamagicKnownAt(10)); // fixture sanity
    const withMeta = withPick(sorc10, "metamagicChoices", picks);
    const down = withLevel(withMeta, 3);
    expect(pickOf(down, "metamagicChoices")).toEqual(picks.slice(0, metamagicKnownAt(3)));
  });

  it("clamps weapon masteries to the new level's count", () => {
    const champ = scenario("champion"); // Fighter 10
    const count10 = weaponMasteryCountForClass("fighter", 10);
    const picks = [
      "longsword",
      "greataxe",
      "shortsword",
      "dagger",
      "maul",
      "spear",
    ].slice(0, count10);
    const withWm = withPick(champ, "weaponMasteries", picks);
    const down = withLevel(withWm, 1);
    expect(pickOf(down, "weaponMasteries")).toEqual(
      picks.slice(0, weaponMasteryCountForClass("fighter", 1))
    );
  });
});

// ── Champion "Additional Fighting Style" (2024 fighter:champion, L7) ───────────
// The Champion grants a SECOND Fighting Style at level 7 via the SUBCLASS feature
// `fighter-champion-additional-fighting-style` — NOT a base-class table row. The
// entitlement must therefore count the subclass placeholder off the stable
// `subclassId` (rule 7) or the 2nd style is unreachable (never offered) and a
// level edit would wrongly clamp it away. fail-before: pre-fix `fightingStyleEntitlement`
// only walked the base table → a Champion L7 was owed 1 (the base L1 style) not 2.
describe("reconcileBuildChoices — Champion gets a 2nd Fighting Style at L7", () => {
  const championAt = (level: number): CharacterData =>
    build({ ...spec("champion"), level });

  it("a Champion is OWED two fighting-style slots at L7, one at L6 (sub-L7)", () => {
    expect(fightingStyleEntitlement(primaryClassEntry(championAt(7)))).toBe(2);
    expect(fightingStyleEntitlement(primaryClassEntry(championAt(6)))).toBe(1);
  });

  it("a non-Champion Fighter is owed only the base style at L7 (not the 2nd)", () => {
    // A subclass-less Fighter; the maneuver-subclass variant is pinned in
    // `content-pack/tests/unit/reconcile-build.pack.test.ts`.
    const plain7 = build({
      name: "F",
      raceId: "human",
      classId: "fighter",
      level: 7,
      background: "soldier",
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 8 },
    });
    expect(fightingStyleEntitlement(primaryClassEntry(plain7))).toBe(1);
  });

  it("level-down L7→L6 drops the SECOND style feat but keeps the base one", () => {
    const champ7 = championAt(7);
    // Two distinct styles chosen — both stored as fighting-style FEAT refs.
    const withStyles: CharacterData = {
      ...champ7,
      features: [...champ7.features, { srdId: "archery" }, { srdId: "defense" }],
    };
    const down = withLevel(withStyles, 6);
    const fsFeats = featureIds(down).filter((id) => ["archery", "defense"].includes(id));
    expect(fsFeats).toHaveLength(1); // shrink-bounded: the latest (2nd) is dropped
    expect(fsFeats).toContain("archery"); // the base style survives
  });

  it("the 2nd-style picker EXCLUDES an already-chosen style (distinct, RAW)", () => {
    const champ7 = championAt(7);
    const withFirst: CharacterData = {
      ...champ7,
      features: [...champ7.features, { srdId: "archery" }],
    };
    const offered = fightingStyleOptions(withFirst.features, "taken", "en");
    expect(offered.find((o) => o.id === "archery")?.disabled).toBe(true);
    expect(offered.some((o) => o.id === "defense" && !o.disabled)).toBe(true);
  });
});

// (The "LEVEL DOWN removes ASI-level feats beyond entitlement" pins live in
// `content-pack/tests/unit/reconcile-build.pack.test.ts`: the demonstrators
// are pack feats — Actor / Fey-Touched with its freeCastSource spell — and the
// public composition ships only one general feat, too few to exercise the
// drop-the-LAST ordering.)

describe("reconcileBuildChoices — LEVEL DOWN demotes excess Expertise picks", () => {
  it("demotes the last expertise picks to proficient when grants shrink (Bard 10 → 2 → 1)", () => {
    const bard = build({ ...spec("lore-bard-10") });
    // Bard expertise grants: L2 (×2 picks) + L9 (×2 picks) = 4 at L10.
    const skilled: CharacterData = {
      ...bard,
      skills: {
        acrobatics: "expertise",
        athletics: "expertise",
        history: "expertise",
        insight: "expertise",
      },
    };
    const down2 = withLevel(skilled, 2); // one grant → 2 picks
    const expertiseAt2 = Object.entries(down2.skills).filter(
      ([, v]) => v === "expertise"
    );
    expect(expertiseAt2.map(([k]) => k)).toEqual(["acrobatics", "athletics"]);
    // Demoted picks stay proficient (the underlying proficiency was real).
    expect(down2.skills.history).toBe("proficient");
    expect(down2.skills.insight).toBe("proficient");

    const down1 = withLevel(skilled, 1); // Bard L1 — no expertise grant yet
    expect(Object.values(down1.skills)).not.toContain("expertise");
  });
});

describe("reconcileBuildChoices — LEVEL DOWN prunes the spell list", () => {
  it("removes spells above the new max castable slot level", () => {
    const wiz = scenario("evoker-wizard"); // L10: fire-bolt, fireball(3), magic-missile(1)
    const down = withLevel(wiz, 1);
    expect(spellIds(down)).not.toContain("fireball");
    expect(spellIds(down)).toContain("magic-missile");
    expect(spellIds(down)).toContain("fire-bolt");
  });

  it("removes subclass always-prepared spells granted above the new level (keeps the rest)", () => {
    const cleric = scenario("life-cleric"); // Life Domain, L5
    const through5 = getExpandedSpellsThroughLevel("cleric", "life-domain", 5);
    const through3 = getExpandedSpellsThroughLevel("cleric", "life-domain", 3);
    expect(through5.length).toBeGreaterThan(through3.length); // fixture sanity
    const withDomain: CharacterData = {
      ...cleric,
      spells: [
        ...cleric.spells,
        ...through5
          .filter((id) => !spellIds(cleric).includes(id))
          .map((id) => ({ srdId: id, prepared: true, alwaysPrepared: true })),
      ],
    };
    const down = withLevel(withDomain, 3);
    for (const id of through5.filter((id) => !through3.includes(id))) {
      expect(spellIds(down)).not.toContain(id);
    }
    for (const id of through3) {
      expect(spellIds(down)).toContain(id);
    }
  });

  it("removes off-list Magical Secrets picks when the widening is lost (Bard 10 → 9)", () => {
    const bard = build({
      ...spec("lore-bard-10"),
      spells: [
        ...(spec("lore-bard-10").spells ?? []),
        { srdId: "guiding-bolt", prepared: true }, // cleric-only — a Magical Secrets pick
      ],
    });
    const down = withLevel(bard, 9);
    expect(spellIds(down)).not.toContain("guiding-bolt");
    expect(spellIds(down)).toContain("healing-word"); // on the Bard list — stays
  });

  it("KEEPS an off-list pick while the widening grant still applies (Bard 11 → 10)", () => {
    const bard11 = build({
      ...spec("lore-bard-10"),
      level: 11,
      spells: [
        ...(spec("lore-bard-10").spells ?? []),
        { srdId: "guiding-bolt", prepared: true },
      ],
    });
    const down = withLevel(bard11, 10);
    expect(spellIds(down)).toContain("guiding-bolt");
  });

  it("clamps plain cantrips to the new level's budget (drops the LAST)", () => {
    const bardTable = classTableIndex.get("bard");
    const budget1 = bardTable?.levels.find((l) => l.level === 1)?.cantripsKnown ?? 0;
    expect(budget1).toBeGreaterThan(0);
    const bard = build({
      ...spec("lore-bard-10"),
      spells: [
        { srdId: "vicious-mockery" },
        { srdId: "minor-illusion" },
        { srdId: "mage-hand" },
        { srdId: "light" },
        { srdId: "healing-word", prepared: true },
      ],
    });
    const down = withLevel(bard, 1);
    const cantripsKept = spellIds(down).filter((id) =>
      ["vicious-mockery", "minor-illusion", "mage-hand", "light"].includes(id)
    );
    expect(cantripsKept).toEqual(
      ["vicious-mockery", "minor-illusion", "mage-hand", "light"].slice(0, budget1)
    );
  });

  it("unprepares (but keeps) excess prepared spells beyond the new preparedMax", () => {
    const clericTable = classTableIndex.get("cleric");
    const preparedMax1 = clericTable?.levels.find((l) => l.level === 1)?.spellsKnown ?? 0;
    const sixPrepared = [
      "bless",
      "cure-wounds",
      "healing-word",
      "guiding-bolt",
      "sanctuary",
      "shield-of-faith",
    ];
    expect(sixPrepared.length).toBeGreaterThan(preparedMax1); // fixture sanity
    const cleric = build({
      ...spec("life-cleric"),
      spells: sixPrepared.map((id) => ({ srdId: id, prepared: true })),
    });
    const down = withLevel(cleric, 1);
    const stillPrepared = down.spells.filter(
      (s) => !("custom" in s) && s.prepared && !s.alwaysPrepared
    );
    expect(stillPrepared.length).toBeLessThanOrEqual(preparedMax1);
    // Excess spells are unprepared, NOT deleted (they're all castable L1 spells).
    for (const id of sixPrepared) expect(spellIds(down)).toContain(id);
  });

  it("strips Wizard Spell Mastery / Signature Spell flags below their gain levels", () => {
    const wiz = build({
      ...spec("wizard-18"),
      spells: [
        { srdId: "fire-bolt" },
        { srdId: "shield", prepared: true, wizardSpellMastery: true },
        { srdId: "fireball", prepared: true },
      ],
    });
    const down = withLevel(wiz, 17);
    expect(spellRef(down, "shield").wizardSpellMastery).toBeUndefined();
  });
});

describe("reconcileBuildChoices — LEVEL change re-derives slots through the ONE slot seam", () => {
  it("preserves the Warlock pactMagic flag on a level edit", () => {
    const lock = build({
      name: "W",
      raceId: "human",
      classId: "warlock",
      subclassId: "fiend-patron",
      level: 5,
      background: "acolyte",
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 16 },
    }); // L5
    expect(lock.spellSlots.every((s) => s.pactMagic)).toBe(true);
    const down = withLevel(lock, 4);
    expect(down.spellSlots.length).toBeGreaterThan(0);
    expect(down.spellSlots.every((s) => s.pactMagic)).toBe(true);
    expect(Math.max(...down.spellSlots.map((s) => s.level))).toBe(2); // pact slot level at 4
  });

  // (The Eldritch Knight slot-loss pin — a pack subclass — lives in
  // `content-pack/tests/unit/reconcile-build.pack.test.ts`.)
});

describe("reconcileBuildChoices — LEVEL change adjusts max HP by the inferred delta", () => {
  it("level down subtracts the removed levels' average HP (auto build → exact re-infer)", () => {
    const cleric = scenario("life-cleric"); // built at the inferred average
    expect(cleric.hp.max).toBe(inferHpMax(cleric.classes, cleric.abilityScores.CON));
    const down = withLevel(cleric, 2);
    const downClasses = down.classes;
    expect(down.hp.max).toBe(inferHpMax(downClasses, down.abilityScores.CON));
  });

  it("preserves a manual HP deviation (rolled HP) across the level change", () => {
    const cleric = scenario("life-cleric");
    const rolled: CharacterData = { ...cleric, hp: { max: cleric.hp.max + 5 } };
    const down = withLevel(rolled, 2);
    expect(down.hp.max).toBe(inferHpMax(down.classes, down.abilityScores.CON) + 5);
  });

  it("round-trips: down then back up restores the original max", () => {
    const cleric = scenario("life-cleric");
    const down = withLevel(cleric, 2);
    const backUp = withLevel(down, 5);
    expect(backUp.hp.max).toBe(cleric.hp.max);
  });
});

describe("reconcileBuildChoices — LEVEL DOWN housekeeping", () => {
  it("clears the level-up checklist on a level decrease (it described the OLD levels)", () => {
    const cleric: CharacterData = {
      ...scenario("life-cleric"),
      levelUpChecklist: [{ text: "Pick L5 spells", done: false }],
    };
    const down = withLevel(cleric, 2);
    expect(down.levelUpChecklist).toBeNull();
    const up = withLevel(cleric, 7);
    expect(up.levelUpChecklist).toEqual(cleric.levelUpChecklist); // untouched on the way up
  });

  it("multiclass: a PER-CLASS decrease clears only THAT entry's subclass + recomputes shared slots", () => {
    const multi = scenario("wizard-cleric-multiclass"); // Wizard 5 (evoker) / Cleric 3 (life)
    const classes = multi.classes.map((e, i) =>
      i === 0 ? { ...e, level: 2 } : { ...e }
    );
    const down = reconcileBuildChoices(multi, { ...multi, classes });
    const wiz = down.classes.find((e) => e.classId === "wizard");
    const cle = down.classes.find((e) => e.classId === "cleric");
    expect(wiz?.subclassId).toBeUndefined(); // Wizard 2 < subclass level 3
    expect(cle?.subclassId).toBe("life-domain"); // Cleric 3 untouched
    expect(totalLevel(down)).toBe(5);
    // Shared slots recompute for caster level 5 (wizard 2 + cleric 3).
    expect(Math.max(...down.spellSlots.map((s) => s.level))).toBe(3);
  });

  it("is idempotent after a level-down (a second reconcile changes nothing)", () => {
    const bard = build({
      ...spec("lore-bard-10"),
      spells: [
        ...(spec("lore-bard-10").spells ?? []),
        { srdId: "guiding-bolt", prepared: true },
      ],
    });
    const down = withLevel(bard, 4);
    const again = reconcileBuildChoices(down, { ...down });
    expect(featureIds(again).sort()).toEqual(featureIds(down).sort());
    expect(spellIds(again)).toEqual(spellIds(down));
    expect(again.hp.max).toBe(down.hp.max);
    expect(again.spellSlots).toEqual(down.spellSlots);
  });
});

describe("reconcileSessionAfterBuild — play state follows a build edit", () => {
  function downWithSession(): {
    prev: CharacterData;
    next: CharacterData;
    session: SessionState;
  } {
    const doc = buildScenario(spec("life-cleric")); // L5
    const prev = doc.character;
    const next = withLevel(prev, 1);
    const session: SessionState = {
      ...doc.session,
      hp: { current: prev.hp.max, temp: 3 },
      hitDice: { used: 4 },
      spellSlots: { "1": { used: 4 }, "2": { used: 2 }, "3": { used: 1 } },
      concentration: conc("spiritual-weapon"), // srdId of a spell the de-level removes (L2)
    };
    return { prev, next, session };
  }

  it("clamps current HP to the new max (temp HP untouched)", () => {
    const { prev, next, session } = downWithSession();
    const out = reconcileSessionAfterBuild(prev, next, session);
    expect(out.hp.current).toBe(next.hp.max);
    expect(out.hp.temp).toBe(3);
  });

  it("clamps hit dice used to the new total level", () => {
    const { prev, next, session } = downWithSession();
    const out = reconcileSessionAfterBuild(prev, next, session);
    expect(out.hitDice.used).toBeLessThanOrEqual(totalLevel(next));
  });

  it("drops session slot-use rows for slot levels that no longer exist + clamps used", () => {
    const { prev, next, session } = downWithSession();
    const out = reconcileSessionAfterBuild(prev, next, session);
    const validLevels = new Set(next.spellSlots.map((s) => String(s.level)));
    for (const key of Object.keys(out.spellSlots)) {
      expect(validLevels.has(key)).toBe(true);
      const total = next.spellSlots.find((s) => String(s.level) === key)?.total ?? 0;
      expect(out.spellSlots[key]?.used).toBeLessThanOrEqual(total);
    }
  });

  it("clears concentration when its spell's id was removed by the edit", () => {
    const { prev, next, session } = downWithSession();
    const out = reconcileSessionAfterBuild(prev, next, session);
    expect(out.concentration).toBe("");
  });

  it("keeps concentration when its spell survives", () => {
    const { prev, next, session } = downWithSession();
    const kept = { ...session, concentration: conc("bless") }; // L1 srdId — survives
    const out = reconcileSessionAfterBuild(prev, next, kept);
    expect(out.concentration).toBe(conc("bless"));
  });

  it("prunes active-feature toggles whose feature the edit removed", () => {
    const doc = buildScenario(spec("life-cleric"));
    const prev = doc.character;
    const next = withLevel(prev, 1);
    const prevIds = prev.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []));
    const nextIds = new Set(
      next.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []))
    );
    const removed = prevIds.find((id) => !nextIds.has(id));
    const survivor = prevIds.find((id) => nextIds.has(id));
    expect(removed).toBeDefined();
    expect(survivor).toBeDefined();
    const session: SessionState = {
      ...doc.session,
      activeFeatures: [removed ?? "", survivor ?? ""],
    };
    const out = reconcileSessionAfterBuild(prev, next, session);
    expect(out.activeFeatures).toEqual([survivor]);
  });

  // B3 (Sorlock) — a Pact-Magic slot row (`pact-1`) must SURVIVE a build edit. The
  // totals map keys by `slotUsageKey` (NOT bare level), so the pact pool's spent
  // count is preserved instead of silently reset to 0 on any Bio-tab edit.
  it("preserves the Pact-Magic slot-use row (`pact-1`) across a build edit", () => {
    const doc = buildScenario(spec("life-cleric"));
    const prev: CharacterData = {
      ...doc.character,
      spellSlots: [
        { level: 1, total: 4 },
        { level: 1, total: 2, pactMagic: true },
      ],
    };
    // No structural change to the slots — the pact pool persists in `next` too.
    const next = prev;
    const session: SessionState = {
      ...doc.session,
      spellSlots: { "1": { used: 1 }, "pact-1": { used: 2 } },
    };
    const out = reconcileSessionAfterBuild(prev, next, session);
    expect(out.spellSlots["pact-1"]).toEqual({ used: 2 }); // pact pool NOT dropped
    expect(out.spellSlots["1"]).toEqual({ used: 1 }); // normal pool intact
  });
});
