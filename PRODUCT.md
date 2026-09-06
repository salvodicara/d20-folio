# Product

## Owner rectification — new V2 application, 6 September 2026

V2 is a completely new application. The binding experience reference is Astra's approved
full-lab mock `d20-folio-html-0.9.3-2026-09-06`, with the owner receipt in the external
REVIEW journal, passage 29. The existing application, earlier Claude implementations and
their screenshots are diagnostic history, never the design baseline or a result to approve.
The previous P02 request to approve its 28 legacy screenshots is withdrawn. Those tests
and that bounded review prove only their examined candidate, not new V2 conformity or P02 closure.

Astra has technical and architectural discretion: build, replace or reuse only to satisfy
the new domain and approved experience. One authority per fact, explicit responsibilities
and dependencies, verifiable transitions, no duplicated state or alternative old paths.
No legacy combat bridge. Production continues independently; legacy data is solely input
for recoverable migration: snapshot → dry-run → idempotent apply → verify/recover.
No production change, real migration, deployment, new cost or external send is authorized.

Reproduce all transferable BG3 behavior, especially combat, interactions, organization and
feedback, in Folio's approved experience. Adopt useful capabilities from D&D Beyond, Roll20
and relevant tools. D&D 2024 governs rules; no automatic BG3 rule variants. The mock guides
composition and behavior without limiting functional depth. Preserve all downstream depth
obligations. Every plan, delegation, review and full successor prompt propagates this decision.

Visual acceptance compares the identified approved Astra mock with actual new V2 runtime:
dark IT/EN, 1440×900 and 1280×800, 390×844 where pertinent, full Italian names, keyboard/focus,
crop and fallback. Do not reconstruct the old product baseline to satisfy a withdrawn gate.
P02 remains open until its conforming implementation, fresh behavioral proofs, actual review
and pertinent owner visual/interaction verdict exist. P03 is not authorized by this rectification.
The sole execution owner is docs/PROGRAM_STATUS.md in the current candidate; historical reports
remain unchanged and their earlier approval/completion claims must be read in their original scope.

## Register

product

## Steering (owner, 2026-09-03 — the top of the authority stack)

**Purpose, in one sentence.** A digital table where the app does the math and the rules the way
Baldur's Gate 3's engine does, the people do the story, and the DM can change anything.

**For whom.** The owner's group first, built so well that other groups and the public can follow.
The repository stays public; the SRD public build and the private content pack stay split.

**The ambition.** The definitive tool for playing D&D 2024: complete, depending on nothing else,
comfortable and free for remote groups and for the physical table, adapting to tastes (in-app 3D
dice everyone sees, or real dice with the result entered). Time and patience are available.
Two parities are owed at once (owner, 2026-09-03): everything Baldur's Gate 3 does at the table
(hotbar, automatic resolution, initiative, reactions, dice, map) **and** everything D&D Beyond
does around the character — the sheet stays readable as a sheet and printable, loot and items
pass from one character to another, the party has a shared inventory, and the DM has everything
a DM needs. BG3 is the model for playing; D&D Beyond is the model for owning a character.

**Self-contained.** Everyone at the table, players and DM, must be able to do anything related to
their D&D game without another tool: not only the sheet, the map, the dice and the rules, but the
session notes and recap, the campaign chronicle of everything that happened, the next-session date
in a shared calendar, NPCs, places, loot and party gold, handouts and images, homebrew — what the
group already does today plus the jobs D&D communities most often reach external tools for. The
list of jobs is kept in the Jobs table below and grows from evidence, never from guesses.

**What it is not.** No animated 3D world and no character animation (maps and tokens, Owlbear-level). No AI
narrator or assistant. No chat and no voice (Discord or the table; the app keeps only the game
log). D&D 2024 only; existing 2014 characters migrate.

**The line on automation.** Default is BG3: the app resolves everything and logs who did what.
The DM always has the last word and can modify, undo and customise everything simply. The DM
picks one of three campaign levels — full auto, propose-and-confirm, log only — and can change it
mid-session; dice mode is a per-person choice.

**First milestone.** One whole session of the group without opening Owlbear, D&D Beyond or a
calculator.

