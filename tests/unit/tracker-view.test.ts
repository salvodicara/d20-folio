/**
 * Tracker / Play-surface presenter (`src/lib/views/tracker-view.ts`) — R6+R3
 * SLICE 5 (Part B).
 *
 * Pins the §3.3 display contract the Play tab depends on: every play-surface
 * view-model the presenter owns resolves to ready-to-render strings in BOTH
 * locales, with ZERO BiText left for the surface to read — action upcast copy,
 * the concentration label, condition chips/options, advantage + roll-floor
 * notes, and the deduped activatable-feature toggles. Fast-lane: pure, no React,
 * no Firebase. Table-driven across EN + IT; exercised over the Champion
 * fighter scenario (features + weapons) and a Fiend Warlock (caster).
 */
import { describe, it, expect } from "vitest";
import { litText } from "@/lib/loc-text";
import { concentrationValue } from "@/lib/concentration";
import {
  actionHigherLevels,
  activatableToggles,
  advantageChipVMs,
  auraVMs,
  concentrationLabel,
  conditionChips,
  conditionLabel,
  conditionOptions,
  grantSourceLabel,
  localizeTrackerRecovery,
  resolveAuraDice,
  rollFloorVMs,
} from "@/lib/views/tracker-view";
import type { AuraClause } from "@/lib/grants";
import { customConcentrationValue } from "@/lib/concentration";
import { resolveActions } from "@/lib/smart-tracker";
import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import type { ActivatableGroup, RollFloorClause } from "@/lib/grants";
import type { AdvantageChip } from "@/lib/views/sheet-view";

const LOCALES = ["en", "it"] as const;

function scenario(id: keyof typeof DEV_SCENARIOS) {
  const spec = DEV_SCENARIOS[id];
  if (!spec) throw new Error(`missing dev scenario: ${id}`);
  return buildScenario(spec);
}
const fighter = () => scenario("champion");
const warlock = () => scenario("magical-cunning-warlock");

describe("tracker-view — actionHigherLevels", () => {
  it.each(LOCALES)("returns null for weapons / features / cantrips (%s)", (locale) => {
    const actions = resolveActions(fighter());
    for (const a of actions) {
      if (a.source === "weapon" || a.source === "feature") {
        expect(actionHigherLevels(a, locale)).toBeNull();
      }
      if (a.source === "spell" && (a.spellLevel ?? 0) === 0) {
        expect(actionHigherLevels(a, locale)).toBeNull();
      }
    }
  });

  it("resolves upcast copy for a leveled spell and differs by locale", () => {
    // Hex is a leveled Warlock spell with "At Higher Levels" text.
    const hexEn = resolveActions(warlock()).find((a) => a.spellId === "hex");
    const hexIt = resolveActions(warlock()).find((a) => a.spellId === "hex");
    expect(hexEn).toBeDefined();
    expect(hexIt).toBeDefined();
    const higherEn = hexEn ? actionHigherLevels(hexEn, "en") : null;
    const higherIt = hexIt ? actionHigherLevels(hexIt, "it") : null;
    expect(higherEn).toBeTruthy();
    expect(higherIt).toBeTruthy();
    expect(higherEn).not.toBe(higherIt);
  });
});

describe("tracker-view — localizeTrackerRecovery", () => {
  const t = (key: string) => key;

  // The ONE shared full-word recovery formatter (golden rules 2 + 6): every
  // Recovery token maps to a `features.recover*` key or an honest null — a raw
  // token ("long-rest") can never pass through to a surface.
  it.each([
    ["long-rest", "features.recoverLongRest"],
    ["dawn", "features.recoverLongRest"],
    ["short-rest", "features.recoverShortRest"],
    ["short-or-long-rest", "features.recoverShortRest"],
    ["manual", "features.recoverManual"],
  ] as const)("%s → %s", (recovery, expected) => {
    expect(localizeTrackerRecovery(recovery, t)).toBe(expected);
  });

  it("returns null (honest blank) for per-turn and undefined", () => {
    expect(localizeTrackerRecovery("per-turn", t)).toBeNull();
    expect(localizeTrackerRecovery(undefined, t)).toBeNull();
  });
});

