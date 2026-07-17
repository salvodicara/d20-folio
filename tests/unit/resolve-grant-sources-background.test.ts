/**
 * A4 — BACKGROUND → GRANT seam (`resolveGrantSourcesForBackground`).
 *
 * Backgrounds used to apply ONLY through a creation-time snapshot
 * (`character.skills` / `character.toolProficiencies`); the
 * `SrdBackgroundData.grants` field was dead. This seam routes the background's
 * idempotent, set-union-safe benefits (skill- and tool-proficiency) through
 * `evaluateGrants` like any other source.
 *
 * The headline guarantee these tests defend is REGRESSION SAFETY: routing an
 * existing character's background through grants must leave its EFFECTIVE
 * proficiencies byte-for-byte unchanged — no double-count, no drift. The ASI
 * and origin feat are deliberately NOT modelled here (non-idempotent).
 *
 * Source of truth: 2024 PHB backgrounds (dnd2024.wikidot.com/background:*) +
 * the pack setting backgrounds present in the data file.
 */
import { describe, expect, it } from "vitest";
import {
  resolveGrantSourcesForBackground,
  resolveAllGrantSources,
} from "@/lib/resolve-grant-sources";
import { evaluateGrants } from "@/lib/grants";
import { SRD_BACKGROUNDS, getBackground, findBackground } from "@/data/backgrounds";
import { skillNameToId } from "@/lib/compute";
import {
  mergeSkillProficiencies,
  displayToolProficiencies,
} from "@/lib/views/sheet-view";
import { SRD_TOOLS_2024 } from "@/lib/tools";
import { umbrellaToolChoiceOptions } from "@/lib/tool-names";

describe("resolveGrantSourcesForBackground", () => {
  it("emits one source carrying the background's skill + tool grants", () => {
    // Acolyte: Insight + Religion (skills) + Calligrapher's Supplies (tool).
    const sources = resolveGrantSourcesForBackground("acolyte");
    expect(sources).toHaveLength(1);
    expect(sources[0]?.id).toBe("acolyte");
    expect(sources[0]?.grants).toEqual([
      { type: "skill-proficiency", skill: "insight" },
      { type: "skill-proficiency", skill: "religion" },
      { type: "tool-proficiency", tool: "Calligrapher's Supplies" },
    ]);
  });

  it("resolves the background by its English NAME (the form create.tsx writes)", () => {
    const byName = resolveGrantSourcesForBackground("Acolyte");
    const byId = resolveGrantSourcesForBackground("acolyte");
    expect(byName).toEqual(byId);
  });

  it("resolves the background by its Italian name too", () => {
    // Acolyte → "Accolito"
    const byItName = resolveGrantSourcesForBackground("Accolito");
    expect(byItName[0]?.id).toBe("acolyte");
  });

  it("emits nothing for an empty / undefined / unknown background", () => {
    expect(resolveGrantSourcesForBackground("")).toEqual([]);
    expect(resolveGrantSourcesForBackground("   ")).toEqual([]);
    expect(resolveGrantSourcesForBackground(undefined)).toEqual([]);
    expect(resolveGrantSourcesForBackground("not-a-real-background")).toEqual([]);
  });

  it("Criminal grants its two 2024 skills — Sleight of Hand + Stealth — plus Thieves' Tools", () => {
    // Regression: the data file once carried a stray "Thieves' Tools" in
    // `criminal.skillProficiencies` IN PLACE of Sleight of Hand. Because
    // `skillNameToId` silently maps a tool name to null, the background lost a
    // skill entirely — a Criminal auto-granted only Stealth, never SoH (2024
    // RAW: Sleight of Hand AND Stealth — dnd2024.wikidot.com/background:criminal).
    // It now lists the two real skills; the tool lives ONLY in `toolProficiency`.
    const criminal = getBackground("criminal");
    expect(criminal?.skillProficiencies).toEqual(["Sleight of Hand", "Stealth"]);
    expect(criminal?.skillProficiencies).not.toContain("Thieves' Tools");

    const grants = resolveGrantSourcesForBackground("criminal")[0]?.grants ?? [];
    const skillGrants = grants.filter((g) => g.type === "skill-proficiency");
    expect(skillGrants).toEqual([
      { type: "skill-proficiency", skill: "sleight-of-hand" },
      { type: "skill-proficiency", skill: "stealth" },
    ]);
    // Thieves' Tools surfaces as the tool grant, never as a phantom skill.
    expect(grants).toContainEqual({ type: "tool-proficiency", tool: "Thieves' Tools" });
    expect(skillGrants.map((g) => g.skill)).not.toContain("thieves-tools");
  });
});

