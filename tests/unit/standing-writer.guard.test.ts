/**
 * Every spell that leaves a state on the creature it names (a `while-active` grant
 * with `recipient: "selected"`, or a mark) reaches that creature (the writer deleted
 * in 9cbb720bc went unnoticed). Walks the composed catalogue, not a hand list: an
 * automatic one is written when the cast commits (`standingAtCommit`); one that lands
 * on a failed save or a hit carries the state the outcome writes.
 */
import { describe, expect, it } from "vitest";

import { spells } from "@/data/spells";
import { combatResolutionSpec } from "@/lib/combat-resolution";
import { standingAtCommit } from "@/lib/play/standing-effects";
import { localizeActions } from "@/lib/views/combat-action-view";

import { makeCharacterDoc } from "./_helpers";

const COMBAT_CASTS = new Set(["action", "bonus action", "reaction"]);

const named = spells.filter((spell) => {
  const grants = JSON.stringify(spell.grants ?? []);
  return grants.includes('"recipient":"selected"') || grants.includes('"markScope"');
});
// A summoned creature's own attack puts its state (Giant Insect's web): the outcome
// writers carry it, not the cast.
const leavesStanding = named.filter(
  (spell) =>
    COMBAT_CASTS.has(spell.castingTime) && !spell.companion && !spell.summonedMonsters
);
// Cast before a fight (Heroes' Feast, Foresight): no encounter holds another PC's
// state yet. Counted so the gap stays visible.
const outOfFight = named.filter((spell) => !COMBAT_CASTS.has(spell.castingTime));

function castAction(spellId: string, classId: string, level: number) {
  const doc = makeCharacterDoc({
    classId,
    level: 20,
    spells: [{ srdId: spellId, prepared: true }],
    spellSlots: Array.from({ length: 9 }, (_, i) => ({ level: i + 1, total: 2 })),
  });
  return localizeActions(doc, "en").find(
    (a) => a.spellId === spellId && (a.slotLevel ?? level) >= level
  );
}

describe("a state a spell leaves on the creature it names", () => {
  it("covers the catalogue", () => {
    expect(leavesStanding.length).toBeGreaterThan(10);
  });

  it("names the ones cast before a fight (no encounter carries them yet)", () => {
    expect(outOfFight.map((s) => s.id).sort()).toEqual(
      ["foresight", "heroes-feast", "wind-walk"].filter((id) =>
        named.some((s) => s.id === id)
      )
    );
  });

  for (const spell of leavesStanding) {
    it(`${spell.id} reaches its target`, () => {
      const action = castAction(spell.id, spell.classes[0] ?? "wizard", spell.level);
      expect(action, "the spell resolves to a cast").toBeDefined();
      if (!action) return;
      const spec = combatResolutionSpec(action);
      expect(spec.standingEffect, "the cast carries the state").toBeDefined();
      if (spec.kind === "automatic") {
        expect(standingAtCommit(action), "written when the cast commits").not.toBeNull();
      }
    });
  }
});
