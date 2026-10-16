/**
 * The rail agrees with the condition table: a condition's damage resistance
 * shows under Defenses (the HP popover already applies it), and a condition
 * implied by another one cannot be removed on its own, so its chip has no ×.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import i18n from "@/i18n";
import { ResourceRail } from "@/features/character/molecules/ResourceRail";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import { CONDITION_RULES } from "@/lib/condition";

function section(rubric: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: rubric });
  return heading.closest("section") as HTMLElement;
}

function renderWith(conditions: string[]) {
  const spec = DEV_SCENARIOS["life-cleric"];
  if (!spec) throw new Error("missing dev scenario: life-cleric");
  const character = buildScenario(spec);
  character.session.conditions = conditions;
  useCharacterStore.setState({ character, readonly: false, loading: false, error: null });
  render(
    <MemoryRouter>
      <ResourceRail />
    </MemoryRouter>
  );
}

const implicationCases = Object.entries(CONDITION_RULES).flatMap(([id, rule]) =>
  rule.kind === "occurrence" ? rule.implications.map((implied) => ({ id, implied })) : []
);

describe("ResourceRail — condition effects", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useUIStore.setState({ sheetMode: "play" });
  });

  it("Petrified shows its resistance to all damage under Defenses", () => {
    renderWith(["petrified"]);
    const defenses = section("Defenses");
    expect(within(defenses).getByText(/all damage/i)).toBeInTheDocument();
    expect(
      within(defenses).queryByText("No resistances or immunities.")
    ).not.toBeInTheDocument();
  });

  it.each(implicationCases)(
    "$implied implied by $id has no remove button and names its source",
    ({ id, implied }) => {
      renderWith([id]);
      const status = section("Status");
      const removes = within(status)
        .getAllByRole("button", { name: /^Remove / })
        .map((b) => b.getAttribute("aria-label"));
      expect(removes.some((label) => label?.toLowerCase().includes(id))).toBe(true);
      const impliedChip = within(status)
        .getAllByTitle(new RegExp(`^From ${id}$`, "i"))
        .find((chip) => chip.textContent.toLowerCase().includes(implied));
      if (!impliedChip) throw new Error(`no implied ${implied} chip`);
      // Its name still explains it (glossary tip); only the remove × is gone.
      expect(within(impliedChip).queryByRole("button", { name: /^Remove / })).toBeNull();
    }
  );
});
