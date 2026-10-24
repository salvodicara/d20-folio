/**
 * A homebrew spell that declares structured mechanics (`CustomSpell.mechanics`, the
 * catalogue spell's own shape) plays through the SAME path as a catalogue spell:
 * the combat action resolver (save DC from the caster, damage, area), the cast-level
 * scaling, the grant source its while-active state lights, and the Concentration it
 * holds — its structured duration on the clock, and the states it ends with it.
 *
 * Cases mirror real catalogue spells so the two can be compared on one caster:
 * a Fireball-like save spell, a Shield-of-Faith-like buff held by Concentration,
 * and an upcast that adds a die per slot level.
 */
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { spells as catalogueSpells } from "@/data/spells";
import type { HomebrewSpellMechanics, SrdSpellData } from "@/data/types";
import { effectiveAC } from "@/lib/aggregate-character";
import { actionAtCastLevel } from "@/lib/cast-resolution";
import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
import { customConcentrationValue } from "@/lib/concentration";
import {
  HOMEBREW_SPELL_FIELD_SCHEMAS,
  homebrewSpellData,
  homebrewSpellMechanics,
} from "@/lib/homebrew-spells";
import { parseLibraryEntries } from "@/lib/library-codec";
import { toLibraryEntry } from "@/lib/library";
import { changeConcentration } from "@/lib/play/concentration";
import { setActiveState } from "@/lib/play/states";
import { passTime } from "@/lib/play/time";
import { resolveActions, type RawResolvedAction } from "@/lib/smart-tracker";
import { executionFor } from "@/lib/play/cast-execution";
import type { CharacterDoc, CustomSpell } from "@/types/character";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

function homebrewSpell(over: Partial<CustomSpell> = {}): CustomSpell {
  return {
    custom: true,
    name: "Ember Burst",
    level: 3,
    school: "evocation",
    castingTime: "action",
    range: "150 feet",
    components: { v: true, s: true, m: false },
    duration: "Instantaneous",
    concentration: false,
    description: "A bead of flame bursts.",
    prepared: true,
    instanceId: customInstanceId(over.name ?? "Ember Burst"),
    ...over,
  };
}

/** A Fireball-like save spell: DEX save for half, 8d6 Fire, +1d6 per slot level. */
const EMBER_BURST = homebrewSpell({
  mechanics: {
    saveAbility: "DEX",
    damageType: "fire",
    damageDice: "8d6",
    damageDicePerUpcast: "1d6",
    damageOnSave: "half",
    area: true,
    duration: { kind: "instantaneous" },
  },
});

/** A Shield-of-Faith-like buff on yourself, Concentration up to 1 minute. */
const WARDING_GLOW = homebrewSpell({
  name: "Warding Glow",
  level: 1,
  school: "abjuration",
  castingTime: "bonus action",
  range: "Self",
  duration: "Concentration, up to 1 minute",
  concentration: true,
  description: "A soft light wards you.",
  mechanics: {
    ritual: true,
    effectTag: "buff",
    duration: { kind: "minutes", amount: 1 },
    grants: [
      {
        type: "while-active",
        activeKey: "homebrew-warding-glow",
        // Its own countdown, like Bless lit on yourself: its expiry ends the
        // Concentration that holds it.
        duration: { kind: "timed", minutes: 1, maxRounds: 10 },
        grants: [{ type: "ac-bonus", amount: 2 }],
      },
    ],
  },
});

/** A level 5 Wizard, INT 16: spell save DC 8 + 3 (PB) + 3 (INT) = 14. */
function wizard(spells: CharacterDoc["character"]["spells"]): CharacterDoc {
  return makeCharacterDoc({
    classId: "wizard",
    level: 5,
    abilityScores: { STR: 10, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 8 },
    spells,
    equipment: [],
    spellcasting: {
      ability: "INT",
      preparedCaster: true,
      preparedMax: 9,
      saveDCOverride: null,
      attackBonusOverride: null,
    },
    spellSlots: [
      { level: 1, total: 4 },
      { level: 2, total: 3 },
      { level: 3, total: 2 },
    ],
  });
}

function actionOf(doc: CharacterDoc, id: string): RawResolvedAction {
  const action = resolveActions(doc, "spellbook").find((a) => a.id === id);
  if (!action) throw new Error(`no action ${id}`);
  return action;
}

const emberId = `custom-spell-${EMBER_BURST.instanceId}`;
const glowId = `custom-spell-${WARDING_GLOW.instanceId}`;

