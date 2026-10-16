/**
 * Situational attack facts as one-tap, turn-scoped states (SRD 5.2.1 "Unseen
 * Attackers and Targets", "Ranged Attacks in Close Combat", "Range", "Underwater
 * Combat", "Mounted Combat"). The cases come from the reference tables the states
 * are built from (`src/data/combat-variants.ts`): each rule must match its own
 * SRD sentence, and the card verdicts are checked over every weapon in the SRD
 * weapon table, plus spell attacks.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import {
  ATTACK_SITUATION_REFERENCE,
  UNDERWATER_COMBAT_REFERENCE,
} from "@/data/combat-variants";
import { SRD_WEAPONS } from "@/data/weapons";
import {
  FIGHT_SITUATIONS,
  SITUATIONAL_STATES,
  litSituations,
  situationKey,
  type SituationId,
} from "@/lib/situational-states";
import {
  attackCardFacts,
  endFightSituations,
  setSituation,
  situationalAttackChips,
  type AttackCardFacts,
} from "@/lib/play/situations";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { buildWeaponRange } from "@/lib/weapon-range";
import { deriveAttackRollView, type AdvantageChip } from "@/lib/views/sheet-view";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { deriveCharacter } from "@/lib/views/derive-character";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { litText } from "@/lib/loc-text";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { srdText } from "@/lib/loc-text";
import type { CombatVariantNote } from "@/data/combat-variants";
import { loc, srd } from "@tests/_harness/loc";

/** A reference line's English sentence, from the `rule` catalogue. */
function summaryEn(note: CombatVariantNote): string {
  return srd("rule", note.key, "summary", "en");
}

const UNTIL = { round: 3, phase: "turn-end" as const };
const NO_SWIM = { hasSwimSpeed: false };

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

/** Every SRD weapon as the combat card presents it. */
const WEAPON_CARDS = SRD_WEAPONS.map((weapon) => {
  const range = buildWeaponRange(weapon.properties ?? [], {
    isRanged: weapon.weaponType === "ranged",
  });
  return {
    id: weapon.id,
    damageType: weapon.damage?.type,
    hasLongRange: range.kind === "ranged" || range.thrown !== undefined,
    card: attackCardFacts({
      id: weapon.id,
      source: "weapon",
      summary: {
        attackMode: range.kind,
        ...(range.kind === "melee" && range.thrown ? { throwable: true as const } : {}),
        ...(weapon.damage?.type ? { damageType: weapon.damage.type } : {}),
      },
    }),
  };
});

const SPELL_CARDS: { id: string; card: AttackCardFacts }[] = [
  { id: "ranged spell attack", card: { source: "spell", attackMode: "ranged" } },
  { id: "melee spell attack", card: { source: "spell", attackMode: "melee" } },
];

/** The card's verdict and scoped lines with only this situation lit. */
function verdict(id: SituationId, card: AttackCardFacts, swim = NO_SWIM) {
  return deriveAttackRollView(situationalAttackChips([id], card, swim));
}

/** The mode a rule sentence states. */
function sentenceMode(sentence: string): "advantage" | "disadvantage" {
  return /\bDisadvantage\b/.test(sentence) ? "disadvantage" : "advantage";
}

