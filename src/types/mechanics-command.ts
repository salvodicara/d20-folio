/** Public projections of the exact mechanics command/suspension grammar. */

import type {
  MechanicsCommandAnswerSchemaShape,
  MechanicsCommandRequesterSchemaShape,
  MechanicsCommandSchemaShape,
  MechanicsCommandSuspensionSchemaShape,
  MechanicsDocumentFenceSchemaShape,
  MechanicsExecutionFrameSchemaShape,
  MechanicsFingerprintSchemaShape,
  MechanicsObservationKeySchemaShape,
  PhaseExecutionReceiptSchemaShape,
  ProgramRootReceiptSchemaShape,
} from "@/lib/mechanics-command-schema";
import type { MechanicsAuthorityDefinition } from "@/types/mechanics-authority";

export type MechanicsFingerprint = MechanicsFingerprintSchemaShape;
export type MechanicsCommandAnswer = MechanicsCommandAnswerSchemaShape;
export type MechanicsCommand = MechanicsCommandSchemaShape;
export type MechanicsCommandResume = Extract<
  MechanicsCommand,
  { readonly kind: "resume" }
>;

/** Shape-only identity constructed from authenticated/internal context, never command JSON. */
export type MechanicsCommandRequester = MechanicsCommandRequesterSchemaShape;
export type PhaseExecutionReceipt = PhaseExecutionReceiptSchemaShape;
export type ProgramRootReceipt = ProgramRootReceiptSchemaShape;
export type MechanicsDocumentFence = MechanicsDocumentFenceSchemaShape;
export type MechanicsObservationKey = MechanicsObservationKeySchemaShape;
export type MechanicsExecutionFrame = MechanicsExecutionFrameSchemaShape;
export type MechanicsCommandSuspension = MechanicsCommandSuspensionSchemaShape;

/** A matched resume uses the already allocated action id stored by its suspension. */
export interface MechanicsCommandResumeMatch {
  readonly command: Readonly<MechanicsCommandResume>;
  readonly commandId: string;
  readonly suspension: Readonly<MechanicsCommandSuspension>;
}

/** Must be supplied only by the trusted internal event adapter. */
export interface MechanicsTrustedEngineContext {
  readonly kind: "trusted-engine";
}

export type MechanicsRequesterAuthorization =
  | {
      readonly basis: "installation-owner" | "trusted-engine";
      readonly status: "authorized";
    }
  | {
      readonly reason:
        | "engine-context-required"
        | "material-authority-policy-required"
        | "owner-not-character-play"
        | "requester-owner-mismatch";
      readonly status: "denied";
    };

/** Only full definitions returned by the authority resolver are valid inputs. */
export type ResolvedMechanicsRequesterDefinition = Readonly<MechanicsAuthorityDefinition>;
