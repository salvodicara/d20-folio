/**
 * The character-vitals projection — the SECOND sheet read of the persisted
 * engine world (`session.world`), covering the core vital facts (hp/temp,
 * death track, exhaustion, concentration, conditions, slot usage, pool usage).
 *
 * Pins THE DRIFT LAW at the seam: world-and-session agreement surfaces the
 * (identical) value; a legacy-only spend (session ahead of a stale world)
 * surfaces SESSION truth; a corrupt or absent world authenticates nothing and
 * falls back to the session per fact. An ENGINE-DERIVED world (the exact
 * `characterWorldState` derivation the store runs) agrees with its source
 * session on every fact by construction — the observable-noop guarantee of
 * the read migration.
 *
 * Also pins one representative consumer per family: the tracker resolver's
 * row `used` (the rail's pool remaining) and the Spells-tab slot summary
 * (`buildSpellsViewModel`) surface session truth under a mocked divergence.
 */

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { describe, expect, it, vi } from "vitest";

import {
  characterVitals,
  vitalConcentration,
  vitalConditions,
  vitalDeathSaves,
  vitalExhaustion,
  vitalHp,
  vitalSlotUsed,
  vitalTrackerUsed,
} from "@/lib/character-vitals";
import { concentrationValue } from "@/lib/concentration";
import { characterTrackerSeeds, characterWorldState } from "@/lib/mechanics-world-store";
import { resolveTrackers } from "@/lib/smart-tracker";
import { buildSpellsViewModel } from "@/lib/views/spells-view";
import type { CharacterDoc } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";
import { customInstanceId } from "./__helpers__/custom-items";

const UID = "test-uid";

/** A raw persisted-world fragment claiming the given vital values. */
function rawWorld(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    vitals: {
      hitPoints: { current: 30, temporary: { current: 9, sourceOccurrence: null } },
      zeroHitPoints: null,
    },
    exhaustion: 0,
    occurrences: {},
    resources: {
      pools: {},
      standardSpellSlots: {},
      pactSpellSlot: null,
    },
    ...over,
  };
}

/** A raw world holding a LIVE engine concentration on the given spell. */
function concentrationWorld(spellId: string): Record<string, unknown> {
  return rawWorld({
    occurrences: {
      "conc-1": {
        kind: "concentration",
        ending: null,
        origin: {
          root: { occurrence: { occurrenceId: "root-1" }, ordinal: 1 },
        },
      },
      "root-1": {
        kind: "program",
        ending: null,
        authority: {
          snapshot: {
            ref: {
              definition: {
                kind: "catalogue",
                catalogueKind: "spell",
                entityId: spellId,
              },
            },
          },
        },
      },
    },
  });
}

/** A doc with slots, a pool, and lived-in session vitals. */
function vitalsDoc(): CharacterDoc {
  const doc = makeCharacterDoc(
    {
      classId: "wizard",
      level: 5,
      spellSlots: [{ level: 1, total: 3 }],
      features: [
        {
          custom: true,
          title: "Test Pool",
          emoji: "*",
          source: "test",
          tags: [],
          contentBlocks: [],
          trackers: [
            { id: "test-pool", label: "Test Pool", total: "3", recovery: "long-rest" },
          ],
          instanceId: customInstanceId("Test Pool"),
        },
      ],
    },
    {
      hp: { current: 10, temp: 3 },
      spellSlots: { "1": { used: 1 } },
      trackers: { "test-pool": { used: 1 } },
      exhaustion: 2,
      conditions: ["prone"],
    }
  );
  return doc;
}

describe("character-vitals — absent / corrupt world (per-fact fallback)", () => {
  const session = vitalsDoc().session;

  it("surfaces the session facts when no world is persisted", () => {
    const bag = characterVitals(session);
    expect(bag.hp).toEqual({ current: 10, temp: 3 });
    expect(bag.death).toEqual({ successes: 0, failures: 0 });
    expect(bag.exhaustion).toBe(2);
    expect(bag.concentration).toBe("");
    expect(bag.conditions).toBe(session.conditions);
    expect(vitalSlotUsed(session, { level: 1, total: 3 })).toBe(1);
    expect(vitalTrackerUsed(session, "test-pool")).toBe(1);
  });

  it("authenticates nothing from a malformed world", () => {
    const corrupt = { ...session, world: { vitals: "garbage", resources: 7 } };
    expect(vitalHp(corrupt)).toEqual({ current: 10, temp: 3 });
    expect(vitalExhaustion(corrupt)).toBe(2);
    expect(vitalConcentration(corrupt)).toBe("");
    expect(vitalSlotUsed(corrupt, { level: 1, total: 3 })).toBe(1);
    expect(vitalTrackerUsed(corrupt, "test-pool")).toBe(1);
    expect(vitalDeathSaves({ ...corrupt, deathSucc: 1, deathFail: 2 })).toEqual({
      successes: 1,
      failures: 2,
    });
  });
});

