/**
 * The repeat saves a SOLO turn edge makes due on the player's own sheet (#1333): a
 * condition the sheet holds from a known source (Hold Person's Paralyzed) whose rule
 * says «the target repeats the save at the end of each of its turns». Campaign fights
 * already ask through `fightConditionEnds`; this is the same rule (`conditionEndsOf`,
 * `conditionsEndingOn`) read at the solo End Turn, where the turn that ends and the
 * next one that starts are the same tap.
 *
 * Scope: `target-turn-end`, and `target-turn-start` (free at the same edge). Damage-
 * and action-time repeats are not raised here. A save track (Sleep, Contagion) and a
 * save owed only out of the caster's sight (Fear) are left out: neither is one plain
 * roll that a single «Saved» can answer.
 *
 * Pure: the sourced conditions in, the strips out. A condition carries a source when
 * a solo effect holds it or when the player named its origin in the Conditions
 * picker («From what?»: `repeatSaveOriginsFor` lists the choices).
 */
import type { AbilityCode, ConditionId, RepeatSaveMoment } from "@/data/types";
import type { CatalogueEffect } from "@/lib/catalogue-effects";
import {
  conditionsEndingOn,
  type ConditionEvent,
  type DueRepeatSave,
  type SourcedCondition,
} from "@/lib/condition-ends";
import { classFeatureIndex } from "@/data/classes";
import { getSpellById, spells } from "@/data/spells";
import { conditionEndsOf } from "@/lib/play/fight-condition-ends";
import type { ActiveCombatEffect } from "@/types/combat-effect";

/** A condition the sheet holds, with the catalogue entry that gave it. */
export interface SheetSourcedCondition {
  /** The occurrence's identity (the condition effect's id). */
  key: string;
  conditionId: string;
  source: { kind: "spell" | "feature"; id: string; actionId?: string };
  /** The source's own save DC, when it was recorded with the condition. */
  saveDc?: number;
}

/** One strip: a save the player owes now, for one cast's conditions on the sheet. */
export interface SoloRepeatSave {
  /** The first occurrence's key: the strip's identity. */
  id: string;
  /** The condition the strip names. */
  conditionId: string;
  /** Every condition the same cast left on the sheet (Hideous Laughter's Prone and
   *  Incapacitated): one save answers for all of them. */
  conditionIds: string[];
  keys: string[];
  source: { kind: "spell" | "feature"; id: string };
  ability: AbilityCode;
  at: Extract<RepeatSaveMoment, "target-turn-end" | "target-turn-start">;
  advantage?: true;
  dc?: number;
  /** What a failure does (Vision of Elapsing Eons: Exhaustion). */
  onFail?: ReadonlyArray<CatalogueEffect>;
}

/** The sheet's own creature in the rule's events. */
const SELF = "self";

/** The condition effects on the sheet, as sourced conditions. */
export function sheetSourcedConditions(
  effects: ReadonlyArray<ActiveCombatEffect> | undefined
): SheetSourcedCondition[] {
  return (effects ?? []).flatMap((effect) =>
    effect.payload.kind === "condition"
      ? [
          {
            key: effect.id,
            conditionId: effect.payload.conditionId,
            source: effect.source,
            ...(effect.bindings?.saveDc !== undefined
              ? { saveDc: effect.bindings.saveDc }
              : {}),
          },
        ]
      : []
  );
}

/** A catalogue entry that can impose a condition: a spell or a class feature. */
export interface RepeatSaveOrigin {
  kind: "spell" | "feature";
  id: string;
}

/** Whether this source's rule for the condition is a repeat save the strip asks:
 *  one plain roll at the target's turn end or start. */
function asksStripSave(source: RepeatSaveOrigin, conditionId: string): boolean {
  return conditionEndsOf(source, conditionId).some(
    (end) =>
      end.on === "repeat-save" &&
      (end.at === "target-turn-end" || end.at === "target-turn-start") &&
      !end.track &&
      !end.when
  );
}

/**
 * The spells and features that impose `conditionId` with a repeat save the strip
 * asks («From what?» offers them; #1333). Empty when none does: the picker then
 * asks nothing more. The catalogue includes the private pack's entries.
 */
