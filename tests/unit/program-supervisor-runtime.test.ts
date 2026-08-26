import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  appendEvent,
  canonicalBootstrapFingerprint,
  initializeRuntime,
  loadRuntime,
  rebuildRuntime,
  type RuntimeOptions,
  type RuntimeProjection,
} from "../../scripts/program-supervisor/runtime";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);
const SHA_D = "d".repeat(40);
const SHA_E = "e".repeat(40);
const SHA_F = "f".repeat(40);
const ZERO_OID = "0".repeat(40);
const PROGRAM_REPOSITORY = "/repo/d20-folio";
const EVENT_REF = "refs/program-supervisor/events";
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
const GIT_TEST_ENV = {
  PATH: "/usr/bin:/bin",
  LANG: "C",
  LC_ALL: "C",
  TZ: "UTC",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOREPLACEOBJECTS: "1",
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_TERMINAL_PROMPT: "0",
};

const temporaryParents: string[] = [];
const activeChildren: ReturnType<typeof spawn>[] = [];
type RuntimeTestOptions = RuntimeOptions & {
  afterResidueScan?: () => void | Promise<void>;
  afterTipRead?: (tip: string) => void | Promise<void>;
  onGitCommand?: (args: readonly string[]) => void;
};
const loadRuntimeWithOptions = loadRuntime as unknown as (
  root: string,
  options: RuntimeTestOptions
) => Promise<RuntimeProjection>;

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
      { path: OPERATING_MODEL_PATH, blob: SHA_C },
      { path: LEASE_OWNER_PATH, blob: SHA_A },
    ],
    dependencies: [] as Array<{
      taskId: string;
      integratedSha: string;
      requiredInterface: string;
    }>,
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
      operatingModel: { path: OPERATING_MODEL_PATH, blob: SHA_C },
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

function evidenceInput(id: string, taskId = "foundation-f0") {
  return {
    schemaVersion: 1,
    eventId: `event-${id}`,
    type: "evidence-recorded",
    writerId: CONTROLLER_WRITER_ID,
    taskId,
    evidence: {
      id,
      kind: "runtime-proof",
      receipt: `Durable receipt for ${id}`,
    },
  };
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)])
    );
  }
  return value;
}

function canonicalBytes(value: unknown): string {
  return `${JSON.stringify(canonicalValue(value))}\n`;
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

function runCli(args: readonly string[], environment: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...environment, NO_COLOR: "1" },
  });
}

function gitRaw(root: string, args: readonly string[], input?: string): string {
  const result = spawnSync(
    "/usr/bin/git",
    [
      "-c",
      "core.fsync=all",
      "-c",
      "core.fsyncMethod=fsync",
      `--git-dir=${root}`,
      ...args,
    ],
    {
      encoding: "utf8",
      input,
      env: GIT_TEST_ENV,
    }
  );
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function git(root: string, args: readonly string[], input?: string): string {
  return gitRaw(root, args, input).trimEnd();
}

function refTip(root: string): string {
  return git(root, ["rev-parse", "--verify", EVENT_REF]);
}

function createTree(
  root: string,
  entries: Array<{ mode?: string; type?: string; oid: string; name: string }>
): string {
  return git(
    root,
    ["mktree"],
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(
        ({ mode = "100644", type = "blob", oid, name }) =>
          `${mode} ${type} ${oid}\t${name}\n`
      )
      .join("")
  );
}

function createCommit(
  root: string,
  tree: string,
  parents: readonly string[],
  seq: number,
  at = "2026-08-26T02:00:00.000Z"
): string {
  const timestamp = Math.floor(new Date(at).getTime() / 1_000);
  const result = spawnSync(
    "/usr/bin/git",
    [
      "-c",
      "core.fsync=all",
      "-c",
      "core.fsyncMethod=fsync",
      `--git-dir=${root}`,
      "commit-tree",
      tree,
      ...parents.flatMap((parent) => ["-p", parent]),
    ],
    {
      encoding: "utf8",
      input: `d20-folio program event ${seq}\n`,
      env: {
        ...GIT_TEST_ENV,
        GIT_AUTHOR_NAME: "d20 Folio Program Supervisor",
        GIT_AUTHOR_EMAIL: "program-supervisor@localhost",
        GIT_COMMITTER_NAME: "d20 Folio Program Supervisor",
        GIT_COMMITTER_EMAIL: "program-supervisor@localhost",
        GIT_AUTHOR_DATE: `@${timestamp} +0000`,
        GIT_COMMITTER_DATE: `@${timestamp} +0000`,
      },
    }
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function publish(root: string, next: string, previous: string): void {
  git(root, ["update-ref", "--no-deref", EVENT_REF, next, previous]);
}

function createEvidenceCommit(
  root: string,
  parent: string,
  id: string,
  seq: number,
  at = "2026-08-26T02:02:00.000Z"
): string {
  const bootstrapOid = git(root, ["rev-parse", `${parent}:bootstrap.json`]);
  const eventOid = git(
    root,
    ["hash-object", "-w", "--stdin"],
    canonicalBytes({ ...evidenceInput(id), seq, at })
  );
  return createCommit(
    root,
    createTree(root, [
      { oid: bootstrapOid, name: "bootstrap.json" },
      { oid: eventOid, name: "event.json" },
    ]),
    [parent],
    seq,
    at
  );
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  label: string
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await predicate()) return;
    await delay(10);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function prepareRefTransaction(
  root: string,
  next: string,
  previous: string
): Promise<{ commit: () => Promise<void> }> {
  const child = spawn(
    "/usr/bin/git",
    [
      "-c",
      "core.fsync=all",
      "-c",
      "core.fsyncMethod=fsync",
      `--git-dir=${root}`,
      "update-ref",
      "--stdin",
    ],
    { env: GIT_TEST_ENV, stdio: ["pipe", "pipe", "pipe"] }
  );
  activeChildren.push(child);
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.stdin.write(`start\nupdate ${EVENT_REF} ${next} ${previous}\nprepare\n`);
  await waitFor(() => stdout.includes("prepare: ok"), "prepared update-ref lock");
  return {
    commit: async () => {
      child.stdin.end("commit\n");
      const result = await new Promise<{ code: number | null; signal: string | null }>(
        (resolveExit) => {
          child.once("exit", (code, signal) => resolveExit({ code, signal }));
        }
      );
      if (result.code !== 0) {
        throw new Error(`prepared update-ref failed: ${stderr || stdout}`);
      }
    },
  };
}

async function findObjectTemps(root: string): Promise<string[]> {
  const found: string[] = [];
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.name.startsWith("tmp_obj_")) found.push(child);
      if (entry.isDirectory()) await visit(child);
    }
  }
  await visit(join(root, "objects"));
  return found.sort();
}

