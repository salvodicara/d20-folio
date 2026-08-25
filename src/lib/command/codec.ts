import { canonicalJson } from "@/lib/canonical-fingerprint";
import {
  commandEventId,
  commandPatchId,
  commandPayloadFingerprint,
  commandReceiptId,
  resolutionResultFingerprint,
  ruleDefinitionFingerprint,
} from "@/lib/command/identity";
import type { EffectDuration, EffectInstance } from "@/types/effect-instance";
import type {
  CommandEvent,
  CommandPatch,
  CommandReceipt,
  EntityId,
  ExternalAnswer,
  ExternalAnswers,
  ExternalInputRequest,
  Fingerprint,
  RejectionReason,
  ResolveCommandInput,
  ResourceState,
  RevisionChange,
  RevisionRef,
  SemanticCommand,
  SerializableValue,
  SourceId,
  WorldState,
} from "@/types/command";
import type {
  ActorTarget,
  ResourceSpendRuleDefinition,
  RuleDefinition,
  RuleProvenance,
  SelectedTarget,
} from "@/types/rule-definition";

const MAX_BYTES = 64 * 1024;
const MAX_DEPTH = 32;
const MAX_VALUES = 4_096;
const MAX_ARRAY_ENTRIES = 256;
const MAX_STRING_LENGTH = 1_024;
const MAX_ID_LENGTH = 128;
const MAX_TARGETS = 32;
const MAX_DISTANCE_FEET = 1_000_000;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export type DecodeResult<T> =
  | { readonly ok: true; readonly value: Readonly<T> }
  | { readonly ok: false; readonly reason: RejectionReason };

class CodecFailure extends Error {
  readonly reason: RejectionReason;

  constructor(reason: RejectionReason) {
    super(reason);
    this.reason = reason;
  }
}

function fail(reason: RejectionReason): never {
  throw new CodecFailure(reason);
}

function prewalk(value: unknown): void {
  const ancestors = new Set<object>();
  let values = 0;

  const visit = (current: unknown, depth: number): void => {
    values += 1;
    if (values > MAX_VALUES) fail("command-too-complex");
    if (depth > MAX_DEPTH) fail("command-too-deep");

    if (current === null || typeof current === "boolean") return;
    if (typeof current === "string") {
      if (current.length > MAX_STRING_LENGTH) fail("command-too-complex");
      return;
    }
    if (typeof current === "number") {
      if (
        !Number.isFinite(current) ||
        Object.is(current, -0) ||
        Math.abs(current) > Number.MAX_SAFE_INTEGER
      ) {
        fail("invalid-number");
      }
      return;
    }
    if (typeof current !== "object" || ancestors.has(current)) fail("invalid-input");

    let prototype: object | null;
    let keys: readonly PropertyKey[];
    try {
      prototype = Reflect.getPrototypeOf(current);
      keys = Reflect.ownKeys(current);
    } catch {
      fail("invalid-input");
    }
    const array = Array.isArray(current);
    if (
      (array && prototype !== Array.prototype) ||
      (!array && prototype !== Object.prototype)
    ) {
      fail("invalid-input");
    }

    ancestors.add(current);
    try {
      if (array) {
        if (current.length > MAX_ARRAY_ENTRIES) fail("command-too-complex");
        if (keys.length !== current.length + 1 || !keys.includes("length")) {
          fail("invalid-input");
        }
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!descriptor?.enumerable || !("value" in descriptor)) fail("invalid-input");
          visit(descriptor.value, depth + 1);
        }
        return;
      }

      for (const key of keys) {
        if (
          typeof key !== "string" ||
          key.length > MAX_STRING_LENGTH ||
          UNSAFE_KEYS.has(key)
        ) {
          fail("invalid-input");
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor?.enumerable || !("value" in descriptor)) fail("invalid-input");
        visit(descriptor.value, depth + 1);
      }
    } finally {
      ancestors.delete(current);
    }
  };

  visit(value, 0);
  let bytes: number;
  try {
    bytes = new TextEncoder().encode(canonicalJson(value)).byteLength;
  } catch {
    fail("invalid-input");
  }
  if (bytes > MAX_BYTES) fail("command-too-large");
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function decodeBoundary<T>(
  value: unknown,
  decode: (safe: unknown) => T
): DecodeResult<T> {
  try {
    prewalk(value);
    return { ok: true, value: deepFreeze(decode(value)) };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof CodecFailure ? error.reason : "invalid-input",
    };
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail("invalid-input");
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const result = record(value);
  const actual = Object.keys(result);
  const allowed = new Set(keys);
  if (actual.some((key) => !allowed.has(key))) fail("unknown-field");
  if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(result, key))) {
    fail("invalid-input");
  }
  return result;
}

