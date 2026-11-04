/**
 * The effects the catalogue authors itself (edge-case M12): an end hook (Fly's fall),
 * a save-success rider (Stunning Strike), a slot recovery. Every other effect is
 * still derived from the flat fields; these are the kinds that have none. One exact
 * schema, so a catalogue entry and a homebrew one conform the same way.
 */
import { ALL_CREATURE_TYPES } from "@/data/types";
import {
  arraySchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  numberSchema,
  objectSchema,
  type ExactSchema,
} from "@/lib/exact-schema";
import { literals } from "@/lib/homebrew-conform";
import type { Scalar } from "@/lib/scalar";
import type { ActivityEffect } from "@/lib/activities/types";

/** The ActivityEffect kinds the catalogue writes directly. */
export type CatalogueEffect = Extract<
  ActivityEffect,
  { kind: "fall-if-aloft" | "speed-halved" | "next-attack-advantage" | "recover-slots" }
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
  saveOutcome: literalSchema("success"),
  vsCreatureTypes: CREATURE_TYPES,
  notVsCreatureTypes: CREATURE_TYPES,
} as const;

export const CATALOGUE_EFFECT_SCHEMA: ExactSchema = discriminatedUnionSchema("kind", {
  "fall-if-aloft": objectSchema({ kind: literalSchema("fall-if-aloft") }, BASE),
  "speed-halved": objectSchema(
    { kind: literalSchema("speed-halved") },
    { ...BASE, until: UNTIL }
  ),
  "next-attack-advantage": objectSchema(
    { kind: literalSchema("next-attack-advantage") },
    { ...BASE, against: literalSchema("target"), until: UNTIL }
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
