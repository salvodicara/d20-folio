/**
 * The offer after a hit, settled through the real turn engine (#1330): the hit is
 * entered on the HP control's path (`commitDamage`), the offer opens, and a choice
 * settles it as ONE undo step that puts back the exact sheet and turn from before the
 * choice. Uncanny Dodge counts the hit again at half (13 → 6, so 7 come back); Shield
 * spends its slot and the Reaction, lights +5 AC, and «It misses» gives the whole hit
 * back with what it brought (its Concentration save, a fall to 0, temporary HP).
 */
import { act, render } from "@testing-library/react";
import type { TFunction } from "i18next";
import { useEffect } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { syncCombatTurnContext } from "@/features/character/center/combat-hydration";
import { useHitReactionOfferStore } from "@/features/character/hit-reaction-offer-store";
import { commitDamage } from "@/features/character/molecules/hp-commits";
import { concentrationValue } from "@/lib/concentration";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import { localizeActions } from "@/lib/views/combat-action-view";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import { setPlayLogSink, useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import type { SessionState } from "@/types/character";

const t = ((key: string) => key) as unknown as TFunction;

const SCORES = { STR: 10, DEX: 16, CON: 14, INT: 14, WIS: 10, CHA: 10 } as const;
const ROGUE_WIZARD: ScenarioSpec = {
  name: "Vess",
  raceId: "human",
  classId: "rogue",
  level: 5,
  background: "criminal",
  abilityScores: SCORES,
  secondaryClasses: [{ classId: "wizard", level: 1 }],
  spells: [{ srdId: "shield", prepared: true }],
};
const DODGE = "rogue-uncanny-dodge-reaction";
const SHIELD = "spell-shield";

let api: TurnEconomyApi | null = null;
function Probe() {
  const economy = useTurnEconomy();
  useEffect(() => {
    api = economy;
  }, [economy]);
  return null;
}

function mount(session: Partial<SessionState> = {}): void {
  const doc = buildScenario(ROGUE_WIZARD);
  doc.id = "test-char";
  doc.session = {
    ...doc.session,
    hp: { current: 40, temp: 0 },
    logEntries: [],
    ...session,
  };
  doc.character = { ...doc.character, hp: { ...doc.character.hp, max: 40 } };
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

/** The whole sheet and turn, ids and clocks included: "exact" means exact. */
function state(): unknown {
  const char = useCharacterStore.getState();
  const turn = Object.fromEntries(
    Object.entries(useCombatStore.getState()).filter(([, v]) => typeof v !== "function")
  );
  return structuredClone({
    doc: char.character,
    pending: char.combatPendingConcentrationSaves,
    effects: char.combatLegacyActiveEffects,
    turn,
  });
}

const session = () => {
  const s = useCharacterStore.getState().character?.session;
  if (!s) throw new Error("no sheet");
  return s;
};
const offer = () => useHitReactionOfferStore.getState().offer;
const settleWith = () => {
  const s = useHitReactionOfferStore.getState().settle;
  if (!s) throw new Error("the turn engine registered no settlement");
  return s;
};
const pastLength = () => useUndoStore.getState().past.length;

async function run(step: () => void): Promise<void> {
  await act(async () => {
    step();
    for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const hit = (amount: number) => run(() => commitDamage([{ amount }], undefined, t));
const undo = () => run(() => void useUndoStore.getState().undo());

beforeEach(() => {
  api = null;
  useUIStore.setState({ sheetMode: "play" });
  useToastStore.setState({ toasts: [], timers: {} });
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useCombatStatusStore.getState().set(null, null);
  useHitReactionOfferStore.setState({ offer: null });
});

/** A solo fight on the sheet's own round counter (the Reaction is spent in one). */
function startFight(): void {
  useCombatStore.setState({ fightStarted: true });
}

describe("Uncanny Dodge on the offer", () => {
  it("counts a 13 again at half: 6 taken, 7 back, the Reaction used", async () => {
    mount();
    startFight();
    await hit(13);
    expect(session().hp.current).toBe(27);
    expect(offer()?.choices.map((c) => c.actionId)).toEqual([DODGE, SHIELD]);

    await run(() => settleWith().react(DODGE));
    expect(session().hp.current).toBe(34);
    expect(useCombatStore.getState().reactionUsed).toBe(true);
    // The halving state lit by the reaction was spent by the hit it halved.
    expect(session().activeFeatures ?? []).not.toContain("rogue-uncanny-dodge");
    expect(offer()).toBeNull();
  });

  it("is one undo step, back to the exact sheet before the choice; the hit's own undo still works", async () => {
    mount();
    startFight();
    const beforeHit = state();
    await hit(13);
    const afterHit = state();
    const entries = pastLength();

    await run(() => settleWith().react(DODGE));
    expect(pastLength()).toBe(entries + 1);

    await undo();
    expect(state()).toEqual(afterHit);
    expect(offer()?.choices.map((c) => c.actionId)).toEqual([DODGE, SHIELD]);

    await undo();
    expect(state()).toEqual(beforeHit);
  });

  it("a hit to 0 HP comes back to its half: no Unconscious, no fall recorded", async () => {
    mount({ hp: { current: 10, temp: 3 } });
    startFight();
    await hit(20);
    expect(session().hp).toMatchObject({ current: 0, temp: 0 });
    expect(session().conditions).toContain("unconscious");

    await run(() => settleWith().react(DODGE));
    // 20 → 10: 3 temporary HP, then 7 of the 10 HP.
    expect(session().hp).toMatchObject({ current: 3, temp: 0 });
    expect(session().conditions).not.toContain("unconscious");
    expect(session().zeroHpDrop).toBeUndefined();
    expect(session().deathFail).toBe(0);
  });
});

describe("Shield on the offer", () => {
  it("spends the slot and the Reaction and lights +5 AC; the damage stays until the player answers", async () => {
    mount();
    startFight();
    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("no sheet");
    const ac = sheetNumbers(doc).ac.total;
    await hit(12);

    await run(() => settleWith().react(SHIELD));
    expect(session().hp.current).toBe(28);
    expect(session().spellSlots["1"]?.used).toBe(1);
    expect(session().activeFeatures).toContain("spell-shield");
    expect(useCombatStore.getState().reactionUsed).toBe(true);
    expect(offer()?.shield?.ac).toBe(ac + 5);
  });

  it("«It misses» refunds the whole hit and withdraws the Concentration save it raised, as one undo step", async () => {
    mount({ concentration: concentrationValue("mage-armor") });
    startFight();
    const beforeHit = useCharacterStore.getState().combatPendingConcentrationSaves;
    expect(beforeHit).toEqual([]);
    await hit(12);
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toHaveLength(1);

    await run(() => settleWith().react(SHIELD));
    const shielded = state();
    const entries = pastLength();
    await run(() => settleWith().attackMisses());
    expect(pastLength()).toBe(entries + 1);
    expect(session().hp.current).toBe(40);
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toEqual([]);
    // Shield stays cast: its slot, the Reaction and the +5 AC.
    expect(session().spellSlots["1"]?.used).toBe(1);
    expect(session().activeFeatures).toContain("spell-shield");
    expect(offer()).toBeNull();

    await undo();
    expect(state()).toEqual(shielded);
    expect(offer()?.shield).toBeDefined();
  });

  it("«It misses» on a hit that dropped the character to 0 brings back HP, temporary HP and consciousness", async () => {
    mount({ hp: { current: 10, temp: 3 } });
    startFight();
    await hit(20);
    expect(session().conditions).toContain("unconscious");

    await run(() => settleWith().react(SHIELD));
    await run(() => settleWith().attackMisses());
    expect(session().hp).toMatchObject({ current: 10, temp: 3 });
    expect(session().conditions).not.toContain("unconscious");
    expect(session().zeroHpDrop).toBeUndefined();
    expect(session().deathFail).toBe(0);
  });
});

/** The sheet's damage lines, by amount. */
const damageLines = () =>
  session().logEntries.flatMap((e) =>
    e.event.kind === "hp-damage" ? [e.event.amount] : []
  );

/** The campaign session log as the sink hears it: the damage lines still standing. */
function campaignLog(): () => number[] {
  const lines = new Map<string, number>();
  setPlayLogSink({
    added: (_c, entry) => {
      if (entry.event.kind === "hp-damage") lines.set(entry.id, entry.event.amount);
    },
    removed: (_c, id) => void lines.delete(id),
    corrected: () => undefined,
  });
  return () => [...lines.values()];
}

describe("the log tells the hit as it was settled", () => {
  afterEach(() => setPlayLogSink(null));

  it("a plain hit's undo takes its line out of the campaign log too", async () => {
    mount();
    const campaign = campaignLog();
    await hit(13);
    expect(campaign()).toEqual([13]);
    await undo();
    expect(campaign()).toEqual([]);
  });

  it("undoing the choice puts the hit's own line back in the campaign log", async () => {
    mount();
    startFight();
    const campaign = campaignLog();
    await hit(13);
    await run(() => settleWith().react(DODGE));
    await undo();
    expect(damageLines()).toEqual([13]);
    expect(campaign()).toEqual([13]);
  });

  it("Uncanny Dodge leaves one damage line, of 6, on the sheet and in the campaign log", async () => {
    mount();
    startFight();
    const campaign = campaignLog();
    await hit(13);
    await run(() => settleWith().react(DODGE));
    expect(damageLines()).toEqual([6]);
    expect(campaign()).toEqual([6]);
  });

  it("Shield keeps one line of 12; «It misses» leaves none", async () => {
    mount();
    startFight();
    const campaign = campaignLog();
    await hit(12);
    await run(() => settleWith().react(SHIELD));
    expect(damageLines()).toEqual([12]);
    expect(campaign()).toEqual([12]);
    await run(() => settleWith().attackMisses());
    expect(damageLines()).toEqual([]);
    expect(campaign()).toEqual([]);
  });
});

describe("when the offer opens and closes", () => {
  it("a new hit replaces the offer", async () => {
    mount();
    startFight();
    await hit(5);
    const first = offer();
    await hit(7);
    const second = offer();
    expect(second).not.toBeNull();
    expect(second?.id).not.toBe(first?.id);
    expect(second?.amount).toBe(7);

    // Settling it takes back the newest hit only.
    await run(() => settleWith().react(DODGE));
    expect(session().hp.current).toBe(40 - 5 - 3);
  });

  it("no offer once the Reaction is spent, nor for a fall", async () => {
    mount();
    startFight();
    await hit(13);
    await run(() => settleWith().react(DODGE));
    await hit(13);
    expect(offer()).toBeNull();

    useCombatStore.getState().resetReaction();
    await run(() =>
      commitDamage([{ amount: 13, type: "bludgeoning" }], { landProne: false }, t)
    );
    expect(offer()).toBeNull();
  });

  it("the next turn start closes it", async () => {
    mount();
    startFight();
    await hit(13);
    expect(offer()).not.toBeNull();
    await run(() => useCombatStore.getState().endTurn());
    expect(offer()).toBeNull();
  });

  it("in a DM-run fight, this character's next turn closes it", async () => {
    mount();
    const turn = (round: number, isMyTurn: boolean) =>
      ({
        campaignId: "campaign-1",
        round,
        isMyTurn,
        encounter: { epoch: 9 },
      }) as unknown as GlobalCombat;
    syncCombatTurnContext(turn(2, true));
    syncCombatTurnContext(turn(2, false));
    await hit(13);
    expect(offer()).not.toBeNull();
    syncCombatTurnContext(turn(3, true));
    expect(offer()).toBeNull();
  });

  it("undoing the hit closes its offer", async () => {
    mount();
    startFight();
    await hit(13);
    await undo();
    expect(offer()).toBeNull();
  });

  it("Uncanny Dodge tapped in the reaction list before the damage still halves it, and no offer follows", async () => {
    mount();
    startFight();
    const doc = useCharacterStore.getState().character;
    const dodge = doc && localizeActions(doc, "en").find((a) => a.id === DODGE);
    if (!dodge) throw new Error("no Uncanny Dodge");
    await run(() => api?.handleUseReaction(dodge));
    await hit(13);
    expect(session().hp.current).toBe(34);
    expect(offer()).toBeNull();
  });
});
