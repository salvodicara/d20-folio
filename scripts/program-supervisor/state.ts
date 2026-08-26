import { isAbsolute, normalize } from "node:path";

export const TASK_STATES = [
  "queued",
  "leased",
  "executing",
  "review",
  "verification",
  "owner-gate",
  "integrated",
  "retired",
  "blocked-with-evidence",
] as const;

export type TaskState = (typeof TASK_STATES)[number];
export type LeaseRole = "writer" | "evaluator";
export const BOOTSTRAP_CONTROLLER_WRITER_ID = "program-supervisor-bootstrap-controller";

export interface CurrentWriter {
  kind: "controller" | "supervisor-thread";
  id: string;
}

export interface AuthorityReference {
  path: string;
  blob: string;
}

export interface AuthorityManifest {
  mainSha: string;
  operatingModel: AuthorityReference;
  productWayfinders: [AuthorityReference, AuthorityReference];
  testPortfolioRoadmap: AuthorityReference;
  readinessBaseline: AuthorityReference;
  repositoryLeaseOwners: AuthorityReference[];
  statusOwner: AuthorityReference;
}

export interface RepositoryLeaseAuthority {
  id: string;
  ownerDocumentPath: string;
  ownerDocumentBlob: string;
  mainSha: string;
}

export interface TaskCharter {
  id: string;
  outcome: string;
  authority: AuthorityReference[];
  dependencies: TaskDependency[];
  ownership: {
    repository: string;
    worktree: string;
    branch: string;
    baseSha: string;
    headSha: string;
    paths: string[];
    repositoryLease: RepositoryLeaseAuthority;
  };
  acceptance: string[];
  review: {
    required: boolean;
    independent: boolean;
    proof: string;
  };
  ownerGate: {
    required: boolean;
    name: string;
  };
  cleanup: {
    rule: string;
    proof: "remote-or-recovery";
    removal: string[];
  };
}

export interface TaskDependency {
  taskId: string;
  integratedSha: string;
  requiredInterface: string;
}

export interface LeaseAuthorityPointer {
  repository: string;
  ownerDocumentPath: string;
  repositoryLeaseId: string;
  reconciledOwnerBlob: string;
  reconciledMainSha: string;
}

export interface ActiveLease {
  leaseId: string;
  taskId: string;
  holder: string;
  agentId: string;
  role: LeaseRole;
  readOnly: boolean;
  acquiredAt: string;
  termStartedAt: string;
  expiresAt: string;
  authorityPointer: LeaseAuthorityPointer;
}

export interface EvidenceRecord {
  id: string;
  kind: string;
  receipt: string;
}

export interface TaskProjection {
  charter: TaskCharter;
  state: TaskState;
  receipt: string | null;
  activeLease: ActiveLease | null;
  evidence: EvidenceRecord[];
  cleanup: CleanupProjection | null;
  pendingReconciliation: PendingReconciliation | null;
  verificationEventId: string | null;
  updatedAt: string;
}

export interface PendingReconciliation {
  kind: "failed-gate" | "changed-base";
  proof: string;
  baseSha: string;
  headSha: string;
}

export interface CleanupProjection {
  removed: string[];
  remoteProof: string | null;
  recoveryProof: string | null;
}

export interface ProgramSnapshot {
  schemaVersion: 1;
  authority: AuthorityManifest;
  tasks: TaskProjection[];
  rulings: RulingRecord[];
  ownerGates: OwnerGateRecord[];
  noFrontiers: NoFrontierRecord[];
  supervisor: SupervisorRecord | null;
  heartbeat: HeartbeatRecord | null;
  currentWriter: CurrentWriter;
  wip: { writers: number; evaluators: number };
  updatedAt: string;
  lastEventSeq: number;
}

export interface LeaseCacheEntry {
  taskId: string;
  expiresAt: string;
  authorityPointer: LeaseAuthorityPointer;
}

export interface LeaseFile {
  schemaVersion: 1;
  lastEventSeq: number;
  leases: LeaseCacheEntry[];
}

interface BootstrapTask {
  charter: TaskCharter;
  state: TaskState;
  receipt: string | null;
  updatedAt: string;
}

interface BaseEvent {
  schemaVersion: 1;
  eventId: string;
  seq: number;
  type: string;
  writerId: string;
  at: string;
}

interface BootstrapEvent extends BaseEvent {
  type: "bootstrap";
  authority: AuthorityManifest;
  tasks: BootstrapTask[];
  activeLeases: ActiveLease[];
}

interface TaskCreatedEvent extends BaseEvent {
  type: "task-created";
  task: BootstrapTask;
}

interface LeaseAcquiredEvent extends BaseEvent {
  type: "lease-acquired";
  lease: ActiveLease;
}

interface LeaseRenewedEvent extends BaseEvent {
  type: "lease-renewed";
  taskId: string;
  leaseId: string;
  holder: string;
  agentId: string;
  role: LeaseRole;
  readOnly: boolean;
  previousExpiresAt: string;
  expiresAt: string;
  authorityPointer: LeaseAuthorityPointer;
  proof: string;
}

interface LeaseClosedEvent extends BaseEvent {
  type: "lease-released" | "lease-expired";
  taskId: string;
  leaseId: string;
  proof?: string;
  preservationReceipt?: string;
}

interface DispatchEvent extends BaseEvent {
  type: "dispatch-recorded";
  taskId: string;
  leaseId: string;
  receipt: string;
}

export interface TransitionContext {
  receipt?: string;
  fixBack?: {
    kind: "review-finding" | "failed-gate" | "changed-base";
    proof: string;
  };
  ownerGate?: string;
  requiredOwnerGate?: string;
}

interface StateTransitionedEvent extends BaseEvent, TransitionContext {
  type: "state-transitioned";
  taskId: string;
  from: TaskState;
  to: TaskState;
  receipt: string;
}

interface TaskReconciledEvent extends BaseEvent {
  type: "task-reconciled";
  taskId: string;
  repository: string;
  worktree: string;
  branch: string;
  previousBaseSha: string;
  previousHeadSha: string;
  baseSha: string;
  headSha: string;
  proof: string;
}

interface EvidenceRecordedEvent extends BaseEvent {
  type: "evidence-recorded";
  taskId: string;
  evidence: EvidenceRecord;
}

export interface RulingRecord {
  id: string;
  taskId: string;
  decision: string;
  receipt: string;
}

interface RulingRecordedEvent extends BaseEvent {
  type: "ruling-recorded";
  ruling: RulingRecord;
}

export interface OwnerGateRecord {
  taskId: string;
  gate: string;
  decision: "pending" | "approved" | "rejected";
  receipt: string;
  verificationEventId: string;
  at: string;
}

interface OwnerGateRecordedEvent extends BaseEvent {
  type: "owner-gate-recorded";
  taskId: string;
  gate: string;
  decision: OwnerGateRecord["decision"];
  receipt: string;
}

export interface NoFrontierRecord {
  wayfinder: string;
  receipt: string;
  at: string;
}

interface NoFrontierRecordedEvent extends BaseEvent {
  type: "no-frontier-recorded";
  wayfinder: string;
  receipt: string;
}

interface AuthorityReconciledEvent extends BaseEvent {
  type: "authority-reconciled";
  previousMainSha: string;
  mainSha: string;
  changes: Array<{ path: string; previousBlob: string; blob: string }>;
  proof: string;
}

export interface SupervisorRecord {
  taskTitle: "d20 Folio Program Supervisor";
  savedProjectId: string;
  threadId: string;
  hostId: string;
  marker: string;
  automationId: string;
  automationName: string;
  cadenceMinutes: 30;
  targetThreadId: string;
  destination: "thread";
  notificationPolicy: "failed_runs_only";
  status: "PAUSED";
  receipt: string;
  at: string;
}

interface SupervisorProvisionedEvent extends BaseEvent {
  type: "supervisor-provisioned";
  taskTitle: SupervisorRecord["taskTitle"];
  savedProjectId: string;
  threadId: string;
  hostId: string;
  marker: string;
  automationId: string;
  automationName: string;
  cadenceMinutes: 30;
  targetThreadId: string;
  destination: SupervisorRecord["destination"];
  notificationPolicy: SupervisorRecord["notificationPolicy"];
  status: SupervisorRecord["status"];
  receipt: string;
}

export interface HeartbeatRecord {
  automationId: string;
  threadId: string;
  finalMainSha: string;
  statusOwner: AuthorityReference;
  repositoryLeaseOwners: AuthorityReference[];
  rebuildProof: string;
  cleanupPendingProof: string;
  receipt: string;
  at: string;
}

interface HeartbeatActivatedEvent extends BaseEvent {
  type: "heartbeat-activated";
  automationId: string;
  threadId: string;
  finalMainSha: string;
  statusOwner: AuthorityReference;
  repositoryLeaseOwners: AuthorityReference[];
  rebuildProof: string;
  cleanupPendingProof: string;
  receipt: string;
}

interface CleanupRecordedEvent extends BaseEvent {
  type: "cleanup-recorded";
  taskId: string;
  removed: string[];
  remoteProof: string | null;
  recoveryProof: string | null;
}

type ProgramEvent =
  | BootstrapEvent
  | TaskCreatedEvent
  | TaskReconciledEvent
  | LeaseAcquiredEvent
  | LeaseRenewedEvent
  | LeaseClosedEvent
  | DispatchEvent
  | StateTransitionedEvent
  | EvidenceRecordedEvent
  | RulingRecordedEvent
  | OwnerGateRecordedEvent
  | NoFrontierRecordedEvent
  | AuthorityReconciledEvent
  | SupervisorProvisionedEvent
  | HeartbeatActivatedEvent
  | CleanupRecordedEvent;

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DAY_MS = 24 * 60 * 60 * 1_000;
const EVIDENCED_STATES = new Set<TaskState>([
  "review",
  "verification",
  "integrated",
  "retired",
  "blocked-with-evidence",
]);
const ACTIVE_LEASE_STATES = new Set<TaskState>([
  "leased",
  "executing",
  "review",
  "verification",
  "owner-gate",
  "integrated",
]);

function corruption(path: string, message: string): never {
  throw new TypeError(`Corrupt Program Supervisor data at ${path}: ${message}`);
}

function objectAt(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    corruption(path, "expected an object");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(record, key)) corruption(path, `missing required key ${key}`);
  }
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) corruption(path, `unexpected key ${key}`);
  }
  return record;
}

function arrayAt(value: unknown, path: string, nonEmpty = false): unknown[] {
  if (!Array.isArray(value)) corruption(path, "expected an array");
  if (nonEmpty && value.length === 0) corruption(path, "must not be empty");
  return value;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    corruption(path, "expected a non-empty string");
  }
  return value;
}

function nullableStringAt(value: unknown, path: string): string | null {
  if (value === null) return null;
  return stringAt(value, path);
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") corruption(path, "expected a boolean");
  return value;
}

function integerAt(value: unknown, path: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    corruption(path, `expected an integer >= ${minimum}`);
  }
  return value as number;
}

function idAt(value: unknown, path: string): string {
  const id = stringAt(value, path);
  if (!ID_PATTERN.test(id)) corruption(path, "expected a stable identifier");
  return id;
}

function shaAt(value: unknown, path: string): string {
  const sha = stringAt(value, path);
  if (!SHA_PATTERN.test(sha))
    corruption(path, "expected 40 lowercase hexadecimal characters");
  return sha;
}

function timestampAt(value: unknown, path: string): string {
  const timestamp = stringAt(value, path);
  const milliseconds = Date.parse(timestamp);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== timestamp
  ) {
    corruption(path, "expected a round-trippable ISO timestamp");
  }
  return timestamp;
}

