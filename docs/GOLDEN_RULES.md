# d20 Folio — Golden Rules

> The non-negotiable cross-cutting disciplines for every agent working this repo. **Read every
> session, before any work.** Violating one is never acceptable. The supreme PRODUCT/UX/design law
> is `docs/PRODUCT_CONSTITUTION.md`; this doc owns everything cross-cutting (engineering, process,
> safety). Kept EXACT, COMPLETE, and CURRENT — if reality and this doc disagree, the doc is the bug;
> fix it in the same commit as the work.

## Precedence

When guidance conflicts, resolve in this order — higher wins:

1. **The owner's live word** (this conversation).
2. **`CLAUDE.md` hard constraints** (zero-budget, bilingual, offline-first, no dice, live users).
3. **`docs/PRODUCT_CONSTITUTION.md`** — for product/UX/design questions.
4. **This doc** (`docs/GOLDEN_RULES.md`).
5. **The other canonical docs** (`docs/ARCHITECTURE.md`, `DESIGN.md`, …).
6. **Agent memory** — context only, NEVER a rulebook. A memory contradicting a committed doc is
   stale by definition.

**Informed override:** if the owner's instruction contradicts an existing rule, comply — but
SURFACE the contradiction explicitly, so the owner decides knowingly (and the rule gets amended or
the exception stays one-off).

## The four forks — the ONLY reasons to stop and ask

Stop and ask the owner on exactly four kinds of fork; every other steering text that says "ask"
means THIS list:

- **(a) Taste / product direction** — which of two good options looks/feels right; for a
  contested UI/UX call specifically, rule 26 governs HOW this fork resolves (impeccable decides
  first, owner-with-screenshots only as the tie-breaker).
- **(b) Irreversible actions** — a production deploy or external publishing. Migrating the live
  data FORWARD to its new optimal shape is NOT this fork (rule 10 runs it autonomously under a
  snapshot-verify net); only a destructive live-data op with no migration purpose — mass
  deletion, an unrecoverable rewrite — still stops here.
- **(c) Unsanctioned structural change** — a new dependency, a schema change, a new top-level doc
  or surface.
- **(d) A steering-doc conflict that survives the precedence table.**

Everything else: decide and keep moving — never ask "should I proceed?". At a genuine fork, don't
guess silently: present the options crisply with a recommendation and trade-offs (the `grill-me`
skill when it warrants a real interview).

## Golden rules

### Philosophy

**The owner writes nothing.** The owner never hand-writes anything in this repo — not code, not
docs, not changelog lines, not release notes. Agents author everything; the owner supervises:
judges, drives, advises, tests, and gates (deploy + the four forks). Any rule or flow that implies
the owner hand-writes an artifact is a bug.

1. **Optimal target, laziest path.** First determine the OPTIMAL design — no tradeoffs against
   correctness, clarity, resilience, a11y, security, or tests, ever; if optimal means
   re-architecting, do it (a design that feels convoluted IS the re-architect signal; the test
   suite is the safety net for bold rework). THEN reach that target by the ponytail ladder: does
   it need to exist (YAGNI) → reuse what's already here → stdlib → platform feature → an
   already-installed dependency → the least code that works. Deletion over addition; boring over
   clever; no speculative flexibility, no unrequested abstraction, no config for a value that
   never changes. Ponytail governs HOW you build, never WHAT you settle for — a bold rewrite that
   deletes more than it adds is peak ponytail. The `ponytail` skill applies IMPLICITLY to every
   code change in this repo; don't wait to be told.
2. **Root cause, declare the least.** Never patch a symptom or a single caller — fix the shared
   seam every caller routes through, and ship the regression test (rule 13). A missing derived
   value means the engine failed: fix it at the seam (a `Grant` kind + evaluator branch +
   consumer), NEVER hand-declare a derived value or regex over prose. Declare the least; infer the
   rest. Never default a value the type or domain guarantees non-null (`?? 0` / `?? ""` / `?? []`
   or any equivalent fallback) to satisfy the compiler or move faster — an unjustified fallback
   silently converts a bug into wrong data; prove the invariant instead (thread a required prop
   from where it holds, or assert at the boundary where the guarantee enters).