describe("tracker-view — concentrationLabel", () => {
  // Concentration is stored as the spell's STABLE srdId (golden rule 7); the
  // label resolves that id to the active-locale spell name.
  it.each([
    ["hex", "en", "Hex"],
    ["hex", "it", "Sortilegio"],
    ["hypnotic-pattern", "en", "Hypnotic Pattern"],
    ["hypnotic-pattern", "it", "Trama Ipnotica"],
  ] as const)("localizes the srdId %s (%s) → %s", (id, locale, expected) => {
    expect(concentrationLabel(id, locale)).toBe(expected);
  });

  it("shows a custom spell's name (behind the `custom:` marker) verbatim", () => {
    // A custom spell carries no srdId — its user-authored name is stored marked and
    // shown as-is (nothing to localize; not a leak).
    expect(concentrationLabel("custom:My Homebrew Hex", "it")).toBe("My Homebrew Hex");
    expect(concentrationLabel("", "en")).toBe("");
  });

  it("NO leak by design — a bare (non-id, non-custom) value THROWS, never English-verbatim", () => {
    // A bare SRD name (a legacy pre-id value, or a typo) is neither a known srdId nor
    // a `custom:` marker → the THROWING resolver throws in dev/test (the locale-sweep
    // lock catches it) instead of silently rendering the English title in IT.
    expect(() => concentrationLabel("Hypnotic Pattern", "it")).toThrow();
  });

  it("concentrationValue stamps the stored form: the srdId, else a `custom:`-marked name", () => {
    expect(concentrationValue("hex")).toBe("hex");
    expect(customConcentrationValue("My Homebrew Hex")).toBe("custom:My Homebrew Hex");
  });
});

describe("tracker-view — grantSourceLabel", () => {
  it.each([
    // class feature srdId
    ["barbarian-rage", "en", "Rage"],
    // feat srdId
    ["boon-of-the-night-spirit", "en", "Boon of the Night Spirit"],
    // S4 — race-trait session id (`race:<id>:<trait.id>`) localizes both ways
    ["race:orc:relentless-endurance", "en", "Relentless Endurance"],
    ["race:orc:relentless-endurance", "it", "Resistenza Implacabile"],
  ] as const)("localizes source %s (%s) → %s", (id, locale, expected) => {
    expect(grantSourceLabel(id, locale)).toBe(expected);
  });

  it("falls back to the raw id for an unknown / malformed source", () => {
    expect(grantSourceLabel("totally-unknown-source", "en")).toBe(
      "totally-unknown-source"
    );
    expect(grantSourceLabel("race:nonexistent:Whatever", "en")).toBe(
      "race:nonexistent:Whatever"
    );
  });
});

describe("tracker-view — condition VMs", () => {
  it.each([
    ["frightened", "en", "Frightened"],
    ["frightened", "it", "Spaventato"],
  ] as const)("conditionLabel %s (%s) → %s", (id, locale, expected) => {
    expect(conditionLabel(id, locale)).toBe(expected);
  });

  it("falls back to the raw id for an unknown condition", () => {
    expect(conditionLabel("not-a-condition", "en")).toBe("not-a-condition");
  });

  it.each(LOCALES)("conditionChips localizes + carries hue tokens (%s)", (locale) => {
    const chips = conditionChips(["frightened", "poisoned"], locale);
    expect(chips).toHaveLength(2);
    const [first, second] = chips;
    expect(first?.id).toBe("frightened");
    expect(first?.label).toBe(locale === "it" ? "Spaventato" : "Frightened");
    expect(first?.color).toContain("--cond-frightened");
    expect(first?.ink).toContain("--cond-frightened");
    // Order preserved.
    expect(second?.id).toBe("poisoned");
  });

  it("conditionChips falls back to the raw id label for unknowns", () => {
    const [chip] = conditionChips(["mystery"], "en");
    expect(chip?.label).toBe("mystery");
  });

  it.each(LOCALES)("conditionOptions returns every SRD condition (%s)", (locale) => {
    const opts = conditionOptions(locale);
    expect(opts.length).toBeGreaterThan(10);
    const frightened = opts.find((o) => o.id === "frightened");
    expect(frightened?.label).toBe(locale === "it" ? "Spaventato" : "Frightened");
  });
});

