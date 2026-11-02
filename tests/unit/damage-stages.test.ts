/**
 * Stages of an incoming hit on the target's own sheet (edge-case family M4,
 * docs/architecture/2026-11-edge-cases.md), in RAW order: the hit's own scale
 * (Uncanny Dodge halves an attack's damage), then an absorbing pool (Arcane Ward),
 * then temporary Hit Points, then Hit Points.
 *
 * Corpus: "When hit" vs "when damaged" (Uncanny Dodge, SAC #59); Arcane Ward's place
 * in the pipeline (SAC #73).
 */
import { describe, expect, it } from "vitest";

import { sessionToCombatState } from "@/lib/combat-state";
import { concentrationValue } from "@/lib/concentration";
import { takeDamage } from "@/lib/play/damage";
import { peerDamageState } from "@/lib/play/peer-damage";
import type { CharacterDoc, CustomFeature, SessionState } from "@/types/character";

import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

const HIT = { hit: { attacker: null, attackMode: "melee" as const } };

function rogue(session: Partial<SessionState> = {}): CharacterDoc {
  const doc = makeCharacterDoc(
    { classId: "rogue", level: 5, features: [{ srdId: "rogue-uncanny-dodge" }] },
    { hp: { current: 40, temp: 0 }, ...session }
  );
  return { ...doc, character: { ...doc.character, hp: { max: 40 } } };
}

const DODGING = "rogue-uncanny-dodge";

describe("Uncanny Dodge halves an attack's damage (corpus: when hit vs when damaged)", () => {
  it("the claimed Reaction halves the next hit entered, rounding down, and is spent", () => {
    // The sheet's own HP entry doesn't say "attack": the Reaction was claimed on one.
    expect(takeDamage(rogue({ activeFeatures: [DODGING] }), 21)?.session.hp.current).toBe(
      30
    );
    const taken = takeDamage(rogue({ activeFeatures: [DODGING] }), 21, HIT);
    expect(taken?.session.hp.current).toBe(30);
    expect(taken?.session.activeFeatures ?? []).not.toContain(DODGING);
  });

  it("damage that is not an attack's hit (a fall) is not halved, and the Reaction stays", () => {
    const taken = takeDamage(rogue({ activeFeatures: [DODGING] }), 21, {
      notAnAttack: true,
    });
    expect(taken?.session.hp.current).toBe(19);
    expect(taken?.session.activeFeatures).toContain(DODGING);
  });

  it("without the Reaction claimed, a hit lands in full", () => {
    expect(takeDamage(rogue(), 21, HIT)?.session.hp.current).toBe(19);
  });
});

/** A homebrew ward: a 15-point pool that takes damage first. */
function warded(session: Partial<SessionState> = {}): CharacterDoc {
  const feature: CustomFeature = {
    custom: true,
    title: "Ward",
    emoji: "*",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    trackers: [{ id: "ward", label: "Ward", total: "15", recovery: "long-rest" }],
    grants: [{ type: "damage-absorb-pool", trackerId: "ward" }],
    instanceId: customInstanceId("ward"),
  };
  const doc = makeCharacterDoc({}, { hp: { current: 30, temp: 5 }, ...session });
  return {
    ...doc,
    character: { ...doc.character, hp: { max: 30 }, features: [feature] },
  };
}

describe("an absorbing pool takes damage before temporary HP (corpus: Arcane Ward)", () => {
  it("a hit the ward can hold leaves HP and temporary HP where they were", () => {
    const taken = takeDamage(warded(), 10);
    expect(taken?.session.hp).toMatchObject({ current: 30, temp: 5 });
    expect(taken?.session.trackers.ward?.used).toBe(10);
  });

  it("what the ward can't hold goes to temporary HP, then HP", () => {
    const taken = takeDamage(warded(), 22);
    expect(taken?.session.trackers.ward?.used).toBe(15);
    expect(taken?.session.hp).toMatchObject({ current: 28, temp: 0 });
  });

  it("a spent ward holds nothing", () => {
    const taken = takeDamage(warded({ trackers: { ward: { used: 15 } } }), 10);
    expect(taken?.session.hp).toMatchObject({ current: 25, temp: 0 });
  });
});

describe("a Concentration save is owed on the damage taken, not on what a stage held", () => {
  it("a hit the ward absorbs entirely deals nothing", () => {
    expect(takeDamage(warded(), 10)?.dealt).toBe(0);
  });

  it("a hit that gets through deals what got through", () => {
    expect(takeDamage(warded(), 40)?.dealt).toBe(25);
  });
});

describe("a hit written from another device", () => {
  it("leaves the ward out: that device can't record the ward's use", () => {
    const doc = warded({ concentration: concentrationValue("bless") });
    const next = peerDamageState(
      doc,
      sessionToCombatState(doc.session),
      10,
      {},
      () => "s"
    );
    // 10 damage: 5 temporary, 5 HP, and a DC 10 save, as before the ward rule.
    expect(next.hp).toEqual({ current: 25, temp: 0 });
    expect(next.pendingConcentrationSaves?.[0]).toMatchObject({
      damage: 10,
      difficultyClass: 10,
    });
  });

  it("leaves a claimed Uncanny Dodge out too: it couldn't be spent", () => {
    const doc = rogue({ activeFeatures: [DODGING] });
    const next = peerDamageState(doc, sessionToCombatState(doc.session), 21);
    expect(next.hp.current).toBe(19);
  });
});
