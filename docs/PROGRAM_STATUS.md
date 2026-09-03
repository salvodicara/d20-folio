# Program Status

This is the sole active agent-program execution-control owner. Update it when a frontier, lease,
blocker, owner gate, or integration SHA changes. It does not own product/release status
(`PROGRESS.md`), release history (`CHANGELOG.md`), test risk/deletion ownership, or repository path
leases (`docs/TEST_PORTFOLIO.md`). Those owners are linked rather than copied.

## Reconciliation snapshot

- `reconciledThrough`: `1a549625175af1802cc521f6c4bcba03ebe0f8b9`
- `observedAt`: `2026-08-26T18:30:26.000Z`
- Public `origin/main`, remote main, clean detached program-control, and runtime main authority were
  inspected at that exact SHA. The earlier `fd5d84cec2e5da2986bda412e277d7cc68c77735`
  remains the historical core F0 integration and activation-lease acquisition receipt;
  `b9cdabde76aae63c9418b0ae3cb2b5a7d10ac3fa` remains the historical first test-harness repair.
  Neither is current main authority.
- The snapshot is evidence-bound, not self-referential: it does not claim the SHA or blob of the
  commit that contains this file.

### Authority manifest

This manifest deliberately distinguishes the inspected base authority from the pending candidate
authority. Unchanged roles and the self-referential status-owner boundary come from public
`origin/main` at `1a549625175af1802cc521f6c4bcba03ebe0f8b9`; the repository-lease row names the exact
candidate blob that will be reconciled only after remote proof. The test roadmap and repository
lease owner remain separate roles; one cannot substitute for the other.

| Runtime role               | Authority path                                                        | Blob / reconciliation boundary                                                                        |
| -------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `operatingModel`           | `docs/plans/2026-08-25-agent-first-operating-model-design.md`         | `05405bae8b24f3ec1f120985f66bf755c1011b19`                                                            |
| `automationWayfinder`      | `docs/superpowers/plans/2026-08-25-automation-first-wayfinder.md`     | `44560c49a166dbd897fff2d316cb3b17b6a1aef5`                                                            |
| `tacticalWayfinder`        | `docs/superpowers/plans/2026-08-25-tactical-codex-ui-ux-wayfinder.md` | `062ffd48783311a77e1ad5bee962ef5cd637c079`                                                            |
| `testRoadmap`              | `docs/superpowers/plans/2026-08-25-test-portfolio-reset.md`           | `9f3e42f7e50f104a35ceab21f5469a4291407bb4`                                                            |
| `readinessBaseline`        | `docs/superpowers/plans/2026-08-25-g0-automation-readiness.md`        | `0a7f1ec661390aa475dfbde83eab72a4fbbe8b89`                                                            |
| `repositoryLeaseOwners[0]` | `docs/TEST_PORTFOLIO.md`                                              | candidate `9b4b49e2e390259a0e16f8bcdbe6a1cc16267ad3`; base `7cb89ed4b26021aa46a7d4cdc8ef7888df692d52` |
| `statusOwner`              | `docs/PROGRAM_STATUS.md`                                              | base `ed43234fa7dedd065e6c809998c94568a852d41f`; candidate resolves after integration                 |

The status owner cannot truthfully contain the blob produced by its own pending edit. Runtime main
authority has advanced to the current SHA above with both base owner blobs unchanged; after this
activation correction is remotely proven, `authority-reconciled` advances both paths and blobs
atomically before handoff.

Supporting Foundation authorities in the same inspected tree are the implementation plan
(`docs/superpowers/plans/2026-08-26-program-supervisor-foundation.md`, blob
`9f14272201ca284cc2b42e707c5554d651eb61e7`) and the dependency baseline
(`docs/superpowers/status/2026-08-26-foundation-security-baseline.md`, blob
`3102f341c1c2815dce2f164646764b28911e9f97`). Tactical visual decisions additionally remain owned
by `DESIGN.md` at blob `85a7942355904c4a57e2e4729491c99a3ae1b97f`.

### Operational coordinates

