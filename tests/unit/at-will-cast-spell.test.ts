/**
 * `at-will-cast-spell` — the unbounded, slotless self-cast primitive (Warlock's
 * at-will Eldritch Invocations: Armor of Shadows → Mage Armor, Mask of Many
 * Faces → Disguise Self, …). Distinct from `free-cast-spell`, which models a
 * bounded N/rest tracker. This pins:
 *   1. the GRANT aggregates into `AggregatedGrants.atWillCasts` (dedupe + ability),
 *   2. the at-will invocation DATA carries the grant pair (always-prepared + at-will),
 *   3. the CONSUMER (`resolveSpellCastOptions` / `atWillCastSourcesForSpell`)
 *      surfaces an at-will (`kind: "mastery"`) row at base level only, and
 *   4. override-first: the at-will row never decrements a tracker / never upcasts.
 */
import { describe, expect, it } from "vitest";
import { srd } from "../_harness/loc";
import {
  evaluateGrants,
  maximizeDiceFormula,
  type Grant,
  type GrantSource,
} from "@/lib/grants";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { resolveGrantSourcesForInvocations } from "@/lib/resolve-grant-sources";
import {
  atWillCastSourcesForSpell,
  resolveSpellCastOptions,
} from "@/lib/views/spell-cast-sources";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

const LABELS = { mastery: "MASTERY", signature: "SIGNATURE" };

/** Every at-will invocation that grants a slotless self-cast, with its spell. */
const AT_WILL_INVOCATIONS: ReadonlyArray<readonly [string, string]> = [
  ["armor-of-shadows", "mage-armor"],
  ["ascendant-step", "levitate"],
  ["fiendish-vigor", "false-life"],
  ["mask-of-many-faces", "disguise-self"],
  ["master-of-myriad-forms", "alter-self"],
  ["misty-visions", "silent-image"],
  ["one-with-shadows", "invisibility"],
  ["otherworldly-leap", "jump"],
  ["visions-of-distant-realms", "arcane-eye"],
  ["whispers-of-the-grave", "speak-with-dead"],
  // Pact of the Chain: "You learn the Find Familiar spell and can cast it as a
  // Magic action without expending a spell slot." Same at-will primitive as the
  // others (the special familiar forms / familiar-attack are prose-only).
  ["pact-of-the-chain", "find-familiar"],
];

const src = (id: string, grants: Grant[]): GrantSource => ({
  id,
  name: { en: id, it: id },
  grants,
});

// ── 1. Evaluator: the grant aggregates into atWillCasts ──────────────────────

describe("evaluateGrants — at-will-cast-spell aggregate", () => {
  it("aggregates a single at-will cast with its source + caster ability", () => {
    const out = evaluateGrants([
      src("armor-of-shadows", [
        { type: "at-will-cast-spell", spellId: "mage-armor", casterAbility: "CHA" },
      ]),
    ]);
    expect(out.atWillCasts).toHaveLength(1);
    expect(out.atWillCasts[0]).toEqual({
      sourceId: "armor-of-shadows",
      spellId: "mage-armor",
      casterAbility: "CHA",
    });
  });

  it("empty aggregate has no at-will casts", () => {
    expect(evaluateGrants([]).atWillCasts).toEqual([]);
  });

  it("dedupes by spellId — two sources granting the same at-will spell yield one row", () => {
    const out = evaluateGrants([
      src("a", [
        { type: "at-will-cast-spell", spellId: "mage-armor", casterAbility: "CHA" },
      ]),
      src("b", [
        { type: "at-will-cast-spell", spellId: "mage-armor", casterAbility: "INT" },
      ]),
    ]);
    expect(out.atWillCasts).toHaveLength(1);
    // First source wins (CHA), the later INT grant is dropped.
    expect(out.atWillCasts[0]).toMatchObject({ sourceId: "a", casterAbility: "CHA" });
  });

  it("distinct spells each get a row", () => {
    const out = evaluateGrants([
      src("armor-of-shadows", [{ type: "at-will-cast-spell", spellId: "mage-armor" }]),
      src("mask-of-many-faces", [
        { type: "at-will-cast-spell", spellId: "disguise-self" },
      ]),
    ]);
    expect(out.atWillCasts.map((e) => e.spellId).sort()).toEqual([
      "disguise-self",
      "mage-armor",
    ]);
  });

  it("at-will-cast-spell is independent of free-cast-spell (no cross-contamination)", () => {
    const out = evaluateGrants([
      src("fey-touched", [
        {
          type: "free-cast-spell",
          spellId: "misty-step",
          chargesPerRest: 1,
          rest: "long",
        },
      ]),
      src("armor-of-shadows", [
        { type: "at-will-cast-spell", spellId: "mage-armor", casterAbility: "CHA" },
      ]),
    ]);
    expect(out.freeCasts).toHaveLength(1);
    expect(out.atWillCasts).toHaveLength(1);
    expect(out.freeCasts[0]?.spellId).toBe("misty-step");
    expect(out.atWillCasts[0]?.spellId).toBe("mage-armor");
  });
});

