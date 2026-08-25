# Product

## Register

product

## Users

D&D 2024 players, from first-timers to veterans, creating, managing, and playing characters
digitally — bilingual (EN + IT), offline-first PWA. Desktop and mobile expose the complete product:
desktop optimizes simultaneous context, encounter management and dense preparation; mobile
optimizes one-handed play, fast table input, reading and between-session review. Neither is a
reduced edition of the other. Beginner-friendly (no manual required) yet expert-capable (hints
ignorable). Friends of the owner are live users with real characters — this is not a hypothetical
audience.

## Product Purpose

A character manager that auto-computes every D&D 2024 rule while always allowing a manual override,
so players trust it over paper. Success = a player runs an entire character lifecycle (create, level
up, play a combat, manage a campaign) without leaving the app, and it feels premium enough to prefer
over a physical sheet. The app is both a live tabletop companion (action economy, HP, resources,
initiative/round tracking are first-class) and a D&D knowledge/discovery tool (search, character
understanding, progression paths) — both goals equally important. The app never rolls dice; players
roll physical dice, the app only logs and associates rolls with actions. DM tools are an optional
force-multiplier, never a requirement — the app owns the character/campaign-tied data layer and
complements (never replaces) a virtual tabletop like Owlbear Rodeo.

## Brand Personality

**Tactical Codex:** magical, premium, confident, alive. The product feels like a first-class fantasy
game companion built for use at a real table: distinctive at a glance, calm under pressure, rich
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
