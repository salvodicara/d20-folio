/**
 * A homebrew feature's grants behave like the catalogue's: the same mechanics
 * declared on a homebrew feature produce the same aggregate and the same action
 * activation as the SRD feature that declares them (Rage as the reference).
 */
import { describe, expect, it } from "vitest";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
import type { Grant } from "@/lib/grants";
import { homebrewFeatureGrants } from "@/lib/homebrew-grants";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { resolveActions } from "@/lib/smart-tracker";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";
import type { CustomFeature } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";
import { customInstanceId } from "./__helpers__/custom-items";

const rage = getSrdFeatureSource("barbarian-rage");
if (!rage || !("grants" in rage) || !rage.grants) throw new Error("missing Rage");
const [rageState] = rage.grants;
if (rageState?.type !== "while-active") throw new Error("Rage is not a state");

/** Rage's exact mechanics, re-declared as a player's homebrew "Fury". */
const fury: CustomFeature = {
  custom: true,
  title: "Fury",
  emoji: "🔥",
  source: "Homebrew",
  tags: [],
  contentBlocks: [],
  actions: [{ type: "bonus", label: "Fury", description: "Enter a fury." }],
  grants: [{ ...rageState, activeKey: "fury" }],
  instanceId: customInstanceId("fury"),
};

describe("homebrew feature grants", () => {
  it("light the same standing rules as the catalogue feature", () => {
    const srd = makeCharacterDoc({
      classId: "barbarian",
      level: 1,
      features: [{ srdId: "barbarian-rage" }],
    });
    const homebrew = makeCharacterDoc({ classId: "fighter", level: 1, features: [fury] });

    const srdLit = aggregateCharacterGrants(srd.character, {
      activeFeatures: ["barbarian-rage"],
    });
    const homebrewLit = aggregateCharacterGrants(homebrew.character, {
      activeFeatures: ["fury"],
    });
    expect([...homebrewLit.damageResistances].sort()).toEqual(
      [...srdLit.damageResistances].sort()
    );
    expect(homebrewLit.damageResistances.size).toBe(3);

    const unlit = aggregateCharacterGrants(homebrew.character, { activeFeatures: [] });
    expect(unlit.damageResistances.size).toBe(0);
  });

  it("make the homebrew action enter its state, like Rage's action", () => {
    const srdAction = resolveActions(
      makeCharacterDoc({
        classId: "barbarian",
        level: 1,
        features: [{ srdId: "barbarian-rage" }],
      })
    ).find((a) => a.activatesKey === "barbarian-rage");
    const homebrewAction = resolveActions(
      makeCharacterDoc({ classId: "fighter", level: 1, features: [fury] })
    ).find((a) => a.id.startsWith(`custom-${fury.instanceId}`));

    expect(srdAction).toBeDefined();
    expect(homebrewAction?.activatesKey).toBe("fury");
    expect(homebrewAction?.activationEndsEarlyOn).toEqual(
      srdAction?.activationEndsEarlyOn
    );
  });

  it("keep a grant this client cannot read stored, and out of play", () => {
    const future = { type: "future-kind", amount: 1 } as unknown as Grant;
    const darkvision: Grant = { type: "darkvision", range: 90 };
    const feature: CustomFeature = { ...fury, grants: [future, darkvision] };

    const doc = makeCharacterDoc({ classId: "fighter", level: 1, features: [feature] });
    const stored = JSON.parse(JSON.stringify(serializeCharacterEnvelope(doc))) as {
      build: Record<string, unknown>;
      state: Record<string, unknown>;
    };
    const parsed = parseCharacterEnvelope(stored.build, stored.state);
    if (!parsed.ok) throw new Error(parsed.error);
    const back = parsed.character.features.find(
      (f): f is CustomFeature => "custom" in f && f.instanceId === feature.instanceId
    );

    expect(back?.grants).toEqual([future, darkvision]);
    expect(homebrewFeatureGrants(feature)).toEqual([darkvision]);
  });

  it("leave an older homebrew feature (no grants) out of the grant sources", () => {
    const older: CustomFeature = { ...fury };
    delete older.grants;
    expect(resolveGrantSourcesForFeatures([older])).toEqual([]);
  });

  it("reject a stored grants value that is not a list", () => {
    const doc = makeCharacterDoc({ classId: "fighter", level: 1, features: [fury] });
    const stored = JSON.parse(JSON.stringify(serializeCharacterEnvelope(doc))) as {
      build: { customs: { features: Record<string, unknown>[] } };
      state: Record<string, unknown>;
    };
    const entry = stored.build.customs.features.find((f) => f.custom === true);
    if (!entry) throw new Error("homebrew feature not stored");
    entry.grants = { type: "darkvision", range: 60 };
    const parsed = parseCharacterEnvelope(stored.build, stored.state);
    expect(parsed.ok).toBe(false);
  });
});
