vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
/**
 * Deletion-map L3, second movement — the legacy WRITE paths for character
 * vitals ride the canonical engine world.
 *
 * Contract pinned here, per family (hp/death, temp hp, slots, trackers,
 * exhaustion, conditions, the composite recoveries, the MechanicsCommand CAS
 * path): when the character carries a PERSISTED engine world, every store
 * vitals mutation plans against the world FIRST and commits world + legacy
 * session fields in ONE store update (the commit mirror), appending one
 * journal action; when the world is absent or cannot express the transition,
 * the legacy direct write remains as the documented fail-closed degradation
 * and the world value never moves. Undo affordances reverse the exact journal
 * action (or restore the whole snapshot, which carries the world by value).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareMechanicsCommand, type MechanicsCommand } from "@/lib/mechanics-command";
import { characterTrackerSeeds, characterWorldState } from "@/lib/mechanics-world-store";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";

import { makeCharacterDoc } from "./_helpers";

const UID = "test-uid";

/** A doc whose session CARRIES a persisted engine world (the cutover gate). */
function docWithWorld(
  char: Parameters<typeof makeCharacterDoc>[0] = {},
  session: Partial<SessionState> = {},
  opts: { seedTrackers?: boolean } = {}
): CharacterDoc {
  const doc = makeCharacterDoc(char, session);
  const world = characterWorldState(
    doc,
    UID,
    doc.character.hp.max,
    {},
    opts.seedTrackers === false ? {} : characterTrackerSeeds(doc)
  );
  if (!world) throw new Error("world fixture failed");
  doc.session = { ...doc.session, world: structuredClone(world) };
  return doc;
}

function load(doc: CharacterDoc): void {
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
    combatPersistence: null,
    combatPendingConcentrationSaves: [],
  });
}

function liveDoc(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("live character missing");
  return doc;
}

/** Re-prove the LIVE persisted world (fail-closed parse, no reseeding). */
function liveWorld(): Readonly<CharacterMaterialState> {
  const doc = liveDoc();
  const world = characterWorldState(doc, UID, doc.character.hp.max);
  if (!world) throw new Error("live world reparse failed");
  return world;
}

function liveConditionCount(conditionId: string): number {
  return Object.values(liveWorld().occurrences).filter(
    (occurrence) =>
      occurrence.kind === "condition" &&
      occurrence.ending === null &&
      occurrence.conditionId === conditionId
  ).length;
}

afterEach(() => {
  useCharacterStore.setState({
    character: null,
    readonly: false,
    combatPendingConcentrationSaves: [],
  });
  useUndoStore.getState().clear(null);
  useToastStore.setState({ toasts: [], timers: {} });
});

describe("slots family: useSpellSlot / restoreSpellSlot", () => {
  const fixture = () =>
    docWithWorld({ classId: "wizard", level: 5, spellSlots: [{ level: 2, total: 3 }] });

  it("spends and restores through the world; the mirror writes the legacy counter", () => {
    load(fixture());
    const before = liveWorld();
    expect(before.resources.standardSpellSlots["2"]?.current).toBe(3);

    useCharacterStore.getState().useSpellSlot(2);
    expect(liveWorld().resources.standardSpellSlots["2"]?.current).toBe(2);
    expect(liveDoc().session.spellSlots["2"]?.used).toBe(1);
    expect(liveWorld().actions.length).toBe(before.actions.length + 1);

    useCharacterStore.getState().restoreSpellSlot(2);
    expect(liveWorld().resources.standardSpellSlots["2"]?.current).toBe(3);
    expect(liveDoc().session.spellSlots["2"]?.used).toBe(0);
  });

  it("degrades to the legacy write when the world cell cannot afford the spend", () => {
    const doc = fixture();
    load(doc);
    for (let index = 0; index < 3; index += 1) {
      useCharacterStore.getState().useSpellSlot(2);
    }
    expect(liveWorld().resources.standardSpellSlots["2"]?.current).toBe(0);
    const worldBefore = structuredClone(liveDoc().session.world);

    // A fourth tap is inexpressible on the world; the legacy counter still
    // moves (session wins on drift) and the world value stays put.
    useCharacterStore.getState().useSpellSlot(2);
    expect(liveDoc().session.spellSlots["2"]?.used).toBe(4);
    expect(liveDoc().session.world).toEqual(worldBefore);
  });

  it("stays purely legacy when no persisted world exists", () => {
    load(
      makeCharacterDoc({
        classId: "wizard",
        level: 5,
        spellSlots: [{ level: 2, total: 3 }],
      })
    );
    useCharacterStore.getState().useSpellSlot(2);
    expect(liveDoc().session.spellSlots["2"]?.used).toBe(1);
    expect(liveDoc().session.world).toBeUndefined();
  });
});