// ── 2. Data: the at-will invocations carry the grant pair ────────────────────

describe("at-will Eldritch Invocation data wiring", () => {
  it.each(AT_WILL_INVOCATIONS)(
    "%s grants always-prepared + at-will-cast of %s (CHA)",
    (invId, spellId) => {
      const inv = SRD_INVOCATIONS.find((i) => i.id === invId);
      expect(inv, `invocation ${invId} exists`).toBeDefined();
      const grants = inv?.grants ?? [];
      const atWill = grants.find(
        (g): g is Extract<Grant, { type: "at-will-cast-spell" }> =>
          g.type === "at-will-cast-spell"
      );
      const prepared = grants.find(
        (g): g is Extract<Grant, { type: "always-prepared-spell" }> =>
          g.type === "always-prepared-spell"
      );
      expect(atWill, `${invId} has an at-will-cast-spell grant`).toBeDefined();
      expect(atWill?.spellId).toBe(spellId);
      expect(atWill?.casterAbility).toBe("CHA");
      // Paired always-prepared makes the spell visible/prepared on the Spells page.
      expect(prepared, `${invId} pairs an always-prepared-spell grant`).toBeDefined();
      expect(prepared?.spellId).toBe(spellId);
    }
  );

  it("flows through resolveGrantSourcesForInvocations → evaluateGrants", () => {
    const sources = resolveGrantSourcesForInvocations([
      "armor-of-shadows",
      "mask-of-many-faces",
    ]);
    const out = evaluateGrants(sources);
    expect(out.atWillCasts.map((e) => e.spellId).sort()).toEqual([
      "disguise-self",
      "mage-armor",
    ]);
    // Both spells are also injected as always-prepared (visibility).
    expect(out.alwaysPrepared).toContain("mage-armor");
    expect(out.alwaysPrepared).toContain("disguise-self");
  });
});

// ── 3. Consumer: cast-options surfaces the at-will row ────────────────────────

function warlockWith(invocationIds: string[]): CharacterDoc {
  const c = structuredClone(MOCK_CHARACTER);
  // Isolate the invocation grant path: the only grant sources are the chosen
  // invocations (the mock's class features / equipment / maneuvers contribute
  // nothing to the at-will cast options under test).
  c.character.features = [];
  c.character.equipment = [];
  c.character.classes = c.character.classes.map((e, i) =>
    i === 0 ? { ...e, maneuverChoices: [], invocationChoices: invocationIds } : e
  );
  c.character.spellSlots = [{ level: 1, total: 2, pactMagic: true }];
  c.session.spellSlots = {};
  return c;
}

