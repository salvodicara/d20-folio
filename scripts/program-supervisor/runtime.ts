import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, type Dirent } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import {
  parseEvents,
  replayEvents,
  validateEventInput,
  validateLeaseFile,
  validateSnapshot,
  type LeaseFile,
  type ProgramSnapshot,
} from "./state.ts";

const PROGRAM_ID = "d20-folio" as const;
const GIT_EXECUTABLE = "/usr/bin/git";
const EVENT_REF = "refs/program-supervisor/events" as const;
const ZERO_OID = "0".repeat(40);
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const CANONICAL_VALIDATION_TIME = "2000-01-01T00:00:00.000Z";
const OID_PATTERN = /^[0-9a-f]{40}$/;
const LOOSE_DIRECTORY_PATTERN = /^[0-9a-f]{2}$/;
const LOOSE_OBJECT_PATTERN = /^[0-9a-f]{38}$/;
const COMMIT_IDENTITY = "d20 Folio Program Supervisor <program-supervisor@localhost>";
const STORE_CONFIG = Buffer.from(
  [
    "[core]",
    "\trepositoryformatversion = 0",
    "\tfilemode = true",
    "\tbare = true",
    "\tlogallrefupdates = false",
    "\tfsync = all",
    "\tfsyncMethod = fsync",
    "",
  ].join("\n"),
  "utf8"
);
const STORE_HEAD = Buffer.from(`ref: ${EVENT_REF}\n`, "utf8");
const GIT_BASE_ENV: NodeJS.ProcessEnv = Object.freeze({
  LANG: "C",
  LC_ALL: "C",
  TZ: "UTC",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOREPLACEOBJECTS: "1",
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_TERMINAL_PROMPT: "0",
});

type ProgramEvent = ReturnType<typeof parseEvents>[number];

export interface RuntimeSnapshot extends ProgramSnapshot {
  programId: typeof PROGRAM_ID;
  bootstrapFingerprint: string;
}

export interface RuntimeStore {
  ref: typeof EVENT_REF;
  tip: string;
  bootstrapCommit: string;
  objectFormat: "sha1";
}

export interface RuntimeProjection {
  snapshot: RuntimeSnapshot;
  leases: LeaseFile;
  store: RuntimeStore;
}

export interface RuntimeOptions {
  now?: () => Date;
  /** Test-only coordination point immediately before the compare-and-swap. */
  beforePublish?: (candidate: string, previous: string) => void | Promise<void>;
  /** Test-only lost-result injection point after a successful compare-and-swap. */
  afterPublish?: (candidate: string, previous: string) => void | Promise<void>;
}

interface CanonicalBootstrap {
  body: Record<string, unknown>;
  bytes: Buffer;
  fingerprint: string;
}

interface LoadedStore {
  projection: RuntimeProjection;
  events: ProgramEvent[];
  bootstrapBytes: Buffer;
  bootstrapOid: string;
}

interface GitResult {
  stdout: Buffer;
  stderr: Buffer;
}

class GitCommandError extends Error {
  readonly stdout: Buffer;
  readonly stderr: Buffer;

  constructor(message: string, stdout: Buffer, stderr: Buffer, cause?: unknown) {
    super(message, { cause });
    this.name = "GitCommandError";
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

let trustedGitPromise: Promise<void> | undefined;

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)])
    );
  }
  return value;
}

function canonicalJsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, "utf8");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function rejectAssignedCoordinates(value: unknown): Record<string, unknown> {
  const record = objectRecord(value, "Event input");
  if (Object.hasOwn(record, "seq") || Object.hasOwn(record, "at")) {
    throw new TypeError("Event input must not supply seq or at");
  }
  return record;
}

function nowIso(options: RuntimeOptions): string {
  const value = (options.now ?? (() => new Date()))();
  if (!Number.isFinite(value.getTime())) throw new Error("Runtime clock is invalid");
  return value.toISOString();
}

function assignEventCoordinates(
  record: Record<string, unknown>,
  seq: number,
  at: string
): Record<string, unknown> {
  const body = { ...record };
  if (body.type === "lease-acquired") {
    body.lease = {
      ...objectRecord(body.lease, "lease-acquired input.lease"),
      acquiredAt: at,
      termStartedAt: at,
    };
  }
  return { ...body, seq, at };
}