describe("a homebrew damage spell with a save", () => {
  const doc = wizard([{ srdId: "fireball", prepared: true }, EMBER_BURST]);

  it("takes its save DC from the caster, exactly as the catalogue spell", () => {
    const homebrew = actionOf(doc, emberId);
    const fireball = actionOf(doc, "spell-fireball");
    expect(homebrew.summary.saveDC).toBe(14);
    expect(homebrew.summary.saveDC).toBe(fireball.summary.saveDC);
    expect(homebrew.summary.saveDcParts).toEqual(fireball.summary.saveDcParts);
    expect(homebrew.summary.saveAbility).toBe("DEX");
  });

  it("carries the damage, its type, half on a save and the area", () => {
    const { summary } = actionOf(doc, emberId);
    expect(summary.damage).toBe("8d6");
    expect(summary.damageType).toBe("fire");
    expect(summary.damageOnSave).toBe("half");
    expect(summary.area).toBe(true);
    // Instantaneous: no duration row, as for a catalogue spell.
    expect(summary.duration).toBeUndefined();
  });

  it("keeps its own words, key and spellbook index", () => {
    const action = actionOf(doc, emberId);
    expect(action.name).toEqual({ custom: "Ember Burst" });
    expect(action.spellId).toBeUndefined();
    expect(action.customSpellIndex).toBe(1);
    expect(action.costsSlot).toBe(true);
    expect(action.slotLevel).toBe(3);
  });
});

describe("an upcast homebrew spell", () => {
  it("adds a die per slot level above its own, through the catalogue's scaling", () => {
    const action = actionOf(wizard([EMBER_BURST]), emberId);
    // The cast seam passes no catalogue spell for a homebrew action.
    const atFive = actionAtCastLevel(action as never, undefined, 5);
    expect(atFive.summary.damage).toBe("10d6");
    expect(atFive.slotLevel).toBe(5);
  });
});

describe("a homebrew buff spell: a grant held by 1-minute Concentration", () => {
  /** The cast as the commit seam makes it: its state lit, its Concentration held. */
  function cast(): CharacterDoc {
    const doc = wizard([WARDING_GLOW]);
    const lit = setActiveState(doc, "homebrew-warding-glow", true, 1);
    if (!lit) throw new Error("the state did not light");
    return changeConcentration(
      { ...doc, session: lit },
      customConcentrationValue(WARDING_GLOW.name),
      { castLevel: 1 }
    ).doc;
  }

  it("casting lights its state, as a catalogue buff's cast does", () => {
    const action = actionOf(wizard([WARDING_GLOW]), glowId);
    expect(action.activatesKey).toBe("homebrew-warding-glow");
    expect(action.activeDurationRounds).toBe(10);
    expect(action.concentration).toBe(true);
    expect(action.type).toBe("bonus");
  });

  it("the lit state's grant reaches the character (+2 AC)", () => {
    const ac = (doc: CharacterDoc) => effectiveAC(doc.character, doc.session);
    expect(ac(cast())).toBe(ac(wizard([WARDING_GLOW])) + 2);
  });

  it("survives half a minute and ends, with its state, when the minute passes", () => {
    const doc = cast();
    const halfway = passTime(doc, 0.5) ?? doc;
    expect(halfway.session.concentration).toBe(
      customConcentrationValue(WARDING_GLOW.name)
    );
    expect(halfway.session.activeFeatures).toContain("homebrew-warding-glow");
    const after = passTime(halfway, 0.5);
    expect(after?.session.concentration).toBe("");
    expect(after?.session.activeFeatures ?? []).not.toContain("homebrew-warding-glow");
  });

  it("in a fight, its state's countdown running out at End Turn ends the Concentration", () => {
    useUndoStore.setState({ characterId: null, past: [], future: [] });
    const store = () => useCharacterStore.getState();
    store().setCharacter(cast());
    const held = customConcentrationValue(WARDING_GLOW.name);
    let round = 0;
    let expired: ReadonlyArray<{ activeKey: string }> = [];
    while (expired.length === 0 && round < 20) {
      expect(store().character?.session.concentration).toBe(held);
      round += 1;
      expired = store().advanceEffectTimers(round).expired;
    }
    // Its own 10-round countdown, counted from the cast's round.
    expect(round).toBeGreaterThanOrEqual(10);
    expect(expired.map((effect) => effect.activeKey)).toEqual(["homebrew-warding-glow"]);
    expect(store().character?.session.concentration).toBe("");
    expect(store().character?.session.activeFeatures ?? []).not.toContain(
      "homebrew-warding-glow"
    );
  });

  it("dropping its Concentration ends the state it holds", () => {
    const { doc, droppedActiveKeys } = changeConcentration(cast(), "");
    expect(droppedActiveKeys).toContain("homebrew-warding-glow");
    expect(doc.session.activeFeatures ?? []).not.toContain("homebrew-warding-glow");
  });

  it("is a ritual, cast like a catalogue ritual", () => {
    const action = actionOf(wizard([WARDING_GLOW]), glowId);
    expect(executionFor(action as never, true)?.ritual).toBe(true);
  });
});

