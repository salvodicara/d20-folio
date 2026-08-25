import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve as resolvePath } from "node:path";

import ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";

import { canonicalJson } from "@/lib/canonical-fingerprint";
import {
  canonicalResolutionJson,
  resolveCommand as resolveCommandFromPublicEntry,
} from "@/lib/command";
import {
  commandEventId,
  commandPatchId,
  commandPayloadFingerprint,
  commandReceiptId,
  externalRequestId,
  resolutionResultFingerprint,
  ruleDefinitionFingerprint,
} from "@/lib/command/identity";
import {
  decodeCommandReceipt,
  decodeExternalAnswer,
  decodeExternalInputRequest,
  decodeResolveCommandInput,
} from "@/lib/command/codec";
import { resolveCommand, retainCommandReceipts } from "@/lib/command/resolve-command";
import type {
  CommandEvent,
  CommandPatch,
  CommandReceipt,
  ResolveCommandInput,
  SemanticCommand,
  SerializableValue,
} from "@/types/command";
import type { EffectInstance } from "@/types/effect-instance";
import type { ResourceSpendRuleDefinition } from "@/types/rule-definition";
import type { Grant } from "@/lib/grants";

const RULE_FINGERPRINT =
  "fp:v1:3d3679aef6e0579da41a2ff60efe7d75b2a2f96bada08799f30d69fba09dca00" as const;
const PAYLOAD_FINGERPRINT =
  "fp:v1:cee46e2e539a8be343d56388010b4413e0dc925c4268f2fc1d67c8434f06512b" as const;

const rule = {
  schemaVersion: 1,
  kind: "resource-spend",
  ruleId: "rule:v1:focus",
  ruleVersion: 1,
  fingerprint: RULE_FINGERPRINT,
  provenance: {
    kind: "srd",
    sourceId: "source:v1:srd-5.2.1",
    sourceVersion: 1,
  },
  resourceId: "resource:v1:focus",
  amount: 1,
  target: { kind: "actor" },
} as const satisfies ResourceSpendRuleDefinition;

const command = {
  schemaVersion: 1,
  kind: "use-rule",
  commandId: "cmd:v1:k-spend-001",
  payloadFingerprint: PAYLOAD_FINGERPRINT,
  actorId: "entity:v1:pc-a",
  subjectId: "entity:v1:pc-a",
  ruleId: "rule:v1:focus",
  ruleVersion: 1,
  expectedRevision: { stateId: "state:v1:pc-a", revision: 7 },
  choices: {},
} as const satisfies SemanticCommand;

const patch = {
  schemaVersion: 1,
  kind: "set-resource",
  patchId: "patch:v1:bd731cc7a11733972a8f1ede384ce106125403c34d04a75c9e45ddd4bcdbf3d5",
  stateId: "state:v1:pc-a",
  resourceId: "resource:v1:focus",
  before: 2,
  after: 1,
} as const satisfies CommandPatch;

const inversePatch = {
  schemaVersion: 1,
  kind: "set-resource",
  patchId: "patch:v1:b1e754b69f04b974a3a11d903ef0b07e44680a96e3175ea156f0579f517573f4",
  stateId: "state:v1:pc-a",
  resourceId: "resource:v1:focus",
  before: 1,
  after: 2,
} as const satisfies CommandPatch;

const event = {
  schemaVersion: 1,
  kind: "resource-spent",
  eventId: "event:v1:c439122210b309c06669c50589631be3c1a73f4d3530f69913d56bb82706c054",
  actorId: "entity:v1:pc-a",
  subjectId: "entity:v1:pc-a",
  ruleId: "rule:v1:focus",
  resourceId: "resource:v1:focus",
  amount: 1,
} as const satisfies CommandEvent;

const revisions = [{ stateId: "state:v1:pc-a", before: 7, after: 8 }] as const;

const COMMITTED_RECEIPT = {
  schemaVersion: 1,
  receiptId:
    "receipt:v1:32a8f33594dbecd25d9d26b4476b14405fceda4e47052cc6876927c104e20deb",
  commandId: "cmd:v1:k-spend-001",
  payloadFingerprint: PAYLOAD_FINGERPRINT,
  resultFingerprint:
    "fp:v1:f8715c4b5c066fecd99a8aad1934ef0192ef1d6ff3f49e2e60700ac798cd45aa",
  patches: [patch],
  events: [event],
  revisions,
  inversePatches: [inversePatch],
} as const satisfies CommandReceipt;

const NEGATIVE_INVERSE_RECEIPT = {
  ...COMMITTED_RECEIPT,
  receiptId:
    "receipt:v1:3d7e2428e4d0325f656992277353aceeeaca691df2d5dcf637f0781cf8f73655",
  inversePatches: [
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:6904b67e6e23c2ede4b25f62608701726c400a052a4c1a127550f6f1dbd2092e",
      stateId: "state:v1:pc-a",
      resourceId: "resource:v1:focus",
      before: 1,
      after: -3,
    },
  ],
} as const satisfies CommandReceipt;

const UNDO_RECEIPT = {
  schemaVersion: 1,
  receiptId:
    "receipt:v1:5414d6242663c0ae909c24a7d873364f267e07364262d6ed71c06a74bce905b2",
  commandId: "cmd:v1:k-undo-001",
  payloadFingerprint:
    "fp:v1:79ac12f07582c7cab58a522e0d9c2bcc77d9c8f47ce403206552a8fab22bd230",
  resultFingerprint:
    "fp:v1:0fb3b776ea2d1bcfeee3e6569c4e6ccb318b96519cb75d0c21cc0fa9867a8b50",
  patches: [
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:e9dbbf5cc000aaf6e5d928c906af26b64b6359be14445b88a310ccac1ffd1691",
      stateId: "state:v1:pc-a",
      resourceId: "resource:v1:focus",
      before: 1,
      after: 2,
    },
  ],
  events: [
    {
      schemaVersion: 1,
      kind: "resource-restored",
      eventId:
        "event:v1:b5734668652347b3dfc7540c4ca8fa84f187994bcfc99279c41015205afb73df",
      actorId: "entity:v1:pc-a",
      subjectId: "entity:v1:pc-a",
      ruleId: "rule:v1:focus",
      resourceId: "resource:v1:focus",
      amount: 1,
    },
  ],
  revisions: [{ stateId: "state:v1:pc-a", before: 8, after: 9 }],
  inversePatches: [
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:17e057b81cadde0e4d27cf596b1a96a80dd823ad2b22170b484ab12a416f71e0",
      stateId: "state:v1:pc-a",
      resourceId: "resource:v1:focus",
      before: 2,
      after: 1,
    },
  ],
} as const satisfies CommandReceipt;

const REDO_RECEIPT = {
  schemaVersion: 1,
  receiptId:
    "receipt:v1:2bb4c225ec4eeb76ede137dba2931695a142d69828c98384fb3dbd5ceecb09b6",
  commandId: "cmd:v1:k-redo-001",
  payloadFingerprint:
    "fp:v1:227a7283c37452b6e6fb3831efe0eb77ce9e55804ce9fcf018db3282405c751d",
  resultFingerprint:
    "fp:v1:e13e3201707dfb852b08d25922a4e34c0592702375f012e4d6d7ca1ff329b5d1",
  patches: [
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:a06a07bae49360d917861a5c763869337b8c5925a02ea668b77888a6200d0884",
      stateId: "state:v1:pc-a",
      resourceId: "resource:v1:focus",
      before: 2,
      after: 1,
    },
  ],
  events: [
    {
      schemaVersion: 1,
      kind: "resource-spent",
      eventId:
        "event:v1:73845bfd8a1ca97f89dfc9bfac83e06d4cc3e9db1e6344a02e746d1b7a55a8e3",
      actorId: "entity:v1:pc-a",
      subjectId: "entity:v1:pc-a",
      ruleId: "rule:v1:focus",
      resourceId: "resource:v1:focus",
      amount: 1,
    },
  ],
  revisions: [{ stateId: "state:v1:pc-a", before: 9, after: 10 }],
  inversePatches: [
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:925dd69c9c47084c5cfa7d625f60dc51c6f0acf4729ead3e2e7ca1884c2a0556",
      stateId: "state:v1:pc-a",
      resourceId: "resource:v1:focus",
      before: 1,
      after: 2,
    },
  ],
} as const satisfies CommandReceipt;

const TWO_LEG_RECEIPT = {
  schemaVersion: 1,
  receiptId:
    "receipt:v1:42699357151d021dd6a2b2321fa4c52150f5a06f8895af23a7803ec7557f6df3",
  commandId: "cmd:v1:k-batch-001",
  payloadFingerprint:
    "fp:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  resultFingerprint:
    "fp:v1:ed05687f2b8b8b8408eac5f7140cbcbd340c196b7685f33bd109caf4ded41fa7",
  patches: [
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:ed684b5328610c0b1e86d6fb63d60bac4574a362b29f6bb7df2ae13c1811283c",
      stateId: "state:v1:pc-a",
      resourceId: "resource:v1:focus",
      before: 2,
      after: 1,
    },
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:9ad54b2779b7edf61163fcbee9d460be22e7d67159f1931eb865b0adc5353a4e",
      stateId: "state:v1:pc-a",
      resourceId: "resource:v1:secondary",
      before: 3,
      after: 2,
    },
  ],
  events: [
    {
      schemaVersion: 1,
      kind: "resource-spent",
      eventId:
        "event:v1:47693a69a324c5d23e33f770373fa63391b1e416931ce7f75d08a34cccf99e2d",
      actorId: "entity:v1:pc-a",
      subjectId: "entity:v1:pc-a",
      ruleId: "rule:v1:focus",
      resourceId: "resource:v1:focus",
      amount: 1,
    },
    {
      schemaVersion: 1,
      kind: "resource-spent",
      eventId:
        "event:v1:04cbaadeb9282b8fcd8e125a165050e65cebf62d934ab8df6b6ed88b77c57a60",
      actorId: "entity:v1:pc-a",
      subjectId: "entity:v1:pc-a",
      ruleId: "rule:v1:focus",
      resourceId: "resource:v1:secondary",
      amount: 1,
    },
  ],
  revisions: [{ stateId: "state:v1:pc-a", before: 7, after: 8 }],
  inversePatches: [
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:5bf3accb91e868aa6dbb33285e5e0c3444e5ff7f2604bb7fb848abc2d6279931",
      stateId: "state:v1:pc-a",
      resourceId: "resource:v1:focus",
      before: 1,
      after: 2,
    },
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:0d8489dcf5ecbd2fc1cb45e7ebe334cca227c07de4322370d7a6f1965f6d9fff",
      stateId: "state:v1:pc-a",
      resourceId: "resource:v1:secondary",
      before: 2,
      after: 3,
    },
  ],
} as const satisfies CommandReceipt;

