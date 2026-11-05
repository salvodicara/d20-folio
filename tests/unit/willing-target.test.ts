/**
 * A spell whose save is only for the unwilling (SRD 5.2.1 Enlarge/Reduce: "an
 * unwilling creature can make a Constitution save"): the tray offers an ally
 * «Consenziente», which makes no save and lands the state.
 */
import { describe, expect, it } from "vitest";

import { spells } from "@/data/spells";
import {
  damageTrayPlan,
  initialTrayRow,
  offersWilling,
  toggleSaved,
  toggleWilling,
} from "@/lib/play/damage-tray";
import { localizeActions } from "@/lib/views/combat-action-view";

import { makeCharacterDoc } from "./_helpers";

function enlarge() {
  const doc = makeCharacterDoc({
    classId: "wizard",
    level: 5,
    spells: [{ srdId: "enlarge-reduce", prepared: true }],
    spellSlots: [{ level: 2, total: 3 }],
  });
  const action = localizeActions(doc, "en").find((a) => a.spellId === "enlarge-reduce");
  if (!action) throw new Error("no cast");
  return action;
}

describe("a willing target", () => {
  it("is marked on the spells whose text gives only the unwilling a save", () => {
    const marked = spells.filter((s) => s.saveIfUnwilling).map((s) => s.id);
    expect(marked).toEqual(expect.arrayContaining(["enlarge-reduce", "levitate"]));
  });

  it("is offered for an ally, never for an enemy", () => {
    const plan = damageTrayPlan(enlarge(), ["pc-ally"], "pc-me");
    expect(plan?.willing).toBe(true);
    if (!plan) return;
    expect(offersWilling(plan, { kind: "pc" })).toBe(true);
    expect(offersWilling(plan, { kind: "monster", row: { side: "ally" } })).toBe(true);
    expect(offersWilling(plan, { kind: "monster" })).toBe(false);
  });

  it("makes no save: willing clears Saved, and Saved clears willing", () => {
    const plan = damageTrayPlan(enlarge(), ["pc-ally"], "pc-me");
    if (!plan) throw new Error("no tray");
    const saved = toggleSaved(initialTrayRow(plan, "pc-ally"), plan);
    const willing = toggleWilling(saved, plan);
    expect(willing).toMatchObject({ willing: true, saved: false });
    expect(toggleSaved(willing, plan)).toMatchObject({ willing: false, saved: true });
  });
});
