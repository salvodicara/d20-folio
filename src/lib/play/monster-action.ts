/**
 * A monster's printed attack or save as one tap on the DM's encounter card (owner
 * 2026-10-13): the stat block's entry becomes the same damage tray a player's use
 * opens (`damage-tray.ts`), asking only what the print leaves to the table — the
 * rolled total, and per target Hit · Miss · Critical or Saved.
 *
 * Pure: the entry is read through its Activity (`translateMonsterEntry`), the plan is
 * the tray's own {@link DamageTrayPlan}, and Apply's per-target result is plain
 * arithmetic over the rolled total. An attack offers the conditions its Hit clause
 * gives; prose that deals damage with no roll (Fire Aura) or uses one of the
 * block's attacks (Pounce) is one tap too. Other prose (Multiattack, Spellcasting)
 * stays text: the card shows Multiattack as a reference line, and
 * `monster-multiattack.ts` resolves its routine to these rows for the engine.
 */
import { bloodiedFromHp } from "@/lib/hp-band";
import type { AbilityCode, MonsterEntry, MonsterStatBlock } from "@/data/types";
import {
  translateMonsterEntry,
  type Activity,
  type ActivityEffect,
  type MonsterSection,
} from "@/lib/activities";
import type { DamageType } from "@/types/damage";

import {
  rowAmount,
  rowConditions,
  type DamageTrayPlan,
  type TrayRow,
} from "./damage-tray";

/** The stat-block sections a one-tap action comes from, most used first. */
export const MONSTER_ACTION_SECTIONS: readonly MonsterSection[] = [
  "actions",
  "bonusActions",
  "reactions",
  "legendaryActions",
  "traits",
];

/** One printed attack or save of a monster. */
export interface MonsterAction {
  section: MonsterSection;
  entryId: string;
  activity: Activity;
  /** The printed to-hit bonus (an attack). */
  toHit?: number;
  /** The printed save (a save). */
  save?: { ability: AbilityCode; dc: number };
}

type DamageEffect = Extract<ActivityEffect, { kind: "damage" }>;

const damageEffects = (activity: Activity): DamageEffect[] =>
  activity.effects.filter((effect): effect is DamageEffect => effect.kind === "damage");

function fromEntry(
  block: MonsterStatBlock,
  section: MonsterSection,
  entry: MonsterEntry
): MonsterAction | null {
  if (entry.kind === "narrative" && entry.performs) {
    // A move that uses another entry (a dragon's Pounce, "makes one Rend
    // attack"): that entry's numbers, under this entry's name and cost.
    const { section: usedSection, entryId } = entry.performs;
    const used = (block[usedSection] ?? []).find((candidate) => candidate.id === entryId);
    const action =
      used && used.kind !== "narrative" && fromEntry(block, usedSection, used);
    if (!action) return null;
    const { activity: own } = translateMonsterEntry(block.id, section, entry);
    return {
      ...action,
      section,
      entryId: entry.id,
      activity: { ...action.activity, id: own.id, source: own.source, cost: own.cost },
    };
  }
  const automatic = entry.kind === "narrative" && (entry.damage?.length ?? 0) > 0;
  if (entry.kind !== "attack" && entry.kind !== "save" && !automatic) return null;
  const { activity } = translateMonsterEntry(block.id, section, entry);
  const bonus = activity.attack?.bonus;
  const dc = activity.save?.dc;
  return {
    section,
    entryId: entry.id,
    activity,
    ...(bonus?.kind === "printed" ? { toHit: bonus.value } : {}),
    ...(activity.save && dc?.kind === "printed"
      ? { save: { ability: activity.save.ability, dc: dc.value } }
      : {}),
  };
}

/** Every one-tap entry of the stat block, in section then print order: its
 *  printed attacks and saves, the damage its prose deals with no roll (Fire
 *  Aura), and the moves that use one of them (Pounce). */
