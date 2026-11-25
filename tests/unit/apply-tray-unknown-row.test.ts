/**
 * Missing = unknown, never 0 (#1306). A peer's fight row whose live data has not loaded
 * holds a placeholder max HP of 0, and the shared write caps a heal at the max it is
 * given: healing through that row would set the ally's HP to 0. Until the row loads, the
 * tray writes nothing and says so; the DM's hit leaves such a row out.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadCampaignIo, writesSettled } from "./__helpers__/campaign-io-writes";

const io = vi.hoisted(() => ({
  writeCampaignCombatEffect: vi.fn(() =>
    Promise.resolve({ before: {}, after: {}, spends: [] })
  ),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

beforeAll(loadCampaignIo);

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { applyTray } from "@/features/character/center/apply-tray";
import { dmTargets } from "@/domains/combat/dm-hit-plan";
import { initialTrayRow, type DamageTrayPlan } from "@/lib/play/damage-tray";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { makeCharacterDoc } from "./_helpers";

const cleric = makeCharacterDoc({ classId: "cleric", level: 5 });

describe("a peer row still loading", () => {
  it("the tray writes nothing to it and says it is still loading", async () => {
    useCharacterStore.setState({ character: cleric, readonly: false });
    useCombatStatusStore.setState({ status: null });
    useToastStore.setState({ toasts: [] });
    io.writeCampaignCombatEffect.mockClear();
    const plan = { effect: "heal", targets: ["pc-bren"] } as DamageTrayPlan;
    const row = initialTrayRow(plan, "pc-bren");
    applyTray(
      {
        characterId: cleric.id,
        actionName: "Cure Wounds",
        source: { custom: "Cure Wounds" },
        castLogId: null,
        actionId: "cast",
        plan,
      },
      [
        {
          id: "pc-bren",
          name: "Bren",
          kind: "pc",
          row: {
            memberUid: "bren",
            characterId: "c-bren",
            maxHp: 0,
            tempHp: 0,
            liveUnknown: true,
          },
        } as never,
      ],
      [row],
      [8],
      ((key: string) => key) as never
    );
    await writesSettled();
    expect(io.writeCampaignCombatEffect).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts.map((x) => x.message)).toContain(
      "combat.targetStillLoading"
    );
  });

  it("the DM's hit leaves an unloaded PC row out of its targets", () => {
    const rows = [
      { id: "pc-a", kind: "pc", liveUnknown: true, currentHp: 0, maxHp: 0, tempHp: 0 },
      { id: "pc-b", kind: "pc", currentHp: 10, maxHp: 20, tempHp: 0 },
    ].map((r) => ({ name: "", conditions: [], ...r })) as never;
    expect(dmTargets(rows, ["pc-a", "pc-b"]).map((t) => t.id)).toEqual(["pc-b"]);
  });
});
