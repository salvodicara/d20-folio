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
import { render, screen, fireEvent } from "@testing-library/react";
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

const barbarian = (
  activeFeatures: string[],
  conditions: string[] = []
): ScenarioSpec => ({
  name: "Vokka",
  raceId: "human",
  classId: "barbarian",
  subclassId: "berserker",
  level: 3,
  background: "soldier",
  abilityScores: S,
  weapons: [{ srdId: "greataxe", quantity: 1 }],
  activeFeatures,
  conditions,
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

  // ── The COMPOSITION cases: a scoped clause is netted AGAINST the verdict, so
  //    the card never asserts two contradictory claims on one roll. ──────────

  it("a scoped Advantage under a blanket Disadvantage reads as the straight roll it is", () => {
    // Prone (blanket Disadvantage on attacks) + Reckless (Advantage on Strength
    // attacks) — a Barbarian's default posture after being knocked down. RAW the
    // greataxe swing has both, so it is a STRAIGHT roll; the card used to print
    // "Disadv. · Adv. on Strength attacks" and assert both at once.
    load(barbarian(["barbarian-reckless-attack"], ["prone"]));
    renderPage();
    const glosses = attackGlosses();
    expect(glosses.length).toBeGreaterThan(0);
    for (const g of glosses) {
      expect(g).toMatch(/Disadv\. · Straight roll on Strength attacks/);
      expect(g).not.toMatch(/Adv\. on Strength attacks/);
    }
  });

  it("the status ledge's Prone badge states the SAME blanket verdict the cards carry", () => {
    // One source of truth: the badge reports the posture of a roll no scope
    // touches, which is exactly the card's verdict — the scoped exception rides
    // the card. The two can never disagree. The sentence is explain-on-demand
    // (the badge popover); the badge itself wears the cause.
    load(barbarian(["barbarian-reckless-attack"], ["prone"]));
    renderPage();
    const badge = Array.from(document.querySelectorAll(".status-badge")).find((b) =>
      /Prone/i.test(b.textContent)
    );
    expect(badge).toBeTruthy();
    fireEvent.click(badge as HTMLElement);
    expect(screen.getByText(/Disadvantage on attack rolls/i)).toBeInTheDocument();
    for (const g of attackGlosses()) expect(g).toMatch(/to hit · Disadv\./);
  });

  it("a blanket clause with nothing scoped still reads as a bare verdict", () => {
    load(barbarian([], ["prone"]));
    renderPage();
    const glosses = attackGlosses();
    expect(glosses.length).toBeGreaterThan(0);
    for (const g of glosses) {
      expect(g).toMatch(/to hit · Disadv\.$/);
      expect(g).not.toMatch(/Straight roll/);
    }
  });

  it("drops a scope the card's rolls can never be in (Innate Sorcery on a weapon)", () => {
    // A Sorcerer-spell clause cannot reach a quarterstaff swing, so the weapon
    // card states nothing; the spell cards carry the line.
    load({
      name: "Rell",
      raceId: "human",
      classId: "sorcerer",
      subclassId: "draconic-sorcery",
      level: 3,
      background: "sage",
      abilityScores: { ...S, CHA: 16 },
      weapons: [{ srdId: "quarterstaff", quantity: 1 }],
      spells: [{ srdId: "fire-bolt" }],
      activeFeatures: ["sorcerer-innate-sorcery"],
    });
    renderPage();
    const glosses = attackGlosses();
    const weapon = glosses.filter((g) => g?.includes("5 ft"));
    expect(weapon.length).toBeGreaterThan(0);
    for (const g of weapon) expect(g).not.toMatch(/Sorcerer spell attacks/);
    expect(glosses.some((g) => g?.includes("on Sorcerer spell attacks"))).toBe(true);
  });
});
