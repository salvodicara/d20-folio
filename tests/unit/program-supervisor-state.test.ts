import { describe, expect, it } from "vitest";

import {
  parseEvents,
  replayEvents,
  validateEventInput,
  validateLeaseFile,
  validateSnapshot,
  validateTransition,
} from "../../scripts/program-supervisor/state";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);
const SHA_D = "d".repeat(40);
const SHA_E = "e".repeat(40);
const SHA_F = "f".repeat(40);
const REPOSITORY = "/repo/d20-folio";
const LEASE_OWNER_PATH = "docs/TEST_PORTFOLIO.md";
const LEASE_ID = "F0";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function itemAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Fixture is missing item ${index}`);
  return value;
}

function authorityPointer(reconciledOwnerBlob = SHA_A, reconciledMainSha = SHA_B) {
  return {
    repository: REPOSITORY,
    ownerDocumentPath: LEASE_OWNER_PATH,
    repositoryLeaseId: LEASE_ID,
    reconciledOwnerBlob,
    reconciledMainSha,
  };
}

function charter(
  id: string,
  path: string,
  options: { ownerGate?: boolean; leaseId?: string } = {}
) {
  return {
    id,
    outcome: `Observable outcome for ${id}`,
    authority: [
      {
        path: "docs/plans/2026-08-25-agent-first-operating-model-design.md",
        blob: SHA_C,
      },
      { path: LEASE_OWNER_PATH, blob: SHA_A },
    ],
    dependencies: [],
    ownership: {
      repository: REPOSITORY,
      worktree: `/worktrees/${id}`,
      branch: `feat/${id}`,
      baseSha: SHA_B,
      headSha: SHA_B,
      paths: [path],
      repositoryLease: {
        id: options.leaseId ?? LEASE_ID,
        ownerDocumentPath: LEASE_OWNER_PATH,
        ownerDocumentBlob: SHA_A,
        mainSha: SHA_B,
      },
    },
    acceptance: [`${id} emits a durable receipt`],
    review: {
      required: true,
      independent: true,
      proof: `${id}-review-contract`,
    },
    ownerGate: {
      required: options.ownerGate ?? false,
      name: options.ownerGate ? "product-owner" : "none",
    },
    cleanup: {
      rule: "Remove the worktree and branch after remote or recovery proof.",
      proof: "remote-or-recovery" as const,
      removal: ["worktree", "branch"],
    },
  };
}

function bootstrapTask(
  id: string,
  path: string,
  ownerGate = false
): {
  charter: ReturnType<typeof charter>;
  state: string;
  receipt: string | null;
  updatedAt: string;
} {
  return {
    charter: charter(id, path, { ownerGate }),
    state: "queued",
    receipt: null,
    updatedAt: "2026-08-26T00:00:00.000Z",
  };
}

function bootstrapFixture() {
  return {
    schemaVersion: 1,
    eventId: "event-bootstrap",
    seq: 1,
    type: "bootstrap",
    at: "2026-08-26T00:00:00.000Z",
    authority: {
      mainSha: SHA_B,
      operatingModel: {
        path: "docs/plans/2026-08-25-agent-first-operating-model-design.md",
        blob: SHA_C,
      },
      productWayfinders: [
        { path: "PRODUCT.md", blob: SHA_D },
        { path: "docs/PRODUCT_CONSTITUTION.md", blob: SHA_E },
      ],
      testPortfolioRoadmap: { path: LEASE_OWNER_PATH, blob: SHA_A },
      readinessBaseline: { path: "PROGRESS.md", blob: SHA_F },
      statusOwner: { path: "docs/PROGRAM_STATUS.md", blob: SHA_D },
    },
    tasks: [
      bootstrapTask("task-a", "scripts/a"),
      bootstrapTask("task-b", "scripts/b"),
      bootstrapTask("task-evaluator", "docs/evaluation.md", true),
    ],
    activeLeases: [] as ReturnType<typeof lease>[],
  };
}

function event<T extends Record<string, unknown>>(
  seq: number,
  type: string,
  fields: T,
  at = `2026-08-26T${String(seq).padStart(2, "0")}:00:00.000Z`
): {
  schemaVersion: number;
  eventId: string;
  seq: number;
  type: string;
  at: string;
} & T {
  return {
    schemaVersion: 1,
    eventId: `event-${seq}-${type}`,
    seq,
    type,
    at,
    ...fields,
  };
}

function lease(
  taskId: string,
  role: "writer" | "evaluator" = "writer",
  options: {
    leaseId?: string;
    readOnly?: boolean;
    pointer?: Record<string, unknown>;
    expiresAt?: string;
  } = {}
) {
  return {
    leaseId: options.leaseId ?? `runtime-${taskId}`,
    taskId,
    holder: `holder-${taskId}`,
    agentId: `agent-${taskId}`,
    role,
    readOnly: options.readOnly ?? role === "evaluator",
    acquiredAt: "2026-08-26T02:00:00.000Z",
    expiresAt: options.expiresAt ?? "2026-08-26T20:00:00.000Z",
    authorityPointer: options.pointer ?? authorityPointer(),
  };
}

function acquire(seq: number, value: ReturnType<typeof lease>) {
  return event(seq, "lease-acquired", { lease: value }, value.acquiredAt);
}

describe("Program Supervisor untrusted-data schemas", () => {
  it("rejects a charter with any required field missing", () => {
    const fixture = bootstrapFixture();
    const malformed = itemAt(fixture.tasks, 0).charter as Record<string, unknown>;
    delete malformed.acceptance;

    expect(() => validateEventInput(fixture)).toThrow(/acceptance/);
  });

  it("requires an independent review and an explicit cleanup proof rule", () => {
    const review = bootstrapFixture();
    itemAt(review.tasks, 0).charter.review.independent = false;
    expect(() => validateEventInput(review)).toThrow(/independent review/);

    const cleanup = bootstrapFixture();
    delete (
      itemAt(cleanup.tasks, 0).charter.cleanup as Partial<
        (typeof cleanup.tasks)[0]["charter"]["cleanup"]
      >
    ).proof;
    expect(() => validateEventInput(cleanup)).toThrow(/cleanup.*proof/);
  });

  it("keeps docs/TEST_PORTFOLIO.md as the repository lease owner", () => {
    const fixture = bootstrapFixture();
    itemAt(itemAt(fixture.tasks, 0).charter.authority, 1).path = "docs/OTHER.md";
    itemAt(fixture.tasks, 0).charter.ownership.repositoryLease.ownerDocumentPath =
      "docs/OTHER.md";

    expect(() => validateEventInput(fixture)).toThrow(/TEST_PORTFOLIO/);
  });

  it("rejects a bootstrap lease pointer that disagrees with its complete charter", () => {
    const fixture = bootstrapFixture();
    itemAt(fixture.tasks, 0).state = "leased";
    fixture.activeLeases.push(
      lease("task-a", "writer", {
        pointer: authorityPointer(SHA_C, SHA_B),
      })
    );

    expect(() => validateEventInput(fixture)).toThrow(/authority pointer/);
  });

  it("rejects a bootstrap active lease whose task is still queued", () => {
    const fixture = bootstrapFixture();
    fixture.activeLeases.push(lease("task-a"));

    expect(() => validateEventInput(fixture)).toThrow(/queued.*active lease/);
  });

  it.each([
    ["extra key", () => Object.assign(bootstrapFixture(), { cache: {} })],
    ["wrong schema", () => Object.assign(bootstrapFixture(), { schemaVersion: 2 })],
    [
      "uppercase SHA",
      () => Object.assign(bootstrapFixture().authority, { mainSha: "A".repeat(40) }),
    ],
    [
      "non-round-trippable timestamp",
      () => Object.assign(bootstrapFixture(), { at: "2026-08-26T00:00:00Z" }),
    ],
    [
      "duplicate task IDs",
      () => {
        const value = bootstrapFixture();
        itemAt(value.tasks, 1).charter.id = "task-a";
        return value;
      },
    ],
    [
      "unnormalized ownership path",
      () => {
        const value = bootstrapFixture();
        itemAt(value.tasks, 0).charter.ownership.paths = ["./scripts/a"];
        return value;
      },
    ],
    ["unknown event variant", () => event(2, "integrated", {})],
  ])("rejects %s", (_name, makeValue) => {
    expect(() => validateEventInput(makeValue())).toThrow();
  });

  it("parses strict NDJSON and rejects malformed or blank records", () => {
    const first = bootstrapFixture();
    const second = event(2, "no-frontier-recorded", {
      wayfinder: "automation-first",
      receipt: "No safe frontier remains.",
    });

    expect(
      parseEvents(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`)
    ).toHaveLength(2);
    expect(() =>
      parseEvents(`${JSON.stringify(first)}\n\n${JSON.stringify(second)}`)
    ).toThrow(/blank NDJSON record/);
    expect(() => parseEvents(`${JSON.stringify(first)}\n{broken}`)).toThrow(/line 2/);
  });
});

