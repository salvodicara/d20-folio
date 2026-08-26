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
const SECOND_LEASE_OWNER_PATH = "docs/SECOND_REPOSITORY_LEASES.md";
const OPERATING_MODEL_PATH =
  "docs/plans/2026-08-25-agent-first-operating-model-design.md";
const AUTOMATION_WAYFINDER_PATH =
  "docs/superpowers/plans/2026-08-25-automation-first-wayfinder.md";
const TACTICAL_WAYFINDER_PATH =
  "docs/superpowers/plans/2026-08-25-tactical-codex-ui-ux-wayfinder.md";
const TEST_ROADMAP_PATH = "docs/superpowers/plans/2026-08-25-test-portfolio-reset.md";
const READINESS_BASELINE_PATH =
  "docs/superpowers/plans/2026-08-25-g0-automation-readiness.md";
const STATUS_OWNER_PATH = "docs/PROGRAM_STATUS.md";
const LEASE_ID = "F0";
const CONTROLLER_WRITER_ID = "program-supervisor-bootstrap-controller";
const SUPERVISOR_THREAD_ID = "thread-supervisor";

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

function dependency(
  taskId: string,
  integratedSha = SHA_B,
  requiredInterface = "program-supervisor:command-surface"
) {
  return { taskId, integratedSha, requiredInterface };
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
        path: OPERATING_MODEL_PATH,
        blob: SHA_C,
      },
      { path: LEASE_OWNER_PATH, blob: SHA_A },
    ],
    dependencies: [] as ReturnType<typeof dependency>[],
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
    writerId: CONTROLLER_WRITER_ID,
    at: "2026-08-26T00:00:00.000Z",
    authority: {
      mainSha: SHA_B,
      operatingModel: {
        path: OPERATING_MODEL_PATH,
        blob: SHA_C,
      },
      productWayfinders: [
        { path: AUTOMATION_WAYFINDER_PATH, blob: SHA_D },
        { path: TACTICAL_WAYFINDER_PATH, blob: SHA_E },
      ],
      testPortfolioRoadmap: { path: TEST_ROADMAP_PATH, blob: SHA_E },
      readinessBaseline: { path: READINESS_BASELINE_PATH, blob: SHA_F },
      repositoryLeaseOwners: [{ path: LEASE_OWNER_PATH, blob: SHA_A }],
      statusOwner: { path: STATUS_OWNER_PATH, blob: SHA_D },
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
  writerId: string;
  at: string;
} & T {
  return {
    schemaVersion: 1,
    eventId: `event-${seq}-${type}`,
    seq,
    type,
    writerId: CONTROLLER_WRITER_ID,
    at,
    ...fields,
  };
}

function provisionedIdentity() {
  return {
    taskTitle: "d20 Folio Program Supervisor",
    savedProjectId: "project-d20-folio",
    threadId: SUPERVISOR_THREAD_ID,
    hostId: "host-local",
    marker: `d20-folio-program-supervisor:v1:${SHA_C}`,
    automationId: "automation-heartbeat",
    automationName: "d20 Folio Program Supervisor heartbeat",
    cadenceMinutes: 30,
    targetThreadId: SUPERVISOR_THREAD_ID,
    destination: "thread",
    notificationPolicy: "failed_runs_only",
    status: "PAUSED",
    receipt: "Exact paused task and heartbeat identity verified.",
  };
}

function activationProof() {
  return {
    automationId: "automation-heartbeat",
    threadId: SUPERVISOR_THREAD_ID,
    finalMainSha: SHA_B,
    statusOwner: { path: STATUS_OWNER_PATH, blob: SHA_D },
    repositoryLeaseOwners: [{ path: LEASE_OWNER_PATH, blob: SHA_A }],
    rebuildProof: "Ledger and both caches rebuilt and validated.",
    cleanupPendingProof: "Integrated clean Foundation checkout retained for handoff.",
    receipt: "Exact active heartbeat observed before irreversible ledger handoff.",
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
    termStartedAt: "2026-08-26T02:00:00.000Z",
    expiresAt: options.expiresAt ?? "2026-08-26T20:00:00.000Z",
    authorityPointer: options.pointer ?? authorityPointer(),
  };
}

function acquire(seq: number, value: ReturnType<typeof lease>) {
  return event(seq, "lease-acquired", { lease: value }, value.acquiredAt);
}

