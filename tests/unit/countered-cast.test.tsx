/**
 * A countered spell keeps its slot (Counterspell 2024: "the spell fails, wasting its
 * action, Bonus Action or Reaction, but not its spell slot"). Each slot cast this turn
 * offers "Countered" on the turn meter; one tap gives the slot back and logs it, undo
 * takes it away again, and the offer ends with the turn.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
vi.mock("@/lib/firebase", () => ({}));
import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { makeCharacterDoc } from "./_helpers";
import { ThisTurnTracker } from "@/features/character/center/ThisTurnTracker";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { MOCK_CHARACTER } from "@/lib/mock";
import { counterableCasts } from "@/lib/play/countered";
import type { CharacterDoc, LogEntry } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";

const FIREBALL: CombatEvent = {
  kind: "action-use",
  action: { srd: { kind: "spell", key: "fireball", field: "name" } },
  effect: "spell-cast",
  slot: "action",
  paidSlot: { level: 3 },
};
const entry = (id: string, event: CombatEvent): LogEntry => ({ id, ts: 0, event });

describe("which casts can be marked countered", () => {
  it("this turn's slot casts, not cantrips, not last turn's, not twice", () => {
    const cantrip: CombatEvent = { ...FIREBALL, paidSlot: undefined };
    expect(
      counterableCasts([entry("a", FIREBALL), entry("b", cantrip)]).map((c) => c.entryId)
    ).toEqual(["a"]);
    expect(
      counterableCasts([entry("a", FIREBALL), entry("t", { kind: "turn-end", round: 1 })])
    ).toEqual([]);
    expect(
      counterableCasts([
        entry("a", FIREBALL),
        entry("c", {
          kind: "spell-countered",
          action: FIREBALL.action,
          entryId: "a",
          level: 3,
        }),
      ])
    ).toEqual([]);
  });
});

describe("a Counterspell that is itself countered", () => {
  // Counterspell is a Reaction: when a foe counters it, its slot comes back too.
  it("the Reaction cast can be marked countered, in a fight", async () => {
    useCombatStatusStore.getState().set(null, null);
    useCombatStore.getState().endCombat();
    const doc = makeCharacterDoc({ classId: "wizard", level: 5 });
    doc.character.spells = [{ srdId: "counterspell", prepared: true }];
    doc.character.spellSlots = [{ level: 3, total: 2 }];
    doc.session.spellSlots = {};
    doc.session.logEntries = [];
    useCharacterStore.setState({ character: doc, loading: false, error: null });
    useCombatStore.setState({ fightStarted: true });
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <PlayTab />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /^all/i }));
    fireEvent.click(screen.getByRole("button", { name: /^React: Counterspell/ }));
    const log = () => useCharacterStore.getState().character?.session.logEntries ?? [];
    await waitFor(() => expect(log()).toHaveLength(1));
    expect(counterableCasts(log())).toMatchObject([
      { entryId: log()[0]?.id, level: 3, pactMagic: false },
    ]);
  });
});

function wizard(): CharacterDoc {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.spellSlots = [{ level: 3, total: 2 }];
  doc.session.spellSlots = { "3": { used: 1 } };
  doc.session.logEntries = [entry("cast-1", FIREBALL)];
  return doc;
}

describe("the turn meter's Countered", () => {
  beforeEach(() => {
    useCombatStatusStore.getState().set(null, null);
    useCombatStore.getState().endCombat();
  });

  it("gives the slot back, logs it, and undo takes it away", { timeout: 60_000 }, () => {
    useCharacterStore.setState({ character: wizard(), loading: false, error: null });
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <ThisTurnTracker />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    const live = () => useCharacterStore.getState().character;
    fireEvent.click(
      screen.getByRole("button", {
        name: "Countered: Fireball. Get its level 3 slot back",
      })
    );
    expect(live()?.session.spellSlots["3"]?.used ?? 0).toBe(0);
    expect(live()?.session.logEntries.at(-1)?.event).toMatchObject({
      kind: "spell-countered",
      entryId: "cast-1",
      level: 3,
    });
    expect(screen.queryByTestId("countered-cast")).toBeNull();

    act(() => {
      expect(useUndoStore.getState().undo()).toBe(true);
    });
    expect(live()?.session.spellSlots["3"]?.used).toBe(1);
    expect(live()?.session.logEntries.at(-1)?.event.kind).toBe("action-use");
  });
});
