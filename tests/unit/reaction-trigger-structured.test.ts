/**
 * STRUCTURED reaction-trigger equivalence + leak-closure guard (golden rules 7 + 9 + 13).
 *
 * Closes the GR7 prose-reads that derived a reaction trigger from English text:
 *
 *  - FEATURE actions: `smart-tracker`'s `extractTrigger` used to PARSE the English
 *    action description; its free-text fallback emitted the English phrase AS the
 *    IT value (a latent English-as-IT leak). Retired (B4) — a reaction action now
 *    declares a STRUCTURED `trigger` token (`ReactionTrigger`).
 *  - SPELL reactions: `smart-tracker`'s `extractSpellTrigger` used to PARSE the
 *    spell's English `castingTime` prose; its `litText({ en, it })` fallback
 *    emitted the English phrase AS the IT value (the SAME class of leak). Retired
 *    (B5) — a reaction SPELL now declares the SAME `reactionTrigger` token on
 *    `SrdSpellData`.
 *
 * Both paths emit a token the presenter localizes via the ONE
 * `combat.reactionTrigger_<token>` key family (EN + IT).
 *
 * This test pins, FROM THE REAL DATA (every `mechanics.actions` reaction across
 * class-features / feats / race-traits, AND every `castingTime: "reaction"` spell):
 *
 *  1. EQUIVALENCE — for EVERY reaction action AND reaction spell, the NEW structured
 *     path resolves to the EXACT SAME English display the retired parser produced
 *     (each parser's logic is replicated locally as the oracle; if any backfilled
 *     token drifts, this fails). Zero visible EN change — the contract of the refactor.
 *  2. NO leak — every backfilled token's IT value is a real translation, never
 *     byte-identical to its EN (the old free-text cases that leaked are now
 *     properly translated). (The `i18n-dynamic-key-coverage.guard` separately pins
 *     every `combat.reactionTrigger_<token>` key exists in BOTH locales.)
 *  3. The retired parsers + their pattern tables are GONE from the source (no dead
 *     code, no leak path left — golden rule 10).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { classFeatureIndex } from "@/data/classes";
import { FEATS_BY_ID } from "@/data/feats";
import { raceFeatureIndex } from "@/data/races";
import { spells } from "@/data/spells";
import { srdRefForFeatureSource } from "@/lib/srd-feature-lookup";
import { srdKey } from "@/i18n/srd-key";
import { srdEn } from "@/i18n/srd-en";
import { uiText } from "@/lib/loc-text";
import { localizeText } from "@/lib/views/srd-i18n";
import { packFeats } from "@pack";

// The composed data differs by mode (SRD-only vs content pack), so the
// vacuous-pass floors below are per-composition.
const PACK_COMPOSED = packFeats.length > 0;

// ── The RETIRED parser, replicated as the equivalence ORACLE ─────────────────
// This is the exact `extractTrigger` + `FEATURE_TRIGGER_PATTERNS` logic that was
// deleted from `smart-tracker.ts`. It exists ONLY here, as the ground truth the
// structured backfill must reproduce. It must NEVER be re-introduced into `src/`.
const ORACLE_PATTERNS: Array<{ test: (s: string) => boolean; en: string }> = [
  {
    test: (s) => s.includes("hit by an attack") || s.includes("attacked"),
    en: "hit by attack",
  },
  { test: (s) => s.includes("cast") && s.includes("spell"), en: "creature casts spell" },
  {
    test: (s) => s.includes("saving throw") || s.includes("save"),
    en: "ally fails save",
  },
  {
    test: (s) => s.includes("enters your reach") || s.includes("enter your reach"),
    en: "creature enters your reach",
  },
  {
    test: (s) => s.includes("target other than you"),
    en: "creature hits another target",
  },
  { test: (s) => s.includes("damage"), en: "take damage" },
];

function oracleTrigger(description: string): string | undefined {
  const lower = description.toLowerCase();
  for (const p of ORACLE_PATTERNS) if (p.test(lower)) return p.en;
  const match = lower.match(/when\s+(?:you\s+|a\s+)?(.{5,25}?)(?:\.|,|$)/i);
  if (match?.[1]) {
    const short = match[1].trim();
    return short.length <= 25 ? short : short.split(/\s+/).slice(0, 4).join(" ");
  }
  return undefined;
}

interface ReactionRow {
  featureId: string;
  expectedEn: string | undefined; // the retired parser's EN output
  token: string | undefined; // the backfilled structured token
}

function collectReactionRows(): ReactionRow[] {
  const sources = [
    ...classFeatureIndex.values(),
    ...FEATS_BY_ID.values(),
    ...raceFeatureIndex.values(),
  ];
  const rows: ReactionRow[] = [];
  for (const src of sources) {
    const actions = src.mechanics?.actions;
    if (!actions) continue;
    const ref = srdRefForFeatureSource(src);
    actions.forEach((action, i) => {
      if (action.type !== "reaction") return;
      const key = srdKey(ref.key, "mechanics", "actions", String(i));
      const descEn = srdEn(ref.kind, key, "description") ?? "";
      rows.push({
        featureId: src.id,
        expectedEn: oracleTrigger(descEn),
        token: action.trigger,
      });
    });
  }
  return rows;
}

const ROWS = collectReactionRows();

// Three features whose RETIRED-parser output was WRONG — the mechanics audit
// (M06 World Tree, M09 Chilling Retribution, M21 Beguiling Twist) found the prose
// parser mis-derived the trigger (each matched the generic "saving throw" pattern
// and emitted "ally fails save"). Their structured token now intentionally
// CORRECTS the parser rather than reproducing it, so the equivalence check asserts
// the corrected EN for these three, not the (buggy) oracle output.
const CORRECTED_TRIGGERS: Record<string, string> = {
  "barbarian-world-tree-branches-of-the-tree": "creature starts its turn near you",
  "ranger-fey-wanderer-beguiling-twist": "creature resists charm or fear",
  "ranger-winter-walker-chilling-retribution": "take damage",
};

describe("structured reaction trigger — equivalence with the retired parser", () => {
  it("enumerates every reaction action (guards against a vacuous pass)", () => {
    // 55 reaction actions live in the pack-composed data today (7 in the public
    // SRD 5.2.1 subset); never expect FEWER (a drop means an enumeration
    // regression). New reaction actions only raise this.
    expect(ROWS.length).toBeGreaterThanOrEqual(PACK_COMPOSED ? 55 : 7);
  });

  it.each(ROWS.map((r) => [r.featureId, r] as const))(
    "%s — structured token resolves to the SAME EN the parser produced",
    (_id, row) => {
      const structuredEn = row.token
        ? localizeText(uiText(`combat.reactionTrigger_${row.token}`), "en")
        : undefined;
      // For the three audit-corrected features the structured token deliberately
      // diverges from the (wrong) parser output — assert the corrected EN instead.
      const expectedEn = CORRECTED_TRIGGERS[row.featureId] ?? row.expectedEn;
      expect(
        structuredEn,
        `${row.featureId}: structured trigger EN ("${structuredEn ?? "—"}") must equal the ` +
          `expected output ("${expectedEn ?? "—"}"). A mismatch means the ` +
          `backfilled \`trigger\` token is wrong (visible EN regression).`
      ).toBe(expectedEn);
    }
  );
});

describe("structured reaction trigger — IT is a real translation (no EN-as-IT leak)", () => {
  // Every DISTINCT backfilled token, deduped.
  const tokens = [
    ...new Set(ROWS.map((r) => r.token).filter((t): t is string => Boolean(t))),
  ];

  it("covers every distinct backfilled token", () => {
    expect(tokens.length).toBeGreaterThan(0);
  });

  it.each(tokens.map((t) => [t] as const))(
    "combat.reactionTrigger_%s — IT differs from EN (closes the litText leak)",
    (token) => {
      const en = localizeText(uiText(`combat.reactionTrigger_${token}`), "en");
      const it = localizeText(uiText(`combat.reactionTrigger_${token}`), "it");
      expect(en.length).toBeGreaterThan(0);
      expect(it.length).toBeGreaterThan(0);
      expect(
        it,
        `combat.reactionTrigger_${token}: the IT value ("${it}") is byte-identical to EN ` +
          `("${en}") — an English-as-IT leak (the exact litText fallback this refactor removes). ` +
          `Translate it (golden-rule-9 cascade).`
      ).not.toBe(en);
    }
  );
});

// ── The RETIRED SPELL parser, replicated as the equivalence ORACLE ───────────
// This is the exact `extractSpellTrigger` + `SPELL_TRIGGER_PATTERNS` logic that
// was deleted from `smart-tracker.ts`. It exists ONLY here, as the ground truth
// the structured `reactionTrigger` backfill must reproduce over each spell's
// canonical EN `castingTime`. It must NEVER be re-introduced into `src/`.
const SPELL_ORACLE_PATTERNS: Array<{ test: (s: string) => boolean; en: string }> = [
  { test: (s) => s.includes("casting a spell"), en: "creature casts spell" },
  { test: (s) => s.includes("hit by an attack"), en: "hit by attack" },
  { test: (s) => s.includes("targeted by"), en: "targeted by attack" },
  { test: (s) => s.includes("fall"), en: "creature falls" },
  { test: (s) => s.includes("fail") && s.includes("save"), en: "fail a save" },
  { test: (s) => s.includes("damage"), en: "take damage" },
];

function oracleSpellTrigger(castingTime: string): string | undefined {
  const full = castingTime.toLowerCase();
  for (const p of SPELL_ORACLE_PATTERNS) if (p.test(full)) return p.en;
  const match = full.match(/when\s+(?:you\s+)?(.+)/i);
  if (match?.[1]) {
    const short = match[1].replace(/\.$/, "").trim();
    return short.length <= 25 ? short : short.split(/\s+/).slice(0, 4).join(" ");
  }
  return undefined;
}

interface SpellReactionRow {
  spellId: string;
  expectedEn: string | undefined; // the retired parser's EN output
  token: string | undefined; // the backfilled structured token
}

// Every reaction spell — the smart-tracker derives a `"reaction"` action TYPE from
// a `castingTime` that includes "reaction", which is exactly when it consulted the
// retired parser. Mirror that gate here so the oracle runs on the same set.
const SPELL_ROWS: SpellReactionRow[] = spells
  .filter((s) => s.castingTime.toLowerCase().includes("reaction"))
  .map((s) => ({
    spellId: s.id,
    expectedEn: oracleSpellTrigger(s.castingTime),
    token: s.reactionTrigger,
  }));

describe("structured SPELL reaction trigger — equivalence with the retired parser", () => {
  it("enumerates every reaction spell (guards against a vacuous pass)", () => {
    // 5 reaction spells live in the pack-composed data today (feather-fall,
    // hellish-rebuke, shield, backlash, counterspell — backlash is PACK content,
    // leaving 4 in the public SRD subset); never expect FEWER. New reaction
    // spells only raise this.
    expect(SPELL_ROWS.length).toBeGreaterThanOrEqual(PACK_COMPOSED ? 5 : 4);
  });

  it("at least one reaction spell carries a structured trigger token", () => {
    // Counterspell — the one spell whose `castingTime` prose the parser matched.
    expect(SPELL_ROWS.some((r) => r.token != null)).toBe(true);
  });

  it.each(SPELL_ROWS.map((r) => [r.spellId, r] as const))(
    "%s — structured token resolves to the SAME EN the parser produced",
    (_id, row) => {
      const structuredEn = row.token
        ? localizeText(uiText(`combat.reactionTrigger_${row.token}`), "en")
        : undefined;
      expect(
        structuredEn,
        `${row.spellId}: structured trigger EN ("${structuredEn ?? "—"}") must equal the ` +
          `retired \`extractSpellTrigger\` output ("${row.expectedEn ?? "—"}"). A mismatch ` +
          `means the backfilled \`reactionTrigger\` token is wrong (visible EN regression).`
      ).toBe(row.expectedEn);
    }
  );
});

describe("structured SPELL reaction trigger — IT is a real translation (no EN-as-IT leak)", () => {
  const tokens = [
    ...new Set(SPELL_ROWS.map((r) => r.token).filter((t): t is string => Boolean(t))),
  ];

  it("covers every distinct backfilled spell token", () => {
    expect(tokens.length).toBeGreaterThan(0);
  });

  it.each(tokens.map((t) => [t] as const))(
    "combat.reactionTrigger_%s — IT differs from EN (closes the litText leak)",
    (token) => {
      const en = localizeText(uiText(`combat.reactionTrigger_${token}`), "en");
      const it = localizeText(uiText(`combat.reactionTrigger_${token}`), "it");
      expect(en.length).toBeGreaterThan(0);
      expect(it.length).toBeGreaterThan(0);
      expect(
        it,
        `combat.reactionTrigger_${token}: the IT value ("${it}") is byte-identical to EN ` +
          `("${en}") — an English-as-IT leak (the exact litText fallback this refactor removes). ` +
          `Translate it (golden-rule-9 cascade).`
      ).not.toBe(en);
    }
  );
});

describe("structured reaction trigger — the prose parsers are GONE (golden rule 10)", () => {
  const smartTracker = readFileSync(
    fileURLToPath(new URL("../../src/lib/smart-tracker.ts", import.meta.url)),
    "utf8"
  );

  it("no `extractTrigger` parser remains in smart-tracker.ts", () => {
    expect(smartTracker).not.toMatch(/\bextractTrigger\b/);
  });

  it("no `FEATURE_TRIGGER_PATTERNS` table remains in smart-tracker.ts", () => {
    expect(smartTracker).not.toMatch(/\bFEATURE_TRIGGER_PATTERNS\b/);
  });

  it("no `extractSpellTrigger` parser remains in smart-tracker.ts", () => {
    expect(smartTracker).not.toMatch(/\bextractSpellTrigger\b/);
  });

  it("no `SPELL_TRIGGER_PATTERNS` table remains in smart-tracker.ts", () => {
    expect(smartTracker).not.toMatch(/\bSPELL_TRIGGER_PATTERNS\b/);
  });
});
