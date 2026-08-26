# Program Status

This is the sole active agent-program execution-control owner. Update it when a frontier, lease,
blocker, owner gate, or integration SHA changes. It does not own product/release status
(`PROGRESS.md`), release history (`CHANGELOG.md`), test risk/deletion ownership, or repository path
leases (`docs/TEST_PORTFOLIO.md`). Those owners are linked rather than copied.

## Reconciliation snapshot

- `reconciledThrough`: `c476f2b3bf2a1cf9d504d8b1281d6979463f2f97`
- `observedAt`: `2026-08-26T13:43:02Z`
- Public `origin/main` was freshly fetched and inspected at that exact SHA before authoring.
- The snapshot is evidence-bound, not self-referential: it does not claim the SHA or blob of the
  commit that contains this file.

### Authority manifest

Every resolved blob below comes from the exact Task 5 Fix Round 5 pre-status authority set. The test
roadmap and repository lease owner are deliberately separate roles; one cannot substitute for the
other.

| Runtime role               | Authority path                                                        | Blob / reconciliation boundary                                 |
| -------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| `operatingModel`           | `docs/plans/2026-08-25-agent-first-operating-model-design.md`         | `05405bae8b24f3ec1f120985f66bf755c1011b19`                     |
| `automationWayfinder`      | `docs/superpowers/plans/2026-08-25-automation-first-wayfinder.md`     | `44560c49a166dbd897fff2d316cb3b17b6a1aef5`                     |
| `tacticalWayfinder`        | `docs/superpowers/plans/2026-08-25-tactical-codex-ui-ux-wayfinder.md` | `062ffd48783311a77e1ad5bee962ef5cd637c079`                     |
| `testRoadmap`              | `docs/superpowers/plans/2026-08-25-test-portfolio-reset.md`           | `9f3e42f7e50f104a35ceab21f5469a4291407bb4`                     |
| `readinessBaseline`        | `docs/superpowers/plans/2026-08-25-g0-automation-readiness.md`        | `0a7f1ec661390aa475dfbde83eab72a4fbbe8b89`                     |
| `repositoryLeaseOwners[0]` | `docs/TEST_PORTFOLIO.md`                                              | `323a34fcac8b4815e8d3630378ce040075cc263f`                     |
| `statusOwner`              | `docs/PROGRAM_STATUS.md`                                              | Task 6 resolves the integrated blob and records it in runtime. |

The status owner cannot truthfully contain its own Git blob. Task 6 must resolve
`<integrated-main>:docs/PROGRAM_STATUS.md` after phase-one integration and record that exact path,
blob, and main SHA in the runtime bootstrap/authority-reconciliation evidence. Until then no runtime
authority may invent or cache a status blob.

Supporting Foundation authorities in the same inspected tree are the implementation plan
(`docs/superpowers/plans/2026-08-26-program-supervisor-foundation.md`, blob
`9f14272201ca284cc2b42e707c5554d651eb61e7`) and the dependency baseline
(`docs/superpowers/status/2026-08-26-foundation-security-baseline.md`, blob
`3102f341c1c2815dce2f164646764b28911e9f97`). Tactical visual decisions additionally remain owned
by `DESIGN.md` at blob `85a7942355904c4a57e2e4729491c99a3ae1b97f`.

### Operational coordinates

| Surface             | Exact observation                                                                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared checkout     | `/Users/salvatoredicara/Workspace/d20-folio`, branch `main`, clean HEAD `8c4e37e7ddabe3d8d99a8a1ffe2ef592e3ed2add`. This is non-authoritative operational evidence. Never run its stale worktree recipe or treat local `main` as recipe authority.                   |
| Program control     | `/Users/salvatoredicara/Workspace/Codex/d20-folio-program-control` is absent. Task 6 must create it detached, clean, and exactly at the then-fresh `origin/main` (currently expected `c476f2b3bf2a1cf9d504d8b1281d6979463f2f97`) before any supervisor adapter runs. |
| Private composition | `/Users/salvatoredicara/Workspace/d20-folio-content`, clean branch `main`; HEAD and fresh `origin/main` are `1d5226f564d2c790f5409c294afe9d9ba6cc2ab7`. `content-pack` resolves to that repository's `content-pack/` directory and is read-only for F0.              |
| External runtime    | `/Users/salvatoredicara/Workspace/Codex/d20-folio-program` and `/Users/salvatoredicara/Workspace/Codex/d20-folio-program-bootstrap.json` are absent. Task 6 alone may create/adopt them under the bootstrap protocol.                                                |