describe("trackers family: useTracker / restoreTracker", () => {
  const fixture = () =>
    docWithWorld(
      { classId: "monk", level: 5, features: [{ srdId: "monk-focus" }] },
      { trackers: { "monk-focus": { used: 1 } } }
    );

  it("debits the pool cell and mirrors the legacy counter (rolls preserved)", () => {
    load(fixture());
    expect(liveWorld().resources.pools["monk-focus"]).toMatchObject({ current: 4 });

    useCharacterStore.getState().useTracker("monk-focus", 2);
    expect(liveWorld().resources.pools["monk-focus"]).toMatchObject({ current: 2 });
    expect(liveDoc().session.trackers["monk-focus"]?.used).toBe(3);

    useCharacterStore.getState().restoreTracker("monk-focus", 1);
    expect(liveWorld().resources.pools["monk-focus"]).toMatchObject({ current: 3 });
    expect(liveDoc().session.trackers["monk-focus"]?.used).toBe(2);
  });

  it("seeds a never-seen pool from the legacy counters with the first paid spend", () => {
    // The persisted world predates the pool (seeded without tracker rows).
    load(
      docWithWorld(
        { classId: "monk", level: 5, features: [{ srdId: "monk-focus" }] },
        { trackers: { "monk-focus": { used: 1 } } },
        { seedTrackers: false }
      )
    );
    expect(liveWorld().resources.pools["monk-focus"]).toBeUndefined();

    useCharacterStore.getState().useTracker("monk-focus", 1);
    // Seeded at total 5 − used 1 = 4, then debited 1 → 3; mirror used 1 → 2.
    expect(liveWorld().resources.pools["monk-focus"]).toMatchObject({ current: 3 });
    expect(liveDoc().session.trackers["monk-focus"]?.used).toBe(2);
  });

  it("clamps a restore at the pool's derived capacity (legacy floor law)", () => {
    load(fixture());
    useCharacterStore.getState().restoreTracker("monk-focus", 5);
    expect(liveWorld().resources.pools["monk-focus"]).toMatchObject({ current: 5 });
    expect(liveDoc().session.trackers["monk-focus"]?.used).toBe(0);
  });
});

