# Delivery program — P01–P30

<!-- source: full-lab/docs/AGENT-PROGRAM.md -->

The only delivery plan for d20 Folio v2, present tense: every row states what a block must deliver,
not what already happened. Execution state — current block, closed SHAs, open gates — lives in
[`docs/PROGRAM_STATUS.md`](../PROGRAM_STATUS.md) and the short handoff [`NEXT.md`](NEXT.md); owner
decisions in [`DECISIONS.md`](DECISIONS.md); closing controls in [`CHECKLIST.md`](CHECKLIST.md).

`Pxx` names a block, not a session: corrections and open gates continue the same block, never a new
`Pxx` and never licensing the next one. P00, closure of the external HTML laboratory, is finished —
it produced the approved mock `d20-folio-html-0.9.3-2026-09-06` and its manifest, described in
[`reference/README.md`](reference/README.md).

## Standing constraints on every block

<!-- source: PRODUCT.md, "Owner rectification — new V2 application, 6 September 2026" -->

- **V2 is a completely new application.** Old code, routes or tests carry no authority. Build,
  replace or reuse only for the new domain and approved experience: one authority per fact, explicit
  responsibilities, verifiable transitions, no duplicated state or alternative old path.
- **No legacy combat bridge.** Production keeps running separately; its data is only migration input
  (snapshot → dry-run → idempotent apply → verify). A proposal that exists only to make the old
  product work inside V2 is out of mandate: delete it from the plan.
- **References.** Reproduce every transferable BG3 behaviour — organisation, sequences, feedback,
  interaction quality — in Folio's identity, and adopt useful D&D Beyond, Roll20 and Owlbear
  capabilities. D&D 2024 governs the rules; BG3 rule variants are never imported. The mock guides
  composition; it is not a depth ceiling.
- **Theme and language.** Dark only, IT and EN; light paper is for printing, not a second theme.
- **Owner gates.** `v2` integration never authorises deployment, production writes, real-data
  migration, new cost or an external send.

## Common session contract

<!-- source: full-lab/docs/AGENT-PROGRAM.md, "Contratto comune di ogni sessione" -->

A block starts from the owner message, the identified approved mock (tag, manifest and hash verified
now, never a pre-filled baseline), pertinent screenshots and review, and the current execution state
and runbooks. The owner owns only its assigned modules and the documents owning the facts it
changes; it integrates other boundaries without reverting them. Before design or code, the block's
spec carries its `## Reference dossier` (rule 30, enforced by the docs-budget test); a session that
skips it has not started the block. Before code: a small plan and useful behavioural tests. After code: the block's proofs, repository gates, review, and curated before/after
screenshots in chat — 1440×900 and 1280×800, EN/IT dark where it applies, phone where consultation
and updates matter, with no invented mobile HUD parity. Verify Italian names in full, crop and
fallback, keyboard and focus, and undo, error, offline and permission paths where they matter.
Anti-drift compares layout and component against the identified mock screenshots, not a general
resemblance. Every visual block also passes the simplicity check — main task, essential data, primary
action, secondary detail — with no duplicated controls or competing paths, and disclosure keeps every
case reachable without hiding warnings, costs or undo. The block ends with: commit and destination
once runbooks authorise them, tests run and skipped, screenshots approved or pending, coverage moved
from "HTML" to "runtime proven" only with evidence, execution state in its owner document, product
facts in their owning documents, and a rewritten [`NEXT.md`](NEXT.md). No implicit deployment; never
copy a historical verdict forward.

## Blocks and dependencies

The responsibilities below describe the new application to build; existing files are indexes for
analysis and migration, never architectural constraints. Exit acceptance adds to the contract.

