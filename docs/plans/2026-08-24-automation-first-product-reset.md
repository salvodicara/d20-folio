# Automation-first product reset

> Status: execution plan. The owner's 2026-08-24 direction supersedes any earlier assumption that
> the current visual identity, dual runtime, legacy mirrors, or accumulated regression tests are
> intrinsically permanent. Durable product and safety invariants remain in force.

## Goal

Make d20 Folio a fully automated D&D companion: the table supplies only facts the application
cannot observe, while one deterministic engine derives every modeled consequence. The same domain
truth must drive solo/offline play, authoritative shared play, onboarding, UI presentation,
persistence, undo, and tests.

The reset succeeds when:

- every action uses one semantic command contract and one interaction flow;
- every fact has one canonical owner and no rollout mirror remains;
- shared gameplay is committed authoritatively without encoding business rules in Firestore Rules;
- solo play remains genuinely offline-first;
- the UI is coherent, premium, fast in session, and verified from rendered screenshots and motion;
- legacy code and tests disappear as soon as their replacement reaches proven parity.

## Decisions

### Keep

- Typed rule data; never parse prose to execute mechanics.
- One pure, locale-free deterministic kernel.
- Physical dice only: no RNG, ever.
- Preview, attributed override, idempotency, revision fences, and undo.
- EN/IT by construction, content-pack/SRD separation, live-fixture migration safety.
- Owner approval for visual screenshots and deployment.

### Replace

```text
RuleDefinition + WorldState + SemanticCommand + ExternalAnswers
                              |
                              v
                        resolveCommand()
          +-------------------+-------------------+
          |                   |                   |
  NeedExternalInput        Rejected       Preview / CommitResult
                                                  |
                                     patch + events + undo receipt
```

- `ExternalAnswers` contains only physical roll observations, selected targets, table geometry,
  hidden opponent outcomes, and explicit rulings.
- Costs, legal targets, DCs, scaling, resources, durations, conditions, economy, and deterministic
  consequences are engine results, never UI decisions.
- `Grant` survives only as normalized modifier/capability/trigger IR. A spell, action, feature, or
  item compiles once into one canonical rule definition.
- `EffectInstance` is the only active-state concept exposed to UI. Availability and activity are
  separate domains.

### Homebrew without a parallel engine

- Homebrew spells, items, monsters, features and feats compile to the same `RuleDefinition` and use
  the same ActionFlow, validation, preview, receipts and undo as published content.
- Guided editing covers common mechanics; an advanced typed rule-block builder exposes composition,
  conditions, scaling, resource costs, duration and table-observation seams without executing prose.
- Every definition has stable identity, author/source, EN/IT presentation, version, draft/published
  state and provenance. Existing character or campaign copies never mutate silently when a library
  definition changes.
- A sandbox runs deterministic examples without RNG and shows unresolved external inputs. A manual
  ruling remains possible and attributed, but never becomes a second hidden rules engine.
- Account libraries own personal definitions; campaign libraries explicitly pin shared versions.
  Sharing is opt-in and licensing boundaries remain intact.

### Persistence topology

- `users/{uid}/characters/{charId}` owns build, custom choices, metadata, sharing, attachment,
  derived cache, and `buildRevision`. It owns no live gameplay state.
- `users/{uid}/characters/{charId}/combat/state` keeps the deployed path but directly stores one
  versioned `CharacterMaterialState`. Remove nested `playState`, `session`, and `world` wrappers.
- `users/{uid}/characters/{charId}/public/sheet` remains a deliberate derived access projection,
  never a second source of truth.
- `campaigns/{campaignId}` owns identity, membership, settings, treasury, and `activeEncounterId`.
  Keep `memberUids` only as a derived Firestore query index.
- `campaigns/{campaignId}/encounters/{encounterId}` owns one bounded `SharedMaterialState`: NPCs,
  participant references, initiative, turn, encounter clock, and encounter-scoped effects. It does
  not copy PC build, HP, slots, or resources.
