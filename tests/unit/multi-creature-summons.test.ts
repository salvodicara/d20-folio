/**
 * Multi-creature summons — Animate Dead, Animate Objects and Create Undead make
 * several creatures from one cast. The count follows the spell text at the cast
 * level, each creature has its own HP on the Companions rail ("Skeleton 1",
 * "Skeleton 2"), and the session field that stores the player's count is additive
 * (an older reader keeps it verbatim).
 */
import { describe, it, expect } from "vitest";
import enSpells from "@/i18n/en/srd/spells.json";
import enMonsters from "@/i18n/en/srd/monsters.json";
import { getSpellById, spells } from "@/data/spells";
import { getMonster } from "@/data/monsters";
import { MOCK_CHARACTER } from "@/lib/mock";
import { concentrationValue } from "@/lib/concentration";
import { summonCount } from "@/lib/summon-count";
import { setCompanionCount, setCompanionVariant } from "@/lib/play/companions";
import { sessionToState, stateToSession } from "@/lib/session-state-codec";
import { translateMonsterEntry } from "@/lib/activities/from-creature";
import {
  buildCompanionCardViews,
  buildSummonedMonsterGroups,
} from "@/lib/views/companion-row-view";
import type { CharacterDoc } from "@/types/character";
import type { SummonCount } from "@/data/types";

type Catalogue = Record<string, Record<string, string> | undefined>;
const en = enSpells as Catalogue;
const monsterNames = enMonsters as Catalogue;

const WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const t = (key: string) => key;

/** The value, or a failed test naming what was missing. */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`missing: ${what}`);
  return value;
}

/** "two" → 2 (the spell text spells its numbers out). */
function word(text: string | undefined): number {
  return must(WORDS[(text ?? "").toLowerCase()], `number word "${text}"`);
}

function withSpells(
  ids: string[],
  session: Partial<CharacterDoc["session"]> = {}
): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      spells: ids.map((srdId) => ({ srdId, prepared: true })),
    },
    session: { ...MOCK_CHARACTER.session, ...session },
  };
}

function optionCount(spellId: string, monsterId: string): SummonCount {
  const option = getSpellById(spellId)?.summonedMonsters?.options.find(
    (o) => o.monsterId === monsterId
  );
  if (!option) throw new Error(`${spellId} raises no ${monsterId}`);
  return option.count;
}

describe("multi-creature summons — the count follows the spell text", () => {
  it("Animate Dead: one creature, plus the text's number per slot level above 3", () => {
    const text = en["animate-dead"]?.higherLevels ?? "";
    const m = text.match(
      /(\w+) additional Undead creatures for each spell slot level above (\d)/
    );
    const per = word(m?.[1]);
    const base = Number(must(m?.[2], "base level"));
    for (const monsterId of ["skeleton", "zombie"]) {
      for (const slot of [3, 4, 5, 9]) {
        expect(
          summonCount(optionCount("animate-dead", monsterId), base, slot, 0),
          `${monsterId} at ${slot}`
        ).toBe(1 + per * (slot - base));
      }
    }
  });

  it("Create Undead: every slot level's creatures and numbers, read off the text", () => {
    const description = en["create-undead"]?.description ?? "";
    const higher = en["create-undead"]?.higherLevels ?? "";
    const rows: Array<[number, string]> = [];
    const base = description.match(/up to (\w+) corpses/);
    rows.push([6, `${must(base?.[1], "base count")} Ghouls`]);
    for (const m of higher.matchAll(
      /level (\d) spell slot, you can animate or reassert control over ([^.]+)\./g
    )) {
      rows.push([Number(m[1]), must(m[2], "creatures")]);
    }
    expect(rows.map(([level]) => level)).toEqual([6, 7, 8, 9]);
    const nameToId = new Map(
      ["ghoul", "ghast", "wight", "mummy"].map((id) => [
        must(monsterNames[id]?.name, id).toLowerCase(),
        id,
      ])
    );
    let checked = 0;
    for (const [level, clause] of rows) {
      // "five Ghouls or two Ghasts or Wights" → ghoul 5, ghast 2, wight 2.
      for (const part of clause.split(/,\s*(?:or\s+)?|\s+or\s+(?=\w+\s+[A-Z])/)) {
        const m = part.match(/^(\w+)\s+(.+)$/);
        if (!m) continue;
        const n = WORDS[(m[1] ?? "").toLowerCase()];
        if (!n) continue;
        for (const name of (m[2] ?? "").split(/\s+or\s+/)) {
          const singular = name.replace(/ies$/, "y").replace(/s$/, "");
          const id = must(nameToId.get(singular.toLowerCase()), `${level}: ${name}`);
          expect(
            summonCount(optionCount("create-undead", id), 6, level, 0),
            `${id} at ${level}`
          ).toBe(n);
          checked++;
        }
      }
    }
    expect(checked).toBe(1 + 1 + 3 + 4);
  });

  it("Animate Objects: the spellcasting modifier, a Large object counting as the text says", () => {
    const text = en["animate-objects"]?.description ?? "";
    const per = (size: string) =>
      word(text.match(new RegExp(`a ${size} target counts as (\\w+)`))?.[1]);
    const block = getSpellById("animate-objects")?.companion;
    const variants = new Map(block?.variants?.map((v) => [v.variantId, v.count]));
    for (const [variantId, size] of [
      ["medium", "Medium or smaller"],
      ["large", "Large"],
      ["huge", "Huge"],
    ] as const) {
      for (const mod of [1, 3, 5]) {
        expect(summonCount(variants.get(variantId), 5, 5, mod), `${size} ${mod}`).toBe(
          Math.max(1, Math.floor(mod / per(size)))
        );
      }
    }
  });

  it("names a catalogue creature the spell text names, for every option", () => {
    for (const spell of spells) {
      for (const { monsterId } of spell.summonedMonsters?.options ?? []) {
        expect(getMonster(monsterId), monsterId).toBeDefined();
        const name = monsterNames[monsterId]?.name ?? "";
        const text = `${en[spell.id]?.description} ${en[spell.id]?.higherLevels}`;
        // Singular or plural ("Mummy" / "Mummies").
        expect(text, `${spell.id} names ${name}`).toContain(name.replace(/y$/, ""));
      }
    }
  });
});