| Block                             | Depends on        | Owns                                               | Exit acceptance                                                                                                                                                                                   |
| --------------------------------- | ----------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01 Reconciliation and baseline   | P00, fresh git    | PRODUCT, constitution, ADRs, runbooks, status      | Reconcile mobile, no-dice, no-VTT, exceptions, trust, destination and dark-only theme without changing functions; source and decision ledger; no owner decision inverted.                         |
| P02 Identity and privacy          | P01               | account, membership, roster, Firestore rules       | Several characters per account in one campaign, assignment authoritative in the character's owner document; owner/member/DM/admin/anonymous ACL matrix; DM notes protected.                       |
| P03 Shared state and offline      | P02               | combat IO, play table, personal adapter            | Stable `opId`/`intentId` across retries; scope, lease epoch and version really compared (`basedOn` is not CAS); atomic commit, explicit pending, invalidation on revocation.                      |
| P04 Library and versions          | P02, P03          | library modules and store, codec, sharing          | Eleven-family schema, loaded autosave, template separate from instance; offer → acceptance → recipient materialisation with version, provenance, receipt; revocation keeps the copy.              |
| P05 Base homebrew editors         | P04               | weapon, equipment, spell, feature editors, i18n    | Vocabulary, schema and conformance; four families created, edited and reused on the sheet with no engine in an editor; charges and preparation not copied into the template.                      |
| P06 Monster and rule editors      | P04, P05          | monster and campaign-rule editors, catalogue       | Creatures usable in bestiary and encounter, campaign rules activated per campaign, as typed programs; autosave, versions, import, export and print for both families.                             |
| P07 Origin and feat editors       | P04, P05          | species, feat, background editors, pickers         | Three families with cascading choices, explained prerequisites and the voluntary exception; insertion into a build, roundtrip and print.                                                          |
| P08a Class model                  | P07               | class and subclass schema and codec                | Both families typed, with roundtrip and versions. No large editor in this block.                                                                                                                  |
| P08b Class editor                 | P08a              | class editor, progression adapter                  | A class at levels 1 → 3 → 5 with resources, choices, cascades and autosave; reuse, import and export tested; form and detail screenshots.                                                         |
| P08c Subclass editor              | P08b              | subclass editor, multiclass integration            | A subclass bound to the correct class, with choices, resources and versions; multiclass integration tested and printed. All eleven families individually proven.                                  |
| P09 Shell and orientation         | P01–P04, mock     | router, UI components, design tokens, i18n         | Four permanent domains in a declared order, icon and label, function search, breadcrumb and return with scroll, filters and selection, deep links and Back/Forward.                               |
| P10 Creation and onboarding       | P07–P09           | character creation, schema and codec, first run    | First character, guided plus voluntary exception, import and recovery; the 2014 → 2024 comparison distinct from file format, original preserved, custom and override kept.                        |
| **PD Engagement and disclosure**  | **P10**           | **design docs, creation prototype, art direction** | **BG3 and D&D Beyond studied for real; the creation journey redesigned as the representative path; raster art direction with examples; expert speed and beginner discovery.**                     |
| P11a Sheet, growth and print      | P08c–P10, PD      | sheet and presenters, progression, print           | Proficiencies, features, identity, multiclass, print and provenance coherent; presenters reusable for the DM's authorised inspection, separate from the active character.                         |
| P11b Personal data migration      | P03, P11a         | import and migration, personal aggregate, codec    | Convert incoming legacy personal data once with snapshot → dry-run → idempotent apply → verify on the six fixtures; join → play → leave → personal → rejoin, no dual write.                       |
| P12 Spells and inventory          | P05, P11b         | spell preparation, inventory/equipment adapters    | Preparation, slots, attunement, charges and equipping, filters and first-choice readability; pertinent mobile updates; nothing consumed in a preview.                                             |
| P13 Compendium and search         | P06–P09           | compendium, pickers, views, catalogue              | SRD, pack and custom content with filters, details and bestiary, comparison and reuse; offline search and return to context; the licensing partition verified.                                    |
| P14a Identity and receipt         | P03–P06, P09, P12 | intent, dispatch, presenter                        | Reuses the P03 envelope: a composed action under one root ID carrying costs, rolls, targets and outcome. Retry under the same root, and a stale base rejected.                                    |
| P14b Application and reactions    | P14a              | resolution, automation, reaction windows           | The three automation levels over the same outcome, confirm, refuse and pending change; reactions, concentration and costs. The same receipt, applied exactly once.                                |
| P14c Causal correction            | P14b              | fold, undo, checkpoint, presenter                  | Undo of a cost with its effects and descendants; late conflicts and the checkpoint limit. Attack → reaction → undo and replay reaching the same result.                                           |
| P15 Player table and dice         | P13, P14c         | play HUD, roll, target, log                        | Digital and physical dice, actions, bonus actions, reactions, movement and turns, and the fallback with no map; receipt and exception, hidden-roll presenter.                                     |
| P16 DM table and encounters       | P06, P15          | DM drawer, encounter preparation, campaign         | Party overview and full authorised sheet inspection without changing the active character or balances; prepare, balance to 2024 and reuse encounters, initiative, arbitration.                    |
| P17a First real VTT path          | P02, P03, P09     | map render, input, geometry, shared adapter        | DM opens a scene → two clients see it → an allowed token moves → it commits once → reconnection holds. Ephemeral drag separate from the commit; renderer chosen by measurement.                   |
| P17b Scenes and assets            | P17a              | scene archive, Storage limits                      | Upload, crop, compression and quotas, active scene and library, grid, scale and alignment separate; attachment ACLs and a file fallback; the observed Owlbear workspace.                          |
| P18 Map gestures                  | P15, P16, P17b    | map geometry, canvas, token tools                  | Pan, zoom, snap, path and metric, ruler, area, and token properties, layer, size, rotation, duplicate and lock; act from map. Familiar Owlbear commands, unchanged gestures.                      |
| P19 Shared map and TV             | P18               | map drawing, fog, ping, presence, view             | Drawing, ping, manual fog, recipient and desktop TV view, presences; two clients, scene change and reconnection; what is shown verified against what is accessible.                               |
| P20 Hub, chronicle and lore       | P02, P09, P16     | campaign hub, chronicle, shared notes, lore        | Contexts, a human recap, NPCs, places, factions and links, personal and shared notes, search; handouts with reveal and revocation and asset ACLs; secret versus player.                           |
| P21 Availability calendar         | P02, P09, P20     | sessions and the availability model                | A Doodle-style group poll: complete windows with a duration, stable yes/maybe/no per person, comparison and confirmation of one proposal, time zones. The voter is the person.                    |
| P22 Recurrence calendar           | P21               | recurrence and exception adapter                   | Series, single occurrence, absence, DST and time-zone change; editing one or all, and cancelling without losing answers.                                                                          |
| P23 Connections and reminders     | P22 + cost choice | calendar IO adapters, settings                     | Google opens a pre-filled event to save; ICS covers the rest, with single, series and all scopes; ICS import copies, not syncs; reminders a day and an hour before, with consent and idempotence. |
| P24 Treasury and transfers        | P03–P05, P12, P20 | treasury, inventory transfer contract              | Coins and items reuse the P04 offer, materialisation, receipt and revocation, adding quantity reservation and compensation, with no peer write; competition and retry proven.                     |
| P25 Rewards                       | P16, P24          | loot generation and review, XP and milestones      | Generate → review → assign treasure, party XP and milestones, with preview and correction; reproducible results in tests, and nothing applied while reading.                                      |
| P26 World and expeditions         | P14c, P20, P24    | world calendar, travel, downtime, rest             | Fantasy dates, weather, moons and events; travel, downtime, rations, ammunition, light and rests with consequences and undo. Splitting into two blocks is allowed.                                |
| P27a Session zero and entry       | P02, P09, P20     | safety, onboarding, invitations                    | Agreements, safety tools, first access and invitation with return to context; consent, cancel and permission paths tested, with screenshots.                                                      |
| P27b Account, public and recovery | P27a, P11b        | account, settings, public surfaces, snapshots      | Preferences, sharing and public exposure, export and recovery from a real snapshot, permissions; roundtrip on the six fixtures and before/after screenshots.                                      |
| P27c Legal, support, admin, PWA   | P27b              | legal, reporting, admin, PWA                       | Report preview equals payload, admin access, install, update, offline and the fallback; ACL, accessibility and PWA tests with error and role screenshots.                                         |
| P28 Cross-cutting acceptance      | P10–P27c          | tests and fixes in their respective owners         | The desktop, mobile and locale matrix in dark, offline, performance and quotas, the six fixtures; `just ci` plus licensing and rules gates; anti-drift against the mock.                          |
| P29 Session with the group        | P28, environment  | end-to-end evidence, status documents              | A real session of the six characters: preparation → invitation → play → loot → recap. The DM performs Owlbear-equivalent tasks without coaching; errors recorded.                                 |
| P30 Verified cutover              | P29 accepted      | data import and migration, owner documents         | Snapshot, dry run, idempotence and verification of the data entering V2, with no legacy runtime kept. Final CI and screenshots; deployment stays separately authorised.                           |