- `.../receipts/{commandId}` stores immutable idempotency/attribution/undo receipts with bounded
  retention. No persistent pending-command queue.

### Authority and offline behavior

- Solo/private commands run the pure kernel locally and queue one `combat/state` write.
- Shared commits use one authenticated, App-Check-aware callable `executeSharedCommand`.
- The callable reloads the authoritative aggregate, checks role/membership/participation,
  `buildRevision`, expected revisions, and `commandId`, reruns the same kernel, and transactionally
  writes only changed documents plus the receipt.
- Firestore Rules become access/schema boundaries and deny direct client writes to shared runtime.
- Shared work may be previewed offline, but it remains explicitly pending until reconnect/rebase.
  The UI never presents offline shared state as authoritative.
- A command-document trigger is rejected: it would add asynchronous ordering, pending states,
  retries, cleanup, and latency without improving this interaction model.

### Interaction architecture

One state machine powers spells, attacks, features, items, rests, reactions, and overrides:

```text
Configure -> Targets -> Observe external facts -> Review consequences -> Commit
                                                            |
                                  saving / queued / error / success + undo
```

- Skip steps with no real decision.
- Preserve compatible answers on Back; invalidate only dependent answers.
- Render semantic presentation steps (`choosePayment`, `chooseTargets`, `observeAttack`,
  `observeSave`, `observeRoll`, `reviewConsequences`), never raw engine requirement kinds.
- Use one result-named primary action. Never show simultaneous competing CTAs.
- Use contextual desktop trays and mobile task sheets for routine actions; reserve modal dialogs
  for blocking conflicts or destructive confirmation.

Campaign coordination uses the same product discipline: a bounded session planner owns proposals,
availability, RSVP, agenda and encounter links. Calendar export is an explicit user action; scheduling
does not introduce hidden polling or a duplicate campaign timeline.

### Visual direction

Working direction: **Tactical Codex**. It is premium dark fantasy with disciplined hierarchy, not a
mandatory preservation of Illuminated Folio ornament.

- Fantasy identity comes from material, type, iconography, chromatic mechanics, and restrained
  motion; decoration must earn its place.
- Gold means focus, current selection, or primary commit, not generic chrome.
- Spell levels, conditions, resources, and action types retain meaningful chromatic identity.
- A readable UI face handles controls; display serif is reserved for identity and important titles.
- The direction applies app-wide through tokens and shared components. No hybrid rollout is exposed.
- No visual change integrates before approved real screenshots; motion is also inspected at entry,
  mid-transition, settled, interrupted, exit, and reduced-motion states.

### Visual atlas contract

The approved native boards are preserved in
[`docs/design/tactical-codex-atlas/`](../design/tactical-codex-atlas/README.md). They are the
versioned image-to-code reference and are not runtime bitmap assets.

**A00 is strict authority for every other board.** The canonical identity is one geometric d20
monogram plus one wordmark. Desktop has one five-destination rail — Home, Characters, Campaigns,
Compendium, Settings — and a contextual top bar with breadcrumb/title, search, sync and account.
Mobile has one four-destination bottom bar — Home, Characters, Campaigns, Compendium — with settings
inside the account menu. Full-screen wizards may retreat global navigation; immersive encounters may
retreat it only while preserving an explicit return to campaign. A desktop surface never renders the
mobile bottom bar, and a feature never invents a fifth global destination.

The redesign is specified through seventeen surface families rather than a page-by-page accumulation of
one-off layouts. Each family has one coherent visual grammar and explicitly covers the real product
states below. A state is not considered designed merely because its happy path shares a component.