function normalizedPathAt(value: unknown, path: string): string {
  const normalized = stringAt(value, path);
  const hasValidTerminalWildcard = /^[^*]+\/\*\*$/.test(normalized);
  if (
    normalized.startsWith("/") ||
    normalized.startsWith("./") ||
    normalized.endsWith("/") ||
    normalized.includes("//") ||
    (normalized.includes("*") && !hasValidTerminalWildcard) ||
    normalized.split("/").some((part) => part === "." || part === "..")
  ) {
    corruption(path, "expected a normalized repository-relative path");
  }
  return normalized;
}

function sameAuthorityReference(
  left: AuthorityReference,
  right: AuthorityReference
): boolean {
  return left.path === right.path && left.blob === right.blob;
}

function sameAuthorityReferenceSet(
  left: readonly AuthorityReference[],
  right: readonly AuthorityReference[]
): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(right.map(({ path, blob }) => `${path}\0${blob}`));
  return left.every(({ path, blob }) => expected.has(`${path}\0${blob}`));
}

function absoluteNormalizedPathAt(value: unknown, path: string): string {
  const candidate = stringAt(value, path);
  if (!isAbsolute(candidate) || normalize(candidate) !== candidate) {
    corruption(path, "expected an absolute normalized path");
  }
  return candidate;
}

function gitBranchAt(value: unknown, path: string): string {
  const branch = stringAt(value, path);
  const parts = branch.split("/");
  if (
    branch === "HEAD" ||
    branch.includes("..") ||
    branch.includes("@{") ||
    parts.some(
      (part) =>
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) ||
        part.endsWith(".") ||
        part.endsWith(".lock")
    )
  ) {
    corruption(path, "expected a safe normalized Git branch");
  }
  return branch;
}

function uniqueStrings(
  values: unknown,
  path: string,
  normalizedPaths = false,
  nonEmpty = true
): string[] {
  const parsed = arrayAt(values, path, nonEmpty).map((value, index) =>
    normalizedPaths
      ? normalizedPathAt(value, `${path}[${index}]`)
      : stringAt(value, `${path}[${index}]`)
  );
  if (new Set(parsed).size !== parsed.length)
    corruption(path, "contains duplicate values");
  return parsed;
}

function validateAuthorityReference(value: unknown, path: string): AuthorityReference {
  const record = objectAt(value, path, ["path", "blob"]);
  return {
    path: normalizedPathAt(record.path, `${path}.path`),
    blob: shaAt(record.blob, `${path}.blob`),
  };
}

function validateAuthorityManifest(value: unknown, path: string): AuthorityManifest {
  const record = objectAt(value, path, [
    "mainSha",
    "operatingModel",
    "productWayfinders",
    "testPortfolioRoadmap",
    "readinessBaseline",
    "repositoryLeaseOwners",
    "statusOwner",
  ]);
  const wayfinders = arrayAt(record.productWayfinders, `${path}.productWayfinders`);
  if (wayfinders.length !== 2) {
    corruption(`${path}.productWayfinders`, "expected exactly two product Wayfinders");
  }
  const repositoryLeaseOwners = arrayAt(
    record.repositoryLeaseOwners,
    `${path}.repositoryLeaseOwners`,
    true
  );
  const manifest: AuthorityManifest = {
    mainSha: shaAt(record.mainSha, `${path}.mainSha`),
    operatingModel: validateAuthorityReference(
      record.operatingModel,
      `${path}.operatingModel`
    ),
    productWayfinders: [
      validateAuthorityReference(wayfinders[0], `${path}.productWayfinders[0]`),
      validateAuthorityReference(wayfinders[1], `${path}.productWayfinders[1]`),
    ],
    testPortfolioRoadmap: validateAuthorityReference(
      record.testPortfolioRoadmap,
      `${path}.testPortfolioRoadmap`
    ),
    readinessBaseline: validateAuthorityReference(
      record.readinessBaseline,
      `${path}.readinessBaseline`
    ),
    repositoryLeaseOwners: repositoryLeaseOwners.map((owner, index) =>
      validateAuthorityReference(owner, `${path}.repositoryLeaseOwners[${index}]`)
    ),
    statusOwner: validateAuthorityReference(record.statusOwner, `${path}.statusOwner`),
  };
  const authorityPaths = [
    manifest.operatingModel.path,
    ...manifest.productWayfinders.map(({ path: authorityPath }) => authorityPath),
    manifest.testPortfolioRoadmap.path,
    manifest.readinessBaseline.path,
    ...manifest.repositoryLeaseOwners.map(({ path: authorityPath }) => authorityPath),
    manifest.statusOwner.path,
  ];
  if (new Set(authorityPaths).size !== authorityPaths.length) {
    corruption(path, "authority paths must be unique");
  }
  return manifest;
}

function validateRepositoryLease(value: unknown, path: string): RepositoryLeaseAuthority {
  const record = objectAt(value, path, [
    "id",
    "ownerDocumentPath",
    "ownerDocumentBlob",
    "mainSha",
  ]);
  return {
    id: idAt(record.id, `${path}.id`),
    ownerDocumentPath: normalizedPathAt(
      record.ownerDocumentPath,
      `${path}.ownerDocumentPath`
    ),
    ownerDocumentBlob: shaAt(record.ownerDocumentBlob, `${path}.ownerDocumentBlob`),
    mainSha: shaAt(record.mainSha, `${path}.mainSha`),
  };
}

function validateTaskDependency(value: unknown, path: string): TaskDependency {
  const record = objectAt(value, path, ["taskId", "integratedSha", "requiredInterface"]);
  return {
    taskId: idAt(record.taskId, `${path}.taskId`),
    integratedSha: shaAt(record.integratedSha, `${path}.integratedSha`),
    requiredInterface: idAt(record.requiredInterface, `${path}.requiredInterface`),
  };
}

function validateTaskCharter(value: unknown, path: string): TaskCharter {
  const record = objectAt(value, path, [
    "id",
    "outcome",
    "authority",
    "dependencies",
    "ownership",
    "acceptance",
    "review",
    "ownerGate",
    "cleanup",
  ]);
  const ownership = objectAt(record.ownership, `${path}.ownership`, [
    "repository",
    "worktree",
    "branch",
    "baseSha",
    "headSha",
    "paths",
    "repositoryLease",
  ]);
  const authority = arrayAt(record.authority, `${path}.authority`, true).map(
    (item, index) => validateAuthorityReference(item, `${path}.authority[${index}]`)
  );
  if (
    new Set(authority.map(({ path: authorityPath }) => authorityPath)).size !==
    authority.length
  ) {
    corruption(`${path}.authority`, "contains duplicate paths");
  }
  const repositoryLease = validateRepositoryLease(
    ownership.repositoryLease,
    `${path}.ownership.repositoryLease`
  );
  const pinnedOwner = authority.find(
    ({ path: authorityPath }) => authorityPath === repositoryLease.ownerDocumentPath
  );
  if (!pinnedOwner || pinnedOwner.blob !== repositoryLease.ownerDocumentBlob) {
    corruption(
      `${path}.ownership.repositoryLease`,
      "owner document must be pinned by the charter authority"
    );
  }
  const review = objectAt(record.review, `${path}.review`, [
    "required",
    "independent",
    "proof",
  ]);
  const ownerGate = objectAt(record.ownerGate, `${path}.ownerGate`, ["required", "name"]);
  const cleanup = objectAt(record.cleanup, `${path}.cleanup`, [
    "rule",
    "proof",
    "removal",
  ]);
  const reviewRequired = booleanAt(review.required, `${path}.review.required`);
  const reviewIndependent = booleanAt(review.independent, `${path}.review.independent`);
  if (!reviewRequired || !reviewIndependent) {
    corruption(`${path}.review`, "requires an independent review contract");
  }
  if (cleanup.proof !== "remote-or-recovery") {
    corruption(`${path}.cleanup.proof`, "expected remote-or-recovery");
  }
  const dependencies = arrayAt(record.dependencies, `${path}.dependencies`).map(
    (dependency, index) =>
      validateTaskDependency(dependency, `${path}.dependencies[${index}]`)
  );
  if (new Set(dependencies.map(({ taskId }) => taskId)).size !== dependencies.length) {
    corruption(`${path}.dependencies`, "contains duplicate dependency task IDs");
  }
  return {
    id: idAt(record.id, `${path}.id`),
    outcome: stringAt(record.outcome, `${path}.outcome`),
    authority,
    dependencies,
    ownership: {
      repository: absoluteNormalizedPathAt(
        ownership.repository,
        `${path}.ownership.repository`
      ),
      worktree: absoluteNormalizedPathAt(
        ownership.worktree,
        `${path}.ownership.worktree`
      ),
      branch: gitBranchAt(ownership.branch, `${path}.ownership.branch`),
      baseSha: shaAt(ownership.baseSha, `${path}.ownership.baseSha`),
      headSha: shaAt(ownership.headSha, `${path}.ownership.headSha`),
      paths: uniqueStrings(ownership.paths, `${path}.ownership.paths`, true),
      repositoryLease,
    },
    acceptance: uniqueStrings(record.acceptance, `${path}.acceptance`),
    review: {
      required: reviewRequired,
      independent: reviewIndependent,
      proof: stringAt(review.proof, `${path}.review.proof`),
    },
    ownerGate: {
      required: booleanAt(ownerGate.required, `${path}.ownerGate.required`),
      name: idAt(ownerGate.name, `${path}.ownerGate.name`),
    },
    cleanup: {
      rule: stringAt(cleanup.rule, `${path}.cleanup.rule`),
      proof: "remote-or-recovery",
      removal: uniqueStrings(cleanup.removal, `${path}.cleanup.removal`),
    },
  };
}

function taskStateAt(value: unknown, path: string): TaskState {
  if (typeof value !== "string" || !TASK_STATES.includes(value as TaskState)) {
    corruption(path, `expected one of ${TASK_STATES.join(", ")}`);
  }
  return value as TaskState;
}

function validateStateReceipt(
  state: TaskState,
  receipt: string | null,
  path: string
): void {
  if (EVIDENCED_STATES.has(state) && receipt === null) {
    corruption(path, `${state} requires a receipt`);
  }
}

function validateBootstrapTask(value: unknown, path: string): BootstrapTask {
  const record = objectAt(value, path, ["charter", "state", "receipt", "updatedAt"]);
  const state = taskStateAt(record.state, `${path}.state`);
  const receipt = nullableStringAt(record.receipt, `${path}.receipt`);
  validateStateReceipt(state, receipt, `${path}.receipt`);
  return {
    charter: validateTaskCharter(record.charter, `${path}.charter`),
    state,
    receipt,
    updatedAt: timestampAt(record.updatedAt, `${path}.updatedAt`),
  };
}

function validateLeaseAuthorityPointer(
  value: unknown,
  path: string
): LeaseAuthorityPointer {
  const record = objectAt(value, path, [
    "repository",
    "ownerDocumentPath",
    "repositoryLeaseId",
    "reconciledOwnerBlob",
    "reconciledMainSha",
  ]);
  return {
    repository: stringAt(record.repository, `${path}.repository`),
    ownerDocumentPath: normalizedPathAt(
      record.ownerDocumentPath,
      `${path}.ownerDocumentPath`
    ),
    repositoryLeaseId: idAt(record.repositoryLeaseId, `${path}.repositoryLeaseId`),
    reconciledOwnerBlob: shaAt(record.reconciledOwnerBlob, `${path}.reconciledOwnerBlob`),
    reconciledMainSha: shaAt(record.reconciledMainSha, `${path}.reconciledMainSha`),
  };
}

function leaseRoleAt(value: unknown, path: string): LeaseRole {
  if (value !== "writer" && value !== "evaluator") {
    corruption(path, "expected writer or evaluator");
  }
  return value;
}

