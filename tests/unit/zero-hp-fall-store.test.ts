/**
 * The fall to 0 HP through the store (edge-case family M7). Falling unconscious ends
 * the states that end on incapacitation (Rage), whoever dealt the hit. A saver that
 * works means the character never stayed down ("instead"), so those states come
 * back; the use is one undo.
 *
 * Corpus: Relentless Rage (category 10); the Rage duration's "ends early if you have
 * the Incapacitated condition" (barbarian:main).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { sessionToPlayStateV1 } from "@/lib/session-state-codec";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import type { CombatState } from "@/types/combat-state";

import { makeCharacterDoc } from "./_helpers";

const RAGE = "barbarian-rage";
const RELENTLESS = "barbarian-relentless-rage";
const store = () => useCharacterStore.getState();

function ragingBarbarian(): CharacterDoc {
  const doc = makeCharacterDoc(
    { classId: "barbarian", level: 11 },
    { hp: { current: 5, temp: 0 }, activeFeatures: [RAGE] }
  );
  doc.id = `fall-${Math.random().toString(36).slice(2)}`;
  doc.character.hp = { max: 120 };
  doc.character.features = [{ srdId: RAGE }, { srdId: RELENTLESS }];
  return doc;
}

function load(doc: CharacterDoc): void {
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
}

const active = () => store().character?.session.activeFeatures ?? [];

describe("a fall from damage", () => {
  beforeEach(() => useCharacterStore.setState({ character: null }));

  it("ends Rage, as a hand-applied Unconscious does", () => {
    load(ragingBarbarian());
    store().applyDamage(20);
    expect(store().character?.session.hp.current).toBe(0);
    expect(store().character?.session.conditions).toContain("unconscious");
    expect(active()).not.toContain(RAGE);
  });

  it("a hit that leaves the Barbarian standing keeps the Rage", () => {
    load(ragingBarbarian());
    store().applyDamage(3);
    expect(active()).toContain(RAGE);
  });

  it("a passed Relentless Rage save stands them at 22 HP, still raging", () => {
    load(ragingBarbarian());
    store().applyDamage(20);
    const undo = store().applyZeroHpSaver(RELENTLESS, "success");
    expect(store().character?.session.hp.current).toBe(22);
    expect(store().character?.session.conditions).not.toContain("unconscious");
    expect(active()).toContain(RAGE);

    // One undo takes the whole use back: down again, Rage over, no use counted.
    expect(undo?.()).toBe(true);
    expect(store().character?.session.hp.current).toBe(0);
    expect(active()).not.toContain(RAGE);
    expect(store().character?.session.zeroHpSaverUses).toBeUndefined();
  });

  it("a failed save leaves them down and the Rage over", () => {
    load(ragingBarbarian());
    store().applyDamage(20);
    store().applyZeroHpSaver(RELENTLESS, "failure");
    expect(store().character?.session.hp.current).toBe(0);
    expect(active()).not.toContain(RAGE);
    expect(store().character?.session.zeroHpSaverUses).toEqual({ [RELENTLESS]: 1 });
  });
});

describe("a fall from someone else's hit (another device wrote the 0 HP)", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, encounterEffectProjection: null });
    useCharacterStore.getState().setCombatPersistence(null);
  });

  function peerDrop(doc: CharacterDoc): CombatState {
    return {
      hp: { current: 0, temp: 0 },
      conditions: ["unconscious"],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
      round: 2,
      pendingConcentrationSaves: [],
      playState: sessionToPlayStateV1(doc.session),
    };
  }

  it("records the fall, ends Rage, and still offers Relentless Rage", () => {
    const doc = ragingBarbarian();
    store().setCharacter(doc);
    store().hydrateCombatState(peerDrop(doc));
    expect(active()).not.toContain(RAGE);
    expect(store().character?.session.zeroHpDrop?.activeKeys).toContain(RAGE);
    store().applyZeroHpSaver(RELENTLESS, "success");
    expect(store().character?.session.hp.current).toBe(22);
    expect(active()).toContain(RAGE);
  });
});
