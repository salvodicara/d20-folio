/**
 * Wizard L20 Signature Spells picker — pure helpers.
 *
 * 2024 RAW: Two 3rd-level wizard spells from the spellbook, always
 * prepared (don't count against limit), each castable once at 3rd level
 * without a spell slot per short or long rest.
 */
import { describe, expect, it } from "vitest";
import {
  applySignatureSpellsPicks,
  eligibleSignatureSpells,
  emptySignatureSpellsPicks,
  hasEligibleSignatureSpells,
  isSignatureSpellsComplete,
} from "@/lib/signature-spells-pick";
import { classFeatureIndex } from "@/data/classes";
import { isSpellCombatCastable } from "@/lib/spell-combat-castable";
import type { SrdSpellRef, CustomSpell } from "@/types/character";

describe("Signature Spells — single source of truth (no duplicate choice-spell picker)", () => {
  const feature = classFeatureIndex.get("wizard-signature-spells");

  it("the L20 feature keeps its 2-use short-rest free-cast pool tracker", () => {
    // The dedicated `signature-spells-pick` picker debits THIS tracker; it is the
    // free-cast pool, so the feature must keep it (rule 6 — one source).
    expect(feature?.mechanics?.tracker).toMatchObject({
      total: "2",
      recovery: "short-rest",
    });
  });

  it("declares NO generic `choice-spell` grant — that would be a parallel picker (rules 3/6/10)", () => {
    // Signature Spells is already automated by the spellbook-constrained dedicated
    // picker. A `choice-spell` grant would surface a SECOND, unconstrained picker
    // for the same feature — forbidden. Guard so it is never re-introduced.
    const hasChoiceSpell = (feature?.grants ?? []).some((g) => g.type === "choice-spell");
    expect(hasChoiceSpell).toBe(false);
  });

  it("a signed spell is combat-castable on a prepared caster via the `wizardSignatureSpell` flag", () => {
    // Proves the existing flag (not a free-cast grant) is what keeps a 3rd-level
    // signature spell castable without being in the prepared budget.
    expect(
      isSpellCombatCastable({
        level: 3,
        preparedCaster: true,
        prepared: false,
        wizardSignatureSpell: true,
      })
    ).toBe(true);
  });
});

describe("isSignatureSpellsComplete", () => {
  it("requires both slots filled and the picks distinct", () => {
    expect(isSignatureSpellsComplete(emptySignatureSpellsPicks())).toBe(false);
    expect(isSignatureSpellsComplete({ first: "fireball" })).toBe(false);
    expect(isSignatureSpellsComplete({ first: "fireball", second: "fireball" })).toBe(
      false
    );
    expect(isSignatureSpellsComplete({ first: "fireball", second: "counterspell" })).toBe(
      true
    );
  });
});

describe("eligibleSignatureSpells", () => {
  it("returns only L3 SRD spells from the spellbook", () => {
    const spells: (SrdSpellRef | CustomSpell)[] = [
      { srdId: "fireball" },
      { srdId: "counterspell" },
      { srdId: "magic-missile" }, // L1
      { srdId: "scorching-ray" }, // L2
      { srdId: "ice-storm" }, // L4
    ];
    const options = eligibleSignatureSpells(spells);
    const ids = options.map((o) => o.id).sort();
    expect(ids).toContain("fireball");
    expect(ids).toContain("counterspell");
    expect(ids).not.toContain("magic-missile");
    expect(ids).not.toContain("scorching-ray");
    expect(ids).not.toContain("ice-storm");
  });

  it("ignores custom (homebrew) spells", () => {
    const spells: (SrdSpellRef | CustomSpell)[] = [
      { srdId: "fireball" },
      {
        custom: true,
        name: "Homebrew Boom",
        level: 3,
        school: "evocation",
        castingTime: "1 action",
        range: "60 ft",
        components: { v: true, s: false, m: false },
        duration: "Instantaneous",
        concentration: false,
        description: "",
      },
    ];
    expect(eligibleSignatureSpells(spells).map((o) => o.id)).toEqual(["fireball"]);
  });
});

describe("hasEligibleSignatureSpells", () => {
  it("true when at least one L3 SRD spell is on the character", () => {
    expect(hasEligibleSignatureSpells([{ srdId: "fireball" }])).toBe(true);
    expect(hasEligibleSignatureSpells([{ srdId: "magic-missile" }])).toBe(false);
  });

  it("false on empty character", () => {
    expect(hasEligibleSignatureSpells([])).toBe(false);
  });
});

describe("applySignatureSpellsPicks", () => {
  it("flags both chosen spells with wizardSignatureSpell + alwaysPrepared", () => {
    const spells: SrdSpellRef[] = [
      { srdId: "fireball" },
      { srdId: "counterspell" },
      { srdId: "lightning-bolt" },
    ];
    const after = applySignatureSpellsPicks(spells, {
      first: "fireball",
      second: "counterspell",
    });
    const fb = after.find((s) => !("custom" in s) && s.srdId === "fireball");
    const cs = after.find((s) => !("custom" in s) && s.srdId === "counterspell");
    const lb = after.find((s) => !("custom" in s) && s.srdId === "lightning-bolt");
    expect(fb).toMatchObject({ wizardSignatureSpell: true, alwaysPrepared: true });
    expect(cs).toMatchObject({ wizardSignatureSpell: true, alwaysPrepared: true });
    // Non-chosen spells stay un-flagged
    expect(
      lb && "wizardSignatureSpell" in lb ? lb.wizardSignatureSpell : undefined
    ).toBeUndefined();
  });

  it("clears wizardSignatureSpell flag on previously-signed spells when picks change", () => {
    const spells: SrdSpellRef[] = [
      { srdId: "fireball", wizardSignatureSpell: true, alwaysPrepared: true },
      { srdId: "counterspell" },
    ];
    const after = applySignatureSpellsPicks(spells, { first: "counterspell" });
    const fb = after.find((s) => !("custom" in s) && s.srdId === "fireball");
    // Signature flag is cleared; alwaysPrepared is conservatively kept
    // (could have come from another source — player edits manually if not).
    expect(
      fb && "wizardSignatureSpell" in fb ? fb.wizardSignatureSpell : undefined
    ).toBeUndefined();
  });

  it("is idempotent — reapplying same picks produces equal output", () => {
    const spells: SrdSpellRef[] = [{ srdId: "fireball" }, { srdId: "counterspell" }];
    const once = applySignatureSpellsPicks(spells, {
      first: "fireball",
      second: "counterspell",
    });
    const twice = applySignatureSpellsPicks(once, {
      first: "fireball",
      second: "counterspell",
    });
    expect(twice).toEqual(once);
  });

  it("leaves custom spells untouched", () => {
    const custom: CustomSpell = {
      custom: true,
      name: "Homebrew",
      level: 3,
      school: "evocation",
      castingTime: "1 action",
      range: "Self",
      components: { v: true, s: false, m: false },
      duration: "Instantaneous",
      concentration: false,
      description: "",
    };
    const spells: (SrdSpellRef | CustomSpell)[] = [custom, { srdId: "fireball" }];
    const after = applySignatureSpellsPicks(spells, { first: "fireball" });
    expect(after[0]).toBe(custom);
  });
});