function validateActiveLease(value: unknown, path: string): ActiveLease {
  const record = objectAt(value, path, [
    "leaseId",
    "taskId",
    "holder",
    "agentId",
    "role",
    "readOnly",
    "acquiredAt",
    "termStartedAt",
    "expiresAt",
    "authorityPointer",
  ]);
  const role = leaseRoleAt(record.role, `${path}.role`);
  const readOnly = booleanAt(record.readOnly, `${path}.readOnly`);
  if ((role === "evaluator") !== readOnly) {
    corruption(
      path,
      role === "evaluator" ? "evaluator must be read-only" : "writer cannot be read-only"
    );
  }
  const acquiredAt = timestampAt(record.acquiredAt, `${path}.acquiredAt`);
  const termStartedAt = timestampAt(record.termStartedAt, `${path}.termStartedAt`);
  const expiresAt = timestampAt(record.expiresAt, `${path}.expiresAt`);
  if (Date.parse(termStartedAt) < Date.parse(acquiredAt)) {
    corruption(path, "current lease term cannot begin before acquisition");
  }
  const duration = Date.parse(expiresAt) - Date.parse(termStartedAt);
  if (duration <= 0 || duration > DAY_MS) {
    corruption(
      path,
      "lease expiry must be later and no more than 24 hours after current term start"
    );
  }
  return {
    leaseId: idAt(record.leaseId, `${path}.leaseId`),
    taskId: idAt(record.taskId, `${path}.taskId`),
    holder: idAt(record.holder, `${path}.holder`),
    agentId: idAt(record.agentId, `${path}.agentId`),
    role,
    readOnly,
    acquiredAt,
    termStartedAt,
    expiresAt,
    authorityPointer: validateLeaseAuthorityPointer(
      record.authorityPointer,
      `${path}.authorityPointer`
    ),
  };
}

function validateEvidenceRecord(value: unknown, path: string): EvidenceRecord {
  const record = objectAt(value, path, ["id", "kind", "receipt"]);
  return {
    id: idAt(record.id, `${path}.id`),
    kind: idAt(record.kind, `${path}.kind`),
    receipt: stringAt(record.receipt, `${path}.receipt`),
  };
}

function validateRulingRecord(value: unknown, path: string): RulingRecord {
  const record = objectAt(value, path, ["id", "taskId", "decision", "receipt"]);
  return {
    id: idAt(record.id, `${path}.id`),
    taskId: idAt(record.taskId, `${path}.taskId`),
    decision: stringAt(record.decision, `${path}.decision`),
    receipt: stringAt(record.receipt, `${path}.receipt`),
  };
}

function validateOwnerGateRecord(value: unknown, path: string): OwnerGateRecord {
  const record = objectAt(value, path, [
    "taskId",
    "gate",
    "decision",
    "receipt",
    "verificationEventId",
    "at",
  ]);
  if (
    record.decision !== "pending" &&
    record.decision !== "approved" &&
    record.decision !== "rejected"
  ) {
    corruption(`${path}.decision`, "expected pending, approved, or rejected");
  }
  return {
    taskId: idAt(record.taskId, `${path}.taskId`),
    gate: idAt(record.gate, `${path}.gate`),
    decision: record.decision,
    receipt: stringAt(record.receipt, `${path}.receipt`),
    verificationEventId: idAt(record.verificationEventId, `${path}.verificationEventId`),
    at: timestampAt(record.at, `${path}.at`),
  };
}

function validateNoFrontierRecord(value: unknown, path: string): NoFrontierRecord {
  const record = objectAt(value, path, ["wayfinder", "receipt", "at"]);
  return {
    wayfinder: idAt(record.wayfinder, `${path}.wayfinder`),
    receipt: stringAt(record.receipt, `${path}.receipt`),
    at: timestampAt(record.at, `${path}.at`),
  };
}

function validateSupervisorRecord(value: unknown, path: string): SupervisorRecord {
  const record = objectAt(value, path, [
    "taskTitle",
    "savedProjectId",
    "threadId",
    "hostId",
    "marker",
    "automationId",
    "automationName",
    "cadenceMinutes",
    "targetThreadId",
    "destination",
    "notificationPolicy",
    "status",
    "receipt",
    "at",
  ]);
  if (record.taskTitle !== "d20 Folio Program Supervisor") {
    corruption(`${path}.taskTitle`, "expected exact Program Supervisor task title");
  }
  const threadId = idAt(record.threadId, `${path}.threadId`);
  if (record.targetThreadId !== threadId) {
    corruption(`${path}.targetThreadId`, "must equal the provisioned task thread");
  }
  if (record.destination !== "thread") {
    corruption(`${path}.destination`, "expected destination thread");
  }
  if (record.notificationPolicy !== "failed_runs_only") {
    corruption(`${path}.notificationPolicy`, "expected failed_runs_only");
  }
  if (record.status !== "PAUSED") {
    corruption(`${path}.status`, "expected PAUSED");
  }
  if (record.cadenceMinutes !== 30) {
    corruption(`${path}.cadenceMinutes`, "expected cadence of 30 minutes");
  }
  return {
    taskTitle: "d20 Folio Program Supervisor",
    savedProjectId: idAt(record.savedProjectId, `${path}.savedProjectId`),
    threadId,
    hostId: idAt(record.hostId, `${path}.hostId`),
    marker: idAt(record.marker, `${path}.marker`),
    automationId: idAt(record.automationId, `${path}.automationId`),
    automationName: stringAt(record.automationName, `${path}.automationName`),
    cadenceMinutes: 30,
    targetThreadId: threadId,
    destination: "thread",
    notificationPolicy: "failed_runs_only",
    status: "PAUSED",
    receipt: stringAt(record.receipt, `${path}.receipt`),
    at: timestampAt(record.at, `${path}.at`),
  };
}

function validateHeartbeatRecord(value: unknown, path: string): HeartbeatRecord {
  const record = objectAt(value, path, [
    "automationId",
    "threadId",
    "finalMainSha",
    "statusOwner",
    "repositoryLeaseOwners",
    "rebuildProof",
    "cleanupPendingProof",
    "receipt",
    "at",
  ]);
  const repositoryLeaseOwners = arrayAt(
    record.repositoryLeaseOwners,
    `${path}.repositoryLeaseOwners`,
    true
  ).map((reference, index) =>
    validateAuthorityReference(reference, `${path}.repositoryLeaseOwners[${index}]`)
  );
  assertUnique(
    repositoryLeaseOwners.map(({ path: ownerPath }) => ownerPath),
    `${path}.repositoryLeaseOwners`
  );
  return {
    automationId: idAt(record.automationId, `${path}.automationId`),
    threadId: idAt(record.threadId, `${path}.threadId`),
    finalMainSha: shaAt(record.finalMainSha, `${path}.finalMainSha`),
    statusOwner: validateAuthorityReference(record.statusOwner, `${path}.statusOwner`),
    repositoryLeaseOwners,
    rebuildProof: stringAt(record.rebuildProof, `${path}.rebuildProof`),
    cleanupPendingProof: stringAt(
      record.cleanupPendingProof,
      `${path}.cleanupPendingProof`
    ),
    receipt: stringAt(record.receipt, `${path}.receipt`),
    at: timestampAt(record.at, `${path}.at`),
  };
}

function validateCurrentWriter(value: unknown, path: string): CurrentWriter {
  const record = objectAt(value, path, ["kind", "id"]);
  if (record.kind !== "controller" && record.kind !== "supervisor-thread") {
    corruption(`${path}.kind`, "expected controller or supervisor-thread");
  }
  return { kind: record.kind, id: idAt(record.id, `${path}.id`) };
}

function validateCleanupProjection(value: unknown, path: string): CleanupProjection {
  const record = objectAt(value, path, ["removed", "remoteProof", "recoveryProof"]);
  return {
    removed: uniqueStrings(record.removed, `${path}.removed`),
    remoteProof: nullableStringAt(record.remoteProof, `${path}.remoteProof`),
    recoveryProof: nullableStringAt(record.recoveryProof, `${path}.recoveryProof`),
  };
}

function validatePendingReconciliation(
  value: unknown,
  path: string
): PendingReconciliation {
  const record = objectAt(value, path, ["kind", "proof", "baseSha", "headSha"]);
  if (record.kind !== "failed-gate" && record.kind !== "changed-base") {
    corruption(`${path}.kind`, "expected failed-gate or changed-base");
  }
  return {
    kind: record.kind,
    proof: stringAt(record.proof, `${path}.proof`),
    baseSha: shaAt(record.baseSha, `${path}.baseSha`),
    headSha: shaAt(record.headSha, `${path}.headSha`),
  };
}

function assertUnique(values: string[], path: string): void {
  if (new Set(values).size !== values.length) corruption(path, "contains duplicate IDs");
}

function pointerForTask(task: TaskProjection): LeaseAuthorityPointer {
  const lease = task.charter.ownership.repositoryLease;
  return {
    repository: task.charter.ownership.repository,
    ownerDocumentPath: lease.ownerDocumentPath,
    repositoryLeaseId: lease.id,
    reconciledOwnerBlob: lease.ownerDocumentBlob,
    reconciledMainSha: lease.mainSha,
  };
}

function pointersEqual(
  left: LeaseAuthorityPointer,
  right: LeaseAuthorityPointer
): boolean {
  return (
    left.repository === right.repository &&
    left.ownerDocumentPath === right.ownerDocumentPath &&
    left.repositoryLeaseId === right.repositoryLeaseId &&
    left.reconciledOwnerBlob === right.reconciledOwnerBlob &&
    left.reconciledMainSha === right.reconciledMainSha
  );
}

function assertLeaseAuthority(
  task: TaskProjection,
  lease: ActiveLease,
  path: string
): void {
  if (!pointersEqual(lease.authorityPointer, pointerForTask(task))) {
    corruption(
      path,
      "authority pointer does not match the task's pinned repository authority"
    );
  }
}

function pathsOverlap(left: string, right: string): boolean {
  const leftRoot = left.endsWith("/**") ? left.slice(0, -3) : left;
  const rightRoot = right.endsWith("/**") ? right.slice(0, -3) : right;
  return (
    leftRoot === rightRoot ||
    leftRoot.startsWith(`${rightRoot}/`) ||
    rightRoot.startsWith(`${leftRoot}/`)
  );
}

function wipForTasks(tasks: TaskProjection[]): { writers: number; evaluators: number } {
  let writers = 0;
  let evaluators = 0;
  for (const task of tasks) {
    if (task.activeLease?.role === "writer") writers += 1;
    if (task.activeLease?.role === "evaluator") evaluators += 1;
  }
  return { writers, evaluators };
}

function enforceActiveLeases(tasks: TaskProjection[], path: string): void {
  const active = tasks.flatMap((task) =>
    task.activeLease ? [{ task, lease: task.activeLease }] : []
  );
  const wip = wipForTasks(tasks);
  if (wip.writers > 2) corruption(path, "more than two active writers");
  if (wip.evaluators > 1) corruption(path, "more than one active evaluator");
  assertUnique(
    active.map(({ lease }) => lease.leaseId),
    `${path}.leaseId`
  );
  for (const { task, lease: activeLease } of active) {
    if (activeLease.taskId !== task.charter.id) {
      corruption(path, `lease ${activeLease.leaseId} names the wrong task`);
    }
    if (activeLease.role === "evaluator" && !activeLease.readOnly) {
      corruption(path, "evaluator must be read-only");
    }
    assertLeaseAuthority(task, activeLease, `${path}.${activeLease.leaseId}`);
    if (!ACTIVE_LEASE_STATES.has(task.state)) {
      corruption(path, `task ${task.charter.id} is ${task.state} with an active lease`);
    }
  }
  const writers = active.filter(
    ({ lease: activeLease }) => activeLease.role === "writer"
  );
  for (let leftIndex = 0; leftIndex < writers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < writers.length; rightIndex += 1) {
      const leftWriter = writers[leftIndex];
      const rightWriter = writers[rightIndex];
      if (!leftWriter || !rightWriter) {
        corruption(path, "writer index escaped the reconstructed WIP set");
      }
      const left = leftWriter.task;
      const right = rightWriter.task;
      for (const leftPath of left.charter.ownership.paths) {
        for (const rightPath of right.charter.ownership.paths) {
          if (pathsOverlap(leftPath, rightPath)) {
            corruption(
              path,
              `writer ownership overlap at ${leftPath} and ${rightPath}; paths come from task charters`
            );
          }
        }
      }
    }
  }
  for (const task of tasks) {
    if (
      (task.state === "leased" || task.state === "executing") &&
      task.activeLease === null
    ) {
      corruption(
        path,
        `task ${task.charter.id} is ${task.state} without an active lease`
      );
    }
  }
}

