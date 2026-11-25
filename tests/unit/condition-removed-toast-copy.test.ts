/**
 * The removed-condition toast agrees in Italian whatever the condition's gender
 * (#1333 review: «Spaventato rimossa»): the noun leads, as the other removal toasts
 * do («Resistenza rimossa: Fuoco»).
 */
import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";

afterEach(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
});

describe("removed condition toast", () => {
  it("IT names the condition after a neutral noun", async () => {
    await i18n.changeLanguage("it");
    expect(i18n.t("combat.conditionRemovedToast", { condition: "Spaventato" })).toBe(
      "Condizione rimossa: Spaventato"
    );
  });

  it("EN reads the same way", () => {
    expect(i18n.t("combat.conditionRemovedToast", { condition: "Frightened" })).toBe(
      "Condition removed: Frightened"
    );
  });
});