const REVERSE_ORDER_RECEIPT = {
  schemaVersion: 1,
  receiptId:
    "receipt:v1:55e04fb90fe4acce47ae33c85f594c8636ed6f7363685ac6dac2807339477ed4",
  commandId: "cmd:v1:k-order-001",
  payloadFingerprint:
    "fp:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  resultFingerprint:
    "fp:v1:6828783b34dfd5f06555520df8a57d8c8aebed0231ff39e953ad794eb7e65e73",
  patches: [
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:a88c335193189fde32d897423a24247f7b83419381d30575348cc14bac148079",
      stateId: "state:v1:pc-a",
      resourceId: "resource:v1:secondary",
      before: 3,
      after: 2,
    },
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:e2491f764bf08f96e63fbd6ccec90e06c3196119b7128db43667d94e5c9e763d",
      stateId: "state:v1:pc-a",
      resourceId: "resource:v1:focus",
      before: 2,
      after: 1,
    },
  ],
  events: [
    {
      schemaVersion: 1,
      kind: "resource-spent",
      eventId:
        "event:v1:9d989234d059dc4fa557c7f79aa96af74515d8a90bd66725031a553dc5be1a3f",
      actorId: "entity:v1:pc-a",
      subjectId: "entity:v1:pc-a",
      ruleId: "rule:v1:focus",
      resourceId: "resource:v1:secondary",
      amount: 1,
    },
    {
      schemaVersion: 1,
      kind: "resource-spent",
      eventId:
        "event:v1:44939cc7f36ad5a5371655a03b34f1f887bbf7608ae9dca5024422b83bcfddeb",
      actorId: "entity:v1:pc-a",
      subjectId: "entity:v1:pc-a",
      ruleId: "rule:v1:focus",
      resourceId: "resource:v1:focus",
      amount: 1,
    },
  ],
  revisions: [{ stateId: "state:v1:pc-a", before: 7, after: 8 }],
  inversePatches: [
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:78d8adeda3dd9fa7fd8b0a39b443f973ee8d288165053e429cbe39a8184557a8",
      stateId: "state:v1:pc-a",
      resourceId: "resource:v1:secondary",
      before: 2,
      after: 3,
    },
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:7f6a05fe27416c22ed3c276909639f8494d972736165fbd1bfa3e4b4dc4b4c29",
      stateId: "state:v1:pc-a",
      resourceId: "resource:v1:focus",
      before: 1,
      after: 2,
    },
  ],
} as const satisfies CommandReceipt;

function validInput(): ResolveCommandInput {
  return {
    schemaVersion: 1,
    mode: "commit",
    ruleDefinition: structuredClone(rule),
    world: {
      schemaVersion: 1,
      stateId: "state:v1:pc-a",
      revision: 7,
      resources: [
        { resourceId: "resource:v1:secondary", current: 3, maximum: 3 },
        { resourceId: "resource:v1:focus", current: 2, maximum: 2 },
      ],
      effects: [],
    },
    command: structuredClone(command),
    externalAnswers: { schemaVersion: 1, values: [] },
    priorReceipt: null,
  };
}

function decodeMutation(mutate: (input: ResolveCommandInput) => unknown) {
  const input = validInput();
  return decodeResolveCommandInput(mutate(input));
}

describe("Automation K1 canonical identities", () => {
  it("freezes every public versioned ID namespace", () => {
    expectTypeOf(command.commandId).toExtend<`cmd:v1:${string}`>();
    expectTypeOf(command.actorId).toExtend<`entity:v1:${string}`>();
    expectTypeOf(command.expectedRevision.stateId).toExtend<`state:v1:${string}`>();
    expectTypeOf(rule.ruleId).toExtend<`rule:v1:${string}`>();
    expectTypeOf(rule.provenance.sourceId).toExtend<`source:v1:${string}`>();
    expectTypeOf(rule.resourceId).toExtend<`resource:v1:${string}`>();
    expectTypeOf(patch.patchId).toExtend<`patch:v1:${string}`>();
    expectTypeOf(event.eventId).toExtend<`event:v1:${string}`>();
  });

  it("hashes the exact non-circular rule projection", () => {
    expect(ruleDefinitionFingerprint(rule)).toBe(RULE_FINGERPRINT);
    expect(
      ruleDefinitionFingerprint({
        target: { kind: "actor" },
        amount: 1,
        resourceId: "resource:v1:focus",
        provenance: {
          sourceVersion: 1,
          sourceId: "source:v1:srd-5.2.1",
          kind: "srd",
        },
        fingerprint: RULE_FINGERPRINT,
        ruleVersion: 1,
        ruleId: "rule:v1:focus",
        kind: "resource-spend",
        schemaVersion: 1,
      })
    ).toBe(RULE_FINGERPRINT);
  });

  it("hashes the exact command projection without its caller ID or payload claim", () => {
    expect(commandPayloadFingerprint(command)).toBe(PAYLOAD_FINGERPRINT);
    expect(
      commandPayloadFingerprint({
        ...command,
        commandId: "cmd:v1:a-distinct-caller-token",
      })
    ).toBe(PAYLOAD_FINGERPRINT);
    expect(
      commandPayloadFingerprint({
        ...command,
        choices: { localeProbe: "İ" },
      })
    ).toBe("fp:v1:09b02a0b66298db7aecae170a2cfa4ac81c09a7a062ce5472ad5e6e11ac227f0");
    expect(
      commandPayloadFingerprint({ ...command, subjectId: "entity:v1:pc-b" })
    ).not.toBe(PAYLOAD_FINGERPRINT);
  });

  it("binds the exact external request projection", () => {
    expect(
      externalRequestId(
        {
          commandId: command.commandId,
          payloadFingerprint: command.payloadFingerprint,
          ruleId: command.ruleId,
          ruleVersion: command.ruleVersion,
          stateId: command.expectedRevision.stateId,
          expectedRevision: command.expectedRevision.revision,
        },
        {
          kind: "selected-targets",
          requestId:
            "req:v1:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          min: 1,
          max: 1,
          candidateIds: ["entity:v1:pc-a", "entity:v1:pc-b"],
        }
      )
    ).toBe("req:v1:562d1717a892e3df6e0c066ac9b878c04e1068331d804c2b8ea4d8733cee25b5");
  });

  it("binds exact patch and event projections", () => {
    expect(commandPatchId(command.commandId, 0, patch)).toBe(patch.patchId);
    expect(commandPatchId(command.commandId, 0, inversePatch)).toBe(inversePatch.patchId);
    expect(commandEventId(command.commandId, 0, event)).toBe(event.eventId);
  });

  it("binds exact result and receipt projections", () => {
    const resultFingerprint = resolutionResultFingerprint({
      commandId: command.commandId,
      payloadFingerprint: command.payloadFingerprint,
      patches: [patch],
      events: [event],
      revisions,
    });
    expect(resultFingerprint).toBe(
      "fp:v1:f8715c4b5c066fecd99a8aad1934ef0192ef1d6ff3f49e2e60700ac798cd45aa"
    );

    const receipt = {
      schemaVersion: 1,
      receiptId:
        "receipt:v1:32a8f33594dbecd25d9d26b4476b14405fceda4e47052cc6876927c104e20deb",
      commandId: command.commandId,
      payloadFingerprint: command.payloadFingerprint,
      resultFingerprint,
      patches: [patch],
      events: [event],
      revisions,
      inversePatches: [inversePatch],
    } as const satisfies CommandReceipt;
    expect(commandReceiptId(receipt)).toBe(receipt.receiptId);
  });
});

