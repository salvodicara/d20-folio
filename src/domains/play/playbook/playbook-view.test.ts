/**
 * The playbook as board 01 shows it: one line per step (the action's name in bold,
 * then its target or condition) and one "why" sentence with numbers, two reasons at
 * most joined with "e"/"and". Cases follow the approved Italian examples ("**Fiamma
 * sacra** sul nemico più vicino." / "In media 9 danni contro i 6,5 della Mazza, e
 * arriva a 18 m."; "Sei a 31 su 38: un **riposo breve** ti porterebbe al massimo.").
 */
import { beforeAll, describe, expect, it } from "vitest";

import { ensureLocale } from "@/i18n";
import { buildDevScenario } from "@/lib/dev-scenarios";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "../../../../tests/unit/_helpers";
import { playbookView, type PlaybookLine } from "./playbook-view";

const cleric = (hp = 25): CharacterDoc =>
  makeCharacterDoc(
    {
      classId: "cleric",
      level: 5,
      abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 10 },
      spells: [
        { srdId: "sacred-flame", prepared: true },
        { srdId: "guidance", prepared: true },
        { srdId: "cure-wounds", prepared: true },
        { srdId: "detect-magic", prepared: true },
      ],
      weapons: [{ srdId: "mace" }] as never,
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
        { level: 3, total: 2 },
      ],
    },
    { hp: { current: hp, temp: 0 } }
  );

const find = (lines: PlaybookLine[], rule: string) =>
  lines.find((line) => line.stepId.endsWith(`:${rule}`));

beforeAll(async () => {
  await ensureLocale("it");
});

describe("playbookView", () => {
  it("the attack: the action in bold, its target, then the damage compared and its reach", () => {
    const view = playbookView(cleric(), "it");
    expect(find(view.plan, "default-attack")).toMatchObject({
      shape: "action",
      before: "",
      strong: "Fiamma Sacra",
      after: " sul nemico più vicino.",
      why: "In media 9 danni, contro 6,5 con Mazza e arriva a 18 metri.",
    });
  });

  it("the move: the walking speed, and no why line", () => {
    const view = playbookView(cleric(), "it");
    expect(find(view.plan, "position")).toMatchObject({
      shape: "movement",
      strong: "Muoviti",
      after: " fino a 9 m, restando a distanza.",
      why: null,
    });
  });

  it("out of combat: a Short Rest that would heal you to full, with the dice left", () => {
    const line = find(
      playbookView(cleric(25), "it", { mode: "exploration" }).plan,
      "short-rest-recovery"
    );
    expect(line).toMatchObject({
      shape: "anytime",
      before: "Sei a 25 su 44: un ",
      strong: "riposo breve",
      after: " ti porterebbe al massimo.",
      why: "Ti restano 5 Dadi Vita su 5.",
    });
  });

  it("a ritual says it costs time, not a slot", () => {
    const line = find(
      playbookView(cleric(), "it", { mode: "exploration" }).steps,
      "ritual-no-slot"
    );
    expect(line?.strong).toBe("Individuazione del Magico");
    expect(line?.why).toMatch(/^Ci mette 10 minuti in più, ma non spende uno slot/);
  });

  it("one use left reads singular in Italian (Action Surge)", () => {
    const doc = buildDevScenario("scn-champion-6");
    if (!doc) throw new Error("scenario missing");
    const line = find(playbookView(doc, "it").steps, "burst-tough-foe");
    expect(line?.why).toBe("Ti dà un'azione in più e ti resta 1 uso su 1.");
  });

  it("English: Sneak Attack's condition rides the attack's why", () => {
    const doc = buildDevScenario("scn-thief-reflexes");
    if (!doc) throw new Error("scenario missing");
    const line = find(playbookView(doc, "en").plan, "default-attack");
    expect(line?.after).toBe(" on the nearest enemy.");
    expect(line?.why).toMatch(
      /Sneak Attack with Advantage or an ally next to the target\.$/
    );
  });

  it("every why is one sentence of at most two reasons", () => {
    for (const locale of ["it", "en"] as const) {
      for (const line of playbookView(cleric(), locale, { mode: "exploration" }).steps) {
        if (!line.why) continue;
        expect(line.why.match(/\./g)?.length ?? 0, line.why).toBeLessThanOrEqual(2);
        expect(
          line.why.split(locale === "it" ? " e " : " and ").length
        ).toBeLessThanOrEqual(3);
      }
    }
  });
});
