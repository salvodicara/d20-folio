vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
/**
 * The cockpit rail and `deriveCharacter` (the DM's party view, the PDF, the core API)
 * show the same numbers. The rail has no single derivation: `LeftHud` and
 * `CombatHeader` call the seams with their own inputs. This test makes those exact
 * calls, with those exact inputs, and compares them with `deriveCharacter` over every
 * dev scenario, as stored and worn down (Paralyzed, exhaustion 2).
 */
import { describe, expect, it, vi } from "vitest";

import { getEquipment } from "@/data/equipment";
import { buildDevScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import {
  aggregateCharacterGrants,
  computeCharacterAC,
  computedInitiativeBonus,
} from "@/lib/aggregate-character";
import { vitalExhaustion } from "@/lib/character-vitals";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { MOCK_CHARACTER } from "@/lib/mock";
import { effectiveWalkingSpeedFt } from "@/lib/smart-tracker";
import { deriveCharacter } from "@/lib/views/derive-character";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import { deriveSensesAndSpeeds } from "@/lib/views/sheet-view";
import type { CharacterDoc } from "@/types/character";

/** What the rail computes (LeftHud + CombatHeader), in deriveCharacter's vocabulary. */
function railView(doc: CharacterDoc) {
  const charData = doc.character;
  const { activeFeatures, grantBundleChoices, itemResources } = doc.session;
  const exhaustion = vitalExhaustion(doc.session);
  const conditions = effectiveSessionConditions(doc.session);
  const aggregate = aggregateCharacterGrants(charData, {
    activeFeatures,
    grantBundleChoices,
    itemResources,
  });
  const rows = deriveSavesAndChecks(charData, {
    exhaustion,
    activeFeatures,
    conditions,
    grantBundleChoices,
    itemResources,
  });
  const passive = (id: string) => {
    const row = rows.passives.find((p) => p.id === id);
    return row ? (row.override ?? row.computed) : 10;
  };
  const walkingSpeedFt =
    charData.speedOverride ?? effectiveWalkingSpeedFt(doc, getEquipment);
  const { senses, speeds } = deriveSensesAndSpeeds(aggregate, walkingSpeedFt);
  return {
    saves: rows.saves.map((s) => ({
      ability: s.id,
      bonus: s.bonus,
      proficient: s.proficient,
      ...(s.autoFailCause ? { autoFail: s.autoFailCause } : {}),
    })),
    skills: rows.skills.map((s) => ({
      id: s.id,
      ability: s.ability,
      proficiency: s.proficiency,
      bonus: s.bonus,
    })),
    passives: {
      perception: passive("perception"),
      insight: passive("insight"),
      investigation: passive("investigation"),
    },
    walkingSpeedFt,
    senses: senses.map((sense) => ({
      ...sense,
      rangeFt: charData.senseRangeOverrides?.[sense.kind] ?? sense.rangeFt,
    })),
    speeds: speeds.map((speed) => ({
      ...speed,
      rangeFt: charData.speedOverrides?.[speed.kind] ?? speed.rangeFt,
    })),
    ac: charData.acOverride ?? computeCharacterAC(charData, aggregate, itemResources),
    initiativeBonus:
      charData.initiativeBonusOverride ??
      computedInitiativeBonus(charData, aggregate, exhaustion),
  };
}

function derivedView(doc: CharacterDoc) {
  const sheet = deriveCharacter(doc);
  return {
    saves: sheet.saves,
    skills: sheet.skills,
    passives: sheet.passives,
    walkingSpeedFt: sheet.walkingSpeedFt,
    senses: sheet.senses,
    speeds: sheet.speeds,
    ac: sheet.ac,
    initiativeBonus: sheet.initiativeBonus,
  };
}

const worn = (doc: CharacterDoc): CharacterDoc => ({
  ...doc,
  session: { ...doc.session, exhaustion: 2, conditions: ["paralyzed"] },
});

const docs: [string, CharacterDoc][] = [
  ["mock", MOCK_CHARACTER],
  ...Object.keys(DEV_SCENARIOS).flatMap((id): [string, CharacterDoc][] => {
    const doc = buildDevScenario(id);
    return doc ? [[id, doc]] : [];
  }),
];

describe("the rail shows what deriveCharacter derives", () => {
  it("covers the fixtures", () => {
    expect(docs.length).toBeGreaterThan(30);
  });

  it.each(docs)("%s as stored", (_id, doc) => {
    expect(railView(doc)).toEqual(derivedView(doc));
  });

  it.each(docs)("%s paralyzed with exhaustion 2", (_id, doc) => {
    expect(railView(worn(doc))).toEqual(derivedView(worn(doc)));
  });
});
