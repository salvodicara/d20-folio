/**
 * target-step — the optional "On whom?" step between choosing an action (and its slot)
 * and committing it (owner 2026-10-09: an intermediate, skippable screen, like picking
 * an enemy to attack; how many targets varies per spell/action).
 *
 * Cases come from the real engine: SRD spells resolved for a wizard/cleric sheet, and
 * an equipped weapon. Blind spot: the encounter roster here is a hand-built fixture
 * (the encounter view has its own suite).
 */
import { describe, expect, it } from "vitest";
import { resolveActions, type ResolvedAction } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { actionAtCastLevel } from "@/lib/cast-resolution";
import { getSpellById, spells } from "@/data/spells";
import { activityFromSpell } from "@/lib/activities";
import { combatResolutionSpec } from "@/lib/combat-resolution";
import {
  targetStepFor,
  withSelfRecipient,
  type TargetRoster,
} from "@/features/character/center/target-step";
import { makeCharacterDoc } from "./_helpers";

const doc = makeCharacterDoc({
  classes: [{ classId: "wizard", level: 9 }],
  spells: spells.map((spell) => ({ srdId: spell.id })),
});
const rows = new Map(
  resolveActions(doc, "spellbook").map((row) => [row.id, localizeAction(row, "en")])
);
function spellAction(id: string, castLevel?: number): ResolvedAction {
  const row = rows.get(`spell-${id}`);
  if (!row) throw new Error(`no action for ${id}`);
  return castLevel ? actionAtCastLevel(row, getSpellById(id), castLevel) : row;
}

const SOLO: TargetRoster = { selfId: "pc-me", selfName: "Mirovel", rows: [] };
const FIGHT: TargetRoster = {
  selfId: "pc-me",
  selfName: "Mirovel",
  rows: [
    { id: "pc-me", kind: "pc", side: "ally", name: "Mirovel" },
    { id: "pc-bren", kind: "pc", side: "ally", name: "Bren" },
    { id: "pc-cora", kind: "pc", side: "ally", name: "Coralino" },
    { id: "pc-dana", kind: "pc", side: "ally", name: "Dana" },
    { id: "m-gob1", kind: "monster", side: "enemy", name: "Goblin 1" },
    { id: "m-gob2", kind: "monster", side: "enemy", name: "Goblin 2" },
    { id: "m-zomb", kind: "monster", side: "enemy", name: "Zombie" },
  ],
};
// Out of a fight in a campaign: the party, for the «Il gruppo» group.
const PARTY: TargetRoster = {
  selfId: "pc-me",
  selfName: "Mirovel",
  party: true,
  rows: [{ id: "pc-bren", kind: "pc", side: "ally", name: "Bren" }],
};
const ids = (action: ResolvedAction, roster: TargetRoster) =>
  targetStepFor(action, roster)?.candidates.map((c) => c.id);

