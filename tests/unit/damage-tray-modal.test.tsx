/**
 * The damage tray after a cast (owner 2026-10-12): one rolled total, one row per
 * target with ×0 · ×½ · ×1 · ×2, a "Saved" toggle and the failed-save condition; Apply
 * writes ONE session-log line per row with target, amount, actor and source; Skip
 * leaves the cast logged exactly as before; Undo takes the whole apply back.
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
import { useDamageTrayStore } from "@/features/character/center/damage-tray-store";
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
import { NO_DEFENSES } from "@/lib/damage-intake";
import { defaultCombatState } from "@/lib/combat-state";
import type { CharacterDoc } from "@/types/character";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { makeCharacterDoc } from "./_helpers";
import type { User } from "firebase/auth";

const ME = "pc-test-uid";
const spellRef = (key: string) => ({ srd: { kind: "spell", key, field: "name" } });

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

type Rows = GlobalCombat["view"]["rows"];

function encounter(rows: Rows): void {
  useCombatStatusStore.setState({
    status: {
      campaignId: "camp-1",
      encounter: {
        nextMonsterOrdinal: 4,
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

const monster = (id: string, name: string, extra: object = {}) => ({
  id,
  kind: "monster" as const,
  side: "enemy" as const,
  name,
  currentHp: 7,
  maxHp: 7,
  tempHp: 0,
  ...extra,
});

function setCharacter(
  classId: string,
  level: number,
  spells: string[],
  slots: { level: number; total: number }[]
): void {
  const doc = makeCharacterDoc({
    classId,
    level,
    name: assertNonEmptyString("Mirovel"),
  });
  doc.character.spells = spells.map((srdId) => ({ srdId, prepared: true }));
  doc.character.spellSlots = slots;
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

function cast(name: string): void {
  const card = screen.getByText(name).closest(".uc") as HTMLElement;
  fireEvent.click(within(card).getByRole("button", { name: /^cast/i }));
}

async function tray(): Promise<HTMLElement> {
  return screen.findByTestId("damage-tray");
}

function row(dialog: HTMLElement, name: string): HTMLElement {
  const found = within(dialog)
    .getAllByTestId("damage-tray-row")
    .find((el) => within(el).queryByText(name, { exact: true }));
  if (!found) throw new Error(`no row ${name}`);
  return found;
}

beforeEach(() => {
  writeCampaignCombatEffect.mockClear();
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useDamageTrayStore.setState({ offer: null });
  useUIStore.setState({ sheetMode: "play" });
  useConfirmStore.setState({ open: false, options: null, _resolve: null });
  useAuthStore.setState({ user: { uid: "test-uid" } as User });
});

afterEach(() => {
  setPlayLogSink(null);
  useCombatStatusStore.setState({ status: null });
});

describe("Cure Wounds on myself", () => {
  beforeEach(() => setCharacter("cleric", 3, ["cure-wounds"], [{ level: 1, total: 2 }]));

  it("heals the summed total, logs ONE heal line with source, and undoes as one step", async () => {
    renderPlay();
    cast("Cure Wounds");
    const dialog = await tray();
    expect(within(dialog).getByText("Cure Wounds")).toBeInTheDocument();
    const field = within(dialog).getByRole("textbox", { name: "Rolled total" });
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("placeholder", "—");
    // A heal has no save: no Saved toggle, no multiplier.
    expect(within(dialog).queryByRole("button", { name: /saved/i })).toBeNull();
    expect(within(dialog).queryByRole("group")).toBeNull();
    const apply = within(dialog).getByRole("button", { name: /^apply$/i });
    expect(apply).toBeDisabled();

    fireEvent.change(field, { target: { value: "4+3" } });
    expect(
      within(row(dialog, "Mirovel")).getByTestId("damage-tray-preview")
    ).toHaveTextContent(/\+7 → 12\//);
    fireEvent.click(apply);

    expect(screen.queryByTestId("damage-tray")).toBeNull();
    expect(live().session.hp.current).toBe(12);
    const heals = live().session.logEntries.filter((e) => e.event.kind === "hp-heal");
    expect(heals.map((e) => e.event)).toEqual([
      expect.objectContaining({ amount: 7, source: spellRef("cure-wounds") }),
    ]);
    expect((await sessionEvents()).filter((e) => e.kind === "heal")).toEqual([
      {
        kind: "heal",
        amount: 7,
        target: ME,
        actor: ME,
        source: spellRef("cure-wounds"),
        provenance: "manual",
      },
    ]);

    act(() => {
      useUndoStore.getState().undo();
    });
    expect(live().session.hp.current).toBe(5);
    expect(live().session.logEntries.some((e) => e.event.kind === "hp-heal")).toBe(false);
    expect((await sessionEvents()).some((e) => e.kind === "heal")).toBe(false);
  });

  it("Skip applies nothing: the cast stays logged exactly as before", async () => {
    renderPlay();
    cast("Cure Wounds");
    const dialog = await tray();
    const logged = live().session.logEntries.map((e) => e.event);
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "9" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^skip$/i }));

    expect(screen.queryByTestId("damage-tray")).toBeNull();
    expect(live().session.hp.current).toBe(5);
    expect(live().session.logEntries.map((e) => e.event)).toEqual(logged);
    expect(live().session.spellSlots).toMatchObject({ 1: { used: 1 } });
  });

  it("undoing the cast while the tray is open closes it", async () => {
    renderPlay();
    cast("Cure Wounds");
    await tray();
    act(() => {
      useUndoStore.getState().undo();
    });
    expect(screen.queryByTestId("damage-tray")).toBeNull();
  });
});

describe("Fireball on three goblins", () => {
  beforeEach(() => {
    setCharacter("wizard", 5, ["fireball"], [{ level: 3, total: 2 }]);
    encounter([
      { id: ME, kind: "pc", side: "ally", name: "Mirovel" },
      monster("monster-1", "Goblin 1"),
      monster("monster-2", "Goblin 2"),
      monster("monster-3", "Goblin Shaman", {
        defenses: { ...NO_DEFENSES, resistances: new Set(["fire"]) },
      }),
    ] as Rows);
  });

  it("one total, one row each; Saved halves; a known resistance pre-sets ½", async () => {
    renderPlay();
    cast("Fireball");
    const picker = await screen.findByRole("dialog", { name: /on whom/i });
    for (const name of ["Goblin 1", "Goblin 2", "Goblin Shaman"])
      fireEvent.click(within(picker).getByRole("button", { name: new RegExp(name) }));
    fireEvent.click(within(picker).getByRole("button", { name: /cast on 3/i }));

    const dialog = await tray();
    expect(dialog).toHaveTextContent(/Fire damage · DEX save · DC \d+/);
    expect(within(dialog).getAllByTestId("damage-tray-row")).toHaveLength(3);
    // Monster HP shows only as the band the player may see.
    expect(row(dialog, "Goblin 1")).toHaveTextContent("Healthy");
    expect(row(dialog, "Goblin 1")).not.toHaveTextContent("7/7");
    const shaman = row(dialog, "Goblin Shaman");
    expect(within(shaman).getByRole("button", { name: "Resistant" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(shaman).getByRole("button", { name: "×½" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "28" } });
    fireEvent.click(
      within(row(dialog, "Goblin 2")).getByRole("button", { name: "Goblin 2 saved" })
    );
    // The segment IS the multiplier: Saved selects ½ on that row.
    const goblin2 = row(dialog, "Goblin 2");
    const segment = (name: string) => within(goblin2).getByRole("button", { name });
    expect(segment("×½")).toHaveAttribute("aria-pressed", "true");
    expect(segment("×1")).toHaveAttribute("aria-pressed", "false");
    // A hand-picked segment wins; Saved stays on (it still drops a condition).
    fireEvent.click(segment("×1"));
    expect(within(goblin2).getByTestId("damage-tray-preview")).toHaveTextContent("−28");
    expect(
      within(goblin2).getByRole("button", { name: "Goblin 2 saved" })
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(segment("×½"));
    const previews = within(dialog)
      .getAllByTestId("damage-tray-preview")
      .map((el) => el.textContent);
    expect(previews).toEqual(["−28", "−14", "−14"]);

    fireEvent.click(within(dialog).getByRole("button", { name: /^apply$/i }));
    const given = live()
      .session.logEntries.map((e) => e.event)
      .filter((e) => e.kind === "effect-given");
    expect(given).toEqual([
      expect.objectContaining({ target: "monster-1", amount: 28, effect: "damage" }),
      expect.objectContaining({ target: "monster-2", amount: 14, effect: "damage" }),
      expect.objectContaining({ target: "monster-3", amount: 14, effect: "damage" }),
    ]);
    expect(writeCampaignCombatEffect).not.toHaveBeenCalled();
    const damage = (await sessionEvents()).filter((e) => e.kind === "damage");
    expect(damage).toEqual(
      ["monster-1", "monster-2", "monster-3"].map((target, i) => ({
        kind: "damage",
        amount: [28, 14, 14][i],
        target,
        actor: ME,
        source: spellRef("fireball"),
        provenance: "manual",
      }))
    );

    act(() => {
      useUndoStore.getState().undo();
    });
    expect(live().session.logEntries.some((e) => e.event.kind === "effect-given")).toBe(
      false
    );
  });
});

describe("Magic Missile split across two goblins", () => {
  beforeEach(() => {
    setCharacter("wizard", 5, ["magic-missile"], [{ level: 1, total: 2 }]);
    encounter([
      { id: ME, kind: "pc", side: "ally", name: "Mirovel" },
      monster("monster-1", "Goblin 1"),
      monster("monster-2", "Goblin 2"),
    ] as Rows);
  });

  it("each goblin takes the darts rolled for it, not the sum of all of them", async () => {
    renderPlay();
    cast("Magic Missile");
    const picker = await screen.findByRole("dialog", { name: /on whom/i });
    for (const name of ["Goblin 1", "Goblin 2"])
      fireEvent.click(within(picker).getByRole("button", { name: new RegExp(name) }));
    fireEvent.click(within(picker).getByRole("button", { name: /cast on 2/i }));

    const dialog = await tray();
    const first = within(row(dialog, "Goblin 1")).getByRole("textbox");
    const second = within(row(dialog, "Goblin 2")).getByRole("textbox");
    fireEvent.change(first, { target: { value: "4+3" } });
    fireEvent.change(second, { target: { value: "2" } });
    const previews = within(dialog)
      .getAllByTestId("damage-tray-preview")
      .map((el) => el.textContent);
    expect(previews).toEqual(["−7", "−2"]);

    fireEvent.click(within(dialog).getByRole("button", { name: /^apply$/i }));
    const given = live()
      .session.logEntries.map((e) => e.event)
      .filter((e) => e.kind === "effect-given");
    expect(given).toEqual([
      expect.objectContaining({ target: "monster-1", amount: 7, effect: "damage" }),
      expect.objectContaining({ target: "monster-2", amount: 2, effect: "damage" }),
    ]);
  });
});

describe("Hold Person on a goblin", () => {
  beforeEach(() => {
    setCharacter("cleric", 3, ["hold-person"], [{ level: 2, total: 2 }]);
    encounter([
      { id: ME, kind: "pc", side: "ally", name: "Mirovel" },
      monster("monster-1", "Goblin"),
    ] as Rows);
  });

  it("no number field: Paralyzed is on by default and Apply logs it", async () => {
    renderPlay();
    cast("Hold Person");
    const picker = await screen.findByRole("dialog", { name: /on whom/i });
    fireEvent.click(within(picker).getByRole("button", { name: /goblin/i }));
    const dialog = await tray();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(dialog).toHaveTextContent(/WIS save · DC \d+/);
    const chip = within(dialog).getByRole("button", { name: "Paralyzed" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    const apply = within(dialog).getByRole("button", { name: /^apply$/i });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);

    expect(live().session.logEntries.at(-1)?.event).toMatchObject({
      kind: "effect-given",
      effect: "condition",
      conditionId: "paralyzed",
      target: "monster-1",
      targetName: "Goblin",
    });
    expect((await sessionEvents()).filter((e) => e.kind === "condition")).toEqual([
      expect.objectContaining({
        conditionId: "paralyzed",
        gained: true,
        target: "monster-1",
        source: spellRef("hold-person"),
      }),
    ]);
  });

  it("a goblin that saved gets nothing", async () => {
    renderPlay();
    cast("Hold Person");
    const picker = await screen.findByRole("dialog", { name: /on whom/i });
    fireEvent.click(within(picker).getByRole("button", { name: /goblin/i }));
    const dialog = await tray();
    const before = live().session.logEntries.length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Goblin saved" }));
    expect(within(dialog).getByRole("button", { name: "Paralyzed" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /^apply$/i }));
    expect(live().session.logEntries.length).toBe(before);
  });
});

describe("a Longsword attack on a goblin: Hit · Miss · Critical", () => {
  const longsword = { srd: { kind: "equipment", key: "longsword", field: "name" } };

  beforeEach(() => {
    setCharacter("fighter", 1, [], []);
    live().character.weapons = [{ srdId: "longsword", quantity: 1 }];
    useCharacterStore.setState({ character: { ...live() } });
    encounter([
      { id: ME, kind: "pc", side: "ally", name: "Mirovel" },
      monster("monster-1", "Goblin"),
    ] as Rows);
  });

  async function attackGoblin(): Promise<HTMLElement> {
    renderPlay();
    const card = screen.getByText("Longsword").closest(".uc") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: /^attack/i }));
    const picker = await screen.findByRole("dialog", { name: /on whom/i });
    fireEvent.click(within(picker).getByRole("button", { name: /goblin/i }));
    return tray();
  }

  const outcome = (dialog: HTMLElement, name: string) =>
    within(
      within(dialog).getByRole("group", { name: "Attack result on Goblin" })
    ).getByRole("button", { name });

  it("Critical: the hint, the typed total, and the log says critical, 14", async () => {
    const dialog = await attackGoblin();
    expect(outcome(dialog, "Hit")).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).queryByTestId("damage-tray-crit-hint")).toBeNull();
    fireEvent.click(outcome(dialog, "Critical"));
    expect(within(dialog).getByTestId("damage-tray-crit-hint")).toHaveTextContent(
      "dice doubled"
    );
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "14" } });
    expect(within(dialog).getByTestId("damage-tray-preview")).toHaveTextContent("−14");
    fireEvent.click(within(dialog).getByRole("button", { name: /^apply$/i }));

    const events = live().session.logEntries.map((e) => e.event);
    expect(events.find((e) => e.kind === "action-use")).toMatchObject({
      targets: ["monster-1"],
      outcome: "critical",
    });
    expect(events.find((e) => e.kind === "effect-given")).toMatchObject({
      effect: "damage",
      amount: 14,
      target: "monster-1",
      outcome: "critical",
    });
    const session = await sessionEvents();
    expect(session.find((e) => e.kind === "action")).toMatchObject({
      outcome: "critical",
      targets: ["monster-1"],
    });
    expect(session.find((e) => e.kind === "damage")).toEqual({
      kind: "damage",
      amount: 14,
      target: "monster-1",
      actor: ME,
      source: longsword,
      provenance: "manual",
      outcome: "critical",
    });
    // The turn keeps the reviewed fact, bound to this use's occurrence.
    const receipts = useCombatStore.getState().outcomeReceipts;
    expect(receipts).toEqual([
      expect.objectContaining({
        actionId: "weapon-longsword",
        target: { combatantId: "monster-1" },
        fact: { kind: "attack", result: "critical-hit" },
      }),
    ]);
    const occurrence = useCombatStore
      .getState()
      .selected.action.find((a) => a.id === "weapon-longsword")?.outcomeOccurrenceId;
    expect(receipts[0]?.occurrenceId).toBe(occurrence);

    // Undo takes the apply back: the damage line, the result and the receipt.
    act(() => {
      useUndoStore.getState().undo();
    });
    const after = live().session.logEntries.map((e) => e.event);
    expect(after.some((e) => e.kind === "effect-given")).toBe(false);
    expect(after.find((e) => e.kind === "action-use")).not.toHaveProperty("outcome");
    expect(useCombatStore.getState().outcomeReceipts).toEqual([]);
    expect((await sessionEvents()).find((e) => e.kind === "action")).not.toHaveProperty(
      "outcome"
    );
  });

  it("Miss: ×0, no number needed, Apply records the miss and no damage", async () => {
    const dialog = await attackGoblin();
    fireEvent.click(outcome(dialog, "Miss"));
    expect(within(dialog).getByRole("button", { name: "×0" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    const apply = within(dialog).getByRole("button", { name: /^apply$/i });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);

    const events = live().session.logEntries.map((e) => e.event);
    expect(events.some((e) => e.kind === "effect-given")).toBe(false);
    expect(events.find((e) => e.kind === "action-use")).toMatchObject({
      outcome: "miss",
    });
    expect(useCombatStore.getState().outcomeReceipts.map((r) => r.fact)).toEqual([
      { kind: "attack", result: "miss" },
    ]);
  });

  it("Skip records nothing: the attack stays logged as it was", async () => {
    const dialog = await attackGoblin();
    const logged = live().session.logEntries.map((e) => e.event);
    fireEvent.click(within(dialog).getByRole("button", { name: /^skip$/i }));
    expect(live().session.logEntries.map((e) => e.event)).toEqual(logged);
    expect(useCombatStore.getState().outcomeReceipts).toEqual([]);
  });
});

it("a heal on another PC writes their HP like the PC card, then logs it", async () => {
  setCharacter("cleric", 3, ["healing-word"], [{ level: 1, total: 2 }]);
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
  ] as Rows);
  renderPlay();
  cast("Healing Word");
  const picker = await screen.findByRole("dialog", { name: /on whom/i });
  fireEvent.click(within(picker).getByRole("button", { name: /aria/i }));
  const dialog = await tray();
  expect(row(dialog, "Aria")).toHaveTextContent("10/24");
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "7" } });
  expect(
    within(row(dialog, "Aria")).getByTestId("damage-tray-preview")
  ).toHaveTextContent("+7 → 17/24");
  fireEvent.click(within(dialog).getByRole("button", { name: /^apply$/i }));

  await waitFor(
    () =>
      expect(writeCampaignCombatEffect).toHaveBeenCalledWith(
        "aria-uid",
        "aria-char",
        null,
        24,
        {
          kind: "hp",
          operation: { kind: "heal", amount: 7 },
        }
      ),
    { timeout: 5000 }
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
});

it("Undo takes a heal on another PC back: their HP is written back and the line goes", async () => {
  setCharacter("cleric", 3, ["healing-word"], [{ level: 1, total: 2 }]);
  const before = defaultCombatState(24);
  before.hp = { current: 10, temp: 0 };
  const after = { ...before, hp: { current: 17, temp: 0 } };
  writeCampaignCombatEffect.mockImplementation(() =>
    Promise.resolve({ before, after } as never)
  );
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
  ] as Rows);
  renderPlay();
  cast("Healing Word");
  const picker = await screen.findByRole("dialog", { name: /on whom/i });
  fireEvent.click(within(picker).getByRole("button", { name: /aria/i }));
  const dialog = await tray();
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "7" } });
  fireEvent.click(within(dialog).getByRole("button", { name: /^apply$/i }));
  const given = (e: { event: { kind: string } }) => e.event.kind === "effect-given";
  await waitFor(() => expect(live().session.logEntries.some(given)).toBe(true));

  act(() => {
    useUndoStore.getState().undo();
  });
  await waitFor(() =>
    expect(writeCampaignCombatEffect).toHaveBeenLastCalledWith(
      "aria-uid",
      "aria-char",
      null,
      24,
      { kind: "revert", written: after, previous: before }
    )
  );
  expect(live().session.logEntries.some(given)).toBe(false);
  writeCampaignCombatEffect.mockImplementation(() =>
    Promise.resolve({ before: {}, after: {} })
  );
});
