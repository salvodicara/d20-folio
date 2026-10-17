/**
 * The last inline `{ en, it }` literals moved to catalogue keys. Each case drives
 * the real presenter or engine seam and pins the words it showed before the move,
 * in both languages.
 */
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { resolveActions } from "@/lib/smart-tracker";
import { localizeAction, localizeHealBreakdown } from "@/lib/views/combat-action-view";
import { localizeText } from "@/lib/views/srd-i18n";
import { featureNameLoc } from "@/lib/srd-feature-lookup";
import { materialCostLogEvent } from "@/lib/play/material-cost";
import { resolveGrantSourcesForManeuvers } from "@/lib/resolve-grant-sources";
import { evaluateGrants } from "@/lib/grants";
import { SRD_MANEUVERS } from "@/data/maneuvers";
import { customText } from "@/lib/loc-text";
import { MOCK_CHARACTER } from "@/lib/mock";

describe("presenter words read the ui catalogue", () => {
  const raw = resolveActions(MOCK_CHARACTER);
  const offhand = raw.find((a) => a.id === "weapon-dagger-offhand");

  it("an off-hand weapon row keeps its suffix in both languages", () => {
    if (!offhand) throw new Error("mock yields no off-hand dagger action");
    expect(localizeAction(offhand, "en").name).toBe("Dagger (off-hand)");
    expect(localizeAction(offhand, "it").name).toBe("Pugnale (mano secondaria)");
  });

  it("a Pact-of-the-Blade Prone rider composes its note", () => {
    if (!offhand) throw new Error("mock yields no off-hand dagger action");
    const action = {
      ...offhand,
      summary: { ...offhand.summary, pactProneRiders: [customText("Eldritch Smite")] },
    };
    expect(localizeAction(action, "en").summary.effect).toBe(
      "Eldritch Smite: spend a Pact Magic slot; target Prone (Huge or smaller)"
    );
    expect(localizeAction(action, "it").summary.effect).toBe(
      "Eldritch Smite: spendi uno slot Magia del Patto; bersaglio Prono (Enorme o più piccolo)"
    );
  });

  it("a class-level heal names its provenance", () => {
    const heal = {
      dice: "1d10",
      bonus: 5,
      term: { kind: "class-level", classId: "fighter" },
    } as const;
    expect(localizeHealBreakdown(heal, "Second Wind", "en")?.[1]).toMatchObject({
      label: "Fighter level",
    });
    expect(localizeHealBreakdown(heal, "Secondo Vento", "it")?.[1]).toMatchObject({
      label: "livello da Guerriero",
    });
  });
});

describe("engine words are catalogue refs", () => {
  it("an unattributed rider reads Extra damage", () => {
    const name = featureNameLoc(undefined);
    expect(localizeText(name, "en")).toBe("Extra damage");
    expect(localizeText(name, "it")).toBe("Danni extra");
  });

  it("a material cost logs the coins in each language", () => {
    const gold = materialCostLogEvent({ spellId: "revivify", gp: 300, consumed: true });
    const copper = materialCostLogEvent({
      spellId: "gentle-repose",
      gp: 0.02,
      consumed: true,
    });
    if (gold.kind !== "rider-use" || copper.kind !== "rider-use") {
      throw new Error("material cost must log a rider-use event");
    }
    expect(localizeText(gold.rider, "en")).toBe("300 gp");
    expect(localizeText(gold.rider, "it")).toBe("300 mo");
    expect(localizeText(copper.rider, "en")).toBe("2 cp");
    expect(localizeText(copper.rider, "it")).toBe("2 mr");
  });

  // Parry and Riposte ride the content pack; the SRD-only build has no maneuvers.
  const reactionManeuvers = SRD_MANEUVERS.filter((m) => m.slot === "reaction");
  it.skipIf(reactionManeuvers.length === 0)(
    "a reaction maneuver states its trigger",
    () => {
      const triggers = Object.fromEntries(
        evaluateGrants(
          resolveGrantSourcesForManeuvers(["parry", "riposte"])
        ).grantedActions.map((a) => [
          a.sourceId,
          a.trigger && [localizeText(a.trigger, "en"), localizeText(a.trigger, "it")],
        ])
      );
      expect(triggers).toEqual({
        parry: [
          "another creature damages you with a melee attack roll",
          "un'altra creatura ti infligge danni con un tiro per colpire in mischia",
        ],
        riposte: [
          "a creature misses you with a melee attack roll",
          "una creatura ti manca con un tiro per colpire in mischia",
        ],
      });
    }
  );
});

describe("the language switch names the other language", () => {
  it("in the settings menu and the palette", () => {
    const en = i18n.getFixedT("en");
    const it_ = i18n.getFixedT("it");
    expect(en("settings.switchTo_it")).toBe("Passa a Italiano");
    expect(it_("settings.switchTo_en")).toBe("Switch to English");
    expect(en("palette.actionLangTo_it")).toBe("Switch to Italian");
    expect(it_("palette.actionLangTo_en")).toBe("Passa all'inglese");
  });
});
