/**
 * The facts the app shows today, entry by entry, against what the Activity
 * translators produce. The app side is the live action resolver
 * (`resolveActions`: the combat cards and the spellbook Cast row) on a test
 * character that holds every entry; the Activity side is a projection of the
 * translated Activity at that character's numbers.
 *
 * Cases come from the catalogue: every spell, every class-feature, feat and
 * species-trait action, and every beast-form attack. Where the app and the
 * Activity disagree on purpose, the entry is listed in KNOWN_DIVERGENCES with
 * the reason (and a test keeps the divergence real); nothing is skipped
 * silently.
 *
 * What it does not see: grant-driven riders (Elemental Affinity, Agonizing
 * Blast, Potent Spellcasting), because the test characters hold no riders; the
 * per-character tracker totals; equipment and invocation actions (their round
 * trip is in `activities-translation.test.ts`).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { BEASTS } from "@/data/beasts";
import { classFeatures } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { asRaceId } from "@/data/srd-names";
import { getSpellById, spells } from "@/data/spells";
import type { AbilityCode } from "@/data/types";
import {
  activityFromBeastAttack,
  activityFromSpell,
  translateAction,
  type Activity,
  type ActivityCount,
  type ActivityDice,
  type ActivityEffect,
} from "@/lib/activities";
import { abilityModifier } from "@/lib/ability";
import { concentrationValue } from "@/lib/concentration";
import { buildDevScenario } from "@/lib/dev-scenarios";
import {
  featureClassRow,
  resolveActions,
  resolveBeastFormAttacks,
  type RawResolvedAction,
} from "@/lib/smart-tracker";
import { deriveStatuses } from "@/lib/status";
import { appendAbilityModToDice, scaleCantripDice } from "@/lib/utils";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";
import { catalogueActions } from "@/lib/activities/catalogue";

/** Entries where the Activity states the catalogue's truth and the app differs. */
const KNOWN_DIVERGENCES: Readonly<Record<string, string>> = {
  "spell:true-strike": "weaponAttackCantrip is an Activity gap (wielded-weapon damage)",
};

const SCORE = 16;
const MOD = abilityModifier(SCORE);
const SCORES: Record<AbilityCode, number> = {
  STR: SCORE,
  DEX: SCORE,
  CON: SCORE,
  INT: SCORE,
  WIS: SCORE,
  CHA: SCORE,
};

/** Drop `undefined` fields (deep) so both sides compare like data. */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The value, or a failing test when the catalogue lacks it. */
function must<T>(value: T | null | undefined, what = "value"): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

const effectsOf = <K extends ActivityEffect["kind"]>(activity: Activity, kind: K) =>
  activity.effects.filter(
    (effect): effect is Extract<ActivityEffect, { kind: K }> => effect.kind === kind
  );

/** The highest threshold ≤ level in a level-keyed table. */
function atLevel<T>(table: Readonly<Record<number, T>> | undefined, level: number) {
  if (!table) return undefined;
  return Object.entries(table)
    .filter(([threshold]) => Number(threshold) <= level)
    .sort(([a], [b]) => Number(b) - Number(a))[0]?.[1];
}

/** A projected dice formula at the test character's numbers. */
function formula(
  dice: ActivityDice | undefined,
  level: { character: number; owner: number; pb: number }
): string | undefined {
  if (!dice) return undefined;
  const count = dice.count
    ? `${dice.count.of === "PB" ? level.pb : Math.max(1, MOD)}${dice.count.face}`
    : undefined;
  const base = count ?? atLevel(dice.byLevel, level.owner) ?? dice.dice;
  if (!base) return undefined;
  const scaled = (dice.cantrip ? scaleCantripDice(base, level.character) : base) ?? base;
  let bonus = 0;
  for (const term of dice.plus ?? []) {
    if (term.kind === "spell-mod" || term.kind === "ability-mod") bonus += MOD;
    if (term.kind === "owner-level" || term.kind === "class-level") bonus += level.owner;
    if (term.kind === "flat") bonus += term.value;
  }
  return appendAbilityModToDice(scaled, bonus);
}

function damageTypeFacts(
  effect: Extract<ActivityEffect, { kind: "damage" }> | undefined
) {
  const types = effect?.types;
  if (!types?.length) return {};
  if (types.length === 1 && !effect?.choose) return { damageType: types[0] };
  return {
    damageType: types[0],
    damageTypes: [...types],
    multiDamageTypeFlavor: effect?.choose ? "choice" : "all",
  };
}

