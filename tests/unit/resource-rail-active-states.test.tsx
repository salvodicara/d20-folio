/**
 * The rail shows a held state ONCE, under "Active" (owner 2026-10-09: "no doppione";
 * Status is for conditions such as Poisoned or Asleep). A concentration spell that
 * also lights its state on the caster (Bless on me) is one chip, not two.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import i18n from "@/i18n";
import { ResourceRail } from "@/features/character/molecules/ResourceRail";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import { concentrationValue } from "@/lib/concentration";

function section(rubric: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: rubric });
  return heading.closest("section") as HTMLElement;
}

function loadCleric(activeFeatures: string[]) {
  const spec = DEV_SCENARIOS["life-cleric"];
  if (!spec) throw new Error("missing dev scenario: life-cleric");
  const character = buildScenario(spec);
  character.session.concentration = concentrationValue("bless");
  character.session.activeFeatures = activeFeatures;
  useCharacterStore.setState({ character, readonly: false, loading: false, error: null });
}

describe("ResourceRail — held states", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useUIStore.setState({ sheetMode: "play" });
  });

  it("Bless held and lit on me: one chip under Active, none under Status", () => {
    loadCleric(["spell-bless"]);
    render(
      <MemoryRouter>
        <ResourceRail />
      </MemoryRouter>
    );
    expect(within(section("Active")).getAllByText(/Bless/)).toHaveLength(1);
    expect(within(section("Status")).queryByText(/Bless/)).not.toBeInTheDocument();
  });

  it("Bless held on others only: still under Active, and its × stops concentrating", () => {
    loadCleric([]);
    render(
      <MemoryRouter>
        <ResourceRail />
      </MemoryRouter>
    );
    const active = section("Active");
    expect(within(active).getAllByText(/Bless/)).toHaveLength(1);
    fireEvent.click(
      within(active).getByRole("button", {
        name: /stop concentrating|clear concentration|end concentration/i,
      })
    );
    expect(useCharacterStore.getState().character?.session.concentration).toBe("");
  });
});
