/**
 * Every catalogue entry that declares an active mechanic, in each of today's
 * dialects, with the owner context its translator needs, and all of them as
 * Activities (`catalogueActivities`). The activity tests take their cases from
 * here, so a new spell, feature action, monster entry or beast attack (public or
 * from the content pack) is covered without editing a list; the public SRD
 * catalogue and `@d20-folio/core` publish the same list.
 *
 * Not re-exported from the `@/lib/activities` barrel: it loads the whole
 * catalogue, which the translators themselves never need.
 */
import { BEASTS } from "@/data/beasts";
import { classFeatures } from "@/data/classes";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_FEATS } from "@/data/feats";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { SRD_RACES } from "@/data/races";
import { SRD_WEAPONS } from "@/data/weapons";
import { spells } from "@/data/spells";
import type {
  BeastAttack,
  BeastStatBlock,
  CompanionAttack,
  CompanionStatBlock,
  MonsterEntry,
  SrdActionDef,
} from "@/data/types";
import type { Grant } from "@/lib/grant-schema";
import { raceTraitSessionId } from "@/lib/race-trait-id";
import { translateAction, type ActionOwner } from "./from-action";
import {
  activityFromBeastAttack,
  activityFromCompanionAttack,
  translateMonsterEntry,
} from "./from-creature";
import { activityFromItemActivation } from "./from-item";
import { translateSpell } from "./from-spell";
import { translateWeapon } from "./from-weapon";
import type { ActivityTranslation, MonsterSection } from "./types";

export interface CatalogueAction {
  action: SrdActionDef;
  owner: ActionOwner;
}

/** Every feature, trait, feat, item and invocation action with its owner. */
export function catalogueActions(): CatalogueAction[] {
  const out: CatalogueAction[] = [];
  const add = (
    actions: ReadonlyArray<SrdActionDef> | undefined,
    base: Omit<ActionOwner, "source"> & {
      owner: Extract<ActionOwner["source"], { kind: "feature" }>["owner"];
      ownerId: string;
    }
  ) => {
    const { owner, ownerId, ...context } = base;
    for (const [index, action] of (actions ?? []).entries()) {
      out.push({
        action,
        owner: {
          ...context,
          source: {
            kind: "feature",
            owner,
            ownerId,
            index,
            ...(action.id ? { actionId: action.id } : {}),
          },
        },
      });
    }
  };
  for (const feature of classFeatures) {
    const mechanics = feature.mechanics;
    add(mechanics?.actions, {
      owner: "class-feature",
      ownerId: feature.id,
      ...(mechanics?.tracker ? { trackerId: feature.id } : {}),
      ...(mechanics?.extraTrackers
        ? { extraTrackerIds: mechanics.extraTrackers.map((tracker) => tracker.id) }
        : {}),
      ...(feature.grants ? { grants: feature.grants } : {}),
    });
  }
  for (const feat of SRD_FEATS) {
    const mechanics = feat.mechanics;
    add(mechanics?.actions, {
      owner: "feat",
      ownerId: feat.id,
      ...(mechanics?.tracker ? { trackerId: feat.id } : {}),
      ...(mechanics?.extraTrackers
        ? { extraTrackerIds: mechanics.extraTrackers.map((tracker) => tracker.id) }
        : {}),
      ...(feat.grants ? { grants: feat.grants } : {}),
    });
  }
  for (const race of SRD_RACES) {
    for (const trait of race.traits) {
      add(trait.mechanics?.actions, {
        owner: "race-trait",
        ownerId: `${race.id}:${trait.id}`,
        ...(trait.mechanics?.tracker
          ? { trackerId: raceTraitSessionId(race.id, trait) }
          : {}),
        ...(trait.grants ? { grants: trait.grants } : {}),
      });
    }
  }
  for (const item of SRD_EQUIPMENT) {
    add(item.mechanics?.actions, {
      owner: "equipment",
      ownerId: item.id,
      ...(item.mechanics?.tracker ? { trackerId: `equipment:${item.id}` } : {}),
    });
  }
  for (const invocation of SRD_INVOCATIONS) {
    add(invocation.mechanics?.actions, {
      owner: "invocation",
      ownerId: invocation.id,
      ...(invocation.grants ? { grants: invocation.grants } : {}),
    });
  }
  return out;
}

