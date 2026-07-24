/**
 * `logTypeForAction` — the action-log row's semantic type (icon + colour).
 *
 * Confirmed bugs locked here (action-log finder set):
 *  - `heal-and-utility-logged-with-wrong-type-colour` /
 *    `only-three-types-emitted-rest-unused`: the mapper used to key ONLY on
 *    `action.source`, so a healing spell logged as "spell-cast" (purple) and a
 *    healing feature as "tracker-use" — the green "heal" type was dead. The fix
 *    consults the action's EFFECT first (heal beats damage beats source), so a
 *    healing spell/feature → "heal" and a damaging NON-weapon action → "damage".
 *
 * Pure function, no stores — builds minimal ResolvedAction fixtures.
 */

import { describe, it, expect } from "vitest";
import {
  logTypeForAction,
  sortActions,
  actionSortTier,
  localizeActions,
  composeTurnLimiters,
  attacksRemainingInAction,
  isPipAttackAction,
  maxReplaceAttackSpellLevel,
  type TurnLimiterVM,
} from "@/lib/views/combat-action-view";
import type { ResolvedAction } from "@/lib/smart-tracker";
import type { ActionSummary } from "@/lib/smart-tracker";
import { MOCK_CHARACTER } from "@/lib/mock";

function makeAction(
  source: ResolvedAction["source"],
  summary: ActionSummary
): ResolvedAction {
  return {
    id: `${source}-x`,
    name: source,
    nameLoc: { custom: source },
    type: "action",
    source,
    spellLevel: source === "spell" ? 1 : null,
    concentration: false,
    summary,
    costsSlot: false,
    pinned: false,
    defaultPinned: false,
  };
}

describe("logTypeForAction", () => {
  // ── EFFECT-first routing (the fix) ──────────────────────────────────────
  it("a healing spell → 'heal' (green), NOT 'spell-cast'", () => {
    const heal = makeAction("spell", { healing: "2d4+3" });
    expect(logTypeForAction(heal)).toBe("heal");
  });

  it("a healing feature (Lay on Hands) → 'heal', NOT 'tracker-use'", () => {
    const layOnHands = makeAction("feature", { healing: "5×level" });
    expect(logTypeForAction(layOnHands)).toBe("heal");
  });

  it("a damaging NON-weapon spell (Fireball) → 'damage' (red), NOT 'spell-cast'", () => {
    const fireball = makeAction("spell", { damage: "8d6", damageType: "fire" });
    expect(logTypeForAction(fireball)).toBe("damage");
  });

  it("a multi-type damaging spell (Chromatic Orb) → 'damage'", () => {
    const orb = makeAction("spell", {
      damage: "3d8",
      damageTypes: ["acid", "cold", "fire"],
      multiDamageTypeFlavor: "choice",
    });
    expect(logTypeForAction(orb)).toBe("damage");
  });

  it("heal beats damage when a row somehow carries both → 'heal'", () => {
    const both = makeAction("spell", {
      healing: "1d8",
      damage: "1d8",
      damageType: "necrotic",
    });
    expect(logTypeForAction(both)).toBe("heal");
  });

  // ── source fall-back (unchanged behaviour for the common cases) ──────────
  it("a buff/control spell with no heal/damage (Bane) stays 'spell-cast'", () => {
    const bane = makeAction("spell", { saveDC: 13, saveAbility: "CHA" });
    expect(logTypeForAction(bane)).toBe("spell-cast");
  });

  it("a damaging WEAPON stays 'attack' (red) — weapons never re-route to 'damage'", () => {
    const dagger = makeAction("weapon", { damage: "1d4+3", damageType: "piercing" });
    expect(logTypeForAction(dagger)).toBe("attack");
  });

  it("a utility feature with no heal/damage stays 'tracker-use'", () => {
    const surge = makeAction("feature", { effect: "Extra action" });
    expect(logTypeForAction(surge)).toBe("tracker-use");
  });

  it("a cantrip with no heal/damage (Mage Hand) stays 'spell-cast'", () => {
    const mageHand = makeAction("spell", { effect: "Spectral hand" });
    expect(logTypeForAction(mageHand)).toBe("spell-cast");
  });
});