describe("Automation K1 strict codecs", () => {
  it("conforms, normalizes, copies, and deeply freezes a valid input", () => {
    const source = validInput();
    const decoded = decodeResolveCommandInput(source);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    expect(decoded.value).not.toBe(source);
    expect(decoded.value.world.resources.map(({ resourceId }) => resourceId)).toEqual([
      "resource:v1:focus",
      "resource:v1:secondary",
    ]);
    expect(Object.isFrozen(decoded.value)).toBe(true);
    expect(Object.isFrozen(decoded.value.world.resources)).toBe(true);
    expect(Object.isFrozen(decoded.value.world.resources[0])).toBe(true);
  });

  it("normalizes stable IDs by locale-independent code-unit order", () => {
    const input = validInput();
    input.world.resources = [
      { resourceId: "resource:v1:a_", current: 1, maximum: 1 },
      { resourceId: "resource:v1:a-", current: 1, maximum: 1 },
      { resourceId: "resource:v1:a.", current: 1, maximum: 1 },
    ];
    const decoded = decodeResolveCommandInput(input);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.world.resources.map(({ resourceId }) => resourceId)).toEqual([
      "resource:v1:a-",
      "resource:v1:a.",
      "resource:v1:a_",
    ]);
  });

  it.each([
    ["root", (input: ResolveCommandInput) => Object.assign(input, { rogue: true })],
    [
      "world",
      (input: ResolveCommandInput) => Object.assign(input.world, { rogue: true }),
    ],
    [
      "resource",
      (input: ResolveCommandInput) =>
        Object.assign(input.world.resources[0] ?? {}, { rogue: true }),
    ],
    [
      "rule",
      (input: ResolveCommandInput) =>
        Object.assign(input.ruleDefinition ?? {}, { rogue: true }),
    ],
    [
      "provenance",
      (input: ResolveCommandInput) =>
        input.ruleDefinition === null
          ? input
          : Object.assign(input.ruleDefinition.provenance, { rogue: true }),
    ],
    [
      "target",
      (input: ResolveCommandInput) =>
        input.ruleDefinition === null
          ? input
          : Object.assign(input.ruleDefinition.target, { rogue: true }),
    ],
    [
      "command",
      (input: ResolveCommandInput) => Object.assign(input.command, { rogue: true }),
    ],
    [
      "revision ref",
      (input: ResolveCommandInput) =>
        Object.assign(input.command.expectedRevision, { rogue: true }),
    ],
    [
      "external answers",
      (input: ResolveCommandInput) =>
        Object.assign(input.externalAnswers, { rogue: true }),
    ],
  ])("rejects an unknown %s field without a partial value", (_name, mutate) => {
    expect(decodeMutation(mutate)).toEqual({ ok: false, reason: "unknown-field" });
  });

  it("rejects unknown fields in every omitted request, answer, effect, and receipt subshape", () => {
    const requestId =
      "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const requestResults = [
      decodeExternalInputRequest({
        kind: "selected-targets",
        requestId,
        min: 1,
        max: 1,
        candidateIds: ["entity:v1:pc-a"],
        rogue: true,
      }),
      decodeExternalInputRequest({
        kind: "table-geometry",
        requestId,
        pairs: [{ fromId: "entity:v1:pc-a", toId: "entity:v1:pc-b" }],
        rogue: true,
      }),
      decodeExternalInputRequest({
        kind: "table-geometry",
        requestId,
        pairs: [{ fromId: "entity:v1:pc-a", toId: "entity:v1:pc-b", rogue: true }],
      }),
      decodeExternalInputRequest({
        kind: "observed-outcome",
        requestId,
        valueType: "integer",
        minimum: 1,
        maximum: 20,
        allowedIds: [],
        rogue: true,
      }),
      decodeExternalInputRequest({
        kind: "ruling",
        requestId,
        rulingIds: ["ruling:v1:cover"],
        rogue: true,
      }),
    ];
    const answerResults = [
      decodeExternalAnswer({
        kind: "selected-targets",
        requestId,
        targetIds: ["entity:v1:pc-a"],
        rogue: true,
      }),
      decodeExternalAnswer({
        kind: "table-geometry",
        requestId,
        distances: [{ fromId: "entity:v1:pc-a", toId: "entity:v1:pc-b", feet: 30 }],
        rogue: true,
      }),
      decodeExternalAnswer({
        kind: "table-geometry",
        requestId,
        distances: [
          {
            fromId: "entity:v1:pc-a",
            toId: "entity:v1:pc-b",
            feet: 30,
            rogue: true,
          },
        ],
      }),
      decodeExternalAnswer({
        kind: "observed-outcome",
        requestId,
        value: 17,
        rogue: true,
      }),
      decodeExternalAnswer({
        kind: "ruling",
        requestId,
        rulingId: "ruling:v1:cover",
        accepted: true,
        rogue: true,
      }),
    ];

    const baseEffect = {
      schemaVersion: 1,
      effectId: "effect:v1:focus",
      ruleId: "rule:v1:focus",
      ruleVersion: 1,
      ruleFingerprint: RULE_FINGERPRINT,
      sourceId: "entity:v1:pc-a",
      targetId: "entity:v1:pc-b",
      appliedByCommandId: "cmd:v1:k-spend-001",
      startedAt: { stateId: "state:v1:pc-a", revision: 7 },
    } as const;
    const effectWith = (duration: EffectInstance["duration"]): EffectInstance => ({
      ...baseEffect,
      duration,
    });
    const effectResults = [
      decodeMutation((input) => {
        const effect = effectWith({ kind: "until-dismissed" });
        Object.assign(effect, { rogue: true });
        input.world.effects = [effect];
        return input;
      }),
      decodeMutation((input) => {
        const effect = effectWith({ kind: "until-dismissed" });
        Object.assign(effect.duration, { rogue: true });
        input.world.effects = [effect];
        return input;
      }),
      decodeMutation((input) => {
        const effect = effectWith({ kind: "until-rest", rest: "short" });
        Object.assign(effect.duration, { rogue: true });
        input.world.effects = [effect];
        return input;
      }),
      decodeMutation((input) => {
        const effect = effectWith({
          kind: "until-revision",
          stateId: "state:v1:pc-a",
          revision: 8,
        });
        Object.assign(effect.duration, { rogue: true });
        input.world.effects = [effect];
        return input;
      }),
    ];

    const selectedTarget = validInput();
    selectedTarget.ruleDefinition = {
      ...rule,
      target: {
        kind: "selected-targets",
        min: 1,
        max: 1,
        candidateIds: ["entity:v1:pc-a"],
      },
    };
    Object.assign(selectedTarget.ruleDefinition.target, { rogue: true });

    const undoCommand = undoInput(COMMITTED_RECEIPT, {
      commandId: "cmd:v1:k-undo-001",
      payloadFingerprint:
        "fp:v1:79ac12f07582c7cab58a522e0d9c2bcc77d9c8f47ce403206552a8fab22bd230",
      revision: 8,
      current: 1,
    });
    Object.assign(undoCommand.command, { rogue: true });

    const receiptRoot = structuredClone(COMMITTED_RECEIPT) as CommandReceipt;
    Object.assign(receiptRoot, { rogue: true });
    const receiptPatch = structuredClone(COMMITTED_RECEIPT) as CommandReceipt;
    Object.assign(receiptPatch.patches[0] ?? {}, { rogue: true });
    const receiptInverse = structuredClone(COMMITTED_RECEIPT) as CommandReceipt;
    Object.assign(receiptInverse.inversePatches[0] ?? {}, { rogue: true });
    const receiptEvent = structuredClone(COMMITTED_RECEIPT) as CommandReceipt;
    Object.assign(receiptEvent.events[0] ?? {}, { rogue: true });
    const receiptRevision = structuredClone(COMMITTED_RECEIPT) as CommandReceipt;
    Object.assign(receiptRevision.revisions[0] ?? {}, { rogue: true });
    const undoReceipt = undoInput(structuredClone(COMMITTED_RECEIPT), {
      commandId: "cmd:v1:k-undo-001",
      payloadFingerprint:
        "fp:v1:79ac12f07582c7cab58a522e0d9c2bcc77d9c8f47ce403206552a8fab22bd230",
      revision: 8,
      current: 1,
    });
    if (undoReceipt.command.kind === "undo-receipt") {
      Object.assign(undoReceipt.command.receipt, { rogue: true });
    }

    const namedResults = [
      ...requestResults.map((result, index) => [`request-${index}`, result] as const),
      ...answerResults.map((result, index) => [`answer-${index}`, result] as const),
      ...effectResults.map((result, index) => [`effect-${index}`, result] as const),
      ["selected-target", decodeResolveCommandInput(selectedTarget)] as const,
      ["undo-command", decodeResolveCommandInput(undoCommand)] as const,
      ["undo-receipt", decodeResolveCommandInput(undoReceipt)] as const,
      ["receipt-root", decodeCommandReceipt(receiptRoot)] as const,
      ["receipt-patch", decodeCommandReceipt(receiptPatch)] as const,
      ["receipt-inverse", decodeCommandReceipt(receiptInverse)] as const,
      ["receipt-event", decodeCommandReceipt(receiptEvent)] as const,
      ["receipt-revision", decodeCommandReceipt(receiptRevision)] as const,
    ];

    expect(namedResults).toEqual(
      namedResults.map(([name]) => [name, { ok: false, reason: "unknown-field" }])
    );
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative zero", -0],
    ["fraction", 1.5],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
    ["negative", -1],
  ])("rejects an invalid world revision: %s", (_name, revision) => {
    expect(
      decodeMutation((input) => {
        input.world.revision = revision;
        return input;
      })
    ).toEqual({ ok: false, reason: "invalid-number" });
  });

  it("rejects negative zero inside otherwise-valid serializable choices", () => {
    expect(
      decodeMutation((input) => {
        if (input.command.kind === "use-rule") input.command.choices = { hostile: -0 };
        return input;
      })
    ).toEqual({ ok: false, reason: "invalid-number" });
  });

  it.each([
    ["revision upper fence", Number.MAX_SAFE_INTEGER],
    ["resource current negative", -1],
    ["resource maximum unsafe", Number.MAX_SAFE_INTEGER + 1],
    ["resource current exceeds maximum", 4],
    ["rule amount zero", 0],
    ["rule version zero", 0],
    ["source version zero", 0],
  ])("rejects numeric domain violation: %s", (name, value) => {
    const result = decodeMutation((input) => {
      const resource = input.world.resources[0];
      if (resource === undefined || input.ruleDefinition === null) return input;
      switch (name) {
        case "revision upper fence":
          input.world.revision = value;
          break;
        case "resource current negative":
        case "resource current exceeds maximum":
          resource.current = value;
          break;
        case "resource maximum unsafe":
          resource.maximum = value;
          break;
        case "rule amount zero":
          input.ruleDefinition.amount = value;
          break;
        case "rule version zero":
          input.ruleDefinition.ruleVersion = value;
          break;
        case "source version zero":
          input.ruleDefinition.provenance.sourceVersion = value;
          break;
      }
      return input;
    });
    expect(result).toEqual({ ok: false, reason: "invalid-number" });
  });

  it.each([
    [
      "command",
      (input: ResolveCommandInput) => ({ ...input.command, commandId: "cmd:v2:x" }),
    ],
    [
      "state",
      (input: ResolveCommandInput) => ({ ...input.world, stateId: "state:v1:UPPER" }),
    ],
    [
      "entity",
      (input: ResolveCommandInput) => ({ ...input.command, actorId: "entity:v1:" }),
    ],
    [
      "resource",
      (input: ResolveCommandInput) => ({
        ...(input.world.resources[0] ?? {}),
        resourceId: "resource:v1:a/b",
      }),
    ],
    [
      "fingerprint",
      (input: ResolveCommandInput) => ({
        ...input.command,
        payloadFingerprint: "fp:v1:1234",
      }),
    ],
  ])("rejects a malformed %s ID", (name, invalidPart) => {
    const input = validInput();
    const invalid = (() => {
      switch (name) {
        case "state":
          return { ...input, world: invalidPart(input) };
        case "resource":
          return { ...input, world: { ...input.world, resources: [invalidPart(input)] } };
        default:
          return { ...input, command: invalidPart(input) };
      }
    })();
    expect(decodeResolveCommandInput(invalid)).toEqual({
      ok: false,
      reason: "invalid-id",
    });
  });

  it("rejects duplicate normalized resources and answers", () => {
    expect(
      decodeMutation((input) => {
        input.world.resources = [
          { resourceId: "resource:v1:focus", current: 2, maximum: 2 },
          { resourceId: "resource:v1:focus", current: 1, maximum: 2 },
        ];
        return input;
      })
    ).toEqual({ ok: false, reason: "duplicate-id" });

    expect(
      decodeMutation((input) => {
        input.externalAnswers = {
          schemaVersion: 1,
          values: [
            {
              kind: "ruling",
              requestId:
                "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              rulingId: "ruling:v1:cover",
              accepted: true,
            },
            {
              kind: "ruling",
              requestId:
                "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              rulingId: "ruling:v1:cover",
              accepted: false,
            },
          ],
        };
        return input;
      })
    ).toEqual({ ok: false, reason: "duplicate-id" });
  });

  it("rejects unknown command and rule kinds closed", () => {
    const input = validInput();
    expect(
      decodeResolveCommandInput({
        ...input,
        command: { ...input.command, kind: "future-command" },
      })
    ).toEqual({ ok: false, reason: "unknown-command-kind" });
    expect(
      decodeResolveCommandInput({
        ...input,
        ruleDefinition: { ...input.ruleDefinition, kind: "future-rule" },
      })
    ).toEqual({ ok: false, reason: "unknown-rule-kind" });
  });

  it("rejects oversized, over-deep, and over-complex inputs with distinct reasons", () => {
    expect(
      decodeMutation((input) => {
        const choices: Record<string, string> = {};
        for (let index = 0; index < 80; index += 1)
          choices[`k${index}`] = "x".repeat(1_000);
        if (input.command.kind === "use-rule") input.command.choices = choices;
        return input;
      })
    ).toEqual({ ok: false, reason: "command-too-large" });

    expect(
      decodeMutation((input) => {
        let nested: Record<string, SerializableValue> = {};
        for (let index = 0; index < 40; index += 1) nested = { nested };
        if (input.command.kind === "use-rule") input.command.choices = nested;
        return input;
      })
    ).toEqual({ ok: false, reason: "command-too-deep" });

    expect(
      decodeMutation((input) => {
        const choices: Record<string, number> = {};
        for (let index = 0; index < 4_097; index += 1) choices[`k${index}`] = index;
        if (input.command.kind === "use-rule") input.command.choices = choices;
        return input;
      })
    ).toEqual({ ok: false, reason: "command-too-complex" });

    expect(
      decodeMutation((input) => {
        if (input.command.kind === "use-rule")
          input.command.choices = { value: "x".repeat(1_025) };
        return input;
      })
    ).toEqual({ ok: false, reason: "command-too-complex" });

    expect(
      decodeMutation((input) => {
        if (input.command.kind === "use-rule")
          input.command.choices = { values: Array(257).fill(0) };
        return input;
      })
    ).toEqual({ ok: false, reason: "command-too-complex" });
  });

  it("rejects hostile object shapes before reading attacker-controlled values", () => {
    const getter = validInput();
    Object.defineProperty(getter, "mode", { enumerable: true, get: () => "commit" });
    expect(decodeResolveCommandInput(getter)).toEqual({
      ok: false,
      reason: "invalid-input",
    });

    const sparse = validInput();
    const sparseValues = Array<number>(2);
    sparseValues[1] = 1;
    if (sparse.command.kind === "use-rule")
      sparse.command.choices = { values: sparseValues };
    expect(decodeResolveCommandInput(sparse)).toEqual({
      ok: false,
      reason: "invalid-input",
    });

    const cyclic = validInput();
    if (cyclic.command.kind === "use-rule") {
      const cycle: Record<string, SerializableValue> = {};
      cycle.self = cycle;
      cyclic.command.choices = cycle;
    }
    expect(decodeResolveCommandInput(cyclic)).toEqual({
      ok: false,
      reason: "invalid-input",
    });

    const symbol = validInput();
    Object.assign(symbol, { [Symbol("hostile")]: true });
    expect(decodeResolveCommandInput(symbol)).toEqual({
      ok: false,
      reason: "invalid-input",
    });

    const unsafe = validInput();
    Object.defineProperty(unsafe, "__proto__", {
      enumerable: true,
      configurable: true,
      value: null,
    });
    expect(decodeResolveCommandInput(unsafe)).toEqual({
      ok: false,
      reason: "invalid-input",
    });

    const exotic = validInput();
    if (exotic.command.kind === "use-rule") {
      exotic.command.choices = Object.create(null) as Record<string, never>;
    }
    expect(decodeResolveCommandInput(exotic)).toEqual({
      ok: false,
      reason: "invalid-input",
    });
  });

  it("freezes all four exact external request variants", () => {
    const requests = [
      {
        kind: "selected-targets",
        requestId:
          "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        min: 1,
        max: 2,
        candidateIds: ["entity:v1:pc-b", "entity:v1:pc-a"],
      },
      {
        kind: "table-geometry",
        requestId:
          "req:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        pairs: [
          { fromId: "entity:v1:pc-b", toId: "entity:v1:pc-c" },
          { fromId: "entity:v1:pc-a", toId: "entity:v1:pc-c" },
        ],
      },
      {
        kind: "observed-outcome",
        requestId:
          "req:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        valueType: "integer",
        minimum: 1,
        maximum: 20,
        allowedIds: [],
      },
      {
        kind: "ruling",
        requestId:
          "req:v1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        rulingIds: ["ruling:v1:obscured", "ruling:v1:cover"],
      },
    ];

    for (const request of requests) {
      const decoded = decodeExternalInputRequest(request);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) expect(Object.isFrozen(decoded.value)).toBe(true);
    }
  });

  it("enforces request bounds, uniqueness, geometry, and observed-outcome domains", () => {
    expect(
      decodeExternalInputRequest({
        kind: "selected-targets",
        requestId:
          "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        min: 2,
        max: 1,
        candidateIds: ["entity:v1:pc-a"],
      })
    ).toEqual({ ok: false, reason: "invalid-number" });
    expect(
      decodeExternalInputRequest({
        kind: "table-geometry",
        requestId:
          "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        pairs: [
          { fromId: "entity:v1:pc-a", toId: "entity:v1:pc-b" },
          { fromId: "entity:v1:pc-a", toId: "entity:v1:pc-b" },
        ],
      })
    ).toEqual({ ok: false, reason: "duplicate-id" });
    expect(
      decodeExternalInputRequest({
        kind: "observed-outcome",
        requestId:
          "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        valueType: "boolean",
        minimum: 0,
        maximum: null,
        allowedIds: [],
      })
    ).toEqual({ ok: false, reason: "invalid-number" });
    expect(
      decodeExternalInputRequest({
        kind: "observed-outcome",
        requestId:
          "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        valueType: "stable-id",
        minimum: null,
        maximum: null,
        allowedIds: [],
      })
    ).toEqual({ ok: false, reason: "invalid-number" });
  });

  it("accepts the full safe-integer domain for observed outcomes", () => {
    expect(
      decodeExternalInputRequest({
        kind: "observed-outcome",
        requestId:
          "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        valueType: "integer",
        minimum: -Number.MAX_SAFE_INTEGER,
        maximum: Number.MAX_SAFE_INTEGER,
        allowedIds: [],
      }).ok
    ).toBe(true);
    expect(
      decodeExternalAnswer({
        kind: "observed-outcome",
        requestId:
          "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        value: Number.MAX_SAFE_INTEGER,
      }).ok
    ).toBe(true);
  });

  it("classifies every omitted request, answer, effect, receipt, and undo numeric fence", () => {
    const requestId =
      "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const classify = (
      result:
        | { readonly ok: true; readonly value: unknown }
        | { readonly ok: false; readonly reason: string }
    ): string => (result.ok ? "ok" : result.reason);
    const receiptWith = (mutate: (candidate: CommandReceipt) => void): CommandReceipt => {
      const candidate = structuredClone(COMMITTED_RECEIPT) as CommandReceipt;
      mutate(candidate);
      return candidate;
    };
    const selectedTarget = validInput();
    selectedTarget.ruleDefinition = {
      ...rule,
      target: {
        kind: "selected-targets",
        min: 0,
        max: 1,
        candidateIds: ["entity:v1:pc-a"],
      },
    };
    const effectRuleVersion = validInput();
    effectRuleVersion.world.effects = [
      {
        schemaVersion: 1,
        effectId: "effect:v1:focus",
        ruleId: "rule:v1:focus",
        ruleVersion: 0,
        ruleFingerprint: RULE_FINGERPRINT,
        sourceId: "entity:v1:pc-a",
        targetId: "entity:v1:pc-b",
        appliedByCommandId: "cmd:v1:k-spend-001",
        startedAt: { stateId: "state:v1:pc-a", revision: 7 },
        duration: { kind: "until-dismissed" },
      },
    ];
    const effectRevision = structuredClone(effectRuleVersion);
    const effect = effectRevision.world.effects[0];
    if (effect === undefined) throw new TypeError("Missing effect numeric fixture");
    effect.ruleVersion = 1;
    effect.startedAt.revision = Number.MAX_SAFE_INTEGER;
    const undoRevision = undoInput(COMMITTED_RECEIPT, {
      commandId: "cmd:v1:k-undo-001",
      payloadFingerprint:
        "fp:v1:79ac12f07582c7cab58a522e0d9c2bcc77d9c8f47ce403206552a8fab22bd230",
      revision: 8,
      current: 1,
    });
    undoRevision.command.expectedRevision.revision = Number.MAX_SAFE_INTEGER;

    const cases = [
      ["selected-target min", decodeResolveCommandInput(selectedTarget)],
      [
        "selected request min",
        decodeExternalInputRequest({
          kind: "selected-targets",
          requestId,
          min: 0,
          max: 1,
          candidateIds: ["entity:v1:pc-a"],
        }),
      ],
      [
        "selected request max",
        decodeExternalInputRequest({
          kind: "selected-targets",
          requestId,
          min: 1,
          max: 33,
          candidateIds: ["entity:v1:pc-a"],
        }),
      ],
      [
        "observed request interval",
        decodeExternalInputRequest({
          kind: "observed-outcome",
          requestId,
          valueType: "integer",
          minimum: 2,
          maximum: 1,
          allowedIds: [],
        }),
      ],
      [
        "ruling request cardinality",
        decodeExternalInputRequest({
          kind: "ruling",
          requestId,
          rulingIds: [],
        }),
      ],
      [
        "selected answer cardinality",
        decodeExternalAnswer({
          kind: "selected-targets",
          requestId,
          targetIds: [],
        }),
      ],
      [
        "selected answer upper fence",
        decodeExternalAnswer({
          kind: "selected-targets",
          requestId,
          targetIds: Array.from({ length: 33 }, (_, index) => `entity:v1:pc-${index}`),
        }),
      ],
      [
        "geometry negative",
        decodeExternalAnswer({
          kind: "table-geometry",
          requestId,
          distances: [{ fromId: "entity:v1:pc-a", toId: "entity:v1:pc-b", feet: -1 }],
        }),
      ],
      [
        "geometry fraction",
        decodeExternalAnswer({
          kind: "table-geometry",
          requestId,
          distances: [{ fromId: "entity:v1:pc-a", toId: "entity:v1:pc-b", feet: 1.5 }],
        }),
      ],
      [
        "geometry above upper fence",
        decodeExternalAnswer({
          kind: "table-geometry",
          requestId,
          distances: [
            {
              fromId: "entity:v1:pc-a",
              toId: "entity:v1:pc-b",
              feet: 1_000_001,
            },
          ],
        }),
      ],
      [
        "geometry upper fence",
        decodeExternalAnswer({
          kind: "table-geometry",
          requestId,
          distances: [
            {
              fromId: "entity:v1:pc-a",
              toId: "entity:v1:pc-b",
              feet: 1_000_000,
            },
          ],
        }),
      ],
      ["effect rule version", decodeResolveCommandInput(effectRuleVersion)],
      ["effect revision", decodeResolveCommandInput(effectRevision)],
      [
        "patch NaN",
        decodeCommandReceipt(
          receiptWith((candidate) => {
            const entry = candidate.patches[0];
            if (entry !== undefined) entry.before = Number.NaN;
          })
        ),
      ],
      [
        "patch negative zero",
        decodeCommandReceipt(
          receiptWith((candidate) => {
            const entry = candidate.patches[0];
            if (entry !== undefined) entry.after = -0;
          })
        ),
      ],
      [
        "patch unsafe integer",
        decodeCommandReceipt(
          receiptWith((candidate) => {
            const entry = candidate.patches[0];
            if (entry !== undefined) entry.after = Number.MAX_SAFE_INTEGER + 1;
          })
        ),
      ],
      [
        "event amount",
        decodeCommandReceipt(
          receiptWith((candidate) => {
            const entry = candidate.events[0];
            if (entry !== undefined) entry.amount = 0;
          })
        ),
      ],
      [
        "revision upper fence",
        decodeCommandReceipt(
          receiptWith((candidate) => {
            const entry = candidate.revisions[0];
            if (entry !== undefined) entry.before = Number.MAX_SAFE_INTEGER;
          })
        ),
      ],
      ["undo expected revision", decodeResolveCommandInput(undoRevision)],
    ] as const;

    expect(cases.map(([name, result]) => [name, classify(result)])).toEqual([
      ["selected-target min", "invalid-number"],
      ["selected request min", "invalid-number"],
      ["selected request max", "invalid-number"],
      ["observed request interval", "invalid-number"],
      ["ruling request cardinality", "invalid-number"],
      ["selected answer cardinality", "invalid-number"],
      ["selected answer upper fence", "invalid-number"],
      ["geometry negative", "invalid-number"],
      ["geometry fraction", "invalid-number"],
      ["geometry above upper fence", "invalid-number"],
      ["geometry upper fence", "ok"],
      ["effect rule version", "invalid-number"],
      ["effect revision", "invalid-number"],
      ["patch NaN", "invalid-number"],
      ["patch negative zero", "invalid-number"],
      ["patch unsafe integer", "invalid-number"],
      ["event amount", "invalid-number"],
      ["revision upper fence", "invalid-number"],
      ["undo expected revision", "invalid-number"],
    ]);
  });

  it("freezes all four exact answers and rejects malformed answer kinds", () => {
    const answers = [
      {
        kind: "selected-targets",
        requestId:
          "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        targetIds: ["entity:v1:pc-b", "entity:v1:pc-a"],
      },
      {
        kind: "table-geometry",
        requestId:
          "req:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        distances: [{ fromId: "entity:v1:pc-a", toId: "entity:v1:pc-b", feet: 30 }],
      },
      {
        kind: "observed-outcome",
        requestId:
          "req:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        value: 17,
      },
      {
        kind: "ruling",
        requestId:
          "req:v1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        rulingId: "ruling:v1:cover",
        accepted: true,
      },
    ];
    for (const answer of answers) expect(decodeExternalAnswer(answer).ok).toBe(true);
    expect(
      decodeExternalAnswer({
        kind: "future-answer",
        requestId:
          "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      })
    ).toEqual({ ok: false, reason: "invalid-external-answers" });
  });

  it("conforms and normalizes every exact EffectInstance duration", () => {
    const input = validInput();
    input.world.effects = [
      {
        schemaVersion: 1,
        effectId: "effect:v1:z-until-revision",
        ruleId: "rule:v1:focus",
        ruleVersion: 1,
        ruleFingerprint: RULE_FINGERPRINT,
        sourceId: "entity:v1:pc-a",
        targetId: "entity:v1:pc-b",
        appliedByCommandId: "cmd:v1:k-spend-001",
        startedAt: { stateId: "state:v1:pc-a", revision: 7 },
        duration: { kind: "until-revision", stateId: "state:v1:pc-a", revision: 8 },
      },
      {
        schemaVersion: 1,
        effectId: "effect:v1:y-until-rest",
        ruleId: "rule:v1:focus",
        ruleVersion: 1,
        ruleFingerprint: RULE_FINGERPRINT,
        sourceId: "entity:v1:pc-a",
        targetId: "entity:v1:pc-b",
        appliedByCommandId: "cmd:v1:k-spend-001",
        startedAt: { stateId: "state:v1:pc-a", revision: 7 },
        duration: { kind: "until-rest", rest: "short" },
      },
      {
        schemaVersion: 1,
        effectId: "effect:v1:x-until-dismissed",
        ruleId: "rule:v1:focus",
        ruleVersion: 1,
        ruleFingerprint: RULE_FINGERPRINT,
        sourceId: "entity:v1:pc-a",
        targetId: "entity:v1:pc-b",
        appliedByCommandId: "cmd:v1:k-spend-001",
        startedAt: { stateId: "state:v1:pc-a", revision: 7 },
        duration: { kind: "until-dismissed" },
      },
    ];
    const decoded = decodeResolveCommandInput(input);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(
      decoded.value.world.effects.map(({ effectId, duration }) => ({
        effectId,
        duration,
      }))
    ).toEqual([
      { effectId: "effect:v1:x-until-dismissed", duration: { kind: "until-dismissed" } },
      {
        effectId: "effect:v1:y-until-rest",
        duration: { kind: "until-rest", rest: "short" },
      },
      {
        effectId: "effect:v1:z-until-revision",
        duration: { kind: "until-revision", stateId: "state:v1:pc-a", revision: 8 },
      },
    ]);
  });

  it("rejects an invalid EffectInstance revision endpoint and state", () => {
    const baseEffect: EffectInstance = {
      schemaVersion: 1,
      effectId: "effect:v1:focus",
      ruleId: "rule:v1:focus",
      ruleVersion: 1,
      ruleFingerprint: RULE_FINGERPRINT,
      sourceId: "entity:v1:pc-a",
      targetId: "entity:v1:pc-b",
      appliedByCommandId: "cmd:v1:k-spend-001",
      startedAt: { stateId: "state:v1:pc-a", revision: 7 },
      duration: { kind: "until-revision", stateId: "state:v1:pc-a", revision: 8 },
    };
    expect(
      decodeMutation((input) => {
        input.world.effects = [
          {
            ...baseEffect,
            duration: { kind: "until-revision", stateId: "state:v1:pc-a", revision: 7 },
          },
        ];
        return input;
      })
    ).toEqual({ ok: false, reason: "invalid-number" });
    expect(
      decodeMutation((input) => {
        input.world.effects = [
          {
            ...baseEffect,
            duration: {
              kind: "until-revision",
              stateId: "state:v1:elsewhere",
              revision: 8,
            },
          },
        ];
        return input;
      })
    ).toEqual({ ok: false, reason: "state-mismatch" });
  });

  it("normalizes every ID-set by code units while preserving receipt sequence", () => {
    const requestId =
      "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const selectedRule = validInput();
    selectedRule.ruleDefinition = {
      ...rule,
      fingerprint:
        "fp:v1:2c7af036ba5e7a36cbf3bd60dbb1e28a49f3643de858be569657b1cb1c983bc5",
      target: {
        kind: "selected-targets",
        min: 1,
        max: 1,
        candidateIds: ["entity:v1:pc-b", "entity:v1:pc-a"],
      },
    };
    const externalAnswers = validInput();
    externalAnswers.externalAnswers = {
      schemaVersion: 1,
      values: [
        {
          kind: "ruling",
          requestId:
            "req:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          rulingId: "ruling:v1:cover",
          accepted: true,
        },
        {
          kind: "ruling",
          requestId,
          rulingId: "ruling:v1:cover",
          accepted: true,
        },
      ],
    };
    const effects = validInput();
    effects.world.effects = [
      {
        schemaVersion: 1,
        effectId: "effect:v1:z",
        ruleId: "rule:v1:focus",
        ruleVersion: 1,
        ruleFingerprint: RULE_FINGERPRINT,
        sourceId: "entity:v1:pc-a",
        targetId: "entity:v1:pc-b",
        appliedByCommandId: "cmd:v1:k-spend-001",
        startedAt: { stateId: "state:v1:pc-a", revision: 7 },
        duration: { kind: "until-dismissed" },
      },
      {
        schemaVersion: 1,
        effectId: "effect:v1:a",
        ruleId: "rule:v1:focus",
        ruleVersion: 1,
        ruleFingerprint: RULE_FINGERPRINT,
        sourceId: "entity:v1:pc-a",
        targetId: "entity:v1:pc-b",
        appliedByCommandId: "cmd:v1:k-spend-001",
        startedAt: { stateId: "state:v1:pc-a", revision: 7 },
        duration: { kind: "until-dismissed" },
      },
    ];

    const selectedRuleDecoded = decodeResolveCommandInput(selectedRule);
    const selectedRequestDecoded = decodeExternalInputRequest({
      kind: "selected-targets",
      requestId,
      min: 1,
      max: 2,
      candidateIds: ["entity:v1:pc-b", "entity:v1:pc-a"],
    });
    const geometryRequestDecoded = decodeExternalInputRequest({
      kind: "table-geometry",
      requestId,
      pairs: [
        { fromId: "entity:v1:pc-b", toId: "entity:v1:pc-c" },
        { fromId: "entity:v1:pc-a", toId: "entity:v1:pc-c" },
      ],
    });
    const observedRequestDecoded = decodeExternalInputRequest({
      kind: "observed-outcome",
      requestId,
      valueType: "stable-id",
      minimum: null,
      maximum: null,
      allowedIds: ["source:v1:z", "source:v1:a"],
    });
    const rulingRequestDecoded = decodeExternalInputRequest({
      kind: "ruling",
      requestId,
      rulingIds: ["ruling:v1:obscured", "ruling:v1:cover"],
    });
    const selectedAnswerDecoded = decodeExternalAnswer({
      kind: "selected-targets",
      requestId,
      targetIds: ["entity:v1:pc-b", "entity:v1:pc-a"],
    });
    const geometryAnswerDecoded = decodeExternalAnswer({
      kind: "table-geometry",
      requestId,
      distances: [
        { fromId: "entity:v1:pc-b", toId: "entity:v1:pc-c", feet: 20 },
        { fromId: "entity:v1:pc-a", toId: "entity:v1:pc-c", feet: 30 },
      ],
    });
    const externalAnswersDecoded = decodeResolveCommandInput(externalAnswers);
    const effectsDecoded = decodeResolveCommandInput(effects);
    const receiptDecoded = decodeCommandReceipt(REVERSE_ORDER_RECEIPT);
    const undoDecoded = decodeResolveCommandInput(
      undoInput(REVERSE_ORDER_RECEIPT, {
        commandId: "cmd:v1:k-order-undo",
        payloadFingerprint:
          "fp:v1:7393f918fa1b2ddacd4ef724edc3ea2da7f4f1decd3b4e2f1acfbf04101de9be",
        revision: 8,
        current: 1,
      })
    );
    if (
      !selectedRuleDecoded.ok ||
      !selectedRequestDecoded.ok ||
      selectedRequestDecoded.value.kind !== "selected-targets" ||
      !geometryRequestDecoded.ok ||
      geometryRequestDecoded.value.kind !== "table-geometry" ||
      !observedRequestDecoded.ok ||
      observedRequestDecoded.value.kind !== "observed-outcome" ||
      !rulingRequestDecoded.ok ||
      rulingRequestDecoded.value.kind !== "ruling" ||
      !selectedAnswerDecoded.ok ||
      selectedAnswerDecoded.value.kind !== "selected-targets" ||
      !geometryAnswerDecoded.ok ||
      geometryAnswerDecoded.value.kind !== "table-geometry" ||
      !externalAnswersDecoded.ok ||
      !effectsDecoded.ok ||
      !receiptDecoded.ok ||
      !undoDecoded.ok ||
      undoDecoded.value.command.kind !== "undo-receipt"
    ) {
      const decodeStates = {
        selectedRule: selectedRuleDecoded.ok ? "ok" : selectedRuleDecoded.reason,
        selectedRequest: selectedRequestDecoded.ok
          ? selectedRequestDecoded.value.kind
          : selectedRequestDecoded.reason,
        geometryRequest: geometryRequestDecoded.ok
          ? geometryRequestDecoded.value.kind
          : geometryRequestDecoded.reason,
        observedRequest: observedRequestDecoded.ok
          ? observedRequestDecoded.value.kind
          : observedRequestDecoded.reason,
        rulingRequest: rulingRequestDecoded.ok
          ? rulingRequestDecoded.value.kind
          : rulingRequestDecoded.reason,
        selectedAnswer: selectedAnswerDecoded.ok
          ? selectedAnswerDecoded.value.kind
          : selectedAnswerDecoded.reason,
        geometryAnswer: geometryAnswerDecoded.ok
          ? geometryAnswerDecoded.value.kind
          : geometryAnswerDecoded.reason,
        externalAnswers: externalAnswersDecoded.ok ? "ok" : externalAnswersDecoded.reason,
        effects: effectsDecoded.ok ? "ok" : effectsDecoded.reason,
        receipt: receiptDecoded.ok ? "ok" : receiptDecoded.reason,
        undo: undoDecoded.ok ? undoDecoded.value.command.kind : undoDecoded.reason,
      };
      throw new TypeError(
        `Ordering fixture failed to decode: ${canonicalJson(decodeStates)}`
      );
    }

    expect({
      selectedRule:
        selectedRuleDecoded.value.ruleDefinition?.target.kind === "selected-targets"
          ? selectedRuleDecoded.value.ruleDefinition.target.candidateIds
          : [],
      selectedRequest: selectedRequestDecoded.value.candidateIds,
      geometryRequest: geometryRequestDecoded.value.pairs.map(
        ({ fromId, toId }) => `${fromId}->${toId}`
      ),
      observedRequest: observedRequestDecoded.value.allowedIds,
      rulingRequest: rulingRequestDecoded.value.rulingIds,
      selectedAnswer: selectedAnswerDecoded.value.targetIds,
      geometryAnswer: geometryAnswerDecoded.value.distances.map(
        ({ fromId, toId }) => `${fromId}->${toId}`
      ),
      externalAnswers: externalAnswersDecoded.value.externalAnswers.values.map(
        ({ requestId: answerRequestId }) => answerRequestId
      ),
      effects: effectsDecoded.value.world.effects.map(({ effectId }) => effectId),
      receiptPatches: receiptDecoded.value.patches.map(({ resourceId }) => resourceId),
      receiptEvents: receiptDecoded.value.events.map(({ resourceId }) => resourceId),
      receiptInverse: receiptDecoded.value.inversePatches.map(
        ({ resourceId }) => resourceId
      ),
      undoReceipt: undoDecoded.value.command.receipt.patches.map(
        ({ resourceId }) => resourceId
      ),
      receiptFrozen: [
        Object.isFrozen(receiptDecoded.value),
        Object.isFrozen(receiptDecoded.value.patches),
        Object.isFrozen(receiptDecoded.value.patches[0]),
      ],
    }).toEqual({
      selectedRule: ["entity:v1:pc-a", "entity:v1:pc-b"],
      selectedRequest: ["entity:v1:pc-a", "entity:v1:pc-b"],
      geometryRequest: [
        "entity:v1:pc-a->entity:v1:pc-c",
        "entity:v1:pc-b->entity:v1:pc-c",
      ],
      observedRequest: ["source:v1:a", "source:v1:z"],
      rulingRequest: ["ruling:v1:cover", "ruling:v1:obscured"],
      selectedAnswer: ["entity:v1:pc-a", "entity:v1:pc-b"],
      geometryAnswer: [
        "entity:v1:pc-a->entity:v1:pc-c",
        "entity:v1:pc-b->entity:v1:pc-c",
      ],
      externalAnswers: [
        "req:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "req:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ],
      effects: ["effect:v1:a", "effect:v1:z"],
      receiptPatches: ["resource:v1:secondary", "resource:v1:focus"],
      receiptEvents: ["resource:v1:secondary", "resource:v1:focus"],
      receiptInverse: ["resource:v1:secondary", "resource:v1:focus"],
      undoReceipt: ["resource:v1:secondary", "resource:v1:focus"],
      receiptFrozen: [true, true, true],
    });
  });
});

