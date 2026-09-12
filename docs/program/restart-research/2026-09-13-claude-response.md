# Claude response to the Codex review of the restart proposal

Written on **2026-09-12** by Claude (Fable 5.1, effort `xhigh`); the filename follows the owner's
naming, as the review's does. It answers the review at commit `d67c6ba` (Codex, "needs-attention",
21 findings) against proposal v2 at `7fc140e`, the seven research reports, the owner's dated
decisions in `docs/program/DECISIONS.md` and `PRODUCT.md` §Steering, and primary sources fetched on
2026-09-12 (§1). The review file is unchanged. The resulting proposal is
[`RESTART_PROPOSAL.md`](../RESTART_PROPOSAL.md) v3; the corrections to the reports are listed in §5.

**Verdict on the review: accepted 13, partially accepted 8, rejected 0** — but "partially" is not
politeness: six findings contain a claim that is wrong or that a dated owner decision forbids, and
each is contested below with the evidence. The review's strongest contributions are findings 03,
05, 14, 20 and 21: a construction defect in the review gate, two rules errors verified against the
2024 text, an official Italian SRD the primer missed, and the absence of a disposition of existing
promises. Its weakest are the parts of 08 and 09 that would demote references or rules the owner
has decided in dated form.

Severity words follow the review: **blocking** must be resolved before the affected contract is
adopted; **major** before the affected work.

## 1. Primary-source checks run for this response