describe("Program Supervisor bootstrap and task projection", () => {
  it("validates and deterministically replays a complete bootstrap", () => {
    const first = bootstrapFixture();

    const left = replayEvents([first]);
    const right = replayEvents([clone(first)]);

    expect(left).toEqual(right);
    expect(left.snapshot).toMatchObject({
      schemaVersion: 1,
      lastEventSeq: 1,
      updatedAt: first.at,
      wip: { writers: 0, evaluators: 0 },
    });
    expect(validateSnapshot(left.snapshot)).toEqual(left.snapshot);
    expect(validateLeaseFile(left.leases)).toEqual(left.leases);
  });

  it("adds a fully chartered successor after bootstrap", () => {
    const successor = bootstrapTask("task-successor", "scripts/successor");
    const result = replayEvents([
      bootstrapFixture(),
      event(2, "task-created", { task: successor }),
    ]);

    expect(result.snapshot.tasks).toContainEqual(
      expect.objectContaining({
        charter: successor.charter,
        state: "queued",
        updatedAt: "2026-08-26T02:00:00.000Z",
      })
    );
  });

  it("requires contiguous sequences from one, unique event IDs, and one bootstrap", () => {
    expect(() =>
      replayEvents([
        bootstrapFixture(),
        event(3, "no-frontier-recorded", {
          wayfinder: "foundation",
          receipt: "none",
        }),
      ])
    ).toThrow(/expected sequence 2/);

    const duplicateId = event(2, "no-frontier-recorded", {
      wayfinder: "foundation",
      receipt: "none",
    });
    duplicateId.eventId = "event-bootstrap";
    expect(() => replayEvents([bootstrapFixture(), duplicateId])).toThrow(
      /duplicate eventId/
    );

    const secondBootstrap = clone(bootstrapFixture());
    secondBootstrap.seq = 2;
    secondBootstrap.eventId = "event-bootstrap-2";
    secondBootstrap.at = "2026-08-26T02:00:00.000Z";
    expect(() => replayEvents([bootstrapFixture(), secondBootstrap])).toThrow(
      /bootstrap.*first|second bootstrap/i
    );
  });
});