3. **Reuse first — fixes propagate.** Never write a new component/recipe/helper when one exists.
   Build on the shared primitives (`matchesSearch`, `OptionGrid` + picker parts, `InlineEditable`,
   `NumberStepper`, `InfoCard`, the one mock — the roster in `DESIGN.md` §15.6). Few elements,
   reused, so a fix in one place flows everywhere and every surface stays visually consistent.
   When something looks cheap/unstyled, adopt the recipe a sibling surface already uses — don't
   author bespoke CSS or a parallel widget.
4. **Autonomy — decide and keep moving.** Maximum autonomy, unconditionally: build, decide, report
   at milestones; stop ONLY at the four forks. Finish the unit you're in (gate green) before
   switching tasks; the one thing you do immediately, even mid-task, is capture every new owner
   request in `PROGRESS.md` so nothing is forgotten — defer acting, never capturing. Everything
   factual you settle yourself.

<!-- Rule 27 keeps the next global id (rules are numbered by provenance, then placed in their
theme group — see "How to add a rule"); this comment breaks the list so Prettier does not
renumber it into the 1–4 sequence. -->

27. **Stability first — a clean board precedes the next feature.** At every stage a perfect,
    stable app is preferable to a new feature built while bugs remain: a correct, bug-free app is
    the standing goal, never a feature-rich-but-broken one. When ANY known bug or regression exists
    — a broken flow, a visual regression, an orphaned surface — fixing it takes STRICT priority over
    new-feature work: defer the feature tier, clear the board, THEN resume building. This orders the
    QUEUE; it never abandons a half-done unit — finish the unit you're in (rule 4), but never OPEN
    new-capability work over an unstable board. The constructive twin of rule 22's "never break the
    deployed app": rule 22 forbids introducing regressions, rule 27 makes clearing the existing ones
    outrank the next feature (owner, 2026-07-07).

### Architecture & data

5. **The grant seam is sacred; dependencies point one way.** Every mechanic-bearing fact is a
   typed `Grant`; `evaluateGrants` aggregates; the UI reads the aggregate. Adding a mechanic = a
   `Grant` kind + an evaluator branch + a consumer — never mechanics computed from prose. The
   engine (`lib`/`stores`/`data`/`types`) NEVER imports the UI (`features`/`app`/`components`/
   `hooks`); engine-core never localizes — only `lib/views/` does. A cross-aggregate concern lives
   in a feature-layer orchestrator composing engine primitives. Guard-enforced
   (`architecture-direction.guard`, `pure-modules-guard`).
6. **One source of truth — edit anywhere.** A fact lives in ONE place; every surface derives its
   view through one shared pure function, so surfaces agree BY CONSTRUCTION, never by discipline.
   Everything editable has exactly one model home even when editable from many places (HP /
   conditions / initiative from the sheet OR the encounter): every edit surface reads and writes
   the one source, and the APP carries the consistency burden — transactions,
   `arrayUnion`/`arrayRemove`, clamped deltas — never the user. One idea = one component (a
   per-surface copy of a shared idea is the bug), and a control lives ON or beside the value it
   changes — never scattered, never duplicated where two copies could disagree. Same for
   translations: one semantic unit = one i18n key (prefer `common.*`; duplicates allowed only for
   legitimate locale divergence, dynamic-token keys, or plurals — guard-enforced). Reconciling two
   copies of a fact? That IS the bug: collapse them.
7. **Ids are the only truth.** Never branch on a display string; a hardcoded locale/display string
   outside `src/i18n/**` is FORBIDDEN in code, data, stored docs, logs, fixtures, mocks, and tests
   — the only stored strings are genuine user input (bio, notes, homebrew names). Pickers bind to
   and emit ids; labels are derived at render; engine logic resolves ids first and branches on
   ids. Branded id types make a leak a compile error — leaks are impossible by construction,
   caught at build. If live data holds display strings, migrate the data (rule 10).
