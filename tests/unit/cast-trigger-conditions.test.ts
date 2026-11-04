/**
 * A cast-spell trigger's conditions beyond school and slot (rules sweep 2026-11-04):
 * "when you cast a cantrip", "when you cast the spell this feat grants", "when a
 * spell you cast deals Radiant damage"; and a once-per-turn limit counted on the
 * source's tracker.
 */
import { describe, expect, it } from "vitest";

import { conformHomebrewGrant, type Grant } from "@/lib/grants";
import { MOCK_CHARACTER } from "@/lib/mock";
import { castTriggerFacts, firedCastTriggers } from "@/lib/smart-tracker";
import type { CharacterDoc, CustomFeature } from "@/types/character";

import { customInstanceId } from "./__helpers__/custom-items";

const withRule = (grant: Grant, used = 0, total?: string): CharacterDoc => {
  const id = customInstanceId("rule");
  const feature: CustomFeature = {
    custom: true,
    title: "Rule",
    emoji: "*",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    grants: [grant],
    instanceId: id,
    ...(total
      ? { trackers: [{ id, label: "Rule", total, recovery: "long-rest" as const }] }
      : {}),
  };
  return {
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      features: [...MOCK_CHARACTER.character.features, feature],
    },
    session: {
      ...MOCK_CHARACTER.session,
      trackers: used ? { [feature.instanceId]: { used } } : {},
    },
  };
};

const spend = (when: object, limit?: object): Grant =>
  ({
    type: "trigger",
    on: "cast-spell",
    if: when,
    do: { kind: "hit-point-dice", max: 2, into: "damage" },
    ...(limit ? { limit } : {}),
  }) as Grant;

const fires = (doc: CharacterDoc, spellId: string, slotLevel: number | null) =>
  firedCastTriggers(doc, castTriggerFacts(spellId, slotLevel)).hitPointDice.length;

describe("cast-spell trigger conditions", () => {
  it("cantrip: a cantrip fires it, a levelled spell doesn't", () => {
    const doc = withRule(spend({ cantrip: true }));
    expect(fires(doc, "fire-bolt", null)).toBe(1);
    expect(fires(doc, "magic-missile", 1)).toBe(0);
  });

  it("spellId: only that spell", () => {
    const doc = withRule(spend({ spellId: "magic-missile" }));
    expect(fires(doc, "magic-missile", 1)).toBe(1);
    expect(fires(doc, "shield", 1)).toBe(0);
  });

  it("damageType: a spell of that damage type", () => {
    const doc = withRule(spend({ damageType: "radiant" }));
    expect(fires(doc, "guiding-bolt", 1)).toBe(1);
    expect(fires(doc, "fire-bolt", null)).toBe(0);
  });

  it("a limit stops it once the source's counter is spent", () => {
    const rule = spend({ slot: true }, { max: 1, per: "turn" });
    expect(fires(withRule(rule), "magic-missile", 1)).toBe(1);
    expect(fires(withRule(rule, 1), "magic-missile", 1)).toBe(0);
  });

  it("a limit with no max allows as many as the source's tracker holds (PB 4)", () => {
    const rule = spend({ cantrip: true }, { per: "long-rest" });
    expect(fires(withRule(rule, 3, "PB"), "fire-bolt", null)).toBe(1);
    expect(fires(withRule(rule, 4, "PB"), "fire-bolt", null)).toBe(0);
  });

  it("fromSource: only the spell that feature gave the character", () => {
    const doc = withRule(spend({ fromSource: "my-feat" }));
    const granted = {
      ...doc,
      character: {
        ...doc.character,
        spells: [
          ...doc.character.spells,
          {
            srdId: "magic-missile",
            prepared: true,
            freeCastSource: {
              sourceId: "my-feat",
              rest: "long" as const,
              usesPerRest: 1,
            },
          },
        ],
      },
    };
    const facts = (spellId: string) => castTriggerFacts(spellId, 1, granted);
    expect(firedCastTriggers(granted, facts("magic-missile")).hitPointDice).toHaveLength(
      1
    );
    expect(firedCastTriggers(granted, facts("shield")).hitPointDice).toHaveLength(0);
  });

  it("the homebrew schema keeps the new conditions and rejects a bad damage type", () => {
    const grant = spend({ cantrip: true, spellId: "x", damageType: "radiant" });
    expect(conformHomebrewGrant(grant)).toEqual(grant);
    expect(conformHomebrewGrant(spend({ damageType: "sparkly" }))).toBeNull();
  });
});