export function monsterActions(block: MonsterStatBlock): MonsterAction[] {
  return MONSTER_ACTION_SECTIONS.flatMap((section) =>
    (block[section] ?? []).flatMap((entry) => {
      const action = fromEntry(block, section, entry);
      return action ? [action] : [];
    })
  );
}

/** The dice of each damage clause ("1d6+2"), print order. With the creature's Hit
 *  Points, a clause's smaller amount while it is Bloodied replaces the print (a swarm's
 *  "or 2 (1d4) Piercing damage if the swarm is Bloodied"). */
export function monsterActionDice(
  action: MonsterAction,
  hp?: { current: number; max: number }
): string[] {
  const bloodied = hp !== undefined && bloodiedFromHp(hp.current, hp.max);
  return damageEffects(action.activity).flatMap((effect) => {
    const dice = (bloodied && effect.whileBloodied?.dice) || effect.dice?.dice;
    return dice ? [dice] : [];
  });
}

/** The damage types of each printed clause (a use-time choice lists every option). */
export function monsterActionDamageTypes(action: MonsterAction): DamageType[][] {
  return damageEffects(action.activity).flatMap((effect) =>
    effect.dice?.dice ? [[...(effect.types ?? [])]] : []
  );
}

/** The tray for this action at these targets. */
export function monsterTrayPlan(
  action: MonsterAction,
  targets: ReadonlyArray<string>
): DamageTrayPlan {
  const damage = damageEffects(action.activity);
  const types = new Set<DamageType>();
  let concrete = damage.length > 0;
  for (const effect of damage) {
    if (!effect.dice) continue;
    if (effect.choose || effect.types?.length !== 1) concrete = false;
    for (const type of effect.types ?? []) types.add(type);
  }
  const [only] = types;
  const landing = action.activity.effects.filter(
    (effect): effect is Extract<ActivityEffect, { kind: "condition" }> =>
      effect.kind === "condition" &&
      (effect.apply.on === "failed-save" || effect.apply.on === "hit")
  );
  const conditions = landing.flatMap((effect) => effect.apply.options);
  // A gated rider or one its own save decides is offered off (the tray's Topple).
  const optIn = landing.some((effect) => effect.optIn || effect.save);
  const conditionSave = landing.find((effect) => effect.save)?.save;
  return {
    effect: damage.length > 0 ? "damage" : null,
    ...(concrete && types.size === 1 && only ? { damageType: only } : {}),
    ...(action.save
      ? {
          save: {
            ability: action.save.ability,
            dc: action.save.dc,
            onSave: damage.some((effect) => effect.onSave === "half") ? "half" : "none",
          },
        }
      : {}),
    ...(conditions.length > 0
      ? {
          conditions: {
            options: conditions,
            pickOne: false,
            ...(optIn ? { optIn: true as const } : {}),
            ...(conditionSave ? { save: conditionSave } : {}),
          },
        }
      : {}),
    ...(action.toHit !== undefined ? { attack: { onMiss: "none" as const } } : {}),
    targets: [...targets],
  };
}

/** What one target's row lands: the amount, the conditions, and the result the log
 *  says (Hit · Miss · Critical for an attack, saved or failed for a save). */
export interface MonsterTrayLanding {
  targetId: string;
  amount: number;
  conditions: string[];
  outcome?: "hit" | "miss" | "critical" | "saved" | "failed";
}

export function monsterTrayLandings(
  plan: DamageTrayPlan,
  rows: ReadonlyArray<TrayRow>,
  total: number
): MonsterTrayLanding[] {
  return rows.map((row) => {
    const outcome =
      row.attack ?? (plan.save ? (row.saved ? "saved" : "failed") : undefined);
    return {
      targetId: row.targetId,
      amount: plan.effect ? rowAmount(total, row, plan) : 0,
      conditions: rowConditions(row),
      ...(outcome ? { outcome } : {}),
    };
  });
}