describe("the stored mechanics", () => {
  function throughCharacterCodec(spell: CustomSpell): CustomSpell {
    const doc = wizard([spell]);
    const stored = JSON.parse(JSON.stringify(serializeCharacterEnvelope(doc))) as {
      build: Record<string, unknown>;
      state: Record<string, unknown>;
    };
    const parsed = parseCharacterEnvelope(stored.build, stored.state);
    if (!parsed.ok) throw new Error(`character codec rejected: ${parsed.error}`);
    const back = parsed.character.spells.find(
      (s): s is CustomSpell => "custom" in s && s.instanceId === spell.instanceId
    );
    if (!back) throw new Error("homebrew spell lost by the character codec");
    return back;
  }

  function throughLibraryCodec(spell: CustomSpell): CustomSpell {
    const entry = toLibraryEntry({ kind: "spell", item: spell }, 1);
    const parsed = parseLibraryEntries(
      JSON.parse(JSON.stringify({ entries: [entry] })) as Record<string, unknown>
    );
    if (!parsed.ok) throw new Error(`library codec rejected: ${parsed.failure.path}`);
    const back = parsed.entries[0];
    if (back?.kind !== "spell") throw new Error("library entry lost");
    return back.item;
  }

  it("round-trip both codecs unchanged, as a known field", () => {
    for (const spell of [EMBER_BURST, WARDING_GLOW]) {
      for (const read of [throughCharacterCodec, throughLibraryCodec]) {
        const back = read(spell);
        expect(back.mechanics, read.name).toEqual(spell.mechanics);
        expect(back.unknown?.mechanics, read.name).toBeUndefined();
        expect(homebrewSpellData(back), read.name).toEqual(homebrewSpellData(spell));
      }
    }
  });

  it("a newer client's field is stored verbatim and inert; a rejected field is left out", () => {
    const future = homebrewSpell({
      mechanics: {
        ...EMBER_BURST.mechanics,
        saveAbility: "LUCK",
        futureField: { kind: "x" },
        grants: [{ type: "future-kind" }, { type: "darkvision", range: 60 }],
      } as unknown as HomebrewSpellMechanics,
    });
    const back = throughCharacterCodec(future);
    expect(back.mechanics).toEqual(future.mechanics);
    const played = homebrewSpellMechanics(back);
    expect(played).not.toHaveProperty("futureField");
    expect(played).not.toHaveProperty("saveAbility");
    expect(played?.damageDice).toBe("8d6");
    expect(played?.grants).toEqual([{ type: "darkvision", range: 60 }]);
  });

  it("an older reader keeps an unknown key (as v0.25.0 does `mechanics`) verbatim", () => {
    // v0.25.0's custom-spell reader knew no `mechanics`: it lands in the entry's
    // `unknown` bucket and is written back last, unchanged. The same contract,
    // exercised on a key this reader does not know either.
    const nested = { saveAbility: "DEX", grants: [{ type: "darkvision", range: 60 }] };
    const older = { ...EMBER_BURST, laterMechanics: nested } as unknown as CustomSpell;
    for (const read of [throughCharacterCodec, throughLibraryCodec]) {
      const back = read(older);
      const stored = JSON.parse(JSON.stringify(back)) as Record<string, unknown>;
      const kept = back.unknown?.laterMechanics ?? stored.laterMechanics;
      expect(kept, read.name).toEqual(nested);
      expect(back.mechanics, read.name).toEqual(EMBER_BURST.mechanics);
    }
    const twice = throughCharacterCodec(throughCharacterCodec(older));
    expect(twice.unknown?.laterMechanics).toEqual(nested);
  });

  it("a text-only homebrew spell keeps its text-only play", () => {
    const plain = homebrewSpell({ name: "Plain Words" });
    expect(homebrewSpellData(plain)).toBeUndefined();
    const action = actionOf(wizard([plain]), `custom-spell-${plain.instanceId}`);
    expect(action.homebrewSpell).toBeUndefined();
    expect(action.summary.saveDC).toBeUndefined();
  });
});

/** Catalogue identity and the facts a homebrew spell stores at its top level. */
const NOT_MECHANICS = new Set([
  "id",
  "classes",
  "source",
  "level",
  "school",
  "castingTime",
  "concentration",
  "components",
]);

/** The catalogue spell's structured fields, as a homebrew spell would store them. */
function mechanicsOf(spell: SrdSpellData): Record<string, unknown> {
  const { costGp, consumed } = spell.components;
  const cost = {
    ...(costGp !== undefined ? { costGp } : {}),
    ...(consumed !== undefined ? { consumed } : {}),
  };
  return {
    ...Object.fromEntries(
      Object.entries(spell).filter(([key]) => !NOT_MECHANICS.has(key))
    ),
    ...(Object.keys(cost).length > 0 ? { components: cost } : {}),
  };
}

describe("the homebrew spell schema is the catalogue's shape", () => {
  it("every catalogue spell's structured fields are accepted unchanged", () => {
    const rejected: string[] = [];
    for (const spell of catalogueSpells) {
      const mechanics = mechanicsOf(spell);
      const accepted = homebrewSpellMechanics({
        mechanics: mechanics,
      }) as Record<string, unknown>;
      for (const key of Object.keys(mechanics)) {
        if (!isDeepStrictEqual(accepted[key], mechanics[key])) {
          rejected.push(`${spell.id}.${key}`);
        }
      }
    }
    expect(rejected).toEqual([]);
  });

  it("schemas exist for exactly the structured catalogue fields", () => {
    const used = new Set(
      catalogueSpells.flatMap((spell) => Object.keys(mechanicsOf(spell)))
    );
    for (const key of used) expect(HOMEBREW_SPELL_FIELD_SCHEMAS, key).toHaveProperty(key);
  });
});
