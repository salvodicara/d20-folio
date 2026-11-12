import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ConcentrationSaveBanner } from "@/features/character/ConcentrationSaveBanner";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";
import { conc } from "./__helpers__/concentration";
import { customInstanceId } from "./__helpers__/custom-items";

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

  it("Heroic Inspiration: a failed roll offers its reroll; the new roll stands and spends it", () => {
    const character = makeCharacterDoc(
      {},
      { hp: { current: 44, temp: 0 }, concentration: conc("bless"), inspiration: true }
    );
    useCharacterStore.getState().setCharacter(character);
    act(() => {
      useCharacterStore.getState().applyDamage(10);
    });
    render(<ConcentrationSaveBanner />);
    fireEvent.change(screen.getByLabelText(/concentration-save d20 result/i), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Heroic Inspiration: reroll$/ }));
    fireEvent.change(screen.getByLabelText(/concentration-save d20 result/i), {
      target: { value: "18" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^apply$/i }));
    const live = useCharacterStore.getState();
    expect(live.combatPendingConcentrationSaves).toHaveLength(0);
    expect(live.character?.session.concentration).toBeTruthy();
    expect(live.character?.session.inspiration).toBe(false);
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

describe("a failed Concentration save a Reaction spell turns into a 20", () => {
  const omen = {
    custom: true as const,
    name: "Omen of Twenty",
    level: 8,
    school: "divination",
    castingTime: "reaction",
    range: "self",
    components: { v: true, s: false, m: false },
    duration: "instantaneous",
    concentration: false,
    description: "A failed roll becomes a 20.",
    instanceId: customInstanceId("omen-of-twenty"),
    mechanics: { failedD20Becomes: 20 },
  };

  function loadSeer() {
    const character = makeCharacterDoc(
      {
        classes: [{ classId: "wizard", level: 17 }],
        spells: [omen as never, { srdId: "bless", prepared: true }],
        spellSlots: [{ level: 8, total: 1 }],
      },
      { hp: { current: 44, temp: 0 }, concentration: conc("bless") }
    );
    useCharacterStore.getState().setCharacter(character);
    useCombatStore.setState({ reactionUsed: false });
  }

  it("offers it on a failing roll; using it keeps Concentration and spends the slot and the Reaction; undo gives both back", () => {
    loadSeer();
    act(() => {
      useCharacterStore.getState().applyDamage(30);
    });
    render(<ConcentrationSaveBanner />);
    const roll = screen.getByLabelText(/concentration-save d20 result/i);
    fireEvent.change(roll, { target: { value: "15" } });
    expect(screen.queryByRole("button", { name: /the d20 becomes 20/i })).toBeNull();
    fireEvent.change(roll, { target: { value: "2" } });
    fireEvent.click(
      screen.getByRole("button", { name: /^Omen of Twenty: the d20 becomes 20$/i })
    );
    const after = useCharacterStore.getState();
    expect(after.character?.session.concentration).toBe(conc("bless"));
    expect(after.character?.session.spellSlots["8"]?.used).toBe(1);
    expect(after.combatPendingConcentrationSaves).toHaveLength(0);
    expect(useCombatStore.getState().reactionUsed).toBe(true);

    act(() => {
      useUndoStore.getState().undo();
    });
    expect(
      useCharacterStore.getState().character?.session.spellSlots["8"]?.used ?? 0
    ).toBe(0);
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toHaveLength(1);
    expect(useCombatStore.getState().reactionUsed).toBe(false);
  });

  it("not offered once the Reaction is spent", () => {
    loadSeer();
    useCombatStore.setState({ reactionUsed: true });
    act(() => {
      useCharacterStore.getState().applyDamage(30);
    });
    render(<ConcentrationSaveBanner />);
    fireEvent.change(screen.getByLabelText(/concentration-save d20 result/i), {
      target: { value: "2" },
    });
    expect(screen.queryByRole("button", { name: /the d20 becomes 20/i })).toBeNull();
  });
});
