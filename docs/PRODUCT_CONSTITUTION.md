# D20 Folio — Product Constitution

> **The supreme governance document for the D20 Folio product experience.**
> This is the "permanent project rules file" mandated by the owner. All design,
> product, and engineering work — by humans or AI agents — must be validated
> against this constitution. It takes precedence over convenience.

|                |                                                                                                                                                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**     | Active — authoritative                                                                                                                                                                                                                                                                                                                                 |
| **Version**    | 1.8                                                                                                                                                                                                                                                                                                                                                    |
| **Ratified**   | 2026-05-31                                                                                                                                                                                                                                                                                                                                             |
| **Owner**      | Salvatore Di Cara (sole owner; 100% AI-developed project)                                                                                                                                                                                                                                                                                              |
| **Precedence** | Supreme for product/UX/design + the listed engineering principles. Sits **above** convenience and above any single brief. Does not override hard project constraints in `CLAUDE.md` (zero-budget, offline-first, bilingual EN+IT, no dice, source-of-truth rules) — those remain binding and this constitution is designed to be consistent with them. |

## How to use this document

1. **Read it before any redesign, feature, or UI work.** It defines the product
   we are building and the rules every surface must obey.
2. **Validate every change against it.** **An owner request** that conflicts
   with these principles: comply but surface it explicitly (informed override,
   `docs/GOLDEN_RULES.md` → Precedence). **Your own plan or implementation**
   that conflicts: fix it — the constitution wins. Fork (d) covers only
   conflicts BETWEEN steering docs. (See _Enforcement_.)
3. **Keep it maintained.** When the owner ratifies a new product-level decision,
   record it here (bump the version + add a dated note under _Amendments_).
4. **When in doubt**, prioritize: usability, consistency, discoverability,
   immersion, and long-term maintainability.

---

## 1. Product Vision

**Users:** D&D 2024 players, from first-timers to veterans — creating, managing, and playing
characters digitally. Bilingual (EN + IT), offline-first PWA. Desktop is the primary in-session
surface; mobile is for between-session adding and reviewing. Beginner-friendly (no manual required)
yet expert-capable (hints ignorable).

**Purpose:** A character manager that auto-computes every D&D 2024 rule while always allowing a
manual override, so players trust it over paper. Success = a player runs an entire character
lifecycle (create, level up, play a combat, manage a campaign) without leaving the app, and it
feels premium enough to prefer.

**Brand personality:** Scholarly, tactile, heirloom. The product reads like a beautifully bound
spellbook or folio brought to candlelight: struck-gold accents and engraved Cinzel titling over
translucent leather panels, carved and embossed depth, real material weight. The dark flagship glows
over owner-generated atmospheric art (painted darkness), with champlevé enamel accents lighting the
moments that matter. Warm and premium, never a flat utility dashboard. Voice is clear and confident,
plain-language for beginners, never jargon-gatekeeping.

**Visual inspirations** (not clones — the illuminated-folio struck-gold identity is the
through-line):

- **D&D Beyond** — the benchmark for D&D character-sheet IA and data density.
- **Baldur's Gate 3 menus** — the craft / "wow" bar, and since 2026-07-16 an owner-ratified
  mandate to reach it at FULL fidelity across the whole app (menus, navigation, panels, dialogs,
  chrome, ornament, hero surfaces). The owner's verbatim bar: _"It has to be woooooow. Users have
  to go: woooow man this is so professional and curated, it's even better than DND Beyond!"_ The
  shipped material world (candlelit gilded framing, translucent leather panels over painted
  darkness, champlevé enamel, crisp readable typographic hierarchy) is the base; the **Gilded
  Reliquary** grammar (worked-gold corner goldwork on earned hero frames, engraved ceremonial
  titling, tapered ceremony rules, candle-smoke panel depth — `DESIGN.md` §5) is the first shipped
  wave of the full-fidelity push. The light theme lives as the daylight sibling of the SAME
  grammar (engraved bronze goldwork, letterpress titling, morning-shade depth) — designed, never
  adapted; dark stays the flagship.

**Anti-references:** Generic flat SaaS dashboards (Linear/Notion gray-on-white), Material-flat,
neon/cyber, corporate fintech navy-and-gold. The candlelit struck-gold identity is **deliberate and
committed** — do not flatten or strip it in the name of "modern minimalism."

D20 Folio is **NOT** a dashboard.
D20 Folio is **NOT** an enterprise application.
D20 Folio is **NOT** a fantasy skin applied to forms.

D20 Folio should feel like a **premium fantasy artifact.**

