/**
 * The sheet's status chips (Conditions, Effects, Inspiration) wear a sprite icon, not a
 * Unicode glyph (design reset «BG3 craft», critique D10). The icon is decorative: the
 * chip's accessible name is its words alone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayConditions } from "@/domains/play/ui/PlayConditions";
import { PlayEffects } from "@/domains/play/ui/PlayEffects";
import { PlayInspiration } from "@/domains/play/ui/PlayInspiration";
import { usePartyAuraOffers } from "@/features/campaigns/use-party-aura";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

/** The chip's icon: a hidden svg drawing the named sprite symbol. */
const icon = (chip: HTMLElement) => {
  const svg = chip.querySelector("svg");
  return {
    hidden: svg?.getAttribute("aria-hidden"),
    href: svg?.querySelector("use")?.getAttribute("href"),
  };
};

describe("status chips wear sprite icons", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(makeCharacterDoc({}));
    useCharacterStore.setState({ readonly: false });
    usePartyAuraOffers.setState({
      offers: [{ characterId: "pal", name: "Bren Ironbeard", bonus: 3, on: true }],
    });
  });

  const doc = () => {
    const current = useCharacterStore.getState().character;
    if (!current) throw new Error("no character loaded");
    return current;
  };

  it("Conditions: the warning icon, and the name is the word alone", () => {
    render(
      <MemoryRouter>
        <PlayConditions doc={doc()} locale="en" />
      </MemoryRouter>
    );
    const chip = screen.getByRole("button", { name: "Conditions" });
    expect(icon(chip)).toEqual({
      hidden: "true",
      href: "/assets/ui-icons.svg#g-condition",
    });
  });

  it("Effects: the sparkle icon, and the name is the word and its count", () => {
    render(
      <MemoryRouter>
        <PlayEffects doc={doc()} locale="en" />
      </MemoryRouter>
    );
    const chip = screen.getByRole("button", { name: /^Effects ?\d+$/ });
    expect(icon(chip)).toEqual({ hidden: "true", href: "/assets/ui-icons.svg#g-effect" });
  });

  it("Inspiration: the outlined sparkle icon, and the name is the word alone", () => {
    render(
      <MemoryRouter>
        <PlayInspiration doc={doc()} />
      </MemoryRouter>
    );
    const chip = screen.getByRole("button", { name: "Inspiration" });
    expect(icon(chip)).toEqual({
      hidden: "true",
      href: "/assets/ui-icons.svg#g-inspiration",
    });
  });
});