// ── D8 — the within-group action comparator (sortActions / actionSortTier) ─────
//
// Pure-engine facts about the ONE comparator the Play board routes every group
// through. These were previously asserted only by mounting the PlayTab and
// reading DOM order (combat-action-derivations.test.tsx); they are far cheaper
// against the producing function. The board's WIRING to this comparator (and the
// stateful off-hand reveal) stays pinned by a thin render test in that file.
//
// Driven through the real mock pipeline `sortActions(localizeActions(MOCK))` so
// the comparator is exercised on production data — the exact list the board sorts.
describe("sortActions — D8 within-group ordering", () => {
  const sorted = sortActions(localizeActions(MOCK_CHARACTER, "en"));
  const names = sorted.map((a) => a.name);
  const idx = (n: string): number => names.indexOf(n);

  it("tier order: weapons (0) → cantrips (1) → leveled spells (2) → features (3)", () => {
    expect(actionSortTier({ source: "weapon" } as ResolvedAction)).toBe(0);
    expect(actionSortTier({ source: "spell", spellLevel: 0 } as ResolvedAction)).toBe(1);
    expect(actionSortTier({ source: "spell", spellLevel: 3 } as ResolvedAction)).toBe(2);
    expect(actionSortTier({ source: "feature" } as ResolvedAction)).toBe(3);
  });

  it("weapons are tier-0 and alpha-sorted (Dagger → Quarterstaff → Rapier → Shortbow)", () => {
    const weapons = sorted.filter((a) => a.source === "weapon").map((a) => a.name);
    // The dual-wield "Dagger (off-hand)" sits alpha-adjacent to "Dagger" in the
    // pure list; the board hides it until a Light-weapon attack commits (a stateful
    // DOM fact kept in the render test). Filter it out for the static order check.
    expect(weapons.filter((n) => n !== "Dagger (off-hand)")).toEqual([
      "Dagger",
      "Quarterstaff",
      "Rapier",
      "Shortbow",
    ]);
  });

  it("puts cantrips before leveled spells (Mage Hand before Bane)", () => {
    expect(idx("Mage Hand")).toBeLessThan(idx("Bane"));
  });

  it("sorts leveled spells by ascending level (L1 Bane < L3 Fear < L5 Hold Monster)", () => {
    expect(idx("Bane")).toBeLessThan(idx("Fear")); // L1 < L3
    expect(idx("Fear")).toBeLessThan(idx("Hold Monster")); // L3 < L5
  });

  it("breaks cantrip ties alphabetically (Mage Hand before Vicious Mockery)", () => {
    expect(idx("Mage Hand")).toBeLessThan(idx("Vicious Mockery"));
  });
});

// ─── B3: composeTurnLimiters — "what's limiting you this turn" ─────────────────

