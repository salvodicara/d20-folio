# Product

## Register

product

## Users

D&D 2024 players, from first-timers to veterans, creating, managing, and playing characters
digitally — bilingual (EN + IT), offline-first PWA. Desktop is the primary in-session surface
(active gameplay, combat, management); mobile is for between-session review and quick updates
(studying the character, reading spells/abilities, campaign review, lore browsing). Beginner-friendly
(no manual required) yet expert-capable (hints ignorable). Friends of the owner are live users with
real characters — this is not a hypothetical audience.

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

Scholarly, tactile, heirloom. Three words: **magical · premium · alive.** The product reads like a
beautifully bound spellbook or folio brought to candlelight: struck-gold accents and engraved Cinzel
titling over translucent leather panels, carved and embossed depth, real material weight — the dark
flagship glows over owner-generated atmospheric art (painted darkness), with champlevé enamel
accents. A premium fantasy artifact, not a fantasy skin applied to forms. Voice is clear and
confident, plain-language for beginners, never jargon-gatekeeping, no em dashes or marketing
buzzwords in UI copy. Visual inspirations (not clones — the illuminated-folio struck-gold identity is
the through-line): **D&D Beyond** (the benchmark for character-sheet information architecture and
data density) and **Baldur's Gate 3 menus** (the craft / "wow on sight" bar — an owner-ratified
FULL-fidelity mandate since 2026-07-16: candlelit gilded framing, translucent leather over painted
darkness, champlevé enamel, crisp readable typographic hierarchy, and the Gilded Reliquary frame
grammar — worked-gold corner goldwork on earned hero frames, engraved ceremonial titling; light is
the daylight sibling of the same grammar). Visual fantasy must never reduce usability — the app is
still used during real tabletop sessions.

## Anti-references

Generic flat SaaS dashboards (Linear/Notion gray-on-white), Material-flat surfaces, neon/cyber, and
corporate fintech navy-and-gold. Also explicitly rejected: the lazy warm-neutral "AI cream default" —
the candlelit struck-gold world here is a deliberate, committed identity (translucent leather panels
over atmospheric art, struck-gold accents, engraved serif type, carved depth), never an accidental
tinted near-white body. D20 Folio is **not** a dashboard, **not** an enterprise application, and
**not** a fantasy skin over plain forms. The candlelit struck-gold skeuomorphism is a deliberate,
committed identity (golden rule / DESIGN.md §8's Identity Guard) — no review, audit, or design pass
ever flattens, de-parchments, or "modernizes away" the folio look in the name of "modern minimalism."

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
5. **Desktop-first gameplay, mobile-first exploration.** Desktop and mobile serve different purposes
   and are each designed deliberately — mobile is never a collapsed desktop layout.
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
