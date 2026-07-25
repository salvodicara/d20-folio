/**
 * PS-J — the attack-scope clause family: a clause whose scope is NARROWER than
 * "every attack roll you make" must never be glossed as a blanket verdict on
 * every attack card.
 *
 * Reproduction first (golden rule 13): each case renders the real PlayTab for a
 * character who holds exactly one such clause and reads the attack card's gloss.
 * Firebase is mocked so the unit stays CI-pure.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useCombatStore } from "@/stores/combatStore";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import type { AbilityCode } from "@/data/types";

const S: Record<AbilityCode, number> = {
  STR: 16,
  DEX: 14,
  CON: 14,
  INT: 10,
  WIS: 14,
  CHA: 10,
};

function load(spec: ScenarioSpec): void {
  useCharacterStore.setState({
    character: buildScenario(spec),
    loading: false,
    error: null,
  });
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

/** Every attack-card gloss on the page (the mono sub-line carrying "+N to hit"). */
function attackGlosses(): (string | null)[] {
  // The gloss is the ONE node whose text carries the signed to-hit figure; the
  // card's expanded fact row renders the bare "to hit" rubric on its own.
  return screen.getAllByText(/[+\-−]\d+ to hit/i).map((el) => el.textContent);
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

const hunter = (level: number, bundle?: Record<string, string>): ScenarioSpec => ({
  name: "Kessa",
  raceId: "human",
  classId: "ranger",
  subclassId: "hunter",
  level,
  background: "outlander",
  abilityScores: S,
  weapons: [{ srdId: "longsword", quantity: 1 }],
  ...(bundle ? { grantBundleChoices: bundle } : {}),
});

describe("PS-J — narrowing-scope attack clauses never gloss every attack card", () => {
  it("Escape the Horde (Opportunity Attacks AGAINST you) leaves the player's own attacks clean", () => {
    load(hunter(7, { "ranger-hunter-defensive-tactics": "escape-the-horde" }));
    renderPage();
    const glosses = attackGlosses();
    expect(glosses.length).toBeGreaterThan(0);
    for (const g of glosses) expect(g).not.toMatch(/Disadv\./);
  });

  it("Precise Hunter STATES its scope instead of asserting Advantage on every swing", () => {
    load(hunter(17));
    renderPage();
    const glosses = attackGlosses();
    expect(glosses.length).toBeGreaterThan(0);
    for (const g of glosses) {
      // The bare verdict — "+9 to hit · Adv." — is the defect; the scoped
      // statement is the fix, and it must never appear without its scope.
      expect(g).toMatch(/Adv\. vs marked target/);
      expect(g).not.toMatch(/Adv\.(?! vs marked target)/);
    }
  });

  it("Reckless Attack scopes to Strength attacks ONLY while the toggle is lit", () => {
    // A blanket "Adv." here would be wrong twice over: Reckless is a declared
    // state, and RAW it reaches Strength-based attack rolls only.
    const barbarian = (activeFeatures: string[]): ScenarioSpec => ({
      name: "Vokka",
      raceId: "human",
      classId: "barbarian",
      subclassId: "berserker",
      level: 3,
      background: "soldier",
      abilityScores: S,
      weapons: [{ srdId: "greataxe", quantity: 1 }],
      activeFeatures,
    });

    load(barbarian([]));
    const off = renderPage();
    for (const g of attackGlosses()) expect(g).not.toMatch(/Adv\./);
    off.unmount();

    load(barbarian(["barbarian-reckless-attack"]));
    renderPage();
    const lit = attackGlosses();
    expect(lit.length).toBeGreaterThan(0);
    for (const g of lit) expect(g).toMatch(/Adv\. on Strength attacks/);
  });
});
