# Codex re-review of the restart proposal v3

**Verdict: needs-attention.** V3 fixes the shape of the process: breadth precedes repeated slice
loops, experiments precede expensive commitments, real participants test an outcome, and either
provider can own a complete task. Of the original 21 findings, **11 are closed and 10 partly
closed**. None was left entirely untouched. The remaining work is a bounded reconciliation of
rules, evidence and executable instructions; another general research round is unnecessary.

Reviewed on **2026-09-12**, against **`0addfd6d59d3b874809d146a25817459ef12788e`** on
`claude/d20-folio-redesign-planning-3weqk7`. The requested filename says September 14; that is not
the date of observation. All repository source links below pin the reviewed commit. I read v3,
Claude's response, my original review, the seven reports and the relevant existing decisions. I
compared semantic changes, checked consequential claims against primary sources, inspected the
installed interview skill, and ran the small verification probes described below.

“Closed” means the **proposal-level remedy is adequate**, not that a planned spike, playtest,
permission boundary or migration has already passed. I did not execute the proposed model
calibration, conduct a live product comparison, or test the future review runner. This is a
re-review by the original Codex reviewer, not a claim of a blind or newly isolated evaluation.

There are **seven new or residual findings: one blocking, five major and one minor**. Blocking
means resolve before adopting the operating contract; major means resolve before the affected
work; minor means a local clarification. Optional taste differences do not block approval.

## 1. Disposition of the original 21 findings

Numbers refer to the [original Codex review][original]. The evidence column explains both the
credit given and any remaining condition; N01–N07 refer to §2 of this review.