function literal<T extends string | number | boolean | null>(
  value: unknown,
  expected: T
): T {
  if (value !== expected) fail("invalid-input");
  return expected;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") fail("invalid-input");
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < minimum ||
    value > maximum
  ) {
    fail("invalid-number");
  }
  return value;
}

function string(value: unknown): string {
  if (typeof value !== "string") fail("invalid-input");
  return value;
}

type StableNamespace =
  | "cmd"
  | "state"
  | "entity"
  | "resource"
  | "rule"
  | "source"
  | "effect"
  | "ruling";

function stableId<Namespace extends StableNamespace>(
  value: unknown,
  namespace: Namespace
): `${Namespace}:v1:${string}` {
  const candidate = string(value);
  const pattern = new RegExp(`^${namespace}:v1:[a-z0-9][a-z0-9._-]{0,95}$`);
  if (candidate.length > MAX_ID_LENGTH || !pattern.test(candidate)) fail("invalid-id");
  return candidate as `${Namespace}:v1:${string}`;
}

function derivedId<Namespace extends "req" | "patch" | "event" | "receipt">(
  value: unknown,
  namespace: Namespace
): `${Namespace}:v1:${string}` {
  const candidate = string(value);
  if (!new RegExp(`^${namespace}:v1:[0-9a-f]{64}$`).test(candidate)) fail("invalid-id");
  return candidate as `${Namespace}:v1:${string}`;
}

function fingerprint(value: unknown): Fingerprint {
  const candidate = string(value);
  if (!/^fp:v1:[0-9a-f]{64}$/.test(candidate)) fail("invalid-id");
  return candidate as Fingerprint;
}

function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) fail("invalid-input");
  return value;
}

