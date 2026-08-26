# Program Supervisor Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the persistent, reconstructible d20 Folio Program Supervisor control plane and activate its 30-minute heartbeat without weakening any product, visual, licensing, live-user, or deployment gate.

**Architecture:** Repository code owns validation, reconstruction, worktree placement, and durable program authority. Mutable runtime state lives outside Git at `~/Workspace/Codex/d20-folio-program/` as validated snapshots, repository-authority lease pointers, and an append-only event ledger. One clean detached control worktree at `~/Workspace/Codex/d20-folio-program-control` carries the exact integrated command surface without changing the deliberately untouched shared checkout. One dedicated Codex supervisor task is anchored to the stable saved project, never to a disposable writer worktree, and its thread heartbeat reconciles durable state with Git and bounded collaboration subagents through the control worktree; neither chat nor the task checkout becomes a second source of product truth.

**Tech Stack:** Node.js 24.16.0, TypeScript 6, Node filesystem APIs, Vitest 4, Bash, Just, Codex thread heartbeat automation.

**Spec:** `docs/plans/2026-08-25-agent-first-operating-model-design.md`

## Global Constraints

- The owner acts as product manager; agents decide implementation details and ask only about product intent, taste, cost/privacy, external authority, or irreversible outcomes.
- The supervisor runs every 30 minutes while active, with at most two writers and one read-only evaluator.
- The persistent supervisor is one dedicated user-visible Codex task; separate user-owned tasks are never created for its bounded writers.
- The Task 6 bootstrap controller is the sole external-runtime writer while the heartbeat is `PAUSED`. It appends `heartbeat-activated` only as its final mutation after all repository reconciliation, lease release, and an evidence-backed cleanup-pending receipt; from that event onward the dedicated supervisor is the sole writer, every bootstrap/controller retry is read-only, and the supervisor performs the deferred checkout cleanup only after proving the controller is idle/detached.
- Worktrees live physically under `~/Workspace/Codex`, start from freshly fetched `origin/main`, and contain both root and standalone Functions dependencies.
- The shared checkout may remain behind `origin/main`; neither a push nor the supervisor mutates it. Supervisor and manual adapters run only from the exact integrated control worktree or another worktree proven equal to fresh `origin/main`.
- The pinned toolchain is Node 24.16.0 and pnpm 11.2.2; an ambient Node version is never accepted as evidence.
- The public repository and private content pack use the twin-change protocol whenever a public seam affects private composition.
- Visual changes stop at the screenshot approval gate; deploy, release, publication, billing, privacy, and destructive owner gates remain owner-triggered.
- No task state may claim progress without a lease, commit, verification receipt, or explicit blocker evidence.
- Every repository commit, including preflight and review-fix commits, carries its own Changeset and reconciles the owner of every changed fact.
- Before every later repository edit, review-fix commit, rebase, activation-status edit, or integration attempt, prove the Task 0 repository lease is still active with more than two hours remaining. While it is active, an evidence-backed renewal may be the only intervening repository mutation and must carry its own Changeset and independent review; if it has expired, stop, repeat the full worktree/writer inventory, and reacquire it in a reviewed preflight commit before touching any other owned path.
- No new plugin or skill is installed merely because it is available; retained tools must have one non-overlapping purpose and justified context/permission cost.

**Scope boundary:** This F0 plan implements the durable supervisor bootstrap, runtime state, worktree safety, and initial program authority. Dependency-alert remediation, test-portfolio reduction, release/rollback hardening, and the skill/plugin decision ledger remain separate Foundation slices with their own plans and review gates; completing F0 does not claim the entire Foundation lane is closed.

---

## File Map

- `scripts/program-supervisor/worktree.ts` — resolve and validate the one legal local task root and task worktree path.
- `scripts/program-supervisor/bootstrap-worktree.sh` — install both package trees with the exact pinned Node runtime.
- `scripts/program-supervisor/state.ts` — runtime-state types, validation, transition rules, and deterministic projection from the append-only event ledger.
- `scripts/program-supervisor/runtime.ts` — atomic filesystem loading, initialization, event append, cache rebuild, and verification.
- `scripts/program-supervisor/cli.ts` — `init`, `validate`, `append`, and `rebuild` command boundary.
- `tests/unit/program-supervisor-worktree.test.ts` — path and sync-location safety contracts.
- `tests/unit/program-supervisor-state.test.ts` — schema, transition, replay, and corruption regressions.
- `tests/unit/program-supervisor-runtime.test.ts` — real temporary-filesystem atomicity and rebuild regressions.
- `justfile` — repository adapter for worktree creation/removal through the validated task root and pinned bootstrap.
- `package.json` — stable runtime-state command aliases.
- `CLAUDE.md` (`AGENTS.md` symlink) — route agents to the approved operating model and current program status owner.
- `PROGRESS.md` — link to active execution control without duplicating transient branch/lease facts.
- `docs/PROGRAM_STATUS.md` — compact current execution status, authority manifest, frontiers, gates, and delete zone.
- `docs/WORKTREES.md` — reconcile the runbook with the actual `~/Workspace/Codex` placement and bootstrap.
- `docs/TEST_PORTFOLIO.md` — record only the shared-path lease needed by this slice.
- `.changeset/program-supervisor-preflight.md` — preflight lease-acquisition summary for Task 0.
- `.changeset/program-supervisor-worktree.md` — worktree-placement/bootstrap summary for Task 1.
- `.changeset/program-supervisor-state.md` — state-machine summary for Task 2.
- `.changeset/program-supervisor-runtime.md` — runtime/CLI summary for Task 3.
- `.changeset/program-supervisor-authority.md` — repository-authority summary for Task 4.
- `.changeset/program-supervisor-activation.md` — post-activation status and lease reconciliation for Task 6.

### Task 0: Acquire the repository leases before implementation edits

**Files:**

- Modify: `docs/TEST_PORTFOLIO.md`
- Create: `.changeset/program-supervisor-preflight.md`

**Interfaces:**

- Consumes: the current shared-path registry, exact Foundation/K1/B00 worktree identities, their complete dirty-path sets, and the clean private-pack checkout identity.
- Produces: one evidence-backed Foundation lease group acquired before any Task 1–4 implementation path is edited, with holder, branch, worktree, base SHA, owned paths, expiry, conflict check, handoff rule, and focused proof.

- [ ] **Step 1: Prove identities and disjoint ownership read-only**

Fetch public and private remotes without changing a checkout. Record the Foundation base/head/branch/worktree/common-dir, the K1 and B00 heads plus `origin/main...HEAD` paths, and the private checkout's branch/head/clean status. Query the active Codex/subagent inventory as well as Git: fail if either retained product worktree is dirty or currently has a writer/rebase in flight. Prove K1 is disjoint from `justfile`, `package.json`, `CLAUDE.md`, `PROGRESS.md`, `docs/WORKTREES.md`, `docs/PROGRAM_STATUS.md`, `docs/TEST_PORTFOLIO.md`, and `scripts/program-supervisor/**`.

B00's committed candidate is known to overlap `package.json` and `PROGRESS.md`; that historical diff is not itself an active lease. Record its exact clean HEAD as frozen and serialize it behind F0: no B00 edit, rebase, writer lease, or integration may begin while F0 owns either shared path. F0 may then acquire those paths exclusively. The B00 handoff requires a fresh rebase onto the final F0 `origin/main`, explicit reconciliation of both overlapping files (and its related `pnpm-lock.yaml` change), a new review, and all visual gates; it may never overwrite the integrated F0 authority. Any additional overlap, dirty state, or active writer that cannot be serialized fails closed. Never infer disjointness from a dated report.

- [ ] **Step 2: Acquire the exact Foundation lease group**

In `docs/TEST_PORTFOLIO.md`, reconcile the existing Justfile lease and add one compact `F0` group covering only the paths above. Record:

- holder `program-supervisor-foundation`;
- absolute worktree and `feat/program-supervisor-foundation` branch;
- exact fresh `origin/main` base SHA;
- UTC acquisition and expiry no more than 24 hours later;
- current K1/B00/private heads, K1's disjoint-path receipt, and B00's frozen-head/serialized-overlap receipt;
- handoff: release only after remote integration proof or an evidence-backed blocker/recovery disposition, then require B00 to rebase and reconcile the frozen overlap before it can receive a writer lease.

This acquisition commit is the first implementation mutation. It does not claim a runtime lease before the runtime exists.

- [ ] **Step 3: Verify and commit the preflight authority**

Run the exact pinned check before the repository bootstrap exists:

```bash
/Users/salvatoredicara/.asdf/installs/nodejs/24.16.0/bin/node /Users/salvatoredicara/.asdf/installs/nodejs/24.16.0/lib/node_modules/corepack/dist/corepack.js pnpm exec prettier --check docs/TEST_PORTFOLIO.md .changeset/program-supervisor-preflight.md
git diff --check
```

