import { constants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
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
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const LOCK_STALE_MS = 30 * 60 * 1_000;
const DEFAULT_LOCK_TIMEOUT_MS = 2_000;
const LOCK_RETRY_MS = 10;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CANONICAL_VALIDATION_TIME = "2000-01-01T00:00:00.000Z";
const RUNTIME_DIRECTORIES = [
  "state",
  "ledger",
  "handoffs",
  "evidence",
  "recovery",
] as const;

type ProgramEvent = ReturnType<typeof parseEvents>[number];

export interface RuntimeSnapshot extends ProgramSnapshot {
  programId: typeof PROGRAM_ID;
  bootstrapFingerprint: string;
}

export interface RecoveryState {
  recoverableTornTail: boolean;
  abandonedStaging: string[];
  abandonedLockOwners: string[];
  abandonedTemps: string[];
  staleLocks: string[];
  tornLedgers: string[];
}

export interface RuntimeProjection {
  snapshot: RuntimeSnapshot;
  leases: LeaseFile;
  recoveryState: RecoveryState;
}

export interface RuntimeOptions {
  now?: () => Date;
  lockTimeoutMs?: number;
  beforeInitializeRename?: (stagingRoot: string) => void | Promise<void>;
  afterLockOwnerDurable?: (ownerPath: string) => void | Promise<void>;
  afterLockPublish?: (lockPath: string) => void | Promise<void>;
  afterLockAcquired?: (lockPath: string) => void | Promise<void>;
  beforeLedgerAppend?: (ledgerPath: string) => void | Promise<void>;
  beforeAtomicReplaceRename?: (temporaryPath: string) => void | Promise<void>;
  probePid?: (pid: number) => void;
}

interface CanonicalBootstrap {
  body: Record<string, unknown>;
  bytes: Buffer;
  fingerprint: string;
}

interface LedgerAnalysis {
  bytes: Buffer;
  events: ProgramEvent[];
  validPrefix: Buffer;
  tornTail: Buffer | null;
}

interface SecureFile {
  bytes: Buffer;
  device: number;
  inode: number;
}

interface OpenLedger {
  handle: FileHandle;
  path: string;
  device: number;
  inode: number;
  analysis: LedgerAnalysis;
}

interface LockOwnership {
  path: string;
  device: number;
  inode: number;
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nowIso(options: RuntimeOptions): string {
  const value = (options.now ?? (() => new Date()))();
  if (!Number.isFinite(value.getTime())) throw new Error("Runtime clock is invalid");
  return value.toISOString();
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

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
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
  const bytes = Buffer.from(`${canonicalJson(body)}\n`, "utf8");
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

async function fsyncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function assertDirectory(path: string, label: string): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${label} must be a regular non-symlink directory: ${path}`);
  }
  if ((metadata.mode & 0o7777) !== DIRECTORY_MODE) {
    throw new Error(`${label} must use mode 0700: ${path}`);
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
  const canonicalParent = await realpath(logicalParent);
  const projected = join(canonicalParent, basename(root));
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

async function ensureRuntimeLayout(root: string): Promise<void> {
  await assertDirectory(root, "Runtime root");
  for (const directory of RUNTIME_DIRECTORIES) {
    await assertDirectory(join(root, directory), `Runtime ${directory} directory`);
  }
}

async function readSecureFile(path: string, label: string): Promise<SecureFile> {
  const before = await lstat(path);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`${label} must be a regular non-symlink file: ${path}`);
  }
  if ((before.mode & 0o7777) !== FILE_MODE) {
    throw new Error(`${label} must use mode 0600: ${path}`);
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      (opened.mode & 0o7777) !== FILE_MODE ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino
    ) {
      throw new Error(`${label} changed while it was being opened: ${path}`);
    }
    return {
      bytes: await handle.readFile(),
      device: opened.dev,
      inode: opened.ino,
    };
  } finally {
    await handle.close();
  }
}

export async function readSecureJsonFile(path: string): Promise<unknown> {
  const absolute = resolve(path);
  const { bytes } = await readSecureFile(absolute, "JSON input");
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new TypeError(
      `JSON input is invalid at ${absolute}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

async function writeFreshFile(path: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    FILE_MODE
  );
  try {
    await handle.writeFile(bytes);
    await handle.chmod(FILE_MODE);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function atomicReplace(
  path: string,
  bytes: Uint8Array,
  options: RuntimeOptions = {}
): Promise<void> {
  const directory = dirname(path);
  const temporary = join(
    directory,
    `.${basename(path)}.${process.pid}-${randomUUID()}.tmp`
  );
  const handle = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    FILE_MODE
  );
  const opened = await handle.stat();
  const ownership: LockOwnership = {
    path: temporary,
    device: opened.dev,
    inode: opened.ino,
  };
  try {
    await handle.writeFile(bytes);
    await handle.chmod(FILE_MODE);
    await handle.sync();
    await handle.close();
    await options.beforeAtomicReplaceRename?.(temporary);
    await rename(temporary, path);
    await fsyncDirectory(directory);
  } catch (error) {
    await handle.close().catch(() => undefined);
    if (await unlinkIfOwned(temporary, ownership)) {
      await fsyncDirectory(directory);
    }
    throw error;
  }
}

function cacheBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeCaches(
  root: string,
  snapshot: RuntimeSnapshot,
  leases: LeaseFile,
  options: RuntimeOptions = {}
): Promise<void> {
  await atomicReplace(join(root, "state", "program.json"), cacheBytes(snapshot), options);
  await atomicReplace(join(root, "state", "leases.json"), cacheBytes(leases), options);
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new TypeError(
      `${label} contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

function validateRuntimeSnapshot(value: unknown): RuntimeSnapshot {
  const record = objectRecord(value, "state/program.json");
  if (record.programId !== PROGRAM_ID) {
    throw new TypeError(`state/program.json programId must be ${PROGRAM_ID}`);
  }
  if (
    typeof record.bootstrapFingerprint !== "string" ||
    !SHA256_PATTERN.test(record.bootstrapFingerprint)
  ) {
    throw new TypeError("state/program.json bootstrapFingerprint must be SHA-256");
  }
  const stateValue = { ...record };
  delete stateValue.programId;
  delete stateValue.bootstrapFingerprint;
  return withRuntimeMetadata(validateSnapshot(stateValue), record.bootstrapFingerprint);
}

function analyzeLedgerBytes(bytes: Buffer): LedgerAnalysis {
  const finalNewline = bytes.lastIndexOf(0x0a);
  if (finalNewline < 0) {
    throw new Error(
      "Authoritative ledger has no newline-terminated bootstrap; recovery is unsafe"
    );
  }
  const validPrefix = bytes.subarray(0, finalNewline + 1);
  const tail = bytes.subarray(finalNewline + 1);
  const events = parseEvents(validPrefix.toString("utf8"));
  return {
    bytes,
    events,
    validPrefix,
    tornTail: tail.length === 0 ? null : tail,
  };
}

async function analyzeLedger(root: string): Promise<LedgerAnalysis> {
  const ledgerPath = join(root, "ledger", "events.ndjson");
  const { bytes } = await readSecureFile(ledgerPath, "Authoritative ledger");
  return analyzeLedgerBytes(bytes);
}

async function openLedgerForAppend(root: string): Promise<OpenLedger> {
  const path = join(root, "ledger", "events.ndjson");
  const before = await lstat(path);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`Authoritative ledger must be a regular non-symlink file: ${path}`);
  }
  if ((before.mode & 0o7777) !== FILE_MODE) {
    throw new Error(`Authoritative ledger must use mode 0600: ${path}`);
  }
  const handle = await open(
    path,
    constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW
  );
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      (opened.mode & 0o7777) !== FILE_MODE ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino
    ) {
      throw new Error(`Authoritative ledger changed while it was being opened: ${path}`);
    }
    const bytes = await handle.readFile();
    return {
      handle,
      path,
      device: opened.dev,
      inode: opened.ino,
      analysis: analyzeLedgerBytes(bytes),
    };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

function bootstrapFromLedger(first: ProgramEvent): CanonicalBootstrap {
  if (first.type !== "bootstrap") {
    throw new Error("Authoritative ledger event 1 is not bootstrap");
  }
  const body = { ...first } as Record<string, unknown>;
  delete body.seq;
  delete body.at;
  return canonicalBootstrap(body);
}

function pidIsAlive(pid: number, options: RuntimeOptions): boolean {
  try {
    if (options.probePid) options.probePid(pid);
    else process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = errorCode(error);
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    throw new Error(
      `Cannot prove whether runtime lock PID ${pid} is absent (${code ?? "unknown error"})`,
      { cause: error }
    );
  }
}

async function listAbandonedStaging(
  root: string,
  options: RuntimeOptions
): Promise<string[]> {
  const prefix = `.${basename(root)}.staging-`;
  const entries = await readdir(dirname(root), { withFileTypes: true });
  const abandoned: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    const match = /^(\d+)-/.exec(entry.name.slice(prefix.length));
    if (!match) continue;
    const pid = Number(match[1]);
    if (Number.isSafeInteger(pid) && pid > 0 && !pidIsAlive(pid, options)) {
      abandoned.push(entry.name);
    }
  }
  return abandoned.sort();
}

async function listAbandonedLockOwners(
  root: string,
  options: RuntimeOptions
): Promise<string[]> {
  const prefix = ".write-lock.owner-";
  const entries = await readdir(root, { withFileTypes: true });
  const abandoned: string[] = [];
  for (const entry of entries) {
    if (!entry.name.startsWith(prefix)) continue;
    const match =
      /^\.write-lock\.owner-(\d+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.exec(
        entry.name
      );
    if (!match) {
      throw new Error(
        `Runtime write-lock owner has an invalid filename identity: ${entry.name}`
      );
    }
    if (!entry.isFile()) {
      throw new Error(
        `Runtime write-lock owner candidate must be a regular file: ${entry.name}`
      );
    }
    const filenamePid = Number(match[1]);
    if (!Number.isSafeInteger(filenamePid) || filenamePid <= 0) {
      throw new Error(
        `Runtime write-lock owner filename has an invalid PID: ${entry.name}`
      );
    }
    const owner = await readSecureFile(
      join(root, entry.name),
      "Runtime write-lock owner candidate"
    );
    const record = validateLock(
      parseJson(owner.bytes, "Runtime write-lock owner candidate")
    );
    if (record.pid !== filenamePid) {
      throw new Error(
        `Runtime write-lock owner filename PID does not match its record: ${entry.name}`
      );
    }
    if (!pidIsAlive(record.pid, options)) abandoned.push(entry.name);
  }
  return abandoned.sort();
}

async function validateAtomicTemp(
  path: string,
  target: "program.json" | "leases.json" | "events.ndjson"
): Promise<void> {
  const candidate = await readSecureFile(path, "Atomic-replace temp candidate");
  if (target === "program.json") {
    validateRuntimeSnapshot(parseJson(candidate.bytes, "Atomic-replace program temp"));
    return;
  }
  if (target === "leases.json") {
    validateLeaseFile(parseJson(candidate.bytes, "Atomic-replace leases temp"));
    return;
  }
  const analysis = analyzeLedgerBytes(candidate.bytes);
  if (analysis.tornTail) {
    throw new Error("Atomic-replace ledger temp has a torn tail");
  }
  replayEvents(analysis.events);
}

async function listAbandonedTemps(
  root: string,
  options: RuntimeOptions
): Promise<string[]> {
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const pattern = new RegExp(`^\\.(.+)\\.(\\d+)-(${uuid})\\.tmp$`);
  const directories = [
    { name: "state", targets: new Set(["program.json", "leases.json"]) },
    { name: "ledger", targets: new Set(["events.ndjson"]) },
  ] as const;
  const abandoned: string[] = [];
  for (const directory of directories) {
    const entries = await readdir(join(root, directory.name), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.name.endsWith(".tmp")) continue;
      const match = pattern.exec(entry.name);
      if (!match) {
        throw new Error(
          `Atomic-replace temp has an invalid owner identity: ${entry.name}`
        );
      }
      const target = match[1];
      const pid = Number(match[2]);
      if (!target || !directory.targets.has(target)) {
        throw new Error(
          `Atomic-replace temp target is mismatched for ${directory.name}: ${entry.name}`
        );
      }
      if (!entry.isFile()) {
        throw new Error(`Atomic-replace temp must be a regular file: ${entry.name}`);
      }
      if (!Number.isSafeInteger(pid) || pid <= 0) {
        throw new Error(`Atomic-replace temp has an invalid owner PID: ${entry.name}`);
      }
      const path = join(root, directory.name, entry.name);
      await validateAtomicTemp(
        path,
        target as "program.json" | "leases.json" | "events.ndjson"
      );
      if (!pidIsAlive(pid, options)) {
        abandoned.push(`${directory.name}/${entry.name}`);
      }
    }
  }
  return abandoned.sort();
}

async function recoveryState(
  root: string,
  options: RuntimeOptions = {}
): Promise<RecoveryState> {
  const entries = await readdir(join(root, "recovery"), { withFileTypes: true });
  return {
    recoverableTornTail: false,
    abandonedStaging: await listAbandonedStaging(root, options),
    abandonedLockOwners: await listAbandonedLockOwners(root, options),
    abandonedTemps: await listAbandonedTemps(root, options),
    staleLocks: entries
      .filter(
        (entry) =>
          entry.isFile() && /^write-lock-stale-[0-9a-f]{64}\.json$/.test(entry.name)
      )
      .map(({ name }) => name)
      .sort(),
    tornLedgers: entries
      .filter(
        (entry) => entry.isFile() && /^events-torn-[0-9a-f]{64}\.ndjson$/.test(entry.name)
      )
      .map(({ name }) => name)
      .sort(),
  };
}

async function loadFromAnalysis(
  root: string,
  analysis: LedgerAnalysis,
  options: RuntimeOptions = {}
): Promise<RuntimeProjection> {
  if (analysis.tornTail) {
    throw new Error(
      `Authoritative ledger has a recoverable torn tail (${analysis.tornTail.length} bytes); run rebuild`
    );
  }
  const projected = replayEvents(analysis.events);
  const first = analysis.events[0];
  if (!first) throw new Error("Authoritative ledger is empty");
  const canonical = bootstrapFromLedger(first);
  const evidencePath = join(
    root,
    "evidence",
    `bootstrap-input-${canonical.fingerprint}.json`
  );
  const evidence = await readSecureFile(evidencePath, "Bootstrap identity evidence");
  if (!evidence.bytes.equals(canonical.bytes)) {
    throw new Error(
      "Bootstrap identity evidence does not match the authoritative ledger"
    );
  }
  const expectedSnapshot = withRuntimeMetadata(projected.snapshot, canonical.fingerprint);
  const programFile = await readSecureFile(
    join(root, "state", "program.json"),
    "state/program.json"
  );
  const leaseFile = await readSecureFile(
    join(root, "state", "leases.json"),
    "state/leases.json"
  );
  const cachedSnapshot = validateRuntimeSnapshot(
    parseJson(programFile.bytes, "state/program.json")
  );
  const cachedLeases = validateLeaseFile(parseJson(leaseFile.bytes, "state/leases.json"));
  if (canonicalJson(cachedSnapshot) !== canonicalJson(expectedSnapshot)) {
    throw new Error("state/program.json cache drift from the authoritative ledger");
  }
  if (canonicalJson(cachedLeases) !== canonicalJson(projected.leases)) {
    throw new Error("state/leases.json cache drift from the authoritative ledger");
  }
  return {
    snapshot: expectedSnapshot,
    leases: projected.leases,
    recoveryState: await recoveryState(root, options),
  };
}

async function loadUnlocked(
  root: string,
  options: RuntimeOptions = {}
): Promise<RuntimeProjection> {
  return loadFromAnalysis(root, await analyzeLedger(root), options);
}

interface LockRecord {
  schemaVersion: 1;
  pid: number;
  acquiredAt: string;
}

function validateLock(value: unknown): LockRecord {
  const record = objectRecord(value, "Runtime write lock");
  const keys = Object.keys(record).sort();
  if (keys.join(",") !== "acquiredAt,pid,schemaVersion") {
    throw new TypeError("Runtime write lock has unexpected or missing fields");
  }
  if (record.schemaVersion !== 1) {
    throw new TypeError("Runtime write lock schemaVersion must be 1");
  }
  if (!Number.isSafeInteger(record.pid) || (record.pid as number) <= 0) {
    throw new TypeError("Runtime write lock PID must be a positive integer");
  }
  if (
    typeof record.acquiredAt !== "string" ||
    new Date(record.acquiredAt).toISOString() !== record.acquiredAt
  ) {
    throw new TypeError("Runtime write lock acquiredAt must be an ISO timestamp");
  }
  return {
    schemaVersion: 1,
    pid: record.pid as number,
    acquiredAt: record.acquiredAt,
  };
}

async function preserveExactLink(
  source: string,
  evidencePath: string,
  expected: SecureFile,
  label: string
): Promise<void> {
  try {
    await link(source, evidencePath);
  } catch (error) {
    if (errorCode(error) !== "EEXIST") throw error;
    const existing = await readSecureFile(evidencePath, label);
    if (
      !existing.bytes.equals(expected.bytes) ||
      existing.device !== expected.device ||
      existing.inode !== expected.inode
    ) {
      throw new Error(`Conflicting recovery evidence at ${evidencePath}`, {
        cause: error,
      });
    }
    return;
  }
  const linked = await stat(evidencePath);
  if (linked.dev !== expected.device || linked.ino !== expected.inode) {
    throw new Error(`${label} was not hard-linked to the exact original bytes`);
  }
}

async function inspectOrRecoverLock(
  root: string,
  options: RuntimeOptions
): Promise<string> {
  const lockPath = join(root, ".write-lock");
  const locked = await readSecureFile(lockPath, "Runtime write lock");
  const record = validateLock(parseJson(locked.bytes, "Runtime write lock"));
  if (pidIsAlive(record.pid, options)) {
    return `Runtime is locked by live PID ${record.pid} since ${record.acquiredAt}`;
  }
  const age = Date.parse(nowIso(options)) - Date.parse(record.acquiredAt);
  if (age <= LOCK_STALE_MS) {
    return `Runtime lock owner PID ${record.pid} is absent but the lock is younger than 30 minutes`;
  }
  const hash = sha256(locked.bytes);
  const evidencePath = join(root, "recovery", `write-lock-stale-${hash}.json`);
  await preserveExactLink(lockPath, evidencePath, locked, "Stale lock evidence");
  await fsyncDirectory(join(root, "recovery"));
  const current = await lstat(lockPath).catch((error: unknown) => {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  });
  if (current && current.dev === locked.device && current.ino === locked.inode) {
    await unlink(lockPath);
    await fsyncDirectory(root);
  }
  return "recovered";
}

async function unlinkIfOwned(path: string, expected: LockOwnership): Promise<boolean> {
  const current = await lstat(path).catch((error: unknown) => {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  });
  if (!current || current.dev !== expected.device || current.ino !== expected.inode) {
    return false;
  }
  await unlink(path);
  return true;
}

async function writeCompleteLockOwner(path: string, bytes: Buffer): Promise<SecureFile> {
  const handle = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    FILE_MODE
  );
  let ownership: LockOwnership | null = null;
  try {
    const opened = await handle.stat();
    ownership = { path, device: opened.dev, inode: opened.ino };
    await handle.writeFile(bytes);
    await handle.chmod(FILE_MODE);
    await handle.sync();
    await handle.close();
    return { bytes, device: opened.dev, inode: opened.ino };
  } catch (error) {
    await handle.close().catch(() => undefined);
    if (ownership) await unlinkIfOwned(path, ownership);
    throw error;
  }
}

async function publishCompleteLock(
  root: string,
  options: RuntimeOptions
): Promise<LockOwnership | null> {
  const lockPath = join(root, ".write-lock");
  const ownerPath = join(root, `.write-lock.owner-${process.pid}-${randomUUID()}`);
  const lock: LockRecord = {
    schemaVersion: 1,
    pid: process.pid,
    acquiredAt: nowIso(options),
  };
  const owner = await writeCompleteLockOwner(
    ownerPath,
    Buffer.from(`${canonicalJson(lock)}\n`, "utf8")
  );
  const ownership: LockOwnership = {
    path: lockPath,
    device: owner.device,
    inode: owner.inode,
  };
  let published = false;
  try {
    await fsyncDirectory(root);
    await options.afterLockOwnerDurable?.(ownerPath);
    await link(ownerPath, lockPath);
    published = true;
    const canonical = await lstat(lockPath);
    if (canonical.dev !== ownership.device || canonical.ino !== ownership.inode) {
      throw new Error("Published runtime write lock changed before durability");
    }
    await options.afterLockPublish?.(lockPath);
    await fsyncDirectory(root);
    await unlinkIfOwned(ownerPath, ownership);
    await fsyncDirectory(root);
    return ownership;
  } catch (error) {
    if (!published && errorCode(error) === "EEXIST") {
      await unlinkIfOwned(ownerPath, ownership);
      await fsyncDirectory(root);
      return null;
    }
    if (published) await unlinkIfOwned(lockPath, ownership);
    await unlinkIfOwned(ownerPath, ownership);
    await fsyncDirectory(root).catch(() => undefined);
    throw error;
  }
}

async function acquireLock(
  root: string,
  options: RuntimeOptions
): Promise<LockOwnership> {
  const timeout = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new Error("lockTimeoutMs must be a non-negative finite number");
  }
  const started = Date.now();
  let lastReason = "Runtime write lock is busy";
  let retryRecoveredLock = false;
  while (retryRecoveredLock || Date.now() - started <= timeout) {
    retryRecoveredLock = false;
    const acquired = await publishCompleteLock(root, options);
    if (acquired) return acquired;
    try {
      const disposition = await inspectOrRecoverLock(root, options).catch(
        (inspectionError: unknown) => {
          if (errorCode(inspectionError) === "ENOENT") return "recovered";
          throw inspectionError;
        }
      );
      if (disposition === "recovered") {
        retryRecoveredLock = true;
        continue;
      }
      lastReason = disposition;
    } catch (error) {
      if (errorCode(error) === "ENOENT") continue;
      throw error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, LOCK_RETRY_MS));
  }
  throw new Error(lastReason);
}

async function withLock<T>(
  rootInput: string,
  options: RuntimeOptions,
  operation: (root: string) => Promise<T>
): Promise<T> {
  const root = await physicalRoot(rootInput, true);
  await ensureRuntimeLayout(root);
  const ownership = await acquireLock(root, options);
  const outcome = await (async () => {
    await options.afterLockAcquired?.(ownership.path);
    return operation(root);
  })().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error })
  );
  const release = await (async () => {
    try {
      if (await unlinkIfOwned(ownership.path, ownership)) {
        await fsyncDirectory(root);
      }
      return { ok: true as const };
    } catch (error) {
      return errorCode(error) === "ENOENT"
        ? { ok: true as const }
        : { ok: false as const, error };
    }
  })();
  if (!release.ok) {
    if (!outcome.ok) {
      throw new AggregateError(
        [outcome.error, release.error],
        "Runtime operation and write-lock release both failed"
      );
    }
    throw release.error;
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

export async function initializeRuntime(
  rootInput: string,
  bootstrapEvent: unknown,
  options: RuntimeOptions = {}
): Promise<RuntimeProjection> {
  const root = await physicalRoot(rootInput, false);
  try {
    await lstat(root);
    throw new Error(`Runtime root already exists: ${rootInput}`);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
  const canonical = canonicalBootstrap(bootstrapEvent);
  const event = validateEventInput({
    ...canonical.body,
    seq: 1,
    at: nowIso(options),
  });
  const projected = replayEvents([event]);
  const snapshot = withRuntimeMetadata(projected.snapshot, canonical.fingerprint);
  const parent = dirname(root);
  const stagingRoot = await mkdtemp(
    join(parent, `.${basename(root)}.staging-${process.pid}-`)
  );
  await chmod(stagingRoot, DIRECTORY_MODE);
  for (const directory of RUNTIME_DIRECTORIES) {
    await mkdir(join(stagingRoot, directory), { mode: DIRECTORY_MODE });
    await chmod(join(stagingRoot, directory), DIRECTORY_MODE);
  }
  await writeFreshFile(
    join(stagingRoot, "ledger", "events.ndjson"),
    Buffer.from(`${JSON.stringify(event)}\n`, "utf8")
  );
  await writeFreshFile(join(stagingRoot, "state", "program.json"), cacheBytes(snapshot));
  await writeFreshFile(
    join(stagingRoot, "state", "leases.json"),
    cacheBytes(projected.leases)
  );
  await writeFreshFile(
    join(stagingRoot, "evidence", `bootstrap-input-${canonical.fingerprint}.json`),
    canonical.bytes
  );
  for (const directory of RUNTIME_DIRECTORIES) {
    await fsyncDirectory(join(stagingRoot, directory));
  }
  await fsyncDirectory(stagingRoot);
  await options.beforeInitializeRename?.(stagingRoot);
  try {
    await rename(stagingRoot, root);
  } catch (error) {
    if (errorCode(error) === "EEXIST" || errorCode(error) === "ENOTEMPTY") {
      throw new Error(`Runtime root already exists: ${rootInput}`, { cause: error });
    }
    throw error;
  }
  await fsyncDirectory(parent);
  return {
    snapshot,
    leases: projected.leases,
    recoveryState: await recoveryState(root, options),
  };
}

export async function loadRuntime(
  root: string,
  options: RuntimeOptions = {}
): Promise<RuntimeProjection> {
  return withLock(root, options, (physical) => loadUnlocked(physical, options));
}

export async function appendEvent(
  root: string,
  eventInput: unknown,
  options: RuntimeOptions = {}
): Promise<RuntimeProjection> {
  return withLock(root, options, async (physical) => {
    const ledger = await openLedgerForAppend(physical);
    try {
      const existing = ledger.analysis;
      if (existing.tornTail) {
        throw new Error("Authoritative ledger has a recoverable torn tail; run rebuild");
      }
      await loadFromAnalysis(physical, existing, options);
      const record = rejectAssignedCoordinates(eventInput);
      const event = validateEventInput(
        assignEventCoordinates(record, existing.events.length + 1, nowIso(options))
      );
      if (event.type === "bootstrap") {
        throw new TypeError("Bootstrap cannot be appended after initialization");
      }
      replayEvents([...existing.events, event]);
      await options.beforeLedgerAppend?.(ledger.path);
      const current = await lstat(ledger.path);
      if (
        current.isSymbolicLink() ||
        !current.isFile() ||
        (current.mode & 0o7777) !== FILE_MODE ||
        current.dev !== ledger.device ||
        current.ino !== ledger.inode
      ) {
        throw new Error(
          "Authoritative ledger inode changed after replay and before append"
        );
      }
      const bytes = Buffer.from(`${JSON.stringify(event)}\n`, "utf8");
      const written = await ledger.handle.write(bytes, 0, bytes.length, null);
      if (written.bytesWritten !== bytes.length) {
        throw new Error(
          `Authoritative ledger append was torn after ${written.bytesWritten} bytes`
        );
      }
      await ledger.handle.sync();
      const appended = analyzeLedgerBytes(Buffer.concat([existing.bytes, bytes]));
      if (appended.tornTail) {
        throw new Error("Authoritative ledger append produced a recoverable torn tail");
      }
      const projected = replayEvents(appended.events);
      const first = appended.events[0];
      if (!first) throw new Error("Authoritative ledger is empty after append");
      const canonical = bootstrapFromLedger(first);
      await writeCaches(
        physical,
        withRuntimeMetadata(projected.snapshot, canonical.fingerprint),
        projected.leases,
        options
      );
    } finally {
      await ledger.handle.close();
    }
    return loadUnlocked(physical, options);
  });
}

async function preserveTornLedger(
  root: string,
  analysis: LedgerAnalysis,
  options: RuntimeOptions
): Promise<void> {
  const ledgerPath = join(root, "ledger", "events.ndjson");
  const original = await readSecureFile(ledgerPath, "Authoritative ledger");
  if (!original.bytes.equals(analysis.bytes)) {
    throw new Error("Authoritative ledger changed before torn-tail recovery");
  }
  const hash = sha256(original.bytes);
  const evidencePath = join(root, "recovery", `events-torn-${hash}.ndjson`);
  await preserveExactLink(ledgerPath, evidencePath, original, "Torn ledger evidence");
  await fsyncDirectory(join(root, "recovery"));
  await atomicReplace(ledgerPath, analysis.validPrefix, options);
}

export async function rebuildRuntime(
  root: string,
  options: RuntimeOptions = {}
): Promise<RuntimeProjection> {
  return withLock(root, options, async (physical) => {
    let analysis = await analyzeLedger(physical);
    replayEvents(analysis.events);
    if (analysis.tornTail) {
      await preserveTornLedger(physical, analysis, options);
      analysis = await analyzeLedger(physical);
      if (analysis.tornTail) {
        throw new Error("Authoritative ledger still has a torn tail after recovery");
      }
    }
    const projected = replayEvents(analysis.events);
    const first = analysis.events[0];
    if (!first) throw new Error("Authoritative ledger is empty during rebuild");
    const canonical = bootstrapFromLedger(first);
    await writeCaches(
      physical,
      withRuntimeMetadata(projected.snapshot, canonical.fingerprint),
      projected.leases,
      options
    );
    return loadUnlocked(physical, options);
  });
}
