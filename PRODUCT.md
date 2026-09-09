# Product

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

## Owner decisions (dated)

Full text in [`docs/program/DECISIONS.md`](docs/program/DECISIONS.md); the newest dated statement
always wins. What each date settled for this document:

- **2026-09-09** — the experience is too cold and administrative; spells and combat actions need
  curated raster art, not generic icons or ad-hoc SVG; BG3 and D&D Beyond are studied for real
  (open as block PD).
- **2026-09-08** — the standing V2 delivery delegation and the clarity obligation, both below.
- **2026-09-07** — custom content drives the same engine and combat stays editable (below); every
  block iterates on the actual running application, with independent authenticated clients and the
  optimized build on Firebase demo emulators, and emulator acceptance never authorises deployment,
  production writes or new cost. Aim for production fidelity without claiming exact equivalence:
  document emulator and environment gaps and verify them in the separately authorized
  staging/release gates before switching users.
- **2026-09-06** — V2 is a completely new application: the approved mock
  `d20-folio-html-0.9.3-2026-09-06` is the binding experience reference and never a ceiling on
  depth; existing code, engines and screenshots carry no reuse or compatibility claim; no legacy
  combat bridge; production continues independently and its data is only the input to a recoverable
  migration. Visual acceptance compares that mock with the actual V2 runtime, over the matrix in
  [`docs/program/PROGRAM.md`](docs/program/PROGRAM.md).
- **2026-09-05** — dark theme only, in EN and IT: light paper is for printing, not a second
  application theme. The name d20 Folio and the D20 mark are confirmed.
- **2026-09-03** — the steering above, giants' shoulders, the dice reversal, and a CI gate under
  fifteen minutes.

## V2 delivery and owner review

For implementation of the approved Astra mock and the agreed product contracts, the owner gives
standing authorization to complete reviewed, gate-green work and integrate it into `v2` without a
fresh exhaustive screenshot approval at every block. Always verify the real runtime against the mock
and deliver curated actual screenshots in chat, followed by the successor handoff once the block and
its integration are finished. Do not expect the owner to inspect every control, repeat this consent,
or perform the agent's verification: the detailed hands-on usability review happens when the
application is complete and usable. Defer fine visual and interaction polishing to that final
review rather than repeatedly seeking decisions on minor details. This is delegated implementation
acceptance, not evidence that the owner audited every pixel.

It preserves independent review, real-runtime evidence, safety and quality gates, full functional
depth and mock fidelity. Resolve routine design and technical details autonomously; ask only for a
material product decision the agreed direction does not cover, or for separately gated production,
deployment, real-data migration, cost or other external authority. Integration into `v2` authorizes
no deployment or production switch.

**Production continuity.** The group keeps playing with the current production app while V2 develops
separately against the dedicated staging project; production is not changed by V2 work. Switch and
retirement of the old experience happen only when V2 is complete, the players' data have been
migrated and verified under the recovery protocol, and the owner explicitly authorizes the switch.
P11b's internal state transition does not retire production; P30 does not itself authorize a
deploy.

## Clarity and familiar interaction patterns

The same depth and contextual control must be understandable throughout the application, including
homebrew entry forms, character creation/growth, campaign management and play/combat. Users must
be able to tell where they are, what a term or control means, what they can do, and what a choice
will change. Use familiar, established interaction patterns and consistent domain language;
implementation terminology and internal data structures must not become prerequisites for use.

Provide clear labels, coherent grouping, relevant examples and help, and visible state and
consequences. Reveal advanced detail progressively while keeping the full capability available.
Preserve context and drafts across navigation, explain validation and recovery, and make the next
action and return path understandable. Clarity preserves depth, automation, contextual freedom and
authoritative correction/undo: never reduce the product to make a confusing interface look simpler.
Generalize the owner's observations into durable principles across related surfaces rather than
applying them only to the screenshot that prompted them; DESIGN owns their concrete application.

**The four permanent domains** organize the product: Campaign, Character, Library and At the table;
Account is a global utility. Back/Forward and return from a detail or picker preserve valid scoped
filters, scroll, selection and drafts. Campaign membership, character assignment, inspected character
and active command actor are separate facts: an account owns many characters and joins many
campaigns, including several characters in one campaign, while a character has at most one current
campaign. DM inspection exposes the complete authorized sheet without changing the active actor,
lease, control or balances, and without exposing private notes.

## Homebrew automation and editable combat

Custom content is a first-class input to the same combat automation as official content, not a
parallel descriptive catalogue. A supported custom composition drives actions, targets, costs,
resources, effects, reactions and consequences through the shared mechanics and receipt model. The
finite authoring vocabulary is a foundation to extend as the product requires, not a ceiling on its
ambition, and a manual path never excuses a missing deterministic default for a modeled mechanic.

During play the table can change relevant combat values, resources, conditions, active effects and
results, and make contextual rulings. Changes operate on authoritative facts with visible
consequences, provenance and correction/undo, never as a decorative override over unchanged data;
permissions and the DM's final arbitration still apply. Changing an in-use copy or an encounter
effect must not silently rewrite its library template or other copies — a template or version change
is a separate explicit choice with a visible scope.

Automatic resolution and a contextual "Resolve at the table" share facts, costs, consequences,
receipts and correction. When a mechanic cannot yet be modeled, preserve it and identify the
unsupported part: the play surface provides explicit manual consequences on the same facts, costs
and receipts, without pretending to have executed that mechanic or introducing a second runtime.
Exceptions are available in creation, growth and play with no extra DM-approval queue; the three
campaign automation levels stay separate application policies under the DM's final arbitration, and
rule freedom never bypasses account or content permissions. Acceptance for the combat blocks
includes an actual custom creation used in combat, automated costs and effects, mid-combat
modification and causal correction/undo, across ordinary, boundary and composition cases — saving,
serializing or previewing one is not that proof.