8. **Override-first.** Every derived value auto-computes by default AND exposes a manual override
   in the UI. Being override-able does not make a mechanic "done" — the default must compute.
9. **Bilingual by construction.** EN + IT for everything user-visible — no English-only string
   ships. Add the key to BOTH `{en,it}` shards on the spot (IT via the priority cascade, domain
   rule D2 — never left empty, never byte-equal English); zero translatable strings in TypeScript;
   never `defaultValue`. Completeness is code-enforced by six independent locks (throwing
   resolver, throwing missing-key handler, no-`defaultValue` lint, parity + no-empty test,
   locale-sweep render, build-time leak-lock) — fix the leak, never weaken a detector.
10. **Migrate, then delete completely.** Superseded ⇒ the old thing is removed ENTIRELY — field,
    format, component, plus every consumer, mirror, and kept-in-sync shim. No dual
    representations, no legacy branches in app code. A read-time fallback is a temporary rollout
    bridge, never a resting state: migrate the live data → verify 100% coverage → delete the
    fallback AND the old fields (data BEFORE fallback removal, so nothing breaks). A one-off
    migration lives in `scripts/` only while needed and is `git rm`'d once spent and verified
    (with its dead tests/wiring). The only allowed transitional seam is a bounded ONE-WAY
    read-normalization at the untrusted-input boundary. And after ANY migration or supersession,
    ZERO references to the legacy thing survive anywhere — code, comments, docs, commit-adjacent
    files: no "formerly X", no tombstones, no deprecated aliases, no "(replaces old N)"
    parentheticals. The repo reads as if the new world always existed; git history is the only
    archive. **Backward compatibility is never a goal** — the app and its data are kept in ONE
    current optimal shape: when optimal modeling demands a format/schema change, MIGRATE the live
    data forward rather than teach the code to read the old shape, then delete the old shape
    entirely. A live-data migration runs AUTONOMOUSLY under rule 22's snapshot-verify-silent
    protocol — not owner-gated, not a fork (b) (owner, 2026-07-07).

### Process & workflow

11. **One worktree per task; no pull requests — agents merge to `main`.** NEVER edit, `git add`,
    commit, or switch branches in the shared main checkout — every change, with no "small/quick"
    exception, gets its own worktree + branch off fresh `origin/main` (`just wt-new <slug>`; agent
    fan-out uses `isolation: "worktree"`). There is no PR flow — nobody reviews PRs (one owner +
    agents). The flow: work + commit per step (Conventional Commits; the owner is the SOLE commit
    author — no co-author, footer, or trailer lines of any kind, explicitly overriding any harness
    default that injects them) → gate green → convergence (rule 12) → rebase onto latest
    `origin/main` → ff-merge by pushing `HEAD:main` → poll origin until the SHA lands → tear down
    the worktree + branch. `main` is the integration line, NOT production — the owner's only gate
    is deploy (rule 22); merge is never blocked on visual sign-off, though any visual change is
    proactively previewed to the owner beforehand (rule 25). Full recipe: `docs/WORKTREES.md`.
