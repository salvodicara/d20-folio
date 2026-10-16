/**
 * Beginner glossary on toggles: a term whose name IS a toggle's label (Critical,
 * Difficult Terrain ×2, Surprised, the AC tile's cover) cannot nest its tip inside
 * the toggle button, so a small info mark rides right after the toggle and opens
 * the term's plain-language line. One case per surface, on the real component.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", () => ({
  setEncounterInitiative: vi.fn(() => Promise.resolve()),
}));

import i18n from "@/i18n";
import { Dialog } from "@/components/ui/dialog";
import { DamageTrayPanel } from "@/components/shared/DamageTrayPanel";
import { MovementSlider } from "@/features/character/center/MovementSlider";
import { ThisTurnTracker } from "@/features/character/center/ThisTurnTracker";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { CombatHeader } from "@/features/character/center/CombatHeader";
import { COMBAT_GLOSSARY } from "@/components/shared/combat-glossary";
import { COVER_REFERENCE } from "@/data/cover";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUIStore } from "@/stores/uiStore";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { MOCK_CHARACTER } from "@/lib/mock";
import enGlossary from "@/i18n/en/ui/glossary.json";
import itGlossary from "@/i18n/it/ui/glossary.json";

const EN = enGlossary.glossary.term;
const coverName = (id: string) => COVER_REFERENCE.find((c) => c.id === id)?.name;

/** The info mark right after `toggle` opens `line` under `rubric`. */
function markAfter(toggle: HTMLElement, rubric: string, line: string): void {
  const mark = toggle.nextElementSibling as HTMLElement | null;
  expect(mark).not.toBeNull();
  expect(mark).toHaveClass("glossary-term", "glossary-info");
  expect(mark).toHaveAccessibleName(`Learn about ${rubric}`);
  fireEvent.click(mark as HTMLElement);
  const pop = screen.getByRole("dialog", { name: rubric });
  expect(pop).toHaveTextContent(line);
}

function loadCharacter(): void {
  const character = structuredClone(MOCK_CHARACTER);
  character.session.initiative = "";
  useCharacterStore.setState({
    character,
    readonly: false,
    loading: false,
    error: null,
  });
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useUIStore.setState({ sheetMode: "play" });
});
afterEach(async () => {
  useCharacterStore.setState({ character: null, loading: false, error: null });
  useCombatStatusStore.setState({ status: null, pip: null });
  await i18n.changeLanguage("en");
});

describe("info marks after toggles explain their term", () => {
  it("the damage tray's Critical outcome explains Critical Hit", () => {
    render(
      <Dialog open>
        <DamageTrayPanel
          title="Longsword"
          plan={{ effect: "damage", attack: { onMiss: "none" }, targets: ["g1"] }}
          targets={[{ id: "g1", name: "Goblin", kind: "monster" }]}
          onApply={() => {}}
          onSkip={() => {}}
        />
      </Dialog>
    );
    const group = screen.getByRole("group", { name: "Attack result on Goblin" });
    markAfter(group, COMBAT_GLOSSARY.criticalHit.en, EN.criticalHit);
  });

  it("the movement meter's ×2 explains Difficult Terrain", () => {
    render(
      <MovementSlider
        speedFt={30}
        usedFt={0}
        onChange={() => {}}
        locale="en"
        onDifficultTerrainChange={() => {}}
      />
    );
    const toggle = screen.getByRole("button", { name: /^difficult terrain/i });
    markAfter(toggle, COMBAT_GLOSSARY.difficultTerrain.en, EN.difficultTerrain);
  });

  it("the Surprised chip by the initiative explains Surprise", () => {
    loadCharacter();
    useCombatStore.setState({ initiative: "" });
    const { container } = render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <ThisTurnTracker />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    const init = container.querySelector(".turn .init") as HTMLElement;
    const chip = within(init).getByRole("button", { name: "Surprised" });
    markAfter(chip, COMBAT_GLOSSARY.surprise.en, EN.surprise);
  });

  it("the AC tile's cover toggle explains Half Cover, the first tap's level", () => {
    loadCharacter();
    render(
      <MemoryRouter>
        <CombatHeader />
      </MemoryRouter>
    );
    const vitals = screen.getByRole("group", { name: "Vital statistics" });
    const toggle = within(vitals).getByRole("button", { name: /^cover: none/i });
    markAfter(toggle, coverName("half")?.en ?? "", EN.halfCover);
  });

  it("speaks Italian with the official names", async () => {
    await i18n.changeLanguage("it");
    render(
      <MovementSlider
        speedFt={30}
        usedFt={0}
        onChange={() => {}}
        locale="it"
        onDifficultTerrainChange={() => {}}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Scopri cosa significa Terreno Difficile" })
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      itGlossary.glossary.term.difficultTerrain
    );
  });
});