describe("hp/death family", () => {
  const fixture = (session: Partial<SessionState> = {}) =>
    docWithWorld({ classId: "fighter", level: 5 }, session);

  it("setHP writes the world's hit points and zero-HP track", () => {
    load(fixture({ hp: { current: 30, temp: 0 } }));
    useCharacterStore.getState().setHP(5);
    expect(liveWorld().vitals.hitPoints.current).toBe(5);
    expect(liveWorld().vitals.zeroHitPoints).toBeNull();
    expect(liveDoc().session.hp.current).toBe(5);

    useCharacterStore.getState().setHP(0);
    expect(liveWorld().vitals.hitPoints.current).toBe(0);
    expect(liveWorld().vitals.zeroHitPoints).toEqual({
      failures: 0,
      kind: "dying",
      successes: 0,
    });
  });

  it("healing from 0 clears the world track and resets the legacy death saves", () => {
    load(
      fixture({
        hp: { current: 0, temp: 0 },
        deathSucc: 1,
        deathFail: 2,
        conditions: ["unconscious"],
      })
    );
    useCharacterStore.getState().setHP(8);
    expect(liveWorld().vitals.hitPoints.current).toBe(8);
    expect(liveWorld().vitals.zeroHitPoints).toBeNull();
    expect(liveDoc().session.deathSucc).toBe(0);
    expect(liveDoc().session.deathFail).toBe(0);
    // The Unconscious shed stays the legacy overlay on the SAME store update.
    expect(liveDoc().session.conditions).not.toContain("unconscious");
  });

  it("setTempHP / gainTempHp move the world's temporary pool", () => {
    load(fixture({ hp: { current: 30, temp: 0 } }));
    useCharacterStore.getState().gainTempHp(6);
    expect(liveWorld().vitals.hitPoints.temporary.current).toBe(6);
    expect(liveDoc().session.hp.temp).toBe(6);

    useCharacterStore.getState().setTempHP(0);
    expect(liveWorld().vitals.hitPoints.temporary.current).toBe(0);
    expect(liveDoc().session.hp.temp).toBe(0);
  });

  it("applyDamage lands on the world (temp absorbs first) and its undo restores it", () => {
    load(fixture({ hp: { current: 30, temp: 4 } }));
    const undo = useCharacterStore.getState().applyDamage(10);
    expect(liveWorld().vitals.hitPoints).toMatchObject({
      current: 24,
      temporary: { current: 0 },
    });
    expect(liveDoc().session.hp).toMatchObject({ current: 24, temp: 0 });

    expect(undo).not.toBeNull();
    expect(undo?.()).toBe(true);
    expect(liveWorld().vitals.hitPoints).toMatchObject({
      current: 30,
      temporary: { current: 4 },
    });
    expect(liveDoc().session.hp).toMatchObject({ current: 30, temp: 4 });
  });

  it("a knockout writes the fresh dying track; massive damage writes dead", () => {
    load(fixture({ hp: { current: 5, temp: 0 } }));
    useCharacterStore.getState().applyDamage(5);
    expect(liveWorld().vitals.hitPoints.current).toBe(0);
    expect(liveWorld().vitals.zeroHitPoints).toEqual({
      failures: 0,
      kind: "dying",
      successes: 0,
    });
    expect(liveDoc().session.conditions).toContain("unconscious");

    load(fixture({ hp: { current: 5, temp: 0 } }));
    useCharacterStore.getState().applyDamage(5 + 44);
    expect(liveWorld().vitals.zeroHitPoints).toEqual({ kind: "dead" });
    expect(liveDoc().session.deathFail).toBe(3);
  });

  it("setDeathSaves maps counts onto dying/stable/dead; session keeps the counts", () => {
    load(fixture({ hp: { current: 0, temp: 0 } }));
    useCharacterStore.getState().setDeathSaves(1, 2);
    expect(liveWorld().vitals.zeroHitPoints).toEqual({
      failures: 2,
      kind: "dying",
      successes: 1,
    });
    expect(liveDoc().session).toMatchObject({ deathSucc: 1, deathFail: 2 });

    useCharacterStore.getState().setDeathSaves(3, 2);
    expect(liveWorld().vitals.zeroHitPoints).toEqual({ kind: "stable" });
    expect(liveDoc().session).toMatchObject({ deathSucc: 3, deathFail: 2 });

    useCharacterStore.getState().setDeathSaves(0, 3);
    expect(liveWorld().vitals.zeroHitPoints).toEqual({ kind: "dead" });
    expect(liveDoc().session).toMatchObject({ deathSucc: 0, deathFail: 3 });
  });

  it("restoreHpSnapshot re-asserts the snapshot on the world too", () => {
    load(fixture({ hp: { current: 30, temp: 0 } }));
    useCharacterStore.getState().restoreHpSnapshot({
      current: 12,
      temp: 3,
      deathSucc: 0,
      deathFail: 0,
      conditions: ["prone"],
    });
    expect(liveWorld().vitals.hitPoints).toMatchObject({
      current: 12,
      temporary: { current: 3 },
    });
    expect(liveDoc().session.hp).toMatchObject({ current: 12, temp: 3 });
    expect(liveDoc().session.conditions).toEqual(["prone"]);
  });
});

