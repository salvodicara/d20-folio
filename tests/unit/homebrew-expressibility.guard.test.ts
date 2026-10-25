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
 * The same holds for every structured catalogue MAGIC-ITEM field: a homebrew weapon
 * or item (`CustomWeapon.mechanics`, `CustomEquipment.mechanics`) carries it, both
 * stored forms carry it unchanged, and the one homebrew item validator
 * (`homebrewItemMechanics`) accepts it — so the item reaches the same item paths
 * (`homebrewItemData` → grant sources, item resources).
 *
 * The same holds for every structured catalogue STAT-BLOCK field: a homebrew
 * MONSTER (`CustomMonster.mechanics`, the catalogue stat block's own shape) carries
 * it, the library codec carries it unchanged, every SRD stat block (its entries
 * named) plays unchanged as a homebrew one, and the one homebrew monster validator
 * (`homebrewMonsterMechanics`) accepts it — so the monster reaches the same
 * encounter paths (`homebrewMonsterStatBlock` → counters, Multiattack, actions).
 *
 * The same holds for every structured catalogue FEATURE-ACTION field: a homebrew
 * feature action (`CustomFeature.actions[]`, the catalogue action's own shape)
 * carries it, both stored forms carry it unchanged, every catalogue feature action
 * plays unchanged as a homebrew one, and the one homebrew action validator
 * (`homebrewActionDef`) accepts it — so every Activity effect kind is reachable from
 * a homebrew feature action through the catalogue's own path (`translateAction`).
 *
 * A new Grant kind, field or effect kind that homebrew cannot express fails CI here. An
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
import {
  resolveGrantSourcesForEquipment,
  resolveGrantSourcesForFeatures,
} from "@/lib/resolve-grant-sources";
import { SRD_MAGIC_ITEMS as catalogueMagicItems } from "@/data/magic-items";
import {
  HOMEBREW_ITEM_FIELD_SCHEMAS,
  homebrewItemData,
  homebrewItemMechanics,
} from "@/lib/homebrew-items";
import { activityFromAction, type ActionOwner } from "@/lib/activities/from-action";
import { catalogueActions } from "@/lib/activities/catalogue";
import {
  HOMEBREW_ACTION_FIELD_SCHEMAS,
  homebrewActionDef,
  type HomebrewActionTopLevelKey,
} from "@/lib/homebrew-actions";
import { translateSpell } from "@/lib/activities/from-spell";
import type { ActivityEffectKind } from "@/lib/activities/types";
import { spells as catalogueSpells } from "@/data/spells";
import type {
  CatalogueItemIdentityKey,
  CatalogueMonsterIdentityKey,
  CatalogueSpellIdentityKey,
  CatalogueSpellRuntimeKey,
  HomebrewItemMechanics,
  HomebrewItemTopLevelKey,
  HomebrewMonsterMechanics,
  HomebrewMonsterTopLevelKey,
  HomebrewSpellMechanics,
  HomebrewSpellTopLevelKey,
  MonsterEntry,
  MonsterStatBlock,
  SrdActionDef,
} from "@/data/types";
import { SRD_MONSTERS_A_B } from "@/data/monsters/a-b";
import { SRD_MONSTERS_C_D } from "@/data/monsters/c-d";
import { SRD_MONSTERS_E_G } from "@/data/monsters/e-g";
import { SRD_MONSTERS_H_K } from "@/data/monsters/h-k";
import { SRD_MONSTERS_L_M } from "@/data/monsters/l-m";
import { SRD_MONSTERS_N_P } from "@/data/monsters/n-p";
import { SRD_MONSTERS_Q_S } from "@/data/monsters/q-s";
import { SRD_MONSTERS_T_Z } from "@/data/monsters/t-z";
import { monsterLimitedUses } from "@/features/campaigns/encounter";
import {
  HOMEBREW_MONSTER_FIELD_SCHEMAS,
  homebrewMonsterMechanics,
  homebrewMonsterStatBlock,
} from "@/lib/homebrew-monsters";
import type { CustomMonster } from "@/types/campaign";
import {
  HOMEBREW_SPELL_FIELD_SCHEMAS,
  homebrewSpellData,
  homebrewSpellMechanics,
} from "@/lib/homebrew-spells";
import { MOCK_CHARACTER } from "@/lib/mock";
import type {
  ActionData,
  CustomEquipment,
  CustomFeature,
  CustomSpell,
  CustomWeapon,
} from "@/types/character";
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
  Record<
    CatalogueSpellIdentityKey | HomebrewSpellTopLevelKey | CatalogueSpellRuntimeKey,
    string
  >
> = {
  mechanicsProgram:
    "a hand-written runtime program no play path reads for a spell (only the test-only characterSpellCapability), never authored by a player — as for a homebrew action",
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
 * The catalogue-action fields a homebrew feature action keeps at its own top level —
 * field → why. Typed over `HomebrewActionTopLevelKey`, so a new exemption is a type
 * change, never a silent one.
 */
const ACTION_FIELD_EXEMPTIONS: Readonly<Record<HomebrewActionTopLevelKey, string>> = {
  id: "the action's own stable suffix, stored at the homebrew action's top level",
  type: "the action economy, stored at the homebrew action's top level",
  mechanicsProgram:
    "a hand-written runtime program fed only by the catalogue transcriber, never authored by a player",
};

/** Samples for the action fields no public catalogue action carries today, so an
 *  SRD-only run still proves them (pack-only fields, the generic riders, revival,
 *  a threshold). */
const UNUSED_ACTION_FIELD_SAMPLES: Readonly<Record<string, unknown>> = {
  attackType: "melee",
  requiresActionThisTurn: "flurry-of-blows",
  grantHeroicInspiration: true,
  costTrackerOverride: "house-recharge",
  conditionRemoval: { options: ["charmed", "frightened"], max: 1 },
  targetMark: { scope: "marked", maxRounds: 600 },
  revives: { hitPoints: 1 },
  hitPointThreshold: { max: 100, atOrBelow: "dies" },
  forcedMovement: { direction: "push", feet: 10 },
  speedReduction: { feet: 10, until: { phase: "turn-start", anchor: "actor" } },
  hpMaxReduction: {},
  swallows: { damage: { dice: "3d6", damageType: "acid" } },
};

/** Each structured field a catalogue feature action uses, with its first carrier's
 *  value, then a sample for every schema'd field none carries. */
function catalogueActionFieldSamples(): Map<string, unknown> {
  const samples = new Map<string, unknown>();
  for (const { action } of catalogueActions()) {
    for (const [key, value] of Object.entries(action)) {
      if (key in ACTION_FIELD_EXEMPTIONS || samples.has(key)) continue;
      samples.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(UNUSED_ACTION_FIELD_SAMPLES)) {
    if (!samples.has(key)) samples.set(key, value);
  }
  return samples;
}

/** The engine's own read of a stored homebrew feature action. */
function homebrewActionActivity(feature: CustomFeature, index = 0) {
  const stored = feature.actions?.[index];
  if (!stored) throw new Error("homebrew action lost by the codec");
  return activityFromAction(homebrewActionDef(stored), {
    source: {
      kind: "feature",
      owner: "custom-feature",
      ownerId: feature.instanceId,
      index,
    },
    grants: homebrewFeatureGrants(feature),
  });
}

describe("every structured catalogue-action field is homebrew-expressible", () => {
  const samples = catalogueActionFieldSamples();

  it("covers every catalogue action field, with a justified exemption only", () => {
    const fields = new Set(
      catalogueActions().flatMap(({ action }) => Object.keys(action))
    );
    for (const field of fields) {
      if (field in ACTION_FIELD_EXEMPTIONS) {
        expect(
          ACTION_FIELD_EXEMPTIONS[field as HomebrewActionTopLevelKey],
          field
        ).toMatch(/^.{24,}$/);
      } else {
        expect(HOMEBREW_ACTION_FIELD_SCHEMAS, field).toHaveProperty(field);
      }
    }
    const unsampled = Object.keys(HOMEBREW_ACTION_FIELD_SCHEMAS).filter(
      (field) => !samples.has(field)
    );
    expect(unsampled).toEqual([]);
  });

  it("each field survives both codecs on a homebrew action and the validator accepts it", () => {
    for (const [field, value] of samples) {
      const feature = homebrewFeature({
        actions: [{ ...base, [field]: value }],
      });
      for (const read of [throughCharacterCodec, throughLibraryCodec]) {
        const back = read(feature);
        expect(back.actions, `${read.name}: ${field}`).toEqual(feature.actions);
        const [action] = back.actions ?? [];
        if (!action) throw new Error("homebrew action lost");
        const accepted = homebrewActionDef(action) as unknown as Record<string, unknown>;
        expect(isDeepStrictEqual(accepted[field], value), `${read.name}: ${field}`).toBe(
          true
        );
      }
    }
  });

  it("every catalogue feature action plays unchanged as a homebrew action", () => {
    let actions = 0;
    for (const { action, owner } of catalogueActions()) {
      const authored: Omit<SrdActionDef, "mechanicsProgram"> & Partial<SrdActionDef> = {
        ...action,
      };
      delete authored.mechanicsProgram;
      const homebrew = { ...authored, label: "Use", description: "Use it." };
      const def = homebrewActionDef(homebrew);
      expect(isDeepStrictEqual({ ...def }, authored), activityId(owner)).toBe(true);
      actions += 1;
    }
    expect(actions).toBeGreaterThan(0);
  });
});

const activityId = (owner: ActionOwner): string =>
  owner.source.kind === "feature"
    ? `${owner.source.ownerId}[${owner.source.index}]`
    : owner.source.spellId;

/**
 * Every Activity effect kind → the homebrew feature action (+ feature grants) that
 * produces it through the catalogue's own action path (`homebrewActionDef` →
 * `translateAction`). Typed as a full Record so a new effect kind fails the type
 * check until a homebrew action can express it.
 */
interface EffectCase {
  action: ActionData;
  grants?: Grant[];
}

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
    action: {
      ...base,
      saveAbility: "DEX",
      saveDcAbility: "CHA",
      attack: { dice: "2d6", damageType: "fire", damageOnSave: "half" },
    },
  },
  condition: {
    action: {
      ...base,
      saveAbility: "WIS",
      saveDcAbility: "CHA",
      conditionApplication: { options: ["frightened"], on: "failed-save" },
    },
  },
  mark: { action: { ...base, type: "bonus", targetMark: { scope: "marked" } } },
  maintain: { action: { ...base, type: "bonus", maintainsActiveKey: "house-state" } },
  stabilize: { action: { ...base, stabilize: true } },
  "check-bonus": { action: { ...base, checkBonus: { dice: "1d4" } } },
  "next-attack-advantage": { action: { ...base, grantsNextAttackAdvantage: true } },
  "speed-zero": { action: { ...base, locksMovement: true } },
  revive: { action: { ...base, revives: { hitPoints: 1 } } },
  "hp-threshold": {
    action: { ...base, hitPointThreshold: { max: 100, atOrBelow: "dies" } },
  },
  "forced-movement": {
    action: { ...base, forcedMovement: { direction: "push", feet: 10 } },
  },
  "speed-reduction": {
    action: {
      ...base,
      speedReduction: { feet: 10, until: { phase: "turn-start", anchor: "actor" } },
    },
  },
  "hp-max-reduction": { action: { ...base, hpMaxReduction: {} } },
  swallow: {
    action: { ...base, swallows: { damage: { dice: "3d6", damageType: "acid" } } },
  },
};

describe("every Activity effect kind is expressible on a homebrew feature action", () => {
  for (const [kind, entry] of Object.entries(EFFECT_CASES)) {
    it(`a homebrew feature action produces "${kind}" after both codecs`, () => {
      const feature = homebrewFeature({
        actions: [entry.action],
        ...(entry.grants ? { grants: entry.grants } : {}),
      });
      for (const read of [throughCharacterCodec, throughLibraryCodec]) {
        const kinds = homebrewActionActivity(read(feature)).effects.map((e) => e.kind);
        expect(kinds, read.name).toContain(kind);
      }
    });
  }
});

/**
 * The magic-item fields a homebrew weapon or item does not take as mechanics —
 * field → why. Typed over both key sets (`CatalogueItemIdentityKey`,
 * `HomebrewItemTopLevelKey`), so a new exemption is a type change, never a silent one.
 */
const ITEM_FIELD_EXEMPTIONS: Readonly<
  Record<CatalogueItemIdentityKey | HomebrewItemTopLevelKey, string>
> = {
  id: "catalogue identity: a homebrew item is keyed by its own copy's instanceId",
  source: "the catalogue book: a homebrew item is the player's own",
  potionFormula:
    "stored at the homebrew item's top level (CustomEquipment.potionFormula)",
  properties:
    "the catalogue's prose tags; a homebrew item states them as grants and resources",
};

function homebrewWand(mechanics: HomebrewItemMechanics): CustomEquipment {
  return {
    custom: true,
    name: "House Wand",
    equipped: true,
    quantity: 1,
    instanceId: customInstanceId("house-wand"),
    mechanics,
  };
}

function homebrewBlade(mechanics: HomebrewItemMechanics): CustomWeapon {
  return {
    custom: true,
    name: "House Blade",
    quantity: 1,
    damageDie: "1d8",
    damageType: "slashing",
    attackStat: "STR",
    properties: "",
    instanceId: customInstanceId("house-blade"),
    mechanics,
  };
}

/** Store and re-read a homebrew weapon or item exactly as a character doc does. */
function itemThroughCharacterCodec<T extends CustomEquipment | CustomWeapon>(item: T): T {
  const doc = structuredClone(MOCK_CHARACTER);
  if ("damageDie" in item) doc.character.weapons = [...doc.character.weapons, item];
  else doc.character.equipment = [...doc.character.equipment, item];
  const stored = JSON.parse(JSON.stringify(serializeCharacterEnvelope(doc))) as {
    build: Record<string, unknown>;
    state: Record<string, unknown>;
  };
  const parsed = parseCharacterEnvelope(stored.build, stored.state);
  if (!parsed.ok) throw new Error(`character codec rejected: ${parsed.error}`);
  const back = [...parsed.character.weapons, ...parsed.character.equipment].find(
    (entry) => "custom" in entry && entry.instanceId === item.instanceId
  );
  if (!back) throw new Error("homebrew item lost by the character codec");
  return back as T;
}

/** Store and re-read a homebrew weapon or item exactly as the account library does. */
function itemThroughLibraryCodec<T extends CustomEquipment | CustomWeapon>(item: T): T {
  const entry =
    "damageDie" in item
      ? toLibraryEntry({ kind: "weapon", item }, 1)
      : toLibraryEntry({ kind: "equipment", item: item }, 1);
  const stored = JSON.parse(JSON.stringify({ entries: [entry] })) as Record<
    string,
    unknown
  >;
  const parsed = parseLibraryEntries(stored);
  if (!parsed.ok) throw new Error(`library codec rejected: ${parsed.failure.path}`);
  const back = parsed.entries[0];
  if (back?.kind !== "weapon" && back?.kind !== "equipment") {
    throw new Error("library entry lost");
  }
  return back.item as T;
}

/** Each structured field a catalogue magic item uses, with its first carrier's value. */
function catalogueItemFieldSamples(): Map<string, unknown> {
  const samples = new Map<string, unknown>();
  for (const item of catalogueMagicItems) {
    for (const [key, value] of Object.entries(item)) {
      if (key in ITEM_FIELD_EXEMPTIONS || samples.has(key)) continue;
      samples.set(key, value);
    }
  }
  return samples;
}

describe("every structured catalogue magic-item field is homebrew-expressible", () => {
  const samples = catalogueItemFieldSamples();

  it("covers every catalogue item field, with a justified exemption only", () => {
    const fields = new Set(catalogueMagicItems.flatMap((item) => Object.keys(item)));
    for (const field of fields) {
      if (field in ITEM_FIELD_EXEMPTIONS) {
        expect(
          ITEM_FIELD_EXEMPTIONS[field as keyof typeof ITEM_FIELD_EXEMPTIONS],
          field
        ).toMatch(/^.{24,}$/);
      } else {
        expect(HOMEBREW_ITEM_FIELD_SCHEMAS, field).toHaveProperty(field);
      }
    }
    const unsampled = Object.keys(HOMEBREW_ITEM_FIELD_SCHEMAS).filter(
      (field) => !samples.has(field)
    );
    expect(unsampled).toEqual([]);
  });

  it("each field survives both codecs on a weapon and an item, and the validator accepts it", () => {
    for (const [field, value] of samples) {
      for (const item of [
        homebrewWand({ [field]: value }),
        homebrewBlade({ [field]: value }),
      ]) {
        for (const read of [itemThroughCharacterCodec, itemThroughLibraryCodec]) {
          const back = read(item);
          expect(back.mechanics, `${read.name}: ${field}`).toEqual(item.mechanics);
          expect(back.unknown?.mechanics, `${read.name}: a known field`).toBeUndefined();
          const accepted = homebrewItemMechanics(back) as Record<string, unknown>;
          expect(
            isDeepStrictEqual(accepted[field], value),
            `${read.name}: ${field}`
          ).toBe(true);
        }
      }
    }
  });

  it("an accepted item reaches the catalogue's item-grant path", () => {
    const wand = homebrewWand({ grants: [{ type: "darkvision", range: 60 }] });
    const [source] = resolveGrantSourcesForEquipment([wand]);
    expect(source?.item).toEqual({
      itemId: wand.instanceId,
      instanceId: wand.instanceId,
    });
    expect(source?.grants).toEqual(homebrewItemData(wand)?.grants);
  });
});

// ─── Monsters ───────────────────────────────────────────────────────────────

const SRD_BESTIARY: ReadonlyArray<MonsterStatBlock> = [
  ...SRD_MONSTERS_A_B,
  ...SRD_MONSTERS_C_D,
  ...SRD_MONSTERS_E_G,
  ...SRD_MONSTERS_H_K,
  ...SRD_MONSTERS_L_M,
  ...SRD_MONSTERS_N_P,
  ...SRD_MONSTERS_Q_S,
  ...SRD_MONSTERS_T_Z,
];

/** Catalogue stat-block fields a homebrew monster states elsewhere — field → why. */
const MONSTER_FIELD_EXEMPTIONS: Readonly<
  Record<CatalogueMonsterIdentityKey | HomebrewMonsterTopLevelKey, string>
> = {
  id: "catalogue identity: a homebrew monster is keyed by its library entry id",
  source: "the catalogue book: a homebrew monster is the DM's own",
  ac: "stored at the template's top level (CustomMonster.ac), the encounter's seed",
  hp: "the average is the template's top-level maxHp, the encounter's seed",
  cr: "stored at the template's top level (CustomMonster.cr), which seeds the XP",
  type: "stored at the template's top level (CustomMonster.creatureType)",
  damageVulnerabilities: "stored in the template's top-level defenses snapshot",
  damageResistances: "stored in the template's top-level defenses snapshot",
  damageImmunities: "stored in the template's top-level defenses snapshot",
  conditionImmunities: "stored in the template's top-level defenses snapshot",
  qualifiedDefenses: "stored in the template's top-level defenses snapshot",
};

function homebrewMonster(mechanics: HomebrewMonsterMechanics): CustomMonster {
  return { name: "House Monster", ac: 14, maxHp: 40, cr: "3", mechanics };
}

/** Store and re-read a homebrew monster exactly as the account library does. */
function monsterThroughLibraryCodec(item: CustomMonster): CustomMonster {
  const entry = toLibraryEntry({ kind: "monster", item }, 1);
  const stored = JSON.parse(JSON.stringify({ entries: [entry] })) as Record<
    string,
    unknown
  >;
  const parsed = parseLibraryEntries(stored);
  if (!parsed.ok) throw new Error(`library codec rejected: ${parsed.failure.path}`);
  const back = parsed.entries[0];
  if (back?.kind !== "monster") throw new Error("library entry lost");
  return back.item;
}

/** Deviation overrides no public SRD print needs (the content pack's may): sampled
 *  here so their schema is still proven. */
const UNUSED_MONSTER_FIELD_SAMPLES: Readonly<Record<string, unknown>> = {
  saveOverrides: { DEX: 7 },
  passivePerceptionOverride: 17,
};

/** Each stat-block field the SRD bestiary uses, with its first carrier's value. */
function catalogueMonsterFieldSamples(): Map<string, unknown> {
  const samples = new Map<string, unknown>(Object.entries(UNUSED_MONSTER_FIELD_SAMPLES));
  for (const monster of SRD_BESTIARY) {
    for (const [key, value] of Object.entries(monster)) {
      if (key in MONSTER_FIELD_EXEMPTIONS || samples.has(key)) continue;
      samples.set(key, value);
    }
  }
  return samples;
}

const STAT_BLOCK_SECTIONS = [
  "traits",
  "actions",
  "bonusActions",
  "reactions",
  "legendaryActions",
] as const;

/** A catalogue entry as a homebrew one: the DM's name beside the catalogue shape. */
const named = (entries: ReadonlyArray<MonsterEntry> | undefined) =>
  entries?.map((entry) => ({ ...entry, name: entry.id }));

describe("every structured catalogue stat-block field is homebrew-expressible", () => {
  const samples = catalogueMonsterFieldSamples();

  it("covers every catalogue monster field, with a justified exemption only", () => {
    const fields = new Set(SRD_BESTIARY.flatMap((monster) => Object.keys(monster)));
    for (const field of fields) {
      if (field in MONSTER_FIELD_EXEMPTIONS) {
        expect(
          MONSTER_FIELD_EXEMPTIONS[field as keyof typeof MONSTER_FIELD_EXEMPTIONS],
          field
        ).toMatch(/^.{24,}$/);
      } else {
        expect(HOMEBREW_MONSTER_FIELD_SCHEMAS, field).toHaveProperty(field);
      }
    }
    const unsampled = Object.keys(HOMEBREW_MONSTER_FIELD_SCHEMAS).filter(
      (field) => !samples.has(field)
    );
    expect(unsampled).toEqual([]);
  });

  it("each field survives the library codec, and the validator accepts it", () => {
    for (const [field, value] of samples) {
      const isSection = (STAT_BLOCK_SECTIONS as readonly string[]).includes(field);
      const authored = isSection ? named(value as ReadonlyArray<MonsterEntry>) : value;
      // A section's Multiattack may name entries of other sections; carry them all.
      const item = homebrewMonster(
        isSection
          ? Object.fromEntries(
              STAT_BLOCK_SECTIONS.map((section) => [
                section,
                section === field
                  ? authored
                  : named(
                      SRD_BESTIARY.find(
                        (monster) => monster[field as typeof section] === value
                      )?.[section]
                    ),
              ])
            )
          : { [field]: authored }
      );
      const back = monsterThroughLibraryCodec(item);
      expect(back.mechanics, field).toEqual(item.mechanics);
      const accepted = homebrewMonsterMechanics(back) as Record<string, unknown>;
      expect(isDeepStrictEqual(accepted[field], authored), field).toBe(true);
    }
  });

  it("every SRD stat block, its entries named, plays as a homebrew monster unchanged", () => {
    let entries = 0;
    for (const monster of SRD_BESTIARY) {
      const mechanics = Object.fromEntries(
        STAT_BLOCK_SECTIONS.flatMap((section) => {
          entries += monster[section]?.length ?? 0;
          return monster[section] ? [[section, named(monster[section])]] : [];
        })
      ) as HomebrewMonsterMechanics;
      const accepted = homebrewMonsterMechanics(homebrewMonster(mechanics));
      for (const section of STAT_BLOCK_SECTIONS) {
        expect(
          isDeepStrictEqual(accepted?.[section], mechanics[section]),
          `${monster.id}.${section}`
        ).toBe(true);
      }
    }
    expect(entries).toBe(1326);
  });

  it("an accepted monster reaches the encounter's counter path", () => {
    const dragon = SRD_BESTIARY.find((monster) => monster.id === "adult-red-dragon");
    if (!dragon) throw new Error("no adult red dragon");
    const item = homebrewMonster({
      legendary: dragon.legendary,
      traits: named(dragon.traits),
      actions: named(dragon.actions),
    });
    const block = homebrewMonsterStatBlock("house-dragon", item);
    expect(block && monsterLimitedUses(block)).toEqual(monsterLimitedUses(dragon));
  });
});
