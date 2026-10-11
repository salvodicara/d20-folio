/**
 * The optional follow-up line under a used card on the Play tab (owner 2026-10-11, "B"):
 * it appears after the use, filling it applies the effect and writes ONE session-log
 * line with target and source, ignoring it changes nothing, undoing the use withdraws it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
const writeCampaignCombatEffect = vi.fn(() => Promise.resolve({ before: {}, after: {} }));
vi.mock("@/features/campaigns/campaign-io", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  writeCampaignCombatEffect,
}));

import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCastFollowUpStore } from "@/features/character/center/cast-follow-up-store";
import { setPlayLogSink, useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import { useAuthStore } from "@/stores/authStore";
import { useConfirmStore } from "@/stores/confirmStore";
import {
  useCombatStatusStore,
  type GlobalCombat,
} from "@/features/campaigns/global-combat-context";
import {
  createCharacterLogMirror,
  createMemorySessionLogStore,
  createSessionRecorder,
  foldSession,
  type PlayEvent,
} from "@/lib/session-log";
import type { CharacterDoc } from "@/types/character";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { makeCharacterDoc } from "./_helpers";
import type { User } from "firebase/auth";

const ME = "pc-test-uid";
const HEALING_WORD = { srd: { kind: "spell", key: "healing-word", field: "name" } };

function live(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("Test character missing");
  return doc;
}

/** The campaign session log, fed by the sheet exactly as the cockpit does. */
let sessionStore = createMemorySessionLogStore();
let pending: Promise<void> = Promise.resolve();
async function sessionEvents(): Promise<PlayEvent[]> {
  await pending;
  const head = await sessionStore.latest();
  return head ? foldSession(sessionStore.items(head.id), {}).map((e) => e.event) : [];
}

function encounter(rows: GlobalCombat["view"]["rows"]): void {
  useCombatStatusStore.setState({
    status: {
      campaignId: "camp-1",
      encounter: {
        nextMonsterOrdinal: 3,
        round: 1,
        currentCombatantId: ME,
        epoch: 1,
        status: "active",
        combatants: [],
      },
      view: { rows, turnOrderIds: rows.map((row) => row.id), currentId: ME },
      myId: ME,
      characterId: live().id,
      gathering: false,
      isMyTurn: true,
      initiativeBonus: 0,
      initiativeRoll: 10,
      round: 1,
    },
  });
}

function renderPlay(): void {
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <PlayTab />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: /^all/i }));
}

function card(name: string): HTMLElement {
  return screen.getByText(name).closest(".uc") as HTMLElement;
}

beforeEach(() => {
  writeCampaignCombatEffect.mockClear();
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useCastFollowUpStore.setState({ offer: null });
  useUIStore.setState({ sheetMode: "play" });
  useConfirmStore.setState({ open: false, options: null, _resolve: null });
  useAuthStore.setState({ user: { uid: "test-uid" } as User });
  const doc = makeCharacterDoc({
    classId: "cleric",
    level: 3,
    name: assertNonEmptyString("Mirovel"),
  });
  doc.character.spells = [{ srdId: "healing-word", prepared: true }];
  doc.character.spellSlots = [{ level: 1, total: 2 }];
  doc.session.spellSlots = {};
  doc.session.hp = { current: 5, temp: 0 };
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
  });

  sessionStore = createMemorySessionLogStore();
  pending = Promise.resolve();
  const mirror = createCharacterLogMirror({
    recorder: createSessionRecorder({ store: sessionStore, uid: "test-uid" }),
    characterId: doc.id,
    actor: ME,
  });
  setPlayLogSink({
    added: (_, entry) => void (pending = pending.then(() => mirror.added(entry))),
    removed: (_, id) => void (pending = pending.then(() => mirror.removed(id))),
    corrected: (_, entry) => void (pending = pending.then(() => mirror.corrected(entry))),
  });
});

afterEach(() => {
  setPlayLogSink(null);
  useCombatStatusStore.setState({ status: null });
});

