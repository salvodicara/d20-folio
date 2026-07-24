/**
 * Monster corpus-integrity guard (§F) — table-driven over the COMPOSED
 * `MONSTERS` (public SRD + pack), so it passes in both build modes by
 * construction and grows with every authoring wave. It pins the DERIVED-NOT-
 * STORED discipline (D-4), the prose↔facts drift lock (D-3), and bilingual
 * completeness of every id-addressed monster string.
 *
 * The CR→XP/PB tables + `diceMean` rows live in `monster.test.ts` (one home,
 * golden rule 6); this file owns the corpus.
 */
import { describe, it, expect } from "vitest";
import { ensureSrdKind } from "@/i18n";
import { hasSrd } from "@/i18n/resolver";
import { srd } from "@tests/_harness/loc";
import { MONSTERS, getMonster, filterMonsters } from "@/data/monsters";
import { getSpellById } from "@/data/spells";
import { abilityModifier } from "@/lib/ability";
import { ALL_SKILLS } from "@/lib/skills";
import { diceMean, monsterPassivePerception, pbForCr, xpForCr } from "@/lib/monster";
import {
  ALL_ALIGNMENTS,
  ALL_CREATURE_TYPES,
  ALL_DAMAGE_TYPES,
  CREATURE_SIZE_ORDER,
  type MonsterEntry,
  type MonsterStatBlock,
} from "@/data/types";

await ensureSrdKind("monster");

const VALID_CR = new Set([
  0,
  0.125,
  0.25,
  0.5,
  ...Array.from({ length: 30 }, (_, i) => i + 1),
]);
const SKILL_IDS = new Set(ALL_SKILLS.map((s) => s.id));
const DAMAGE = new Set<string>(ALL_DAMAGE_TYPES);
const SECTIONS = [
  "traits",
  "actions",
  "bonusActions",
  "reactions",
  "legendaryActions",
] as const;
const strip = (s: string): string => s.replace(/\s+/g, "");

/**
 * The `onSuccess` classification the printed EN prose MANDATES (ruling A):
 *   • "half"    ⟺ an initial-save "Success: Half damage[ only]." sentence.
 *   • "special" ⟺ an initial-save "Success: …" sentence that is anything OTHER
 *                 than bare half damage (e.g. cloaker Moan immunity, or half
 *                 damage that still carries a rider — bulette's residual push).
 *   • "none"    ⟺ no initial-save "Success:" sentence at all.
 * Recharge/cooldown footers ("Failure or Success: …") and staged
 * "First/Second Failure" prose are NOT an initial Success sentence — the footer
 * is stripped before the scan, and Failure prose never matches "Success:".
 * This derives one value from the print and is asserted `=== entry.onSuccess`,
 * pinning the ⟺ in both directions for every save entry in every future wave.
 */
function printedOnSuccess(text: string): "half" | "none" | "special" {
  const withoutFooter = text.replace(/Failure or Success:[^.]*\.?/gi, "");
  const match = withoutFooter.match(/Success:\s*([^.]*)/i);
  if (match === null) return "none";
  return /^Half damage( only)?$/i.test((match[1] ?? "").trim()) ? "half" : "special";
}

type KeyedEntry = { section: string; entry: MonsterEntry; key: string };
function entriesOf(m: MonsterStatBlock): KeyedEntry[] {
  const out: KeyedEntry[] = [];
  for (const section of SECTIONS) {
    const arr = m[section];
    if (!arr) continue;
    for (const entry of arr) {
      out.push({ section, entry, key: `${m.id}.${section}.${entry.id}` });
    }
  }
  return out;
}

const cases = MONSTERS.map((m) => [m.id, m] as const);

it("the corpus is non-empty (authored subset present)", () => {
  expect(MONSTERS.length).toBeGreaterThan(0);
});

