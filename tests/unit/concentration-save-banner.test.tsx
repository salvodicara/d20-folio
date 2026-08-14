import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ConcentrationSaveBanner } from "@/features/character/ConcentrationSaveBanner";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";
import { conc } from "./__helpers__/concentration";

function loadConcentrator({ advantage = false } = {}) {
  const character = makeCharacterDoc(
    advantage
      ? {
          classes: [
            {
              classId: "warlock",
              level: 5,
              invocationChoices: ["eldritch-mind"],
            },
          ],
        }
      : {},
    {
      hp: { current: 44, temp: 0 },
      concentration: conc("bless"),
    }
  );
  useCharacterStore.getState().setCharacter(character);
}

beforeEach(() => {
  useToastStore.getState().clearAll();
  useUndoStore.getState().clear("test-char");
  useCharacterStore.setState({
    character: null,
    readonly: false,
    combatPersistence: null,
    combatActiveEffects: [],
    combatPendingConcentrationSaves: [],
  });
});

describe("ConcentrationSaveBanner", () => {
  it("renders the durable FIFO head with DC and advances after a successful entered roll", () => {
    loadConcentrator();
    act(() => {
      useCharacterStore.getState().applyDamage(22);
      useCharacterStore.getState().applyDamage(10);
    });
    render(<ConcentrationSaveBanner />);
    expect(screen.getByText(/con save dc 11/i)).toBeInTheDocument();
    expect(screen.getByText(/2 saves queued/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/concentration-save d20 result/i), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^apply$/i }));
    expect(screen.getByText(/con save dc 10/i)).toBeInTheDocument();
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toHaveLength(1);
  });

  it("asks for two physical faces under net Advantage", () => {
    loadConcentrator({ advantage: true });
    act(() => {
      useCharacterStore.getState().applyDamage(10);
    });
    render(<ConcentrationSaveBanner />);
    expect(screen.getByText(/^advantage$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/first physical d20/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/second physical d20/i)).toBeInTheDocument();
  });

  it("a failure ends Concentration; undo restores the exact prompt and redo re-resolves it", () => {
    loadConcentrator();
    act(() => {
      useCharacterStore.getState().applyDamage(10);
    });
    render(<ConcentrationSaveBanner />);
    fireEvent.change(screen.getByLabelText(/concentration-save d20 result/i), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^apply$/i }));
    expect(useCharacterStore.getState().character?.session.concentration).toBe("");
    expect(screen.queryByText(/con save dc/i)).not.toBeInTheDocument();

    act(() => {
      expect(useUndoStore.getState().undo()).toBe(true);
    });
    expect(useCharacterStore.getState().character?.session.concentration).toBe(
      conc("bless")
    );
    expect(screen.getByText(/con save dc 10/i)).toBeInTheDocument();

    act(() => {
      expect(useUndoStore.getState().redo()).toBe(true);
    });
    expect(useCharacterStore.getState().character?.session.concentration).toBe("");
    expect(screen.queryByText(/con save dc/i)).not.toBeInTheDocument();
  });
});
