/** Spells → Activity: the flat spell fields read as one Activity. */
import type { SrdSpellData } from "@/data/types";
import { whileActiveDurationAtCastLevel } from "@/lib/grants";
import { translateAction } from "./from-action";
import { compact, dice, statusEffect, terms, whileActiveGrants } from "./shared";
import type {
  Activity,
  ActivityCost,
  ActivityEffect,
  ActivityGap,
  ActivityTarget,
  ActivityTranslation,
} from "./types";

const MINUTES = { minute: 1, hour: 60 } as const;

/** "10 minutes" → 10, "8 hours" → 480; anything else → undefined. */
function minutesOf(text: string): number | undefined {
  const match = text.match(/^(\d+)\s+(minute|hour)s?$/);
  return match ? Number(match[1]) * MINUTES[match[2] as keyof typeof MINUTES] : undefined;
}

/**
 * The casting time as an economy slot. Mirrors the catalogue's casting-time key
 * (`castingTimeI18nKey`): a leading reaction, any bonus action, an action, a
 * length of time, or an action that can also take longer.
 */
function castingCost(
  castingTime: string,
  gaps: ActivityGap[]
): Pick<ActivityCost, "economy" | "minutes" | "orMinutes"> {
  const lower = castingTime.trim().toLowerCase();
  if (lower.startsWith("reaction") || lower.startsWith("1 reaction")) {
    return { economy: "reaction" };
  }
  if (lower.includes("bonus")) return { economy: "bonus" };
  if (lower === "action" || lower === "1 action") return { economy: "action" };
  const alternative = lower.match(/^1 action or (.+)$/);
  const orMinutes = alternative?.[1] ? minutesOf(alternative[1]) : undefined;
  if (orMinutes !== undefined) return { economy: "action", orMinutes };
  const minutes = minutesOf(lower);
  if (minutes !== undefined) return { economy: "time", minutes };
  gaps.push({
    field: "castingTime",
    reason: `unrecognized casting time "${castingTime}"`,
  });
  return { economy: "time" };
}

function spellCost(spell: SrdSpellData, gaps: ActivityGap[]): ActivityCost {
  const { v, s, m, costGp, consumed } = spell.components;
  const components = compact({
    v: v ? (true as const) : undefined,
    s: s ? (true as const) : undefined,
    m: m ? (true as const) : undefined,
    gp: costGp,
    consumed: consumed ? (true as const) : undefined,
  });
  return compact({
    ...castingCost(spell.castingTime, gaps),
    trigger: spell.reactionTrigger,
    ritual: spell.ritual ? (true as const) : undefined,
    components: Object.keys(components).length > 0 ? components : undefined,
    pay:
      spell.level > 0
        ? [{ kind: "spell-slot" as const, minLevel: spell.level }]
        : undefined,
  });
}

function spellTarget(spell: SrdSpellData): ActivityTarget | undefined {
  const targeting = spell.targeting;
  const target = compact({
    affinity: targeting?.affinity,
    area: spell.area ? (true as const) : undefined,
    excludeSelf: targeting?.excludeSelf ? (true as const) : undefined,
    creatureTypes: targeting?.creatureTypes,
    count: targeting?.maxTargets,
    countPerUpcast: targeting?.maxTargetsPerUpcast,
    sharedAmount: targeting?.sharedAmount ? (true as const) : undefined,
    primaryOnly: spell.primaryTargetOnly ? (true as const) : undefined,
  });
  return Object.keys(target).length > 0 ? target : undefined;
}