describe("exhaustion family: setExhaustion", () => {
  it("moves the world level and mirrors the legacy field", () => {
    load(docWithWorld({}, { exhaustion: 1 }));
    useCharacterStore.getState().setExhaustion(3);
    expect(liveWorld().exhaustion).toBe(3);
    expect(liveDoc().session.exhaustion).toBe(3);
  });

  it("level 6 on a living character degrades to the legacy write (the world's death invariant)", () => {
    load(docWithWorld({}, { exhaustion: 5 }));
    const worldBefore = structuredClone(liveDoc().session.world);
    useCharacterStore.getState().setExhaustion(6);
    expect(liveDoc().session.exhaustion).toBe(6);
    expect(liveDoc().session.world).toEqual(worldBefore);
  });
});

describe("conditions family: addCondition / removeConditionSilent", () => {
  it("a manual chip commits as a world condition occurrence and the removal ends it", () => {
    load(docWithWorld());
    useCharacterStore.getState().addCondition("poisoned");
    expect(liveConditionCount("poisoned")).toBe(1);
    expect(liveDoc().session.conditions).toContain("poisoned");

    const undo = useCharacterStore.getState().removeConditionSilent("poisoned");
    expect(liveConditionCount("poisoned")).toBe(0);
    expect(liveDoc().session.conditions).not.toContain("poisoned");

    // The undo reverses the exact journal end: the occurrence lives again and
    // the chip is back through the same mirror.
    expect(undo).not.toBeNull();
    undo?.();
    expect(liveConditionCount("poisoned")).toBe(1);
    expect(liveDoc().session.conditions).toContain("poisoned");
  });

  it("applyHiddenState books Invisible as a world occurrence; its undo ends it", () => {
    load(docWithWorld());
    const undo = useCharacterStore.getState().applyHiddenState(15);
    expect(liveConditionCount("invisible")).toBe(1);
    expect(liveDoc().session.conditions).toContain("invisible");
    expect(liveDoc().session.hiddenDc).toBe(15);

    undo?.();
    expect(liveConditionCount("invisible")).toBe(0);
    expect(liveDoc().session.conditions).not.toContain("invisible");
    expect(liveDoc().session.hiddenDc).toBeUndefined();
  });

  it("an uncatalogued condition id degrades to the legacy chip write", () => {
    load(docWithWorld());
    const worldBefore = structuredClone(liveDoc().session.world);
    useCharacterStore.getState().addCondition("homebrew-doom");
    expect(liveDoc().session.conditions).toContain("homebrew-doom");
    expect(liveDoc().session.world).toEqual(worldBefore);
  });
});

