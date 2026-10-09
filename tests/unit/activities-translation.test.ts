/**
 * The "8 action dialects → 1 Activity" translators, checked against the whole
 * catalogue (public SRD plus the content pack when it is composed):
 *
 *  - every spell, feature action, monster entry, beast attack, companion attack
 *    and item activation translates, with a unique id;
 *  - anything the Activity cannot express yet is a named gap with a reason from
 *    a closed list, never a silent drop;
 *  - the translation is lossless: reading the Activity back gives every source
 *    field again (the oracles below are the old dialects as projections).
 *
 * What it does not see: the `while-active` states a spell or feature lights and
 * the app-facing numbers; `activities-equivalence.test.ts` checks those against
 * what the app shows today.
 */
import { describe, expect, it } from "vitest";

import { spells } from "@/data/spells";
import type {
  BeastAttack,
  CompanionAttack,
  MonsterEntry,
  SrdActionDef,
  SrdSpellData,
} from "@/data/types";
import {
  activityFromBeastAttack,
  activityFromCompanionAttack,
  activityFromItemActivation,
  translateAction,
  translateMonsterEntry,
  translateSpell,
  type ActionOwner,
  type Activity,
  type ActivityDice,
  type ActivityEffect,
  type ActivityGap,
} from "@/lib/activities";
import { castingTimeI18nKey } from "@/lib/utils";
import {
  catalogueActions,
  catalogueBeastAttacks,
  catalogueCompanionAttacks,
  catalogueItemActivations,
  catalogueMonsterEntries,
} from "./__helpers__/activity-catalogue";

/** The only source fields an Activity may leave out, and why. */
const KNOWN_GAPS: Readonly<Record<string, string>> = {
  mechanicsProgram: "hand-written runtime program",
  weaponAttackCantrip: "wielded-weapon damage with a type swap",
  companion: "a summoned entity, not an activity",
  spellcasting: "a list of spells, each its own Activity",
  text: "prose-only stat-block entry",
  saveAbility: "a save with no declared DC ability",
  damageChoice: "a choice declared next to a fixed type (data to fix)",
  damageTypes: "several types declared next to a fixed type (data to fix)",
};

function expectKnownGaps(id: string, gaps: ReadonlyArray<ActivityGap>) {
  for (const gap of gaps) {
    const field = gap.field.replace(/^followUp\./, "");
    expect(
      KNOWN_GAPS[field],
      `${id}: unexpected gap ${gap.field} (${gap.reason})`
    ).toBeDefined();
  }
}

/** Drop `undefined` fields (deep) so a projection compares like the source. */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The value, or a failing test when the catalogue lacks it. */
function must<T>(value: T | null | undefined, what = "value"): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

const damageEffects = (activity: Activity) =>
  activity.effects.filter(
    (effect): effect is Extract<ActivityEffect, { kind: "damage" }> =>
      effect.kind === "damage"
  );

const has = (dice: ActivityDice | undefined, kind: string) =>
  dice?.plus?.some((term) => term.kind === kind) ?? false;

const flat = (dice: ActivityDice | undefined, kind: "flat" | "flat-per-upcast") => {
  const term = dice?.plus?.find((candidate) => candidate.kind === kind);
  return term && "value" in term ? term.value : undefined;
};

