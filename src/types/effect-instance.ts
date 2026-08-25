import type {
  CommandId,
  EffectId,
  EntityId,
  Fingerprint,
  RevisionRef,
  RuleId,
  StateId,
} from "@/types/command";

export type EffectDuration =
  | {
      kind: "until-revision";
      stateId: StateId;
      revision: number;
    }
  | {
      kind: "until-rest";
      rest: "short" | "long";
    }
  | {
      kind: "until-dismissed";
    };

export type EffectInstance = {
  schemaVersion: 1;
  effectId: EffectId;
  ruleId: RuleId;
  ruleVersion: number;
  ruleFingerprint: Fingerprint;
  sourceId: EntityId;
  targetId: EntityId;
  appliedByCommandId: CommandId;
  startedAt: RevisionRef;
  duration: EffectDuration;
};