function canonicalBootstrap(value: unknown): CanonicalBootstrap {
  const record = rejectAssignedCoordinates(value);
  const validated = validateEventInput({
    ...record,
    seq: 1,
    at: CANONICAL_VALIDATION_TIME,
  });
  if (validated.type !== "bootstrap") {
    throw new TypeError("Initialization input must be a bootstrap event body");
  }
  const body = { ...validated } as Record<string, unknown>;
  delete body.seq;
  delete body.at;
  const bytes = canonicalJsonBytes(body);
  return { body, bytes, fingerprint: sha256(bytes) };
}

export function canonicalBootstrapFingerprint(value: unknown): string {
  return canonicalBootstrap(value).fingerprint;
}

function withRuntimeMetadata(
  snapshot: ProgramSnapshot,
  bootstrapFingerprint: string
): RuntimeSnapshot {
  return {
    programId: PROGRAM_ID,
    bootstrapFingerprint,
    ...snapshot,
  };
}

async function fsyncFile(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function fsyncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function physicalRoot(root: string, mustExist: boolean): Promise<string> {
  if (!isAbsolute(root) || resolve(root) !== root) {
    throw new Error(`Runtime root must be an absolute normalized path: ${root}`);
  }
  const logicalParent = dirname(root);
  const parentMetadata = await lstat(logicalParent);
  if (parentMetadata.isSymbolicLink() || !parentMetadata.isDirectory()) {
    throw new Error(
      `Runtime parent must be a regular non-symlink directory: ${logicalParent}`
    );
  }
  const projected = join(await realpath(logicalParent), basename(root));
  try {
    const rootMetadata = await lstat(root);
    if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
      throw new Error(`Runtime root must be a regular non-symlink directory: ${root}`);
    }
    const canonical = await realpath(root);
    if (canonical !== projected) {
      throw new Error(`Runtime root must be the stable physical path: ${root}`);
    }
    return canonical;
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
    if (mustExist) {
      throw new Error(`Runtime root does not exist: ${root}`, { cause: error });
    }
    return projected;
  }
}

async function assertTrustedGit(): Promise<void> {
  trustedGitPromise ??= (async () => {
    if (process.platform !== "darwin" && process.platform !== "linux") {
      throw new Error(`Trusted Git is unsupported on ${process.platform}`);
    }
    const metadata = await lstat(GIT_EXECUTABLE);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      metadata.uid !== 0 ||
      (metadata.mode & 0o111) === 0 ||
      (metadata.mode & 0o022) !== 0
    ) {
      throw new Error(
        `${GIT_EXECUTABLE} must be a root-owned regular executable that is not group/other writable`
      );
    }
    const result = await executeGit(["--version"]);
    const match = /^git version (\d+)\.(\d+)\.(\d+)/.exec(
      result.stdout.toString("utf8").trim()
    );
    const major = Number(match?.[1]);
    const minor = Number(match?.[2]);
    if (!match || major < 2 || (major === 2 && minor < 45)) {
      throw new Error(
        "Trusted Git must support files refs, SHA-1 init, and fsync controls"
      );
    }
  })();
  return trustedGitPromise;
}

function executeGit(
  args: readonly string[],
  input?: Uint8Array,
  environment: NodeJS.ProcessEnv = GIT_BASE_ENV
): Promise<GitResult> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = execFile(
      GIT_EXECUTABLE,
      [...args],
      {
        encoding: "buffer",
        env: environment,
        maxBuffer: 32 * 1024 * 1024,
        shell: false,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const result = {
          stdout,
          stderr,
        };
        if (error) {
          rejectCommand(
            new GitCommandError(
              `Trusted Git command failed: ${result.stderr.toString("utf8").trim()}`,
              result.stdout,
              result.stderr,
              error
            )
          );
          return;
        }
        resolveCommand(result);
      }
    );
    if (input !== undefined) child.stdin?.end(input);
  });
}