| Surface             | Exact observation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared checkout     | `/Users/salvatoredicara/Workspace/d20-folio`, branch `main`, clean stale HEAD `8c4e37e7ddabe3d8d99a8a1ffe2ef592e3ed2add`. It remains untouched and non-authoritative.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Program control     | `/Users/salvatoredicara/Workspace/Codex/d20-folio-program-control`, clean detached HEAD `1a549625175af1802cc521f6c4bcba03ebe0f8b9`, equal to current public and runtime main authority. This is the sole persistent command surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Supervisor task     | Saved project `1ffe790a-2e8c-41fd-b048-932ad89d0d4e`; local task title `d20 Folio Program Supervisor`; thread `01a03eba-ac75-7fb0-80b0-88356b3aba67`; host `local`. Its bootstrap turn completed read-only and it remains idle pending the typed writer handoff.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Heartbeat           | Automation ID `d20-folio-program-supervisor-heartbeat`; name `d20 Folio Program Supervisor Heartbeat`; marker `d20-folio-program-supervisor:v1:05405bae8b24f3ec1f120985f66bf755c1011b19`; exact target thread above; 30-minute cadence; destination `thread`; notifications `failed_runs_only`; status `PAUSED`.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Private composition | `/Users/salvatoredicara/Workspace/d20-folio-content`, clean branch `main`; HEAD, fetched `origin/main`, and remote main are `1d5226f564d2c790f5409c294afe9d9ba6cc2ab7`. K1 and B00 links resolve to its `content-pack/` and remain read-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| External runtime    | Private root `/Users/salvatoredicara/Workspace/Codex/d20-folio-program` is mode `0700`; bootstrap input is mode `0600`. Fingerprint `840c0ce7c9514608040389ae234b0cd526b4754ab2799c738310db653b34984e`; event sequence `49`; fixed-ref tip `25c24b798c10f9c72d64e85f510b30cc77415c51`; main authority `1a549625175af1802cc521f6c4bcba03ebe0f8b9`. The projection contains six tasks, exactly one active activation writer lease, and current writer `program-supervisor-bootstrap-controller`. Activation remains `executing` with its sequence-39 failed-gate reconciliation pending; its last runtime base/head is still `b9cdabde76aae63c9418b0ae3cb2b5a7d10ac3fa` / `512e0ffca44db0945393fb7013c190c88a4c3060` until the rebased candidate is reconciled. |

Supervisor and manual same-thread adapters run only from the clean detached program-control
worktree or another clean worktree whose HEAD has just been proven equal to fresh `origin/main`.
The shared checkout remains untouched even when its branch name is `main`.

## Automation direction under re-architecture (2026-09-02)

The owner opened a full architecture round on 2026-09-02. Evidence, verdicts and the target are owned
by `docs/superpowers/status/2026-09-02-combat-automation-audit.md`,
`docs/superpowers/specs/2026-09-02-total-combat-automation-design.md`, `docs/adr/0001…0009` and
`docs/superpowers/plans/2026-09-02-total-combat-automation-migration.md`. Owner rulings: no ratified
kernel destination before this round; trust at the table and minimum cost (no gameplay Cloud
Functions); one engine for solo and shared play; migrate live data before every deploy; fewer,
meaningful tests. Consequences for this ledger: the `automation-k1` charter and the Wayfinder slices
K1→X1 are **superseded** (ADR-0004); `mechanics-*` is salvaged, not adopted (ADR-0003); the P2
prototype lives in `src/lib/combat` (`docs/superpowers/status/2026-09-02-p2-prototype-report.md`).
Codex was blocked by the owner on 2026-09-02; `fix/structural-automation-fixes` is an input, not a
baseline. The next session starts from
`docs/superpowers/plans/2026-09-02-next-session-handoff.md`.

## Pending migrations

One-off data migrations that are committed and verified locally but have NOT yet run on production.
ADR-0009: before deploying a SHA that reads a new persisted shape, every row here must be `--check`
green against production; a deploy with a pending migration is refused. Commands and credentials:
`docs/RELEASE.md` → "Migrate before you deploy". A row is deleted only after the script has run on
production, been verified idempotent, and had its script + test removed (golden rule 10).