**Delivery posture.** Production keeps working as it is, exactly as it is, and the group keeps
playing with it (plus Owlbear) until the new system is in place and ready — this is a hard rule,
not a preference. The
new app grows in the long-lived branch `v2` (its own worktree) and is released only when the
milestone is reached; `main` receives production fixes only, cherry-picked into `v2` when they
matter there. A staging environment (separate
Firebase project on the free tier, staging hosting, the six team fixtures seeded, emulators in
CI) is mandatory until release. Approved cuts for the new branch: the character-only mechanics
kernel and its tests, the agent program supervisor and the superseded plans, the five sheet modes
and three combat executors (rebuilt as one sheet and one hotbar), and the old visual atlases as
authority. The test portfolio and CI are rebuilt with the new app: the old end-to-end suites
(almost an hour per run) are not carried over; the new gate keeps unit and rules tests, the golden
replays of the acceptance stories, one accessibility sweep and the screenshot suite, and must
stay fast (target under 15 minutes). Salvage the automation knowledge (typed data, coverage, grants).

**Method.** Giants' shoulders (golden rule 30): every screen, component, model and workflow is
copied from the state of the art with real evidence and then improved — never invented. UI/UX
comes first: the owner judges only visuals, and no product code is written for a surface until
its screens are agreed at 100 % from images (golden rule 25).

**Acceptance stories.** (1) Marco, a beginner, plays his first turn: moves, casts Fireball on three
goblins, everything is resolved and logged. (2) Sara the DM runs an ogre ambush: tokens, fog,
hidden rolls, the monsters' actions, an overridden result, a homebrew sword. (3) The group between
sessions: level-up, spell preparation, rules lookup, campaign journal. (4) The group across the
campaign: the DM writes the session notes and the recap in the app, the next session is agreed
and saved to the shared calendar, the chronicle holds everything that happened, NPCs and places
are looked up, loot and gold are split, a handout is shown — nobody opens another tool. A feature
that serves none of the four is superfluous.

**Jobs the app must cover** (ranked from community evidence, 90 sources, 2026-09-03; full
report in `docs/superpowers/research/2026-09-03-self-contained-jobs.md`; non-goals: voice/video,
text chat, music, map authoring, art generation, AI recaps).

| #   | Job                                                                                                           | Who          | When           | Today (external)                    |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------ | -------------- | ----------------------------------- |
| 1   | Run combat: initiative, HP, conditions, stat blocks, player-facing turn order, automatic resolution with undo | DM, players  | during         | app + Owlbear + trackers            |
| 2   | Session notes and recap, "what happened last time" — a play log that is the recap                             | DM, players  | during, after  | Docs, Notion, paper, AI recap tools |
| 3   | Schedule the next session, availability, RSVPs, cancellations, shared calendar                                | everyone     | across         | Discord bots, Doodle                |
| 4   | Party loot, shared inventory, gold split, item transfer between characters                                    | players, DM  | during, after  | Sheets, Discord pins                |
| 5   | Battle map with fog, tokens and player view (remote and table TV)                                             | DM, players  | during         | Owlbear, Roll20, Foundry            |
| 6   | Rules, spells, conditions, monsters lookup mid-session (2024, EN/IT, plain explanations)                      | everyone     | always         | D&D Beyond, 5etools                 |
| 7   | One character sheet whose rolls land where play happens; readable as a sheet; printable                       | players      | always         | D&D Beyond + bridges                |
| 8   | NPCs, places, factions, lore findable; player-curated slice                                                   | DM, players  | across         | Kanka, World Anvil, Obsidian        |
| 9   | Build a balanced encounter with 2024 math, reuse it                                                           | DM           | before         | Kobold+ Fight Club                  |
| 10  | Handouts, art, letters, images shown to players                                                               | DM           | during         | Discord, tablet, TV                 |
| 11  | Author and share homebrew (items, monsters, subclasses, rules) with the group                                 | DM, players  | across         | Homebrewery, GM Binder              |
| 12  | In-world calendar, date and time, weather                                                                     | DM           | during, across | Fantasy Calendar, spreadsheets      |
| 13  | Downtime, travel, rations, ammunition, light, rest bookkeeping                                                | players, DM  | during, after  | logsheets, spreadsheets             |
| 14  | XP or milestone progression and awards                                                                        | DM, players  | after          | spreadsheets                        |
| 15  | Character art and tokens                                                                                      | players, DM  | before         | HeroForge, token makers             |
| 16  | Session zero and safety tools                                                                                 | table        | before, during | forms, docs                         |
| 17  | Onboard a brand-new player (first character, first session)                                                   | DM, newcomer | before         | premades, cheat sheets              |
| 18  | Dice with a shared, trusted log (in-app 3D or real dice entered)                                              | everyone     | during         | dice, bots, VTT rollers             |
| 19  | Loot and treasure generation                                                                                  | DM           | before         | donjon, generators                  |

