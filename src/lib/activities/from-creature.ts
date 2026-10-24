/** Stat-block attacks (monster entries, beast forms, companions) → Activity. */
import type {
  BeastAttack,
  BeastStatBlock,
  CompanionAttack,
  MonsterDamage,
  MonsterEntry,
} from "@/data/types";
import { compact, dice, terms } from "./shared";
import type {
  Activity,
  ActivityEconomy,
  ActivityEffect,
  ActivityGap,
  ActivityResource,
  ActivityTranslation,
  MonsterSection,
} from "./types";

const SECTION_ECONOMY: Record<MonsterSection, ActivityEconomy> = {
  traits: "trait",
  actions: "action",
  bonusActions: "bonus",
  reactions: "reaction",
  legendaryActions: "legendary",
};

function damage(
  clause: MonsterDamage,
  onSave?: "half"
): Extract<ActivityEffect, { kind: "damage" }> {
  return compact({
    kind: "damage" as const,
    dice: { dice: clause.dice },
    types: clause.damageType ? [clause.damageType] : clause.damageChoice,
    choose: !clause.damageType && clause.damageChoice ? (true as const) : undefined,
    onSave,
  });
}

/**
 * One monster stat-block entry as an Activity. Prose-only entries (Multiattack,
 * most traits) and Spellcasting lists keep their economy and limits; what they
 * do stays in the text and is reported as a gap.
 */
export function translateMonsterEntry(
  monsterId: string,
  section: MonsterSection,
  entry: MonsterEntry
): ActivityTranslation {
  const pay: ActivityResource[] = [];
  if (entry.recharge !== undefined) pay.push({ kind: "recharge", min: entry.recharge });
  if (entry.uses) pay.push({ kind: "uses", ...entry.uses });
  const base = {
    id: `monster:${monsterId}:${section}:${entry.id}`,
    source: { kind: "monster" as const, monsterId, section, entryId: entry.id },
    cost: compact({
      economy: SECTION_ECONOMY[section],
      pay: pay.length > 0 ? pay : undefined,
    }),
  };
  const gaps: ActivityGap[] = [];
  let activity: Activity;
  switch (entry.kind) {
    case "attack":
      activity = compact({
        ...base,
        target: compact({ reachFt: entry.reachFt, rangeFt: entry.rangeFt }),
        attack: {
          mode: entry.attack,
          bonus: { kind: "printed" as const, value: entry.toHit },
        },
        effects: [
          ...entry.damage.map((clause) => damage(clause)),
          // The conditions the "Hit:" clause gives, its gate and the save the hit
          // forces; the escape DC and duration stay text.
          ...(entry.conditions && entry.conditions.length > 0
            ? [
                compact({
                  kind: "condition" as const,
                  apply: { options: [...entry.conditions], on: "hit" as const },
                  optIn: entry.conditionsIf,
                  save: entry.conditionSave
                    ? { ability: entry.conditionSave.save, dc: entry.conditionSave.dc }
                    : undefined,
                }),
              ]
            : []),
        ],
      });
      break;
    case "save":
      activity = compact({
        ...base,
        save: compact({
          ability: entry.save,
          dc: { kind: "printed" as const, value: entry.dc },
          successSpecial: entry.onSuccess === "special" ? (true as const) : undefined,
        }),
        // Half on a success with no printed clause: the damage is in the text,
        // its outcome is still a fact.
        effects: [
          ...(entry.damage && entry.damage.length > 0
            ? entry.damage.map((clause) =>
                damage(clause, entry.onSuccess === "half" ? "half" : undefined)
              )
            : entry.onSuccess === "half"
              ? [{ kind: "damage" as const, onSave: "half" as const }]
              : []),
          // The conditions the "Failure:" clause prints; their duration stays text.
          ...(entry.conditions && entry.conditions.length > 0
            ? [
                {
                  kind: "condition" as const,
                  apply: { options: [...entry.conditions], on: "failed-save" as const },
                },
              ]
            : []),
        ],
      });
      break;
    case "spellcasting":
      activity = { ...base, effects: [] };
      gaps.push({
        field: "spellcasting",
        reason:
          "a list of spells, each its own spell Activity with the printed DC and attack; the list is not one activity",
      });
      break;
    case "narrative":
      // A trait that moves a number carries it as a fact; damage to other
      // creatures with no roll (Fire Aura) just happens; the rest is prose.
      activity = entry.fact
        ? { ...base, effects: [], fact: entry.fact }
        : {
            ...base,
            effects: (entry.damage ?? []).map((clause) => damage(clause)),
          };
      if (entry.performs)
        gaps.push({
          field: "performs",
          reason: `uses the stat block's ${entry.performs.section} entry "${entry.performs.entryId}": that entry's Activity at this one's cost`,
        });
      if (entry.multiattack)
        gaps.push({
          field: "multiattack",
          reason:
            "a routine over the stat block's own entries, each its own Activity (multiattackPlan)",
        });
      if (entry.movement)
        gaps.push({
          field: "movement",
          reason: `moves the monster (${entry.movement.kind}): a fact the table plays on the map`,
        });
      if (entry.breathes)
        gaps.push({
          field: "breathes",
          reason: `breathes ${entry.breathes}: a fact of the monster, not an activity`,
        });
      if (gaps.length > 0 || entry.fact || activity.effects.length > 0) break;
      gaps.push({
        field: "text",
        reason: "a prose-only entry: what it does is in the text",
      });
      break;
  }
  if (activity.target && Object.keys(activity.target).length === 0)
    delete activity.target;
  return { activity, gaps };
}