describe("composeTurnLimiters — B3 turn-limiter summary (pure composer)", () => {
  // A `kind`-only projection so the table asserts WHICH limiters appear, in order,
  // independent of the (separately-asserted) cause/ability fields.
  const kinds = (ls: TurnLimiterVM[]) => ls.map((l) => l.kind);

  it("clean state (no conditions, no exhaustion, none roll-state) → no limiters", () => {
    expect(
      composeTurnLimiters({
        conditions: [],
        attackRollState: "none",
        exhaustion: 0,
        locale: "en",
      })
    ).toEqual([]);
  });

  // Table over the condition family + exhaustion + roll-state netting. Each row
  // pins the ORDERED limiter kinds the composer emits.
  const cases: Array<{
    name: string;
    conditions: string[];
    attackRollState: "advantage" | "disadvantage" | "none";
    exhaustion: number;
    expected: TurnLimiterVM["kind"][];
  }> = [
    {
      name: "Frightened + netted disadvantage → attack-disadvantage limiter",
      conditions: ["frightened"],
      attackRollState: "disadvantage",
      exhaustion: 0,
      expected: ["attackDisadvantage"],
    },
    {
      name: "Frightened but netted to NONE (an advantage source cancels it) → no attack limiter",
      conditions: ["frightened"],
      attackRollState: "none",
      exhaustion: 0,
      expected: [],
    },
    {
      name: "Grappled → speed-0 limiter only (no roll change)",
      conditions: ["grappled"],
      attackRollState: "none",
      exhaustion: 0,
      expected: ["speedZero"],
    },
    {
      name: "Restrained + netted disadvantage → attack-disadvantage THEN speed-0 (order)",
      conditions: ["restrained"],
      attackRollState: "disadvantage",
      exhaustion: 0,
      expected: ["attackDisadvantage", "speedZero"],
    },
    {
      name: "Stunned + netted disadvantage but NO condition imposes attack-dis → blocked-economy + auto-fail",
      conditions: ["stunned"],
      attackRollState: "disadvantage",
      exhaustion: 0,
      // Stunned forbids the action/bonus/reaction slots (blocked economy) and
      // auto-fails STR+DEX saves, but does NOT impose attack disadvantage, and
      // (2024 RAW, unlike 2014) does NOT zero Speed — so no attack limiter and no
      // speed-0 limiter (single source of truth). The blocked-economy limiter
      // leads (it is the most totalising constraint), then the auto-fail line.
      expected: ["blockedEconomy", "autoFailSaves"],
    },
    {
      name: "Stunned alone (roll-state none) → blocked-economy then auto-fail",
      conditions: ["stunned"],
      attackRollState: "none",
      exhaustion: 0,
      expected: ["blockedEconomy", "autoFailSaves"],
    },
    {
      name: "Incapacitated → blocked-economy only (no speed-0 / auto-fail / attack-dis)",
      // The bare Incapacitated condition forbids every slot + breaks concentration,
      // but does not zero speed, auto-fail saves, or impose attack disadvantage.
      // breaksConcentration is owned by the concentration banner, NOT a limiter.
      conditions: ["incapacitated"],
      attackRollState: "none",
      exhaustion: 0,
      expected: ["blockedEconomy"],
    },
    {
      name: "Restrained + Paralyzed + netted disadvantage → blocked-economy, attack-dis, speed-0, auto-fail (full order)",
      // Paralyzed forbids every slot (blocked economy) + auto-fails saves;
      // Restrained imposes attack-dis + speed-0 — together they exercise every
      // condition-sourced limiter in order (blocked economy leads).
      conditions: ["restrained", "paralyzed"],
      attackRollState: "disadvantage",
      exhaustion: 0,
      expected: ["blockedEconomy", "attackDisadvantage", "speedZero", "autoFailSaves"],
    },
    {
      name: "Paralyzed → blocked-economy, speed-0 + auto-fail saves (no attack-dis when roll-state none)",
      conditions: ["paralyzed"],
      attackRollState: "none",
      exhaustion: 0,
      expected: ["blockedEconomy", "speedZero", "autoFailSaves"],
    },
    {
      name: "Exhaustion 1 alone → exhaustion limiter",
      conditions: [],
      attackRollState: "none",
      exhaustion: 1,
      expected: ["exhaustion"],
    },
    {
      name: "Grappled + Exhaustion 2 → speed-0 then exhaustion (exhaustion last)",
      conditions: ["grappled"],
      attackRollState: "none",
      exhaustion: 2,
      expected: ["speedZero", "exhaustion"],
    },
    {
      name: "unknown/custom condition string → skipped (no gate)",
      conditions: ["on-fire-custom"],
      attackRollState: "none",
      exhaustion: 0,
      expected: [],
    },
  ];

  it.each(cases)("$name", ({ conditions, attackRollState, exhaustion, expected }) => {
    expect(
      kinds(
        composeTurnLimiters({ conditions, attackRollState, exhaustion, locale: "en" })
      )
    ).toEqual(expected);
  });

  // RA-08 — the one-spell-slot-per-turn advisory. Fires ONLY once >1 slot has been
  // expended to cast a spell this turn (a likely rules slip); never at 0 or 1.
  it.each([
    [0, false],
    [1, false],
    [2, true],
    [3, true],
  ])("spellSlotCasts=%s → spellSlotLimit present: %s", (spellSlotCasts, present) => {
    const ls = composeTurnLimiters({
      conditions: [],
      attackRollState: "none",
      exhaustion: 0,
      spellSlotCasts,
      locale: "en",
    });
    expect(kinds(ls).includes("spellSlotLimit")).toBe(present);
    const limit = ls.find((l) => l.kind === "spellSlotLimit");
    if (present) {
      expect(limit?.kind === "spellSlotLimit" && limit.count).toBe(spellSlotCasts);
    }
  });

  it("the spell-slot advisory sorts LAST (after exhaustion) and never blocks", () => {
    const ls = composeTurnLimiters({
      conditions: ["grappled"],
      attackRollState: "none",
      exhaustion: 1,
      spellSlotCasts: 2,
      locale: "en",
    });
    expect(kinds(ls)).toEqual(["speedZero", "exhaustion", "spellSlotLimit"]);
  });

  // RA-32 — Grappled is the ONE attack-dis condition whose Disadvantage is
  // RAW-scoped to targets OTHER than the grappler; it flags the attack limiter
  // `scoped`, so the edge picks the scoped sentence. Blanket conditions do not.
  it("Grappled + netted disadvantage → the attack limiter is flagged scoped; a blanket condition is not", () => {
    const grap = composeTurnLimiters({
      conditions: ["grappled"],
      attackRollState: "disadvantage",
      exhaustion: 0,
      locale: "en",
    });
    const gAtk = grap.find((l) => l.kind === "attackDisadvantage");
    expect(gAtk?.kind === "attackDisadvantage" && gAtk.scoped).toBe(true);
    expect(gAtk?.kind === "attackDisadvantage" && gAtk.cause).toMatch(/Grappled/i);

    const restr = composeTurnLimiters({
      conditions: ["restrained"],
      attackRollState: "disadvantage",
      exhaustion: 0,
      locale: "en",
    });
    const rAtk = restr.find((l) => l.kind === "attackDisadvantage");
    expect(rAtk?.kind === "attackDisadvantage" && !!rAtk.scoped).toBe(false);
  });

  it("resolves the cause to the localized condition name + stable ordered ability ids", () => {
    const ls = composeTurnLimiters({
      conditions: ["restrained", "paralyzed"],
      attackRollState: "disadvantage",
      exhaustion: 0,
      locale: "en",
    });
    const attack = ls.find((l) => l.kind === "attackDisadvantage");
    // Restrained is the first active condition that imposes attack disadvantage.
    expect(attack && "cause" in attack && attack.cause).toMatch(/Restrained/i);
    const saves = ls.find((l) => l.kind === "autoFailSaves");
    // STABLE order (STR before DEX) — never Set-iteration order.
    expect(saves?.kind === "autoFailSaves" && saves.abilities).toEqual(["STR", "DEX"]);
    expect(saves && "cause" in saves && saves.cause).toMatch(/Paralyzed/i);
  });

  it("blocked-economy limiter carries the forbidden slots (stable order) + the first-condition cause", () => {
    const ls = composeTurnLimiters({
      conditions: ["stunned"],
      attackRollState: "none",
      exhaustion: 0,
      locale: "en",
    });
    const blocked = ls.find((l) => l.kind === "blockedEconomy");
    // Stunned forbids the action, bonus, AND reaction slots — a stable ordered
    // list (action → bonus → reaction), the edge localizes each slot name.
    expect(blocked?.kind === "blockedEconomy" && blocked.slots).toEqual([
      "action",
      "bonus",
      "reaction",
    ]);
    expect(blocked && "cause" in blocked && blocked.cause).toMatch(/Stunned/i);
  });

  it("no blocked-economy limiter for a clean character (rule 19)", () => {
    const ls = composeTurnLimiters({
      conditions: ["frightened"],
      attackRollState: "disadvantage",
      exhaustion: 0,
      locale: "en",
    });
    // Frightened imposes attack disadvantage but forbids no economy slot.
    expect(ls.some((l) => l.kind === "blockedEconomy")).toBe(false);
  });

  it("carries the exhaustion LEVEL for the sentence (clamped to 0-6)", () => {
    const ls = composeTurnLimiters({
      conditions: [],
      attackRollState: "none",
      exhaustion: 9,
      locale: "en",
    });
    const ex = ls.find((l) => l.kind === "exhaustion");
    expect(ex?.kind === "exhaustion" && ex.level).toBe(6);
  });
});