describe("tracker-view — advantageChipVMs", () => {
  const dangerSense: AdvantageChip = {
    sourceId: "danger-sense",
    mode: "advantage",
    rollType: "save",
    vs: "dex-save",
    description: litText({ en: "Advantage on DEX saves", it: "Vantaggio ai TS su DES" }),
  };

  it.each(LOCALES)("localizes the chip description (%s)", (locale) => {
    const [vm] = advantageChipVMs([dangerSense], locale);
    expect(vm?.description).toBe(
      locale === "it" ? "Vantaggio ai TS su DES" : "Advantage on DEX saves"
    );
    // The id-bearing fields survive untouched.
    expect(vm?.sourceId).toBe("danger-sense");
    expect(vm?.mode).toBe("advantage");
  });

  it("preserves order (advantages then disadvantages, as derived)", () => {
    const disadv: AdvantageChip = {
      sourceId: "frightened",
      mode: "disadvantage",
      rollType: "attack",
      vs: "attacks",
      description: litText({
        en: "Disadvantage on attacks",
        it: "Svantaggio agli attacchi",
      }),
    };
    const vms = advantageChipVMs([dangerSense, disadv], "en");
    expect(vms.map((v) => v.mode)).toEqual(["advantage", "disadvantage"]);
  });
});

describe("tracker-view — rollFloorVMs", () => {
  const floors: RollFloorClause[] = [
    {
      sourceId: "reliable-talent",
      rollType: "check",
      floor: 10,
      appliesTo: "proficient",
      description: litText({
        en: "Treat a d20 ≤9 as 10",
        it: "Tratta un d20 ≤9 come 10",
      }),
    },
  ];

  it.each(LOCALES)("localizes the floor description (%s)", (locale) => {
    const [vm] = rollFloorVMs(floors, locale);
    expect(vm?.sourceId).toBe("reliable-talent");
    expect(vm?.description).toBe(
      locale === "it" ? "Tratta un d20 ≤9 come 10" : "Treat a d20 ≤9 as 10"
    );
  });
});

describe("tracker-view — auraVMs S12b level-scaled die (Circle-of-Stars Archer/Chalice)", () => {
  // The Stars Archer ray + Chalice heal die: 1d8 from L3, 2d8 from L10 (Twinkling
  // Constellations). `auraVMs` folds `diceByLevel` down to the level's base BEFORE
  // the WIS token resolves; the rail consumer reads the result via `resolveAuraDice`.
  const archer = (): AuraClause => ({
    sourceId: "druid-stars-starry-form",
    auraId: "starry-archer",
    radius: 60,
    affects: "enemies",
    effect: {
      kind: "ranged-attack",
      dice: "1d8+WIS",
      diceByLevel: { 3: "1d8+WIS", 10: "2d8+WIS" },
      damageType: "radiant",
      rangeFt: 60,
    },
  });
  const chalice = (): AuraClause => ({
    sourceId: "druid-stars-starry-form",
    auraId: "starry-chalice",
    radius: 30,
    affects: "allies-and-self",
    effect: {
      kind: "heal",
      dice: "1d8+WIS",
      diceByLevel: { 3: "1d8+WIS", 10: "2d8+WIS" },
    },
  });
  const WIS16 = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 16, CHA: 10 } as const;

  /** The resolved aura's `dice` (the union members that carry one), at a level. */
  function diceAt(aura: AuraClause, level: number, locale: "en" | "it"): string {
    const [vm] = auraVMs([aura], level, locale);
    if (!vm) throw new Error("no aura VM");
    const e = vm.effect;
    if (e.kind !== "ranged-attack" && e.kind !== "heal")
      throw new Error(`aura effect ${e.kind} has no dice`);
    return e.dice;
  }

  it.each(LOCALES)("Archer die is 1d8 below L10 and 2d8 at L10 (%s)", (locale) => {
    // fail-before: without `diceByLevel` + the auraVMs fold the die stayed 1d8 at
    // every level.
    expect(diceAt(archer(), 3, locale)).toBe("1d8+WIS");
    expect(diceAt(archer(), 10, locale)).toBe("2d8+WIS");
    // Through the rail's `resolveAuraDice`, WIS 16 (+3) folds onto the level base.
    expect(resolveAuraDice(diceAt(archer(), 3, locale), WIS16)).toBe("1d8+3");
    expect(resolveAuraDice(diceAt(archer(), 10, locale), WIS16)).toBe("2d8+3");
  });

  it("Chalice heal die scales identically (1d8 → 2d8 at L10)", () => {
    expect(diceAt(chalice(), 9, "en")).toBe("1d8+WIS");
    expect(diceAt(chalice(), 10, "en")).toBe("2d8+WIS");
  });

  it("an effect with NO diceByLevel passes its die through unchanged", () => {
    const flat: AuraClause = {
      sourceId: "x",
      auraId: "y",
      radius: 30,
      affects: "enemies",
      effect: { kind: "ranged-attack", dice: "1d6", damageType: "fire", rangeFt: 30 },
    };
    expect(diceAt(flat, 20, "en")).toBe("1d6");
  });
});

