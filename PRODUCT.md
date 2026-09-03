# Product

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

**Self-contained.** Everyone at the table, players and DM, must be able to do anything related to
their D&D game without another tool: not only the sheet, the map, the dice and the rules, but the
session notes and recap, the campaign chronicle of everything that happened, the next-session date
in a shared calendar, NPCs, places, loot and party gold, handouts and images, homebrew — what the
group already does today plus the jobs D&D communities most often reach external tools for. The
list of jobs is kept in the Jobs table below and grows from evidence, never from guesses.

**What it is not.** No 3D and no character animation (maps and tokens, Owlbear-level). No AI
narrator or assistant. No chat and no voice (Discord or the table; the app keeps only the game
log). D&D 2024 only; existing 2014 characters migrate.

**The line on automation.** Default is BG3: the app resolves everything and logs who did what.
The DM always has the last word and can modify, undo and customise everything simply. The DM
picks one of three campaign levels — full auto, propose-and-confirm, log only — and can change it
mid-session; dice mode is a per-person choice.

**First milestone.** One whole session of the group without opening Owlbear, D&D Beyond or a
calculator.

**Delivery posture.** Production keeps working as it is and the group keeps playing with it. The
new app grows in a separate long-lived branch and worktree and is released only when the
milestone is reached; `main` receives production fixes only. A staging environment (separate
Firebase project on the free tier, staging hosting, the six team fixtures seeded, emulators in
CI) is mandatory until release. Approved cuts for the new branch: the character-only mechanics
kernel and its tests, the agent program supervisor and the superseded plans, the five sheet modes
and three combat executors (rebuilt as one sheet and one hotbar), and the old visual atlases as
authority. Salvage the automation knowledge (typed data, coverage, grants).

**Acceptance stories.** (1) Marco, a beginner, plays his first turn: moves, casts Fireball on three
goblins, everything is resolved and logged. (2) Sara the DM runs an ogre ambush: tokens, fog,
hidden rolls, the monsters' actions, an overridden result, a homebrew sword. (3) The group between
sessions: level-up, spell preparation, rules lookup, campaign journal. (4) The group across the
campaign: the DM writes the session notes and the recap in the app, the next session is agreed
and saved to the shared calendar, the chronicle holds everything that happened, NPCs and places
are looked up, loot and gold are split, a handout is shown — nobody opens another tool. A feature
that serves none of the four is superfluous.

**Jobs the app must cover (evidence-ranked; extended from community research, 2026-09).**

| Job                                                                            | Who         | When           | Today                       |
| ------------------------------------------------------------------------------ | ----------- | -------------- | --------------------------- |
| Play a turn: move, act, roll, consequences, undo                               | players, DM | during         | app + Owlbear + mental math |
| Run the table: map, tokens, fog, initiative, monsters, hidden rolls, overrides | DM          | during         | Owlbear + app + paper       |
| Sheet, level-up, spell preparation, inventory                                  | players     | between        | app                         |
| Rules and content lookup with plain explanations                               | everyone    | always         | app + D&D Beyond            |
| Session notes and recap                                                        | DM, players | during, after  | external notes              |
| Chronicle of everything that happened                                          | everyone    | across         | app (partial)               |
| Next session date, attendance, shared calendar                                 | everyone    | across         | chat + calendar             |
| NPCs, places, factions, lore                                                   | DM, players | across         | external wiki               |
| Loot, party gold, party inventory                                              | players, DM | after, between | sheet + chat                |
| Handouts and images                                                            | DM          | during         | chat                        |
| Homebrew: monsters, items, spells, rules                                       | DM          | between        | external editors            |
| Encounter building and difficulty                                              | DM          | between        | app                         |

**Open decision.** The name: "d20 Folio" says "sheet" more than "table"; keep it, decide before any
public release.

## Users

D&D 2024 players, from first-timers to veterans, creating, managing, and playing characters
digitally — bilingual (EN + IT), offline-first PWA. The owner's group plays online, each on their
own computer with voice chat; the physical table is the extension. Desktop and mobile expose the
complete product: desktop is the primary play surface (map, hotbar, dice, encounter management,
dense preparation); mobile is the second screen and the between-session device (sheet, hotbar,
dice, fast input, reading and review). Neither is a
reduced edition of the other. Beginner-friendly (no manual required) yet expert-capable (hints
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
   filtered out, not greyed), cascading choices expand under their visible cause.
5. **Capability parity, purpose-built composition.** Desktop and mobile expose the same product
   capabilities through deliberately different compositions — mobile is never a collapsed desktop
   layout and desktop is never a stretched phone layout.
6. **Consistency over novelty; reusable systems over one-off screens.** A small number of highly
   reusable UI patterns used everywhere; a bespoke restyle of an existing job is a defect.
7. **No truncation.** Identity text is never mid-string ellipsized — swap to a shorter true form at a
   breakpoint, or wrap, instead.

## Accessibility & Inclusion

WCAG AA is the floor, enforced by a self-enforcing gate (`tests/e2e/a11y.spec.ts`) across every
surface in both dark and light themes — the app is axe-clean, re-checked after any token change.
Every interactive component ships default/hover/focus/active/disabled (+ loading/error where
relevant) states with a visible keyboard focus ring. All animation respects `prefers-reduced-motion`
via a single OS-driven kill-switch (no in-app animations toggle). Bilingual EN + IT for every
user-visible string — no English-only strings ship. Touch targets are ≥44px on mobile. No user-facing
text below a 10px legibility floor.