describe("Program Supervisor lease authority and WIP", () => {
  it("replays two disjoint writers and one read-only evaluator", () => {
    const result = replayEvents([
      bootstrapFixture(),
      acquire(2, lease("task-a")),
      acquire(3, { ...lease("task-b"), acquiredAt: "2026-08-26T03:00:00.000Z" }),
      acquire(4, {
        ...lease("task-evaluator", "evaluator"),
        acquiredAt: "2026-08-26T04:00:00.000Z",
      }),
    ]);

    expect(result.snapshot.wip).toEqual({ writers: 2, evaluators: 1 });
    expect(result.leases.leases).toHaveLength(3);
    expect(Object.keys(itemAt(result.leases.leases, 0)).sort()).toEqual([
      "authorityPointer",
      "expiresAt",
      "taskId",
    ]);
    expect(itemAt(result.snapshot.tasks, 0).activeLease).toMatchObject({
      holder: "holder-task-a",
      role: "writer",
      readOnly: false,
    });
  });

  it("rejects a third writer, a second evaluator, and a writable evaluator", () => {
    const twoWriters = [
      bootstrapFixture(),
      acquire(2, lease("task-a")),
      acquire(3, { ...lease("task-b"), acquiredAt: "2026-08-26T03:00:00.000Z" }),
    ];
    expect(() =>
      replayEvents([
        ...twoWriters,
        acquire(4, {
          ...lease("task-evaluator"),
          acquiredAt: "2026-08-26T04:00:00.000Z",
        }),
      ])
    ).toThrow(/two active writers/);

    expect(() =>
      replayEvents([
        bootstrapFixture(),
        acquire(2, lease("task-a", "evaluator")),
        acquire(3, {
          ...lease("task-b", "evaluator"),
          acquiredAt: "2026-08-26T03:00:00.000Z",
        }),
      ])
    ).toThrow(/one active evaluator/);

    expect(() =>
      replayEvents([
        bootstrapFixture(),
        acquire(2, lease("task-a", "evaluator", { readOnly: false })),
      ])
    ).toThrow(/evaluator.*read-only/);
  });

  it("derives writer overlap from charter paths", () => {
    const fixture = bootstrapFixture();
    itemAt(fixture.tasks, 1).charter.ownership.paths = ["scripts/a/generated"];

    expect(() =>
      replayEvents([
        fixture,
        acquire(2, lease("task-a")),
        acquire(3, { ...lease("task-b"), acquiredAt: "2026-08-26T03:00:00.000Z" }),
      ])
    ).toThrow(/overlap.*scripts\/a/i);
  });

  it("treats a normalized trailing glob as ownership of every descendant", () => {
    const fixture = bootstrapFixture();
    itemAt(fixture.tasks, 0).charter.ownership.paths = ["scripts/**"];
    itemAt(fixture.tasks, 1).charter.ownership.paths = ["scripts/b"];

    expect(() =>
      replayEvents([
        fixture,
        acquire(2, lease("task-a")),
        acquire(3, { ...lease("task-b"), acquiredAt: "2026-08-26T03:00:00.000Z" }),
      ])
    ).toThrow(/overlap.*scripts/i);
  });

  it.each([
    ["repository", "/repo/other"],
    ["ownerDocumentPath", "docs/OTHER.md"],
    ["repositoryLeaseId", "F9"],
    ["reconciledOwnerBlob", SHA_C],
    ["reconciledMainSha", SHA_C],
  ])("rejects a mismatched lease authority %s", (field, value) => {
    const pointer = { ...authorityPointer(), [field]: value };
    expect(() =>
      replayEvents([
        bootstrapFixture(),
        acquire(2, lease("task-a", "writer", { pointer })),
      ])
    ).toThrow(/authority pointer/);
  });

  it("rejects a copied ownership path in the narrow lease pointer or cache", () => {
    const pointer = { ...authorityPointer(), paths: ["scripts/a"] };
    expect(() =>
      replayEvents([
        bootstrapFixture(),
        acquire(2, lease("task-a", "writer", { pointer })),
      ])
    ).toThrow(/paths|unexpected key/);

    const projected = replayEvents([bootstrapFixture()]).leases;
    expect(() =>
      validateLeaseFile({
        ...projected,
        leases: [
          {
            taskId: "task-a",
            expiresAt: "2026-08-26T20:00:00.000Z",
            authorityPointer: { ...authorityPointer(), paths: ["scripts/a"] },
          },
        ],
      })
    ).toThrow(/paths|unexpected key/);
  });

  it("renews only an active unchanged identity before expiry and advances only reconciled hashes", () => {
    const acquired = lease("task-a");
    const renewal = event(
      3,
      "lease-renewed",
      {
        taskId: "task-a",
        leaseId: acquired.leaseId,
        holder: acquired.holder,
        agentId: acquired.agentId,
        role: acquired.role,
        readOnly: acquired.readOnly,
        previousExpiresAt: acquired.expiresAt,
        expiresAt: "2026-08-27T02:00:00.000Z",
        authorityPointer: authorityPointer(SHA_C, SHA_D),
        proof: "Owner document and main SHA reconciled before renewal.",
      },
      "2026-08-26T03:00:00.000Z"
    );
    const result = replayEvents([bootstrapFixture(), acquire(2, acquired), renewal]);

    expect(result.snapshot.wip).toEqual({ writers: 1, evaluators: 0 });
    expect(result.leases.leases[0]).toEqual({
      taskId: "task-a",
      expiresAt: "2026-08-27T02:00:00.000Z",
      authorityPointer: authorityPointer(SHA_C, SHA_D),
    });

    for (const [field, value] of [
      ["holder", "other-holder"],
      ["role", "evaluator"],
      ["repositoryLeaseId", "F9"],
      ["ownerDocumentPath", "docs/OTHER.md"],
    ] as const) {
      const bad = clone(renewal);
      if (field in bad.authorityPointer) {
        (bad.authorityPointer as Record<string, unknown>)[field] = value;
      } else {
        (bad as Record<string, unknown>)[field] = value;
      }
      expect(() =>
        replayEvents([bootstrapFixture(), acquire(2, acquired), bad])
      ).toThrow();
    }

    const expired = clone(renewal);
    expired.at = acquired.expiresAt;
    expect(() =>
      replayEvents([bootstrapFixture(), acquire(2, acquired), expired])
    ).toThrow(/before expiry/);

    const unbounded = clone(renewal);
    unbounded.expiresAt = "2026-08-27T04:00:00.000Z";
    expect(() =>
      replayEvents([bootstrapFixture(), acquire(2, acquired), unbounded])
    ).toThrow(/24 hours/);
  });
});