| Original                                          | Status            | Evidence and remaining condition                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 — Eleven-step waterfall                        | **closed**        | [§4, lines 172–198][p-loop] separates a whole-product breadth pass from repeated depth loops and permits disposable sketches before approval. This preserves the owner's full inventory without requiring full specification before learning.                                                                                                               |
| 02 — Leading discovery interviews                 | **closed**        | [§4, lines 139–170][p-interview] and the [B1 template, lines 528–543][p-observation] separate observation without recommendations from informed product decisions. The response's justification for recommendations does not undo that distinction.                                                                                                         |
| 03 — Late feasibility work                        | **closed**        | [D6, lines 185–189][p-loop] places named failure experiments before the production contract; [Step 0, lines 711–719][p-foundations] brings the review-gate experiment forward. The experiments are still future work, with appropriate planned exits.                                                                                                       |
| 04 — Mixed editions and unlimited homebrew        | **closed**        | The [capability ladder, lines 275–283][p-ladder] distinguishes overrides, supported composition, engine extensions and manual rulings. [§14 Q1, lines 757–763][p-edition] retains the dated 2024-engine default. Keeping that decision requires no new owner vote.                                                                                          |
| 05 — Incorrect rule examples                      | **partly closed** | The [primer, lines 205–213][primer-reaction] corrects reaction refresh and permits own-turn reactions; the Human inspiration correction is also present. [§5b, lines 300–305][p-corpus] demotes the primer to commentary. The replacement hotbar example still teaches an incorrect generic timing/spending rule: **N03**; the source policy needs **N04**. |
| 06 — Authority, history and visibility            | **closed**        | [§5b, lines 292–298][p-authority] explicitly separates table discretion from application permission, preserves rule revisions, names projections and corrections, and recognizes irreversible disclosure. D5/D6 now own the contract and its tests.                                                                                                         |
| 07 — Unsupported market denominators              | **partly closed** | Qualifications now appear [beside the proposal's numbers][p-automation] and in [market §7, lines 615–620][market-caveat]. However, the conclusions still infer preference and feature use from installations, and some ranked claims remain categorical: **N06**.                                                                                           |
| 08 — Excessive product teardown sequence          | **closed**        | [§5, lines 224–249][p-references] keeps BG3 and D&D Beyond primary, compares the group's current setup, budgets at most two targeted additions, and records access/version/uncertainty. Encounter+ is now an available targeted reference. I accept the dated owner constraint on primary references.                                                       |
| 09 — Screen catalog instead of a table experience | **closed**        | [D8–D9][p-loop] adds spatial experiments and observed play; [Phase 3, lines 331–336][p-design] compares two coherent directions on one scenario and samples representative states. [Golden rule 7][p-golden] now requires task fit and coherence. The eventual taste verdict remains an image/playable comparison.                                          |
| 10 — Vendor ownership splits complete tasks       | **partly closed** | [§3, lines 103–111][p-roles] and [§7, lines 368–375][p-reservations] allow either provider the code, tests and documentation of a reserved task. The blanket restriction on Astra changing a spec and the integration-branch templates still conflict with that rule: **N05**.                                                                              |
| 11 — Overconfident model superiority              | **partly closed** | [§3, lines 111–137][p-routing] labels benchmark, tool, owner and untested bases, lowers confidence and makes calibration explicit. “Fable 5.1 precision higher” still lacks a comparator; the response acknowledges that the CodeRabbit pipelines do not support a matched Astra–Fable comparison: **N06**.                                                 |
| 12 — Misleading local bake-off                    | **partly closed** | [Benchmarks §5.2, lines 313–321][bench-correction] adds hidden checks, clean review cases, repeated close comparisons, separate outcomes and blind owner judgment. The old Task B still appoints Astra judge, and quota-free research remains asserted: **N05**, **N06**.                                                                                   |
| 13 — Effort portability and quota recovery        | **partly closed** | [§10, lines 455–491][p-continuity] adds per-task effort, tool limits, dirty-state handoff and provider fallback. A fresh same-provider review is allowed there but cannot pass the gate in §7: **N01**.                                                                                                                                                     |
| 14 — Self-referential SHA attestation             | **closed**        | [§7, lines 382–391][p-note] stores the verdict outside the candidate tree, resolving the original circular hash problem. The response also requires a SHA check. **N02** identifies a narrower wording/test issue with automatic note copying, not a recurrence of the original impossibility.                                                              |
| 15 — Unproved read-only review and identity       | **closed**        | [§7, lines 376–391][p-review-boundary] requires a denied-write demonstration and explicitly labels the local runner a workflow check, not a security boundary. That is an honest plan-level limitation. Passing the future experiment is still required before relying on the runner.                                                                       |
| 16 — Review deadlock and self-adjudication        | **partly closed** | [§7, lines 392–400][p-closure] uses reproduction, a bounded second opinion and explicit dispositions; the author cannot break their own tie. [§12, lines 682–684][p-rereview] nevertheless sends disagreements generally to the owner, and completion wording varies: **N05**.                                                                              |
| 17 — Skill-stack expansion                        | **partly closed** | [§9, lines 427–447][p-skills] keeps incumbents during trials, defers house skills, restores Task Observer and disables the problematic stop-time hook. The “verified superset” comparison is against an upstream wrapper, not the installed customized skill: **N07**.                                                                                      |
| 18 — Shared handoff races and decision scope      | **partly closed** | [§8, lines 409–423][p-handoff] adds task records, one handoff integrator and scoped supersession. Copyable templates still bypass task records and make individual tasks rewrite the shared handoff: **N05**.                                                                                                                                               |
| 19 — Acceptance without observed play             | **closed**        | [B1 and D9][p-loop] establish a measured baseline and an uncoached DM/player scenario in Italian on phone and laptop. [§14 Q4][p-participants] correctly leaves access to real participants to the owner. A promised test is not claimed as a completed one.                                                                                                |
| 20 — Late licensing and Italian terminology       | **partly closed** | [B0][p-loop], [Step 0][p-foundations] and [golden rule 9][p-golden] bring source mapping, official EN/IT SRDs, attribution and the private partition forward. The blanket SRD-only contract citation rule cannot describe promised house rules and private extensions: **N04**. See also the existing document-guard failure in §4.                         |
| 21 — Existing promises and transition             | **closed**        | [§0, lines 38–55][p-disposition] explicitly disposes of existing commitments; [lines 317–323][p-jobs] preserve the nineteen jobs and calendar; [Phase 6, lines 344–349][p-transition] moves rehearsal forward and names coexistence, cutover, rollback and recovery. Real-data actions retain their own approval boundary.                                  |

My original recommendation already preserved a breadth inventory; Claude's clarification makes
that shared intent explicit. On design references, the [dated September 9 decision][dec-references]
does make BG3 and D&D Beyond primary. I accept that constraint and the revised, task-bounded
comparison. I do not infer that either product must supply every interaction pattern.

## 2. New and residual findings

### N01 — blocking — The promised review fallback cannot pass the approval gate

**Proposal:** [§7, lines 382–387][p-note]; [§10, lines 477–485][p-continuity];
[cross-review template, lines 619–629][p-review-template].

**Evidence:** The gate requires the reviewer's provider to differ from the implementer's. The
continuity rule explicitly permits a fresh session of the same provider when the other is
unavailable. The response repeats the provider inequality in [finding 14][response-note]. These
rules cannot all govern the same approved candidate.

| Candidate author | Available fresh reviewer | Permitted by continuity | Passes the stated provider check |
| ---------------- | ------------------------ | ----------------------- | -------------------------------- |
| Claude           | Claude                   | Yes                     | No                               |
| GPT              | GPT                      | Yes                     | No                               |

**Failure:** Exhausting one subscription leaves the owner with a completed fallback review and an
impossible integration condition. A fresh session changes the session identity, not the provider.

**Recommended alternative:** Define one review policy used by the prose, note schema, runner and
templates. Prefer another provider. For routine work, permit a recorded fresh-session fallback
with reduced diversity; for high-risk work, keep approval pending until the other provider can
review. Record author session, reviewer session, provider, risk and approval status separately.
The author session never approves its own work. This is a recommended technical default, not a
request for the owner to debug the gate.

**Closure check:** Spike 7 must cover both provider directions, exhausted-provider fallback,
self-review rejection and the high-risk pending state. A single cross-provider happy path is
insufficient.

### N02 — minor — Git notes do not guarantee automatic freshness after a rewrite

**Proposal:** [§7, lines 382–387][p-note]; [Step 0, lines 718–719][p-foundations].

**Evidence:** [Git's documentation](https://git-scm.com/docs/git-notes) supports copying notes
across amend/rebase when `notes.rewriteRef` is configured; that ref has no default. I reproduced
the following in a disposable repository, without changing this repository's config or notes:

1. Commit candidate A; attach an approving note whose `candidateSHA` is A.
2. Configure `notes.rewriteRef=refs/notes/review`.
3. Change the candidate and amend it, producing B.
4. Observe that B carries A's unchanged note. Verdict/provider checks pass; `note.candidateSHA == B`
   fails.

**Recommended alternative:** Make exact payload-SHA equality explicit in §7 and exercise copied
notes in spike 7. Reject missing, malformed or stale notes. Replace the assertion that rewritten
commits necessarily have no notes with the requirement that they have no _valid approval_.

The [response already calls for checking the SHA][response-note], which is why this is a minor
alignment issue. The probe demonstrates the weakness of the proposal's literal abbreviated
predicates; it does **not** demonstrate a defect in a runner that has not been built.

### N03 — major — The corrected hotbar still spends reactions at the wrong event

**Proposal:** [§4 hotbar criteria, lines 200–214][p-hotbar].

**Evidence:** The example prompts before the triggering action resolves and marks the reaction
spent. The official [2024 glossary, Reaction and Ready](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary)
ties timing to the particular ability; Ready provides a counterexample: its reaction follows the
completed trigger, and the player may decline it. Displaying a prompt is not taking a reaction.

**Failure:** The generic example could turn Ready into an interruption and consume a player's
reaction without their choice. The cited general Reaction entry does not justify that behavior.

**Recommended alternative:** Name the specific capability. Model trigger detection, offer,
decline, acceptance and resolution separately, using that ability's timing. Spend the reaction
when it is taken. Keep refresh at the start of the next turn.

**Closure check:** Provide examples for Ready after its trigger, declining without spending,
a specifically sourced interrupt, and a valid reaction during one's own turn. The primer's
refresh and Human inspiration corrections remain credited; this finding concerns the new
contract example.

### N04 — major — The rules-source requirement excludes promised custom mechanics

**Proposal:** [D5, line 184][p-loop]; [§5b, lines 275–305][p-rule-policy];
[golden rule 9, lines 746–747][p-golden].

**Evidence:** Every rule contract must cite a section in both SRDs. The same proposal promises
new reaction triggers, new conditions, house rules and private content. The publisher explains
that the [SRD is a selected rules/content corpus](https://www.dndbeyond.com/srd), not the entire
commercial catalog. A newly invented house rule cannot have an official SRD section.

**Failure:** An agent must either block legitimate customization, invent a citation, or silently
break the rule. Bilingual terminology requirements also need a path for concepts absent from
the official bilingual corpus.

**Recommended alternative:** Each executable rule needs a source kind, immutable revision,
ruleset, applicable source location, redistribution status and conformance cases. Use official
EN/IT SRD citations where applicable; for a permitted private extension, retain private source
metadata and tests inside the partition; for an original house rule, cite its dated decision or
authored definition. Record original EN/IT terminology separately when the SRDs have none.
Nothing about a provenance record grants permission to redistribute commercial text.

**Closure check:** Walk one SRD rule, one original house rule and one permitted private extension
through D5 and the public/private checks without a fabricated citation or leaked source text.

### N05 — major — Copyable instructions still implement the rules v3 says it removed

**Proposal:** [§3, lines 103–111][p-roles]; [§7–8, lines 368–423][p-operating];
[§11, lines 510–617][p-task-templates]; [§12, lines 682–684][p-rereview].

**Evidence:** These are concrete contradictions in instructions an owner is expected to paste:

| Revised rule                                                                                            | Conflicting instruction                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete reserved tasks include technical documentation; authority is by decision type.                 | Line 106 forbids Astra changing any spec without the owner. This is broader than forbidding changes to approved product intent.                                                                                                                         |
| One task record and isolated worktree per task; one integrator maintains the shared handoff.            | B1 explicitly says integration branch, no task record (536); decision, reference and playtest templates also start on `main` (553, 573, 610). Several task endings rewrite `NEXT.md` directly (525, 543, 562, 675).                                     |
| A review verdict and findings disposition are required before integration.                              | The generic done-when condition only requires that review be requested (524–525). Phase 2 says every finding must be closed (327–330), while §7 allows reasoned dispositions.                                                                           |
| Technical disputes use reproduction and a bounded second opinion; only material owner choices escalate. | The immediate re-review procedure sends disagreements generally to the owner (683–684).                                                                                                                                                                 |
| Calibration uses a reference and judge independent of competing models.                                 | [Benchmarks §5.2][bench-correction] says this, but [Task B, lines 345–351][bench-task-b] still uses Astra's mock and Astra's verdict. [Recording instructions, lines 365–370][bench-record] still ask for a family average after abolishing composites. |

The response to [finding 10][response-ownership] and [finding 18][response-handoff] accepts complete task ownership
and independent task records. The conflicting templates are therefore unfinished implementation
of the response, not an unresolved product choice. D4 is allowed to run alongside D5, making
the shared integration-branch instructions consequential even in discovery.

**Recommended alternative:** Rewrite the operative templates in place around one task lifecycle:
reserved worktree and record; applicable intent; artifact plus evidence; approved verdict with
each finding resolved or explicitly dispositioned; integration; shared handoff updated by the
integrator. Limit owner escalation to changes in product intent, settled taste, cost or external
authority. Explicitly classify optional findings. Replace superseded calibration instructions,
or visibly mark them historical and non-executable.

**Closure check:** Dry-run the prompts for a Claude interview, an Astra reference task, a provider
handoff, a rejected review and a calibration. For each, identify exactly who writes which file,
what permits completion and what genuinely needs the owner. Check the next opening prompt as
well: the current [NEXT still opens the old PD task][next-old]. While the proposal remains
unapproved that history is understandable; the planning branch needs an unmistakable current
review pointer so a fresh session does not resume product implementation accidentally.

### N06 — major — Caveats have been added without removing the unsupported conclusions

**Proposal:** [§3, line 128][p-routing]; [§5b, lines 269–273][p-automation] and
[307–315][p-deadends]; [§10 calibration, lines 469–476][p-calibration].

**Evidence and recommended corrections:**

- The proposal acknowledges installations and overlapping populations, then concludes that
  effects/bookkeeping are wanted more than automated hit resolution. Marginal installation
  counts cannot establish that preference or an “effects-only” cohort. Foundry labels its
  [telemetry as installations](https://foundryvtt.com/article/year-in-review-2025/).
  Keep the owner's automation default; test the proposed priority at this table.
- The same telemetry measures optional wall/level modules, not the population using Foundry's
  [built-in lighting controls](https://foundryvtt.com/article/lighting/). “Installed by about a
  quarter” in the proposal and “used by a quarter” in [market §7][market-deadends] do not become
  valid by changing the verb. Defer lighting on scope/preparation grounds if desired; remove
  the unsupported prevalence claim. “Lowest satisfaction” in that report also survives its
  own warning that one rating is not a comparative study.
- “Fable 5.1 precision higher” needs its comparator and pipeline. The [corrected benchmark
  row][bench-routing] acknowledges that the
  [Astra study](https://www.coderabbit.ai/blog/gpt-6-astra-code-review-evaluation) and
  [Fable study](https://www.coderabbit.ai/blog/fable-5-1-model-review) are not a matched
  Astra–Fable evaluation. Retain provider diversity as a workflow judgment; do not imply an
  unmeasured precision ordering.
- The [response, lines 232–234][response-quota], explicitly rejects the cost of leaderboard
  research, and [benchmarks, lines 279–281][bench-quota], now says only calibration uses model
  quota. Manual browsing and agent-led retrieval/synthesis are different activities.
  [Claude's own cost guidance](https://code.claude.com/docs/en/costs) identifies fetched
  documentation as significant context consumption. Budget the agent work; do not invent a
  conversion from tokens to subscription messages or API dollars.
- The assertion that streak-adjusted dice contradict logging is a logical mismatch: configured
  distributions and resulting rolls can both be recorded. Keeping a ban on hidden odds changes
  is a legitimate product policy; it does not require this false premise or a claimed consensus
  of all tables.

**Closure check:** For each retained consequential inference, record the source population,
measurement, date, limitation and decision affected. Delete unsupported conclusions from the
operative synthesis instead of appending another caveat above them. This is a targeted evidence
correction, not a request to refresh every leaderboard or redo all market research.

### N07 — major — The skill rebuttal compares the wrong installed incumbent

**Proposal:** [§9, lines 427–438][p-skills].

**Evidence:** The [skills report, lines 27–48][skills-wrapper], describes upstream `grill-me` as
a one-line wrapper. The [response, lines 323–326][response-superset], uses wrapper containment
to reject the need for a task-specific comparison. But the actual canonical incumbent read
during this review is `~/.agents/skills/grill-me/SKILL.md`: **28 lines**, SHA-256
`d5ed425882357accd2f4b8014e94907b9d93a02f26c26a3f1bf11188fe13fe04`.

It contains local instructions for concrete product scenarios, controlled visual comparisons,
same-content/same-fidelity probes, a current-direction control and whole-product steering before
design. It is not the one-line body described in the report. Invoking an upstream wrapper plus
domain modeling does not establish preservation of those installed behaviors or better outcomes.

The [September 9 skill decision][dec-skills] also names the user's `~/.agents/skills/` as canonical.
V3 switches to a project `.agents/skills/` without explaining synchronization or precedence, and
adds the Firebase pack to Step 0 before its benefit has been demonstrated on a task. “Official”
is useful provenance, not a substitute for the adoption record v3 itself requires.

**Recommended alternative:** Keep the real incumbent while testing the candidate. Record both
installed bodies/versions, local additions, permissions and harness behavior; preserve or
explicitly disposition the useful custom instructions. State whether project files pin, link to
or intentionally replace the personal canonical layer. Trial only the Firebase capability needed
by a chosen spike, with the same overlap and permission checks as other additions.

**Closure check:** One observed interview/visual-decision trial must compare against the actual
installed baseline and record owner effort and lost/retained behavior. A textual upstream
superset is not that result. No skill installation or modification is authorized by this review.

## 3. Questions that genuinely remain for the owner

These are unanswered participation or product commitments, not requests to adjudicate the
technical findings. No new vote is needed to retain the dated 2024-engine default, the primary
design references, the decision-type split, the existing automation policy or routine delegated
integration. In particular, adding owner approval of every contract/state should not silently
replace the [September 8 delegation][dec-delegation].

| Question                                                               | A — recommended                                                                                              | B                                                                                                                 | C                                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| What must the first release support without Internet?                  | One device with usable local character/table data and printable sheets; prove exactly that capability first. | A synchronized table over a local network; include that transport and authority behavior in the first experiment. | Independently edited disconnected devices that reconcile later; accept a larger conflict/recovery commitment. |
| Who can participate in the first observed baseline and slice playtest? | The actual DM and one representative player, uncoached, with the owner arranging their participation.        | The owner plays both roles; record this as rehearsal evidence and defer claims about other users.                 | No participants are available yet; continue disposable exploration but leave observed usability unvalidated.  |

The first question is already surfaced accurately in [v3 §14 Q2][p-offline]; the second is
[Q4][p-participants]. Neither needs to be answered to correct N01–N07. Existing no-new-cost
constraints remain. Any eventual repository creation, name, purchase or production action
should be a concrete later step within the applicable authorization, not inferred from this
review's verdict.

## 4. Verification, remaining artifacts and model guidance

**Checks actually performed:** The provider-fallback truth table above; a disposable Git
amend/notes experiment; comparison of the installed skill body; source and line checks; and the
two existing Vitest files `content-pack-partition.guard.test.ts` and `docs-budget.test.ts`, run
with Node 24.16.0 and existing Vitest 4.1.7 dependencies through a temporary minimal configuration.
No application implementation or full production suite was tested.

Before this report existed, those two files produced **25 passing tests and one failing test**.
The public-document partition guard reported **21 matches**, all in the existing market, primer
and landscape reports. The private identity-term pack was absent, so this run did not check those
private identities. This is an existing repository-policy failure, not a legal determination
that every nominative reference is impermissible. After formatting this report, the result remains
**25 passing / one existing failure**: the same 21 locations and terms, with **zero new matches**.
The existing documentation-budget tests pass. Existing files and guard policy are outside this
read-only review's edit scope.

**Delivery constraint:** The requested commit contains one new review file. The existing
pre-commit hook requires a second changeset file, so delivery uses the same narrow one-file
exception as the first review: a temporary hook copy restricted to this branch, base SHA and
exact added path. Formatting and the other hook logic remain active; repository hook files and
persistent hook configuration remain unchanged. This is an explicit exception to the changeset
requirement, not a claim that the unmodified pre-commit hook accepts a one-file commit.

V3 now assigns owners and stages to the previously missing baseline, evidence register, rule
corpus, authority contract, participant plan and recovery plan. Those are scheduled deliverables,
not grounds to demand implementation during proposal review. What the plan still needs before
foundation work is an unambiguous review/fallback matrix, source-kind examples, consistent
copyable prompts and a record of the actual incumbent skills. Spike 7 must then prove its gate;
the table experiment must prove its play claims. I would not add another method or another
mandatory product teardown to achieve that.

My remaining design judgment is to judge the whole short encounter for legibility, attention and
recovery before elaborating its catalog of screens. V3's two-direction/playtest process now
permits that. A generic requirement to keep the DM screen moving during every reaction should
not become a taste decision that overrides rule timing. No new mock was produced here, so no
visual superiority is claimed.

Model selection must remain advice with a stated basis, including in the next handoff:

| Work                                                   | Recommended model / effort                       | Other-provider alternative                                             | Basis and limit                                                                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adversarial review of the whole revised operating plan | GPT-6 Astra / `xhigh` for a Claude-authored plan | Claude Fable 5.1 / `xhigh`, fresh session, reduced diversity disclosed | Risk and provider diversity; preference, dated 2026-09-12. No matched benchmark establishes the best reviewer or optimal effort for this plan.                                                    |
| Bounded reconciliation of N01–N07 in the documents     | Claude Fable 5.1 / `high`                        | GPT-6 Astra / `high`                                                   | Author continuity and existing document routing; provisional judgment informed by the 2026-09-12 benchmark snapshot. Escalate a specific unresolved protocol analysis to `xhigh`, not every edit. |
| Verify that reconciliation                             | The provider that did not edit / `high`          | Fresh same-provider session / `high`, with the N01 policy applied      | Independence and the listed closure checks; `xhigh` if the scope grows into implementing permission or approval controls.                                                                         |

The [dated benchmark correction][bench-correction] appropriately treats routes as provisional
until local calibration. [Artificial Analysis's Astra evaluation](https://artificialanalysis.ai/articles/benchmarking-gpt-6-astra)
reports tied flagship composites in its tested configurations; those aggregates do not prove
per-task equivalence or justify equal compute from equal effort labels. No new bake-off was run
for this review. The next useful action is a bounded correction pass followed by checking these
closure conditions, with the already resolved owner decisions preserved.

## Source anchors

[original]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-13-codex-review.md#L13-L223
[p-loop]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L172-L198
[p-interview]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L139-L170
[p-observation]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L528-L543
[p-foundations]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L711-L719
[p-ladder]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L275-L283
[p-edition]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L757-L763
[primer-reaction]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-12-dnd-primer.md#L205-L213
[p-corpus]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L300-L305
[p-authority]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L292-L298
[p-automation]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L269-L273
[market-caveat]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-12-dnd-market.md#L615-L620
[p-references]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L224-L249
[p-design]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L331-L336
[p-golden]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L721-L750
[p-roles]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L103-L111
[p-reservations]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L368-L375
[p-routing]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L111-L137
[bench-correction]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-12-benchmarks.md#L313-L321
[p-continuity]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L455-L491
[p-note]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L382-L391
[p-review-boundary]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L376-L391
[p-closure]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L392-L400
[p-rereview]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L678-L688
[p-skills]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L427-L447
[p-handoff]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L409-L423
[p-participants]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L776-L780
[p-disposition]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L38-L55
[p-jobs]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L317-L323
[p-transition]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L344-L349
[dec-references]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/DECISIONS.md#L84-L95
[p-review-template]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L619-L638
[response-note]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-13-claude-response.md#L262-L278
[p-hotbar]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L200-L214
[p-rule-policy]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L275-L305
[p-operating]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L368-L423
[p-task-templates]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L510-L617
[bench-task-b]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-12-benchmarks.md#L345-L351
[bench-record]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-12-benchmarks.md#L365-L370
[response-ownership]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-13-claude-response.md#L194-L208
[response-handoff]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-13-claude-response.md#L332-L349
[next-old]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/NEXT.md#L1-L30
[p-deadends]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L307-L315
[p-calibration]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L469-L476
[market-deadends]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-12-dnd-market.md#L661-L674
[bench-routing]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-12-benchmarks.md#L254-L268
[response-quota]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-13-claude-response.md#L225-L240
[bench-quota]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-12-benchmarks.md#L279-L281
[skills-wrapper]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-12-skills.md#L27-L48
[response-superset]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/restart-research/2026-09-13-claude-response.md#L323-L330
[dec-skills]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/DECISIONS.md#L57-L61
[dec-delegation]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/DECISIONS.md#L99-L108
[p-offline]: https://github.com/salvodicara/d20-folio/blob/0addfd6d59d3b874809d146a25817459ef12788e/docs/program/RESTART_PROPOSAL.md#L764-L768
