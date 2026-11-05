/**
 * A use whose outcome lands only when its target succeeds (a reaction that lets a
 * creature reroll a failed D20 Test, and grants it Temporary Hit Points if the new
 * roll succeeds): the tray marks each row «Successo», and the use's amount, conditions
 * and states land only on the rows marked so. Generic: any effect the use carries.
 * The catalogue spell is a stand-in (`appliesOnSuccess`); the public SRD has none.
 */
import { describe, expect, it } from "vitest";
import {
  initialTrayRow,
  rowAmount,
  rowConditions,
  toggleSaved,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";

const gated = {
  effect: "temp-hp",
  gate: "success",
  targets: ["pc-bren"],
  conditions: { options: ["invisible"], pickOne: false },
} as DamageTrayPlan;

describe("an outcome gated on the target's success", () => {
  it("a row not marked «Successo» gets nothing", () => {
    const row = { ...initialTrayRow(gated, "pc-bren"), conditions: ["invisible"] };
    expect(row.saved).toBe(false);
    expect(rowAmount(33, row, gated)).toBe(0);
    expect(rowConditions(row, gated)).toEqual([]);
  });

  it("marked «Successo», the whole amount and its conditions land", () => {
    const row = toggleSaved(
      { ...initialTrayRow(gated, "pc-bren"), conditions: ["invisible"] },
      gated
    );
    expect(rowAmount(33, row, gated)).toBe(33);
    expect(rowConditions(row, gated)).toEqual(["invisible"]);
  });

  it("an ungated use is unchanged", () => {
    const plain = { effect: "temp-hp", targets: ["pc-bren"] } as DamageTrayPlan;
    expect(rowAmount(33, initialTrayRow(plain, "pc-bren"), plain)).toBe(33);
  });
});

describe("through the real tray (applyTray)", () => {
  it("only the row marked «Successo» takes the Temporary Hit Points", async () => {
    const { applyTray } = await import("@/features/character/center/apply-tray");
    const { useCharacterStore } = await import("@/stores/characterStore");
    const { useCombatStatusStore } =
      await import("@/features/campaigns/global-combat-context");
    const { makeCharacterDoc } = await import("./_helpers");
    const me = makeCharacterDoc(
      { classId: "bard", level: 13 },
      { hp: { current: 40, temp: 0 } }
    );
    useCharacterStore.setState({ character: me, readonly: false });
    useCombatStatusStore.setState({ status: null });
    const plan = {
      effect: "temp-hp",
      gate: "success",
      targets: ["self", "self-2"],
    } as DamageTrayPlan;
    const apply = (success: boolean) => {
      const row = initialTrayRow(plan, "self");
      const marked = success ? toggleSaved(row, plan) : row;
      applyTray(
        {
          characterId: me.id,
          actionName: "Reroll",
          source: { custom: "Reroll" },
          castLogId: null,
          actionId: "cast",
          plan,
        },
        [{ id: "self", name: "Me", kind: "self" } as never],
        [marked],
        [rowAmount(33, marked, plan)],
        ((key: string) => key) as never
      );
    };
    apply(false);
    expect(useCharacterStore.getState().character?.session.hp.temp).toBe(0);
    apply(true);
    expect(useCharacterStore.getState().character?.session.hp.temp).toBe(33);
  });
});
