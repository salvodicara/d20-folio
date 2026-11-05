/**
 * The tray hands a hit on another PC to the write as parts before defenses
 * (`rowDamageParts`), through the real entry point (`applyTray`): the write, not the
 * tray's possibly stale view, decides Bren's Resistance.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadCampaignIo, writesSettled } from "./__helpers__/campaign-io-writes";

const io = vi.hoisted(() => ({
  writeCampaignCombatEffect: vi.fn(() =>
    Promise.resolve({
      before: { hp: { current: 20, temp: 0 } },
      after: { hp: { current: 15, temp: 0 } },
      spends: [],
    })
  ),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

beforeAll(loadCampaignIo);

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { applyTray } from "@/features/character/center/apply-tray";
import {
  initialTrayRow,
  rowDamageParts,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

const fighter = makeCharacterDoc({ classId: "fighter", level: 5 });

describe("a hit on another PC carries its damage parts to the write", () => {
  it("Bren, with no defense the tray knew of: the write gets the whole hit, typed", async () => {
    useCharacterStore.setState({ character: fighter, readonly: false });
    useCombatStatusStore.setState({ status: null });
    const plan = {
      effect: "damage",
      damageType: "slashing",
      targets: ["pc-bren"],
    } as DamageTrayPlan;
    const row = initialTrayRow(plan, "pc-bren");
    applyTray(
      {
        characterId: fighter.id,
        actionName: "Longsword",
        source: { custom: "Longsword" },
        castLogId: null,
        actionId: "attack",
        plan,
      },
      [
        {
          id: "pc-bren",
          name: "Bren",
          kind: "pc",
          row: { memberUid: "bren", characterId: "c-bren", maxHp: 30, tempHp: 0 },
        } as never,
      ],
      [row],
      [10],
      ((key: string) => key) as never,
      [rowDamageParts(row, plan, { total: 10 })]
    );
    await writesSettled();
    const call = io.writeCampaignCombatEffect.mock.calls[0] as unknown as [
      string,
      string,
      null,
      number,
      { operation: { amount: number; parts?: unknown } },
    ];
    expect(call.slice(0, 4)).toEqual(["bren", "c-bren", null, 30]);
    expect(call[4].operation.amount).toBe(10);
    expect(call[4].operation.parts).toEqual([
      { amount: 10, type: "slashing", delivery: "automatic" },
    ]);
  });
});