describe("the situations follow their SRD sentences", () => {
  it("every attack situation in the table has a state, in table order", () => {
    const ids = SITUATIONAL_STATES.map((s) => s.id);
    for (const line of ATTACK_SITUATION_REFERENCE) {
      expect(ids).toContain(line.id);
    }
    expect(ids.slice(0, ATTACK_SITUATION_REFERENCE.length)).toEqual(
      ATTACK_SITUATION_REFERENCE.map((line) => line.id)
    );
  });

  it.each(ATTACK_SITUATION_REFERENCE.map((line) => [line.id, line] as const))(
    "%s: its chip carries the table's name and its rule the sentence's mode",
    (id, line) => {
      const state = must(SITUATIONAL_STATES.find((s) => s.id === id));
      expect(state.label).toEqual(srdText("rule", line.key, "name"));
      expect(state.reference).toEqual([line]);
      expect(state.attack.map((rule) => rule.mode)).toEqual([
        sentenceMode(summaryEn(line)),
      ]);
      // A sentence about range narrows it to ranged attacks; "weapon" to weapons.
      const rule = must(state.attack[0]);
      expect(rule.kinds).toEqual(
        /\branged?\b/i.test(summaryEn(line)) ? ["ranged"] : ["melee", "ranged"]
      );
      expect(rule.weaponOnly ?? false).toBe(/\bweapon\b/i.test(summaryEn(line)));
    }
  );

  it("underwater: one rule per attack line, Fire Resistance as a grant", () => {
    const state = must(SITUATIONAL_STATES.find((s) => s.id === "underwater"));
    const melee = must(
      UNDERWATER_COMBAT_REFERENCE.find((l) => l.id === "melee-underwater")
    );
    const ranged = must(
      UNDERWATER_COMBAT_REFERENCE.find((l) => l.id === "ranged-underwater")
    );
    const meleeRule = must(state.attack.find((rule) => rule.kinds.includes("melee")));
    const rangedRule = must(state.attack.find((rule) => rule.kinds.includes("ranged")));
    expect(meleeRule.mode).toBe(sentenceMode(summaryEn(melee)));
    expect(meleeRule.unlessSwimSpeed ?? false).toBe(
      summaryEn(melee).includes("Swim Speed")
    );
    expect(meleeRule.unlessDamageType).toBe(
      /unless the weapon deals (\w+) damage/.exec(summaryEn(melee))?.[1]?.toLowerCase()
    );
    expect(meleeRule.weaponOnly ?? false).toBe(/\bweapon\b/.test(summaryEn(melee)));
    expect(rangedRule.mode).toBe(sentenceMode(summaryEn(ranged)));
    expect(rangedRule.weaponOnly ?? false).toBe(/\bweapon\b/.test(summaryEn(ranged)));
    // The auto-miss beyond normal range is the table's call: a note, not a number.
    expect(state.notes).toContain(ranged);
    expect(state.grant.grants).toEqual([
      { type: "damage-resistance", damageType: "fire" },
    ]);
  });

  it("mounted is a reference line: the controlled-mount rule, no attack clause", () => {
    const state = must(SITUATIONAL_STATES.find((s) => s.id === "mounted"));
    expect(state.attack).toEqual([]);
    expect(state.notes.map((n) => n.id)).toEqual(["controlled-mount"]);
  });
});