The application should feel like a place users **WANT** to spend time in — browsing spells,
discovering feats, planning character growth, reading campaign history, exploring world lore.

The app should feel: **magical · immersive · premium · alive · cohesive.**

**However: visual fantasy must NEVER reduce usability.** The application is still
used during real tabletop sessions.

---

## 2. Critical Gameplay Principles

The application is both:

1. A **live tabletop companion.**
2. A **D&D knowledge and discovery tool.**

Both goals are **equally important.**

### 2.1 Action Economy Is A First-Class Feature

The application must help users answer:

- What can I still do this turn?
- What have I already spent?
- What actions are available right now?
- Which abilities compete for the same action type?

The action economy system is a **core product feature. Preserve and improve it.**

Round tracking and initiative tracking are foundational gameplay tools.

### 2.2 No Dice Rolling

The application does **NOT** roll dice. Players roll physical dice.

**Allowed:** roll logging · roll history · associating rolls with actions.

**Not allowed:** RNG systems · virtual dice · dice animations · automated rolling.

### 2.3 Progressive Disclosure Is Mandatory

This is one of the most important principles in the product.

**Common information** should be: visible · summarized · easy to scan · available
at a glance.

**Detailed information** should be: available on demand · expandable ·
discoverable · **never hidden behind unnecessary navigation.**

Example — collapsed spell card:
name · level · action type · concentration · tags · damage · damage type · range
· save · duration.

Example — expanded spell card:
full description · scaling · interactions · notes.

**The same principle applies everywhere.**

### 2.4 Character Understanding

The application should help users understand:

- what their character can do now
- what their character could do next
- how abilities interact
- available upgrades
- future progression paths

The application should **encourage exploration and learning.**

### 2.5 Search & Discovery

Search is a **core product feature.** It should help users answer questions such
as:

- What bonus actions do I currently have?
- What reactions do I have available?
- Which spells require concentration?
- Which features improve survivability?
- What abilities consume this resource?
- What can my character learn next level?

Search should support: character content · spells · feats · equipment · class
features · campaign content · future content types.

**Search should feel like discovery, not database querying.**

### 2.6 Resource Awareness

The application should make resources obvious: spell slots · charges ·
limited-use abilities · class resources · consumables.

Resource state should be easy to understand and update.

### 2.7 Choosing Is Sacred — The Picker Doctrine

Character choices (feats, spells, skills, equipment, subclass options) are the moments players
care about most. Every picker in the product — wizard or cockpit — obeys four ratified rules
(owner, 2026-06-10 → 2026-06-12; recipes in `DESIGN.md` §5):

1. **Read-then-choose.** Browsing never commits. A tap on an option with prose unfolds its
   reading spread in place; only an explicit act (Choose / Learn) commits. Releasing a choice is
   an in-place undo on the same row ("Remove choice"), never a separate flow. Options that are
   pure facts (a skill, a tool, a language — nothing to read) commit directly on tap.
2. **Detail on SELECTED only.** No per-row info affordances (ⓘ buttons, hover previews) in a
   pool list — reading happens on the row itself. The deeper full read view (the shared
   compendium detail) is offered only on an already-picked row.
3. **Never state met preconditions.** Surface only what blocks or what asks. An option whose
   prerequisites the character does not meet is **filtered out of the offered pool, never greyed
   out** (RAW-illegal options are not options); a satisfied prerequisite is never announced.
   Homebrew overrides live in the cockpit, not in the on-rails wizards. **When filtering hides an
   entire CATEGORY a user would expect (e.g. most classes in the multiclass fork), the absence
   carries a one-line cause** — quiet, in the surface's register, the per-option detail behind
   progressive disclosure; the hidden options stay filtered, never greyed.
4. **Cascades expand under their visible cause.** When a choice spawns follow-up choices (a feat
   that asks for a skill, a spell), the follow-ups expand inline beneath the choice that caused
   them, visibly attributed to it — never on a detached page or modal.

### 2.8 Play Never Requires Edit Mode

**Anything a player does DURING a session is doable without entering edit mode** (owner,
2026-06-12). Edit mode is for the BUILD (scores, features, lore); session-time state mutates in
place with the quiet status register. Example: defenses change in play (a Potion of Fire
Resistance, a curse) — they are added/removed as session-scoped chips right in the cockpit
Defenses section, exactly like conditions, never by editing the build's permanent defenses.

### 2.9 DM Tools Are An Optional Force-Multiplier