describe("multi-creature summons — each creature's attacks are Activities", () => {
  it("translates every attack and save of every creature without a gap", () => {
    let entries = 0;
    for (const spell of spells) {
      for (const { monsterId } of spell.summonedMonsters?.options ?? []) {
        const monster = must(getMonster(monsterId), monsterId);
        for (const section of ["actions", "bonusActions", "reactions"] as const) {
          for (const entry of monster[section] ?? []) {
            if (entry.kind !== "attack" && entry.kind !== "save") continue;
            const { activity, gaps } = translateMonsterEntry(monsterId, section, entry);
            expect(gaps, activity.id).toEqual([]);
            if (entry.kind === "attack") {
              expect(
                activity.effects.filter((effect) => effect.kind === "damage").length,
                activity.id
              ).toBe(entry.damage.length);
            }
            entries++;
          }
        }
      }
    }
    // Skeleton 2, Zombie 1, Ghoul 2, Ghast 2, Wight 3, Mummy 2.
    expect(entries).toBe(12);
  });
});

describe("multi-creature summons — on the Companions rail", () => {
  it("lists one numbered Animated Object per object, each with its own HP", () => {
    const views = buildCompanionCardViews(
      withSpells(["animate-objects"], {
        concentration: concentrationValue("animate-objects"),
        companionHp: { "animate-objects#2": { current: 4 } },
      }),
      "en",
      t
    );
    // The mock Bard has CHA 20 (+5): five Medium objects.
    expect(views.map((v) => v.label)).toEqual([
      "Animated Object 1",
      "Animated Object 2",
      "Animated Object 3",
      "Animated Object 4",
      "Animated Object 5",
    ]);
    expect(views.map((v) => v.featureId)).toEqual([
      "animate-objects#1",
      "animate-objects#2",
      "animate-objects#3",
      "animate-objects#4",
      "animate-objects#5",
    ]);
    expect(views.map((v) => v.current)).toEqual([
      undefined,
      4,
      undefined,
      undefined,
      undefined,
    ]);
    expect(views[0]).toMatchObject({
      groupId: "animate-objects",
      count: 5,
      ac: 15,
      hpMax: 10,
    });
    expect(views[0]?.attacks[0]?.damage).toBe("1d4 + 3 srd.damage_force");
  });

  it("scales a Large object's Slam with the slot and the spellcasting modifier", () => {
    const [large, ...rest] = buildCompanionCardViews(
      withSpells(["animate-objects"], {
        concentration: concentrationValue("animate-objects"),
        concentrationCastLevel: 7,
        companionVariant: { "animate-objects": "large" },
      }),
      "en",
      t
    );
    // 2d6 + 3 + CHA 5, plus 1d6 for each of the 2 levels above 5; two Large objects.
    expect(large).toMatchObject({ hpMax: 20, count: 2 });
    expect(rest).toHaveLength(1);
    expect(large?.attacks[0]?.damage).toBe("4d6 + 8 srd.damage_force");
  });

  it("fields the count the player set", () => {
    const views = buildCompanionCardViews(
      withSpells(["animate-objects"], {
        concentration: concentrationValue("animate-objects"),
        companionCount: { "animate-objects": 2 },
      }),
      "en",
      t
    );
    expect(views).toHaveLength(2);
  });

  it("groups Animate Dead's undead by spell, one HP entry each", () => {
    expect(buildSummonedMonsterGroups(withSpells(["animate-dead"]))).toEqual([
      {
        spellId: "animate-dead",
        options: ["skeleton", "zombie"],
        monsterId: "skeleton",
        count: 1,
        current: [undefined],
      },
    ]);
    const [group] = buildSummonedMonsterGroups(
      withSpells(["animate-dead"], {
        companionCount: { "animate-dead": 4 },
        companionVariant: { "animate-dead": "zombie" },
        companionHp: { "animate-dead#3": { current: 2 } },
      })
    );
    expect(group).toMatchObject({
      monsterId: "zombie",
      count: 4,
      current: [undefined, undefined, 2, undefined],
    });
  });

  it("Create Undead defaults to the spell's three Ghouls", () => {
    const [group] = buildSummonedMonsterGroups(withSpells(["create-undead"]));
    expect(group).toMatchObject({ monsterId: "ghoul", count: 3 });
  });
});