interface ManifestEntry {
  path: string;
  kind: "directory" | "file";
  inode: string;
  mode: number;
  size: string;
  mtimeNs: string;
  bytes?: string;
  sha256?: string;
}

async function recursiveManifest(root: string): Promise<ManifestEntry[]> {
  const result: ManifestEntry[] = [];
  async function visit(path: string, relativePath: string): Promise<void> {
    const metadata = await lstat(path, { bigint: true });
    const entry: ManifestEntry = {
      path: relativePath,
      kind: metadata.isDirectory() ? "directory" : "file",
      inode: `${metadata.dev}:${metadata.ino}`,
      mode: Number(metadata.mode & 0o7777n),
      size: metadata.size.toString(),
      mtimeNs: metadata.mtimeNs.toString(),
    };
    if (metadata.isFile()) {
      const bytes = await readFile(path);
      entry.bytes = bytes.toString("base64");
      entry.sha256 = createHash("sha256").update(bytes).digest("hex");
    }
    result.push(entry);
    if (metadata.isDirectory()) {
      for (const name of (await readdir(path)).sort()) {
        await visit(
          join(path, name),
          relativePath === "." ? name : join(relativePath, name)
        );
      }
    }
  }
  await visit(root, ".");
  return result;
}

async function storeResidues(root: string): Promise<string[]> {
  const residues: string[] = [];
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const fullPath = join(path, entry.name);
      if (
        entry.name.endsWith(".lock") ||
        entry.name.startsWith("tmp_obj_") ||
        entry.name.endsWith(".tmp") ||
        entry.name.includes("write-lock") ||
        ["events.ndjson", "program.json", "leases.json"].includes(entry.name)
      ) {
        residues.push(fullPath);
      }
      if (entry.isDirectory()) await visit(fullPath);
    }
  }
  await visit(root);
  return residues;
}