describe("tracker-view — activatableToggles", () => {
  const RAGE: ActivatableGroup = {
    key: "barbarian-rage",
    sourceId: "barbarian-rage",
    label: litText({ en: "Rage", it: "Ira" }),
    active: false,
  };

  it.each(LOCALES)("localizes the toggle label (%s)", (locale) => {
    const [vm] = activatableToggles([RAGE], locale);
    expect(vm?.key).toBe("barbarian-rage");
    expect(vm?.active).toBe(false);
    expect(vm?.label).toBe(locale === "it" ? "Ira" : "Rage");
  });

  it("dedupes groups that share a key (first label wins)", () => {
    const vms = activatableToggles(
      [
        RAGE,
        { ...RAGE, sourceId: "other", label: litText({ en: "Other", it: "Altro" }) },
      ],
      "en"
    );
    expect(vms).toHaveLength(1);
    expect(vms[0]?.label).toBe("Rage");
  });

  it("carries the active state through", () => {
    const [vm] = activatableToggles([{ ...RAGE, active: true }], "en");
    expect(vm?.active).toBe(true);
  });

  it("FRONTIER-S3 — folds the round countdown from the session timer (single source)", () => {
    const [withTimer] = activatableToggles([{ ...RAGE, active: true }], "en", {
      "barbarian-rage": { roundsLeft: 7 },
    });
    expect(withTimer?.roundsLeft).toBe(7);
    // No timer entry → no counter (most toggles have no round duration).
    const [noTimer] = activatableToggles([{ ...RAGE, active: true }], "en", {});
    expect(noTimer?.roundsLeft).toBeUndefined();
    // Omitting the map entirely is back-compat (no countdown).
    const [legacy] = activatableToggles([RAGE], "en");
    expect(legacy?.roundsLeft).toBeUndefined();
  });

  // ── S5 — Bloodied gating of the boon toggles ──────────────────────────────
  const BLOODIED_BOON: ActivatableGroup = {
    key: "boon-of-desperate-resilience-bloodied",
    sourceId: "boon-of-desperate-resilience",
    label: litText({ en: "Bloodied — Defense", it: "Dimezzato — Difesa" }),
    active: false,
  };

  it("S5 — a `-bloodied` boon hints its gate when NOT Bloodied", () => {
    const [vm] = activatableToggles([BLOODIED_BOON], "en", undefined, false);
    expect(vm?.bloodiedGateUnmet).toBe(true);
  });

  it("S5 — the same boon DOES NOT hint when Bloodied (gate met)", () => {
    const [vm] = activatableToggles([BLOODIED_BOON], "en", undefined, true);
    expect(vm?.bloodiedGateUnmet).toBeUndefined();
  });

  it("S5 — an UNGATED toggle never carries the bloodied-gate flag (even when not Bloodied)", () => {
    const [vm] = activatableToggles([RAGE], "en", undefined, false);
    expect(vm?.bloodiedGateUnmet).toBeUndefined();
  });

  it("S5 — branches on the STABLE `-bloodied` id suffix, never an English label", () => {
    // A boon whose KEY lacks the suffix but whose LABEL says "Bloodied" is NOT gated.
    const labelOnly: ActivatableGroup = {
      key: "barbarian-rage",
      sourceId: "x",
      label: litText({ en: "Bloodied Rage", it: "Ira Dimezzata" }),
      active: false,
    };
    const [vm] = activatableToggles([labelOnly], "en", undefined, false);
    expect(vm?.bloodiedGateUnmet).toBeUndefined();
  });

  it("S5 — defaults to NOT-Bloodied (gate unmet) when the arg is omitted (back-compat)", () => {
    const [vm] = activatableToggles([BLOODIED_BOON], "en");
    expect(vm?.bloodiedGateUnmet).toBe(true);
  });
});