function normalized<T>(
  value: unknown,
  decode: (entry: unknown) => T,
  identity: (entry: T) => string,
  minimum = 0,
  maximum = MAX_ARRAY_ENTRIES
): readonly T[] {
  const source = array(value);
  if (source.length < minimum || source.length > maximum) fail("invalid-number");
  const result = source.map(decode);
  const seen = new Set<string>();
  for (const entry of result) {
    if (seen.has(identity(entry))) fail("duplicate-id");
    seen.add(identity(entry));
  }
  return result.sort((left, right) => {
    const leftId = identity(left);
    const rightId = identity(right);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
}

function sequence<T>(value: unknown, decode: (entry: unknown) => T): readonly T[] {
  return array(value).map(decode);
}

function decodeSerializable(value: unknown): SerializableValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(decodeSerializable);
  const source = record(value);
  const result: Record<string, SerializableValue> = {};
  for (const key of Object.keys(source).sort())
    result[key] = decodeSerializable(source[key]);
  return result;
}

function revisionRef(value: unknown): RevisionRef {
  const source = exact(value, ["stateId", "revision"]);
  return {
    stateId: stableId(source.stateId, "state"),
    revision: boundedInteger(source.revision, 0, Number.MAX_SAFE_INTEGER - 1),
  };
}

function provenance(value: unknown): RuleProvenance {
  const source = exact(value, ["kind", "sourceId", "sourceVersion"]);
  if (
    source.kind !== "srd" &&
    source.kind !== "content-pack" &&
    source.kind !== "homebrew"
  ) {
    fail("invalid-input");
  }
  return {
    kind: source.kind,
    sourceId: stableId(source.sourceId, "source"),
    sourceVersion: boundedInteger(source.sourceVersion, 1, Number.MAX_SAFE_INTEGER),
  };
}

function ruleTarget(value: unknown): ActorTarget | SelectedTarget {
  const kind = record(value).kind;
  if (kind === "actor") {
    exact(value, ["kind"]);
    return { kind: literal(kind, "actor") };
  }
  if (kind !== "selected-targets") fail("invalid-input");
  const source = exact(value, ["kind", "min", "max", "candidateIds"]);
  const candidateIds = normalized(
    source.candidateIds,
    (entry) => stableId(entry, "entity"),
    (entry) => entry,
    1,
    MAX_TARGETS
  );
  const min = boundedInteger(source.min, 1, MAX_TARGETS);
  const max = boundedInteger(source.max, 1, MAX_TARGETS);
  if (min > max || max > candidateIds.length) fail("invalid-number");
  return { kind: "selected-targets", min, max, candidateIds };
}

function ruleDefinition(value: unknown): RuleDefinition {
  const kind = record(value).kind;
  if (kind !== "resource-spend") fail("unknown-rule-kind");
  const source = exact(value, [
    "schemaVersion",
    "kind",
    "ruleId",
    "ruleVersion",
    "fingerprint",
    "provenance",
    "resourceId",
    "amount",
    "target",
  ]);
  return {
    schemaVersion: literal(source.schemaVersion, 1),
    kind: "resource-spend",
    ruleId: stableId(source.ruleId, "rule"),
    ruleVersion: boundedInteger(source.ruleVersion, 1, Number.MAX_SAFE_INTEGER),
    fingerprint: fingerprint(source.fingerprint),
    provenance: provenance(source.provenance),
    resourceId: stableId(source.resourceId, "resource"),
    amount: boundedInteger(source.amount, 1, Number.MAX_SAFE_INTEGER),
    target: ruleTarget(source.target),
  } satisfies ResourceSpendRuleDefinition;
}

function effectDuration(value: unknown, startedAt: RevisionRef): EffectDuration {
  const kind = record(value).kind;
  if (kind === "until-dismissed") {
    exact(value, ["kind"]);
    return { kind };
  }
  if (kind === "until-rest") {
    const source = exact(value, ["kind", "rest"]);
    if (source.rest !== "short" && source.rest !== "long") fail("invalid-input");
    return { kind, rest: source.rest };
  }
  if (kind !== "until-revision") fail("invalid-input");
  const source = exact(value, ["kind", "stateId", "revision"]);
  const stateId = stableId(source.stateId, "state");
  if (stateId !== startedAt.stateId) fail("state-mismatch");
  const revision = boundedInteger(source.revision, 0, Number.MAX_SAFE_INTEGER - 1);
  if (revision <= startedAt.revision) fail("invalid-number");
  return { kind, stateId, revision };
}

function effectInstance(value: unknown): EffectInstance {
  const source = exact(value, [
    "schemaVersion",
    "effectId",
    "ruleId",
    "ruleVersion",
    "ruleFingerprint",
    "sourceId",
    "targetId",
    "appliedByCommandId",
    "startedAt",
    "duration",
  ]);
  const startedAt = revisionRef(source.startedAt);
  return {
    schemaVersion: literal(source.schemaVersion, 1),
    effectId: stableId(source.effectId, "effect"),
    ruleId: stableId(source.ruleId, "rule"),
    ruleVersion: boundedInteger(source.ruleVersion, 1, Number.MAX_SAFE_INTEGER),
    ruleFingerprint: fingerprint(source.ruleFingerprint),
    sourceId: stableId(source.sourceId, "entity"),
    targetId: stableId(source.targetId, "entity"),
    appliedByCommandId: stableId(source.appliedByCommandId, "cmd"),
    startedAt,
    duration: effectDuration(source.duration, startedAt),
  };
}

function resourceState(value: unknown): ResourceState {
  const source = exact(value, ["resourceId", "current", "maximum"]);
  const maximum = boundedInteger(source.maximum, 0, Number.MAX_SAFE_INTEGER);
  const current = boundedInteger(source.current, 0, Number.MAX_SAFE_INTEGER);
  if (current > maximum) fail("invalid-number");
  return {
    resourceId: stableId(source.resourceId, "resource"),
    current,
    maximum,
  };
}

function worldState(value: unknown): WorldState {
  const source = exact(value, [
    "schemaVersion",
    "stateId",
    "revision",
    "resources",
    "effects",
  ]);
  return {
    schemaVersion: literal(source.schemaVersion, 1),
    stateId: stableId(source.stateId, "state"),
    revision: boundedInteger(source.revision, 0, Number.MAX_SAFE_INTEGER - 1),
    resources: normalized(source.resources, resourceState, (entry) => entry.resourceId),
    effects: normalized(source.effects, effectInstance, (entry) => entry.effectId),
  };
}

function pair(value: unknown): { fromId: EntityId; toId: EntityId } {
  const source = exact(value, ["fromId", "toId"]);
  return {
    fromId: stableId(source.fromId, "entity"),
    toId: stableId(source.toId, "entity"),
  };
}

function pairIdentity(value: { fromId: EntityId; toId: EntityId }): string {
  return `${value.fromId}\u0000${value.toId}`;
}

function externalRequest(value: unknown): ExternalInputRequest {
  const kind = record(value).kind;
  if (kind === "selected-targets") {
    const source = exact(value, ["kind", "requestId", "min", "max", "candidateIds"]);
    const candidateIds = normalized(
      source.candidateIds,
      (entry) => stableId(entry, "entity"),
      (entry) => entry,
      1,
      MAX_TARGETS
    );
    const min = boundedInteger(source.min, 1, MAX_TARGETS);
    const max = boundedInteger(source.max, 1, MAX_TARGETS);
    if (min > max || max > candidateIds.length) fail("invalid-number");
    return {
      kind,
      requestId: derivedId(source.requestId, "req"),
      min,
      max,
      candidateIds,
    };
  }
  if (kind === "table-geometry") {
    const source = exact(value, ["kind", "requestId", "pairs"]);
    return {
      kind,
      requestId: derivedId(source.requestId, "req"),
      pairs: normalized(source.pairs, pair, pairIdentity),
    };
  }
  if (kind === "observed-outcome") {
    const source = exact(value, [
      "kind",
      "requestId",
      "valueType",
      "minimum",
      "maximum",
      "allowedIds",
    ]);
    const requestId = derivedId(source.requestId, "req");
    if (source.valueType === "integer") {
      const minimum = boundedInteger(
        source.minimum,
        -Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER
      );
      const maximum = boundedInteger(
        source.maximum,
        -Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER
      );
      if (minimum > maximum || array(source.allowedIds).length !== 0)
        fail("invalid-number");
      return { kind, requestId, valueType: "integer", minimum, maximum, allowedIds: [] };
    }
    if (source.valueType === "boolean") {
      if (
        source.minimum !== null ||
        source.maximum !== null ||
        array(source.allowedIds).length !== 0
      ) {
        fail("invalid-number");
      }
      return {
        kind,
        requestId,
        valueType: "boolean",
        minimum: null,
        maximum: null,
        allowedIds: [],
      };
    }
    if (source.valueType !== "stable-id") fail("invalid-input");
    if (source.minimum !== null || source.maximum !== null) fail("invalid-number");
    const allowedIds = normalized(
      source.allowedIds,
      (entry) => stableId(entry, "source"),
      (entry) => entry,
      1
    );
    return {
      kind,
      requestId,
      valueType: "stable-id",
      minimum: null,
      maximum: null,
      allowedIds,
    };
  }
  if (kind === "ruling") {
    const source = exact(value, ["kind", "requestId", "rulingIds"]);
    return {
      kind,
      requestId: derivedId(source.requestId, "req"),
      rulingIds: normalized(
        source.rulingIds,
        (entry) => stableId(entry, "ruling"),
        (entry) => entry,
        1
      ),
    };
  }
  fail("invalid-input");
}

function externalAnswer(value: unknown): ExternalAnswer {
  const kind = record(value).kind;
  if (kind === "selected-targets") {
    const source = exact(value, ["kind", "requestId", "targetIds"]);
    return {
      kind,
      requestId: derivedId(source.requestId, "req"),
      targetIds: normalized(
        source.targetIds,
        (entry) => stableId(entry, "entity"),
        (entry) => entry,
        1,
        MAX_TARGETS
      ),
    };
  }
  if (kind === "table-geometry") {
    const source = exact(value, ["kind", "requestId", "distances"]);
    return {
      kind,
      requestId: derivedId(source.requestId, "req"),
      distances: normalized(
        source.distances,
        (entry) => {
          const distance = exact(entry, ["fromId", "toId", "feet"]);
          return {
            fromId: stableId(distance.fromId, "entity"),
            toId: stableId(distance.toId, "entity"),
            feet: boundedInteger(distance.feet, 0, MAX_DISTANCE_FEET),
          };
        },
        pairIdentity
      ),
    };
  }
  if (kind === "observed-outcome") {
    const source = exact(value, ["kind", "requestId", "value"]);
    let answerValue: number | boolean | SourceId;
    if (typeof source.value === "number") {
      answerValue = boundedInteger(
        source.value,
        -Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER
      );
    } else if (typeof source.value === "boolean") {
      answerValue = source.value;
    } else {
      answerValue = stableId(source.value, "source");
    }
    return {
      kind,
      requestId: derivedId(source.requestId, "req"),
      value: answerValue,
    };
  }
  if (kind === "ruling") {
    const source = exact(value, ["kind", "requestId", "rulingId", "accepted"]);
    return {
      kind,
      requestId: derivedId(source.requestId, "req"),
      rulingId: stableId(source.rulingId, "ruling"),
      accepted: boolean(source.accepted),
    };
  }
  fail("invalid-external-answers");
}

function externalAnswers(value: unknown): ExternalAnswers {
  const source = exact(value, ["schemaVersion", "values"]);
  return {
    schemaVersion: literal(source.schemaVersion, 1),
    values: normalized(source.values, externalAnswer, (entry) => entry.requestId),
  };
}

function commandPatch(value: unknown): CommandPatch {
  const source = exact(value, [
    "schemaVersion",
    "kind",
    "patchId",
    "stateId",
    "resourceId",
    "before",
    "after",
  ]);
  const before = boundedInteger(
    source.before,
    -Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER
  );
  const after = boundedInteger(
    source.after,
    -Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER
  );
  if (before === after) fail("invalid-patch");
  return {
    schemaVersion: literal(source.schemaVersion, 1),
    kind: literal(source.kind, "set-resource"),
    patchId: derivedId(source.patchId, "patch"),
    stateId: stableId(source.stateId, "state"),
    resourceId: stableId(source.resourceId, "resource"),
    before,
    after,
  };
}

function commandEvent(value: unknown): CommandEvent {
  const source = exact(value, [
    "schemaVersion",
    "kind",
    "eventId",
    "actorId",
    "subjectId",
    "ruleId",
    "resourceId",
    "amount",
  ]);
  if (source.kind !== "resource-spent" && source.kind !== "resource-restored") {
    fail("invalid-input");
  }
  return {
    schemaVersion: literal(source.schemaVersion, 1),
    kind: source.kind,
    eventId: derivedId(source.eventId, "event"),
    actorId: stableId(source.actorId, "entity"),
    subjectId: stableId(source.subjectId, "entity"),
    ruleId: stableId(source.ruleId, "rule"),
    resourceId: stableId(source.resourceId, "resource"),
    amount: boundedInteger(source.amount, 1, Number.MAX_SAFE_INTEGER),
  };
}

function revisionChange(value: unknown): RevisionChange {
  const source = exact(value, ["stateId", "before", "after"]);
  const before = boundedInteger(source.before, 0, Number.MAX_SAFE_INTEGER - 1);
  const after = boundedInteger(source.after, 1, Number.MAX_SAFE_INTEGER);
  if (after !== before + 1) fail("invalid-patch");
  return { stateId: stableId(source.stateId, "state"), before, after };
}

function receipt(value: unknown): CommandReceipt {
  const source = exact(value, [
    "schemaVersion",
    "receiptId",
    "commandId",
    "payloadFingerprint",
    "resultFingerprint",
    "patches",
    "events",
    "revisions",
    "inversePatches",
  ]);
  const result: CommandReceipt = {
    schemaVersion: literal(source.schemaVersion, 1),
    receiptId: derivedId(source.receiptId, "receipt"),
    commandId: stableId(source.commandId, "cmd"),
    payloadFingerprint: fingerprint(source.payloadFingerprint),
    resultFingerprint: fingerprint(source.resultFingerprint),
    patches: sequence(source.patches, commandPatch),
    events: sequence(source.events, commandEvent),
    revisions: sequence(source.revisions, revisionChange),
    inversePatches: sequence(source.inversePatches, commandPatch),
  };
  if (
    result.patches.length === 0 ||
    result.patches.length !== result.inversePatches.length ||
    result.revisions.length === 0
  ) {
    fail("invalid-receipt");
  }
  if (
    [...result.patches, ...result.inversePatches].some(
      ({ before, after }) => before < 0 || after < 0
    )
  ) {
    fail("invalid-patch");
  }
  for (const [index, entry] of result.patches.entries()) {
    if (commandPatchId(result.commandId, index, entry) !== entry.patchId)
      fail("invalid-patch");
  }
  for (const [index, entry] of result.inversePatches.entries()) {
    if (commandPatchId(result.commandId, index, entry) !== entry.patchId)
      fail("invalid-patch");
    const forward = result.patches[index];
    if (
      forward === undefined ||
      entry.stateId !== forward.stateId ||
      entry.resourceId !== forward.resourceId ||
      entry.before !== forward.after ||
      entry.after !== forward.before
    ) {
      fail("invalid-patch");
    }
  }
  for (const [index, entry] of result.events.entries()) {
    if (commandEventId(result.commandId, index, entry) !== entry.eventId)
      fail("invalid-receipt");
  }
  if (resolutionResultFingerprint(result) !== result.resultFingerprint)
    fail("invalid-receipt");
  if (commandReceiptId(result) !== result.receiptId) fail("invalid-receipt");
  return result;
}

function semanticCommand(value: unknown): SemanticCommand {
  const kind = record(value).kind;
  if (kind === "use-rule") {
    const source = exact(value, [
      "schemaVersion",
      "kind",
      "commandId",
      "payloadFingerprint",
      "actorId",
      "subjectId",
      "ruleId",
      "ruleVersion",
      "expectedRevision",
      "choices",
    ]);
    const choiceSource = record(source.choices);
    const choices: Record<string, SerializableValue> = {};
    for (const key of Object.keys(choiceSource).sort()) {
      choices[key] = decodeSerializable(choiceSource[key]);
    }
    return {
      schemaVersion: literal(source.schemaVersion, 1),
      kind,
      commandId: stableId(source.commandId, "cmd"),
      payloadFingerprint: fingerprint(source.payloadFingerprint),
      actorId: stableId(source.actorId, "entity"),
      subjectId: stableId(source.subjectId, "entity"),
      ruleId: stableId(source.ruleId, "rule"),
      ruleVersion: boundedInteger(source.ruleVersion, 1, Number.MAX_SAFE_INTEGER),
      expectedRevision: revisionRef(source.expectedRevision),
      choices,
    };
  }
  if (kind === "undo-receipt") {
    const source = exact(value, [
      "schemaVersion",
      "kind",
      "commandId",
      "payloadFingerprint",
      "actorId",
      "subjectId",
      "expectedRevision",
      "receipt",
    ]);
    return {
      schemaVersion: literal(source.schemaVersion, 1),
      kind,
      commandId: stableId(source.commandId, "cmd"),
      payloadFingerprint: fingerprint(source.payloadFingerprint),
      actorId: stableId(source.actorId, "entity"),
      subjectId: stableId(source.subjectId, "entity"),
      expectedRevision: revisionRef(source.expectedRevision),
      receipt: receipt(source.receipt),
    };
  }
  fail("unknown-command-kind");
}

function resolveInput(value: unknown): ResolveCommandInput {
  const source = exact(value, [
    "schemaVersion",
    "mode",
    "ruleDefinition",
    "world",
    "command",
    "externalAnswers",
    "priorReceipt",
  ]);
  if (source.mode !== "preview" && source.mode !== "commit") fail("invalid-input");
  const definition =
    source.ruleDefinition === null ? null : ruleDefinition(source.ruleDefinition);
  const command = semanticCommand(source.command);
  if (commandPayloadFingerprint(command) !== command.payloadFingerprint) {
    fail("command-payload-mismatch");
  }
  if (
    definition !== null &&
    ruleDefinitionFingerprint(definition) !== definition.fingerprint
  ) {
    fail("rule-fingerprint-mismatch");
  }
  return {
    schemaVersion: literal(source.schemaVersion, 1),
    mode: source.mode,
    ruleDefinition: definition,
    world: worldState(source.world),
    command,
    externalAnswers: externalAnswers(source.externalAnswers),
    priorReceipt: source.priorReceipt === null ? null : receipt(source.priorReceipt),
  };
}

export function decodeExternalInputRequest(
  value: unknown
): DecodeResult<ExternalInputRequest> {
  return decodeBoundary(value, externalRequest);
}

export function decodeExternalAnswer(value: unknown): DecodeResult<ExternalAnswer> {
  return decodeBoundary(value, externalAnswer);
}

export function decodeCommandReceipt(value: unknown): DecodeResult<CommandReceipt> {
  return decodeBoundary(value, receipt);
}

export function decodeResolveCommandInput(
  value: unknown
): DecodeResult<ResolveCommandInput> {
  return decodeBoundary(value, resolveInput);
}