| Board | Surface family                              | Required specimens                                                                                                                                                                                                                                                                        |
| ----- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A00   | Global shell                                | One canonical logo and navigation taxonomy; signed-in desktop/mobile, anonymous, account menu, command palette, shortcuts, save states, offline/install, combat pip, undo, and explicit immersive-mode retreat/return behavior                                                            |
| A01   | Access and public                           | Login, legal, invite join, public/revoked share, auth blocked, 404, full/section recovery                                                                                                                                                                                                 |
| A02   | Multi-character roster                      | Loading/error/empty/one/many/search-empty/cap, active/retired/fallen cards, selection and bulk actions                                                                                                                                                                                    |
| A03   | Import and destructive account data actions | File-pick success/error/partial states and confirmations; do not invent the retired import-review modal                                                                                                                                                                                   |
| A04   | Character creation                          | Quick/guided choice, all ten guided steps, conditional omissions, validation, review, leave/rebuild confirms                                                                                                                                                                              |
| A05   | Shared character cockpit                    | Owner play/edit, campaign/admin/public read-only, portrait flows, desktop rails/mobile disclosures, death/concentration/reaction banners                                                                                                                                                  |
| A06   | Five cockpit anatomies                      | Combat, spells, inventory, features, biography, including each real empty/search/error/capacity state                                                                                                                                                                                     |
| A07   | Resources and status                        | Resources, slots, conversions, effects, companions, auras, inspiration, conditions, concentration, exhaustion, defenses, proficiencies                                                                                                                                                    |
| A08   | Turn and resolution                         | Solo/shared turn states, action economy, unified ActionFlow, attack/save/damage/heal/condition/multi-target branches                                                                                                                                                                      |
| A09   | Level up                                    | HP, class/multiclass, subclass, ASI/feat/boon, feature choices, spell gain/swap, review, completion, max-level                                                                                                                                                                            |
| A10   | Multi-campaign roster                       | Loading/error/empty/many/cap, campaign cards, create/join/invite success and management variants                                                                                                                                                                                          |
| A11   | Campaign workspace                          | Member/DM/admin, party at rest, attach/swap/detach, DM without PC/DMPC, live/journal/resources/DM sections                                                                                                                                                                                |
| A12   | Campaign records and resources              | Chronicle, session planner/calendar, availability and RSVP, notes, treasury, invitation, DM transfer/member removal/delete, every empty/edit/history/confirm state                                                                                                                        |
| A13   | Live encounter                              | Initiative gathering, player wait/join, DM begin/reorder, PC/monster ownership and visibility, statblocks, custom monsters, end encounter                                                                                                                                                 |
| A14   | Compendium, bestiary and Homebrew Studio    | Frontispiece/list/facets/no-result/detail/deep link; rich spell/item/monster readers; all nine catalogue types; mobile leaf split; typed creation, versioning, preview, sandbox validation, campaign/account libraries and sharing for custom spells, items, monsters, features and feats |
| A15   | Settings and admin                          | Theme/language/account plus the complete role-gated admin console and recovery states                                                                                                                                                                                                     |
| A16   | Overlay library                             | Searchable pickers, payment/input sheets, workflow dialogs, destructive confirms, menus, popovers and mobile sheets                                                                                                                                                                       |

Every applicable board must annotate:

- desktop and mobile composition, plus tablet where the anatomy changes;
- IT and EN, including the longest realistic Italian copy;
- dark and light themes;
- loading, empty, populated, no-result, busy/disabled, recoverable error, offline and save-error states;
- owner, member, DM, admin, public and anonymous authority variants;
- zero, one, many and capacity limits for characters/campaigns;
- modal closed/open, nested detail and destructive confirmation;
- rest, initiative gathering and active encounter modes;
- the real route or call site that owns the state.

The atlas also carries a visible capability ledger. Each specimen is labelled **current**,
**redesign**, or **new approved capability** so concept art cannot silently invent product behavior.
The session planner/calendar and first-class Homebrew Studio are approved new capabilities; account
export/deletion or any other accidental concept affordance remains excluded until separately owned.

### Asset system contract

- The logo and wordmark are original vectors with full, compact, monochrome, dark and light variants;
  image generation is never the source of truth for the final mark.
- Display/editorial type and the UI face use redistributable variable fonts with verified IT/EN
  coverage, legibility and bundle impact. Controls never use display type merely for atmosphere.
