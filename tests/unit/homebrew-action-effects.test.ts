/**
 * A homebrew feature action declares its effects in the catalogue action's shape
 * and reaches the SAME resolver path a catalogue feature action does; the generic
 * riders (push, Speed loss, Hit Point maximum drain, swallow) read the same from a
 * homebrew action, a homebrew monster and a catalogue-shaped monster entry.
 */
import { describe, expect, it } from "vitest";
import en from "@/i18n/en/ui/combat.json";
import it_ from "@/i18n/it/ui/combat.json";
import {
  activityFromAction,
  effectsOfKind,
  hpMaxReductionAmount,
  isRiderEffect,
  riderNotes,
  type RiderEffect,
  swallowedFacts,
  translateMonsterEntry,
} from "@/lib/activities";
import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
import { homebrewActionDef } from "@/lib/homebrew-actions";
import { homebrewMonsterStatBlock } from "@/lib/homebrew-monsters";
import { setHpMaxReduction } from "@/lib/play/vitals";
import { resolveActions } from "@/lib/smart-tracker";
import type { CustomMonster } from "@/types/campaign";
import type { ActionData, CustomFeature } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";
import { customInstanceId } from "./__helpers__/custom-items";

function feature(actions: ActionData[]): CustomFeature {
  return {
    custom: true,
    title: "Dread Lord",
    emoji: "🕯️",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    actions,
    instanceId: customInstanceId("dread-lord"),
  };
}

/** A level-5 character (PB 3, WIS 12) holding the homebrew feature, after a store. */
function storedDoc(homebrew: CustomFeature) {
  const doc = makeCharacterDoc({ classId: "fighter", level: 5, features: [homebrew] });
  const stored = JSON.parse(JSON.stringify(serializeCharacterEnvelope(doc))) as {
    build: Record<string, unknown>;
    state: Record<string, unknown>;
  };
  const parsed = parseCharacterEnvelope(stored.build, stored.state);
  if (!parsed.ok) throw new Error(parsed.error);
  return { ...doc, character: parsed.character };
}

const dreadFlare: ActionData = {
  id: "flare",
  type: "action",
  label: "Dread Flare",
  description: "A burst of black fire.",
  saveAbility: "CON",
  saveDcAbility: "WIS",
  attack: { dice: "2d6", damageType: "fire", damageOnSave: "half" },
  conditionApplication: { options: ["frightened"], on: "failed-save" },
};

const quarry: ActionData = {
  id: "quarry",
  type: "bonus",
  label: "Mark Quarry",
  description: "You mark a creature as your quarry.",
  targeting: { affinity: "enemy" },
  targetMark: { scope: "marked", maxRounds: 600 },
};

const rowOf = (homebrew: CustomFeature, actionId: string) =>
  resolveActions(storedDoc(homebrew)).find(
    (row) => row.id === `custom-${homebrew.instanceId}-${actionId}`
  );

describe("a homebrew feature action resolves through the catalogue action path", () => {
  it("deals damage on a save and applies a condition on a failed one", () => {
    const row = rowOf(feature([dreadFlare]), "flare");
    expect(row?.summary.damage).toBe("2d6");
    expect(row?.summary.damageType).toBe("fire");
    expect(row?.summary.damageOnSave).toBe("half");
    expect(row?.summary.saveAbility).toBe("CON");
    // 8 + PB 3 + WIS 12 (+1).
    expect(row?.summary.saveDC).toBe(12);
    expect(row?.summary.conditionApplication).toEqual({
      options: ["frightened"],
      on: "failed-save",
    });
  });

  it("binds a mark the way a catalogue mark action does (Hunter's-Mark-like)", () => {
    const homebrew = feature([quarry]);
    const row = rowOf(homebrew, "quarry");
    expect(row?.type).toBe("bonus");
    expect(row?.standingEffect).toEqual({
      sourceId: homebrew.instanceId,
      sourceKind: "feature",
      activeKey: homebrew.instanceId,
      markScope: "marked",
      targetAffinity: "enemy",
      maxRounds: 600,
    });
    const activity = activityFromAction(homebrewActionDef(quarry), {
      source: {
        kind: "feature",
        owner: "custom-feature",
        ownerId: homebrew.instanceId,
        index: 0,
        actionId: "quarry",
      },
    });
    expect(effectsOfKind(activity, "mark")).toEqual([
      { kind: "mark", scope: "marked", lifetime: { kind: "rounds", roundsLeft: 600 } },
    ]);
  });

  it("leaves a field the schema rejects out of play, the stored action untouched", () => {
    const broken = {
      ...dreadFlare,
      attack: { dice: 6, damageType: "fire" },
      conditionApplication: { options: ["not-a-condition"], on: "failed-save" },
      futureField: { kind: "newer-client" },
    } as unknown as ActionData;
    const homebrew = feature([broken]);
    const row = rowOf(homebrew, "flare");
    expect(row?.summary.saveAbility).toBe("CON");
    expect(row?.summary.damage).toBeUndefined();
    expect(row?.summary.conditionApplication).toBeUndefined();
    const stored = storedDoc(homebrew).character.features.find(
      (f): f is CustomFeature => "custom" in f
    );
    expect(stored?.actions).toEqual([broken]);
  });

  it("keeps an older text-only homebrew action playing as before", () => {
    const older: ActionData = {
      type: "action",
      label: "Old Trick",
      description: "Something the table adjudicates.",
    };
    const homebrew = feature([older]);
    const row = rowOf(homebrew, "action");
    expect(row?.name).toEqual({ custom: "Old Trick" });
    expect(row?.summary.damage).toBeUndefined();
    expect(row?.standingEffect).toBeUndefined();
  });
});

