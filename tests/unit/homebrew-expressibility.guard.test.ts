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
 * The same holds for every Activity effect a feature action can produce: each
 * effect kind is either reachable from the homebrew action dialect (`ActionData`)
 * or recorded below as a gap with what it needs.
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
import type { ActivityEffectKind } from "@/lib/activities/types";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { ActionData, CustomFeature } from "@/types/character";
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
 * Every Activity effect kind → the homebrew action (+ feature grants) that
 * produces it, or the gap that keeps homebrew from it. Typed as a full Record so
 * a new effect kind fails the type check until it is classified here.
 */
type EffectCase = { action: ActionData; grants?: Grant[] } | { gap: string };

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
    gap: "ActionData has no `attack` (dice, damage type, save/attack gate) field",
  },
  condition: { gap: "ActionData has no `conditionApplication` field" },
  mark: { gap: "ActionData has no `targetMark` field (Hunter's Mark-style marks)" },
  maintain: { gap: "ActionData has no `maintainsActiveKey` field" },
  stabilize: { gap: "ActionData has no `stabilize` field" },
  "check-bonus": { gap: "ActionData has no `checkBonus` field" },
  "next-attack-advantage": {
    gap: "ActionData has no `grantsNextAttackAdvantage` field",
  },
  "speed-zero": { gap: "ActionData has no `locksMovement` field" },
  revive: {
    gap: "a spell-only effect; a homebrew spell (CustomSpell) carries no structured activity",
  },
  "hp-threshold": {
    gap: "a spell-only effect; a homebrew spell (CustomSpell) carries no structured activity",
  },
};

describe("every Activity effect kind is homebrew-expressible or a recorded gap", () => {
  for (const [kind, entry] of Object.entries(EFFECT_CASES)) {
    if ("gap" in entry) continue;
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
