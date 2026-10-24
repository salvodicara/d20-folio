/**
 * The generic riders (push, Speed loss, Hit Point maximum drain, swallow) read the
 * same on an action card, in the sheet's log and in the session report — English
 * and Italian, distances in the reader's units (IT metres).
 */
import i18next, { type TFunction } from "i18next";
import { beforeAll, describe, expect, it } from "vitest";

import enCombat from "@/i18n/en/ui/combat.json";
import enCombatLog from "@/i18n/en/ui/combatLog.json";
import enReport from "@/i18n/en/ui/sessionReport.json";
import itCombat from "@/i18n/it/ui/combat.json";
import itCombatLog from "@/i18n/it/ui/combatLog.json";
import itReport from "@/i18n/it/ui/sessionReport.json";
import type { RiderEffect } from "@/lib/activities";
import { localizeAction } from "@/lib/views/combat-action-view";
import { localizeCombatEvent } from "@/lib/views/combat-log-view";
import { actionRiderLines } from "@/lib/views/effect-rider-view";
import { localizePlayEvent } from "@/lib/views/session-report-view";
import { resolveActions } from "@/lib/smart-tracker";
import type { ActionData, CustomFeature } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";
import { customInstanceId } from "./__helpers__/custom-items";

const PUSH: RiderEffect = { kind: "forced-movement", direction: "push", feet: 15 };
const SLOW: RiderEffect = {
  kind: "speed-reduction",
  feet: 10,
  until: { phase: "turn-end", anchor: "target" },
};
const DRAIN: RiderEffect = { kind: "hp-max-reduction", damageType: "necrotic" };
const SWALLOW: RiderEffect = {
  kind: "swallow",
  damage: { dice: { dice: "6d6" }, types: ["acid"] },
};

let tEn: TFunction;
let tIt: TFunction;
beforeAll(async () => {
  const instance = i18next.createInstance();
  await instance.init({
    lng: "en",
    resources: {
      en: { translation: { ...enCombat, ...enCombatLog, ...enReport } },
      it: { translation: { ...itCombat, ...itCombatLog, ...itReport } },
    },
    interpolation: { escapeValue: false },
  });
  tEn = instance.getFixedT("en");
  tIt = instance.getFixedT("it");
});

const translate =
  (t: TFunction) => (key: string, params?: Record<string, string | number>) =>
    t(key, params);

describe("an action card's rider lines", () => {
  it("one line per rider fact, distances in feet for EN and metres for IT", () => {
    expect(actionRiderLines([PUSH, SLOW], "en").map((line) => line.text)).toEqual([
      "Pushed up to 15 ft away",
      "Speed −10 ft until the end of its next turn",
    ]);
    expect(actionRiderLines([PUSH, SLOW], "it").map((line) => line.text)).toEqual([
      "Spinto fino a 4,5 m più lontano",
      "Velocità −3 m fino alla fine del suo prossimo turno",
    ]);
  });

  it("a drain's type and a swallow's damage ride as chips", () => {
    const lines = actionRiderLines([DRAIN, SWALLOW], "en");
    expect(lines).toEqual([
      {
        id: "0:hp-max-reduction:0",
        text: "Hit Point maximum drops by the damage taken, until a Long Rest",
        damageType: "necrotic",
      },
      {
        id: "1:swallow:0",
        text: "Swallowed: Blinded and Restrained, Total Cover from outside",
      },
      {
        id: "1:swallow:1",
        text: "6d6 at the start of each of the swallower's turns",
        damageType: "acid",
      },
    ]);
  });

  it("a homebrew action's push reaches its localized card", () => {
    const shove: ActionData = {
      id: "shove",
      type: "action",
      label: "Thunder Shove",
      description: "A thunderous shove.",
      forcedMovement: { direction: "push", feet: 10 },
    };
    const feature: CustomFeature = {
      custom: true,
      title: "Storm Born",
      emoji: "⚡",
      source: "Homebrew",
      tags: [],
      contentBlocks: [],
      actions: [shove],
      instanceId: customInstanceId("storm-born"),
    };
    const doc = makeCharacterDoc({ classId: "fighter", level: 3, features: [feature] });
    const raw = resolveActions(doc).find((action) => action.id.includes("shove"));
    if (!raw) throw new Error("no shove row");
    expect(raw.summary.effectRiders).toEqual([
      { kind: "forced-movement", direction: "push", feet: 10 },
    ]);
    expect(localizeAction(raw, "it").summary.effectRiders).toEqual([
      { id: "0:forced-movement:0", text: "Spinto fino a 3 m più lontano" },
    ]);
  });
});

describe("the sheet log line", () => {
  const line = (t: TFunction, locale: "en" | "it", source?: boolean) =>
    localizeCombatEvent(
      {
        kind: "rider-taken",
        rider: PUSH,
        ...(source ? { source: { custom: "Hammer Throw" } } : {}),
      },
      translate(t),
      (id) => id,
      (id) => id,
      (value) => value,
      (ref) => ("custom" in ref ? ref.custom : ""),
      () => "",
      locale
    );

  it("says what landed, in the reader's units, with its source", () => {
    expect(line(tEn, "en")).toBe("Pushed up to 15 ft away");
    expect(line(tIt, "it", true)).toBe("Spinto fino a 4,5 m più lontano (Hammer Throw)");
  });
});

describe("the session report line", () => {
  it("names the target and what landed", () => {
    const names = {
      pc: () => undefined,
      condition: (id: string) => id,
      action: () => "Swallow",
      spell: (ref: string) => ref,
      locale: "it" as const,
    };
    expect(
      localizePlayEvent(
        { kind: "rider", rider: SLOW, target: "pc-ana", source: { custom: "Swallow" } },
        translate(tIt),
        () => "Ana",
        names
      )
    ).toBe(
      tIt("sessionReport.withSource", {
        line: "Ana: Velocità −3 m fino alla fine del suo prossimo turno",
        source: "Swallow",
      })
    );
  });
});
