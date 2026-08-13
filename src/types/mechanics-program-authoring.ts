/** Public projections for the durable MechanicsProgram authoring grammar. */

import type {
  AmountSpecSchemaShape,
  D20RequestSpecSchemaShape,
  EntitySelectorSchemaShape,
  ItemSelectorSchemaShape,
  LifetimeSpecSchemaShape,
  MechanicsInputSchemaShape,
  MechanicsPredicateSchemaShape,
  MechanicsProgramSchemaShape,
  MechanicsRoleSchemaShape,
  MechanicsStepSchemaShape,
  PhaseTriggerSchemaShape,
} from "@/lib/mechanics-program-authoring-schema";

export type MechanicsProgram = MechanicsProgramSchemaShape;
export type MechanicsProgramPhase = MechanicsProgram["phases"][number];
export type MechanicsProgramRegister = MechanicsProgram["registers"][number];
export type MechanicsRole = MechanicsRoleSchemaShape;
export type MechanicsPredicate = MechanicsPredicateSchemaShape;
export type MechanicsInput = MechanicsInputSchemaShape;
export type MechanicsStep = MechanicsStepSchemaShape;
export type MechanicsPhaseTrigger = PhaseTriggerSchemaShape;
export type MechanicsAmountSpec = AmountSpecSchemaShape;
export type MechanicsLifetimeSpec = LifetimeSpecSchemaShape;
export type MechanicsEntitySelector = EntitySelectorSchemaShape;
export type MechanicsItemSelector = ItemSelectorSchemaShape;
export type MechanicsD20RequestSpec = D20RequestSpecSchemaShape;