// ─── Spells ──────────────────────────────────────────────────────────────────

const SPELL_LEVEL = 5;
/** The cantrip step at a character level (1 below 5, then 2/3/4 at 5/11/17). */
const cantripTier = (level: number): number =>
  level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;

/** What the spellbook Cast row of `spell-<id>` shows, as the Activity states it. */
function spellRowFromActivity(activity: Activity) {
  const level = activity.source.kind === "spell" ? activity.source.level : 0;
  const { cost, target, save } = activity;
  const damages = effectsOf(activity, "damage");
  const [primary, secondary] = damages.filter((effect) => !effect.vsCreatureTypes);
  const against = damages.find((effect) => effect.vsCreatureTypes);
  const heal = effectsOf(activity, "heal").find(
    (effect) => effect.fromDamage === undefined
  );
  const selfHeal = effectsOf(activity, "heal").find((effect) => effect.fromDamage);
  const tempRoll = effectsOf(activity, "temp-hp").find((effect) => effect.dice);
  const tempPool = effectsOf(activity, "temp-hp").find((effect) => effect.pool);
  const tempFlat = tempRoll?.dice?.plus?.find((term) => term.kind === "flat");
  const [condition] = effectsOf(activity, "condition");
  const [removal] = effectsOf(activity, "end-condition");
  const statuses = effectsOf(activity, "status");
  // The resolver keeps the LAST caster-lit state and the LAST selected-creature one.
  const lit = statuses.filter((status) => status.recipient === "self").at(-1);
  const standing = statuses
    .filter((status) => status.recipient === "selected" || status.markScope)
    .at(-1);
  const numbers = { character: SPELL_LEVEL, owner: SPELL_LEVEL, pb: 3 };
  // The app reads damage facts only for a spell with a damage type.
  const typed = primary?.types?.length ? primary : undefined;
  // A cantrip that adds beams (Eldritch Blast) multiplies its count by the tier.
  const instances =
    activity.repeats && activity.repeats.cantrip
      ? activity.repeats.count * cantripTier(SPELL_LEVEL)
      : activity.repeats?.count;
  const slot = cost.pay?.find((resource) => resource.kind === "spell-slot");
  return clean({
    type: cost.economy === "time" ? "free" : cost.economy,
    castTiming: cost.economy === "time" ? "extended" : cost.economy,
    costsSlot: level > 0,
    slotLevel: slot?.kind === "spell-slot" ? slot.minLevel : undefined,
    concentration: activity.concentration === true,
    attack: activity.attack !== undefined,
    attackMode: activity.attack?.mode,
    damage: typed ? formula(typed.dice, numbers) : undefined,
    ...damageTypeFacts(primary),
    instances: typed && instances && instances > 1 ? instances : undefined,
    damageOnSave: typed?.onSave,
    damageOnMiss: typed?.onMiss,
    damageResolution: typed?.gate,
    secondaryDamage:
      typed && secondary
        ? {
            dice: secondary.dice?.dice,
            damageType: secondary.types?.[0],
            resolution: secondary.gate,
            area: secondary.area,
            damageOnSave: secondary.onSave,
            damageOnMiss: secondary.onMiss,
          }
        : undefined,
    extraDamage: against
      ? [
          {
            dice: against.dice?.dice,
            damageType: against.types?.[0],
            targetCreatureTypes: against.vsCreatureTypes,
          },
        ]
      : undefined,
    area: target?.area,
    primaryTargetOnly: target?.primaryOnly,
    recurrence: activity.recurrence,
    resolveOnCast: activity.resolveOnCast,
    saveAbility: save?.ability,
    saveDC: save !== undefined,
    duration: activity.instantaneous !== true,
    components: {
      v: cost.components?.v === true,
      s: cost.components?.s === true,
      m: cost.components?.m === true,
    },
    trigger: cost.economy === "reaction" && cost.trigger !== undefined,
    healing: heal?.dice && !heal.consumable ? formula(heal.dice, numbers) : undefined,
    conditionRemoval: removal
      ? { options: removal.options, max: removal.max }
      : undefined,
    conditionApplication: condition?.apply,
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
    healingMode: heal?.full ? "full" : heal?.consumable ? "consumable" : undefined,
    healingPool: heal?.pool,
    tempHpPool: tempPool?.pool,
    selfHealingFromDamage: selfHeal ? { fraction: selfHeal.fromDamage } : undefined,
    tempHpApply: tempRoll
      ? {
          dice: tempRoll.dice?.dice,
          bonus: tempFlat?.kind === "flat" ? tempFlat.value : 0,
        }
      : undefined,
    activatesKey: lit?.key,
    activeDurationRounds:
      lit?.lifetime.kind === "rounds" ? lit.lifetime.roundsLeft : undefined,
    activeTurnBoundary:
      lit?.lifetime.kind === "turn-edge"
        ? { phase: lit.lifetime.phase, turns: lit.lifetime.round }
        : undefined,
    standingEffect: standing
      ? {
          sourceId: activity.source.kind === "spell" ? activity.source.spellId : "",
          activeKey: standing.key,
          markScope: standing.markScope,
          targetAffinity: target?.affinity ?? "ally",
          excludeSelf: target?.excludeSelf,
          maxRounds:
            standing.lifetime.kind === "rounds"
              ? standing.lifetime.roundsLeft
              : undefined,
          turnBoundary:
            standing.lifetime.kind === "turn-edge"
              ? { phase: standing.lifetime.phase, turns: standing.lifetime.round }
              : undefined,
        }
      : undefined,
  });
}