**Custom IS the library.** Custom content autosaves for reuse across eleven families — weapons,
equipment/items, spells, features, monsters, subclasses, campaign rules, species, feats, backgrounds
and classes. A granted copy retains provenance and version; revocation stops future access and
updates, not an already granted copy; browsing is not a grant. Architecture owns the
recipient-materialization protocol and its access boundaries.

## Users

D&D 2024 players, from first-timers to veterans, creating, managing and playing characters digitally
— bilingual (EN + IT), offline-first PWA, dark theme only (light paper is for printing, never a
second application theme). The owner's group plays online, each on their own computer with voice
chat; the physical table is the extension. Desktop/laptop exposes the complete product (map, hotbar,
dice, encounters, preparation, authoring, character management); the phone serves quick and offline
consultation, sheet, compendium, sessions, notes and relevant updates. Touch combat and full desktop
HUD/map parity are not requirements, and the shared/TV view stays a desktop capability.
Beginner-friendly (no manual required) yet expert-capable (hints ignorable). Friends of the owner are
live users with real characters — not a hypothetical audience.

## Product Purpose

The steering above is the purpose. In product terms: a digital table that auto-computes every
D&D 2024 rule while always allowing a manual override, where a player runs an entire character
lifecycle (create, level up, play, manage a campaign) without leaving the app, and a DM runs a whole
session inside it. It is both a live table (action economy, HP, resources, initiative, map, dice,
automatic consequences) and a D&D knowledge tool (search, character understanding, progression
paths). Concretely, "Baldur's Gate 3, but for playing D&D": a full-screen map at Owlbear Rodeo's
level (image, tokens, grid, ruler, simple fog) with a BG3-style hotbar, in-app 3D dice everyone sees
(physical dice always allowed as manual input), and every consequence applied automatically with a
who/why log and undo. DM tools are an optional force-multiplier, never a requirement, and the DM
plays on the same screen: selecting a creature makes the hotbar that creature's. The app replaces
the group's external VTT; without a loaded map it still works fully from declared facts.

**BG3 behavioral fidelity is a requirement, not an atmosphere.** Combat and every transferable
interaction reproduce Baldur's Gate 3's behavior in full, with Folio's identity: HUD and hotbar,
actions, Bonus Actions and reactions, targeting, range and areas, movement, resources, dice,
consequences, and the transferable character, inventory and growth paths. Before each surface,
observe the corresponding BG3 sequence, organization and feedback, then demonstrate the Folio
counterpart through actual gestures and visual comparisons. Adopt useful capabilities from D&D
Beyond, Roll20 and Owlbear too. D&D 2024 governs the rules — BG3 rule variants are never imported —
and player freedom and the physical-dice alternative remain binding. A concrete incompatibility is
resolved with the owner using that example; never silently cut the product or ask for another
general reference interview. No new 3D world, backend, cost or privacy policy follows by
implication.

## Brand Personality

**Tactical Codex:** magical, premium, confident, alive. The product feels like a first-class fantasy
game companion built for online play and the real table: distinctive at a glance, calm under
pressure, rich where identity or consequence matters, quiet where the user is reading or deciding.
Dark graphite, warm ivory, restrained antique gold, semantic pigments, original portraits and precise
tactical iconography form the current working direction. The name describes a product quality and
interaction grammar, not a theme every surface must decorate literally.

Voice is clear and confident, plain-language for beginners, never jargon-gatekeeping, with no
marketing filler in task copy. Publicly observable interaction patterns from **D&D Beyond**
(character-sheet information architecture and density), **Roll20** (physical-table input and inline
editing) and **Baldur's Gate 3** (interaction confidence, action presentation, craft ceiling) are
benchmarks, not assets or internals to copy. D20 Folio's imagery, components and domain architecture
remain original, and visual fantasy never reduces usability during a real session.

## Anti-references

Generic flat SaaS dashboards, Material-flat surfaces, neon/cyber, corporate fintech navy-and-gold,
the warm-neutral "AI cream default", ornamental parchment everywhere, and fantasy decoration pasted
over generic forms. D20 Folio is **not** a dashboard, **not** an enterprise application, and **not**
a fantasy skin. Historical treatments such as Illuminated Folio and Gilded Reliquary are evidence,
not permanent constraints: keep one only while it remains the best expression of the current
product, and remove it when hierarchy, coherence, accessibility or interaction quality improves
without it.

## Design Principles

1. **Progressive disclosure is mandatory.** Common information is visible, summarized, easy to scan,
   available at a glance; detailed information is available on demand, never hidden behind
   unnecessary navigation. This is one of the most important principles in the product and applies
   everywhere (collapsed vs. expanded cards, pickers, DM surfaces, all of it). It serves both sides:
   the expert acts fast with no mandatory explanation in the way, and the curious beginner can
   investigate what a choice means and learn while playing.
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

WCAG AA is the floor, enforced by a self-enforcing accessibility gate across every surface in the
supported dark theme, in EN and IT — the app is axe-clean, re-checked after any token change. Every
interactive component ships default/hover/focus/active/disabled (+ loading/error where relevant)
states with a visible keyboard focus ring. All animation respects `prefers-reduced-motion` via a
single OS-driven kill-switch (no in-app animations toggle). Bilingual EN + IT for every user-visible
string. Touch targets are ≥44px on mobile; no user-facing text sits below a 10px legibility floor.
