/**
 * A paid Advantage ("spend a Luck Point to give yourself Advantage on the roll") is
 * offered on the initiative roll the sheet sends, as the save entries already offer
 * it: the sources are read per roll, and the roll's mode moves with the paid
 * Advantage (none → Advantage, Disadvantage → a straight roll; 2024 D20 Tests:
 * Advantage and Disadvantage cancel).
 */
import { describe, expect, it } from "vitest";
import { postRollSources } from "@/lib/character-d20-tests";
import { withPaidAdvantage } from "@/domains/play/roll-dialog-state";
import { makeCharacterDoc } from "./_helpers";

const luck = {
  id: "luck-advantage",
  summary: { rollEffect: { kind: "advantage" as const, rolls: ["initiative" as const] } },
};
const savesOnly = {
  id: "save-advantage",
  summary: { rollEffect: { kind: "advantage" as const, rolls: ["save" as const] } },
};

describe("a paid Advantage on the initiative roll", () => {
  const doc = makeCharacterDoc({});

  it("is read for the roll it names", () => {
    expect(postRollSources(doc, [luck, savesOnly], "initiative").advantageOptIns).toEqual(
      ["luck-advantage"]
    );
    expect(postRollSources(doc, [luck, savesOnly]).advantageOptIns).toEqual([
      "save-advantage",
    ]);
  });

  it("moves the roll's mode", () => {
    expect(withPaidAdvantage("none")).toBe("advantage");
    expect(withPaidAdvantage("disadvantage")).toBe("none");
    expect(withPaidAdvantage("advantage")).toBe("advantage");
  });
});