/** The same facts, read off the app's resolved Cast row. */
function spellRowFacts(row: RawResolvedAction) {
  const s = row.summary;
  const standing = row.standingEffect;
  return clean({
    type: row.type,
    castTiming: row.castTiming,
    costsSlot: row.costsSlot,
    slotLevel: row.slotLevel,
    concentration: row.concentration,
    attack: s.attackBonus !== undefined,
    attackMode: s.attackMode,
    damage: s.damage,
    damageType: s.damageType,
    damageTypes: s.damageTypes,
    multiDamageTypeFlavor: s.multiDamageTypeFlavor,
    instances: s.instances,
    damageOnSave: s.damageOnSave,
    damageOnMiss: s.damageOnMiss,
    damageResolution: s.damageResolution,
    secondaryDamage: s.secondaryDamage,
    extraDamage: s.extraDamage?.map(({ dice, damageType, targetCreatureTypes }) => ({
      dice,
      damageType,
      targetCreatureTypes,
    })),
    area: s.area,
    primaryTargetOnly: s.primaryTargetOnly,
    recurrence: s.recurrence,
    resolveOnCast: s.resolveOnCast,
    saveAbility: s.saveAbility,
    saveDC: s.saveDC !== undefined,
    duration: s.duration !== undefined,
    components: s.components,
    trigger: s.trigger !== undefined,
    healing: s.healing,
    conditionRemoval: s.conditionRemoval,
    conditionApplication: s.conditionApplication,
    targeting: s.targeting,
    healingMode: s.healingMode,
    healingPool: s.healingPool,
    tempHpPool: s.tempHpPool,
    selfHealingFromDamage: s.selfHealingFromDamage,
    tempHpApply: s.tempHpApply,
    activatesKey: row.activatesKey,
    activeDurationRounds: row.activeDurationRounds,
    activeTurnBoundary: row.activeTurnBoundary,
    // `requiresAppliedTempHp` reads the status's inner passive grants, which
    // the rules grammar owns, not the Activity.
    standingEffect: standing
      ? {
          sourceId: standing.sourceId,
          activeKey: standing.activeKey,
          markScope: standing.markScope,
          targetAffinity: standing.targetAffinity,
          excludeSelf: standing.excludeSelf,
          maxRounds: standing.maxRounds,
          turnBoundary: standing.turnBoundary,
        }
      : undefined,
  });
}

describe("activities ≡ the app — spells", () => {
  const doc = makeCharacterDoc({
    classes: [{ classId: "wizard", level: SPELL_LEVEL }],
    abilityScores: SCORES,
    spells: spells.map((spell) => ({ srdId: spell.id })),
  });
  const rows = new Map(resolveActions(doc, "spellbook").map((row) => [row.id, row]));

  it("shows every spell's cost, targets, save, damage, healing and duration as its Activity states", () => {
    expect(spells.length).toBeGreaterThan(300);
    for (const spell of spells) {
      const id = `spell:${spell.id}`;
      const row = rows.get(`spell-${spell.id}`);
      expect(row, id).toBeDefined();
      if (KNOWN_DIVERGENCES[id]) continue;
      expect(spellRowFromActivity(activityFromSpell(spell)), id).toEqual(
        spellRowFacts(must(row, id))
      );
    }
  });

  it("keeps every listed divergence real", () => {
    for (const id of Object.keys(KNOWN_DIVERGENCES)) {
      const spell = spells.find((candidate) => `spell:${candidate.id}` === id);
      if (!spell) continue; // a pack-only entry absent from this composition
      expect(spellRowFromActivity(activityFromSpell(spell)), id).not.toEqual(
        spellRowFacts(must(rows.get(`spell-${spell.id}`), id))
      );
    }
  });
});