describe("Automation K1 resolution outcomes", () => {
  const expectedFacts = {
    commandId: "cmd:v1:k-spend-001",
    payloadFingerprint: PAYLOAD_FINGERPRINT,
    resultFingerprint:
      "fp:v1:f8715c4b5c066fecd99a8aad1934ef0192ef1d6ff3f49e2e60700ac798cd45aa",
    patches: [patch],
    events: [event],
    revisions,
  } as const;

  it("rejects revision mismatch and insufficient resource without partial output", () => {
    expect(
      resolveCommand({
        ...validInput(),
        world: { ...validInput().world, revision: 8 },
      })
    ).toEqual({ status: "rejected", reason: "revision-mismatch" });

    const insufficient = validInput();
    insufficient.world.resources = insufficient.world.resources.map((resource) =>
      resource.resourceId === "resource:v1:focus" ? { ...resource, current: 0 } : resource
    );
    expect(resolveCommand(insufficient)).toEqual({
      status: "rejected",
      reason: "insufficient-resource",
    });
  });

  it("rejects forged command and rule fingerprint claims", () => {
    const commandClaim = validInput();
    commandClaim.command.payloadFingerprint =
      "fp:v1:cee46e2e539a8be343d56388010b4413e0dc925c4268f2fc1d67c8434f06512c";
    expect(resolveCommand(commandClaim)).toEqual({
      status: "rejected",
      reason: "command-payload-mismatch",
    });

    const ruleClaim = validInput();
    if (ruleClaim.ruleDefinition !== null) {
      ruleClaim.ruleDefinition.fingerprint =
        "fp:v1:3d3679aef6e0579da41a2ff60efe7d75b2a2f96bada08799f30d69fba09dca01";
    }
    expect(resolveCommand(ruleClaim)).toEqual({
      status: "rejected",
      reason: "rule-fingerprint-mismatch",
    });
  });

  it("rejects state, rule-reference, and missing-resource mismatches", () => {
    const stateMismatch = validInput();
    stateMismatch.world.stateId = "state:v1:elsewhere";
    expect(resolveCommand(stateMismatch)).toEqual({
      status: "rejected",
      reason: "state-mismatch",
    });

    const ruleReference = validInput();
    if (ruleReference.ruleDefinition !== null) {
      ruleReference.ruleDefinition.ruleVersion = 2;
      ruleReference.ruleDefinition.fingerprint =
        "fp:v1:6a41835b1e4b25a5b1d7d5df1a84f20b245055267eced8189c83997685da1a4b";
    }
    expect(resolveCommand(ruleReference)).toEqual({
      status: "rejected",
      reason: "rule-reference-mismatch",
    });

    const missingResource = validInput();
    missingResource.world.resources = missingResource.world.resources.filter(
      ({ resourceId }) => resourceId !== "resource:v1:focus"
    );
    expect(resolveCommand(missingResource)).toEqual({
      status: "rejected",
      reason: "resource-unavailable",
    });
  });

  it("returns an exact preview without receipt and without mutating input", () => {
    const input = { ...validInput(), mode: "preview" } as const;
    const before = canonicalJson(input);
    const outcome = resolveCommand(input);

    expect(outcome).toEqual({ status: "preview", ...expectedFacts });
    expect("receipt" in outcome).toBe(false);
    expect(canonicalJson(input)).toBe(before);
  });

  it("returns an exact deterministic commit and inverse receipt", () => {
    expect(resolveCommand(validInput())).toEqual({
      status: "committed",
      ...expectedFacts,
      receipt: {
        ...COMMITTED_RECEIPT,
      },
    });
  });

  it("requests one bound target observation before evaluating a selected-target rule", () => {
    const input = validInput();
    input.ruleDefinition = {
      ...rule,
      fingerprint:
        "fp:v1:2c7af036ba5e7a36cbf3bd60dbb1e28a49f3643de858be569657b1cb1c983bc5",
      target: {
        kind: "selected-targets",
        min: 1,
        max: 1,
        candidateIds: ["entity:v1:pc-b", "entity:v1:pc-a"],
      },
    };

    expect(resolveCommand(input)).toEqual({
      status: "need-external-input",
      commandId: "cmd:v1:k-spend-001",
      request: {
        kind: "selected-targets",
        requestId:
          "req:v1:562d1717a892e3df6e0c066ac9b878c04e1068331d804c2b8ea4d8733cee25b5",
        min: 1,
        max: 1,
        candidateIds: ["entity:v1:pc-a", "entity:v1:pc-b"],
      },
    });
  });

  it("rejects a known resource deficit before requesting external targets", () => {
    const input = validInput();
    input.ruleDefinition = {
      ...rule,
      fingerprint:
        "fp:v1:2c7af036ba5e7a36cbf3bd60dbb1e28a49f3643de858be569657b1cb1c983bc5",
      target: {
        kind: "selected-targets",
        min: 1,
        max: 1,
        candidateIds: ["entity:v1:pc-a", "entity:v1:pc-b"],
      },
    };
    input.world.resources = input.world.resources.map((resource) =>
      resource.resourceId === "resource:v1:focus" ? { ...resource, current: 0 } : resource
    );
    expect(resolveCommand(input)).toEqual({
      status: "rejected",
      reason: "insufficient-resource",
    });
  });

  it("accepts only the matching selected-target answer and legal subject", () => {
    const input = validInput();
    input.ruleDefinition = {
      ...rule,
      fingerprint:
        "fp:v1:2c7af036ba5e7a36cbf3bd60dbb1e28a49f3643de858be569657b1cb1c983bc5",
      target: {
        kind: "selected-targets",
        min: 1,
        max: 1,
        candidateIds: ["entity:v1:pc-a", "entity:v1:pc-b"],
      },
    };
    input.externalAnswers = {
      schemaVersion: 1,
      values: [
        {
          kind: "selected-targets",
          requestId:
            "req:v1:562d1717a892e3df6e0c066ac9b878c04e1068331d804c2b8ea4d8733cee25b5",
          targetIds: ["entity:v1:pc-a"],
        },
      ],
    };
    expect(resolveCommand(input)).toMatchObject({
      status: "committed",
      ...expectedFacts,
    });

    input.externalAnswers = {
      schemaVersion: 1,
      values: [
        {
          kind: "selected-targets",
          requestId:
            "req:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          targetIds: ["entity:v1:pc-a"],
        },
      ],
    };
    expect(resolveCommand(input)).toEqual({
      status: "rejected",
      reason: "answer-request-mismatch",
    });

    input.externalAnswers = {
      schemaVersion: 1,
      values: [
        {
          kind: "selected-targets",
          requestId:
            "req:v1:562d1717a892e3df6e0c066ac9b878c04e1068331d804c2b8ea4d8733cee25b5",
          targetIds: ["entity:v1:pc-c"],
        },
      ],
    };
    expect(resolveCommand(input)).toEqual({
      status: "rejected",
      reason: "illegal-target",
    });
  });
});