describe("composite recoveries", () => {
  it("recoverTrackerByAltCost commits both pool moves as one journal action with a journal-reverse undo", () => {
    load(
      docWithWorld(
        {
          classId: "monk",
          level: 5,
          features: [{ srdId: "monk-focus" }, { srdId: "monk-uncanny-metabolism" }],
        },
        {
          trackers: {
            "monk-focus": { used: 1 },
            "monk-uncanny-metabolism": { used: 1 },
          },
        }
      )
    );
    const actionsBefore = liveWorld().actions.length;
    const undo = useCharacterStore
      .getState()
      .recoverTrackerByAltCost("monk-uncanny-metabolism", "monk-focus", 2);
    expect(undo).not.toBeNull();
    expect(liveWorld().actions.length).toBe(actionsBefore + 1);
    expect(liveWorld().resources.pools["monk-focus"]).toMatchObject({ current: 2 });
    expect(liveWorld().resources.pools["monk-uncanny-metabolism"]).toMatchObject({
      current: 1,
    });
    expect(liveDoc().session.trackers["monk-focus"]?.used).toBe(3);
    expect(liveDoc().session.trackers["monk-uncanny-metabolism"]?.used).toBe(0);

    undo?.();
    expect(liveWorld().resources.pools["monk-focus"]).toMatchObject({ current: 4 });
    expect(liveWorld().resources.pools["monk-uncanny-metabolism"]).toMatchObject({
      current: 0,
    });
    expect(liveDoc().session.trackers["monk-focus"]?.used).toBe(1);
    expect(liveDoc().session.trackers["monk-uncanny-metabolism"]?.used).toBe(1);
  });

  it("applyArcaneRecovery restores the chosen slots and debits the feature pool atomically", () => {
    load(
      docWithWorld(
        {
          classId: "wizard",
          level: 3,
          features: [{ srdId: "wizard-arcane-recovery" }],
          spellSlots: [
            { level: 1, total: 4 },
            { level: 2, total: 2 },
          ],
        },
        { spellSlots: { "1": { used: 2 }, "2": { used: 1 } } }
      )
    );
    const undo = useCharacterStore
      .getState()
      .applyArcaneRecovery([1, 2], "wizard-arcane-recovery");
    expect(liveWorld().resources.standardSpellSlots["1"]).toMatchObject({ current: 3 });
    expect(liveWorld().resources.standardSpellSlots["2"]).toMatchObject({ current: 2 });
    expect(liveWorld().resources.pools["wizard-arcane-recovery"]).toMatchObject({
      current: 0,
    });
    expect(liveDoc().session.spellSlots["1"]?.used).toBe(1);
    expect(liveDoc().session.spellSlots["2"]?.used).toBe(0);
    expect(liveDoc().session.trackers["wizard-arcane-recovery"]?.used).toBe(1);

    undo();
    expect(liveWorld().resources.standardSpellSlots["1"]).toMatchObject({ current: 2 });
    expect(liveDoc().session.spellSlots["1"]?.used).toBe(2);
    expect(liveDoc().session.trackers["wizard-arcane-recovery"]?.used).toBe(0);
  });

  it("applyAtZeroHpInterrupt commits hp + pool as one action; undo restores both sides", () => {
    load(
      docWithWorld(
        { classId: "monk", level: 5, features: [{ srdId: "monk-focus" }] },
        {
          hp: { current: 0, temp: 0 },
          conditions: ["unconscious"],
          deathSucc: 1,
          deathFail: 1,
        }
      )
    );
    const undo = useCharacterStore.getState().applyAtZeroHpInterrupt("monk-focus");
    expect(liveWorld().vitals.hitPoints.current).toBe(1);
    expect(liveWorld().vitals.zeroHitPoints).toBeNull();
    expect(liveWorld().resources.pools["monk-focus"]).toMatchObject({ current: 4 });
    expect(liveDoc().session.hp.current).toBe(1);
    expect(liveDoc().session.trackers["monk-focus"]?.used).toBe(1);
    expect(liveDoc().session.conditions).not.toContain("unconscious");

    undo();
    expect(liveWorld().vitals.hitPoints.current).toBe(0);
    expect(liveWorld().resources.pools["monk-focus"]).toMatchObject({ current: 5 });
    expect(liveDoc().session.hp.current).toBe(0);
    expect(liveDoc().session.conditions).toContain("unconscious");
    expect(liveDoc().session).toMatchObject({ deathSucc: 1, deathFail: 1 });
  });
});

describe("MechanicsCommand CAS path: the world leg", () => {
  it("applyMechanicsPlan moves the world cells alongside the legacy CAS write", () => {
    const doc = docWithWorld(
      {
        classId: "sorcerer",
        level: 5,
        features: [{ srdId: "sorcerer-font-of-magic" }],
        spellSlots: [{ level: 2, total: 3 }],
      },
      { spellSlots: { "2": { used: 1 } } }
    );
    load(doc);
    const command: MechanicsCommand = {
      kind: "resource-conversion",
      occurrenceId: "world-leg-1",
      characterId: doc.id,
      sourceId: "sorcerer-font-of-magic",
      conversionId: "font-creating-spell-slots",
      selection: { kind: "create-slot", via: "cost-table", slotLevel: 2 },
    };
    const prepared = prepareMechanicsCommand(liveDoc(), command);
    if (prepared.status !== "planned") throw new Error(prepared.reason);

    const result = useCharacterStore.getState().applyMechanicsPlan(prepared.plan);
    expect(result.status).toBe("applied");
    // Legacy CAS shapes stand (used:0 normalized away)…
    expect(liveDoc().session.spellSlots["2"]).toBeUndefined();
    expect(liveDoc().session.trackers["sorcerer-font-of-magic"]?.used).toBe(3);
    // …and the world cells moved with them in one committed action.
    expect(liveWorld().resources.standardSpellSlots["2"]).toMatchObject({ current: 3 });
    expect(liveWorld().resources.pools["sorcerer-font-of-magic"]).toMatchObject({
      current: 2,
    });
  });
});