P16's exit acceptance also carries the trust boundary CHECKLIST C requires: shared Encounter hides
token/HP/fog/raw faces only through the presenter, by table trust; narrative secrets live outside the
Encounter in DM-only `dmNotes`.

### PD — engagement and progressive disclosure

<!-- source: product-memory/2026-09-09-owner-feedback-coinvolgimento.md -->

PD exists because the owner found the P10 experience "troppo fredda, distaccata e amministrativa",
like a bank's back office: creating a character today answers "mancano i campi", "come una pratica
alle poste". The mock was chosen above all for the battle map, the bridge and those colours;
approving it never meant approving every management surface derived from it. Folio must be lived as
a game played in a browser even though it uses sheets and controls, and engagement covers the
journey, the language, the feedback and discovery, not only the graphic skin. PD delivers:

- Real, recorded study of Baldur's Gate 3 and D&D Beyond as **primary and binding** references —
  how they build engagement, use images, order hierarchies and reward discovery — never decorative
  citations, alongside an analysis of the current experience.
- The character-creation journey redesigned as the representative path: the birth of a character
  must engage, and must make the choices and their consequences understandable.
- A raster art direction for spells and, where it makes sense, combat content and actions: small
  artistic raster images in the language of the mock's spell art, with concrete examples and
  criteria for coherence and legibility. Not more generic icons and not ad-hoc SVG pictograms — the
  owner is explicitly dissatisfied with those — and curated, contemporary, rich without being gaudy.
