/**
 * Savage Attacker (SRD 5.2.1 feat): once per turn when you hit with a weapon, roll the
 * weapon's damage dice twice and use either roll. The weapon row's reminder says that,
 * not «reroll low dice», which would let a player reroll only some dice.
 */
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { riderToken } from "@/components/shared/rider-label";
import type { RiderVM } from "@/lib/views/rider-view";

const savage = {
  kind: "die-mod",
  dieMode: "reroll-keep-higher",
  oncePerTurn: true,
} as unknown as RiderVM;

describe("Savage Attacker's reminder on a weapon row", () => {
  it.each([
    ["en", /twice/i],
    ["it", /due volte/i],
  ] as const)(
    "%s: says the damage is rolled twice, never «low dice»",
    async (locale, twice) => {
      await i18n.loadLanguages(locale);
      const text = riderToken(savage, i18n.getFixedT(locale)).text;
      expect(text).toMatch(twice);
      expect(text).not.toMatch(/low dice|dadi bassi/i);
    }
  );
});