The DM toolkit is a **plus, never a requirement** (owner, 2026-06-27). A DM can ignore every DM tool
and the app still works fully for every player — nothing about running a game is gated behind them.
The bar is the opposite of mandatory: make the tools so **captivating and low-friction** that a DM
_wants_ them, because they make the DM's job easier **and** the players' experience better.

- **The app complements the virtual tabletop; it does not replace it.** The owner's table plays on
  Owlbear Rodeo (a VTT), and the app must also serve a purely **in-person table**. So the app owns
  the **character- and campaign-tied layer** — real HP, conditions, resources, derived stats, the
  initiative/round bookkeeping tied to the actual sheets — and does **NOT** build a battle map, token
  grid, or anything a VTT already owns. Nothing may assume a VTT is present.
- **The headline DM need is one convenient place for all the useful team info + stats** — at a
  glance, the things a DM constantly asks the table for: each PC's AC, HP, passive Perception (and
  Insight/Investigation), saving-throw bonuses, senses (e.g. darkvision), speed, key resources, and
  active conditions. Compute these **live from the players' real character sheets** (single source of
  truth, §5) — never a denormalized copy that can drift.
- **The core principles still hold — progressive disclosure above all (§2.3).** A DM surface must
  never become an info dump: show the common at-a-glance, make everything else easily and intuitively
  **discoverable on demand**, and **dismissable** when not needed. Optimal interaction is crucial; a
  dense screen of every stat at once is a failure, not thoroughness (§4 — only and all the necessary).

---

## 3. Mobile Philosophy

Mobile is **NOT** a reduced afterthought. Desktop and mobile serve **different
purposes.**

**Desktop** is optimized for: active gameplay · combat · management · multitasking.

**Mobile** is optimized for: studying the character · reading abilities · reading
spells · campaign review · lore browsing · quick updates · between-session usage.

Mobile should feel **equally premium and intentional.**

**Do NOT simply collapse desktop layouts onto mobile. Design mobile experiences
deliberately.**

> Shorthand: **desktop-first gameplay, mobile-first exploration.**

---

## 4. Core Design Principles

1. UX over implementation complexity.
2. Information architecture before visual design.
3. User workflows before components.
4. Consistency over novelty.
5. Reusable systems over one-off screens.
6. Progressive disclosure over clutter.
7. Beauty and immersion without sacrificing speed.
8. A small number of highly reusable UI patterns used everywhere.
9. No business logic inside UI components.
10. Strong separation of concerns.
11. Theme and visual identity must be independent from application logic.
12. Every new feature must feel like it belongs to the same product.
13. Favor learning and discoverability alongside gameplay efficiency.
14. Desktop-first gameplay, mobile-first exploration.
15. Only and all the necessary: every element on a surface must earn its place — the canonical
    statement is golden rule 19 (`docs/GOLDEN_RULES.md`); detail belongs behind progressive
    disclosure (principle 6 above). (Owner directive, 2026-06-09.)
16. The register rule: premium visual registers (the hero altar, the carved cartouche, the
    lit-socket, gold-thread separators, gilt frames) are **earned by information, never spent on
    decoration**. A surface receives an elevated register because it carries a decision the player
    is making or live state they must read — the corollary of principle 15 for visual weight.
    (Owner-ratified across the wizard/cockpit campaign, 2026-06-11/12; recipe ladder in
    `DESIGN.md` §5.)
17. No truncation: identity text is never mid-string ellipsized — swap to a shorter true form at a
    breakpoint instead. (Owner, 2026-06-12: "truncations are a sign of unprofessionality." Full
    rule + canonical examples in `DESIGN.md` §3, the No-Truncation Rule.)

---

## 5. Engineering Principles (Non-Negotiable)

- UI is presentation only.
- Business logic must not live in UI components.
- State management must be separated from rendering.
- Domain logic must be isolated.
- Shared primitives must be preferred over custom one-off components.
- New features must reuse existing interaction systems whenever possible.
- Wizards, dialogs, cards, searches, navigation, and overlays must be systemized.
- Architecture quality is more important than implementation speed.

> These reinforce the grant-seam architecture — the canonical statements are
> `CLAUDE.md` → "The architecture in one breath", `docs/ARCHITECTURE.md`, and
> golden rule 5 (`docs/GOLDEN_RULES.md`).

---

## 6. Product Scope

The design system must support:

- Welcome page
- Roster
- Character sheet
- Character creation
- Spell management
- Feature management
- Equipment management
- Campaign manager
- DM panel
- Compendium
- Notes
- Lore
- Settings
- Admin panel
- **Future modules not yet designed**

**Do NOT optimize only for the character sheet. Design a system capable of
supporting the entire product ecosystem.**