describe("the follow-up line after a heal", () => {
  async function castHealingWord(): Promise<HTMLElement> {
    renderPlay();
    fireEvent.click(within(card("Healing Word")).getByRole("button", { name: /^cast/i }));
    return screen.findByTestId("cast-follow-up");
  }

  it("solo, it offers the heal to me; filling it heals me and logs one line with source", async () => {
    const line = await castHealingWord();
    expect(line).toHaveTextContent("Mirovel + HP");
    expect(live().session.hp.current).toBe(5);

    fireEvent.change(within(line).getByRole("spinbutton"), { target: { value: "4" } });
    fireEvent.click(within(line).getByRole("button", { name: /^apply/i }));

    expect(live().session.hp.current).toBe(9);
    expect(screen.queryByTestId("cast-follow-up")).not.toBeInTheDocument();
    const heals = live().session.logEntries.filter((e) => e.event.kind === "hp-heal");
    expect(heals.map((e) => e.event)).toEqual([
      expect.objectContaining({ amount: 4, source: HEALING_WORD }),
    ]);
    const events = await sessionEvents();
    expect(events.filter((e) => e.kind === "heal")).toEqual([
      {
        kind: "heal",
        amount: 4,
        target: ME,
        actor: ME,
        source: HEALING_WORD,
        provenance: "manual",
      },
    ]);
  });

  it("ignoring it changes nothing, and undoing the cast withdraws it", async () => {
    await castHealingWord();
    const before = live().session.logEntries.length;
    expect(live().session.hp.current).toBe(5);
    act(() => {
      useUndoStore.getState().undo();
    });
    expect(screen.queryByTestId("cast-follow-up")).not.toBeInTheDocument();
    expect(live().session.hp.current).toBe(5);
    expect(live().session.logEntries.length).toBe(before - 1);
    expect((await sessionEvents()).some((e) => e.kind === "heal")).toBe(false);
  });

  it("on another PC in the encounter, it writes their HP like the PC card and logs it", async () => {
    encounter([
      { id: ME, kind: "pc", side: "ally", name: "Mirovel" },
      {
        id: "pc-aria-uid",
        kind: "pc",
        side: "ally",
        name: "Aria",
        memberUid: "aria-uid",
        characterId: "aria-char",
        maxHp: 24,
        currentHp: 10,
        tempHp: 0,
      },
    ] as GlobalCombat["view"]["rows"]);
    renderPlay();
    fireEvent.click(within(card("Healing Word")).getByRole("button", { name: /^cast/i }));
    const dialog = await screen.findByRole("dialog", { name: /on whom/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /aria/i }));
    const line = await screen.findByTestId("cast-follow-up");
    expect(line).toHaveTextContent("Aria + HP");

    fireEvent.change(within(line).getByRole("spinbutton"), { target: { value: "7" } });
    fireEvent.click(within(line).getByRole("button", { name: /^apply/i }));

    await waitFor(() =>
      expect(writeCampaignCombatEffect).toHaveBeenCalledWith(
        "aria-uid",
        "aria-char",
        null,
        24,
        {
          kind: "hp",
          operation: { kind: "heal", amount: 7 },
        }
      )
    );
    expect(live().session.hp.current).toBe(5);
    await waitFor(() =>
      expect(live().session.logEntries.at(-1)?.event).toMatchObject({
        kind: "effect-given",
        effect: "heal",
        target: "pc-aria-uid",
        amount: 7,
      })
    );
    expect((await sessionEvents()).filter((e) => e.kind === "heal")).toEqual([
      {
        kind: "heal",
        amount: 7,
        target: "pc-aria-uid",
        actor: ME,
        source: HEALING_WORD,
        provenance: "manual",
      },
    ]);
  });
});

it("damage on a monster is recorded for the DM, not written anywhere", async () => {
  encounter([
    { id: ME, kind: "pc", side: "ally", name: "Mirovel" },
    { id: "monster-1", kind: "monster", side: "enemy", name: "Goblin" },
  ] as GlobalCombat["view"]["rows"]);
  renderPlay();
  fireEvent.click(
    within(card("Unarmed Strike")).getByRole("button", { name: /^attack/i })
  );
  const dialog = await screen.findByRole("dialog", { name: /on whom/i });
  fireEvent.click(within(dialog).getByRole("button", { name: /goblin/i }));
  const line = await screen.findByTestId("cast-follow-up");
  expect(line).toHaveTextContent("Goblin − HP");

  fireEvent.change(within(line).getByRole("spinbutton"), { target: { value: "3" } });
  fireEvent.click(within(line).getByRole("button", { name: /^apply/i }));

  await waitFor(() =>
    expect(live().session.logEntries.at(-1)?.event).toMatchObject({
      kind: "effect-given",
      effect: "damage",
      target: "monster-1",
      targetName: "Goblin",
      amount: 3,
    })
  );
  expect(writeCampaignCombatEffect).not.toHaveBeenCalled();
  expect((await sessionEvents()).filter((e) => e.kind === "damage")).toEqual([
    expect.objectContaining({ amount: 3, target: "monster-1", actor: ME }),
  ]);
});