- Generic interface jobs use one coherent outline icon system; mechanics that lack a clear generic
  symbol receive original SVG glyphs built to the same grid, stroke and optical weight.
- Portraits, campaign art, monster plates, item art and spell glyphs each have a defined aspect ratio,
  crop, focal-safe region, fallback and provenance. Missing art never breaks hierarchy.
- User and Homebrew art is optional, crop-safe and attributable. It never changes rule identity or
  becomes required for a usable entry.
- Every asset is verified at real rendered sizes in dark/light and desktop/mobile. Decorative bitmap
  text, unlicensed fonts, copied proprietary game assets and inconsistent generated icon sets are
  forbidden.

Two cross-cutting boards complete A00–A16:

- **B00 — Asset Bible:** logo/wordmark, type, icon grid, art taxonomy, ratios, safe crops, fallbacks,
  provenance, themes and delivery formats.
- **B01 — Motion Bible:** entry, mid-transition, settled, interrupted, exit and reduced-motion frames
  for ActionFlow, mobile sheets, disclosure, sync/recovery, undo and encounter turns.

The atlas is complete only when the checklist maps every current capability to one board and every
new automation capability to an ActionFlow or bounded workflow. Final proof comes from the rendered
application in the user's authenticated Chrome session, not from source inspection or generated
concept art alone.

## Immediate deletion inventory

Delete only after each replacement is proven in the same slice:

- `MechanicsCastModal` as a generic raw-requirement renderer.
- `engine-spell-gate`, dual dispatch in `EngineCastFlow`/`EngineActionFlow`, and the parallel legacy
  resolver route.
- Manual mirrors for action economy, spell slots, concentration, conditions, timers, and logs.
- `SessionState.world`, `playStateVersion`, and legacy/v1 persistence branches.
- Inline campaign `encounter`, `world`, `memberEffects`, `effectOps`, and growing `events` fields.
- `memberDetails.character`, `sharedNotes`, and other stale snapshots/fallbacks after production
  verification.
- Firestore Rules business validators and fan-out branches after the shared callable is authoritative.
- Inactive launchers from the `Attive` rail, the duplicate ability editor, the profile save jewel,
  native number inputs, generic “Apply” copy, and duplicated CTA paths.
- Tests that protect deleted representations, source regexes, conditional/vacuous flows, and capture
  harnesses masquerading as release gates.
- Historical rollout narrative from map/status documents after the final cutover; history belongs in
  the changelog and decisions, not the current architecture map.

## Execution sequence

Each phase is a live-safe vertical cut. Never dual-write one fact. Old and new may coexist only on
different versioned documents or feature families, with a single owner selected by an atomic marker.

### Phase 0 — Baseline and product authority

1. Reconcile `PRODUCT.md`, `docs/PRODUCT_CONSTITUTION.md`, and `DESIGN.md`: premium/cohesive is
   permanent; Illuminated Folio is not.
2. Capture the deployed schema/version inventory and six live fixtures.
3. Build a golden command corpus spanning cast/upcast/target/save/damage/effect/undo, attacks,
   reactions, rest, resource use, and manual override.
4. Freeze expansion of dual-dispatch and legacy mirrors.

### Phase 1 — Stable semantic façade

1. Add the public `resolveCommand` contract around the existing kernel without changing storage.
2. Introduce semantic input/presentation types and differential old/new tests over the golden corpus.
3. Prove a single shared-kernel build seam for browser and Functions; duplicate engine code is not an
   acceptable fallback. Select the smallest measured packaging/bundling option autonomously.
4. Add the real Auth + Firestore edit/write/server-echo/reload test that the current suite lacks.

### Phase 2 — First complete vertical slice

Use casting because it exposes the current architecture and UX failures in one bounded journey:

1. Compile one spell definition through payment, upcast, targets, attack/save observation,
   damage/effect, commit, and undo.
2. Build the shared `ActionFlow` presenter and components.
3. Reuse the good chromatic slot options, entered-roll controls, and target cards as primitives;
   delete their monolithic owners when no consumer remains.
