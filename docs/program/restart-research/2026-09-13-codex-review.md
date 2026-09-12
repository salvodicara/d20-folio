# Codex adversarial review of the restart proposal

**Verdict: needs-attention.** The direction is worth pursuing; the proposed operating contract is not ready to govern implementation. Its strongest ideas are learning from real sessions, documenting consequential behavior, preserving DM discretion, isolating concurrent work, and checking another agent's output. Its largest risks are exhaustive specification before learning, untested offline and rules promises, incorrect domain examples, and an approval gate that cannot satisfy its own SHA condition.

Reviewed on **2026-09-12** against commit **`7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb`** on `claude/d20-folio-redesign-planning-3weqk7`. The filename uses September 13 as requested; it does not date the evidence a day into the future. Proposal and report citations below refer to that immutable commit.

I read the proposal, then all seven reports in the requested order, and the current product and decision context. I checked selected consequential claims against primary web sources. I did not run the proposed model bake-off, use the competing products in a live game, validate every citation in the reports, or test a new implementation. Product descriptions are documented capabilities, not firsthand usability findings. Arena's live leaderboard could not be retrieved reliably; its reported scores remain unconfirmed here.

There is evidence of confirmation bias in the synthesis, not evidence of dishonest intent by Claude. The [benchmark report, lines 235–254][b-routes] explicitly starts from an existing owner-assigned division of labor; the [methods report, lines 3–6][m-premise] starts from a question about specifying everything before drawing. Both later present parts of those premises as research conclusions. Codex's preferred ownership of visuals deserves the same skepticism as Claude's preferred ownership of logic.

Severity: **blocking** means resolve before adopting the affected proposal as a build or approval contract; **major** means a material failure risk to resolve before the affected work; **minor** means a local correction without that consequence. There are **21 findings: 4 blocking and 17 major**. Discovery can continue while these are addressed. This review proposes revisions; it neither supersedes owner decisions nor authorizes a new repository, deployment, migration, purchase, or skill installation.

## 1. Numbered findings

### 01 — blocking — The eleven steps turn discovery into a specification waterfall

**Proposal:** [§4, lines 124–162][p-sequence]; [§6, lines 230–245][p-phases].

**Evidence:** [Methods, lines 69–95][m-shapeup] says Shape Up limits upfront definition; [lines 185–222][m-orca] describes iterative ORCA rounds; [lines 502–516][m-grilling] explicitly permits a disposable prototype when questions cannot resolve uncertainty. Shape Up's own [breadboard and fat-marker guidance](https://basecamp.com/shapeup/1.3-chapter-04) uses rough spatial exploration during shaping. The [Sprint authors](https://www.character.vc/sprint) describe testing realistic prototypes with customers before substantial investment.

**Failure:** Each of eleven stages becomes its own series of sessions, all objects precede all journeys, and every element must be approved in words before any screen is drawn. Spatial interaction problems become lengthy hypothetical interviews. An error discovered in the first playable mock can invalidate a large approved specification. The source methods do not establish that their serial combination is effective.

**Recommended alternative:** Keep an early inventory of the whole ambition, then iterate objects, events, journeys, rough layouts and assumption tests around one complete table scenario. Require an approved contract before production implementation, while allowing explicitly disposable sketches and technical experiments earlier. Use the revised eleven-step sequence in §2 below; measure learning and owner effort, not completed document stages.

### 02 — major — Recommendations contaminate the interviews intended to discover needs

**Proposal:** [§4, lines 89–122][p-interview].

**Evidence:** [Methods, lines 129–165][m-discovery] distinguishes observed opportunities from solutions and warns against pitching during interviews. [D&D primer, lines 157–179][d-table] describes different table contexts rather than a single universal user. Yet the proposal recommends an answer before every question, teaches a novice the presumed model, and uses the market majority to fill gaps in that novice's experience.

**Failure:** The owner can approve the interviewer's explanation without validating that it describes players' behavior. Asking whether the DM can edit every object also yields a predictable list of affirmative answers, not relative priorities. More questions do not repair leading questions.

**Recommended alternative:** Separate observation from decision. First ask for a concrete recent incident, its frequency, workaround and consequence without presenting the preferred solution. Observe the actual DM and players where possible. Then explain verified rules and offer multiple-choice product tradeoffs, including uncertainty or deferral. Record whether each conclusion came from observation, a rule source, a hypothesis or an owner preference. Do not make a novice owner arbitrate rules research.

### 03 — blocking — Feasibility is scheduled after the expensive commitments it could invalidate

**Proposal:** [§5b domain promises, lines 205–212][p-promises]; [§6 Phase 4, lines 230–245][p-phases].