describe("Program Supervisor lease lifecycle and state transitions", () => {
  it("dispatches only the task with its active lease and rejects direct execution", () => {
    const active = lease("task-a");
    const result = replayEvents([
      bootstrapFixture(),
      acquire(2, active),
      event(3, "dispatch-recorded", {
        taskId: "task-a",
        leaseId: active.leaseId,
        receipt: "Dispatch accepted by the named agent.",
      }),
    ]);
    expect(result.snapshot.tasks[0]).toMatchObject({ state: "executing" });

    expect(() =>
      replayEvents([
        bootstrapFixture(),
        event(2, "state-transitioned", {
          taskId: "task-a",
          from: "queued",
          to: "executing",
          receipt: "fabricated",
        }),
      ])
    ).toThrow(/dispatch|transition/);
    expect(() =>
      replayEvents([
        bootstrapFixture(),
        acquire(2, active),
        event(3, "dispatch-recorded", {
          taskId: "task-a",
          leaseId: "wrong",
          receipt: "fabricated",
        }),
      ])
    ).toThrow(/active lease/);
  });

  it("expires only at the recorded boundary and atomically blocks leased work with evidence", () => {
    const active = lease("task-a");
    const expiry = event(
      3,
      "lease-expired",
      {
        taskId: "task-a",
        leaseId: active.leaseId,
        preservationReceipt: "HEAD and dirty patch preserved at recovery/task-a.",
      },
      active.expiresAt
    );
    const result = replayEvents([bootstrapFixture(), acquire(2, active), expiry]);

    expect(result.leases.leases).toEqual([]);
    expect(result.snapshot.tasks[0]).toMatchObject({
      state: "blocked-with-evidence",
      receipt: expiry.preservationReceipt,
      activeLease: null,
    });
    expect(result.snapshot.wip).toEqual({ writers: 0, evaluators: 0 });

    const early = clone(expiry);
    early.at = "2026-08-26T19:59:59.999Z";
    expect(() => replayEvents([bootstrapFixture(), acquire(2, active), early])).toThrow(
      /at or after.*expiry/
    );

    const missingEvidence = clone(expiry);
    missingEvidence.preservationReceipt = "";
    expect(() =>
      replayEvents([bootstrapFixture(), acquire(2, active), missingEvidence])
    ).toThrow(/preservationReceipt/);
  });

  it("retains an already evidenced review state on expiry", () => {
    const active = lease("task-a");
    const result = replayEvents([
      bootstrapFixture(),
      acquire(2, active),
      event(3, "dispatch-recorded", {
        taskId: "task-a",
        leaseId: active.leaseId,
        receipt: "dispatch",
      }),
      event(4, "state-transitioned", {
        taskId: "task-a",
        from: "executing",
        to: "review",
        receipt: "review bundle r1",
      }),
      event(
        5,
        "lease-expired",
        {
          taskId: "task-a",
          leaseId: active.leaseId,
          preservationReceipt: "review bundle and HEAD preserved",
        },
        active.expiresAt
      ),
    ]);

    expect(result.snapshot.tasks[0]).toMatchObject({
      state: "review",
      receipt: "review bundle r1",
      activeLease: null,
    });
  });

  it("releases only an active lease without changing an evidenced non-executing state", () => {
    const active = lease("task-a");
    const prefix = [
      bootstrapFixture(),
      acquire(2, active),
      event(3, "dispatch-recorded", {
        taskId: "task-a",
        leaseId: active.leaseId,
        receipt: "dispatch",
      }),
      event(4, "state-transitioned", {
        taskId: "task-a",
        from: "executing",
        to: "review",
        receipt: "review bundle",
      }),
    ];
    const released = event(5, "lease-released", {
      taskId: "task-a",
      leaseId: active.leaseId,
      proof: "Review owns the immutable handoff.",
    });
    const result = replayEvents([...prefix, released]);
    expect(result.snapshot.tasks[0]).toMatchObject({
      state: "review",
      activeLease: null,
    });

    expect(() =>
      replayEvents([...prefix, released, { ...released, seq: 6, eventId: "release-2" }])
    ).toThrow(/active lease/);
  });

  it("enforces transition evidence, named owner gates, and verification fix-back receipts", () => {
    expect(() => validateTransition("executing", "review", {})).toThrow(/receipt/);
    expect(() =>
      validateTransition("verification", "executing", {
        receipt: "gate failed",
      })
    ).toThrow(/fixBack/);
    expect(() =>
      validateTransition("verification", "executing", {
        receipt: "gate failed",
        fixBack: { kind: "failed-gate", proof: "just ci failed at lint" },
      })
    ).not.toThrow();
    expect(() =>
      validateTransition("verification", "owner-gate", {
        receipt: "screenshots ready",
        ownerGate: "wrong-owner",
        requiredOwnerGate: "product-owner",
      })
    ).toThrow(/named owner gate/);
  });

  it("does not bypass a chartered owner gate when integrating", () => {
    const fixture = bootstrapFixture();
    itemAt(fixture.tasks, 0).charter.ownerGate = {
      required: true,
      name: "product-owner",
    };
    itemAt(fixture.tasks, 0).state = "verification";
    itemAt(fixture.tasks, 0).receipt = "verification receipt";

    expect(() =>
      replayEvents([
        fixture,
        event(2, "state-transitioned", {
          taskId: "task-a",
          from: "verification",
          to: "integrated",
          receipt: "attempted bypass",
        }),
      ])
    ).toThrow(/owner-gate/);
  });
});