describe.each(cases)("%s", (id, m) => {
  it("has a slug id that round-trips via getMonster", () => {
    expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(getMonster(id)).toBe(m);
  });

  it("has a valid identity line + vitals (§F.2)", () => {
    expect(VALID_CR.has(m.cr)).toBe(true);
    expect(m.sizes.length).toBeGreaterThan(0);
    for (const s of m.sizes) expect(CREATURE_SIZE_ORDER).toContain(s);
    expect(ALL_CREATURE_TYPES).toContain(m.type);
    expect(ALL_ALIGNMENTS).toContain(m.alignment);
    expect(m.ac).toBeGreaterThanOrEqual(5);
    expect(m.hp.average).toBeGreaterThanOrEqual(1);
  });

  it("has an HP formula whose average is the floored dice mean (§F.3)", () => {
    expect(m.hp.formula).toMatch(/^\d+d\d+([+-]\d+)?$/);
    expect(m.hp.average).toBe(Math.floor(diceMean(m.hp.formula)));
  });

  it("has well-formed entries: dice, damage types, attack shape (§F.4)", () => {
    for (const { entry } of entriesOf(m)) {
      if (entry.kind === "attack" || entry.kind === "save") {
        for (const clause of entry.damage ?? []) {
          expect(clause.dice).toMatch(/^(\d+d\d+([+-]\d+)?|\d+)$/);
          expect(DAMAGE.has(clause.damageType)).toBe(true);
        }
      }
      if (entry.kind === "attack") {
        expect(entry.damage.length).toBeGreaterThanOrEqual(1);
        if (entry.attack === "melee" || entry.attack === "melee-or-ranged") {
          expect(entry.reachFt).toBeDefined();
        }
        if (entry.attack === "ranged" || entry.attack === "melee-or-ranged") {
          expect(entry.rangeFt).toBeDefined();
        }
      }
    }
  });

  it("has valid save + spellcasting entries (§F.5, §F.6)", () => {
    for (const { entry } of entriesOf(m)) {
      if (entry.kind === "save") {
        expect(entry.dc).toBeGreaterThanOrEqual(5);
        expect(entry.dc).toBeLessThanOrEqual(30);
        expect(["STR", "DEX", "CON", "INT", "WIS", "CHA"]).toContain(entry.save);
        expect(["half", "none", "special"]).toContain(entry.onSuccess);
      }
      if (entry.kind === "spellcasting") {
        for (const spellId of [
          ...(entry.atWill ?? []),
          ...(entry.perDay ?? []).flatMap((t) => t.spellIds),
        ]) {
          expect(getSpellById(spellId), `spell "${spellId}"`).toBeDefined();
        }
      }
    }
  });

  it("stores NO redundant derivable override (§F.7)", () => {
    if (m.initiative !== undefined) {
      expect(m.initiative).not.toBe(abilityModifier(m.abilityScores.DEX));
    }
    for (const a of ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const) {
      const override = m.saveOverrides?.[a];
      if (override !== undefined) {
        const proficient = m.saveProficiencies?.includes(a) ?? false;
        const derived =
          abilityModifier(m.abilityScores[a]) + (proficient ? pbForCr(m.cr) : 0);
        expect(override).not.toBe(derived);
      }
    }
    for (const s of m.skills ?? []) {
      if (s.bonus === undefined) continue;
      const ability = ALL_SKILLS.find((r) => r.id === s.skill)?.ability;
      if (ability === undefined) continue; // invalid skill id is caught by §F.9
      const pb = pbForCr(m.cr);
      const derived =
        abilityModifier(m.abilityScores[ability]) + (s.expertise ? 2 * pb : pb);
      expect(s.bonus).not.toBe(derived);
    }
    if (m.passivePerceptionOverride !== undefined) {
      const withoutOverride = { ...m, passivePerceptionOverride: undefined };
      expect(m.passivePerceptionOverride).not.toBe(
        monsterPassivePerception(withoutOverride)
      );
    }
    if (m.xp !== undefined) expect(m.xp).not.toBe(xpForCr(m.cr));
    if (m.xpInLair !== undefined) {
      expect(m.xpInLair).toBeGreaterThan(m.xp ?? xpForCr(m.cr));
    }
  });

  it("references only ids that resolve (§F.9) + valid condition immunities", () => {
    for (const s of m.skills ?? []) expect(SKILL_IDS.has(s.skill)).toBe(true);
    for (const langId of [
      ...(m.languages?.ids ?? []),
      ...(m.languages?.understandsOnlyIds ?? []),
    ]) {
      expect(hasSrd("language", langId, "name", "en"), `language "${langId}"`).toBe(true);
    }
    for (const g of m.gear ?? []) {
      expect(hasSrd("equipment", g.id, "name", "en"), `gear "${g.id}"`).toBe(true);
    }
    for (const ci of m.conditionImmunities ?? []) {
      const cid = typeof ci === "string" ? ci : ci.id;
      expect(hasSrd("condition", cid, "name", "en"), `condition "${cid}"`).toBe(true);
      if (typeof ci !== "string") expect(ci.note).toBe("with-mind-blank");
    }
  });

  it("pins the structured facts against the printed EN prose (§F.8, D-3)", () => {
    for (const { entry, key } of entriesOf(m)) {
      if (entry.kind === "attack") {
        const text = strip(srd("monster", key, "text", "en"));
        expect(text, `${key} to-hit`).toContain(`+${entry.toHit}`);
        for (const clause of entry.damage) {
          expect(text, `${key} dice`).toContain(strip(clause.dice));
        }
      }
      if (entry.kind === "save") {
        const text = strip(srd("monster", key, "text", "en"));
        expect(text, `${key} DC`).toContain(`DC${entry.dc}`);
      }
    }
  });

  it("pins onSuccess to the printed Success sentence (§F.11, ruling A, D-3)", () => {
    for (const { entry, key } of entriesOf(m)) {
      if (entry.kind !== "save") continue;
      const text = srd("monster", key, "text", "en");
      expect(printedOnSuccess(text), `${key} onSuccess vs EN print`).toBe(
        entry.onSuccess
      );
    }
  });

  it("has bilingual name + prose for every id (§F.10)", () => {
    for (const locale of ["en", "it"] as const) {
      expect(
        srd("monster", m.id, "name", locale).trim().length,
        `${m.id} name/${locale}`
      ).toBeGreaterThan(0);
      for (const { key } of entriesOf(m)) {
        expect(
          srd("monster", key, "name", locale).trim().length,
          `${key} name/${locale}`
        ).toBeGreaterThan(0);
        expect(
          srd("monster", key, "text", locale).trim().length,
          `${key} text/${locale}`
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("filterMonsters", () => {
  it("bounds CR inclusively and preserves the composed sort", () => {
    const lowCr = filterMonsters({ crMax: 1 });
    expect(lowCr.every((m) => m.cr <= 1)).toBe(true);
    expect(lowCr.map((m) => m.id)).toContain("rat");
    const highCr = filterMonsters({ crMin: 10 });
    expect(highCr.every((m) => m.cr >= 10)).toBe(true);
    const band = filterMonsters({ crMin: 0.25, crMax: 4 });
    expect(band.every((m) => m.cr >= 0.25 && m.cr <= 4)).toBe(true);
  });

  it("filters by creature type", () => {
    const dragons = filterMonsters({ type: "dragon" });
    expect(dragons.length).toBeGreaterThan(0);
    expect(dragons.every((m) => m.type === "dragon")).toBe(true);
  });

  it("returns the full corpus with no bounds", () => {
    expect(filterMonsters({})).toHaveLength(MONSTERS.length);
  });
});
