import { execFileSync } from "node:child_process";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { canonicalResolutionJson, resolveCommand } from "@/lib/command";
import type {
  CommitResult,
  ResolutionOutcome,
  ResolveCommandInput,
} from "@/types/command";
import type { ResourceSpendRuleDefinition } from "@/types/rule-definition";
import { buildFunctions } from "../../scripts/build-functions";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FUNCTIONS_ENTRY = fileURLToPath(
  new URL("../../functions/lib/index.js", import.meta.url)
);

type CommandKernelExports = {
  resolveCommand(input: unknown): ResolutionOutcome;
  canonicalResolutionJson(outcome: ResolutionOutcome): string;
};

const RULE = {
  schemaVersion: 1,
  kind: "resource-spend",
  ruleId: "rule:v1:focus",
  ruleVersion: 1,
  fingerprint: "fp:v1:3d3679aef6e0579da41a2ff60efe7d75b2a2f96bada08799f30d69fba09dca00",
  provenance: {
    kind: "srd",
    sourceId: "source:v1:srd-5.2.1",
    sourceVersion: 1,
  },
  resourceId: "resource:v1:focus",
  amount: 1,
  target: { kind: "actor" },
} as const satisfies ResourceSpendRuleDefinition;

const INPUT = {
  schemaVersion: 1,
  mode: "commit",
  ruleDefinition: RULE,
  world: {
    schemaVersion: 1,
    stateId: "state:v1:pc-a",
    revision: 7,
    resources: [{ resourceId: "resource:v1:focus", current: 2, maximum: 2 }],
    effects: [],
  },
  command: {
    schemaVersion: 1,
    kind: "use-rule",
    commandId: "cmd:v1:k-spend-001",
    payloadFingerprint:
      "fp:v1:cee46e2e539a8be343d56388010b4413e0dc925c4268f2fc1d67c8434f06512b",
    actorId: "entity:v1:pc-a",
    subjectId: "entity:v1:pc-a",
    ruleId: "rule:v1:focus",
    ruleVersion: 1,
    expectedRevision: { stateId: "state:v1:pc-a", revision: 7 },
    choices: {},
  },
  externalAnswers: { schemaVersion: 1, values: [] },
  priorReceipt: null,
} as const satisfies ResolveCommandInput;

const EXPECTED_COMMIT = {
  status: "committed",
  commandId: "cmd:v1:k-spend-001",
  payloadFingerprint:
    "fp:v1:cee46e2e539a8be343d56388010b4413e0dc925c4268f2fc1d67c8434f06512b",
  resultFingerprint:
    "fp:v1:f8715c4b5c066fecd99a8aad1934ef0192ef1d6ff3f49e2e60700ac798cd45aa",
  patches: [
    {
      schemaVersion: 1,
      kind: "set-resource",
      patchId:
        "patch:v1:bd731cc7a11733972a8f1ede384ce106125403c34d04a75c9e45ddd4bcdbf3d5",
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
        "event:v1:c439122210b309c06669c50589631be3c1a73f4d3530f69913d56bb82706c054",
      actorId: "entity:v1:pc-a",
      subjectId: "entity:v1:pc-a",
      ruleId: "rule:v1:focus",
      resourceId: "resource:v1:focus",
      amount: 1,
    },
  ],
  revisions: [{ stateId: "state:v1:pc-a", before: 7, after: 8 }],
  receipt: {
    schemaVersion: 1,
    receiptId:
      "receipt:v1:32a8f33594dbecd25d9d26b4476b14405fceda4e47052cc6876927c104e20deb",
    commandId: "cmd:v1:k-spend-001",
    payloadFingerprint:
      "fp:v1:cee46e2e539a8be343d56388010b4413e0dc925c4268f2fc1d67c8434f06512b",
    resultFingerprint:
      "fp:v1:f8715c4b5c066fecd99a8aad1934ef0192ef1d6ff3f49e2e60700ac798cd45aa",
    patches: [
      {
        schemaVersion: 1,
        kind: "set-resource",
        patchId:
          "patch:v1:bd731cc7a11733972a8f1ede384ce106125403c34d04a75c9e45ddd4bcdbf3d5",
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
          "event:v1:c439122210b309c06669c50589631be3c1a73f4d3530f69913d56bb82706c054",
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
          "patch:v1:b1e754b69f04b974a3a11d903ef0b07e44680a96e3175ea156f0579f517573f4",
        stateId: "state:v1:pc-a",
        resourceId: "resource:v1:focus",
        before: 1,
        after: 2,
      },
    ],
  },
} as const satisfies CommitResult;