function spellEffects(spell: SrdSpellData): ActivityEffect[] {
  const effects: ActivityEffect[] = [];
  // The three damage-type fields are mutually exclusive: one type, several at
  // once, or the caster's pick.
  const types = spell.damageType
    ? [spell.damageType]
    : spell.damageTypes?.length
      ? spell.damageTypes
      : spell.damageChoice?.length
        ? spell.damageChoice
        : undefined;
  if (types || spell.damageDice) {
    effects.push(
      compact({
        kind: "damage" as const,
        dice: dice({
          dice: spell.damageDice,
          perUpcast: spell.damageDicePerUpcast,
          // A cantrip's die count follows the 5/11/17 progression, unless its
          // INSTANCE count does (Eldritch Blast's beams).
          cantrip:
            spell.level === 0 && spell.damageDice && !spell.cantripInstances
              ? true
              : undefined,
          plus: terms(spell.damageAddsCastMod ? { kind: "spell-mod" } : undefined),
        }),
        types,
        choose:
          !spell.damageType && !spell.damageTypes?.length && spell.damageChoice?.length
            ? (true as const)
            : undefined,
        gate: spell.damageResolution,
        onSave: spell.damageOnSave,
        onMiss: spell.damageOnMiss,
      })
    );
  }
  const secondary = spell.secondaryDamage;
  if (secondary) {
    effects.push(
      compact({
        kind: "damage" as const,
        dice: dice({ dice: secondary.dice, perUpcast: secondary.dicePerUpcast }),
        types: [secondary.damageType],
        gate: secondary.resolution,
        onSave: secondary.damageOnSave,
        onMiss: secondary.damageOnMiss,
        area: secondary.area ? (true as const) : undefined,
      })
    );
  }
  const against = spell.bonusDamageAgainst;
  if (against) {
    effects.push({
      kind: "damage",
      dice: { dice: against.dice },
      types: [against.damageType],
      vsCreatureTypes: against.creatureTypes,
    });
  }
  if (
    spell.healDice ||
    spell.healingMode ||
    spell.healingPool !== undefined ||
    spell.consumableItem
  ) {
    effects.push(
      compact({
        kind: "heal" as const,
        dice: dice({
          dice: spell.healDice,
          perUpcast: spell.healDicePerUpcast,
          plus: terms(spell.healAddsCastMod ? { kind: "spell-mod" } : undefined),
        }),
        full: spell.healingMode === "full" ? (true as const) : undefined,
        pool: spell.healingPool,
        consumable: spell.healingMode === "consumable" ? spell.consumableItem : undefined,
      })
    );
  }
  if (spell.selfHealingFromDamage) {
    effects.push({ kind: "heal", fromDamage: spell.selfHealingFromDamage.fraction });
  }
  if (spell.tempHpRoll) {
    const roll = spell.tempHpRoll;
    effects.push(
      compact({
        kind: "temp-hp" as const,
        dice: dice({
          dice: roll.dice,
          plus: terms(
            { kind: "flat", value: roll.bonus },
            roll.bonusPerUpcast !== undefined
              ? { kind: "flat-per-upcast", value: roll.bonusPerUpcast }
              : undefined
          ),
        }),
      })
    );
  }
  if (spell.tempHpPool !== undefined) {
    effects.push({ kind: "temp-hp", pool: spell.tempHpPool });
  }
  if (spell.conditionApplication) {
    effects.push({ kind: "condition", apply: spell.conditionApplication });
  }
  if (spell.conditionRemoval) {
    effects.push(
      compact({
        kind: "end-condition" as const,
        options: spell.conditionRemoval.options,
        max: spell.conditionRemoval.max,
      })
    );
  }
  // Casting a standing-effect spell lights its status (Shield of Faith, Bless,
  // Hunter's Mark), with the duration declared at the spell's own level.
  for (const grant of whileActiveGrants(spell.grants)) {
    const duration = whileActiveDurationAtCastLevel(grant.duration, spell.level);
    effects.push(statusEffect(grant, duration, spell.concentration));
  }
  return effects;
}

/** Spell fields the Activity does not carry yet, each with its reason. */
function spellGaps(spell: SrdSpellData): ActivityGap[] {
  const gaps: ActivityGap[] = [];
  if (spell.mechanicsProgram) {
    gaps.push({
      field: "mechanicsProgram",
      reason:
        "a hand-written runtime program (retaliation, staged effects) the declarative effects cannot express yet",
    });
  }
  if (spell.weaponAttackCantrip) {
    gaps.push({
      field: "weaponAttackCantrip",
      reason:
        "the damage is the wielded weapon's own, with a type swap; the Activity has no weapon reference for spells yet",
    });
  }
  if (spell.damageType && (spell.damageTypes?.length || spell.damageChoice?.length)) {
    gaps.push({
      field: spell.damageTypes?.length ? "damageTypes" : "damageChoice",
      reason:
        "declared next to a fixed damageType; the fixed type wins everywhere the app shows damage",
    });
  }
  if (spell.companion) {
    gaps.push({
      field: "companion",
      reason:
        "a summoned companion is an entity with its own stat block, not an activity",
    });
  }
  return gaps;
}

/** One spell as an Activity, plus the fields it cannot express yet. */
export function translateSpell(spell: SrdSpellData): ActivityTranslation {
  const gaps: ActivityGap[] = [];
  const cost = spellCost(spell, gaps);
  const target = spellTarget(spell);
  const followUp = spell.followUp
    ? translateAction(spell.followUp, {
        source: { kind: "spell-follow-up", spellId: spell.id, level: spell.level },
      })
    : undefined;
  const activity: Activity = compact({
    id: `spell:${spell.id}`,
    source: { kind: "spell" as const, spellId: spell.id, level: spell.level },
    cost,
    target,
    attack: spell.attackType
      ? { mode: spell.attackType, bonus: { kind: "spell" as const } }
      : undefined,
    save: spell.saveAbility
      ? { ability: spell.saveAbility, dc: { kind: "spell" as const } }
      : undefined,
    repeats:
      spell.instances !== undefined
        ? compact({
            count: spell.instances,
            perUpcast: spell.instancesPerUpcast,
            cantrip: spell.cantripInstances,
          })
        : undefined,
    effects: spellEffects(spell),
    concentration: spell.concentration ? (true as const) : undefined,
    instantaneous: spell.instantaneous ? (true as const) : undefined,
    endsOnSave: spell.endsOnSuccessfulSave ? (true as const) : undefined,
    recurrence: spell.recurrence,
    tag: spell.effectTag,
    followUp: followUp?.activity,
  });
  if (spell.resolveOnCast === false) activity.resolveOnCast = false;
  return {
    activity,
    gaps: [
      ...gaps,
      ...spellGaps(spell),
      ...(followUp?.gaps ?? []).map((gap) => ({
        ...gap,
        field: `followUp.${gap.field}`,
      })),
    ],
  };
}

/** One spell as an Activity. */
export function activityFromSpell(spell: SrdSpellData): Activity {
  return translateSpell(spell).activity;
}
