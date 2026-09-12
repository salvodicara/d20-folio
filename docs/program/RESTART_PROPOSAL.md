# Restart proposal v3 — d20 Studio (2026-09-13)

Owner request of 12 September 2026: stop before the next mock pass, return to product design,
interrogate every feature, screen, button and interaction from zero, in a new repository whose
process is designed for Codex (GPT-6 Astra, "Astra") and Claude (Fable 5.1) working together, run
only through prompts by the owner. Copy proven methods and products; invent almost nothing. No time
limit: the group keeps playing on production `main` meanwhile. The product name is provisional
(working name **d20 Studio**) and may change once the direction is clear.

This is v3. It revises v2 (`7fc140e`) after the Codex adversarial review of 12 September
([`restart-research/2026-09-13-codex-review.md`](restart-research/2026-09-13-codex-review.md), 21
findings) and Claude's response to each finding
([`restart-research/2026-09-13-claude-response.md`](restart-research/2026-09-13-claude-response.md)).
It rests on the seven research reports in [`restart-research/`](restart-research/) — methods,
landscape, skills, frameworks, benchmarks, D&D primer, D&D market — as corrected on 13 September
(response §5). It is a proposal until Codex has re-reviewed it (§12, step −1b) and the owner has
decided the questions in §14. It authorises no repository, deployment, migration, purchase, cost or
skill installation.

## 0. Diagnosis, and what the restart keeps

- Governance weighs more than the product: the steering, design, golden-rule, constitution and
  program documents total ~2,000 lines; 136 documents under `docs/`; three overlapping
  methodologies (Superpowers lifecycle, 36 golden rules, P01–P30 program).
- No surface was ever specified element by element: mock 0.9.3 is the reference, but no document
  lists every screen with its objects, states, calls-to-action and consequences — and drawing came
  first.
- No gate ever measured play: blocks closed on documents, checks and screenshots, never on the DM
  and a player finishing a scenario with fewer interruptions than before.
- Worth keeping as **evidence** (never as authority): `PRODUCT.md` §Steering, the jobs research
  (`docs/superpowers/research/2026-09-03-self-contained-jobs.md`), `docs/program/DECISIONS.md`,
  the ADRs, the BG3/D&D Beyond research, mock 0.9.3, the engine knowledge in `src/lib` (the
  append-only log, the reducer, the dice seam, the Grant model) and P03's offline work — the spikes
  of §4 start from them instead of from nothing.

**Disposition of existing promises (review finding 21).** Before the new repository is treated as
authority, step 0 produces a retain / reopen / supersede table for every dated owner decision and
every promise in `PRODUCT.md`. The defaults this proposal assumes, none of which it changes on its
own:

| Existing decision or promise                                                                | Default in this proposal                                                                  |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| The group first, then other groups and the public (2026-09-03)                              | Retained; the first demonstrable experience serves the group's real table                 |
| The two parities — BG3 at the table, D&D Beyond around the character (2026-09-03)           | Retained as the complete objective (§2b)                                                  |
| The nineteen jobs, including the shared session calendar (`PRODUCT.md`)                     | Retained as the ambition; the ten evidence-ranked jobs of §5b order them, replace nothing |
| Free operation, offline-first PWA, EN/IT, SRD public / non-SRD private                      | Retained; "offline" is specified per release in §14 Q2                                    |
| D&D 2024 only; 2014 characters migrate (2026-09-03)                                         | Retained by default; reopened as a question only because the market evidence is new (Q1)  |
| Automation default full auto, three campaign levels, per-person dice (2026-09-03, -07)      | Retained, no question                                                                     |
| Astra owns visual and taste decisions; Claude the rest; split by decision type (2026-09-09) | Retained; §7 replaces the v2 path-ownership that contradicted it                          |
| BG3 and D&D Beyond studied as primary and binding references (2026-09-09)                   | Retained; §5 changes the method, not the rank                                             |
| Rule 30 giants' shoulders, with the dossier gate (2026-09-03, -09)                          | Retained; wording amended in §13 rule 7                                                   |
| Raster art generated with GPT, BG3-inspired, never identical (2026-09-09)                   | Retained; recorded as a tool dependency in §3                                             |
| The 8 September standing delivery delegation                                                | Retained; v2's per-screen owner approval before any drawing is withdrawn (§14 Q3)         |
| Dark theme only, name and mark, immersive-v2 base (2026-09-05)                              | Retained as evidence; the visual direction is compared anew in Phase 3 from images        |
| Production `main` untouched, staging mandatory, six fixtures, owner gates (2026-09-03)      | Retained; the transition plan is inventoried early (§6 Phase 6)                           |

## 1. What the research says (one line each; details in the reports)

