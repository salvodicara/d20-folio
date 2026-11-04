/** Conformance, category 16: DM adjudication (corpus.md § 16). */
import { castHandsView } from "@/lib/views/cast-hands-view";
import { srdText } from "@/lib/loc-text";
import { effectiveTableRules } from "@/lib/table-rules";
import { describe, expect } from "vitest";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { initiativeRollState } from "@/lib/compute";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { checkSucceeded, actionCheckSkills, type CheckResult } from "@/lib/play/checks";
import { helpBenefit } from "@/lib/play/help";
import { setSurprised } from "@/lib/play/surprise";
import { breathHoldRounds, holdBreath, passBreathRounds } from "@/lib/play/suffocation";
import { takeDamage } from "@/lib/play/damage";
import { setExhaustion } from "@/lib/play/vitals";
import { zeroHpSavers } from "@/lib/play/zero-hp-savers";
import { withOverride, isHandSet, termPart, breakdownTotal } from "@/lib/value-breakdown";
import { levelUp } from "@/lib/level-up";
import { classFeatures } from "@/data/classes";
import { spells } from "@/data/spells";
import { SRD_FEATS } from "@/data/feats";
import { asRaceId } from "@/data/srd-names";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "../_helpers";
import { rule } from "./rule";

const lyra = (session: Partial<CharacterDoc["session"]> = {}): CharacterDoc => ({
  ...MOCK_CHARACTER,
  session: { ...MOCK_CHARACTER.session, conditions: [], ...session },
});