describe("targetStepFor", () => {
  it("Bless: up to three, allies first with me on top; one more per slot level", () => {
    const step = targetStepFor(spellAction("bless"), FIGHT);
    expect(step?.max).toBe(3);
    expect(step?.candidates.slice(0, 3).map((c) => c.id)).toEqual([
      "pc-me",
      "pc-bren",
      "pc-cora",
    ]);
    expect(step?.candidates[0]).toMatchObject({ self: true, side: "ally" });
    expect(targetStepFor(spellAction("bless", 2), FIGHT)?.max).toBe(4);
  });

  it("a spell that lights a state on its recipient asks even solo (only me)", () => {
    expect(ids(spellAction("mage-armor"), SOLO)).toEqual(["pc-me"]);
  });

  it("solo, a pick that changes nothing is not asked (heals and blasts stay one tap)", () => {
    expect(targetStepFor(spellAction("healing-word"), SOLO)).toBeNull();
    expect(targetStepFor(spellAction("fire-bolt"), SOLO)).toBeNull();
  });

  it("an attack offers the enemies, one at a time, and never me", () => {
    const step = targetStepFor(spellAction("fire-bolt"), FIGHT);
    expect(step?.max).toBe(1);
    expect(step?.candidates.filter((c) => c.side === "enemy").map((c) => c.id)).toEqual([
      "m-gob1",
      "m-gob2",
      "m-zomb",
    ]);
    expect(step?.candidates.some((c) => c.self)).toBe(false);
  });

  it("an area offers every legal creature at once", () => {
    const step = targetStepFor(spellAction("fireball"), FIGHT);
    expect(step?.max).toBe(step?.candidates.length);
    expect(step?.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it("a self-only spell never asks", () => {
    expect(targetStepFor(spellAction("shield"), FIGHT)).toBeNull();
    expect(targetStepFor(spellAction("mirror-image"), FIGHT)).toBeNull();
  });

  it("never offers more than any SRD spell's own target count", () => {
    let checked = 0;
    for (const spell of spells) {
      const action = rows.get(`spell-${spell.id}`);
      if (!action) continue;
      const step = targetStepFor(action, FIGHT);
      const target = activityFromSpell(spell).target;
      if (target?.affinity === "self" && !action.standingEffect) {
        expect(step, spell.id).toBeNull();
      }
      const cap = combatResolutionSpec(action).targetCap;
      if (step) {
        expect(step.max, spell.id).toBeLessThanOrEqual(
          Math.min(cap, step.candidates.length)
        );
        expect(step.max, spell.id).toBeGreaterThanOrEqual(1);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("targetStepFor — an area catches everyone in it", () => {
  // An area spell that does not say "creatures of your choice" (no declared
  // affinity) hits every creature in it, friends and the caster included: Fireball
  // on a melee scrum must be able to name the ally standing next to the goblin.
  const areaSpells = spells.filter((spell) => {
    const row = rows.get(`spell-${spell.id}`);
    if (!row || !targetStepFor(row, FIGHT)) return false;
    return (
      combatResolutionSpec(row).area && row.summary.targeting?.affinity === undefined
    );
  });

  it("finds area spells in the catalogue", () => {
    expect(areaSpells.map((spell) => spell.id)).toContain("fireball");
  });

  it.each(areaSpells.map((spell) => [spell.id]))(
    "%s offers enemies, allies and me",
    (id) => {
      const offered = ids(spellAction(id), FIGHT) ?? [];
      expect(offered).toEqual(expect.arrayContaining(["m-gob1", "pc-bren", "pc-me"]));
      // Enemies still come first: they are the usual targets.
      expect(offered[0]).toBe("m-gob1");
    }
  );
});

describe("targetStepFor — the dead", () => {
  // SRD 5.2.1 Revivify: "A creature you touch that has died"; a dead creature is no
  // longer a target for anything else.
  const WAKE: TargetRoster = {
    selfId: "pc-me",
    selfName: "Mirovel",
    rows: [
      { id: "pc-me", kind: "pc", side: "ally", name: "Mirovel" },
      {
        id: "pc-bren",
        kind: "pc",
        side: "ally",
        name: "Bren",
        deathSaves: { successes: 0, failures: 3 },
      },
      {
        id: "pc-cora",
        kind: "pc",
        side: "ally",
        name: "Coralino",
        down: true,
        deathSaves: { successes: 1, failures: 2 },
      },
      { id: "m-gob1", kind: "monster", side: "enemy", name: "Goblin 1", down: true },
      { id: "m-gob2", kind: "monster", side: "enemy", name: "Goblin 2" },
    ],
  };

  it("a spell for the living never offers the dead (a dying ally still counts)", () => {
    expect(ids(spellAction("bless"), WAKE)).toEqual(["pc-me", "pc-cora"]);
    expect(ids(spellAction("fire-bolt"), WAKE)).toEqual(["m-gob2"]);
  });

  it("Revivify offers the dead ally too", () => {
    expect(ids(spellAction("revivify"), WAKE)).toContain("pc-bren");
  });
});

describe("out of a fight: the party («Il gruppo»)", () => {
  it("Mage Armor offers me and Bren, as the party", () => {
    const step = targetStepFor(spellAction("mage-armor"), PARTY);
    expect(step?.party).toBe(true);
    expect(step?.candidates.map((c) => c.id)).toEqual(["pc-me", "pc-bren"]);
  });

  it("a spell that leaves nothing standing does not ask (Fireball, Cure Wounds)", () => {
    expect(targetStepFor(spellAction("fireball"), PARTY)).toBeNull();
    expect(targetStepFor(spellAction("cure-wounds"), PARTY)).toBeNull();
  });

  it("each row carries its creature's portrait, for the round medallion", () => {
    const crop = { x: 1, y: 2, width: 50, height: 50 };
    const step = targetStepFor(spellAction("mage-armor"), {
      ...PARTY,
      selfPortraitUrl: "me.jpeg",
      rows: [
        {
          id: "pc-bren",
          kind: "pc",
          side: "ally",
          name: "Bren",
          portraitUrl: "bren.jpeg",
          portraitCrop: crop,
        },
      ],
    });
    expect(step?.candidates.map((c) => [c.portraitUrl, c.portraitCrop])).toEqual([
      ["me.jpeg", undefined],
      ["bren.jpeg", crop],
    ]);
  });

  it("in a fight the groups stay allies and enemies", () => {
    expect(targetStepFor(spellAction("bless"), FIGHT)?.party).toBeUndefined();
  });
});

describe("withSelfRecipient: Invisibility's state belongs to its target", () => {
  // "The spell ends early immediately after the target makes an attack roll, deals
  // damage, or casts a spell": cast on an ally, the caster holds no Invisibility of
  // their own, so the caster's attack can't end it.
  it("cast on an ally, the caster lights no state", () => {
    const cast = withSelfRecipient(spellAction("invisibility"), ["pc-bren"], "pc-me");
    expect(cast.activatesKey).toBeUndefined();
  });

  it("cast on myself, the state is mine", () => {
    const cast = withSelfRecipient(spellAction("invisibility"), ["pc-me"], "pc-me");
    expect(cast.activatesKey).toBe("spell-invisibility");
  });

  it("a state that does not end on its holder's acts stays the caster's (Bless)", () => {
    const bless = spellAction("bless");
    expect(withSelfRecipient(bless, ["pc-bren"], "pc-me").activatesKey).toBe(
      bless.activatesKey
    );
  });
});
