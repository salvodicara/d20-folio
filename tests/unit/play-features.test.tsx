/**
 * «Privilegi e tratti» on the Play screen (D&D Beyond's Features & Traits): the groups
 * under their headings, a limited feature's uses said aloud, and a tap that opens the
 * rules text, where rule words are glossary links.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PlayFeatures, PlayProficiencies } from "@/domains/play/ui/PlayFeatures";
import { MOCK_CHARACTER } from "@/lib/mock";

describe("PlayFeatures", () => {
  it("heads each origin group and says a limited feature's uses", () => {
    render(<PlayFeatures doc={MOCK_CHARACTER} locale="en" />);
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    ).toEqual(["Class Features", "Subclass Features", "Species traits", "Feats"]);
    expect(screen.getByLabelText("3 of 5 uses left")).toBeTruthy();
  });

  it("opens a feature's rules text on a tap, with its rule words tappable", () => {
    render(<PlayFeatures doc={MOCK_CHARACTER} locale="en" />);
    const row = screen.getByRole("button", { name: /^Bardic Inspiration/ });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    const prose = row.parentElement?.querySelector(".f-feat-d");
    expect(prose?.textContent).toMatch(/Bonus Action/);
    expect(prose?.querySelector("button")).toBeTruthy();
  });
});

describe("PlayProficiencies", () => {
  it("lists armor, weapons, tools and languages under their labels", () => {
    render(<PlayProficiencies doc={MOCK_CHARACTER} locale="en" />);
    const terms = screen.getAllByRole("term").map((t) => t.textContent);
    const values = screen.getAllByRole("definition").map((d) => d.textContent);
    expect(terms).toEqual(["Armor", "Weapons", "Tools", "Languages"]);
    expect(values[0]).toBe("Light armor");
    expect(values[3]).toBe("Common, Elvish, Draconic, Thieves' Cant");
  });
});