> All of the above are BUILT (single-user foundation, campaigns/party/DM tools,
> compendium, admin). The command stands for every FUTURE module: the design
> system must admit it without re-architecture.

---

## 7. Consistency Rules

- No screen may invent its own interaction patterns.
- No wizard may behave differently from other wizards.
- No modal may behave differently from other modals.
- No page may introduce a new design language.
- No future feature may bypass the shared design system.

**The application must feel as if it was designed by a single team with a single
vision.**

---

## 8. Enforcement

- This is the permanent project rules file. **Maintain it.**
- **All future work must be validated against this constitution.**
- **Future agents must follow this constitution.**
- A request that conflicts with these principles: **surface the conflict** per
  the informed-override clause (`docs/GOLDEN_RULES.md` → Precedence) — the
  owner's live word wins, knowingly. Fork (d) covers only conflicts BETWEEN
  steering docs, never the owner's live word.
- The constitution takes precedence over convenience.

**When in doubt:** prioritize usability, consistency, discoverability, immersion,
and long-term maintainability.

---

## Amendments

| Date       | Version | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-31 | 1.0     | Ratified from owner directive. Initial constitution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-06-09 | 1.1     | Added §4 principle 15: "Only and all the necessary" — every element must earn its place.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-06-12 | 1.2     | Canonized the campaign rulings: §2.7 Picker Doctrine (read-then-choose · detail-on-selected · never state met preconditions · cascade-under-cause); §4 principles 16 (the register rule) + 17 (no truncation).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-06-12 | 1.3     | Refined §2.7.3: a filtered absence that hides an entire expected category carries a one-line cause (quiet, detail behind progressive disclosure) — the MC-CAUSE ruling from the multiclass-fork incident.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-06-27 | 1.4     | Added §2.9 DM Tools Are An Optional Force-Multiplier: optional-never-mandatory + captivating; complements the VTT (Owlbear) + the in-person table, no battle map; one convenient pane of live team stats; progressive disclosure (no info dump).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-07-02 | 1.5     | The 2026-05-31 from-first-principles exploration process this doc originally mandated COMPLETED and its process sections were retired (see the note below); §6 phase note updated to built reality; enforcement + §4.15 + §5 now point at their canonical homes in `docs/GOLDEN_RULES.md` / `CLAUDE.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-07-03 | 1.6     | The BG3-grade identity evolution ratified (owner-directed): the illuminated folio evolved to its candlelit struck-gold form — the dark flagship renders struck gold and engraved Cinzel titling over translucent leather panels on owner-generated atmospheric art, with champlevé enamel accents, the cream special-ink tier, and warm-black neutrals. §1 Brand personality / Visual inspirations / Anti-references rewritten to the current material world; the light theme's rebuild to full parity is scheduled as its own phase (`PROGRESS.md`).                                                                                                                                                                                                                                                                                                |
| 2026-07-16 | 1.8     | The FULL-BG3 fidelity push ratified (owner): the whole app must evoke Baldur's Gate 3's menu craft at full fidelity — an owner-ratified informed override superseding the "Ember Penumbra" / "Daylight Sibling Plates" directions as the ceiling (their shipped work remains the base). §1 Visual inspirations updated with the mandate, the owner's verbatim bar, and the first shipped wave (the **Gilded Reliquary** frame grammar: reliquary corner goldwork on the three earned hero frames, engraved ceremonial titling, the tapered modal seat rule, panel smoke/morning-shade — `DESIGN.md` §5). Light theme = the daylight sibling of the new grammar, designed never adapted; dark stays flagship. Art regeneration rides the owner's ChatGPT pipeline (the batch-4 precision prompt doc, delivered 2026-07-16); nothing blocks on assets. |
| 2026-07-06 | 1.7     | AI assistant DROPPED (owner-ratified). The long-carried "Phase-3 multi-provider AI assistant" is removed from the roadmap entirely: the deterministic engine is the product's intelligence, and an LLM conflicts with rules-correctness (hallucination risk), zero-budget (API cost / BYOK friction), and offline-first (needs network). A narrow BYOK narrative-only variant was considered and also declined. §6's module note de-references its surfaces; decision recorded in `PROGRESS.md` → _Open decisions_.                                                                                                                                                                                                                                                                                                                                  |

---

> **Origin.** This constitution ratified a 2026-05-31 from-first-principles product exploration;
> that process completed — the owner selected **"Illuminated Folio, Evolved"**, froze the identity,
> and the redesign shipped. The living design system of record is `DESIGN.md` (+ the canonical
> tokens in `src/index.css` / `src/styles/folio.css`).
