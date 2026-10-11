/**
 * Quickened and Extended Spell through the real cast seam: the picked option
 * changes the logged economy slot / the armed countdown, and one undo restores
 * exactly what the cast changed.
 */
import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import {
  useTurnEconomy,
  type TurnEconomyApi,
} from "@/features/character/center/useTurnEconomy";
import { litText } from "@/lib/loc-text";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

let economy: TurnEconomyApi | null = null;

function Probe() {
  const value = useTurnEconomy();
  useEffect(() => {
    economy = value;
  }, [value]);
  return null;
}

const KEY = "spell-blur";
const ROUNDS = 10;

const blur: ResolvedAction = {
  id: "spell-blur",
  name: "Blur",
  nameLoc: litText({ en: "Blur", it: "Sfocatura" }),
  type: "action",
  source: "spell",
  spellId: "blur",
  spellLevel: 2,
  slotLevel: 2,
  concentration: false,
  summary: {},
  costsSlot: true,
  pinned: false,
  defaultPinned: false,
  activatesKey: KEY,
  activeDurationRounds: ROUNDS,
};

function live() {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("missing character");
  return doc;
}

beforeEach(() => {
  economy = null;
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  const doc = makeCharacterDoc({
    classes: [
      {
        classId: "sorcerer",
        level: 5,
        metamagicChoices: ["quickened-spell", "extended-spell"],
      },
    ],
    features: [{ srdId: "sorcerer-font-of-magic" }, { srdId: "sorcerer-metamagic" }],
    spells: [{ srdId: "blur", prepared: true }],
    spellSlots: [{ level: 2, total: 3 }],
  });
  doc.session.spellSlots = {};
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
  });
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <Probe />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
});

async function castWith(option: RegExp) {
  act(() => economy?.executeAction(blur));
  fireEvent.click(await screen.findByRole("button", { name: option }));
  fireEvent.click(screen.getByRole("button", { name: /level 2 slot/i }));
  await waitFor(() => expect(live().session.spellSlots["2"]?.used).toBe(1));
}

it("Extended Spell doubles the armed countdown; undo clears it", async () => {
  await castWith(/extended/i);
  expect(live().session.effectTimers?.[KEY]?.roundsLeft).toBe(ROUNDS * 2);
  act(() => expect(useUndoStore.getState().undo()).toBe(true));
  expect(live().session.effectTimers?.[KEY]).toBeUndefined();
  expect(live().session.spellSlots["2"]?.used ?? 0).toBe(0);
});

it("a plain cast keeps the spell's own countdown; undo clears it", async () => {
  act(() => economy?.executeAction(blur));
  fireEvent.click(await screen.findByRole("button", { name: /level 2 slot/i }));
  await waitFor(() => expect(live().session.spellSlots["2"]?.used).toBe(1));
  expect(live().session.effectTimers?.[KEY]?.roundsLeft).toBe(ROUNDS);
  act(() => expect(useUndoStore.getState().undo()).toBe(true));
  expect(live().session.effectTimers?.[KEY]).toBeUndefined();
});

it("Quickened Spell records the cast as a Bonus Action; undo removes the line", async () => {
  await castWith(/quickened/i);
  expect(live().session.logEntries.at(-1)?.event).toMatchObject({
    kind: "action-use",
    slot: "bonus",
  });
  act(() => expect(useUndoStore.getState().undo()).toBe(true));
  expect(live().session.logEntries).toHaveLength(0);
});