describe("generic riders", () => {
  const ogre: CustomMonster = {
    name: "Bog Ogre",
    ac: 13,
    maxHp: 59,
    cr: "3",
    mechanics: {
      actions: [
        {
          id: "bite",
          name: "Bite",
          kind: "attack",
          attack: "melee",
          toHit: 6,
          reachFt: 5,
          damage: [{ dice: "2d8+4", damageType: "piercing" }],
          forcedMovement: { direction: "push", feet: 10 },
        },
        {
          id: "life-drain",
          name: "Life Drain",
          kind: "save",
          save: "CON",
          dc: 13,
          onSuccess: "none",
          damage: [{ dice: "3d6", damageType: "necrotic" }],
          hpMaxReduction: {},
        },
        {
          id: "swallow",
          name: "Swallow",
          kind: "save",
          save: "DEX",
          dc: 14,
          onSuccess: "none",
          swallows: { damage: { dice: "3d6", damageType: "acid" } },
          speedReduction: { feet: 10, until: { phase: "turn-end", anchor: "target" } },
        },
      ],
    },
  };
  const block = homebrewMonsterStatBlock("bog-ogre", ogre);
  const entry = (id: string) => {
    const found = block?.actions.find((candidate) => candidate.id === id);
    if (!block || !found) throw new Error(`no ${id}`);
    return translateMonsterEntry(block.id, "actions", found).activity;
  };

  it("a homebrew monster bite pushes 10 ft", () => {
    const bite = entry("bite");
    expect(effectsOfKind(bite, "forced-movement")).toEqual([
      { kind: "forced-movement", direction: "push", feet: 10 },
    ]);
    const [push] = bite.effects.filter(isRiderEffect);
    expect(push && riderNotes(push)).toEqual([
      { text: { ui: "combat.effectRider.push" }, distanceFt: 10 },
    ]);
  });

  it("a drain reduces the Hit Point maximum by the damage taken", () => {
    const [drain] = effectsOfKind(entry("life-drain"), "hp-max-reduction");
    if (!drain) throw new Error("no drain");
    const doc = makeCharacterDoc({}, { hp: { current: 44, temp: 0 } });
    const amount = hpMaxReductionAmount(drain, { damageTaken: 11 });
    const session = setHpMaxReduction(doc, (doc.session.hpMaxReduction ?? 0) + amount);
    expect(session?.hpMaxReduction).toBe(11);
    expect(session?.hp.current).toBe(33);
    expect(
      hpMaxReductionAmount(
        { kind: "hp-max-reduction", dice: { dice: "1d10" } },
        {
          damageTaken: 11,
          rolled: 4,
        }
      )
    ).toBe(4);
  });

  it("a swallow is Blinded + Restrained, Total Cover and acid each of its turns", () => {
    const swallow = entry("swallow");
    const [swallowed] = effectsOfKind(swallow, "swallow");
    if (!swallowed) throw new Error("no swallow");
    expect(swallowedFacts(swallowed)).toEqual({
      conditions: ["blinded", "restrained"],
      cover: "total",
      recurring: { dice: "3d6", types: ["acid"], phase: "turn-start", anchor: "actor" },
    });
    expect(effectsOfKind(swallow, "speed-reduction")).toEqual([
      {
        kind: "speed-reduction",
        feet: 10,
        until: { phase: "turn-end", anchor: "target" },
      },
    ]);
  });

  it("every rider line has its English and Italian copy", () => {
    const others: RiderEffect[] = [
      { kind: "forced-movement", direction: "pull", feet: 5 },
      { kind: "speed-reduction", feet: 10 },
      ...(["turn-start", "turn-end"] as const).flatMap((phase) =>
        (["actor", "target"] as const).map((anchor) => ({
          kind: "speed-reduction" as const,
          feet: 10,
          until: { phase, anchor },
        }))
      ),
      { kind: "hp-max-reduction", dice: { dice: "1d10" } },
    ];
    const riders = [entry("bite"), entry("life-drain"), entry("swallow")]
      .flatMap((activity) => activity.effects.filter(isRiderEffect))
      .concat(others);
    const keys = riders.flatMap((rider) =>
      riderNotes(rider).map((note) => ("ui" in note.text ? note.text.ui : ""))
    );
    expect(new Set(keys).size).toBe(11);
    for (const key of keys) {
      const leaf = key.replace("combat.effectRider.", "");
      expect(en.combat.effectRider, key).toHaveProperty([leaf]);
      expect(it_.combat.effectRider, key).toHaveProperty([leaf]);
    }
  });
});
