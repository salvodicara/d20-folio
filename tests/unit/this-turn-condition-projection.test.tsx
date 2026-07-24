/**
 * ThisTurnTracker — B1 condition-consequence projection (the dark resolver lit).
 *
 * A thin render-wiring test: with an active condition in the rail, the turn meter
 * the player acts from now reflects its self-side consequences through the SINGLE
 * `resolveConditionEffects` seam —
 *   • speedZero            → the MovementSlider dims + swaps its readout to a clean
 *                            struck "0" (the CAUSE is named by the B3 banner, not
 *                            the slider — single source / DRY)
 *   • breaksConcentration  → the concentration banner shows a "can't be held" note
 *
 * Override-first: conditions are player-toggled in the rail; removing one clears
 * every projection, and the slider/banner stay interactive (the engine never
 * auto-drops concentration or hard-locks movement on a condition toggle).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
// The shared InitVital (TB4) routes through `combat-state-io` → Firebase; mock the
// firebase module so this unit stays CI-pure (the env keys are unset in CI). The combat
// store + the persistent provider drive every assertion — no real write is made.
vi.mock("@/lib/firebase", () => ({}));
import { ThisTurnTracker } from "@/features/character/center/ThisTurnTracker";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import {
  abilityModifier,
  computeInitiative,
  effectiveAbilityScores,
  effectiveProficiencyBonus,
} from "@/lib/compute";
import { totalLevel } from "@/lib/classes";
import type { CharacterDoc } from "@/types/character";

function load(mutate: (doc: CharacterDoc) => void = () => {}): void {
  const doc = structuredClone(MOCK_CHARACTER);
  mutate(doc);
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

function mountView(
  attackRollState: "advantage" | "disadvantage" | "none" = "none"
): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <ThisTurnTracker attackRollState={attackRollState} />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

function mount(attackRollState: "advantage" | "disadvantage" | "none" = "none"): void {
  mountView(attackRollState);
}

describe("ThisTurnTracker — condition projection (B1)", () => {
  beforeEach(() => {
    useCombatStore.setState({
      round: 1,
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      initiative: "",
      movementUsedFt: 0,
    });
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  it("no condition gate → no zeroed movement readout, no blocked concentration note", () => {
    // The mock concentrates on Hypnotic Pattern + carries Frightened (no
    // speed-zero, no concentration break) — neither projection fires.
    load();
    mount();
    expect(document.querySelector(".move-slider")?.hasAttribute("data-speed-zero")).toBe(
      false
    );
    expect(document.querySelector(".move-num-zero")).toBeNull();
    expect(document.querySelector(".conc-banner[data-blocked]")).toBeNull();
    expect(document.querySelector(".conc-banner-note")).toBeNull();
  });

  it("a speed-zeroing condition (Grappled) → the movement readout dims to a clean struck '0' (cause lives in the B3 banner, not the slider)", () => {
    load((doc) => {
      doc.session.conditions = ["grappled"];
    });
    mount();
    const slider = document.querySelector(".move-slider");
    expect(slider?.hasAttribute("data-speed-zero")).toBe(true);
    // The readout is the clean zeroed/locked treatment, NOT the editable field…
    expect(document.querySelector(".move-num-zero")).not.toBeNull();
    expect(document.querySelector(".move-num-in")).toBeNull();
    // …and the slider itself carries NO crimson cause caption (DRY — the cause is
    // carried solely by the "what's limiting you this turn" banner, asserted in B3).
    expect(slider?.querySelector(".move-zero-note")).toBeNull();
    expect(slider?.textContent ?? "").not.toMatch(/Grappled/i);
  });

  it("a concentration-breaking condition (Incapacitated) → the banner names the cause", () => {
    load((doc) => {
      // Keep the mock's active concentration so the banner renders.
      doc.session.conditions = ["incapacitated"];
    });
    mount();
    const banner = document.querySelector(".conc-banner[data-blocked]");
    expect(banner).not.toBeNull();
    const note = banner?.querySelector(".conc-banner-note");
    expect(note?.textContent).toMatch(/Incapacitated/i);
    // Override-first: the drop affordance is still present (player owns the call).
    expect(screen.getByText(/Stop concentrating/i)).toBeInTheDocument();
  });

  it("removing the condition clears both projections (override-first)", () => {
    load((doc) => {
      doc.session.conditions = [];
    });
    mount();
    expect(document.querySelector(".move-slider")?.hasAttribute("data-speed-zero")).toBe(
      false
    );
    expect(document.querySelector(".move-num-zero")).toBeNull();
    expect(document.querySelector(".conc-banner[data-blocked]")).toBeNull();
  });
});

describe("ThisTurnTracker — 'what's limiting you this turn' summary (B3)", () => {
  beforeEach(() => {
    useCombatStore.setState({
      round: 1,
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      initiative: "",
      movementUsedFt: 0,
    });
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  it("afflicted (Restrained + Paralyzed + netted disadvantage + exhaustion) → the summary lists every limiter", () => {
    // Restrained imposes attack-dis + speed-0; Paralyzed adds auto-fail saves —
    // together they surface every condition-sourced limiter at once.
    load((doc) => {
      doc.session.conditions = ["restrained", "paralyzed"];
      doc.session.exhaustion = 1;
    });
    mount("disadvantage");
    const summary = document.querySelector(".turn-limiters");
    expect(summary).not.toBeNull();
    const text = summary?.textContent ?? "";
    // Paralyzed forbids every economy slot → the blocked-economy line leads.
    expect(text).toMatch(/can't take/i);
    expect(text).toMatch(/Disadvantage on attacks/i);
    expect(text).toMatch(/Speed 0/i);
    expect(text).toMatch(/Auto-fail STR\/DEX saves/i);
    expect(text).toMatch(/Exhaustion 1/i);
    // Reuses the `.conc-banner` register (sibling of the concentration banner).
    expect(summary?.classList.contains("conc-banner")).toBe(true);
  });

  it("Stunned → the blocked-economy line names the forbidden slots + the cause", () => {
    // Stunned forbids action/bonus/reaction (Incapacitated family) — the summary
    // reads "You can't take Action, Bonus, Reaction (Stunned)".
    load((doc) => {
      doc.session.conditions = ["stunned"];
    });
    mount("none");
    const text = document.querySelector(".turn-limiters")?.textContent ?? "";
    expect(text).toMatch(/can't take/i);
    expect(text).toMatch(/Action/);
    expect(text).toMatch(/Bonus/);
    expect(text).toMatch(/Reaction/);
    expect(text).toMatch(/Stunned/i);
  });

  it("a clean character (no conditions) → no blocked-economy clause", () => {
    load((doc) => {
      doc.session.conditions = [];
      doc.session.exhaustion = 0;
    });
    mount("none");
    // No banner at all, so certainly no blocked-economy line (rule 19).
    expect(document.querySelector(".turn-limiters")).toBeNull();
  });

  it("clean (no conditions, no exhaustion, none roll-state) → no summary at all (rule 19)", () => {
    load((doc) => {
      doc.session.conditions = [];
      doc.session.exhaustion = 0;
    });
    mount("none");
    expect(document.querySelector(".turn-limiters")).toBeNull();
  });

  it("the mock (Frightened) shows the attack-disadvantage limiter only when netted to disadvantage", () => {
    // The mock carries Frightened (disadvantage on attacks/checks). With the net
    // resolved to disadvantage the limiter shows; netted to none (an advantage
    // source cancels it) it does not — single source of truth on the netted state.
    load();
    mount("disadvantage");
    expect(document.querySelector(".turn-limiters")?.textContent).toMatch(
      /Disadvantage on attacks.*Frightened/i
    );
  });

  it("Frightened netted to NONE → no attack limiter (advantage cancels the disadvantage)", () => {
    load();
    mount("none");
    expect(document.querySelector(".turn-limiters")).toBeNull();
  });

  // RA-32 — Grappled's attack Disadvantage is RAW-scoped to targets OTHER than
  // the grappler; the turn-limiter summary must say so, instead of implying all
  // attacks are at Disadvantage. Every OTHER attack-dis condition stays blanket.
  it("RA-32 — Grappled netted to disadvantage → the attack limiter states the non-grappler scope", () => {
    load((d) => {
      d.session.conditions = ["grappled"];
    });
    mount("disadvantage");
    const text = document.querySelector(".turn-limiters")?.textContent ?? "";
    expect(text).toMatch(/other than the grappler/i);
    expect(text).toMatch(/Grappled/i);
  });

  it("RA-32 — a blanket attack-dis condition (Frightened) keeps the unscoped sentence", () => {
    load(); // the mock carries Frightened
    mount("disadvantage");
    const text = document.querySelector(".turn-limiters")?.textContent ?? "";
    expect(text).toMatch(/Disadvantage on attacks.*Frightened/i);
    expect(text).not.toMatch(/other than the grappler/i);
  });

  // RA-19 — SRD Prone "Restricted Movement": while Prone the turn meter offers a
  // one-tap Stand that clears the condition AND debits half the base Speed under
  // ONE undo (mock Speed 30 → ⌊30/2⌋ = 15 ft). Crawl stays a narrative note.
  it("RA-19 — Prone surfaces a one-tap Stand that clears the condition and debits half Speed, undoably", () => {
    useToastStore.setState({ toasts: [], timers: {} });
    load((d) => {
      d.session.conditions = ["prone"];
    });
    mountView();

    // The banner note + the Stand button (with the half-Speed cost) render.
    expect(screen.getByText(/crawling costs extra movement/i)).toBeTruthy();
    const stand = screen.getByRole("button", { name: /Stand up.*15 ft/i });

    // One tap clears Prone AND debits 15 ft.
    fireEvent.click(stand);
    expect(useCharacterStore.getState().character?.session.conditions).not.toContain(
      "prone"
    );
    expect(useCombatStore.getState().movementUsedFt).toBe(15);
    // The banner (and its button) are gone once Prone is cleared.
    expect(screen.queryByRole("button", { name: /Stand up/i })).toBeNull();

    // The composite undo reverts BOTH legs under one entry.
    useToastStore.getState().toasts.at(-1)?.onUndo?.();
    expect(useCharacterStore.getState().character?.session.conditions).toContain("prone");
    expect(useCombatStore.getState().movementUsedFt).toBe(0);
  });

  it("RA-19 — the Stand undo refunds EXACTLY the half-Speed delta (movement spent after standing is preserved)", () => {
    useToastStore.setState({ toasts: [], timers: {} });
    load((d) => {
      d.session.conditions = ["prone"];
    });
    mountView();
    fireEvent.click(screen.getByRole("button", { name: /Stand up.*15 ft/i }));
    expect(useCombatStore.getState().movementUsedFt).toBe(15);
    // Move a further 10 ft after standing, then undo the Stand.
    useCombatStore.getState().setMovementUsed(25);
    useToastStore.getState().toasts.at(-1)?.onUndo?.();
    // Delta refund: 25 − 15 = 10 (the post-stand movement is preserved).
    expect(useCombatStore.getState().movementUsedFt).toBe(10);
  });
});

// ── Initiative routes through the combat-math chokepoint (rule 6) ───────────────
// The attuned-+2-DEX-item legs of the 6b chokepoint (the Ioun Stone of Agility
// is a PACK magic item) live in
// content-pack/tests/unit/this-turn-condition-projection.pack.test.tsx. The
// public leg here pins the INIT-3 SSOT: the raw d20 roll is stored, the total
// derived.
describe("ThisTurnTracker — the shared InitVital stores the raw roll (INIT-3)", () => {
  beforeEach(() => {
    useCombatStore.setState({
      round: 1,
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      initiative: "",
      movementUsedFt: 0,
    });
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  it("typing a d20 roll stores the RAW roll (INIT-3 SSOT) and DERIVES the total", () => {
    load();
    const view = render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <ThisTurnTracker />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    // Open the shared InitVital editor (TB4) and read the engine bonus from its math. The
    // editor FLOATS in a popover (portaled to the document body), so its `.vi-math` +
    // `.init-edit-input` are read from `document`; the resting `.vital-init` chip (the
    // trigger, and after commit the derived total) stays in the tracker `container`.
    fireEvent.click(view.container.querySelector(".vital-init") as HTMLElement);
    const bonus = Number(
      (document.querySelector(".vi-math")?.textContent ?? "").split("=")[0] ??
        "".replace(/−/g, "-").replace(/[^\d-]/g, "")
    );
    const input = document.querySelector(".init-edit-input") as HTMLInputElement;
    // INIT-3 — the user types the raw d20 ROLL; on commit the combat store holds THAT
    // raw roll (the single source the encounter + the combat-state subdoc store). The
    // total is DERIVED (roll + bonus), never stored.
    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useCombatStore.getState().initiative).toBe("15");
    // The collapsed chip now reads the derived TOTAL, never the bare raw roll.
    expect(view.container.querySelector(".vital-init")?.textContent ?? "").toContain(
      String(15 + bonus)
    );
  });
});

// ── The movement bar surfaces the EFFECTIVE round-aware Speed (rule 6) ─────────
// Render-wiring regression: the Play-tab movement meter must read the EFFECTIVE
// walking Speed through `effectiveWalkingSpeedFt(doc, getEquipment, round)` — the
// SAME chokepoint CombatHeader/PDF use — NOT the raw stored base. So a round-1-only
// bonus (Gloom Stalker Ambusher's Leap, +10 ft) RAISES the slider's max on combat
// round 1 and auto-clears from round 2+. Before the reroute the meter used
// `parseInt(charData.speed)` (raw base), so it read 30 in BOTH rounds — the orphaned
// value never reached this surface. The slider's `aria-valuemax` is the effective
// Speed in feet, the value the player budgets movement against.
describe("ThisTurnTracker — movement bar reads the EFFECTIVE round-aware Speed (6b)", () => {
  beforeEach(() => {
    useCombatStore.setState({
      round: 1,
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      initiative: "",
      movementUsedFt: 0,
    });
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  // The round-1 bonus legs (Gloom Stalker Ambusher's Leap is a PACK subclass
  // feature) live in
  // content-pack/tests/unit/this-turn-condition-projection.pack.test.tsx.

  it("a character WITHOUT Ambusher's Leap is round-invariant (the bonus is gated on a round1 grant)", () => {
    // The wiring adds the bonus ONLY when a `round1`-flagged speed grant exists, so a
    // plain build reads the same Speed in both rounds — override-first, no drift.
    const mockMaxFt = (round: number): number => {
      const doc = structuredClone(MOCK_CHARACTER);
      doc.id = `mock-round-${round}`;
      useCharacterStore.setState({
        character: doc,
        combatRound: round,
        loading: false,
        error: null,
      });
      const view = mountView();
      const max = Number(
        document.querySelector(".move-bar")?.getAttribute("aria-valuemax")
      );
      view.unmount();
      return max;
    };
    expect(mockMaxFt(1)).toBe(mockMaxFt(2));
  });
});

// ── Initiative routes through the combat-math chokepoint (rule 6) ───────────────
// The displayed initiative bonus + total MUST fold an attuned +2 DEX magic item,
// exactly as CombatHeader's DEX-derived numbers do — they read the SAME chokepoint
// (`aggregateCharacterGrants` → `effectiveAbilityScores`). Before the reroute the
// meter computed init from the RAW stored DEX, so the same screen showed the
// CombatHeader DEX values WITH the item but the initiative total WITHOUT it (a
// visible divergence). A +2 DEX always lifts the DEX modifier by exactly +1, so an
// attuned Ioun Stone of Agility must raise the SHOWN total by +1 (and the unattuned
// gate must leave it byte-identical). Asserted as a DELTA off the mock's own
// baseline (mock-feature-agnostic). FAILS-BEFORE the reroute: raw DEX → delta 0.
describe("ThisTurnTracker — initiative folds an attuned +2 DEX item (6b chokepoint)", () => {
  /** Mount the meter for a doc and return the integer initiative BONUS it shows. */
  function initBonusFor(mutate: (doc: CharacterDoc) => void): number {
    load(mutate);
    const view = mountView();
    // Un-rolled → click the InitVital roll affordance to open its editor, then read the
    // "+bonus = —" math. The editor FLOATS in a popover (portaled to the document
    // body), so `.vi-math` is read from `document`, not the tracker `container`.
    fireEvent.click(view.container.querySelector(".vital-init") as HTMLElement);
    const bonus = Number(
      (document.querySelector(".vi-math")?.textContent ?? "").split("=")[0] ??
        "".replace(/−/g, "-").replace(/[^\d-]/g, "")
    );
    view.unmount();
    return bonus;
  }

  const agility = (doc: CharacterDoc, attuned: boolean): void => {
    doc.character.equipment = [
      ...doc.character.equipment,
      { srdId: "ioun-stone", equipped: true, attuned },
    ];
    doc.session.grantBundleChoices = {
      ...doc.session.grantBundleChoices,
      "ioun-stone-type": "agility",
    };
  };

  beforeEach(() => {
    useCombatStore.setState({
      round: 1,
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      initiative: "",
      movementUsedFt: 0,
    });
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  it("attuned +2 DEX Ioun Stone of Agility → the displayed init bonus rises by exactly +1", () => {
    const baseline = initBonusFor(() => {});
    const withItem = initBonusFor((doc) => agility(doc, true));
    // The chokepoint folds the +2 DEX (mod +1) into the shown bonus — the SAME +1
    // CombatHeader's DEX-derived numbers gain. Raw-DEX read = delta 0 (the 6b bug).
    expect(withItem - baseline).toBe(1);
  });

  it("the item UNATTUNED → no effect (the equip/attune gate holds; bonus unchanged)", () => {
    const baseline = initBonusFor(() => {});
    const unattuned = initBonusFor((doc) => agility(doc, false));
    // Override-first parity with the engine gate: an unattuned stone grants nothing,
    // so the displayed init bonus is byte-identical to the baseline (no item).
    expect(unattuned).toBe(baseline);
  });
});

