/**
 * «Trattieni il respiro» on the new Play (rules-gap board B; SRD 5.2.1 Suffocation):
 * set from «Condizioni» beside «In fiamme», the rounds of air left on its row (each End
 * Turn counts one down, the engine's `breath-turn-end`), and «Respira di nuovo» ends
 * it, taking back the Exhaustion suffocating gave.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayConditions } from "@/domains/play/ui/PlayConditions";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

function Live() {
  const doc = useCharacterStore((s) => s.character);
  return doc ? <PlayConditions doc={doc} locale="en" /> : null;
}

const session = () => useCharacterStore.getState().character?.session;

describe("Hold breath", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(
      makeCharacterDoc({
        abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      })
    );
    useCharacterStore.setState({ readonly: false });
  });

  it("is set from «Conditions» with the rounds of air it gives", () => {
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: /Conditions/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hold breath" }));
    // CON 14: 1 + 2 minutes = 30 rounds
    expect(session()?.breath?.roundsLeft).toBe(30);
    expect(screen.getByText(/30 rounds of air left/)).toBeTruthy();
  });

  it("breathing again ends it", () => {
    useCharacterStore.getState().dispatch({ kind: "hold-breath" });
    render(<Live />);
    fireEvent.click(screen.getByRole("button", { name: /Conditions/ }));
    fireEvent.click(screen.getByRole("button", { name: "Breathe again" }));
    expect(session()?.breath).toBeUndefined();
  });
});