const EXPECTED_CANONICAL_BYTES =
  '{"commandId":"cmd:v1:k-spend-001","events":[{"actorId":"entity:v1:pc-a","amount":1,"eventId":"event:v1:c439122210b309c06669c50589631be3c1a73f4d3530f69913d56bb82706c054","kind":"resource-spent","resourceId":"resource:v1:focus","ruleId":"rule:v1:focus","schemaVersion":1,"subjectId":"entity:v1:pc-a"}],"patches":[{"after":1,"before":2,"kind":"set-resource","patchId":"patch:v1:bd731cc7a11733972a8f1ede384ce106125403c34d04a75c9e45ddd4bcdbf3d5","resourceId":"resource:v1:focus","schemaVersion":1,"stateId":"state:v1:pc-a"}],"payloadFingerprint":"fp:v1:cee46e2e539a8be343d56388010b4413e0dc925c4268f2fc1d67c8434f06512b","receipt":{"commandId":"cmd:v1:k-spend-001","events":[{"actorId":"entity:v1:pc-a","amount":1,"eventId":"event:v1:c439122210b309c06669c50589631be3c1a73f4d3530f69913d56bb82706c054","kind":"resource-spent","resourceId":"resource:v1:focus","ruleId":"rule:v1:focus","schemaVersion":1,"subjectId":"entity:v1:pc-a"}],"inversePatches":[{"after":2,"before":1,"kind":"set-resource","patchId":"patch:v1:b1e754b69f04b974a3a11d903ef0b07e44680a96e3175ea156f0579f517573f4","resourceId":"resource:v1:focus","schemaVersion":1,"stateId":"state:v1:pc-a"}],"patches":[{"after":1,"before":2,"kind":"set-resource","patchId":"patch:v1:bd731cc7a11733972a8f1ede384ce106125403c34d04a75c9e45ddd4bcdbf3d5","resourceId":"resource:v1:focus","schemaVersion":1,"stateId":"state:v1:pc-a"}],"payloadFingerprint":"fp:v1:cee46e2e539a8be343d56388010b4413e0dc925c4268f2fc1d67c8434f06512b","receiptId":"receipt:v1:32a8f33594dbecd25d9d26b4476b14405fceda4e47052cc6876927c104e20deb","resultFingerprint":"fp:v1:f8715c4b5c066fecd99a8aad1934ef0192ef1d6ff3f49e2e60700ac798cd45aa","revisions":[{"after":8,"before":7,"stateId":"state:v1:pc-a"}],"schemaVersion":1},"resultFingerprint":"fp:v1:f8715c4b5c066fecd99a8aad1934ef0192ef1d6ff3f49e2e60700ac798cd45aa","revisions":[{"after":8,"before":7,"stateId":"state:v1:pc-a"}],"status":"committed"}';

let functionsKernel: CommandKernelExports;

function withFunctionsSnapshot(run: (snapshot: string) => void): void {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "d20-folio-k1-functions-"));
  const snapshot = join(temporaryRoot, "functions");
  mkdirSync(snapshot);
  try {
    for (const entry of ["package.json", "package-lock.json", "lib"] as const) {
      cpSync(join(REPOSITORY_ROOT, "functions", entry), join(snapshot, entry), {
        recursive: true,
      });
    }
    run(snapshot);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function runRemoteArtifactValidation(snapshot: string) {
  return spawnSync("npm", ["run", "gcp-build"], {
    cwd: snapshot,
    encoding: "utf8",
  });
}

beforeAll(() => {
  expect(buildFunctions).toBeTypeOf("function");
  execFileSync("npm", ["--prefix", "functions", "run", "build"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });

  const load = createRequire(import.meta.url);
  functionsKernel = load(FUNCTIONS_ENTRY) as CommandKernelExports;
});

describe("Automation K1 browser and Functions golden contract", () => {
  it("returns the literal commit through the same source in both builds", () => {
    const browserResult = resolveCommand(structuredClone(INPUT));
    const functionsResult = functionsKernel.resolveCommand(structuredClone(INPUT));

    expect(browserResult).toEqual(EXPECTED_COMMIT);
    expect(functionsResult).toEqual(EXPECTED_COMMIT);

    const browserBytes = canonicalResolutionJson(browserResult);
    const functionsBytes = functionsKernel.canonicalResolutionJson(functionsResult);
    expect(browserBytes).toBe(EXPECTED_CANONICAL_BYTES);
    expect(functionsBytes).toBe(EXPECTED_CANONICAL_BYTES);
    expect(functionsBytes).toBe(browserBytes);
  });

  it("replays an identical commit byte-for-byte in both builds", () => {
    const retry = {
      ...structuredClone(INPUT),
      priorReceipt: structuredClone(EXPECTED_COMMIT.receipt),
    } satisfies ResolveCommandInput;

    const browserBytes = canonicalResolutionJson(resolveCommand(retry));
    const functionsBytes = functionsKernel.canonicalResolutionJson(
      functionsKernel.resolveCommand(retry)
    );

    expect(browserBytes).toBe(EXPECTED_CANONICAL_BYTES);
    expect(functionsBytes).toBe(EXPECTED_CANONICAL_BYTES);
    expect(functionsBytes).toBe(browserBytes);
  });

  it("validates both prebuilt runtime artifacts from a Functions-only snapshot", () => {
    withFunctionsSnapshot((snapshot) => {
      expect(existsSync(join(snapshot, "node_modules"))).toBe(false);
      expect(existsSync(join(snapshot, "..", "scripts", "build-functions.ts"))).toBe(
        false
      );

      const result = runRemoteArtifactValidation(snapshot);
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    });
  });

  it("fails the remote build validation when the kernel artifact is absent", () => {
    withFunctionsSnapshot((snapshot) => {
      const kernel = join(snapshot, "lib", "command-kernel.cjs");
      const withheldKernel = `${kernel}.withheld`;
      renameSync(kernel, withheldKernel);

      const missing = runRemoteArtifactValidation(snapshot);
      expect(missing.status).not.toBe(0);
      expect(`${missing.stdout}\n${missing.stderr}`).toContain(
        "Missing Functions runtime artifact: lib/command-kernel.cjs"
      );

      renameSync(withheldKernel, kernel);
      const restored = runRemoteArtifactValidation(snapshot);
      expect(restored.status, `${restored.stdout}\n${restored.stderr}`).toBe(0);
    });
  });
});