async function runGit(
  root: string,
  args: readonly string[],
  options: {
    input?: Uint8Array;
    mutate?: boolean;
    identity?: { at: string };
  } = {}
): Promise<Buffer> {
  await assertTrustedGit();
  const command = [
    ...(options.mutate ? ["-c", "core.fsync=all", "-c", "core.fsyncMethod=fsync"] : []),
    `--git-dir=${root}`,
    ...args,
  ];
  const environment = options.identity
    ? {
        ...GIT_BASE_ENV,
        GIT_AUTHOR_NAME: "d20 Folio Program Supervisor",
        GIT_AUTHOR_EMAIL: "program-supervisor@localhost",
        GIT_COMMITTER_NAME: "d20 Folio Program Supervisor",
        GIT_COMMITTER_EMAIL: "program-supervisor@localhost",
        GIT_AUTHOR_DATE: gitDate(options.identity.at),
        GIT_COMMITTER_DATE: gitDate(options.identity.at),
      }
    : GIT_BASE_ENV;
  return (await executeGit(command, options.input, environment)).stdout;
}

function gitDate(at: string): string {
  const milliseconds = new Date(at).getTime();
  if (!Number.isFinite(milliseconds)) throw new Error(`Invalid event timestamp: ${at}`);
  return `@${Math.floor(milliseconds / 1_000)} +0000`;
}

function textOutput(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8").trimEnd();
}

function oidOutput(bytes: Uint8Array, label: string): string {
  const oid = textOutput(bytes);
  if (!OID_PATTERN.test(oid)) throw new Error(`${label} did not return a SHA-1 OID`);
  return oid;
}

async function assertRegularFile(
  path: string,
  label: string,
  requiredMode?: number
): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular non-symlink file: ${path}`);
  }
  if (requiredMode !== undefined && (metadata.mode & 0o7777) !== requiredMode) {
    throw new Error(`${label} must use mode ${requiredMode.toString(8)}: ${path}`);
  }
}

async function assertDirectory(
  path: string,
  label: string,
  mode?: number
): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${label} must be a regular non-symlink directory: ${path}`);
  }
  if (mode !== undefined && (metadata.mode & 0o7777) !== mode) {
    throw new Error(`${label} must use mode ${mode.toString(8)}: ${path}`);
  }
}

function names(entries: readonly Dirent[]): string[] {
  return entries.map(({ name }) => name).sort();
}

function expectNames(
  actual: readonly Dirent[],
  expected: readonly string[],
  label: string
): void {
  const current = names(actual);
  const wanted = [...expected].sort();
  if (JSON.stringify(current) !== JSON.stringify(wanted)) {
    throw new Error(`${label} has unexpected shape: ${current.join(", ") || "<empty>"}`);
  }
}

async function rejectSymlinksAndLocks(path: string): Promise<void> {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(path, entry.name);
    const metadata = await lstat(child);
    if (metadata.isSymbolicLink()) {
      throw new Error(`Runtime store contains a symlink: ${child}`);
    }
    if (entry.name.endsWith(".lock")) {
      throw new Error(
        `Git-internal lock residue requires manual quiescent recovery: ${child}`
      );
    }
    if (metadata.isDirectory()) await rejectSymlinksAndLocks(child);
  }
}

async function assertEmptyDirectory(path: string, label: string): Promise<void> {
  await assertDirectory(path, label);
  const entries = await readdir(path);
  if (entries.length !== 0) throw new Error(`${label} must be empty: ${path}`);
}

async function validateLooseObjects(root: string): Promise<void> {
  const objectsRoot = join(root, "objects");
  await assertDirectory(objectsRoot, "Git objects directory");
  const entries = await readdir(objectsRoot, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(objectsRoot, entry.name);
    if (entry.name === "info" || entry.name === "pack") {
      await assertEmptyDirectory(path, `Git objects/${entry.name} directory`);
      continue;
    }
    if (!LOOSE_DIRECTORY_PATTERN.test(entry.name) || !entry.isDirectory()) {
      throw new Error(`Git objects directory contains unexpected storage: ${path}`);
    }
    for (const object of await readdir(path, { withFileTypes: true })) {
      const objectPath = join(path, object.name);
      if (!LOOSE_OBJECT_PATTERN.test(object.name) || !object.isFile()) {
        throw new Error(
          `Git objects directory contains an invalid loose object: ${objectPath}`
        );
      }
      await assertRegularFile(objectPath, "Git loose object");
    }
  }
}