describe("atWillCastSourcesForSpell — consumer", () => {
  it("returns an at-will source labelled with the invocation name", () => {
    const c = warlockWith(["armor-of-shadows"]);
    const out = atWillCastSourcesForSpell(c, "mage-armor", "en");
    expect(out).toHaveLength(1);
    expect(out[0]?.sourceName).toBe("Armor of Shadows");
  });

  it("returns nothing for a spell no invocation grants at-will", () => {
    const c = warlockWith(["armor-of-shadows"]);
    expect(atWillCastSourcesForSpell(c, "fireball", "en")).toEqual([]);
  });

  it("returns nothing when the warlock hasn't chosen the invocation", () => {
    const c = warlockWith([]);
    expect(atWillCastSourcesForSpell(c, "mage-armor", "en")).toEqual([]);
  });
});

describe("resolveSpellCastOptions — at-will invocation row", () => {
  it("surfaces an at-will (mastery-kind) row at the spell's base level", () => {
    const c = warlockWith(["armor-of-shadows"]);
    // Mage Armor base level 1.
    const opts = resolveSpellCastOptions(c, "mage-armor", 1, true, "en", LABELS);
    const atWill = opts.find((o) => o.kind === "mastery");
    expect(atWill).toBeDefined();
    if (atWill?.kind === "mastery") {
      expect(atWill.sourceName).toBe("Armor of Shadows");
      expect(atWill.level).toBe(1);
    }
    // The at-will row sorts AFTER the slot rows (default pick stays the slot cast).
    expect(opts[opts.length - 1]?.kind).toBe("mastery");
  });

  it("override-first: the at-will row carries NO tracker / charge counter (unbounded)", () => {
    const c = warlockWith(["armor-of-shadows"]);
    const opts = resolveSpellCastOptions(c, "mage-armor", 1, true, "en", LABELS);
    const atWill = opts.find((o) => o.kind === "mastery");
    // A "mastery"-kind row has no `remaining`/`total`/`sourceId`/`rest` — it is
    // distinct from a tracker-bound `free-cast` row, so it never decrements.
    expect(atWill && "remaining" in atWill).toBe(false);
    expect(atWill && "rest" in atWill).toBe(false);
    expect(opts.some((o) => o.kind === "free-cast")).toBe(false);
  });

  it("the at-will row appears ONLY at the spell's base level (never on an upcast)", () => {
    const c = warlockWith(["armor-of-shadows"]);
    c.character.spellSlots = [
      { level: 1, total: 2, pactMagic: true },
      { level: 2, total: 1, pactMagic: true },
    ];
    // atBaseLevel = false → no at-will / mastery row.
    const upcast = resolveSpellCastOptions(c, "mage-armor", 2, false, "en", LABELS);
    expect(upcast.some((o) => o.kind === "mastery")).toBe(false);
    // atBaseLevel = true → the at-will row is present.
    const atBase = resolveSpellCastOptions(c, "mage-armor", 1, true, "en", LABELS);
    expect(atBase.some((o) => o.kind === "mastery")).toBe(true);
  });

  it("with zero slots remaining, the at-will row is still offered (slotless)", () => {
    const c = warlockWith(["armor-of-shadows"]);
    c.session.spellSlots = { "pact-1": { used: 2 } }; // all pact slots spent (B3: pact pool keys `pact-N`)
    const opts = resolveSpellCastOptions(c, "mage-armor", 1, true, "en", LABELS);
    expect(opts.some((o) => o.kind === "slot")).toBe(false);
    expect(opts.some((o) => o.kind === "mastery")).toBe(true);
  });
});

// ── 4. Pact of the Chain: slotless Find Familiar cast ─────────────────────────