describe("what a lit situation does to each attack card", () => {
  const allCards = [...WEAPON_CARDS, ...SPELL_CARDS];

  it.each(allCards.map((c) => [c.id, c.card] as const))(
    "%s: an unseen target is Disadvantage, an unseen attacker Advantage",
    (_id, card) => {
      expect(verdict("unseen-target", card)).toEqual({
        state: "disadvantage",
        scoped: [],
      });
      expect(verdict("unseen-attacker", card)).toEqual({
        state: "advantage",
        scoped: [],
      });
    }
  );

  it.each(allCards.map((c) => [c.id, c.card] as const))(
    "%s: ranged in melee reaches only a ranged roll",
    (_id, card) => {
      const view = verdict("ranged-in-melee", card);
      if (card.attackMode === "ranged") {
        expect(view).toEqual({ state: "disadvantage", scoped: [] });
      } else if (card.throwable) {
        expect(view).toEqual({
          state: "none",
          scoped: [{ scope: "thrown", state: "disadvantage" }],
        });
      } else {
        expect(view).toEqual({ state: "none", scoped: [] });
      }
    }
  );

  it.each(WEAPON_CARDS.map((c) => [c.id, c] as const))(
    "%s: long range reaches a weapon with a long range",
    (_id, weapon) => {
      const view = verdict("long-range", weapon.card);
      if (!weapon.hasLongRange) expect(view).toEqual({ state: "none", scoped: [] });
      else if (weapon.card.throwable)
        expect(view.scoped).toEqual([{ scope: "thrown", state: "disadvantage" }]);
      else expect(view).toEqual({ state: "disadvantage", scoped: [] });
    }
  );

  it.each(SPELL_CARDS.map((c) => [c.id, c.card] as const))(
    "%s: long range and underwater leave a spell attack alone",
    (_id, card) => {
      expect(verdict("long-range", card)).toEqual({ state: "none", scoped: [] });
      expect(verdict("underwater", card)).toEqual({ state: "none", scoped: [] });
    }
  );

  it.each(WEAPON_CARDS.map((c) => [c.id, c] as const))(
    "%s: underwater, Piercing and a Swim Speed spare the melee swing",
    (_id, weapon) => {
      const card = weapon.card;
      const meleeDis = card.attackMode === "melee" && weapon.damageType !== "piercing";
      const rangedDis = card.attackMode === "ranged" || card.throwable === true;
      const view = verdict("underwater", card);
      // Disadvantage on every roll the card can make is its verdict.
      if (card.attackMode === "ranged" || (meleeDis && (rangedDis || !card.throwable))) {
        expect(view).toEqual({ state: "disadvantage", scoped: [] });
      } else if (rangedDis) {
        expect(view.scoped).toEqual([{ scope: "thrown", state: "disadvantage" }]);
      } else {
        expect(view).toEqual({ state: "none", scoped: [] });
      }
      // A Swim Speed lifts the melee clause only.
      const swimming = verdict("underwater", card, { hasSwimSpeed: true });
      if (card.attackMode === "ranged") expect(swimming.state).toBe("disadvantage");
      else expect(swimming.state).toBe("none");
    }
  );

  it("the Unarmed Strike row is no weapon: weapon-only rules pass it by", () => {
    const unarmed = attackCardFacts({
      id: "unarmed-strike",
      source: "weapon",
      summary: { attackMode: "melee", damageType: "bludgeoning" },
    });
    expect(verdict("underwater", unarmed)).toEqual({ state: "none", scoped: [] });
    expect(verdict("unseen-target", unarmed).state).toBe("disadvantage");
  });

  it("an attack of unknown kind states the ranged clause as a scope", () => {
    const view = verdict("ranged-in-melee", { source: "feature" });
    expect(view).toEqual({
      state: "none",
      scoped: [{ scope: "ranged", state: "disadvantage" }],
    });
  });

  it("nets with the sheet's other clauses: an unseen attacker cancels Prone", () => {
    const longbow = must(WEAPON_CARDS.find((c) => c.id === "longbow")).card;
    const prone: AdvantageChip = {
      sourceId: "prone",
      mode: "disadvantage",
      rollType: "attack",
      vs: "attack",
      description: litText({ en: "Prone", it: "Prono" }),
    };
    const chips = [
      prone,
      ...situationalAttackChips(["unseen-attacker"], longbow, NO_SWIM),
    ];
    expect(deriveAttackRollView(chips).state).toBe("none");
  });

  it("nothing lit adds nothing", () => {
    for (const { card } of allCards) {
      expect(situationalAttackChips([], card, NO_SWIM)).toEqual([]);
    }
  });
});