- Concrete proof of both sides of progressive disclosure: the expert acts fast with no mandatory
  explanation slowing them down, and the curious beginner can investigate, understand what a choice
  means and learn while playing. Neither side costs depth.

PD does not reopen P10's technical gates, and the owner has not approved replacing the whole design;
proposing the width of the revision is part of PD's own delivery. The owner's verdict closes PD.
**P11a does not start before that verdict.**

**Who does what in PD (owner, 2026-09-09).** Claude delivers the research half: the recorded study
of Baldur's Gate 3 and D&D Beyond and the analysis of the current creation experience, as a
repository document under `docs/superpowers/research/` that Astra consumes. Astra delivers the
visual half: the redesigned character-creation screens, the raster art direction with concrete
examples, and every taste decision; the owner's verdict closes PD.

## Deterministic selection of the single next block

<!-- source: full-lab/docs/AGENT-PROGRAM.md, "Selezione deterministica" -->

1. Read the current execution state — its assigned block **and bounded outcome**, and its exit
   evidence. If the outcome is unfinished (tests, review, screenshots, dependencies or gates missing
   or failed), assign **the same block and outcome** plus the recovery work; never pick other graph
   work to step around an open gate.
2. If the block has open outcomes, take the first in declared order. P14a/b/c each walk the eight
   rows of the E → outcomes table below top to bottom; starting P14b before all of P14a, or P14c
   before all of P14b, is forbidden. Any further outcome is registered in order before execution,
   without altering dependencies.