function manifestAuthorities(manifest: AuthorityManifest): AuthorityReference[] {
  return [
    manifest.operatingModel,
    ...manifest.productWayfinders,
    manifest.testPortfolioRoadmap,
    manifest.readinessBaseline,
    ...manifest.repositoryLeaseOwners,
    manifest.statusOwner,
  ];
}

function enforceAuthorityCoherence(
  authority: AuthorityManifest,
  tasks: TaskProjection[],
  path: string
): void {
  const globalBlobs = new Map(
    manifestAuthorities(authority).map((reference) => [reference.path, reference.blob])
  );
  const repositoryLeaseOwnerBlobs = new Map(
    authority.repositoryLeaseOwners.map((reference) => [reference.path, reference.blob])
  );
  const ownerDocumentEpochs = new Map<
    string,
    {
      ownerDocumentBlob: string;
      mainSha: string;
    }
  >();
  for (const task of tasks) {
    for (const reference of task.charter.authority) {
      const globalBlob = globalBlobs.get(reference.path);
      if (globalBlob !== undefined && globalBlob !== reference.blob) {
        corruption(
          path,
          `task ${task.charter.id} splits global authority ${reference.path}`
        );
      }
    }
    const repositoryLease = task.charter.ownership.repositoryLease;
    const ownerBlob = repositoryLeaseOwnerBlobs.get(repositoryLease.ownerDocumentPath);
    if (ownerBlob === undefined || repositoryLease.ownerDocumentBlob !== ownerBlob) {
      corruption(
        path,
        `task ${task.charter.id} repository authority does not match a declared lease-owner authority in the global manifest`
      );
    }
    const ownerDocumentKey = `${task.charter.ownership.repository}\0${repositoryLease.ownerDocumentPath}`;
    const sharedEpoch = ownerDocumentEpochs.get(ownerDocumentKey);
    if (
      sharedEpoch &&
      (sharedEpoch.ownerDocumentBlob !== repositoryLease.ownerDocumentBlob ||
        sharedEpoch.mainSha !== repositoryLease.mainSha)
    ) {
      corruption(
        path,
        `task ${task.charter.id} splits the owner document reconciliation epoch for ${repositoryLease.ownerDocumentPath}`
      );
    }
    ownerDocumentEpochs.set(ownerDocumentKey, {
      ownerDocumentBlob: repositoryLease.ownerDocumentBlob,
      mainSha: repositoryLease.mainSha,
    });
  }
}