async function validateStoreShape(root: string): Promise<string> {
  await assertDirectory(root, "Runtime root", DIRECTORY_MODE);
  await rejectSymlinksAndLocks(root);
  const rootEntries = await readdir(root, { withFileTypes: true });
  expectNames(rootEntries, ["HEAD", "config", "objects", "refs"], "Runtime root");

  await assertRegularFile(join(root, "HEAD"), "Git HEAD", FILE_MODE);
  await assertRegularFile(join(root, "config"), "Git config", FILE_MODE);
  if (!(await readFile(join(root, "HEAD"))).equals(STORE_HEAD)) {
    throw new Error(`Git HEAD must point exactly to ${EVENT_REF}`);
  }
  if (!(await readFile(join(root, "config"))).equals(STORE_CONFIG)) {
    throw new Error("Git config is not the canonical private-store config");
  }

  await validateLooseObjects(root);
  const refsRoot = join(root, "refs");
  await assertDirectory(refsRoot, "Git refs directory");
  expectNames(
    await readdir(refsRoot, { withFileTypes: true }),
    ["heads", "program-supervisor", "tags"],
    "Git refs directory"
  );
  await assertEmptyDirectory(join(refsRoot, "heads"), "Git heads directory");
  await assertEmptyDirectory(join(refsRoot, "tags"), "Git tags directory");
  const programRefs = join(refsRoot, "program-supervisor");
  await assertDirectory(programRefs, "Program Supervisor refs directory");
  expectNames(
    await readdir(programRefs, { withFileTypes: true }),
    ["events"],
    "Program Supervisor refs directory"
  );
  const refPath = join(programRefs, "events");
  await assertRegularFile(refPath, "Program Supervisor event ref");
  const refBytes = await readFile(refPath);
  const refText = refBytes.toString("utf8");
  if (!/^[0-9a-f]{40}\n$/.test(refText)) {
    throw new Error("Program Supervisor event ref must be one direct SHA-1 OID");
  }
  return refText.trim();
}

async function validateGitView(root: string, directTip: string): Promise<void> {
  const objectFormat = textOutput(
    await runGit(root, ["rev-parse", "--show-object-format"])
  );
  const refFormat = textOutput(await runGit(root, ["rev-parse", "--show-ref-format"]));
  if (objectFormat !== "sha1" || refFormat !== "files") {
    throw new Error(`Runtime store must use SHA-1 objects and files refs`);
  }
  const refs = textOutput(
    await runGit(root, ["for-each-ref", "--format=%(refname) %(objectname)"])
  );
  if (refs !== `${EVENT_REF} ${directTip}`) {
    throw new Error(`Runtime store contains an unexpected ref: ${refs || "<none>"}`);
  }
  await runGit(root, ["fsck", "--strict", "--no-reflogs", "--no-dangling", directTip]);
}