describe("Pact of the Chain — slotless at-will Find Familiar", () => {
  it("data wires both grants for find-familiar (CHA), prose keeps the special forms", () => {
    const inv = SRD_INVOCATIONS.find((i) => i.id === "pact-of-the-chain");
    expect(inv, "pact-of-the-chain exists").toBeDefined();
    const grants = inv?.grants ?? [];
    const atWill = grants.find(
      (g): g is Extract<Grant, { type: "at-will-cast-spell" }> =>
        g.type === "at-will-cast-spell"
    );
    const prepared = grants.find(
      (g): g is Extract<Grant, { type: "always-prepared-spell" }> =>
        g.type === "always-prepared-spell"
    );
    expect(atWill?.spellId).toBe("find-familiar");
    expect(atWill?.casterAbility).toBe("CHA");
    expect(prepared?.spellId).toBe("find-familiar");
    expect(prepared?.spellAbility).toBe("CHA");
    // The special familiar forms + "forgo an attack" remain prose (no stat-block
    // engine in scope) — they must NOT have produced extra grants.
    expect(grants).toHaveLength(2);
    expect(srd("invocation", inv?.id ?? "", "description", "en")).toContain(
      "special forms"
    );
  });

  it("aggregates through resolveGrantSourcesForInvocations → evaluateGrants", () => {
    const out = evaluateGrants(resolveGrantSourcesForInvocations(["pact-of-the-chain"]));
    expect(out.atWillCasts).toHaveLength(1);
    expect(out.atWillCasts[0]).toMatchObject({
      sourceId: "pact-of-the-chain",
      spellId: "find-familiar",
      casterAbility: "CHA",
    });
    // Paired always-prepared makes Find Familiar visible on the Spells page.
    expect(out.alwaysPrepared).toContain("find-familiar");
  });

  it("consumer surfaces an at-will (mastery-kind) row for Find Familiar at base level", () => {
    const c = warlockWith(["pact-of-the-chain"]);
    // Find Familiar is a level-1 spell.
    const opts = resolveSpellCastOptions(c, "find-familiar", 1, true, "en", LABELS);
    const atWill = opts.find((o) => o.kind === "mastery");
    expect(atWill).toBeDefined();
    if (atWill?.kind === "mastery") {
      expect(atWill.sourceName).toBe("Pact of the Chain");
      expect(atWill.level).toBe(1);
    }
    // The slotless cast sorts after the slot rows so it isn't the default pick.
    expect(opts[opts.length - 1]?.kind).toBe("mastery");
  });

  it("override-first: the Find Familiar at-will row is unbounded (no tracker / charges)", () => {
    const c = warlockWith(["pact-of-the-chain"]);
    const opts = resolveSpellCastOptions(c, "find-familiar", 1, true, "en", LABELS);
    const atWill = opts.find((o) => o.kind === "mastery");
    expect(atWill && "remaining" in atWill).toBe(false);
    expect(atWill && "rest" in atWill).toBe(false);
    expect(opts.some((o) => o.kind === "free-cast")).toBe(false);
  });

  it("offered even with every spell slot already spent (truly slotless)", () => {
    const c = warlockWith(["pact-of-the-chain"]);
    c.session.spellSlots = { "pact-1": { used: 2 } }; // all pact slots spent (B3: pact pool keys `pact-N`)
    const opts = resolveSpellCastOptions(c, "find-familiar", 1, true, "en", LABELS);
    expect(opts.some((o) => o.kind === "slot")).toBe(false);
    expect(opts.some((o) => o.kind === "mastery")).toBe(true);
  });

  it("no Find Familiar at-will row when the warlock hasn't taken Pact of the Chain", () => {
    const c = warlockWith([]);
    expect(atWillCastSourcesForSpell(c, "find-familiar", "en")).toEqual([]);
  });
});

// ── 5. Fiendish Vigor — auto-max Temporary HP on the at-will False Life cast ──

describe("maximizeDiceFormula — pure dice ceiling (no RNG)", () => {
  it("maximizes 2024 False Life (2d4+4 → 12)", () => {
    expect(maximizeDiceFormula("2d4+4")).toBe(12);
  });

  it("is whitespace-tolerant ('2d4 + 4' → 12)", () => {
    expect(maximizeDiceFormula("2d4 + 4")).toBe(12);
  });

  it("maximizes a single die (1d4 → 4)", () => {
    expect(maximizeDiceFormula("1d4")).toBe(4);
  });

  it("sums a bare flat term (no dice) ('5' → 5)", () => {
    expect(maximizeDiceFormula("5")).toBe(5);
  });

  it("honours a subtractive flat term (2d6-1 → 11)", () => {
    expect(maximizeDiceFormula("2d6-1")).toBe(11);
  });

  it("sums multiple dice terms (1d8+1d6 → 14)", () => {
    expect(maximizeDiceFormula("1d8+1d6")).toBe(14);
  });

  it("returns 0 for an unparseable formula", () => {
    expect(maximizeDiceFormula("no dice here")).toBe(0);
  });
});

