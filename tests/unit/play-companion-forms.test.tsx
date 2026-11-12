/**
 * A companion's form on the Play screen (board 2b, D6): Giant Insect's Centipede /
 * Spider / Wasp. The one in use is a chip; pressed, the others open and a tap switches.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { playCompanions } from "@/domains/play/play-companions-view";
import { PlayCompanions } from "@/domains/play/ui/PlayCompanions";
import { concentrationValue } from "@/lib/concentration";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

const insect: CharacterDoc = {
  ...MOCK_CHARACTER,
  character: {
    ...MOCK_CHARACTER.character,
    spells: [{ srdId: "giant-insect", prepared: true }],
  },
  session: {
    ...MOCK_CHARACTER.session,
    concentration: concentrationValue("giant-insect"),
    companionVariant: { "giant-insect": "spider" },
  },
};

function Live() {
  const doc = useCharacterStore((s) => s.character);
  return doc ? <PlayCompanions doc={doc} locale="en" /> : null;
}

describe("companion forms", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: insect, readonly: false, loading: false });
  });

  it("the view lists the forms and the one in use", () => {
    const [c] = playCompanions(insect, "en", (k) => k);
    expect(c?.forms?.formKey).toBe("giant-insect");
    expect(c?.forms?.options.map((o) => o.id)).toEqual(["centipede", "spider", "wasp"]);
    expect(c?.forms?.selected).toBe("spider");
  });

  it("pressing the form opens the others; a tap switches it", () => {
    render(
      <MemoryRouter>
        <Live />
      </MemoryRouter>
    );
    const group = screen.getByRole("group", { name: "Form" });
    const chips = within(group).getAllByRole("button");
    expect(chips).toHaveLength(1);
    fireEvent.click(chips[0] as HTMLElement);
    const others = within(group).getAllByRole("button").slice(1);
    expect(others).toHaveLength(2);
    fireEvent.click(others[1] as HTMLElement);
    expect(useCharacterStore.getState().character?.session.companionVariant).toEqual({
      "giant-insect": "wasp",
    });
  });
});
