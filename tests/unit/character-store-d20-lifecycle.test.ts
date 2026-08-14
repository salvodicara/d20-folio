import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";
import { conc } from "./__helpers__/concentration";
import type { ActiveCombatEffect } from "@/types/combat-effect";

function concentratingCharacter() {
  return makeCharacterDoc(
    {
      classes: [{ classId: "paladin", level: 5 }],
      spells: [{ srdId: "shield-of-faith", prepared: true }],
      hp: { max: 100 },
    },
    {
      hp: { current: 100, temp: 0 },
      concentration: conc("shield-of-faith"),
      concentrationCastLevel: 3,
      activeFeatures: ["spell-shield-of-faith"],
      activeSpellCastLevels: { "spell-shield-of-faith": 3 },
      effectTimers: { "spell-shield-of-faith": { roundsLeft: 8 } },
      effectBoundaries: {
        "spell-shield-of-faith": { round: 8, phase: "turn-end" },
      },
      concentrationConditions: ["restrained"],
    }
  );
}

function concentrationEffect(): ActiveCombatEffect {
  return {
    id: "effect-shield-of-faith",
    actor: {
      kind: "pc",
      combatantId: "self",
      memberUid: "self",
      characterId: "test-char",
    },
    target: {
      kind: "pc",
      combatantId: "self",
      memberUid: "self",
      characterId: "test-char",
    },
    source: {
      kind: "spell",
      id: "shield-of-faith",
      actionId: "spell-shield-of-faith",
      castLevel: 3,
    },
    payload: { kind: "grant-group", activeKey: "spell-shield-of-faith" },
    duration: {
      kind: "concentration",
      actorId: "self",
      sourceId: "shield-of-faith",
    },
  };
}

beforeEach(() => {
  useCharacterStore.setState({
    character: null,
    readonly: false,
    combatPersistence: null,
    parentPersistenceFlush: null,
    combatActiveEffects: [],
    combatPendingConcentrationSaves: [],
  });
});