describe("Program Supervisor deterministic event coverage", () => {
  it("projects reconciliation, evidence, rulings, owner gates, no-frontier, authority, provisioning, heartbeat, and cleanup", () => {
    const fixture = bootstrapFixture();
    itemAt(fixture.tasks, 0).charter.ownerGate = {
      required: true,
      name: "product-owner",
    };
    const active = lease("task-a");
    const events = [
      fixture,
      acquire(2, active),
      event(3, "dispatch-recorded", {
        taskId: "task-a",
        leaseId: active.leaseId,
        receipt: "dispatch",
      }),
      event(4, "state-transitioned", {
        taskId: "task-a",
        from: "executing",
        to: "review",
        receipt: "independent review r1",
      }),
      event(5, "task-reconciled", {
        taskId: "task-a",
        repository: REPOSITORY,
        worktree: "/worktrees/task-a",
        branch: "feat/task-a",
        previousBaseSha: SHA_B,
        previousHeadSha: SHA_B,
        baseSha: SHA_D,
        headSha: SHA_E,
        proof: "git rev-parse and clean status receipt",
      }),
      event(6, "evidence-recorded", {
        taskId: "task-a",
        evidence: { id: "evidence-review", kind: "review", receipt: "review r1 pass" },
      }),
      event(7, "ruling-recorded", {
        ruling: {
          id: "ruling-1",
          taskId: "task-a",
          decision: "Keep the narrow cache.",
          receipt: "Architecture authority checked.",
        },
      }),
      event(8, "no-frontier-recorded", {
        wayfinder: "automation-first",
        receipt: "All safe automation-first frontiers are leased.",
      }),
      event(9, "supervisor-provisioned", {
        threadId: "thread-supervisor",
        hostId: "host-local",
        receipt: "Supervisor task created paused.",
      }),
      event(10, "heartbeat-activated", {
        automationId: "automation-heartbeat",
        threadId: "thread-supervisor",
        receipt: "Heartbeat activated after provisioning.",
      }),
      event(11, "authority-reconciled", {
        previousMainSha: SHA_B,
        mainSha: SHA_C,
        changes: [{ path: LEASE_OWNER_PATH, previousBlob: SHA_A, blob: SHA_F }],
        proof: "Authority blobs resolved at the new main SHA.",
      }),
      event(12, "state-transitioned", {
        taskId: "task-a",
        from: "review",
        to: "verification",
        receipt: "review r1 passed",
      }),
      event(13, "owner-gate-recorded", {
        taskId: "task-a",
        gate: "product-owner",
        decision: "approved",
        receipt: "Owner approved curated screenshots.",
      }),
      event(14, "state-transitioned", {
        taskId: "task-a",
        from: "verification",
        to: "owner-gate",
        receipt: "verification gates passed",
        ownerGate: "product-owner",
      }),
      event(15, "state-transitioned", {
        taskId: "task-a",
        from: "owner-gate",
        to: "integrated",
        receipt: "remote SHA and owner approval proven",
      }),
      event(16, "cleanup-recorded", {
        taskId: "task-a",
        removed: ["worktree", "branch"],
        remoteProof: "origin/main contains the reviewed SHA",
        recoveryProof: null,
      }),
    ];

    const result = replayEvents(events);
    const task = itemAt(result.snapshot.tasks, 0);
    expect(task).toMatchObject({
      state: "integrated",
      updatedAt: "2026-08-26T16:00:00.000Z",
      cleanup: {
        removed: ["worktree", "branch"],
        remoteProof: "origin/main contains the reviewed SHA",
        recoveryProof: null,
      },
    });
    expect(task.charter.ownership).toMatchObject({ baseSha: SHA_D, headSha: SHA_E });
    expect(task.evidence).toContainEqual({
      id: "evidence-review",
      kind: "review",
      receipt: "review r1 pass",
    });
    expect(result.snapshot.rulings).toHaveLength(1);
    expect(result.snapshot.noFrontiers).toHaveLength(1);
    expect(result.snapshot.ownerGates).toHaveLength(1);
    expect(result.snapshot.supervisor).toMatchObject({ threadId: "thread-supervisor" });
    expect(result.snapshot.heartbeat).toMatchObject({
      automationId: "automation-heartbeat",
    });
    expect(result.snapshot.authority).toMatchObject({ mainSha: SHA_C });
    expect(result.snapshot.authority.testPortfolioRoadmap).toEqual({
      path: LEASE_OWNER_PATH,
      blob: SHA_F,
    });
    expect(itemAt(result.leases.leases, 0).authorityPointer).toEqual(
      authorityPointer(SHA_F, SHA_C)
    );
  });

  it("rejects reconciliation without exact Git/worktree evidence", () => {
    expect(() =>
      replayEvents([
        bootstrapFixture(),
        event(2, "task-reconciled", {
          taskId: "task-a",
          repository: REPOSITORY,
          worktree: "/worktrees/other",
          branch: "feat/task-a",
          previousBaseSha: SHA_B,
          previousHeadSha: SHA_B,
          baseSha: SHA_D,
          headSha: SHA_E,
          proof: "git receipt",
        }),
      ])
    ).toThrow(/worktree.*charter/);
  });

  it("requires reconciliation after a verification fix-back before review resumes", () => {
    const active = lease("task-a");
    const prefix = [
      bootstrapFixture(),
      acquire(2, active),
      event(3, "dispatch-recorded", {
        taskId: "task-a",
        leaseId: active.leaseId,
        receipt: "dispatch",
      }),
      event(4, "state-transitioned", {
        taskId: "task-a",
        from: "executing",
        to: "review",
        receipt: "review",
      }),
      event(5, "state-transitioned", {
        taskId: "task-a",
        from: "review",
        to: "verification",
        receipt: "review passed",
      }),
      event(6, "state-transitioned", {
        taskId: "task-a",
        from: "verification",
        to: "executing",
        receipt: "verification failed",
        fixBack: { kind: "failed-gate", proof: "typecheck failed" },
      }),
    ];
    const prematureReview = event(7, "state-transitioned", {
      taskId: "task-a",
      from: "executing",
      to: "review",
      receipt: "review r2",
    });
    expect(() => replayEvents([...prefix, prematureReview])).toThrow(/task-reconciled/);

    const reconciled = event(7, "task-reconciled", {
      taskId: "task-a",
      repository: REPOSITORY,
      worktree: "/worktrees/task-a",
      branch: "feat/task-a",
      previousBaseSha: SHA_B,
      previousHeadSha: SHA_B,
      baseSha: SHA_D,
      headSha: SHA_E,
      proof: "changed HEAD after failed gate fix",
    });
    expect(() =>
      replayEvents([...prefix, reconciled, { ...prematureReview, seq: 8 }])
    ).not.toThrow();
  });

  it("fails cleanup before a terminal state or without remote/recovery proof", () => {
    const cleanup = event(2, "cleanup-recorded", {
      taskId: "task-a",
      removed: ["worktree", "branch"],
      remoteProof: "remote",
      recoveryProof: null,
    });
    expect(() => replayEvents([bootstrapFixture(), cleanup])).toThrow(
      /integrated or retired/
    );

    const fixture = bootstrapFixture();
    itemAt(fixture.tasks, 0).state = "integrated";
    itemAt(fixture.tasks, 0).receipt = "integration proof";
    const noProof = clone(cleanup);
    (noProof as Record<string, unknown>).remoteProof = null;
    expect(() => replayEvents([fixture, noProof])).toThrow(/remote or recovery proof/);
  });
});