function minutesText(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** The casting-time key the catalogue's own key function gives, from the cost. */
function castingKey(activity: Activity): string {
  const { economy, minutes, orMinutes } = activity.cost;
  if (economy === "reaction") return "reaction";
  if (economy === "bonus") return "bonus action";
  if (economy === "action") {
    return orMinutes === undefined ? "action" : `1 action or ${minutesText(orMinutes)}`;
  }
  return minutesText(minutes ?? 0);
}

/** The old flat spell fields, read back from the Activity. */
function spellFromActivity(activity: Activity): Record<string, unknown> {
  const { cost, target, save } = activity;
  const [primary, secondary] = damageEffects(activity).filter(
    (effect) => !effect.vsCreatureTypes
  );
  const against = damageEffects(activity).find((effect) => effect.vsCreatureTypes);
  const heal = activity.effects.find(
    (effect): effect is Extract<ActivityEffect, { kind: "heal" }> =>
      effect.kind === "heal" && effect.fromDamage === undefined
  );
  const selfHeal = activity.effects.find(
    (effect): effect is Extract<ActivityEffect, { kind: "heal" }> =>
      effect.kind === "heal" && effect.fromDamage !== undefined
  );
  const tempRoll = activity.effects.find(
    (effect): effect is Extract<ActivityEffect, { kind: "temp-hp" }> =>
      effect.kind === "temp-hp" && effect.dice !== undefined
  );
  const tempPool = activity.effects.find(
    (effect): effect is Extract<ActivityEffect, { kind: "temp-hp" }> =>
      effect.kind === "temp-hp" && effect.pool !== undefined
  );
  const condition = activity.effects.find((effect) => effect.kind === "condition");
  const removal = activity.effects.find((effect) => effect.kind === "end-condition");
  const level = activity.source.kind === "spell" ? activity.source.level : -1;
  const types = primary?.types;
  return clean({
    level,
    castingTime: castingKey(activity),
    reactionTrigger: cost.trigger,
    ritual: cost.ritual === true,
    components: {
      v: cost.components?.v === true,
      s: cost.components?.s === true,
      m: cost.components?.m === true,
      costGp: cost.components?.gp,
      consumed: cost.components?.consumed,
    },
    concentration: activity.concentration === true,
    instantaneous: activity.instantaneous,
    targeting:
      target?.affinity !== undefined
        ? {
            affinity: target.affinity,
            excludeSelf: target.excludeSelf,
            creatureTypes: target.creatureTypes,
            maxTargets: target.count as number | undefined,
            maxTargetsPerUpcast: target.countPerUpcast,
            sharedAmount: target.sharedAmount,
          }
        : undefined,
    area: target?.area,
    primaryTargetOnly: target?.primaryOnly,
    attackType:
      activity.attack?.mode === "melee-or-ranged" ? undefined : activity.attack?.mode,
    saveAbility: save?.ability,
    endsOnSuccessfulSave: activity.endsOnSave,
    instances: activity.repeats?.count,
    instancesPerUpcast: activity.repeats?.perUpcast,
    cantripInstances: activity.repeats?.cantrip,
    damageDice: primary?.dice?.dice,
    damageDicePerUpcast: primary?.dice?.perUpcast,
    damageAddsCastMod: has(primary?.dice, "spell-mod") || undefined,
    damageType: !primary?.choose && types?.length === 1 ? types[0] : undefined,
    damageTypes: !primary?.choose && (types?.length ?? 0) > 1 ? types : undefined,
    damageChoice: primary?.choose ? types : undefined,
    damageResolution: primary?.gate,
    damageOnSave: primary?.onSave,
    damageOnMiss: primary?.onMiss,
    secondaryDamage: secondary
      ? {
          dice: secondary.dice?.dice,
          damageType: secondary.types?.[0],
          dicePerUpcast: secondary.dice?.perUpcast,
          resolution: secondary.gate,
          area: secondary.area,
          damageOnSave: secondary.onSave,
          damageOnMiss: secondary.onMiss,
        }
      : undefined,
    bonusDamageAgainst: against
      ? {
          creatureTypes: against.vsCreatureTypes,
          dice: against.dice?.dice,
          damageType: against.types?.[0],
        }
      : undefined,
    healDice: heal?.dice?.dice,
    healDicePerUpcast: heal?.dice?.perUpcast,
    healAddsCastMod: has(heal?.dice, "spell-mod") || undefined,
    healingMode: heal?.full ? "full" : heal?.consumable ? "consumable" : undefined,
    consumableItem: heal?.consumable,
    healingPool: heal?.pool,
    selfHealingFromDamage: selfHeal ? { fraction: selfHeal.fromDamage } : undefined,
    tempHpRoll: tempRoll
      ? {
          dice: tempRoll.dice?.dice,
          bonus: flat(tempRoll.dice, "flat"),
          bonusPerUpcast: flat(tempRoll.dice, "flat-per-upcast"),
        }
      : undefined,
    tempHpPool: tempPool?.pool,
    conditionApplication: condition?.kind === "condition" ? condition.apply : undefined,
    conditionRemoval:
      removal?.kind === "end-condition"
        ? { options: removal.options, max: removal.max }
        : undefined,
    recurrence: activity.recurrence,
    resolveOnCast: activity.resolveOnCast,
    effectTag: activity.tag,
  });
}

/** Spell fields that are identity or are checked elsewhere, never mechanics here. */
const SPELL_NOT_ROUND_TRIPPED = new Set([
  "id",
  "school",
  "classes",
  "source",
  "grants", // the statuses a spell lights: activities-equivalence.test.ts
  "followUp", // round-tripped as an action below
]);

function spellMechanics(
  spell: SrdSpellData,
  gaps: ReadonlyArray<ActivityGap>
): Partial<SrdSpellData> {
  const skipped = new Set([...SPELL_NOT_ROUND_TRIPPED, ...gaps.map((gap) => gap.field)]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spell)) {
    if (!skipped.has(key)) out[key] = value;
  }
  out.castingTime = castingTimeI18nKey(spell.castingTime);
  return clean(out as Partial<SrdSpellData>);
}

