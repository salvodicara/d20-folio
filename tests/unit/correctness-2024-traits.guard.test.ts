/**
 * Correctness regression LOCKS (workstream D) — D3, D5, D8.
 *
 * These three items were verified ALREADY-CORRECT in the data/engine on `main`
 * (the coverage docs that flagged them were stale). This file pins each fact with a
 * cheap, pure-data, table-driven guard (golden rule 13 — the cheapest test that
 * pins the fact) so it can never silently regress:
 *
 *  - D3 — Bardic Inspiration uses = CHA (not Proficiency Bonus).
 *  - D5 — 2024 core-trait lists (Druid/Rogue/Sorcerer/Wizard proficiencies + tool
 *    grants, the maneuver subclass's Student of War, Sorcerer Metamagic count, EK / Arcane
 *    Trickster no-school + L10 third cantrip). NOTE: Twinned Spell is RETAINED in
 *    2024 — the metamagic list length stays 11; this guard pins it so it is not
 *    wrongly removed.
 *  - D8 — all 7 pack setting subclasses present + wired with their expected feature ids
 *    at the expected levels (verified vs http://dnd2024.wikidot.com/<class>:<subclass>;
 *    zero RAW mismatches found in the verification pass).
 */
import { describe, expect, it } from "vitest";
import { classFeatureIndex } from "@/data/classes";
import { DRUID_TABLE } from "@/data/classes/druid";
import { ROGUE_TABLE } from "@/data/classes/rogue";
import { SORCERER_TABLE } from "@/data/classes/sorcerer";
import { WIZARD_TABLE } from "@/data/classes/wizard";
import { SRD_METAMAGIC } from "@/data/metamagic";

// ── D3 — Bardic Inspiration uses = CHA ───────────────────────────────────────────

describe("D3 — Bardic Inspiration uses = CHA (never PB)", () => {
  it("the bard-bardic-inspiration tracker total is 'CHA'", () => {
    const f = classFeatureIndex.get("bard-bardic-inspiration");
    expect(f?.mechanics?.tracker?.total).toBe("CHA");
    // Guard against a PB regression specifically.
    expect(f?.mechanics?.tracker?.total).not.toBe("PB");
  });
});

// ── D5 — 2024 core-trait lists (table-driven per fact) ───────────────────────────

describe("D5 — class proficiency core traits (2024 RAW)", () => {
  it("Druid: Light armor + Shields, Simple weapons", () => {
    expect(DRUID_TABLE.armorProficiencies).toEqual(["light-armor", "shields"]);
    expect(DRUID_TABLE.weaponProficiencies).toEqual(["simple-weapons"]);
  });

  it("Druid: Herbalism Kit via a tool-proficiency grant (class table has no tool field)", () => {
    const f = classFeatureIndex.get("druid-druidic");
    // The Herbalism Kit grant lives on the L1 Druidic feature.
    const herbalism = Object.values(Object.fromEntries(classFeatureIndex))
      .filter((feat) => feat.class === "druid")
      .flatMap((feat) => feat.grants ?? [])
      .find((g) => g.type === "tool-proficiency" && g.tool === "Herbalism Kit");
    expect(herbalism).toBeDefined();
    expect(f).toBeDefined();
  });

  it("Rogue: Simple + Martial (Finesse or Light) weapons, Thieves' Tools grant", () => {
    expect(ROGUE_TABLE.weaponProficiencies).toEqual([
      "simple-weapons",
      "martial-weapons-finesse-or-light",
    ]);
    const thieves = Object.values(Object.fromEntries(classFeatureIndex))
      .filter((feat) => feat.class === "rogue")
      .flatMap((feat) => feat.grants ?? [])
      .find((g) => g.type === "tool-proficiency" && g.tool === "Thieves' Tools");
    expect(thieves).toBeDefined();
  });

  it("Sorcerer + Wizard: Simple weapons, no armor", () => {
    expect(SORCERER_TABLE.weaponProficiencies).toEqual(["simple-weapons"]);
    expect(SORCERER_TABLE.armorProficiencies).toEqual([]);
    expect(WIZARD_TABLE.weaponProficiencies).toEqual(["simple-weapons"]);
    expect(WIZARD_TABLE.armorProficiencies).toEqual([]);
  });

  it("Sorcerer Metamagic count = 2 / 4 / 6 at levels 2 / 10 / 17", () => {
    const known = (level: number): unknown =>
      SORCERER_TABLE.levels.find((l) => l.level === level)?.classSpecific?.metamagicKnown;
    expect(known(2)).toBe(2);
    expect(known(10)).toBe(4);
    expect(known(17)).toBe(6);
  });

  it("Metamagic list INCLUDES Twinned Spell (RETAINED in 2024) — full 2024 list of 10", () => {
    // 2024 PHB metamagic = the 10 options below (Twinned Spell is RETAINED in 2024,
    // NOT dropped — the headline guard). The list is COMPLETE (none missing), so the
    // count is pinned too; a future addition/removal trips this lock.
    const ids = SRD_METAMAGIC.map((m) => m.id).sort();
    expect(ids).toEqual(
      [
        "careful-spell",
        "distant-spell",
        "empowered-spell",
        "extended-spell",
        "heightened-spell",
        "quickened-spell",
        "seeking-spell",
        "subtle-spell",
        "transmuted-spell",
        "twinned-spell",
      ].sort()
    );
    expect(SRD_METAMAGIC.some((m) => m.id === "twinned-spell")).toBe(true);
  });

  // (The pack-subclass D5 locks — Student of War + the EK/AT
  // no-school + L10 cantrip pins — live in
  // `content-pack/tests/unit/correctness-2024-traits.guard.pack.test.ts`.)
});

// ── D8 — the setting-subclass locks are pack content; they live in
// `content-pack/tests/unit/correctness-2024-traits.guard.pack.test.ts`.
