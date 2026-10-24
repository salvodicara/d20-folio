/**
 * `granted-action` gets its consumer: every declared granted action becomes an
 * Activity, in the catalogue and for one character. Cases come from the data
 * that declares them (the Hunter's options in src/data/classes/ranger.ts, the
 * learned-maneuver seam in resolve-grant-sources.ts) and their catalogue text:
 *  - Horde Breaker: "Once on each of your turns when you make an attack with a
 *    weapon, you can make another attack…" → free, once per turn, only while
 *    Hunter's Prey's chosen option is Horde Breaker;
 *  - Multiattack Defense: "When a creature hits you with an attack roll…" →
 *    free, only with that Defensive Tactics option;
 *  - Superior Hunter's Defense already has its Reaction row
 *    (`mechanics.actions`), so its granted action adds no second Activity;
 *  - a learned maneuver: its slot, one Superiority Die, the save it forces.
 */
import { describe, expect, it } from "vitest";
import enFeatures from "@/i18n/en/srd/class-features.json";
import { catalogueActivities, catalogueGrantedActions } from "@/lib/activities/catalogue";
import { activityFromGrantedAction, grantedActionActivities } from "@/lib/activities";
import { evaluateGrants } from "@/lib/grants";
import { resolveGrantSourcesForManeuvers } from "@/lib/resolve-grant-sources";
import { SRD_MANEUVERS } from "@/data/maneuvers";

const text = (key: string) =>
  (enFeatures as Record<string, { description?: string; trigger?: string }>)[key];

describe("granted-action — the catalogue text the cases come from", () => {
  it("Horde Breaker is once on each of your turns", () => {
    expect(
      text(
        "ranger-hunter-hunters-prey.grants.0.options.horde-breaker.grants.horde-breaker"
      )?.description
    ).toMatch(/^Once on each of your turns/);
  });
  it("Multiattack Defense triggers when a creature hits you", () => {
    expect(text("ranger-hunter-defensive-tactics")?.description).toContain(
      "Multiattack Defense: when a creature hits you with an attack roll"
    );
  });
});

describe("granted-action — catalogue Activities", () => {
  const byId = new Map(
    catalogueGrantedActions().map((entry) => [entry.activity.id, entry.activity])
  );

  it("Horde Breaker: free, once per turn, only with its Hunter's Prey option", () => {
    expect(byId.get("granted-action:ranger-hunter-hunters-prey:horde-breaker")).toEqual({
      id: "granted-action:ranger-hunter-hunters-prey:horde-breaker",
      source: {
        kind: "granted-action",
        sourceId: "ranger-hunter-hunters-prey",
        actionId: "horde-breaker",
      },
      cost: { economy: "free", maxUsesPerTurn: 1 },
      requires: {
        bundleOption: { bundleKey: "ranger-hunter-prey", optionId: "horde-breaker" },
      },
      effects: [],
    });
  });

  it("Multiattack Defense: free, triggered by a hit, only with its option", () => {
    expect(
      byId.get("granted-action:ranger-hunter-defensive-tactics:multiattack-defense")
    ).toMatchObject({
      cost: { economy: "free", trigger: "hitByAttack" },
      requires: {
        bundleOption: {
          bundleKey: "ranger-hunter-defensive-tactics",
          optionId: "multiattack-defense",
        },
      },
    });
  });

  it("Superior Hunter's Defense keeps its one Reaction row (no duplicate)", () => {
    expect(
      [...byId.keys()].filter((id) => id.includes("superior-hunters-defense"))
    ).toEqual([]);
  });

  it("joins catalogueActivities with unique ids", async () => {
    const all = new Set((await catalogueActivities()).map(({ activity }) => activity.id));
    for (const id of byId.keys()) expect(all.has(id), id).toBe(true);
  });
});

describe("granted-action — a learned maneuver as an Activity", () => {
  // The grant `resolveGrantSourcesForManeuvers` builds for a learned Trip Attack
  // (the roster itself is pack content): one Superiority Die, a STR save.
  const trip = {
    type: "granted-action" as const,
    slot: "free" as const,
    cost: {
      kind: "tracker" as const,
      trackerId: "fighter-battle-master-combat-superiority",
      amount: 1,
    },
    saveAbility: "STR" as const,
  };

  it("spends one Superiority Die in the maneuver's slot and forces its save", () => {
    expect(activityFromGrantedAction(trip, "trip-attack").activity).toEqual({
      id: "granted-action:trip-attack:free",
      source: { kind: "granted-action", sourceId: "trip-attack", actionId: "free" },
      cost: {
        economy: "free",
        pay: [
          {
            kind: "tracker",
            trackerId: "fighter-battle-master-combat-superiority",
            amount: 1,
          },
        ],
      },
      save: { ability: "STR" },
      effects: [],
    });
  });

  it("every learned maneuver the seam resolves becomes a catalogue Activity", () => {
    const ids = new Set(catalogueGrantedActions().map(({ activity }) => activity.id));
    for (const source of resolveGrantSourcesForManeuvers(
      SRD_MANEUVERS.map((maneuver) => maneuver.id)
    )) {
      const slot =
        source.grants?.[0]?.type === "granted-action" ? source.grants[0].slot : "";
      expect(ids.has(`granted-action:${source.id}:${slot}`), source.id).toBe(true);
    }
  });
});

describe("granted-action — one character's Activities", () => {
  it("every aggregated granted action becomes an Activity of its source", () => {
    const aggregate = evaluateGrants([
      {
        id: "homebrew-parry",
        name: { en: "Parry", it: "Parata" },
        grants: [
          {
            type: "granted-action",
            id: "parry",
            slot: "reaction",
            reactionTrigger: "meleeAttackDamagesYou",
            cost: { kind: "tracker", trackerId: "homebrew-dice" },
          },
        ],
      },
    ]);
    expect(grantedActionActivities(aggregate.grantedActions)).toEqual([
      {
        id: "granted-action:homebrew-parry:parry",
        source: { kind: "granted-action", sourceId: "homebrew-parry", actionId: "parry" },
        cost: {
          economy: "reaction",
          trigger: "meleeAttackDamagesYou",
          pay: [{ kind: "tracker", trackerId: "homebrew-dice" }],
        },
        effects: [],
      },
    ]);
  });

  it("no granted action, no Activity", () => {
    expect(grantedActionActivities(evaluateGrants([]).grantedActions)).toEqual([]);
  });
});
