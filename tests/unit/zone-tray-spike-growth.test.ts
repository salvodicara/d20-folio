/**
 * Spike Growth's zone through the tray (the code-check of the live sheets,
 * 2026-11-12): «Entra nella zona» on a creature opens 2d4 Piercing, no save. The
 * spell resolves nothing on its cast (`resolveOnCast: false`) and has no recurring
 * row, so the zone plays its cast row as a repeat use; it used to do nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({}));

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { useDamageTrayStore } from "@/features/character/center/damage-tray-store";
import { openZoneTray } from "@/features/character/center/zone-tray";
import { activeZones } from "@/lib/zones";
import { useCharacterStore } from "@/stores/characterStore";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import { makeCharacterDoc } from "./_helpers";

const druid = makeCharacterDoc({
  classId: "druid",
  level: 5,
  spells: [{ srdId: "spike-growth", prepared: true }] as never,
  spellSlots: [{ level: 2, total: 3 }],
});

const zoneEffect: ActiveCombatEffect = {
  id: "zone-spikes",
  actor: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: druid.id },
  target: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: druid.id },
  source: { kind: "spell", id: "spike-growth", actionId: "cast", castLevel: 2 },
  payload: { kind: "zone", spellId: "spike-growth" },
  duration: { kind: "encounter" },
};

beforeEach(() => {
  useDamageTrayStore.setState({ offer: null });
  useCharacterStore.setState({
    character: {
      ...druid,
      session: {
        ...druid.session,
        concentration: "spike-growth",
        activeFeatures: ["spell-spike-growth"],
      } as never,
    },
    readonly: false,
  });
  useCombatStatusStore.setState({
    status: {
      campaignId: "c1",
      myId: "pc-me",
      characterId: druid.id,
      round: 2,
      encounter: { effectOps: [{ id: "op", kind: "apply", effect: zoneEffect }] },
      view: { rows: [{ id: "orc", kind: "monster", name: "Orc" }] },
    } as never,
  });
});

describe("Spike Growth's zone", () => {
  it("«Entra nella zona» opens the tray: 2d4 Piercing on that creature, no save", () => {
    const [zone] = activeZones([zoneEffect]);
    if (!zone) throw new Error("no zone");
    expect(openZoneTray(zone, "orc", "en")).toBe(true);
    expect(useDamageTrayStore.getState().offer?.plan).toMatchObject({
      effect: "damage",
      damageType: "piercing",
      dice: "2d4",
      targets: ["orc"],
    });
    expect(useDamageTrayStore.getState().offer?.plan.save).toBeUndefined();
  });
});