export function repeatSaveOriginsFor(conditionId: string): RepeatSaveOrigin[] {
  const fromSpells = spells.flatMap((spell): RepeatSaveOrigin[] =>
    spell.conditionApplication?.options.includes(conditionId as ConditionId) &&
    asksStripSave({ kind: "spell", id: spell.id }, conditionId)
      ? [{ kind: "spell", id: spell.id }]
      : []
  );
  const fromFeatures = [...classFeatureIndex.values()].flatMap(
    (feature): RepeatSaveOrigin[] =>
      feature.mechanics?.actions?.some((a) =>
        a.conditionApplication?.options.includes(conditionId as ConditionId)
      ) && asksStripSave({ kind: "feature", id: feature.id }, conditionId)
        ? [{ kind: "feature", id: feature.id }]
        : []
  );
  return [...fromSpells, ...fromFeatures];
}

/** The catalogue entry a stored origin id names, or null when it names none. */
export function originSource(id: string): RepeatSaveOrigin | null {
  if (getSpellById(id)) return { kind: "spell", id };
  if (classFeatureIndex.has(id)) return { kind: "feature", id };
  return null;
}

/** The condition chips whose origin the player named, as sourced conditions. No DC:
 *  the player named the source, not its caster's numbers. */
export function sheetOriginConditions(session: {
  conditions: ReadonlyArray<string>;
  conditionOrigins?: Readonly<Record<string, string>>;
}): SheetSourcedCondition[] {
  return session.conditions.flatMap((conditionId) => {
    const id = session.conditionOrigins?.[conditionId];
    const source = id ? originSource(id) : null;
    return source ? [{ key: `condition:${conditionId}`, conditionId, source }] : [];
  });
}

/**
 * The strips due at a solo turn edge: the turn that ends, then the next that starts.
 * `campaignConditions`: conditions a campaign prompt already asks about; they stay
 * silent here (never two prompts for one save).
 */
export function soloRepeatSavesDue(
  conditions: ReadonlyArray<SheetSourcedCondition>,
  opts: { campaignConditions?: ReadonlyArray<string> } = {}
): SoloRepeatSave[] {
  const silent = new Set(opts.campaignConditions ?? []);
  const sourced = conditions.flatMap((c): SourcedCondition[] => {
    if (silent.has(c.conditionId)) return [];
    const ends = conditionEndsOf(c.source, c.conditionId);
    return ends.length > 0
      ? [
          {
            id: c.key,
            conditionId: c.conditionId,
            targetId: SELF,
            ...(c.saveDc !== undefined ? { saveDc: c.saveDc } : {}),
            ends,
          },
        ]
      : [];
  });
  const events: ConditionEvent[] = [
    { kind: "turn-end", combatantId: SELF },
    { kind: "turn-start", combatantId: SELF },
  ];
  const seen = new Set<string>();
  const due: DueRepeatSave[] = [];
  for (const event of events) {
    for (const save of conditionsEndingOn(sourced, event).saves) {
      if (seen.has(save.id) || save.track || save.when) continue;
      seen.add(save.id);
      due.push(save);
    }
  }
  const byKey = new Map(conditions.map((c) => [c.key, c]));
  const strips: SoloRepeatSave[] = [];
  for (const save of due) {
    const origin = byKey.get(save.id);
    if (!origin || (save.at !== "target-turn-end" && save.at !== "target-turn-start"))
      continue;
    const twin = strips.find(
      (s) =>
        s.at === save.at &&
        s.source.kind === origin.source.kind &&
        s.source.id === origin.source.id &&
        s.keys.some((k) => byKey.get(k)?.source.actionId === origin.source.actionId)
    );
    if (twin) {
      twin.keys.push(save.id);
      if (!twin.conditionIds.includes(save.conditionId))
        twin.conditionIds.push(save.conditionId);
      continue;
    }
    strips.push({
      id: save.id,
      conditionId: save.conditionId,
      conditionIds: [save.conditionId],
      keys: [save.id],
      source: { kind: origin.source.kind, id: origin.source.id },
      ability: save.ability,
      at: save.at,
      ...(save.advantage ? { advantage: true as const } : {}),
      ...(save.dc !== undefined ? { dc: save.dc } : {}),
      ...(save.onFail ? { onFail: save.onFail } : {}),
    });
  }
  return strips;
}