| Claim checked                                                   | Source fetched 2026-09-12                                                                                                                                          | Result                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reaction timing (finding 05)                                    | D&D Beyond, 2024 Free Rules, _Rules Glossary_, entry "Reaction" (https://www.dndbeyond.com/sources/dnd/free-rules/rules-glossary)                                  | "You can take a Reaction on another creature's turn, and if you take it on your turn, you can do so even if you also take an action, a Bonus Action, or both. Once you take a Reaction, you can't take another one until the start of your next turn." Codex is right; the primer is wrong.                                                                                        |
| Heroic Inspiration on a natural 1 as a Human trait (finding 05) | D&D Beyond, 2024 Free Rules, _Character Origins_, Human traits (https://www.dndbeyond.com/sources/dnd/free-rules/character-origins)                                | "Resourceful. You gain Heroic Inspiration whenever you finish a Long Rest." No natural-1 rule in the Human entry or in the glossary's "Heroic Inspiration". Codex is right; the primer is wrong.                                                                                                                                                                                   |
| Official Italian SRD 5.2.1 (finding 20)                         | D&D Beyond SRD page (https://www.dndbeyond.com/srd), "Localized SRD Downloads"                                                                                     | "Italiano SRD v5.2.1 (Published: December 08, 2025)", file `IT_SRD_CC_v5.2.1.pdf`, beside DE/ES/FR; SRD 5.1 also exists in Italian. Codex is right; the primer names the Italian PHB, which is not distributable.                                                                                                                                                                  |
| Solasta II on supporting both rulesets (finding 04)             | Tactical Adventures, "Solasta II is switching to the 2024 Ruleset", 2025-06-10 (https://www.solasta-game.com/news/208-solasta-ii-is-switching-to-the-2024-ruleset) | "Making sure our game works in two different rulesets … would take us an incredible amount of time … every monster, every class and subclass would need two different versions, and many spells no longer work the same." Codex quotes it fairly. The same page dates the 2024 switch to June 2025.                                                                                |
| Encounter+ current status (finding 08)                          | https://www.encounter.plus/                                                                                                                                        | "library, encounters, initiative, battle maps and a player-facing screen, in one app that works entirely offline"; "Everything lives in a local database on your device"; "Mirror a player-facing view to a TV or projector over AirPlay or HDMI"; "Free on the App Store, for iPhone, iPad and Mac". Codex is right; the landscape's "[unverified]" and "Paid app" are corrected. |
| Review-gate self-reference (finding 14)                         | Reasoning on git's content addressing, no fetch needed                                                                                                             | A commit's SHA covers its tree; a file inside the tree cannot contain that SHA. Confirmed as a construction defect. Resolution in §2, finding 14.                                                                                                                                                                                                                                  |
| `grill-me` versus `grill-with-docs` (finding 17)                | Skills report §1b, which quotes both SKILL.md bodies read on 2026-09-12                                                                                            | `grill-me`'s whole body is "Call the Skill tool with 'grilling'"; `grill-with-docs` calls `grilling` and `domain-modeling`. The second is a verified superset of the first, not an untested replacement. Codex's objection does not hold for this pair.                                                                                                                            |

Not re-run here: the model bake-off, live use of the reference products, and the Arena leaderboard
(Codex could not retrieve it either). Those remain as the review left them: unconfirmed.

## 2. The twenty-one findings

Each entry gives the disposition, the reason with evidence, and the change it produced in proposal
v3 or in a report (§5).

### 01 — blocking — the eleven steps become a specification waterfall

**Partially accepted.** Accepted: running every method to completion for the whole product before
any sketch or experiment is the waterfall Codex describes; Shape Up's own shaping includes
fat-marker sketches (methods §2), Pocock's grilling stops at ungrillable questions and builds a
throwaway prototype (methods §10), and Patton maps "breadth before depth" (methods §5a). The
proposal's golden rule 2 ("nothing is drawn without an approved screen document") forbade the very
sketches the cited methods use.

Contested: the exhaustive inventory is not the proposal's invention but the owner's request of 12
September ("interrogate every feature, screen, button and interaction from zero"), and Codex's own
alternative keeps "an early inventory of the whole ambition". The disagreement is about execution
order, not about whether the inventory exists.

**Change (v3 §4).** Discovery runs as one **breadth pass** over the whole ambition (frame, table
stories, the inventory of objects, events, screens and journeys at low depth, opportunities and
assumptions ranked) followed by **depth loops per slice** (references, model, spikes, journey,
breadboards and disposable sketches, playtest, contract, cross-review, build). The eleven artifact
types survive; they are filled per slice, the first slice being one complete table scenario.
Disposable sketches and experiments are allowed at any time and are never authority; a production
mock or production code still needs the approved slice contract (see the owner question in v3
§14).

### 02 — major — recommendations contaminate the interviews

**Partially accepted.** Accepted: an observation question ("what happened the last time…") must not
carry a recommended answer, and a conclusion must record whether it came from observation, a rule
source, a hypothesis or an owner preference; the Mom Test (methods §3c) says exactly this. Accepted
too: the two universal freedom questions ("can the DM change this?", "can a group replace this?")
would harvest predictable yeses; they are replaced by the capability ladder of finding 04 and by
"tell me the last time the DM changed this at the table".

Contested: recommended answers are not a defect of the proposal but the documented mechanic of both
interview skills the owner uses — Pocock's `grilling` mandates "give your recommended answer" per
question (skills §1b) and superpowers `brainstorming` asks "multiple choice questions when
possible" with alternatives (skills §1c). Both are right in their domain: **decision** questions
carry a recommendation; **observation** questions do not. Codex's "do not make a novice owner
arbitrate rules research" is accepted verbatim: agents verify published rules against the SRD; the
owner decides house rules and product trade-offs only.

**Change (v3 §4, interview mechanics).** Two question types with different rules; a provenance tag
on every recorded conclusion; observation sessions (step 1) precede any recommendation.

### 03 — blocking — feasibility is scheduled after the commitments it could invalidate

**Accepted.** The proposal promised offline play, free operation, mutable rules and synchronised
party actions in §5b and scheduled architecture in Phase 4. Firestore's documented offline
behaviour is last-write-wins per document; concurrent resource spending, duplicate replay on
reconnect and causal undo are not solved by an offline sheet. The v2 branch holds evidence worth
starting from (ADR-0001/0002 append-only log, P03 "Shared state and offline" closed, the 7 September
decision on provenance and causal correction), but the new repository starts from zero, so the
risk stands until a spike shows otherwise.

**Change (v3 §4 step 6, §6).** Six named spikes run before the first slice's screen contract, each
with its intended behaviour stated first: offline authority, duplicate commands, conflicting
spends, undo with dependent actions, hidden information, free-tier workload. A seventh spike
proves the review gate itself (finding 14). Superpowers' brainstorming already has the "Spike"
path (skills §1c); no new machinery.

### 04 — major — mixed editions and universal homebrew become commitments without a scope decision

**Accepted.** The proposal's §5b turned market evidence into promises ("per-seat 2014/2024 mixing",
"a homebrew editor for every category including classes and conditions") that contradict the
owner's dated decision of 2026-09-03 ("D&D 2024 only; existing 2014 characters migrate",
`PRODUCT.md`). Solasta's statement (§1) is a fair warning about the cost of two rulesets. A
catalogue of editable categories does not prove the rules language can represent them.

**Change (v3 §5b, §14).** A four-level capability ladder — numeric override; content composed from
supported mechanics; new mechanics needing engine work; manual adjudication with a recorded result
— with examples and acceptance cases per level. The edition promise stays as decided (2024 engine,
2014 content tolerated through an edition tag, as the primer §3 already says) and goes to the owner
as an explicit question only because the market evidence is new; the recommendation is to keep the
decision.

### 05 — blocking — the domain primer contains errors that would become engine contracts

**Accepted, verified (§1).** Two rules errors confirmed against the 2024 text: the reaction refresh
is "until the start of your next turn", not "one per round" (a creature that reacts before its turn
and again after it has taken two reactions in one round — an engine that counts per round is wrong);
and Heroic Inspiration on a natural 1 is not a Human trait. The hotbar example's "within the same
round" wording is about prompt timing, not refresh, but it is replaced by "before the triggering
action resolves" to remove the ambiguity.

**Change.** Primer corrected in place with a dated note (§5). v3 §5b states that the primer is
commentary; every rule that becomes a contract cites the SRD 5.2.1 section (EN and IT) and ships
executable examples covering timing boundaries and exceptions (the "rule-conformance corpus" of
review §7). Cross-review of a rule contract checks the source, never the primer.

### 06 — major — DM freedom lacks a model for authority, history and visibility

**Accepted.** The proposal's "nothing blocked" and "in-place edits of official entries" were looser
than the owner's own decision of 2026-09-07 ("provenance and causal correction — never a decorative
override or a silent rewrite of an in-use copy's template"). Recomputing an old action with a newly
edited spell rewrites history; a revealed secret cannot be un-revealed by undo.

**Change (v3 §5b "Freedom", §6).** Three separated concerns — game-rule discretion, application
authorisation, information visibility — become one contract artifact of the first slice (the
"multiplayer authority and visibility contract" of review §7): immutable identities and revisions
for custom definitions, the revision recorded on each action, authorised commands, private and
public projections, audit records, compensating corrections, and the explicit list of irreversible
disclosures. "Nothing blocked" now reads "no table decision is blocked; every command is validated
for structure and ownership".

### 07 — major — market conclusions do not follow from their denominators

**Accepted, with one precision.** The market report carried grades and caveats (every figure A–D,
"inference from A-grade data", "D, very consistent"); the proposal §5b dropped them and wrote
"switched off by every experienced table", "used by about a quarter of Foundry tables", "lowest
satisfaction". Codex is right that installed ≠ used, characters ≠ players, and one rating ≠ a
satisfaction study. The precision: the report's Foundry table already labels the column "Install %";
the error is in the readings and in the proposal.

**Change.** Proposal v3 §5b restates each consequential claim with its denominator and grade and
marks the ranking as hypotheses to test with this table; the market report gets a short reading
caveat in §7 and two wording corrections (§5).

### 08 — major — the twelve-product sequence is larger than advertised and misses the closest context

**Partially accepted.** Accepted: task-based comparisons on the same short scenario beat twelve full
teardowns; access, version and platform must be recorded; Encounter+ is verified (§1) as a free,
offline, physical-table app with a player screen and earns an early targeted slot; "the only
2024-rules implementation" is an over-claim (corrected to "the first shipped one found").

Contested: Codex's disposition demotes Baldur's Gate 3 to "a targeted study; do not require the
first full teardown". The owner decided on 2026-09-09 that "BG3 and D&D Beyond are studied as
primary and binding references" and on 2026-09-03 that BG3 is the model for playing and D&D Beyond
for owning a character. A review can question a decision; it cannot supersede it. The two stay
primary; the method changes.

**Change (v3 §5).** First comparison on the slice-1 scenario: D&D Beyond, BG3 and the group's
current setup (Owlbear Rodeo plus physical dice and a calculator — the real baseline). Then at most
two targeted references per named uncertainty, from an ordered reserve: Encounter+ (offline,
physical table), Solasta (reaction and resource prompts), Foundry dnd5e with Midi-QOL (automation
levels and override cost), Shard (homebrew provenance), and the rest of the twelve on demand. Each
dossier records version, platform, access, observed scenario, evidence, failures and the
transferable pattern; untested claims are marked. Nothing is bought implicitly.

### 09 — major — the design process favours an approved catalogue of screens over a convincing experience

**Partially accepted.** Accepted: hand-approving the Cartesian product of every screen, state,
locale and viewport recreates the administrative character the reset is meant to escape; two
coherent directions on one short playable scenario, judged by the owner from images, is the right
first design act; representative high-fidelity states plus systematic component checks replace the
full matrix; spatial experiments may change the document.

Contested: "copy the dominant proven pattern" is not the proposal's slogan but the owner's golden
rule 30, said "mille volte" and turned into a gate on 2026-09-09; and taste is Astra's by the same
day's decision, so Codex's "coherent fantasy table" preference is legitimately Astra's to propose
and the owner's to judge. The rule's wording is amended as Codex suggests (fit and coherence over
popularity), the rule itself stands.

**Change (v3 §4 step 8, §6 Phase 3, §13 rule 7).**

### 10 — major — permanent vendor ownership breaks complete tasks and provider fallback

**Accepted.** The proposal's `OWNERSHIP.md` by path contradicted the owner's decision of
2026-09-09: "split by decision type, not by file". A single accessible control needing one agent
for the component, another for tokens and tests, and both for review is the failure Codex
describes; and a fallback provider barred from the paths of the task it inherits is no fallback.

**Change (v3 §3, §7).** Decision authority stays by type (Astra: visual and taste; Claude:
architecture, engine, rules, data, gates, documents). Files are **reserved per task**, not owned per
vendor: the task record names the implementer and the paths; the implementer owns the whole bounded
task including its tests and documentation; the reservation transfers with a handoff; hooks
enforce the reservation, not a vendor map. Both providers may correct technical documentation
within authorised intent; product changes need the owner for both. Claude-first interviewing and
Codex-first design remain preferences, dated and revisable, except where an owner decision or a
tool dependency makes them binding (finding 13).

### 11 — major — the confidence assigned to model superiority exceeds the evidence

**Accepted, with one precision.** The benchmarks report §4 preamble disclosed that it "honours" the
owner's 9 September division and said so per row; the proposal §3 table dropped that label and
presented owner-assigned rows as evidence with "high" confidence. Codex is right that an unpublished
Astra SWE-bench Pro score is not evidence for Claude, that CodeRabbit's Astra study compared Astra
with Sol and Opus 5 while its Fable 5.1 study used a different pipeline, and that no controlled
instruction-fidelity evaluation exists (the report itself flagged it "thin").

**Change (v3 §3).** Every routing row carries a basis label — benchmark-supported,
tool-dependent, owner decision, untested judgment — and a confidence no higher than the evidence
class allows; engine, intent-adherence and cross-provider review superiority are downgraded to
provisional hypotheses to be tested by the calibration of finding 12. The benchmarks report gets a
dated note to the same effect (§5).

### 12 — major — the local bake-off could confidently select the wrong route

**Accepted, with one rejection.** Accepted: within-pair min–max normalisation magnifies any
difference to the full range (the formula was unspecified); one attempt cannot characterise
reliability; equal effort names are not equal compute; the author of the reference must not also
judge; easy-to-count checks reward tests that mirror the implementation.

Rejected: "refreshing all leaderboards … consumes quota". Reading five public leaderboards is
browsing, not model quota; only the bake-off spends it. The cadence still changes: on trigger
(a model, harness or observed failure that could change a route), not quarterly.

**Change (v3 §10; benchmarks §5 corrected).** A small retained task set with hidden acceptance
checks, known review defects plus clean cases and a constraint-adherence case; predeclared pass/fail
safety constraints; quality, elapsed time, owner interventions and consumption reported
separately, never composited; close or consequential comparisons repeated; visual alternatives
judged blind by the owner; results provisional until the calibration has actually run once.

### 13 — major — effort guidance and quota recovery are not portable as written

**Accepted, with one precision.** Effort is chosen per bounded task and raised on demonstrated
difficulty, as Anthropic's effort guidance supports; holding it for a session coupled a cleanup to
an earlier hard problem. "Astra charges double above 272K" is API pricing, not a subscription
message count. A fallback that requires a commit and a rewritten `NEXT.md` fails exactly when quota
ends with a failing hook or uncommitted work. Raster generation is a tool dependency (`gpt-image-2`)
and an owner decision (2026-09-09), not a reasoning-effort question; HTML/CSS/SVG design is
something both flagships can do.

The precision: the successor inspects a dirty worktree, but the predecessor never forces a commit
past a failing hook (`--no-verify` stays forbidden); it records the state in the task record and
stops.

**Change (v3 §10, §11).** Every issued prompt starts with the header of review §5 (model, effort,
fallback, basis with date, required tools, resume-from); effort per task; a quota and interruption
contract: task record with dirty files, failing checks, reservations and next step; the successor
reads the worktree and the diff, not only the last commit; account allowance checked before a long
run, separately from API prices.

### 14 — blocking — a committed review file cannot contain the SHA of the commit that contains it

**Accepted; construction defect confirmed.** Review candidate A, commit its verdict → B; update the
verdict to B → C; the gate `sha == HEAD` can never pass honestly. The frameworks report §3.3 and
§6.3 carried the same design and are corrected (§5). A second defect in the same rule: "reviewer
differs from the author recorded in the commit trailer" cannot work in this repository, whose
commits carry the owner as sole author with no trailer (CLAUDE.md).

**Change (v3 §7).** The verdict is attached to the immutable candidate **outside its tree**: a git
note on the candidate SHA (`refs/notes/review`), written by the review runner script, never by
the reviewer inside the checkout; CI's `review-gate` reads the note for HEAD and checks verdict,
SHA, model and that the reviewer provider differs from the task record's implementer. Any new
commit has no note and is unreviewed by construction; a merge or rebase moves the SHA and
invalidates the approval, which is the wanted property. When the owner authorises CI-run reviews
(a cost decision, v3 §14), the same note is written by the trusted CI runner and the gate becomes a
trusted check attached to the candidate. The gate is proven on a tiny candidate — approve, then
demonstrate rejection after a one-line change — before any product work (spike 7 of finding 03).

### 15 — major — read-only review and reviewer identity are assertions, not verified controls

**Accepted.** A Claude review subagent with Bash can write; a fresh subagent, a review command and a
read-only filesystem are not equivalent; a writer-controlled JSON field authenticates nothing.

**Change (v3 §7).** The reviewer reads an immutable candidate (a detached worktree at the SHA, made
read-only at the filesystem level) and returns findings through its output, not by editing files;
the runner script records provider, model, effort, candidate SHA and result in the note; changes to
the gate's own files require a task whose reviewer is the other provider; the controls are tested
in spike 7 (a reviewer that attempts a write must fail). Stated plainly: with two agents on one
machine this is an explicit workflow check, not a security boundary, exactly as Codex allows.

### 16 — major — cross-review can deadlock or let the author adjudicate their own work

**Accepted, with one precision.** The proposal mixed four completion conditions (zero blocking,
zero clarification markers, approve, "review requested") and let the author's specialty settle a
dispute; the reviewer brief ("correctness or stated requirements") narrowed what the cross-review
template listed (accessibility, offline, i18n).

The precision: taste disputes are not "the author adjudicating their own work" but the owner's
decision that Astra owns visual and taste decisions; that decision stands. Everything else on a
mock — spec compliance, states, accessibility, i18n, offline behaviour — is a finding the author
never adjudicates.

**Change (v3 §7 "Closure policy").** One policy: every actionable finding is resolved or explicitly
dispositioned with a reason; approval is fresh on the actual candidate; technical disputes are
settled by a reproduction, then by one bounded second opinion (a fresh session of the other
provider, or of the same provider with the reduced diversity disclosed); the author never breaks a
tie on their own work; only product, taste, cost or authority choices go to the owner, with a
concrete demonstration. The review scope is correctness, security, accessibility, i18n, offline and
the agreed task outcome; preferences are labelled optional and never block. Depth of review is
proportional to risk.

### 17 — major — the skill shortlist recreates the stack-management project it is meant to remove

**Partially accepted.** Accepted: installing twelve rows, several evaluators and five house skills
before the first interview is a prerequisite the discovery does not need; the incumbents the owner
kept on 2026-09-09 stay; each replacement is trialled on a real task before its incumbent goes;
task-observer had no disposition and now has one; house workflows start as templates and become
skills only after repetition proves them; the contradiction between the skills report ("avoid the
review-gate hook", §6) and the frameworks report ("enable the review gate", §7.1 and §7.3) is real
and is resolved against enabling it, on the plugin README's own warning about usage-limit loops.

Contested: `grill-me` → `grill-with-docs` is not "asserted before a task-specific comparison" — the
skills report read both bodies (§1), and the second literally invokes the first plus
`domain-modeling`; it is a superset. `frontend-design` versus impeccable, by contrast, is an
assertion and is now a trial item, as Codex asks.

**Change (v3 §9).** A skill adoption record (version, licence, permissions, both-harness check,
evaluated benefit, replacement decision) replaces the shortlist as the operative artifact; only the
incumbents plus the official Firebase skills are installed at step 0.

### 18 — major — the single handoff and decision rules conflict with parallel work

**Accepted.** One `NEXT.md` rewritten by every session and one worktree per task per agent produce
concurrent handoffs that overwrite each other; "latest dated decision wins" without scope lets a
narrow decision repeal a broad one; an append-only ledger can preserve a mistake.

**Change (v3 §8).** One task record per active task (`changes/<slug>/task.md`) carries worktree,
branch, candidate SHA, dirty files, reservation, remaining work, checks and pending owner
decisions; one designated integrator (Claude, by the document-hygiene split) maintains the compact
shared handoff `program/NEXT.md`, which points at task records and never restates them. Decisions
keep stable IDs and explicit `supersedes` links and gain a `scope`; a conflict is resolved by scope
and authority, never by date alone; a mistaken entry is corrected by a new entry. Golden rule 3
becomes "one bounded objective and one accountable implementer per task, with the artifacts needed
to prove it"; a session boundary requires neither a commit nor an owner decision.

### 19 — major — acceptance gates measure documentation and screenshots more than successful play

**Accepted.** EARS, Gherkin and screenshots prove that states exist, not that the DM needs fewer
clicks or that a reaction prompt reaches the right person; screenshots cannot show keyboard access,
screen-reader meaning, touch targets, motion tolerance or offline recovery. The owner's own first
milestone ("one whole session without Owlbear, D&D Beyond or a calculator") is already a play
outcome, so the gate was misaligned with the goal it served.

**Change (v3 §4 steps 1 and 9, §6).** Step 1 produces a baseline task script for the DM and a
player on the group's current setup, with observable pass conditions (errors, completion,
interruptions, recovery, Italian, phone); step 9 tests the slice uncoached with the actual DM and one
representative player against that baseline; reaction windows and authority are specified as
concrete event sequences; static screenshots serve visual judgement, live interaction serves
behaviour; an interaction-accessibility acceptance set (keyboard, screen reader, focus after
dialogs, touch and long Italian labels, contrast, reduced motion, print) is part of every slice
contract. Whether the group takes part in observed playtests is the owner's to decide (v3 §14).

### 20 — major — licensing and Italian terminology are deferred despite a usable authoritative source

**Accepted, verified (§1).** Wizards published the Italian SRD 5.2.1 under CC-BY-4.0 on 8 December
2025; the primer pointed at the Italian PHB, which is neither distributable nor trusted after the
2025 translation apology. Deferring the source map until after mock approval would have produced
rework in every rules string.

**Change (v3 §4 step 0 and §5b "Rules corpus"; primer corrected, §5).** The versioned English and
Italian SRD 5.2.1 are the source of every rule text and term, with attribution and stable content
identifiers, prepared by the agents at step 0; published rules, commentary, house rules, user imports
and product artwork are separated; provenance and redistribution permission are recorded for every
reused text or asset, including research captures, which stay outside the public repository as the
owner's decision of 2026-09-09 (item 9) already requires. The owner decides only actual licensing,
distribution or spending choices.

### 21 — major — the reset lacks a disposition of existing promises and a complete live-service transition

**Accepted.** The proposal's "ten jobs by evidence" would have silently replaced the nineteen jobs
of `PRODUCT.md` and dropped the shared session calendar (job 3), which the market report excluded
from its scope but the owner never revoked; the "screen document approved by the owner before
drawing" gate added owner work the 2026-09-08 delegation had removed; six fixtures do not make a
live transition safe.

**Change (v3 §0 and §14; §6 Phase 6).** Step 0 produces a retain / reopen / supersede table for
every dated owner decision and every `PRODUCT.md` promise before the new repository is treated as
authority; the nineteen jobs are retained as the ambition and the ten evidence-ranked jobs become
the priority order inside it; the 8 September delegation is retained; the migration plan is
inventoried early and rehearsed (export, import, restore, idempotency, a failed cutover, adversarial
data), with the final snapshot, source-of-truth period, old-client behaviour and rollback authority
named; a plain-language health and recovery view lets the owner request recovery without reading
diffs; production fixes on `main` reach the new work through a named cherry-pick task. No real
migration is authorised by approving the plan.

## 3. The review's structural proposals

| Review section                           | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §2 recommended order of the eleven steps | Adopted as the shape of v3 §4, with two changes: a breadth pass first (the owner's inventory request), and BG3 and D&D Beyond kept primary in step 4 (owner decision). Codex's "evidence needed to move on" column is kept per step.                                                                                                                                                                                                                      |
| §3 disposition of the twelve rows        | Adopted except the demotion of BG3 (finding 08). Encounter+, AboveVTT, Fight Club 5 / Game Master 5 and Alchemy enter the ordered reserve; the group's own table is named as the baseline.                                                                                                                                                                                                                                                                |
| §4 amended golden rules                  | Adopted in wording for rules 1–8; rules 9 and 10 kept and specified as proposed. Rule 7 keeps the owner's "giants' shoulders" identity (rule 30 of the current repository) with Codex's fit-and-coherence wording. Codex's closing request — disposition the free-operation promise, edition scope, accessibility expectations and live-data preservation explicitly — is done in v3 §0 and §14.                                                          |
| §5 prompt header and model table         | Adopted verbatim as the mandatory header of every prompt (v3 §11); the model table is merged into v3 §3 with basis labels; the standing owner preference is recorded in v3 §10.                                                                                                                                                                                                                                                                           |
| §6 six owner decisions                   | Two are already decided and are retained without a question (who first: the group, 2026-09-03; automation default: full auto with three levels, 2026-09-03); four are asked in v3 §14 with the existing decision as the recommended default where one exists (edition promise, offline meaning, new costs, approval granularity). Two questions are added: observed playtests with the group, and disposable sketches before an approved screen document. |
| §7 ten missing artifacts                 | All ten are now named artifacts with an owner and a step in v3 §6 ("Artifacts the loops must produce").                                                                                                                                                                                                                                                                                                                                                   |

## 4. On the review's opening remark

Codex notes "evidence of confirmation bias in the synthesis". Partially accepted: the benchmarks
report disclosed in §4 that it honoured the owner's division of labour and flagged where the
evidence pointed elsewhere; the proposal's §3 table then dropped those labels and reported owner
assignments as findings with "high" confidence. That is the defect, and it is fixed by labelling
(finding 11). The symmetrical caution Codex asks for is applied: Codex-first design is recorded as an
owner decision plus a tool dependency for raster art, never as a benchmark result.

## 5. Corrections applied to the reports (2026-09-13)

Each edited report carries a dated "Corrections" note at the top; the original wording is
recoverable from git. The Codex review is untouched.

| Report     | Where                                                 | Correction                                                                                                                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dnd-primer | §2 "The combat round", item 2                         | "Between turns each creature has one reaction per round" → a reaction can be taken on any creature's turn, including your own, and is regained at the start of your next turn (2024 Rules Glossary).                                                                                                              |
| dnd-primer | §5 house-rules table, Inspiration row                 | The natural-1 rule is not the 2024 Human trait; the Human's Resourceful trait grants Heroic Inspiration after a Long Rest (2024 Character Origins). The natural-1 variant is recorded as a house rule.                                                                                                            |
| dnd-primer | §6 glossary, "Action / Bonus action / Reaction"       | "one reaction per round" → "one reaction, regained at the start of your turn".                                                                                                                                                                                                                                    |
| dnd-primer | §6 "What this means for the app"                      | The official Italian source is the CC-BY-4.0 Italian SRD 5.2.1 (published 2025-12-08), not the Italian PHB; the primer is commentary and never a rules source for a contract.                                                                                                                                     |
| landscape  | Encounter+ row; deferred list                         | Status verified 2026-09-12: free on the App Store for iPhone, iPad and Mac; fully offline on a local database; player screen over AirPlay/HDMI; promoted from "deferred, unverified" to a targeted reference for the physical table.                                                                              |
| landscape  | Teardown priority, item 2                             | "the only 2024-rules implementation to copy from" → "the first shipped 2024-rules implementation found"; Solasta's own statement on the cost of two rulesets added as evidence for the edition question.                                                                                                          |
| frameworks | §3.3, §6.3, §7.1 item 3, §7.3 step 2                  | The `review.json` verdict inside the reviewed tree with `sha == HEAD` and "reviewer ≠ commit author" replaced by a verdict attached to the candidate SHA outside its tree (git note or CI check run) and reviewer ≠ implementer of the task record; the stop-time review gate is not enabled (skills §6 warning). |
| benchmarks | §4 preamble and two rows; §5.1                        | Basis labels and confidence downgraded for the engine and code-review rows; the within-pair min–max averaging rule replaced by the calibration protocol of finding 12; re-evaluation on trigger, not quarterly.                                                                                                   |
| dnd-market | §5 dynamic-lighting row; §7 (c) karmic dice; §7 intro | "used by" → "installed by" a quarter of reporting Foundry users; "universally switched off" → "advised off in every guide found (grade D)"; a reading caveat added: installed ≠ used, characters ≠ players, one rating ≠ a satisfaction study.                                                                    |
| methods    | §11                                                   | One dated line: the order is kept, the execution is a breadth pass plus depth loops per slice; disposable sketches and prototypes are allowed by the cited methods themselves.                                                                                                                                    |

## 6. What this response does not do

It does not answer the owner's questions (v3 §14), start the new repository, install or remove any
skill, run the bake-off, or authorise any deployment, migration, purchase or cost. The next step it
recommends is a fresh Codex review of v3 (`xhigh`, read-only, the same criteria), after which the
owner decides.