describe("lighting a situation", () => {
  const withSession = (doc: CharacterDoc, session: CharacterDoc["session"]) => ({
    ...doc,
    session,
  });

  it.each(SITUATIONAL_STATES.map((s) => [s.id] as const))(
    "%s: lit with its turn edge, shown as a lit chip, then cleared",
    (id) => {
      const key = situationKey(id);
      const session = must(setSituation(MOCK_CHARACTER, id, true, UNTIL));
      expect(litSituations(session)).toEqual([id]);
      expect(session.effectBoundaries?.[key]).toEqual(UNTIL);
      const aggregate = aggregateCharacterGrants(MOCK_CHARACTER.character, session);
      const chip = aggregate.activatableGroups.find((group) => group.key === key);
      expect(chip?.active).toBe(true);
      expect(grantSourceLabel(key, "it")).toBe(
        loc(must(SITUATIONAL_STATES.find((s) => s.id === id)).label, "it")
      );
      const off = must(
        setSituation(withSession(MOCK_CHARACTER, session), id, false, undefined)
      );
      expect(litSituations(off)).toEqual([]);
      expect(off.effectBoundaries?.[key]).toBeUndefined();
    }
  );

  it("situations hold together; the same state twice changes nothing", () => {
    const one = withSession(
      MOCK_CHARACTER,
      must(setSituation(MOCK_CHARACTER, "underwater", true, UNTIL))
    );
    const two = withSession(one, must(setSituation(one, "long-range", true, UNTIL)));
    expect(litSituations(two.session)).toEqual(["long-range", "underwater"]);
    expect(setSituation(two, "long-range", true, UNTIL)).toBeNull();
    expect(setSituation(MOCK_CHARACTER, "mounted", false, undefined)).toBeNull();
  });

  it("underwater gives Fire Resistance while lit", () => {
    const fire = (doc: CharacterDoc) =>
      deriveCharacter(doc).defenses.resistances.has("fire");
    expect(fire(MOCK_CHARACTER)).toBe(false);
    const lit = withSession(
      MOCK_CHARACTER,
      must(setSituation(MOCK_CHARACTER, "underwater", true, UNTIL))
    );
    expect(fire(lit)).toBe(true);
  });

  it("runs as a sheet event", () => {
    const next = must(
      applySheetEvent(MOCK_CHARACTER, {
        kind: "set-situation",
        situation: "unseen-target",
        lit: true,
        until: UNTIL,
      })
    );
    expect(litSituations(next.session)).toEqual(["unseen-target"]);
  });

  it.each(SITUATIONAL_STATES.map((s) => [s.id, s] as const))(
    "%s: an attack-table fact lasts the turn, a fight-wide one (Underwater, Mounted) the fight",
    (_id, state) => {
      const attackFact = state.reference.every((line) =>
        ATTACK_SITUATION_REFERENCE.includes(line)
      );
      expect(state.lasts).toBe(attackFact ? "turn" : "fight");
      expect(state.grant.duration).toEqual(
        attackFact ? { kind: "turn-boundary", phase: "turn-end", turns: 1 } : undefined
      );
      expect(FIGHT_SITUATIONS.includes(state.id)).toBe(!attackFact);
    }
  );

  it("the end of the encounter clears the fight-wide ones and only those", () => {
    let doc: CharacterDoc = MOCK_CHARACTER;
    for (const state of SITUATIONAL_STATES) {
      doc = withSession(doc, must(setSituation(doc, state.id, true, undefined)));
    }
    const ended = must(endFightSituations(doc));
    expect(litSituations(ended)).toEqual(
      SITUATIONAL_STATES.filter((s) => s.lasts === "turn").map((s) => s.id)
    );
    expect(endFightSituations(withSession(doc, ended))).toBeNull();
    const viaEvent = must(applySheetEvent(doc, { kind: "end-fight-situations" }));
    expect(litSituations(viaEvent.session)).toEqual(litSituations(ended));
  });

  it("the end of your turn drops it", () => {
    const doc = withSession(
      MOCK_CHARACTER,
      must(setSituation(MOCK_CHARACTER, "ranged-in-melee", true, UNTIL))
    );
    useCharacterStore.setState({ character: doc, readonly: false });
    const { expired } = useCharacterStore
      .getState()
      .expireEffectBoundaries({ round: UNTIL.round, phase: "turn-end" });
    expect(expired.map((effect) => effect.activeKey)).toEqual([
      situationKey("ranged-in-melee"),
    ]);
    expect(litSituations(must(useCharacterStore.getState().character).session)).toEqual(
      []
    );
  });
});