4. Generate high-fidelity dark/light, EN/IT, desktop/mobile screenshots and motion traces.
5. After owner approval, switch the slice once and delete its legacy route and tests.

### Phase 3 — Authoritative shared command

1. Implement `executeSharedCommand` in observe mode with Auth, App Check, membership, role,
   participation, schema, revision, and idempotency checks.
2. Run differential preview/server results against emulator fixtures; write nothing in observe mode.
3. Introduce versioned encounter documents and bounded receipts.
4. Cut new encounters to the new model; let active legacy encounters finish unchanged.
5. Deny old direct writes only after every supported client has the new command path.

### Phase 4 — Runtime cutover by fact family

For each family—vitals, resources, effects/conditions, duration, action economy, rest, reactions,
inventory—run:

1. snapshot;
2. dry-run field reconciliation;
3. idempotent migration;
4. verify live fixtures and pending offline writes;
5. atomically switch the document marker;
6. delete the old field, mirror, parser, writer, Rule branch, and representation test immediately.

Old PWA clients that cannot write the new schema must receive an explicit upgrade requirement; they
must never recreate legacy fields.

### Phase 5 — App-wide coherent UI

1. Replace “Attive” with a projection of real `EffectInstance`s; hide it when empty. Move available
   activators back to their action/source surfaces.
2. Make ability and saving-throw tiles directly editable; remove the duplicate lists.
3. Replace the profile jewel with an accessible `DocumentSyncStatus` placed near edited content and
   a recoverable error path that preserves input.
4. Propagate the approved token/component/motion system through onboarding, roster, character,
   spell/action discovery, campaign, encounter, settings, and error/empty/loading/offline states.
5. Do not expose a partially restyled application: integrate coherent surface groups behind the
   screenshot approval gate.

### Phase 6 — Test portfolio reset

Target lanes:

- L0 static: type, lint, licensing, i18n, import direction, no RNG.
- L1 pure: engine rules, formulas, legality, resources, undo/idempotency, codecs.
- L2 live boundary: six real fixtures, migrations, Functions, emulator Auth/Rules/commands.
- L3 browser: 10–12 release-critical real journeys.
- L4 surface audit: one traversal with multiple graders and a pairwise matrix.
- L5 visual/motion: curated screenshots and frame timelines for human approval.
- L6 post-deploy: health and read-only smoke on the exact SHA.

Immediate cleanup merges repeated a11y/i18n/mobile/art traversal, moves capture probes outside the
test gate, removes vacuous conditional flows and row-count meta-tests, and adds Functions to CI.
After cutover, rewrite semantic outcomes against `resolveCommand` and delete journal/proof/lease/
mirror representation tests. The current audit estimates 10k–17k test LOC can be removed or merged
without losing durable coverage after the legacy cutover.

## Visual approval matrix

Minimum pairwise surface set:

- IT dark desktop 1440x900;
- EN light desktop 1440x900;
- IT light mobile 390x844;
- EN dark mobile 390x844;
- tablet landscape 1024x768 when layout changes.

For the high-risk ActionFlow, use the complete EN/IT x light/dark x desktop/mobile cross on opening,
review, and recoverable error. Inspect payment auto/multiple/unavailable; self/modeled/external/no
target; attack/save/roll observations; queued/saving/error/success; zero/one/many active effects;
tile edit/focus/override/error; and document saved/saving/offline/error states.

## Verification and integration

- TDD and differential tests precede every implementation slice.
- Every architectural slice receives correctness review and Ponytail complexity review.
- Visual slices require rendered screenshot and motion approval before integration.
- Final gates remain `just ci`, `just ci-srd-only` where applicable, `pnpm test:rules`, Functions
  tests, real emulator journeys, and the curated browser matrix.
- Rebase on fresh `origin/main`, push explicit `HEAD:main`, confirm the SHA, and never deploy without
  a new explicit owner instruction.