3. Once the whole block is finished, walk the block table from the top and take **the first
   unfinished row with all dependencies finished and proven**: P01, P02 … P08a → b → c, P09, P10,
   PD, P11a → b, P12 … P14a → b → c, P15 … P17a → b, P18 … P27a → b → c, P28 → P29 → P30. A
   dependency range requires every row inside it; when several rows are eligible, exactly one — the
   first — is assigned.
4. If the state marks the block finished but no row is eligible while work remains, report the
   inconsistency or missing dependency and keep verifying the current block; never invent a
   completion or reorder for convenience. After P30 and all gates, deliver the final record — no
   invented P31, no deploy.

Every handoff shows the selection, its dependency evidence, and repeats this rule. A row or outcome
needing several sessions always resumes the same outcome until satisfied; a later change reopens the
affected proofs and gates.

## E01–E22 assigned to P14a/b/c

<!-- source: full-lab/docs/RULES-EXCEPTION-CATALOG.md; assignment table in AGENT-PROGRAM.md -->

Decomposes the work inside P14a/b/c: each cell is a bounded outcome with its own inputs, proofs and
handoff; P05–P08 own their families' editors, never the execution handlers. For each outcome record
an ordinary case, a boundary case, a composition with another row, and the contextual manual
counterpart on the same facts, costs, receipt and undo.

| Families                                  | P14a — identity and receipt                                                               | P14b — application and reactions                                                             | P14c — causal correction                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| E08, E12, E17: priority regressions       | Red tests for the old Counterspell slot and implicit tempHP max, then a minimal green fix | Conditional costs, source selection and windows folded into the common pipeline              | Negation or substitution → undo of every cost and source                            |
| E01–E04: composed economy                 | Root, action, step and claim IDs; preview of the remaining capacity                       | Attacks, bound capacities, substitutions, turn, round and target scopes, the 2024 slot limit | An interrupted attack or granted capacity → replay with no double spend             |
| E05–E07: resources and clocks             | Resource and effect IDs, the boundary and the reset policy in the receipt                 | Partial and full recovery, renewal and duration, deterministic events, cycle guards          | Undo after a reset or a descendant trigger, and a late ack                          |
| E09, E10, E13: ready, roll, concentration | A suspended intent, dice lineage, and source-to-end relations                             | Ready, the decision on the roll, and concentration with its children                         | Restoring intent, resources and children; refusal when a dependency cannot be fixed |
| E11, E21, E22: damage and vital state     | The damage packet and vitals or condition transitions; a legality and economy preview     | Damage order, derived conditions, exhaustion, 0 HP, stable and death                         | Natural 1 and 20 results, healing, and two sources → a complete undo                |
| E14–E16: areas, control and monsters      | Entity, controller, area and source IDs, and the target receipt                           | Per-target ticks, bonds, forms and monster programs; no hardcoded adapter                    | Removing an entity, area or source and restoring its dependencies                   |
| E18, E19: derived values and homebrew     | Source and version, choices and conflicts, and the unsupported path                       | Executes compositions of already proven primitives; never interprets prose                   | Version, copy or revision with no phantom bonus or claim                            |
| E20: cross-cutting verification           | One receipt per root and no side effect inside a preview                                  | Three modes over the same outcome, decisions, apply-once                                     | Closing suite attack → reaction → reset, undo, replay, and checkpoints              |

The per-family definitions E01–E22 and the nine player-freedom scenarios still live only in the lab
(`~/Workspace/Codex/d20-design-dialogue/full-lab/docs/RULES-EXCEPTION-CATALOG.md`,
`PLAYER-FREEDOM-CONTRACT.md`); rule 36 requires them in the repository before P14a starts — that
import is a P14a entry condition.

## Cross-cutting contracts

<!-- source: full-lab/docs/AGENT-PROGRAM.md, "Audit di consegna e catena obbligatoria" -->

Capabilities already assigned to P01–P30 stay mandatory; a missing required interaction is a gap,
never something to delete to reach a complete count.

