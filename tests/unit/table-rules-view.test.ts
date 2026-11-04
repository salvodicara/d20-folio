/**
 * The campaign's «Regole» tab (approved mock): every table rule with what RAW does,
 * its choices and whether the table changed it; a change stores only what differs
 * from RAW, so going back to RAW leaves nothing behind.
 */
import { describe, expect, it } from "vitest";

import { tableRulesView, withRule } from "@/domains/campaign/table-rules-view";

describe("tableRulesView", () => {
  it("a RAW campaign: every rule is RAW, nothing changed", () => {
    const view = tableRulesView({});
    expect(view.changed).toBe(0);
    expect(view.groups.flatMap((g) => g.rows).every((r) => r.raw)).toBe(true);
    expect(view.groups.map((g) => g.id)).toEqual(["combat", "rest", "items", "optional"]);
  });

  it("names what the table changed and its current choice", () => {
    const view = tableRulesView({ flanking: "advantage", exhaustion: { maxLevel: 4 } });
    const rows = view.groups.flatMap((g) => g.rows);
    const flanking = rows.find((r) => r.id === "flanking");
    expect(flanking).toMatchObject({ raw: false, kind: "choice", current: "advantage" });
    const exhaustion = rows.find((r) => r.id === "exhaustion");
    expect(exhaustion?.raw).toBe(false);
    expect(
      exhaustion?.kind === "numbers" && exhaustion.fields.map((f) => f.value)
    ).toEqual([4, -2, -5]);
    expect(view.changed).toBe(2);
  });

  it("the optional systems are each their own switch", () => {
    const view = tableRulesView({ heroPoints: true });
    const row = view.groups.flatMap((g) => g.rows).find((r) => r.id === "points");
    expect(
      row?.kind === "toggles" && row.toggles.map((t) => [t.path.join("."), t.on])
    ).toEqual([
      ["heroPoints", true],
      ["plotPoints", false],
    ]);
    expect(row?.raw).toBe(false);
  });
});

describe("withRule", () => {
  it("stores a change, and drops it when set back to RAW", () => {
    const action = withRule({}, ["potions", "drink"], "action");
    expect(action).toEqual({ potions: { drink: "action" } });
    expect(withRule(action, ["potions", "drink"], "bonus")).toEqual({});
    expect(withRule({ flanking: "plus-2" }, ["flanking"], "off")).toEqual({});
  });

  it("keeps the other fields of a group", () => {
    expect(withRule({ rest: { shortMinutes: 10 } }, ["rest", "longMinutes"], 60)).toEqual(
      {
        rest: { shortMinutes: 10, longMinutes: 60 },
      }
    );
  });
});
