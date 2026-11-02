/**
 * The Play screen's actions table (approved prototype x-play): every action in the
 * engine's order (`sortActions`), filed under D&D Beyond's groups (Azioni · Azioni bonus
 * · Reazioni · Altro) with what a row shows at a glance — range, to-hit or save DC,
 * effect, the uses left — and the filter chips' counts. A condition that blocks a slot
 * marks its rows blocked.
 */
import { describe, expect, it } from "vitest";

import { playActionsView } from "@/domains/play/play-actions-view";
import { sortActions, localizeActions } from "@/lib/views/combat-action-view";
import { actionFilterCounts, actionRowFacts } from "@/lib/views/action-row-view";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { makeCharacterDoc } from "./_helpers";

const wizard = (session = {}) =>
  makeCharacterDoc(
    {
      classId: "wizard",
      level: 3,
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 2 },
      ],
      spells: [
        { srdId: "detect-magic", prepared: true },
        { srdId: "magic-missile", prepared: true },
        { srdId: "fire-bolt", prepared: true },
        { srdId: "shield", prepared: true },
      ],
    },
    session
  );

describe("playActionsView", () => {
  const doc = wizard();
  const view = playActionsView(doc, "en");
  const engine = sortActions(localizeActions(doc, "en"));

  it("keeps every action, in the engine's order, under its group", () => {
    const flat = view.groups.flatMap((g) => g.rows.map((r) => r.id));
    expect([...flat].sort()).toEqual(engine.map((a) => a.id).sort());
    for (const g of view.groups) {
      const order = engine
        .filter((a) => g.rows.some((r) => r.id === a.id))
        .map((a) => a.id);
      expect(g.rows.map((r) => r.id)).toEqual(order);
    }
  });

  it("groups follow the table's order and are left out when empty", () => {
    expect(view.groups.map((g) => g.group)).toEqual(
      (["actions", "bonus", "reactions", "other"] as const).filter((k) =>
        engine.some((a) => actionRowFacts(doc, a, new Set()).group === k)
      )
    );
  });

  it("a row says its range, to-hit or DC, and effect as the engine does", () => {
    const bolt = view.groups
      .flatMap((g) => g.rows)
      .find((r) => r.spellId === "fire-bolt");
    const engineBolt = engine.find((a) => a.spellId === "fire-bolt");
    expect(bolt).toMatchObject({
      level: 0,
      attackBonus: engineBolt?.summary.attackBonus,
      damage: engineBolt?.summary.damage,
      range: engineBolt?.summary.range,
    });
  });

  it("the filter chips count what the engine counts", () => {
    expect(view.counts).toEqual(
      actionFilterCounts(engine.map((a) => actionRowFacts(doc, a, new Set())))
    );
  });

  it("a condition that blocks a slot marks its rows blocked, as the engine says", () => {
    const stunnedDoc = wizard({ conditions: ["incapacitated"] });
    const stunned = playActionsView(stunnedDoc, "en").groups.flatMap((g) => g.rows);
    const gates = resolveConditionEffects(effectiveSessionConditions(stunnedDoc.session));
    const engineBlocked = sortActions(localizeActions(stunnedDoc, "en"))
      .filter(
        (a) =>
          actionRowFacts(stunnedDoc, a, gates.blockedSlots).availability.kind ===
          "blocked"
      )
      .map((a) => a.id);
    expect(engineBlocked.length).toBeGreaterThan(0);
    expect(
      stunned
        .filter((r) => r.blocked)
        .map((r) => r.id)
        .sort()
    ).toEqual(engineBlocked.sort());
    expect(view.groups.flatMap((g) => g.rows).some((r) => r.blocked)).toBe(false);
  });
});