| Cross-cutting contract                                                                    | Blocks and exit proof                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Many characters and memberships per account; a character has zero or one current campaign | P02 roster migration and ACLs; P03 assignment, version and invalidation; P09 selectors; P10 creation, copy and archive; P04 and P24 claim and transfer with recipient materialisation. No scope contamination.                            |
| The DM consults the party and a complete sheet without impersonating anyone               | P09 separates the inspected ID from the active one; P11a exposes the same authorised projection; P16 overview → A → B → return with no mutation on read; P03 shared update and revocation; P29 proves the DM without coaching.            |
| All 22 E families, including the manual path                                              | The E → P14a/b/c table above is the exhaustive assignment. For each of the eight bounded outcomes: ordinary, boundary and composition cases plus the contextual manual counterpart, on the same facts, costs, receipt and undo.           |
| The nine freedom scenarios                                                                | P14a defines consequences and identity; P14b applies supported, declared primitives; P14c corrects causally while preserving independent facts; P15 gives contextual access; P17–P18 bridge objects and movement; P29 runs without hints. |
| Continuity and devices                                                                    | P09 return and search; P16–P19 the DM workspace; P20–P27 contexts and secondary flows; P28 the complete IT/EN dark matrix on desktop and pertinent phone; P29 includes a new DM, a DM used to Owlbear, and players.                       |

## Implementation depth

<!-- source: full-lab/docs/AGENT-PROGRAM.md, owner decision of 6 September 2026 -->

The mock shows generic paths; depth belongs to the implementation blocks, and its simplifications
never become the product's limit. Judge flow completeness, readability and pleasure of use alongside
correctness; a technical choice never justifies a silent product cut.

- **P10/P11a:** complete wizards with real choices — origin, class, proficiencies, ability scores,
  equipment and pertinent magic for creation; subclass, multiclass, feats, features and magic derived
  from character and level for growth. Explained prerequisites, visible consequences, before/after
  comparison, step return with no lost draft, cancel/resume, summary and confirmation. Free text only
  for voluntary exceptions — a generic form is not an acceptable guided path.
- **P14a–c:** action, targets, roll, costs, consequences, reactions and causal correction stay bound
  to the same facts and receipt, under D&D 2024 rules.
- **P15:** animated 3D digital dice with readable result, faces and modifiers, a shared animation, the
  physical/manual alternative, and a reduced-motion variant; the animation presents an authoritative
  result without regenerating it. Action → target → range/conditions → roll → consequences/reactions
  → undo is one continuous experience, with normal, long and out-of-range distances and
  advantage/disadvantage explained.
- **P17a–P18:** P15 prepares the contract, presenter and no-map path; P18 proves it on the shared map
  with distance, range indicators, targets and areas at the authoritative scale. Range, movement and
  area stay distinct; the P15 proof alone never closes the integrated capability, and no
  P15 → P18 → P15 cycle forms.
- **P28/P29:** prove creation → growth → encounter → attack at normal, long and out-of-range distance
  → digital or physical dice → consequences and reactions → undo, with runtime evidence of the real
  branches.

## Coverage and sequence notes

<!-- source: full-lab/docs/AGENT-PROGRAM.md, "Copertura e rischi di sequenza" -->

The nineteen jobs of [PRODUCT.md](../../PRODUCT.md) map onto the blocks as J01/J18 → P14–P16;
J05/J15 → P17–P19; J06 → P13; J07/J17 → P10–P12; J09 → P16; J02/J08/J10 → P20; J03 → P21–P23;
J04/J19/J14 → P24–P25; J12/J13 → P26; J16 → P27; J11 → P04–P08. Account, offline, recovery, public
surfaces, admin and legal cut across P02–P03 and P27–P28. The eleven homebrew families are four in
P05, two in P06, three in P07 and two in P08, each with the same coverage — autosave, sharing,
revocation, copies, versions, import/export, print — not merely "it has an editor". P23 must not
become a paid infrastructure project; calendar integrations and new-copy ACLs need targeted research
when implemented.