function enforceDependencies(tasks: TaskProjection[], path: string): void {
  const byId = new Map(tasks.map((task) => [task.charter.id, task]));
  for (const task of tasks) {
    for (const dependency of task.charter.dependencies) {
      if (!byId.has(dependency.taskId)) {
        corruption(
          path,
          `task ${task.charter.id} has unknown dependency ${dependency.taskId}`
        );
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string): void => {
    if (visiting.has(taskId)) corruption(path, `dependency cycle includes ${taskId}`);
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    const task = byId.get(taskId);
    if (!task) corruption(path, `unknown dependency ${taskId}`);
    for (const dependency of task.charter.dependencies) visit(dependency.taskId);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const task of tasks) visit(task.charter.id);
}

function assertDependenciesSatisfied(
  snapshot: ProgramSnapshot,
  task: TaskProjection,
  path: string
): void {
  for (const dependency of task.charter.dependencies) {
    const prerequisite = taskById(snapshot, dependency.taskId);
    if (prerequisite.state !== "integrated" && prerequisite.state !== "retired") {
      corruption(
        path,
        `dependency ${dependency.taskId} must be integrated or retired before task ${task.charter.id}`
      );
    }
    if (prerequisite.charter.ownership.headSha !== dependency.integratedSha) {
      corruption(
        path,
        `dependency ${dependency.taskId} does not match required integrated SHA ${dependency.integratedSha}`
      );
    }
  }
}

function gateRecordsForCycle(
  snapshot: ProgramSnapshot,
  task: TaskProjection
): OwnerGateRecord[] {
  if (task.verificationEventId === null) return [];
  return snapshot.ownerGates.filter(
    (record) =>
      record.taskId === task.charter.id &&
      record.gate === task.charter.ownerGate.name &&
      record.verificationEventId === task.verificationEventId
  );
}

function pendingGateRequest(
  snapshot: ProgramSnapshot,
  task: TaskProjection
): OwnerGateRecord | undefined {
  return gateRecordsForCycle(snapshot, task).find(
    ({ decision }) => decision === "pending"
  );
}

function terminalGateDecision(
  snapshot: ProgramSnapshot,
  task: TaskProjection
): OwnerGateRecord | undefined {
  return gateRecordsForCycle(snapshot, task).find(
    ({ decision }) => decision === "approved" || decision === "rejected"
  );
}

function enforceProjectionSemantics(snapshot: ProgramSnapshot, path: string): void {
  enforceActiveLeases(snapshot.tasks, `${path}.tasks`);
  enforceAuthorityCoherence(snapshot.authority, snapshot.tasks, `${path}.authority`);
  enforceDependencies(snapshot.tasks, `${path}.tasks`);
  const derivedWip = wipForTasks(snapshot.tasks);
  if (
    snapshot.wip.writers !== derivedWip.writers ||
    snapshot.wip.evaluators !== derivedWip.evaluators
  ) {
    corruption(`${path}.wip`, "does not match active leases reconstructed from tasks");
  }

  const evidenceIds: string[] = [];
  for (const task of snapshot.tasks) {
    evidenceIds.push(...task.evidence.map(({ id }) => id));
    if (task.cleanup) {
      if (task.state !== "integrated" && task.state !== "retired") {
        corruption(
          `${path}.tasks`,
          `task ${task.charter.id} has cleanup outside terminal state`
        );
      }
      if (task.activeLease) {
        corruption(
          `${path}.tasks`,
          `task ${task.charter.id} cleanup retains an active lease`
        );
      }
      if (task.cleanup.remoteProof === null && task.cleanup.recoveryProof === null) {
        corruption(
          `${path}.tasks`,
          `task ${task.charter.id} cleanup lacks remote or recovery proof`
        );
      }
      if (!sameValues(task.cleanup.removed, task.charter.cleanup.removal)) {
        corruption(
          `${path}.tasks`,
          `task ${task.charter.id} cleanup violates its removal rule`
        );
      }
    }
    if (task.pendingReconciliation) {
      if (task.state !== "executing" || !task.activeLease) {
        corruption(
          `${path}.tasks`,
          `task ${task.charter.id} pending reconciliation must be executing with an active lease`
        );
      }
      if (
        task.pendingReconciliation.baseSha !== task.charter.ownership.baseSha ||
        task.pendingReconciliation.headSha !== task.charter.ownership.headSha
      ) {
        corruption(
          `${path}.tasks`,
          `task ${task.charter.id} pending reconciliation identities are not current`
        );
      }
    }
    const requiresVerificationIdentity =
      task.state === "verification" ||
      task.state === "owner-gate" ||
      (task.state === "integrated" && task.charter.ownerGate.required);
    if (
      (requiresVerificationIdentity && task.verificationEventId === null) ||
      (!requiresVerificationIdentity && task.verificationEventId !== null)
    ) {
      corruption(
        `${path}.tasks`,
        `task ${task.charter.id} verification identity does not match ${task.state}`
      );
    }
    if (task.charter.ownerGate.required) {
      const pending = pendingGateRequest(snapshot, task);
      const terminal = terminalGateDecision(snapshot, task);
      if (task.state === "verification" && terminal) {
        corruption(
          `${path}.ownerGates`,
          `task ${task.charter.id} terminal owner-gate decision occurred before owner-gate`
        );
      }
      if (task.state === "owner-gate" && !pending) {
        corruption(
          `${path}.ownerGates`,
          `task ${task.charter.id} owner-gate lacks its pending request`
        );
      }
      if (
        task.state === "integrated" &&
        (!pending || terminal?.decision !== "approved")
      ) {
        corruption(
          `${path}.ownerGates`,
          `task ${task.charter.id} owner-gate cycle lacks a terminal approval`
        );
      }
    }
  }
  assertUnique(evidenceIds, `${path}.duplicate evidence IDs`);

  const taskIds = new Set(snapshot.tasks.map(({ charter }) => charter.id));
  for (const ruling of snapshot.rulings) {
    if (!taskIds.has(ruling.taskId)) {
      corruption(`${path}.rulings`, `ruling ${ruling.id} references unknown task`);
    }
  }
  const gateCycles = new Map<
    string,
    { pending: boolean; terminal: "approved" | "rejected" | null }
  >();
  for (const gate of snapshot.ownerGates) {
    const task = snapshot.tasks.find(({ charter }) => charter.id === gate.taskId);
    if (!task) corruption(`${path}.ownerGates`, "owner-gate references unknown task");
    if (!task.charter.ownerGate.required || task.charter.ownerGate.name !== gate.gate) {
      corruption(`${path}.ownerGates`, `owner-gate does not match task ${gate.taskId}`);
    }
    const key = `${gate.taskId}\0${gate.gate}\0${gate.verificationEventId}`;
    const cycle = gateCycles.get(key) ?? { pending: false, terminal: null };
    if (gate.decision === "pending") {
      if (cycle.pending || cycle.terminal !== null) {
        corruption(
          `${path}.ownerGates`,
          "owner-gate cycle must contain exactly one pending request before a terminal decision"
        );
      }
      cycle.pending = true;
    } else {
      if (!cycle.pending) {
        corruption(
          `${path}.ownerGates`,
          "terminal owner-gate decision requires the pending request first"
        );
      }
      if (cycle.terminal !== null) {
        corruption(
          `${path}.ownerGates`,
          "owner-gate cycle already has a terminal decision"
        );
      }
      cycle.terminal = gate.decision;
    }
    gateCycles.set(key, cycle);
  }
  if (
    snapshot.heartbeat &&
    (!snapshot.supervisor ||
      snapshot.heartbeat.threadId !== snapshot.supervisor.threadId ||
      snapshot.heartbeat.automationId !== snapshot.supervisor.automationId)
  ) {
    corruption(
      `${path}.heartbeat`,
      "heartbeat does not match the provisioned supervisor"
    );
  }
  if (snapshot.heartbeat) {
    if (
      snapshot.currentWriter.kind !== "supervisor-thread" ||
      snapshot.currentWriter.id !== snapshot.supervisor?.threadId
    ) {
      corruption(`${path}.currentWriter`, "active heartbeat requires supervisor writer");
    }
  } else if (
    snapshot.currentWriter.kind !== "controller" ||
    snapshot.currentWriter.id !== BOOTSTRAP_CONTROLLER_WRITER_ID
  ) {
    corruption(
      `${path}.currentWriter`,
      "paused runtime requires the bootstrap controller writer"
    );
  }
}

function validateTaskProjection(value: unknown, path: string): TaskProjection {
  const record = objectAt(value, path, [
    "charter",
    "state",
    "receipt",
    "activeLease",
    "evidence",
    "cleanup",
    "pendingReconciliation",
    "verificationEventId",
    "updatedAt",
  ]);
  const state = taskStateAt(record.state, `${path}.state`);
  const receipt = nullableStringAt(record.receipt, `${path}.receipt`);
  validateStateReceipt(state, receipt, `${path}.receipt`);
  const evidence = arrayAt(record.evidence, `${path}.evidence`).map((item, index) =>
    validateEvidenceRecord(item, `${path}.evidence[${index}]`)
  );
  assertUnique(
    evidence.map(({ id }) => id),
    `${path}.evidence`
  );
  return {
    charter: validateTaskCharter(record.charter, `${path}.charter`),
    state,
    receipt,
    activeLease:
      record.activeLease === null
        ? null
        : validateActiveLease(record.activeLease, `${path}.activeLease`),
    evidence,
    cleanup:
      record.cleanup === null
        ? null
        : validateCleanupProjection(record.cleanup, `${path}.cleanup`),
    pendingReconciliation:
      record.pendingReconciliation === null
        ? null
        : validatePendingReconciliation(
            record.pendingReconciliation,
            `${path}.pendingReconciliation`
          ),
    verificationEventId:
      record.verificationEventId === null
        ? null
        : idAt(record.verificationEventId, `${path}.verificationEventId`),
    updatedAt: timestampAt(record.updatedAt, `${path}.updatedAt`),
  };
}

export function validateSnapshot(value: unknown): ProgramSnapshot {
  const record = objectAt(value, "snapshot", [
    "schemaVersion",
    "authority",
    "tasks",
    "rulings",
    "ownerGates",
    "noFrontiers",
    "supervisor",
    "heartbeat",
    "currentWriter",
    "wip",
    "updatedAt",
    "lastEventSeq",
  ]);
  if (record.schemaVersion !== 1) corruption("snapshot.schemaVersion", "expected 1");
  const tasks = arrayAt(record.tasks, "snapshot.tasks", true).map((item, index) =>
    validateTaskProjection(item, `snapshot.tasks[${index}]`)
  );
  assertUnique(
    tasks.map(({ charter: taskCharter }) => taskCharter.id),
    "snapshot.tasks"
  );
  const rulings = arrayAt(record.rulings, "snapshot.rulings").map((item, index) =>
    validateRulingRecord(item, `snapshot.rulings[${index}]`)
  );
  assertUnique(
    rulings.map(({ id }) => id),
    "snapshot.rulings"
  );
  const ownerGates = arrayAt(record.ownerGates, "snapshot.ownerGates").map(
    (item, index) => validateOwnerGateRecord(item, `snapshot.ownerGates[${index}]`)
  );
  const noFrontiers = arrayAt(record.noFrontiers, "snapshot.noFrontiers").map(
    (item, index) => validateNoFrontierRecord(item, `snapshot.noFrontiers[${index}]`)
  );
  const wipRecord = objectAt(record.wip, "snapshot.wip", ["writers", "evaluators"]);
  const wip = {
    writers: integerAt(wipRecord.writers, "snapshot.wip.writers"),
    evaluators: integerAt(wipRecord.evaluators, "snapshot.wip.evaluators"),
  };
  const snapshot: ProgramSnapshot = {
    schemaVersion: 1,
    authority: validateAuthorityManifest(record.authority, "snapshot.authority"),
    tasks,
    rulings,
    ownerGates,
    noFrontiers,
    supervisor:
      record.supervisor === null
        ? null
        : validateSupervisorRecord(record.supervisor, "snapshot.supervisor"),
    heartbeat:
      record.heartbeat === null
        ? null
        : validateHeartbeatRecord(record.heartbeat, "snapshot.heartbeat"),
    currentWriter: validateCurrentWriter(record.currentWriter, "snapshot.currentWriter"),
    wip,
    updatedAt: timestampAt(record.updatedAt, "snapshot.updatedAt"),
    lastEventSeq: integerAt(record.lastEventSeq, "snapshot.lastEventSeq", 1),
  };
  enforceProjectionSemantics(snapshot, "snapshot");
  return snapshot;
}

function validateLeaseCacheEntry(value: unknown, path: string): LeaseCacheEntry {
  const record = objectAt(value, path, ["taskId", "expiresAt", "authorityPointer"]);
  return {
    taskId: idAt(record.taskId, `${path}.taskId`),
    expiresAt: timestampAt(record.expiresAt, `${path}.expiresAt`),
    authorityPointer: validateLeaseAuthorityPointer(
      record.authorityPointer,
      `${path}.authorityPointer`
    ),
  };
}

export function validateLeaseFile(value: unknown): LeaseFile {
  const record = objectAt(value, "leases", ["schemaVersion", "lastEventSeq", "leases"]);
  if (record.schemaVersion !== 1) corruption("leases.schemaVersion", "expected 1");
  const leases = arrayAt(record.leases, "leases.leases").map((item, index) =>
    validateLeaseCacheEntry(item, `leases.leases[${index}]`)
  );
  assertUnique(
    leases.map(({ taskId }) => taskId),
    "leases.leases.taskId"
  );
  return {
    schemaVersion: 1,
    lastEventSeq: integerAt(record.lastEventSeq, "leases.lastEventSeq", 1),
    leases,
  };
}

function validateBaseEvent(value: unknown): Record<string, unknown> {
  const record = objectAt(
    value,
    "event",
    ["schemaVersion", "eventId", "seq", "type", "writerId", "at"],
    [
      "authority",
      "tasks",
      "activeLeases",
      "task",
      "taskId",
      "lease",
      "leaseId",
      "holder",
      "agentId",
      "role",
      "readOnly",
      "previousExpiresAt",
      "expiresAt",
      "authorityPointer",
      "proof",
      "preservationReceipt",
      "receipt",
      "from",
      "to",
      "fixBack",
      "ownerGate",
      "repository",
      "worktree",
      "branch",
      "previousBaseSha",
      "previousHeadSha",
      "baseSha",
      "headSha",
      "evidence",
      "ruling",
      "gate",
      "decision",
      "wayfinder",
      "previousMainSha",
      "mainSha",
      "changes",
      "threadId",
      "hostId",
      "automationId",
      "taskTitle",
      "savedProjectId",
      "marker",
      "automationName",
      "cadenceMinutes",
      "targetThreadId",
      "destination",
      "notificationPolicy",
      "status",
      "finalMainSha",
      "statusOwner",
      "repositoryLeaseOwners",
      "rebuildProof",
      "cleanupPendingProof",
      "removed",
      "remoteProof",
      "recoveryProof",
    ]
  );
  if (record.schemaVersion !== 1) corruption("event.schemaVersion", "expected 1");
  idAt(record.eventId, "event.eventId");
  integerAt(record.seq, "event.seq", 1);
  stringAt(record.type, "event.type");
  idAt(record.writerId, "event.writerId");
  timestampAt(record.at, "event.at");
  return record;
}

function eventObject(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> {
  return objectAt(
    record,
    "event",
    ["schemaVersion", "eventId", "seq", "type", "writerId", "at", ...required],
    optional
  );
}

function baseFrom(record: Record<string, unknown>): BaseEvent {
  return {
    schemaVersion: 1,
    eventId: idAt(record.eventId, "event.eventId"),
    seq: integerAt(record.seq, "event.seq", 1),
    type: stringAt(record.type, "event.type"),
    writerId: idAt(record.writerId, "event.writerId"),
    at: timestampAt(record.at, "event.at"),
  };
}

function validateFixBack(
  value: unknown,
  path: string
): NonNullable<TransitionContext["fixBack"]> {
  const record = objectAt(value, path, ["kind", "proof"]);
  if (
    record.kind !== "review-finding" &&
    record.kind !== "failed-gate" &&
    record.kind !== "changed-base"
  ) {
    corruption(`${path}.kind`, "expected review-finding, failed-gate, or changed-base");
  }
  return { kind: record.kind, proof: stringAt(record.proof, `${path}.proof`) };
}

export function validateEventInput(value: unknown): ProgramEvent {
  const broad = validateBaseEvent(value);
  const base = baseFrom(broad);
  switch (base.type) {
    case "bootstrap": {
      const record = eventObject(broad, ["authority", "tasks", "activeLeases"]);
      if (base.writerId !== BOOTSTRAP_CONTROLLER_WRITER_ID) {
        corruption(
          "event.writerId",
          `bootstrap controller writer must be ${BOOTSTRAP_CONTROLLER_WRITER_ID}`
        );
      }
      const authority = validateAuthorityManifest(record.authority, "event.authority");
      const tasks = arrayAt(record.tasks, "event.tasks", true).map((task, index) =>
        validateBootstrapTask(task, `event.tasks[${index}]`)
      );
      const activeLeases = arrayAt(record.activeLeases, "event.activeLeases").map(
        (active, index) => validateActiveLease(active, `event.activeLeases[${index}]`)
      );
      assertUnique(
        tasks.map(({ charter }) => charter.id),
        "event.tasks"
      );
      assertUnique(
        activeLeases.map(({ leaseId }) => leaseId),
        "event.activeLeases"
      );
      const projectedTasks: TaskProjection[] = tasks.map((task) => ({
        charter: task.charter,
        state: task.state,
        receipt: task.receipt,
        activeLease: null,
        evidence: [],
        cleanup: null,
        pendingReconciliation: null,
        verificationEventId: task.state === "verification" ? base.eventId : null,
        updatedAt: task.updatedAt,
      }));
      for (const activeLease of activeLeases) {
        const task = projectedTasks.find(
          ({ charter }) => charter.id === activeLease.taskId
        );
        if (!task) corruption("event.activeLeases", `unknown task ${activeLease.taskId}`);
        if (task.activeLease) {
          corruption(
            "event.activeLeases",
            `task ${activeLease.taskId} has two active leases`
          );
        }
        task.activeLease = activeLease;
      }
      enforceActiveLeases(projectedTasks, "event.activeLeases");
      enforceAuthorityCoherence(authority, projectedTasks, "event.authority");
      return {
        ...base,
        type: "bootstrap",
        authority,
        tasks,
        activeLeases,
      };
    }
    case "task-created": {
      const record = eventObject(broad, ["task"]);
      return {
        ...base,
        type: "task-created",
        task: validateBootstrapTask(record.task, "event.task"),
      };
    }
    case "task-reconciled": {
      const record = eventObject(broad, [
        "taskId",
        "repository",
        "worktree",
        "branch",
        "previousBaseSha",
        "previousHeadSha",
        "baseSha",
        "headSha",
        "proof",
      ]);
      return {
        ...base,
        type: "task-reconciled",
        taskId: idAt(record.taskId, "event.taskId"),
        repository: absoluteNormalizedPathAt(record.repository, "event.repository"),
        worktree: absoluteNormalizedPathAt(record.worktree, "event.worktree"),
        branch: gitBranchAt(record.branch, "event.branch"),
        previousBaseSha: shaAt(record.previousBaseSha, "event.previousBaseSha"),
        previousHeadSha: shaAt(record.previousHeadSha, "event.previousHeadSha"),
        baseSha: shaAt(record.baseSha, "event.baseSha"),
        headSha: shaAt(record.headSha, "event.headSha"),
        proof: stringAt(record.proof, "event.proof"),
      };
    }
    case "lease-acquired": {
      const record = eventObject(broad, ["lease"]);
      return {
        ...base,
        type: "lease-acquired",
        lease: validateActiveLease(record.lease, "event.lease"),
      };
    }
    case "lease-renewed": {
      const record = eventObject(broad, [
        "taskId",
        "leaseId",
        "holder",
        "agentId",
        "role",
        "readOnly",
        "previousExpiresAt",
        "expiresAt",
        "authorityPointer",
        "proof",
      ]);
      return {
        ...base,
        type: "lease-renewed",
        taskId: idAt(record.taskId, "event.taskId"),
        leaseId: idAt(record.leaseId, "event.leaseId"),
        holder: idAt(record.holder, "event.holder"),
        agentId: idAt(record.agentId, "event.agentId"),
        role: leaseRoleAt(record.role, "event.role"),
        readOnly: booleanAt(record.readOnly, "event.readOnly"),
        previousExpiresAt: timestampAt(
          record.previousExpiresAt,
          "event.previousExpiresAt"
        ),
        expiresAt: timestampAt(record.expiresAt, "event.expiresAt"),
        authorityPointer: validateLeaseAuthorityPointer(
          record.authorityPointer,
          "event.authorityPointer"
        ),
        proof: stringAt(record.proof, "event.proof"),
      };
    }
    case "lease-released": {
      const record = eventObject(broad, ["taskId", "leaseId", "proof"]);
      return {
        ...base,
        type: "lease-released",
        taskId: idAt(record.taskId, "event.taskId"),
        leaseId: idAt(record.leaseId, "event.leaseId"),
        proof: stringAt(record.proof, "event.proof"),
      };
    }
    case "lease-expired": {
      const record = eventObject(broad, ["taskId", "leaseId", "preservationReceipt"]);
      return {
        ...base,
        type: "lease-expired",
        taskId: idAt(record.taskId, "event.taskId"),
        leaseId: idAt(record.leaseId, "event.leaseId"),
        preservationReceipt: stringAt(
          record.preservationReceipt,
          "event.preservationReceipt"
        ),
      };
    }
    case "dispatch-recorded": {
      const record = eventObject(broad, ["taskId", "leaseId", "receipt"]);
      return {
        ...base,
        type: "dispatch-recorded",
        taskId: idAt(record.taskId, "event.taskId"),
        leaseId: idAt(record.leaseId, "event.leaseId"),
        receipt: stringAt(record.receipt, "event.receipt"),
      };
    }
    case "state-transitioned": {
      const record = eventObject(
        broad,
        ["taskId", "from", "to", "receipt"],
        ["fixBack", "ownerGate"]
      );
      return {
        ...base,
        type: "state-transitioned",
        taskId: idAt(record.taskId, "event.taskId"),
        from: taskStateAt(record.from, "event.from"),
        to: taskStateAt(record.to, "event.to"),
        receipt: stringAt(record.receipt, "event.receipt"),
        ...(record.fixBack === undefined
          ? {}
          : { fixBack: validateFixBack(record.fixBack, "event.fixBack") }),
        ...(record.ownerGate === undefined
          ? {}
          : { ownerGate: idAt(record.ownerGate, "event.ownerGate") }),
      };
    }
    case "evidence-recorded": {
      const record = eventObject(broad, ["taskId", "evidence"]);
      return {
        ...base,
        type: "evidence-recorded",
        taskId: idAt(record.taskId, "event.taskId"),
        evidence: validateEvidenceRecord(record.evidence, "event.evidence"),
      };
    }
    case "ruling-recorded": {
      const record = eventObject(broad, ["ruling"]);
      return {
        ...base,
        type: "ruling-recorded",
        ruling: validateRulingRecord(record.ruling, "event.ruling"),
      };
    }
    case "owner-gate-recorded": {
      const record = eventObject(broad, ["taskId", "gate", "decision", "receipt"]);
      if (
        record.decision !== "pending" &&
        record.decision !== "approved" &&
        record.decision !== "rejected"
      ) {
        corruption("event.decision", "expected pending, approved, or rejected");
      }
      return {
        ...base,
        type: "owner-gate-recorded",
        taskId: idAt(record.taskId, "event.taskId"),
        gate: idAt(record.gate, "event.gate"),
        decision: record.decision,
        receipt: stringAt(record.receipt, "event.receipt"),
      };
    }
    case "no-frontier-recorded": {
      const record = eventObject(broad, ["wayfinder", "receipt"]);
      return {
        ...base,
        type: "no-frontier-recorded",
        wayfinder: idAt(record.wayfinder, "event.wayfinder"),
        receipt: stringAt(record.receipt, "event.receipt"),
      };
    }
    case "authority-reconciled": {
      const record = eventObject(broad, [
        "previousMainSha",
        "mainSha",
        "changes",
        "proof",
      ]);
      const changes = arrayAt(record.changes, "event.changes").map((change, index) => {
        const item = objectAt(change, `event.changes[${index}]`, [
          "path",
          "previousBlob",
          "blob",
        ]);
        return {
          path: normalizedPathAt(item.path, `event.changes[${index}].path`),
          previousBlob: shaAt(item.previousBlob, `event.changes[${index}].previousBlob`),
          blob: shaAt(item.blob, `event.changes[${index}].blob`),
        };
      });
      assertUnique(
        changes.map(({ path: authorityPath }) => authorityPath),
        "event.changes.path"
      );
      return {
        ...base,
        type: "authority-reconciled",
        previousMainSha: shaAt(record.previousMainSha, "event.previousMainSha"),
        mainSha: shaAt(record.mainSha, "event.mainSha"),
        changes,
        proof: stringAt(record.proof, "event.proof"),
      };
    }
    case "supervisor-provisioned": {
      const record = eventObject(broad, [
        "taskTitle",
        "savedProjectId",
        "threadId",
        "hostId",
        "marker",
        "automationId",
        "automationName",
        "cadenceMinutes",
        "targetThreadId",
        "destination",
        "notificationPolicy",
        "status",
        "receipt",
      ]);
      const supervisor = validateSupervisorRecord(
        {
          taskTitle: record.taskTitle,
          savedProjectId: record.savedProjectId,
          threadId: record.threadId,
          hostId: record.hostId,
          marker: record.marker,
          automationId: record.automationId,
          automationName: record.automationName,
          cadenceMinutes: record.cadenceMinutes,
          targetThreadId: record.targetThreadId,
          destination: record.destination,
          notificationPolicy: record.notificationPolicy,
          status: record.status,
          receipt: record.receipt,
          at: base.at,
        },
        "event.supervisor"
      );
      return {
        ...base,
        type: "supervisor-provisioned",
        taskTitle: supervisor.taskTitle,
        savedProjectId: supervisor.savedProjectId,
        threadId: supervisor.threadId,
        hostId: supervisor.hostId,
        marker: supervisor.marker,
        automationId: supervisor.automationId,
        automationName: supervisor.automationName,
        cadenceMinutes: supervisor.cadenceMinutes,
        targetThreadId: supervisor.targetThreadId,
        destination: supervisor.destination,
        notificationPolicy: supervisor.notificationPolicy,
        status: supervisor.status,
        receipt: supervisor.receipt,
      };
    }
    case "heartbeat-activated": {
      const record = eventObject(broad, [
        "automationId",
        "threadId",
        "finalMainSha",
        "statusOwner",
        "repositoryLeaseOwners",
        "rebuildProof",
        "cleanupPendingProof",
        "receipt",
      ]);
      const heartbeat = validateHeartbeatRecord(
        {
          automationId: record.automationId,
          threadId: record.threadId,
          finalMainSha: record.finalMainSha,
          statusOwner: record.statusOwner,
          repositoryLeaseOwners: record.repositoryLeaseOwners,
          rebuildProof: record.rebuildProof,
          cleanupPendingProof: record.cleanupPendingProof,
          receipt: record.receipt,
          at: base.at,
        },
        "event.heartbeat"
      );
      return {
        ...base,
        type: "heartbeat-activated",
        automationId: heartbeat.automationId,
        threadId: heartbeat.threadId,
        finalMainSha: heartbeat.finalMainSha,
        statusOwner: heartbeat.statusOwner,
        repositoryLeaseOwners: heartbeat.repositoryLeaseOwners,
        rebuildProof: heartbeat.rebuildProof,
        cleanupPendingProof: heartbeat.cleanupPendingProof,
        receipt: heartbeat.receipt,
      };
    }
    case "cleanup-recorded": {
      const record = eventObject(broad, [
        "taskId",
        "removed",
        "remoteProof",
        "recoveryProof",
      ]);
      return {
        ...base,
        type: "cleanup-recorded",
        taskId: idAt(record.taskId, "event.taskId"),
        removed: uniqueStrings(record.removed, "event.removed"),
        remoteProof: nullableStringAt(record.remoteProof, "event.remoteProof"),
        recoveryProof: nullableStringAt(record.recoveryProof, "event.recoveryProof"),
      };
    }
    default:
      corruption("event.type", `unsupported event variant ${base.type}`);
  }
}

export function parseEvents(ndjson: string): ProgramEvent[] {
  if (typeof ndjson !== "string" || ndjson.length === 0) {
    corruption("ledger", "expected non-empty NDJSON");
  }
  const lines = ndjson.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length === 0) corruption("ledger", "expected at least one event");
  return lines.map((line, index) => {
    if (line.trim().length === 0)
      corruption(`ledger line ${index + 1}`, "blank NDJSON record");
    try {
      return validateEventInput(JSON.parse(line));
    } catch (error) {
      if (error instanceof SyntaxError) {
        corruption(`ledger line ${index + 1}`, `invalid JSON: ${error.message}`);
      }
      throw error;
    }
  });
}

const FORWARD_TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>> = {
  queued: ["blocked-with-evidence"],
  leased: ["blocked-with-evidence"],
  executing: ["review", "blocked-with-evidence"],
  review: ["verification", "executing", "blocked-with-evidence"],
  verification: ["owner-gate", "integrated", "executing", "blocked-with-evidence"],
  "owner-gate": ["integrated", "blocked-with-evidence"],
  integrated: ["retired"],
  retired: [],
  "blocked-with-evidence": ["queued", "leased"],
};

export function validateTransition(
  from: TaskState,
  to: TaskState,
  context: TransitionContext = {}
): void {
  taskStateAt(from, "transition.from");
  taskStateAt(to, "transition.to");
  if (!FORWARD_TRANSITIONS[from].includes(to)) {
    corruption(
      "transition",
      `illegal transition ${from} -> ${to}; executing requires dispatch`
    );
  }
  if (
    EVIDENCED_STATES.has(to) ||
    to === "executing" ||
    from === "blocked-with-evidence"
  ) {
    stringAt(context.receipt, "transition.receipt");
  }
  if (from === "verification" && to === "executing") {
    if (!context.fixBack) {
      corruption("transition.fixBack", "verification fix-back requires an exact receipt");
    }
    const fixBack = validateFixBack(context.fixBack, "transition.fixBack");
    if (fixBack.kind !== "failed-gate" && fixBack.kind !== "changed-base") {
      corruption(
        "transition.fixBack.kind",
        "verification fix-back requires failed-gate or changed-base"
      );
    }
  }
  if (from === "review" && to === "executing") {
    if (!context.fixBack) {
      corruption(
        "transition.fixBack",
        "review fix-back requires review-finding evidence"
      );
    }
    const fixBack = validateFixBack(context.fixBack, "transition.fixBack");
    if (fixBack.kind !== "review-finding") {
      corruption("transition.fixBack.kind", "review fix-back requires review-finding");
    }
  }
  if (to === "owner-gate") {
    const ownerGate = idAt(context.ownerGate, "transition.ownerGate");
    const requiredOwnerGate = idAt(
      context.requiredOwnerGate,
      "transition.requiredOwnerGate"
    );
    if (ownerGate !== requiredOwnerGate) {
      corruption("transition.ownerGate", "must name the charter's named owner gate");
    }
  }
}

function taskById(snapshot: ProgramSnapshot, taskId: string): TaskProjection {
  const task = snapshot.tasks.find(({ charter }) => charter.id === taskId);
  if (!task) corruption("event.taskId", `unknown task ${taskId}`);
  return task;
}

function projectLeaseFile(snapshot: ProgramSnapshot): LeaseFile {
  return {
    schemaVersion: 1,
    lastEventSeq: snapshot.lastEventSeq,
    leases: snapshot.tasks.flatMap((task) =>
      task.activeLease
        ? [
            {
              taskId: task.charter.id,
              expiresAt: task.activeLease.expiresAt,
              authorityPointer: structuredClone(task.activeLease.authorityPointer),
            },
          ]
        : []
    ),
  };
}

function setTaskUpdated(task: TaskProjection, at: string): void {
  task.updatedAt = at;
}

function replaceAuthorityReference(
  reference: AuthorityReference,
  change: AuthorityReconciledEvent["changes"][number]
): boolean {
  if (reference.path !== change.path) return false;
  if (reference.blob !== change.previousBlob) {
    corruption(
      "event.changes",
      `previous blob does not match authority path ${change.path}`
    );
  }
  reference.blob = change.blob;
  return true;
}

function applyAuthorityReconciliation(
  snapshot: ProgramSnapshot,
  current: AuthorityReconciledEvent
): void {
  if (snapshot.authority.mainSha !== current.previousMainSha) {
    corruption("event.previousMainSha", "does not match reconstructed authority.mainSha");
  }
  if (current.mainSha === current.previousMainSha) {
    corruption("event.mainSha", "main SHA must advance beyond the previous value");
  }
  for (const change of current.changes) {
    let matched = false;
    matched =
      replaceAuthorityReference(snapshot.authority.operatingModel, change) || matched;
    for (const wayfinder of snapshot.authority.productWayfinders) {
      matched = replaceAuthorityReference(wayfinder, change) || matched;
    }
    matched =
      replaceAuthorityReference(snapshot.authority.testPortfolioRoadmap, change) ||
      matched;
    matched =
      replaceAuthorityReference(snapshot.authority.readinessBaseline, change) || matched;
    for (const owner of snapshot.authority.repositoryLeaseOwners) {
      matched = replaceAuthorityReference(owner, change) || matched;
    }
    matched =
      replaceAuthorityReference(snapshot.authority.statusOwner, change) || matched;
    for (const task of snapshot.tasks) {
      for (const authority of task.charter.authority) {
        if (authority.path === change.path) {
          if (authority.blob !== change.previousBlob) {
            corruption(
              "event.changes",
              `previous blob does not match task authority ${change.path}`
            );
          }
          authority.blob = change.blob;
          matched = true;
        }
      }
      const repositoryLease = task.charter.ownership.repositoryLease;
      if (repositoryLease.ownerDocumentPath === change.path) {
        if (repositoryLease.ownerDocumentBlob !== change.previousBlob) {
          corruption(
            "event.changes",
            `previous blob does not match repository lease ${change.path}`
          );
        }
        repositoryLease.ownerDocumentBlob = change.blob;
        repositoryLease.mainSha = current.mainSha;
        if (task.activeLease) {
          task.activeLease.authorityPointer.reconciledOwnerBlob = change.blob;
          task.activeLease.authorityPointer.reconciledMainSha = current.mainSha;
        }
        matched = true;
      }
    }
    if (!matched) corruption("event.changes", `unknown authority path ${change.path}`);
  }
  snapshot.authority.mainSha = current.mainSha;
}

function bootstrapSnapshot(first: BootstrapEvent): ProgramSnapshot {
  if (first.seq !== 1) corruption("event.seq", "bootstrap must have sequence 1");
  const taskIds = first.tasks.map(({ charter }) => charter.id);
  assertUnique(taskIds, "event.tasks");
  for (const task of first.tasks) {
    for (const dependency of task.charter.dependencies) {
      if (!taskIds.includes(dependency.taskId)) {
        corruption("event.tasks.dependencies", `unknown dependency ${dependency.taskId}`);
      }
      if (dependency.taskId === task.charter.id) {
        corruption("event.tasks.dependencies", "task cannot depend on itself");
      }
    }
  }
  const tasks: TaskProjection[] = first.tasks.map((task) => ({
    charter: structuredClone(task.charter),
    state: task.state,
    receipt: task.receipt,
    activeLease: null,
    evidence: [],
    cleanup: null,
    pendingReconciliation: null,
    verificationEventId: task.state === "verification" ? first.eventId : null,
    updatedAt: task.updatedAt,
  }));
  for (const activeLease of first.activeLeases) {
    const task = tasks.find(({ charter }) => charter.id === activeLease.taskId);
    if (!task) corruption("event.activeLeases", `unknown task ${activeLease.taskId}`);
    if (task.activeLease)
      corruption("event.activeLeases", `task ${activeLease.taskId} has two leases`);
    task.activeLease = structuredClone(activeLease);
  }
  enforceActiveLeases(tasks, "event.activeLeases");
  return {
    schemaVersion: 1,
    authority: structuredClone(first.authority),
    tasks,
    rulings: [],
    ownerGates: [],
    noFrontiers: [],
    supervisor: null,
    heartbeat: null,
    currentWriter: {
      kind: "controller",
      id: BOOTSTRAP_CONTROLLER_WRITER_ID,
    },
    wip: wipForTasks(tasks),
    updatedAt: first.at,
    lastEventSeq: 1,
  };
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

export function replayEvents(events: readonly unknown[]): {
  snapshot: ProgramSnapshot;
  leases: LeaseFile;
} {
  if (!Array.isArray(events) || events.length === 0) {
    corruption("ledger", "event 1 must be bootstrap");
  }
  const validated = events.map((item) => validateEventInput(item));
  const first = validated[0];
  if (!first || first.type !== "bootstrap")
    corruption("ledger", "event 1 must be bootstrap");
  const eventIds = validated.map(({ eventId }) => eventId);
  assertUnique(eventIds, "ledger duplicate eventId");
  validated.forEach((current, index) => {
    const expected = index + 1;
    if (current.seq !== expected) {
      corruption(
        `ledger[${index}].seq`,
        `expected sequence ${expected}, got ${current.seq}`
      );
    }
    if (index > 0 && current.type === "bootstrap") {
      corruption(
        `ledger[${index}].type`,
        "second bootstrap is forbidden; bootstrap must be first"
      );
    }
  });

  const snapshot = bootstrapSnapshot(first);
  const seenLeaseIds = new Set(first.activeLeases.map(({ leaseId }) => leaseId));
  const seenEvidenceIds = new Set<string>();
  const seenRulingIds = new Set<string>();

  for (const current of validated.slice(1)) {
    if (current.writerId !== snapshot.currentWriter.id) {
      corruption(
        "event.writerId",
        `event writer ${current.writerId} is not current writer ${snapshot.currentWriter.id}`
      );
    }
    switch (current.type) {
      case "task-created": {
        if (
          snapshot.tasks.some(({ charter }) => charter.id === current.task.charter.id)
        ) {
          corruption(
            "event.task.charter.id",
            `duplicate task ID ${current.task.charter.id}`
          );
        }
        if (current.task.state !== "queued" || current.task.receipt !== null) {
          corruption(
            "event.task",
            "a created successor must begin queued without a receipt"
          );
        }
        for (const dependency of current.task.charter.dependencies) {
          taskById(snapshot, dependency.taskId);
        }
        snapshot.tasks.push({
          charter: structuredClone(current.task.charter),
          state: "queued",
          receipt: null,
          activeLease: null,
          evidence: [],
          cleanup: null,
          pendingReconciliation: null,
          verificationEventId: null,
          updatedAt: current.at,
        });
        break;
      }
      case "task-reconciled": {
        const task = taskById(snapshot, current.taskId);
        const ownership = task.charter.ownership;
        if (task.state === "verification" || task.state === "owner-gate") {
          corruption(
            "event.task-reconciled",
            `${task.state} reconciliation is forbidden; return to execution and complete fresh review`
          );
        }
        if (current.repository !== ownership.repository) {
          corruption("event.repository", "does not match the task charter repository");
        }
        if (current.worktree !== ownership.worktree) {
          corruption("event.worktree", "does not match the task charter worktree");
        }
        if (current.branch !== ownership.branch) {
          corruption("event.branch", "does not match the task charter branch");
        }
        if (
          current.previousBaseSha !== ownership.baseSha ||
          current.previousHeadSha !== ownership.headSha
        ) {
          corruption(
            "event.task-reconciled",
            "previous SHAs do not match reconstructed task heads"
          );
        }
        const baseChanged = current.baseSha !== current.previousBaseSha;
        const headChanged = current.headSha !== current.previousHeadSha;
        if (!baseChanged && !headChanged) {
          corruption(
            "event.task-reconciled",
            "reconciliation is a no-op; base or head identity must change"
          );
        }
        if (task.pendingReconciliation) {
          if (
            task.pendingReconciliation.baseSha !== current.previousBaseSha ||
            task.pendingReconciliation.headSha !== current.previousHeadSha
          ) {
            corruption(
              "event.task-reconciled",
              "previous identities do not match the pending verification fix-back"
            );
          }
          if (
            (task.pendingReconciliation.kind === "failed-gate" && !headChanged) ||
            (task.pendingReconciliation.kind === "changed-base" && !baseChanged)
          ) {
            corruption(
              "event.task-reconciled",
              `required ${task.pendingReconciliation.kind} identity did not change`
            );
          }
        }
        ownership.baseSha = current.baseSha;
        ownership.headSha = current.headSha;
        task.pendingReconciliation = null;
        setTaskUpdated(task, current.at);
        break;
      }
      case "lease-acquired": {
        const task = taskById(snapshot, current.lease.taskId);
        if (
          current.at !== current.lease.acquiredAt ||
          current.at !== current.lease.termStartedAt
        ) {
          corruption(
            "event.at",
            "lease acquisition time must equal acquiredAt and termStartedAt"
          );
        }
        if (task.activeLease)
          corruption("event.lease", "task already has an active lease");
        if (task.state !== "queued" && task.state !== "blocked-with-evidence") {
          corruption("event.lease", `cannot lease task in ${task.state}`);
        }
        if (seenLeaseIds.has(current.lease.leaseId)) {
          corruption(
            "event.lease.leaseId",
            `duplicate lease ID ${current.lease.leaseId}`
          );
        }
        assertDependenciesSatisfied(snapshot, task, "event.lease.dependencies");
        assertLeaseAuthority(task, current.lease, "event.lease.authorityPointer");
        task.activeLease = structuredClone(current.lease);
        task.state = "leased";
        task.receipt = null;
        seenLeaseIds.add(current.lease.leaseId);
        setTaskUpdated(task, current.at);
        enforceActiveLeases(snapshot.tasks, "event.lease-acquired");
        break;
      }
      case "lease-renewed": {
        const task = taskById(snapshot, current.taskId);
        const activeLease = task.activeLease;
        if (!activeLease || activeLease.leaseId !== current.leaseId) {
          corruption("event.leaseId", "renewal requires the task's active lease");
        }
        if (Date.parse(current.at) >= Date.parse(activeLease.expiresAt)) {
          corruption("event.at", "renewal must occur before expiry");
        }
        if (current.previousExpiresAt !== activeLease.expiresAt) {
          corruption("event.previousExpiresAt", "does not match the active lease");
        }
        if (
          current.holder !== activeLease.holder ||
          current.agentId !== activeLease.agentId ||
          current.role !== activeLease.role ||
          current.readOnly !== activeLease.readOnly
        ) {
          corruption(
            "event.lease-renewed",
            "holder, agent identity, role, and readOnly must not change"
          );
        }
        if (!pointersEqual(current.authorityPointer, activeLease.authorityPointer)) {
          corruption(
            "event.authorityPointer",
            "renewal must preserve the globally reconciled pointer; use authority-reconciled first"
          );
        }
        const extension = Date.parse(current.expiresAt) - Date.parse(current.at);
        if (
          Date.parse(current.expiresAt) <= Date.parse(activeLease.expiresAt) ||
          extension <= 0 ||
          extension > DAY_MS
        ) {
          corruption(
            "event.expiresAt",
            "renewal must extend later and no more than 24 hours from renewal"
          );
        }
        activeLease.expiresAt = current.expiresAt;
        activeLease.termStartedAt = current.at;
        setTaskUpdated(task, current.at);
        enforceActiveLeases(snapshot.tasks, "event.lease-renewed");
        break;
      }
      case "lease-released": {
        const task = taskById(snapshot, current.taskId);
        if (!task.activeLease || task.activeLease.leaseId !== current.leaseId) {
          corruption("event.leaseId", "release requires an active lease");
        }
        if (task.state === "leased" || task.state === "executing") {
          corruption(
            "event.lease-released",
            `cannot release while task is ${task.state}`
          );
        }
        task.activeLease = null;
        setTaskUpdated(task, current.at);
        break;
      }
      case "lease-expired": {
        const task = taskById(snapshot, current.taskId);
        if (!task.activeLease || task.activeLease.leaseId !== current.leaseId) {
          corruption("event.leaseId", "expiry requires an active lease");
        }
        if (Date.parse(current.at) < Date.parse(task.activeLease.expiresAt)) {
          corruption(
            "event.at",
            "lease-expired must occur at or after its recorded expiry"
          );
        }
        task.activeLease = null;
        if (task.state === "leased" || task.state === "executing") {
          task.state = "blocked-with-evidence";
          task.receipt = current.preservationReceipt ?? null;
          task.pendingReconciliation = null;
          task.verificationEventId = null;
        }
        setTaskUpdated(task, current.at);
        enforceActiveLeases(snapshot.tasks, "event.lease-expired");
        break;
      }
      case "dispatch-recorded": {
        const task = taskById(snapshot, current.taskId);
        if (!task.activeLease || task.activeLease.leaseId !== current.leaseId) {
          corruption("event.leaseId", "dispatch requires the task's active lease");
        }
        if (task.state !== "leased") {
          corruption("event.taskId", `dispatch requires leased state, got ${task.state}`);
        }
        assertDependenciesSatisfied(snapshot, task, "event.dispatch.dependencies");
        task.state = "executing";
        task.receipt = null;
        setTaskUpdated(task, current.at);
        break;
      }
      case "state-transitioned": {
        const task = taskById(snapshot, current.taskId);
        if (task.state !== current.from) {
          corruption(
            "event.from",
            `expected reconstructed state ${task.state}, got ${current.from}`
          );
        }
        validateTransition(current.from, current.to, {
          receipt: current.receipt,
          fixBack: current.fixBack,
          ownerGate: current.ownerGate,
          requiredOwnerGate: task.charter.ownerGate.name,
        });
        if (
          (current.to === "leased" || current.to === "executing") &&
          !task.activeLease
        ) {
          corruption("event.to", `${current.to} requires an active lease`);
        }
        const gateTerminal = terminalGateDecision(snapshot, task);
        if (
          current.from === "owner-gate" &&
          current.to === "blocked-with-evidence" &&
          gateTerminal?.decision !== "rejected"
        ) {
          corruption(
            "event.to",
            "owner-gate may block only after its terminal rejection"
          );
        }
        if (current.to === "blocked-with-evidence" && task.activeLease) {
          if (
            current.from !== "leased" &&
            current.from !== "executing" &&
            current.from !== "owner-gate"
          ) {
            corruption(
              "event.to",
              `cannot close an active lease while blocking from ${current.from}`
            );
          }
          task.activeLease = null;
        }
        if (current.to === "review" && task.pendingReconciliation) {
          corruption("event.to", "task-reconciled is required before review resumes");
        }
        if (current.to === "owner-gate") {
          const records = gateRecordsForCycle(snapshot, task);
          if (
            records.filter(({ decision }) => decision === "pending").length !== 1 ||
            records.some(({ decision }) => decision !== "pending")
          ) {
            corruption(
              "event.ownerGate",
              "owner-gate requires exactly one pending request for the current verification"
            );
          }
        }
        if (
          current.to === "integrated" &&
          task.charter.ownerGate.required &&
          current.from !== "owner-gate"
        ) {
          corruption("event.to", "integration cannot bypass the chartered owner-gate");
        }
        if (
          current.to === "integrated" &&
          task.charter.ownerGate.required &&
          gateTerminal?.decision !== "approved"
        ) {
          corruption("event.to", "owner-gate integration requires its terminal approval");
        }
        task.state = current.to;
        task.receipt = current.receipt;
        if (current.to === "verification") {
          task.verificationEventId = current.eventId;
        }
        if (current.from === "verification" && current.to === "executing") {
          const fixBack = current.fixBack;
          if (
            !fixBack ||
            (fixBack.kind !== "failed-gate" && fixBack.kind !== "changed-base")
          ) {
            corruption("event.fixBack", "verification fix-back evidence is invalid");
          }
          task.pendingReconciliation = {
            kind: fixBack.kind,
            proof: fixBack.proof,
            baseSha: task.charter.ownership.baseSha,
            headSha: task.charter.ownership.headSha,
          };
          task.verificationEventId = null;
        } else if (
          current.to === "blocked-with-evidence" ||
          current.to === "retired" ||
          (current.to === "integrated" && !task.charter.ownerGate.required)
        ) {
          task.verificationEventId = null;
        }
        if (current.to === "blocked-with-evidence") {
          task.pendingReconciliation = null;
        }
        setTaskUpdated(task, current.at);
        break;
      }
      case "evidence-recorded": {
        const task = taskById(snapshot, current.taskId);
        if (seenEvidenceIds.has(current.evidence.id)) {
          corruption("event.evidence.id", `duplicate evidence ID ${current.evidence.id}`);
        }
        task.evidence.push(structuredClone(current.evidence));
        seenEvidenceIds.add(current.evidence.id);
        setTaskUpdated(task, current.at);
        break;
      }
      case "ruling-recorded": {
        taskById(snapshot, current.ruling.taskId);
        if (seenRulingIds.has(current.ruling.id)) {
          corruption("event.ruling.id", `duplicate ruling ID ${current.ruling.id}`);
        }
        snapshot.rulings.push(structuredClone(current.ruling));
        seenRulingIds.add(current.ruling.id);
        setTaskUpdated(taskById(snapshot, current.ruling.taskId), current.at);
        break;
      }
      case "owner-gate-recorded": {
        const task = taskById(snapshot, current.taskId);
        if (
          !task.charter.ownerGate.required ||
          task.charter.ownerGate.name !== current.gate
        ) {
          corruption("event.gate", "does not match the task's named owner gate");
        }
        if (task.verificationEventId === null) {
          corruption(
            "event.gate",
            "owner-gate record requires a current verification identity"
          );
        }
        const records = gateRecordsForCycle(snapshot, task);
        if (current.decision === "pending") {
          if (task.state !== "verification") {
            corruption(
              "event.gate",
              "pending owner-gate request may be recorded only in verification"
            );
          }
          if (records.length !== 0) {
            corruption(
              "event.gate",
              "current verification already has its pending owner-gate request"
            );
          }
        } else {
          if (task.state !== "owner-gate") {
            corruption(
              "event.gate",
              "terminal owner-gate decision may be recorded only in owner-gate"
            );
          }
          if (!records.some(({ decision }) => decision === "pending")) {
            corruption(
              "event.gate",
              "terminal owner-gate decision requires the pending request first"
            );
          }
          if (records.some(({ decision }) => decision !== "pending")) {
            corruption("event.gate", "owner-gate cycle already has a terminal decision");
          }
        }
        snapshot.ownerGates.push({
          taskId: current.taskId,
          gate: current.gate,
          decision: current.decision,
          receipt: current.receipt,
          verificationEventId: task.verificationEventId,
          at: current.at,
        });
        setTaskUpdated(task, current.at);
        break;
      }
      case "no-frontier-recorded":
        snapshot.noFrontiers.push({
          wayfinder: current.wayfinder,
          receipt: current.receipt,
          at: current.at,
        });
        break;
      case "authority-reconciled":
        applyAuthorityReconciliation(snapshot, current);
        break;
      case "supervisor-provisioned":
        if (snapshot.supervisor) corruption("event", "supervisor is already provisioned");
        if (
          current.marker !==
          `d20-folio-program-supervisor:v1:${snapshot.authority.operatingModel.blob}`
        ) {
          corruption(
            "event.marker",
            "supervisor marker must contain the current operating-model blob"
          );
        }
        snapshot.supervisor = {
          taskTitle: current.taskTitle,
          savedProjectId: current.savedProjectId,
          threadId: current.threadId,
          hostId: current.hostId,
          marker: current.marker,
          automationId: current.automationId,
          automationName: current.automationName,
          cadenceMinutes: current.cadenceMinutes,
          targetThreadId: current.targetThreadId,
          destination: current.destination,
          notificationPolicy: current.notificationPolicy,
          status: current.status,
          receipt: current.receipt,
          at: current.at,
        };
        break;
      case "heartbeat-activated": {
        if (
          !snapshot.supervisor ||
          snapshot.supervisor.threadId !== current.threadId ||
          snapshot.supervisor.targetThreadId !== current.threadId
        ) {
          corruption(
            "event.threadId",
            "heartbeat requires the provisioned supervisor thread"
          );
        }
        if (snapshot.supervisor.automationId !== current.automationId) {
          corruption(
            "event.automationId",
            "heartbeat requires the provisioned automation"
          );
        }
        if (
          snapshot.supervisor.marker !==
          `d20-folio-program-supervisor:v1:${snapshot.authority.operatingModel.blob}`
        ) {
          corruption(
            "event.marker",
            "provisioned marker does not match the current operating-model blob"
          );
        }
        if (snapshot.heartbeat) corruption("event", "heartbeat is already active");
        if (snapshot.tasks.some(({ activeLease }) => activeLease !== null)) {
          corruption("event", "heartbeat handoff requires zero active leases");
        }
        const inFlight = snapshot.tasks.find(({ state }) =>
          ["leased", "executing", "review", "verification", "owner-gate"].includes(state)
        );
        if (inFlight) {
          corruption(
            "event",
            `heartbeat handoff requires quiescent tasks; ${inFlight.charter.id} is ${inFlight.state}`
          );
        }
        if (current.finalMainSha !== snapshot.authority.mainSha) {
          corruption("event.finalMainSha", "does not match the current final main SHA");
        }
        if (
          !sameAuthorityReference(current.statusOwner, snapshot.authority.statusOwner)
        ) {
          corruption("event.statusOwner", "does not match the current status owner");
        }
        if (
          !sameAuthorityReferenceSet(
            current.repositoryLeaseOwners,
            snapshot.authority.repositoryLeaseOwners
          )
        ) {
          corruption(
            "event.repositoryLeaseOwners",
            "does not match the current repository lease owner set"
          );
        }
        snapshot.heartbeat = {
          automationId: current.automationId,
          threadId: current.threadId,
          finalMainSha: current.finalMainSha,
          statusOwner: structuredClone(current.statusOwner),
          repositoryLeaseOwners: structuredClone(current.repositoryLeaseOwners),
          rebuildProof: current.rebuildProof,
          cleanupPendingProof: current.cleanupPendingProof,
          receipt: current.receipt,
          at: current.at,
        };
        snapshot.currentWriter = {
          kind: "supervisor-thread",
          id: current.threadId,
        };
        break;
      }
      case "cleanup-recorded": {
        const task = taskById(snapshot, current.taskId);
        if (task.state !== "integrated" && task.state !== "retired") {
          corruption("event.taskId", "cleanup requires integrated or retired state");
        }
        if (task.activeLease) {
          corruption("event.cleanup", "cleanup requires the active lease to be closed");
        }
        if (current.remoteProof === null && current.recoveryProof === null) {
          corruption("event.cleanup", "cleanup requires remote or recovery proof");
        }
        if (!sameValues(current.removed, task.charter.cleanup.removal)) {
          corruption(
            "event.removed",
            "must exactly match the charter cleanup removal rule"
          );
        }
        if (task.cleanup) corruption("event.cleanup", "cleanup is already recorded");
        task.cleanup = {
          removed: [...current.removed],
          remoteProof: current.remoteProof,
          recoveryProof: current.recoveryProof,
        };
        setTaskUpdated(task, current.at);
        break;
      }
      case "bootstrap":
        corruption("event.type", "second bootstrap is forbidden");
    }
    snapshot.lastEventSeq = current.seq;
    snapshot.updatedAt = current.at;
    snapshot.wip = wipForTasks(snapshot.tasks);
    enforceProjectionSemantics(snapshot, `ledger[${current.seq - 1}]`);
  }

  enforceProjectionSemantics(snapshot, "snapshot");
  const result = { snapshot, leases: projectLeaseFile(snapshot) };
  validateSnapshot(result.snapshot);
  validateLeaseFile(result.leases);
  return result;
}
