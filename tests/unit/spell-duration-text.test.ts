/**
 * The edit-time reader of a spell's printed EN duration: the backfill script and the
 * catalogue guard derive the structured `duration` from it. Cases are the printed
 * durations the SRD and pack catalogues carry.
 */
import { describe, expect, it } from "vitest";
import { backfillDurations } from "../../scripts/spells/backfill-durations";
import { parseSpellDurationText } from "../../scripts/spells/spell-duration-text";

describe("parseSpellDurationText", () => {
  it.each([
    ["Instantaneous", { kind: "instantaneous" }, false],
    ["1 round", { kind: "rounds", amount: 1 }, false],
    ["Concentration, up to 6 rounds", { kind: "rounds", amount: 6 }, true],
    ["1 minute", { kind: "minutes", amount: 1 }, false],
    ["Concentration, up to 1 minute", { kind: "minutes", amount: 1 }, true],
    ["Concentration, up to 10 minutes", { kind: "minutes", amount: 10 }, true],
    ["Up to 1 minute", { kind: "minutes", amount: 1 }, false],
    ["1 hour", { kind: "hours", amount: 1 }, false],
    ["Up to 8 hours", { kind: "hours", amount: 8 }, false],
    ["Concentration, up to 2 hours", { kind: "hours", amount: 2 }, true],
    ["24 hours", { kind: "hours", amount: 24 }, false],
    ["1 day", { kind: "days", amount: 1 }, false],
    ["Concentration, up to 1 day", { kind: "days", amount: 1 }, true],
    ["30 days", { kind: "days", amount: 30 }, false],
    ["Until dispelled", { kind: "until-dispelled" }, false],
    ["Until dispelled or triggered", { kind: "until-dispelled-or-triggered" }, false],
    ["Special", { kind: "special" }, false],
    ["Instantaneous or 1 hour", { kind: "special" }, false],
  ])("%s", (text, duration, concentration) => {
    expect(parseSpellDurationText(text)).toEqual({ duration, concentration });
  });
});

describe("backfillDurations", () => {
  const file = [
    "export const SPELLS = [",
    "  {",
    '    id: "bane",',
    "    concentration: true,",
    '    source: "SRD",',
    "  },",
    "  {",
    '    id: "fireball",',
    "    concentration: false,",
    '    duration: { kind: "special" },',
    "    instantaneous: true,",
    "  },",
    "];",
  ].join("\n");
  const text: Record<string, string> = {
    bane: "Concentration, up to 1 minute",
    fireball: "Instantaneous",
  };

  it("writes the duration after the concentration line, rewriting a stale one", () => {
    const result = backfillDurations(file, (id) => text[id]);
    expect(result.written).toBe(2);
    expect(result.source).toContain(
      '    concentration: true,\n    duration: { kind: "minutes", amount: 1 },\n    source'
    );
    expect(result.source).toContain(
      '    concentration: false,\n    duration: { kind: "instantaneous" },\n    instantaneous'
    );
    expect(result.source).not.toContain("special");
  });

  it("is idempotent and reports a spell with no EN duration", () => {
    const once = backfillDurations(file, (id) => text[id]).source;
    expect(backfillDurations(once, (id) => text[id]).source).toBe(once);
    expect(backfillDurations(file, () => undefined).missing).toEqual([
      "bane",
      "fireball",
    ]);
  });
});