| Finding                                                                                                                                                                                              | Report     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Structure before screens: Object-Oriented UX (ORCA) inventories every object, relationship, call-to-action and attribute before any wireframe; Event Storming adds behaviour over time               | methods    |
| Questions must pass the Mom Test: ask about the last session that happened, never "would you like X"; recommended answers belong to decision questions, not to observation                           | methods    |
| Shape Up shapes with breadboards and fat-marker sketches and limits upfront definition by appetite; Pocock builds a throwaway prototype when a question is ungrillable                               | methods    |
| Acceptance criteria in EARS ("WHEN …, THE SYSTEM SHALL …") are readable by the owner and testable by the agents; they prove states exist, not that play got easier                                   | methods    |
| Full per-feature document hierarchies (Spec Kit, BMAD wholesale) drift and cost tokens; borrow their best parts (clarify taxonomy, dated answer ledger, checklists)                                  | frameworks |
| Superpowers is the most adopted lifecycle, official on both harnesses, and already the owner's default: keep it as the backbone                                                                      | frameworks |
| Two agents on one repo work when concurrent edits are isolated, the reviewer is read-only, and the verdict is attached to the immutable candidate                                                    | frameworks |
| Separating the agent that does the work from the agent that judges it is Anthropic's own strongest lever for long-running work                                                                       | frameworks |
| Every tool the owner likes (superpowers, impeccable, ponytail, graphify, archify, Pocock's grilling) is alive, MIT/Apache, and runs in Codex too                                                     | skills     |
| One skills home: `.agents/skills/` read by Codex, `.claude/skills` a committed symlink to it; the stop-time review-gate hook is not enabled                                                          | skills     |
| The group's current setup plus D&D Beyond and BG3 are the first comparison; Encounter+ (verified) covers the offline physical table; Sigil is dead; "sheet + map + dice on one screen" is the demand | landscape  |
| GPT-6 Astra and Fable 5.1 are tied on the independent composite indices and lead on different rows; routing is per task, labelled by its basis, and re-evaluated on trigger                          | benchmarks |
| The game's unit of work is the session; rules are typed data; the primer is commentary and the SRD 5.2.1 — now official in Italian, CC-BY-4.0 — is the rules source                                  | dnd-primer |
| DMs override at run time; most tables run homebrew worlds and house rules; magic items, monsters and spells are what people create; 3D, chat, marketplaces and hidden dice tricks are dead ends      | dnd-market |

## 2. The proposal in one paragraph

A new public repository, **d20 Studio**, born as a specification workshop and growing into the
application. Superpowers as the lifecycle backbone. A discovery that first maps the whole ambition
at low depth, then deepens one slice at a time around a complete table scenario: observation of
the real table, references compared on the same tasks, objects and events modelled with their
authority, the expensive assumptions tested by disposable spikes, breadboards and sketches, an
uncoached playtest with the DM and a player, and only then the slice contract that production
design and code are built from. Two agents whose authority is split by decision type, whose files
are reserved per task, who alternate as writer and reviewer with the reviewer read-only and the
verdict attached to the immutable candidate. The owner answers questions, judges directions from
images, sees the playable outcome, reads a fixed report and takes dated decisions. The old
repository becomes read-only evidence.

## 2b. First experience, first milestone, complete objective

Three horizons, so that the ambition is never traded for the first demonstration and the first
demonstration is never delayed by the ambition:

| Horizon                                     | What it is                                                                                                                                                                                                                                                                                      | How it is judged                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **First demonstrable experience** (slice 1) | One combat encounter of the group run in the app: sheets and hotbar, initiative, physical and in-app dice both logged, resolution with the campaign's automation level, the DM's hidden rolls, override and undo, loot at the end — acceptance stories 1 and 2 of `PRODUCT.md`, no map required | The DM and one player finish it uncoached with fewer interruptions and errors than the baseline of step 1 (§4)        |
| **First milestone** (unchanged)             | One whole session of the group without opening Owlbear, D&D Beyond or a calculator — stories 1–4                                                                                                                                                                                                | The group plays a real session on it                                                                                  |
| **Complete objective** (unchanged)          | The two parities — everything BG3 does at the table and everything D&D Beyond does around the character — the nineteen jobs, the homebrew world, the DM's tools, print, offline, EN/IT                                                                                                          | The breadth map of step 2 is the checklist; every later slice deepens it; nothing is removed without a dated decision |

## 3. Roles, authority and routing

| Who              | Decides                                                                                                                                                                       | Never                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Owner            | Product, taste verdicts from images, dated decisions at the decision boundary, deploy, release, real-data migration, any new cost, who plays in a playtest                    | Reads diffs, edits files, resolves technical conflicts, arbitrates rules text  |
| Astra (Codex)    | Every visual and taste decision: directions, screens, layout, palette, typography, iconography, raster art direction, screenshot matrices (owner, 2026-09-09)                 | Changes a product decision or a spec without the owner                         |
| Claude           | Architecture, engine, rules, data, tests, gates, document hygiene, the code graph and diagrams, interview facilitation, integration of the shared handoff (owner, 2026-09-09) | Reopens a settled taste decision; changes a product decision without the owner |
| Either, per task | The complete bounded task it implements — code, tests, documentation — inside its reservation (§7)                                                                            | Edits outside its reservation; approves its own work                           |
| Subagents        | Bounded research, read-only review, screenshot sweeps                                                                                                                         | Integrate anything                                                             |

Authority is by decision type, not by file (owner, 2026-09-09). The routing below says who goes
**first**; every row is a starting preference unless its basis says "owner decision" or "tool
dependency". Evidence as of 2026-09-12 (benchmarks report §1–§4, corrected 13 September); the
basis labels are: **B** benchmark-supported, **T** tool-dependent, **O** owner decision, **U**
untested judgment. Confidence never exceeds what the basis allows.

| Task type                                   | First choice → alternative                                               | Basis | Confidence | Evidence in one line                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------ | ----- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interviewing, observation, requirements     | Claude → Astra with `grilling`                                           | U + O | medium     | Practitioner reports of intent adherence (Every.to 2026-09-01/03; codex #42937); no controlled evaluation; the owner's facilitator preference       |
| Synthesis of evidence into specs            | Claude → Astra                                                           | B     | medium     | AA-LCR 80.0, 1M context without surcharge (API); both write well                                                                                    |
| Architecture, ADRs, diagrams                | Claude → Astra as second opinion                                         | O + B | medium     | Owner split; AA Intelligence tie 53 = 53; Astra leads ARC-AGI-3 and FrontierMath, so hard designs get its second opinion                            |
| Visual direction, wireframes, HTML mocks    | Astra → Claude for HTML/SVG only, verdict stays Astra's                  | O     | —          | Owner decision; crowd UI evidence directional (WebDev Arena 1797 vs 1762; Design Arena within noise); both can write HTML/CSS/SVG                   |
| Raster art, icons, image-based mocks        | Astra with `gpt-image-2` → none                                          | T + O | high       | Claude has no image model; `gpt-image-2` #1 Image Arena; owner decision 2026-09-09                                                                  |
| Engine, rules, data logic, tests            | Claude → Astra taking over the complete task                             | B     | medium     | LiveCodeBench #1, CursorBench 73.4, AA Coding tie 62 = 62; SWE-bench Pro unpublished for Astra, DeepSWE favours Astra — provisional, calibrate      |
| UI implementation from an approved contract | Astra → Claude taking over the complete task                             | O + B | medium-low | Owner split for the pixel pass; design-to-code evidence crowd-voted and thin; token-system code either                                              |
| Debugging: logic, state, replay log         | Claude → Astra                                                           | U     | medium     | Long-context and intent evidence; no debugging benchmark separates them                                                                             |
| Debugging: terminal, build, CI, migrations  | Astra → Claude                                                           | B     | medium     | Terminal-Bench 2.1 87.3 vs 85.0 (same harness), TB-Science 64.6 vs 52.6 (vendor), Code Migration #1                                                 |
| Routine code review of the other's work     | The provider that did not implement → a fresh session of the other       | B     | medium     | CodeRabbit: Astra finds more cross-file bugs than Sol/Opus 5 (not Fable 5.1); Fable 5.1 precision higher; independence matters more than the winner |
| Adversarial review of a proposal or design  | The other provider at `xhigh` → a fresh same-provider session, disclosed | U     | medium     | Evidence diversity; no universal review winner                                                                                                      |
| Documentation and cleanup                   | Claude → Astra                                                           | O     | medium     | Owner split; prose evidence directional                                                                                                             |
| Live web and app exploration                | Astra → Claude with playwright-cli                                       | B + T | medium     | BrowseComp 91.5, OSWorld 2.0 72.6 (vendor); tool access decides                                                                                     |
| Screenshot verification                     | Whoever did not implement; visual verdict Astra's                        | O     | low-medium | Both strong on vision benchmarks; no screenshot-QA benchmark                                                                                        |

Two facts behind the table: the flagships are tied on the independent composites and each leads on
different rows, so the split is by task, not by prestige; and every row above marked B or U is a
hypothesis until the calibration of §10 has run once. Roles alternate on purpose: whoever wrote
never reviews.

## 4. Discovery (Phase 1): a breadth pass, then depth loops per slice

Metaphor the owner chose: an architect interviewing a client about the house of their dreams. The
architect first walks the whole plot and lists every room the client wants; then designs the
kitchen in depth, shows three kitchens that solved the same problem, tests the plumbing before
ordering the marble, and lets the client cook in a cardboard mock-up before the walls go up.

**Interview mechanics** (Pocock's `grilling` + Anthropic's interview loop + Spec Kit's `clarify`,
with the correction of review finding 02):

- Two kinds of question, never mixed in one message. An **observation question** asks what
  happened ("tell me about the last time a reaction came up on someone else's turn; what did the
  DM do, how long did it take, who picked up what") — no recommendation, no options, Mom Test
  rules. A **decision question** is asked only when the observations and the evidence are on the
  table: multiple choice, a recommended answer with its source ("BG3 does X, D&D Beyond does Y, the
  market evidence says Z, I recommend X because…"), one at a time.
- Frontier only: a decision question is asked when everything it depends on is settled; nothing
  obvious, nothing already answered in `evidence/` or in an earlier session.
- Every recorded conclusion carries a provenance tag: `observed` (the table), `rule` (SRD section),
  `evidence` (report and grade), `hypothesis`, `owner-preference`. Every answer is a dated line
  under `## Clarifications / ### Session YYYY-MM-DD` of the owning document; every deviation from
  earlier evidence is a decision in `decisions/`. Ungrillable questions ("how should the hotbar
  feel?") are parked for a disposable sketch or prototype (step 8), never asked in words.
- Spec Kit's nine ambiguity categories are the completeness checklist of every area: functional
  scope, domain and data, interaction and UX flow, quality attributes, integrations, edge cases and
  failure handling, constraints and trade-offs, terminology, completion signals.
- **The owner has played little.** The interviewer teaches before a decision question — one
  paragraph in plain words with a table example — and the recommended answer comes from evidence,
  not from the owner's memory. Agents verify published rules against the SRD 5.2.1 (EN and IT);
  the owner never arbitrates rules text, only house rules and product trade-offs. "Maximum
  freedom" is asked per object as "the last time the DM changed this at the table" plus the
  capability ladder of §5b, never as "can the DM change this?".

**The eleven steps.** Steps 0–3 run once over the whole ambition (the breadth pass); steps 4–10 run
per slice (the depth loop), the first slice being the first demonstrable experience of §2b. The
"evidence to move on" column is the exit of each step; the rationale for the order is in the methods
report §11 as amended on 13 September.

| #       | Step                                  | Question answered                                                                                  | Artifact                                                                                                                                                                                              | Evidence to move on                                                                                                                    | Copied from                                                  |
| ------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **B0**  | Frame                                 | Why, for whom, what changes in a year, how it could fail, what is kept from before                 | `spec/PRFAQ.md`; the retain / reopen / supersede table of §0; appetite of the first loop; the source map (SRD EN/IT, attribution, content ids, private pack)                                          | One scoped decision brief; open product choices explicit; licensing basis of every source recorded                                     | Amazon Working Backwards; GV Sprint Monday; review 20, 21    |
| **B1**  | Stories from the table                | What happened last session; when the calculator, Owlbear or D&D Beyond was picked up               | Observation snapshots, experience map, job stories; **the baseline task script** for the DM and a player on the current setup with counts (errors, interruptions, recovery)                           | Concrete incidents with frequency, workaround and consequence; a measured baseline                                                     | Torres; Mom Test; job stories; review 02, 19                 |
| **B2**  | Breadth inventory                     | What exists in the whole ambition, at low depth                                                    | Noun list and object litmus; event list of a session and a round; screen list; journey backbone; the nineteen jobs mapped onto them                                                                   | The whole ambition visible on one map; nothing deepened yet                                                                            | ORCA round 1; Event Storming big picture; Patton             |
| **B3**  | Opportunities, assumptions, slice     | Which needs, which risks, which first complete journey                                             | Opportunity Solution Tree; assumption list ranked by consequence × uncertainty; slice 1 chosen; failure-risk list                                                                                     | One first complete journey; a short list of the expensive assumptions                                                                  | Torres; Shape Up appetite; review §2                         |
| **D4**  | References on the slice's tasks       | How BG3, D&D Beyond and the group's current setup do these exact tasks; who else must be looked at | Per-title evaluation template written before playing; task step counts; interaction and state inventory of the screens involved; access, version, platform recorded                                   | Comparable task evidence; untested claims marked; at most two targeted extras named with the uncertainty they answer                   | Games competitor evaluation; Nielsen; HTA; review 08         |
| **D5**  | Model                                 | What the things are, how they relate, what happens to them, who may do what and see what           | Nested-Object Matrix, CTA matrix, Object Guide (= glossary) for the slice; event → policy → command → event for every rule in it; the authority and visibility contract                               | Representative examples and exceptions; every rule cites its SRD section and ships executable examples with timing boundaries          | ORCA rounds 1–2; Event Storming process level; review 05, 06 |
| **D6**  | Spikes                                | Which promises the chosen stack cannot keep                                                        | Disposable experiments with intended behaviour stated first: offline authority, duplicate commands, conflicting spends, undo with dependents, hidden information, free-tier workload, the review gate | Each spike answered with a demonstration; the minimum architectural constraints they establish written down; return to D4–D5 if needed | Superpowers spike path; review 03, 14                        |
| **D7**  | Journey and walking skeleton          | In what order the slice is used; the smallest whole scenario                                       | Story map of the slice; walking skeleton; storyboard of the scenario                                                                                                                                  | A DM/player scenario that reaches a meaningful outcome without orphan features                                                         | Patton; GV Sprint storyboard                                 |
| **D8**  | Breadboards, sketches, thin prototype | Which places exist, what you can do on each, where each takes you; which spatial choices compete   | Breadboards (places / affordances / connections); state inventory per component; **disposable** fat-marker sketches and a thin clickable prototype where layout is the question                       | Competing spatial choices made concrete; unknowns fed back into D5; nothing here is authority                                          | Shape Up; NN/g wireflows; Pocock prototype; review 01, 09    |
| **D9**  | Playtest                              | Does the DM and a player get through the scenario uncoached, better than the baseline              | Observed session with the actual DM and one representative player, in Italian, on a phone and a laptop; errors, completion, interruptions, recovery compared with B1                                  | Measured improvement or a decision to reshape; owner sees the outcome                                                                  | GV Sprint Friday; Hodent; review 19                          |
| **D10** | Contract, cross-review, approval      | Is anything still silently assumed                                                                 | Screen documents (below), `requirements.md` per feature (job story, EARS, Gherkin, accessibility set), examples and checks; pre-mortem; ADRs for hard-to-reverse trade-offs                           | Zero blocking findings after the other provider's review; actionable findings resolved or dispositioned; owner decisions taken         | Kiro; EARS; Pocock to-spec; BMAD elicitation; MADR           |

Then the slice is built (§6 Phase 5) and the next loop starts from B3's ranking. Later slices stay
on the breadth map until their loop begins.

**What exists of a screen before production draws it.** A production mock and production code
need an approved **screen document** from D10 — words and tables in the Shape Up breadboard form:
places, affordances, connections, the state inventory, roles, the freedom ladder level per object,
and the acceptance criteria. A disposable sketch or prototype needs nothing and proves nothing
except what it was built to test. A fragment, for the combat hotbar:

```
Screen: combat-hotbar (player, during an encounter)
Objects shown: Character (mine), Action slots, Resources (spell slots, uses), Conditions (mine)
Affordances: use a slot · drag a slot · swap two slots · open the full action list ·
  end turn · hold a reaction · undo my last action (until a dependent action exists or the DM confirms)
Connections: use a slot → target picker → resolution log line; open full list → action sheet
States: my turn · not my turn · reaction available · reaction spent until my next turn ·
  no resource left · offline (queued) · DM confirming
Roles: player (all), DM (sees any character's hotbar read-only), spectator (none)
Freedom (ladder §5b): slot cost override — level 1, DM at the table; homebrew action as a slot —
  level 2; a new reaction trigger — level 3
Criteria: WHEN I use a slot with no resource left, THE SYSTEM SHALL keep the slot visible,
  disabled, with the reason · WHEN a trigger for a reaction I hold occurs on another creature's
  turn, THE SYSTEM SHALL prompt me before the triggering action resolves, without pausing the DM's
  screen, and SHALL mark the reaction spent until the start of my next turn (SRD 5.2.1, Reaction)
```

Output layout: `spec/PRFAQ.md`, `spec/decisions-disposition.md`, `spec/sources.md`, `spec/jobs.md`,
`spec/baseline.md`, `spec/map/` (the breadth inventory), `spec/objects/`, `spec/events/`,
`spec/authority.md`, `spec/features/<id>/requirements.md`, `spec/screens/<id>.md`,
`spec/flows/<id>.md`, `spec/glossary.md`, `spec/open-questions.md`; `evidence/spikes/<id>.md`;
`evidence/references/<title>.md`; `evidence/playtests/<date>.md`; each with its dated
`## Clarifications`. D4 runs in parallel with D5 (Astra on references, Claude on the model).

## 5. Reference products (D4)

**First comparison, on the slice-1 scenario**, all three on the same task script from B1:

1. **The group's current setup** — Owlbear Rodeo, physical dice, a calculator, D&D Beyond sheets:
   the baseline every improvement is measured against.
2. **D&D Beyond** — sheet use, search, ordinary actions, exceptional corrections; the
   character-side parity target and its list of pains to avoid (owner: primary and binding).
3. **Baldur's Gate 3** — how the player anticipates cost, target, consequence and failure without
   an instruction panel; hotbar, reaction prompts, initiative strip, dice screen, party inventory
   (owner: primary and binding; the browser's chrome is not dictated by it).

**Targeted references**, at most two per named uncertainty, in this order of readiness:

| Reference                                                                                                                                                                                               | Question it answers                                                                                                 | Access (recorded before use)                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Encounter+ (verified 2026-09-12)                                                                                                                                                                        | The offline physical table: local database, player screen on a TV, initiative and encounters without a network      | Free on the App Store; needs an iPhone, iPad or Mac    |
| Solasta: Crown of the Magister / Solasta II                                                                                                                                                             | Reaction and resource prompts; what the 2024 switch cost (the studio: two rulesets would double content and QA)     | Owned copies or recordings; Solasta II is Early Access |
| Foundry dnd5e + Midi-QOL                                                                                                                                                                                | Where manual adjudication fits; which configuration burden slows the table; base system versus module behaviour     | One licence, self-hosted                               |
| Shard Tabletop                                                                                                                                                                                          | Can the DM change a creature or a definition during play without losing provenance                                  | Free tier                                              |
| Owlbear Rodeo (beyond the baseline)                                                                                                                                                                     | How fast a DM brings players into the shared context and recovers from a mistake                                    | Free                                                   |
| Roll20, Pathbuilder 2e, Owlcat logs, Fire Emblem / Into the Breach / Tactical Breach Wizards, Avrae / Improved Initiative, LegendKeeper / Kanka / NWN DM client, AboveVTT, Fight Club 5 / GM 5, Alchemy | Each for the specific uncertainty the landscape report names for it; opened only when a loop names that uncertainty | Recorded per title; nothing purchased implicitly       |

Each dossier records version, platform, access level, observed scenario, evidence, failures and the
transferable pattern, and marks untested claims. Captures stay outside the public repository
(owner, 2026-09-09, item 9); the written evaluation and links are committed.

## 5b. Domain evidence the interview starts from

The owner has played little; the market report (every figure graded A–D by source quality) is what
the interviewer's recommended answers lean on. Consequential claims below carry their denominator
and grade; **all rankings are hypotheses to be tested with this table in B1 and D9**.

**What tables customise, ranked by evidence.** Monsters at run time — HP edits mid-fight (70% of
523 DMs, 2017, C), rolled damage (90% of 530, C), hidden rolls (44–70%, C), fudging tolerated by
about four DMs in five (meta-collection, B) — stable for a decade. Then the content library in the
order people create it on D&D Beyond: magic items (~51% of public homebrew entries), monsters
(21%), spells (16%), feats, subclasses, backgrounds (A for the order, B for the counts); classes and
conditions cannot be created there and are its longest-standing requests (C). Then per-table rule
toggles: bonus-action potions (now the 2024 rule), a feat at level 1, critical-hit variants, flanking
(45% of 1,194, B), milestone versus XP (66/21 of 6,009 players, B). Then the campaign world: 55–65%
of DMs run their own (six polls, B). Then allow/ban lists at item granularity, editing official
content in place, the automation level, the sheet's presentation, party loot with a DM stash, grid
versus theatre of the mind (78/22 of 2,800, B).

**Automation acceptance.** Among reporting Foundry users about 37% of 5e tables have Midi-QOL
**installed** and about 45% DAE; the Dice Tray is installed by 43% (A for installation; use is not
measured). Digital dice on D&D Beyond were rolled by 1.9M players against 6M characters created
(A; characters are not unique players). Reading: effects and bookkeeping are wanted more than
automatic hit-or-miss; manual dice entry is a main path, not a fallback.

**Freedom features that must be first-class**, each at a level of the **capability ladder**
(review finding 04), so that a promise never outruns what the rules language can represent:

| Level | Freedom                                                          | Example                                                                                           | Acceptance                                                                                   |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1     | Numeric override, any number, any time, with correction and undo | The DM sets the ogre's HP to 30 mid-fight; a player's roll is corrected after a misread die       | Logged as a fact with provenance; downstream effects recomputed or compensated; undo defined |
| 2     | Content composed from supported mechanics                        | A homebrew sword with +1 and 1d6 fire; a monster built from existing traits; a house rule as data | Editable in place with an immutable revision; the action records the revision it used        |
| 3     | New mechanics requiring engine work                              | A new reaction trigger; a subclass feature with a new resource type; a new condition              | An engine task with tests; until then, level 4                                               |
| 4     | Manual adjudication with a recorded result                       | "Roll it, I'll rule": the DM enters the outcome; the log says who decided and why                 | Never blocked; always visible in the log at the right visibility                             |

Then: per-person dice mode, physical or in-app, both logged, digital dice faster than picking up a
die; automation as a campaign policy with per-step granularity, never a hidden fairness layer
(BG3's Karmic Dice are advised off in every guide found — grade D, consistent); house rules and
edition choices as data; allow/ban lists per campaign; a printable, glanceable, offline sheet; party
inventory, DM stash, transfers; an encounter builder that takes seconds and treats the XP budget
as a hint; Italian as a real locale of the rules text.

**Authority and visibility** (review finding 06) are one contract of slice 1, `spec/authority.md`:
game-rule discretion, application authorisation and information visibility separated; custom
definitions with immutable identities and revisions; every action storing the revision it used;
authorised commands per role; private and public projections; audit records; compensating
corrections; and the explicit list of what cannot be undone (a revealed secret, a message read).
"Nothing blocked" means no table decision is blocked; every command is validated for structure and
ownership.

**Rules corpus** (review findings 05, 20). The primer is commentary. Every rule that becomes a
contract cites its section of the SRD 5.2.1 in English and in the official Italian SRD 5.2.1 (both
CC-BY-4.0; Italian published 2025-12-08) and ships executable examples covering timing boundaries
and exceptions — for instance "a reaction is regained at the start of your next turn, so a creature
may react twice in one round". Terminology comes from the two SRDs, never from a commercial
translation; disputed interpretations stay explicit; the owner decides house rules only.

**Dead ends to skip or defer, with the evidence and its grade.** 3D scenes and VR (Sigil cancelled
inside eight months, A; TaleSpire at a few hundred concurrent users, A). Built-in voice, video or
chat (Discord is the layer; owner non-goal). Dynamic lighting at launch (installed by about a
quarter of reporting Foundry users; "a huge time sink to prep", C). 3D dice as the default (fatigue
built into the products, A/C). Karmic or streak-smoothing dice (D, consistent; contrary to "every
roll is logged"). A marketplace (median premium purchases on Foundry: zero, A). Heavy
encounter-maths screens (D&D Beyond's stayed in beta six years, A). Dense full automation in the
Fantasy Grounds style (one review: deepest automation, 6/10, D — a hypothesis, not a study). Portrait,
voice and music generators (no usage evidence; link out later). Undo-less honour modes.

**The ten jobs by evidence** order the nineteen jobs of `PRODUCT.md`; they replace none: run combat
faster with fewer arithmetic errors; keep the DM in control of the fiction; let the group play the
way it already does; hold the whole homebrew world; mix house rules per table (editions: §14 Q1); a
sheet readable at a glance, printable, trusted offline; loot between characters and a party stash;
an encounter built in seconds; less DM prep and organisation load; beginners and veterans served
from the same screens. The shared session calendar, the chronicle, NPCs and places, handouts and
the in-world calendar remain on the breadth map as jobs 2, 3, 8, 10 and 12.

## 6. Phases after discovery, and the artifacts the loops must produce

- **Phase 2 — Contract cross-review (the other provider, read-only).** Findings as blocking / major
  / minor with file and line; the author resolves or dispositions each; product questions go to the
  owner as multiple choice with a recommendation. Exit: zero blocking findings, every actionable
  finding closed, zero `NEEDS CLARIFICATION` markers.
- **Phase 3 — Design (Astra).** First act: **two coherent visual directions on the slice-1
  scenario**, from the dossier, delivered as images, judged by the owner; mock 0.9.3 and immersive-v2
  are evidence for one of them, not a constraint. Then, per approved screen document: dossier entry
  → wireframe → mock, dark, EN and IT, the representative states of the state inventory (not every
  combination) on phone and desktop; the remaining states are covered by component checks. Claude
  reviews each mock against its screen document; the owner judges images and the playable outcome.
- **Phase 4 — Architecture (Claude, Astra review).** Written from the spike results: engine, data
  model, persistence, offline authority, auth, licensing partition, test portfolio, budgets. Old
  engine seams are salvaged when a spec asks and a spike confirms.
- **Phase 5 — Build (either provider, vertical slices, worktrees).** A slice is a job end to end.
  Per slice: brainstorm gate → plan (2–5 minute tasks with tests) → TDD → runtime verification with
  screenshots and one live interaction pass → cross-review → fix → integrate. The task record
  names the implementer; the other provider reviews.
- **Phase 6 — Transition and release (owner-gated).** Inventoried at B0, rehearsed before slice 2
  ends: export, import, restore, idempotency, a failed cutover, adversarial data, on the six
  fixtures and a copy of production; the final snapshot, the source-of-truth period, edits during
  transition, old-client behaviour, the rollback path and the recovery authority named; production
  fixes reach the new work through a named cherry-pick task; a plain-language health and recovery
  view for the owner. Staging first; the owner's switch. Approving this plan authorises none of it.

**Artifacts the loops must produce** (review §7), each with its owner and step:

| Artifact                                                                                           | Owner                         | Step                               | Lives at                                          |
| -------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------- | ------------------------------------------------- |
| Baseline and outcome scorecard                                                                     | Claude                        | B1                                 | `spec/baseline.md`                                |
| Evidence register (claim, source, date, cohort, observed/inferred, uncertainty, decision affected) | Claude                        | B0, kept current                   | `evidence/register.md`                            |
| Participant and access plan                                                                        | Owner decides, Claude records | B1, D4                             | `spec/participants.md`                            |
| Versioned rule-conformance corpus                                                                  | Claude                        | D5                                 | `spec/rules/` with SRD citations and examples     |
| Multiplayer authority and visibility contract                                                      | Claude                        | D5                                 | `spec/authority.md`                               |
| Interaction-accessibility acceptance set                                                           | Astra proposes, Claude tests  | D10                                | `spec/features/<id>/requirements.md`              |
| Independently verifiable review protocol                                                           | Claude                        | D6 (spike 7)                       | `REVIEW.md`, `scripts/review/`                    |
| Skill adoption record                                                                              | Claude                        | B0, kept current                   | `docs/skills-record.md`                           |
| Quota and interruption recovery contract                                                           | Claude                        | B0                                 | `AGENTS.md` §Continuity, `changes/<slug>/task.md` |
| Production coexistence and recovery plan                                                           | Claude                        | B0 inventory, rehearsal in Phase 6 | `docs/transition.md`                              |

## 7. The two-agent operating model

- **Authority by decision type, files reserved per task.** `changes/<slug>/task.md` names the
  implementer, the model and effort, the worktree and branch, and the **reserved paths**; the
  implementer owns the complete bounded task — code, tests, documentation. A `PreToolUse` hook in
  each harness rejects edits outside the active task's reservation; a reservation is transferred by
  editing the record during a handoff. Shared files (`AGENTS.md`, the ledger, the gate scripts) are
  reserved only by a task whose reviewer is the other provider.
- **One worktree per task per agent.** Claude Code blocks edits outside its worktree; Codex desktop
  creates worktrees too. Serial integration on one branch.
- **Reviewer read-only by construction.** The review runner script checks out the candidate SHA in
  a detached, filesystem-read-only worktree; Codex reviews through `.codex/agents/reviewer.toml`
  with `sandbox_mode = "read-only"` or `codex review --commit <sha>`; Claude reviews through
  `/code-review` in a fresh subagent whose write tools are denied. Findings come back through the
  runner's output, never by editing the candidate. Spike 7 proves that a reviewer that attempts a
  write fails.
- **Verdict attached to the candidate, outside its tree** (review finding 14). The runner writes a
  git note on the candidate SHA under `refs/notes/review` — reviewer provider, model, effort,
  candidate SHA, date, verdict (`approve` | `needs-attention`), findings and their dispositions —
  and pushes the notes ref. A required CI check `review-gate` fails unless HEAD carries a note with
  `approve`, and the note's reviewer provider differs from the task record's implementer. Any new
  commit has no note; a merge or rebase moves the SHA and invalidates the approval by construction.
  A repository report may cite a reviewed SHA; it never attests to its own commit. When the owner
  authorises CI-run reviews (§14 Q5), the CI runner writes the note and the check becomes trusted;
  until then it is an explicit workflow check on one machine, not a security boundary, and is
  documented as such. No vendor review product is an approval by itself.
- **Closure policy** (review finding 16). Scope: correctness, security, accessibility, i18n, offline
  behaviour and the agreed task outcome; preferences are labelled optional and never block. Every
  actionable finding is resolved or explicitly dispositioned with a reason; approval is fresh on the
  actual candidate. A technical dispute is settled by a reproduction; failing that, by one bounded
  second opinion — a fresh session of the other provider, or of the same provider with the reduced
  diversity disclosed. The author never breaks a tie on their own work. Taste is Astra's by owner
  decision; everything else on a mock is a finding. Only product, taste, cost or authority choices
  reach the owner, with a concrete demonstration. Depth of review is proportional to risk: a
  one-line fix gets the routine pass, a persistence change the adversarial one.
- **Owner report.** Every task ends with `changes/<slug>/REPORT.md`, pasted in chat: what changed
  in plain language; what you can now do; evidence (checks, the playtest or live-interaction result
  where behaviour changed, screenshots EN/IT phone/desktop where visuals changed, the other
  provider's verdict and each finding's disposition); decisions taken on your behalf with
  D-numbers; decisions that need you as multiple choice; next and blocked.

## 8. Memory: task records, the handoff, decisions

- **One task record per active task**, `changes/<slug>/task.md`: objective, implementer and model,
  worktree, branch, candidate SHA, reserved paths, dirty files, failing checks, remaining work,
  pending owner decisions. It is the resumable state; a successor of either provider reads it, then
  `git status` and the diff, before continuing. It is committed when the gate is green and left on
  disk otherwise; a session boundary requires neither a commit nor an owner decision.
- **One compact shared handoff**, `program/NEXT.md`, maintained by one integrator (Claude, by the
  document-hygiene split): frontier, the active task records, the open owner questions, a five-line
  opening prompt. It points, never restates.
- **Decisions.** `decisions/DECISIONS.md` is an append-only ledger, one line per decision:
  `D-0042 | 2026-09-12 | owner (chat) | scope: dice | "Rolls are always logged" | supersedes D-0017 | ADR-0010`.
  The applicable decision wins **within its scope**; supersession is explicit and linked; a new
  date alone repeals nothing unrelated; a mistaken entry is corrected by a new entry; two
  conflicting decisions open a question in `program/QUESTIONS.md`, never a guess. ADRs in
  MADR-minimal form with `decision-makers`, `date`, `status`, `scope` and a `confirmation` (the check
  that proves the decision is honoured).

## 9. Skills

Single home `.agents/skills/`; `.claude/skills` is a committed relative symlink to it. Installing
skills is not a prerequisite for discovery; the interviews run on the incumbents.

**Installed at step 0 (the owner's 2026-09-09 list plus the official Firebase pack):** superpowers,
impeccable, ponytail and ponytail-review, grill-me, graphify, archify, task-observer (process
observations, logged outside the repository as today), find-skills, playwright-cli, claude-mem
(search only, never authority), firebase/agent-skills.

**Trial candidates, one real task each, incumbent kept until the trial is recorded:**
`grill-with-docs` (a verified superset of `grill-me`: the same `grilling` plus `domain-modeling`),
`writing-for-agents` and `research` (Pocock), the `design.md` format and linter for `DESIGN.md`,
Anthropic `skill-creator` with `claude plugin eval` for any house skill, `frontend-design` against
impeccable (an open comparison, not a foregone conclusion). Cross-review tooling is the first-party
pair — Claude `/code-review` and `codex review --commit` — plus `/codex:adversarial-review` for
risky diffs; the stop-time review-gate hook of the Codex plugin is **not** enabled (its README
warns of usage-limit loops; the frameworks report is corrected accordingly).

**House workflows start as templates, not skills:** the interview mechanics of §4, the reference
dossier template of §5, the cross-review request and record, the owner report, the session handoff
live as short templates under `spec/templates/` and `changes/`; each becomes a skill only after
repetition proves it, evaluated with a no-skill baseline before commit.

**Skill adoption record** (`docs/skills-record.md`): for every skill, version pinned, licence,
permissions required, both-harness check, evaluated benefit, and the replacement or removal
decision with its date.

## 10. Effort, routing calibration, and continuity

**Standing owner preference (recorded by the review, adopted here):** every prompt supplied from
now on carries a recommended model and reasoning effort, a Claude/GPT alternative where one exists,
and a basis that is either dated evidence or an explicitly labelled preference, owner decision or
tool dependency.

- **Effort is chosen per bounded task**, not per session, and raised on demonstrated difficulty
  (Anthropic effort guidance; the review's correction). Starting points: Claude `high` for
  implementation and documents, `xhigh` for interviews, synthesis, architecture and adversarial
  review, `max` only when a consequential task still fails at `xhigh` (Fable 5.1 over-edits at the
  top level); Astra `medium` for routine review and lookups, `high` for design and implementation,
  `xhigh` for adversarial review and hard debugging, `max` only for audits where a wrong result
  costs more than the minutes. Two corrections on the same point: stop, clear, re-prompt with what
  was learned. Check the account's remaining allowance before a long run; API prices say nothing
  about subscription messages.
- **Calibration instead of a bake-off** (review finding 12). A small retained task set: one engine
  task with hidden acceptance checks, one UI task from a contract, one review task with planted
  defects plus clean cases, one constraint-adherence task; predeclared pass/fail safety constraints
  (dice seam, licensing partition, EN/IT); quality, elapsed time, owner interventions and actual
  consumption reported separately, never composited; close or consequential comparisons repeated;
  visual alternatives judged blind by the owner. Run once at step 0 to turn the B and U rows of §3
  from hypotheses into measurements, then on trigger: a new flagship or harness default, or an
  observed failure that could change a route. Results are a dated decision with the rows that moved.
- **Continuity when a model or provider is unavailable.**
  - _Quota ends mid-task:_ the implementer records dirty files, failing checks, reservation and
    next step in the task record and stops; never a commit past a failing hook. The successor —
    the other provider by default — opens the same worktree, reads the record, `git status` and
    the diff, takes over the reservation and the complete task, and states in its first line which
    model it is.
  - _A provider is unavailable for a review:_ a fresh session of the same provider reviews, with
    the reduced diversity disclosed in the note; a second independent review follows when the other
    provider returns if the change is high-risk.
  - _A model is retired or superseded:_ nothing in the repository depends on a model name except
    the dated routing table and the calibration record; skills, hooks, gates and templates are
    harness-neutral; the routing re-evaluation is triggered and the table is re-dated.
  - _Raster art:_ depends on `gpt-image-2` through Codex (owner decision 2026-09-09); if it is
    unavailable, raster work waits and the report says so; no SVG is silently substituted for a
    requested raster.

## 11. Prompt templates (owner → agent)

Every prompt starts with the header below, fields filled, never left as placeholders; then Goal,
Context, Constraints, Done-when. The owner writes in Italian; the repository is English. Basis
values: `evidence (date, source)`, `owner decision (date)`, `tool dependency`, `preference`.

```text
Recommended model: <exact model> | Reasoning effort: <setting>
Fallback: <other-provider exact model> | Reasoning effort: <setting>
Basis: <dated evidence or labelled preference / owner decision / tool dependency; confidence>
Required tools: <what the task needs; any missing fallback capability>
Resume from: <repository, worktree, branch, candidate SHA, task record, dirty state>
```

Set the model and effort at the start of the task (Claude Code: `/model fable` and `/effort xhigh`;
Codex: GPT-6 Astra and its reasoning level in the picker); change them when the task changes.

**Open any task**

```text
Recommended model: <per the routing row> | Reasoning effort: <per §10>
Fallback: <the other provider> | Reasoning effort: <same>
Basis: <routing row basis and date>
Required tools: repository read/write inside the reservation; <others>
Resume from: <worktree, branch, SHA, changes/<slug>/task.md, dirty: yes/no>
```

```
Leggi AGENTS.md e program/NEXT.md, poi changes/<slug>/task.md. Obiettivo: <one line>.
Contesto: <files or spec ids>. Vincoli: rispetta CONSTITUTION.md; una sola attività; solo i
percorsi riservati nel task record; nessuna decisione di prodotto senza chiedermi.
Fatto quando: <artifact> esiste, la revisione incrociata è stata richiesta, il task record e
program/NEXT.md sono aggiornati.
```

**Observation interview (B1)**

```text
Recommended model: Claude Fable 5.1 | Reasoning effort: high
Fallback: GPT-6 Astra | Reasoning effort: high
Basis: preference (owner's facilitator) + practitioner intent-adherence reports 2026-09-01/03; no
controlled evaluation; medium
Required tools: repository write under spec/; no browsing needed
Resume from: repository root, branch main, no task record (interviews run on the integration branch)
```

```
Usa il template interviewing, passo B1, area <...>. Solo domande di osservazione: cosa è successo
davvero al tavolo, quando, quanto è durato, chi ha preso cosa. Nessuna raccomandazione, nessuna
opzione. Una domanda alla volta, massimo 20. Alla fine scrivi gli snapshot, lo script di baseline
con i conteggi da misurare, le Clarifications datate con il tag di provenienza, e program/NEXT.md.
```

**Decision interview (B2–B3, D5, D7)**

```text
Recommended model: Claude Fable 5.1 | Reasoning effort: xhigh
Fallback: GPT-6 Astra | Reasoning effort: xhigh (add: "never replace my stated goal with your own")
Basis: as above; xhigh because the frontier must be computed over all recorded evidence; medium
Required tools: repository read of evidence/ and spec/; write under spec/
Resume from: repository root, branch main, spec/<area>
```

```
Usa il template interviewing, passo <B2|B3|D5|D7>, area <...>. Prima leggi evidence/ e spec/; non
chiedermi nulla che sia già scritto lì. Solo domande di decisione: scelta multipla, sempre con la tua
risposta consigliata e la sua fonte (dossier, SRD, report con grado). Insegnami il concetto in un
paragrafo prima di ogni domanda. Le regole pubblicate le verifichi tu sulla SRD; io decido solo
house rule e compromessi di prodotto. Una domanda alla volta, massimo 20. Alla fine scrivi gli
artefatti del passo con le Clarifications datate, le decisioni con scope, e program/NEXT.md.
```

**Reference comparison (D4, Astra)**

```text
Recommended model: GPT-6 Astra | Reasoning effort: high
Fallback: Claude Fable 5.1 with playwright-cli | Reasoning effort: high
Basis: evidence 2026-09-12 (BrowseComp 91.5, OSWorld 2.0 72.6, vendor-reported) + tool access;
medium; either can write the dossier
Required tools: browser/computer use; access to <product> at <version, platform, account>
Resume from: repository root, branch main, evidence/references/<title>.md
```

```
Usa il template reference-dossier su <product> per lo scenario spec/baseline.md, schermate <...>.
Scrivi il template di valutazione prima di usare il prodotto; registra versione, piattaforma e
accesso; conta i passi dei compiti chiave; inventario interazioni e stati per schermata; segna ciò
che non hai potuto provare. Solo evidenza, nessuna proposta. Le catture restano fuori dal repository.
```

**Spike (D6)**

```text
Recommended model: Claude Fable 5.1 (engine/offline/authority) or GPT-6 Astra (build, CI, the
review gate) | Reasoning effort: xhigh
Fallback: the other provider | Reasoning effort: xhigh
Basis: routing rows "engine" and "terminal/build/CI" (evidence 2026-09-12, medium); xhigh because a
wrong answer is expensive
Required tools: a throwaway worktree; Firebase emulators for persistence spikes
Resume from: worktree task/spike-<id>, branch task/spike-<id>, evidence/spikes/<id>.md
```

```
Spike <id>: scrivi prima il comportamento atteso e il criterio di fallimento in
evidence/spikes/<id>.md, poi costruisci il minimo che lo dimostra o lo smentisce. Codice usa e
getta, mai integrato. Fatto quando: la dimostrazione è riproducibile con un comando, il vincolo
architetturale minimo che ne segue è scritto, e i passi D4–D5 da riaprire sono elencati.
```

**Playtest (D9)**

```text
Recommended model: Claude Fable 5.1 | Reasoning effort: high
Fallback: GPT-6 Astra | Reasoning effort: high
Basis: preference (observer and note-taker; the people are the DM and a player); no model evidence
applies
Required tools: the prototype running on a phone and a laptop; the baseline script
Resume from: repository root, branch main, evidence/playtests/<date>.md
```

```
Prepara e osserva il playtest dello slice <id> con il DM e un giocatore, senza aiutarli, in italiano,
su telefono e laptop. Misura errori, completamento, interruzioni e recuperi contro spec/baseline.md.
Scrivi evidence/playtests/<date>.md e la lista delle cose da rifare prima del contratto.
```

**Cross-review (any phase)**

```text
Recommended model: the provider that did not write — Codex GPT-6 Astra for a Claude candidate,
Claude Fable 5.1 for an Astra candidate | Reasoning effort: medium for routine diffs, xhigh for
contracts, designs and risky diffs, max only for audits
Fallback: a fresh session of the same provider, reduced diversity disclosed in the note
Basis: evidence 2026-09-12 (independence beats any single reviewer's recall; CodeRabbit studies not
directly comparable); medium
Required tools: read-only checkout of the candidate SHA; no write access to the candidate
Resume from: candidate SHA <sha>, changes/<slug>/task.md
```

```
Usa il template cross-review, in sola lettura, sul candidato <sha> di changes/<slug>. Criteri:
correttezza, sicurezza, accessibilità, i18n, offline, esito concordato del task rispetto a
spec/<id>; le preferenze vanno etichettate opzionali. Solo blocking/major/minor con file e riga;
restituisci i risultati in output, non modificare nulla; lo script del runner scrive la nota di
revisione sul candidato.
```

**Visual direction and design (Phase 3, Astra)**

```text
Recommended model: GPT-6 Astra | Reasoning effort: xhigh for the two directions and the first mock
of a screen, high for iterations; images via gpt-image-2 where the brief asks for raster
Fallback: Claude Fable 5.1 for HTML/CSS/SVG only; the verdict stays Astra's; no fallback for raster
Basis: owner decision 2026-09-09 (visual and taste) + tool dependency (gpt-image-2); crowd UI
evidence directional only
Required tools: image generation; playwright-cli for screenshots
Resume from: branch task/design-<id>, changes/design-<id>/task.md
```

```
Usa reference-dossier poi impeccable su spec/screens/<id> (approvato). Wireframe, poi mock dark
EN+IT su telefono e desktop, per gli stati rappresentativi dell'inventario; gli altri stati li
coprono i controlli di componente. Consegna le immagini in chat e chiedi la cross-review a Claude
prima di chiedermi il verdetto. Per le due direzioni iniziali: stesso scenario, stesse immagini,
nessuna scritta che spieghi.
```

**Build a slice (Phase 5)**

```text
Recommended model: Claude Fable 5.1 (engine, rules, data) or GPT-6 Astra (UI from an approved
contract) | Reasoning effort: high; Claude Opus 5 high for a routine slice with a detailed plan
Fallback: the other flagship taking over the complete task, tests and docs included
Basis: routing rows (evidence 2026-09-12, medium; provisional until the calibration has run)
Required tools: worktree, test runner, Firebase emulators, playwright-cli
Resume from: worktree task/<slug>, branch task/<slug>, changes/<slug>/task.md
```

```
Slice <id> nel worktree task/<slug>: brainstorming gate, writing-plans, TDD, verifica nel runtime
con screenshot e un passaggio di interazione dal vivo, poi cross-review. Integra solo con la nota
di revisione approve sul candidato corrente. Fatto quando: gate verde, REPORT.md scritto e
incollato in chat, task record e program/NEXT.md aggiornati.
```

## 12. Steps before Phase 0

- **Step −1 — done.** Codex reviewed v2 on 12 September (21 findings); Claude answered each on 13
  September (response §2); this v3 is the result.
- **Step −1b — Codex re-reviews v3.** Read-only, against the response and the corrected reports,
  with the cross-review criteria; findings as blocking / major / minor; Claude resolves or
  dispositions; disagreements go to the owner as multiple choice with both recommendations. Model
  and effort: GPT-6 Astra at `xhigh` (a one-shot review of the whole plan; `max` adds little).
  Fallback: a fresh Claude session at `xhigh`, disclosed as same-provider. Basis: the other provider
  reviews (§7). The prompt (repository `salvodicara/d20-folio`, branch
  `claude/d20-folio-redesign-planning-3weqk7`):

  ```
  Repository: github.com/salvodicara/d20-folio. Fai checkout del branch
  claude/d20-folio-redesign-planning-3weqk7 (esiste già sul remoto; non crearne altri).
  Leggi, in quest'ordine: docs/program/RESTART_PROPOSAL.md (v3), poi
  docs/program/restart-research/2026-09-13-claude-response.md, poi la tua review
  2026-09-13-codex-review.md, poi i sette report corretti in docs/program/restart-research/.
  Per contesto: CLAUDE.md, PRODUCT.md e docs/program/DECISIONS.md del repo attuale.

  Ruolo: revisore avversario, in sola lettura. Per ognuno dei tuoi 21 rilievi di' se la risposta lo
  chiude, lo chiude in parte o lo lascia aperto, con la prova. Poi cerca ciò che v3 ha introdotto di
  nuovo e sbagliato: contraddizioni fra sezioni, passi non verificabili, promesse senza spike, punti
  in cui il tuo giudizio di design differisce. Contesta con fonti ciò che ritieni errato nella
  risposta di Claude; non riproporre domande che il proprietario ha già deciso in forma datata.

  Output: un solo file nuovo, docs/program/restart-research/2026-09-14-codex-review-v3.md, con
  (1) verdetto approve / needs-attention; (2) tabella dei 21 rilievi con stato; (3) nuove trovate
  numerate con severità, sezione, prova e alternativa; (4) le domande che solo il proprietario può
  decidere. Nessun altro file modificato. Commit "docs(program): codex review of the restart
  proposal v3", push sullo stesso branch. File in inglese; riassunto in chat in italiano, dieci righe.
  ```

- **Step 0 — Foundations (Claude Fable 5.1 at `high`; fallback GPT-6 Astra at `high`; basis: owner
  split for documents and gates).** Skeleton only: `AGENTS.md` (≤ 150 lines) with `CLAUDE.md`
  symlinked, `CONSTITUTION.md` (the ten rules of §13, one page), `REVIEW.md`, `decisions/` with
  D-0001 (this operating model) and the disposition table of §0, `program/NEXT.md` and
  `QUESTIONS.md`, `spec/templates/`, `evidence/` imported with dates and sources, the source map
  (SRD 5.2.1 EN and IT, attribution, content ids), `.agents/skills/` with the incumbents, the review
  runner and `review-gate`, `ownership-gate` reading task records, the task-record template. Then
  **spike 7 first**: prove the review gate on a tiny candidate and show it rejecting a one-line
  change, before any product work. Codex reviews the skeleton before the first interview.

## 13. The ten golden rules (draft, to be grilled)

1. Approved intent is authoritative; code and tests are evidence of behaviour and can both be
   wrong. A contradiction is resolved from the applicable source and its executable examples, in the
   same change.
2. No production design and no production code without an adequate contract: a screen document
   that names every region, element, control, state and consequence in words and tables, and a
   dossier behind it. Disposable sketches, prototypes and spikes may precede and revise it and are
   never authority. Verification is proportional to risk, and behaviour is verified by interaction,
   not by a picture.
3. One bounded objective and one accountable implementer per task, with the tests, documentation
   and evidence needed to prove it; one worktree per task; concurrent edits isolated by reservation.
4. Each task preserves its resumable state in its task record; one integrator maintains the shared
   handoff; the repository is the only memory.
5. The applicable owner decision wins within its scope; supersession is explicit and linked; a new
   date alone repeals nothing unrelated; a mistake is corrected by a new entry.
6. Independent review is mandatory and alternates: whoever wrote does not review, the reviewer is
   read-only, the verdict is attached to the immutable candidate, a change invalidates it, and
   nothing integrates without it.
7. Giants' shoulders: reuse the patterns the leading products demonstrably use for the same task,
   with the reference beside our rendition, and keep one coherent visual language. Popularity is
   evidence to investigate, never a verdict; a blank page is a defect.
8. Every roll and every consequence is logged with its formula, result, roller, provenance and the
   rule revision it used, at the visibility its role allows; corrections preserve history; the DM
   keeps the last word; what cannot be undone is named.
9. Bilingual EN/IT by construction from the two official SRDs; SRD-only in public, non-SRD in the
   private pack; provenance and redistribution permission recorded for every reused text and asset.
10. Deploy, release, real-data migration and any new cost need an explicit per-change owner
    permission, prepared with concrete evidence; agents resolve routine technical matters within it;
    secrets never enter the repository or an agent's memory.

## 14. Open decisions for the owner

Each with options, the recommendation first, and the consequence. Nothing else in this proposal
waits on the owner; everything technical is decided above.

1. **Edition promise** (finding 04). **A. Keep the 2026-09-03 decision: a 2024 engine with an
   edition tag on every content entity, 2014 content tolerated at the table, existing characters
   migrated; per-seat mixing of rules deferred until a real table asks for it.** B. Independently
   executable 2014 and 2024 rules per seat from the first release. Recommendation A: B is legitimate
   (Roll20 sells it; 66% of a D&D Beyond poll stay on 2014, grade C) but Solasta's own account says
   it doubles content and QA; nothing at this table has asked for it yet. Consequence of B: a
   compatibility and QA commitment on every mechanic, and a slower first slice.
2. **What "offline" means for the first release** (review §6). **A. Usable local character and
   table data on one device, plus printable sheets, proven by spike D6.** B. A synchronised table
   without Internet over a local network. C. Independently edited disconnected devices that
   reconcile later. Recommendation A first; B or C only if the real table needs them, since they
   imply different authority and recovery behaviour. Consequence: A is never marketed as B or C.
3. **What the owner approves during design** (findings 01, 09, 21). **A. The visual direction
   (from two coherent alternatives on the slice scenario), each slice's contract, the playable
   outcome of each playtest, and every consequential product change; disposable sketches and
   prototypes need no approval and are never authority.** B. Every screen document and every
   rendered state before implementation. Recommendation A: it keeps the 8 September delegation and
   the owner's visual authority while removing the clerical approvals; B is possible but is owner
   time, not "just prompts".
4. **Observed playtests with the group** (finding 19). **A. Yes: the DM and one player of the
   group take part in a short observed session per slice, uncoached, in Italian, on their own
   devices.** B. The owner alone plays both roles. C. No playtests; documents and screenshots only.
   Recommendation A; B loses the uncoached signal; C returns to the gate that never measured play.
   Consequence of A: the owner recruits the people and schedules the sessions.
5. **New costs** (review §6). **A. None: existing subscriptions only; the review gate runs on the
   owner's machine; Encounter+ is free but needs an Apple device the owner already has or skips;
   no Argos, no API keys.** B. A stated monthly ceiling for CI-run cross-reviews on API billing and
   a screenshot review service, making the review gate a trusted check. Recommendation A until the
   gate has proven itself; B is a separate dated decision with an actual ceiling. Consequence of A:
   the gate is a workflow check, documented as such.
6. **The old repository and the name** (v2 §14, still unanswered). **A. `d20-folio` is frozen as
   read-only evidence with production fixes only on `main`; the new repository is created at step 0
   under the provisional name d20 Studio, the product name decided by the PR/FAQ.** B. The restart
   happens inside `d20-folio` on a new branch, with the same process. Recommendation A, as the
   owner asked on 12 September; B saves a repository but keeps 136 documents in view. Consequence
   of A: a cherry-pick task carries production fixes across until the switch.