Add an empty-package Changeset stating “Acquire the Program Supervisor Foundation shared-path lease before implementation,” and commit `docs: acquire supervisor foundation lease`. The task-scoped independent review must pass before Task 1 begins.

### Task 1: Enforce legal worktree placement and the pinned bootstrap

**Files:**

- Create: `scripts/program-supervisor/worktree.ts`
- Create: `scripts/program-supervisor/bootstrap-worktree.sh`
- Create: `tests/unit/program-supervisor-worktree.test.ts`
- Modify: `justfile`
- Modify: `docs/WORKTREES.md`
- Create: `.changeset/program-supervisor-worktree.md`

**Interfaces:**

- Consumes: a physical home directory, repository name, and lowercase task slug.
- Produces: `resolveTaskRoot(homeDir: string): string`, `assertSafeTaskRootCandidate(root: string): string`, `assertPhysicalTaskRoot(root: string): string`, `resolveWorktreePath(homeDir: string, project: string, slug: string): string`, and an idempotent bootstrap executable that exits non-zero unless Node 24.16.0 and pnpm 11.2.2 actually execute both installers.

- [ ] **Step 1: Write the failing path-contract tests**

```ts
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSafeTaskRootCandidate,
  assertPhysicalTaskRoot,
  resolveTaskRoot,
  resolveWorktreePath,
} from "../../scripts/program-supervisor/worktree";

describe("program supervisor worktree coordinates", () => {
  it("places every task below the stable Codex workspace", () => {
    expect(resolveTaskRoot("/Users/owner")).toBe("/Users/owner/Workspace/Codex");
    expect(resolveWorktreePath("/Users/owner", "d20-folio", "automation-k2")).toBe(
      "/Users/owner/Workspace/Codex/d20-folio-automation-k2"
    );
  });

  it.each(["../escape", "UI Wave", "", "a/b", ".hidden"])(
    "rejects unsafe slug %j",
    (slug) => {
      expect(() => resolveWorktreePath("/Users/owner", "d20-folio", slug)).toThrow(
        "safe lowercase slug"
      );
    }
  );

  it("rejects a logical task root symlinked into Documents", () => {
    const home = mkdtempSync(join(tmpdir(), "d20-home-"));
    try {
      mkdirSync(join(home, "Documents", "Codex"), { recursive: true });
      mkdirSync(join(home, "Workspace"), { recursive: true });
      symlinkSync(join(home, "Documents", "Codex"), join(home, "Workspace", "Codex"));
      expect(() => assertPhysicalTaskRoot(resolveTaskRoot(home))).toThrow(
        "synchronized directory"
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("rejects an absent task root below a symlinked ancestor before mkdir", () => {
    const home = mkdtempSync(join(tmpdir(), "d20-home-"));
    try {
      mkdirSync(join(home, "Documents", "Workspace"), { recursive: true });
      symlinkSync(join(home, "Documents", "Workspace"), join(home, "Workspace"));
      expect(() => assertSafeTaskRootCandidate(resolveTaskRoot(home))).toThrow(
        "synchronized directory"
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run: `/Users/salvatoredicara/.asdf/installs/nodejs/24.16.0/bin/node /Users/salvatoredicara/.asdf/installs/nodejs/24.16.0/lib/node_modules/corepack/dist/corepack.js pnpm exec vitest run --project fast tests/unit/program-supervisor-worktree.test.ts`

Expected: FAIL because `scripts/program-supervisor/worktree.ts` does not exist.

- [ ] **Step 3: Implement the minimal path authority**

```ts
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const SAFE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FORBIDDEN = [
  `${sep}Documents${sep}`,
  `${sep}Library${sep}Mobile Documents${sep}`,
  `${sep}Dropbox${sep}`,
  `${sep}OneDrive${sep}`,
  `${sep}iCloud Drive${sep}`,
];

function assertNotSynchronized(path: string): void {
  if (FORBIDDEN.some((segment) => `${path}${sep}`.includes(segment))) {
    throw new Error(`Task root resolves inside a synchronized directory: ${path}`);
  }
}

function safeName(value: string): string {
  if (!SAFE_NAME.test(value)) {
    throw new Error(`Expected a safe lowercase slug, received ${JSON.stringify(value)}`);
  }
  return value;
}

export function resolveTaskRoot(homeDir: string): string {
  const root = resolve(homeDir, "Workspace", "Codex");
  return root;
}

export function assertSafeTaskRootCandidate(root: string): string {
  const logical = resolve(root);
  let ancestor = logical;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const physicalAncestor = realpathSync(ancestor);
  const projected = join(physicalAncestor, relative(ancestor, logical));
  assertNotSynchronized(projected);
  if (physicalAncestor !== ancestor) {
    throw new Error(`Task root has a symlinked ancestor: ${ancestor}`);
  }
  return logical;
}

export function assertPhysicalTaskRoot(root: string): string {
  const physical = realpathSync(root);
  assertNotSynchronized(physical);
  if (physical !== resolve(root)) {
    throw new Error(`Task root must be the stable physical path, not a symlink: ${root}`);
  }
  return physical;
}

export function resolveWorktreePath(
  homeDir: string,
  project: string,
  slug: string
): string {
  return join(resolveTaskRoot(homeDir), `${safeName(project)}-${safeName(slug)}`);
}
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `/Users/salvatoredicara/.asdf/installs/nodejs/24.16.0/bin/node /Users/salvatoredicara/.asdf/installs/nodejs/24.16.0/lib/node_modules/corepack/dist/corepack.js pnpm exec vitest run --project fast tests/unit/program-supervisor-worktree.test.ts`

Expected: PASS with 8 cases.

- [ ] **Step 5: Add the exact-runtime bootstrap**

Create `scripts/program-supervisor/bootstrap-worktree.sh` with this behavior:

```bash
#!/usr/bin/env bash
set -euo pipefail

required_node="$(awk '$1 == "nodejs" { print $2 }' .tool-versions)"
[ "$required_node" = "24.16.0" ] || { echo "Unexpected Node pin: $required_node" >&2; exit 1; }

if command -v asdf >/dev/null 2>&1; then
  node_root="$(asdf where nodejs "$required_node")"
  node_bin="$node_root/bin/node"
  corepack_js="$node_root/lib/node_modules/corepack/dist/corepack.js"
  npm_cli="$node_root/lib/node_modules/npm/bin/npm-cli.js"
else
  node_bin="$(command -v node)"
  corepack_js="$(dirname "$node_bin")/../lib/node_modules/corepack/dist/corepack.js"
  npm_cli="$(dirname "$node_bin")/../lib/node_modules/npm/bin/npm-cli.js"
fi

actual_node="$($node_bin --version)"
[ "$actual_node" = "v$required_node" ] || { echo "Expected Node v$required_node, got $actual_node" >&2; exit 1; }

required_pnpm="$($node_bin -p "require('./package.json').packageManager")"
[ "$required_pnpm" = "pnpm@11.2.2" ] || { echo "Unexpected pnpm pin: $required_pnpm" >&2; exit 1; }
tool_shim_dir="$(mktemp -d "${TMPDIR:-/tmp}/d20-pinned-tools.XXXXXX")"
cleanup_tools() { find "$tool_shim_dir" -depth -delete; }
trap cleanup_tools EXIT
"$node_bin" "$corepack_js" enable --install-directory "$tool_shim_dir" pnpm
export PATH="$tool_shim_dir:$(dirname "$node_bin"):$PATH"
actual_pnpm="$(pnpm --version)"
[ "$actual_pnpm" = "11.2.2" ] || { echo "Expected pnpm 11.2.2, got $actual_pnpm" >&2; exit 1; }

if [ "${1:-}" = "--run" ]; then
  shift
  "$@"
  exit
fi

pnpm install --silent
"$node_bin" "$npm_cli" --prefix functions ci --prefer-offline --no-audit
git config core.hooksPath .githooks
```

Run `chmod 0755 scripts/program-supervisor/bootstrap-worktree.sh`; the executable bit is part of the committed bootstrap contract.

- [ ] **Step 6: Route `just wt-new` and `just wt-rm` through the one task root**

Declare the recipes as `wt-new $slug $kind="feat"` and `wt-rm $slug` so Just exports parameters instead of interpolating untrusted text into the shebang body. Validate `kind` against exactly `feat | fix | chore | docs | refactor`, then replace the destination calculation in both recipes with the physical home path and typed resolver:

