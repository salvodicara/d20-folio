/**
 * A table that varies the death-save counts (M16, the campaign's «Regole» tab): a
 * hit at 0 HP and the track itself count up to the table's number, not three.
 */
import { describe, expect, it } from "vitest";

import { diedInPlay, stabilisedInPlay } from "@/lib/character-status";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { effectiveTableRules } from "@/lib/table-rules";
import type { CharacterDoc } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

const tableRules = effectiveTableRules({
  tableRules: { deathSaves: { successes: 4, failures: 5 } },
});

const dying = (deathFail: number, rules = true): CharacterDoc =>
  makeCharacterDoc(
    {},
    {
      hp: { current: 0, temp: 0 },
      deathFail,
      deathSucc: 0,
      conditions: ["unconscious"],
      ...(rules ? { tableRules } : {}),
    }
  );

describe("death saves under the table's counts", () => {
  it("a hit at 0 HP adds a failure but kills only at the table's count", () => {
    const after = applySheetEvent(dying(3), { kind: "take-damage", amount: 2 });
    expect(after?.session.deathFail).toBe(4);
    expect(after && diedInPlay(after.session)).toBe(false);
    const last = after && applySheetEvent(after, { kind: "take-damage", amount: 2 });
    expect(last && diedInPlay(last.session)).toBe(true);
    // RAW: the third failure kills.
    const raw = applySheetEvent(dying(2, false), { kind: "take-damage", amount: 2 });
    expect(raw && diedInPlay(raw.session)).toBe(true);
  });

  it("the track counts to the table's numbers", () => {
    const doc = applySheetEvent(dying(0), {
      kind: "set-death-saves",
      successes: 4,
      failures: 4,
    });
    expect(doc?.session.deathSucc).toBe(4);
    expect(doc?.session.deathFail).toBe(4);
    expect(doc && stabilisedInPlay(doc.session)).toBe(true);
  });
});
