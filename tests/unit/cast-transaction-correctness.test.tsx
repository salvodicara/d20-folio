import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { turnEconomyKey } from "@/features/character/center/combat-hydration";
import {
  useTurnEconomy,
  type PreparedCommit,
  type TurnEconomyApi,
} from "@/features/character/center/useTurnEconomy";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { asRaceId } from "@/data/srd-names";
import { litText } from "@/lib/loc-text";
import { resolveTrackers, type ResolvedAction } from "@/lib/smart-tracker";
import type { CunningStrikeVM } from "@/lib/views/cunning-strike-view";
import type { RiderVM } from "@/lib/views/rider-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
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

function renderProvider() {
  return render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <Probe />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

function spellAction(
  id: string,
  type: "action" | "reaction",
  spellId?: string,
  spellLevel = 1
): ResolvedAction {
  return {
    id,
    name: id,
    nameLoc: litText({ en: id, it: id }),
    type,
    source: "spell",
    ...(spellId ? { spellId } : {}),
    spellLevel,
    ...(spellLevel > 0 ? { slotLevel: spellLevel } : {}),
    concentration: false,
    summary: {},
    costsSlot: spellLevel > 0,
    pinned: false,
    defaultPinned: false,
  };
}

function statusFor(currentCombatantId: string, isMyTurn: boolean): GlobalCombat {
  const myId = "pc-user";
  const round = 4;
  return {
    campaignId: "campaign-1",
    characterId: "test-char",
    myId,
    round,
    gathering: false,
    isMyTurn,
    initiativeBonus: 2,
    initiativeRoll: 12,
    encounter: {
      combatants: [
        { kind: "pc", id: myId, memberUid: "user", characterId: "test-char" },
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
      round,
      currentCombatantId,
      order: [myId, "monster-1"],
      epoch: 9,
      status: "active",
    },
    view: {
      rows: [
        { id: myId, kind: "pc", name: "Hero" },
        { id: "monster-1", kind: "monster", name: "Goblin" },
      ],
      turnOrderIds: [myId, "monster-1"],
      currentId: currentCombatantId,
    } as GlobalCombat["view"],
  };
}

function capturePrepared(action: ResolvedAction): {
  read: () => PreparedCommit | null;
} {
  let commit: PreparedCommit | null = null;
  act(() => {
    economy?.prepareResolution(action, (_prepared, preparedCommit) => {
      commit = preparedCommit;
    });
  });
  return { read: () => commit };
}

beforeEach(() => {
  economy = null;
  useCombatStatusStore.getState().set(null, null);
  useCombatStore.getState().endCombat();
  useCharacterStore.setState({
    character: null,
    readonly: false,
    loading: false,
    error: null,
    combatRound: 1,
    combatTurnEconomy: undefined,
    combatPersistence: null,
  });
  useToastStore.setState({ toasts: [], timers: {} });
  useUndoStore.getState().clear(null);
});

describe("cast transaction correctness", () => {
  it("opens a fresh slot allowance for a reaction on the next creature's global turn", async () => {
    const doc = makeCharacterDoc({
      classId: "wizard",
      level: 5,
      spellSlots: [{ level: 1, total: 3 }],
    });
    useCharacterStore.setState({ character: doc });
    const ownTurn = statusFor("pc-user", true);
    useCombatStatusStore.getState().set(ownTurn, null);
    renderProvider();

    act(() => economy?.handleSelect(spellAction("own-turn-cast", "action")));
    await waitFor(() =>
      expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(
        1
      )
    );
    const ownKey = turnEconomyKey(ownTurn, doc.id, 1);
    expect(useCombatStore.getState()).toMatchObject({
      spellSlotCastsThisTurn: 1,
      spellSlotCastTurnKey: ownKey,
    });

    const enemyTurn = statusFor("monster-1", false);
    act(() => useCombatStatusStore.getState().set(enemyTurn, null));
    act(() => economy?.handleUseReaction(spellAction("reaction-cast", "reaction")));
    await waitFor(() =>
      expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(
        2
      )
    );
    const enemyKey = turnEconomyKey(enemyTurn, doc.id, 1);
    expect(useCombatStore.getState()).toMatchObject({
      reactionUsed: true,
      reactionUsedId: "reaction-cast",
      spellSlotCastsThisTurn: 1,
      spellSlotCastTurnKey: enemyKey,
    });

    act(() => expect(useUndoStore.getState().undo()).toBe(true));
    expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(1);
    expect(useCombatStore.getState()).toMatchObject({
      reactionUsed: false,
      spellSlotCastsThisTurn: 1,
      spellSlotCastTurnKey: ownKey,
    });

    act(() => expect(useUndoStore.getState().redo()).toBe(true));
    expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(2);
    expect(useCombatStore.getState()).toMatchObject({
      reactionUsed: true,
      spellSlotCastsThisTurn: 1,
      spellSlotCastTurnKey: enemyKey,
    });

    act(() => useCombatStore.getState().resetReaction());
    act(() =>
      economy?.handleUseReaction(spellAction("second-reaction-cast", "reaction"))
    );
    await waitFor(() =>
      expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(
        /one spell slot per turn/i
      )
    );
    expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(2);
  });

  it("rejects a reaction whose chosen ordinary slot became stale after review", async () => {
    const doc = makeCharacterDoc({
      classId: "wizard",
      level: 5,
      spellSlots: [{ level: 1, total: 1 }],
    });
    useCharacterStore.setState({ character: doc });
    renderProvider();
    const prepared = capturePrepared(spellAction("reviewed-reaction", "reaction"));
    expect(prepared.read()).not.toBeNull();

    act(() => useCharacterStore.getState().useSpellSlot(1, false));
    act(() => prepared.read()?.(() => undefined));
    await act(async () => Promise.resolve());

    expect(useCombatStore.getState().reactionUsed).toBe(false);
    expect(useUndoStore.getState().past).toEqual([]);
    expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(1);
  });

  it("rejects a reaction whose selected free-cast tracker became stale after review", async () => {
    const doc = makeCharacterDoc({
      race: asRaceId("tiefling"),
      classId: "fighter",
      level: 5,
      features: [{ srdId: "tiefling-fiendish-legacy" }],
      spells: [
        {
          srdId: "hellish-rebuke",
          prepared: true,
          freeCastSource: {
            sourceId: "race:tiefling:fiendish-legacy:hellish-rebuke",
            rest: "long",
            usesPerRest: 1,
          },
        },
      ],
    });
    doc.session.grantBundleChoices = { "tiefling-legacy": "infernal" };
    useCharacterStore.setState({ character: doc });
    renderProvider();
    // Pin the EXACT tracker the reviewed cast option pays (the stored
    // freeCastSource id) — the synthetic doc also stores the trait as a feature
    // ref, whose duplicate rail row must not swallow the spend.
    const tracker = resolveTrackers(doc).find(
      (entry) => entry.id === "race:tiefling:fiendish-legacy:hellish-rebuke"
    );
    expect(tracker).toBeDefined();

    const prepared = capturePrepared(
      spellAction("hellish-rebuke-reaction", "reaction", "hellish-rebuke")
    );
    expect(prepared.read()).not.toBeNull();
    if (!tracker) return;
    act(() => useCharacterStore.getState().useTracker(tracker.id, 1));
    act(() => prepared.read()?.(() => undefined));
    await act(async () => Promise.resolve());

    expect(useCombatStore.getState().reactionUsed).toBe(false);
    expect(useUndoStore.getState().past).toEqual([]);
    expect(
      useCharacterStore.getState().character?.session.trackers[tracker.id]?.used
    ).toBe(1);
  });

  function sorcerer() {
    const doc = makeCharacterDoc({
      classes: [
        {
          classId: "sorcerer",
          level: 5,
          metamagicChoices: ["subtle-spell"],
        },
      ],
      features: [{ srdId: "sorcerer-font-of-magic" }, { srdId: "sorcerer-metamagic" }],
      spells: [{ srdId: "fire-bolt", prepared: true }],
    });
    return doc;
  }

  async function chooseSubtleFireBolt(): Promise<PreparedCommit> {
    const prepared = capturePrepared(
      spellAction("subtle-fire-bolt", "action", "fire-bolt", 0)
    );
    const subtle = await screen.findByRole("button", { name: /subtle/i });
    fireEvent.click(subtle);
    fireEvent.click(screen.getByRole("button", { name: /^cast$/i }));
    await waitFor(() => expect(prepared.read()).not.toBeNull());
    const commit = prepared.read();
    if (!commit) throw new Error("missing prepared cast");
    return commit;
  }

  it("revalidates total Metamagic cost after target review", async () => {
    const doc = sorcerer();
    useCharacterStore.setState({ character: doc });
    renderProvider();
    const commit = await chooseSubtleFireBolt();
    const sorcery = resolveTrackers(doc).find(
      (entry) => entry.id === "sorcerer-font-of-magic"
    );
    expect(sorcery).toBeDefined();
    if (!sorcery) return;

    act(() => useCharacterStore.getState().useTracker(sorcery.id, sorcery.total));
    act(() => commit(() => undefined));
    await act(async () => Promise.resolve());

    expect(useCombatStore.getState().selected.action).toEqual([]);
    expect(useUndoStore.getState().past).toEqual([]);
    expect(
      useCharacterStore.getState().character?.session.trackers[sorcery.id]?.used
    ).toBe(sorcery.total);
  });

  it("keeps a Metamagic redo retryable when live Sorcery Points are stale", async () => {
    const doc = sorcerer();
    useCharacterStore.setState({ character: doc });
    renderProvider();
    const commit = await chooseSubtleFireBolt();
    act(() => commit(() => undefined));
    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.trackers["sorcerer-font-of-magic"]
          ?.used
      ).toBe(1)
    );
    expect(useCombatStore.getState().selected.action).toContainEqual(
      expect.objectContaining({ id: "subtle-fire-bolt" })
    );

    act(() => expect(useUndoStore.getState().undo()).toBe(true));
    expect(useCombatStore.getState().selected.action).toEqual([]);
    const sorcery = resolveTrackers(useCharacterStore.getState().character ?? doc).find(
      (entry) => entry.id === "sorcerer-font-of-magic"
    );
    if (!sorcery) throw new Error("missing Sorcery Points");
    act(() => useCharacterStore.getState().useTracker(sorcery.id, sorcery.total));

    act(() => expect(useUndoStore.getState().redo()).toBe(false));
    expect(useCombatStore.getState().selected.action).toEqual([]);
    expect(useUndoStore.getState().future).toHaveLength(1);
    expect(
      useCharacterStore.getState().character?.session.trackers[sorcery.id]?.used
    ).toBe(sorcery.total);
  });
});

