# d20 Folio — repository invariants

This document owns durable cross-cutting product, engineering, safety, and delivery constraints.
It is not a second development methodology: Superpowers owns the generic lifecycle, while this file
adapts that lifecycle to d20 Folio.

## Authority and reconciliation

Use evidence, not labels:

1. The user's latest informed instruction governs the current task unless a higher-level safety or
   legal constraint forbids it.
2. This file and `docs/PRODUCT_CONSTITUTION.md` own durable repository/product constraints.
3. Code, configuration, runtime behavior, tests, git, and deployment records establish operational
   evidence. Tests can be incomplete or wrong; code can implement the wrong intent.
4. Each map/status/history document owns only the role assigned in `CLAUDE.md`.
5. Agent memory and branch notes are leads, never silent overrides.

When sources disagree, identify the owner of the fact, inspect current operational evidence and the
latest accepted decision, then reconcile the owner document in the same change. Do not choose a
document merely because it is newer, longer, or called canonical.

## Decision boundary

Agents resolve technical implementation and tool conflicts autonomously from evidence. Ask the owner
only when the unresolved choice materially changes product/taste, cost or privacy posture, grants new
external authority, performs an irreversible/destructive action, or overturns a durable product
decision. Explain the recommendation and trade-offs in plain language; do not turn technical details
into owner homework.

The owner supervises and decides; agents author repository artifacts. A direct owner instruction that
overrides an invariant is followed when safe, surfaced as an informed override, and either codified as
the new durable decision or kept explicitly one-off.

## Golden rules

### Philosophy

1. **Optimal target, simplest sound implementation.** Settle the correct product/system target first.
   Then use the smallest implementation that preserves correctness, clarity, resilience, a11y,
   security, and tests: delete/reuse/platform/stdlib before new abstraction or dependency. Ponytail
   helps with implementation simplicity; it never lowers the target.
2. **Fix the root seam.** Reproduce, locate the shared cause, and pin it with the cheapest regression.
   Do not patch a caller, infer mechanics from prose, or hide an invariant failure behind a fallback.
3. **Reuse first.** Extend existing primitives, components, helpers, and model homes. A parallel
   representation or bespoke copy of an existing job is a defect.
4. **Autonomy with a finish line.** Decide technical details, complete the coherent unit, verify it,
   and report evidence. Stop only at the decision boundary above.

<!-- Rule 27 keeps its durable identifier outside the thematic sequence. -->

27. **Stability before expansion.** Finish an in-flight coherent unit, then clear known functional,
    visual, accessibility, or UX regressions before opening new capability work.

### Architecture and data

5. **The Grant seam and dependency direction are hard boundaries.** Mechanic-bearing facts are typed
   Grants; the evaluator aggregates them; presenters may localize; UI consumes the result. Engine/data
   never import UI, and engine core never localizes.
6. **One owner per fact, edit anywhere through it.** Shared pure seams derive every view; multi-surface
   edits update the same model with safe transactions/deltas. Never keep two copies synchronized.
7. **IDs are truth; labels are views.** Never branch on or persist translated/display strings. Store
   IDs and genuine user-authored prose; resolve labels at render time.
8. **Override-first.** Every derived value computes correctly by default and exposes an explicit
   manual override where the product allows one. An override never excuses missing automation.
9. **Bilingual by construction.** Every user-visible string ships in both EN and IT through i18n.
   Never use `defaultValue`, hardcoded UI prose, empty IT, or byte-identical untranslated English.
10. **Migrate forward, then remove the old world.** Prefer one current shape over permanent legacy
    branches. Live migrations use dry-run → snapshot → idempotent apply → complete verification;
    remove spent scripts and obsolete code only after verified coverage.

<!-- Rule 28 keeps its durable identifier outside the thematic sequence. -->

28. **The public repo and private pack are one product.** The split is licensing, not scope. Any seam
    the pack mirrors or consumes is updated and verified in both compositions in the same logical unit;
    a temporary concurrency handoff is explicit and tracked.

### Process and delivery

11. **One worktree per task; no PR flow.** Branch from fresh `origin/main` with `just wt-new`; never
    edit/commit/switch the shared checkout. After review and green gates, rebase, push explicit
    `HEAD:main`, confirm the SHA, and remove the worktree. The owner remains sole commit author; no
    co-author/footer/trailer.
12. **Review before integration.** Use Superpowers' requesting/receiving-code-review workflow for
    correctness and requirement coverage, plus ponytail-review when the diff risks unnecessary
    complexity. Address or reason about every actionable finding, then re-verify the final diff.
13. **TDD for behavior changes.** Use Superpowers test-driven-development: observe the test fail for
    the intended reason, implement the smallest sound change, and keep the cheapest test that pins the
    fact. Guard inputs derive from the artifact and state their blind spots; prove guards by mutation.
14. **Every check has one lane.** Keep pre-commit fast, the `main` pre-push gate authoritative, heavy
    E2E sharded remotely, and deploy as promotion of a verified SHA. Never use `--no-verify` or add
    duplicate slow checks “for safety.”