describe("character-vitals — legacy-only spend (session ahead → session wins)", () => {
  it("hp: a stale world's higher hit points never resurrect", () => {
    const session = { hp: { current: 12, temp: 0 }, world: rawWorld() };
    expect(vitalHp(session)).toEqual({ current: 12, temp: 0 });
  });

  it("death track: session marks win over a diverging dying state", () => {
    const session = {
      deathSucc: 0,
      deathFail: 2,
      world: rawWorld({
        vitals: {
          hitPoints: { current: 0, temporary: { current: 0, sourceOccurrence: null } },
          zeroHitPoints: { kind: "dying", failures: 1, successes: 1 },
        },
      }),
    };
    expect(vitalDeathSaves(session)).toEqual({ successes: 0, failures: 2 });
  });

  it("death track: stable/dead states carry no counts — session is sole truth", () => {
    const session = {
      deathSucc: 3,
      deathFail: 1,
      world: rawWorld({
        vitals: {
          hitPoints: { current: 0, temporary: { current: 0, sourceOccurrence: null } },
          zeroHitPoints: { kind: "stable" },
        },
      }),
    };
    expect(vitalDeathSaves(session)).toEqual({ successes: 3, failures: 1 });
  });

  it("exhaustion: a legacy stepper edit wins over the stale world level", () => {
    expect(vitalExhaustion({ exhaustion: 3, world: rawWorld({ exhaustion: 1 }) })).toBe(
      3
    );
  });

  it("concentration: a legacy clear wins over a live engine occurrence", () => {
    const session = { concentration: "" as const, world: concentrationWorld("shield") };
    expect(vitalConcentration(session)).toBe("");
  });

  it("slots: a legacy pip tap's extra spend wins over the stale world cell", () => {
    const session = {
      spellSlots: { "1": { used: 2 } },
      world: rawWorld({
        resources: {
          pools: {},
          standardSpellSlots: { "1": { kind: "count", current: 2 } },
          pactSpellSlot: null,
        },
      }),
    };
    // World claims 2 remaining of 3 (1 used); the legacy spend says 2 used.
    expect(vitalSlotUsed(session, { level: 1, total: 3 })).toBe(2);
  });

  it("pools: a legacy tracker spend wins over the stale world pool", () => {
    const session = {
      trackers: { "test-pool": { used: 2 } },
      world: rawWorld({
        resources: {
          pools: {
            "test-pool": {
              kind: "count",
              current: 2,
              capacity: { base: { kind: "derived", value: 3 }, override: null },
              disabled: false,
            },
          },
          standardSpellSlots: {},
          pactSpellSlot: null,
        },
      }),
    };
    expect(vitalTrackerUsed(session, "test-pool")).toBe(2);
  });

  it("conditions: the session ledger is surfaced verbatim, by identity", () => {
    const session = { conditions: ["prone"], world: rawWorld() };
    expect(vitalConditions(session)).toBe(session.conditions);
  });
});

describe("character-vitals — engine-derived world (agreement is the norm)", () => {
  it("a world derived from the session agrees with it on every fact", () => {
    const doc = vitalsDoc();
    const world = characterWorldState(doc, UID, 44, {}, characterTrackerSeeds(doc));
    expect(world).not.toBeNull();
    const session = { ...doc.session, world };
    expect(vitalHp(session)).toEqual({ current: 10, temp: 3 });
    expect(vitalDeathSaves(session)).toEqual({ successes: 0, failures: 0 });
    expect(vitalExhaustion(session)).toBe(2);
    expect(vitalConcentration(session)).toBe("");
    expect(vitalSlotUsed(session, { level: 1, total: 3 })).toBe(1);
    expect(vitalTrackerUsed(session, "test-pool")).toBe(1);
  });

  it("an agreeing engine concentration surfaces the shared value", () => {
    const stored = concentrationValue("shield");
    const session = { concentration: stored, world: concentrationWorld("shield") };
    expect(vitalConcentration(session)).toBe(stored);
  });
});

describe("character-vitals — consumer pins (session truth surfaces)", () => {
  it("rail pool family: the resolved tracker row's used reads session truth", () => {
    const doc = vitalsDoc();
    doc.session = {
      ...doc.session,
      trackers: { "test-pool": { used: 2 } },
      world: rawWorld({
        resources: {
          pools: {
            "test-pool": {
              kind: "count",
              current: 3,
              capacity: { base: { kind: "derived", value: 3 }, override: null },
              disabled: false,
            },
          },
          standardSpellSlots: {},
          pactSpellSlot: null,
        },
      }),
    };
    const row = resolveTrackers(doc).find((tracker) => tracker.id === "test-pool");
    expect(row).toBeDefined();
    // World claims a full pool (0 used); the legacy spend of 2 must surface.
    expect(row?.used).toBe(2);
    expect((row?.total ?? 0) - (row?.used ?? 0)).toBe(1);
  });

  it("spells slot family: the Spells-tab slot summary reads session truth", () => {
    const doc = vitalsDoc();
    doc.session = {
      ...doc.session,
      spellSlots: { "1": { used: 2 } },
      world: rawWorld({
        resources: {
          pools: {},
          standardSpellSlots: { "1": { kind: "count", current: 3 } },
          pactSpellSlot: null,
        },
      }),
    };
    const vm = buildSpellsViewModel(doc, "wizard", "en", false);
    const row = vm.slots.find((slot) => slot.level === 1 && !slot.pactMagic);
    // World claims all 3 remaining; the legacy spend of 2 leaves 1.
    expect(row?.remaining).toBe(1);
  });
});