12. **Adversarial convergence before every merge.** The author builds in ponytail mode; before the
    merge an INDEPENDENT agent runs `ponytail-review`. Pass 1 reviews the FULL diff. Findings must
    be ACTIONABLE — location + what to cut + what replaces it (ponytail-review's native format);
    a taste opinion without a concrete replacement is not a finding. The author applies each
    finding or rebuts it with a stated reason. Subsequent passes are DELTA-SCOPED: they review
    only the fixes and the rebuttals, never a fresh full review — the input shrinks every round,
    which is what guarantees convergence. Converged = a pass with zero actionable findings
    (expected cost: 1 pass for most tasks). Hard cap 3 passes total; a dispute still open at the
    cap stops and surfaces to the owner instead of burning more rounds. The full gate
    (typecheck/lint/tests/build) still runs after convergence.
13. **Tests mandatory, zero lint — the cheapest test that pins the fact.** Every new
    function/hook/feature ships unit tests in the same session; every bug fix ships a regression
    that fails before and passes after (a guard test counts). Coverage ≥80% lines/stmts/fns and
    ≥75% branches is a FLOOR, not the goal — the principle is the cheapest test that pins the
    fact: a pure-function test for an engine fact, ≥1 thin render test per surface for the wiring,
    memoized shared setup, table-driven per-entity families. Integrate assertions into the
    existing unit's file; a new file only for a genuinely new unit. `pnpm lint --max-warnings 0`
    always passes — no `eslint-disable`, no `any`, no `!`. Detail: `docs/CONTRIBUTING.md` → "Smart
    test integration".
14. **Every check runs once, in its one lane.** pre-commit is FAST (~5 s: changeset doc-guard +
    lint-staged + fast unit lane); pre-push is the FULL authoritative gate (typecheck ∥ lint ∥
    coverage, then build); deploy runs the full Playwright e2e matrix (LOCAL-primary
    `just deploy`; `deploy.yml` is its dispatch-only remote twin); remote CI is the lean `ci.yml`
    push/PR gate — ambient only where it's free (self-skipping while the repo is private).
    Never add a slow check to a hook "to be safe" — move it to the deploy/CI lane; never run a
    check twice on one path; **never `--no-verify`**. Lane detail + CI economy:
    `docs/CONTRIBUTING.md` → "The gate split".
15. **Self-verify everything; the owner only judges taste.** Behavior is real only when SEEN: run
    the app, drive the surface, screenshot it (dark + light, desktop + mobile). If a surface is
    hard to reach, BUILD the seam (scenario injector, screenshot harness); if a test blocks you,
    enhance it. jsdom cannot see CSS motion — verify animation/transition work frame-by-frame in a
    real browser. Every visual change ships curated screenshots SENT to the owner's phone
    (SendUserFile — file paths in a report are NOT delivery), each CROPPED/zoomed to the region the
    change actually affects and delivered as a BEFORE/AFTER pair wherever a prior state exists — so the
    diff reads at a glance, never a whole-page shot that makes the owner hunt for it; a full-page shot
    is right ONLY when the change IS the whole page (a new layout, a theme, a full redesign)
    (owner, 2026-07-21) — plus exact look-here steps framed as
    "tell me if you like it", never "verify it works". Escalate only taste (fork a). TUI sketches,
    ≥2 genuinely different alternatives, and per-alternative mobile behaviour are for ESCALATED
    taste forks or owner-requested proposals only — routine UI work is decided by the agent
    (`impeccable` + the constitution) and shipped with the after-screenshots. Those snapshots
    reach the owner BEFORE any manual test or merge, always — the standing preview mandate is
    rule 25.
16. **Durable knowledge lives in committed docs — memory is never a rulebook.** Anything that must
    survive a session (rules, decisions, plans, conventions) goes into the right canonical doc in
    the SAME commit as the work. Every change updates its canonical doc and stages a
    `.changeset/*.md`; broken cross-references are bugs. **The tracking docs are a truthful live
    mirror of the repo, never a stale wish-list:** `PROGRESS.md`, `docs/AUTOMATION_BACKLOG.md`,
    `docs/AUTOMATION_COVERAGE.md`, and every roadmap / coverage / status matrix must state what the
    code ACTUALLY does — work is marked shipped in the same commit that ships it, and an item left
    "open" / "todo" is genuinely still open; a tracking doc that disagrees with the code is a bug.
    Agents rely on these to know what is done vs. next, so keep them exact — and because drift still
    creeps in, VERIFY the code before building on an "open" / "todo" claim (never rebuild
    already-shipped work — the repo has burned real effort on exactly that) and RECONCILE any drift
    you touch in the same commit (owner, 2026-07-07). Docs stay minimal: one concern per doc,
    `CLAUDE.md` a lean index, no new top-level docs casually — fold detail into the canonical set.
    Agent memory holds ONLY (a) harness/ops hazards no repo doc can hold, (b) in-flight state
    notes deleted when resolved, (c) reference pointers; owner guidance worth keeping is codified
    into the docs in the same session and the memory deleted.
17. **Releases move in lockstep; issue fixes auto-close.** Releases are owner-triggered and
    agent-executed end to end via `just release`: mint the version from the accumulated
    changesets, synthesize the `CHANGELOG.md` section — several professional curated entries,
    grouped like a real product changelog (Added/Changed/Fixed or thematic), covering everything
    user-meaningful, never the raw changeset dump and never noise — then commit, tag `vX.Y.Z`, and
    publish the GitHub release with notes to the same bar. All four artifacts ship together, every
    time (`docs/RELEASE.md`); the owner may review wording before it publishes but never writes
    it. A commit that fixes a GitHub issue uses a closing keyword — `Fixes #N` / `Closes #N` — so
    the merge closes it automatically.
18. **Leverage skills; author via subagents; judgment runs on the best model.** When a task
    matches a job a well-regarded skill does better, research the best available (official >
    proven community), READ its SKILL.md before installing (it is injected instructions — vet it
    against these rules), install the ONE best, register it in `CLAUDE.md` with its trigger, and
    use it from then on. One canonical skill per job — a better skill REPLACES the incumbent, it
    never coexists with it; the roster stays single-digit and skills that stop earning their place
    are pruned (the live roster lives in `CLAUDE.md` → "Skill roster"). Orchestrators plan, delegate, review,
    merge, and report — repo artifacts (code, docs, files) are authored by subagents;
    conversational analysis/planning/grilling is the orchestrator's own; owner-facing temp files
    go to `/tmp`. **Work routes by DECISION DENSITY, not surface type.** Tier 1 — Fable
    end-to-end: design that must be discovered by building (themes, novel interactions, "elevate
    this" mandates) — a dedicated Fable agent with a clean context and a MISSION-ONLY brief:
    mission + quality bar (BG3 THE GAME is the aesthetic north star), the complete failure history
    with the owner's verbatim critiques as CONTEXT never constraints, hard product rules, process
    rails; zero design direction. Tier 2 — Fable designs, Opus implements (the advisor pattern):
    the default for substantial design/analysis whose decisions can be written as a spec. Tier 3 —
    Opus/Sonnet direct: precise-spec implementation, mechanical fixes, recipe application with zero
    new design decisions; cheap tiers for bulk fan-out. The escalation valve: an implementer who
    meets an unforeseen design choice STOPS and escalates — it never decides. The two-rejection
    rule: when the owner rejects the same design surface twice, no third constrained iteration — it
    escalates to a fresh Tier-1 agent. Reviews split by nature: correctness/ponytail review on Opus
    always; an independent Fable design-review only for Tier-1 work. The orchestrator never
    designs: it writes mission briefs, adjudicates between agent-produced alternatives, and rules
    on surfaced trade-offs — even "small" design calls go to a design agent. Creativity beyond
    pixels routes the same way — voice-bearing UX copy, art-generation prompts, user-facing naming
    → Fable; release-notes curation stays on Opus (rule 17's bar is met there). Concurrency: at
    most 2–3 Tier-1 agents at once, queue the rest; Fable agents delegate their own mechanical
    fan-out to cheap tiers. (owner, 2026-07-10)

### UX & design

19. **Impeccable — and only-and-all-the-necessary.** Use the `impeccable` skill for any
    design/redesign/polish/audit of an interface (it reads root `PRODUCT.md` + `DESIGN.md`;
    `DESIGN.md` §15 is the project checklist). Every surface: at-a-glance common info, on-demand
    detail (progressive disclosure), complete states (hover/focus/loading/empty/error/edit),
    desktop + mobile, dark + light each DESIGNED, never adapted. And the canonical cross-cutting
    principle (Constitution §4.15 points here): show the user only what is necessary, and ALL of
    what is necessary — every element earns its place, no decoration masquerading as information;
    when in doubt, leave it out.
20. **Frictionless, industry-standard UX.** Follow well-established patterns; minimize what the
    user must do — the app automates, never asks twice, never makes the user restate what it
    knows. Optimal navigation between related surfaces (sheet ↔ campaign hub ↔ encounter): the
    naturally-next surface is one obvious step, never a dead end. Constrain inputs so an invalid
    state is unreachable, not scolded after: clamped numeric fields, select-on-focus, every valid
    value reachable by typing AND stepping (`DESIGN.md` §15.7). Components are adequate to their
    data: an input no wider than its longest legal value, a display sized to its content, identity
    text never mid-string truncated. Editing happens IN PLACE — never a sub-page for a visible
    field. Beginner-friendly, expert-capable: plain-language tooltips on demand, micro-copy,
    errors that explain why + what to do; experts can ignore every hint.

<!-- Rule 25 keeps the next global id (rules are numbered by provenance, then placed in their
theme group — see "How to add a rule"); this comment breaks the list so Prettier does not
renumber it into the 19–20 sequence. -->

25. **Owner previews every visual change — snapshots proactively pushed, not a merge gate.** ANY
    change carrying a visual/UX surface — a bug fix, a new feature, a redesign, a single token
    tweak — is captured as before/after snapshots (real Chromium, the rule-15 matrix: both themes,
    EN + IT, desktop + mobile wherever they differ, each CROPPED to the region the change affects —
    rule 15) and PROACTIVELY PUSHED to the owner's phone
    (SendUserFile) so the owner previews and monitors every UI/UX change continuously, before ever
    being asked to test it manually. This holds whether or not the owner is away, so no visual
    change lands unseen. It adds NO new merge gate: `main` still integrates freely (rule 11) and the
    owner's only approval gate stays deploy (rule 22) — and because a visual change reaches users
    only via an owner-triggered deploy, the owner necessarily previews it before it ships. Rule 15
    is HOW that review runs (Chromium capture across states/themes); rule 25 is the standing mandate
    that the push ALWAYS precedes the owner's manual test — the visual counterpart to rule 15's
    review loop (owner, 2026-07-06).
26. **Contested design decisions resolve via `impeccable`, then the owner's eyes.** When a UI/UX
    choice is genuinely uncertain or contested — two or more defensible treatments, or a
    previously-settled call being reopened — `impeccable` is the deciding authority: run it and
    follow its verdict. If impeccable itself cannot break the tie, STOP and present the owner
    concrete visual alternatives (a screenshot per option) and let the owner decide (fork a). Never
    silently coin-flip an option, and never silently fall back on a stale prior decision once the
    choice is genuinely reopened. Companion to rule 25: rule 25 = preview every visual change; rule
    26 = how a CONTESTED visual choice gets resolved — impeccable first, owner-with-screenshots as
    the tie-breaker (owner, 2026-07-07).

### Safety

21. **No dice rolling, EVER.** The app never rolls: no `Math.random()` for dice, no RNG, no
    virtual dice, no auto-rolled results. Show formulas; the player rolls externally.
    Deterministic amounts may one-tap apply (undoable); dice amounts are roll-entry-then-apply,
    never auto-rolled.
22. **Deploys are owner-gated; live-data migrations run autonomously under a safety net.** NEVER
    deploy without explicit, per-change owner permission — a one-time OK is not standing
    authorization; merges accumulate on `main` UNDEPLOYED; report "ready to deploy" and WAIT;
    never deploy inside any loop or automation. Production Firestore/Storage MIGRATIONS are the
    exception (owner, 2026-07-07): they run AUTONOMOUSLY — no per-change OK, no ping; the owner
    sees them in the changelog — but ALWAYS under the mandatory safety protocol: self-verify with
    a dry-run / `--check` pass → SNAPSHOT the affected docs to a local backup → apply idempotently
    → verify every doc post-apply → keep the snapshot until verified green → migrate data BEFORE
    any read fallback is removed (rule 10) → `git rm` the script once spent. The snapshot is the
    recoverability net that makes autonomy safe. A destructive NON-migration op (mass delete,
    unrecoverable rewrite) is not covered — that stays fork (b). `firestore.rules` /
    `storage.rules` changes MUST ship emulator rules-tests (`pnpm test:rules`). Live users since
    2026-06-08: schema / derived-value / string-storage changes validate against the 6 team
    fixtures; never break the deployed app.
23. **Dependencies vetted; secrets never in the repo.** A new npm dependency is a stop-and-ask
    fork (c): prefer stdlib/platform per the ladder (rule 1); if genuinely needed, vet
    maintenance, size, and licence first. Secrets never live in the repo or in memory files —
    `.env.local` / CI repo secrets / Secret Manager only; service-account keys are referenced by
    path, never inlined.
24. **A11y and performance are committed bars.** axe serious/critical = ZERO across every surface
    × both themes (WCAG 2.1 AA — enforced by `tests/e2e/a11y.spec.ts`; re-run after any
    light-token change). The eager-bundle budget and its guard test hold. Firebase free-tier
    discipline: listener/subscription restraint (no redundant listeners, no polling), debounced
    writes (~2 s auto-save).

## Domain rules

- **D1 — No leaks.** Firestore/Storage sub-resources cascade-delete (portrait → snapshots → doc);
  strip `undefined` before any write (`stripUndefined`); CI-pure lib modules stay free of Firebase
  imports (`pure-modules-guard`).
- **D2 — Sources of truth + the IT cascade.** EN 2024 mechanics: `http://dnd2024.wikidot.com/`
  (retrieval workflow: `content-pack/docs/SOURCING.md`). IT terms, in priority order: (1) the official
  **IT SRD 5.2.1** PDF (read via `pypdf` + grep); (2) other authoritative IT sources (Asmodee
  Italia, Wizards IT, errata); (3) reputable community sources (cross-check ≥2); (4) only then
  AI-translate anchored on SRD terminology + a `// AI-translated` comment. Never trust the IT
  fandom wiki (2014 edition).
- **D3 — Locale-aware units.** Store speed as a plain number string (`"30"`); display via
  `formatSpeed` (EN `30 ft`, IT 1,5 m per 5 ft); weight 1 lb = 0,5 kg (`formatWeight`,
  `localeDistance` — `src/lib/utils.ts`).
- **D4 — 2024 species rules.** "Half-Elf"/"Half-Orc" do not exist — mixed heritage plays one
  parent species.
- **D5 — 2024 background ASI.** Ability increases come from the background (+2/+1 or +1/+1/+1),
  constrained to its three eligible abilities; the wizard prompts and `backgroundAsi` is populated.
- **D6 — Level-up scaling.** Resolve ALL level-dependent values from the class table + feature
  data at the new level; a class feature scales on its OWNING-class level, a feat/race feature on
  total level (`featureScalingLevel`).
- **D7 — One mock, all edge cases.** `src/lib/mock.ts → MOCK_CHARACTER` (Lyra Voss, Elf Bard 9) is
  the only production mock — extend it, never add a second. Dev/test carve-out: the
  `dev-scenarios.ts` injector and the 6 team fixtures are verification fixtures, not mocks, and
  are standard practice (production never loads them).
- **D8 — Sync saves session + character together.** Auto-save (`useCharacterSubscription`)
  debounces and always writes both; `isFromServerRef` prevents loops.
- **D9 — One campaign per character.** Enforced at the attach seam (`Party.attachMyCharacter`
  verifies via `listSharedCampaigns` before writing; swap-within and detach always allowed). The
  combat-mutable trio (HP/conditions/initiative/death saves) lives SOLELY in the per-character
  `combat/state` subdoc (`docs/ARCHITECTURE.md`).
- **D10 — React purity.** No `Date.now()`/`Math.random()` in render, no `.current` reads during
  render, no synchronous `setState` in effects. (The React Compiler itself is deliberately NOT
  enabled — `docs/CONTRIBUTING.md`.)

## How to add a rule

1. First ask: is it a FACET of an existing rule? Then amend that rule (same commit as the work) —
   the count stays small (~27); never restate an existing rule under a new number.
2. A genuinely new discipline appends to its theme group with the next number, tagged
   `(owner, YYYY-MM-DD)` where the provenance matters.
3. Write it once, tight, enforceable; update every doc that should point at it. `CLAUDE.md` only
   POINTS here — never re-inline rule text there.