15. **Verify behavior in the environment that can observe it.** Use Superpowers verification before
    completion. For UI, layout, motion, service workers, and accessibility, use a real browser and the
    relevant locale/theme/viewport matrix; jsdom is not visual proof.
16. **Living documentation has four roles.** Constitution states durable rules; Map explains the
    system; Status tracks now/next; History records change. One document owns each fact. Reconcile the
    owner in the same commit, keep links valid, and verify status claims before acting. Memory stores
    pointers/context only, never secrets or normative rules.
17. **Releases move in lockstep.** `just release` consumes changesets, produces a curated changelog,
    version commit, tag, and GitHub release. Issue-fixing commits use closing keywords. Release and
    deploy remain separate owner-triggered actions.
18. **Use proven tools by role, not prestige or accumulation.** Superpowers owns the lifecycle; ECC
    provides selected specialist skills; Find Skills discovers candidates; claude-mem retrieves
    context; Task Observer records process improvements. Vet instructions and security before install,
    prefer official/proven sources, replace weaker overlaps, and keep expensive capabilities lazy.

### UX and design

19. **Impeccable owns UI/UX craft.** Apply `impeccable` with `PRODUCT.md`, the Product Constitution,
    and `DESIGN.md`. Show only what is necessary and all that is necessary; design complete states,
    desktop/mobile, dark/light, accessibility, motion, and reusable tokens/primitives.
20. **Frictionless, industry-standard interaction.** Automate what the app knows, constrain inputs so
    invalid states are unreachable, edit visible facts in place, make the natural next action obvious,
    and support beginners without slowing experts.

<!-- Rules 25–26 keep their durable identifiers outside the thematic sequence. -->

25. **Every visual change is owner-approved before integration.** Send curated before/after Chromium
    screenshots cropped to the affected region, covering the locale/theme/viewport combinations that
    materially differ. Wait for approval before `main`; deployment remains a separate gate.
26. **Discover ambiguous product intent before implementation.** Use Superpowers brainstorming and,
    when a real interview is needed, grill-me. For contested UI choices, Impeccable decides from the
    product/design system; if a meaningful tie remains, show concrete visual alternatives to the owner.
    Rapid previews de-risk a direction but do not replace rule 25's real-build gate.

### Safety and quality

21. **No dice rolling, ever.** No RNG or virtual dice. Show formulas; deterministic effects may apply
    with undo, while dice-dependent effects require the user's external result.
22. **Deploys are owner-gated; safe migrations are autonomous.** Never deploy without explicit
    per-change permission. Forward live-data migrations may run autonomously only under rule 10's
    snapshot/verify protocol. Destructive non-migration operations require explicit approval. Rules
    changes ship emulator tests; live-user fixtures remain green.
23. **Dependencies are vetted; secrets stay out.** Prefer existing/platform capabilities. Before a new
    runtime dependency, verify necessity, maintenance, size, license, and security. Keep secrets only in
    approved local/CI/Secret Manager stores and never in logs, docs, prompts, or memory.
24. **Accessibility, performance, and cost are release bars.** Axe serious/critical findings are zero;
    bundle/precache budgets hold; listener and write behavior respects Firebase limits; offline behavior
    remains functional.

## Domain invariants

- **D1 — Persistence hygiene:** cascade-delete owned sub-resources, strip `undefined` before writes,
  and keep CI-pure modules free of Firebase imports.
- **D2 — Italian authority cascade:** official IT SRD 5.2.1 → authoritative Wizards/Asmodee sources →
  BG3 IT localization for non-SRD tie-breaks → two-source community verification → marked AI
  translation. `docs/IT_NAME_REGISTRY.md` owns the chosen lexemes.
- **D3 — Locale-aware units:** store neutral values; render with `formatSpeed`, `formatWeight`, and
  `localeDistance`.
- **D4 — 2024 species:** no Half-Elf/Half-Orc species; mixed heritage uses one parent species.
- **D5 — 2024 background ASI:** the background supplies constrained +2/+1 or +1/+1/+1 choices.
- **D6 — Scaling:** class features scale on owning-class level; feat/species features on total level.
- **D7 — Fixtures:** `MOCK_CHARACTER` is the only production mock; dev scenarios and six team files are
  verification fixtures, never production data.
- **D8 — Sync:** auto-save persists character and session together and prevents server echo loops.
- **D9 — Campaign/combat ownership:** a character belongs to at most one campaign; mutable HP,
  conditions, initiative, and death saves have the single model home documented in Architecture.
- **D10 — React purity:** no time/RNG/ref reads during render or synchronous effect-driven state loops;
  the React Compiler remains disabled unless a new measured decision replaces that choice.
- **D11 — Licensing is not scope:** alias of rule 28 for existing references.

## Maintaining these invariants

Amend the existing numbered rule when a decision refines the same concern. Add a new rule only for a
genuinely distinct, durable constraint, keeping identifiers unique and updating every reference.
Operational procedures belong in their runbook; current state belongs in Status; superseded rationale
belongs in History rather than accumulating here.
