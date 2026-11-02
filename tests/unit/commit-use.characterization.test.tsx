/**
 * Characterization of a use before its commit leaves the provider (simplify-core item 4,
 * docs/architecture/2026-11-simplify-core.md). Pins, through the real provider, the one
 * property the sealed `commitUse` must keep for every kind of use: the use changes the
 * sheet and the turn; one undo puts both back exactly as they were; one redo replays it.
 * Ids and clocks a replay mints again may differ (a redo's log line, the inventory row a
 * redo splits off); everything else may not. Since each use is one causal seal (item 4,
 * step 3), undo restores the sheet and the turn exactly.
 */
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import {
  useTurnEconomy,
  type TurnEconomyApi,
} from "@/features/character/center/useTurnEconomy";
import {
  useCombatStatusStore,
  type GlobalCombat,
} from "@/features/campaigns/global-combat-context";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { litText } from "@/lib/loc-text";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

const SCORES = { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 } as const;
const rogue: ScenarioSpec = {
  name: "Fletcher",
  raceId: "human",
  classId: "rogue",
  level: 3,
  background: "criminal",
  abilityScores: SCORES,
  weapons: [{ srdId: "shortbow", quantity: 1 }],
  equipment: [
    { srdId: "arrows", quantity: 18 },
    { srdId: "potion-of-healing", quantity: 2 },
  ],
};
const barbarian: ScenarioSpec = { ...rogue, name: "Brute", classId: "barbarian" };

/** A shared fight on this character's turn (the shape the End Turn characterization uses). */
const ME = "pc-user";
const fight = {
  campaignId: "campaign-1",
  characterId: "test-char",
  myId: ME,
  round: 2,
  gathering: false,
  isMyTurn: true,
  initiativeBonus: 2,
  initiativeRoll: 12,
  encounter: {
    combatants: [
      { kind: "pc", id: ME, memberUid: "user", characterId: "test-char" },
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        ac: 13,
        initiative: 10,
        conditions: [],
        hp: { current: 7, temp: 0, max: 7 },
      },
    ],
    nextMonsterOrdinal: 2,
    round: 2,
    currentCombatantId: ME,
    order: [ME, "monster-1"],
    epoch: 9,
    status: "active",
  },
  view: {
    rows: [
      { id: ME, kind: "pc", name: "Hero" },
      { id: "monster-1", kind: "monster", name: "Goblin" },
    ],
    turnOrderIds: [ME, "monster-1"],
    currentId: ME,
  },
} as unknown as GlobalCombat;

let api: TurnEconomyApi | null = null;
function Probe() {
  const economy = useTurnEconomy();
  useEffect(() => {
    api = economy;
  }, [economy]);
  return null;
}

function mount(spec: ScenarioSpec): void {
  const doc = buildScenario(spec);
  doc.id = "test-char";
  doc.session.logEntries = [];
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
}

function action(id: string): ResolvedAction {
  const doc = useCharacterStore.getState().character;
  const found = doc && localizeActions(doc, "en").find((a) => a.id === id);
  if (!found) throw new Error(`no ${id} action`);
  return found;
}

/** The sheet and the turn, with the replay-specific ids and clocks taken out. */
function state(): unknown {
  const doc = structuredClone(useCharacterStore.getState().character);
  for (const entry of doc?.session.logEntries ?? []) {
    delete (entry as { id?: string }).id;
    delete (entry as { ts?: number }).ts;
  }
  for (const row of doc?.character.equipment ?? [])
    delete (row as { instanceId?: string }).instanceId;
  // Every data field of the turn (the store's functions are not state).
  const turn = Object.fromEntries(
    Object.entries(useCombatStore.getState()).filter(([, v]) => typeof v !== "function")
  );
  return { doc, turn: structuredClone(turn) };
}

