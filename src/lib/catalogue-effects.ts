/**
 * The effects the catalogue authors itself (edge-case M12): an end hook (Fly's fall),
 * a save-success rider (Stunning Strike), a slot recovery, capped Exhaustion, a
 * damage-roll penalty, spending Hit Point Dice, a dispel, a move of the user's own. Every other effect is
 * still derived from the flat fields; these are the kinds that have none. One exact
 * schema, so a catalogue entry and a homebrew one conform the same way.
 */
import { ALL_CREATURE_TYPES } from "@/data/types";
import { DAMAGE_TYPE_SCHEMA } from "@/types/damage";
import {
  arraySchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  numberSchema,
  objectSchema,
  stringSchema,
  unionSchema,
  type ExactSchema,
} from "@/lib/exact-schema";
import { literals } from "@/lib/homebrew-conform";
import type { Scalar } from "@/lib/scalar";
import type { ActivityEffect } from "@/lib/activities/types";

/** The ActivityEffect kinds the catalogue writes directly. */
export type CatalogueEffect = Extract<
  ActivityEffect,
  {
    kind:
      | "damage"
      | "temp-hp"
      | "speed-bonus"
      | "fall-if-aloft"
      | "speed-halved"
      | "speed-zero"
      | "next-attack-advantage"
      | "save-disadvantage"
      | "recover-slots"
      | "exhaustion"
      | "damage-roll-penalty"
      | "hit-point-dice"
      | "dispel"
      | "self-move"
      | "forced-movement";
  }
>;

/** A catalogue number (`@/lib/scalar`), conformed by the context's `scalar` custom. */
const SCALAR_SCHEMA = customSchema<"scalar", Scalar>("scalar");
const UNTIL = objectSchema({
  anchor: literals(["actor", "target"]),
  phase: literals(["turn-start", "turn-end"]),
});
const CREATURE_TYPES = arraySchema(literals(ALL_CREATURE_TYPES));
/** The fields every effect may carry. */
const BASE = {
  fromLevel: numberSchema,
  saveOutcome: unionSchema([literalSchema("success"), literalSchema("any")]),
  vsCreatureTypes: CREATURE_TYPES,
  notVsCreatureTypes: CREATURE_TYPES,
} as const;

/** A Hit Point Dice spend (`@/lib/play/hit-point-dice`), shared with the trigger
 *  rule's `do`: how many dice, and the optional fields. */
export const HIT_POINT_DICE_MAX = unionSchema([
  numberSchema,
  literalSchema("slot-level"),
]);
export const HIT_POINT_DICE_OPTIONAL = {
  perUpcast: numberSchema,
  bonus: unionSchema([
    literalSchema("slot-level"),
    literalSchema("spellcasting-mod"),
    literalSchema("con-mod"),
    literalSchema("proficiency"),
  ]),
  into: unionSchema([
    literalSchema("healing"),
    literalSchema("damage"),
    literalSchema("temp-hp"),
    literalSchema("save"),
  ]),
  evenOnly: literalSchema(true),
  oddInto: unionSchema([
    literalSchema("healing"),
    literalSchema("damage"),
    literalSchema("temp-hp"),
    literalSchema("save"),
  ]),
  spender: literalSchema("target"),
  exactly: literalSchema(true),
} as const;

/** Dice the catalogue authors: an amount, and what each slot above the base adds. */
const DICE = objectSchema({ dice: stringSchema }, { perUpcast: stringSchema });

export const CATALOGUE_EFFECT_SCHEMA: ExactSchema = discriminatedUnionSchema("kind", {
  damage: objectSchema(
    { kind: literalSchema("damage"), dice: DICE, types: arraySchema(DAMAGE_TYPE_SCHEMA) },
    { ...BASE, onSave: literalSchema("half") }
  ),
  "temp-hp": objectSchema({ kind: literalSchema("temp-hp"), dice: DICE }, BASE),
  "speed-bonus": objectSchema(
    { kind: literalSchema("speed-bonus"), feet: numberSchema },
    { ...BASE, until: UNTIL }
  ),
  "fall-if-aloft": objectSchema({ kind: literalSchema("fall-if-aloft") }, BASE),
  "speed-halved": objectSchema(
    { kind: literalSchema("speed-halved") },
    { ...BASE, until: UNTIL, activeKey: stringSchema }
  ),
  "speed-zero": objectSchema(
    { kind: literalSchema("speed-zero") },
    { ...BASE, until: UNTIL, activeKey: stringSchema }
  ),
  "next-attack-advantage": objectSchema(
    { kind: literalSchema("next-attack-advantage") },
    { ...BASE, against: literalSchema("target"), until: UNTIL, activeKey: stringSchema }
  ),
  "save-disadvantage": objectSchema(
    { kind: literalSchema("save-disadvantage"), against: literalSchema("actor-spells") },
    { ...BASE, until: UNTIL, activeKey: stringSchema }
  ),
  exhaustion: objectSchema(
    { kind: literalSchema("exhaustion"), levels: numberSchema },
    { ...BASE, upTo: numberSchema, endsWithSpell: literalSchema(true) }
  ),
  "damage-roll-penalty": objectSchema(
    { kind: literalSchema("damage-roll-penalty"), dice: stringSchema },
    { ...BASE, until: UNTIL, activeKey: stringSchema }
  ),
  "hit-point-dice": objectSchema(
    { kind: literalSchema("hit-point-dice"), max: HIT_POINT_DICE_MAX },
    { ...BASE, ...HIT_POINT_DICE_OPTIONAL }
  ),
  dispel: objectSchema(
    { kind: literalSchema("dispel"), autoMaxLevel: numberSchema },
    { ...BASE, perUpcast: numberSchema }
  ),
  "forced-movement": objectSchema(
    {
      kind: literalSchema("forced-movement"),
      direction: unionSchema([literalSchema("push"), literalSchema("pull")]),
      feet: numberSchema,
    },
    BASE
  ),
  "self-move": objectSchema(
    { kind: literalSchema("self-move"), fraction: numberSchema },
    { ...BASE, noOpportunityAttacks: literalSchema(true) }
  ),
  "recover-slots": objectSchema(
    { kind: literalSchema("recover-slots") },
    {
      ...BASE,
      totalLevels: numberSchema,
      count: numberSchema,
      perUpcast: numberSchema,
      maxSlotLevel: SCALAR_SCHEMA,
    }
  ),
});

export const CATALOGUE_EFFECTS_SCHEMA: ExactSchema = arraySchema(CATALOGUE_EFFECT_SCHEMA);