/** The old `SrdActionDef` fields, read back from the Activity. */
function actionFromActivity(
  activity: Activity,
  owner: ActionOwner
): Record<string, unknown> {
  const { cost, target, save } = activity;
  const [tracker] = (cost.pay ?? []).filter((resource) => resource.kind === "tracker");
  const trackerId = tracker?.kind === "tracker" ? tracker.trackerId : undefined;
  const effect = <K extends ActivityEffect["kind"]>(kind: K) =>
    activity.effects.find(
      (candidate): candidate is Extract<ActivityEffect, { kind: K }> =>
        candidate.kind === kind
    );
  const damage = effect("damage");
  const heal = activity.effects.find(
    (candidate): candidate is Extract<ActivityEffect, { kind: "heal" }> =>
      candidate.kind === "heal" && !candidate.fromPool
  );
  const temp = effect("temp-hp");
  const removals = activity.effects.filter(
    (candidate): candidate is Extract<ActivityEffect, { kind: "end-condition" }> =>
      candidate.kind === "end-condition"
  );
  const removal = removals.find((candidate) => candidate.costHp === undefined);
  const cures = removals.filter((candidate) => candidate.costHp !== undefined);
  const reduction = effect("reduce-damage");
  const mark = effect("mark");
  const dieTerm = (dice: ActivityDice | undefined) =>
    dice?.plus?.find((term) => term.kind !== "owner-level" && term.kind !== "spell-mod");
  const ability = (dice: ActivityDice | undefined) => {
    const term = dice?.plus?.find((candidate) => candidate.kind === "ability-mod");
    return term?.kind === "ability-mod" ? term.ability : undefined;
  };
  const attack = activity.attack;
  return clean({
    id: activity.source.kind === "feature" ? activity.source.actionId : undefined,
    type: cost.economy as SrdActionDef["type"],
    trigger: cost.trigger,
    economyCategory: cost.economyCategory,
    maxUsesPerTurn: cost.maxUsesPerTurn,
    trackerCost: tracker?.kind === "tracker" ? tracker.amount : undefined,
    costTrackerOverride:
      trackerId && owner.extraTrackerIds?.includes(trackerId) ? trackerId : undefined,
    costTracker:
      trackerId &&
      trackerId !== owner.trackerId &&
      !owner.extraTrackerIds?.includes(trackerId)
        ? trackerId
        : undefined,
    alternateCost: cost.orPay as SrdActionDef["alternateCost"],
    requiresActionThisTurn: activity.requires?.actionThisTurn,
    requiresOutcomeThisTurn: activity.requires?.outcomeThisTurn,
    requiresActionCategoryThisTurn: activity.requires?.categoryThisTurn,
    requiresBundleOption: activity.requires?.bundleOption,
    targeting:
      target?.affinity !== undefined
        ? {
            affinity: target.affinity,
            excludeSelf: target.excludeSelf,
            creatureTypes: target.creatureTypes,
            maxTargets: target.count,
            maxTargetsPerUpcast: target.countPerUpcast,
            sharedAmount: target.sharedAmount,
          }
        : undefined,
    area: target?.area,
    attackType:
      attack?.bonus.kind === "spell" && attack.mode !== "melee-or-ranged"
        ? attack.mode
        : undefined,
    attackSequence:
      attack?.bonus.kind === "weapon"
        ? {
            attackId: attack.bonus.weapon,
            instances: activity.repeats?.count,
            instancesByLevel: activity.repeats?.byLevel,
          }
        : undefined,
    saveAbility: save?.ability,
    saveDcAbility: save?.dc?.kind === "ability" ? save.dc.ability : undefined,
    skillCheck: activity.skill,
    attack: damage
      ? {
          dice: damage.dice?.dice,
          diceByLevel: damage.dice?.byLevel,
          diceCount: damage.dice?.count?.of,
          dieFace: damage.dice?.count?.face,
          dicePerUpcast: damage.dice?.perUpcast,
          addMod: ability(damage.dice),
          addLevel: has(damage.dice, "owner-level") || undefined,
          damageType: !damage.choose ? damage.types?.[0] : undefined,
          damageTypeChoices: damage.choose ? damage.types : undefined,
          damageTypeChoicesByLevel: damage.chooseByLevel,
          damageTypeFromBundle: damage.fromBundle,
          resolution: damage.gate,
          damageOnSave: damage.onSave,
          mode: damage.orHeal ? "heal-or-damage" : undefined,
        }
      : undefined,
    heal: heal
      ? {
          dice: heal.dice?.dice,
          diceCount: heal.dice?.count?.of,
          dieFace: heal.dice?.count?.face,
          plus: dieTerm(heal.dice),
        }
      : undefined,
    poolSpendEffect: activity.effects.some(
      (candidate) => candidate.kind === "heal" && candidate.fromPool
    )
      ? "healing"
      : undefined,
    tempHpRoll: temp
      ? {
          rolls: temp.dice?.rolls,
          die: temp.dice?.dice,
          plus: dieTerm(temp.dice),
          multiplier: temp.dice?.multiplier,
          fromLevel: temp.fromLevel,
        }
      : undefined,
    conditionApplication: effect("condition")?.apply,
    conditionRemoval: removal
      ? { options: removal.options, max: removal.max, fromLevel: removal.fromLevel }
      : undefined,
    cureConditions:
      cures.length > 0
        ? cures.map((cure) => ({
            condition: cure.options[0],
            costHp: cure.costHp,
            fromLevel: cure.fromLevel,
          }))
        : undefined,
    damageReduction: reduction
      ? {
          dice: reduction.dice.dice,
          addAbility: ability(reduction.dice),
          addLevel: has(reduction.dice, "owner-level") || undefined,
          damageTypesByLevel: reduction.typesByLevel,
        }
      : undefined,
    targetMark: mark
      ? {
          scope: mark.scope,
          maxRounds:
            mark.lifetime?.kind === "rounds" ? mark.lifetime.roundsLeft : undefined,
        }
      : undefined,
    grantDie: effect("grant-die")
      ? { kind: "bardic-inspiration", die: must(effect("grant-die")).die }
      : undefined,
    grantHeroicInspiration: effect("heroic-inspiration") ? true : undefined,
    stabilize: effect("stabilize") ? true : undefined,
    trackerTopUp: effect("restore-resource")
      ? {
          trackerId: must(effect("restore-resource")).trackerId,
          upTo: must(effect("restore-resource")).upTo,
        }
      : undefined,
    checkBonus: effect("check-bonus")
      ? {
          dice: must(effect("check-bonus")).dice,
          refundOnFail: must(effect("check-bonus")).refundOnFail,
        }
      : undefined,
    grantsNextAttackAdvantage: effect("next-attack-advantage") ? true : undefined,
    locksMovement: effect("speed-zero") ? true : undefined,
    maintainsActiveKey: effect("maintain")?.key,
  });
}