**Identity.** The owner confirmed the name d20 Folio and the D20 mark on 2026-09-05.
A specific new SVG or illustration corpus still needs its own visual/provenance evidence.

## Reconciled owner direction — 2026-09-06

Combat and every transferable interaction must reproduce Baldur's Gate 3's behavior in full,
with Folio's visual identity. This is a behavioral requirement, not color, atmosphere or loose
similarity: HUD/hotbar, actions/Bonus Actions/reactions, targeting, range/areas, movement,
resources, dice, consequences, and transferable character/inventory/growth paths. Before each
surface, observe the corresponding BG3 sequence, organization and feedback; demonstrate the
Folio counterpart through actual gestures and visual comparisons. D&D 2024, player freedom and
the physical-dice alternative remain binding. A concrete incompatibility is resolved with the
owner using that example; never silently cut the product or ask for another general reference
interview. No new 3D world, backend, cost or privacy policy follows by implication.

The approved HTML lab supplies composition and interaction references, not a ceiling on depth.
The binding implementation obligations and their scenarios are in [DESIGN.md](DESIGN.md),
“Implementation depth”; execution order and evidence are owned by
[Program Status](docs/PROGRAM_STATUS.md). Only dark, in IT and EN, is the new-app theme target;
light paper for printing is not a second application theme.

Four permanent domains organize the product: Campaign, Character, Library and At the table.
Account is a global utility. Back/Forward and return from a detail/picker preserve valid scoped
filters, scroll, selection and drafts. Campaign membership, character assignment, inspected
character and active command actor are separate. An account can own many characters and join
many campaigns, including multiple characters in one campaign; one character has at most one
current campaign. DM inspection exposes the complete authorized sheet without changing the
active actor, lease, control or balances, and without exposing private notes.

Automatic resolution and contextual “Resolve at the table” share facts, costs, consequences,
receipts and correction. Unsupported mechanics remain preserved and usable through explicit
manual consequences, not notes pretending to apply changes. Exceptions are available in creation,
growth and play without an extra automatic DM-approval queue. The three campaign automation
levels remain separate application policies, and the DM retains final arbitration. Rule freedom
never bypasses account/content permissions.

Custom IS the library: custom content autosaves for reuse across eleven families — weapons,
equipment/items, spells, features, monsters, subclasses, campaign rules, species, feats,
backgrounds and classes. A granted copy retains provenance/version; revocation stops future
access and updates, not an already granted copy. Browsing is not a grant. Architecture owns the
recipient-materialization protocol and its access boundaries.

**Production continuity, reaffirmed by the owner in P01.** The group must keep playing with the
current production app while V2 develops separately against the dedicated staging project.
Production is not changed by V2 work. Switch and retirement of the old experience happen only
when V2 is fully complete, the players' data have been migrated and verified under the recovery
protocol, and the owner explicitly authorizes the switch. P11b's V2 internal state transition
does not retire production. P30 does not itself authorize deployment.

## Users

D&D 2024 players, from first-timers to veterans, creating, managing, and playing characters
digitally — bilingual (EN + IT), offline-first PWA. The owner's group plays online, each on their
own computer with voice chat; the physical table is the extension. Desktop/laptop exposes the complete product (map, hotbar, dice, encounters, preparation,
authoring and character management). Phone serves quick/offline consultation, sheet, compendium,
sessions, notes and relevant updates. Touch combat and full desktop HUD/map parity are not
requirements; the shared/TV view remains a desktop capability. Beginner-friendly (no manual required) yet expert-capable (hints
ignorable). Friends of the owner are live users with real characters — this is not a hypothetical
audience.

## Product Purpose

