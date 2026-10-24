/**
 * Homebrew-EXPRESSIBILITY guard (owner direction: "homebrew and overrides always
 * possible and fully integrated in the engine").
 *
 * Every Grant kind the catalogue can declare must also be declarable by a player's
 * homebrew: a homebrew FEATURE (`CustomFeature.grants`) carries it, the stored
 * forms carry it unchanged (the character codec and the account-library codec,
 * through JSON as Firestore stores it), the one homebrew validator
 * (`homebrewFeatureGrants`) accepts it, and the grant reaches the same source list
 * the catalogue's grants feed (`resolveGrantSourcesForFeatures`).
 *
 * The same holds for every structured catalogue-SPELL field: a homebrew SPELL
 * (`CustomSpell.mechanics`, the catalogue spell's own shape) carries it, both stored
 * forms carry it unchanged, and the one homebrew spell validator
 * (`homebrewSpellMechanics`) accepts it — so the spell reaches the same engine path
 * (`homebrewSpellData` → `translateSpell`).
 *
 * The same holds for every Activity effect: each effect kind is reachable from the
 * homebrew action dialect (`ActionData`) or a homebrew spell's mechanics, or is
 * recorded below as a gap with what it needs.
 *
 * A new Grant kind or effect kind that homebrew cannot express fails CI here. An
 * exemption is only for a kind that is catalogue-only BY NATURE, with its reason.
 */
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { GRANT_SCHEMA } from "@/lib/grant-schema";
import type { Grant } from "@/lib/grants";
import { homebrewFeatureGrants } from "@/lib/homebrew-grants";
import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
import { parseLibraryEntries } from "@/lib/library-codec";
import { toLibraryEntry } from "@/lib/library";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { activityFromAction } from "@/lib/activities/from-action";
import { translateSpell } from "@/lib/activities/from-spell";
import type { ActivityEffectKind } from "@/lib/activities/types";
import { spells as catalogueSpells } from "@/data/spells";
import type {
  CatalogueSpellIdentityKey,
  HomebrewSpellMechanics,
  HomebrewSpellTopLevelKey,
  SrdSpellData,
} from "@/data/types";
import {
  HOMEBREW_SPELL_FIELD_SCHEMAS,
  homebrewSpellData,
  homebrewSpellMechanics,
} from "@/lib/homebrew-spells";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { ActionData, CustomFeature, CustomSpell } from "@/types/character";
import { sample, schemaBranches } from "@tests/unit/__helpers__/grant-samples";
import { customInstanceId } from "./__helpers__/custom-items";

/** Grant kinds that are catalogue-only by nature — kind → why. Empty today: every
 *  kind is declarable on a homebrew feature. */
const CATALOGUE_ONLY_GRANT_KINDS: Readonly<Record<string, string>> = {};

function homebrewFeature(over: Partial<CustomFeature> = {}): CustomFeature {
  return {
    custom: true,
    title: "House Rule",
    emoji: "✨",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    instanceId: customInstanceId("house-rule"),
    ...over,
  };
}

/** Store and re-read a homebrew feature exactly as a character doc does. */
function throughCharacterCodec(feature: CustomFeature): CustomFeature {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.features = [...doc.character.features, feature];
  const stored = JSON.parse(JSON.stringify(serializeCharacterEnvelope(doc))) as {
    build: Record<string, unknown>;
    state: Record<string, unknown>;
  };
  const parsed = parseCharacterEnvelope(stored.build, stored.state);
  if (!parsed.ok) throw new Error(`character codec rejected: ${parsed.error}`);
  const back = parsed.character.features.find(
    (f): f is CustomFeature => "custom" in f && f.instanceId === feature.instanceId
  );
  if (!back) throw new Error("homebrew feature lost by the character codec");
  return back;
}

