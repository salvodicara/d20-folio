/**
 * The campaign's effects out of a fight (`campaigns/{id}/effects`): a buff that lasts
 * on the game clock (Mage Armor on Bren, 8 hours) is live while the campaign clock is
 * before its end, for its target only, and one held by Concentration ends with it. At
 * a fight's end, the actor's effects that outlast it move there with their identity
 * and what is left of their duration.
 */
import { describe, expect, it } from "vitest";
import {
  campaignEffectsFor,
  concentrationChange,
  concentrationLinkedIds,
  outlastingFightEffects,
  type CampaignEffectDoc,
  withCampaignEffects,
} from "@/lib/play/campaign-effects";
import type {
  ActiveCombatEffect,
  CombatantRef,
  CombatEffectOp,
} from "@/types/combat-effect";

const me: CombatantRef = {
  kind: "pc",
  combatantId: "pc-u1",
  memberUid: "u1",
  characterId: "c-me",
};
const bren: CombatantRef = {
  kind: "pc",
  combatantId: "pc-u2",
  memberUid: "u2",
  characterId: "c-bren",
};

function effect(
  id: string,
  duration: ActiveCombatEffect["duration"],
  overrides: Partial<ActiveCombatEffect> = {}
): ActiveCombatEffect {
  return {
    id,
    actor: me,
    target: bren,
    source: { kind: "spell", id: "mage-armor", actionId: "spell-mage-armor" },
    payload: { kind: "grant-group", activeKey: "spell-mage-armor" },
    duration,
    ...overrides,
  };
}

const onClock = (
  id: string,
  untilMinute: number,
  extra: Partial<CampaignEffectDoc> = {}
) =>
  ({ ...effect(id, { kind: "game-clock", untilMinute }), ...extra }) as CampaignEffectDoc;

describe("which campaign effects are live on a creature", () => {
  it("live before its end minute, for its target only", () => {
    const docs = [onClock("a", 480)];
    expect(campaignEffectsFor(docs, "pc-u2", 479).map((e) => e.id)).toEqual(["a"]);
    expect(campaignEffectsFor(docs, "pc-u2", 480)).toEqual([]);
    expect(campaignEffectsFor(docs, "pc-u1", 0)).toEqual([]);
  });

  it("an ended one is not live", () => {
    expect(
      campaignEffectsFor([onClock("a", 480, { ended: "concentration" })], "pc-u2", 0)
    ).toEqual([]);
  });
});

describe("the Concentration link", () => {
  it("names the live effects a caster's Concentration on a spell holds", () => {
    const held = {
      ...effect("a", {
        kind: "game-clock",
        untilMinute: 60,
        concentration: { actorId: "pc-u1", sourceId: "bless" },
      }),
    };
    const other = onClock("b", 60);
    expect(concentrationLinkedIds([held, other], "pc-u1", "bless")).toEqual(["a"]);
    expect(concentrationLinkedIds([held], "pc-u1", "haste")).toEqual([]);
    expect(
      concentrationLinkedIds([{ ...held, ended: "revoked" }], "pc-u1", "bless")
    ).toEqual([]);
  });
});