describe("background grants flow through evaluateGrants", () => {
  it("Sage surfaces Arcana + History skills and a Calligrapher tool via the aggregate", () => {
    const agg = evaluateGrants(resolveGrantSourcesForBackground("sage"));
    expect(agg.skillProficiencies.has("arcana")).toBe(true);
    expect(agg.skillProficiencies.has("history")).toBe(true);
    expect(agg.toolProficiencies.has("Calligrapher's Supplies")).toBe(true);
  });

  it("contributes NO language grants (2024 backgrounds grant no languages)", () => {
    for (const bg of SRD_BACKGROUNDS) {
      const agg = evaluateGrants(resolveGrantSourcesForBackground(bg.id));
      expect(agg.languages.size, `${bg.id} languages`).toBe(0);
    }
  });

  it("contributes NO ability-score floors or save proficiencies (ASI stays creation-owned)", () => {
    const agg = evaluateGrants(resolveGrantSourcesForBackground("soldier"));
    expect(Object.keys(agg.abilityScoreFloors)).toHaveLength(0);
    expect(agg.saveProficiencies.size).toBe(0);
  });

  it("a character WITH a background surfaces its proficiencies via resolveAllGrantSources; without one, nothing", () => {
    const withBg = evaluateGrants(
      resolveAllGrantSources({ features: [], equipment: [], background: "criminal" })
    );
    const withoutBg = evaluateGrants(
      resolveAllGrantSources({ features: [], equipment: [], background: "" })
    );
    // Criminal: Sleight of Hand + Stealth.
    expect(withBg.skillProficiencies.has("sleight-of-hand")).toBe(true);
    expect(withBg.skillProficiencies.has("stealth")).toBe(true);
    expect(withoutBg.skillProficiencies.size).toBe(0);
  });

  it("omitting `background` entirely (legacy doc) contributes no background grants", () => {
    const agg = evaluateGrants(resolveAllGrantSources({ features: [], equipment: [] }));
    expect(agg.skillProficiencies.size).toBe(0);
    expect(agg.toolProficiencies.size).toBe(0);
  });
});

describe("REGRESSION — effective proficiencies are unchanged when a background is routed through grants", () => {
  /**
   * The EXACT creation-time skill snapshot for a background (mirroring the
   * CreationWizard): background skills → `character.skills` via `skillNameToId`.
   * The FIXED background tool is now DERIVED (a `tool-proficiency` grant), never
   * stored as a free-text string — so the snapshot carries skills only.
   */
  function skillSnapshotFromBackground(bgId: string): Record<string, "proficient"> {
    const bg = getBackground(bgId);
    if (!bg) throw new Error(`unknown background ${bgId}`);
    const skills: Record<string, "proficient"> = {};
    for (const name of bg.skillProficiencies) {
      const id = skillNameToId(name);
      if (id !== null) skills[id] = "proficient";
    }
    return skills;
  }

  it("merging the background grants into its own skill snapshot changes nothing (every background)", () => {
    for (const bg of SRD_BACKGROUNDS) {
      const snap = skillSnapshotFromBackground(bg.id);
      const agg = evaluateGrants(resolveGrantSourcesForBackground(bg.id));
      const mergedSkills = mergeSkillProficiencies(snap, agg.skillProficiencies);
      expect(mergedSkills, `${bg.id} skills drift`).toEqual(snap);
    }
  });

  it("the FIXED background tool DERIVES into the display string, localized by id, never an umbrella", () => {
    // criminal grants Thieves' Tools (a concrete tool) → it surfaces in the
    // presenter string with NO manual id stored (all-derived).
    const agg = evaluateGrants(resolveGrantSourcesForBackground("criminal"));
    expect(displayToolProficiencies([], [], agg, "en")).toContain("Thieves' Tools");
    // A manual id equal to the derived tool collapses to ONE (deduped by id).
    expect(displayToolProficiencies(["thieves-tools"], [], agg, "en")).toBe(
      "Thieves' Tools"
    );
  });

  it("a snapshot skill at expertise is NOT downgraded by the background grant", () => {
    // Sage grants Arcana (proficient). A character who already has Arcana at
    // expertise (e.g. Rogue) keeps expertise.
    const own: Record<string, "proficient" | "expertise"> = { arcana: "expertise" };
    const agg = evaluateGrants(resolveGrantSourcesForBackground("sage"));
    const merged = mergeSkillProficiencies(own, agg.skillProficiencies);
    expect(merged.arcana).toBe("expertise");
    expect(merged.history).toBe("proficient"); // the still-unowned one is added
  });
});