function undoInput(
  receipt: CommandReceipt,
  options: {
    commandId: `cmd:v1:${string}`;
    payloadFingerprint: `fp:v1:${string}`;
    revision: number;
    current: number;
    mode?: "preview" | "commit";
  }
): ResolveCommandInput {
  return {
    schemaVersion: 1,
    mode: options.mode ?? "commit",
    ruleDefinition: null,
    world: {
      schemaVersion: 1,
      stateId: "state:v1:pc-a",
      revision: options.revision,
      resources: [
        { resourceId: "resource:v1:focus", current: options.current, maximum: 2 },
      ],
      effects: [],
    },
    command: {
      schemaVersion: 1,
      kind: "undo-receipt",
      commandId: options.commandId,
      payloadFingerprint: options.payloadFingerprint,
      actorId: "entity:v1:pc-a",
      subjectId: "entity:v1:pc-a",
      expectedRevision: { stateId: "state:v1:pc-a", revision: options.revision },
      receipt,
    },
    externalAnswers: { schemaVersion: 1, values: [] },
    priorReceipt: null,
  };
}

describe("Automation K1 receipts, collision, and bounded undo", () => {
  it("returns byte-identical committed output for an identical prior receipt", () => {
    const first = resolveCommand(validInput());
    const retry = validInput();
    retry.priorReceipt = structuredClone(COMMITTED_RECEIPT);
    const replay = resolveCommand(retry);

    expect(replay).toEqual(first);
    expect(canonicalJson(replay)).toBe(canonicalJson(first));
  });

  it("rejects a changed payload under the same command ID before reevaluation", () => {
    const collision = validInput();
    collision.command = {
      ...collision.command,
      subjectId: "entity:v1:pc-b",
      payloadFingerprint:
        "fp:v1:f2f282fd189e7db3c6a7d65e9e5a2c96bb6355b420554738aae14101958f2fbc",
    };
    collision.priorReceipt = structuredClone(COMMITTED_RECEIPT);
    expect(resolveCommand(collision)).toEqual({
      status: "rejected",
      reason: "command-id-payload-mismatch",
    });

    const preview = { ...validInput(), mode: "preview" as const };
    preview.priorReceipt = structuredClone(COMMITTED_RECEIPT);
    expect(resolveCommand(preview)).toEqual({
      status: "rejected",
      reason: "invalid-receipt",
    });
  });

  it("previews an atomic undo without a receipt", () => {
    const outcome = resolveCommand(
      undoInput(COMMITTED_RECEIPT, {
        commandId: "cmd:v1:k-undo-001",
        payloadFingerprint:
          "fp:v1:79ac12f07582c7cab58a522e0d9c2bcc77d9c8f47ce403206552a8fab22bd230",
        revision: 8,
        current: 1,
        mode: "preview",
      })
    );
    expect(outcome).toEqual({
      status: "preview",
      commandId: "cmd:v1:k-undo-001",
      payloadFingerprint:
        "fp:v1:79ac12f07582c7cab58a522e0d9c2bcc77d9c8f47ce403206552a8fab22bd230",
      resultFingerprint:
        "fp:v1:0fb3b776ea2d1bcfeee3e6569c4e6ccb318b96519cb75d0c21cc0fa9867a8b50",
      patches: UNDO_RECEIPT.patches,
      events: UNDO_RECEIPT.events,
      revisions: UNDO_RECEIPT.revisions,
    });
    expect("receipt" in outcome).toBe(false);
  });

  it("commits rev8 undo to rev9 and the same branch redoes it at rev10", () => {
    const undone = resolveCommand(
      undoInput(COMMITTED_RECEIPT, {
        commandId: "cmd:v1:k-undo-001",
        payloadFingerprint:
          "fp:v1:79ac12f07582c7cab58a522e0d9c2bcc77d9c8f47ce403206552a8fab22bd230",
        revision: 8,
        current: 1,
      })
    );
    expect(undone).toEqual({
      status: "committed",
      commandId: UNDO_RECEIPT.commandId,
      payloadFingerprint: UNDO_RECEIPT.payloadFingerprint,
      resultFingerprint: UNDO_RECEIPT.resultFingerprint,
      patches: UNDO_RECEIPT.patches,
      events: UNDO_RECEIPT.events,
      revisions: UNDO_RECEIPT.revisions,
      receipt: UNDO_RECEIPT,
    });

    const redone = resolveCommand(
      undoInput(UNDO_RECEIPT, {
        commandId: "cmd:v1:k-redo-001",
        payloadFingerprint:
          "fp:v1:227a7283c37452b6e6fb3831efe0eb77ce9e55804ce9fcf018db3282405c751d",
        revision: 9,
        current: 2,
      })
    );
    expect(redone).toEqual({
      status: "committed",
      commandId: REDO_RECEIPT.commandId,
      payloadFingerprint: REDO_RECEIPT.payloadFingerprint,
      resultFingerprint: REDO_RECEIPT.resultFingerprint,
      patches: REDO_RECEIPT.patches,
      events: REDO_RECEIPT.events,
      revisions: REDO_RECEIPT.revisions,
      receipt: REDO_RECEIPT,
    });
  });

  it("rejects one invalid inverse leg and a mismatched current value atomically", () => {
    const invalidReceipt = structuredClone(COMMITTED_RECEIPT) as CommandReceipt;
    const invalidInverse = invalidReceipt.inversePatches[0];
    if (invalidInverse === undefined) throw new TypeError("Missing inverse fixture");
    invalidInverse.after = 3;
    expect(
      resolveCommand(
        undoInput(invalidReceipt, {
          commandId: "cmd:v1:k-undo-001",
          payloadFingerprint:
            "fp:v1:79ac12f07582c7cab58a522e0d9c2bcc77d9c8f47ce403206552a8fab22bd230",
          revision: 8,
          current: 1,
        })
      )
    ).toEqual({ status: "rejected", reason: "invalid-patch" });

    expect(
      resolveCommand(
        undoInput(COMMITTED_RECEIPT, {
          commandId: "cmd:v1:k-undo-001",
          payloadFingerprint:
            "fp:v1:79ac12f07582c7cab58a522e0d9c2bcc77d9c8f47ce403206552a8fab22bd230",
          revision: 8,
          current: 0,
        })
      )
    ).toEqual({ status: "rejected", reason: "invalid-patch" });

    const twoLegs = undoInput(TWO_LEG_RECEIPT, {
      commandId: "cmd:v1:k-batch-undo",
      payloadFingerprint:
        "fp:v1:4f81d9c56e3f6fc932224bc7d35c30289666abdc4378d8ce4f6ac5c3f3e0fc5e",
      revision: 8,
      current: 1,
      mode: "preview",
    });
    twoLegs.world.resources = [
      { resourceId: "resource:v1:focus", current: 1, maximum: 2 },
      { resourceId: "resource:v1:secondary", current: 1, maximum: 3 },
    ];
    expect(resolveCommand(twoLegs)).toEqual({
      status: "rejected",
      reason: "invalid-patch",
    });
  });

  it("classifies the exact G0 negative inverse leg as an invalid patch", () => {
    expect(
      resolveCommand(
        undoInput(NEGATIVE_INVERSE_RECEIPT, {
          commandId: "cmd:v1:k-negative-undo",
          payloadFingerprint:
            "fp:v1:0e8b86304db3f7282afc873b681f433705335cd3708cd90886f48d7b3bc86517",
          revision: 8,
          current: 1,
        })
      )
    ).toEqual({ status: "rejected", reason: "invalid-patch" });
  });

  it("blocks the next operation after an intervening remote revision", () => {
    const input = undoInput(REDO_RECEIPT, {
      commandId: "cmd:v1:k-next-undo",
      payloadFingerprint:
        "fp:v1:84e3ef856a7c14109577cc72ac7d574d93d097f4eeb6edd3c37c4b1403ada0b9",
      revision: 10,
      current: 1,
    });
    input.world.revision = 11;
    expect(resolveCommand(input)).toEqual({
      status: "rejected",
      reason: "revision-mismatch",
    });
  });

  it("retains only the newest exact bounded receipts", () => {
    expect(
      retainCommandReceipts([COMMITTED_RECEIPT, UNDO_RECEIPT, REDO_RECEIPT], 2)
    ).toEqual([UNDO_RECEIPT, REDO_RECEIPT]);
    expect(() => retainCommandReceipts([], 0)).toThrow(RangeError);
    expect(() => retainCommandReceipts([], 1.5)).toThrow(RangeError);
  });
});