**Evidence:** [Frameworks, lines 60–87][f-proportional] favors bounded work and different process sizes. The proposal promises offline play, free operation, mutable rules and synchronized party interactions before architecture. For a concrete current-stack risk, [Firestore's offline documentation](https://firebase.google.com/docs/firestore/manage-data/enable-offline) specifies last-write-wins behavior for multiple changes to one document; that is not a ready-made solution for concurrent resource spending or causal undo.

**Failure:** Approved screens can promise behavior that the chosen persistence model cannot safely deliver. Two disconnected devices spending the same slot, a reconnect replaying an attack twice, or a DM correcting an action after dependent actions are different problems from storing an offline sheet.

**Recommended alternative:** Before detailed screen approval, run small disposable experiments for offline authority, duplicate commands, conflicting spends, undo with dependents, hidden information and the expected free-tier workload. State the intended behavior for each experiment first. Choose the minimum architectural constraints the results establish; defer the rest. Architecture need not be frozen early, but its highest-risk promises must be tested early.

### 04 — major — Mixed editions and universal homebrew become commitments without a scope decision

**Proposal:** [§5b domain synthesis, lines 190–228][p-domain].

**Evidence:** [D&D market, lines 611–644][d-market-scope] recommends broad capabilities from heterogeneous evidence. The existing [PRODUCT.md, lines 20–34][product-scope] specifies a 2024-only engine with migration of 2014 characters. Supporting 2014 and 2024 per seat is a material new promise. The [Solasta II developers](https://www.solasta-game.com/news/208-solasta-ii-is-switching-to-the-2024-ruleset) explain that supporting both rulesets would substantially multiply their content and QA work. That is a relevant warning, not an estimate for this project.

**Failure:** Editing a monster statistic, defining a new class progression, replacing targeting semantics and mixing edition-specific spells are not equivalent forms of customization. A catalog of editable categories is not proof that the rules language can represent them. Unrestricted overrides can coexist with explicit limits on automatic execution.

**Recommended alternative:** Have the owner choose the edition promise. Define a capability ladder: numeric override; content composed from supported mechanics; new mechanics requiring engine work; manual adjudication with a recorded result. Give representative examples and acceptance cases at each level. Preserve ambitious future scope without making every category and edition combination a launch prerequisite.

### 05 — blocking — The domain primer contains errors that would become incorrect engine contracts

**Proposal:** [§4 domain teaching, lines 110–122][p-teaching]; [§5b, lines 190–212][p-domain-core].

**Evidence:** The [primer, lines 194–199][d-reaction] describes a reaction between turns and once per round. The official [2024 Rules Glossary](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary) allows a reaction on any creature's turn, including your own, and refreshes availability at the start of your next turn. The [primer, line 465][d-inspiration] attributes inspiration on a natural 1 to the 2024 Human; the official [Human rules](https://www.dndbeyond.com/sources/dnd/br-2024/character-origins) give Heroic Inspiration after a Long Rest through Resourceful. These are consequential counterexamples, not an exhaustive rules audit.

**Failure:** The proposal uses this primer to teach the owner and derive state machines. Cross-review against the same mistaken summary would approve the same error twice. The hotbar example already refers to a reaction in the same round, which could reinforce the wrong refresh boundary.

**Recommended alternative:** Treat the primer as introductory commentary. Before a rule becomes a contract, attach the exact ruleset, source section and errata version, then executable examples covering timing boundaries and exceptions. Correct and audit the relevant primer sections in a later authorized revision. Keep disputed interpretations explicit; the owner decides house rules, while agents verify published rules.

### 06 — major — DM freedom lacks a model for authority, history and information visibility

**Proposal:** [§4 hotbar example, lines 141–162][p-screen]; [§5b, lines 205–212][p-promises]; [golden rule 8, lines 440–457][p-golden].

**Evidence:** [D&D market, lines 470–493][d-hidden] discusses hidden rolls and public accountability as different needs. [D&D primer, lines 284–294][d-derived] treats derived values as recomputable. The existing [decisions, lines 116–136][dec-custom] distinguish provenance and safe handling of definitions already in use. The proposal instead pairs in-place official edits with logging and undo without explaining which rule version an earlier action used.

**Failure:** A player may need to override a game restriction without gaining permission to edit another player's private data. A log can be complete without exposing DM secrets. Recomputing an old action using a newly edited spell changes history. Reversing a roll cannot make someone forget a revealed secret.

**Recommended alternative:** Separate game-rule discretion, application authorization and information visibility. Give custom definitions immutable identities and revisions; preserve the revision used by an action. Define authorized commands, private/public projections, audit records, compensating corrections and irreversible information disclosure. Make manual adjudication easy, while validating command structure and ownership. “Nothing blocked” must describe table discretion, not an absence of data integrity checks.

### 07 — major — Several market conclusions do not follow from their denominators

**Proposal:** [§5b domain priorities and dead ends, lines 190–228][p-domain].

**Evidence:** [D&D market, lines 35–49][d-counts] mixes created characters and dice activity; characters are not unique active players. [Lines 152–215][d-modules] and [445–461][d-market-inferences] infer usage from installed modules. Foundry's [2025 first-party report](https://foundryvtt.com/article/year-in-review-2025/) labels the relevant column **Pct. Installed**. Installing an optional wall-height module does not measure use of built-in lighting, and overlapping DAE/Midi populations do not establish an effects-only population. [Lines 439–440][d-fg-rating] cite one Fantasy Grounds rating; that is not a comparative satisfaction study. No evidence cited establishes that every experienced table disables karmic dice.

**Failure:** Directional anecdotes become ranked demand and categorical product exclusions. Historical complaints can also be mistaken for current product defects. The reports acknowledge limitations, but the proposal drops important qualifications.

**Recommended alternative:** Preserve denominator, cohort, collection date, access method and uncertainty beside each consequential claim. Separate installed capability, reported use and observed task success. Mark the rankings as hypotheses to test with this table. Retain existing owner exclusions when desired, but do not manufacture market proof for them. Use dated sources as examples unless current behavior has been verified.

### 08 — major — The twelve-product sequence is larger than advertised and misses the closest context

**Proposal:** [§5, lines 169–188][p-products].

**Evidence:** The twelve rows bundle nineteen game/app targets, plus Foundry system and module detail. [Methods, lines 358–365][m-competitors] recommends starting with three to five competitors. [Landscape, lines 29–47][l-physical] already identifies physical-table, offline, print and D&D-specific candidates that the final sequence omits. Encounter+ was deferred as unverified; its [current official site](https://www.encounter.plus/) documents offline local storage, encounters, initiative and a separate player screen.

**Failure:** Full dissections of several tactical video games can consume the research budget before testing the main promise: less friction at this group's table. A screenshot from a marketing page is not evidence about recovery, offline behavior or DM workload. Paid software, platform requirements and account access are not budgeted.

**Recommended alternative:** Begin with three actual-task comparisons, then add at most two targeted references when a named uncertainty needs them. Use the disposition of all twelve rows in §3. Each dossier should identify version, platform, access level, observed scenario, evidence, failures and the proposed transferable pattern. Mark untested claims. Resolve missing access without purchasing anything implicitly.

### 09 — major — The design process favors an approved catalog of screens over a convincing table experience

**Proposal:** [§4 steps 7–9, lines 124–162][p-sequence]; [§6 Phase 3, lines 230–245][p-phases]; [golden rule 7][p-golden].

**Evidence:** [Methods, lines 236–245][m-storymap] prioritizes a complete journey, and [lines 340–347][m-gameux] includes attention and engagement. [Benchmarks, lines 198–208][b-design] records conflicting design judgments. No benchmark establishes the right visual taste for this group. Mandatory list/detail/card/landing coverage for objects and high-fidelity mocks of every state across locales and viewports can recreate the administrative character the reset is meant to escape.

**Failure:** The owner approves attractive still images yet remains unable to assess interruption cost, density during play, attention returning to the table, or touch interaction. “Copy the dominant proven pattern” treats popularity as proof of suitability and encourages a patchwork of incompatible game interfaces.

**Recommended alternative:** My design preference, explicitly a judgment, is a coherent fantasy table: strong hierarchy, selective illustration, useful space for the current action, quiet feedback and role-specific phone views. BG3 can inform anticipation and consequence without dictating the browser's chrome. Compare two coherent directions on the same short playable scenario. Document behavior before shipping, but allow spatial experiments to change the document. Use representative high-fidelity states and systematic component checks instead of hand-approving the full Cartesian product of every screen variation.

### 10 — major — Permanent vendor ownership breaks complete tasks and provider fallback

**Proposal:** [§3, lines 59–87][p-roles]; [§7, lines 249–260][p-ownership].

**Evidence:** The proposal gives Codex UI implementation but Claude `tests/**`, and splits pixels from token-system code. [Skills, lines 69–83][s-lifecycle] describes bounded implementation with TDD; [Frameworks, lines 123–146][f-review-isolation] describes task isolation and review permissions. The proposal's own fallback table lets another provider implement code that the path rules reserve to the first provider.

**Failure:** A simple accessible control may require one agent for its component, another for its tokens and tests, then both for review. The implementer cannot reliably own a failing-test-to-fix loop. If Claude's quota ends, Astra is nominally a fallback yet is barred from completing the engine task. Codex is explicitly barred from changing specs without an owner decision; comparable constraints for Claude are unclear.

**Recommended alternative:** Assign a single implementer the complete bounded task, including related tests and documentation, regardless of provider. Reserve files temporarily to prevent concurrent edits; transfer that reservation during a handoff. Both providers may correct technical documentation within authorized intent. Product changes require the same owner boundary for both. Retain Claude-first interviewing and Codex-first design as revisable preferences, not exclusive capabilities.

### 11 — major — The confidence assigned to model superiority exceeds the evidence

**Proposal:** [§3 task-routing table, lines 68–87][p-routing].

**Evidence:** [Artificial Analysis](https://artificialanalysis.ai/articles/benchmarking-gpt-6-astra) reports ties at 53 on its Intelligence Index and 62 on its Coding Agent Index for the tested configurations; the coding systems use different native harnesses. [Benchmarks, lines 43–59][b-code] includes unpublished counterpart scores and combines different review studies. [CodeRabbit's Astra evaluation](https://www.coderabbit.ai/blog/gpt-6-astra-code-review-evaluation) compares Astra with Sol and Opus 5, not Fable 5.1. Its [Fable study](https://www.coderabbit.ai/blog/fable-5-1-model-review) warns that processing pipelines differ; its recall and precision are not directly interchangeable with the Astra study's actionable coverage.

**Failure:** A missing Astra score is treated as support for Claude's engine advantage, and instruction fidelity is assigned high confidence without a controlled relevant evaluation. Review advantages against older models become a presumed advantage over the current competitor. Computer grounding, drawing an SVG and designing a usable RPG application are different tasks.

**Recommended alternative:** Downgrade engine, intent-adherence and cross-provider review superiority to provisional task-routing hypotheses. Label each decision as benchmark-supported, tool-dependent, owner preference or untested judgment. Use the dated matrix in §5, with meaningful Claude/GPT alternatives. Neither vendor should inherit authority from an aggregate leaderboard.

### 12 — major — The local bake-off could confidently select the wrong route

**Proposal:** [§10, lines 303–314][p-effort].

**Evidence:** [Benchmarks, lines 285–332][b-bakeoff] proposes pairwise normalization, three tasks, a 60-minute limit, equally named effort settings and model judging. It uses an Astra-created design reference and Astra's visual verdict. The normalization formula is unspecified: a within-pair min–max interpretation would magnify even a tiny raw difference to the full range. One attempt cannot characterize reliability. Neither the report nor the official effort documentation establishes that `high` means equal computational work across providers.

**Failure:** The same authoring preference appears in the reference, scoring and judge. Easy-to-count checks can reward tests that merely mirror an implementation. A composite hides catastrophic failures behind good formatting or appearance. Refreshing all leaderboards and rerunning everything at every release consumes quota without necessarily changing a decision.

**Recommended alternative:** Use a small retained set of representative tasks with hidden acceptance checks, known review defects plus clean cases, and a separate constraint-adherence case. Predeclare pass/fail safety constraints; compare quality, elapsed time, owner interventions and actual consumption separately. Repeat close or consequential comparisons. Judge visual alternatives blind with the owner or representative users. Re-evaluate when a model, harness or observed failure could change the route. Keep the results provisional until this calibration is actually run.

### 13 — major — Effort guidance and quota recovery are not portable as written

**Proposal:** [§10 and prompt selection, lines 303–348][p-model-prompts].

**Evidence:** [Benchmarks, lines 256–258][b-cost] discusses API task costs beside subscription allowances. [Astra's official model page](https://developers.openai.com/api/docs/models/gpt-6-astra) describes API long-context pricing, not a conversion into Codex subscription messages. [Anthropic's effort documentation](https://platform.claude.com/docs/en/build-with-claude/effort) supports tuning effort by task. In [CodeRabbit's Fable experiment](https://www.coderabbit.ai/blog/fable-5-1-model-review), its Low configuration achieved 61.0 recall versus 57.1 for High; those experiment labels do not by themselves define the best Claude Code setting for this project.

**Failure:** Holding effort fixed for an entire session couples a simple cleanup to an earlier hard problem. A fallback only after a commit and `NEXT.md` update fails precisely when quota exhaustion leaves uncommitted work or a failing hook. “Codex only” also conflates HTML/SVG UI design with an image-generation tool.

**Recommended alternative:** Every issued prompt must state a recommended model, effort, cross-provider fallback, evidence date, uncertainty and required tools. Select effort for the bounded task; increase it for demonstrated difficulty. Preserve a resumable checkpoint before long work and allow a successor to inspect a dirty worktree without forcing an invalid commit. Check the actual account's remaining allowance separately from API pricing. Raster generation has a tool requirement; explicitly state when no equivalent Claude-native tool is available. See §5 for the standing owner preference and prompt header.

### 14 — blocking — A committed review file cannot contain the SHA of the commit that contains it

**Proposal:** [§7, lines 257–260][p-review-sha]; [golden rule 6][p-golden].

**Evidence:** [Frameworks, lines 154–156][f-review-sha] repeats the same design: commit the verdict and require its recorded SHA to equal `HEAD`. This is a construction defect. Review candidate commit A, then add its verdict: the resulting commit is B. Updating the verdict to B creates C. The proposal supplies no separation of the reviewed candidate from the evidence commit.

**Failure:** An honest gate cannot reach its stated success condition through the described workflow. Implementations will either fail forever or quietly weaken what “reviewed HEAD” means.

**Recommended alternative:** Use a trusted external check attached to the exact immutable candidate SHA; store the review output as that check's artifact. Any candidate change invalidates the check and triggers review again. A repository report may reference a previously reviewed SHA, but must not claim to attest to its own containing commit. Prove the gate on a tiny candidate, then demonstrate rejection after a one-line change, before using it on product work.

### 15 — major — Read-only review and reviewer identity are assertions, not yet verified controls

**Proposal:** [§7, lines 249–260][p-ownership].

**Evidence:** [Frameworks, lines 123–146][f-review-isolation] recommends restricting Edit/Write tools by path but gives the Claude reviewer Bash access. My technical inference is that this leaves a write-capable route unless additional shell or filesystem restrictions are demonstrated. [Skills, lines 185–206][s-harness] describes harness differences. The proposal treats a fresh subagent, a review command and an enforced read-only filesystem as equivalent, while expecting the reviewer to write `review.json`. A writer-controlled JSON field does not authenticate who reviewed the work, and the Git author is deliberately the human owner in the current workflow.

**Failure:** The claimed controls can be bypassed accidentally by a shell, a shared repository path, or a rewritten review file. Honest same-owner commits may also be rejected by a naive reviewer-versus-author test. A green check would prove that a string says “approve,” not that an independent review happened.

**Recommended alternative:** Let reviewers read an immutable candidate and return findings through a separate output channel; let the orchestrator record them. Check the actual filesystem permissions, shell paths and remote credentials in both harnesses. Have the trusted review runner supply agent identity, model, candidate SHA and result rather than trusting author-supplied fields. Protect changes to the gate itself. Test the controls; use simpler explicit workflow checks where a stronger security boundary is not available.

### 16 — major — Cross-review can deadlock or let the author adjudicate their own work

**Proposal:** [§3, lines 80–87][p-routing]; [§6 Phase 2][p-phases]; [§7, lines 261–266][p-review-brief]; [task template, lines 350–360][p-task-template].

**Evidence:** [Benchmarks, lines 235–254][b-routes] preserves Claude as intent tie-breaker and Codex as visual authority, even when they authored the artifact. [Frameworks, lines 66–87][f-proportional] warns about process overhead. The proposal alternates between zero blocking findings, zero clarification requests, approval, and merely requesting review. These are different completion conditions. The [cross-review template][p-templates] also explicitly lists accessibility and offline behavior, whereas the general reviewer brief narrows findings to correctness or stated requirements.

**Failure:** A substantive major issue can survive one gate while another says the work is approved. An author can win a disagreement by invoking their specialty. A correctness-only brief can exclude accessibility and task-flow defects unless every one was anticipated in the spec. Conversely, repeatedly asking two models to find gaps can generate endless optional work.

**Recommended alternative:** Define one severity and closure policy: resolve or explicitly disposition every actionable finding; require fresh approval of the actual candidate. Use reproducible evidence to resolve technical disputes, with a bounded second opinion when necessary. The author does not break a tie on their own work. Escalate only real product, taste, cost or authority choices to the owner, with a concrete demonstration. Review correctness, security, accessibility and agreed task outcomes; label optional preferences separately. Reserve deeper review for changes whose risk warrants it.

### 17 — major — The skill shortlist recreates the stack-management project it is meant to remove

**Proposal:** [§9, lines 279–301][p-skills]; [Phase 0, lines 399–438][p-bootstrap].

**Evidence:** [Skills, lines 185–206][s-harness] requires checking actual harness behavior and pinning reviewed versions. [Frameworks, lines 80–87][f-proportional] proposes full, light and no-spec lanes. The proposal's twelve rows contain multiple packages, a complete lifecycle suite, review bridges, several evaluators and five new house skills. Its count is of table rows, not active instructions or dependencies. [Skills, line 222][s-stop] discourages stop-hook review loops, while [Frameworks, lines 282–288][f-stop] recommends enabling one.

**Failure:** The owner inherits overlapping triggers, update and trust decisions, conflicting defaults and another internal framework to maintain before using the product. Replacing frontend-design, grill-me and writing-skills is asserted before a task-specific comparison. Omitted standing tools such as Task Observer have no explicit disposition.

**Recommended alternative:** Keep the installed lifecycle, design, simplicity and browser capabilities initially; inventory actual overlapping instructions. Trial a replacement on a real task before removing its incumbent, using the owner's existing skill-adoption process. Keep graph and diagram tools on their applicable paths, and Firebase guidance where needed. Start house workflows as short task templates; promote them to skills only after repetition demonstrates value. Record version, license, required permissions, both-harness checks and replacement decision for each adoption. Do not make installation of the entire shortlist a prerequisite for discovery.

### 18 — major — The single handoff and decision rules conflict with parallel work

**Proposal:** [§7–8, lines 249–277][p-memory]; [golden rules 3–5][p-golden].

**Evidence:** [Frameworks, lines 167–197][f-decisions] distinguishes decisions, status and verification. The proposal combines worktrees per task per agent with one `NEXT.md` rewritten every session. It also mandates one artifact per session while requiring a report, verdict, handoff and frequently a decision or spec update. The ledger example already has a supersedes field, but “latest dated decision wins” does not say how scope limits precedence or when that link is mandatory.

**Failure:** Concurrent agents can produce individually valid handoffs that overwrite or misrepresent each other's unfinished work. A later narrow decision may accidentally supersede an unrelated broad one. An append-only ledger can preserve a mistake indefinitely while current documents interpret it differently. Quota recovery needs unfinished state as well as a last successful commit.

**Recommended alternative:** Use one task record per active task and one designated integrator for the compact shared handoff. Record worktree, branch, candidate SHA, dirty files, reservation, remaining work, checks and pending owner decisions. Keep the proposed stable decision IDs and supersedes links; require scope, authority and explicit applicability when resolving conflicts, and correct mistakes by a new entry. Interpret the golden rule as one bounded objective per task, with the artifacts necessary to prove it. A session boundary should not itself require a commit or an extra owner decision.

### 19 — major — Acceptance gates measure documentation and screenshots more than successful play

**Proposal:** [§4 steps 8–10 and screen example, lines 124–162][p-sequence]; [§6, lines 230–245][p-phases]; [design/build templates, lines 363–396][p-templates].

**Evidence:** [Methods, lines 288–312][m-sprint] includes real-user prototype testing, [lines 392–429][m-usability] discusses usability evaluation, and [lines 442–479][m-ears] describes requirements syntax. The proposal includes EARS, Gherkin and usability criteria but no participant plan, baseline, observation procedure or required result. The hotbar example leaves “immediate,” resource override, DM confirmation and non-pausing reactions without enough temporal semantics to test.

**Failure:** Two agents can agree that every state exists while the DM still needs extra clicks, players cannot act without coaching, or a reaction prompt interrupts the wrong person. Syntactically valid requirements can describe the wrong behavior. Screenshots cannot establish keyboard access, screen-reader meaning, touch targets, motion tolerance or offline recovery.

**Recommended alternative:** Before detailed work, define a short task script, current baseline and observable pass conditions for player and DM. Test an uncoached representative player and the actual DM; add other users if broad-market claims are intended. Measure errors, completion, interruptions and recovery, including Italian and a phone. Specify reaction windows and authority with concrete event sequences. Use static screenshots for visual judgment and live interaction for behavior. Select coverage by risk, then automate stable checks; do not require a high-fidelity image of every combination.

### 20 — major — Licensing and Italian terminology are deferred despite a usable authoritative source

**Proposal:** [§4 teaching, lines 110–122][p-teaching]; [§6 Phase 4][p-phases]; [golden rule 9][p-golden].

**Evidence:** [D&D primer, lines 560–562][d-italian] points at official Italian terminology without establishing the distributable source. Wizards' [current SRD page](https://www.dndbeyond.com/srd) provides an official Italian SRD 5.2.1, released December 8, 2025, and explains the SRD's limited content and licensing. The [landscape's 5e.tools entry, line 38][l-physical] already highlights a content-source boundary.

**Failure:** Agents may translate from a different rules version, conflate SRD terminology with all commercial D&D terminology, or place protected reference material and screenshots in a new public repository without a recorded distribution basis. A folder called “private” does not itself resolve permissions. Deferring this until after mock approval makes rework likely.

**Recommended alternative:** Start with versioned English and Italian SRD sources, attribution and stable content identifiers. Separate published rules, commentary, house rules, user imports and product artwork. Record provenance and redistribution permissions for reused text and assets, including public research evidence. Keep non-SRD reference examples out of public fixtures unless their use is established. Agents should prepare this source map; the owner decides only actual licensing, distribution or spending choices.

### 21 — major — The reset lacks an explicit disposition of existing promises and a complete live-service transition

**Proposal:** [§0–2, lines 17–57][p-reset]; [§6 Phase 6][p-phases]; [§12–13, lines 399–457][p-bootstrap-golden].

**Evidence:** [PRODUCT.md, lines 8–39][product-intent] contains group-first scope, a shared next-session calendar, 2024-only rules, automation defaults and complete-session goals. [D&D market, lines 573–576][d-scheduling] excludes scheduling from the category it evaluates; exclusion from that research does not revoke a product commitment. [Current decisions, lines 99–108][dec-delegation] delegates routine integration, while the proposal introduces more owner gates. [PRODUCT.md, lines 39–52][product-delivery] and the proposal both mention six migration fixtures; six fixtures alone do not establish a safe live transition.

**Failure:** A new repository can silently erase still-desired promises or carry undesired ones through inference. Meanwhile production continues changing. A late migration step does not identify the final data snapshot, source-of-truth period, edits made during transition, old-client behavior, restore path or fallback to production. An approval-heavy process makes a prompt-only owner the operator of all exceptions.

**Recommended alternative:** Prepare a short retain/reopen/supersede table for existing owner decisions before treating the new proposal as authority. Preserve player data and explicit release authority throughout. Inventory migration-relevant behavior early; rehearse export, import, restore, idempotency and a failed cutover with representative and adversarial data. Define how production changes reach the new work and what ends the overlap. Supply a plain-language health and recovery view so the owner can request recovery without reading diffs. Do not infer approval of a real migration from approval of this plan.

## 2. Recommended order of the eleven steps

This is a replacement sequence for the proposal, not an instruction to implement it during this review. Keep the whole-product ambition visible, but deepen the next demonstrable slice rather than completing every method for the whole product. An appetite limits the next experiment's expenditure and owner attention; it need not impose an arbitrary final-product deadline.

| Step | Work                                                                            | Evidence needed to move on                                                                                            |
| ---- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 0    | Frame audience, desired outcome, preserved decisions, constraints and appetite. | One scoped decision brief; unresolved product choices explicit.                                                       |
| 1    | Observe actual table stories and the current workaround.                        | Concrete incidents and a baseline task script, not answers to proposed features.                                      |
| 2    | Rank opportunities and assumptions by consequence and uncertainty.              | One first complete journey and a short list of failure risks.                                                         |
| 3    | Inspect three relevant products; add targeted references only as needed.        | Comparable task evidence with access/version limitations recorded.                                                    |
| 4    | Model objects, events and permissions together for that journey.                | Representative examples, exceptions and source-backed rule definitions.                                               |
| 5    | Test the most expensive technical and interaction assumptions.                  | Disposable evidence for offline, authority, corrections and any uncertain interaction. Return to steps 2–4 if needed. |
| 6    | Map the end-to-end journey and select a walking skeleton.                       | A DM/player scenario that reaches a meaningful outcome without orphan features.                                       |
| 7    | Explore breadboards, rough layouts and a thin interactive prototype.            | Competing spatial choices made concrete; unknowns may update the model.                                               |
| 8    | Test with the DM and representative players.                                    | Uncoached behavior, errors, interruptions and recovery compared with the baseline.                                    |
| 9    | Consolidate the next slice's screen contract, EARS, examples and checks.        | An implementable contract with explicit open questions and known constraints.                                         |
| 10   | Cross-review scope, feasibility, evidence and readiness; approve the slice.     | Actionable findings resolved or explicitly dispositioned; owner sees the experience and any product decisions.        |

Then implement one vertical slice with the existing lifecycle and repeat the learning loop. Keep later screens as a breadth map until evidence justifies deeper specification. This preserves deliberate design without claiming that all uncertainty can be interviewed away.

## 3. Disposition of all twelve reference rows

These are recommendations about research value for the stated job, not new empirical rankings of product quality. Start with D&D Beyond, Encounter+ and Owlbear on the same short table scenario. Add one homebrew/automation reference and one visual-interaction reference only if the first observations leave those questions open.

| Proposal row                                                | Recommended disposition                                                                   | Specific question to investigate                                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Baldur's Gate 3                                          | Keep a targeted interaction and atmosphere study; do not require the first full teardown. | How does the player anticipate cost, target, consequence and failure without reading an instruction panel?                                                     |
| 2. Solasta 1 and 2                                          | Use selected rule-timing and edition examples.                                            | Which prompts communicate reactions and resource choices, and what did supporting a new edition cost? Remove the unsupported “only 2024 implementation” claim. |
| 3. Foundry dnd5e, Active Effects and Midi-QOL               | Keep a bounded automation/override investigation.                                         | Where does manual adjudication fit, and what configuration burden makes the table slower? Distinguish base-system and module behavior.                         |
| 4. D&D Beyond                                               | Promote to the first task comparison.                                                     | How do sheet use, search, ordinary actions and exceptional corrections work for the target group?                                                              |
| 5. Shard                                                    | Strong candidate for the homebrew slot.                                                   | Can a DM change a creature or content definition during play without losing provenance or understanding the consequences?                                      |
| 6. Owlbear Rodeo                                            | Promote for low-friction table coordination.                                              | How quickly can a DM bring players into the right shared context and recover from a mistake?                                                                   |
| 7. Roll20                                                   | Defer a full teardown unless an observed gap requires it.                                 | Does its mixed sheet/map workflow reveal an interaction missing from the first comparisons?                                                                    |
| 8. Pathbuilder                                              | Target character-building choices; do not treat another rules system as D&D authority.    | How are dependent choices, invalid selections and build revision explained?                                                                                    |
| 9. Wrath of the Righteous / Rogue Trader                    | Defer broad inspection; select a specific dense-information problem.                      | Which comparison or explanation pattern survives translation to a phone and a live tabletop?                                                                   |
| 10. Fire Emblem / Into the Breach / Tactical Breach Wizards | Choose one when studying consequence preview.                                             | Can the interface make outcomes legible without imposing video-game certainty on DM adjudication?                                                              |
| 11. Avrae / Improved Initiative                             | Study one action/logging or encounter task at a time.                                     | What can a concise command, log or initiative display teach without importing a chat product?                                                                  |
| 12. LegendKeeper / Kanka / Neverwinter Nights DM client     | Select according to an actual prep or live-DM incident.                                   | What information must be retrieved or revealed quickly, and what remains private?                                                                              |

**Missing from the shortlist:** Encounter+ deserves an early slot for its documented physical/offline context. AboveVTT, Fight Club/GM 5 and print-oriented tools already appear in the landscape and deserve targeted access checks before adding another full CRPG study. Alchemy is a useful candidate for scene and atmosphere questions; a simple encounter builder can challenge the need for a heavyweight workflow. These are candidates to replace lower-value research, not additions to a mandatory ever-growing list. The closest comparator remains the group's current table setup, including paper and physical dice.

## 4. Amend the ten golden rules

| Rule                                                         | Disposition                            | Recommended wording or clarification                                                                                                                                         |
| ------------------------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Spec is intent; code/test is truth                        | Amend                                  | Approved intent is authoritative. Code and tests are evidence of behavior and can both be wrong. Resolve contradictions using the applicable source and executable examples. |
| 2. No drawings without approved screen documents             | Replace                                | No production implementation without an adequate contract. Disposable sketches and experiments may precede and revise it. Verification is proportional to risk.              |
| 3. One question/task/artifact per session                    | Replace                                | One bounded objective and accountable implementer per task; include the tests and evidence it needs. Keep concurrent edits isolated.                                         |
| 4. Every session rewrites the only handoff                   | Amend                                  | Each task preserves resumable state; one integrator maintains the shared handoff. The repository remains the durable record.                                                 |
| 5. Latest dated decision wins                                | Amend                                  | The applicable owner decision wins within its scope; supersession is explicit and linked. A new date alone does not repeal unrelated decisions.                              |
| 6. Other agent approves current commit                       | Keep the intent; replace the mechanism | Independent review attaches to an immutable candidate through a trusted check. Changes invalidate approval; authors cannot approve themselves.                               |
| 7. Copy dominant proven patterns                             | Amend                                  | Reuse patterns demonstrated to fit the task; maintain one coherent visual language. Popularity is evidence to investigate, not a design verdict.                             |
| 8. Every roll logged with provenance and undo                | Amend                                  | Preserve authorized auditability, source/version and visibility. Corrections preserve history; define limits where information or dependent actions cannot be undone.        |
| 9. EN/IT; public SRD / private pack                          | Keep and specify                       | Use versioned licensed sources, Italian terminology, attribution, provenance and explicit import/distribution boundaries.                                                    |
| 10. Owner gates deploy, release, migration, cost and secrets | Keep                                   | Keep external authority with the owner and prepare concrete evidence first. Agents resolve routine technical matters autonomously within that authorization.                 |

Do not expand this into another long constitution. Put operational details in the workflow that executes them. Explicitly disposition the current free-operation promise, edition scope, accessibility expectations and live-data preservation rather than assuming the ten slogans encode them.

## 5. Model, effort and fallback for future prompts

**Standing owner preference recorded by this review:** every prompt supplied from now on must include a recommended model and reasoning effort, with a Claude/GPT alternative where possible. Recommendations must cite dated benchmark evidence or explain that the choice is an operational preference. This review records the preference without changing global settings or existing repository instructions.

Evidence checked on **2026-09-12**: the [AA comparison](https://artificialanalysis.ai/articles/benchmarking-gpt-6-astra) supports treating both flagships as credible candidates; it does not establish a best model for each task below. The [Astra review study](https://www.coderabbit.ai/blog/gpt-6-astra-code-review-evaluation) supports trying Astra for review, with the comparison limits in finding 11. Official [Astra capabilities](https://developers.openai.com/api/docs/models/gpt-6-astra) and [Claude effort guidance](https://platform.claude.com/docs/en/build-with-claude/effort) establish available settings, not equal compute budgets. **The exact effort assignments below are risk-based starting recommendations, not benchmark-proven optima.** No local comparison has yet been run.

| Prompt type                                                             | Recommended model and effort                                                   | Claude/GPT alternative                                                                                             | Basis and boundary                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revise this proposal using the review                                   | Claude Fable 5.1 — `xhigh`                                                     | GPT-6 Astra — `xhigh`                                                                                              | Difficult synthesis across conflicting requirements; Claude can revise its draft, then a fresh independent session reviews it. No superiority claim.                                                                                                           |
| Interview the owner about actual table incidents                        | Claude Fable 5.1 — `high`                                                      | GPT-6 Astra — `high`                                                                                               | Retains the owner's preferred facilitator; direct interviewing superiority is unproven. Keep observation separate from recommendations.                                                                                                                        |
| Bounded source research or product dossier                              | GPT-6 Astra — `high` when its browser tools provide the needed access          | Claude Fable 5.1 — `high` with equivalent source access                                                            | Tool access and traceable evidence decide this route. Either can write the dossier.                                                                                                                                                                            |
| Object/event synthesis, difficult spec or architecture                  | Claude Fable 5.1 — `high`; `xhigh` for unresolved interactions                 | GPT-6 Astra — the corresponding `high` or `xhigh`                                                                  | Existing preference, supported only broadly by both models' capability. Validate consequential assumptions with experiments.                                                                                                                                   |
| Wireframe, interactive mock or visual direction                         | GPT-6 Astra — `high`                                                           | Claude Fable 5.1 — `high`                                                                                          | Codex-first is an owner/taste preference; public UI evidence is directional and the live Arena scores were not confirmed here. Both can produce HTML/CSS/SVG.                                                                                                  |
| Raster concept art or image editing                                     | GPT-6 Astra — `high` for the brief, using the configured image-generation tool | Claude Fable 5.1 — `high` can prepare the same brief; no equivalent Claude-native raster generator was established | The generator is a separate tool/model. [GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2) is an image model; Astra's reasoning effort is not an image-quality setting. Do not silently substitute an SVG for a requested raster result. |
| Bounded engine or UI implementation, including its tests                | Claude Fable 5.1 — `high` for engine; GPT-6 Astra — `high` for UI              | The other flagship — `high`, taking over the complete task                                                         | Initial ownership preference only. Transfer tests, docs and file reservations with the task. No permanent provider monopoly.                                                                                                                                   |
| Difficult debugging, data migration design or concurrency investigation | GPT-6 Astra — `xhigh`                                                          | Claude Fable 5.1 — `xhigh`                                                                                         | High-consequence reasoning warrants a larger initial budget; explicit reproductions and checks decide whether the result works.                                                                                                                                |
| Independent routine review                                              | The flagship that did not implement — `high`                                   | A fresh session of the other available provider — `high`                                                           | Independence from the author's context matters. Confirm findings against code and tests rather than counting comments.                                                                                                                                         |
| Adversarial architecture, permission or large-proposal review           | GPT-6 Astra — `xhigh` for a Claude-authored candidate                          | Claude Fable 5.1 — `xhigh` for an Astra-authored candidate                                                         | Evidence diversity and risk, not a proven universal review winner. If only the author's provider is available, use a fresh context and disclose the reduced diversity.                                                                                         |
| Small documentation update, deterministic formatting or handoff         | Either available flagship — `medium`                                           | The other flagship — `medium`                                                                                      | Use the available allowance; a top reasoning setting is not justified by the task. Prefer deterministic tools for deterministic work.                                                                                                                          |

Use `max` only when a consequential task still fails at the recommended setting or a relevant controlled comparison warrants it. A cheaper model can replace a flagship after passing the same local acceptance task; the reports do not justify declaring a cheaper route universally equivalent. Check model and tool availability before a long run. Do not promise a fixed number of remaining subscription prompts from API prices.

Every generated prompt should start with this information, with the fields filled rather than copied as placeholders:

```text
Recommended model: [exact model] | Reasoning effort: [setting]
Fallback: [other-provider exact model] | Reasoning effort: [setting]
Basis: [dated benchmark or explicit operational preference; confidence/limitations]
Required tools: [capabilities the task actually needs; any missing fallback capability]
Resume from: [repository/worktree, branch, candidate SHA, task record and dirty state]
```

Then specify the objective, authorized files/actions, relevant source of truth, completion evidence and decision boundary. When changing provider, the successor checks the real worktree and current diff before continuing; the last commit alone is insufficient. Do not insist on a successful commit from an exhausted or interrupted predecessor.

## 6. Decisions only the owner should make

These are proposed questions for a subsequent revision session, not approvals assumed by this review. Recommended options appear first. Existing decisions remain applicable until the owner changes them; choices about hook syntax, framework wiring, test placement and routine technical conflict resolution are intentionally excluded.

| Decision                                                       | Multiple-choice options                                                                                                                                                                                           | Recommendation and consequence                                                                                                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who must the first demonstrable experience serve?              | **A. The existing DM and group first.** B. A broader Italian D&D audience from the outset.                                                                                                                        | **A.** Validate against known sessions first. B requires recruiting users beyond the owner and changes the research burden; general-market statistics cannot substitute for them.                   |
| What edition promise should the restart make?                  | **A. 2024 engine first, with an explicit migration policy for existing characters.** B. Independently executable 2014 and 2024 rules per seat from the first release.                                             | **A.** Preserve the current narrower promise unless mixed-edition play is a demonstrated need. B is legitimate, but requires an explicit compatibility and QA commitment.                           |
| What must “offline” mean for the first release?                | **A. Usable local character/table data on one device, plus printable sheets.** B. A synchronized table without Internet, over a local network. C. Independently edited disconnected devices that reconcile later. | **A as the first proven capability.** B or C should be selected if the real table needs them; they imply different authority and recovery behavior. Do not market A as B or C.                      |
| How much automation should a normal configured action require? | **A. Execute according to the campaign's configured defaults, with player controls and DM correction.** B. Require DM confirmation before every authoritative effect.                                             | **A.** This retains the current automation direction and avoids turning the DM into a click approver. Define exceptions and visibility explicitly.                                                  |
| May the restart incur new recurring costs?                     | **A. Use existing subscriptions and the current free-operation constraint; no new paid services.** B. Allow a separately specified monthly ceiling for additional tools or hosting.                               | **A until changed explicitly.** B needs an actual ceiling and scope. Neither a benchmark result nor accepting a technical plan authorizes a purchase.                                               |
| What should the owner approve during design?                   | **A. Coherent visual direction and playable task outcomes, plus consequential product changes.** B. Every detailed screen document and every rendered state before implementation.                                | **A.** It preserves visual authority while reducing clerical approvals. B is possible, but its owner-time burden should be acknowledged and accepted rather than described as effortless prompting. |

## 7. What is missing entirely as an operational artifact

Several topics are named in the proposal; the missing element is an executable contract or evidence plan, not necessarily the word itself.

- **A baseline and outcome scorecard:** what successful play improves, who observes it, how errors and interruptions are counted, and what would make the team stop or reshape the next experiment.
- **A traceable evidence register:** claim, primary source, date/version, cohort, observed versus inferred status, uncertainty, decision affected and validation needed. The reports' confidence labels are not enough by themselves.
- **A participant and access plan:** the actual DM/player sessions to observe, novice versus experienced coverage, competitor accounts/platforms already available, and substitutes for unavailable evidence.
- **A versioned rule-conformance corpus:** canonical source references, exception timing, supported customization levels, edition boundaries and regression examples independent of either agent's prose.
- **A multiplayer authority and visibility contract:** command ownership, simultaneous actions, reaction windows, hidden rolls, retries, disconnected edits, reconciliation and corrections after downstream effects.
- **An interaction-accessibility acceptance set:** keyboard and screen-reader behavior, focus after dialogs, touch and long Italian labels, contrast, reduced motion and readable print. A locale/viewport screenshot matrix does not cover these.
- **An independently verifiable review protocol:** immutable candidate, actual reviewer identity, output channel, protected gate, invalidation, disagreement handling, false-positive disposition and behavior when a provider is unavailable.
- **A small skill adoption/disposition record:** retained versus replaced capabilities, pinned versions, permissions, both-harness behavior and an evaluated benefit. No new skill framework is needed to write that record.
- **A quota/interruption recovery contract:** unfinished changes, failed checks, active reservations, resumable task location and the alternate provider's required tools. This is central for an owner who operates by prompts.
- **A production coexistence and recovery plan:** ongoing production fixes, data ownership during transition, export/restore proof, a failed migration rehearsal, old-client handling, cutover conditions and rollback authority.

The next useful deliverable is a revised proposal that resolves these findings and presents the six owner choices with their consequences. It should not be a new repository filled with the proposed governance stack before the operating model has been shown to work.

## Source anchors

All repository links below are pinned to the reviewed commit. Web sources are linked beside the claims they support and were checked on September 12, 2026.

[p-reset]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L17-L57
[p-roles]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L59-L87
[p-routing]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L68-L87
[p-interview]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L89-L122
[p-teaching]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L110-L122
[p-sequence]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L124-L162
[p-screen]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L141-L162
[p-products]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L169-L188
[p-domain]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L190-L228
[p-domain-core]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L190-L212
[p-promises]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L205-L212
[p-phases]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L230-L245
[p-ownership]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L249-L260
[p-review-sha]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L257-L260
[p-review-brief]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L261-L266
[p-memory]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L249-L277
[p-skills]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L279-L301
[p-effort]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L303-L314
[p-model-prompts]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L303-L348
[p-task-template]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L350-L360
[p-templates]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L363-L396
[p-bootstrap]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L399-L438
[p-bootstrap-golden]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L399-L457
[p-golden]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/RESTART_PROPOSAL.md#L440-L457
[m-premise]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-methods.md#L3-L6
[m-shapeup]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-methods.md#L69-L95
[m-discovery]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-methods.md#L129-L165
[m-orca]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-methods.md#L185-L222
[m-storymap]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-methods.md#L236-L245
[m-sprint]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-methods.md#L288-L312
[m-gameux]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-methods.md#L340-L347
[m-competitors]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-methods.md#L358-L365
[m-usability]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-methods.md#L392-L429
[m-ears]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-methods.md#L442-L479
[m-grilling]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-methods.md#L502-L516
[l-physical]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-landscape.md#L29-L47
[s-lifecycle]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-skills.md#L69-L83
[s-harness]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-skills.md#L185-L206
[s-stop]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-skills.md#L222
[f-proportional]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-frameworks.md#L60-L87
[f-review-isolation]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-frameworks.md#L123-L146
[f-review-sha]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-frameworks.md#L154-L156
[f-decisions]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-frameworks.md#L167-L197
[f-stop]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-frameworks.md#L282-L288
[b-code]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-benchmarks.md#L43-L59
[b-design]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-benchmarks.md#L198-L208
[b-routes]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-benchmarks.md#L235-L254
[b-cost]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-benchmarks.md#L256-L258
[b-bakeoff]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-benchmarks.md#L285-L332
[d-table]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-dnd-primer.md#L157-L179
[d-reaction]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-dnd-primer.md#L194-L199
[d-derived]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-dnd-primer.md#L284-L294
[d-inspiration]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-dnd-primer.md#L465
[d-italian]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-dnd-primer.md#L560-L562
[d-counts]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-dnd-market.md#L35-L49
[d-modules]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-dnd-market.md#L152-L215
[d-fg-rating]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-dnd-market.md#L439-L440
[d-market-inferences]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-dnd-market.md#L445-L461
[d-hidden]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-dnd-market.md#L470-L493
[d-scheduling]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-dnd-market.md#L573-L576
[d-market-scope]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/restart-research/2026-09-12-dnd-market.md#L611-L644
[product-intent]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/PRODUCT.md#L8-L39
[product-scope]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/PRODUCT.md#L20-L34
[product-delivery]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/PRODUCT.md#L39-L52
[dec-delegation]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/DECISIONS.md#L99-L108
[dec-custom]: https://github.com/salvodicara/d20-folio/blob/7fc140ef0c68501827a286fbcc1c1fc1f80aa1fb/docs/program/DECISIONS.md#L116-L136