// ─── Feature actions ─────────────────────────────────────────────────────────

const FEATURE_LEVEL = 20;
const PB = 6;

const countOf = (count: ActivityCount | undefined) =>
  count === undefined
    ? undefined
    : typeof count === "number"
      ? count
      : count === "PB"
        ? PB
        : Math.max(1, MOD);

/** The rolled part and the summed fixed part of a heal, at the test numbers. */
function healFacts(
  dice: ActivityDice | undefined,
  resolveDie: (die: string) => string | undefined
) {
  if (!dice) return undefined;
  const rolled = dice.count
    ? `${dice.count.of === "PB" ? PB : Math.max(1, MOD)}${dice.count.face}`
    : dice.dice?.startsWith("classSpecific:")
      ? resolveDie(dice.dice)
      : (atLevel(dice.byLevel, FEATURE_LEVEL) ?? dice.dice);
  let bonus = 0;
  for (const term of dice.plus ?? []) {
    if (term.kind === "ability-mod") bonus += MOD;
    if (term.kind === "class-level" || term.kind === "owner-level")
      bonus += FEATURE_LEVEL;
    if (term.kind === "flat") bonus += term.value;
  }
  return { dice: rolled?.startsWith("d") ? `1${rolled}` : rolled, bonus };
}

/** What a feature action's card shows, as its Activity states it. */
function actionRowFromActivity(
  activity: Activity,
  ownerId: string,
  resolveDie: (die: string) => string | undefined
) {
  const { cost, target, save } = activity;
  const [damage] = effectsOf(activity, "damage");
  const [heal] = effectsOf(activity, "heal").filter((effect) => !effect.fromPool);
  const [condition] = effectsOf(activity, "condition");
  const removals = effectsOf(activity, "end-condition");
  const removal = removals.find((effect) => effect.costHp === undefined);
  const cures = removals.filter(
    (effect) => effect.costHp !== undefined && (effect.fromLevel ?? 0) <= FEATURE_LEVEL
  );
  const [mark] = effectsOf(activity, "mark");
  const [state] = effectsOf(activity, "status");
  const [tracker] = cost.pay ?? [];
  const numbers = { character: FEATURE_LEVEL, owner: FEATURE_LEVEL, pb: PB };
  const sequence =
    activity.attack?.bonus.kind === "weapon" ? activity.repeats : undefined;
  const instances = sequence
    ? (atLevel(sequence.byLevel, FEATURE_LEVEL) ?? sequence.count)
    : undefined;
  const typed =
    damage && !sequence
      ? damage.types?.length
        ? damageTypeFacts(damage)
        : damage.chooseByLevel
          ? damageTypeFacts({
              ...damage,
              types: atLevel(damage.chooseByLevel, FEATURE_LEVEL),
              choose: true,
            })
          : {}
      : {};
  const [checkBonus] = effectsOf(activity, "check-bonus");
  const [topUp] = effectsOf(activity, "restore-resource");
  return clean({
    type: cost.economy,
    economyCategory: cost.economyCategory,
    maxUsesPerTurn: cost.maxUsesPerTurn,
    requiresActionThisTurn: activity.requires?.actionThisTurn,
    requiresOutcomeThisTurn: activity.requires?.outcomeThisTurn,
    requiresActionCategoryThisTurn: activity.requires?.categoryThisTurn,
    costTracker: tracker?.kind === "tracker" ? tracker.trackerId : undefined,
    trackerCost: tracker?.kind === "tracker" ? tracker.amount : undefined,
    alternateCost: cost.orPay,
    maintainsActiveKey: effectsOf(activity, "maintain")[0]?.key,
    grantsNextAttackAdvantage: effectsOf(activity, "next-attack-advantage").length > 0,
    locksMovement: effectsOf(activity, "speed-zero").length > 0,
    activatesKey: state?.key,
    activeTurnBoundary:
      state?.lifetime.kind === "turn-edge"
        ? { phase: state.lifetime.phase, turns: state.lifetime.round }
        : undefined,
    activationEndsEarlyOn: state?.endsOn.flatMap((end) =>
      end.kind === "trigger" ? [end.trigger] : []
    ),
    standingEffect: mark
      ? {
          activeKey: state?.key ?? ownerId,
          markScope: mark.scope,
          targetAffinity: target?.affinity ?? "enemy",
          excludeSelf: target?.excludeSelf,
          maxRounds:
            mark.lifetime?.kind === "rounds" ? mark.lifetime.roundsLeft : undefined,
        }
      : undefined,
    trigger: cost.economy === "reaction" && cost.trigger !== undefined,
    checkBonus: checkBonus
      ? { dice: checkBonus.dice, refundOnFail: checkBonus.refundOnFail === true }
      : undefined,
    saveAbility: save?.dc ? save.ability : undefined,
    saveDC: save?.dc !== undefined,
    skillCheck: activity.skill,
    conditionApplication: condition?.apply,
    targeting: sequence
      ? { affinity: "enemy", maxTargets: instances }
      : target?.affinity !== undefined
        ? {
            affinity: target.affinity,
            excludeSelf: target.excludeSelf,
            creatureTypes: target.creatureTypes,
            maxTargets: countOf(target.count),
            maxTargetsPerUpcast: target.countPerUpcast,
            sharedAmount: target.sharedAmount,
          }
        : undefined,
    area: target?.area,
    instances,
    attackMode: sequence ? "melee" : undefined,
    damage: damage && !sequence ? formula(damage.dice, numbers) : undefined,
    ...typed,
    damageOnSave: sequence ? undefined : damage?.onSave,
    damageResolution: sequence ? undefined : damage?.gate,
    heal: healFacts(heal?.dice ?? (damage?.orHeal ? damage.dice : undefined), resolveDie),
    conditionRemoval:
      removal && (removal.fromLevel ?? 0) <= FEATURE_LEVEL
        ? { options: removal.options, max: removal.max }
        : undefined,
    cureOptions:
      cures.length > 0
        ? cures.map((cure) => ({ condition: cure.options[0], costHp: cure.costHp }))
        : undefined,
    trackerTopUp: topUp ? { trackerId: topUp.trackerId, upTo: topUp.upTo } : undefined,
    grantedDie: effectsOf(activity, "grant-die").length > 0,
    grantsHeroicInspiration: effectsOf(activity, "heroic-inspiration").length > 0,
    stabilize: effectsOf(activity, "stabilize").length > 0,
    poolSpendEffect: effectsOf(activity, "heal").some((effect) => effect.fromPool)
      ? "healing"
      : undefined,
    damageReduction: effectsOf(activity, "reduce-damage").length > 0,
    tempHpRoll: effectsOf(activity, "temp-hp").some(
      (effect) => (effect.fromLevel ?? 0) <= FEATURE_LEVEL
    ),
  });
}