function commandImportViolation(specifier: string): string | null {
  if (specifier.split("/").includes("..")) return specifier;
  return /^(?:@\/types\/(?:command|rule-definition|effect-instance)|@\/lib\/canonical-fingerprint|@\/lib\/grants|@\/lib\/command\/[a-z0-9._/-]+|\.\/[a-z0-9._/-]+)$/.test(
    specifier
  )
    ? null
    : specifier;
}

function commandSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? commandSourceFiles(path)
      : entry.isFile() && entry.name.endsWith(".ts")
        ? [path]
        : [];
  });
}

function commandGraphSourceFiles(): readonly string[] {
  return [
    ...commandSourceFiles(join(process.cwd(), "src/lib/command")),
    join(process.cwd(), "src/types/command.ts"),
    join(process.cwd(), "src/types/rule-definition.ts"),
    join(process.cwd(), "src/types/effect-instance.ts"),
  ];
}

function moduleSpecifiersFromSource(
  sourceText: string,
  path = "synthetic-command-boundary.ts"
): readonly string[] {
  const source = ts.createSourceFile(
    path,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const found: string[] = [];
  const directLoaders = new Set<string>();
  const collectDirectLoaders = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === "createRequire"
    ) {
      directLoaders.add(node.name.text);
    }
    ts.forEachChild(node, collectDirectLoaders);
  };
  collectDirectLoaders(source);

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      found.push(node.moduleReference.expression.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          (node.expression.text === "require" ||
            directLoaders.has(node.expression.text))) ||
        (ts.isCallExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "createRequire"))
    ) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function moduleSpecifiers(path: string): readonly string[] {
  return moduleSpecifiersFromSource(readFileSync(path, "utf8"), path);
}