function parseCanonicalEvent(bytes: Buffer, label: string): ProgramEvent {
  if (bytes.length === 0 || bytes.at(-1) !== 0x0a) {
    throw new Error(`${label} must be newline terminated`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} must be valid JSON`, { cause: error });
  }
  if (!canonicalJsonBytes(raw).equals(bytes)) {
    throw new Error(`${label} must use canonical JSON bytes`);
  }
  return validateEventInput(raw);
}

function parseCommit(
  bytes: Buffer,
  expectedTree: string,
  expectedParents: readonly string[],
  event: ProgramEvent
): void {
  const separator = bytes.indexOf("\n\n");
  if (separator < 0) throw new Error("Git commit envelope is missing its message");
  const headers = bytes.subarray(0, separator).toString("utf8").split("\n");
  const message = bytes.subarray(separator + 2).toString("utf8");
  const tree = headers.filter((header) => header.startsWith("tree "));
  const parents = headers.filter((header) => header.startsWith("parent "));
  const author = headers.filter((header) => header.startsWith("author "));
  const committer = headers.filter((header) => header.startsWith("committer "));
  const seconds = Math.floor(new Date(event.at).getTime() / 1_000);
  if (
    tree.length !== 1 ||
    tree[0] !== `tree ${expectedTree}` ||
    parents.length !== expectedParents.length ||
    parents.some((parent, index) => parent !== `parent ${expectedParents[index]}`) ||
    author.length !== 1 ||
    author[0] !== `author ${COMMIT_IDENTITY} ${seconds} +0000` ||
    committer.length !== 1 ||
    committer[0] !== `committer ${COMMIT_IDENTITY} ${seconds} +0000` ||
    headers.length !== 3 + expectedParents.length ||
    message !== `d20-folio program event ${event.seq}\n`
  ) {
    throw new Error(`Git commit envelope for event ${event.seq} is not canonical`);
  }
}

function parseTree(bytes: Buffer): Array<{ oid: string; name: string }> {
  const entries = bytes.length === 0 ? [] : bytes.toString("utf8").split("\0");
  if (entries.at(-1) === "") entries.pop();
  return entries.map((entry) => {
    const match = /^100644 blob ([0-9a-f]{40})\t([^\0]+)$/.exec(entry);
    if (!match) throw new Error("Event commit tree contains a non-canonical entry");
    return { oid: match[1] as string, name: match[2] as string };
  });
}

async function loadStore(rootValue: string): Promise<LoadedStore> {
  const root = await physicalRoot(rootValue, true);
  await assertTrustedGit();
  const tip = await validateStoreShape(root);
  await validateGitView(root, tip);
  const commitsText = textOutput(
    await runGit(root, ["rev-list", "--first-parent", "--reverse", tip])
  );
  const commits = commitsText === "" ? [] : commitsText.split("\n");
  if (commits.length === 0 || commits.at(-1) !== tip) {
    throw new Error("Program Supervisor event ref has no strict commit chain");
  }

  const events: ProgramEvent[] = [];
  let immutableBootstrap: Buffer | undefined;
  let immutableBootstrapOid: string | undefined;
  for (const [index, commit] of commits.entries()) {
    if (!OID_PATTERN.test(commit)) throw new Error("Event chain contains an invalid OID");
    const type = textOutput(await runGit(root, ["cat-file", "-t", commit]));
    if (type !== "commit")
      throw new Error(`Event chain object is not a commit: ${commit}`);
    const treeOid = oidOutput(
      await runGit(root, ["show", "-s", "--format=%T", commit]),
      "Commit tree"
    );
    const treeEntries = parseTree(await runGit(root, ["ls-tree", "-z", commit]));
    if (
      treeEntries.length !== 2 ||
      treeEntries[0]?.name !== "bootstrap.json" ||
      treeEntries[1]?.name !== "event.json"
    ) {
      throw new Error(
        `Event commit ${commit} must contain exactly bootstrap.json and event.json`
      );
    }
    const bootstrapEntry = treeEntries[0];
    const eventEntry = treeEntries[1];
    for (const entry of treeEntries) {
      const entryType = textOutput(await runGit(root, ["cat-file", "-t", entry.oid]));
      if (entryType !== "blob") throw new Error(`${entry.name} must resolve to a blob`);
    }
    const bootstrapBytes = await runGit(root, ["cat-file", "blob", bootstrapEntry.oid]);
    const eventBytes = await runGit(root, ["cat-file", "blob", eventEntry.oid]);
    if (index === 0) {
      immutableBootstrap = bootstrapBytes;
      immutableBootstrapOid = bootstrapEntry.oid;
    } else {
      if (
        immutableBootstrap === undefined ||
        bootstrapEntry.oid !== immutableBootstrapOid ||
        !bootstrapBytes.equals(immutableBootstrap)
      ) {
        throw new Error("Immutable bootstrap blob changed within the event chain");
      }
    }
    const event = parseCanonicalEvent(eventBytes, `event ${index + 1}`);
    if (event.seq !== index + 1) {
      throw new Error(`Event sequence is not contiguous at commit ${commit}`);
    }
    parseCommit(
      await runGit(root, ["cat-file", "commit", commit]),
      treeOid,
      index === 0 ? [] : [commits[index - 1] as string],
      event
    );
    events.push(event);
  }

  const first = events[0];
  if (
    !first ||
    first.type !== "bootstrap" ||
    !immutableBootstrap ||
    !immutableBootstrapOid
  ) {
    throw new Error("Event chain must begin with one bootstrap event");
  }
  const bootstrapBody = { ...first } as Record<string, unknown>;
  delete bootstrapBody.seq;
  delete bootstrapBody.at;
  const canonical = canonicalBootstrap(bootstrapBody);
  if (!canonical.bytes.equals(immutableBootstrap)) {
    throw new Error("Bootstrap event does not match its immutable bootstrap blob");
  }

  // Retain the compatibility parser as an in-memory canonical-record check only.
  const reparsed = parseEvents(
    Buffer.concat(events.map((event) => canonicalJsonBytes(event))).toString("utf8")
  );
  const reconstructed = replayEvents(reparsed);
  validateSnapshot(reconstructed.snapshot);
  validateLeaseFile(reconstructed.leases);
  const projection: RuntimeProjection = {
    snapshot: withRuntimeMetadata(reconstructed.snapshot, canonical.fingerprint),
    leases: reconstructed.leases,
    store: {
      ref: EVENT_REF,
      tip,
      bootstrapCommit: commits[0] as string,
      objectFormat: "sha1",
    },
  };
  return {
    projection,
    events: reparsed,
    bootstrapBytes: immutableBootstrap,
    bootstrapOid: immutableBootstrapOid,
  };
}

async function hashBlob(root: string, bytes: Uint8Array): Promise<string> {
  return oidOutput(
    await runGit(root, ["hash-object", "-w", "--stdin"], {
      input: bytes,
      mutate: true,
    }),
    "git hash-object"
  );
}

async function createEventTree(
  root: string,
  bootstrapOid: string,
  eventOid: string
): Promise<string> {
  const treeInput = Buffer.from(
    `100644 blob ${bootstrapOid}\tbootstrap.json\n100644 blob ${eventOid}\tevent.json\n`,
    "utf8"
  );
  return oidOutput(
    await runGit(root, ["mktree"], { input: treeInput, mutate: true }),
    "git mktree"
  );
}

async function createEventCommit(
  root: string,
  treeOid: string,
  parent: string | null,
  event: ProgramEvent
): Promise<string> {
  const args = ["commit-tree", treeOid, ...(parent ? ["-p", parent] : [])];
  return oidOutput(
    await runGit(root, args, {
      input: Buffer.from(`d20-folio program event ${event.seq}\n`, "utf8"),
      mutate: true,
      identity: { at: event.at },
    }),
    "git commit-tree"
  );
}

async function publish(root: string, candidate: string, previous: string): Promise<void> {
  await runGit(root, ["update-ref", "--no-deref", EVENT_REF, candidate, previous], {
    mutate: true,
  });
}

async function directTip(rootValue: string): Promise<string> {
  const root = await physicalRoot(rootValue, true);
  const path = join(root, "refs", "program-supervisor", "events");
  await assertRegularFile(path, "Program Supervisor event ref");
  const value = (await readFile(path, "utf8")).trim();
  if (!OID_PATTERN.test(value))
    throw new Error("Program Supervisor event ref is invalid");
  return value;
}

async function candidateIsAncestor(
  root: string,
  candidate: string,
  current: string
): Promise<boolean> {
  if (candidate === current) return true;
  try {
    await runGit(root, ["merge-base", "--is-ancestor", candidate, current]);
    return true;
  } catch {
    return false;
  }
}

export async function readSecureJsonFile(path: string): Promise<unknown> {
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new Error(`Input file must be an absolute normalized path: ${path}`);
  }
  const metadata = await lstat(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    (metadata.mode & 0o7777) !== FILE_MODE
  ) {
    throw new Error(`Input file must be a regular non-symlink mode-0600 file: ${path}`);
  }
  const canonicalParent = await realpath(dirname(path));
  const canonical = await realpath(path);
  if (canonical !== join(canonicalParent, basename(path))) {
    throw new Error(`Input file must use its stable physical path: ${path}`);
  }
  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== metadata.dev || opened.ino !== metadata.ino) {
      throw new Error(`Input file identity changed while opening: ${path}`);
    }
    const bytes = await handle.readFile();
    let value: unknown;
    try {
      value = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      throw new Error(`Input file must contain one complete JSON value: ${path}`, {
        cause: error,
      });
    }
    return value;
  } finally {
    await handle.close();
  }
}

export async function initializeRuntime(
  rootValue: string,
  bootstrapValue: unknown,
  options: RuntimeOptions = {}
): Promise<RuntimeProjection> {
  const canonical = canonicalBootstrap(bootstrapValue);
  const root = await physicalRoot(rootValue, false);
  await assertTrustedGit();
  try {
    await mkdir(root, { mode: DIRECTORY_MODE });
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      throw new Error(
        `Runtime root already exists and will not be adopted: ${rootValue}`,
        { cause: error }
      );
    }
    throw error;
  }
  await chmod(root, DIRECTORY_MODE);
  await fsyncDirectory(dirname(root));

  // Any failure after the no-replace claim intentionally leaves an incomplete root.
  await executeGit([
    "-c",
    "core.fsync=all",
    "-c",
    "core.fsyncMethod=fsync",
    "init",
    "--bare",
    "--template=",
    "--object-format=sha1",
    "--ref-format=files",
    root,
  ]);
  await writeFile(join(root, "config"), STORE_CONFIG, { mode: FILE_MODE });
  await chmod(join(root, "config"), FILE_MODE);
  await writeFile(join(root, "HEAD"), STORE_HEAD, { mode: FILE_MODE });
  await chmod(join(root, "HEAD"), FILE_MODE);
  await fsyncFile(join(root, "config"));
  await fsyncFile(join(root, "HEAD"));
  await fsyncDirectory(root);

  const event = validateEventInput(
    assignEventCoordinates(canonical.body, 1, nowIso(options))
  );
  if (event.type !== "bootstrap") {
    throw new Error("Initialization event must be bootstrap");
  }
  replayEvents([event]);
  const bootstrapOid = await hashBlob(root, canonical.bytes);
  const eventOid = await hashBlob(root, canonicalJsonBytes(event));
  const treeOid = await createEventTree(root, bootstrapOid, eventOid);
  const commitOid = await createEventCommit(root, treeOid, null, event);
  await publish(root, commitOid, ZERO_OID);
  return (await loadStore(root)).projection;
}

export async function loadRuntime(root: string): Promise<RuntimeProjection> {
  return (await loadStore(root)).projection;
}

export async function appendEvent(
  rootValue: string,
  eventValue: unknown,
  options: RuntimeOptions = {}
): Promise<RuntimeProjection> {
  const body = rejectAssignedCoordinates(eventValue);
  const root = await physicalRoot(rootValue, true);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const loaded = await loadStore(root);
    const previous = loaded.projection.store.tip;
    const event = validateEventInput(
      assignEventCoordinates(body, loaded.events.length + 1, nowIso(options))
    );
    replayEvents([...loaded.events, event]);
    const eventOid = await hashBlob(root, canonicalJsonBytes(event));
    const treeOid = await createEventTree(root, loaded.bootstrapOid, eventOid);
    const candidate = await createEventCommit(root, treeOid, previous, event);
    await options.beforePublish?.(candidate, previous);

    try {
      await publish(root, candidate, previous);
      await options.afterPublish?.(candidate, previous);
      return (await loadStore(root)).projection;
    } catch (error) {
      const current = await directTip(root);
      if (await candidateIsAncestor(root, candidate, current)) {
        return (await loadStore(root)).projection;
      }
      if (current === previous) {
        throw new Error(
          `Event publication failed with an unchanged tip; preserve any Git lock for manual recovery`,
          { cause: error }
        );
      }
      // A cooperating writer won the CAS. Only this demonstrated tip advance permits retry.
      if (!(await candidateIsAncestor(root, previous, current))) {
        throw new Error(
          `Event publication observed an unrelated tip and cannot reconcile safely`,
          { cause: error }
        );
      }
      await loadStore(root);
    }
  }
  throw new Error("Event publication exceeded the bounded CAS retry limit");
}

export async function rebuildRuntime(root: string): Promise<RuntimeProjection> {
  return loadRuntime(root);
}
