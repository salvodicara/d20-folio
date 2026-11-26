/**
 * #1365 — when the max HP drops (an attuned CON item sold, removed or unattuned, Aid
 * ending), current HP above the new max drops to it at once, as D&D Beyond and Roll20
 * show it. The clamp is part of its cause's undo entry: undoing the cause puts the HP
 * back. A max that rises never heals. SRD content only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/firebase", () => ({}));
import type { TFunction } from "i18next";
import { deleteItem } from "@/features/character/inventory-commands";
import { playLogShadowStats, useCharacterStore } from "@/stores/characterStore";
import {
  registerUndoable,
  registerUndoableResult,
  useUndoStore,
} from "@/stores/undoStore";
import { netHpClamps } from "@/stores/hp-clamp-ledger";
import { maxInputsChanged } from "@/lib/play/max-hp-drop";
import { effectiveMaxHp } from "@/lib/aggregate-character";
import { asRaceId } from "@/data/srd-names";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterData, CharacterDoc } from "@/types/character";

const t = ((key: string) => key) as unknown as TFunction;

// Dwarf Monk 3, CON 14: 27 by the book; the attuned Amulet of Health (CON 19) makes 33.
const AMULET = {
  srdId: "amulet-of-health",
  instanceId: "amulet-1",
  equipped: true,
  attuned: true,
};
const monk = (inputs: Partial<CharacterData> = {}): CharacterData => ({
  ...MOCK_CHARACTER.character,
  race: asRaceId("dwarf"),
  classes: [{ classId: "monk", level: 3 }],
  hitDieType: 8,
  abilityScores: { ...MOCK_CHARACTER.character.abilityScores, CON: 14 },
  features: [],
  equipment: [AMULET],
  spells: [],
  humanOriginFeat: "",
  bgFeat: "",
  hp: { max: 33 },
  ...inputs,
});

function load(current: number, inputs: Partial<CharacterData> = {}): void {
  const base = structuredClone(MOCK_CHARACTER);
  const doc: CharacterDoc = {
    ...base,
    character: monk(inputs),
    session: {
      ...base.session,
      hp: { current, temp: 0 },
      activeFeatures: [],
      itemResources: {},
      world: undefined,
    },
  };
  useCharacterStore.setState({ character: doc, readonly: false, loading: false });
}

const live = () => {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
};
const hp = () => live().session.hp.current;
const max = () => effectiveMaxHp(live().character, live().session);
const removeAmulet = () => deleteItem("equipment", 0, "Amulet", t);
const unattune = () =>
  registerUndoable(
    { message: "unattuned" },
    () =>
      useCharacterStore
        .getState()
        .dispatch({ kind: "unattune-item", instanceId: "amulet-1" }),
    { turnScoped: false }
  );

beforeEach(() => {
  useUndoStore.setState({ past: [], future: [] });
});

describe("current HP drops with the max (#1365)", () => {
  it("removing the attuned amulet at 33/33 lands at 27/27", () => {
    load(33);
    removeAmulet();
    expect([hp(), max()]).toEqual([27, 27]);
  });

  it("its undo puts both back: 33/33; redo: 27/27 again", () => {
    load(33);
    removeAmulet();
    useUndoStore.getState().undo();
    expect([hp(), max()]).toEqual([33, 33]);
    useUndoStore.getState().redo();
    expect([hp(), max()]).toEqual([27, 27]);
  });

  it("unattuning lands at 27/27, and its undo at 33/33", () => {
    load(33);
    unattune();
    expect([hp(), max()]).toEqual([27, 27]);
    useUndoStore.getState().undo();
    expect([hp(), max()]).toEqual([33, 33]);
  });

  it("Aid ending drops current HP with the max: 71 → 66", () => {
    load(71, {
      classes: [{ classId: "monk", level: 3 }],
      spells: [{ srdId: "aid", prepared: true }],
      equipment: [],
      hpBonus: 39,
    });
    useCharacterStore.getState().setActiveFeature("spell-aid", true);
    expect(max()).toBe(71);
    useCharacterStore.getState().setActiveFeature("spell-aid", false);
    expect([hp(), max()]).toEqual([66, 66]);
  });

  it("current HP below the new max stays where it is: 20 stays 20", () => {
    load(20);
    removeAmulet();
    expect([hp(), max()]).toEqual([20, 27]);
  });

  it("a max that rises never heals: 27/27 attuning back stays 27/33", () => {
    load(27, { equipment: [{ ...AMULET, attuned: false }] });
    useCharacterStore
      .getState()
      .dispatch({ kind: "attune-item", instanceId: "amulet-1" });
    expect([hp(), max()]).toEqual([27, 33]);
  });

  it("after the clamp a heal at the max changes nothing and logs nothing", () => {
    load(33);
    removeAmulet();
    const logBefore = live().session.logEntries.length;
    expect(useCharacterStore.getState().applyHealing(2)).toBeNull();
    expect(hp()).toBe(27);
    expect(live().session.logEntries).toHaveLength(logBefore);
  });

  it("damage between the cause and its undo keeps the damage: 27 − 5 = 22, undo → 22/33", () => {
    load(33);
    removeAmulet();
    useCharacterStore.getState().applyDamage(5);
    expect(hp()).toBe(22);
    useUndoStore.getState().undo(useUndoStore.getState().past[0]?.id);
    expect([hp(), max()]).toEqual([22, 33]);
  });

  it("a readonly sheet is never clamped", () => {
    load(33);
    useCharacterStore.setState({ readonly: true });
    const doc = live();
    useCharacterStore.setState({
      character: { ...doc, character: { ...doc.character, equipment: [] } },
    });
    expect(hp()).toBe(33);
  });

  it("loading another character never clamps it", () => {
    load(33);
    const other = { ...live(), id: "other", character: monk({ equipment: [] }) };
    useCharacterStore.setState({ character: other });
    expect(hp()).toBe(33);
  });
});

describe("an undo registered after its mutation ran also puts the clamp back (#1365)", () => {
  // The cause: the amulet taken out by a direct store write (any max-lowering path).
  const takeAmulet = () => {
    const doc = live();
    useCharacterStore.setState({
      character: { ...doc, character: { ...doc.character, equipment: [] } },
    });
    return () => {
      const now = live();
      useCharacterStore.setState({
        character: { ...now, character: { ...now.character, equipment: [AMULET] } },
      });
    };
  };

  it("registerUndoableResult (the result-labelled pattern): undo → 33/33", () => {
    load(33);
    const undo = takeAmulet();
    registerUndoableResult({ message: "taken" }, undo, () => undefined);
    expect(hp()).toBe(27);
    useUndoStore.getState().undo();
    expect([hp(), max()]).toEqual([33, 33]);
  });

  it("a hand-registered entry (the initiative top-up pattern): undo → 33/33", () => {
    load(33);
    const undo = takeAmulet();
    useUndoStore.getState().register({
      label: { message: "taken" },
      turnScoped: false,
      undo,
      redo: () => null,
    });
    useUndoStore.getState().undo();
    expect([hp(), max()]).toEqual([33, 33]);
  });

  it("a clamp from an earlier, finished command is never attached to a later entry", async () => {
    load(33);
    takeAmulet();
    await Promise.resolve();
    const doc = live();
    useCharacterStore.setState({
      character: { ...doc, character: { ...doc.character, equipment: [AMULET] } },
    });
    registerUndoableResult(
      { message: "later" },
      () => true,
      () => undefined
    );
    useUndoStore.getState().undo();
    expect([hp(), max()]).toEqual([27, 33]);
  });
});

describe("a max of 0 (#1365)", () => {
  it("a max that drops to 0 is left to the reduction rules", () => {
    load(33);
    const doc = live();
    // A reduction of 27: the max is 6 and current HP follows it down.
    useCharacterStore.setState({
      character: { ...doc, session: { ...doc.session, hpMaxReduction: 27 } },
    });
    expect([hp(), max()]).toEqual([6, 6]);
    // The amulet goes: 27 − 27 = 0. The clamp leaves it to the reduction rules.
    const reduced = live();
    useCharacterStore.setState({
      character: { ...reduced, character: { ...reduced.character, equipment: [] } },
    });
    expect([hp(), max()]).toEqual([6, 0]);
  });
});

describe("the play log reproduces the clamp (#1365)", () => {
  it("unattuning clamps inside the event: the next event needs no new checkpoint", () => {
    load(33);
    const id = live().id;
    useCharacterStore.getState().dispatch({ kind: "set-surprised", surprised: true });
    const before = playLogShadowStats(id)?.checkpoints ?? 0;
    useCharacterStore
      .getState()
      .dispatch({ kind: "unattune-item", instanceId: "amulet-1" });
    useCharacterStore.getState().dispatch({ kind: "set-surprised", surprised: false });
    expect(hp()).toBe(27);
    expect(playLogShadowStats(id)?.checkpoints).toBe(before);
  });
});

describe("the clamp skips writes that cannot move the max (#1365)", () => {
  it("a timer tick that rebuilds activeFeatures with the same items reads no max", () => {
    load(33);
    const doc = live();
    const ticked = {
      ...doc,
      session: {
        ...doc.session,
        activeFeatures: [...(doc.session.activeFeatures ?? [])],
      },
    };
    expect(maxInputsChanged(doc, ticked)).toBe(false);
  });

  it("a state that ends (Aid) or a build change does", () => {
    load(33);
    const doc = live();
    const lit = { ...doc, session: { ...doc.session, activeFeatures: ["spell-aid"] } };
    expect(maxInputsChanged(doc, lit)).toBe(true);
    expect(maxInputsChanged(doc, { ...doc, character: { ...doc.character } })).toBe(true);
  });
});

describe("the clamp ledger", () => {
  it("two clamps in one command undo to the HP before the first: 33 → 30 → 27 nets 33 → 27", () => {
    expect(
      netHpClamps([
        { characterId: "a", from: 33, to: 30 },
        { characterId: "a", from: 30, to: 27 },
      ])
    ).toEqual([{ characterId: "a", from: 33, to: 27 }]);
  });
});
