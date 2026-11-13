/**
 * The forward-compat check before a deploy (coordinator, 2026-11-12): the live client
 * reads what this tree writes, or the check says which value it would refuse. Here, this
 * tree's own reader stands in for the live one; the real run points `--baseline-root`
 * at the deployed release (the probe then imports that release's code).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseCombatState } from "@/lib/combat-state-codec";
import { readCases } from "../../scripts/lib/forward-compat-probe";
import { buildInput, summarize } from "../../scripts/survey-forward-compat";

describe("the forward-compat check", () => {
  const input = buildInput();

  it("writes one document per value of each closed list, and every dev character", () => {
    const byList = (list: string) =>
      input.cases.filter((c) => c.list === list).map((c) => c.value);
    // Built through the real turn writer (snapshotTurnEconomy): «magic» is never stored
    // (#1168), so it is no case (coordinator, 2026-11-13: the survey reported it refused).
    expect(byList("turnEconomy.action.economyCategory")).toEqual(
      expect.arrayContaining(["attack", "dash", "disengage", "hide", "utilize"])
    );
    expect(byList("turnEconomy.action.economyCategory")).not.toContain("magic");
    expect(input.notStored["turnEconomy.action.economyCategory"]).toEqual(["magic"]);
    expect(byList("turnEconomy.action.triggerEvents")).toEqual([
      "attack",
      "bonus-extend",
    ]);
    expect(byList("character").length).toBeGreaterThan(10);
  });

  it("a refused value is a problem, named with where it was refused", () => {
    const live = {
      cases: readCases(
        (doc) =>
          JSON.stringify(doc).includes('"hide"')
            ? {
                ok: false,
                reason: "invalid-combat-state",
                where: "canonical:turnEconomy",
              }
            : { ok: true },
        input.cases
      ),
      lists: [
        { list: "damage types", missing: [] },
        { list: "conditions", missing: ["dazed"] },
      ],
    };
    const survey = summarize(
      input,
      live,
      readCases(() => ({ ok: true }), input.cases)
    );
    expect(survey.closedLists["turnEconomy.action.economyCategory"]?.refused).toEqual({
      hide: "canonical:turnEconomy",
    });
    expect(survey.playStateLists.conditions).toEqual(["dazed"]);
    expect(survey.problems).toBe(2);
  });

  it("a value the writer never stores is information, never a problem", () => {
    const allRead = readCases(() => ({ ok: true }), input.cases);
    const survey = summarize(
      input,
      { cases: allRead, lists: [{ list: "damage types", missing: [] }] },
      allRead
    );
    expect(survey.notStored["turnEconomy.action.economyCategory"]).toEqual(["magic"]);
    expect(survey.problems).toBe(0);
  });

  it("this tree's own reader reads its dev characters", () => {
    const characters = input.cases.filter((c) => c.list === "character");
    expect(
      readCases(parseCombatState, characters).filter((r) => r.result === "refused")
    ).toEqual([]);
  });

  it("prints no dev character id, only its number", () => {
    const text = JSON.stringify(
      summarize(
        input,
        { cases: readCases(() => ({ ok: true }), input.cases), lists: [] },
        []
      )
    );
    expect(text).not.toMatch(/scn-|team-/);
  });

  it("never reaches Firebase", () => {
    const source = readFileSync("scripts/survey-forward-compat.ts", "utf8");
    expect(source).not.toMatch(/firebase|getFirestore|applicationDefault/);
  });
});