/** The same facts, read off the app's resolved action card. */
function actionRowFacts(row: RawResolvedAction) {
  const s = row.summary;
  const heal = (s as { heal?: { dice?: string; bonus: number } }).heal;
  const sequence = s.instances !== undefined;
  return clean({
    type: row.type,
    economyCategory: row.economyCategory,
    maxUsesPerTurn: row.maxUsesPerTurn,
    requiresActionThisTurn: row.requiresActionThisTurn,
    requiresOutcomeThisTurn: row.requiresOutcomeThisTurn,
    requiresActionCategoryThisTurn: row.requiresActionCategoryThisTurn,
    costTracker: row.costTracker,
    trackerCost: row.trackerCost,
    alternateCost: row.alternateCost,
    maintainsActiveKey: row.maintainsActiveKey,
    grantsNextAttackAdvantage: row.grantsNextAttackAdvantage === true,
    locksMovement: row.locksMovement === true,
    activatesKey: row.activatesKey,
    activeTurnBoundary: row.activeTurnBoundary,
    activationEndsEarlyOn:
      row.activationEndsEarlyOn ?? (row.activatesKey ? [] : undefined),
    standingEffect: row.standingEffect
      ? {
          activeKey: row.standingEffect.activeKey,
          markScope: row.standingEffect.markScope,
          targetAffinity: row.standingEffect.targetAffinity,
          excludeSelf: row.standingEffect.excludeSelf,
          maxRounds: row.standingEffect.maxRounds,
        }
      : undefined,
    trigger: s.trigger !== undefined,
    checkBonus: s.checkBonus,
    saveAbility: s.saveAbility,
    saveDC: s.saveDC !== undefined,
    skillCheck: s.skillCheck,
    conditionApplication: s.conditionApplication,
    targeting: s.targeting,
    area: s.area,
    instances: s.instances,
    attackMode: s.attackMode,
    // An attack sequence repeats the Unarmed Strike profile: its damage is the
    // weapon's, which the Activity references rather than restates.
    damage: sequence ? undefined : s.damage,
    damageType: sequence ? undefined : s.damageType,
    damageTypes: sequence ? undefined : s.damageTypes,
    multiDamageTypeFlavor: sequence ? undefined : s.multiDamageTypeFlavor,
    damageOnSave: s.damageOnSave,
    damageResolution: s.damageResolution,
    heal: heal ? { dice: heal.dice, bonus: heal.bonus } : undefined,
    conditionRemoval: s.conditionRemoval,
    cureOptions: s.cureOptions,
    trackerTopUp: s.trackerTopUp,
    grantedDie: s.grantedDie !== undefined,
    grantsHeroicInspiration: s.grantsHeroicInspiration === true,
    stabilize: s.stabilize === true,
    poolSpendEffect: s.poolSpendEffect,
    damageReduction: s.damageReduction !== undefined,
    tempHpRoll: s.tempHpRoll !== undefined,
  });
}

