/**
 * The Play actions table's row facts (design session, 2026-10-18): each action's group
 * (D&D Beyond's Actions / Bonus / Reactions / Other filters), whether it can be cast as
 * a ritual, and whether it is available now or blocked, and why. The rules are the
 * ones the Play cards already use (`executionFor`, the depletion and condition gates),
 * read through one pure seam.
 */
import { describe, expect, it } from "vitest";

import { actionSaveDc, resolveActions } from "@/lib/smart-tracker";
import {
  actionFilterCounts,
  actionGroup,
  actionRowFacts,
} from "@/lib/views/action-row-view";
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
        { srdId: "thunderwave", prepared: true },
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

describe("the row's save DC, with where it comes from", () => {
  const raw = (doc: ReturnType<typeof wizard>, spellId: string) => {
    const found = resolveActions(doc, "spellbook").find((a) => a.spellId === spellId);
    if (!found) throw new Error(`no action for ${spellId}`);
    return found;
  };

  it("a save spell shows the DC and its lines (8, PB, the ability)", () => {
    const doc = wizard();
    const dc = actionRowFacts(doc, action(doc, "thunderwave"), new Set()).saveDc;
    const engine = actionSaveDc(raw(doc, "thunderwave").summary);
    expect(engine).not.toBeNull();
    expect(dc?.total).toBe(engine?.total);
    expect(dc?.parts?.length).toBe(engine?.parts?.length);
    expect(dc?.parts?.length).toBeGreaterThan(1);
    // Display lines, ready for the breakdown tip.
    expect(dc?.parts?.every((line) => typeof line.value === "string")).toBe(true);
  });

  it("an action that forces no save has none", () => {
    const doc = wizard();
    expect(
      actionRowFacts(doc, action(doc, "magic-missile"), new Set()).saveDc
    ).toBeNull();
  });

  it("a hand-set DC shows as set, its lines plus the manual adjustment", () => {
    const base = wizard();
    const doc = {
      ...base,
      character: {
        ...base.character,
        spellcasting: {
          ability: "INT" as const,
          preparedCaster: true,
          preparedMax: 6,
          saveDCOverride: 17,
          attackBonusOverride: null,
        },
      },
    };
    const dc = actionRowFacts(doc, action(doc, "thunderwave"), new Set()).saveDc;
    expect(dc?.total).toBe(17);
    expect(dc?.parts?.at(-1)).toMatchObject({ kind: "term", term: "breakdown.override" });
  });
});

/**
 * The actions table's filter chips (direction 2026-10-23, Play list row 12): Tutto ·
 * Attacchi · Azione · Bonus · Reazione · Altro · Uso limitato, each with its count. An
 * attack is an action that rolls to hit (the damage tray's rule); a limited use is
 * one with counted uses, a resource pool, or a spell slot to pay.
 */
describe("the filter chips", () => {
  it("each row says whether it is an attack and whether its use is limited", () => {
    const doc = wizard();
    const facts = (id: string) => actionRowFacts(doc, action(doc, id), new Set());
    expect(facts("fire-bolt")).toMatchObject({ attack: true, limitedUse: false });
    expect(facts("magic-missile")).toMatchObject({ attack: false, limitedUse: true });
    expect(facts("thunderwave")).toMatchObject({ attack: false, limitedUse: true });
  });

  it("count every chip from the rows", () => {
    const doc = wizard();
    const rows = ["fire-bolt", "magic-missile", "thunderwave", "detect-magic"].map((id) =>
      actionRowFacts(doc, action(doc, id), new Set())
    );
    expect(actionFilterCounts(rows)).toEqual({
      all: 4,
      attacks: 1,
      actions: 4,
      bonus: 0,
      reactions: 0,
      other: 0,
      limited: 3,
    });
  });

  it("no rows, every chip at zero", () => {
    expect(actionFilterCounts([])).toEqual({
      all: 0,
      attacks: 0,
      actions: 0,
      bonus: 0,
      reactions: 0,
      other: 0,
      limited: 0,
    });
  });
});