async function settle(run: () => void): Promise<void> {
  await act(async () => {
    run();
    for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  api = null;
  useUIStore.setState({ sheetMode: "play" });
  useToastStore.setState({ toasts: [], timers: {} });
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useCombatStatusStore.getState().set(null, null);
});

describe("a use today: it changes the sheet and the turn, one undo restores, one redo replays", () => {
  it.each([
    ["a bow shot that spends an arrow", rogue, "weapon-shortbow"],
    ["Cunning Action: Dash", rogue, "rogue-cunning-action-dash"],
    ["a healing potion", rogue, "item-potion-of-healing"],
    ["Rage", barbarian, "barbarian-rage-bonus"],
    ["Dodge", rogue, "base-dodge"],
  ])("%s", async (_name, spec, id) => {
    mount(spec);
    const before = state();
    await settle(() => api?.handleSelect(action(id)));
    const after = state();
    expect(after).not.toEqual(before);

    await settle(() => void useUndoStore.getState().undo());
    expect(state()).toEqual(before);

    await settle(() => void useUndoStore.getState().redo());
    expect(state()).toEqual(after);
  });

  it("an Opportunity Attack outside a fight (logged only, the reaction stays free)", async () => {
    mount(rogue);
    const before = state();
    await settle(() => api?.handleUseReaction(action("base-opportunity-attack")));
    const after = state();
    expect(after).not.toEqual(before);
    expect(useCombatStore.getState().reactionUsed).toBe(false);

    await settle(() => void useUndoStore.getState().undo());
    expect(state()).toEqual(before);

    await settle(() => void useUndoStore.getState().redo());
    expect(state()).toEqual(after);
  });

  it("Dodge on your turn in a fight fills the Action slot", async () => {
    mount(rogue);
    useCombatStatusStore.getState().set(fight, null);
    const before = state();
    await settle(() => api?.handleSelect(action("base-dodge")));
    const after = state();
    expect(useCombatStore.getState().selected.action.map((a) => a.id)).toEqual([
      "base-dodge",
    ]);

    await settle(() => void useUndoStore.getState().undo());
    expect(state()).toEqual(before);

    await settle(() => void useUndoStore.getState().redo());
    expect(state()).toEqual(after);
  });

  it("an Opportunity Attack in a fight spends the reaction", async () => {
    mount(rogue);
    useCombatStatusStore.getState().set(fight, null);
    const before = state();
    await settle(() => api?.handleUseReaction(action("base-opportunity-attack")));
    const after = state();
    expect(useCombatStore.getState().reactionUsed).toBe(true);

    await settle(() => void useUndoStore.getState().undo());
    expect(state()).toEqual(before);

    await settle(() => void useUndoStore.getState().redo());
    expect(state()).toEqual(after);
  });
});

/** A spell as the cast seam receives it (no catalogue id: the cast commits without a picker). */
function spell(
  id: string,
  type: "action" | "reaction",
  level: number,
  concentration = false
): ResolvedAction {
  return {
    id,
    name: id,
    nameLoc: litText({ en: id, it: id }),
    type,
    source: "spell",
    spellLevel: level,
    ...(level > 0 ? { slotLevel: level } : {}),
    concentration,
    summary: {},
    costsSlot: level > 0,
    pinned: false,
    defaultPinned: false,
  };
}

/** Slots of one level only, so a cast has one option and commits without a picker. */
function mountWizard(slotLevel: number): void {
  const doc = makeCharacterDoc({
    classId: "wizard",
    level: 5,
    spellSlots: [{ level: Math.max(1, slotLevel), total: 2 }],
  });
  doc.id = "test-char";
  doc.session.logEntries = [];
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
}

describe("a cast today: it changes the sheet and the turn, one undo restores, one redo replays", () => {
  it.each([
    ["a 1st-level spell, solo", spell("magic-dart", "action", 1), false],
    ["a 2nd-level spell on your turn in a fight", spell("scorch", "action", 2), true],
    ["a Concentration spell", spell("focus-ward", "action", 1, true), false],
    ["a cantrip", spell("spark", "action", 0), true],
    ["a reaction spell in a fight", spell("quick-shield", "reaction", 1), true],
  ])("%s", async (_name, cast, inFight) => {
    mountWizard(cast.spellLevel ?? 0);
    if (inFight) useCombatStatusStore.getState().set(fight, null);
    const before = state();
    await settle(() => api?.executeAction(cast));
    const after = state();
    expect(after).not.toEqual(before);

    await settle(() => void useUndoStore.getState().undo());
    expect(state()).toEqual(before);

    await settle(() => void useUndoStore.getState().redo());
    expect(state()).toEqual(after);
  });
});
