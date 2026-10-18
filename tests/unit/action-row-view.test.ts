/**
 * The Play actions table's row facts (design session, 2026-10-18): each action's group
 * (D&D Beyond's Actions / Bonus / Reactions / Other filters), whether it can be cast as
 * a ritual, and whether it is available now or blocked, and why. The rules are the
 * ones the Play cards already use (`executionFor`, the depletion and condition gates),
 * read through one pure seam.
 */
import { describe, expect, it } from "vitest";

import { resolveActions } from "@/lib/smart-tracker";
import { actionGroup, actionRowFacts } from "@/lib/views/action-row-view";
import { localizeAction } from "@/lib/views/combat-action-view";
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
      ],
    },
    session
  );

const action = (doc: ReturnType<typeof wizard>, spellId: string) => {
  const found = resolveActions(doc, "spellbook").find((a) => a.spellId === spellId);
  if (!found) throw new Error(`no action for ${spellId}`);
  // The Play tab hands the view localized actions.
  return localizeAction(found, "en");
};

describe("actionGroup", () => {
  it("files every economy type under one of the table's groups", () => {
    expect(
      ["action", "bonus", "reaction", "free"].map((t) => actionGroup(t as never))
    ).toEqual(["actions", "bonus", "reactions", "other"]);
  });
});

describe("actionRowFacts", () => {
  it("a levelled SRD ritual spell can be cast as a ritual; others cannot", () => {
    const doc = wizard();
    expect(actionRowFacts(doc, action(doc, "detect-magic"), new Set()).ritual).toBe(true);
    expect(actionRowFacts(doc, action(doc, "magic-missile"), new Set()).ritual).toBe(
      false
    );
  });

  it("available with a slot to spend; blocked with no slot left; a cantrip never runs out", () => {
    const doc = wizard();
    expect(
      actionRowFacts(doc, action(doc, "magic-missile"), new Set()).availability
    ).toEqual({
      kind: "available",
    });
    const spent = wizard({ spellSlots: { "1": { used: 4 }, "2": { used: 2 } } });
    expect(
      actionRowFacts(spent, action(spent, "magic-missile"), new Set()).availability
    ).toEqual({ kind: "blocked", reason: "no-uses" });
    expect(
      actionRowFacts(spent, action(spent, "fire-bolt"), new Set()).availability
    ).toEqual({
      kind: "available",
    });
  });

  it("a condition that blocks its slot blocks it (Incapacitated: no actions)", () => {
    const doc = wizard();
    expect(
      actionRowFacts(doc, action(doc, "fire-bolt"), new Set(["action"])).availability
    ).toEqual({ kind: "blocked", reason: "condition" });
  });
});