// ── ATTACK-PIPS — BG3 grammar (owner ruling 2026-07-09): the "attacks remaining"
//    count lives on the attack AFFORDANCE (weapon/War-Magic cards + the board group
//    header), NOT on the Action coin (which spends fully on the first swing). The
//    ONE derivation is `attacksRemainingInAction(attacksUsed, attackBudget)`. ──────
describe("attacksRemainingInAction (attacks left in the open Attack action)", () => {
  it("GUARD CASE — a one-attack hero (attackBudget 1) always reads null (inert)", () => {
    expect(attacksRemainingInAction(0, 1)).toBeNull();
    expect(attacksRemainingInAction(1, 1)).toBeNull();
  });

  it("a fresh Attack action (no swing yet) reads null — the card is just LIVE", () => {
    // Nothing to count before the first swing: the weapon card shows its ordinary
    // Attack CTA, no "N left" marker (the marker appears once swings remain).
    expect(attacksRemainingInAction(0, 2)).toBeNull();
    expect(attacksRemainingInAction(0, 3)).toBeNull();
  });

  it("counts down the swings left in the open action (budget 2): 1 after swing 1", () => {
    // After the first swing one attack remains → the cards wear "1 left · no action".
    expect(attacksRemainingInAction(1, 2)).toBe(1);
    // After the last swing the action is COMPLETE → null (the cards dim like spent).
    expect(attacksRemainingInAction(2, 2)).toBeNull();
  });

  it("counts down across a budget-3 action (L11): mid-swing 2 → 1, complete → null", () => {
    expect(attacksRemainingInAction(1, 3)).toBe(2);
    expect(attacksRemainingInAction(2, 3)).toBe(1);
    expect(attacksRemainingInAction(3, 3)).toBeNull();
  });

  it("Action Surge re-opens a fresh action — the count re-fills for the 2nd action", () => {
    // First action complete (attacksUsed 2, budget 2) → null between actions; the
    // second action's first swing (attacksUsed 3) leaves one remaining again.
    expect(attacksRemainingInAction(2, 2)).toBeNull();
    expect(attacksRemainingInAction(3, 2)).toBe(1);
  });
});

