/**
 * Catalogue data gaps (audit 2026-10-11) — feats and class features whose SRD
 * text states a mechanic an EXISTING live grant kind already expresses. Each
 * case reads its rule from the English SRD catalogue first (so the test breaks
 * if the rule text and the modelled effect drift apart), then asserts the
 * effect is visible where the player reads it: the aggregate seam the rail /
 * feature card consumes, or the resolved Play-board action.
 */
import { describe, expect, it } from "vitest";
import { srdEn } from "@/i18n/srd-en";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import { resolveActions } from "@/lib/smart-tracker";
import { activatableToggles, rollFloorVMs } from "@/lib/views/tracker-view";
import { localizeAction } from "@/lib/views/combat-action-view";
import itFeats from "@/i18n/it/srd/feats.json";
import { DAMAGE_TYPES } from "@/types/damage";

const srdTextIt = (id: string): string =>
  (itFeats as Record<string, { description?: string }>)[id]?.description ?? "";

const SCORES = { STR: 20, DEX: 14, CON: 16, INT: 10, WIS: 12, CHA: 10 } as const;

function build(spec: Partial<ScenarioSpec> & Pick<ScenarioSpec, "classId" | "level">) {
  return buildScenario({
    name: "Gap probe",
    raceId: "human",
    background: "soldier",
    abilityScores: { ...SCORES },
    ...spec,
  });
}

/** The bold benefit name in an SRD feat text that mentions `hint` ("**Shadowy Form.**"). */
function benefitName(
  text: string,
  hint = "Resistance|Resistenza|hit instead|colpire invece"
): string {
  const block = text.split(/\n\n/).find((para) => new RegExp(hint).test(para));
  return /^\*\*([^*]+?)\.\*\*/.exec(block ?? "")?.[1] ?? "";
}

describe("Boon of the Night Spirit — Shadowy Form is a toggled resistance state", () => {
  const text = srdEn("feat", "boon-of-the-night-spirit", "description") ?? "";
  const itText = srdTextIt("boon-of-the-night-spirit");
  // "Resistance to all damage except Force, Psychic, and Radiant."
  const except = /Resistance to all damage except ([^.]+)\./.exec(text)?.[1] ?? "";
  const excluded = new Set(
    except
      .split(/,|\band\b/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  const expected = DAMAGE_TYPES.filter((d) => !excluded.has(d)).sort();

  it("reads the excluded types from the SRD text", () => {
    expect([...excluded].sort()).toEqual(["force", "psychic", "radiant"]);
  });

  it("the toggle lights every other damage resistance, and only while on", () => {
    const doc = build({
      classId: "fighter",
      level: 19,
      extraFeatures: [{ srdId: "boon-of-the-night-spirit" }],
    });
    const off = aggregateCharacterGrants(doc.character, doc.session);
    const toggle = off.activatableGroups.find((g) =>
      g.key.startsWith("boon-of-the-night-spirit")
    );
    expect(toggle).toBeDefined();
    for (const d of expected) expect(off.damageResistances.has(d)).toBe(false);
    const [vmEn] = activatableToggles(toggle ? [toggle] : [], "en");
    const [vmIt] = activatableToggles(toggle ? [toggle] : [], "it");
    // The toggle names the state only; its lighting condition lives in the
    // feat description, so the chip stays short enough for the rail.
    expect(vmEn?.label).toBe(benefitName(text));
    expect(vmIt?.label).toBe(benefitName(itText));

    const on = aggregateCharacterGrants(doc.character, {
      ...doc.session,
      activeFeatures: [toggle?.key ?? ""],
    });
    expect([...on.damageResistances].sort()).toEqual(expected);
  });
});

describe("Boon of Combat Prowess — Peerless Aim is a once-per-turn free use", () => {
  it("the SRD text limits it to once until the start of your next turn", () => {
    const text = srdEn("feat", "boon-of-combat-prowess", "description") ?? "";
    expect(text).toMatch(/Peerless Aim/);
    expect(text).toMatch(/can't use it again until the start of your next turn/);
  });

  it("the Play board offers a Free row capped at one use per turn", () => {
    const doc = build({
      classId: "fighter",
      level: 19,
      extraFeatures: [{ srdId: "boon-of-combat-prowess" }],
    });
    const row = resolveActions(doc).find((a) =>
      a.id.startsWith("boon-of-combat-prowess")
    );
    expect(row).toMatchObject({ type: "free", maxUsesPerTurn: 1 });
  });

  it("the row is titled by the benefit, not the feat", () => {
    const doc = build({
      classId: "fighter",
      level: 19,
      extraFeatures: [{ srdId: "boon-of-combat-prowess" }],
    });
    const row = resolveActions(doc).find((a) =>
      a.id.startsWith("boon-of-combat-prowess")
    );
    if (!row) throw new Error("no Peerless Aim row");
    const en = srdEn("feat", "boon-of-combat-prowess", "description") ?? "";
    expect(localizeAction(row, "en").name).toBe(benefitName(en));
    expect(localizeAction(row, "it").name).toBe(
      benefitName(srdTextIt("boon-of-combat-prowess"))
    );
  });
});

describe("Barbarian Indomitable Might — Strength checks and saves floor at the score", () => {
  const text = srdEn("class-feature", "barbarian-indomitable-might", "description") ?? "";
  const rollTypes = [
    /Strength check/.test(text) ? "check" : null,
    /Strength saving throw/.test(text) ? "save" : null,
  ].filter(Boolean);

  it("the SRD text covers both checks and saving throws", () => {
    expect(rollTypes).toEqual(["check", "save"]);
  });

  it("a Barbarian 18 reads one Passives note per roll type, in EN and IT", () => {
    const doc = build({ classId: "barbarian", level: 18 });
    const agg = aggregateCharacterGrants(doc.character, doc.session);
    const floors = agg.rollFloors.filter(
      (f) => f.sourceId === "barbarian-indomitable-might"
    );
    expect(floors.map((f) => f.rollType).sort()).toEqual(rollTypes);
    const en = rollFloorVMs(floors, "en").map((v) => v.description);
    const it = rollFloorVMs(floors, "it").map((v) => v.description);
    for (const line of en) expect(line).toMatch(/Strength score/);
    for (const line of it) expect(line).toMatch(/Forza/);
  });

  it("a Barbarian 17 has no such note yet", () => {
    const doc = build({ classId: "barbarian", level: 17 });
    const agg = aggregateCharacterGrants(doc.character, doc.session);
    expect(agg.rollFloors.some((f) => f.sourceId === "barbarian-indomitable-might")).toBe(
      false
    );
  });
});
