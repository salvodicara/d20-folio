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
import { buildDevScenario } from "@/lib/dev-scenarios";
import type { ActionTurnState } from "@/lib/views/action-cta-view";
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
    const gates = resolveConditionEffects(
      effectiveSessionConditions(stunnedDoc.session),
      {}
    );
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

// Each row carries its button (the shared `actionCtaView`) for the turn passed in:
// an off-hand attack is not offered, nor counted, until a Light main-hand attack.
describe("playActionsView — the buttons", () => {
  const scenario = buildDevScenario("twf-extra-attack");
  if (!scenario) throw new Error("dev scenario twf-extra-attack is missing");
  const dual = scenario;
  const fresh: ActionTurnState = {
    selected: { action: [], bonus: [], free: [] },
    budget: { action: 1, bonus: 1 },
    attackBudget: 2,
    attacksUsed: 0,
    attackSwingIds: [],
    reactionUsed: false,
    reactionUsedId: null,
    movementUsedFt: 0,
    warMagicMax: -1,
  };
  const rowsOf = (v: ReturnType<typeof playActionsView>) =>
    v.groups.flatMap((g) => g.rows);

  it("leaves the off-hand rows out of the table and its counts before the main attack", () => {
    const view = playActionsView(dual, "en", fresh);
    const rows = rowsOf(view);
    expect(rows.some((r) => r.action.offhand)).toBe(false);
    expect(view.counts.all).toBe(rows.length);
    expect(rows.find((r) => r.id === "weapon-dagger")?.cta.verb).toBe("attack");
  });

  it("offers them once a Light swing lands, with the swing left live", () => {
    const view = playActionsView(dual, "en", {
      ...fresh,
      selected: { action: [{ id: "attack-group" }], bonus: [], free: [] },
      attacksUsed: 1,
      attackSwingIds: ["weapon-dagger"],
    });
    const rows = rowsOf(view);
    expect(rows.some((r) => r.action.offhand)).toBe(true);
    expect(view.counts.all).toBe(rows.length);
    expect(rows.find((r) => r.id === "weapon-dagger")?.cta.attacksLeft).toEqual({
      remaining: 1,
      total: 2,
    });
  });
});

describe("playActionsView group notes (prototype x-play .agroup__note)", () => {
  const fighter = (level: number) =>
    makeCharacterDoc({
      classId: "fighter",
      level,
      equipment: [{ srdId: "longsword", equipped: true }],
    });

  it("the Actions group says how many attacks one Attack action makes", () => {
    const at = (level: number) =>
      playActionsView(fighter(level), "en").groups.find((g) => g.group === "actions")
        ?.note;
    expect(at(1)).toEqual({ kind: "attacks", count: 1 });
    expect(at(5)).toEqual({ kind: "attacks", count: 2 });
  });

  it("a spent bonus action or reaction says so; fresh, only the reaction's one a round", () => {
    const doc = buildDevScenario("twf-extra-attack");
    if (!doc) throw new Error("fixture missing");
    const fresh = playActionsView(doc, "en");
    expect(fresh.groups.find((g) => g.group === "bonus")?.note).toBeUndefined();
    const freshReactions = fresh.groups.find((g) => g.group === "reactions");
    if (freshReactions) expect(freshReactions.note).toEqual({ kind: "per-round" });
    const spent: ActionTurnState = {
      selected: { action: [], bonus: [{ id: "x" }], free: [] },
      budget: { action: 1, bonus: 1 },
      attackBudget: 1,
      attacksUsed: 0,
      attackSwingIds: [],
      reactionUsed: true,
      reactionUsedId: "y",
      movementUsedFt: 0,
      warMagicMax: -1,
    };
    const used = playActionsView(doc, "en", spent);
    expect(used.groups.find((g) => g.group === "bonus")?.note).toEqual({ kind: "spent" });
    const reactions = used.groups.find((g) => g.group === "reactions");
    if (reactions) expect(reactions.note).toEqual({ kind: "spent" });
  });
});
