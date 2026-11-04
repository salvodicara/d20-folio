/**
 * The new creation screen never picks a background silently: the summary says «—»
 * and «Next» waits until the player picks one. The same holds for a species and its
 * own choices (an Elf's lineage, spellcasting ability and Keen Senses), and the abilities step opens on the class's
 * suggested scores with the background's +2/+1 already placed.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { suggestedScores } from "@/domains/creation/creation-view";
import { CreationScreen } from "@/domains/creation/ui/CreationScreen";

describe("CreationScreen", () => {
  it("a background is the player's pick: «—» and a waiting Next until then", () => {
    render(
      <MemoryRouter>
        <CreationScreen />
      </MemoryRouter>
    );
    const summary = () =>
      screen.getByText("Background", { selector: "dt" }).parentElement as HTMLElement;
    expect(within(summary()).getByText("—")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const next = screen.getByRole("button", { name: "Next" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Acolyte/ }));
    expect(within(summary()).getByText("Acolyte")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled")
    ).toBeNull();
  });

  it("a species, then its lineage, before Next; abilities open on the suggested scores", () => {
    render(
      <MemoryRouter>
        <CreationScreen />
      </MemoryRouter>
    );
    const next = () => screen.getByRole("button", { name: "Next" });
    fireEvent.click(screen.getByRole("button", { name: "Cleric" }));
    fireEvent.click(next());
    fireEvent.click(screen.getByRole("button", { name: /^Acolyte/ }));
    fireEvent.click(next());
    const summary = () =>
      screen.getByText("Species", { selector: "dt" }).parentElement as HTMLElement;
    expect(within(summary()).getByText("—")).toBeTruthy();
    expect(next().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Elf/ }));
    expect(within(summary()).getByText("Elf")).toBeTruthy();
    expect(next().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "High Elf" }));
    // Then the spellcasting ability its lineage spells use, and Keen Senses.
    expect(next().getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Choose your species spellcasting ability.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Wisdom" }));
    expect(next().getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Finish the species choices to continue.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Perception" }));
    expect(next().getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(next());
    // The class's ready-made scores, highest first, with the background's +2/+1 placed.
    const scores = Object.values(suggestedScores("fighter")).sort((a, b) => b - a);
    expect(screen.getByText(`Suggested: ${scores.join(", ")}`)).toBeTruthy();
    expect(
      screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent)
    ).toEqual(expect.arrayContaining(["Suggested", "+2 / +1"]));
    expect(next().getAttribute("aria-disabled")).toBeNull();
  });
});