// ── The pip-attack predicate + the War-Magic level reducer (shared by the economy
//    provider's commit routing and the PlayTab card marker — golden rule 6). ──────
describe("isPipAttackAction / maxReplaceAttackSpellLevel", () => {
  it("a weapon attack action is always a pip attack", () => {
    expect(isPipAttackAction(makeAction("weapon", {}), -1)).toBe(true);
  });

  it("a cantrip is a pip attack only within the War-Magic band", () => {
    const cantrip = { ...makeAction("spell", {}), spellLevel: 0 };
    expect(isPipAttackAction(cantrip, 0)).toBe(true); // base War Magic → cantrips
    expect(isPipAttackAction(cantrip, -1)).toBe(false); // no rider → not a pip attack
  });

  it("a leveled spell rides a pip only when the band reaches its level", () => {
    const lvl1 = { ...makeAction("spell", {}), spellLevel: 1 };
    expect(isPipAttackAction(lvl1, 0)).toBe(false); // base band (cantrips) excludes it
    expect(isPipAttackAction(lvl1, 1)).toBe(true); // Improved War Magic reaches it
  });

  it("a bonus/free/reaction action is never a pip attack", () => {
    const bonus = { ...makeAction("weapon", {}), type: "bonus" as const };
    expect(isPipAttackAction(bonus, 5)).toBe(false);
  });

  it("maxReplaceAttackSpellLevel takes the highest band, -1 for no rider", () => {
    expect(maxReplaceAttackSpellLevel([])).toBe(-1);
    expect(
      maxReplaceAttackSpellLevel([
        {
          sourceId: "a",
          attacks: 1,
          classSpellList: "wizard",
          minSpellLevel: 0,
          maxSpellLevel: 0,
          castTime: "action",
          totalAttacks: 2,
        },
        {
          sourceId: "b",
          attacks: 1,
          classSpellList: "wizard",
          minSpellLevel: 0,
          maxSpellLevel: 2,
          castTime: "action",
          totalAttacks: 2,
        },
      ])
    ).toBe(2);
  });
});