describe("characterStore — entered D20 lifecycle", () => {
  it("resolves Death Saves from live all-save/Exhaustion facts without leaking a CON override", () => {
    const ordinary = makeCharacterDoc(
      {
        equipment: [{ srdId: "luck-blade", equipped: true, attuned: true }],
      },
      { hp: { current: 0, temp: 0 }, exhaustion: 1 }
    );
    useCharacterStore.getState().setCharacter(ordinary);
    const modifiedSuccess = useCharacterStore.getState().commitDeathSave([11]);
    expect(modifiedSuccess?.result.deterministicModifier).toBe(-1);
    expect(modifiedSuccess?.result.total).toBe(10);
    expect(modifiedSuccess?.result.reviewedOutcome.status).toBe("success");

    const conOverride = makeCharacterDoc(
      { savingThrowBonusOverrides: { CON: 99 } },
      { hp: { current: 0, temp: 0 } }
    );
    useCharacterStore.getState().setCharacter(conOverride);
    const noConLeak = useCharacterStore.getState().commitDeathSave([9]);
    expect(noConLeak?.result.deterministicModifier).toBe(0);
    expect(noConLeak?.result.reviewedOutcome.status).toBe("failure");

    const unconsciousPaladin = makeCharacterDoc(
      {
        classes: [{ classId: "paladin", level: 6 }],
        abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 18 },
        features: [{ srdId: "paladin-aura-of-protection" }],
      },
      { hp: { current: 0, temp: 0 }, conditions: ["unconscious"] }
    );
    useCharacterStore.getState().setCharacter(unconsciousPaladin);
    const inactiveAura = useCharacterStore.getState().commitDeathSave([9]);
    expect(inactiveAura?.result.deterministicModifier).toBe(0);
    expect(inactiveAura?.result.reviewedOutcome.status).toBe("failure");
  });

  it("uses net Advantage faces and only the selected natural face for Champion's 18+ benefit", () => {
    const champion = makeCharacterDoc(
      {
        classes: [{ classId: "fighter", subclassId: "champion", level: 18 }],
        features: [{ srdId: "fighter-champion-survivor" }],
      },
      { hp: { current: 0, temp: 0 } }
    );
    useCharacterStore.getState().setCharacter(champion);
    const commit = useCharacterStore.getState().commitDeathSave([1, 18]);
    expect(commit?.result.mode).toBe("advantage");
    expect(commit?.result.selectedNaturalFace).toBe(18);
    expect(commit?.result.reviewedOutcome.deathSave).toMatchObject({
      naturalOne: false,
      naturalTwentyBenefit: true,
      naturalTwentyThreshold: 18,
      hitPointsRegained: 1,
    });
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(1);
  });

  it("queues one prompt per damage packet, advances FIFO on success, and clears all on failure", () => {
    useCharacterStore.getState().setCharacter(concentratingCharacter());
    useCharacterStore.getState().applyDamage(22);
    useCharacterStore.getState().applyDamage(10);
    const [first, second] = useCharacterStore.getState().combatPendingConcentrationSaves;
    expect(first).toMatchObject({ damage: 22, difficultyClass: 11 });
    expect(second).toMatchObject({ damage: 10, difficultyClass: 10 });
    expect(first?.id).not.toBe(second?.id);
    if (!first || !second) throw new Error("expected two queued saves");

    const success = useCharacterStore
      .getState()
      .commitPendingConcentrationSave(first, [20]);
    expect(success?.result.reviewedOutcome.status).toBe("success");
    expect(useCharacterStore.getState().character?.session.concentration).toBe(
      conc("shield-of-faith")
    );
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toEqual([
      second,
    ]);
    expect(
      useCharacterStore.getState().commitPendingConcentrationSave(first, [20])
    ).toBeNull();

    const failure = useCharacterStore
      .getState()
      .commitPendingConcentrationSave(second, [1]);
    expect(failure?.result.reviewedOutcome.status).toBe("failure");
    expect(useCharacterStore.getState().character?.session.concentration).toBe("");
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toEqual([]);
  });

  it("re-resolves the live CON save, Concentration-only roll mode, and Exhaustion exactly once", () => {
    const warlock = makeCharacterDoc(
      {
        classes: [
          {
            classId: "warlock",
            level: 5,
            invocationChoices: ["eldritch-mind"],
          },
        ],
        savingThrows: [],
      },
      {
        hp: { current: 44, temp: 0 },
        concentration: conc("hex"),
        exhaustion: 1,
      }
    );
    useCharacterStore.getState().setCharacter(warlock);
    useCharacterStore.getState().applyDamage(10);
    const pending = useCharacterStore.getState().combatPendingConcentrationSaves[0];
    if (!pending) throw new Error("missing pending save");
    const commit = useCharacterStore
      .getState()
      .commitPendingConcentrationSave(pending, [1, 20]);
    expect(commit?.result.mode).toBe("advantage");
    // CON 14 = +2 and Exhaustion 1 = -2. The penalty is a separate term once.
    expect(commit?.result.deterministicModifier).toBe(0);
    expect(commit?.result.selectedNaturalFace).toBe(20);
    expect(commit?.result.reviewedOutcome.status).toBe("success");
  });

  it("failure tears down every concentration-owned fact and its CAS undo restores exactly", () => {
    const character = concentratingCharacter();
    useCharacterStore.getState().setCharacter(character);
    const effect = concentrationEffect();
    useCharacterStore.getState().applySoloCombatEffects([effect]);
    useCharacterStore.getState().applyDamage(10);
    const pending = useCharacterStore.getState().combatPendingConcentrationSaves[0];
    if (!pending) throw new Error("missing pending save");
    const before = structuredClone(useCharacterStore.getState().character);

    const commit = useCharacterStore
      .getState()
      .commitPendingConcentrationSave(pending, [1]);
    expect(commit).not.toBeNull();
    const failed = useCharacterStore.getState();
    expect(failed.character?.session).toMatchObject({
      concentration: "",
      activeFeatures: [],
    });
    expect(failed.character?.session.concentrationCastLevel).toBeUndefined();
    expect(failed.character?.session.activeSpellCastLevels).toBeUndefined();
    expect(failed.character?.session.effectTimers).toBeUndefined();
    expect(failed.character?.session.effectBoundaries).toBeUndefined();
    expect(failed.character?.session.concentrationConditions).toBeUndefined();
    expect(failed.combatActiveEffects).toEqual([]);

    expect(commit?.undo()).toBe(true);
    expect(useCharacterStore.getState().character).toEqual(before);
    expect(useCharacterStore.getState().combatActiveEffects).toEqual([effect]);
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toEqual([
      pending,
    ]);
  });

  it("fails closed for stale prompts and stale undo, and auto-breaks at 0 without queuing", () => {
    useCharacterStore.getState().setCharacter(concentratingCharacter());
    useCharacterStore.getState().applyDamage(10);
    const pending = useCharacterStore.getState().combatPendingConcentrationSaves[0];
    if (!pending) throw new Error("missing pending save");
    expect(
      useCharacterStore
        .getState()
        .commitPendingConcentrationSave(
          { ...pending, difficultyClass: pending.difficultyClass + 1 },
          [20]
        )
    ).toBeNull();
    const commit = useCharacterStore
      .getState()
      .commitPendingConcentrationSave(pending, [1]);
    useCharacterStore.getState().updateSession({ notes: "later edit" });
    expect(commit?.undo()).toBe(false);
    expect(useCharacterStore.getState().character?.session.notes).toBe("later edit");

    const lethal = concentratingCharacter();
    lethal.session.hp.current = 5;
    useCharacterStore.getState().setCharacter(lethal);
    const lethalBefore = structuredClone(lethal);
    const undoLethalDamage = useCharacterStore.getState().applyDamage(5);
    const afterLethal = useCharacterStore.getState().character?.session;
    expect(afterLethal?.concentration).toBe("");
    expect(afterLethal?.activeFeatures).toEqual([]);
    expect(afterLethal?.concentrationCastLevel).toBeUndefined();
    expect(afterLethal?.activeSpellCastLevels).toBeUndefined();
    expect(afterLethal?.effectTimers).toBeUndefined();
    expect(afterLethal?.effectBoundaries).toBeUndefined();
    expect(afterLethal?.concentrationConditions).toBeUndefined();
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toEqual([]);

    expect(undoLethalDamage?.()).toBe(true);
    expect(useCharacterStore.getState().character).toEqual(lethalBefore);
  });

  it("drops cross-document stale prompts during combat-state hydration", () => {
    useCharacterStore.getState().setCharacter(concentratingCharacter());
    const matching = {
      id: "pending-matching",
      spell: conc("shield-of-faith"),
      damage: 10,
      difficultyClass: 10,
    };
    const stale = {
      id: "pending-stale",
      spell: conc("bless"),
      damage: 10,
      difficultyClass: 10,
    };
    const combat = {
      hp: { current: 90, temp: 0 },
      conditions: [],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
      round: 1,
      recentActions: [],
      pendingConcentrationSaves: [matching, stale],
    };

    useCharacterStore.getState().hydrateCombatState(combat);
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toEqual([
      matching,
    ]);

    useCharacterStore.getState().updateSession({ concentration: "" });
    useCharacterStore.getState().hydrateCombatState(combat);
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toEqual([]);
  });

  it("persists the queue as part of the same combat-state write", () => {
    const write = vi.fn();
    useCharacterStore.getState().setCharacter(concentratingCharacter());
    useCharacterStore.getState().setCombatPersistence({
      write,
      writeTurnEconomy: vi.fn(),
    });
    useCharacterStore.getState().applyDamage(22);
    expect(write).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pendingConcentrationSaves: [
          expect.objectContaining({ damage: 22, difficultyClass: 11 }),
        ],
      })
    );

    const highHp = concentratingCharacter();
    highHp.character.hp.max = 200;
    highHp.session.hp.current = 200;
    useCharacterStore.getState().setCharacter(highHp);
    useCharacterStore.getState().applyDamage(80);
    expect(useCharacterStore.getState().combatPendingConcentrationSaves[0]).toMatchObject(
      { damage: 80, difficultyClass: 30 }
    );
  });
});
