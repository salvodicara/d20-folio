/**
 * Unit tests for sanitizeCharacter — the R4 read-time normalization. `classes[]` is
 * the SOLE source of truth; the sanitizer validates/normalizes it (always non-empty)
 * and conforms render-safety fields. The v2→v3 legacy single-class synthesis was
 * removed once the migration ran (every live doc carries `classes[]` — task #24
 * part 2). The remaining one-way conforms (initiative-override inference, JoaT half
 * strip, `skilled-general`→`skilled`) are SEPARATE migrations and stay.
 */

import { describe, it, expect } from "vitest";
import { sanitizeCharacter } from "@/lib/sanitize-character";
import type { ClassEntry } from "@/types/character";

const entries = (r: Record<string, unknown>): ClassEntry[] => r.classes as ClassEntry[];

describe("sanitizeCharacter (R4 — classes[] is the source of truth)", () => {
  it("keeps an existing classes[] entry's classId", () => {
    const result = sanitizeCharacter({
      classes: [{ classId: "custom-class", level: 1 }],
    });
    expect(entries(result)[0]?.classId).toBe("custom-class");
  });

  it("normalizes the entry's level to a valid integer ≥ 1", () => {
    const result = sanitizeCharacter({ classes: [{ classId: "bard", level: 0 }] });
    expect(entries(result)).toEqual([{ classId: "bard", level: 1 }]);
  });

  it("keeps an existing entry's subclassId untouched", () => {
    const result = sanitizeCharacter({
      classes: [{ classId: "bard", subclassId: "college-of-lore-v2", level: 3 }],
    });
    expect(entries(result)[0]?.subclassId).toBe("college-of-lore-v2");
  });

  it("keeps a multiclass entry's per-class picks on the entry", () => {
    const result = sanitizeCharacter({
      classes: [
        { classId: "warlock", level: 5, invocationChoices: ["agonizing-blast"] },
        { classId: "fighter", level: 3, weaponMasteries: ["longsword"] },
      ],
    });
    expect(entries(result)).toHaveLength(2);
    expect(entries(result)[0]?.invocationChoices).toEqual(["agonizing-blast"]);
    expect(entries(result)[1]?.weaponMasteries).toEqual(["longsword"]);
  });

  it("falls back to a single empty entry when there is no well-formed class", () => {
    expect(entries(sanitizeCharacter({}))).toEqual([{ classId: "", level: 1 }]);
    expect(entries(sanitizeCharacter({ classes: [] }))).toEqual([
      { classId: "", level: 1 },
    ]);
  });

  it("does not mutate the input object", () => {
    const input = {
      classes: [{ classId: "bard", subclassId: "college-of-lore", level: 3 }],
    };
    const snapshot = JSON.parse(JSON.stringify(input)) as typeof input;
    sanitizeCharacter(input);
    expect(input).toEqual(snapshot);
  });

  // ─── Initiative-bonus override migration ─────────────────────────────────
  // Legacy documents stored initiativeBonus as the auto-computed DEX
  // modifier OR a user override depending on what the player did in the
  // abilities page. The new field separates the two so Alert / ASI to DEX
  // / PB tier-ups flow through Initiative automatically. The migrator's
  // heuristic: stored value matches the bare DEX modifier → no override;
  // anything else → keep as deliberate override.
  //
  // The legacy `initiativeBonus` field was DELETED from `CharacterData` (golden
  // rule 10); these cases pin the lone sanctioned bounded ONE-WAY read-normalization
  // that still recognizes the legacy key at the untrusted input boundary (the raw
  // doc is an untyped `Record<string, unknown>`) and folds it forward, never
  // re-emitting it. They MUST keep passing `initiativeBonus` in the raw input.
  it("legacy doc with initiativeBonus === DEX mod migrates to null override", () => {
    const out = sanitizeCharacter({
      classes: [{ classId: "rogue", level: 1 }],
      abilityScores: { DEX: 16 }, // mod +3
      initiativeBonus: 3,
    });
    expect(out.initiativeBonusOverride).toBeNull();
  });

  it("legacy doc with initiativeBonus differing from DEX mod migrates to override", () => {
    const out = sanitizeCharacter({
      classes: [{ classId: "rogue", level: 1 }],
      abilityScores: { DEX: 16 }, // mod +3
      initiativeBonus: 7, // distinctly NOT the bare DEX mod
    });
    expect(out.initiativeBonusOverride).toBe(7);
  });

  it("preserves an explicit initiativeBonusOverride from new documents (including null)", () => {
    const a = sanitizeCharacter({
      classes: [{ classId: "bard", level: 1 }],
      abilityScores: { DEX: 14 },
      initiativeBonus: 2,
      initiativeBonusOverride: 9,
    });
    expect(a.initiativeBonusOverride).toBe(9);
    const b = sanitizeCharacter({
      classes: [{ classId: "bard", level: 1 }],
      abilityScores: { DEX: 14 },
      initiativeBonus: 2,
      initiativeBonusOverride: null,
    });
    expect(b.initiativeBonusOverride).toBeNull();
  });

  // ─── Jack of All Trades is DERIVED, never baked (#57) ───────────────────
  // The half-proficiency is computed at render from the feature's grant; stored
  // `skills` holds ONLY real proficiency choices. Sanitize STRIPS any baked
  // `halfProficiency` (a not-yet-migrated doc) ONE-WAY and drops the obsolete
  // `jackOfAllTradesApplied` flag — never writing the old shape back (rule 10).
  it("a fresh Bard read keeps real proficiencies and bakes NO halfProficiency", () => {
    const out = sanitizeCharacter({
      classes: [{ classId: "bard", level: 2 }],
      features: [{ srdId: "bard-jack-of-all-trades" }],
      skills: { persuasion: "proficient" },
    });
    const skills = out.skills as Record<string, string>;
    expect(skills.persuasion).toBe("proficient"); // real choice kept
    expect(skills.athletics).toBeUndefined(); // derived at render, not baked
    expect(skills.stealth).toBeUndefined();
    expect("jackOfAllTradesApplied" in out).toBe(false); // obsolete flag dropped
  });

  it("STRIPS baked halfProficiency from a not-yet-migrated doc (one-way)", () => {
    const out = sanitizeCharacter({
      classes: [{ classId: "bard", level: 2 }],
      features: [{ srdId: "bard-jack-of-all-trades" }],
      skills: {
        persuasion: "proficient",
        stealth: "halfProficiency", // legacy baked value
        athletics: "halfProficiency",
      },
      jackOfAllTradesApplied: true,
    });
    const skills = out.skills as Record<string, string>;
    expect(skills.persuasion).toBe("proficient"); // real choice survives
    expect(skills.stealth).toBeUndefined(); // baked half stripped
    expect(skills.athletics).toBeUndefined();
    expect("jackOfAllTradesApplied" in out).toBe(false);
  });

  it("non-Bards: real proficiencies pass through untouched, no flag stamped", () => {
    const out = sanitizeCharacter({
      classes: [{ classId: "fighter", level: 1 }],
      features: [],
      skills: { athletics: "proficient" },
    });
    expect("jackOfAllTradesApplied" in out).toBe(false);
    const skills = out.skills as Record<string, string>;
    expect(skills.athletics).toBe("proficient");
    expect(skills.stealth).toBeUndefined();
  });

  // ── Superseded feat ids: `skilled-general` (the picker-workaround duplicate of
  // the Origin `skilled` feat) was DELETED once the ASI feat picker offered Origin
  // feats per 2024 RAW. A live doc that stored it is conformed ONE-WAY on read.
  describe("superseded feat-id normalization", () => {
    it("rewrites a stored skilled-general feature ref to the canonical skilled id", () => {
      const out = sanitizeCharacter({
        features: [
          { srdId: "skilled-general", source: "feat" },
          { srdId: "alert", source: "feat" },
        ],
      });
      expect(out.features).toEqual([
        { srdId: "skilled", source: "feat" },
        { srdId: "alert", source: "feat" },
      ]);
    });

    it("leaves custom features and canonical ids untouched", () => {
      const features = [{ custom: true, name: "Boon" }, { srdId: "skilled" }];
      const out = sanitizeCharacter({ features });
      expect(out.features).toEqual(features);
    });
  });

  // ── Render-safety: guarantee `hp.max` so the SRD-free roster card (which reads
  // it directly, never rehydrating) can never crash on a partial / malformed doc.
  describe("hp render-safety backfill", () => {
    it("backfills hp = { max: 0 } when the field is entirely absent", () => {
      // The exact shape of the owner's crash: a minimal export imported by a
      // build that didn't understand the format, persisted without `hp`.
      const out = sanitizeCharacter({ classes: [{ classId: "bard", level: 5 }] });
      expect(out.hp).toEqual({ max: 0 });
    });

    it("preserves a real hp.max", () => {
      const out = sanitizeCharacter({
        classes: [{ classId: "bard", level: 1 }],
        hp: { max: 42 },
      });
      expect(out.hp).toEqual({ max: 42 });
    });

    it("coerces a malformed hp (wrong type / missing max) to a safe zero", () => {
      expect(sanitizeCharacter({ hp: "nonsense" }).hp).toEqual({ max: 0 });
      expect(sanitizeCharacter({ hp: null }).hp).toEqual({ max: 0 });
      expect(sanitizeCharacter({ hp: {} }).hp).toEqual({ max: 0 });
      expect(sanitizeCharacter({ hp: { max: "12" } }).hp).toEqual({ max: 0 });
    });

    it("strips junk keys from hp down to the canonical { max } shape", () => {
      const out = sanitizeCharacter({ hp: { max: 10, current: 3, legacy: true } });
      expect(out.hp).toEqual({ max: 10 });
    });
  });
});
