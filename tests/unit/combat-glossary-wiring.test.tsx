/**
 * Beginner glossary on Play's combat labels: where a core combat term's name is
 * already on screen as a label, tapping it opens its plain-language line
 * (glossary-combat.guard pins the lines; this pins the wiring on the real
 * surfaces). One representative label per surface.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import i18n from "@/i18n";
import { ResourceRail } from "@/features/character/molecules/ResourceRail";
import { DeathSaves } from "@/features/character/molecules/DeathSaves";
import { BloodiedMark } from "@/features/character/molecules/HpEditPopover";
import { SituationalRules } from "@/features/character/center/tabs/SituationalRules";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import { MOCK_CHARACTER } from "@/lib/mock";
import enGlossary from "@/i18n/en/ui/glossary.json";

const LINES = enGlossary.glossary.term;

function opens(name: string, line: string): void {
  fireEvent.click(screen.getByRole("button", { name: `Learn about ${name}` }));
  expect(screen.getByRole("dialog")).toHaveTextContent(line);
}

function renderRail(scenario: string, conditions: string[] = []): void {
  const spec = DEV_SCENARIOS[scenario];
  if (!spec) throw new Error(`missing dev scenario: ${scenario}`);
  const character = buildScenario(spec);
  character.session.conditions = conditions;
  useCharacterStore.setState({ character, readonly: false, loading: false, error: null });
  render(
    <MemoryRouter>
      <ResourceRail />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useUIStore.setState({ sheetMode: "play", playRefSections: {} });
});
afterEach(() => {
  useCharacterStore.setState({ character: null, loading: false, error: null });
});

describe("beginner glossary on Play's combat labels", () => {
  it("the Defenses row label explains Resistance", () => {
    renderRail("life-cleric", ["petrified"]);
    opens("Resistances", LINES.resistance);
  });

  it("an Advantages row label explains Advantage", () => {
    renderRail("barbarian-extra-attack");
    const [first] = screen.getAllByRole("button", { name: "Learn about Advantage" });
    if (!first) throw new Error("no Advantage row");
    fireEvent.click(first);
    expect(screen.getByRole("dialog")).toHaveTextContent(LINES.advantage);
  });

  it("the death-save track's title explains the Death Saving Throw", () => {
    const base = structuredClone(MOCK_CHARACTER);
    useCharacterStore.setState({
      character: {
        ...base,
        session: { ...base.session, hp: { ...base.session.hp, current: 0 } },
      },
      loading: false,
      error: null,
    });
    render(<DeathSaves />);
    opens("Death Saves", LINES.deathSavingThrow);
  });

  it("each cover row in the Rules Reference explains its level", () => {
    render(<SituationalRules />);
    fireEvent.click(screen.getByRole("button", { name: /rules reference/i }));
    opens("Half Cover", LINES.halfCover);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(
      screen.getByRole("button", { name: "Learn about Total Cover", hidden: true })
    ).toBeInTheDocument();
  });

  it("a glossed Bloodied mark explains Bloodied; the plain one stays a hint", () => {
    const { container } = render(
      <>
        <BloodiedMark label="Bloodied" hint="At half HP or less." glossed />
        <span data-testid="plain">
          <BloodiedMark label="Bloodied" hint="At half HP or less." />
        </span>
      </>
    );
    expect(
      within(screen.getByTestId("plain")).queryByRole("button")
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll("button.glossary-term")).toHaveLength(1);
    opens("Bloodied", LINES.bloodied);
  });
});
