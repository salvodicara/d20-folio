/**
 * The new Play's left column offers Font of Inspiration's «Spend a slot → Bardic
 * Inspiration», as the classic rail does: one tap spends the lowest slot left and
 * gives back one spent use; the undo toast takes both back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayLeft } from "@/domains/play/ui/PlayLeft";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { makeCharacterDoc } from "./_helpers";

function Live() {
  const doc = useCharacterStore((s) => s.character);
  return doc ? <PlayLeft doc={doc} locale="en" /> : null;
}

beforeEach(() => {
  useToastStore.setState({ toasts: [], timers: {} });
  const doc = makeCharacterDoc(
    {
      classId: "bard",
      level: 5,
      abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 },
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
      ],
      features: [
        { srdId: "bard-bardic-inspiration" },
        { srdId: "bard-font-of-inspiration" },
      ],
    },
    { trackers: { "bard-bardic-inspiration": { used: 2 } } }
  );
  useCharacterStore.setState({ character: doc, readonly: false });
});

describe("PlayLeft: a spell slot refills Bardic Inspiration", () => {
  it("spends the lowest slot for one use; the undo gives both back", () => {
    render(<Live />);
    fireEvent.click(
      screen.getByRole("button", { name: /^Spend a slot → Bardic Inspiration/ })
    );
    const session = () => useCharacterStore.getState().character?.session;
    expect(session()?.trackers["bard-bardic-inspiration"]?.used).toBe(1);
    expect(session()?.spellSlots["1"]?.used ?? 0).toBe(1);
    const undo = useToastStore.getState().toasts.at(-1)?.onUndo;
    act(() => undo?.());
    expect(session()?.trackers["bard-bardic-inspiration"]?.used).toBe(2);
    expect(session()?.spellSlots["1"]?.used ?? 0).toBe(0);
  });
});
