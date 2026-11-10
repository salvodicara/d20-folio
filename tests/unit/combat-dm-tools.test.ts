/**
 * The DM's fight tools on the new fight screen (headless), from the classic encounter
 * cards: hide a creature for an ambush, show players a monster's exact Hit Points,
 * switch a creature between enemy and ally, reorder the turns. Each is a plan on the
 * fight that only the DM may make, with what its undo needs.
 */
import { describe, expect, it } from "vitest";

import {
  planCombatantHidden,
  planMonsterRevealed,
  planMonsterSide,
  planReorder,
  planRoll,
  type CombatPatch,
} from "@/features/campaigns/combat-lifecycle";
import { addMonster } from "@/features/campaigns/encounter";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const member = (characterId: string | null) => ({
  displayName: "x",
  role: "player",
  characterId,
  character: characterId ? { name: characterId } : null,
});

/** A DM and one player, a fight running with two raiders (frozen order). */
function table(): CampaignDoc {
  let campaign = {
    id: "camp",
    dmUid: "dm",
    memberDetails: { dm: member(null), ana: member("char-ana") },
    encounterInit: {},
  } as unknown as CampaignDoc;
  const rolled = planRoll(campaign, { uid: "ana", roll: 15, bonuses: {}, now: 1 });
  campaign = { ...campaign, ...rolled?.patch };
  const fight = addMonster(campaign.encounter as EncounterState, {
    name: "Ash Raider",
    ac: 13,
    maxHp: 11,
    count: 2,
    initiative: 17,
  });
  return { ...campaign, encounter: fight };
}

const fight = (patch: CombatPatch | null | undefined): EncounterState => {
  if (!patch?.encounter) throw new Error("expected a move");
  return patch.encounter;
};
const raiders = (campaign: CampaignDoc) =>
  (campaign.encounter?.combatants ?? [])
    .filter((c) => c.kind === "monster")
    .map((c) => c.id);

describe("hide and reveal", () => {
  it("the DM hides a raider; a player cannot", () => {
    const campaign = table();
    const [raider] = raiders(campaign);
    if (!raider) throw new Error("no raider");
    const hidden = fight(
      planCombatantHidden(campaign, { uid: "dm", id: raider, hidden: true })
    );
    expect(hidden.combatants.find((c) => c.id === raider)?.hidden).toBe(true);
    expect(
      planCombatantHidden(campaign, { uid: "ana", id: raider, hidden: true })
    ).toBeNull();
  });

  it("no change, no move", () => {
    const campaign = table();
    const [raider] = raiders(campaign);
    if (!raider) throw new Error("no raider");
    expect(
      planCombatantHidden(campaign, { uid: "dm", id: raider, hidden: false })
    ).toBeNull();
  });

  it("revealing a monster's Hit Points; a hero has nothing to reveal", () => {
    const campaign = table();
    const [raider] = raiders(campaign);
    if (!raider) throw new Error("no raider");
    const shown = fight(
      planMonsterRevealed(campaign, { uid: "dm", monsterId: raider, revealed: true })
    );
    const monster = shown.combatants.find((c) => c.id === raider);
    expect(monster?.kind === "monster" && monster.revealed).toBe(true);
    expect(
      planMonsterRevealed(campaign, { uid: "dm", monsterId: "pc-ana", revealed: true })
    ).toBeNull();
  });
});

describe("ally or enemy", () => {
  it("a raider turns ally, and the undo knows it was an enemy", () => {
    const campaign = table();
    const [raider] = raiders(campaign);
    if (!raider) throw new Error("no raider");
    const plan = planMonsterSide(campaign, {
      uid: "dm",
      monsterId: raider,
      side: "ally",
    });
    expect(plan?.previous).toBe("enemy");
    const monster = fight(plan?.patch).combatants.find((c) => c.id === raider);
    expect(monster?.kind === "monster" && monster.side).toBe("ally");
    expect(
      planMonsterSide(campaign, { uid: "dm", monsterId: raider, side: "enemy" })
    ).toBeNull();
  });
});

describe("reorder", () => {
  it("the DM moves Ana before the raiders; the undo puts her back before whoever followed", () => {
    const campaign = table();
    const order = campaign.encounter?.order ?? [];
    expect(order[order.length - 1]).toBe("pc-ana");
    const first = order[0] ?? null;
    const plan = planReorder(campaign, { uid: "dm", id: "pc-ana", beforeId: first });
    expect(fight(plan?.patch).order?.[0]).toBe("pc-ana");
    expect(plan?.previousBefore).toBeNull();
    expect(
      planReorder(campaign, { uid: "ana", id: "pc-ana", beforeId: first })
    ).toBeNull();
  });
});