describe("a fight's end: what outlasts it moves to the campaign", () => {
  const apply = (e: ActiveCombatEffect): CombatEffectOp => ({
    id: `op-${e.id}`,
    kind: "apply",
    effect: e,
  });
  const position = {
    round: 3,
    currentCombatantId: "pc-u1",
    phase: "turn-start" as const,
    order: ["pc-u1", "pc-u2"],
  };

  it("a countdown keeps its identity and what is left of it on the clock", () => {
    // Mage Armor lit in round 1 for 4800 rounds: 4798 left at round 3, 479 whole minutes.
    const armor = effect("armor", {
      kind: "turn-boundary",
      combatantId: "pc-u1",
      round: 4801,
      phase: "turn-end",
    });
    const moved = outlastingFightEffects([apply(armor)], position, {
      actorId: "pc-u1",
      minute: 100,
      concentrationRoundsLeft: () => undefined,
    });
    expect(moved).toEqual([
      { ...armor, duration: { kind: "game-clock", untilMinute: 100 + 479 } },
    ]);
  });

  it("a Concentration effect keeps its link and the caster's own countdown", () => {
    const bless = effect(
      "bless",
      { kind: "concentration", actorId: "pc-u1", sourceId: "bless" },
      {
        source: { kind: "spell", id: "bless", actionId: "spell-bless" },
      }
    );
    const moved = outlastingFightEffects([apply(bless)], position, {
      actorId: "pc-u1",
      minute: 10,
      concentrationRoundsLeft: (sourceId) => (sourceId === "bless" ? 95 : undefined),
    });
    expect(moved[0]?.duration).toEqual({
      kind: "game-clock",
      untilMinute: 19,
      concentration: { actorId: "pc-u1", sourceId: "bless" },
    });
  });

  it("what ends with the fight, under a minute left, or another's effect stays", () => {
    const fightOnly = effect("enc", { kind: "encounter" });
    const shortEdge = effect("edge", {
      kind: "turn-boundary",
      combatantId: "pc-u1",
      round: 4,
      phase: "turn-start",
    });
    const theirs = effect(
      "theirs",
      { kind: "turn-boundary", combatantId: "pc-u2", round: 900, phase: "turn-end" },
      { actor: bren, target: me }
    );
    const noBudget = effect("conc", {
      kind: "concentration",
      actorId: "pc-u1",
      sourceId: "x",
    });
    expect(
      outlastingFightEffects(
        [apply(fightOnly), apply(shortEdge), apply(theirs), apply(noBudget)],
        position,
        {
          actorId: "pc-u1",
          minute: 0,
          concentrationRoundsLeft: () => undefined,
        }
      )
    ).toEqual([]);
  });

  it("a zone, or a state that changed hit points, stays with its fight", () => {
    const long = {
      kind: "turn-boundary" as const,
      combatantId: "pc-u1",
      round: 4801,
      phase: "turn-end" as const,
    };
    const zone = effect("zone", long, { payload: { kind: "zone", spellId: "moonbeam" } });
    const aid = effect("aid", long, { applied: { currentHpDelta: 5 } });
    expect(
      outlastingFightEffects([apply(zone), apply(aid)], position, {
        actorId: "pc-u1",
        minute: 0,
        concentrationRoundsLeft: () => undefined,
      })
    ).toEqual([]);
  });

  it("a revoked effect does not move", () => {
    const armor = effect("armor", {
      kind: "turn-boundary",
      combatantId: "pc-u1",
      round: 4801,
      phase: "turn-end",
    });
    const ops: CombatEffectOp[] = [
      apply(armor),
      { id: "r", kind: "revoke", effectId: "armor", actorId: "pc-u1", targetId: "pc-u2" },
    ];
    expect(
      outlastingFightEffects(ops, position, {
        actorId: "pc-u1",
        minute: 0,
        concentrationRoundsLeft: () => undefined,
      })
    ).toEqual([]);
  });
});

describe("Concentration out of a fight ends what it holds, and its undo brings it back", () => {
  const held = (id: string, sourceId: string): CampaignEffectDoc =>
    effect(id, {
      kind: "game-clock",
      untilMinute: 60,
      concentration: { actorId: "pc-u1", sourceId },
    });
  const docs = [held("b1", "bless"), held("b2", "bless"), held("h1", "haste")];

  it("the first look only records it", () => {
    expect(concentrationChange(null, "bless", docs, "pc-u1")).toEqual({
      end: [],
      reinstate: [],
      memo: { holding: "bless", ended: null },
    });
  });

  it("dropped: Bless's effects end; the undo brings them back", () => {
    const dropped = concentrationChange(
      { holding: "bless", ended: null },
      "",
      docs,
      "pc-u1"
    );
    expect(dropped.end).toEqual(["b1", "b2"]);
    const undone = concentrationChange(dropped.memo, "bless", docs, "pc-u1");
    expect(undone.reinstate).toEqual(["b1", "b2"]);
    expect(undone.end).toEqual([]);
    expect(undone.memo).toEqual({ holding: "bless", ended: null });
  });

  it("another Concentration spell cast: the old one's effects end, the new one is tracked", () => {
    const swapped = concentrationChange(
      { holding: "bless", ended: null },
      "haste",
      docs,
      "pc-u1"
    );
    expect(swapped.end).toEqual(["b1", "b2"]);
    expect(swapped.memo.holding).toBe("haste");
    // Undoing the cast: Haste's effects end, Bless's come back.
    const undone = concentrationChange(swapped.memo, "bless", docs, "pc-u1");
    expect(undone).toMatchObject({ end: ["h1"], reinstate: ["b1", "b2"] });
  });
});

describe("one identity across the fight and the store", () => {
  it("the store's effects join the fight's, never twice", () => {
    const a = onClock("a", 60);
    const b = onClock("b", 60);
    expect(withCampaignEffects([a], [a, b]).map((e) => e.id)).toEqual(["a", "b"]);
  });
});