describe("conformance · 16. DM adjudication", () => {
  rule({ category: 16, case: "Influence", source: "GLOSS", status: "works" }, () => {
    // The DM sets the DC (15 or the monster's INT, whichever is higher); no DC, no verdict.
    expect(actionCheckSkills("base-influence")).toContain("persuasion");
    const dc = Math.max(15, 18);
    expect(checkSucceeded({ skill: "persuasion", total: 17, dc })).toBe(false);
    expect(checkSucceeded({ skill: "persuasion", total: 18, dc })).toBe(true);
    expect(checkSucceeded({ skill: "persuasion", total: 18 })).toBeUndefined();
  });

  rule({ category: 16, case: "Help", source: "GLOSS; SAC #21", status: "M17" }, () => {
    // Helping an ally lands one Advantage on their next check, until used or the
    // start of the helper's next turn.
    const benefit = helpBenefit(
      ["pc-ally"],
      [{ id: "pc-ally", kind: "pc", name: "Cael" }]
    );
    expect(benefit).toMatchObject({
      kind: "check",
      duration: { kind: "until-used", uses: 1 },
    });
  });

  rule(
    {
      category: 16,
      case: "Surprise 2024",
      source: "GLOSS; rpgbot 2024 transition guide",
      status: "works",
    },
    () => {
      // Surprised: Disadvantage on Initiative (no lost turn).
      const surprised = lyra();
      const session = setSurprised(surprised, true);
      if (!session) throw new Error("surprise not lit");
      expect(
        initiativeRollState(aggregateCharacterGrants(surprised.character, session))
      ).toBe("disadvantage");
      // An Invisible creature has Advantage on Initiative.
      expect(
        resolveConditionEffects(["invisible"], {}).advantages.some(
          (a) => a.rollType === "initiative"
        )
      ).toBe(true);
    }
  );

  rule(
    {
      category: 16,
      case: "Improvised actions",
      source: "SAC #38; SAC #54",
      status: "works",
    },
    () => {
      // No written rule: the DM's ruling lands as a hand-set number that stays marked.
      const computed = [termPart("breakdown.base", 10)];
      const ruled = withOverride(computed, 12);
      expect(breakdownTotal(ruled)).toBe(12);
      expect(isHandSet(ruled)).toBe(true);
      expect(isHandSet(computed)).toBe(false);
    }
  );

  rule(
    { category: 16, case: "Natural 1 on checks", source: "SAC #3", status: "works" },
    () => {
      const check: CheckResult = { skill: "athletics", total: 21, dc: 15 };
      // RAW: a natural 1 on a check is not an automatic failure.
      expect(checkSucceeded(check)).toBe(true);
      // A table that rules "nat 1 fails" needs the table rule passed in.
      expect(checkSucceeded({ ...check, face: 1 })).toBe(true);
      const nat1Fails = effectiveTableRules({ tableRules: { nat1: { checks: "fail" } } });
      expect(checkSucceeded({ ...check, face: 1 }, nat1Fails)).toBe(false);
    }
  );

  rule(
    {
      category: 16,
      case: "Dispelling and what counts as magic",
      source: "SAC #9; SAC #118; SAC #150",
      status: "works",
    },
    async () => {
      // Dispel Magic ends one target's share of a spell: a level 3 or lower spell
      // ends; a higher one needs an ability check (DC 10 + its level).
      const dispel = spells.find((s) => s.id === "dispel-magic");
      expect(dispel?.instantaneous).toBe(true);
      expect(dispel?.effects).toEqual([
        { kind: "dispel", autoMaxLevel: 3, perUpcast: 1 },
      ]);
      // The case works once the sheet reaches another creature's spell state.
      const id = "@/lib/play/dispel";
      const reader = (await import(/* @vite-ignore */ id)) as Record<string, unknown>;
      expect(typeof reader.dispelOutcome).toBe("function");
    }
  );

  rule(
    {
      category: 16,
      case: "Divine Intervention vs long casting times",
      source: "KIBBLES #13",
      status: "works",
    },
    () => {
      const di = classFeatures.find((f) => f.id === "cleric-divine-intervention");
      expect(di?.grants).toContainEqual(
        expect.objectContaining({
          type: "free-cast-from-list",
          spellList: "cleric",
          maxSpellLevel: 5,
        })
      );
    }
  );

  rule(
    {
      category: 16,
      case: "Somatic components and free hands",
      source: "SAC #107; KIBBLES #26",
      status: "works",
    },
    () => {
      // A sword in one hand and a Shield in the other leave no hand for a Somatic
      // component. Hands are derived from play (the equipped Shield, the weapon last
      // swung), never stored; the cast dialog warns and offers to stow the weapon.
      const doc = {
        ...MOCK_CHARACTER,
        character: {
          ...MOCK_CHARACTER.character,
          equipment: [{ srdId: "shield", equipped: true }],
        },
        session: {
          ...MOCK_CHARACTER.session,
          logEntries: [
            {
              id: "swing",
              ts: 1,
              event: {
                kind: "action-use" as const,
                action: srdText("equipment", "longsword", "name"),
                effect: "attack" as const,
                slot: "action" as const,
              },
            },
          ],
        },
      };
      expect(castHandsView(doc, { components: { v: true, s: true, m: false } })).toEqual({
        kind: "no-free-hand",
        stow: true,
        shield: true,
        weaponId: "longsword",
      });
    }
  );

  rule(
    {
      category: 16,
      case: "The DM resolves Wild Shape gear, anatomy and planes",
      source: "WIKI druid:main; ITEMS",
      status: "works",
    },
    () => {
      // A ruling sits above the computed number and stays visible as hand-set.
      const ruled = withOverride([termPart("breakdown.base", 13)], 15);
      expect(isHandSet(ruled)).toBe(true);
      expect(breakdownTotal(ruled)).toBe(15);
    }
  );

  rule(
    {
      category: 16,
      case: "Simultaneous effects order",
      source: "GLOSS",
      status: "works",
    },
    () => {
      // At-0 savers are offered for the player to pick, never auto-applied.
      const orc = makeCharacterDoc(
        { race: asRaceId("orc") },
        { hp: { current: 0, temp: 0 } }
      );
      const offers = zeroHpSavers(orc);
      expect(offers.length).toBeGreaterThan(0);
      expect(offers[0]?.sourceId).toContain("relentless-endurance");
    }
  );

  rule(
    {
      category: 16,
      case: "Suggestion's wording",
      source: "KIBBLES #33; SAC #142",
      status: "works",
    },
    () => {
      // The wording is the DM's call; the engine only knows the save and the duration.
      const suggestion = spells.find((s) => s.id === "suggestion");
      expect(suggestion).toMatchObject({
        saveAbility: "WIS",
        concentration: true,
        duration: { kind: "hours", amount: 8 },
      });
    }
  );

  rule({ category: 16, case: "Suffocation", source: "GLOSS", status: "works" }, () => {
    // 1 + CON mod minutes (minimum 30 seconds), then a level of Exhaustion per turn.
    expect(breathHoldRounds(14)).toBe(30);
    expect(breathHoldRounds(8)).toBe(5);
    const holding = lyra({ exhaustion: 0 });
    const session = holdBreath(holding);
    if (!session?.breath) throw new Error("not holding breath");
    const rounds = session.breath.roundsLeft;
    const after = passBreathRounds({ ...holding, session }, rounds + 2);
    expect(after?.exhaustion).toBe(2);
  });

  rule(
    { category: 16, case: "Environmental hazards", source: "GLOSS", status: "works" },
    () => {
      // Falling damage with no attacker still runs the pipeline: temp HP first.
      const hit = takeDamage(lyra(), 10);
      expect(hit?.session.hp).toMatchObject({ current: 33, temp: 0 });
    }
  );

  rule(
    {
      category: 16,
      case: "Planes and extradimensional spaces",
      source: "SAC #8",
      status: "M19",
    },
    async () => {
      // A familiar inside an extradimensional space is on no plane: the link's
      // "same plane" check must know where each creature is.
      const familiar: Record<string, unknown> = await import("@/lib/familiar");
      expect(familiar.sharesPlane).toBeTypeOf("function");
    }
  );

  rule(
    { category: 16, case: "Feats past level 20", source: "SAC #11", status: "works" },
    () => {
      // Level 20 is the cap; Epic Boons are feats the DM can keep handing out.
      const twenty = makeCharacterDoc({ classes: [{ classId: "fighter", level: 20 }] });
      expect(() => levelUp(twenty.character, 21)).toThrow();
      expect(SRD_FEATS.filter((f) => f.category === "epic-boon").length).toBeGreaterThan(
        3
      );
    }
  );

  rule(
    { category: 16, case: "Exhaustion in chases", source: "ERRATA", status: "works" },
    () => {
      // A chase's failed check adds one level; Exhaustion is a single stacking track.
      const once = setExhaustion(lyra({ exhaustion: 1 }), 2);
      expect(once?.exhaustion).toBe(2);
      expect(setExhaustion(lyra({ exhaustion: 2 }), 2)).toBeNull();
    }
  );

  rule(
    {
      category: 16,
      case: "Wall of Force and Forcecage",
      source: "KIBBLES #24",
      status: "works",
    },
    () => {
      // Reference spells: the DM adjudicates what gets through.
      for (const id of ["wall-of-force", "forcecage"]) {
        expect(spells.find((s) => s.id === id)?.source, id).toBe("SRD");
      }
    }
  );
});
