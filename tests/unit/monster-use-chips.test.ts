/**
 * The DM's limited uses under a monster's line (rules-gap board A1; D&D Beyond's
 * tracker check boxes, the stat block's «Recharge 5–6»): one chip per use, named as the
 * stat block names it, with what is left; a spent Recharge says to roll its d6.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { getMonster } from "@/data/monsters";
import { monsterUseChips } from "@/domains/combat/monster-use-chips";
import i18n, { ensureSrdKind } from "@/i18n";

describe("monsterUseChips", () => {
  beforeAll(async () => {
    await ensureSrdKind("monster");
    await i18n.changeLanguage("en");
  });

  it("a dragon's breath is a Recharge use, ready until spent", () => {
    const block = getMonster("young-red-dragon");
    if (!block) throw new Error("no dragon");
    const t = i18n.getFixedT("en");
    const [ready] = monsterUseChips("young-red-dragon", {}, block, t, "en");
    expect(ready).toMatchObject({ label: "Fire Breath · Recharge 5–6", left: 1, max: 1 });
    expect(ready?.rollDue).toBe(false);
    const [spent] = monsterUseChips(
      "young-red-dragon",
      { spent: { [ready?.key ?? ""]: 1 } },
      block,
      t,
      "en"
    );
    expect(spent).toMatchObject({ left: 0, rollDue: true, recharge: 5 });
  });

  it("a monster with no limited uses has no chips", () => {
    const block = getMonster("goblin-warrior");
    if (!block) throw new Error("no goblin");
    expect(
      monsterUseChips("goblin-warrior", {}, block, i18n.getFixedT("en"), "en")
    ).toEqual([]);
  });
});
