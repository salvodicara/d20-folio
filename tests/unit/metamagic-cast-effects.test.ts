/**
 * Per-cast Metamagic effects the cast commit honours, with cases taken from the
 * catalogue: every option's English SRD text decides what the pure helper must do.
 */
import { describe, expect, it } from "vitest";
import { SRD_METAMAGIC } from "@/data/metamagic";
import metamagicText from "@/i18n/en/srd/metamagic.json";
import { castEconomySlot, extendedDurationRounds } from "@/lib/play/metamagic";

const text = metamagicText as Record<string, { description: string }>;
const describes = (id: string, pattern: RegExp) =>
  pattern.test(text[id]?.description ?? "");

const QUICKENS = /change the casting time to a Bonus Action/i;
const DOUBLES = /double its duration to a maximum duration of 24 hours/i;
const ONE_MINUTE = 10;
const TWENTY_FOUR_HOURS = 24 * 60 * 10;

describe("catalogue → cast economy slot", () => {
  it("the catalogue names at least one quickening option", () => {
    expect(SRD_METAMAGIC.some((m) => describes(m.id, QUICKENS))).toBe(true);
  });

  for (const option of SRD_METAMAGIC) {
    const quickens = describes(option.id, QUICKENS);
    it(`${option.id}: an Action cast ${quickens ? "becomes a Bonus Action" : "stays an Action"}`, () => {
      expect(castEconomySlot("action", [option.id])).toBe(quickens ? "bonus" : "action");
    });
    it(`${option.id}: never changes a non-Action cast`, () => {
      expect(castEconomySlot("bonus", [option.id])).toBe("bonus");
      expect(castEconomySlot("reaction", [option.id])).toBe("reaction");
    });
  }

  it("no Metamagic leaves the slot alone", () => {
    expect(castEconomySlot("action", [])).toBe("action");
  });
});

describe("catalogue → armed duration", () => {
  it("the catalogue names at least one extending option", () => {
    expect(SRD_METAMAGIC.some((m) => describes(m.id, DOUBLES))).toBe(true);
  });

  for (const option of SRD_METAMAGIC) {
    const doubles = describes(option.id, DOUBLES);
    it(`${option.id}: a 1-minute duration ${doubles ? "doubles" : "is unchanged"}`, () => {
      expect(extendedDurationRounds(ONE_MINUTE, [option.id])).toBe(
        doubles ? ONE_MINUTE * 2 : ONE_MINUTE
      );
      expect(extendedDurationRounds(600, [option.id])).toBe(doubles ? 1200 : 600);
    });
    if (!doubles) continue;
    it(`${option.id}: caps at 24 hours`, () => {
      expect(extendedDurationRounds(TWENTY_FOUR_HOURS, [option.id])).toBe(
        TWENTY_FOUR_HOURS
      );
      expect(extendedDurationRounds(8 * 600 * 2, [option.id])).toBe(TWENTY_FOUR_HOURS);
    });
    it(`${option.id}: never touches a duration under 1 minute`, () => {
      expect(extendedDurationRounds(ONE_MINUTE - 1, [option.id])).toBe(ONE_MINUTE - 1);
      expect(extendedDurationRounds(undefined, [option.id])).toBeUndefined();
    });
  }
});
