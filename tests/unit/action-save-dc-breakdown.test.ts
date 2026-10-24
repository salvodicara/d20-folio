/**
 * Every number explained: the save DC an action forces (a spell, a feature
 * action, a Grapple or Shove, a Cunning Strike option) carries the lines it is
 * made of, from the same builders the spell and feature DC tips use. A DC pinned
 * by hand (a manual override, a casting source's printed DC) has no lines. The
 * guard sweeps every dev scenario and every resolved action, with each
 * concentration spell also held and each Battle Master knowing every maneuver,
 * so the lines always sum to the DC shown.
 */

import { describe, expect, it } from "vitest";

import { SRD_MANEUVERS } from "@/data/maneuvers";
import { concentrationValue } from "@/lib/concentration";
import { DEV_SCENARIOS, buildDevScenario } from "@/lib/dev-scenarios";
import {
  actionSaveDc,
  resolveActions,
  resolveCunningStrikeOptions,
  type RawResolvedAction,
} from "@/lib/smart-tracker";
import { breakdownTotal, type RawBreakdownPart } from "@/lib/value-breakdown";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function labelOf(part: RawBreakdownPart): string {
  if ("term" in part.label) return `term:${part.label.term}`;
  if ("ability" in part.label) return `ability:${part.label.ability}`;
  return "loc";
}
const rows = (parts: ReadonlyArray<RawBreakdownPart> | null | undefined) =>
  (parts ?? []).map((p) => [labelOf(p), "value" in p ? p.value : 0]);

const SCORES = { STR: 16, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 };

function wizard(extra: Parameters<typeof makeCharacterDoc>[0] = {}): CharacterDoc {
  return makeCharacterDoc({
    classId: "wizard",
    level: 5,
    abilityScores: SCORES,
    spells: [{ srdId: "hold-person", prepared: true }],
    spellcasting: {
      ability: "INT",
      preparedCaster: true,
      preparedMax: 6,
      saveDCOverride: null,
      attackBonusOverride: null,
    },
    ...extra,
  });
}

const action = (doc: CharacterDoc, id: string) => {
  const found = resolveActions(doc).find((a) => a.id === id);
  if (!found) throw new Error(`no action ${id}`);
  return found;
};

describe("action save DC breakdown", () => {
  it("explains a Wizard's spell DC: 8 + PB + INT", () => {
    const dc = actionSaveDc(action(wizard(), "spell-hold-person").summary);
    expect(dc?.total).toBe(15);
    expect(rows(dc?.parts)).toEqual([
      ["term:breakdown.base", 8],
      ["term:character.proficiencyBonus", 3],
      ["ability:INT", 4],
    ]);
  });

  it("adds an item's spell save DC bonus as its own line", () => {
    const doc = wizard({
      equipment: [{ srdId: "robe-of-the-archmagi", equipped: true, attuned: true }],
    });
    const dc = actionSaveDc(action(doc, "spell-hold-person").summary);
    expect(dc?.total).toBe(17);
    expect(rows(dc?.parts)).toEqual([
      ["term:breakdown.base", 8],
      ["term:character.proficiencyBonus", 3],
      ["ability:INT", 4],
      ["term:breakdown.spell.bonus", 2],
    ]);
  });

  it("has no lines when a manual override pins the DC", () => {
    const doc = wizard({
      spellcasting: {
        ability: "INT",
        preparedCaster: true,
        preparedMax: 6,
        saveDCOverride: 19,
        attackBonusOverride: null,
      },
    });
    const dc = actionSaveDc(action(doc, "spell-hold-person").summary);
    expect(dc).toEqual({ total: 19, parts: null });
  });

  it("explains a Monk's Grapple DC from Strength", () => {
    const doc = makeCharacterDoc({ classId: "monk", level: 5, abilityScores: SCORES });
    const dc = actionSaveDc(action(doc, "base-grapple").summary);
    expect(dc?.total).toBe(14);
    expect(rows(dc?.parts)).toEqual([
      ["term:breakdown.base", 8],
      ["term:character.proficiencyBonus", 3],
      ["ability:STR", 3],
    ]);
  });

  it("explains a Rogue's Cunning Strike DC from Dexterity", () => {
    const doc = makeCharacterDoc({
      class: "rogue",
      level: 5,
      abilityScores: { ...SCORES, DEX: 18 },
      features: [{ srdId: "rogue-cunning-strike" }],
    });
    const poison = resolveCunningStrikeOptions(doc).options.find(
      (o) => o.optionId === "poison"
    );
    expect(poison?.saveDc).toBe(15);
    expect(rows(poison?.saveDcParts)).toEqual([
      ["term:breakdown.base", 8],
      ["term:character.proficiencyBonus", 3],
      ["ability:DEX", 4],
    ]);
    const withdraw = resolveCunningStrikeOptions(doc).options.find(
      (o) => o.optionId === "withdraw"
    );
    expect(withdraw?.saveDcParts).toBeNull();
  });

  it("has nothing to explain for an action without a save", () => {
    expect(actionSaveDc(action(wizard(), "base-dodge").summary)).toBeNull();
  });
});

