/** Public projections of the universal mechanics-reference grammar. */

import type {
  CharacterMaterialRefSchemaShape,
  ClockRefSchemaShape,
  EntityRefSchemaShape,
  MaterialEntityRefSchemaShape,
  MaterialRefSchemaShape,
  OccurrenceGenerationRefSchemaShape,
  OccurrenceRefSchemaShape,
  SelfEntityRefSchemaShape,
  SharedMaterialRefSchemaShape,
} from "@/lib/mechanics-reference-schema";

export type MaterialRef = MaterialRefSchemaShape;
export type CharacterMaterialRef = CharacterMaterialRefSchemaShape;
export type SharedMaterialRef = SharedMaterialRefSchemaShape;
export type ClockRef = ClockRefSchemaShape;
export type EntityRef = EntityRefSchemaShape;
export type SelfEntityRef = SelfEntityRefSchemaShape;
export type MaterialEntityRef = MaterialEntityRefSchemaShape;
export type OccurrenceRef = OccurrenceRefSchemaShape;
export type OccurrenceGenerationRef = OccurrenceGenerationRefSchemaShape;