describe("Program Supervisor untrusted-data schemas", () => {
  it("requires distinct, non-empty, globally unique repository lease-owner authorities", () => {
    const missing = bootstrapFixture() as unknown as {
      authority: Record<string, unknown>;
    };
    delete missing.authority.repositoryLeaseOwners;
    expect(() => validateEventInput(missing)).toThrow(/repositoryLeaseOwners|missing/i);

    const empty = bootstrapFixture();
    empty.authority.repositoryLeaseOwners = [];
    expect(() => validateEventInput(empty)).toThrow(/repositoryLeaseOwners|non-empty/i);

    const duplicateOwner = bootstrapFixture();
    duplicateOwner.authority.repositoryLeaseOwners.push({
      path: LEASE_OWNER_PATH,
      blob: SHA_A,
    });
    expect(() => validateEventInput(duplicateOwner)).toThrow(/unique|duplicate/i);

    const duplicateRole = bootstrapFixture();
    duplicateRole.authority.repositoryLeaseOwners[0] = {
      ...duplicateRole.authority.statusOwner,
    };
    expect(() => validateEventInput(duplicateRole)).toThrow(/authority paths|duplicate/i);

    const unmanifested = bootstrapFixture();
    unmanifested.authority.repositoryLeaseOwners[0] = {
      path: "docs/OTHER_LEASE_OWNER.md",
      blob: SHA_A,
    };
    expect(() => validateEventInput(unmanifested)).toThrow(
      /repository authority.*global manifest/i
    );
  });

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

  it("rejects a charter owner that appears only in a non-owner manifest role", () => {
    const fixture = bootstrapFixture();
    fixture.authority.testPortfolioRoadmap = {
      path: LEASE_OWNER_PATH,
      blob: SHA_A,
    };
    fixture.authority.repositoryLeaseOwners = [
      { path: SECOND_LEASE_OWNER_PATH, blob: SHA_E },
    ];

    expect(() => validateEventInput(fixture)).toThrow(
      /repository authority.*declared lease-owner/i
    );
  });

  it("lets a second declared lease owner govern a charter, active lease, and cache", () => {
    const fixture = bootstrapFixture();
    fixture.authority.repositoryLeaseOwners.push({
      path: SECOND_LEASE_OWNER_PATH,
      blob: SHA_E,
    });
    const secondTask = itemAt(fixture.tasks, 1);
    itemAt(secondTask.charter.authority, 1).path = SECOND_LEASE_OWNER_PATH;
    itemAt(secondTask.charter.authority, 1).blob = SHA_E;
    secondTask.charter.ownership.repositoryLease = {
      id: "K1",
      ownerDocumentPath: SECOND_LEASE_OWNER_PATH,
      ownerDocumentBlob: SHA_E,
      mainSha: SHA_B,
    };
    secondTask.state = "leased";
    const active = lease("task-b", "writer", {
      leaseId: "runtime-task-b-k1",
      pointer: {
        repository: REPOSITORY,
        ownerDocumentPath: SECOND_LEASE_OWNER_PATH,
        repositoryLeaseId: "K1",
        reconciledOwnerBlob: SHA_E,
        reconciledMainSha: SHA_B,
      },
    });
    active.acquiredAt = fixture.at;
    active.termStartedAt = fixture.at;
    fixture.activeLeases.push(active);

    const result = replayEvents([fixture]);

    expect(itemAt(result.snapshot.tasks, 1).activeLease?.authorityPointer).toEqual(
      active.authorityPointer
    );
    expect(itemAt(result.leases.leases, 0).authorityPointer).toEqual(
      active.authorityPointer
    );
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

  it("requires absolute normalized repository/worktree paths and a safe Git branch", () => {
    const invalidValues = [
      ["repository", "repo/d20-folio"],
      ["repository", "/repo/../repo/d20-folio"],
      ["worktree", "worktrees/task-a"],
      ["worktree", "/worktrees/../task-a"],
      ["branch", "../main"],
      ["branch", "feat/with space"],
      ["branch", "feat//task-a"],
      ["branch", "feat/.hidden"],
      ["branch", "feat/task-a."],
      ["branch", "feat/task-a.lock"],
      ["branch", "feat/@{task-a}"],
      ["branch", "feat/\u0001task-a"],
      ["branch", "HEAD"],
    ] as const;

    for (const [field, value] of invalidValues) {
      const fixture = bootstrapFixture();
      itemAt(fixture.tasks, 0).charter.ownership[field] = value;
      expect(
        () => validateEventInput(fixture),
        `${field}=${JSON.stringify(value)}`
      ).toThrow(/absolute normalized path|safe normalized Git branch/);
    }
  });

  it("validates structured dependency identities, SHAs, interfaces, and unique task IDs", () => {
    const valid = bootstrapFixture();
    itemAt(valid.tasks, 0).charter.dependencies = [dependency("task-b")];
    expect(() => validateEventInput(valid)).not.toThrow();

    const duplicate = bootstrapFixture();
    itemAt(duplicate.tasks, 0).charter.dependencies = [
      dependency("task-b"),
      dependency("task-b", SHA_C, "program-supervisor:second-interface"),
    ];
    expect(() => validateEventInput(duplicate)).toThrow(/duplicate dependency task/i);

    const uppercaseSha = bootstrapFixture();
    itemAt(uppercaseSha.tasks, 0).charter.dependencies = [
      dependency("task-b", "B".repeat(40)),
    ];
    expect(() => validateEventInput(uppercaseSha)).toThrow(/40 lowercase hexadecimal/);

    const unstableInterface = bootstrapFixture();
    itemAt(unstableInterface.tasks, 0).charter.dependencies = [
      dependency("task-b", SHA_B, "interface with spaces"),
    ];
    expect(() => validateEventInput(unstableInterface)).toThrow(/stable identifier/);
  });

  it("requires termStartedAt and bounds the current lease term", () => {
    const missingTerm = clone(lease("task-a")) as Record<string, unknown>;
    delete missingTerm.termStartedAt;
    expect(() =>
      replayEvents([
        bootstrapFixture(),
        event(2, "lease-acquired", { lease: missingTerm }, "2026-08-26T02:00:00.000Z"),
      ])
    ).toThrow(/termStartedAt/);

    const mismatchedTerm = {
      ...lease("task-a"),
      termStartedAt: "2026-08-26T03:00:00.000Z",
    };
    expect(() => replayEvents([bootstrapFixture(), acquire(2, mismatchedTerm)])).toThrow(
      /acquisition time.*termStartedAt/i
    );

    const unboundedTerm = {
      ...lease("task-a", "writer", { expiresAt: "2026-08-27T02:00:00.001Z" }),
      termStartedAt: "2026-08-26T02:00:00.000Z",
    };
    expect(() => replayEvents([bootstrapFixture(), acquire(2, unboundedTerm)])).toThrow(
      /24 hours.*current term/i
    );
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

describe("Program Supervisor structured task prerequisites", () => {
  function dependentFixture(dependencySha = SHA_B) {
    const fixture = bootstrapFixture();
    const prerequisite = itemAt(fixture.tasks, 1);
    prerequisite.state = "integrated";
    prerequisite.receipt = "task-b integrated at its charter head";
    itemAt(fixture.tasks, 0).charter.dependencies = [dependency("task-b", dependencySha)];
    return fixture;
  }

  it("leases only after every exact dependency SHA and interface is integrated", () => {
    const readyLease = {
      ...lease("task-a"),
      termStartedAt: "2026-08-26T02:00:00.000Z",
    };
    expect(() =>
      replayEvents([dependentFixture(), acquire(2, readyLease)])
    ).not.toThrow();

    const unintegrated = dependentFixture();
    itemAt(unintegrated.tasks, 1).state = "queued";
    itemAt(unintegrated.tasks, 1).receipt = null;
    expect(() => replayEvents([unintegrated, acquire(2, readyLease)])).toThrow(
      /dependency task-b.*integrated or retired/i
    );

    expect(() => replayEvents([dependentFixture(SHA_C), acquire(2, readyLease)])).toThrow(
      /dependency task-b.*integrated SHA/i
    );
  });

  it("rechecks dependency identity at dispatch after a leased prerequisite changes", () => {
    const readyLease = {
      ...lease("task-a"),
      termStartedAt: "2026-08-26T02:00:00.000Z",
    };
    const changedPrerequisite = event(3, "task-reconciled", {
      taskId: "task-b",
      repository: REPOSITORY,
      worktree: "/worktrees/task-b",
      branch: "feat/task-b",
      previousBaseSha: SHA_B,
      previousHeadSha: SHA_B,
      baseSha: SHA_B,
      headSha: SHA_C,
      proof: "task-b advanced after task-a acquired its lease",
    });
    const dispatch = event(4, "dispatch-recorded", {
      taskId: "task-a",
      leaseId: "runtime-task-a",
      receipt: "dispatch must recheck dependencies",
    });

    expect(() =>
      replayEvents([
        dependentFixture(),
        acquire(2, readyLease),
        changedPrerequisite,
        dispatch,
      ])
    ).toThrow(/dependency task-b.*integrated SHA/i);
  });

  it("renews from hour one through hour twenty-five without losing acquisition evidence", () => {
    const active = {
      ...lease("task-a", "writer", { expiresAt: "2026-08-27T02:00:00.000Z" }),
      termStartedAt: "2026-08-26T02:00:00.000Z",
    };
    const renewed = event(
      3,
      "lease-renewed",
      {
        taskId: "task-a",
        leaseId: active.leaseId,
        holder: active.holder,
        agentId: active.agentId,
        role: active.role,
        readOnly: active.readOnly,
        previousExpiresAt: active.expiresAt,
        expiresAt: "2026-08-27T03:00:00.000Z",
        authorityPointer: active.authorityPointer,
        proof: "renew at hour one through hour twenty-five",
      },
      "2026-08-26T03:00:00.000Z"
    );

    const result = replayEvents([bootstrapFixture(), acquire(2, active), renewed]);
    expect(itemAt(result.snapshot.tasks, 0).activeLease).toMatchObject({
      acquiredAt: "2026-08-26T02:00:00.000Z",
      termStartedAt: "2026-08-26T03:00:00.000Z",
      expiresAt: "2026-08-27T03:00:00.000Z",
    });

    const unbounded = clone(renewed);
    unbounded.expiresAt = "2026-08-27T03:00:00.001Z";
    expect(() =>
      replayEvents([bootstrapFixture(), acquire(2, active), unbounded])
    ).toThrow(/24 hours.*renewal|24 hours.*current term/i);
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

  it("rejects bootstrap and created-task repository authority that diverges from the manifest", () => {
    const bootstrap = bootstrapFixture();
    itemAt(bootstrap.authority.repositoryLeaseOwners, 0).blob = SHA_C;
    expect(() => validateEventInput(bootstrap)).toThrow(/global.*authority|manifest/i);

    const successor = bootstrapTask("task-successor", "scripts/successor");
    itemAt(successor.charter.authority, 1).blob = SHA_C;
    successor.charter.ownership.repositoryLease.ownerDocumentBlob = SHA_C;
    expect(() =>
      replayEvents([bootstrapFixture(), event(2, "task-created", { task: successor })])
    ).toThrow(/global.*authority|manifest/i);
  });

  it("rejects stale shared repository lease pointers", () => {
    const fixture = bootstrapFixture();
    const firstTask = itemAt(fixture.tasks, 0);
    const secondTask = itemAt(fixture.tasks, 1);
    firstTask.state = "leased";
    secondTask.state = "leased";
    secondTask.charter.ownership.repositoryLease.mainSha = SHA_C;
    const first = lease("task-a");
    first.acquiredAt = fixture.at;
    first.termStartedAt = fixture.at;
    const second = lease("task-b", "writer", {
      pointer: authorityPointer(SHA_A, SHA_C),
    });
    second.acquiredAt = fixture.at;
    second.termStartedAt = fixture.at;
    fixture.activeLeases.push(first, second);

    expect(() => validateEventInput(fixture)).toThrow(
      /owner document.*epoch|repository authority/i
    );
  });

  it("rejects divergent F0/F1 epochs governed by the same bootstrap owner document", () => {
    const fixture = bootstrapFixture();
    const secondLease = itemAt(fixture.tasks, 1).charter.ownership.repositoryLease;
    secondLease.id = "F1";
    secondLease.mainSha = SHA_C;

    expect(() => validateEventInput(fixture)).toThrow(/owner document.*epoch/i);
  });

  it("rejects a created task that invents a new lease ID epoch for the same owner document", () => {
    const successor = bootstrapTask("task-successor", "scripts/successor");
    successor.charter.ownership.repositoryLease.id = "F1";
    successor.charter.ownership.repositoryLease.mainSha = SHA_C;

    expect(() =>
      replayEvents([bootstrapFixture(), event(2, "task-created", { task: successor })])
    ).toThrow(/owner document.*epoch/i);
  });

  it("accepts coherent distinct lease IDs governed by the same owner document", () => {
    const fixture = bootstrapFixture();
    itemAt(fixture.tasks, 1).charter.ownership.repositoryLease.id = "F1";

    const result = replayEvents([fixture]);
    expect(
      result.snapshot.tasks.map(
        ({ charter: projectedCharter }) => projectedCharter.ownership.repositoryLease.id
      )
    ).toEqual(["F0", "F1", "F0"]);
    for (const task of result.snapshot.tasks) {
      expect(task.charter.ownership.repositoryLease).toMatchObject({
        ownerDocumentPath: LEASE_OWNER_PATH,
        ownerDocumentBlob: SHA_A,
        mainSha: SHA_B,
      });
    }
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
      acquire(3, {
        ...lease("task-b"),
        acquiredAt: "2026-08-26T03:00:00.000Z",
        termStartedAt: "2026-08-26T03:00:00.000Z",
      }),
      acquire(4, {
        ...lease("task-evaluator", "evaluator"),
        acquiredAt: "2026-08-26T04:00:00.000Z",
        termStartedAt: "2026-08-26T04:00:00.000Z",
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
      acquire(3, {
        ...lease("task-b"),
        acquiredAt: "2026-08-26T03:00:00.000Z",
        termStartedAt: "2026-08-26T03:00:00.000Z",
      }),
    ];
    expect(() =>
      replayEvents([
        ...twoWriters,
        acquire(4, {
          ...lease("task-evaluator"),
          acquiredAt: "2026-08-26T04:00:00.000Z",
          termStartedAt: "2026-08-26T04:00:00.000Z",
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
          termStartedAt: "2026-08-26T03:00:00.000Z",
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
        acquire(3, {
          ...lease("task-b"),
          acquiredAt: "2026-08-26T03:00:00.000Z",
          termStartedAt: "2026-08-26T03:00:00.000Z",
        }),
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
        acquire(3, {
          ...lease("task-b"),
          acquiredAt: "2026-08-26T03:00:00.000Z",
          termStartedAt: "2026-08-26T03:00:00.000Z",
        }),
      ])
    ).toThrow(/overlap.*scripts/i);
  });

  it.each(["scripts/**/**", "scripts/**/generated", "scripts/*/generated"])(
    "rejects malformed ownership wildcard %s",
    (path) => {
      const fixture = bootstrapFixture();
      itemAt(fixture.tasks, 0).charter.ownership.paths = [path];
      expect(() => validateEventInput(fixture)).toThrow(/normalized.*path|wildcard/);
    }
  );

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

  it("renews only an active unchanged identity and globally reconciled pointer", () => {
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
        authorityPointer: authorityPointer(),
        proof: "The globally reconciled authority pointer is unchanged.",
      },
      "2026-08-26T03:00:00.000Z"
    );
    const result = replayEvents([bootstrapFixture(), acquire(2, acquired), renewal]);

    expect(result.snapshot.wip).toEqual({ writers: 1, evaluators: 0 });
    expect(result.leases.leases[0]).toEqual({
      taskId: "task-a",
      expiresAt: "2026-08-27T02:00:00.000Z",
      authorityPointer: authorityPointer(),
    });

    const splitAuthority = clone(renewal);
    splitAuthority.authorityPointer = authorityPointer(SHA_C, SHA_D);
    expect(() =>
      replayEvents([bootstrapFixture(), acquire(2, acquired), splitAuthority])
    ).toThrow(/authority-reconciled|globally reconciled pointer/);

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

  it("does not let one of two leases split their shared repository authority", () => {
    const first = lease("task-a");
    const second = {
      ...lease("task-b"),
      acquiredAt: "2026-08-26T03:00:00.000Z",
      termStartedAt: "2026-08-26T03:00:00.000Z",
    };
    const splitRenewal = event(
      4,
      "lease-renewed",
      {
        taskId: "task-a",
        leaseId: first.leaseId,
        holder: first.holder,
        agentId: first.agentId,
        role: first.role,
        readOnly: first.readOnly,
        previousExpiresAt: first.expiresAt,
        expiresAt: "2026-08-27T02:00:00.000Z",
        authorityPointer: authorityPointer(SHA_C, SHA_D),
        proof: "Attempted one-sided owner advancement.",
      },
      "2026-08-26T04:00:00.000Z"
    );

    expect(() =>
      replayEvents([
        bootstrapFixture(),
        acquire(2, first),
        acquire(3, second),
        splitRenewal,
      ])
    ).toThrow(/authority-reconciled|globally reconciled pointer/);
  });

  it("reconciles shared owner identity across manifest, charters, leases, and cache atomically", () => {
    const first = lease("task-a");
    const second = {
      ...lease("task-b"),
      acquiredAt: "2026-08-26T03:00:00.000Z",
      termStartedAt: "2026-08-26T03:00:00.000Z",
    };
    const result = replayEvents([
      bootstrapFixture(),
      acquire(2, first),
      acquire(3, second),
      event(4, "authority-reconciled", {
        previousMainSha: SHA_B,
        mainSha: SHA_D,
        changes: [{ path: LEASE_OWNER_PATH, previousBlob: SHA_A, blob: SHA_C }],
        proof: "Every shared repository owner pointer reconciled together.",
      }),
    ]);

    expect(result.snapshot.authority).toMatchObject({
      mainSha: SHA_D,
      repositoryLeaseOwners: [{ path: LEASE_OWNER_PATH, blob: SHA_C }],
    });
    for (const projectedTask of result.snapshot.tasks) {
      expect(projectedTask.charter.ownership.repositoryLease).toMatchObject({
        ownerDocumentBlob: SHA_C,
        mainSha: SHA_D,
      });
      if (projectedTask.activeLease) {
        expect(projectedTask.activeLease.authorityPointer).toEqual(
          authorityPointer(SHA_C, SHA_D)
        );
      }
    }
    expect(result.leases.leases.map(({ authorityPointer }) => authorityPointer)).toEqual([
      authorityPointer(SHA_C, SHA_D),
      authorityPointer(SHA_C, SHA_D),
    ]);
  });

  it("reconciles every distinct lease ID governed by the changed owner document", () => {
    const fixture = bootstrapFixture();
    itemAt(fixture.tasks, 1).charter.ownership.repositoryLease.id = "F1";
    const first = lease("task-a");
    const second = {
      ...lease("task-b", "writer", {
        pointer: { ...authorityPointer(), repositoryLeaseId: "F1" },
      }),
      acquiredAt: "2026-08-26T03:00:00.000Z",
      termStartedAt: "2026-08-26T03:00:00.000Z",
    };
    const result = replayEvents([
      fixture,
      acquire(2, first),
      acquire(3, second),
      event(4, "authority-reconciled", {
        previousMainSha: SHA_B,
        mainSha: SHA_D,
        changes: [{ path: LEASE_OWNER_PATH, previousBlob: SHA_A, blob: SHA_C }],
        proof: "The owner document governs both F0 and F1 epochs.",
      }),
    ]);

    expect(
      result.snapshot.tasks.map(({ charter: projectedCharter }) => ({
        id: projectedCharter.ownership.repositoryLease.id,
        blob: projectedCharter.ownership.repositoryLease.ownerDocumentBlob,
        mainSha: projectedCharter.ownership.repositoryLease.mainSha,
      }))
    ).toEqual([
      { id: "F0", blob: SHA_C, mainSha: SHA_D },
      { id: "F1", blob: SHA_C, mainSha: SHA_D },
      { id: "F0", blob: SHA_C, mainSha: SHA_D },
    ]);
    expect(result.leases.leases.map(({ authorityPointer }) => authorityPointer)).toEqual([
      authorityPointer(SHA_C, SHA_D),
      {
        ...authorityPointer(SHA_C, SHA_D),
        repositoryLeaseId: "F1",
      },
    ]);
  });

  it("advances global main for a non-owner authority without advancing repository lease pointers", () => {
    const first = lease("task-a");
    const second = {
      ...lease("task-b"),
      acquiredAt: "2026-08-26T03:00:00.000Z",
      termStartedAt: "2026-08-26T03:00:00.000Z",
    };
    const result = replayEvents([
      bootstrapFixture(),
      acquire(2, first),
      acquire(3, second),
      event(4, "authority-reconciled", {
        previousMainSha: SHA_B,
        mainSha: SHA_C,
        changes: [{ path: READINESS_BASELINE_PATH, previousBlob: SHA_F, blob: SHA_D }],
        proof: "Only the status authority changed at the new main SHA.",
      }),
    ]);

    expect(result.snapshot.authority).toMatchObject({
      mainSha: SHA_C,
      readinessBaseline: { path: READINESS_BASELINE_PATH, blob: SHA_D },
    });
    for (const projectedTask of result.snapshot.tasks) {
      expect(projectedTask.charter.ownership.repositoryLease).toMatchObject({
        ownerDocumentBlob: SHA_A,
        mainSha: SHA_B,
      });
      if (projectedTask.activeLease) {
        expect(projectedTask.activeLease.authorityPointer).toEqual(authorityPointer());
      }
    }
    expect(result.leases.leases.map(({ authorityPointer }) => authorityPointer)).toEqual([
      authorityPointer(),
      authorityPointer(),
    ]);
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

  it.each(["leased", "executing"] as const)(
    "atomically blocks %s work and releases its WIP lease",
    (state) => {
      const active = lease("task-a");
      const prefix: unknown[] = [bootstrapFixture(), acquire(2, active)];
      if (state === "executing") {
        prefix.push(
          event(3, "dispatch-recorded", {
            taskId: "task-a",
            leaseId: active.leaseId,
            receipt: "dispatch",
          })
        );
      }
      const result = replayEvents([
        ...prefix,
        event(prefix.length + 1, "state-transitioned", {
          taskId: "task-a",
          from: state,
          to: "blocked-with-evidence",
          receipt: `${state} worktree and patch preserved`,
        }),
      ]);

      expect(itemAt(result.snapshot.tasks, 0)).toMatchObject({
        state: "blocked-with-evidence",
        receipt: `${state} worktree and patch preserved`,
        activeLease: null,
      });
      expect(result.snapshot.wip).toEqual({ writers: 0, evaluators: 0 });
      expect(result.leases.leases).toEqual([]);
    }
  );

  it("requires fresh lease acquisition after an evidenced blocker", () => {
    const active = lease("task-a");
    const blocked = [
      bootstrapFixture(),
      acquire(2, active),
      event(3, "state-transitioned", {
        taskId: "task-a",
        from: "leased",
        to: "blocked-with-evidence",
        receipt: "leased worktree and patch preserved",
      }),
    ];
    const stale = {
      ...active,
      acquiredAt: "2026-08-26T04:00:00.000Z",
      termStartedAt: "2026-08-26T04:00:00.000Z",
    };
    expect(() => replayEvents([...blocked, acquire(4, stale)])).toThrow(
      /duplicate lease ID|stale lease/i
    );

    const fresh = lease("task-a", "writer", {
      leaseId: "runtime-task-a-reacquired",
    });
    fresh.acquiredAt = "2026-08-26T04:00:00.000Z";
    fresh.termStartedAt = "2026-08-26T04:00:00.000Z";
    const reacquired = replayEvents([...blocked, acquire(4, fresh)]);
    expect(itemAt(reacquired.snapshot.tasks, 0)).toMatchObject({
      state: "leased",
      activeLease: { leaseId: "runtime-task-a-reacquired" },
    });
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

  it("records owner-gate decisions only while the named task is awaiting that gate", () => {
    const fixture = bootstrapFixture();
    itemAt(fixture.tasks, 0).charter.ownerGate = {
      required: true,
      name: "product-owner",
    };

    expect(() =>
      replayEvents([
        fixture,
        event(2, "owner-gate-recorded", {
          taskId: "task-a",
          gate: "product-owner",
          decision: "approved",
          receipt: "Stale approval outside verification.",
        }),
      ])
    ).toThrow(/verification|awaiting/i);
  });

  it("rejects duplicate gate decisions and honors the latest rejection", () => {
    const fixture = bootstrapFixture();
    const task = itemAt(fixture.tasks, 0);
    task.charter.ownerGate = { required: true, name: "product-owner" };
    task.state = "verification";
    task.receipt = "verification complete";
    const approved = event(2, "owner-gate-recorded", {
      taskId: "task-a",
      gate: "product-owner",
      decision: "approved",
      receipt: "Owner approval A.",
    });

    expect(() =>
      replayEvents([
        fixture,
        approved,
        { ...approved, seq: 3, eventId: "event-3-owner-gate-recorded" },
      ])
    ).toThrow(/duplicate.*decision/i);

    expect(() =>
      replayEvents([
        fixture,
        approved,
        event(3, "owner-gate-recorded", {
          taskId: "task-a",
          gate: "product-owner",
          decision: "rejected",
          receipt: "Owner rejection supersedes approval A.",
        }),
        event(4, "state-transitioned", {
          taskId: "task-a",
          from: "verification",
          to: "owner-gate",
          receipt: "Attempted stale approval reuse.",
          ownerGate: "product-owner",
        }),
      ])
    ).toThrow(/latest.*approved|rejected/i);
  });

  it("does not reuse an approval from an earlier verification cycle", () => {
    const fixture = bootstrapFixture();
    const task = itemAt(fixture.tasks, 0);
    task.charter.ownerGate = { required: true, name: "product-owner" };
    task.state = "verification";
    task.receipt = "verification cycle one";
    const active = lease("task-a");
    active.acquiredAt = fixture.at;
    active.termStartedAt = fixture.at;
    fixture.activeLeases.push(active);

    expect(() =>
      replayEvents([
        fixture,
        event(2, "owner-gate-recorded", {
          taskId: "task-a",
          gate: "product-owner",
          decision: "approved",
          receipt: "Cycle one approval.",
        }),
        event(3, "state-transitioned", {
          taskId: "task-a",
          from: "verification",
          to: "executing",
          receipt: "Cycle one verification failed.",
          fixBack: { kind: "failed-gate", proof: "typecheck failed" },
        }),
        event(4, "task-reconciled", {
          taskId: "task-a",
          repository: REPOSITORY,
          worktree: "/worktrees/task-a",
          branch: "feat/task-a",
          previousBaseSha: SHA_B,
          previousHeadSha: SHA_B,
          baseSha: SHA_B,
          headSha: SHA_E,
          proof: "Fix commit changed HEAD.",
        }),
        event(5, "state-transitioned", {
          taskId: "task-a",
          from: "executing",
          to: "review",
          receipt: "review cycle two",
        }),
        event(6, "state-transitioned", {
          taskId: "task-a",
          from: "review",
          to: "verification",
          receipt: "verification cycle two",
        }),
        event(7, "state-transitioned", {
          taskId: "task-a",
          from: "verification",
          to: "owner-gate",
          receipt: "Attempted cycle one approval reuse.",
          ownerGate: "product-owner",
        }),
      ])
    ).toThrow(/current verification|latest.*approved|stale/i);
  });

  it("rejects reconciliation inside an approved verification cycle", () => {
    const fixture = bootstrapFixture();
    const task = itemAt(fixture.tasks, 0);
    task.charter.ownerGate = { required: true, name: "product-owner" };
    task.state = "verification";
    task.receipt = "verification passed for the current identities";

    expect(() =>
      replayEvents([
        fixture,
        event(2, "owner-gate-recorded", {
          taskId: "task-a",
          gate: "product-owner",
          decision: "approved",
          receipt: "Owner approved the verified identities.",
        }),
        event(3, "task-reconciled", {
          taskId: "task-a",
          repository: REPOSITORY,
          worktree: "/worktrees/task-a",
          branch: "feat/task-a",
          previousBaseSha: SHA_B,
          previousHeadSha: SHA_B,
          baseSha: SHA_B,
          headSha: SHA_E,
          proof: "HEAD changed after owner approval.",
        }),
      ])
    ).toThrow(/verification.*reconcil|fresh review/i);
  });

  it("rejects reconciliation after entering an approved owner gate", () => {
    const fixture = bootstrapFixture();
    const task = itemAt(fixture.tasks, 0);
    task.charter.ownerGate = { required: true, name: "product-owner" };
    task.state = "verification";
    task.receipt = "verification passed for the current identities";

    expect(() =>
      replayEvents([
        fixture,
        event(2, "owner-gate-recorded", {
          taskId: "task-a",
          gate: "product-owner",
          decision: "approved",
          receipt: "Owner approved the verified identities.",
        }),
        event(3, "state-transitioned", {
          taskId: "task-a",
          from: "verification",
          to: "owner-gate",
          receipt: "Entered the approved owner gate.",
          ownerGate: "product-owner",
        }),
        event(4, "task-reconciled", {
          taskId: "task-a",
          repository: REPOSITORY,
          worktree: "/worktrees/task-a",
          branch: "feat/task-a",
          previousBaseSha: SHA_B,
          previousHeadSha: SHA_B,
          baseSha: SHA_B,
          headSha: SHA_E,
          proof: "HEAD changed after entering the owner gate.",
        }),
      ])
    ).toThrow(/owner-gate.*reconcil|fresh review/i);
  });
});

describe("Program Supervisor deterministic event coverage", () => {
  it("records the bootstrap controller and requires the current writer on every later event", () => {
    const missingBootstrapWriter = clone(bootstrapFixture()) as Record<string, unknown>;
    delete missingBootstrapWriter.writerId;
    expect(() => validateEventInput(missingBootstrapWriter)).toThrow(/writerId/);

    const wrongBootstrapWriter = clone(bootstrapFixture());
    wrongBootstrapWriter.writerId = "another-controller";
    expect(() => validateEventInput(wrongBootstrapWriter)).toThrow(
      /bootstrap controller writer/i
    );

    const missingLaterWriter = clone(
      event(2, "no-frontier-recorded", {
        wayfinder: "automation-first",
        receipt: "No executable frontier.",
      })
    ) as Record<string, unknown>;
    delete missingLaterWriter.writerId;
    expect(() => replayEvents([bootstrapFixture(), missingLaterWriter])).toThrow(
      /writerId/
    );
  });

  it("reconstructs one exact paused supervisor task and heartbeat identity", () => {
    const provisioned = event(2, "supervisor-provisioned", provisionedIdentity());
    const result = replayEvents([bootstrapFixture(), provisioned]);
    expect(result.snapshot.currentWriter).toEqual({
      kind: "controller",
      id: CONTROLLER_WRITER_ID,
    });
    expect(result.snapshot.supervisor).toMatchObject({
      ...provisionedIdentity(),
      at: "2026-08-26T02:00:00.000Z",
    });

    for (const [field, value, error] of [
      ["taskTitle", "Another task", /task title/i],
      ["marker", `wrong:${SHA_C}`, /operating-model blob|marker/i],
      ["targetThreadId", "thread-other", /target.*thread/i],
      ["destination", "local", /destination.*thread/i],
      ["notificationPolicy", "always", /failed_runs_only/i],
      ["status", "ACTIVE", /PAUSED/],
      ["cadenceMinutes", 15, /30 minutes/i],
    ] as const) {
      const fields = { ...provisionedIdentity(), [field]: value };
      expect(
        () =>
          replayEvents([bootstrapFixture(), event(2, "supervisor-provisioned", fields)]),
        field
      ).toThrow(error);
    }

    expect(() =>
      replayEvents([
        bootstrapFixture(),
        provisioned,
        event(3, "supervisor-provisioned", provisionedIdentity()),
      ])
    ).toThrow(/already provisioned|duplicate/i);
  });

  it("activates only from a quiescent exact authority state and irreversibly hands off writing", () => {
    const terminal = bootstrapFixture();
    const task = itemAt(terminal.tasks, 0);
    task.state = "integrated";
    task.receipt = "Remote integration proved.";
    const provisioned = event(2, "supervisor-provisioned", provisionedIdentity());
    const activated = event(3, "heartbeat-activated", activationProof());

    const handedOff = replayEvents([terminal, provisioned, activated]);
    expect(handedOff.snapshot.currentWriter).toEqual({
      kind: "supervisor-thread",
      id: SUPERVISOR_THREAD_ID,
    });
    expect(handedOff.snapshot.heartbeat).toMatchObject(activationProof());

    expect(() =>
      replayEvents([
        terminal,
        provisioned,
        activated,
        event(4, "no-frontier-recorded", {
          wayfinder: "automation-first",
          receipt: "Controller must be permanently read-only.",
        }),
      ])
    ).toThrow(/current writer|supervisor thread/i);

    expect(() =>
      replayEvents([
        terminal,
        provisioned,
        activated,
        event(4, "cleanup-recorded", {
          writerId: SUPERVISOR_THREAD_ID,
          taskId: "task-a",
          removed: ["worktree", "branch"],
          remoteProof: "Reviewed remote SHA contains the task.",
          recoveryProof: null,
        }),
      ])
    ).not.toThrow();
  });

  it("preserves activation history while the supervisor reconciles later authority", () => {
    const terminal = bootstrapFixture();
    const task = itemAt(terminal.tasks, 0);
    task.state = "integrated";
    task.receipt = "Remote integration proved.";
    const provisioned = event(2, "supervisor-provisioned", provisionedIdentity());
    const activated = event(3, "heartbeat-activated", activationProof());
    const reconciled = event(4, "authority-reconciled", {
      writerId: SUPERVISOR_THREAD_ID,
      previousMainSha: SHA_B,
      mainSha: SHA_C,
      changes: [
        { path: STATUS_OWNER_PATH, previousBlob: SHA_D, blob: SHA_E },
        { path: LEASE_OWNER_PATH, previousBlob: SHA_A, blob: SHA_F },
      ],
      proof: "Supervisor reconciled the post-activation main authorities.",
    });
    const continued = event(5, "no-frontier-recorded", {
      writerId: SUPERVISOR_THREAD_ID,
      wayfinder: "automation-first",
      receipt: "Supervisor continued after authority reconciliation.",
    });

    const afterReconciliation = replayEvents([
      terminal,
      provisioned,
      activated,
      reconciled,
    ]);
    expect(() => validateSnapshot(afterReconciliation.snapshot)).not.toThrow();
    expect(afterReconciliation.snapshot.heartbeat).toMatchObject(activationProof());
    expect(afterReconciliation.snapshot.authority).toMatchObject({
      mainSha: SHA_C,
      statusOwner: { path: STATUS_OWNER_PATH, blob: SHA_E },
      repositoryLeaseOwners: [{ path: LEASE_OWNER_PATH, blob: SHA_F }],
    });

    const afterContinuation = replayEvents([
      terminal,
      provisioned,
      activated,
      reconciled,
      continued,
    ]);
    expect(afterContinuation.snapshot.heartbeat).toEqual(
      afterReconciliation.snapshot.heartbeat
    );
    expect(afterContinuation.snapshot.noFrontiers).toHaveLength(1);
  });

  it("rejects activation with an active lease or stale handoff proofs", () => {
    const active = lease("task-a");
    const busy = [
      bootstrapFixture(),
      event(2, "supervisor-provisioned", provisionedIdentity()),
      acquire(3, {
        ...active,
        acquiredAt: "2026-08-26T03:00:00.000Z",
        termStartedAt: "2026-08-26T03:00:00.000Z",
      }),
      event(4, "heartbeat-activated", activationProof()),
    ];
    expect(() => replayEvents(busy)).toThrow(/zero active leases|quiescent/i);

    const prefix = [
      bootstrapFixture(),
      event(2, "supervisor-provisioned", provisionedIdentity()),
    ];
    for (const [field, value, error] of [
      ["finalMainSha", SHA_C, /final main SHA/i],
      ["statusOwner", { path: STATUS_OWNER_PATH, blob: SHA_E }, /status owner/i],
      [
        "repositoryLeaseOwners",
        [{ path: LEASE_OWNER_PATH, blob: SHA_F }],
        /repository lease owner/i,
      ],
      ["automationId", "automation-other", /provisioned automation/i],
      ["threadId", "thread-other", /provisioned.*thread/i],
    ] as const) {
      expect(
        () =>
          replayEvents([
            ...prefix,
            event(3, "heartbeat-activated", {
              ...activationProof(),
              [field]: value,
            }),
          ]),
        field
      ).toThrow(error);
    }
  });

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
      event(9, "supervisor-provisioned", provisionedIdentity()),
      event(10, "authority-reconciled", {
        previousMainSha: SHA_B,
        mainSha: SHA_C,
        changes: [{ path: LEASE_OWNER_PATH, previousBlob: SHA_A, blob: SHA_F }],
        proof: "Authority blobs resolved at the new main SHA.",
      }),
      event(11, "state-transitioned", {
        taskId: "task-a",
        from: "review",
        to: "verification",
        receipt: "review r1 passed",
      }),
      event(12, "owner-gate-recorded", {
        taskId: "task-a",
        gate: "product-owner",
        decision: "approved",
        receipt: "Owner approved curated screenshots.",
      }),
      event(13, "state-transitioned", {
        taskId: "task-a",
        from: "verification",
        to: "owner-gate",
        receipt: "verification gates passed",
        ownerGate: "product-owner",
      }),
      event(14, "state-transitioned", {
        taskId: "task-a",
        from: "owner-gate",
        to: "integrated",
        receipt: "remote SHA and owner approval proven",
      }),
      event(15, "lease-released", {
        taskId: "task-a",
        leaseId: active.leaseId,
        proof: "Integrated remote SHA closes the runtime lease.",
      }),
      event(16, "cleanup-recorded", {
        taskId: "task-a",
        removed: ["worktree", "branch"],
        remoteProof: "origin/main contains the reviewed SHA",
        recoveryProof: null,
      }),
      event(17, "heartbeat-activated", {
        ...activationProof(),
        finalMainSha: SHA_C,
        repositoryLeaseOwners: [{ path: LEASE_OWNER_PATH, blob: SHA_F }],
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
    expect(result.snapshot.authority.repositoryLeaseOwners).toEqual([
      {
        path: LEASE_OWNER_PATH,
        blob: SHA_F,
      },
    ]);
    expect(result.leases.leases).toEqual([]);
    for (const projectedTask of result.snapshot.tasks) {
      expect(projectedTask.charter.ownership.repositoryLease).toMatchObject({
        ownerDocumentBlob: SHA_F,
        mainSha: SHA_C,
      });
    }
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

  it("preserves exact verification fix-back identity and rejects no-op reconciliation", () => {
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
    const fixedBack = replayEvents(prefix);
    expect(
      (itemAt(fixedBack.snapshot.tasks, 0) as unknown as Record<string, unknown>)[
        "pendingReconciliation"
      ]
    ).toEqual({
      kind: "failed-gate",
      proof: "typecheck failed",
      baseSha: SHA_B,
      headSha: SHA_B,
    });

    expect(() =>
      replayEvents([
        ...prefix,
        event(7, "task-reconciled", {
          taskId: "task-a",
          repository: REPOSITORY,
          worktree: "/worktrees/task-a",
          branch: "feat/task-a",
          previousBaseSha: SHA_B,
          previousHeadSha: SHA_B,
          baseSha: SHA_B,
          headSha: SHA_B,
          proof: "No identity changed.",
        }),
      ])
    ).toThrow(/identity.*change|no-op/i);
  });

  it("clears pending reconciliation when expiry atomically blocks fix-back work", () => {
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
      event(
        7,
        "lease-expired",
        {
          taskId: "task-a",
          leaseId: active.leaseId,
          preservationReceipt: "fix-back identity and patch preserved",
        },
        active.expiresAt
      ),
    ]);

    expect(itemAt(result.snapshot.tasks, 0)).toMatchObject({
      state: "blocked-with-evidence",
      activeLease: null,
      pendingReconciliation: null,
    });
  });

  it("requires typed review fix-back evidence", () => {
    expect(() =>
      validateTransition("review", "executing", {
        receipt: "untyped review fix-back",
      })
    ).toThrow(/review-finding|fixBack/);
    expect(() =>
      validateTransition("review", "executing", {
        receipt: "review finding",
        fixBack: { kind: "review-finding", proof: "finding R1" },
      })
    ).not.toThrow();
  });

  it("rejects a later expiry after a blocker atomically closed the active lease", () => {
    const active = lease("task-a");
    expect(() =>
      replayEvents([
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
          to: "blocked-with-evidence",
          receipt: "blocker atomically preserves work and closes the lease",
        }),
        event(
          5,
          "lease-expired",
          {
            taskId: "task-a",
            leaseId: active.leaseId,
            preservationReceipt: "stale expiry cannot reuse the closed lease",
          },
          active.expiresAt
        ),
      ])
    ).toThrow(/expiry requires an active lease/);
  });

  it("rejects cleanup while a terminal task still has an active lease", () => {
    const fixture = bootstrapFixture();
    const task = itemAt(fixture.tasks, 0);
    task.state = "integrated";
    task.receipt = "integration receipt";
    const active = lease("task-a");
    active.acquiredAt = fixture.at;
    active.termStartedAt = fixture.at;
    fixture.activeLeases.push(active);

    expect(() =>
      replayEvents([
        fixture,
        event(2, "cleanup-recorded", {
          taskId: "task-a",
          removed: ["worktree", "branch"],
          remoteProof: "remote integration proof",
          recoveryProof: null,
        }),
      ])
    ).toThrow(/active lease/);
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

describe("Program Supervisor persisted snapshot semantics", () => {
  function snapshotFixture() {
    return replayEvents([bootstrapFixture()]).snapshot;
  }

  it("rejects cleanup outside terminal state and cleanup without proof", () => {
    const nonTerminal = snapshotFixture();
    itemAt(nonTerminal.tasks, 0).cleanup = {
      removed: ["worktree", "branch"],
      remoteProof: "remote proof",
      recoveryProof: null,
    };
    expect(() => validateSnapshot(nonTerminal)).toThrow(
      /cleanup.*terminal|integrated|retired/i
    );

    const noProof = snapshotFixture();
    const task = itemAt(noProof.tasks, 0);
    task.state = "integrated";
    task.receipt = "integration receipt";
    task.cleanup = {
      removed: ["worktree", "branch"],
      remoteProof: null,
      recoveryProof: null,
    };
    expect(() => validateSnapshot(noProof)).toThrow(/remote or recovery proof/);
  });

  it("rejects unknown and cyclic task dependencies", () => {
    const unknown = snapshotFixture();
    itemAt(unknown.tasks, 0).charter.dependencies = [dependency("missing-task")];
    expect(() => validateSnapshot(unknown)).toThrow(/unknown dependency/);

    const cycle = snapshotFixture();
    itemAt(cycle.tasks, 0).charter.dependencies = [dependency("task-b")];
    itemAt(cycle.tasks, 1).charter.dependencies = [dependency("task-a")];
    expect(() => validateSnapshot(cycle)).toThrow(/dependency cycle/);
  });

  it("rejects ruling and owner-gate records for unknown tasks", () => {
    const ruling = snapshotFixture();
    ruling.rulings.push({
      id: "ruling-unknown",
      taskId: "missing-task",
      decision: "invalid",
      receipt: "invalid reference",
    });
    expect(() => validateSnapshot(ruling)).toThrow(/ruling.*unknown task/i);

    const gate = snapshotFixture();
    gate.ownerGates.push({
      taskId: "missing-task",
      gate: "product-owner",
      decision: "approved",
      receipt: "invalid reference",
      verificationEventId: "event-bootstrap",
      at: "2026-08-26T02:00:00.000Z",
    });
    expect(() => validateSnapshot(gate)).toThrow(/owner-gate.*unknown task/i);
  });

  it("rejects heartbeat/supervisor incoherence and duplicate global evidence IDs", () => {
    const heartbeat = snapshotFixture();
    heartbeat.heartbeat = {
      ...activationProof(),
      threadId: "missing-supervisor",
      at: "2026-08-26T02:00:00.000Z",
    };
    expect(() => validateSnapshot(heartbeat)).toThrow(/heartbeat.*supervisor/i);

    const evidence = snapshotFixture();
    itemAt(evidence.tasks, 0).evidence.push({
      id: "evidence-shared",
      kind: "review",
      receipt: "first",
    });
    itemAt(evidence.tasks, 1).evidence.push({
      id: "evidence-shared",
      kind: "verification",
      receipt: "second",
    });
    expect(() => validateSnapshot(evidence)).toThrow(/duplicate.*evidence/i);
  });

  it("rejects reconciliation flags outside executing and latest rejected owner gates", () => {
    const misplaced = snapshotFixture();
    const task = itemAt(misplaced.tasks, 0);
    task.state = "review";
    task.receipt = "review receipt";
    task.pendingReconciliation = {
      kind: "failed-gate",
      proof: "misplaced pending reconciliation",
      baseSha: SHA_B,
      headSha: SHA_B,
    };
    expect(() => validateSnapshot(misplaced)).toThrow(/reconciliation.*executing/i);

    const gateFixture = bootstrapFixture();
    const gateTask = itemAt(gateFixture.tasks, 0);
    gateTask.charter.ownerGate = { required: true, name: "product-owner" };
    gateTask.state = "verification";
    gateTask.receipt = "verification receipt";
    const integrated = replayEvents([
      gateFixture,
      event(2, "owner-gate-recorded", {
        taskId: "task-a",
        gate: "product-owner",
        decision: "approved",
        receipt: "approval",
      }),
      event(3, "state-transitioned", {
        taskId: "task-a",
        from: "verification",
        to: "owner-gate",
        receipt: "gate entered",
        ownerGate: "product-owner",
      }),
      event(4, "state-transitioned", {
        taskId: "task-a",
        from: "owner-gate",
        to: "integrated",
        receipt: "integration",
      }),
    ]).snapshot;
    integrated.ownerGates.push({
      taskId: "task-a",
      gate: "product-owner",
      decision: "rejected",
      receipt: "later rejection",
      verificationEventId: itemAt(integrated.ownerGates, 0).verificationEventId,
      at: "2026-08-26T05:00:00.000Z",
    });
    expect(() => validateSnapshot(integrated)).toThrow(/latest.*approved|rejected/i);
  });

  it("rejects verification state without its verification event identity", () => {
    const snapshot = snapshotFixture();
    const task = itemAt(snapshot.tasks, 0);
    task.state = "verification";
    task.receipt = "verification receipt without a cycle identity";

    expect(() => validateSnapshot(snapshot)).toThrow(/verification.*identity/i);
  });
});