Supervisor and manual same-thread adapters run only from the clean detached program-control
worktree or another clean worktree whose HEAD has just been proven equal to fresh `origin/main`.
The shared checkout remains untouched even when its branch name is `main`.

## Active charters

### Foundation — `foundation-f0`

- **Outcome:** integrate the short-lived Program Supervisor Foundation: validated worktree/bootstrap
  authority, reconstructible state/runtime/CLI, one status owner, and the later Task 6 control
  worktree/runtime/heartbeat handoff. This does not close the whole Foundation lane.
- **Authority:** the operating model, Foundation implementation plan, test roadmap, readiness
  baseline, repository lease owner, this status owner, and Foundation security baseline pinned
  above.
- **Dependencies:** approved operating model integrated at `c476f2b3bf2a1cf9d504d8b1281d6979463f2f97`;
  active F0 repository lease; clean retained K1/B00/private evidence; Tasks 0-3 implemented and
  independently reviewed. Task 5 implementation, review, and both full gates are complete; Task 6
  integration/bootstrap remains open.
- **Ownership:** public repository `d20-folio`; worktree
  `/Users/salvatoredicara/Workspace/Codex/d20-folio-program-supervisor-foundation`; branch
  `feat/program-supervisor-foundation`; base
  `c476f2b3bf2a1cf9d504d8b1281d6979463f2f97`; gated pre-receipt HEAD
  `f54f01aaf8999db6224095d1c1023bd207c175cf` (tree
  `d920ad4980bd181611086deacdce2860a60e64e3`); no private write. The charter owns
  `justfile`, `package.json`, `CLAUDE.md`, `PROGRESS.md`, `docs/WORKTREES.md`,
  `docs/PROGRAM_STATUS.md`, `docs/TEST_PORTFOLIO.md`, `scripts/program-supervisor/**`,
  `tests/unit/program-supervisor-{worktree,state,runtime}.test.ts`, and its uniquely named
  `.changeset/program-supervisor-*.md` files. Task 4 itself owns only the five tracked paths named
  in its plan.