function actionMechanics(
  action: SrdActionDef,
  owner: ActionOwner
): Partial<SrdActionDef> {
  const out: Record<string, unknown> = { ...action };
  delete out.mechanicsProgram;
  // The resolver spends the owner's own tracker first; a costTracker it would
  // never read is not a fact of the action.
  if (owner.trackerId && !action.costTrackerOverride) delete out.costTracker;
  if (action.maintainsActiveKey) {
    delete out.costTracker;
    delete out.trackerCost;
    delete out.costTrackerOverride;
  }
  return clean(out as Partial<SrdActionDef>);
}

/** The old monster entry fields, read back from the Activity. */
function monsterEntryFromActivity(activity: Activity, entry: MonsterEntry): MonsterEntry {
  const recharge = activity.cost.pay?.find((resource) => resource.kind === "recharge");
  const uses = activity.cost.pay?.find((resource) => resource.kind === "uses");
  const base = {
    id: activity.source.kind === "monster" ? activity.source.entryId : "",
    recharge: recharge?.kind === "recharge" ? recharge.min : undefined,
    uses: uses?.kind === "uses" ? { count: uses.count, per: uses.per } : undefined,
  };
  // A damage effect without dice is the "half on a success" of damage the text
  // states; it is not a printed clause.
  const clauses = damageEffects(activity).filter((effect) => effect.dice);
  const damage = clauses.map((effect) => ({
    dice: effect.dice?.dice ?? "",
    damageType: effect.choose ? undefined : effect.types?.[0],
    damageChoice: effect.choose ? effect.types : undefined,
  }));
  switch (entry.kind) {
    case "attack":
      return clean({
        ...base,
        kind: "attack",
        attack: must(activity.attack?.mode),
        toHit:
          activity.attack?.bonus.kind === "printed" ? activity.attack.bonus.value : NaN,
        reachFt: activity.target?.reachFt,
        rangeFt: activity.target?.rangeFt,
        damage,
      });
    case "save":
      return clean({
        ...base,
        kind: "save",
        save: must(activity.save).ability,
        dc: activity.save?.dc?.kind === "printed" ? activity.save.dc.value : NaN,
        damage: clauses.length > 0 ? damage : undefined,
        onSuccess: activity.save?.successSpecial
          ? "special"
          : damageEffects(activity).some((effect) => effect.onSave === "half")
            ? "half"
            : "none",
      });
    default:
      // Spellcasting lists and prose entries keep only their identity and limits.
      return clean({ ...base, kind: entry.kind } as MonsterEntry);
  }
}

