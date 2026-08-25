import { canonicalJson } from "@/lib/canonical-fingerprint";
import type { ResolutionOutcome } from "@/types/command";

export {
  decodeCommandReceipt,
  decodeExternalAnswer,
  decodeExternalInputRequest,
  decodeResolveCommandInput,
  type DecodeResult,
} from "@/lib/command/codec";
export {
  commandEventId,
  commandPatchId,
  commandPayloadFingerprint,
  commandReceiptId,
  externalRequestId,
  resolutionResultFingerprint,
  ruleDefinitionFingerprint,
  type ExternalRequestIdentityContext,
} from "@/lib/command/identity";
export { resolveCommand, retainCommandReceipts } from "@/lib/command/resolve-command";
export type * from "@/types/command";
export type * from "@/types/effect-instance";
export type * from "@/types/rule-definition";

export function canonicalResolutionJson(outcome: ResolutionOutcome): string {
  return canonicalJson(outcome);
}