describe("activities ≡ the app — feature actions", () => {
  const docOf = new Map<Map<string, RawResolvedAction>, CharacterDoc>();
  function rowsFor(doc: CharacterDoc) {
    const rows = new Map(resolveActions(doc, "combat").map((row) => [row.id, row]));
    docOf.set(rows, doc);
    return rows;
  }

  /** A level-20 character of the owning class holding every feature of it. */
  function classDoc(classId: string): CharacterDoc {
    return makeCharacterDoc({
      classes: [{ classId, level: FEATURE_LEVEL }],
      abilityScores: SCORES,
      features: classFeatures
        .filter((feature) => feature.class === classId && feature.mechanics?.actions)
        .map((feature) => ({ srdId: feature.id })),
    });
  }

  it("shows every class-feature, feat and species action as its Activity states it", () => {
    const docs = new Map<string, Map<string, RawResolvedAction>>();
    const featRows = rowsFor(
      makeCharacterDoc({
        classes: [{ classId: "fighter", level: FEATURE_LEVEL }],
        abilityScores: SCORES,
        features: SRD_FEATS.filter((feat) => feat.mechanics?.actions).map((feat) => ({
          srdId: feat.id,
        })),
      })
    );
    let compared = 0;
    for (const { action, owner } of catalogueActions()) {
      const { activity } = translateAction(action, owner);
      const source = owner.source;
      if (source.kind !== "feature") continue;
      let rows: Map<string, RawResolvedAction>;
      let rowId: string;
      if (source.owner === "class-feature") {
        const feature = must(
          classFeatures.find((candidate) => candidate.id === source.ownerId)
        );
        if (!docs.has(feature.class))
          docs.set(feature.class, rowsFor(classDoc(feature.class)));
        rows = must(docs.get(feature.class));
        rowId = `${feature.id}-${action.id ?? action.type}`;
      } else if (source.owner === "feat") {
        rows = featRows;
        rowId = `${source.ownerId}-${action.id ?? action.type}`;
      } else if (source.owner === "race-trait") {
        const [raceId, traitId] = source.ownerId.split(":") as [string, string];
        // An action gated on a chosen form is offered only with that form chosen.
        const option = action.requiresBundleOption;
        const key = `race:${raceId}:${option?.bundleKey}:${option?.optionId}`;
        if (!docs.has(key)) {
          docs.set(
            key,
            rowsFor(
              makeCharacterDoc(
                {
                  race: asRaceId(raceId),
                  classes: [{ classId: "fighter", level: FEATURE_LEVEL }],
                  abilityScores: SCORES,
                },
                option
                  ? { grantBundleChoices: { [option.bundleKey]: option.optionId } }
                  : {}
              )
            )
          );
        }
        rows = must(docs.get(key));
        rowId = `race:${raceId}:${traitId}-${action.id ?? action.type}`;
      } else {
        continue; // equipment and invocations: the translation round trip covers them
      }
      if (action.maintainsActiveKey) continue; // emitted only while its state is lit
      const row = rows.get(rowId);
      expect(row, `${activity.id} → ${rowId}`).toBeDefined();
      const doc = must(docOf.get(rows));
      const projected: Record<string, unknown> = actionRowFromActivity(
        activity,
        source.ownerId,
        (die) => {
          const value = featureClassRow(source.ownerId, doc)?.[
            die.slice("classSpecific:".length)
          ];
          return typeof value === "string" ? value : undefined;
        }
      );
      if (source.owner === "race-trait") {
        // The app infers "using it lights the state" for class features and
        // feats only; a species trait's state is lit from the rail.
        delete projected.activatesKey;
        delete projected.activeTurnBoundary;
        delete projected.activationEndsEarlyOn;
      }
      expect(projected, activity.id).toEqual(actionRowFacts(must(row, rowId)));
      compared += 1;
    }
    expect(compared).toBeGreaterThan(40);
  });
});

