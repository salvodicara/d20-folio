/** Public projections of the one exact active-occurrence runtime schema. */

import type {
  EndRuleSchemaShape,
  JsonScalarSchemaShape,
  MechanicsEndCauseSchemaShape,
  MechanicOccurrenceSchemaShape,
  NewMechanicOccurrenceSchemaShape,
  ObservedMechanicsBoundarySchemaShape,
  OccurrenceStateSchemaShape,
  ProgramPhaseStateEntrySchemaShape,
  ProgramPhaseStateSchemaShape,
  StandingFactSchemaShape,
} from "@/lib/mechanic-occurrence-schema";

export type OccurrenceId = string;
export type EndRule = EndRuleSchemaShape;
export type MechanicsEndCause = MechanicsEndCauseSchemaShape;
export type ObservedMechanicsBoundary = ObservedMechanicsBoundarySchemaShape;
export type JsonScalar = JsonScalarSchemaShape;
export type ProgramPhaseStateEntry = ProgramPhaseStateEntrySchemaShape;
export type ProgramPhaseState = ProgramPhaseStateSchemaShape;
export type StandingFact = StandingFactSchemaShape;

type MutableProjection<Value> = Value extends readonly (infer Entry)[]
  ? MutableProjection<Entry>[]
  : Value extends object
    ? { -readonly [Key in keyof Value]: MutableProjection<Value[Key]> }
    : Value;

export type MechanicOccurrence = MutableProjection<MechanicOccurrenceSchemaShape>;
export type ProgramOccurrence = Extract<MechanicOccurrence, { kind: "program" }>;
export type EffectOccurrence = Exclude<MechanicOccurrence, ProgramOccurrence>;
export type NewMechanicOccurrence = MutableProjection<NewMechanicOccurrenceSchemaShape>;
export type OccurrenceState = Omit<
  MutableProjection<OccurrenceStateSchemaShape>,
  "occurrences"
> & {
  occurrences: Record<string, MechanicOccurrence>;
};

export type OccurrenceStateParseResult =
  | { readonly ok: true; readonly value: Readonly<OccurrenceState> }
  | { readonly ok: false };
