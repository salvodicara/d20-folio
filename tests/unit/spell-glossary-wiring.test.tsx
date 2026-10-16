vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
/**
 * Beginner glossary on the spell cards and the Spells tab: where a spellcasting
 * term is already on screen as a label (a facts row, a casting-time value, a
 * range's area shape, a V/S/M letter, the At Higher Levels title, the
 * concentration filter), tapping it opens its plain-language line
 * (glossary-spells.guard pins the lines; this pins the wiring).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "@/i18n";
import { SpellsTab } from "@/features/character/center/tabs/SpellsTab";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { CastLevelModal } from "@/components/sheet/CastLevelModal";
import { rangeAreaTerm } from "@/components/shared/spell-glossary";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import enGlossary from "@/i18n/en/ui/glossary.json";

const LINES = enGlossary.glossary.term;

function opens(scope: HTMLElement, name: string, line: string): void {
  fireEvent.click(within(scope).getByRole("button", { name: `Learn about ${name}` }));
  expect(screen.getByRole("dialog")).toHaveTextContent(line);
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
}

function openCard(name: string): HTMLElement {
  const card = screen
    .getAllByText(name)
    .map((n) => n.closest<HTMLElement>(".uc"))
    .find((el): el is HTMLElement => el !== null);
  if (!card) throw new Error(`no card: ${name}`);
  fireEvent.click(card.querySelector(".uc-chevron") as HTMLElement);
  return card;
}

function renderTab(): void {
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <SpellsTab />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useUIStore.setState({ sheetMode: "play" });
  useCharacterStore.setState({
    character: structuredClone(MOCK_CHARACTER),
    loading: false,
    error: null,
  });
});
afterEach(() => {
  useCharacterStore.setState({ character: null, loading: false, error: null });
});

describe("beginner glossary on the spell cards", () => {
  it("Thunderwave's facts explain their labels, its Cube and its V/S letters", () => {
    renderTab();
    const card = openCard("Thunderwave");
    opens(card, "Casting Time", LINES.castingTime);
    opens(card, "Range", LINES.range);
    opens(card, "Cube", LINES.cube);
    opens(card, "Save", LINES.spellSave);
    opens(card, "Components", LINES.components);
    opens(card, "Verbal", LINES.verbal);
    opens(card, "Somatic", LINES.somatic);
  });

  it("Hypnotic Pattern explains its Duration and its Material letter", () => {
    renderTab();
    const card = openCard("Hypnotic Pattern");
    opens(card, "Duration", LINES.duration);
    opens(card, "Material", LINES.material);
  });

  it("a Bonus Action and a Reaction casting time explain their rule", () => {
    renderTab();
    opens(openCard("Healing Word"), "Bonus Action", LINES.bonusActionSpell);
    opens(openCard("Counterspell"), "Reaction", LINES.reactionSpell);
  });

  it("the At Higher Levels title explains upcasting", () => {
    renderTab();
    opens(openCard("Shatter"), "Higher-Level Spell Slot", LINES.upcasting);
  });

  it("the concentration filter carries an info mark", () => {
    renderTab();
    const filters = document.querySelector<HTMLElement>(".filters");
    if (!filters) throw new Error("no filters");
    opens(filters, "Concentration", LINES.concentration);
  });

  it("the cast-level modal's At Higher Levels explains upcasting", () => {
    render(
      <CastLevelModal
        request={{
          spellName: "Shatter",
          baseLevel: 2,
          options: [{ kind: "slot", level: 3, remaining: 1, total: 1 }],
          higherLevels: "More damage.",
        }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Learn about Higher-Level Spell Slot" })
    );
    expect(screen.getAllByRole("dialog").at(-1)).toHaveTextContent(LINES.upcasting);
  });
});

describe("rangeAreaTerm", () => {
  it.each([
    ["Self (15-foot cone)", "en", "cone"],
    ["Sé stessi (cono di 4,5 metri)", "it", "cone"],
    ["Self (10-foot-radius sphere)", "en", "sphere"],
    ["Sé stessi (emanazione di 3 metri)", "it", "emanation"],
    ["Self (60-foot line)", "en", "line"],
    ["Self (30-foot radius)", "en", "areaOfEffect"],
    ["Sé stessi (raggio di 9 metri)", "it", "areaOfEffect"],
    ["60 feet", "en", null],
    ["Unlimited", "en", null],
  ] as const)("%s (%s) → %s", async (range, locale, term) => {
    await i18n.loadLanguages(locale);
    expect(rangeAreaTerm(range, i18n.getFixedT(locale))).toBe(term);
  });
});
