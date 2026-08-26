import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFile,
  chmod,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  appendEvent,
  canonicalBootstrapFingerprint,
  initializeRuntime,
  loadRuntime,
  rebuildRuntime,
} from "../../scripts/program-supervisor/runtime";
import { parseEvents } from "../../scripts/program-supervisor/state";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);
const SHA_D = "d".repeat(40);
const SHA_E = "e".repeat(40);
const SHA_F = "f".repeat(40);
const PROGRAM_REPOSITORY = "/repo/d20-folio";
const LEASE_OWNER_PATH = "docs/TEST_PORTFOLIO.md";
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
const CLI_PATH = resolve("scripts/program-supervisor/cli.ts");
const RUNTIME_URL = pathToFileURL(resolve("scripts/program-supervisor/runtime.ts")).href;
const CONTROLLER_WRITER_ID = "program-supervisor-bootstrap-controller";

const temporaryParents: string[] = [];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function itemAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Fixture is missing item ${index}`);
  return value;
}

function authorityPointer(repository = PROGRAM_REPOSITORY, repositoryLeaseId = "F0") {
  return {
    repository,
    ownerDocumentPath: LEASE_OWNER_PATH,
    repositoryLeaseId,
    reconciledOwnerBlob: SHA_A,
    reconciledMainSha: SHA_B,
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
        path: OPERATING_MODEL_PATH,
        blob: SHA_C,
      },
      { path: LEASE_OWNER_PATH, blob: SHA_A },
    ],
    dependencies: [] as {
      taskId: string;
      integratedSha: string;
      requiredInterface: string;
    }[],
    ownership: {
      repository: PROGRAM_REPOSITORY,
      worktree: `/worktrees/${id}`,
      branch: `feat/${id}`,
      baseSha: SHA_B,
      headSha: SHA_B,
      paths: [path],
      repositoryLease: {
        id: options.leaseId ?? "F0",
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
      name: options.ownerGate ? "screenshot-owner" : "none",
    },
    cleanup: {
      rule: "Remove the worktree and branch after remote or recovery proof.",
      proof: "remote-or-recovery" as const,
      removal: ["worktree", "branch"],
    },
  };
}

function task(
  id: string,
  path: string,
  state: "queued" | "review" | "verification" | "blocked-with-evidence",
  options: { ownerGate?: boolean; leaseId?: string } = {}
) {
  return {
    charter: charter(id, path, options),
    state,
    receipt: state === "queued" ? null : `${id}-${state}-receipt`,
    updatedAt: "2026-08-26T01:00:00.000Z",
  };
}

function activeFoundationLease() {
  return {
    leaseId: "runtime-foundation-f0",
    taskId: "foundation-f0",
    holder: "program-supervisor-foundation",
    agentId: "agent-foundation-f0",
    role: "writer" as const,
    readOnly: false,
    acquiredAt: "2026-08-26T01:00:00.000Z",
    termStartedAt: "2026-08-26T01:00:00.000Z",
    expiresAt: "2026-08-27T01:00:00.000Z",
    authorityPointer: authorityPointer(),
  };
}

function bootstrapInput(
  options: {
    foundationState?: "queued" | "review" | "verification";
    activeFoundation?: boolean;
  } = {}
) {
  const foundationState = options.foundationState ?? "review";
  const bootstrap = {
    schemaVersion: 1,
    eventId: "event-bootstrap-foundation",
    type: "bootstrap",
    writerId: CONTROLLER_WRITER_ID,
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
      task("foundation-f0", "scripts/program-supervisor", foundationState),
      task("automation-k1", "src/lib/automation-k1", "queued", { leaseId: "K1" }),
      task("tactical-b00", "src/components/tactical-b00", "blocked-with-evidence", {
        ownerGate: true,
        leaseId: "B00",
      }),
    ],
    activeLeases: [] as ReturnType<typeof activeFoundationLease>[],
  };
  if (options.activeFoundation ?? foundationState !== "queued") {
    bootstrap.activeLeases.push(activeFoundationLease());
  }
  return bootstrap;
}

function transitionToVerificationInput() {
  return {
    schemaVersion: 1,
    eventId: "event-foundation-verification",
    type: "state-transitioned",
    writerId: CONTROLLER_WRITER_ID,
    taskId: "foundation-f0",
    from: "review",
    to: "verification",
    receipt: "All Foundation verification gates passed.",
  };
}

function leaseAcquiredInput(
  taskId: "foundation-f0" | "automation-k1",
  acquiredAt: string
) {
  return {
    schemaVersion: 1,
    eventId: `event-${taskId}-lease-acquired`,
    type: "lease-acquired",
    writerId: CONTROLLER_WRITER_ID,
    lease: {
      leaseId: `runtime-${taskId}`,
      taskId,
      holder: `holder-${taskId}`,
      agentId: `agent-${taskId}`,
      role: "writer" as const,
      readOnly: false,
      acquiredAt,
      expiresAt: "2026-08-27T00:00:00.000Z",
      authorityPointer: authorityPointer(
        PROGRAM_REPOSITORY,
        taskId === "automation-k1" ? "K1" : "F0"
      ),
    },
  };
}

async function makeRoot(name = "runtime"): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "d20-program-parent-"));
  temporaryParents.push(parent);
  return join(parent, name);
}

async function writeSecureJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

function runCli(args: readonly string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env, NO_COLOR: "1" },
  });
}

async function recoveredTornLedger(root: string): Promise<Buffer> {
  const names = (await readdir(join(root, "recovery"))).filter((name) =>
    /^events-torn-[0-9a-f]{64}\.ndjson$/.test(name)
  );
  expect(names).toHaveLength(1);
  return readFile(join(root, "recovery", itemAt(names, 0)));
}

async function recoveredTornLedgerPath(root: string): Promise<string> {
  const names = (await readdir(join(root, "recovery"))).filter((name) =>
    /^events-torn-[0-9a-f]{64}\.ndjson$/.test(name)
  );
  expect(names).toHaveLength(1);
  return join(root, "recovery", itemAt(names, 0));
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .reverse()
        .map(([key, item]) => [key, reverseObjectKeys(item)])
    );
  }
  return value;
}

function absentPid(): number {
  for (let candidate = 9_999_999; candidate > 9_999_900; candidate -= 1) {
    try {
      process.kill(candidate, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return candidate;
    }
  }
  throw new Error("Could not find an absent PID for the stale-lock fixture");
}

afterEach(async () => {
  await Promise.all(
    temporaryParents
      .splice(0)
      .map((parent) => rm(parent, { recursive: true, force: true }))
  );
});

describe("Program Supervisor atomic runtime", () => {
  it("initializes, appends, and reconstructs both caches", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    await appendEvent(root, transitionToVerificationInput());

    const rebuilt = await rebuildRuntime(root);

    expect(rebuilt.snapshot.lastEventSeq).toBe(2);
    expect(rebuilt.snapshot.tasks[0]?.state).toBe("verification");
    expect(
      (await readdir(join(root, "state"))).some((name) => name.includes(".tmp"))
    ).toBe(false);
    expect(
      (await readdir(join(root, "ledger"))).some((name) => name.includes(".tmp"))
    ).toBe(false);
    expect(rebuilt.recoveryState.abandonedTemps).toEqual([]);
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    for (const directory of ["state", "ledger", "handoffs", "evidence", "recovery"]) {
      expect((await stat(join(root, directory))).mode & 0o777).toBe(0o700);
    }
    for (const file of [
      join(root, "state", "program.json"),
      join(root, "state", "leases.json"),
      join(root, "ledger", "events.ndjson"),
    ]) {
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    }
  });

  it("rebuilds a corrupt cache without changing the evidence ledger", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const ledgerPath = join(root, "ledger", "events.ndjson");
    const eventsBefore = await readFile(ledgerPath, "utf8");
    await writeFile(join(root, "state", "program.json"), "{broken", "utf8");

    await expect(loadRuntime(root)).rejects.toThrow(/program\.json/i);
    const rebuilt = await rebuildRuntime(root);

    expect(rebuilt.snapshot.programId).toBe("d20-folio");
    expect(await readFile(ledgerPath, "utf8")).toBe(eventsBefore);
  });

  it("rejects a semantically valid cache that drifts from ledger reconstruction", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const programPath = join(root, "state", "program.json");
    const cached = JSON.parse(await readFile(programPath, "utf8")) as {
      noFrontiers: unknown[];
    };
    cached.noFrontiers.push({
      wayfinder: "phantom-frontier",
      receipt: "This record never appeared in the authoritative ledger.",
      at: "2026-08-26T02:00:00.000Z",
    });
    await writeFile(programPath, `${JSON.stringify(cached, null, 2)}\n`, "utf8");

    await expect(loadRuntime(root)).rejects.toThrow(/cache drift/i);
    await expect(rebuildRuntime(root)).resolves.toMatchObject({
      snapshot: { noFrontiers: [] },
    });
  });

  it("serializes concurrent appends without duplicate or lost sequences", async () => {
    const root = await makeRoot();
    const acquiredAt = "2026-08-26T05:00:00.000Z";
    await initializeRuntime(
      root,
      bootstrapInput({ foundationState: "queued", activeFoundation: false })
    );

    await Promise.all([
      appendEvent(root, leaseAcquiredInput("foundation-f0", acquiredAt), {
        now: () => new Date(acquiredAt),
      }),
      appendEvent(root, leaseAcquiredInput("automation-k1", acquiredAt), {
        now: () => new Date(acquiredAt),
      }),
    ]);

    const events = parseEvents(
      await readFile(join(root, "ledger", "events.ndjson"), "utf8")
    );
    expect(events.map(({ seq }) => seq)).toEqual([1, 2, 3]);
    expect((await loadRuntime(root)).snapshot.wip).toEqual({ writers: 2, evaluators: 0 });
  });

  it("lets only one concurrent initializer publish the complete root", async () => {
    const root = await makeRoot();
    const results = await Promise.allSettled([
      initializeRuntime(root, bootstrapInput()),
      initializeRuntime(root, bootstrapInput()),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(({ status }) => status === "rejected");
    if (!rejected || rejected.status !== "rejected") {
      throw new Error("Expected one initializer to lose the atomic publish race");
    }
    expect(rejected.reason).toBeInstanceOf(Error);
    if (!(rejected.reason instanceof Error)) throw rejected.reason;
    expect(rejected.reason.message).toMatch(/already exists/i);
    await expect(loadRuntime(root)).resolves.toMatchObject({
      snapshot: { lastEventSeq: 1 },
    });
  });

  it("validates an event against reconstructed state before appending bytes", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const ledgerPath = join(root, "ledger", "events.ndjson");
    const before = await readFile(ledgerPath);

    await expect(
      appendEvent(root, {
        schemaVersion: 1,
        eventId: "event-illegal-transition",
        type: "state-transitioned",
        writerId: CONTROLLER_WRITER_ID,
        taskId: "foundation-f0",
        from: "review",
        to: "integrated",
        receipt: "This edge is forbidden by Task 2.",
      })
    ).rejects.toThrow(/illegal transition/i);
    expect(await readFile(ledgerPath)).toEqual(before);
    await expect(lstat(join(root, ".write-lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a ledger pathname swap between replay and its one append write", async () => {
    const root = await makeRoot("runtime-authority");
    const foreignRoot = await makeRoot("runtime-foreign-authority");
    const foreignBootstrap = bootstrapInput();
    itemAt(foreignBootstrap.tasks, 1).charter.outcome =
      "A different runtime authority must never receive this event.";
    await initializeRuntime(root, bootstrapInput());
    await initializeRuntime(foreignRoot, foreignBootstrap);

    const ledgerPath = join(root, "ledger", "events.ndjson");
    const displacedPath = join(root, "ledger", "events.displaced.ndjson");
    const originalBytes = await readFile(ledgerPath);
    const foreignBytes = await readFile(join(foreignRoot, "ledger", "events.ndjson"));

    await expect(
      appendEvent(root, transitionToVerificationInput(), {
        beforeLedgerAppend: async (openedPath) => {
          expect(basename(openedPath)).toBe("events.ndjson");
          await rename(openedPath, join(dirname(openedPath), "events.displaced.ndjson"));
          await writeFile(openedPath, foreignBytes, { mode: 0o600 });
          await chmod(openedPath, 0o600);
        },
      })
    ).rejects.toThrow(/ledger.*changed|inode.*append/i);

    expect(await readFile(displacedPath)).toEqual(originalBytes);
    expect(await readFile(ledgerPath)).toEqual(foreignBytes);
    expect(parseEvents((await readFile(displacedPath)).toString("utf8"))).toHaveLength(1);
    expect(parseEvents((await readFile(ledgerPath)).toString("utf8"))).toHaveLength(1);
  });

  it("removes only its unique atomic-replace temp after an ordinary failure", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());

    await expect(
      rebuildRuntime(root, {
        beforeAtomicReplaceRename: () => {
          throw new Error("injected cache replace failure");
        },
      })
    ).rejects.toThrow(/injected cache replace failure/i);

    expect(
      (await readdir(join(root, "state"))).filter((name) => name.endsWith(".tmp"))
    ).toEqual([]);
    expect((await loadRuntime(root)).recoveryState.abandonedTemps).toEqual([]);
  });

  it("surfaces a real dead-child atomic-replace residue without deleting it", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const source = [
      `import { rebuildRuntime } from ${JSON.stringify(RUNTIME_URL)};`,
      `await rebuildRuntime(process.argv[1], {`,
      `  beforeAtomicReplaceRename: () => process.exit(94),`,
      `});`,
    ].join("\n");

    const crashed = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", source, root],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    expect(crashed.status).toBe(94);

    const loaded = await loadRuntime(root, {
      now: () => new Date(Date.now() + 31 * 60 * 1_000),
      lockTimeoutMs: 25,
    });
    expect(loaded.recoveryState.abandonedTemps).toHaveLength(1);
    const residue = itemAt(loaded.recoveryState.abandonedTemps, 0);
    expect(residue).toMatch(
      new RegExp(`^state/\\.program\\.json\\.${crashed.pid}-[0-9a-f-]{36}\\.tmp$`)
    );
    expect((await stat(join(root, residue))).isFile()).toBe(true);
  });

  it("validates dead temp residues and skips live owners while failing closed on ambiguity", async () => {
    const uuid = "12345678-1234-4234-8234-123456789abc";
    const deadPid = absentPid();

    const classifiedRoot = await makeRoot();
    await initializeRuntime(classifiedRoot, bootstrapInput());
    const deadName = `.leases.json.${deadPid}-${uuid}.tmp`;
    const liveName = `.program.json.${process.pid}-${uuid}.tmp`;
    await writeFile(
      join(classifiedRoot, "state", deadName),
      await readFile(join(classifiedRoot, "state", "leases.json")),
      { mode: 0o600 }
    );
    await writeFile(
      join(classifiedRoot, "state", liveName),
      await readFile(join(classifiedRoot, "state", "program.json")),
      { mode: 0o600 }
    );
    const classified = await loadRuntime(classifiedRoot);
    expect(classified.recoveryState.abandonedTemps).toEqual([`state/${deadName}`]);
    expect((await stat(join(classifiedRoot, "state", deadName))).isFile()).toBe(true);
    expect((await stat(join(classifiedRoot, "state", liveName))).isFile()).toBe(true);

    const mismatchedRoot = await makeRoot();
    await initializeRuntime(mismatchedRoot, bootstrapInput());
    await writeSecureJson(
      join(mismatchedRoot, "state", `.events.ndjson.${deadPid}-${uuid}.tmp`),
      {}
    );
    await expect(loadRuntime(mismatchedRoot)).rejects.toThrow(
      /atomic-replace temp.*target|mismatched/i
    );

    const unsafeRoot = await makeRoot();
    await initializeRuntime(unsafeRoot, bootstrapInput());
    const unsafePath = join(
      unsafeRoot,
      "ledger",
      `.events.ndjson.${deadPid}-${uuid}.tmp`
    );
    await writeFile(
      unsafePath,
      await readFile(join(unsafeRoot, "ledger", "events.ndjson")),
      { mode: 0o600 }
    );
    await chmod(unsafePath, 0o644);
    await expect(loadRuntime(unsafeRoot)).rejects.toThrow(/mode 0600/i);

    const indeterminateRoot = await makeRoot();
    await initializeRuntime(indeterminateRoot, bootstrapInput());
    const indeterminatePath = join(
      indeterminateRoot,
      "state",
      `.program.json.42-${uuid}.tmp`
    );
    await writeFile(
      indeterminatePath,
      await readFile(join(indeterminateRoot, "state", "program.json")),
      { mode: 0o600 }
    );
    await expect(
      loadRuntime(indeterminateRoot, {
        probePid: () => {
          throw Object.assign(new Error("unknown PID state"), { code: "EINVAL" });
        },
      })
    ).rejects.toThrow(/cannot prove.*PID.*EINVAL/i);
    expect((await stat(indeterminatePath)).isFile()).toBe(true);
  });

  it.each(["missing", "altered"] as const)(
    "rejects append before mutation when bootstrap evidence is %s",
    async (damage) => {
      const root = await makeRoot();
      const initialized = await initializeRuntime(root, bootstrapInput());
      const ledgerPath = join(root, "ledger", "events.ndjson");
      const programPath = join(root, "state", "program.json");
      const leasesPath = join(root, "state", "leases.json");
      const evidencePath = join(
        root,
        "evidence",
        `bootstrap-input-${initialized.snapshot.bootstrapFingerprint}.json`
      );
      const before = await Promise.all(
        [ledgerPath, programPath, leasesPath].map((path) => readFile(path))
      );
      if (damage === "missing") {
        await rm(evidencePath);
      } else {
        await writeFile(evidencePath, "{}\n", { mode: 0o600 });
      }

      await expect(appendEvent(root, transitionToVerificationInput())).rejects.toThrow(
        /bootstrap identity evidence|ENOENT/i
      );
      const after = await Promise.all(
        [ledgerPath, programPath, leasesPath].map((path) => readFile(path))
      );
      expect(after).toEqual(before);
    }
  );

  it("cleans only its complete unpublished lock when publication durability fails", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());

    await expect(
      loadRuntime(root, {
        afterLockPublish: () => {
          throw new Error("injected root fsync failure");
        },
      })
    ).rejects.toThrow(/injected root fsync failure/i);
    expect((await readdir(root)).filter((name) => name.includes("write-lock"))).toEqual(
      []
    );
  });

  it("leaves a complete recoverable lock when its owner dies after publication", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const source = [
      `import { loadRuntime } from ${JSON.stringify(RUNTIME_URL)};`,
      `await loadRuntime(process.argv[1], {`,
      `  now: () => new Date("2026-08-26T01:00:00.000Z"),`,
      `  afterLockAcquired: () => process.exit(92),`,
      `});`,
    ].join("\n");

    const crashed = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", source, root],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    expect(crashed.status).toBe(92);
    const lock = JSON.parse(await readFile(join(root, ".write-lock"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(lock).toEqual({
      schemaVersion: 1,
      pid: crashed.pid,
      acquiredAt: "2026-08-26T01:00:00.000Z",
    });

    const recovered = await loadRuntime(root, {
      now: () => new Date("2026-08-26T01:30:01.000Z"),
      lockTimeoutMs: 25,
    });
    expect(recovered.recoveryState.staleLocks).toHaveLength(1);
  });

  it("surfaces a complete abandoned owner inode when its process dies before lock publication", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const source = [
      `import { loadRuntime } from ${JSON.stringify(RUNTIME_URL)};`,
      `await loadRuntime(process.argv[1], {`,
      `  now: () => new Date("2026-08-26T01:00:00.000Z"),`,
      `  afterLockOwnerDurable: () => process.exit(93),`,
      `});`,
    ].join("\n");

    const crashed = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", source, root],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    expect(crashed.status).toBe(93);
    await expect(lstat(join(root, ".write-lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    const ownerNames = (await readdir(root)).filter((name) =>
      /^\.write-lock\.owner-\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        name
      )
    );
    expect(ownerNames).toHaveLength(1);
    const ownerName = itemAt(ownerNames, 0);
    const ownerPath = join(root, ownerName);
    expect((await stat(ownerPath)).mode & 0o7777).toBe(0o600);
    expect(JSON.parse(await readFile(ownerPath, "utf8"))).toEqual({
      schemaVersion: 1,
      pid: crashed.pid,
      acquiredAt: "2026-08-26T01:00:00.000Z",
    });

    const loaded = await loadRuntime(root);
    expect(loaded.recoveryState.abandonedLockOwners).toEqual([ownerName]);
    expect(await readFile(ownerPath, "utf8")).not.toHaveLength(0);
    expect(loaded.snapshot.lastEventSeq).toBe(1);
  });

  it("validates abandoned owner candidates and fails closed on unknown PID probes", async () => {
    const uuid = "12345678-1234-4234-8234-123456789abc";
    const mismatchedRoot = await makeRoot();
    await initializeRuntime(mismatchedRoot, bootstrapInput());
    const mismatchedPath = join(mismatchedRoot, `.write-lock.owner-42-${uuid}`);
    await writeSecureJson(mismatchedPath, {
      schemaVersion: 1,
      pid: 43,
      acquiredAt: "2026-08-26T01:00:00.000Z",
    });
    await expect(loadRuntime(mismatchedRoot)).rejects.toThrow(/filename.*PID/i);

    const unsafeRoot = await makeRoot();
    await initializeRuntime(unsafeRoot, bootstrapInput());
    const unsafePath = join(unsafeRoot, `.write-lock.owner-42-${uuid}`);
    await writeSecureJson(unsafePath, {
      schemaVersion: 1,
      pid: 42,
      acquiredAt: "2026-08-26T01:00:00.000Z",
    });
    await chmod(unsafePath, 0o644);
    await expect(loadRuntime(unsafeRoot)).rejects.toThrow(/mode 0600/i);

    const unknownRoot = await makeRoot();
    await initializeRuntime(unknownRoot, bootstrapInput());
    const unknownPath = join(unknownRoot, `.write-lock.owner-42-${uuid}`);
    await writeSecureJson(unknownPath, {
      schemaVersion: 1,
      pid: 42,
      acquiredAt: "2026-08-26T01:00:00.000Z",
    });
    await expect(
      loadRuntime(unknownRoot, {
        probePid: () => {
          throw Object.assign(new Error("invalid platform PID"), { code: "EINVAL" });
        },
      })
    ).rejects.toThrow(/cannot prove.*PID.*EINVAL/i);
    expect((await stat(unknownPath)).isFile()).toBe(true);

    const inaccessibleRoot = await makeRoot();
    await initializeRuntime(inaccessibleRoot, bootstrapInput());
    const inaccessiblePath = join(inaccessibleRoot, `.write-lock.owner-42-${uuid}`);
    await writeSecureJson(inaccessiblePath, {
      schemaVersion: 1,
      pid: 42,
      acquiredAt: "2026-08-26T01:00:00.000Z",
    });
    const inaccessible = await loadRuntime(inaccessibleRoot, {
      probePid: () => {
        throw Object.assign(new Error("permission denied"), { code: "EPERM" });
      },
    });
    expect(inaccessible.recoveryState.abandonedLockOwners).toEqual([]);
    expect((await stat(inaccessiblePath)).isFile()).toBe(true);
  });

  it("does not unlink a successor that replaces the acquired lock pathname", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const displacedPath = join(root, ".write-lock.displaced");
    const successor = {
      schemaVersion: 1,
      pid: process.pid,
      acquiredAt: "2026-08-26T03:00:00.000Z",
    };

    await loadRuntime(root, {
      afterLockAcquired: async (lockPath) => {
        await rename(lockPath, displacedPath);
        await writeSecureJson(lockPath, successor);
      },
    });

    expect(JSON.parse(await readFile(join(root, ".write-lock"), "utf8"))).toEqual(
      successor
    );
    expect((await stat(displacedPath)).isFile()).toBe(true);
  });

  it("assigns a lease acquisition timestamp under the lock", async () => {
    const root = await makeRoot();
    await initializeRuntime(
      root,
      bootstrapInput({ foundationState: "queued", activeFoundation: false })
    );
    const inputAt = "2026-08-26T04:59:00.000Z";
    const assignedAt = "2026-08-26T05:00:00.000Z";

    await appendEvent(root, leaseAcquiredInput("foundation-f0", inputAt), {
      now: () => new Date(assignedAt),
    });

    const events = parseEvents(
      await readFile(join(root, "ledger", "events.ndjson"), "utf8")
    );
    const acquired = itemAt(events, 1);
    expect(acquired).toMatchObject({
      at: assignedAt,
      lease: { acquiredAt: assignedAt },
    });
  });

  it("preserves and repairs only a torn final ledger record", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const ledgerPath = join(root, "ledger", "events.ndjson");
    await appendFile(ledgerPath, '{"schemaVersion":1,"seq":2');
    const tornBytes = await readFile(ledgerPath);
    const original = await stat(ledgerPath);

    await expect(loadRuntime(root)).rejects.toThrow("recoverable torn tail");
    await rebuildRuntime(root);

    expect(await recoveredTornLedger(root)).toEqual(tornBytes);
    const evidence = await stat(await recoveredTornLedgerPath(root));
    expect({ dev: evidence.dev, ino: evidence.ino }).toEqual({
      dev: original.dev,
      ino: original.ino,
    });
    expect(parseEvents(await readFile(ledgerPath, "utf8"))).toHaveLength(1);
    const appended = await appendEvent(root, {
      schemaVersion: 1,
      eventId: "event-recovered-evidence",
      type: "evidence-recorded",
      writerId: CONTROLLER_WRITER_ID,
      taskId: "foundation-f0",
      evidence: {
        id: "recovery-continued",
        kind: "recovery",
        receipt: "The torn bytes remain preserved and sequence assignment continued.",
      },
    });
    expect(appended.snapshot.lastEventSeq).toBe(2);
  });

  it("fails closed on invalid middle records, sequence gaps, and conflicting recovery evidence", async () => {
    const middleRoot = await makeRoot();
    await initializeRuntime(middleRoot, bootstrapInput());
    const middleLedger = join(middleRoot, "ledger", "events.ndjson");
    await appendFile(middleLedger, "{broken}\n{}\n");
    await expect(rebuildRuntime(middleRoot)).rejects.toThrow(/ledger line 2/i);
    expect(await readdir(join(middleRoot, "recovery"))).toEqual([]);

    const gapRoot = await makeRoot();
    await initializeRuntime(gapRoot, bootstrapInput());
    const gapLedger = join(gapRoot, "ledger", "events.ndjson");
    await appendFile(
      gapLedger,
      `${JSON.stringify({
        schemaVersion: 1,
        eventId: "event-sequence-gap",
        seq: 3,
        type: "no-frontier-recorded",
        writerId: CONTROLLER_WRITER_ID,
        at: "2026-08-26T03:00:00.000Z",
        wayfinder: "foundation",
        receipt: "No safe frontier remains.",
      })}\n`
    );
    await expect(rebuildRuntime(gapRoot)).rejects.toThrow(/expected sequence 2/i);

    const conflictRoot = await makeRoot();
    await initializeRuntime(conflictRoot, bootstrapInput());
    const conflictLedger = join(conflictRoot, "ledger", "events.ndjson");
    await appendFile(conflictLedger, "{torn");
    const original = await readFile(conflictLedger);
    const hash = createHash("sha256").update(original).digest("hex");
    await writeFile(
      join(conflictRoot, "recovery", `events-torn-${hash}.ndjson`),
      "conflicting evidence",
      { mode: 0o600 }
    );

    await expect(rebuildRuntime(conflictRoot)).rejects.toThrow(
      /conflicting recovery evidence/i
    );
    expect(await readFile(conflictLedger)).toEqual(original);
  });

  it("leaves a crashed staging tree non-authoritative and surfaces it only after its PID exits", async () => {
    const root = await makeRoot("runtime.with.dots");
    const inputPath = join(dirname(root), "bootstrap.json");
    await writeSecureJson(inputPath, bootstrapInput());
    const source = [
      `import { readFile } from "node:fs/promises";`,
      `import { initializeRuntime } from ${JSON.stringify(RUNTIME_URL)};`,
      `const input = JSON.parse(await readFile(process.argv[1], "utf8"));`,
      `await initializeRuntime(process.argv[2], input, { beforeInitializeRename: () => process.exit(91) });`,
    ].join("\n");

    const crashed = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", source, inputPath, root],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      }
    );
    expect(crashed.status).toBe(91);
    await expect(lstat(root)).rejects.toMatchObject({ code: "ENOENT" });

    const initialized = await initializeRuntime(root, bootstrapInput());
    expect(initialized.recoveryState.abandonedStaging).toHaveLength(1);
    expect(initialized.recoveryState.abandonedStaging[0]).toMatch(
      new RegExp(`^\\.${basename(root)}\\.staging-\\d+-`)
    );
  });

  it("reports live lock owners and recovers only old locks with provably absent PIDs", async () => {
    const liveRoot = await makeRoot();
    await initializeRuntime(liveRoot, bootstrapInput());
    await writeSecureJson(join(liveRoot, ".write-lock"), {
      schemaVersion: 1,
      pid: process.pid,
      acquiredAt: "2026-08-26T00:00:00.000Z",
    });
    await expect(loadRuntime(liveRoot, { lockTimeoutMs: 25 })).rejects.toThrow(
      new RegExp(`live PID ${process.pid}`)
    );

    const staleRoot = await makeRoot();
    await initializeRuntime(staleRoot, bootstrapInput());
    const deadPid = absentPid();
    await writeSecureJson(join(staleRoot, ".write-lock"), {
      schemaVersion: 1,
      pid: deadPid,
      acquiredAt: "2026-08-26T00:00:00.000Z",
    });
    const loaded = await loadRuntime(staleRoot, {
      now: () => new Date("2026-08-26T01:00:01.000Z"),
      lockTimeoutMs: 25,
    });
    expect(loaded.recoveryState.staleLocks).toHaveLength(1);
    expect(
      await readFile(
        join(staleRoot, "recovery", itemAt(loaded.recoveryState.staleLocks, 0)),
        "utf8"
      )
    ).toBe(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          pid: deadPid,
          acquiredAt: "2026-08-26T00:00:00.000Z",
        },
        null,
        2
      )}\n`
    );
    await expect(lstat(join(staleRoot, ".write-lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const youngRoot = await makeRoot();
    await initializeRuntime(youngRoot, bootstrapInput());
    await writeSecureJson(join(youngRoot, ".write-lock"), {
      schemaVersion: 1,
      pid: deadPid,
      acquiredAt: "2026-08-26T00:45:00.000Z",
    });
    await expect(
      loadRuntime(youngRoot, {
        now: () => new Date("2026-08-26T01:00:00.000Z"),
        lockTimeoutMs: 25,
      })
    ).rejects.toThrow(/younger than 30 minutes/i);
  });

  it("fails closed when PID liveness cannot be determined", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const lockPath = join(root, ".write-lock");
    const lock = {
      schemaVersion: 1,
      pid: 42,
      acquiredAt: "2026-08-26T00:00:00.000Z",
    };
    await writeSecureJson(lockPath, lock);

    await expect(
      loadRuntime(root, {
        now: () => new Date("2026-08-26T01:00:01.000Z"),
        lockTimeoutMs: 0,
        probePid: () => {
          throw Object.assign(new Error("invalid platform PID"), { code: "EINVAL" });
        },
      })
    ).rejects.toThrow(/cannot prove.*PID.*EINVAL/i);
    expect(JSON.parse(await readFile(lockPath, "utf8"))).toEqual(lock);
    expect(await readdir(join(root, "recovery"))).toEqual([]);

    const inaccessibleRoot = await makeRoot();
    await initializeRuntime(inaccessibleRoot, bootstrapInput());
    const inaccessiblePath = join(inaccessibleRoot, ".write-lock");
    await writeSecureJson(inaccessiblePath, lock);
    await expect(
      loadRuntime(inaccessibleRoot, {
        lockTimeoutMs: 0,
        probePid: () => {
          throw Object.assign(new Error("permission denied"), { code: "EPERM" });
        },
      })
    ).rejects.toThrow(/live PID 42/i);
    expect(JSON.parse(await readFile(inaccessiblePath, "utf8"))).toEqual(lock);
  });

  it("rejects symlinked roots and runtime files with unsafe modes or file types", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    await chmod(join(root, "ledger", "events.ndjson"), 0o644);
    await expect(loadRuntime(root)).rejects.toThrow(/mode 0600/i);

    const targetRoot = await makeRoot();
    await initializeRuntime(targetRoot, bootstrapInput());
    const linkedRoot = join(dirname(targetRoot), "linked-runtime");
    await symlink(targetRoot, linkedRoot);
    await expect(loadRuntime(linkedRoot)).rejects.toThrow(/symlink|physical path/i);

    const cacheRoot = await makeRoot();
    await initializeRuntime(cacheRoot, bootstrapInput());
    const programPath = join(cacheRoot, "state", "program.json");
    const movedPath = join(cacheRoot, "state", "program-real.json");
    await rename(programPath, movedPath);
    await symlink(movedPath, programPath);
    await expect(loadRuntime(cacheRoot)).rejects.toThrow(/regular non-symlink/i);
  });

  it("rejects special permission bits on runtime files and directories", async () => {
    const fileRoot = await makeRoot();
    await initializeRuntime(fileRoot, bootstrapInput());
    await chmod(join(fileRoot, "ledger", "events.ndjson"), 0o4600);
    await expect(loadRuntime(fileRoot)).rejects.toThrow(/mode 0600/i);

    const directoryRoot = await makeRoot();
    await initializeRuntime(directoryRoot, bootstrapInput());
    await chmod(join(directoryRoot, "state"), 0o1700);
    await expect(loadRuntime(directoryRoot)).rejects.toThrow(/mode 0700/i);
  });
});