function monsterEntryMechanics(entry: MonsterEntry): MonsterEntry {
  if (entry.kind !== "spellcasting") return clean(entry);
  const { id, recharge, uses, kind } = entry;
  return clean({ id, recharge, uses, kind } as MonsterEntry);
}

function beastAttackFromActivity(activity: Activity): BeastAttack {
  const [damage] = damageEffects(activity);
  const range = activity.target?.rangeFt;
  return clean({
    nameKey: activity.source.kind === "beast" ? activity.source.attack : "",
    toHit: activity.attack?.bonus.kind === "printed" ? activity.attack.bonus.value : NaN,
    damageDice: damage?.dice?.dice ?? "",
    damageType: must(damage?.types?.[0]),
    reachFt: activity.target?.reachFt,
    range: range ? { nearFt: range.near, farFt: must(range.far) } : undefined,
  });
}

function companionAttackFromActivity(activity: Activity): CompanionAttack {
  const [damage] = damageEffects(activity);
  const bonus = must(activity.attack).bonus;
  const addAbility = damage?.dice?.plus?.find((term) => term.kind === "ability-mod");
  return clean({
    id: activity.source.kind === "companion" ? activity.source.attack : "",
    attackBonus: bonus.kind === "spell" ? "spell-attack" : "PB+ability",
    attackAbility: bonus.kind === "ability" ? bonus.ability : undefined,
    dice: damage?.dice?.dice ?? "",
    addAbility: addAbility?.kind === "ability-mod" ? addAbility.ability : undefined,
    damageType: must(damage?.types?.[0]),
    reachFt: activity.target?.reachFt ?? activity.target?.rangeFt?.near,
    ranged: activity.attack?.mode === "ranged" ? true : undefined,
  });
}

function expectUniqueIds(activities: ReadonlyArray<Activity>) {
  const seen = new Map<string, number>();
  for (const activity of activities)
    seen.set(activity.id, (seen.get(activity.id) ?? 0) + 1);
  expect([...seen].filter(([, count]) => count > 1).map(([id]) => id)).toEqual([]);
}