/** Store and re-read a homebrew feature exactly as the account library does. */
function throughLibraryCodec(feature: CustomFeature): CustomFeature {
  const entry = toLibraryEntry({ kind: "feature", item: feature }, 1);
  const stored = JSON.parse(JSON.stringify({ entries: [entry] })) as Record<
    string,
    unknown
  >;
  const parsed = parseLibraryEntries(stored);
  if (!parsed.ok) throw new Error(`library codec rejected: ${parsed.failure.path}`);
  const back = parsed.entries[0];
  if (back?.kind !== "feature") throw new Error("library entry lost");
  return back.item;
}

describe("every Grant kind is homebrew-expressible", () => {
  const branches = schemaBranches().map((branch) => ({
    label: branch.label,
    kind: branch.label.replace(/\[\d+\]$/, ""),
    grant: sample(branch.schema) as Grant,
  }));
  const feature = homebrewFeature({ grants: branches.map((b) => b.grant) });

  it("covers every kind, with a justified exemption only", () => {
    const kinds = Object.keys(GRANT_SCHEMA.variants);
    const sampled = new Set(branches.map((b) => b.kind));
    for (const kind of kinds) {
      if (kind in CATALOGUE_ONLY_GRANT_KINDS) {
        expect(CATALOGUE_ONLY_GRANT_KINDS[kind], kind).toMatch(/\w{12,}/);
      } else {
        expect(sampled.has(kind), kind).toBe(true);
      }
    }
    for (const stale of Object.keys(CATALOGUE_ONLY_GRANT_KINDS)) {
      expect(kinds, `stale exemption: ${stale}`).toContain(stale);
    }
  });

  it("the homebrew validator accepts each branch on a homebrew feature", () => {
    const accepted = homebrewFeatureGrants(feature);
    const rejected = branches
      .filter((b) => !(b.kind in CATALOGUE_ONLY_GRANT_KINDS))
      .filter((b) => !accepted.some((g) => isDeepStrictEqual({ ...g }, b.grant)))
      .map((b) => b.label);
    expect(rejected).toEqual([]);
  });

  it("each branch round-trips through the character and library codecs", () => {
    for (const read of [throughCharacterCodec, throughLibraryCodec]) {
      const back = read(feature);
      expect(back.grants, read.name).toEqual(feature.grants);
      expect(back.unknown?.grants, `${read.name}: a known field`).toBeUndefined();
      expect(homebrewFeatureGrants(back), read.name).toEqual(
        homebrewFeatureGrants(feature)
      );
    }
  });

  it("each branch reaches the catalogue's grant-source path", () => {
    const [source] = resolveGrantSourcesForFeatures([feature]);
    expect(source?.id).toBe(feature.instanceId);
    expect(source?.grants).toEqual(homebrewFeatureGrants(feature));
  });
});

/**
 * The spell fields a homebrew spell does not take as mechanics — field → why. Typed
 * over both key sets (`CatalogueSpellIdentityKey`, `HomebrewSpellTopLevelKey`), so
 * a new exemption is a type change, never a silent one.
 */
const SPELL_FIELD_EXEMPTIONS: Readonly<
  Record<CatalogueSpellIdentityKey | HomebrewSpellTopLevelKey, string>
> = {
  id: "catalogue identity: a homebrew spell is keyed by its own instanceId",
  classes: "catalogue class lists: a homebrew spell sits on no class's list",
  source: "the catalogue book: a homebrew spell is the player's own",
  level: "stored at the homebrew spell's top level (CustomSpell.level)",
  school: "stored at the homebrew spell's top level (CustomSpell.school)",
  castingTime: "stored at the homebrew spell's top level (CustomSpell.castingTime)",
  concentration: "stored at the homebrew spell's top level (CustomSpell.concentration)",
  components:
    "V/S/M at the top level (CustomSpell.components); the material cost rides mechanics.components",
};

function homebrewSpell(mechanics: HomebrewSpellMechanics): CustomSpell {
  return {
    custom: true,
    name: "House Spell",
    level: 1,
    school: "evocation",
    castingTime: "action",
    range: "60 feet",
    components: { v: true, s: true, m: true },
    duration: "1 minute",
    concentration: false,
    description: "A house spell.",
    instanceId: customInstanceId("house-spell"),
    mechanics,
  };
}

