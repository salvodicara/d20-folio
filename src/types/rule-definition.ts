import type {
  EntityId,
  Fingerprint,
  ResourceId,
  RuleId,
  SourceId,
} from "@/types/command";

export type RuleProvenance = {
  kind: "srd" | "content-pack" | "homebrew";
  sourceId: SourceId;
  sourceVersion: number;
};

export type ActorTarget = {
  kind: "actor";
};

export type SelectedTarget = {
  kind: "selected-targets";
  min: number;
  max: number;
  candidateIds: readonly EntityId[];
};

export type ResourceSpendRuleDefinition = {
  schemaVersion: 1;
  kind: "resource-spend";
  ruleId: RuleId;
  ruleVersion: number;
  fingerprint: Fingerprint;
  provenance: RuleProvenance;
  resourceId: ResourceId;
  amount: number;
  target: ActorTarget | SelectedTarget;
};

export interface RuleDefinitionKindMap {
  "resource-spend": ResourceSpendRuleDefinition;
}

export type RuleDefinition = RuleDefinitionKindMap[keyof RuleDefinitionKindMap];