type GrantSourceFile = {
  readonly path: string;
  readonly sourceText: string;
};

type GrantTypeDeclaration = {
  readonly id: string;
  readonly file: GrantParsedSource;
  readonly node: ts.TypeAliasDeclaration | ts.InterfaceDeclaration;
};

type GrantParsedSource = {
  readonly path: string;
  readonly source: ts.SourceFile;
  readonly declarations: Map<string, GrantTypeDeclaration>;
  readonly namedImports: Map<
    string,
    { readonly moduleSpecifier: string; readonly importedName: string }
  >;
  readonly namespaceImports: Map<string, string>;
};

function grantEmbeddingViolations(files: readonly GrantSourceFile[]): readonly string[] {
  const parsedFiles: GrantParsedSource[] = files.map(({ path, sourceText }) => {
    const absolutePath = resolvePath(path);
    return {
      path: absolutePath,
      source: ts.createSourceFile(
        absolutePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      ),
      declarations: new Map(),
      namedImports: new Map(),
      namespaceImports: new Map(),
    };
  });
  const filesByPath = new Map(parsedFiles.map((file) => [file.path, file]));

  for (const file of parsedFiles) {
    for (const statement of file.source.statements) {
      if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
        const name = statement.name.text;
        file.declarations.set(name, {
          id: `${file.path}\u0000${name}`,
          file,
          node: statement,
        });
        continue;
      }
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        continue;
      }
      const moduleSpecifier = statement.moduleSpecifier.text;
      const importClause = statement.importClause;
      const bindings = importClause?.namedBindings;
      if (bindings === undefined) continue;
      if (ts.isNamespaceImport(bindings)) {
        file.namespaceImports.set(bindings.name.text, moduleSpecifier);
        continue;
      }
      for (const element of bindings.elements) {
        file.namedImports.set(element.name.text, {
          moduleSpecifier,
          importedName: (element.propertyName ?? element.name).text,
        });
      }
    }
  }

  const moduleCandidates = (
    importer: GrantParsedSource,
    moduleSpecifier: string
  ): readonly string[] => {
    const base = moduleSpecifier.startsWith("@/")
      ? resolvePath(process.cwd(), "src", moduleSpecifier.slice(2))
      : moduleSpecifier.startsWith(".")
        ? resolvePath(dirname(importer.path), moduleSpecifier)
        : null;
    return base === null ? [] : [base, `${base}.ts`, join(base, "index.ts")];
  };
  const resolveScannedModule = (
    importer: GrantParsedSource,
    moduleSpecifier: string
  ): GrantParsedSource | undefined =>
    moduleCandidates(importer, moduleSpecifier)
      .map((candidate) => filesByPath.get(candidate))
      .find((candidate) => candidate !== undefined);
  const isGrantModule = (
    importer: GrantParsedSource,
    moduleSpecifier: string
  ): boolean => {
    const grantPath = resolvePath(process.cwd(), "src/lib/grants");
    return moduleCandidates(importer, moduleSpecifier).some(
      (candidate) => candidate === grantPath || candidate === `${grantPath}.ts`
    );
  };

  const found: string[] = [];
  const visitDeclaration = (
    declaration: GrantTypeDeclaration,
    visited: Set<string>
  ): void => {
    if (visited.has(declaration.id)) return;
    visited.add(declaration.id);
    if (ts.isTypeAliasDeclaration(declaration.node)) {
      visitOwnedType(declaration.node.type, declaration.file, visited);
      return;
    }
    for (const heritage of declaration.node.heritageClauses ?? []) {
      visitOwnedType(heritage, declaration.file, visited);
    }
    for (const member of declaration.node.members) {
      visitOwnedType(member, declaration.file, visited);
    }
  };
  const followNamedType = (
    name: string,
    file: GrantParsedSource,
    visited: Set<string>
  ): void => {
    const local = file.declarations.get(name);
    if (local !== undefined) {
      visitDeclaration(local, visited);
      return;
    }
    const imported = file.namedImports.get(name);
    if (imported === undefined) return;
    if (
      imported.importedName === "Grant" &&
      isGrantModule(file, imported.moduleSpecifier)
    ) {
      found.push("Grant");
      return;
    }
    const target = resolveScannedModule(file, imported.moduleSpecifier);
    const declaration = target?.declarations.get(imported.importedName);
    if (declaration !== undefined) visitDeclaration(declaration, visited);
  };
  const followNamespaceType = (
    namespace: string,
    name: string,
    file: GrantParsedSource,
    visited: Set<string>
  ): void => {
    const moduleSpecifier = file.namespaceImports.get(namespace);
    if (moduleSpecifier === undefined) return;
    if (name === "Grant" && isGrantModule(file, moduleSpecifier)) {
      found.push("Grant");
      return;
    }
    const target = resolveScannedModule(file, moduleSpecifier);
    const declaration = target?.declarations.get(name);
    if (declaration !== undefined) visitDeclaration(declaration, visited);
  };
  const visitOwnedType = (
    node: ts.Node,
    file: GrantParsedSource,
    visited: Set<string>
  ): void => {
    if (
      ts.isFunctionTypeNode(node) ||
      ts.isConstructorTypeNode(node) ||
      ts.isCallSignatureDeclaration(node) ||
      ts.isConstructSignatureDeclaration(node) ||
      ts.isMethodSignature(node)
    ) {
      return;
    }
    if (ts.isTypeReferenceNode(node)) {
      const name = node.typeName;
      if (ts.isIdentifier(name)) {
        followNamedType(name.text, file, visited);
      } else if (ts.isIdentifier(name.left)) {
        followNamespaceType(name.left.text, name.right.text, file, visited);
      }
      for (const argument of node.typeArguments ?? []) {
        visitOwnedType(argument, file, visited);
      }
      return;
    }
    if (ts.isExpressionWithTypeArguments(node)) {
      if (ts.isIdentifier(node.expression)) {
        followNamedType(node.expression.text, file, visited);
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression)
      ) {
        followNamespaceType(
          node.expression.expression.text,
          node.expression.name.text,
          file,
          visited
        );
      }
      for (const argument of node.typeArguments ?? []) {
        visitOwnedType(argument, file, visited);
      }
      return;
    }
    ts.forEachChild(node, (child) => visitOwnedType(child, file, visited));
  };

  for (const carrier of ["SemanticCommand", "CommandPatch", "EffectInstance"]) {
    for (const file of parsedFiles) {
      const declaration = file.declarations.get(carrier);
      if (declaration !== undefined) visitDeclaration(declaration, new Set());
    }
  }
  return found;
}

