/**
 * A zone played through the tray (edge-case M9): the caster's tap opens the zone
 * spell's tray on the creature; a budgeted zone counts what it dealt and ends at its
 * budget (Guardian of Faith: 60).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCampaignIo, writesSettled } from "./__helpers__/campaign-io-writes";

const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

beforeAll(loadCampaignIo);

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { applyTray } from "@/features/character/center/apply-tray";
import { useDamageTrayStore } from "@/features/character/center/damage-tray-store";
import { openZoneTray } from "@/features/character/center/zone-tray";
import { initialTrayRow, type DamageTrayPlan } from "@/lib/play/damage-tray";
import { activeZones } from "@/lib/zones";
import { useCharacterStore } from "@/stores/characterStore";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";
import { makeCharacterDoc } from "./_helpers";

const cleric = makeCharacterDoc({
  classId: "cleric",
  level: 5,
  spells: [{ srdId: "spirit-guardians", prepared: true }] as never,
  spellSlots: [{ level: 3, total: 2 }],
});

const zoneEffect: ActiveCombatEffect = {
  id: "zone-1",
  actor: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: cleric.id },
  target: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: cleric.id },
  source: { kind: "spell", id: "spirit-guardians", actionId: "cast", castLevel: 3 },
  payload: { kind: "zone", spellId: "spirit-guardians" },
  duration: { kind: "encounter" },
};
const zoneOp: CombatEffectOp = { id: "op-zone", kind: "apply", effect: zoneEffect };

beforeEach(() => {
  io.revokePersistentCombatEffect.mockClear();
  useDamageTrayStore.setState({ offer: null });
  useCharacterStore.setState({
    character: {
      ...cleric,
      session: {
        ...cleric.session,
        concentration: "spirit-guardians",
        activeFeatures: ["spell-spirit-guardians"],
      } as never,
    },
    readonly: false,
  });
  useCombatStatusStore.setState({
    status: {
      campaignId: "c1",
      myId: "pc-me",
      characterId: cleric.id,
      round: 2,
      encounter: { effectOps: [zoneOp] },
      view: { rows: [{ id: "goblin", kind: "monster", name: "Goblin" }] },
    } as never,
  });
});

describe("a zone through the tray", () => {
  it("the tap opens the zone spell's tray on that creature", () => {
    const [zone] = activeZones([zoneEffect]);
    if (!zone) throw new Error("no zone");
    expect(openZoneTray(zone, "goblin", "en")).toBe(true);
    const offer = useDamageTrayStore.getState().offer;
    expect(offer?.plan.targets).toEqual(["goblin"]);
    expect(offer?.zone).toEqual({ effectId: "zone-1" });
  });

  it("a budgeted zone counts its damage and ends at the budget", async () => {
    useCharacterStore.setState({
      character: {
        ...cleric,
        session: { ...cleric.session, zoneSpent: { "zone-1": 50 } },
      },
    });
    const plan = { effect: "damage", damageType: "radiant" } as DamageTrayPlan;
    applyTray(
      {
        characterId: cleric.id,
        actionName: "Guardian of Faith",
        source: { custom: "Guardian of Faith" },
        castLogId: null,
        actionId: "x",
        plan,
        zone: { effectId: "zone-1", budget: { max: 60 } },
      },
      [{ id: "goblin", name: "Goblin", kind: "monster" }],
      [initialTrayRow(plan, "goblin")],
      [20],
      ((k: string) => k) as never
    );
    expect(useCharacterStore.getState().character?.session.zoneSpent).toEqual({
      "zone-1": 60,
    });
    await writesSettled();
    expect(io.revokePersistentCombatEffect).toHaveBeenCalledWith("c1", "zone-1");
  });
});

describe("Guardian of Faith", () => {
  it("plays its 20 Radiant (DEX for half) through the tray, with its 60 budget", () => {
    const priest = makeCharacterDoc({
      classId: "cleric",
      level: 7,
      spells: [{ srdId: "guardian-of-faith", prepared: true }] as never,
      spellSlots: [{ level: 4, total: 1 }],
    });
    useCharacterStore.setState({ character: priest, readonly: false });
    useCombatStatusStore.setState({
      status: {
        campaignId: "c1",
        myId: "pc-me",
        characterId: priest.id,
        round: 2,
        encounter: { effectOps: [] },
        view: { rows: [{ id: "goblin", kind: "monster", name: "Goblin" }] },
      } as never,
    });
    const [zone] = activeZones([
      {
        ...zoneEffect,
        id: "guardian-1",
        actor: {
          kind: "pc",
          combatantId: "pc-me",
          memberUid: "me",
          characterId: priest.id,
        },
        source: {
          kind: "spell",
          id: "guardian-of-faith",
          actionId: "cast",
          castLevel: 4,
        },
        payload: { kind: "zone", spellId: "guardian-of-faith" },
      },
    ]);
    if (!zone) throw new Error("no Guardian zone");
    expect(zone.zone.triggers).toEqual(["enter", "start-turn"]);
    expect(openZoneTray(zone, "goblin", "en")).toBe(true);
    const offer = useDamageTrayStore.getState().offer;
    expect(offer?.plan).toMatchObject({
      effect: "damage",
      damageType: "radiant",
      save: { ability: "DEX", onSave: "half" },
    });
    expect(offer?.zone).toEqual({ effectId: "guardian-1", budget: { max: 60 } });
  });
});
