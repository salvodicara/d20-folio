/**
 * The turn's start reads the same on the classic sheet and on the new Play screen: the
 * same notes («at the start of each of your turns»: Heroism's Temporary Hit Points,
 * Heroic Rally's heal while Bloodied, Burning's fire damage, the round-1 Death Strike
 * reminder), the same amounts, the same tap, and one tap per turn. Both surfaces mount
 * on the same character and the same fight (solo, or a shared campaign fight).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import i18n from "@/i18n";
import { classFeatureIndex } from "@/data/classes";
import { PlayCentre } from "@/domains/play/ui/PlayCentre";
import {
  useCombatStatusStore,
  type GlobalCombat,
} from "@/features/campaigns/global-combat-context";
import { ThisTurnTracker } from "@/features/character/center/ThisTurnTracker";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { concentrationValue } from "@/lib/concentration";
import { THIEFS_REFLEXES_ID } from "@/lib/play/extra-turns";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import { makeCharacterDoc } from "./_helpers";

const ME = "pc-me";
const DEATH_STRIKE = "rogue-assassin-death-strike";
const withPack = it.skipIf(!classFeatureIndex.has(DEATH_STRIKE));

/** A level-18 Champion, CON 14 (+2), 100 maximum HP: Heroic Rally heals 7 while Bloodied. */
const champion = (hp: number) =>
  makeCharacterDoc(
    {
      classes: [{ classId: "fighter", level: 18, subclassId: "champion" }],
      abilityScores: { STR: 18, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      features: [{ srdId: "fighter-champion-survivor" }],
      hp: { max: 100 },
    },
    { hp: { current: hp, temp: 0 } }
  );

/** A Heroism target: 5 Temporary Hit Points at the start of each turn (caster's +5). */
const heroic = (): CharacterDoc => {
  const effect: ActiveCombatEffect = {
    id: "heroism-target",
    actor: { kind: "monster", combatantId: "caster" },
    target: { kind: "monster", combatantId: "target" },
    source: { kind: "spell", id: "heroism", actionId: "spell-heroism" },
    payload: { kind: "grant-group", activeKey: "spell-heroism" },
    bindings: { spellcastingModifier: 5 },
    duration: { kind: "concentration", actorId: "caster", sourceId: "heroism" },
  };
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.spells = [{ srdId: "heroism", prepared: true }];
  doc.session = {
    ...doc.session,
    hp: { ...doc.session.hp, current: 30, temp: 0 },
    concentration: concentrationValue("heroism"),
    activeFeatures: [],
    encounterEffects: [effect],
  };
  return doc;
};

const burning = (): CharacterDoc => {
  const doc = champion(80);
  doc.session = { ...doc.session, burning: true };
  return doc;
};

const assassin = () =>
  makeCharacterDoc({
    classes: [{ classId: "rogue", level: 17, subclassId: "assassin" }],
    abilityScores: { STR: 10, DEX: 20, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    features: [{ srdId: DEATH_STRIKE }],
  });

/** A shared campaign fight in `round`, on my turn or on a monster's. */
function campaignFight(characterId: string, round: number, mine: boolean): GlobalCombat {
  const current = mine ? ME : "monster-1";
  return {
    campaignId: "camp-1",
    encounter: {
      nextMonsterOrdinal: 2,
      round,
      currentCombatantId: current,
      epoch: 1,
      status: "active",
      combatants: [],
    },
    view: {
      rows: [
        { id: ME, kind: "pc", side: "ally", name: "Me" },
        { id: "monster-1", kind: "monster", side: "enemy", name: "Orc" },
      ],
      turnOrderIds: [ME, "monster-1"],
      currentId: current,
    },
    myId: ME,
    characterId,
    gathering: false,
    isMyTurn: mine,
    initiativeBonus: 0,
    initiativeRoll: 12,
    round,
  } as unknown as GlobalCombat;
}

type Fight =
  | { kind: "solo"; round: number; started?: false }
  | { kind: "campaign"; round: number; mine: boolean };

function setUp(doc: CharacterDoc, fight: Fight) {
  useCombatStatusStore.setState({ status: null });
  useCombatStore.getState().endCombat();
  useCombatStore.setState({ hydratedCharacterId: null });
  useUndoStore.getState().clear(null);
  useCharacterStore.setState({
    character: structuredClone(doc),
    readonly: false,
    loading: false,
    error: null,
  });
  // campaign-owned effects (Heroism from an ally) reach the sheet through their projection
  useCharacterStore.getState().setEncounterEffects(doc.id, doc.session.encounterEffects);
  if (fight.kind === "solo") {
    // the stored solo fight the sheet hydrates from (its `combat/state` subdoc)
    useCharacterStore.setState({
      combatRound: fight.round,
      combatSoloFightStarted: fight.started !== false,
    });
  } else {
    useCharacterStore.setState({ combatRound: 1, combatSoloFightStarted: false });
    useCombatStatusStore.setState({
      status: campaignFight(doc.id, fight.round, fight.mine),
    });
  }
}

/** Play's centre column on the live sheet (the app re-renders it on every change). */
function LivePlay() {
  const doc = useCharacterStore((s) => s.character);
  return doc ? <PlayCentre doc={doc} locale="en" /> : null;
}

type Surface = "classic" | "play";

function mount(surface: Surface) {
  return render(
    <MemoryRouter>
      <TurnEconomyProvider renderPrompts={false}>
        {surface === "classic" ? <ThisTurnTracker /> : <LivePlay />}
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

/** The turn-start notes a surface shows: each note's id and its apply button. */
const shown = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>("[data-note]")].map((el) => ({
    id: el.dataset.note,
    apply: el.querySelector("button")?.textContent.trim() ?? null,
  }));

const applyButton = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>("[data-note] button");

/** Tap the first apply button the surface shows. */
const tap = (container: HTMLElement) => {
  const button = applyButton(container);
  if (!button) throw new Error("no turn-start offer to tap");
  act(() => {
    fireEvent.click(button);
  });
};

const hp = () => {
  const s = useCharacterStore.getState().character?.session.hp;
  return { current: s?.current, temp: s?.temp };
};

/** What one surface offers, and what tapping its offer twice does. */
function observe(surface: Surface, doc: CharacterDoc, fight: Fight) {
  setUp(doc, fight);
  const { container, unmount } = mount(surface);
  const notes = shown(container);
  let taps = null;
  if (applyButton(container)) {
    tap(container);
    const afterTap = hp();
    const stillOffered = applyButton(container) !== null;
    if (stillOffered) tap(container);
    taps = { afterTap, stillOffered, afterSecondTap: hp() };
  }
  unmount();
  return { notes, taps };
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => {
  useCombatStatusStore.setState({ status: null });
  useCombatStore.getState().endCombat();
  useCharacterStore.getState().setEncounterEffects(null);
  useCharacterStore.setState({ character: null });
  useUndoStore.getState().clear(null);
});

const solo2: Fight = { kind: "solo", round: 2 };
const mine3: Fight = { kind: "campaign", round: 3, mine: true };
const RALLY = "turn-start:fighter-champion-survivor";

describe("the turn's start: the classic sheet and Play show and do the same", () => {
  const heroism = {
    notes: [{ id: "turn-start:combat-effect:heroism-target", apply: "Gain 5" }],
    taps: {
      afterTap: { current: 30, temp: 5 },
      stillOffered: false,
      afterSecondTap: { current: 30, temp: 5 },
    },
  };
  const rally = {
    notes: [{ id: RALLY, apply: "Heal 7" }],
    taps: {
      afterTap: { current: 47, temp: 0 },
      stillOffered: false,
      afterSecondTap: { current: 47, temp: 0 },
    },
  };
  const fire = { notes: [{ id: "burning", apply: null }], taps: null };
  const nothing = { notes: [], taps: null };
  const cases: Array<[string, () => CharacterDoc, Fight, unknown]> = [
    ["Heroism, solo", heroic, solo2, heroism],
    ["Heroism, campaign fight on my turn", heroic, mine3, heroism],
    ["Heroic Rally Bloodied, solo", () => champion(40), solo2, rally],
    [
      "Heroic Rally Bloodied, campaign fight on my turn",
      () => champion(40),
      mine3,
      rally,
    ],
    ["Heroic Rally not Bloodied, solo", () => champion(80), solo2, nothing],
    ["Heroic Rally not Bloodied, campaign fight", () => champion(80), mine3, nothing],
    ["Burning, solo", burning, solo2, fire],
    ["Burning, campaign fight on my turn", burning, mine3, fire],
  ];
  it.each(cases)("%s", { timeout: 60_000 }, (_, doc, fight, expected) => {
    expect(observe("classic", doc(), fight)).toEqual(expected);
    expect(observe("play", doc(), fight)).toEqual(expected);
  });

  withPack(
    "Death Strike: round 1 only, solo and in a campaign fight",
    { timeout: 60_000 },
    () => {
      for (const fight of [
        { kind: "solo", round: 1 },
        { kind: "solo", round: 2 },
        { kind: "campaign", round: 1, mine: true },
        { kind: "campaign", round: 2, mine: true },
      ] satisfies Fight[]) {
        const expected =
          fight.round === 1
            ? { notes: [{ id: `round-1:${DEATH_STRIKE}`, apply: null }], taps: null }
            : { notes: [], taps: null };
        const at = JSON.stringify(fight);
        expect(observe("classic", assassin(), fight), at).toEqual(expected);
        expect(observe("play", assassin(), fight), at).toEqual(expected);
      }
    }
  );
});

describe("one tap per turn", () => {
  it.each([
    ["classic", solo2],
    ["play", solo2],
    ["classic", mine3],
    ["play", mine3],
  ] as const)(
    "%s %j: Heroic Rally heals once; the undo takes back the heal and the mark",
    { timeout: 60_000 },
    (surface, fight) => {
      setUp(champion(40), fight);
      const { container } = mount(surface);
      tap(container);
      expect(hp().current).toBe(47);
      expect(shown(container)).toEqual([]);
      act(() => {
        useUndoStore.getState().undo();
      });
      expect(hp().current).toBe(40);
      expect(shown(container)).toEqual([{ id: RALLY, apply: "Heal 7" }]);
    }
  );

  it.each(["classic", "play"] as const)(
    "%s: the note comes back on my next turn, and on an extra turn",
    { timeout: 60_000 },
    (surface) => {
      setUp(champion(40), solo2);
      const { container } = mount(surface);
      const tapAndWound = () => {
        tap(container);
        expect(shown(container)).toEqual([]);
        act(() =>
          useCharacterStore.getState().updateSession({ hp: { current: 40, temp: 0 } })
        );
      };
      tapAndWound();
      act(() => useCombatStore.getState().endTurn());
      expect(shown(container)).toEqual([{ id: RALLY, apply: "Heal 7" }]);
      tapAndWound();
      // Thief's Reflexes: a second turn in the same round is a turn start too.
      act(() => useCombatStore.getState().extraTurn(THIEFS_REFLEXES_ID));
      expect(shown(container)).toEqual([{ id: RALLY, apply: "Heal 7" }]);
    }
  );

  it.each(["classic", "play"] as const)(
    "%s: leaving the screen and coming back in the same turn keeps it applied",
    { timeout: 60_000 },
    (surface) => {
      setUp(champion(40), solo2);
      const first = mount(surface);
      expect(shown(first.container)).toEqual([{ id: RALLY, apply: "Heal 7" }]);
      tap(first.container);
      first.unmount();
      const { container } = mount(surface);
      // the turn strip is live (the round shows), and the note stays applied
      expect(useCombatStore.getState().round).toBe(2);
      expect(hp().current).toBe(47);
      expect(shown(container)).toEqual([]);
    }
  );
});

describe("only on my turn", () => {
  it.each(["classic", "play"] as const)(
    "%s: no turn-start note while a monster acts in the campaign fight",
    { timeout: 60_000 },
    (surface) => {
      setUp(champion(40), { kind: "campaign", round: 3, mine: false });
      const { container } = mount(surface);
      expect(shown(container)).toEqual([]);
    }
  );

  // Kept as each surface had it: the classic solo band is always my turn; Play shows
  // the turn's start once a fight has started.
  it(
    "solo with no fight started: the classic band shows it, Play waits for the fight",
    {
      timeout: 60_000,
    },
    () => {
      const idle: Fight = { kind: "solo", round: 1, started: false };
      expect(observe("classic", champion(40), idle).notes).toEqual([
        { id: RALLY, apply: "Heal 7" },
      ]);
      expect(observe("play", champion(40), idle).notes).toEqual([]);
    }
  );
});
