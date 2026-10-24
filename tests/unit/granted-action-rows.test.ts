/**
 * A character's granted actions become action rows on the board, like every
 * other activity. Cases come from the data that declares them
 * (src/data/classes/ranger.ts) and its catalogue text:
 *  - Hunter's Prey: "You gain one of the following feature options of your
 *    choice" — Colossus Slayer is a weapon damage rider, Horde Breaker ("Once
 *    on each of your turns when you make an attack with a weapon, you can make
 *    another attack…") a free, once-per-turn row, present only while chosen;
 *  - Defensive Tactics → Multiattack Defense: "when a creature hits you with an
 *    attack roll" → a free row triggered by the hit;
 *  - Superior Hunter's Defense already has its Reaction row, so its granted
 *    action adds no second one;
 *  - a homebrew granted action keeps its own name, trigger and tracker cost.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants } from "@/lib/grants";
import { grantedActionRows, resolveActions } from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";
import { loc } from "../_harness/loc";
import { makeCharacterDoc } from "./_helpers";

const HORDE_BREAKER = "granted-action:ranger-hunter-hunters-prey:horde-breaker";
const MULTIATTACK_DEFENSE =
  "granted-action:ranger-hunter-defensive-tactics:multiattack-defense";

function hunter(level: number, choices: Record<string, string>): CharacterDoc {
  return makeCharacterDoc(
    {
      classId: "ranger",
      subclassId: "hunter",
      level,
      features: [
        { srdId: "ranger-hunter-hunters-prey" },
        ...(level >= 7 ? [{ srdId: "ranger-hunter-defensive-tactics" }] : []),
        ...(level >= 15 ? [{ srdId: "ranger-hunter-superior-hunters-defense" }] : []),
      ],
      weapons: [{ srdId: "longsword", quantity: 1 }],
    },
    { grantBundleChoices: choices }
  );
}

const ids = (doc: CharacterDoc) => resolveActions(doc).map((a) => a.id);

describe("granted actions on the board — the Hunter", () => {
  it("Horde Breaker chosen: a free row, once per turn, named for the option", () => {
    const row = resolveActions(hunter(3, { "ranger-hunter-prey": "horde-breaker" })).find(
      (a) => a.id === HORDE_BREAKER
    );
    expect(row).toMatchObject({
      type: "free",
      source: "feature",
      maxUsesPerTurn: 1,
      costsSlot: false,
    });
    expect(row?.costTracker).toBeUndefined();
    expect(loc(row?.name, "en")).toBe("Horde Breaker");
    expect(loc(row?.name, "it")).toBe("Spezzatore di Orde");
    expect(loc(row?.summary.effect, "en")).toMatch(/^Once on each of your turns/);
  });

  it("Colossus Slayer chosen: no Horde Breaker row", () => {
    expect(ids(hunter(3, { "ranger-hunter-prey": "colossus-slayer" }))).not.toContain(
      HORDE_BREAKER
    );
  });

  it("nothing chosen yet: no Horde Breaker row", () => {
    expect(ids(hunter(3, {}))).not.toContain(HORDE_BREAKER);
  });

  it("Multiattack Defense: a free row with its hit trigger", () => {
    const row = resolveActions(
      hunter(7, {
        "ranger-hunter-prey": "colossus-slayer",
        "ranger-hunter-defensive-tactics": "multiattack-defense",
      })
    ).find((a) => a.id === MULTIATTACK_DEFENSE);
    expect(row?.type).toBe("free");
    expect(row?.summary.trigger).toEqual({ ui: "combat.reactionTrigger_hitByAttack" });
  });

  it("Superior Hunter's Defense keeps one Reaction row", () => {
    const rows = ids(
      hunter(15, {
        "ranger-hunter-prey": "colossus-slayer",
        "ranger-hunter-defensive-tactics": "escape-the-horde",
      })
    ).filter((id) => id.includes("superior-hunters-defense"));
    expect(rows).toEqual(["ranger-hunter-superior-hunters-defense-reaction"]);
  });
});

describe("granted actions on the board — homebrew", () => {
  const aggregate = evaluateGrants([
    {
      id: "homebrew-parry",
      grants: [
        {
          type: "granted-action",
          id: "parry",
          name: { en: "Parry", it: "Parata" },
          description: { en: "Reduce the damage.", it: "Riduci il danno." },
          slot: "reaction",
          reactionTrigger: "meleeAttackDamagesYou",
          cost: { kind: "tracker", trackerId: "homebrew-dice", amount: 2 },
        },
      ],
    },
  ]);

  it("keeps its own name, trigger and tracker cost", () => {
    const doc = makeCharacterDoc(
      {},
      { pinnedActions: ["granted-action:homebrew-parry:parry"] }
    );
    const [row] = grantedActionRows(doc, aggregate.grantedActions);
    expect(row).toMatchObject({
      id: "granted-action:homebrew-parry:parry",
      type: "reaction",
      source: "feature",
      costTracker: "homebrew-dice",
      trackerCost: 2,
      pinned: true,
      defaultPinned: false,
    });
    expect(loc(row?.name, "it")).toBe("Parata");
    expect(loc(row?.description, "en")).toBe("Reduce the damage.");
    expect(row?.summary.trigger).toEqual({
      ui: "combat.reactionTrigger_meleeAttackDamagesYou",
    });
    expect(row?.summary.saveDC).toBeUndefined();
  });
});
