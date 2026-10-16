/**
 * Bestiary-pick summons — Planar Ally, Planar Binding, Gate and Awaken bring one
 * creature the CASTER chooses from the bestiary. The choice is limited by the
 * spell's own text (creature types, size, Intelligence, Challenge Rating), the
 * chosen monster id rides `session.companionVariant`, and the Companions rail
 * lists it like a raised creature.
 */
import { describe, it, expect } from "vitest";
import enSpells from "@/i18n/en/srd/spells.json";
import enMonsters from "@/i18n/en/srd/monsters.json";
import { getSpellById, spells } from "@/data/spells";
import { MONSTERS } from "@/data/monsters";
import { ALL_CREATURE_TYPES, CREATURE_SIZE_ORDER } from "@/data/types";
import type { CreatureSize, MonsterStatBlock } from "@/data/types";
import { MOCK_CHARACTER } from "@/lib/mock";
import { concentrationValue } from "@/lib/concentration";
import { bestiaryPickAllows } from "@/lib/bestiary-pick";
import { releaseCompanion } from "@/lib/play/companions";
import { sessionToState, stateToSession } from "@/lib/session-state-codec";
import { buildSummonedMonsterGroups } from "@/lib/views/companion-row-view";
import type { CharacterDoc } from "@/types/character";

type Catalogue = Record<string, Record<string, string> | undefined>;
const en = enSpells as Catalogue;
const monsterNames = enMonsters as Catalogue;

/** What a spell's text allows, read off the text alone. */
interface TextRule {
  types: string[];
  crMax?: number;
  sizeMax?: CreatureSize;
  intMax?: number;
}

function textRule(spellId: string): TextRule {
  const text = en[spellId]?.description ?? "";
  const types = ALL_CREATURE_TYPES.filter((type) =>
    new RegExp(`\\b${type}s?\\b`, "i").test(text)
  );
  const cr = text.match(/challenge rating (?:of )?(\d+) or (?:lower|less)/i);
  const size = text.match(/\b(Tiny|Small|Medium|Large|Huge|Gargantuan) or smaller\b/);
  const int = text.match(/Intelligence of (\d+) or less/);
  return {
    types,
    ...(cr ? { crMax: Number(cr[1]) } : {}),
    ...(size ? { sizeMax: size[1] as CreatureSize } : {}),
    ...(int ? { intMax: Number(int[1]) } : {}),
  };
}

/** The monsters the text allows (no type named = any creature). */
function legalByText(rule: TextRule): MonsterStatBlock[] {
  return MONSTERS.filter(
    (m) =>
      (rule.types.length === 0 || rule.types.includes(m.type)) &&
      (rule.crMax === undefined || m.cr <= rule.crMax) &&
      (rule.sizeMax === undefined ||
        m.sizes.every(
          (s) =>
            CREATURE_SIZE_ORDER.indexOf(s) <=
            CREATURE_SIZE_ORDER.indexOf(rule.sizeMax as CreatureSize)
        )) &&
      (rule.intMax === undefined || m.abilityScores.INT <= rule.intMax)
  );
}