describe("multi-creature summons — play transitions", () => {
  const session = {
    ...MOCK_CHARACTER.session,
    companionHp: {
      "animate-dead#1": { current: 5 },
      "animate-dead#4": { current: 1 },
      "find-steed": { current: 9 },
    },
  };

  it("a lower count sends the extra creatures away with their HP", () => {
    const next = setCompanionCount(session, "animate-dead", 3);
    expect(next?.companionCount).toEqual({ "animate-dead": 3 });
    expect(next?.companionHp).toEqual({
      "animate-dead#1": { current: 5 },
      "find-steed": { current: 9 },
    });
    expect(setCompanionCount(must(next, "next"), "animate-dead", 3)).toBeNull();
    expect(setCompanionCount(session, "animate-dead", 0)?.companionCount).toEqual({
      "animate-dead": 1,
    });
  });

  it("another creature kind resets every creature's HP and the count", () => {
    const counted = must(setCompanionCount(session, "animate-dead", 4), "counted");
    const next = setCompanionVariant(counted, "animate-dead", "zombie");
    expect(next.companionVariant).toEqual({ "animate-dead": "zombie" });
    expect(next.companionHp).toEqual({ "find-steed": { current: 9 } });
    expect(next.companionCount).toEqual({});
  });
});

describe("multi-creature summons — stored state", () => {
  it("round-trips the count and drops a malformed one", () => {
    const state = sessionToState({
      ...MOCK_CHARACTER.session,
      companionCount: { "animate-dead": 4 },
    });
    expect(state.companionCount).toEqual({ "animate-dead": 4 });
    expect(stateToSession(state).companionCount).toEqual({ "animate-dead": 4 });
    // A known key, so it never lands in the unknown-key bucket as well.
    expect(stateToSession(state).unknown).toBeUndefined();
    expect(
      stateToSession({ ...state, companionCount: { "animate-dead": "4", x: 0, y: 999 } })
        .companionCount
    ).toBeUndefined();
  });

  it("an older reader keeps the count as an unknown key and writes it back", () => {
    // What an older client sees: a state key it does not know.
    const { companionCount, ...older } = sessionToState({
      ...MOCK_CHARACTER.session,
      companionCount: { "animate-dead": 4 },
    });
    const future = { ...older, futureSummons: companionCount };
    const reread = stateToSession(future);
    expect(reread.unknown).toEqual({ futureSummons: { "animate-dead": 4 } });
    expect(
      sessionToState({ ...MOCK_CHARACTER.session, ...reread }).futureSummons
    ).toEqual({
      "animate-dead": 4,
    });
  });
});