describe("background grants data integrity", () => {
  it("every background lists exactly TWO real skills — no non-skill stray silently shrinks it", () => {
    // The class of bug behind the criminal regression: a tool name written into
    // a `skillProficiencies` array maps to null via `skillNameToId` and is
    // dropped, leaving the background with FEWER than its two 2024 skills — and
    // nothing caught it. This guard pins the real invariant for EVERY background:
    // exactly two entries, both real skills, yielding exactly two skill grants.
    for (const bg of SRD_BACKGROUNDS) {
      expect(bg.skillProficiencies.length, `${bg.id} skill count`).toBe(2);
      for (const name of bg.skillProficiencies) {
        expect(
          skillNameToId(name),
          `${bg.id}: "${name}" is not a real skill`
        ).not.toBeNull();
      }
      const skillGrants = (bg.grants ?? []).filter((g) => g.type === "skill-proficiency");
      expect(skillGrants.length, `${bg.id} skill grants`).toBe(2);
    }
  });

  it("every background with a tool emits exactly one tool grant — FIXED → tool-proficiency, UMBRELLA → choice-tool-proficiency", () => {
    // The tool grant is ENGINE-derived (not baked into `bg.grants`), so assert
    // against the resolved grant source — the seam the consumer actually reads.
    for (const bg of SRD_BACKGROUNDS) {
      const tool = bg.toolProficiency?.trim();
      const resolved = resolveGrantSourcesForBackground(bg.id)[0]?.grants ?? [];
      const fixedGrants = resolved.filter((g) => g.type === "tool-proficiency");
      const choiceGrants = resolved.filter((g) => g.type === "choice-tool-proficiency");
      if (!tool) {
        expect(fixedGrants.length + choiceGrants.length, bg.id).toBe(0);
        continue;
      }
      const isUmbrella = umbrellaToolChoiceOptions(tool) !== undefined;
      // Exactly one tool grant total, of the right kind.
      expect(fixedGrants.length, `${bg.id} fixed`).toBe(isUmbrella ? 0 : 1);
      expect(choiceGrants.length, `${bg.id} choice`).toBe(isUmbrella ? 1 : 0);
    }
  });

  it("an UMBRELLA-tool background ('Choose one kind of <X>') emits a choice over concrete picks — never the umbrella as a fixed proficiency", () => {
    // Soldier: "Choose one kind of Gaming Set".
    const GAMING_SET_IDS = SRD_TOOLS_2024.filter(
      (t) => t.category === "gaming" && t.pickable !== false
    ).map((t) => t.id);
    const grants = resolveGrantSourcesForBackground("soldier")[0]?.grants ?? [];
    const choice = grants.find((g) => g.type === "choice-tool-proficiency");
    expect(choice).toBeDefined();
    expect(choice?.type === "choice-tool-proficiency" && choice.amount).toBe(1);
    const options = choice?.type === "choice-tool-proficiency" ? choice.options : [];
    // The concrete pickable gaming sets — NEVER the umbrella id/name.
    expect(new Set(options)).toEqual(new Set(GAMING_SET_IDS));
    expect(options).not.toContain("gaming-set");
    expect(options).not.toContain("Gaming Set");
    // The umbrella is NOT a fixed proficiency.
    expect(grants).not.toContainEqual({
      type: "tool-proficiency",
      tool: "Gaming Set",
    });
  });

  it("no background emits a language / save / ability-score grant (idempotency invariant)", () => {
    // Assert the FULL resolved grant set (data skills + engine-derived tool grant).
    const allowed = ["skill-proficiency", "tool-proficiency", "choice-tool-proficiency"];
    for (const bg of SRD_BACKGROUNDS) {
      const resolved = resolveGrantSourcesForBackground(bg.id)[0]?.grants ?? [];
      for (const g of resolved) {
        expect(
          allowed.includes(g.type),
          `${bg.id} emitted non-idempotent grant ${g.type}`
        ).toBe(true);
      }
    }
  });

  it("findBackground resolves id, EN name, and IT name; rejects junk", () => {
    expect(findBackground("sage")?.id).toBe("sage");
    expect(findBackground("Sage")?.id).toBe("sage");
    expect(findBackground("Saggio")?.id).toBe("sage");
    expect(findBackground("  ")).toBeUndefined();
    expect(findBackground("nonsense")).toBeUndefined();
  });
});