| Migration                              | Persisted shape it prepares                                                                                         | State                                                                                                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/migrate-custom-identity.ts`   | `instanceId` on every custom sheet entry and library id                                                             | Committed; not yet run on production.                                                                                                                                                                                                        |
| `scripts/migrate-character-parents.ts` | every parent v1 (`state: {}`), every character has a `combat/state` child with `playState`, every parent `revision` | Committed; not yet run on production. **BLOCKING from P1 on:** the client is v1-only, so an unmigrated parent quarantines and a childless character fails closed. At most ~250 characters per run (two documents each, one 500-write batch). |

## Active charters

### Foundation — `foundation-f0`

- **Outcome:** provide the durable Program Supervisor control plane: pinned worktree bootstrap,
  deterministic program state, private bare-Git event store, stable detached program-control
  surface, and one typed writer handoff.
- **Authority:** operating model, Foundation implementation plan, test roadmap, readiness baseline,
  repository lease owner, this status owner, and Foundation security baseline pinned above.
- **State and receipt:** `integrated` exactly once at historical core SHA
  `fd5d84cec2e5da2986bda412e277d7cc68c77735`; current public remote `main` has since advanced to
  `b9cdabde76aae63c9418b0ae3cb2b5a7d10ac3fa` through the separately reviewed runtime-residue
  repair and then to `1a549625175af1802cc521f6c4bcba03ebe0f8b9` through the separately reviewed
  worktree-race repair, without reintegrating core F0. Each repair passed `just ci`,
  `just ci-srd-only`, and the actual pre-push coverage/build/budget lane before integration,
  authority reconciliation, and lease release; neither changed production or private content, and
  neither deployed. The exact core candidate and its CLI repair received independent PASS reviews.
  Core `just ci` passed 801/801 Vitest files and 18,613/18,613 tests, 7/7 Functions files and
  129/129 Functions tests, typecheck, lint, and both builds.
  `just ci-srd-only` passed 623/623 files and 13,037/13,037 tests, typecheck, and build. The
  separate final pre-push gate passed typecheck, lint, 801/801 Vitest files and 18,613/18,613
  tests, coverage, build, and 6/6 bundle-budget tests. The pinned toolchain/typecheck authority
  correction remains evidenced by
  `be84367069e47ce029eadf1c11fbdf9aac90df2d`.
- **Runtime receipt:** immutable bootstrap fingerprint
  `840c0ce7c9514608040389ae234b0cd526b4754ab2799c738310db653b34984e`; the exact paused
  supervisor identity is provisioned; the official worktree adapter was proved end to end at the
  historical core integration SHA against clean private SHA
  `1d5226f564d2c790f5409c294afe9d9ba6cc2ab7`, including a second idempotent bootstrap and clean
  probe removal. Core runtime lease
  `runtime-foundation-f0` is released.
- **Owner gate:** none for integration. No deployment, publication, billing/privacy change, or
  visual approval occurred.
- **Cleanup:** the remotely integrated Foundation worktree and branch remain intentionally present
  until the final writer handoff. On its first post-handoff wake, only the provisioned supervisor
  may prove controller detachment, remove them from program-control, and record cleanup.
- **Roadmap exits:** core F0 is complete. Dependency remediation, risk-owned test-portfolio reset,
  release/rollback hardening, and skill/plugin/context decisions remain separate Foundation
  successors rather than hidden work in this task.

### Foundation activation — `foundation-f0-activation-status`

- **Outcome:** reconcile the integrated Foundation into this status owner and
  `docs/TEST_PORTFOLIO.md`, remotely prove those exact blobs, then atomically transfer the sole
  runtime writer role to the provisioned heartbeat.
- **Dependencies:** integrated `foundation-f0` at
  `fd5d84cec2e5da2986bda412e277d7cc68c77735`; provisioned supervisor thread
  `01a03eba-ac75-7fb0-80b0-88356b3aba67`; exact heartbeat
  `d20-folio-program-supervisor-heartbeat`, still `PAUSED`.
- **Ownership:** public repository `d20-folio`; worktree
  `/Users/salvatoredicara/Workspace/Codex/d20-folio-program-supervisor-foundation`; branch
  `feat/program-supervisor-foundation`; fresh base
  `1a549625175af1802cc521f6c4bcba03ebe0f8b9`; clean pre-refresh rebased HEAD
  `f9f29e95bda67ff8757396adda6abc258175d526` (tree
  `95d5d2fdb959d5b019fff3428953b0fc55f774b4`), two commits ahead with first activation commit
  `07e694a9e2493f2c44408abd3db94634dc93c076`. Runtime still pins the older pre-rebase activation
  base/head `b9cdabde76aae63c9418b0ae3cb2b5a7d10ac3fa` /
  `512e0ffca44db0945393fb7013c190c88a4c3060` pending the next typed reconciliation event. Its runtime
  mutation scope is only
  `docs/PROGRAM_STATUS.md`, `docs/TEST_PORTFOLIO.md`, and
  `.changeset/program-supervisor-activation.md`; this remains a strict subset of the still-versioned
  F0 repository lease. No private write.
- **State and receipt:** `executing` at runtime sequence `49`, tip
  `25c24b798c10f9c72d64e85f510b30cc77415c51`. Sequence 39 records the failed composed gate for
  older candidate `512e0ffca44db0945393fb7013c190c88a4c3060`: typecheck and lint passed, then tests completed
  800/801 files and 18,612/18,613 tests because the single-fetch worktree test exceeded 5 seconds.
  The independently reviewed repair is now integrated at current main with both full gates and the
  actual pre-push coverage/build/budget lane green; activation reconciliation remains pending, and
  this task holds the sole active writer lease. Runtime lease
  `runtime-foundation-f0-activation-status` was acquired
  `2026-08-26T15:50:42.912Z` and expires `2026-08-27T15:40:00.000Z`, pinned to repository lease
  `F0`, `docs/TEST_PORTFOLIO.md@7cb89ed4b26021aa46a7d4cdc8ef7888df692d52`, reconciled through
  `fd5d84cec2e5da2986bda412e277d7cc68c77735`. That last SHA is the preserved acquisition-time
  repository pointer; current public and runtime main authority is
  `1a549625175af1802cc521f6c4bcba03ebe0f8b9`.
- **Acceptance:** fresh independent review, composed and SRD-only gates, clean private/link proof,
  candidate evidence before push, explicit remote ancestry, atomic reconciliation of both changed
  authority blobs, zero active leases, matching validate/rebuild output, and one irreversible
  `heartbeat-activated` handoff.
- **Owner gate:** none. The heartbeat remains paused until every acceptance proof above is durable;
  integration does not authorize deployment.
- **Cleanup:** physical cleanup is deferred to the provisioned supervisor after handoff because the
  bootstrap controller cannot safely remove its own final execution context.

### Automation-first — `automation-k1`

- **Outcome and first frontier:** complete the Automation-first program so every knowable D&D
  consequence resolves through one deterministic command/state authority. Its first frontier is
  K1: integrate one strict `resolveCommand` kernel and shared browser/Functions build seam without a
  live caller, second reducer, persistence writer, UI, or generated die result.
- **Authority:** operating model, Automation-first Wayfinder, test roadmap, G0 readiness baseline,
  repository lease owner, and this status owner pinned above.
- **Dependencies:** reviewed G0/T0 and core F0 are integrated. K1 remains queued only until the
  activation-status candidate is remotely integrated, both authority blobs are reconciled, and the
  supervisor writer handoff is valid; it must then freshly rebase onto that final `origin/main` and
  re-ground every identity and receipt.
- **Ownership:** public repository `d20-folio`; retained worktree
  `/Users/salvatoredicara/Workspace/Codex/d20-folio-automation-k1`; branch `feat/automation-k1`;
  base `c476f2b3bf2a1cf9d504d8b1281d6979463f2f97`; clean head
  `7ae43494be58f92651b02a32de821c0d3f59fb98`; no private write. Exact candidate ownership is
  `.changeset/automation-k1-{plan,kernel,shared-build,review-fix}.md`, `docs/MECHANICS.md`,
  `docs/superpowers/plans/2026-08-25-automation-k1-kernel-contract.md`,
  `functions/package.json`, `functions/package-lock.json`, `functions/src/index.ts`,
  `scripts/build-functions.ts`, `src/lib/command/{codec,identity,index,resolve-command}.ts`,
  `src/types/{command,effect-instance,rule-definition}.ts`, and
  `tests/unit/resolve-command.{contract,golden}.test.ts`.
- **State and receipt:** `queued`; the candidate is clean and has no active writer/rebase. The
  readiness receipt at head `7ae43494be58f92651b02a32de821c0d3f59fb98` records 86 focused tests,
  typecheck/lint/build/Functions gates, `just ci`, and `just ci-srd-only` green, but that dated
  evidence is not integration permission after F0 changes the base.
- **First lease:** repository lease ID `K1` is declared for the future charter but is inactive; no
  K1 runtime lease or writer is active. Acquire it only after the activation handoff and exact
  authority/base reconciliation.
- **Acceptance:** Wayfinder §9 exit; the test-roadmap K1 contract/golden row; hostile codec and
  deterministic vectors; canonical browser/Functions byte parity; no forbidden imports or live
  caller; fresh composed and SRD-only gates.
- **Independent review:** after the F0 rebase, rerun scoped review of the review-fix diff and a
  whole-branch specification/quality review. Any fix or changed base invalidates prior approval and
  returns through review before full verification.
- **Owner gate:** none for non-visual integration. Deployment remains a global owner gate.
- **Cleanup:** retain the worktree/branch until exact candidate ancestry on remote `main` is proven;
  then remove from program-control and record cleanup. Do not delete the reviewed evidence first.
- **Roadmap exits and next frontier:** Automation Wayfinder §9 and §22. After K1 integration,
  reconcile `docs/AUTOMATION_COVERAGE.md` to the integrated kernel and charter the smallest bounded
  C1a deterministic spell-command slice under Wayfinder §11; do not open the whole casting program
  at once.

### Tactical Codex — `tactical-b00`

- **Outcome and first visual frontier:** replace the full application experience with one approved
  Tactical Codex system without a legacy/new hybrid. Its first visual frontier is B00: integrate
  licensed type, original identity/mechanics icons, art taxonomy and provenance as an inert DEV/TEST
  foundation with zero production-reachable candidate bytes.
- **Authority:** operating model, Tactical Codex Wayfinder, test roadmap, repository lease owner,
  this status owner, and `DESIGN.md` pinned above.
- **Dependencies:** core F0 is integrated, but B00 remains frozen until the activation handoff and
  the repaired T8A visual adapter are proven. It must then fetch and freshly rebase onto final
  activation `origin/main`; explicitly reconcile `package.json`, `PROGRESS.md`, and related
  `pnpm-lock.yaml`; preserve supervisor authority; and complete a new exact-SHA visual cycle before
  any integration attempt.
- **Ownership:** public repository `d20-folio`; retained worktree
  `/Users/salvatoredicara/Workspace/Codex/d20-folio-wayfinder-b00-successor`; branch
  `feat/wayfinder-b00-successor`; base `9fa32980abfc08e32e06853bd29823b947496f49`;
  clean frozen head `7b66c828b1f181c22e5921abf678c436825bc089`; no private write. Candidate
  ownership is `.changeset/tactical-assets.md`, `package.json`, `pnpm-lock.yaml`, `PROGRESS.md`,
  `docs/assets/ASSET_PROVENANCE.md`,
  `docs/superpowers/plans/2026-08-25-tactical-codex-01-assets.md`,
  `docs/superpowers/plans/deletions/tactical-codex-01-assets.md`,
  `src/assets/tactical-codex/**`, `src/components/tactical-codex/{brand,icons}/**`,
  `src/i18n/tactical-codex/{en,it}/assets.json`, `src/styles/tactical-codex/foundation.css`,
  `tests/e2e/surface-census/tactical-assets.ts`, `tests/e2e/tactical-codex-assets.spec.ts`,
  `tests/unit/bundle-budget.guard.test.ts`, `tests/unit/tactical-codex-asset-contract.test.ts`,
  `tests/unit/tactical-codex-asset-specimen.test.tsx`,
  `tests/unit/tactical-codex-brand.test.tsx`,
  `tests/unit/tactical-codex-font-foundation.test.ts`, and
  `tests/unit/tactical-codex-mechanics-icons.test.tsx`.
- **State and receipt:** `blocked-with-evidence`; no active writer/rebase. The frozen exact-SHA
  receipt has scoped review `APPROVED`, focused/composed/build/motion evidence green, and 8 normal +
  8 derived 200%-zoom captures. Central `visual:review` remains blocked by the inherited T8A
  `play`-before-`edit` adapter defect, and all affected evidence expires when the candidate rebases.
- **First lease:** repository lease ID `B00` is declared but inactive. Acquire it only after the
  activation handoff, exact authority refresh, visual-runner repair, and a fresh overlap-aware
  charter.
- **Acceptance:** Tactical Wayfinder Task 1 and Completion Definition B00 row; original/licensed
  assets and complete provenance; exact font/icon/ratio contracts; no production bundle/precache
  reachability; fresh focused, `just ci`, applicable SRD, `visual:review`, and `visual:motion` gates
  on one rebased SHA.
- **Independent review:** the frozen SHA's review is historical evidence only. The reconciled
  post-F0 diff needs a new scoped and whole-branch review, and any visual-affecting fix needs another
  exact-SHA review/gate cycle.
- **Owner gate:** before asking for screenshots, document and recommend the product/taste decision
  between a cream page field and `DESIGN.md`'s owner-ratified Shaded Scriptorium: neutral
  stone/linen `#948f84` page field with warm vellum/ivory reserved for decision surfaces. Then
  deliver actual curated before/after images for the exact rebased SHA at normal size and 200% zoom
  across IT dark desktop 1440×900, EN light desktop 1440×900, IT light mobile 390×844, and EN dark
  mobile 390×844. Approval is screenshot-only and never authorizes deployment.
- **Cleanup:** retain the frozen worktree, branch, ignored harness, and evidence until post-rebase
  review, all visual gates, owner approval, and remote integration are proven. Then remove the
  worktree/branch and record cleanup; never discard the only evidence while blocked.
- **Roadmap exits and next frontier:** Tactical Wayfinder Wave 0 Task 1, visual/screenshot/motion
  gates, and Completion Definition. After B00 is owner-approved and integrated, charter the bounded
  A00 shell specimen (Task 2); it remains DEV/TEST-only and does not cut over the live shell.

## Lease and frontier routing

`docs/TEST_PORTFOLIO.md` is the only repository lease/path owner. This section mirrors only the
current execution pointer so agents can route correctly; it cannot grant or change ownership.

- **Active repository lease:** `F0` → `program-supervisor-foundation`; acquired
  `2026-08-26T01:38:26Z`, expires `2026-08-27T01:38:26Z`, and rechecked valid at
  `2026-08-26T18:30:26.000Z`.
  Its versioned exclusive paths remain `justfile`, `package.json`, `CLAUDE.md`, `PROGRESS.md`,
  `docs/WORKTREES.md`, `docs/PROGRAM_STATUS.md`, `docs/TEST_PORTFOLIO.md`, and
  `scripts/program-supervisor/**` until the terminal authority handoff.
- **Active runtime writer lease:** `runtime-foundation-f0-activation-status` →
  `program-supervisor-foundation-activation-status`; acquired `2026-08-26T15:50:42.912Z`, expires
  `2026-08-27T15:40:00.000Z`, and may mutate only `docs/PROGRAM_STATUS.md`,
  `docs/TEST_PORTFOLIO.md`, and `.changeset/program-supervisor-activation.md`. This narrow runtime
  scope is a strict subset and does not release the remaining repository paths. Its preserved
  acquisition-time authority pointer is
  `docs/TEST_PORTFOLIO.md@7cb89ed4b26021aa46a7d4cdc8ef7888df692d52`, reconciled through
  `fd5d84cec2e5da2986bda412e277d7cc68c77735`; current main authority is
  `1a549625175af1802cc521f6c4bcba03ebe0f8b9`.
- **Inactive next lease:** `K1`; acquire only after the activation candidate is remotely proven,
  authority-reconciled, and the supervisor heartbeat owns the runtime writer role.
- **Inactive blocked lease:** `B00`; acquire only after the same handoff plus visual-runner repair,
  overlap reconciliation, and exact authority refresh.
- The C0-C4 rows in the lease owner remain serial handoff history/next-owner routing, not extra
  active supervisor leases.

Current executable order is activation status → remote proof and writer handoff → K1 fresh
rebase/review/gates and integration. B00 stays frozen until the visual-runner dependency and its
taste/screenshot gates are satisfied. After handoff, K1 and a disjoint visual dependency repair may
overlap only under separate valid leases; integration remains evidence-driven.

## Foundation security frontier

These are the first Foundation dependency slices after the core supervisor boundary, not work
inside F0. Refresh GitHub and both lockfiles before leasing any remediation.

| Finding                 | Current affected path/version                              | Required exit                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependabot 47 / nanoid  | `nanoid@3.3.16` via Vite → PostCSS                         | Patch to a maintained resolution (advisory patched at 3.3.18); prove root build, bundle/PWA reachability, tests, and standalone Functions behavior. |
| Dependabot 43 / js-yaml | `js-yaml@3.15.0` via Changesets → manypkg → read-yaml-file | Upgrade or safely constrain the release-tool chain (patched at 3.15.1); prove Changesets parsing and release-plan behavior.                         |
| Dependabot 44 / js-yaml | `js-yaml@4.3.0` through Changesets parse/read              | Upgrade or safely constrain the release-tool chain (patched at 4.3.1); prove Changesets parsing and release-plan behavior.                          |

Each disposition needs a fresh alert/audit receipt, dependency-tree and reachability evidence,
focused package/release tests, the complete composed gate, SRD-only when the seam changes, and
independent review. A development/build classification alone is not permission to dismiss a high.

## Program completion checklist

- [ ] **Control plane:** a fresh supervisor reconstructs one valid program from the strict private
      bare-Git event chain, exact authority manifest, Git/worktree/task inventory, and narrow
      in-memory lease projection; the detached program-control worktree and sole-writer heartbeat
      handoff are proven.
- [ ] **Foundation:** core F0 integrates and cleans safely; dependency security, risk-owned test
      portfolio, release manifest/smoke/rollback, and skill/plugin/context decisions receive their
      own reviewed completion evidence.
- [ ] **Task discipline:** every active task has one complete charter, exact repository authority
      pointer, bounded lease, acceptance/review receipt, owner gate, and cleanup rule; no obsolete
      worktree or runtime artifact survives without a disposition.
- [ ] **Automation-first:** every Automation Wayfinder §22 item is observed on the integrated
      runtime, including one browser/Functions kernel, canonical persistence, shared authority,
      deterministic automation/undo, headless handoffs, legacy deletion, and both composition
      gates.
- [ ] **Tactical Codex:** every Completion Definition row is observed for one rebased candidate:
      B00/A00-A16/B01/S01-S02 coverage, one shell/overlay/motion/action-flow grammar, no hybrid or
      duplicate owner, complete bilingual/accessibility/offline/responsive evidence, and approved
      exact-SHA screenshots.
- [ ] **Live-user and licensing safety:** the six-fixture migration protocol, EN+IT, offline/PWA,
      no-RNG, SRD/private partition, zero-cost safeguards, and public/private compatibility remain
      green wherever touched.
- [ ] **External gates:** deployment, publication, billing/privacy, destructive actions, and every
      visual approval remain explicit owner decisions. Integration never implies deployment.

## Delete zone

Nothing here may be deleted merely because it looks complete.

| Candidate                                                                                                            | Earliest evidence-backed cleanup boundary                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/Users/salvatoredicara/Workspace/Codex/d20-folio-agent-first-operating-model` + `docs/agent-first-operating-model`  | Prove integrated commit `c476f2b3bf2a1cf9d504d8b1281d6979463f2f97` is in fresh `origin/main`, the tree is clean, and no Codex task owns it; then remove from program-control and record cleanup.                     |
| Foundation worktree + `feat/program-supervisor-foundation`                                                           | Activation-status remote integration, authority reconciliation, clean/remote-integrated receipt, activated heartbeat, and bootstrap-controller detachment; the supervisor then records `cleanup-recorded`.           |
| `/Users/salvatoredicara/Workspace/Codex/d20-folio-program-runtime-residue-test` + `fix/program-runtime-residue-test` | Its clean retained SHA `b9cdabde76aae63c9418b0ae3cb2b5a7d10ac3fa` is one commit behind current main. After handoff, only the supervisor proves fresh ancestry and no task ownership; then remove and record cleanup. |
| `/Users/salvatoredicara/Workspace/Codex/d20-folio-program-worktree-race-test` + `fix/program-worktree-race-test`     | Its clean retained SHA `1a549625175af1802cc521f6c4bcba03ebe0f8b9` equals current main. After handoff, only the supervisor proves fresh ancestry and no task ownership; then remove and record cleanup.               |
| K1 worktree + `feat/automation-k1`                                                                                   | Exact K1 candidate is proven in remote `main`, its evidence is retained, and no task owns the tree.                                                                                                                  |
| B00 worktree + `feat/wayfinder-b00-successor`                                                                        | Exact owner-approved rebased candidate is proven in remote `main`, visual artifacts are retained, and no task owns the tree.                                                                                         |
| Incomplete runtime root or persistent Git-internal `.lock`/`tmp_obj_*` residue                                       | Give active cooperating Git evidence only its bounded non-deleting contention window, then preserve persistent residue unchanged for manual quiescent recovery; never adopt, delete, repair, or reinitialize it.     |

Never place the active runtime root, immutable bootstrap evidence, program-control worktree, shared
checkout, dirty worktree, or unintegrated branch in the delete zone. Deployment remains owner-only.