- **State and receipt:** `verification`; the tree was clean at gated pre-receipt HEAD
  `f54f01aaf8999db6224095d1c1023bd207c175cf` (tree
  `d920ad4980bd181611086deacdce2860a60e64e3`). The first whole-branch evaluator required fixes.
  Adapter authority (`4d39f30eb1296d7f25a4801c28467b143f86e38c`), dependency/lease state
  (`41114180176d67fda475bb0b060be630031ee9fb`), writer handoff
  (`a14b772739c38ce0f0e180bc84608cc5d16b7c81`), runtime crash integrity
  (`e7cd860df3c16e83f1b5ee7b93029341dfad33ba`), and recovery runbooks
  (`34bf65e9511147858ac0186f23d602a6af9d20c3`) each have focused RED/GREEN receipts and passed
  commit hooks. The pinned Node command/child inheritance proof is
  `51bdb38ba5ca5df6dc826ee896b4b1a916cd6fd1`, with strict typecheck/lint repair at
  `be84367069e47ce029eadf1c11fbdf9aac90df2d`. Fix Round 2 preserves activation history and rejects
  reserved `HEAD` (`7ca90e257d7cf2daa06cc3c5f3a95838b3f3dd31`), models pending/terminal owner-gate cycles
  (`6e2e48f3f79ba1054058797e3dcb3de4806c1153`), fails closed on malformed lock-owner artifacts
  (`4af6f48653eec32864f36e456930d912c1cc1436`), and removes only the two unused Just locals
  (`addc80513176801d56014e9f3b15eb74b53b6bcc`). Each fix has RED/GREEN or source-guard evidence
  and passed its commit hook. Fix Round 3 rejects no-op main authority reconciliation
  (`7d534156b023868d6e1aeab94875f355fed456ac`), freezes authority paths throughout verification and
  owner-gate cycles (`ae8cda59b20356fba56264b313a28915760358c1`), removes the post-proof worktree
  fetch (`306c225dcae986d172948bc17cb1bbbff4a82434`), and makes correctness, visual integration,
  and deployment gates unambiguous (`e816e5e6ba822d49530e8e113de54f6240fc2912`). Each commit has
  focused RED/GREEN or durable-guard evidence and passed its hook. Fix Round 4 enforces the
  supervisor-only cleanup handoff and reserved identity
  (`15ba860436cbb87c6eb94bbe95376b8f21a65abc`), validates authority changes, lease renewal order,
  and multi-repository writer topology (`03c08d9860e4d5eec22bb26ac0105820308ebefb`), claims stale
  locks with deterministic exact-inode evidence (`400ab88e647b3e882d4e89ca1e678564bc02957e`), claims runtime
  roots without replacement while preserving interrupted state
  (`f5eb41971b5408ed41e42df2a6cc524c82488411`), and removes the dead torn-tail recovery projection
  (`7e986f48721bf9bf4411c1b426438b320a69c595`). Each commit has focused RED/GREEN evidence and
  passed its hook. Those Round 4 pathname lock, mutable-cache, and torn-ledger mechanisms are
  historical only: the Fix Round 5 architecture verdict replaced them with a private bare-Git event
  store. The plan amendment is `a7658165e05f87dda7a326a0e693a1ba1edad574`, its in-memory
  parser/symbolic-HEAD clarification is `633c948fea4eec1674d3ab67f32f8b35a734dc68`, the
  equal/earlier renewal boundary coverage is `6cea24e05e9ffbc4d047ee411600a6c87d21e8e6`, and the
  runtime/CLI implementation is `e8ab82ca50e6cd96952db4253fa3880159c7f8ab`. The rewritten
  runtime suite passed 25/25 with real compare-and-swap contention, lost-result adoption,
  crash/incomplete-init handling, strict ref/config/tree/commit/bootstrap validation, residue-free
  read-only rebuild, and CLI receipts. The later scoped review's four Important and two Minor
  findings are addressed together at `39752fec057dceb79b56b5d9a0d5aaf10ca18f5c`: every runtime
  root parent is current-UID-owned and not group/other writable; active Git locks/object temps and
  ref movement receive bounded non-deleting contention handling; accepted candidates remain valid
  when the next writer advances; SIGKILLed `tmp_obj_*` evidence remains fail-closed; full replay is
  one `rev-list` plus three `cat-file --batch` processes independent of chain length; and hermetic
  execution plus recursive no-mutation rebuild are proved. Its runtime suite passed 32/32 and its
  hook passed. The whole-branch evaluator then identified the 32 MiB batch-response ceiling,
  post-scan Git contention classification gap, and stale `Justfile` spelling. The streaming
  correction at `e8d41d1ed3bdd80c8d21baba3d2fcc91ef201113` closes those findings with a
  no-shell incremental `cat-file --batch` frame reader, a 64 MiB per-object/pre-CAS bound, a valid
  33 MiB append/load/rebuild proof, and same-window reclassification of real Git activity that
  begins after the initial residue scan; its runtime suite passed 35/35 and its hook passed. The
  first composed-gate attempt then passed typecheck and lint before Vitest reported
  800/801 files and 18,610/18,611 tests passing. Its sole failure was the worktree shell-injection
  regression exceeding Vitest's global five-second deadline under full-suite load; focused and
  repeated evidence diagnosed an oversized test fixture, with no sentinel leak or product defect.
  Test-only stabilization `5ed51097812b3cade71965e44011386ba2eba5c2` reuses the existing fake
  toolchain instead of performing two real bootstrap/Corepack cycles while retaining the real
  Just/adapter/`worktree.ts` boundary proof. The target now completes in about 1.9–2.2 seconds and
  the whole worktree file passes 22/22. On the exact clean pre-receipt candidate
  `f54f01aaf8999db6224095d1c1023bd207c175cf`,
  `scripts/program-supervisor/bootstrap-worktree.sh --run just ci` then exited zero with 801/801
  Vitest files and 18,611/18,611 tests, 7/7 Functions files and 129/129 Functions tests, plus the
  composed typecheck, lint, and production build. The immediately following
  `scripts/program-supervisor/bootstrap-worktree.sh --run just ci-srd-only` exited zero with 623/623
  Vitest files and 13,035/13,035 tests plus the SRD-only typecheck and production build. This
  receipt commit changes only program/test status documentation and its Changeset; it is
  intentionally not self-embedded and still requires exact read-only review before integration.
