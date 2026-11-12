/**
 * «In fiamme» on the new Play (rules-gap board A2; SRD 5.2.1 Burning; BG3's Burning
 * status): set by hand from «Condizioni», a fire chip in the status strip while it
 * burns, a turn-start reminder of its 1d4 Fire damage (the app never rolls), and put
 * out by rolling on the ground (the Action, then Prone) or from outside.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { turnStartNotes } from "@/domains/play/turn-start-notes";
import { PlayConditions } from "@/domains/play/ui/PlayConditions";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

function Live() {
  const doc = useCharacterStore((s) => s.character);
  return doc ? <PlayConditions doc={doc} locale="en" /> : null;
}

const session = () => useCharacterStore.getState().character?.session;

describe("On fire", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(makeCharacterDoc({}));
    useCharacterStore.setState({ readonly: false });
  });

  it("is set from «Conditions», and a fire chip then shows", () => {
    render(
      <MemoryRouter>
        <Live />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Conditions/ }));
    fireEvent.click(screen.getByRole("button", { name: "On fire" }));
    expect(session()?.burning).toBe(true);
    expect(screen.getAllByText("On fire").length).toBeGreaterThan(0);
  });

  it("rolling on the ground puts it out and leaves the character Prone", () => {
    useCharacterStore.getState().updateSession({ burning: true });
    render(
      <MemoryRouter>
        <Live />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Conditions/ }));
    fireEvent.click(screen.getByRole("button", { name: /Roll on the ground/ }));
    expect(session()?.burning).toBeFalsy();
    expect(session()?.conditions).toContain("prone");
  });

  it("put out from outside: no Prone", () => {
    useCharacterStore.getState().updateSession({ burning: true });
    render(
      <MemoryRouter>
        <Live />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Conditions/ }));
    fireEvent.click(screen.getByRole("button", { name: /Put out/ }));
    expect(session()?.burning).toBeFalsy();
    expect(session()?.conditions ?? []).not.toContain("prone");
  });

  it("each turn's start reminds the 1d4 Fire damage while it burns", () => {
    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("no character");
    expect(turnStartNotes(doc, { round: 2 }).some((n) => n.kind === "burning")).toBe(
      false
    );
    const burning = { ...doc, session: { ...doc.session, burning: true as const } };
    expect(turnStartNotes(burning, { round: 2 })).toContainEqual(
      expect.objectContaining({ kind: "burning", dice: "1d4" })
    );
  });
});