function pool(spellId: string): string[] {
  const rule = getSpellById(spellId)?.bestiaryPick;
  if (!rule) throw new Error(`${spellId} has no bestiary pick`);
  return MONSTERS.filter((m) => bestiaryPickAllows(rule, m)).map((m) => m.id);
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

describe("bestiary-pick summons — the catalogue", () => {
  it("is exactly the spells whose text brings one creature the caster picks", () => {
    expect(
      spells
        .filter((s) => s.bestiaryPick)
        .map((s) => s.id)
        .sort()
    ).toEqual(["awaken", "gate", "planar-ally", "planar-binding"]);
  });

  it("Planar Ally offers only the Celestials, Elementals and Fiends the text names", () => {
    const rule = textRule("planar-ally");
    expect(rule.types.sort()).toEqual(["celestial", "elemental", "fiend"]);
    // The text puts no Challenge Rating cap on the ally.
    expect(rule.crMax).toBeUndefined();
    expect(pool("planar-ally")).toEqual(legalByText(rule).map((m) => m.id));
    expect(pool("planar-ally")).toContain("planetar");
    expect(pool("planar-ally")).not.toContain("wolf");
  });

  it("Planar Binding adds the Fey the text names", () => {
    const rule = textRule("planar-binding");
    expect(rule.types.sort()).toEqual(["celestial", "elemental", "fey", "fiend"]);
    expect(pool("planar-binding")).toEqual(legalByText(rule).map((m) => m.id));
    expect(pool("planar-binding")).toContain("dryad");
  });

  it("Gate draws any creature, so every bestiary entry is legal", () => {
    expect(textRule("gate").types).toEqual([]);
    expect(pool("gate")).toEqual(MONSTERS.map((m) => m.id));
  });

  it("Awaken: a Beast or Plant of Intelligence 3 or less (SRD 5.2.1 sets no size cap), or what an awakened plant becomes", () => {
    const rule = textRule("awaken");
    expect(rule).toEqual({ types: ["beast", "plant"], intMax: 3 });
    const awakened = MONSTERS.filter((m) =>
      /^Awakened /.test(monsterNames[m.id]?.name ?? "")
    ).map((m) => m.id);
    expect(awakened.length).toBeGreaterThan(0);
    const legal = new Set([...legalByText(rule).map((m) => m.id), ...awakened]);
    expect(new Set(pool("awaken"))).toEqual(legal);
    expect(pool("awaken")).toContain("wolf");
    // Intelligence 7: too clever to awaken.
    expect(pool("awaken")).not.toContain("giant-ape");
  });
});

describe("bestiary-pick summons — on the Companions rail", () => {
  it("an unpicked spell asks for a creature", () => {
    const [group] = buildSummonedMonsterGroups(withSpells(["planar-ally"]));
    expect(group).toMatchObject({ spellId: "planar-ally", count: 1 });
    expect(group?.monsterId).toBeUndefined();
    expect(group?.pick).toEqual(getSpellById("planar-ally")?.bestiaryPick);
  });

  it("fields the creature the player picked, with its own HP", () => {
    const [group] = buildSummonedMonsterGroups(
      withSpells(["planar-ally"], {
        companionVariant: { "planar-ally": "planetar" },
        companionHp: { "planar-ally#1": { current: 90 } },
      })
    );
    expect(group).toMatchObject({
      monsterId: "planetar",
      count: 1,
      current: [90],
      options: [],
    });
  });

  it("Gate's creature exists only while the caster concentrates on Gate", () => {
    const session = { companionVariant: { gate: "planetar" } };
    expect(buildSummonedMonsterGroups(withSpells(["gate"], session))).toEqual([]);
    const [group] = buildSummonedMonsterGroups(
      withSpells(["gate"], { ...session, concentration: concentrationValue("gate") })
    );
    expect(group?.monsterId).toBe("planetar");
  });
});

describe("bestiary-pick summons — release", () => {
  it("sends the creature away with its HP, leaving every other companion", () => {
    const next = releaseCompanion(
      {
        ...MOCK_CHARACTER.session,
        companionVariant: { "planar-ally": "planetar", "animate-dead": "zombie" },
        companionHp: {
          "planar-ally#1": { current: 90 },
          "animate-dead#1": { current: 5 },
        },
      },
      "planar-ally"
    );
    expect(next?.companionVariant).toEqual({ "animate-dead": "zombie" });
    expect(next?.companionHp).toEqual({ "animate-dead#1": { current: 5 } });
  });

  it("is a no-op without a pick", () => {
    expect(releaseCompanion(MOCK_CHARACTER.session, "planar-ally")).toBeNull();
  });
});

describe("bestiary-pick summons — stored state", () => {
  it("round-trips the picked monster id as a known key", () => {
    const state = sessionToState({
      ...MOCK_CHARACTER.session,
      companionVariant: { "planar-ally": "planetar" },
    });
    const reread = stateToSession(state);
    expect(reread.companionVariant).toEqual({ "planar-ally": "planetar" });
    expect(reread.unknown).toBeUndefined();
  });
});