// ─── Beast forms ─────────────────────────────────────────────────────────────

describe("activities ≡ the app — beast forms", () => {
  it("shows every beast-form attack's bonus, damage and reach as its Activity states it", () => {
    for (const beast of BEASTS) {
      const doc = makeCharacterDoc({}, { polymorphForm: { beastId: beast.id } } as never);
      const rows = resolveBeastFormAttacks(doc.session, new Set());
      expect(rows.length, beast.id).toBe(beast.attacks.length);
      beast.attacks.forEach((attack, index) => {
        const activity = activityFromBeastAttack(beast, attack);
        const [damage] = effectsOf(activity, "damage");
        const range = activity.target?.rangeFt;
        expect(
          clean({
            attackBonus:
              activity.attack?.bonus.kind === "printed"
                ? activity.attack.bonus.value
                : NaN,
            damage: damage?.dice?.dice,
            damageType: damage?.types?.[0],
            weaponRange: range
              ? { kind: "ranged", nearFt: range.near, farFt: range.far }
              : { kind: "melee", reachFt: activity.target?.reachFt ?? 5 },
          }),
          activity.id
        ).toEqual(clean(must(rows[index]).summary));
      });
    }
  });
});

// ─── Statuses ────────────────────────────────────────────────────────────────

describe("activities ≡ Phase 2 statuses", () => {
  beforeEach(() => {
    useCombatStore.setState({ round: 1 });
    useCharacterStore.getState().setCharacter(null);
  });

  /** The status as Phase 2's view reads it once lit, before any round passes. */
  function litStatus(key: string) {
    const doc = must(useCharacterStore.getState().character);
    const status = must(deriveStatuses(doc).find((candidate) => candidate.key === key));
    const lifetime: Record<string, unknown> = { ...status.lifetime };
    delete lifetime.tickedRound;
    return { lifetime, endsOn: status.endsOn, concentration: status.concentration };
  }

  function declared(activity: Activity, key: string) {
    const status = must(
      effectsOf(activity, "status").find((effect) => effect.key === key)
    );
    return {
      lifetime: status.lifetime,
      endsOn: status.endsOn,
      concentration: status.concentration === true,
    };
  }

  it("lights Rage as the status its Activity declares", () => {
    const rage = must(
      catalogueActions().find(
        ({ owner }) =>
          owner.source.kind === "feature" && owner.source.ownerId === "barbarian-rage"
      )
    );
    useCharacterStore
      .getState()
      .setCharacter(buildDevScenario("scn-barbarian-extra-attack"));
    useCharacterStore.getState().setActiveFeature("barbarian-rage", true);
    expect(litStatus("barbarian-rage")).toEqual(
      declared(translateAction(rage.action, rage.owner).activity, "barbarian-rage")
    );
  });

  it("lights Bless, held by Concentration, as the status its Activity declares", () => {
    useCharacterStore.getState().setCharacter(buildDevScenario("scn-life-cleric"));
    const store = useCharacterStore.getState();
    store.setConcentration(concentrationValue("bless"), {
      undoable: false,
      silent: true,
    });
    store.setActiveFeature("spell-bless", true);
    expect(litStatus("spell-bless")).toEqual(
      declared(activityFromSpell(must(getSpellById("bless"))), "spell-bless")
    );
  });
});