describe("Fiendish Vigor — auto-max temp HP", () => {
  it("data: Fiendish Vigor's at-will False Life carries autoMaxTempHpFormula '2d4+4'", () => {
    const inv = SRD_INVOCATIONS.find((i) => i.id === "fiendish-vigor");
    expect(inv, "fiendish-vigor exists").toBeDefined();
    const atWill = (inv?.grants ?? []).find(
      (g): g is Extract<Grant, { type: "at-will-cast-spell" }> =>
        g.type === "at-will-cast-spell"
    );
    expect(atWill?.spellId).toBe("false-life");
    expect(atWill?.autoMaxTempHpFormula).toBe("2d4+4");
  });

  it("evaluator: the aggregated entry carries the resolved maximized total (12)", () => {
    const out = evaluateGrants([
      src("fiendish-vigor", [
        {
          type: "at-will-cast-spell",
          spellId: "false-life",
          casterAbility: "CHA",
          autoMaxTempHpFormula: "2d4+4",
        },
      ]),
    ]);
    expect(out.atWillCasts).toHaveLength(1);
    expect(out.atWillCasts[0]).toEqual({
      sourceId: "fiendish-vigor",
      spellId: "false-life",
      casterAbility: "CHA",
      autoMaxTempHp: 12,
    });
  });

  it("a plain at-will cast (no formula) carries NO autoMaxTempHp field", () => {
    const out = evaluateGrants([
      src("armor-of-shadows", [
        { type: "at-will-cast-spell", spellId: "mage-armor", casterAbility: "CHA" },
      ]),
    ]);
    expect(out.atWillCasts[0]).not.toHaveProperty("autoMaxTempHp");
  });

  it("flows through resolveGrantSourcesForInvocations → evaluateGrants (12)", () => {
    const out = evaluateGrants(resolveGrantSourcesForInvocations(["fiendish-vigor"]));
    const entry = out.atWillCasts.find((e) => e.spellId === "false-life");
    expect(entry?.autoMaxTempHp).toBe(12);
    // False Life is also injected as always-prepared (visible on the Spells page).
    expect(out.alwaysPrepared).toContain("false-life");
  });

  it("consumer: the False Life at-will row surfaces the maximized temp HP (12)", () => {
    const c = warlockWith(["fiendish-vigor"]);
    const sources = atWillCastSourcesForSpell(c, "false-life", "en");
    expect(sources).toHaveLength(1);
    expect(sources[0]?.sourceName).toBe("Fiendish Vigor");
    expect(sources[0]?.autoMaxTempHp).toBe(12);
  });

  it("consumer: a non-temp-HP at-will source carries no autoMaxTempHp on its row", () => {
    const c = warlockWith(["armor-of-shadows"]);
    const sources = atWillCastSourcesForSpell(c, "mage-armor", "en");
    expect(sources[0]?.autoMaxTempHp).toBeUndefined();
  });

  it("override-first: the auto-max row is still a tracker-less at-will (no decrement)", () => {
    const c = warlockWith(["fiendish-vigor"]);
    // False Life is a level-1 spell.
    const opts = resolveSpellCastOptions(c, "false-life", 1, true, "en", LABELS);
    const atWill = opts.find((o) => o.kind === "mastery");
    expect(atWill).toBeDefined();
    // No tracker / charge counter — the maximized temp HP is informational; the
    // engine never auto-applies it, and the slotless cast is unbounded.
    expect(atWill && "remaining" in atWill).toBe(false);
    expect(atWill && "rest" in atWill).toBe(false);
    expect(opts.some((o) => o.kind === "free-cast")).toBe(false);
  });
});