```bash
home_dir="$(cd && pwd -P)"
slug_value="$slug"
kind_value="$kind"
case "$kind_value" in feat|fix|chore|docs|refactor) ;; *) echo "unsafe branch kind" >&2; exit 1 ;; esac
candidate="$(scripts/program-supervisor/bootstrap-worktree.sh --run node scripts/program-supervisor/worktree.ts candidate "$home_dir")"
mkdir -p "$candidate"
tasks_root="$(scripts/program-supervisor/bootstrap-worktree.sh --run node scripts/program-supervisor/worktree.ts root "$home_dir")"
dest="$(scripts/program-supervisor/bootstrap-worktree.sh --run node scripts/program-supervisor/worktree.ts path "$home_dir" "$project" "$slug_value")"
branch="$kind_value/$slug_value"
```

The `candidate` command validates the nearest existing physical ancestor before `mkdir`; `root` then proves the created root itself is physical and unsynchronized. No `{{slug}}` or `{{kind}}` text appears inside shell code. This follows the [official Just exported-argument boundary](https://just.systems/man/en/avoiding-argument-splitting.html) and remains safe for quotes or shell metacharacters before the typed lowercase-slug rejection.

After `git worktree add`, invoke `scripts/program-supervisor/bootstrap-worktree.sh` from the new worktree. Replicate the content-pack link as the absolute physical target returned by `cd "$main_root/content-pack" && pwd -P`; never reuse a relative link whose meaning changes under `~/Workspace/Codex`. The recipe is a manual/same-thread adapter invoked only from `d20-folio-program-control` or another worktree whose HEAD was just proven equal to fresh `origin/main`; explicitly document that pushing this change does not update the shared checkout and that its stale recipe must never be invoked.

- [ ] **Step 7: Add the CLI boundary to `worktree.ts`**

```ts
if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, homeDir, project, slug] = process.argv.slice(2);
  if (!homeDir) {
    throw new Error(
      "Use: worktree.ts candidate HOME | root HOME | path HOME PROJECT SLUG"
    );
  }
  const candidate = assertSafeTaskRootCandidate(resolveTaskRoot(homeDir));
  const physicalRoot =
    command === "candidate" ? candidate : assertPhysicalTaskRoot(candidate);
  const value =
    command === "candidate" || command === "root"
      ? physicalRoot
      : command === "path" && project && slug
        ? join(physicalRoot, `${safeName(project)}-${safeName(slug)}`)
        : undefined;
  if (!value) {
    throw new Error(
      "Use: worktree.ts candidate HOME | root HOME | path HOME PROJECT SLUG"
    );
  }
  process.stdout.write(`${value}\n`);
}
```

- [ ] **Step 8: Prove the resolver and wrapper in the current isolated worktree**

```bash
scripts/program-supervisor/bootstrap-worktree.sh --run node scripts/program-supervisor/worktree.ts path "$(cd && pwd -P)" d20-folio foundation-bootstrap-probe
scripts/program-supervisor/bootstrap-worktree.sh --run node --version
scripts/program-supervisor/bootstrap-worktree.sh --run pnpm --version
test -d node_modules
test -d functions/node_modules
```

Expected: the resolver prints `/Users/salvatoredicara/Workspace/Codex/d20-folio-foundation-bootstrap-probe`, Node reports `v24.16.0`, pnpm reports `11.2.2`, and both current dependency trees exist.

- [ ] **Step 9: Reconcile the runbook and Changeset**

Update every placement example in `docs/WORKTREES.md` to `~/Workspace/Codex/d20-folio-SLUG`, document the pinned bootstrap, and add:

```md
---
---

Pin Program Supervisor worktrees to the stable Codex workspace and exact project toolchain.
```

- [ ] **Step 10: Commit the independently testable bootstrap**

```bash
git add scripts/program-supervisor/worktree.ts scripts/program-supervisor/bootstrap-worktree.sh tests/unit/program-supervisor-worktree.test.ts justfile docs/WORKTREES.md .changeset/program-supervisor-worktree.md
git commit -m "build: pin supervisor worktree bootstrap"
```

- [ ] **Step 11: Prove a full clean bootstrap twice before task review**

From the committed Task 1 HEAD, first prove `/Users/salvatoredicara/Workspace/Codex/d20-folio-foundation-bootstrap-preintegration-probe` is absent. Use raw `git worktree add --detach` to create it, then prove the newly registered worktree resolves to this repository's exact Git common-dir. Link the physical private content-pack target, run the new bootstrap twice, and prove both root and Functions dependencies, hooks, Node `v24.16.0`, pnpm `11.2.2`, clean Git status, and the absolute pack link. Remove only this verified clean probe through `git worktree remove`. If either run fails, use systematic debugging and a new fix commit with its own Changeset, then repeat the full two-run proof. The post-integration recipe boundary is still exercised from program-control in Task 6.

### Task 2: Define and replay the durable control-state model

**Files:**

- Create: `scripts/program-supervisor/state.ts`
- Create: `tests/unit/program-supervisor-state.test.ts`
- Create: `.changeset/program-supervisor-state.md`

**Interfaces:**

- Consumes: untrusted JSON/NDJSON runtime values whose first record is a complete bootstrap event containing the authority manifest, full task charters, and active leases.
- Produces: `validateSnapshot`, `validateLeaseFile`, `parseEvents`, `validateEventInput`, `validateTransition`, and `replayEvents` with deterministic `{ snapshot, leases }` output, mechanical two-writer/one-evaluator enforcement, and precise corruption errors.

- [ ] **Step 1: Write failing schema and replay tests**

Build one complete `bootstrapFixture()` whose three initial charters contain every required field listed below and whose authority manifest pins the operating model, both product Wayfinders, test-portfolio roadmap, readiness baseline, and status owner by path plus blob. Tests must prove:

- a missing charter field fails validation;
- `task-created` adds a fully chartered successor after bootstrap;
- two disjoint writer leases and one read-only evaluator lease replay, while a third writer, second evaluator, or overlapping writer path is rejected;
- `leases.json` projection contains only task ID, expiry, and repository authority pointer; overlap is derived from the referenced charter, and any copied path list or mismatched lease ID/path/blob/SHA is rejected;
- `lease-renewed` is accepted only before expiry for the same holder/role and unchanged globally reconciled repository lease pointer, extends to a later bounded expiry, and preserves the WIP counts. If the owner document changed, an explicit preceding `authority-reconciled` event must atomically advance the manifest, every matching charter, every active lease, and the derived cache before renewal;
- `lease-expired` is accepted only at or after its recorded expiry and `lease-released` closes only an active lease; expiry atomically removes the lease and moves a `leased`/`executing` task to `blocked-with-evidence` with the supplied preservation receipt, while a task already in another valid evidenced state keeps that state;
- `dispatch-recorded` requires the task's active lease and moves `leased → executing`; an unevidenced direct executing transition fails;
- task/head reconciliation, evidence, ruling, owner-gate, no-frontier, authority reconciliation, and cleanup events project deterministically;
- cleanup fails before `integrated`/`retired` or without remote/recovery proof;
- sequence numbers are contiguous from one and a second bootstrap is rejected.

- [ ] **Step 2: Run and confirm the missing-module failure**

Run: `scripts/program-supervisor/bootstrap-worktree.sh --run pnpm exec vitest run --project fast tests/unit/program-supervisor-state.test.ts`

Expected: FAIL because `state.ts` does not exist.

- [ ] **Step 3: Implement the explicit state machine and validators**

```ts
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
```

Define one `TaskCharter` with required `outcome`, pinned `authority[]`, `dependencies`, `ownership` (repository, worktree, branch, base/head SHA, normalized paths), observable `acceptance[]`, independent `review`, explicit `ownerGate`, and `cleanup` proof/removal rule. Repository charters and `docs/TEST_PORTFOLIO.md` remain the only path-ownership authorities. A lease event names task/holder/agent identity, `writer | evaluator` role, read-only flag, acquisition/expiry timestamps, and an `authorityPointer` containing only repository, owner-document path, repository lease ID, last reconciled owner blob, and last reconciled main SHA—never a copied ownership-path list.

Project `state/leases.json` through a separate narrow `LeaseCacheEntry` containing only `taskId`, `expiresAt`, and that exact authority pointer, as required by the operating model. Role/holder/read-only execution facts remain reconstructible in the ledger and current task projection; overlap checks dereference the named task charter's normalized ownership paths and verify the pointer against its pinned repository lease. The cache is not a second ownership model.

Allow only forward lifecycle edges, review fix-backs to `executing`, an evidence-backed `verification → executing` edge only for failed verification or a changed integration base, and evidence-backed blocker/owner-gate edges. Require a non-empty active lease for `leased` and `executing`; require receipts for `review`, `verification`, `integrated`, `retired`, and `blocked-with-evidence`; require the named owner gate for `owner-gate`. Validate `schemaVersion: 1` on every event and both derived state files, all SHAs/blobs as 40 lowercase hex characters, timestamps as round-trippable ISO strings, unique IDs, exact repository pointers, and contiguous event sequence numbers beginning at one.

Event 1 is the sole `bootstrap`. The later discriminated union is exactly: `task-created`, `task-reconciled`, `lease-acquired`, `lease-renewed`, `lease-released`, `lease-expired`, `dispatch-recorded`, `state-transitioned`, `evidence-recorded`, `ruling-recorded`, `owner-gate-recorded`, `no-frontier-recorded`, `authority-reconciled`, `supervisor-provisioned`, `heartbeat-activated`, and `cleanup-recorded`. A renewal is valid only while its lease is active, keeps task/holder/role and the complete globally reconciled repository pointer unchanged, carries the renewal proof, and advances to a later bounded expiry. Only `authority-reconciled` may advance repository owner blob/SHA identity, atomically across the manifest, every matching charter, every active lease, and the derived cache; a changed owner document therefore requires that explicit event before renewal. Expiry carries a non-empty preservation receipt and, in the same projection that removes the lease, changes a `leased` or `executing` task to `blocked-with-evidence`; review, verification, owner-gate, integrated, retired, and already-blocked tasks retain their valid evidenced state. A `verification → executing` fix-back requires an exact failed-gate or changed-base receipt and is followed by `task-reconciled` before review resumes. There is no second `integrated` event type: integration is one evidenced `state-transitioned` edge.

- [ ] **Step 4: Implement deterministic projection**

`replayEvents(events)` derives both caches from event 1, applies only validated later events, requires each transition's `from` value to match the reconstructed task, and updates `authority.mainSha`, authority blobs, task repository pointers/heads, `updatedAt`, and `lastEventSeq` without consulting wall-clock time, caches, or Git. Lease, renewal, expiry, and dispatch events update the task projection and narrow lease cache atomically. Count only acquired, unreleased, unexpired lease events; reject more than two writers, more than one evaluator, any evaluator that is not read-only, and overlaps between the normalized ownership paths dereferenced from their task charters. Reject any lease whose owner-document path/ID/blob/SHA pointer does not equal the task's pinned repository authority. An `authority-reconciled` event names every changed authority path/blob and the new main SHA; when it includes the active lease-owner document, the same projection advances that lease pointer's reconciled blob/SHA or rejects the event. Expiry is event-driven rather than inferred from the current clock and can never leave a `leased`/`executing` task without a lease. `task-created` supports every future Automation-first, Tactical Codex, or Foundation slice without changing the schema; `task-reconciled` updates an existing task only with exact Git/worktree evidence.

- [ ] **Step 5: Run the focused tests and typecheck**

```bash
scripts/program-supervisor/bootstrap-worktree.sh --run pnpm exec vitest run --project fast tests/unit/program-supervisor-state.test.ts
scripts/program-supervisor/bootstrap-worktree.sh --run pnpm typecheck
```

Expected: all focused cases PASS and TypeScript reports no errors.

- [ ] **Step 6: Commit the pure state model**

Add `.changeset/program-supervisor-state.md`:

```md
---
---

Model and validate reconstructible Program Supervisor task, lease, and event state.
```

```bash
git add scripts/program-supervisor/state.ts tests/unit/program-supervisor-state.test.ts .changeset/program-supervisor-state.md
git commit -m "feat: model reconstructible program state"
```

### Task 3: Add atomic runtime storage and the reconciliation CLI

**Files:**

- Create: `scripts/program-supervisor/runtime.ts`
- Create: `scripts/program-supervisor/cli.ts`
- Create: `tests/unit/program-supervisor-runtime.test.ts`
- Modify: `package.json`
- Create: `.changeset/program-supervisor-runtime.md`

**Interfaces:**

- Consumes: a complete validated bootstrap-event JSON file plus a runtime root containing reconstructible `state/program.json`, `state/leases.json`, and authoritative `ledger/events.ndjson`.
- Produces: `loadRuntime(root)`, `initializeRuntime(root, bootstrapEvent)`, `appendEvent(root, eventWithoutSeqOrTimestamp)`, `rebuildRuntime(root)`, canonical bootstrap fingerprints, plus CLI commands `init`, `validate`, `append`, and `rebuild`.

- [ ] **Step 1: Write the failing real-filesystem tests**

Use `join(mkdtempSync(join(tmpdir(), "d20-program-parent-")), "runtime")` so the runtime root is initially absent, and verify:

```ts
it("initializes, appends, and reconstructs both caches", async () => {
  await initializeRuntime(root, bootstrapEvent);
  await appendEvent(root, transitionEvent);
  const rebuilt = await rebuildRuntime(root);
  expect(rebuilt.snapshot.lastEventSeq).toBe(2);
  expect(rebuilt.snapshot.tasks[0]?.state).toBe("verification");
  expect((await readdir(join(root, "state"))).some((name) => name.includes(".tmp"))).toBe(
    false
  );
});

it("rebuilds a corrupt cache without changing the evidence ledger", async () => {
  await initializeRuntime(root, bootstrapEvent);
  const ledgerPath = join(root, "ledger", "events.ndjson");
  const eventsBefore = await readFile(ledgerPath, "utf8");
  await writeFile(join(root, "state", "program.json"), "{broken", "utf8");
  const rebuilt = await rebuildRuntime(root);
  expect(rebuilt.snapshot.programId).toBe("d20-folio");
  expect(await readFile(ledgerPath, "utf8")).toBe(eventsBefore);
});

it("serializes concurrent appends without duplicate or lost sequences", async () => {
  await initializeRuntime(root, bootstrapEventWithTwoQueuedTasks);
  await Promise.all([
    appendEvent(root, firstLeaseAcquiredInput),
    appendEvent(root, secondLeaseAcquiredInput),
  ]);
  const events = parseEvents(
    await readFile(join(root, "ledger", "events.ndjson"), "utf8")
  );
  expect(events.map(({ seq }) => seq)).toEqual([1, 2, 3]);
});

it("preserves and repairs only a torn final ledger record", async () => {
  await initializeRuntime(root, bootstrapEvent);
  const ledgerPath = join(root, "ledger", "events.ndjson");
  await appendFile(ledgerPath, '{"schemaVersion":1,"seq":2');
  const tornBytes = await readFile(ledgerPath);
  await expect(loadRuntime(root)).rejects.toThrow("recoverable torn tail");
  await rebuildRuntime(root);
  const recovered = await readRecoveredTornLedger(root);
  expect(recovered).toEqual(tornBytes);
  expect(parseEvents(await readFile(ledgerPath, "utf8"))).toHaveLength(1);
});
```

Also test the CLI boundary with a mode-`0o600` bootstrap file containing the complete authority manifest, all three full Task 2 charters, their exact states/receipts, and the active F0 lease. Prove initialization rejects a partial charter, a non-`0o600` file, and any supplied `seq`/`at`; a retry validates the complete canonical bootstrap identity; changing one nested authority blob, acceptance criterion, repository pointer, lease path, receipt, or holder makes `validate --expect-bootstrap-file` fail. The same semantic JSON with different harmless whitespace has the same canonical fingerprint.

- [ ] **Step 2: Run and confirm the missing-module failure**

Run: `scripts/program-supervisor/bootstrap-worktree.sh --run pnpm exec vitest run --project fast tests/unit/program-supervisor-runtime.test.ts`

Expected: FAIL because `runtime.ts` does not exist.

- [ ] **Step 3: Implement append-only authority, exclusive writes, and recoverable caches**

`initializeRuntime` builds the complete runtime in a unique sibling staging directory, creates `state/`, `ledger/`, `handoffs/`, `evidence/`, and `recovery/` with mode `0o700`, writes/fsyncs all `0o600` files and directories, then atomically renames that directory to the previously absent root and fsyncs the parent. It canonicalizes the fully validated bootstrap input, records its SHA-256 fingerprint in the snapshot, and preserves the canonical bytes at `evidence/bootstrap-input-<fingerprint>.json`; this immutable identity covers every authority, charter, state, receipt, worktree/repository pointer, and lease field rather than a selected subset. Two initializers cannot both win; the root is either absent or complete. A crash-injection test immediately before rename proves retry succeeds without adopting partial staging. Abandoned staging directories are non-authoritative recovery evidence, surfaced for later evidence-backed cleanup only after their PID is absent.

Every later public read or write acquires `root/.write-lock` with exclusive-create semantics. The lock contains schema version, PID, and acquisition time; acquisition retries for a bounded interval, reports a live owner precisely, and may recover a lock older than 30 minutes only when that PID is provably absent. Recover stale lock metadata into `recovery/` before retrying, and always release the live lock in `finally`.

Assign the next event sequence and current UTC timestamp only while holding that lock; callers never supply either field. Write each cache to a sibling `.<basename>.<pid>.tmp` with mode `0o600`, `fsync`, rename, then `fsync` the directory. Append opens `events.ndjson` with `O_APPEND`, validates the existing sequence, performs one newline-terminated write, `fsync`s, closes, replays the ledger, and refreshes both caches.

`loadRuntime` replays the ledger and rejects cache drift. A parse failure is automatically recoverable only when every newline-terminated record is valid and the sole invalid bytes are a non-empty final tail. `rebuildRuntime` first hard-links the original ledger into `recovery/events-torn-<sha256>.ndjson`, fsyncs that directory, atomically replaces the active ledger with the exact valid prefix, and fsyncs the ledger directory; it then rebuilds both caches. It never silently truncates, loses, or overwrites the original bytes. Invalid middle records, sequence gaps, or conflicting recovery hashes fail closed. Tests inject failure before initialization rename and a torn append, then prove original-byte recovery, valid-prefix replay, and continued sequence assignment.

- [ ] **Step 4: Implement the CLI with a stable default root and explicit initialization contract**

Resolve the default root through Task 1's validated physical task root and append `d20-folio-program`; never trust a logical `homedir()` join that can traverse a synchronized symlink. Allow `--root` only for isolated tests or an exact validated absolute operational path. Both input files must be regular, non-symlink mode-`0o600` files. The command interface is:

```text
init --root ROOT --bootstrap-file JSON_FILE
validate --root ROOT [--expect-bootstrap-file JSON_FILE]
append --root ROOT --event-file JSON_FILE
rebuild --root ROOT
```

`init` reads one untrusted bootstrap-event body without `seq`/`at`, validates every authority path/blob, complete charter, state/receipt, repository/worktree pointer, and active lease, then writes event 1. `foundation-f0` starts in `verification`, never `integrated`; K1/B00 use the exact reviewed status and receipts resolved at activation. It refuses a pre-existing runtime root. `append` reads one untrusted later-event body without `seq`/`at`, validates the discriminated payload, and assigns sequence/time inside the lock. `validate` replays the ledger, compares both caches, and—when `--expect-bootstrap-file` is supplied—validates that full input and compares its canonical fingerprint to the immutable bootstrap identity. It prints compact JSON containing schema version, bootstrap fingerprint, current main SHA, task/active-lease counts by role, last event sequence, recovery state, and `valid: true`. `rebuild` performs only the evidence-preserving recovery described above and refreshes both caches after successful replay.

- [ ] **Step 5: Add package aliases**

```json
"program:init": "node scripts/program-supervisor/cli.ts init",
"program:validate": "node scripts/program-supervisor/cli.ts validate",
"program:append": "node scripts/program-supervisor/cli.ts append",
"program:rebuild": "node scripts/program-supervisor/cli.ts rebuild"
```

- [ ] **Step 6: Run focused tests and a corruption detector check**

```bash
scripts/program-supervisor/bootstrap-worktree.sh --run pnpm exec vitest run --project fast tests/unit/program-supervisor-state.test.ts tests/unit/program-supervisor-runtime.test.ts
scripts/program-supervisor/bootstrap-worktree.sh --run pnpm typecheck
```

Expected: all cases PASS, including complete bootstrap-identity adoption/mismatch, atomic-init crash injection, deliberate cache corruption, torn-tail byte preservation and repair, concurrent sequence assignment, lease-renewal/expiry WIP enforcement, and stale-lock recovery.

- [ ] **Step 7: Commit the storage boundary**

Add `.changeset/program-supervisor-runtime.md`:

```md
---
---

Persist, validate, and rebuild Program Supervisor runtime state through an append-only authority.
```

```bash
git add scripts/program-supervisor/runtime.ts scripts/program-supervisor/cli.ts tests/unit/program-supervisor-runtime.test.ts package.json .changeset/program-supervisor-runtime.md
git commit -m "feat: validate supervisor runtime ledger"
```

### Task 4: Establish one repository status owner and initial leases

**Files:**

- Create: `docs/PROGRAM_STATUS.md`
- Modify: `CLAUDE.md`
- Modify: `PROGRESS.md`
- Modify: `docs/TEST_PORTFOLIO.md`
- Create: `.changeset/program-supervisor-authority.md`

**Interfaces:**

- Consumes: integrated operating-model SHA `c476f2b3bf2a1cf9d504d8b1281d6979463f2f97` plus the exact K1 and B00 base/head/dirty-state evidence resolved from their retained worktrees immediately before writing status.
- Produces: a single compact execution-control document linked from the router; `PROGRESS.md` remains product/release status and links rather than duplicating execution facts.

- [ ] **Step 1: Create `docs/PROGRAM_STATUS.md`**

The document must contain:

- a non-self-referential `reconciledThrough` SHA: the exact `origin/main` inspected before authoring this snapshot, never an impossible attempt to embed the status commit's own SHA;
- observed-at timestamp and the authority manifest's exact path/blob pairs for the operating model, both product Wayfinders, test-portfolio roadmap, readiness baseline, test-portfolio/lease owner, and this status path (whose blob is resolved after integration and recorded in runtime);
- the shared checkout's observed HEAD as non-authoritative operational evidence, with an explicit prohibition on running its stale worktree recipe;
- the stable detached `d20-folio-program-control` path and expected exact `origin/main` SHA, initially marked as an activation step until Task 6 creates it;
- complete Foundation, Automation-first, and Tactical Codex charters with outcome, authority, dependencies, ownership, acceptance, independent review, owner gate, cleanup, exact branch/worktree/base/head/state, first lease/receipt, relevant roadmap exit rows, and program-level completion checklist;
- K1 as the first automation frontier and B00 as the first visual frontier;
- K1's required fresh rebase, scoped/whole-branch review, composed/SRD gates, coverage re-ground, and next bounded C1a deterministic spell-command slice;
- B00's required fresh rebase, documented cream-versus-shaded-stone reconciliation, exact-SHA visual/motion rerun, curated normal/200%-zoom matrix, and next bounded A00 shell specimen;
- the B00 screenshot owner gate and the global deployment owner gate;
- the three high dependency findings as the first Foundation security frontier;
- active lease IDs and exact path ownership;
- a delete zone naming completed worktrees and runtime artifacts eligible for cleanup only after integration proof.

Resolve both retained product heads with `git -C <worktree> rev-parse HEAD`, their bases with `git merge-base origin/main HEAD`, and their dirty state with `git status --porcelain`. Resolve every authority blob from the exact tree being documented. Never copy dated heads or blobs if a writer, rebase, or integrated authority has advanced them.

- [ ] **Step 2: Route agents to the two owners**

In `CLAUDE.md`, add the approved operating model to the Constitution/operations routing and add `docs/PROGRAM_STATUS.md` to Status with the narrow description “active agent-program execution control.” State explicitly that agents update this file when a frontier, lease, blocker, owner gate, or integration SHA changes. Replace the stale instruction to run `just wt-new` from the shared checkout: supervisor and manual same-thread worktree adapters run from the clean detached program-control worktree, or another clean worktree whose HEAD has just been proven equal to fresh `origin/main`; the shared checkout remains untouched and is never recipe authority merely because it is on local `main`.

- [ ] **Step 3: Remove duplicate execution claims**

Add one short pointer near the top of `PROGRESS.md` to `docs/PROGRAM_STATUS.md`; do not copy branch or lease rows into `PROGRESS.md`. In `docs/TEST_PORTFOLIO.md`, update the Task 0 F0 lease receipt/state only; do not create a duplicate lease model or change existing risk/test ownership.

- [ ] **Step 4: Run documentation guards**

```bash
git diff --check
scripts/program-supervisor/bootstrap-worktree.sh --run pnpm exec prettier --check CLAUDE.md PROGRESS.md docs/PROGRAM_STATUS.md docs/TEST_PORTFOLIO.md
```

Expected: both commands PASS.

- [ ] **Step 5: Commit the authority routing**

Add `.changeset/program-supervisor-authority.md`:

```md
---
---

Route agents through the approved operating model and one compact current program-status authority.
```

```bash
git add CLAUDE.md PROGRESS.md docs/PROGRAM_STATUS.md docs/TEST_PORTFOLIO.md .changeset/program-supervisor-authority.md
git commit -m "docs: establish program status authority"
```

### Task 5: Review, verify, and integrate the repository control plane

**Files:**

- Review: all branch changes since `c476f2b3bf2a1cf9d504d8b1281d6979463f2f97`
- Update: `docs/PROGRAM_STATUS.md` only if evidence changes during review

**Interfaces:**

- Consumes: the finished Foundation branch based on `c476f2b3bf2a1cf9d504d8b1281d6979463f2f97`.
- Produces: independently reviewed repository tooling and status authority on `origin/main`, ready for the operational bootstrap.

- [ ] **Step 1: Run plan self-review**

Check every section of `docs/plans/2026-08-25-agent-first-operating-model-design.md` against this plan, scan for forbidden placeholder markers and undefined interfaces, and correct any mismatch before review.

- [ ] **Step 2: Run focused verification**

```bash
scripts/program-supervisor/bootstrap-worktree.sh --run pnpm exec vitest run --project fast tests/unit/program-supervisor-worktree.test.ts tests/unit/program-supervisor-state.test.ts tests/unit/program-supervisor-runtime.test.ts
git diff --check origin/main...HEAD
```

- [ ] **Step 3: Rebase first and freeze the review base**

Recheck/renew the Task 0 repository lease under the global rule. Fetch public and private remotes, require the private checkout to be clean on its expected `main`, and record its exact HEAD before any rebase:

```bash
test -z "$(git -C /Users/salvatoredicara/Workspace/d20-folio-content status --porcelain)"
private_head_before="$(git -C /Users/salvatoredicara/Workspace/d20-folio-content rev-parse HEAD)"
test -n "$private_head_before"
```

Rebase the Foundation branch onto fresh `origin/main`. Record that exact public base and candidate HEAD. Resolve `content-pack` to its absolute physical private target and fail if the link is missing, dangling, relative, or points at a different checkout.

- [ ] **Step 4: Request one read-only independent evaluator on the rebased HEAD**

The evaluator checks specification compliance first, then code quality, worktree safety, state corruption/rebuild behavior, owner-gate preservation, content-pack implications, and whether any simpler implementation preserves the same guarantees. Critical or Important findings return to the Foundation writer and require a fresh evaluator pass. Every review-fix commit carries its own Changeset.

- [ ] **Step 5: Run both authoritative public gates and private invariants**

```bash
scripts/program-supervisor/bootstrap-worktree.sh --run just ci
scripts/program-supervisor/bootstrap-worktree.sh --run just ci-srd-only
test -z "$(git -C /Users/salvatoredicara/Workspace/d20-folio-content status --porcelain)"
test "$(git -C /Users/salvatoredicara/Workspace/d20-folio-content rev-parse HEAD)" = "$private_head_before"
```

Expected: composed typecheck/lint/tests/Functions/build and the complete SRD-only lane PASS; the private checkout remains byte-unmodified at the recorded HEAD.

- [ ] **Step 6: Recheck remote freshness, repeat review if needed, and integrate**

```bash
git fetch origin main
git push origin HEAD:main
git ls-remote origin refs/heads/main
```

Immediately before push, recheck/renew the Task 0 repository lease and compare fresh `origin/main` to the exact base seen by the evaluator. If it changed, rebase again, regenerate the whole-branch review package, repeat the independent evaluator and both gates on the new HEAD; never carry an approval across a changed diff. Expected: the remote main SHA exactly equals the reviewed/gated Foundation HEAD and the private HEAD remains unchanged. Do not deploy.

- [ ] **Step 7: Confirm the integrated command surface before operational state exists**

From the exact integrated Foundation worktree, create a temporary parent, leave `<parent>/missing-runtime` absent, and run `scripts/program-supervisor/bootstrap-worktree.sh --run pnpm program:validate -- --root <parent>/missing-runtime`. Confirm the command exits non-zero with a precise missing-ledger error, then delete only that temporary parent. Keep the Foundation worktree until Task 6 records operational activation; do not remove it yet.

### Task 6: Seed, validate, and activate the persistent supervisor

**Files:**

- Create persistent clean worktree: `/Users/salvatoredicara/Workspace/Codex/d20-folio-program-control`
- Create outside Git: `/Users/salvatoredicara/Workspace/Codex/d20-folio-program/state/program.json`
- Create outside Git: `/Users/salvatoredicara/Workspace/Codex/d20-folio-program/state/leases.json`
- Create outside Git: `/Users/salvatoredicara/Workspace/Codex/d20-folio-program/ledger/events.ndjson`
- Create outside Git: `/Users/salvatoredicara/Workspace/Codex/d20-folio-program-bootstrap.json`
- Create through the Codex app: one dedicated local task named `d20 Folio Program Supervisor`, anchored to the stable saved project rather than any disposable worktree
- Update through the Codex app: one idempotently adopted/created heartbeat with the dedicated supervisor task's exact `targetThreadId`
- Modify during paused handoff: `docs/PROGRAM_STATUS.md`
- Modify during paused handoff: `docs/TEST_PORTFOLIO.md`
- Create during paused handoff: `.changeset/program-supervisor-activation.md`

**Interfaces:**

- Consumes: the integrated Foundation SHA, integrated operating-model/status blobs, and exact retained worktree inventory.
- Produces: one clean detached worktree at the exact integrated SHA, a validated reconstructible runtime receipt, one dedicated supervisor task, one active 30-minute heartbeat targeted to it, a separately chartered activation-status task, one final versioned status reconciliation, and typed append-only events containing all identities, proof, authority reconciliation, lease release, and cleanup.

- [ ] **Step 1: Resolve exact integrated authorities**

Read and record:

```bash
git fetch origin main
integrated_main_sha="$(git rev-parse origin/main)"
operating_model_blob="$(git rev-parse origin/main:docs/plans/2026-08-25-agent-first-operating-model-design.md)"
program_status_blob="$(git rev-parse origin/main:docs/PROGRAM_STATUS.md)"
automation_wayfinder_blob="$(git rev-parse origin/main:docs/superpowers/plans/2026-08-25-automation-first-wayfinder.md)"
tactical_wayfinder_blob="$(git rev-parse origin/main:docs/superpowers/plans/2026-08-25-tactical-codex-ui-ux-wayfinder.md)"
test_roadmap_blob="$(git rev-parse origin/main:docs/superpowers/plans/2026-08-25-test-portfolio-reset.md)"
readiness_blob="$(git rev-parse origin/main:docs/superpowers/plans/2026-08-25-g0-automation-readiness.md)"
test_portfolio_blob="$(git rev-parse origin/main:docs/TEST_PORTFOLIO.md)"
printf '%s\n' "$integrated_main_sha" "$operating_model_blob" "$program_status_blob" "$automation_wayfinder_blob" "$tactical_wayfinder_blob" "$test_roadmap_blob" "$readiness_blob" "$test_portfolio_blob"
```

Expected: all eight values are 40-character lowercase SHAs and `origin/main` contains the completed Foundation branch. These are the initial authority manifest; no path/blob pair is omitted.

- [ ] **Step 2: Create the exact integrated program-control worktree without the stale recipe**

Use Git's common worktree metadata from the Foundation worktree, not any tracked file in the stale shared checkout:

```bash
control_worktree=/Users/salvatoredicara/Workspace/Codex/d20-folio-program-control
expected_control_worktree="$(scripts/program-supervisor/bootstrap-worktree.sh --run node scripts/program-supervisor/worktree.ts path "$(cd && pwd -P)" d20-folio program-control)"
test "$expected_control_worktree" = "$control_worktree"
foundation_common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
if [ ! -e "$control_worktree" ]; then
  git worktree add --detach "$control_worktree" "$integrated_main_sha"
else
  test -d "$control_worktree"
  control_common_dir="$(git -C "$control_worktree" rev-parse --path-format=absolute --git-common-dir)"
  test "$(cd "$control_common_dir" && pwd -P)" = "$(cd "$foundation_common_dir" && pwd -P)"
  git worktree list --porcelain | rg --fixed-strings "worktree $control_worktree"
fi
test "$(cd "$control_worktree" && pwd -P)" = "$control_worktree"
test -z "$(git -C "$control_worktree" status --porcelain)"
git -C "$control_worktree" switch --detach "$integrated_main_sha"
test "$(git -C "$control_worktree" rev-parse HEAD)" = "$integrated_main_sha"
(
  cd "$control_worktree"
  scripts/program-supervisor/bootstrap-worktree.sh
)
```

Expected: an existing path is adopted only when its canonical Git common-dir exactly matches this repository and the worktree registry names that exact path; no unrelated directory is ever switched or mutated. The detached, clean control worktree equals integrated `origin/main`, reports Node 24.16.0 and pnpm 11.2.2 through its bootstrap, and becomes the only persistent adapter/control command surface. The local shared checkout remains untouched and may remain behind. Retain this control worktree until the whole program is complete and its heartbeat is paused.

- [ ] **Step 3: Initialize runtime state with exact current facts**

Re-resolve the retained heads, states, receipts, worktrees, and Task 0 repository-lease validity immediately before initialization:

```bash
foundation_worktree=/Users/salvatoredicara/Workspace/Codex/d20-folio-program-supervisor-foundation
automation_worktree=/Users/salvatoredicara/Workspace/Codex/d20-folio-automation-k1
ui_worktree=/Users/salvatoredicara/Workspace/Codex/d20-folio-wayfinder-b00-successor
runtime_root=/Users/salvatoredicara/Workspace/Codex/d20-folio-program
bootstrap_file=/Users/salvatoredicara/Workspace/Codex/d20-folio-program-bootstrap.json
test -z "$(git -C "$control_worktree" status --porcelain)"
test -z "$(git -C "$foundation_worktree" status --porcelain)"
test -z "$(git -C "$automation_worktree" status --porcelain)"
test -z "$(git -C "$ui_worktree" status --porcelain)"
automation_head="$(git -C "$automation_worktree" rev-parse HEAD)"
ui_head="$(git -C "$ui_worktree" rev-parse HEAD)"
git -C "$control_worktree" fetch origin main
test "$(git -C "$control_worktree" rev-parse origin/main)" = "$integrated_main_sha"
rg --fixed-strings "$automation_head" "$control_worktree/docs/PROGRAM_STATUS.md"
rg --fixed-strings "$ui_head" "$control_worktree/docs/PROGRAM_STATUS.md"
```

Create `bootstrap_file` through the controller's approved file-edit mechanism, never through interpolated shell text, and set mode `0o600`. It is one complete bootstrap-event input without `seq` or `at` and contains, at minimum:

- `schemaVersion: 1`, event/program identity, the phase-one `mainSha`, `reconciledThrough`, stable control-worktree pointer, and every authority path/blob resolved in Step 1;
- three complete Task 2 charters—`foundation-f0`, current K1, and frozen B00—with outcome, all authority references, dependencies, full public/private ownership object, repository/worktree/branch/base/head identities, normalized paths, observable acceptance, independent-review contract and receipts, named owner gate, cleanup rule, and exact evidence-backed state;
- B00's frozen-head/serialized-overlap dependency on F0 and K1's independently verified current disposition;
- the active `foundation-f0` writer lease event with literal lease/task/holder/agent identities, `readOnly: false`, fresh acquisition/expiry, and an exact pointer to the authoritative Task 0 repository lease (`docs/TEST_PORTFOLIO.md`, lease ID, reconciled blob and main SHA); its path overlap is evaluated only from the referenced Foundation charter ownership.

The integrated status and named review/gate receipts supply these values; examples in this plan never override newer evidence. Before first initialization, validate that every authority blob resolves from `integrated_main_sha`, every worktree/head pair matches Git, every state has its required receipt, the private checkout/link remains exact and clean, and the bootstrap's Task 0/F0 lease is unexpired. If retained evidence cannot prove one field, stop and reconcile its owner in a reviewed repository slice.

Initialize or adopt exactly one identity:

```bash
test ! -L "$bootstrap_file"
test -f "$bootstrap_file"
test "$(stat -f '%Lp' "$bootstrap_file")" = 600
(
  cd "$control_worktree"
  if [ -e "$runtime_root" ]; then
    test -d "$runtime_root"
    scripts/program-supervisor/bootstrap-worktree.sh --run pnpm program:validate -- \
      --root "$runtime_root" \
      --expect-bootstrap-file "$bootstrap_file"
  else
    scripts/program-supervisor/bootstrap-worktree.sh --run pnpm program:init -- \
      --root "$runtime_root" \
      --bootstrap-file "$bootstrap_file"
  fi
)
```

If a crash left `bootstrap_file` but no runtime, validate its complete current identity and reuse it; never overwrite an ambiguous file. If the runtime exists, adoption succeeds only when the full canonical bootstrap fingerprint matches, not merely selected SHAs or worktree heads. A mismatch fails closed and never creates a second root. Preserve the mode-`0o600` bootstrap file and its runtime evidence copy for recovery. Initialize directories with mode `0o700` and files with mode `0o600`.

- [ ] **Step 4: Validate and prove rebuildability**

```bash
runtime_check_dir="$(mktemp -d)"
(cd "$control_worktree" && scripts/program-supervisor/bootstrap-worktree.sh --run pnpm program:validate -- --root /Users/salvatoredicara/Workspace/Codex/d20-folio-program --expect-bootstrap-file /Users/salvatoredicara/Workspace/Codex/d20-folio-program-bootstrap.json)
cp /Users/salvatoredicara/Workspace/Codex/d20-folio-program/state/program.json "$runtime_check_dir/program.before.json"
cp /Users/salvatoredicara/Workspace/Codex/d20-folio-program/state/leases.json "$runtime_check_dir/leases.before.json"
ledger_hash_before="$(shasum -a 256 /Users/salvatoredicara/Workspace/Codex/d20-folio-program/ledger/events.ndjson | awk '{print $1}')"
(cd "$control_worktree" && scripts/program-supervisor/bootstrap-worktree.sh --run pnpm program:rebuild -- --root /Users/salvatoredicara/Workspace/Codex/d20-folio-program)
cmp "$runtime_check_dir/program.before.json" /Users/salvatoredicara/Workspace/Codex/d20-folio-program/state/program.json
cmp "$runtime_check_dir/leases.before.json" /Users/salvatoredicara/Workspace/Codex/d20-folio-program/state/leases.json
test "$(shasum -a 256 /Users/salvatoredicara/Workspace/Codex/d20-folio-program/ledger/events.ndjson | awk '{print $1}')" = "$ledger_hash_before"
test "$(stat -f '%Lp' /Users/salvatoredicara/Workspace/Codex/d20-folio-program)" = 700
test "$(stat -f '%Lp' /Users/salvatoredicara/Workspace/Codex/d20-folio-program/state/program.json)" = 600
test "$(stat -f '%Lp' /Users/salvatoredicara/Workspace/Codex/d20-folio-program/state/leases.json)" = 600
test "$(stat -f '%Lp' /Users/salvatoredicara/Workspace/Codex/d20-folio-program/ledger/events.ndjson)" = 600
test -z "$(find /Users/salvatoredicara/Workspace/Codex/d20-folio-program \( -name '*.tmp' -o -name '.write-lock' \) -print)"
find "$runtime_check_dir" -depth -delete
```

Expected: validation prints `"valid":true`; both rebuilt caches are byte-identical; the authoritative ledger hash is unchanged; root/directory and file modes remain `0700`/`0600`; and no lock/temp residue exists.

- [ ] **Step 5: Idempotently provision one dedicated task and one paused heartbeat**

Use the Codex app's project and task inventory plus the installed automation manifests to search for the exact title `d20 Folio Program Supervisor` and prompt marker `d20-folio-program-supervisor:v1:<operating-model-blob>`. Adopt an existing task only when exactly one local task belongs to the saved `d20-folio` project and carries that marker; zero means create it, more than one or any mismatch means append an evidence-backed blocker and create nothing. Do not create it in the disposable Foundation worktree or in an app-managed worktree.

The dedicated task's initial prompt is bootstrap-wait/read-only: verify only the provisioned task marker and control-worktree Git identity, report that it is waiting, and do not invoke any `program:*` command, create a runtime lock, or touch external state until a `heartbeat-activated` event exists. If an externally active heartbeat ever wakes before that event because the controller crashed between the final app update and ledger append, it may read the ledger bytes only to confirm the event is absent, then exits without mutation. Its post-handoff heartbeat prompt must require the supervisor to:

- read the approved operating model and `docs/PROGRAM_STATUS.md` before dispatch;
- validate/rebuild the external state before trusting it;
- verify that `d20-folio-program-control` is clean and exactly equals fresh `origin/main`, refresh that detached worktree when main advances, and execute repository control commands only there;
- compare Git, worktrees, Codex tasks, tests, owner documents, private composition when relevant, and runtime leases on every run;
- expire leases only through an evidenced `lease-expired` event, renew before further edits when justified, and record `no-frontier-recorded` with the exact blocker/dependency/owner-gate evidence when no executable frontier exists;
- create successors through full `task-created` charters, then acquire a mechanically valid lease before dispatch;
- use repository worktrees plus bounded collaboration subagents, never separate user-owned writer tasks;
- create each target directly from fresh `origin/main` through the shared Git directory, then run the integrated pinned bootstrap inside the new target; never execute a stale shared-checkout recipe as supervisor authority;
- enforce two writers plus one read-only evaluator, exact worktree identity, Superpowers lifecycle, independent review, and cleanup only after remote/recovery proof;
- keep Automation-first and Tactical Codex as the product programs while Foundation remains short-lived;
- apply the two-repository charter whenever a public/private seam changes;
- stop only at genuine owner gates and never deploy, publish, change billing, or approve visual evidence itself.

Inventory automations by exact name, target thread, cadence, marker, destination, and prompt. Adopt exactly one match; create only when none exists; fail closed on ambiguity. Create it initially `PAUSED`, every 30 minutes, targeted to the exact dedicated `threadId`, with routine notifications limited to failed runs. If a matching automation exists but runtime lacks `heartbeat-activated`, normalize it back to `PAUSED` before continuing. Append one `supervisor-provisioned` event containing the literal thread/automation IDs, marker, cadence, target, and paused status only when that identity is not already recorded, then validate. If runtime already contains the exact `heartbeat-activated` handoff event, the bootstrap controller performs no normalization or append at all: it becomes read-only and leaves every continuation to the dedicated supervisor. This makes every interruption boundary adopt rather than duplicate and preserves one runtime writer.

- [ ] **Step 6: Prove the integrated worktree adapter while the heartbeat is paused**

From program-control, run `just wt-new foundation-bootstrap-probe chore`. Verify the probe's canonical common-dir, branch/base at current `origin/main`, clean status, Node `v24.16.0`, pnpm `11.2.2`, root and Functions dependencies, hooks, and absolute content-pack link to the still-clean private checkout at its recorded HEAD. Run the bootstrap a second time to prove idempotence. Only after all proof is captured, remove the clean probe through program-control and delete its probe branch. Append an `evidence-recorded` event with the exact public/private SHAs and receipt; rebuild/validate both caches.

- [ ] **Step 7: Charter activation status and complete core F0 while paused**

Keep the exact heartbeat `PAUSED`. Append one full `task-created` charter for `foundation-f0-activation-status` in `queued`. Its phase-one authority, dependency on core F0 plus the provisioned heartbeat identity, repository/worktree/branch/base/head, ownership of only `docs/PROGRAM_STATUS.md`, `docs/TEST_PORTFOLIO.md`, and `.changeset/program-supervisor-activation.md`, observable remote/status/authority acceptance, independent-review contract, no product owner gate, and cleanup rule must satisfy the complete Task 2 schema. This is a distinct repository task, not a second completion of `foundation-f0`.

Append one and only one `state-transitioned` event for core `foundation-f0` from `verification` to `integrated`. Its receipt must include the reviewed phase-one remote SHA, both green gates, rebuild receipt, probe receipt, supervisor thread ID, and still-paused automation ID. Release the core F0 runtime lease, acquire a fresh writer lease for `foundation-f0-activation-status` whose narrow authority pointer references the exact current Task 0 lease ID/path/blob/main SHA, and append its `dispatch-recorded` edge from `leased` to `executing`. Path overlap is checked from the new task charter, not copied into the lease. Validate and rebuild after the sequence. The paused bootstrap controller remains the only runtime writer; the activation-status task now owns the remaining repository mutation and core F0 is never transitioned again.

- [ ] **Step 8: Integrate activation status, then hand the sole writer role to the heartbeat**

At every entry or retry, first validate with the immutable bootstrap expectation, inspect the reconstructed activation-status task/lease, fetch `origin/main`, and inspect any previously recorded activation candidate before editing. If `heartbeat-activated` already exists, the bootstrap controller is permanently read-only and the dedicated supervisor owns the continuation. Otherwise, recheck or renew both the versioned Task 0 repository lease and the runtime activation-status lease under the global rule. Resume from the first missing typed event; never replay a completed transition, lease action, provisioning action, authority reconciliation, or cleanup.

Before authoring any status change, re-resolve `origin/main`, K1, B00, control, shared, private, task, automation, and runtime facts; fetch/rebase the clean Foundation branch onto that fresh base; then append `task-reconciled` with the exact new base/head and any advanced retained task facts. Update `docs/PROGRAM_STATUS.md` with `reconciledThrough` equal to that inspected pre-change remote SHA, core F0 integrated exactly once, the activation-status task in its current pre-integration state, the heartbeat explicitly `PAUSED` pending final ledger handoff, exact supervisor/automation identities, control worktree, current product charters/frontiers/gates, and delete zone. Update the Task 0 lease row in `docs/TEST_PORTFOLIO.md` with the terminal rule “released only after this activation-status change is remotely proven and its authority event is appended.” Add `.changeset/program-supervisor-activation.md`, commit `docs: record supervisor activation`, and append the exact `executing → review` transition receipt.

Request an independent read-only review of that exact fresh-base diff. A review fix uses `review → executing`, a fresh Changeset/commit, `task-reconciled` for its new head, and a new `executing → review` transition. After an accepted review, fetch again. If the base advanced, use `review → executing` with the changed-base receipt, rebase, append `task-reconciled`, and repeat review. Only when the reviewed base still equals fresh `origin/main` may the task move `review → verification`.

In verification, run pinned documentation guards, `scripts/program-supervisor/bootstrap-worktree.sh --run just ci`, `scripts/program-supervisor/bootstrap-worktree.sh --run just ci-srd-only`, and the recorded private clean/HEAD/link invariants. Fetch once more immediately before candidate freeze. A failed gate or changed base uses the explicit evidence-backed `verification → executing` edge, followed by rebase/debugging, `task-reconciled`, review, and the complete gate sequence; an approval never survives a changed diff.

Before any push, resolve both changed authority blobs and append an `evidence-recorded` event for the activation-status task containing the literal candidate SHA, its reviewed base SHA, exact `docs/PROGRAM_STATUS.md` blob, exact `docs/TEST_PORTFOLIO.md` blob, evaluator receipt, both full-gate receipts, private HEAD/link receipt, and push target. This pre-push evidence is the recovery key. Push explicit `HEAD:main` only when fresh `origin/main` still equals that reviewed base, then confirm the remote SHA. Do not deploy.

On retry after any interruption, fetch first and compare the latest recorded candidate evidence mechanically:

- if the recorded candidate is equal to or an ancestor of `origin/main`, prove the exact candidate commit and both recorded authority blobs exist in that remote history and adopt the push as successful rather than rebasing or pushing again;
- if `origin/main` advanced past that candidate and both current authority blobs are unchanged, use the current remote SHA as the authority-reconciliation target; if either blob changed, fail closed into `blocked-with-evidence` for an independent owner reconciliation;
- if the candidate is not in remote history and fresh `origin/main` still equals its recorded base, the exact reviewed/gated candidate may be pushed;
- if the candidate is not in remote history and the base advanced, use `verification → executing`, rebase, append `task-reconciled`, repeat review/gates, and append a new candidate-evidence event before any push.

This recovery path deliberately compares current runtime phase-one authority with the recorded activation candidate and remote ancestry; `validate --expect-bootstrap-file` proves the immutable bootstrap identity and does not mistake a later evidenced `authority-reconciled` SHA for bootstrap drift.

After remote proof, refresh the clean detached program-control worktree to exact current `origin/main`, rerun the pinned bootstrap, and resolve both current authority blobs. From program-control append one `authority-reconciled` event containing the remote main SHA, both blobs, and adopted-or-direct push receipt; in the same projection advance the activation lease pointer's last reconciled blob/SHA. Transition only `foundation-f0-activation-status` from `verification` to `integrated`, then release its lease. Validate after each resumable boundary. Prove the merged Foundation worktree is clean and remote-integrated, record its exact worktree/branch/controller-task identity in an `evidence-recorded` cleanup-pending receipt, and leave it intact because the bootstrap controller may still need that execution context to finish the handoff. Keep `d20-folio-program-control`; it is active program infrastructure, not leaked task work.

Only after every bootstrap mutation above is durably validated and no Foundation/activation lease remains active, update the adopted automation by exact ID from `PAUSED` to `ACTIVE`, preserving every other field. View and prove its target thread, marker, 30-minute cadence, destination, failed-run-only notification policy, and status. Because the dedicated task's bootstrap prompt refuses work without the ledger handoff, a crash between the external update and ledger append is safe to resume. Append `heartbeat-activated` with the final remote SHA, both authority blobs, runtime rebuild receipt, cleanup-pending receipt, supervisor thread ID, and automation ID as the bootstrap controller's final and irreversible writer-handoff mutation. The append itself returns the validated final receipt; the controller performs no later runtime command, append, or worktree removal. The dedicated supervisor is now the sole writer.

On its first post-handoff wake, the supervisor validates/rebuilds, checks the Codex task inventory, and proves the bootstrap controller is no longer running from or attached to the Foundation worktree. If the worktree is app-managed, it first uses the Codex handoff flow to detach it; if it is repository-managed, it proves no Codex task owns it. Only then, and only with the recorded clean/remote-integrated receipt, it removes the Foundation worktree and branch from program-control and appends `cleanup-recorded`. If the controller is still active or ownership is ambiguous, it records `no-frontier-recorded` and retries on a later heartbeat without removing anything.

Routine background notifications remain failed-run-only. When a later wake reaches a genuine owner gate, the supervisor appends `owner-gate-recorded`, pauses this exact automation, exposes the dedicated task as needing attention, and ends with the concise product/visual decision plus recommendation and images when visual; it never leaves a gate only in the ledger. Resumption resets the routine failed-run-only policy after the owner answers.

- [ ] **Step 9: Let the next heartbeat continue product execution**

After completing the deferred safe cleanup above, the supervisor reconciles K1 and B00 evidence, creates the smallest complete successor charter, assigns at most the two disjoint product writers plus one evaluator, and contacts the owner only when curated B00 images or another genuine owner gate are ready.
