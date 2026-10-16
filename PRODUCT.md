# Product

## Register

product

## Users

Beginners everywhere, Italian and international: players in their first campaigns and first-time
DMs, at a real table or next to Owlbear and other VTTs (product brief, 2026-10-16). Expert-capable:
hints are ignorable and every value can be overridden. Multilingual by design (EN + IT today), offline-first PWA.
Desktop and mobile expose the complete product: desktop optimizes simultaneous context, encounter
management and preparation; mobile optimizes one-handed play, fast table input, reading and
between-session review. Neither is a reduced edition of the other. The owner's two groups are live
users with real characters.

## Product Purpose

"Roll your own dice: Folio does the maths, explains every number and writes the session report."
(IT: «Tira i tuoi dadi: Folio fa i conti, ti spiega ogni numero e scrive il resoconto della
sessione.») The engine computes every D&D 2024 rule it models, always with a manual override; the
player declares with one tap; every number opens into its sources; the session log becomes a
deterministic report. Folio never rolls dice and is never a VTT. Success = a beginner runs a whole
character lifecycle and a session without leaving the app, and understands why each number is what
it is. Decisions behind this: `docs/strategy/2026-10-16-product-brief.md`.

## Brand Personality

**Direction B, "BG3 fantasy ricco"** (owner, 2026-10-16; approved as a direction, each screen still
needs the owner's yes): magical, premium, confident, legible. Dark stone, gold leaf, engraved Cinzel
capitals for titles, names, label capitals and big figures; Alegreya for every reading line, never
below 14px. One gold-leaf lit action per screen (End Turn on Play). One colour per action type:
Action ember, Bonus teal, Reaction violet, Movement green. The inset bronze/gold frame is the only
panel ornament; no painting behind text; a round portrait medallion; every number opens its
breakdown on tap. Legibility for beginners comes before ornament. The visual system of record is
`DESIGN.md`.

Voice is clear and confident, plain-language for beginners, never jargon-gatekeeping, with no
marketing filler in task copy. Publicly observable interaction patterns from **D&D Beyond**
(character-sheet information architecture and density), **Foundry dnd5e** and **Roll20**
(physical-table input and inline editing) and **Baldur's Gate 3** (interaction confidence, action
presentation and craft ceiling) are benchmarks, never assets to copy. Folio's imagery, components
and domain architecture stay original.

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