describe("activities — spells", () => {
  const translations = spells.map((spell) => ({ spell, ...translateSpell(spell) }));

  it("translates every spell, gaps only from the known list", () => {
    expect(translations.length).toBeGreaterThan(300);
    for (const { spell, gaps } of translations) expectKnownGaps(spell.id, gaps);
    expectUniqueIds(translations.map(({ activity }) => activity));
  });

  it("reads back every flat spell field", () => {
    for (const { spell, activity, gaps } of translations) {
      expect(spellFromActivity(activity), spell.id).toEqual(spellMechanics(spell, gaps));
    }
  });

  it("reads back a spell's follow-up action", () => {
    const followUps = translations.filter(({ spell }) => spell.followUp);
    expect(followUps.length).toBeGreaterThan(0);
    for (const { spell, activity } of followUps) {
      const owner: ActionOwner = {
        source: { kind: "spell-follow-up", spellId: spell.id, level: spell.level },
      };
      expect(activity.followUp, spell.id).toBeDefined();
      expect(actionFromActivity(must(activity.followUp), owner), spell.id).toEqual(
        actionMechanics(must(spell.followUp), owner)
      );
    }
  });

  it("scales a cantrip's dice by level unless its beams scale instead", () => {
    for (const { spell, activity } of translations) {
      if (spell.level !== 0 || !spell.damageDice) continue;
      const [primary] = damageEffects(activity);
      expect(primary?.dice?.cantrip === true, spell.id).toBe(!spell.cantripInstances);
    }
  });
});

describe("activities — feature actions", () => {
  const actions = catalogueActions().map((entry) => ({
    ...entry,
    ...translateAction(entry.action, entry.owner),
  }));

  it("translates every feature, trait, feat, item and invocation action", () => {
    expect(actions.length).toBeGreaterThan(50);
    for (const { activity, gaps } of actions) expectKnownGaps(activity.id, gaps);
    expectUniqueIds(actions.map(({ activity }) => activity));
  });

  it("reads back every action field", () => {
    for (const { action, owner, activity } of actions) {
      expect(actionFromActivity(activity, owner), activity.id).toEqual(
        actionMechanics(action, owner)
      );
    }
  });
});

describe("activities — stat blocks", () => {
  it("translates and reads back every monster entry", async () => {
    const entries = await catalogueMonsterEntries();
    expect(entries.length).toBeGreaterThan(1000);
    const activities: Activity[] = [];
    for (const { monsterId, section, entry } of entries) {
      const { activity, gaps } = translateMonsterEntry(monsterId, section, entry);
      expectKnownGaps(activity.id, gaps);
      expect(monsterEntryFromActivity(activity, entry), activity.id).toEqual(
        monsterEntryMechanics(entry)
      );
      activities.push(activity);
    }
    expectUniqueIds(activities);
  });

  it("translates and reads back every beast-form attack", () => {
    const attacks = catalogueBeastAttacks();
    expect(attacks.length).toBeGreaterThan(50);
    const activities = attacks.map(({ beast, attack }) => {
      const activity = activityFromBeastAttack(beast, attack);
      expect(beastAttackFromActivity(activity), activity.id).toEqual(clean(attack));
      return activity;
    });
    expectUniqueIds(activities);
  });

  it("translates and reads back every companion attack", () => {
    // The public SRD declares no companion; the content pack does.
    const activities = catalogueCompanionAttacks().map(({ ownerId, attack }) => {
      const activity = activityFromCompanionAttack(ownerId, attack);
      expect(companionAttackFromActivity(activity), activity.id).toEqual(clean(attack));
      return activity;
    });
    expectUniqueIds(activities);
  });
});

describe("activities — item activations", () => {
  it("costs the item's charge and lights its state", () => {
    const activations = catalogueItemActivations();
    expect(activations.length).toBeGreaterThan(0);
    const activities = activations.map(({ itemId, grant }) => {
      const activity = must(activityFromItemActivation(itemId, grant));
      const activation = must(grant.activation);
      expect(activity.cost.economy, activity.id).toBe(activation.action);
      const [pay] = activity.cost.pay ?? [];
      if (activation.resourceCost) {
        expect(pay, activity.id).toEqual({
          kind: "item-resource",
          resourceId: activation.resourceCost.resourceId,
        });
      } else if (activation.tracker) {
        expect(pay, activity.id).toEqual({
          kind: "tracker",
          trackerId: itemId,
          amount: 1,
        });
      } else {
        expect(pay, activity.id).toBeUndefined();
      }
      expect(activity.effects, activity.id).toEqual([
        expect.objectContaining({ kind: "status", key: grant.activeKey }),
      ]);
      return activity;
    });
    expectUniqueIds(activities);
  });
});