/** Store and re-read a homebrew spell exactly as a character doc does. */
function spellThroughCharacterCodec(spell: CustomSpell): CustomSpell {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.spells = [...doc.character.spells, spell];
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

/** Store and re-read a homebrew spell exactly as the account library does. */
function spellThroughLibraryCodec(spell: CustomSpell): CustomSpell {
  const entry = toLibraryEntry({ kind: "spell", item: spell }, 1);
  const stored = JSON.parse(JSON.stringify({ entries: [entry] })) as Record<
    string,
    unknown
  >;
  const parsed = parseLibraryEntries(stored);
  if (!parsed.ok) throw new Error(`library codec rejected: ${parsed.failure.path}`);
  const back = parsed.entries[0];
  if (back?.kind !== "spell") throw new Error("library entry lost");
  return back.item;
}

/** Samples for the fields only private-pack spells carry, so an SRD-only run
 *  still proves them (Power Word Fortify's pool, a half-on-miss, a primary target). */
const PACK_ONLY_FIELD_SAMPLES: Readonly<Record<string, unknown>> = {
  tempHpPool: 120,
  damageOnMiss: "half",
  primaryTargetOnly: true,
};

/** Each structured field a catalogue spell uses, with the value of its first
 *  carrier, in the homebrew mechanics shape. */
function catalogueFieldSamples(): Map<string, unknown> {
  const samples = new Map<string, unknown>();
  for (const spell of catalogueSpells) {
    for (const [key, value] of Object.entries(spell)) {
      if (key in SPELL_FIELD_EXEMPTIONS || samples.has(key)) continue;
      samples.set(key, value);
    }
    const { costGp, consumed } = spell.components;
    if (costGp !== undefined && !samples.has("components")) {
      samples.set("components", { costGp, ...(consumed ? { consumed } : {}) });
    }
  }
  for (const [key, value] of Object.entries(PACK_ONLY_FIELD_SAMPLES)) {
    if (!samples.has(key)) samples.set(key, value);
  }
  return samples;
}

describe("every structured catalogue-spell field is homebrew-expressible", () => {
  const samples = catalogueFieldSamples();

  it("covers every catalogue spell field, with a justified exemption only", () => {
    const fields = new Set(catalogueSpells.flatMap((spell) => Object.keys(spell)));
    for (const field of fields) {
      if (field in SPELL_FIELD_EXEMPTIONS) {
        expect(
          SPELL_FIELD_EXEMPTIONS[field as keyof typeof SPELL_FIELD_EXEMPTIONS],
          field
        ).toMatch(/^.{24,}$/);
      } else {
        expect(HOMEBREW_SPELL_FIELD_SCHEMAS, field).toHaveProperty(field);
      }
    }
    // Every schema'd field has a sample (a catalogue carrier, else a fallback).
    const unsampled = Object.keys(HOMEBREW_SPELL_FIELD_SCHEMAS).filter(
      (field) => !samples.has(field)
    );
    expect(unsampled).toEqual([]);
  });

  it("each field survives both codecs and the homebrew validator accepts it", () => {
    for (const [field, value] of samples) {
      const spell = homebrewSpell({ [field]: value });
      for (const read of [spellThroughCharacterCodec, spellThroughLibraryCodec]) {
        const back = read(spell);
        expect(back.mechanics, `${read.name}: ${field}`).toEqual(spell.mechanics);
        expect(back.unknown?.mechanics, `${read.name}: a known field`).toBeUndefined();
        const accepted = homebrewSpellMechanics(back) as Record<string, unknown>;
        expect(isDeepStrictEqual(accepted[field], value), `${read.name}: ${field}`).toBe(
          true
        );
      }
    }
  });

  it("an accepted spell reaches the catalogue's spell translator", () => {
    const data = homebrewSpellData(homebrewSpell({ saveAbility: "WIS" }));
    if (!data) throw new Error("no spell data");
    expect(translateSpell(data).activity.save?.ability).toBe("WIS");
  });
});

/**
 * Every Activity effect kind → the homebrew action (+ feature grants) or homebrew
 * spell mechanics that produce it, or the gap that keeps homebrew from it. Typed as
 * a full Record so a new effect kind fails the type check until it is classified.
 */
type EffectCase =
  | { action: ActionData; grants?: Grant[] }
  | { spell: HomebrewSpellMechanics }
  | { gap: string };

/** A homebrew spell's follow-up action (the catalogue's `followUp` dialect). */
const followUp = (over: Partial<NonNullable<SrdSpellData["followUp"]>>) => ({
  spell: { followUp: { type: "bonus" as const, ...over } },
});

const base = { type: "action", label: "Use", description: "Use it." } as const;

const EFFECT_CASES: Record<ActivityEffectKind, EffectCase> = {
  heal: { action: { ...base, heal: { dice: "1d6" } } },
  "temp-hp": { action: { ...base, tempHpRoll: { rolls: 1, die: "d4" } } },
  "end-condition": {
    action: { ...base, conditionRemoval: { options: ["poisoned"] } },
  },
  "reduce-damage": {
    action: {
      ...base,
      damageReduction: { dice: "1d10", damageTypesByLevel: { 1: ["fire"] } },
    },
  },
  "grant-die": {
    action: { ...base, grantDie: { kind: "bardic-inspiration", die: "d6" } },
  },
  "heroic-inspiration": { action: { ...base, grantHeroicInspiration: true } },
  "restore-resource": {
    action: { ...base, trackerTopUp: { trackerId: "pool", upTo: "full" } },
  },
  status: {
    action: { ...base },
    grants: [
      {
        type: "while-active",
        activeKey: "house-rule-stance",
        grants: [{ type: "darkvision", range: 60 }],
      },
    ],
  },
  damage: {
    spell: { saveAbility: "DEX", damageDice: "2d6", damageType: "fire" },
  },
  condition: {
    spell: {
      saveAbility: "WIS",
      conditionApplication: { options: ["frightened"], on: "failed-save" },
    },
  },
  mark: followUp({ targetMark: { scope: "marked" } }),
  maintain: followUp({ maintainsActiveKey: "house-spell-state" }),
  stabilize: { spell: { stabilizes: true } },
  "check-bonus": followUp({ checkBonus: { dice: "1d4" } }),
  "next-attack-advantage": followUp({ grantsNextAttackAdvantage: true }),
  "speed-zero": followUp({ locksMovement: true }),
  revive: { spell: { revives: { hitPoints: 1 } } },
  "hp-threshold": {
    spell: { hitPointThreshold: { max: 100, atOrBelow: "dies" } },
  },
};

describe("every Activity effect kind is homebrew-expressible or a recorded gap", () => {
  for (const [kind, entry] of Object.entries(EFFECT_CASES)) {
    if ("gap" in entry) continue;
    if ("spell" in entry) {
      it(`a homebrew spell produces "${kind}" after the codec`, () => {
        const stored = spellThroughCharacterCodec(homebrewSpell(entry.spell));
        const data = homebrewSpellData(stored);
        if (!data) throw new Error("homebrew spell mechanics lost");
        const { activity } = translateSpell(data);
        const kinds = [...activity.effects, ...(activity.followUp?.effects ?? [])].map(
          (e) => e.kind
        );
        expect(kinds).toContain(kind);
      });
      continue;
    }
    it(`a homebrew feature action produces "${kind}" after the codec`, () => {
      const stored = throughCharacterCodec(
        homebrewFeature({
          actions: [entry.action],
          ...(entry.grants ? { grants: entry.grants } : {}),
        })
      );
      const [action] = stored.actions ?? [];
      if (!action) throw new Error("homebrew action lost by the codec");
      const activity = activityFromAction(action, {
        source: {
          kind: "feature",
          owner: "custom-feature",
          ownerId: stored.instanceId,
          index: 0,
        },
        grants: homebrewFeatureGrants(stored),
      });
      expect(activity.effects.map((e) => e.kind)).toContain(kind);
    });
  }
});
