/** The tray's line for an incoming attack mode, in both languages. */
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { incomingAttackLabel } from "@/components/shared/damage-tray-target";

const chip = {
  sourceKind: "spell" as const,
  sourceId: "guiding-bolt",
  mode: "advantage" as const,
  consumed: true,
};

describe("the tray shows it", () => {
  it("«Vantaggio (Dardo Guida, si consuma)», and a lasting one without the note", async () => {
    await i18n.changeLanguage("en");
    expect(incomingAttackLabel(chip, i18n.t.bind(i18n) as never, "en")).toBe(
      "Advantage (Guiding Bolt, spent by this attack)"
    );
    await i18n.changeLanguage("it");
    expect(incomingAttackLabel(chip, i18n.t.bind(i18n) as never, "it")).toMatch(
      /^Vantaggio \(.+, si consuma\)$/
    );
    expect(
      incomingAttackLabel({ ...chip, consumed: false }, i18n.t.bind(i18n) as never, "it")
    ).not.toMatch(/consuma/);
  });
});
