/**
 * The base action cards and the engine's own lines read their words from the
 * catalogues: the base actions from the `rule` catalogue (`action.<id>`), the
 * Unarmed Strike name from the glossary, the computed lines from `ui` keys with
 * their number as a param. Cases come from a real sheet's resolved actions; the
 * pinned strings are the ones the cards showed before the words moved.
 */
import { describe, expect, it } from "vitest";
import { BASE_ACTIONS, resolveActions } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { localizeText } from "@/lib/views/srd-i18n";
import { uiText } from "@/lib/loc-text";
import { makeCharacterDoc } from "./_helpers";

const doc = makeCharacterDoc({ classes: [{ classId: "fighter", level: 3 }] });
const raw = resolveActions(doc, "spellbook");
const shown = (locale: "en" | "it") =>
  new Map(raw.map((row) => [row.id, localizeAction(row, locale)]));
const EN = shown("en");
const IT = shown("it");

describe("base action cards read the rule catalogue", () => {
  it.each([
    ["base-dash", "Dash", "Scatto", "Double movement speed", "Raddoppia il movimento"],
    [
      "base-utilize",
      "Utilize",
      "Utilizzo",
      "Use a nonmagical object needing an action",
      "Usa un oggetto non magico che richiede un'azione",
    ],
    [
      "base-shove",
      "Shove",
      "Spingere",
      "Unarmed Strike: Str/Dex save → push 5 ft or Prone",
      "Colpo Senz'armi: TS For/Des → 1,5 m o Prono",
    ],
  ])("%s shows its name and effect in both locales", (id, enName, itName, enFx, itFx) => {
    expect(EN.get(id)?.name).toBe(enName);
    expect(IT.get(id)?.name).toBe(itName);
    expect(EN.get(id)?.summary.effect).toBe(enFx);
    expect(IT.get(id)?.summary.effect).toBe(itFx);
  });

  it("the Opportunity Attack carries its trigger", () => {
    expect(EN.get("base-opportunity-attack")?.summary.trigger).toBe("enemy leaves reach");
    expect(IT.get("base-opportunity-attack")?.summary.trigger).toBe(
      "nemico lascia portata"
    );
  });

  it("every base action on the board has a name and an effect in both locales", () => {
    for (const { id } of BASE_ACTIONS.filter((a) => EN.has(a.id))) {
      expect(EN.get(id)?.name, id).toBeTruthy();
      expect(IT.get(id)?.name, id).toBeTruthy();
      expect(EN.get(id)?.summary.effect, id).toBeTruthy();
      expect(IT.get(id)?.summary.effect, id).toBeTruthy();
    }
  });
});

describe("the engine's own lines read ui keys", () => {
  it("the Unarmed Strike is named as the glossary names it", () => {
    expect(EN.get("unarmed-strike")?.name).toBe("Unarmed Strike");
    expect(IT.get("unarmed-strike")?.name).toBe("Colpo Senz'armi");
  });

  it("a computed line fills its number in each locale", () => {
    const gain = uiText("combat.gainTempHp", { amount: 9 });
    expect(localizeText(gain, "en")).toBe("Gain 9 temporary HP");
    expect(localizeText(gain, "it")).toBe("Ottieni 9 PF temporanei");
    const die = uiText("combat.unarmedUnburdenedDie", { die: "1d8" });
    expect(localizeText(die, "en")).toBe("1d8 if not holding a weapon or Shield");
    expect(localizeText(die, "it")).toBe("1d8 se non impugni armi o Scudo");
  });
});
