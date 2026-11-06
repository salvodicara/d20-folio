/**
 * Armor of Agathys: "If a creature hits you with a melee attack roll while you have
 * any of these Temporary Hit Points, the creature takes 5 Cold damage" (+5 per slot
 * level above 1). The damage rule resolves the retaliation (`retaliations`) from the
 * hit's attacker; the DM's monster actions, which know the attacker and can write its
 * Hit Points, hand the hit in and land the retaliation on the monster. Its consumer
 * went with the declared-effect appliers (633a9d669), like Warding Bond's share.
 */
import { describe, expect, it } from "vitest";

import {
  addMonster,
  beginEncounterTurns,
  startEncounter,
} from "@/features/campaigns/encounter";
import { landRetaliations } from "@/features/campaigns/encounter-world-command";
import { defaultCombatState } from "@/lib/combat-state";
import { MOCK_CHARACTER } from "@/lib/mock";
import { monsterLandingHit } from "@/lib/play/monster-action";
import { effectiveDoc } from "@/lib/play/effective-doc";
import { peerHit } from "@/lib/play/peer-damage";
import type { ActiveCombatEffect } from "@/types/combat-effect";

const me = {
  kind: "pc" as const,
  combatantId: "pc-me",
  memberUid: "me",
  characterId: MOCK_CHARACTER.id,
};

const agathys: ActiveCombatEffect = {
  id: "aoa-1",
  actor: me,
  target: me,
  source: {
    kind: "spell",
    id: "armor-of-agathys",
    actionId: "spell-armor-of-agathys",
    castLevel: 1,
  },
  payload: { kind: "grant-group", activeKey: "spell-armor-of-agathys" },
  duration: { kind: "encounter" },
};

const warlock = () => effectiveDoc(structuredClone(MOCK_CHARACTER), [agathys]);
const shielded = { ...defaultCombatState(62), hp: { current: 40, temp: 5 } };
const goblin = { kind: "monster" as const, combatantId: "monster-1" };

describe("Armor of Agathys strikes back", () => {
  it("a melee hit while the Temporary Hit Points hold returns 5 Cold to the attacker", () => {
    const hit = peerHit(warlock(), shielded, [], 3, {
      hit: { attacker: goblin, attackMode: "melee" },
    });
    expect(hit.retaliations).toEqual([
      expect.objectContaining({ target: goblin, amount: 5, damageType: "cold" }),
    ]);
  });

  it("a ranged hit returns nothing", () => {
    const hit = peerHit(warlock(), shielded, [], 3, {
      hit: { attacker: goblin, attackMode: "ranged" },
    });
    expect(hit.retaliations).toEqual([]);
  });

  it("a monster's landing is a hit by that monster only on a hit", () => {
    const plan = { melee: true as const };
    expect(monsterLandingHit(plan, "monster-1", { outcome: "hit" })).toEqual({
      attacker: goblin,
      attackMode: "melee",
    });
    expect(
      monsterLandingHit(plan, "monster-1", { outcome: "critical" })?.attackMode
    ).toBe("melee");
    expect(monsterLandingHit({}, "monster-1", { outcome: "hit" })?.attackMode).toBe(
      "ranged"
    );
    expect(monsterLandingHit(plan, "monster-1", { outcome: "miss" })).toBeUndefined();
    expect(monsterLandingHit(plan, "monster-1", {})).toBeUndefined();
  });

  it("the retaliation lands on the monster's Hit Points", () => {
    let fight = startEncounter({}, [], 1_000);
    fight = addMonster(fight, {
      ac: 15,
      count: 1,
      initiative: 14,
      maxHp: 10,
      name: "Goblin",
    });
    fight = beginEncounterTurns(fight, ["monster-1"]);
    const after = landRetaliations(fight, "camp", [
      {
        actor: me,
        target: goblin,
        amount: 5,
        damageType: "cold",
        effectId: "aoa-1",
        sourceId: "armor-of-agathys",
      },
    ]);
    const hp = (state: typeof fight) =>
      state.combatants.find((c) => c.id === "monster-1" && c.kind === "monster");
    expect(hp(after)).toMatchObject({ hp: { current: 5 } });
  });
});