- **First lease:** repository lease `F0`, holder `program-supervisor-foundation`, acquired
  `2026-08-26T01:38:26Z`, expires `2026-08-27T01:38:26Z`; active and writable. No runtime lease is
  claimed before Task 6 creates the runtime. The future reviewed runtime lease ID is
  `runtime-foundation-f0`.
- **Acceptance:** Task 1 path/bootstrap tests; Task 2 deterministic state/replay tests; Task 3
  private bare-Git runtime/CLI/read-only-rebuild tests; one routed status owner; exact authority
  blobs; pinned
  toolchain; no shared/private/product-worktree mutation; then independent whole-branch review,
  `just ci`, `just ci-srd-only`, rebuild proof, and Task 6 activation evidence.
- **Independent review:** Task 1-3 scoped reviews are accepted at their recorded commits. The first
  Task 5 whole-branch evaluator returned Fix Round 1; the next review returned the five Fix Round 2
  findings; the next review returned five Fix Round 3 findings; the next review returned six Fix
  Round 4 corrections; and the latest architecture review required the Fix Round 5 bare-Git pivot
  followed by a scoped correction review with four Important and two Minor findings, now addressed
  above plus this authority reconciliation. The whole-branch candidate at `e8e86e0e59047c7a3664413812d0271735391a0c`,
  the test-only stabilization, and the pre-gate status correction each received an independent
  PASS. The exact gate-receipt-only candidate still owes its final read-only review; every fix or
  changed base returns through review before verification.
- **Owner gate:** none for repository integration. Deployment, publication, billing/privacy, and
  any destructive action remain separate owner gates; Task 6 must not deploy.
- **Cleanup:** retain this worktree and branch through remote integration, authority reconciliation,
  runtime writer handoff, and a clean/remote-integrated cleanup-pending receipt. Only the activated
  supervisor may remove them after proving the bootstrap controller is detached, then append
  `cleanup-recorded`. Keep program-control as active infrastructure.
- **Roadmap exits:** Operating Model §11 “Foundation bootstrap” items 1-7 and §12; Foundation plan
  Tasks 5-6. Phase-one F0 completion is not evidence that dependency remediation, test-portfolio
  reset, release/rollback hardening, or the skill/plugin ledger is complete.

### Automation-first — `automation-k1`

- **Outcome and first frontier:** complete the Automation-first program so every knowable D&D
  consequence resolves through one deterministic command/state authority. Its first frontier is
  K1: integrate one strict `resolveCommand` kernel and shared browser/Functions build seam without a
  live caller, second reducer, persistence writer, UI, or generated die result.
- **Authority:** operating model, Automation-first Wayfinder, test roadmap, G0 readiness baseline,
  repository lease owner, and this status owner pinned above.
