/**
 * Conditional flat AC bonuses hold only while their armor condition does.
 *
 * Cases come from the catalogue text: every `ac-bonus` grant whose owner's
 * English description conditions the bonus on what you wear ("wearing no armor
 * and using no shield" → Bracers of Defense; "while you're wearing … armor" →
 * the Defense fighting style) must carry the matching `condition`, and the
 * shown AC (and its breakdown tip) must add the bonus only under that loadout.
 */
import { describe, expect, it } from "vitest";

import {
  aggregateCharacterGrants,
  computeCharacterAcBreakdown,
  effectiveAC,
} from "@/lib/aggregate-character";
import { breakdownTotal } from "@/lib/value-breakdown";
import { getMagicItem } from "@/data/magic-items";
import { createMagicItemEquipmentRefs } from "@/lib/magic-item-equipment";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";
import { buildCurrentAutomationCorpus } from "@tests/unit/__helpers__/automation-coverage";

type Condition = "no-armor-no-shield" | "armored";
type Loadout = "unarmored" | "armored" | "shield";

const NO_ARMOR_NO_SHIELD = /wearing no armor and using no shield/i;
// "While you're wearing Light, Medium, or Heavy armor" / "While you are wearing
// armor" — but not an armor item's own "while wearing this armor".
const ARMORED =
  /\bwhile you(?:'re|’re| are) wearing (?:(?:light|medium|heavy|or|,)\s*)*armor\b/i;

function expectedCondition(description: string): Condition | undefined {
  if (NO_ARMOR_NO_SHIELD.test(description)) return "no-armor-no-shield";
  if (ARMORED.test(description)) return "armored";
  return undefined;
}

function acBonusGrants(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(acBonusGrants);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const own = record.type === "ac-bonus" ? [record] : [];
  return [...own, ...Object.values(record).flatMap(acBonusGrants)];
}

interface Source {
  key: string;
  schema: string;
  id: string;
  amount: number;
  condition: Condition | undefined;
  expected: Condition | undefined;
}

async function acBonusSources(): Promise<Source[]> {
  const entities = await buildCurrentAutomationCorpus();
  const out: Source[] = [];
  for (const entity of entities) {
    const english = entity.presenters?.[0]?.localized[0] as
      | { description?: unknown }
      | undefined;
    const description =
      typeof english?.description === "string" ? english.description : "";
    for (const grant of acBonusGrants(entity.data.grants)) {
      out.push({
        key: entity.entityKey,
        schema: entity.schema,
        id: String(entity.data.id),
        amount: typeof grant.amount === "number" ? grant.amount : 0,
        condition: grant.condition as Condition | undefined,
        expected: expectedCondition(description),
      });
    }
  }
  return out;
}

const SESSION = { activeFeatures: [], grantBundleChoices: {} };

function character(loadout: Loadout, source?: Source): CharacterDoc["character"] {
  const equipment: CharacterDoc["character"]["equipment"] = [];
  if (loadout === "armored") equipment.push({ srdId: "leather-armor", equipped: true });
  if (loadout === "shield") equipment.push({ srdId: "shield", equipped: true });
  const features: CharacterDoc["character"]["features"] = [];
  if (source?.schema === "magic-item") {
    const item = getMagicItem(source.id);
    if (!item) throw new Error(`unknown magic item ${source.id}`);
    for (const ref of createMagicItemEquipmentRefs(item)) {
      equipment.push({
        ...ref,
        equipped: true,
        ...(item.attunement ? { attuned: true } : {}),
      });
    }
  } else if (source) {
    features.push({ srdId: source.id });
  }
  return {
    ...MOCK_CHARACTER.character,
    classes: [{ classId: "fighter", level: 2 }],
    acOverride: null,
    equipment,
    features,
  };
}

function holds(condition: Condition, loadout: Loadout): boolean {
  return condition === "armored" ? loadout === "armored" : loadout === "unarmored";
}

describe("conditional ac-bonus — catalogue text drives the condition", () => {
  it("every ac-bonus grant carries the armor condition its description states", async () => {
    const sources = await acBonusSources();
    const conditioned = sources.filter((s) => s.expected !== undefined);
    // The catalogue does condition some AC bonuses (Bracers, Defense, …).
    expect(conditioned.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect({ key: s.key, condition: s.condition }).toEqual({
        key: s.key,
        condition: s.expected,
      });
    }
  });

  it("the AC adds each conditioned bonus only under its loadout, tip = total", async () => {
    const conditioned = (await acBonusSources()).filter(
      (s): s is Source & { expected: Condition } => s.expected !== undefined
    );
    for (const s of conditioned) {
      for (const loadout of ["unarmored", "armored", "shield"] as const) {
        const without = effectiveAC(character(loadout), SESSION);
        const withSource = character(loadout, s);
        const ac = effectiveAC(withSource, SESSION);
        expect({ key: s.key, loadout, delta: ac - without }).toEqual({
          key: s.key,
          loadout,
          delta: holds(s.expected, loadout) ? s.amount : 0,
        });
        const parts = computeCharacterAcBreakdown(
          withSource,
          aggregateCharacterGrants(withSource, SESSION)
        );
        expect(breakdownTotal(parts)).toBe(ac);
      }
    }
  });
});
