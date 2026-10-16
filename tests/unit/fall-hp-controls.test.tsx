/**
 * The HP popover's fall preset through the real damage path (SRD "Falling"): the
 * rolled total lands as Bludgeoning damage and, when it hurts, you land Prone. Both
 * log lines name the fall, and ONE undo takes back the damage and the Prone.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { useHpControls } from "@/features/character/molecules/use-hp-controls";
import { MOCK_CHARACTER } from "@/lib/mock";

vi.mock("@/stores/toastStore", () => {
  const showToast = vi.fn(() => "toast-1");
  const useToastStore = Object.assign(
    (selector: (s: { showToast: typeof showToast }) => unknown) =>
      selector({ showToast }),
    { getState: () => ({ showToast, dismissToast: vi.fn() }) }
  );
  return { useToastStore };
});

const sess = () => useCharacterStore.getState().character?.session;
const FALL = { ui: "combat.fallSource" };

beforeEach(() => {
  useUndoStore.setState({ characterId: null, past: [], future: [] });
  useCharacterStore.getState().setCharacter({
    ...MOCK_CHARACTER,
    session: {
      ...MOCK_CHARACTER.session,
      hp: { ...MOCK_CHARACTER.session.hp, current: 30, temp: 0 },
      conditions: [],
      activeFeatures: [],
      concentration: "",
      logEntries: [],
    },
  });
});

describe("useHpControls — a fall", () => {
  it("deals the rolled total, lands you Prone, logs both with the fall as source", () => {
    const { result } = renderHook(() => useHpControls());
    act(() => result.current.applyFall(7, { prone: true }));
    expect(sess()?.hp.current).toBe(23);
    expect(sess()?.conditions).toContain("prone");
    const events = sess()?.logEntries.map((e) => e.event) ?? [];
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "hp-damage", amount: 7, source: FALL })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "condition-gain",
        conditionId: "prone",
        source: FALL,
      })
    );
    expect(useUndoStore.getState().past).toHaveLength(1);

    act(() => {
      useUndoStore.getState().undo();
    });
    expect(sess()?.hp.current).toBe(30);
    expect(sess()?.conditions).not.toContain("prone");
  });

  it("leaves Prone off when the player turns the offer off", () => {
    const { result } = renderHook(() => useHpControls());
    act(() => result.current.applyFall(4, { prone: false }));
    expect(sess()?.hp.current).toBe(26);
    expect(sess()?.conditions).not.toContain("prone");
  });
});