/** One attack of a beast form (Polymorph, Wild Shape) as an Activity. */
export function activityFromBeastAttack(
  beast: BeastStatBlock,
  attack: BeastAttack
): Activity {
  return {
    id: `beast:${beast.id}:${attack.nameKey}`,
    source: { kind: "beast", beastId: beast.id, attack: attack.nameKey },
    cost: { economy: "action" },
    target: attack.range
      ? { rangeFt: { near: attack.range.nearFt, far: attack.range.farFt } }
      : compact({ reachFt: attack.reachFt }),
    attack: {
      mode: attack.range ? "ranged" : "melee",
      bonus: { kind: "printed", value: attack.toHit },
    },
    effects: [
      { kind: "damage", dice: { dice: attack.damageDice }, types: [attack.damageType] },
    ],
  };
}

/** One attack of a summoned companion's stat block. */
export function activityFromCompanionAttack(
  ownerId: string,
  attack: CompanionAttack
): Activity {
  return {
    id: `companion:${ownerId}:${attack.id}`,
    source: { kind: "companion", ownerId, attack: attack.id },
    cost: { economy: "action" },
    target: attack.ranged
      ? compact({
          rangeFt: attack.reachFt !== undefined ? { near: attack.reachFt } : undefined,
        })
      : compact({ reachFt: attack.reachFt }),
    attack: {
      mode: attack.ranged ? "ranged" : "melee",
      bonus:
        attack.attackBonus === "spell-attack"
          ? { kind: "spell" }
          : compact({ kind: "ability" as const, ability: attack.attackAbility }),
    },
    effects: [
      {
        kind: "damage",
        dice: dice({
          dice: attack.dice,
          perUpcast: attack.damageDicePerSpellLevel,
          plus: terms(
            attack.addSpellMod ? { kind: "spell-mod" } : undefined,
            attack.addAbility
              ? { kind: "ability-mod", ability: attack.addAbility }
              : undefined,
            attack.damagePerSpellLevel
              ? { kind: "flat-per-upcast", value: attack.damagePerSpellLevel }
              : undefined
          ),
        }),
        types: [attack.damageType],
      },
    ],
  };
}