export interface CatalogueMonsterEntry {
  monsterId: string;
  section: MonsterSection;
  entry: MonsterEntry;
}

const SECTIONS: ReadonlyArray<MonsterSection> = [
  "traits",
  "actions",
  "bonusActions",
  "reactions",
  "legendaryActions",
];

/** Every monster stat-block entry (the bestiary is lazy: load it first). */
export async function catalogueMonsterEntries(): Promise<CatalogueMonsterEntry[]> {
  const { MONSTERS } = await import("@/data/monsters");
  return MONSTERS.flatMap((monster) =>
    SECTIONS.flatMap((section) =>
      (monster[section] ?? []).map((entry) => ({ monsterId: monster.id, section, entry }))
    )
  );
}

/** Every beast-form attack. */
export function catalogueBeastAttacks(): Array<{
  beast: BeastStatBlock;
  attack: BeastAttack;
}> {
  return BEASTS.flatMap((beast) => beast.attacks.map((attack) => ({ beast, attack })));
}

/** Every companion attack, across a stat block's variants, with its owner id. */
export function catalogueCompanionAttacks(): Array<{
  ownerId: string;
  attack: CompanionAttack;
}> {
  const blocks: Array<{ ownerId: string; block: CompanionStatBlock }> = [
    ...classFeatures.flatMap((feature) =>
      feature.companion ? [{ ownerId: feature.id, block: feature.companion }] : []
    ),
    ...spells.flatMap((spell) =>
      spell.companion ? [{ ownerId: spell.id, block: spell.companion }] : []
    ),
  ];
  // A block with variants lists every option, the default included.
  return blocks.flatMap(({ ownerId, block }) =>
    (block.variants ?? [block]).flatMap((variant) =>
      (variant.attacks ?? []).map((attack) => ({
        ownerId: variant.variantId ? `${ownerId}:${variant.variantId}` : ownerId,
        attack,
      }))
    )
  );
}

/** Every magic-item `while-active` grant that declares an activation. */
export function catalogueItemActivations(): Array<{
  itemId: string;
  grant: Extract<Grant, { type: "while-active" }>;
}> {
  return SRD_MAGIC_ITEMS.flatMap((item) =>
    (item.grants ?? []).flatMap((grant) =>
      grant.type === "while-active" && grant.activation
        ? [{ itemId: item.id, grant }]
        : []
    )
  );
}

/**
 * Every active mechanic in the catalogue as one Activity with the source fields it
 * cannot express yet: spells, feature/feat/species/equipment/invocation actions,
 * monster stat-block entries, beast-form and companion attacks, magic-item
 * activations and weapon attacks, in that order.
 */
export async function catalogueActivities(): Promise<ActivityTranslation[]> {
  const monsterEntries = await catalogueMonsterEntries();
  return [
    ...spells.map((spell) => translateSpell(spell)),
    ...catalogueActions().map(({ action, owner }) => translateAction(action, owner)),
    ...monsterEntries.map(({ monsterId, section, entry }) =>
      translateMonsterEntry(monsterId, section, entry)
    ),
    ...catalogueBeastAttacks().map(({ beast, attack }) => ({
      activity: activityFromBeastAttack(beast, attack),
      gaps: [],
    })),
    ...catalogueCompanionAttacks().map(({ ownerId, attack }) => ({
      activity: activityFromCompanionAttack(ownerId, attack),
      gaps: [],
    })),
    ...catalogueItemActivations().flatMap(({ itemId, grant }) => {
      const activity = activityFromItemActivation(itemId, grant);
      return activity ? [{ activity, gaps: [] }] : [];
    }),
    ...SRD_WEAPONS.flatMap((weapon) => translateWeapon(weapon) ?? []),
  ];
}