- **Dependencies:** reviewed G0/T0 foundations are satisfied in current `main`. K1 is serialized
  behind F0 for the next integration boundary: after F0 lands it must fetch and freshly rebase onto
  the final F0 `origin/main`, then re-ground every identity and receipt.
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
  runtime lease or writer is active. Acquire it only after F0 release and exact authority/base
  reconciliation.
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
- **Dependencies:** B00 remains frozen behind F0. After F0 integrates and releases its lease, B00
  must fetch and freshly rebase onto final F0 `origin/main`; explicitly reconcile `package.json`,
  `PROGRESS.md`, and related `pnpm-lock.yaml`; preserve the integrated F0 authority; and consume the
  repaired T8A visual adapter before a new writer lease or integration attempt.
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
- **First lease:** repository lease ID `B00` is declared but inactive. F0's overlapping
  `package.json`/`PROGRESS.md` ownership forbids a B00 writer lease until F0 remote integration and
  release are proven.
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

- **Active writer lease:** `F0` → `program-supervisor-foundation`; exact exclusive paths are
  `justfile`, `package.json`, `CLAUDE.md`, `PROGRESS.md`, `docs/WORKTREES.md`,
  `docs/PROGRAM_STATUS.md`, `docs/TEST_PORTFOLIO.md`, and `scripts/program-supervisor/**`; expires
  `2026-08-27T01:38:26Z`. Its authority pointer is
  `docs/TEST_PORTFOLIO.md@323a34fcac8b4815e8d3630378ce040075cc263f`, reconciled through
  `c476f2b3bf2a1cf9d504d8b1281d6979463f2f97`.
- **Inactive next lease:** `K1`; acquire only after F0 release and a fresh rebase/review/gate cycle.
- **Inactive blocked lease:** `B00`; acquire only after F0 release, T8A adapter repair, overlap
  reconciliation, and exact authority refresh.
- The C0-C4 rows in the lease owner remain serial handoff history/next-owner routing, not extra
  active supervisor leases. No runtime lease exists before Task 6.

Current executable order is F0 review/verification/integration → K1 fresh rebase/review/gates and
integration. B00 stays frozen until F0, the visual-runner dependency, and its taste/screenshot gates
are satisfied. K1 and the later B00 writer may overlap only when their exact leases are disjoint;
integration remains serialized.

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

| Candidate                                                                                                           | Earliest evidence-backed cleanup boundary                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/Users/salvatoredicara/Workspace/Codex/d20-folio-agent-first-operating-model` + `docs/agent-first-operating-model` | Prove integrated commit `c476f2b3bf2a1cf9d504d8b1281d6979463f2f97` is in fresh `origin/main`, the tree is clean, and no Codex task owns it; then remove from program-control and record cleanup.                 |
| Foundation worktree + `feat/program-supervisor-foundation`                                                          | Task 6 remote integration, authority reconciliation, clean/remote-integrated receipt, activated heartbeat, and bootstrap-controller detachment; the supervisor then records `cleanup-recorded`.                  |
| K1 worktree + `feat/automation-k1`                                                                                  | Exact K1 candidate is proven in remote `main`, its evidence is retained, and no task owns the tree.                                                                                                              |
| B00 worktree + `feat/wayfinder-b00-successor`                                                                       | Exact owner-approved rebased candidate is proven in remote `main`, visual artifacts are retained, and no task owns the tree.                                                                                     |
| Incomplete runtime root or persistent Git-internal `.lock`/`tmp_obj_*` residue                                      | Give active cooperating Git evidence only its bounded non-deleting contention window, then preserve persistent residue unchanged for manual quiescent recovery; never adopt, delete, repair, or reinitialize it. |

Never place the active runtime root, immutable bootstrap evidence, program-control worktree, shared
checkout, dirty worktree, or unintegrated branch in the delete zone. Deployment remains owner-only.