// The engine derivation the meter SHARES with CombatHeader/PDF — the chokepoint
// itself, asserted on the producing functions (rule 13: pure-fact over render). A
// thin pin that the SAME +2 DEX lifts `computeInitiative(effectiveScores.DEX, …)`
// by +1, so the meter and header can't diverge by construction.
describe("initiative chokepoint — effective DEX feeds computeInitiative (6b)", () => {
  it("an attuned +2 DEX item raises the shared init derivation by +1", () => {
    const base = structuredClone(MOCK_CHARACTER);
    const withItem = structuredClone(MOCK_CHARACTER);
    withItem.character.equipment = [
      ...withItem.character.equipment,
      { srdId: "ioun-stone", equipped: true, attuned: true },
    ];
    withItem.session.grantBundleChoices = {
      ...withItem.session.grantBundleChoices,
      "ioun-stone-type": "agility",
    };

    const initFor = (doc: CharacterDoc): number => {
      const agg = aggregateCharacterGrants(doc.character, doc.session);
      const eff = effectiveAbilityScores(
        doc.character.abilityScores,
        agg.abilityScoreFloors,
        agg.itemAbilityScoreBonus,
        agg.itemAbilityScoreCap
      );
      const pb = effectiveProficiencyBonus(
        totalLevel(doc.character),
        doc.character.proficiencyBonusOverride
      );
      const grantBonus =
        agg.initiativeBonusFlat +
        agg.initiativeBonusAbilities.reduce((s, a) => s + abilityModifier(eff[a]), 0);
      return computeInitiative(eff.DEX, pb, false, doc.session.exhaustion, grantBonus);
    };

    expect(initFor(withItem) - initFor(base)).toBe(1);
  });
});