/** A Battle Master scenario knowing every maneuver (each save-forcing one is a
 *  row with its own DC); `undefined` for any other character. */
function knowingEveryManeuver(doc: CharacterDoc): CharacterDoc | undefined {
  const classes = doc.character.classes;
  if (!classes.some((c) => c.subclassId === "battle-master")) return undefined;
  const maneuverChoices = SRD_MANEUVERS.map((m) => m.id);
  return {
    ...doc,
    character: {
      ...doc.character,
      classes: classes.map((c) =>
        c.subclassId === "battle-master" ? { ...c, maneuverChoices } : c
      ),
    },
  };
}

/** Every scenario, plus one variant per concentration spell held (its follow-up
 *  row carries its own DC) and one per Battle Master knowing every maneuver. */
function* sweep(): Generator<[string, CharacterDoc, RawResolvedAction]> {
  for (const id of Object.keys(DEV_SCENARIOS)) {
    const doc = buildDevScenario(id);
    if (!doc) continue;
    const maneuvers = knowingEveryManeuver(doc);
    if (maneuvers) {
      for (const a of resolveActions(maneuvers)) yield [`${id}+maneuvers`, maneuvers, a];
    }
    for (const scope of ["combat", "spellbook"] as const) {
      const actions = resolveActions(doc, scope);
      for (const a of actions) yield [id, doc, a];
      for (const a of actions) {
        if (!a.concentration || !a.spellId) continue;
        const held: CharacterDoc = {
          ...doc,
          session: { ...doc.session, concentration: concentrationValue(a.spellId) },
        };
        for (const b of resolveActions(held, scope)) {
          if (b.id.endsWith("-recurring")) yield [`${id}+${a.spellId}`, held, b];
        }
      }
    }
  }
}

describe("action save DC guard", () => {
  it("every action DC equals the sum of its lines, across every dev scenario", () => {
    let explained = 0;
    for (const [id, doc, a] of sweep()) {
      const { saveDC } = a.summary;
      const dc = actionSaveDc(a.summary);
      if (saveDC == null) {
        expect(dc, `${id} ${a.id}`).toBeNull();
        continue;
      }
      expect(dc?.total, `${id} ${a.id}`).toBe(saveDC);
      const pinned = doc.character.spellcasting?.saveDCOverride != null;
      if (!pinned) expect(dc?.parts, `${id} ${a.id} has no lines`).not.toBeNull();
      if (dc?.parts) {
        expect(breakdownTotal(dc.parts), `${id} ${a.id}`).toBe(saveDC);
        explained++;
      }
    }
    // Spells, feature actions and the Grapple/Shove rows all reach the sweep.
    expect(explained).toBeGreaterThan(30);
  });

  it("every save-forcing maneuver a Battle Master knows reaches the sweep", () => {
    const forcing = SRD_MANEUVERS.filter((m) => m.save).map((m) => m.id);
    const swept = new Set<string>();
    for (const [, , a] of sweep()) {
      if (a.id.startsWith("granted-action:") && a.summary.saveDcParts) {
        swept.add(a.id.split(":")[1] ?? "");
      }
    }
    expect([...swept].sort()).toEqual([...forcing].sort());
  });
});