describe("fresh tracker resolution on replay", () => {
  const action = spellAction("weapon-hit", "action", undefined, 0);

  it("does not replay a rider spend against a tracker depleted after undo", () => {
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      features: [{ srdId: "fighter-action-surge" }],
    });
    useCharacterStore.setState({ character: doc });
    renderProvider();
    const rider: RiderVM = {
      id: "test-rider",
      kind: "damage",
      source: "Test Rider",
      sourceLoc: litText({ en: "Test Rider", it: "Rider di prova" }),
      oncePerTurn: true,
      spend: { kind: "tracker", trackerId: "fighter-action-surge" },
    };

    act(() => economy?.spendRider(action, rider));
    expect(
      useCharacterStore.getState().character?.session.trackers["fighter-action-surge"]
        ?.used
    ).toBe(1);
    act(() => expect(useUndoStore.getState().undo()).toBe(true));
    act(() => useCharacterStore.getState().useTracker("fighter-action-surge", 1));
    act(() => expect(useUndoStore.getState().redo()).toBe(false));
    expect(useUndoStore.getState().future).toHaveLength(1);
  });

  it("does not replay Cunning Strike against a depleted Sneak Attack tracker", () => {
    const doc = makeCharacterDoc({
      classId: "rogue",
      level: 5,
      features: [{ srdId: "rogue-sneak-attack" }],
    });
    useCharacterStore.setState({ character: doc });
    renderProvider();
    const option: CunningStrikeVM = {
      optionId: "trip",
      sourceId: "rogue-cunning-strike",
      name: "Trip",
      nameLoc: litText({ en: "Trip", it: "Sbilanciare" }),
      description: "",
      cost: 1,
      save: null,
      condition: "Prone",
      legal: true,
    };

    act(() => economy?.applyCunningStrike(action, option));
    expect(
      useCharacterStore.getState().character?.session.trackers["rogue-sneak-attack"]?.used
    ).toBe(1);
    act(() => expect(useUndoStore.getState().undo()).toBe(true));
    act(() => useCharacterStore.getState().useTracker("rogue-sneak-attack", 1));
    act(() => expect(useUndoStore.getState().redo()).toBe(false));
    expect(useUndoStore.getState().future).toHaveLength(1);
  });
});