The steering above is the purpose. In product terms: a digital table that auto-computes every
D&D 2024 rule while always allowing a manual override, where a player runs an entire character
lifecycle (create, level up, play, manage a campaign) without leaving the app, and a DM runs a
whole session inside it. It is both a live table (action economy, HP, resources, initiative, map,
dice, automatic consequences) and a D&D knowledge tool (search, character understanding,
progression paths). Concretely, "Baldur's Gate 3, but for playing D&D": a full-screen map at Owlbear Rodeo's level
(image, tokens, grid, ruler, simple fog) with a BG3-style hotbar, in-app 3D dice everyone sees
(physical dice always allowed as manual input), and every consequence applied automatically with a
who/why log and undo. DM tools are an optional force-multiplier, never a requirement, and the DM
plays on the same screen: selecting a creature makes the hotbar that creature's. The app replaces
the group's external VTT rather than complementing it; without a loaded map it still works fully
from declared facts.

## Brand Personality

**Tactical Codex:** magical, premium, confident, alive. The product feels like a first-class fantasy
game companion built for online play and the real table: distinctive at a glance, calm under pressure, rich
where identity or consequence matters, and quiet where the user is reading or deciding. Dark
graphite, warm ivory, restrained antique gold, semantic pigments, original portraits and precise
tactical iconography form the current working direction. The name describes a product quality and
interaction grammar, not a theme that every surface must decorate literally.

Voice is clear and confident, plain-language for beginners, never jargon-gatekeeping, with no
marketing filler in task copy. Publicly observable interaction patterns from **D&D Beyond**
(character-sheet information architecture and density), **Roll20** (physical-table input and inline
editing), and **Baldur's Gate 3** (interaction confidence, action presentation and craft ceiling) are
benchmarks, not assets or proprietary internals to copy. D20 Folio's imagery, components and domain
architecture remain original. Visual fantasy must never reduce usability during a real session.

## Anti-references

Generic flat SaaS dashboards, Material-flat surfaces, neon/cyber, corporate fintech navy-and-gold,
the warm-neutral "AI cream default", ornamental parchment everywhere, and fantasy decoration pasted
over generic forms. D20 Folio is **not** a dashboard, **not** an enterprise application, and **not**
a fantasy skin. Illuminated Folio, Gilded Reliquary and any other historical visual treatment are
evidence, not permanent constraints. Keep a treatment only when it remains the best expression of
the current product; remove it when hierarchy, coherence, accessibility or interaction quality
improves without it.

## Design Principles

1. **Progressive disclosure is mandatory.** Common information is visible, summarized, easy to scan,
   available at a glance; detailed information is available on demand, never hidden behind
   unnecessary navigation. This is one of the most important principles in the product and applies
   everywhere (collapsed vs. expanded cards, pickers, DM surfaces, all of it).
2. **Only and all the necessary.** Every element on a surface must earn its place — no useless info,
   no decoration masquerading as information. When in doubt, leave it out; premium visual registers
   (hero altar, carved cartouche, lit-socket, gold-thread, gilt frame) are earned by information a
   player is deciding or reading, never spent on decoration.
3. **Override-first.** Every derived value auto-computes by default, but a manual override is always
   exposed in the UI. An override-able value is not "done" until the default auto-computes.
4. **Choosing is sacred (the Picker Doctrine).** Read-then-choose (browsing never commits), detail on
   SELECTED only (no per-row info affordances), never state met preconditions (unmet options are
   filtered in the guided path; an explicit exception remains available), cascading choices expand
   under their visible cause.
5. **Purpose-built device scope.** Desktop offers the complete product; phone supports consultation
   and relevant updates with an equally intentional composition, without a forced combat HUD.
6. **Consistency over novelty; reusable systems over one-off screens.** A small number of highly
   reusable UI patterns used everywhere; a bespoke restyle of an existing job is a defect.
7. **No truncation.** Identity text is never mid-string ellipsized — swap to a shorter true form at a
   breakpoint, or wrap, instead.

## Accessibility & Inclusion

WCAG AA is the floor, enforced by a self-enforcing gate (`tests/e2e/a11y.spec.ts`) across every
surface in the supported dark theme, in EN and IT — the app is axe-clean, re-checked after any token change.
Every interactive component ships default/hover/focus/active/disabled (+ loading/error where
relevant) states with a visible keyboard focus ring. All animation respects `prefers-reduced-motion`
via a single OS-driven kill-switch (no in-app animations toggle). Bilingual EN + IT for every
user-visible string — no English-only strings ship. Touch targets are ≥44px on mobile. No user-facing
text below a 10px legibility floor.
