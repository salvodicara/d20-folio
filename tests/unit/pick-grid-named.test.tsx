/**
 * Picks are named at every width and read without a hover (design reset «BG3 craft»,
 * slice 5c; critique D7): on a wide screen the inspect card beside the list opens on
 * the first option before anything is picked or hovered, so no «hover an option» hint
 * is needed, and a tap or a focus moves it. Every option carries its visible name.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({}));

import { PickGrid } from "@/domains/spells/ui/PickGrid";

const realMatchMedia = window.matchMedia;
function asWide(wide: boolean) {
  window.matchMedia = (query: string) => ({
    matches: wide && query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

const options = [
  { id: "acrobatics", label: "Acrobatics" },
  { id: "history", label: "History" },
  { id: "stealth", label: "Stealth" },
];

const mount = (picked: string[] = []) =>
  render(
    <PickGrid
      label="Expertise"
      options={options}
      picked={picked}
      count={1}
      info="skill"
      locale="en"
      onToggle={() => {}}
    />
  );

/** The inspect card's title. */
const cardName = () => screen.getByRole("heading", { level: 3 }).textContent;

describe("PickGrid reads without a hover", () => {
  it("a wide screen opens the card on the first option, with no hover hint", () => {
    asWide(true);
    const { container } = mount();
    expect(cardName()).toBe("Acrobatics");
    expect(container.querySelector(".f-pick-hint")).toBeNull();
  });

  it("a focus moves the card to that option", () => {
    asWide(true);
    mount();
    fireEvent.focus(screen.getByRole("button", { name: "Stealth" }));
    expect(cardName()).toBe("Stealth");
  });

  it.each([true, false])("every option shows its name (wide: %s)", (wide) => {
    asWide(wide);
    const { container } = mount();
    const names = [...container.querySelectorAll(".f-slot .f-slot-n")].map(
      (n) => n.textContent
    );
    expect(names).toEqual(["Acrobatics", "History", "Stealth"]);
    // no second copy of the name in a hover-only tooltip
    expect(container.querySelector(".f-slot-tip")).toBeNull();
  });
});

describe("the stylesheet names picks at every width", () => {
  const css = readFileSync(join(process.cwd(), "src/ui/ui.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  );
  it("never hides an option's name", () => {
    expect(css).not.toMatch(/\.f-slot-n\s*\{[^}]*display:\s*none/);
  });
  it("draws no hover-only tooltip on an option", () => {
    expect(css).not.toMatch(/\.f-slot:hover\s*>\s*\.f-slot-tip/);
  });
});