afterEach(async () => {
  for (const child of activeChildren.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  await Promise.all(
    temporaryParents
      .splice(0)
      .map((parent) => rm(parent, { recursive: true, force: true }))
  );
});

describe("Program Supervisor private bare-Git runtime", () => {
  it("initializes the exact immutable chain and reconstructs it", async () => {
    const root = await makeRoot();
    const bootstrap = bootstrapInput();

    const initialized = await initializeRuntime(root, bootstrap, {
      now: () => new Date("2026-08-26T02:00:00.000Z"),
    });
    const appended = await appendEvent(root, evidenceInput("evidence-one"), {
      now: () => new Date("2026-08-26T02:01:00.000Z"),
    });
    const loaded = await loadRuntime(root);

    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await readdir(root)).sort()).toEqual(["HEAD", "config", "objects", "refs"]);
    expect(initialized.store.ref).toBe(EVENT_REF);
    expect(initialized.store.bootstrapCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(appended.store.tip).toMatch(/^[0-9a-f]{40}$/);
    expect(loaded.snapshot.lastEventSeq).toBe(2);
    expect(loaded.snapshot.tasks[0]?.evidence[0]?.id).toBe("evidence-one");

    const commits = git(root, [
      "rev-list",
      "--first-parent",
      "--reverse",
      EVENT_REF,
    ]).split("\n");
    expect(commits).toHaveLength(2);
    for (const [index, commit] of commits.entries()) {
      const entries = git(root, ["ls-tree", commit]).split("\n");
      expect(entries.map((entry) => entry.replace(/^[^\t]+\t/, ""))).toEqual([
        "bootstrap.json",
        "event.json",
      ]);
      expect(entries.every((entry) => entry.startsWith("100644 blob "))).toBe(true);
      const parents = git(root, ["show", "-s", "--format=%P", commit]);
      expect(parents === "" ? [] : parents.split(" ")).toHaveLength(index === 0 ? 0 : 1);
      expect(
        (
          await readFile(join(root, "refs", "program-supervisor", "events"), "utf8")
        ).endsWith("\n")
      ).toBe(true);
      expect(
        gitRaw(root, ["cat-file", "blob", `${commit}:event.json`]).endsWith("\n")
      ).toBe(true);
    }
    const bootstrapOids = commits.map((commit) =>
      git(root, ["rev-parse", `${commit}:bootstrap.json`])
    );
    expect(new Set(bootstrapOids).size).toBe(1);
    expect(loaded.snapshot.bootstrapFingerprint).toBe(
      canonicalBootstrapFingerprint(bootstrap)
    );
  });

  it("serializes two CAS contenders without loss or duplicate sequence", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    let arrivals = 0;
    let release!: () => void;
    const bothReady = new Promise<void>((resolveReady) => {
      release = resolveReady;
    });
    const options = {
      now: () => new Date("2026-08-26T02:02:00.000Z"),
      beforePublish: async () => {
        arrivals += 1;
        if (arrivals === 2) release();
        if (arrivals <= 2) await bothReady;
      },
    } as RuntimeOptions;

    await Promise.all([
      appendEvent(root, evidenceInput("contender-a"), options),
      appendEvent(root, evidenceInput("contender-b"), options),
    ]);

    const loaded = await loadRuntime(root);
    expect(arrivals).toBeGreaterThanOrEqual(2);
    expect(loaded.snapshot.lastEventSeq).toBe(3);
    expect(loaded.snapshot.tasks[0]?.evidence.map(({ id }) => id).sort()).toEqual([
      "contender-a",
      "contender-b",
    ]);
  });

  it("waits for a real prepared update-ref transaction before retrying from its committed tip", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const previous = refTip(root);
    const competing = createEvidenceCommit(root, previous, "prepared-writer", 2);
    const transaction = await prepareRefTransaction(root, competing, previous);

    const observed = appendEvent(root, evidenceInput("waiting-writer"), {
      now: () => new Date("2026-08-26T02:03:00.000Z"),
    }).then(
      (value) => ({ value, error: undefined }),
      (error: unknown) => ({ value: undefined, error })
    );
    await delay(50);
    await transaction.commit();
    const outcome = await observed;

    expect(outcome.error).toBeUndefined();
    expect(outcome.value?.snapshot.lastEventSeq).toBe(3);
    expect(outcome.value?.snapshot.tasks[0]?.evidence.map(({ id }) => id).sort()).toEqual(
      ["prepared-writer", "waiting-writer"]
    );
  });

  it("reclassifies real Git activity that begins after the residue scan as transient contention", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const previous = refTip(root);
    const next = createEvidenceCommit(root, previous, "post-scan-writer", 2);
    let started = 0;
    let commit: Promise<void> | undefined;

    const loaded = await loadRuntimeWithOptions(root, {
      afterResidueScan: async () => {
        if (started > 0) return;
        started += 1;
        const transaction = await prepareRefTransaction(root, next, previous);
        commit = delay(50).then(() => transaction.commit());
      },
    });
    await commit;

    expect(started).toBe(1);
    expect(loaded.store.tip).toBe(next);
    expect(loaded.snapshot.lastEventSeq).toBe(2);
    expect(loaded.snapshot.tasks[0]?.evidence.at(-1)?.id).toBe("post-scan-writer");
  });

  it("validates one captured ref linearization point when a cooperating writer advances later", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const previous = refTip(root);
    const next = createEvidenceCommit(root, previous, "load-advance", 2);
    let advanced = 0;

    const loaded = await loadRuntimeWithOptions(root, {
      afterTipRead: (captured) => {
        expect(captured).toBe(previous);
        publish(root, next, previous);
        advanced += 1;
      },
    });

    expect(advanced).toBe(1);
    expect(loaded.store.tip).toBe(previous);
    expect(loaded.snapshot.lastEventSeq).toBe(1);
    expect(refTip(root)).toBe(next);
    expect((await loadRuntime(root)).snapshot.lastEventSeq).toBe(2);
  });

  it("adopts a successful CAS whose command result is lost", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    let injected = 0;

    const result = await appendEvent(root, evidenceInput("ambiguous-cas"), {
      now: () => new Date("2026-08-26T02:03:00.000Z"),
      afterPublish: () => {
        injected += 1;
        throw new Error("injected lost update-ref result");
      },
    });

    expect(injected).toBe(1);
    expect(result.snapshot.lastEventSeq).toBe(2);
    expect((await loadRuntime(root)).snapshot.lastEventSeq).toBe(2);
  });

  it("validates its accepted candidate and returns a later cooperating descendant", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    let candidate: string | undefined;
    let descendant: string | undefined;
    let advanced = 0;
    const options: RuntimeTestOptions = {
      now: () => new Date("2026-08-26T02:03:00.000Z"),
      afterPublish: (published) => {
        candidate = published;
        descendant = createEvidenceCommit(
          root,
          published,
          "post-cas-descendant",
          3,
          "2026-08-26T02:04:00.000Z"
        );
      },
      afterTipRead: (captured) => {
        if (captured === candidate && descendant) {
          publish(root, descendant, captured);
          advanced += 1;
        }
      },
    };

    const result = await appendEvent(root, evidenceInput("accepted-candidate"), options);

    expect(advanced).toBe(1);
    expect(result.store.tip).toBe(descendant);
    expect(result.snapshot.lastEventSeq).toBe(3);
    expect(result.snapshot.tasks[0]?.evidence.map(({ id }) => id)).toEqual([
      "accepted-candidate",
      "post-cas-descendant",
    ]);
  });

  it("does not retry an update failure whose tip did not change", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const lockPath = join(root, "refs", "program-supervisor", "events.lock");
    let attempts = 0;

    await expect(
      appendEvent(root, evidenceInput("unchanged-tip"), {
        beforePublish: async () => {
          attempts += 1;
          await writeFile(lockPath, "preserve for manual recovery\n", { flag: "wx" });
        },
      })
    ).rejects.toThrow(/unchanged|manual|lock/i);
    expect(attempts).toBe(1);
    expect(await readFile(lockPath, "utf8")).toContain("manual recovery");
  });

  it("preserves Git-internal lock residue and fails closed", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const lockPath = join(root, "refs", "program-supervisor", "events.lock");
    await writeFile(lockPath, "stale\n");

    await expect(loadRuntime(root)).rejects.toThrow(/lock.*manual|manual.*lock/i);
    expect(await readFile(lockPath, "utf8")).toBe("stale\n");
  });

  it("never adopts or reinitializes an incomplete existing root", async () => {
    const root = await makeRoot();
    await mkdir(root, { mode: 0o700 });
    await writeFile(join(root, "crash-receipt"), "incomplete\n", { mode: 0o600 });
    const before = await lstat(join(root, "crash-receipt"));

    await expect(initializeRuntime(root, bootstrapInput())).rejects.toThrow(
      /already exists|incomplete/i
    );
    await expect(loadRuntime(root)).rejects.toThrow(/incomplete|shape|unexpected/i);
    const after = await lstat(join(root, "crash-receipt"));
    expect(after.ino).toBe(before.ino);
    expect(await readFile(join(root, "crash-receipt"), "utf8")).toBe("incomplete\n");
  });

  it("rejects an unsafe immediate runtime parent through the exported API and CLI", async () => {
    const root = await makeRoot("existing-runtime");
    const parent = dirname(root);
    const bootstrapPath = join(parent, "bootstrap.json");
    await writeSecureJson(bootstrapPath, bootstrapInput());
    await initializeRuntime(root, bootstrapInput());
    await chmod(parent, 0o777);
    try {
      expect((await lstat(parent)).uid).toBe(process.getuid?.());
      await expect(loadRuntime(root)).rejects.toThrow(/parent.*writable|parent.*mode/i);
      await expect(
        initializeRuntime(join(parent, "new-runtime"), bootstrapInput())
      ).rejects.toThrow(/parent.*writable|parent.*mode/i);
      const cli = runCli(["validate", "--root", root]);
      expect(cli.status).not.toBe(0);
      expect(cli.stderr).toMatch(/parent.*writable|parent.*mode/i);
    } finally {
      await chmod(parent, 0o700);
    }
  });

  it("allows exactly one concurrent initializer to claim an absent root", async () => {
    const root = await makeRoot();
    const results = await Promise.allSettled([
      initializeRuntime(root, bootstrapInput(), {
        now: () => new Date("2026-08-26T02:00:00.000Z"),
      }),
      initializeRuntime(root, bootstrapInput(), {
        now: () => new Date("2026-08-26T02:00:00.000Z"),
      }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect((await loadRuntime(root)).snapshot.lastEventSeq).toBe(1);
  });

  it("keeps a pre-CAS child crash non-authoritative", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const child = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { appendEvent } from ${JSON.stringify(RUNTIME_URL)}; await appendEvent(${JSON.stringify(root)}, ${JSON.stringify(evidenceInput("child-crash"))}, { beforePublish: () => process.exit(23) });`,
      ],
      { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } }
    );

    expect(child.status).toBe(23);
    expect((await loadRuntime(root)).snapshot.lastEventSeq).toBe(1);
    expect(await storeResidues(root)).toEqual([]);
  });

  it("preserves and surfaces a real Git object-writer SIGKILL residue", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const payload = join(dirname(root), "large-sparse-payload");
    const payloadHandle = await open(payload, "w");
    await payloadHandle.truncate(512 * 1024 * 1024);
    await payloadHandle.close();
    const child = spawn(
      "/usr/bin/git",
      [
        "-c",
        "core.fsync=all",
        "-c",
        "core.fsyncMethod=fsync",
        `--git-dir=${root}`,
        "hash-object",
        "-w",
        payload,
      ],
      { env: GIT_TEST_ENV, stdio: ["ignore", "pipe", "pipe"] }
    );
    activeChildren.push(child);
    await waitFor(
      async () => (await findObjectTemps(root)).length > 0,
      "Git object temp"
    );
    const exit = new Promise<{ code: number | null; signal: string | null }>(
      (resolveExit) => {
        child.once("exit", (code, signal) => resolveExit({ code, signal }));
      }
    );
    child.kill("SIGKILL");
    expect((await exit).signal).toBe("SIGKILL");
    const residues = await findObjectTemps(root);
    expect(residues).not.toEqual([]);
    const before = await Promise.all(residues.map((path) => lstat(path)));

    await expect(loadRuntime(root)).rejects.toThrow(
      /Git-internal.*temp.*manual|temporary Git object.*manual/i
    );
    const after = await Promise.all(residues.map((path) => lstat(path)));
    expect(after.map(({ ino }) => ino)).toEqual(before.map(({ ino }) => ino));
    expect(await findObjectTemps(root)).toEqual(residues);
  });

  it("leaves no mutable application residue and rebuild is a read-only no-op", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    await appendEvent(root, evidenceInput("rebuild-proof"));
    const tipBefore = refTip(root);
    const manifestBefore = await recursiveManifest(root);
    expect(manifestBefore.some(({ path }) => path === "config")).toBe(true);
    expect(manifestBefore.some(({ path }) => path === "HEAD")).toBe(true);
    expect(manifestBefore.some(({ path }) => path.startsWith("refs/"))).toBe(true);
    expect(manifestBefore.some(({ path }) => path.startsWith("objects/"))).toBe(true);

    const before = await loadRuntime(root);
    const rebuilt = await rebuildRuntime(root);

    expect(rebuilt).toEqual(before);
    expect(refTip(root)).toBe(tipBefore);
    expect(await recursiveManifest(root)).toEqual(manifestBefore);
    expect(await storeResidues(root)).toEqual([]);
    await expect(lstat(join(root, "logs"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(join(root, "packed-refs"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("uses a constant number of Git processes for full replay regardless of chain length", async () => {
    const shortRoot = await makeRoot("short-runtime");
    const longRoot = await makeRoot("long-runtime");
    await initializeRuntime(shortRoot, bootstrapInput());
    await initializeRuntime(longRoot, bootstrapInput());
    for (let index = 0; index < 8; index += 1) {
      await appendEvent(longRoot, evidenceInput(`linear-${index}`), {
        now: () =>
          new Date(`2026-08-26T02:${String(index + 1).padStart(2, "0")}:00.000Z`),
      });
    }

    async function commandsFor(root: string): Promise<string[][]> {
      const commands: string[][] = [];
      await loadRuntimeWithOptions(root, {
        onGitCommand: (args) => commands.push([...args]),
      });
      return commands;
    }
    const shortCommands = await commandsFor(shortRoot);
    const longCommands = await commandsFor(longRoot);
    const named = (commands: readonly string[][], name: string) =>
      commands.filter(([command]) => command === name);

    expect(named(shortCommands, "rev-list")).toHaveLength(1);
    expect(named(longCommands, "rev-list")).toHaveLength(1);
    expect(named(shortCommands, "cat-file")).toHaveLength(3);
    expect(named(longCommands, "cat-file")).toHaveLength(3);
    expect(longCommands).toHaveLength(shortCommands.length);
  }, 30_000);

  it("publishes and replays a valid event larger than the former 32 MiB batch buffer", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const receiptBytes = 33 * 1024 * 1024;
    const event = evidenceInput("large-event");
    event.evidence.receipt = "x".repeat(receiptBytes);

    const appended = await appendEvent(root, event, {
      now: () => new Date("2026-08-26T02:05:00.000Z"),
    });
    const loaded = await loadRuntime(root);
    const rebuilt = await rebuildRuntime(root);

    expect(git(root, ["rev-list", "--count", EVENT_REF])).toBe("2");
    expect(appended.snapshot.lastEventSeq).toBe(2);
    expect(loaded.snapshot.tasks[0]?.evidence.at(-1)?.receipt).toHaveLength(receiptBytes);
    expect(rebuilt).toEqual(loaded);
  }, 120_000);

  it("rejects an event above the object bound before publishing it", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const previous = refTip(root);
    const event = evidenceInput("oversized-event");
    event.evidence.receipt = "x".repeat(64 * 1024 * 1024);

    await expect(appendEvent(root, event)).rejects.toThrow(/object limit/i);

    expect(refTip(root)).toBe(previous);
    expect(git(root, ["rev-list", "--count", EVENT_REF])).toBe("1");
    expect((await loadRuntime(root)).snapshot.lastEventSeq).toBe(1);
  }, 120_000);

  it.each([
    ["non-canonical config", "config", "\n[include]\n\tpath = /tmp/evil\n"],
    ["alternates", "objects/info/alternates", "/tmp/objects\n"],
    ["grafts", "info/grafts", `${SHA_A} ${SHA_B}\n`],
    ["shallow metadata", "shallow", `${SHA_A}\n`],
    [
      "packed refs",
      "packed-refs",
      `# pack-refs with: peeled fully-peeled\n${SHA_A} refs/heads/evil\n`,
    ],
    [
      "reflog",
      "logs/refs/program-supervisor/events",
      `${ZERO_OID} ${SHA_A} a <a@b> 1 +0000\tbad\n`,
    ],
    ["common-dir indirection", "commondir", "../shared.git\n"],
    ["worktree indirection", "gitdir", "/tmp/untrusted-worktree/.git\n"],
  ])("rejects %s without repairing it", async (_label, relativePath, contents) => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const path = join(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    if (relativePath === "config") {
      await writeFile(path, `${await readFile(path, "utf8")}${contents}`);
    } else {
      await writeFile(path, contents);
    }

    await expect(loadRuntime(root)).rejects.toThrow();
    expect(await readFile(path, "utf8")).toContain(contents.trim());
  });

  it("rejects an unexpected ref", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    git(root, [
      "update-ref",
      "--no-deref",
      "refs/heads/unexpected",
      refTip(root),
      ZERO_OID,
    ]);
    await expect(loadRuntime(root)).rejects.toThrow(/unexpected ref|must be empty/i);
  });

  it("rejects replacement refs even though replacement lookup is disabled", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const tip = refTip(root);
    git(root, ["update-ref", "--no-deref", `refs/replace/${tip}`, tip, ZERO_OID]);

    await expect(loadRuntime(root)).rejects.toThrow(/unexpected shape|unexpected ref/i);
  });

  it("rejects a symbolic fixed event ref while retaining canonical symbolic HEAD", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    const refPath = join(root, "refs", "program-supervisor", "events");
    await writeFile(refPath, "ref: refs/heads/unexpected\n");

    await expect(loadRuntime(root)).rejects.toThrow(/direct SHA-1 OID/i);
    expect(await readFile(join(root, "HEAD"), "utf8")).toBe(`ref: ${EVENT_REF}\n`);
  });

  it("rejects a missing tip object", async () => {
    const root = await makeRoot();
    await initializeRuntime(root, bootstrapInput());
    await writeFile(join(root, "refs", "program-supervisor", "events"), `${SHA_F}\n`);
    await expect(loadRuntime(root)).rejects.toThrow(/missing|invalid|integrity|object/i);
  });

  it("rejects malformed trees, bootstrap drift, merges, and replayed sequences", async () => {
    const cases = [
      "missing-bootstrap",
      "extra-entry",
      "bootstrap-drift",
      "merge",
      "replay",
      "noncanonical-json",
      "envelope",
    ];
    for (const name of cases) {
      const root = await makeRoot(name);
      await initializeRuntime(root, bootstrapInput(), {
        now: () => new Date("2026-08-26T02:00:00.000Z"),
      });
      await appendEvent(root, evidenceInput(`base-${name}`), {
        now: () => new Date("2026-08-26T02:01:00.000Z"),
      });
      const tip = refTip(root);
      const bootstrapOid = git(root, ["rev-parse", `${tip}:bootstrap.json`]);
      const nextEvent = {
        ...evidenceInput(`bad-${name}`),
        seq: 3,
        at: "2026-08-26T02:02:00.000Z",
      };
      let eventOid = git(
        root,
        ["hash-object", "-w", "--stdin"],
        canonicalBytes(nextEvent)
      );
      let entries = [
        { oid: bootstrapOid, name: "bootstrap.json" },
        { oid: eventOid, name: "event.json" },
      ];
      let parents = [tip];
      let seq = 3;
      if (name === "missing-bootstrap") entries = entries.slice(1);
      if (name === "extra-entry") {
        const extraOid = git(root, ["hash-object", "-w", "--stdin"], "extra\n");
        entries.push({ oid: extraOid, name: "extra.txt" });
      }
      if (name === "bootstrap-drift") {
        const changedBootstrap = git(
          root,
          ["hash-object", "-w", "--stdin"],
          `${canonicalBytes(bootstrapInput()).trim()} \n`
        );
        entries[0] = { oid: changedBootstrap, name: "bootstrap.json" };
      }
      if (name === "merge") {
        const rootCommit = git(root, ["rev-list", "--max-parents=0", tip]);
        parents = [tip, rootCommit];
      }
      if (name === "replay") {
        seq = 2;
        const priorEvent = git(root, ["show", `${tip}:event.json`]);
        eventOid = git(root, ["hash-object", "-w", "--stdin"], `${priorEvent}\n`);
        entries[1] = { oid: eventOid, name: "event.json" };
      }
      if (name === "noncanonical-json") {
        eventOid = git(
          root,
          ["hash-object", "-w", "--stdin"],
          `${JSON.stringify(nextEvent, null, 2)}\n`
        );
        entries[1] = { oid: eventOid, name: "event.json" };
      }
      if (name === "envelope") seq = 99;
      const commit = createCommit(root, createTree(root, entries), parents, seq);
      publish(root, commit, tip);

      await expect(loadRuntime(root), name).rejects.toThrow();
    }
  }, 30_000);

  it("fingerprints semantic bootstrap identity independent of key order", () => {
    const bootstrap = bootstrapInput();
    const reversed = Object.fromEntries(Object.entries(bootstrap).reverse());
    expect(canonicalBootstrapFingerprint(reversed)).toBe(
      canonicalBootstrapFingerprint(bootstrap)
    );
    const changed = structuredClone(bootstrap);
    const firstTask = changed.tasks[0];
    if (!firstTask) throw new Error("Bootstrap fixture must contain foundation-f0");
    firstTask.charter.acceptance[0] = "changed acceptance";
    expect(canonicalBootstrapFingerprint(changed)).not.toBe(
      canonicalBootstrapFingerprint(bootstrap)
    );
  });

  it("prints the immutable store identity through the CLI", async () => {
    const root = await makeRoot();
    const bootstrapPath = join(dirname(root), "bootstrap.json");
    const eventPath = join(dirname(root), "event.json");
    await writeSecureJson(
      bootstrapPath,
      bootstrapInput({ foundationState: "verification", activeFoundation: true })
    );
    await writeSecureJson(eventPath, evidenceInput("cli-evidence"));

    const initialized = runCli([
      "init",
      "--root",
      root,
      "--bootstrap-file",
      bootstrapPath,
    ]);
    expect(initialized.status, initialized.stderr).toBe(0);
    const appended = runCli(["append", "--root", root, "--event-file", eventPath]);
    expect(appended.status, appended.stderr).toBe(0);
    const validated = runCli([
      "validate",
      "--root",
      root,
      "--expect-bootstrap-file",
      bootstrapPath,
    ]);
    expect(validated.status, validated.stderr).toBe(0);
    const summary = JSON.parse(validated.stdout) as Record<string, unknown>;
    expect(summary).toMatchObject({
      schemaVersion: 1,
      mainSha: SHA_B,
      tasks: 3,
      lastEventSeq: 2,
      valid: true,
      store: {
        ref: EVENT_REF,
      },
    });
    expect(summary.bootstrapFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect((summary.store as Record<string, unknown>).tip).toMatch(/^[0-9a-f]{40}$/);
    expect((summary.store as Record<string, unknown>).bootstrapCommit).toMatch(
      /^[0-9a-f]{40}$/
    );

    const changedBootstrap = bootstrapInput({
      foundationState: "verification",
      activeFoundation: true,
    });
    const changedFoundation = changedBootstrap.tasks[0];
    if (!changedFoundation)
      throw new Error("Bootstrap fixture must contain foundation-f0");
    changedFoundation.charter.acceptance[0] = "changed nested acceptance";
    const mismatchPath = join(dirname(root), "bootstrap-mismatch.json");
    await writeSecureJson(mismatchPath, changedBootstrap);
    const mismatch = runCli([
      "validate",
      "--root",
      root,
      "--expect-bootstrap-file",
      mismatchPath,
    ]);
    expect(mismatch.status).not.toBe(0);
    expect(mismatch.stderr).toMatch(/bootstrap fingerprint mismatch/i);
  });

  it("ignores poisoned inherited Git and config environments for metacharacter paths", async () => {
    const root = await makeRoot("runtime with spaces;$(exit 17)");
    const parent = dirname(root);
    const bootstrap = bootstrapInput({
      foundationState: "verification",
      activeFoundation: true,
    });
    const poisonHome = join(parent, "poison home");
    const poisonXdg = join(parent, "poison xdg");
    const poisonConfig = join(parent, "poison.gitconfig");
    await mkdir(join(poisonXdg, "git"), { recursive: true });
    await mkdir(poisonHome, { recursive: true });
    await writeFile(poisonConfig, "this is not valid git config\n");
    await writeFile(join(poisonHome, ".gitconfig"), "this is not valid git config\n");
    await writeFile(join(poisonXdg, "git", "config"), "this is not valid git config\n");
    const bootstrapPath = join(parent, "bootstrap with spaces.json");
    await writeSecureJson(bootstrapPath, bootstrap);
    const poison: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: poisonHome,
      XDG_CONFIG_HOME: poisonXdg,
      GIT_CONFIG_NOSYSTEM: "0",
      GIT_CONFIG_SYSTEM: poisonConfig,
      GIT_CONFIG_GLOBAL: poisonConfig,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.bare",
      GIT_CONFIG_VALUE_0: "false",
      GIT_DIR: "/definitely/not/the/runtime.git",
      GIT_COMMON_DIR: "/definitely/not/common.git",
      GIT_WORK_TREE: "/definitely/not/a/worktree",
      GIT_OBJECT_DIRECTORY: "/definitely/not/objects",
      GIT_ALTERNATE_OBJECT_DIRECTORIES: "/definitely/not/alternates",
      GIT_INDEX_FILE: "/definitely/not/an-index",
      GIT_REPLACE_REF_BASE: "refs/replace-poison/",
    };
    const poisonedKeys = Object.keys(poison).filter(
      (key) =>
        key in process.env ||
        key.startsWith("GIT_") ||
        key === "HOME" ||
        key === "XDG_CONFIG_HOME"
    );
    const saved = new Map(poisonedKeys.map((key) => [key, process.env[key]]));
    for (const key of poisonedKeys) {
      const value = poison[key];
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
    try {
      await initializeRuntime(root, bootstrap);
      await appendEvent(root, evidenceInput("hermetic-environment"));
      expect((await loadRuntime(root)).snapshot.lastEventSeq).toBe(2);
      const validated = runCli(
        ["validate", "--root", root, "--expect-bootstrap-file", bootstrapPath],
        poison
      );
      expect(validated.status, validated.stderr).toBe(0);
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) Reflect.deleteProperty(process.env, key);
        else process.env[key] = value;
      }
    }
  });

  it("keeps the CLI input boundary mode-0600 and rejects caller coordinates", async () => {
    const weakRoot = await makeRoot("weak-runtime");
    const weakBootstrap = join(dirname(weakRoot), "weak-bootstrap.json");
    await writeSecureJson(
      weakBootstrap,
      bootstrapInput({ foundationState: "verification", activeFoundation: true })
    );
    await chmod(weakBootstrap, 0o644);
    const weak = runCli(["init", "--root", weakRoot, "--bootstrap-file", weakBootstrap]);
    expect(weak.status).not.toBe(0);
    expect(weak.stderr).toMatch(/mode-0600/i);

    const root = await makeRoot("coordinate-runtime");
    await initializeRuntime(
      root,
      bootstrapInput({ foundationState: "verification", activeFoundation: true })
    );
    const eventPath = join(dirname(root), "caller-event.json");
    await writeSecureJson(eventPath, {
      ...evidenceInput("caller-coordinates"),
      seq: 2,
      at: "2026-08-26T02:00:00.000Z",
    });
    const appended = runCli(["append", "--root", root, "--event-file", eventPath]);
    expect(appended.status).not.toBe(0);
    expect(appended.stderr).toMatch(/must not supply seq or at/i);
    expect((await loadRuntime(root)).snapshot.lastEventSeq).toBe(1);
  });
});
