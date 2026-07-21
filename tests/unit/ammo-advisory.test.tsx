/**
 * RA-14 ammunition UI — PlayTab render: the live ammo count as a WeaponFacts
 * extra row, and the SOFT out-of-ammo advisory.
 *
 *  - The tracked quiver surfaces as one more fact row ("Arrows · 18") on the
 *    ranged weapon card, reading straight from the inventory (rule 6).
 *  - At 0 the card DIMS with an advisory ("Out of Arrows") but its CTA stays
 *    TAPPABLE — never a hard block (the player may carry untracked ammo;
 *    override-first). The advisory rides `ctaReason`, not `ctaDisabled`.
 *
 * Driven through the rendered PlayTab (the wiring the render alone proves);
 * Firebase is mocked so the unit stays CI-pure (env keys unset in CI).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useCombatStore } from "@/stores/combatStore";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import type { CharacterDoc } from "@/types/character";
import type { AbilityCode } from "@/data/types";

const S: Record<AbilityCode, number> = {
  STR: 10,
  DEX: 16,
  CON: 12,
  INT: 10,
  WIS: 12,
  CHA: 8,
};

const spec: ScenarioSpec = {
  name: "Fletcher",
  raceId: "human",
  classId: "rogue",
  level: 3,
  background: "criminal",
  abilityScores: S,
  weapons: [{ srdId: "shortbow", quantity: 1 }],
  equipment: [{ srdId: "arrows", quantity: 18 }],
};

function load(arrowQuantity: number): void {
  const doc: CharacterDoc = buildScenario({
    ...spec,
    equipment: [{ srdId: "arrows", quantity: arrowQuantity }],
  });
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <PlayTab />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useCharacterStore.setState({ character: null, loading: false, error: null });
  useUIStore.setState({ sheetMode: "play" });
  useCombatStore.setState({
    round: 1,
    initiative: "",
    selected: { action: [], bonus: [], free: [] },
    reactionUsed: false,
    movementUsedFt: 0,
    damageTakenThisRound: false,
  });
});

describe("RA-14 — PlayTab ammunition row + advisory", () => {
  it("renders the live ammo count as a WeaponFacts extra row (Arrows · 18)", () => {
    load(18);
    renderPage();
    // The ammo item name + the remaining count are both on the shortbow card.
    expect(screen.getByText("Arrows")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  it("at 0 ammo, the CTA dims with the out-of-ammo advisory but STAYS tappable", () => {
    load(0);
    renderPage();
    // Soft advisory (a reason line), never a hard block.
    expect(screen.getByText("Out of Arrows")).toBeInTheDocument();
    // The Attack CTA is still present and NOT disabled — an untracked-ammo
    // player must be able to fire anyway (override-first).
    const cta = screen.getByRole("button", { name: /attack: shortbow/i });
    expect(cta).not.toBeDisabled();
  });

  it("a Loading weapon shows the one-shot advisory on a 2nd swing (still tappable)", () => {
    // A Fighter L5 (Extra Attack → attackBudget 2) with a light crossbow that
    // already fired one swing this Attack action. The engine flags the weapon
    // `loading`; PlayTab surfaces the once-per-action advisory while a 2nd pip
    // remains — dimmed, but the pip CTA stays live (adjudicable, override-first).
    const doc = buildScenario({
      name: "Bolt",
      raceId: "human",
      classId: "fighter",
      level: 5,
      background: "soldier",
      abilityScores: S,
      weapons: [{ srdId: "light-crossbow", quantity: 1 }],
      equipment: [{ srdId: "crossbow-bolts", quantity: 20 }],
    });
    useCharacterStore.setState({ character: doc, loading: false, error: null });
    renderPage();
    // The provider's effect set attackBudget = 2; mark the crossbow as having
    // already taken one pip of the in-progress Attack action.
    act(() => {
      useCombatStore.setState({
        attacksUsed: 1,
        attackSwingIds: ["weapon-light-crossbow"],
      });
    });
    expect(screen.getByText("Loading: one shot per action")).toBeInTheDocument();
    // The pip CTA is still live — a 2nd shot is adjudicable, not blocked.
    const cta = screen.getByRole("button", { name: /attack: light crossbow/i });
    expect(cta).not.toBeDisabled();
  });

  it("localizes the advisory + ammo row in Italian", async () => {
    const i18n = (await import("@/i18n")).default;
    await i18n.changeLanguage("it");
    try {
      load(0);
      renderPage();
      // IT advisory interpolates the IT ammo name (Arrows → Frecce), never English.
      expect(screen.getByText("Munizioni esaurite: Frecce")).toBeInTheDocument();
      expect(screen.queryByText("Out of Arrows")).toBeNull();
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