describe("Automation K1 import and Grant boundary", () => {
  it("allows only target modules, root types, canonical hashing, and the audited Grant seam", () => {
    for (const allowed of [
      "@/types/command",
      "@/types/rule-definition",
      "@/types/effect-instance",
      "@/lib/canonical-fingerprint",
      "@/lib/grants",
      "@/lib/command/identity",
      "./identity",
    ]) {
      expect(commandImportViolation(allowed), allowed).toBeNull();
    }

    for (const forbidden of [
      "react",
      "firebase/firestore",
      "zustand",
      "@/i18n/config",
      "@/features/character",
      "@/components/ui/button",
      "@/lib/views/combat",
      "@/lib/mechanics-world",
      "@/types/action-journal",
      "@/lib/command/identity?raw",
      "@/lib/command/identity#hash",
      "/src/lib/command/identity",
      ".\\identity",
      "../mechanics-command",
    ]) {
      expect(commandImportViolation(forbidden), forbidden).toBe(forbidden);
    }
  });

  it.each([
    "@/lib/command/../views/combat-action-view",
    "./../views/combat-action-view",
    "@/lib/command/../../features/account/admin-search",
    "./../../features/account/admin-search",
    "@/lib/command/./../views/combat-action-view",
  ])("rejects an exact parent traversal import: %s", (specifier) => {
    expect(commandImportViolation(specifier)).toBe(specifier);
  });

  it("keeps every real command-kernel import inside the allowlist", () => {
    const violations = commandGraphSourceFiles().flatMap((path) =>
      moduleSpecifiers(path).flatMap((specifier) => {
        const violation = commandImportViolation(specifier);
        return violation === null
          ? []
          : [`${relative(process.cwd(), path)} -> ${violation}`];
      })
    );
    expect(violations).toEqual([]);
  });

  it("finds direct CommonJS, TS import-equals, and createRequire loader imports", () => {
    const sources = [
      'const React = require("react");',
      'import React = require("react");',
      'const load = createRequire(import.meta.url); load("react");',
      'createRequire(import.meta.url)("react");',
    ];

    expect(sources.map((source) => moduleSpecifiersFromSource(source))).toEqual([
      ["react"],
      ["react"],
      ["react"],
      ["react"],
    ]);
  });

  it("allows the audited Grant seam in pure function parameters and returns", () => {
    expect(
      grantEmbeddingViolations([
        {
          path: "src/lib/command/pure-grant.ts",
          sourceText: `
            import type { Grant } from "@/lib/grants";
            type PureGrantAlias = Grant;
            function normalizeGrant(grant: Grant): Grant { return grant; }
          `,
        },
      ])
    ).toEqual([]);
  });

  it("finds direct, optional, nested, and helper-alias Grant carrier state", () => {
    expect(
      grantEmbeddingViolations([
        {
          path: "src/types/synthetic-carriers.ts",
          sourceText: `
            import type { Grant } from "@/lib/grants";
            interface HelperInterface { grant: Grant }
            type HelperAlias = HelperInterface;
            type NestedState = { state: { grants: readonly Grant[] } };
            export type SemanticCommand = Grant | HelperAlias;
            export type CommandPatch = { grant?: Grant };
            export type EffectInstance = NestedState;
          `,
        },
      ])
    ).toEqual(["Grant", "Grant", "Grant", "Grant"]);
  });

  it.each([
    [
      "named import",
      'import type { CrossFileGrantState } from "@/lib/command/grant-state";',
      "CrossFileGrantState",
    ],
    [
      "renamed named import",
      'import type { CrossFileGrantState as ImportedState } from "@/lib/command/grant-state";',
      "ImportedState",
    ],
    [
      "namespace import",
      'import type * as helper from "@/lib/command/grant-state";',
      "helper.CrossFileGrantState",
    ],
  ])(
    "finds cross-file Grant carrier state through a %s",
    (_name, importLine, typeName) => {
      const files = [
        {
          path: "src/types/command.ts",
          sourceText: `${importLine}\nexport type SemanticCommand = ${typeName};`,
        },
        {
          path: "src/lib/command/grant-state.ts",
          sourceText: `
          import type { Grant } from "@/lib/grants";
          export type CrossFileGrantState = { readonly grant: Grant };
        `,
        },
      ];
      expect(grantEmbeddingViolations(files)).toEqual(["Grant"]);
    }
  );

  it("keeps Grant normalized IR out of command, patch, and effect state", () => {
    const embeddings = grantEmbeddingViolations(
      commandGraphSourceFiles().map((path) => ({
        path,
        sourceText: readFileSync(path, "utf8"),
      }))
    );
    expect(embeddings).toEqual([]);
    expectTypeOf<Grant>().not.toExtend<SemanticCommand>();
    expectTypeOf<Grant>().not.toExtend<CommandPatch>();
    expectTypeOf<Grant>().not.toExtend<EffectInstance>();
  });

  it("exposes the one resolver through the canonical public entry", () => {
    expect(resolveCommandFromPublicEntry).toBe(resolveCommand);
    expect(canonicalResolutionJson({ status: "rejected", reason: "invalid-input" })).toBe(
      '{"reason":"invalid-input","status":"rejected"}'
    );
  });
});