describe("Program Supervisor bootstrap identity and CLI", () => {
  it("fingerprints semantic bootstrap identity independent of whitespace and object key order", () => {
    const left = bootstrapInput({ foundationState: "verification" });
    const right = JSON.parse(JSON.stringify(reverseObjectKeys(left), null, 8)) as unknown;

    expect(canonicalBootstrapFingerprint(left)).toBe(
      canonicalBootstrapFingerprint(right)
    );
  });

  it.each(["seq", "at"] as const)("rejects a caller-supplied %s", async (field) => {
    const root = await makeRoot();
    const input = bootstrapInput({ foundationState: "verification" }) as Record<
      string,
      unknown
    >;
    input[field] = field === "seq" ? 1 : "2026-08-26T01:00:00.000Z";

    await expect(initializeRuntime(root, input)).rejects.toThrow(
      /must not supply seq or at/i
    );
  });

  it("accepts an explicit isolated root without requiring an operational home root", async () => {
    const root = await makeRoot();
    const bootstrapPath = join(dirname(root), "bootstrap-explicit-root.json");
    await writeSecureJson(
      bootstrapPath,
      bootstrapInput({ foundationState: "verification" })
    );

    const initialized = runCli(
      ["init", "--root", root, "--bootstrap-file", bootstrapPath],
      { HOME: join(dirname(root), "home-without-workspace") }
    );

    expect(initialized.status, initialized.stderr).toBe(0);
  });

  it("initializes and validates a mode-0600 complete bootstrap through the CLI", async () => {
    const root = await makeRoot();
    const parent = dirname(root);
    const bootstrapPath = join(parent, "bootstrap.json");
    const whitespacePath = join(parent, "bootstrap-whitespace.json");
    const input = bootstrapInput({ foundationState: "verification" });
    await writeSecureJson(bootstrapPath, input);
    await writeFile(whitespacePath, JSON.stringify(input, null, 8), { mode: 0o600 });
    await chmod(whitespacePath, 0o600);

    const initialized = runCli([
      "init",
      "--root",
      root,
      "--bootstrap-file",
      bootstrapPath,
    ]);
    expect(initialized.status, initialized.stderr).toBe(0);
    const initSummary = JSON.parse(initialized.stdout) as Record<string, unknown>;
    expect(initSummary).toMatchObject({
      schemaVersion: 1,
      valid: true,
      tasks: 3,
      lastEventSeq: 1,
      recoveryState: { abandonedLockOwners: [] },
    });

    const validated = runCli([
      "validate",
      "--root",
      root,
      "--expect-bootstrap-file",
      whitespacePath,
    ]);
    expect(validated.status, validated.stderr).toBe(0);
    expect(JSON.parse(validated.stdout)).toMatchObject({
      valid: true,
      bootstrapFingerprint: initSummary.bootstrapFingerprint,
      activeLeases: { writers: 1, evaluators: 0, total: 1 },
      recoveryState: { abandonedLockOwners: [] },
    });

    const retried = runCli(["init", "--root", root, "--bootstrap-file", bootstrapPath]);
    expect(retried.status).not.toBe(0);
    expect(retried.stderr).toMatch(/already exists/i);
  });

  it.each([
    [
      "replacement task ID",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.tasks, 0).charter.id = "foundation-replacement";
        itemAt(value.activeLeases, 0).taskId = "foundation-replacement";
      },
    ],
    [
      "swapped K1/B00 states",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.tasks, 1).state = "blocked-with-evidence";
        itemAt(value.tasks, 1).receipt = "automation-k1-blocked-receipt";
        itemAt(value.tasks, 2).state = "queued";
        itemAt(value.tasks, 2).receipt = null;
      },
    ],
    [
      "wrong operating-model role path",
      (value: ReturnType<typeof bootstrapInput>) => {
        value.authority.operatingModel.path = "docs/WRONG_OPERATING_MODEL.md";
      },
    ],
    [
      "wrong Wayfinder role path",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.authority.productWayfinders, 0).path = "docs/WRONG.md";
      },
    ],
    [
      "swapped Wayfinder role paths",
      (value: ReturnType<typeof bootstrapInput>) => {
        value.authority.productWayfinders.reverse();
      },
    ],
    [
      "wrong test-roadmap role path",
      (value: ReturnType<typeof bootstrapInput>) => {
        value.authority.testPortfolioRoadmap.path = "docs/WRONG_TEST_ROADMAP.md";
      },
    ],
    [
      "wrong readiness role path",
      (value: ReturnType<typeof bootstrapInput>) => {
        value.authority.readinessBaseline.path = "docs/WRONG_READINESS.md";
      },
    ],
    [
      "wrong status-owner role path",
      (value: ReturnType<typeof bootstrapInput>) => {
        value.authority.statusOwner.path = "docs/WRONG_STATUS.md";
      },
    ],
    [
      "wrong F0 holder",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.activeLeases, 0).holder = "different-holder";
      },
    ],
    [
      "wrong F0 agent",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.activeLeases, 0).agentId = "different-agent";
      },
    ],
    [
      "wrong runtime lease ID",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.activeLeases, 0).leaseId = "runtime-other";
      },
    ],
    [
      "wrong F0 repository lease identity",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.tasks, 0).charter.ownership.repositoryLease.id = "F9";
        itemAt(value.activeLeases, 0).authorityPointer.repositoryLeaseId = "F9";
      },
    ],
    [
      "wrong repository lease owner path",
      (value: ReturnType<typeof bootstrapInput>) => {
        const wrongPath = "docs/OTHER_LEASE_OWNER.md";
        itemAt(value.authority.repositoryLeaseOwners, 0).path = wrongPath;
        for (const taskValue of value.tasks) {
          itemAt(taskValue.charter.authority, 1).path = wrongPath;
          taskValue.charter.ownership.repositoryLease.ownerDocumentPath = wrongPath;
        }
        itemAt(value.activeLeases, 0).authorityPointer.ownerDocumentPath = wrongPath;
      },
    ],
    [
      "wrong K1 repository lease identity",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.tasks, 1).charter.ownership.repositoryLease.id = "K9";
      },
    ],
    [
      "wrong B00 repository lease identity",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.tasks, 2).charter.ownership.repositoryLease.id = "B99";
      },
    ],
    [
      "extra active lease",
      (value: ReturnType<typeof bootstrapInput>) => {
        const automation = itemAt(value.tasks, 1);
        automation.state = "review";
        automation.receipt = "automation-k1-review-receipt";
        value.activeLeases.push({
          ...activeFoundationLease(),
          leaseId: "runtime-automation-k1",
          taskId: "automation-k1",
          holder: "automation-k1-holder",
          agentId: "automation-k1-agent",
          authorityPointer: authorityPointer(PROGRAM_REPOSITORY, "K1"),
        });
      },
    ],
    [
      "extra repository lease owner",
      (value: ReturnType<typeof bootstrapInput>) => {
        value.authority.repositoryLeaseOwners.push({
          path: "docs/OTHER_LEASE_OWNER.md",
          blob: SHA_B,
        });
      },
    ],
  ] as const)("rejects initial adoption with %s", async (_name, mutate) => {
    const root = await makeRoot();
    const bootstrapPath = join(dirname(root), "hostile-bootstrap.json");
    const input = bootstrapInput({ foundationState: "verification" });
    mutate(input);
    await writeSecureJson(bootstrapPath, input);

    const result = runCli(["init", "--root", root, "--bootstrap-file", bootstrapPath]);
    expect(result.status).not.toBe(0);
    await expect(lstat(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects partial, weak-mode, symlinked, and caller-timestamped CLI inputs", async () => {
    const parentRoot = await makeRoot();
    const parent = dirname(parentRoot);
    const partialPath = join(parent, "partial.json");
    const partial = bootstrapInput({ foundationState: "verification" });
    delete (itemAt(partial.tasks, 0).charter as Partial<ReturnType<typeof charter>>)
      .acceptance;
    await writeSecureJson(partialPath, partial);
    const partialResult = runCli([
      "init",
      "--root",
      parentRoot,
      "--bootstrap-file",
      partialPath,
    ]);
    expect(partialResult.status).not.toBe(0);
    expect(partialResult.stderr).toMatch(/acceptance/i);

    const weakRoot = join(parent, "weak-runtime");
    const weakPath = join(parent, "weak.json");
    await writeSecureJson(weakPath, bootstrapInput({ foundationState: "verification" }));
    await chmod(weakPath, 0o644);
    const weakResult = runCli(["init", "--root", weakRoot, "--bootstrap-file", weakPath]);
    expect(weakResult.status).not.toBe(0);
    expect(weakResult.stderr).toMatch(/mode 0600/i);

    const specialRoot = join(parent, "special-runtime");
    const specialPath = join(parent, "special.json");
    await writeSecureJson(
      specialPath,
      bootstrapInput({ foundationState: "verification" })
    );
    await chmod(specialPath, 0o4600);
    const specialResult = runCli([
      "init",
      "--root",
      specialRoot,
      "--bootstrap-file",
      specialPath,
    ]);
    expect(specialResult.status).not.toBe(0);
    expect(specialResult.stderr).toMatch(/mode 0600/i);

    const realPath = join(parent, "real-bootstrap.json");
    const symlinkPath = join(parent, "symlink-bootstrap.json");
    await writeSecureJson(realPath, bootstrapInput({ foundationState: "verification" }));
    await symlink(realPath, symlinkPath);
    const symlinkResult = runCli([
      "init",
      "--root",
      join(parent, "symlink-runtime"),
      "--bootstrap-file",
      symlinkPath,
    ]);
    expect(symlinkResult.status).not.toBe(0);
    expect(symlinkResult.stderr).toMatch(/regular non-symlink/i);

    for (const field of ["seq", "at"] as const) {
      const supplied = bootstrapInput({ foundationState: "verification" }) as Record<
        string,
        unknown
      >;
      supplied[field] = field === "seq" ? 1 : "2026-08-26T01:00:00.000Z";
      const suppliedPath = join(parent, `supplied-${field}.json`);
      await writeSecureJson(suppliedPath, supplied);
      const result = runCli([
        "init",
        "--root",
        join(parent, `supplied-${field}-runtime`),
        "--bootstrap-file",
        suppliedPath,
      ]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/must not supply seq or at/i);
    }
  });

  it.each([
    [
      "nested authority blob",
      (value: ReturnType<typeof bootstrapInput>) => {
        value.authority.operatingModel.blob = SHA_F;
        for (const bootstrapTask of value.tasks) {
          itemAt(bootstrapTask.charter.authority, 0).blob = SHA_F;
        }
      },
    ],
    [
      "acceptance criterion",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.tasks, 0).charter.acceptance[0] = "Changed acceptance criterion";
      },
    ],
    [
      "repository pointer",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.tasks, 0).charter.ownership.repository = "/repo/other";
        itemAt(value.activeLeases, 0).authorityPointer.repository = "/repo/other";
      },
    ],
    [
      "lease path",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.tasks, 0).charter.ownership.paths[0] = "scripts/other";
      },
    ],
    [
      "receipt",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.tasks, 0).receipt = "Changed verification receipt";
      },
    ],
    [
      "holder",
      (value: ReturnType<typeof bootstrapInput>) => {
        itemAt(value.activeLeases, 0).holder = "different-holder";
      },
    ],
  ] as const)(
    "rejects expected bootstrap identity drift in the %s",
    async (_name, mutate) => {
      const root = await makeRoot();
      const parent = dirname(root);
      const adoptedPath = join(parent, "adopted.json");
      const changedPath = join(parent, "changed.json");
      const adopted = bootstrapInput({ foundationState: "verification" });
      const changed = clone(adopted);
      mutate(changed);
      await writeSecureJson(adoptedPath, adopted);
      await writeSecureJson(changedPath, changed);
      const initialized = runCli([
        "init",
        "--root",
        root,
        "--bootstrap-file",
        adoptedPath,
      ]);
      expect(initialized.status, initialized.stderr).toBe(0);

      const validation = runCli([
        "validate",
        "--root",
        root,
        "--expect-bootstrap-file",
        changedPath,
      ]);
      expect(validation.status).not.toBe(0);
      expect(validation.stderr).toMatch(/bootstrap.*(fingerprint|identity)|corrupt/i);
    }
  );

  it("validates append event files as mode-0600 bodies without seq or at", async () => {
    const root = await makeRoot();
    const parent = dirname(root);
    const bootstrapPath = join(parent, "bootstrap.json");
    const eventPath = join(parent, "event.json");
    await writeSecureJson(
      bootstrapPath,
      bootstrapInput({ foundationState: "verification" })
    );
    expect(
      runCli(["init", "--root", root, "--bootstrap-file", bootstrapPath]).status
    ).toBe(0);
    await writeSecureJson(eventPath, {
      schemaVersion: 1,
      eventId: "event-cli-evidence",
      type: "evidence-recorded",
      writerId: CONTROLLER_WRITER_ID,
      taskId: "foundation-f0",
      evidence: {
        id: "cli-evidence",
        kind: "verification",
        receipt: "CLI append assigned sequence and timestamp under the lock.",
      },
    });

    const appended = runCli(["append", "--root", root, "--event-file", eventPath]);
    expect(appended.status, appended.stderr).toBe(0);
    expect(JSON.parse(appended.stdout)).toMatchObject({ valid: true, lastEventSeq: 2 });

    const suppliedPath = join(parent, "event-with-at.json");
    await writeSecureJson(suppliedPath, {
      schemaVersion: 1,
      eventId: "event-illegal-at",
      type: "no-frontier-recorded",
      writerId: CONTROLLER_WRITER_ID,
      at: "2026-08-26T01:00:00.000Z",
      wayfinder: "foundation",
      receipt: "Caller supplied an event timestamp.",
    });
    const supplied = runCli(["append", "--root", root, "--event-file", suppliedPath]);
    expect(supplied.status).not.toBe(0);
    expect(supplied.stderr).toMatch(/must not supply seq or at/i);

    const weakPath = join(parent, "event-weak-mode.json");
    await writeSecureJson(weakPath, {
      schemaVersion: 1,
      eventId: "event-weak-mode",
      type: "no-frontier-recorded",
      writerId: CONTROLLER_WRITER_ID,
      wayfinder: "foundation",
      receipt: "A weak-mode event file must be rejected before parsing.",
    });
    await chmod(weakPath, 0o644);
    const weak = runCli(["append", "--root", root, "--event-file", weakPath]);
    expect(weak.status).not.toBe(0);
    expect(weak.stderr).toMatch(/mode 0600/i);

    const specialPath = join(parent, "event-special-mode.json");
    await writeSecureJson(specialPath, {
      schemaVersion: 1,
      eventId: "event-special-mode",
      type: "no-frontier-recorded",
      writerId: CONTROLLER_WRITER_ID,
      wayfinder: "foundation",
      receipt: "A special-bit event file must be rejected before parsing.",
    });
    await chmod(specialPath, 0o4600);
    const special = runCli(["append", "--root", root, "--event-file", specialPath]);
    expect(special.status).not.toBe(0);
    expect(special.stderr).toMatch(/mode 0600/i);

    const realEventPath = join(parent, "event-real.json");
    const symlinkEventPath = join(parent, "event-symlink.json");
    await writeSecureJson(realEventPath, {
      schemaVersion: 1,
      eventId: "event-symlink",
      type: "no-frontier-recorded",
      writerId: CONTROLLER_WRITER_ID,
      wayfinder: "foundation",
      receipt: "A symlinked event file must be rejected before parsing.",
    });
    await symlink(realEventPath, symlinkEventPath);
    const linked = runCli(["append", "--root", root, "--event-file", symlinkEventPath]);
    expect(linked.status).not.toBe(0);
    expect(linked.stderr).toMatch(/regular non-symlink/i);
  });
});
