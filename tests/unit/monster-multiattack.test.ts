/**
 * A monster's Multiattack as one sequence of its own one-tap rows: the plan reads
 * the routine the bestiary declares (pinned to the print by the corpus guard) and
 * resolves each step to the stat block's entry and, for an attack or save, the
 * same {@link MonsterAction} the card already offers. Cases are real SRD 5.2.1
 * stat blocks; the corpus check runs over the whole bestiary.
 */
import { describe, expect, it } from "vitest";

import { MONSTERS } from "@/data/monsters";
import type { MonsterStatBlock } from "@/data/types";
import { monsterActionDice, monsterActions } from "@/lib/play/monster-action";
import {
  multiattackPlan,
  multiattackRows,
  type MultiattackOption,
} from "@/lib/play/monster-multiattack";

function monster(id: string): MonsterStatBlock {
  const found = MONSTERS.find((block) => block.id === id);
  if (!found) throw new Error(`no monster ${id}`);
  return found;
}

/** A row as "entryId" (or "a|b" for the DM's pick), with the tray's to-hit/save. */
const show = (row: ReadonlyArray<MultiattackOption>) =>
  row
    .map(
      ({ entryId, action }) =>
        `${entryId}${action?.toHit !== undefined ? ` +${action.toHit}` : ""}${
          action?.save ? ` ${action.save.ability} ${action.save.dc}` : ""
        }${action ? "" : " (text)"}`
    )
    .join(" | ");

describe("multiattackPlan — the whole Multiattack as the card's own rows", () => {
  it.each([
    ["owlbear", ["rend +7", "rend +7"]],
    ["hell-hound", ["bite +5", "bite +5"]],
    ["adult-red-dragon", ["rend +14", "rend +14", "rend +14"]],
    ["bandit-captain", ["scimitar +5 | pistol +5", "scimitar +5 | pistol +5"]],
    ["vampire", ["grave-strike +9", "grave-strike +9", "bite CON 17"]],
    ["chimera", ["ram +7", "bite +7", "claw +7"]],
    [
      "roper",
      ["tentacle (text)", "tentacle (text)", "reel (text)", "bite +7", "bite +7"],
    ],
  ] as const)("%s runs %j", (id, rows) => {
    const plan = multiattackPlan(monster(id));
    expect(plan?.entryId).toBe("multiattack");
    expect(plan?.section).toBe("actions");
    expect(multiattackRows(plan?.steps ?? []).map(show)).toEqual(rows);
  });

  it("an attack row is the card's own action, with its printed dice", () => {
    const owlbear = monster("owlbear");
    const [first] = multiattackRows(multiattackPlan(owlbear)?.steps ?? []);
    const rend = monsterActions(owlbear).find((action) => action.entryId === "rend");
    expect(first?.[0]?.action).toEqual(rend);
    expect(first?.[0]?.action && monsterActionDice(first[0].action)).toEqual(["2d8+5"]);
  });

  it("keeps the printed swap and the alternative routine as choices", () => {
    const red = multiattackPlan(monster("adult-red-dragon"));
    expect(red?.replace?.count).toBe(1);
    // Spellcasting is a list, not a tray: the swap names it, the text says the spell.
    expect(red && show(red.replace?.options ?? [])).toEqual("spellcasting (text)");
    const chimera = multiattackPlan(monster("chimera"));
    expect(chimera?.replace?.of?.entryId).toBe("claw");
    expect(chimera?.replace?.options.map((o) => o.entryId)).toEqual(["fire-breath"]);
    const medusa = multiattackPlan(monster("medusa"));
    expect(multiattackRows(medusa?.or ?? []).map(show)).toEqual([
      "poison-ray +5",
      "poison-ray +5",
      "poison-ray +5",
    ]);
    const aboleth = multiattackPlan(monster("aboleth"));
    expect(aboleth?.steps[1]).toMatchObject({ count: 1, optional: true });
  });

  it("is null where the print is not a fixed routine or there is no Multiattack", () => {
    expect(multiattackPlan(monster("hydra"))).toBeNull();
    expect(multiattackPlan(monster("clay-golem"))).toBeNull();
    expect(multiattackPlan(monster("goblin-warrior"))).toBeNull();
  });

  it("resolves every declared step of the bestiary to one of the block's entries", () => {
    let plans = 0;
    for (const block of MONSTERS) {
      const plan = multiattackPlan(block);
      if (!plan) continue;
      plans += 1;
      const options = [
        ...plan.steps,
        ...(plan.or ?? []),
        ...(plan.replace ? [{ options: plan.replace.options }] : []),
      ].flatMap((step) => step.options);
      for (const { section, entryId, action } of options) {
        const entry = (block[section] ?? []).find((e) => e.id === entryId);
        expect(entry, `${block.id}: ${entryId}`).toBeDefined();
        // An attack or save is always the card's one-tap row.
        if (entry?.kind === "attack" || entry?.kind === "save")
          expect(action, `${block.id}: ${entryId}`).toBeDefined();
      }
    }
    expect(plans).toBeGreaterThanOrEqual(176);
  });
});
