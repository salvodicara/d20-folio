# D20 Folio — Product Constitution

> **The supreme governance document for the D20 Folio product experience.**
> This is the "permanent project rules file" mandated by the owner. All design,
> product, and engineering work — by humans or AI agents — must be validated
> against this constitution. It takes precedence over convenience.

|               |                                                                                                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**    | Active — authoritative                                                                                                                                                                                                                                                      |
| **Version**   | 2.2                                                                                                                                                                                                                                                                         |
| **Ratified**  | 2026-08-25                                                                                                                                                                                                                                                                  |
| **Owner**     | Salvatore Di Cara (sole owner; 100% AI-developed project)                                                                                                                                                                                                                   |
| **Authority** | Owns durable product/UX/design intent and the listed engineering principles. It works with the repository invariants in `docs/GOLDEN_RULES.md`; conflicts are reconciled through that document's evidence-based authority model, not by assuming either file is infallible. |

## How to use this document

1. **Read it before any redesign, feature, or UI work.** It defines the product
   we are building and the rules every surface must obey.
2. **Validate every change against it.** **An owner request** that conflicts
   with these principles: comply but surface it explicitly (informed override,
   `docs/GOLDEN_RULES.md` → _Authority and reconciliation_). **Your own plan or
   implementation** that conflicts: fix it unless current evidence shows this
   document has drifted, in which case reconcile the owning rule first. (See
   _Enforcement_.)
3. **Keep it maintained.** When the owner ratifies a new product-level decision,
   record it here (bump the version + add a dated note under _Amendments_).
4. **When in doubt**, prioritize: usability, consistency, discoverability,
   immersion, and long-term maintainability.

---

## 1. Product Vision

**Users:** D&D 2024 players, from first-timers to veterans — creating, managing, and playing
characters digitally. Bilingual (EN + IT), offline-first PWA. Desktop and mobile expose the complete
product: desktop is the primary play surface (the owner's group plays online, each on their own
computer with voice chat; the physical table is the extension) and optimizes simultaneous context
and encounter management; mobile optimizes one-handed play as a second screen, fast input, reading
and review. Neither is a reduced edition of the other. Beginner-friendly (no manual required) yet expert-capable (hints ignorable).

**Purpose (steering, owner 2026-09-03; the full steering lives in `PRODUCT.md` and outranks this
document where they differ):** a digital table where the app does the math and the rules the way
Baldur's Gate 3's engine does, the people do the story, and the DM can change anything. The
definitive tool for playing D&D 2024, complete and depending on nothing else, for remote groups and
the physical table. It is not a 3D game, not an AI narrator, not a chat, and not a multi-system
engine. It is self-contained: players and DM do everything related to their game in the app —
notes, recap, chronicle, shared calendar, NPCs and places, loot, handouts, homebrew — never in
another tool. Default automation is BG3's; the DM always has the last word (three campaign levels:
full auto, propose-and-confirm, log only). First milestone: one whole session of the group without
opening Owlbear, D&D Beyond or a calculator. Production keeps working; the new app grows in a
separate branch with a staging environment until the milestone is reached.

**Brand personality:** **Tactical Codex** — magical, premium, confident, alive. The product feels
like a first-class fantasy game companion built for online play and the real table: distinctive at a glance, calm
under pressure, rich where identity or consequence matters, and quiet where the user is reading or
deciding. Dark graphite, warm ivory, restrained antique gold, semantic pigments, original portraits
and precise tactical iconography form the current working direction. Voice is clear and confident,
plain-language for beginners, never jargon-gatekeeping.

**Visual and interaction benchmarks** (public behavior to study, never proprietary internals or
assets to copy):

- **D&D Beyond** — character-sheet information architecture and useful density.
- **Roll20** — support for physical-table input, resources and contextual inline editing.
- **Baldur's Gate 3** — interaction confidence, action presentation, feedback and craft ceiling.

D20 Folio remains original. Historical treatments such as Illuminated Folio, Gilded Reliquary and
Worked Bronze are not constitutional constraints; they are retained only where they remain the best
solution. A new direction is valid only when it is applied coherently across the whole product rather
than exposed as a permanent hybrid.

**Anti-references:** Generic flat SaaS dashboards, Material-flat surfaces, neon/cyber, corporate
fintech navy-and-gold, the warm-neutral "AI cream default", parchment everywhere, and fantasy
decoration pasted over generic forms.

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

### 2.2 Dice: In-App By Default, External Always Allowed

The application rolls dice (owner, 2026-09-03; this reverses the v1.0 "no dice" rule). Rolls are
in-app by default with a shared 3D animation every participant sees, like Owlbear Rodeo's dice; each
user may instead enter the result of physical dice, and the DM may roll hidden. Every roll is an
encounter-log action with its formula, its result, who rolled and how (`app | manual`), so a
result is always reviewable and correctable. Deterministic effects still apply with undo; rolled
effects apply from the roll as soon as it exists, from either source.

**Allowed:** app rolls with visible formulas · manual entry · hidden DM rolls · roll history.

**Not allowed:** rolling without a logged formula · hiding a player's own roll from them ·
making manual entry harder than the app roll.

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

- **The app is the table, including the map** (owner, 2026-09-03; reverses the v1.4 line). The
  owner's group played on Owlbear Rodeo for the map and here for the data; doing both twice is the
  problem to remove. The app therefore owns a built-in map at Owlbear's level — background image,
  tokens, grid, ruler, simple manual fog, scenes, hidden tokens, drawing and pointer — with no walls,
  dynamic vision or lighting, and the DM can do on it everything Owlbear allows today. The play
  screen is a Baldur's Gate 3-style HUD over that map: the acting creature's hotbar at the bottom,
  the initiative strip on top, the sheet opened on demand; the DM selects a creature and the hotbar
  becomes that creature's. The map remains optional: a purely **in-person table** and a session
  without a loaded map keep working with declared facts.
- **What the map sees is derived; the rest is declared.** With a map loaded, the engine derives
  position, distance, reach, movement events (an opportunity attack trigger) and area membership
  from token positions; cover, most visibility and elevation stay declared. Every position fact
  carries its provenance (`declared | derived`). Once facts exist, every consequence determined by
  modeled rules and data is the engine's responsibility: apply it, log it with who and why, and keep
  a clear undo and correction for rulings and homebrew (the DM or anyone may fix afterwards). Being
  overridable never excuses a missing deterministic default. Homebrew is authored through guided,
  typed forms the engine enforces, never through prose the table must remember.
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

**Desktop** is optimized for: active gameplay · combat · management · multitasking · preparation.

**Mobile** is optimized for: one-handed active play as a second screen (sheet, hotbar, dice) ·
fast table facts and physical-roll input ·
character actions · reading abilities and spells · campaign coordination · lore browsing · quick
updates · between-session usage.

Mobile should feel **equally premium and intentional.**

**Do NOT simply collapse desktop layouts onto mobile. Design mobile experiences
deliberately.**

> Shorthand: **complete capability, purpose-built composition.**

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
  the informed-override clause (`docs/GOLDEN_RULES.md` → _Authority and
  reconciliation_) — the owner's live word wins knowingly when safe.
- The constitution takes precedence over convenience.

**When in doubt:** prioritize usability, consistency, discoverability, immersion,
and long-term maintainability.

---

## Amendments

| Date       | Version | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-31 | 1.0     | Ratified from owner directive. Initial constitution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-06-09 | 1.1     | Added §4 principle 15: "Only and all the necessary" — every element must earn its place.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-06-12 | 1.2     | Canonized the campaign rulings: §2.7 Picker Doctrine (read-then-choose · detail-on-selected · never state met preconditions · cascade-under-cause); §4 principles 16 (the register rule) + 17 (no truncation).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-06-12 | 1.3     | Refined §2.7.3: a filtered absence that hides an entire expected category carries a one-line cause (quiet, detail behind progressive disclosure) — the MC-CAUSE ruling from the multiclass-fork incident.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-06-27 | 1.4     | Added §2.9 DM Tools Are An Optional Force-Multiplier: optional-never-mandatory + captivating; complements the VTT (Owlbear) + the in-person table, no battle map; one convenient pane of live team stats; progressive disclosure (no info dump).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-07-02 | 1.5     | The 2026-05-31 from-first-principles exploration process this doc originally mandated COMPLETED and its process sections were retired (see the note below); §6 phase note updated to built reality; enforcement + §4.15 + §5 now point at their canonical homes in `docs/GOLDEN_RULES.md` / `CLAUDE.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-07-03 | 1.6     | The BG3-grade identity evolution ratified (owner-directed): the illuminated folio evolved to its candlelit struck-gold form — the dark flagship renders struck gold and engraved Cinzel titling over translucent leather panels on owner-generated atmospheric art, with champlevé enamel accents, the cream special-ink tier, and warm-black neutrals. §1 Brand personality / Visual inspirations / Anti-references rewritten to the current material world; the light theme's rebuild to full parity is scheduled as its own phase (`PROGRESS.md`).                                                                                                                                                                                                                                                                                                             |
| 2026-07-16 | 1.8     | The FULL-BG3 fidelity push ratified (owner): the whole app must evoke Baldur's Gate 3's menu craft at full fidelity — an owner-ratified informed override superseding the "Ember Penumbra" / "Daylight Sibling Plates" directions as the ceiling (their shipped work remains the base). §1 Visual inspirations updated with the mandate, the owner's verbatim bar, and the first shipped wave (the **Gilded Reliquary** frame grammar: reliquary corner goldwork on the three earned hero frames, engraved ceremonial titling, the tapered modal seat rule, panel smoke/morning-shade — `DESIGN.md` §5). Light theme = the daylight sibling of the new grammar, designed never adapted; dark stays flagship. Art regeneration rides the owner's ChatGPT pipeline (the batch-4 precision prompt doc, delivered 2026-07-16); nothing blocks on assets.              |
| 2026-08-03 | 1.9     | Ratified the combat observability boundary: the table declares facts the app cannot observe; the engine resolves every deterministic consequence from modeled rules and data; the user can always review, override, and reverse the result for rulings and homebrew. Override-ability never excuses a missing deterministic default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-25 | 2.0     | Ratified the automation-first product reset and removed permanent authority from historical visual treatments. The product must converge on one deterministic command engine, one canonical owner per fact, one coherent app-wide interaction and visual grammar, and a screenshot/motion-approved atlas covering every real capability, role, state and breakpoint. Desktop and mobile have complete capability through purpose-built composition. Session planning and typed, versioned homebrew become first-class product capabilities. Tactical Codex is the working visual direction; D&D Beyond, Roll20 and Baldur's Gate 3 remain public interaction benchmarks, never sources of copied assets or invented proprietary architecture.                                                                                                                     |
| 2026-07-06 | 1.7     | AI assistant DROPPED (owner-ratified). The long-carried "Phase-3 multi-provider AI assistant" is removed from the roadmap entirely: the deterministic engine is the product's intelligence, and an LLM conflicts with rules-correctness (hallucination risk), zero-budget (API cost / BYOK friction), and offline-first (needs network). A narrow BYOK narrative-only variant was considered and also declined. §6's module note de-references its surfaces; decision recorded in `PROGRESS.md` → _Open decisions_.                                                                                                                                                                                                                                                                                                                                               |
| 2026-09-03 | 2.1     | Owner-ratified pivot (grill of 2026-09-03): online play is the primary use case (physical table = extension); §2.2 reversed — dice roll in-app by default with a shared 3D animation, manual entry and hidden DM rolls allowed, every roll logged with formula and provenance; §2.9 reversed — the app owns a built-in Owlbear-level map (image, tokens, grid, ruler, simple fog, scenes, hidden tokens, drawing, pointer; no walls/vision/lighting) with a BG3-style HUD play screen shared by players and DM; map-derived facts (`derived`) join declared facts (`declared`); consequences apply automatically with a who/why log and undo; homebrew through enforced typed forms; map storage within the free tier with per-campaign quotas; staged, screenshot-gated rollout. Design authority: `docs/superpowers/specs/2026-09-03-ui-redesign-design.md` §1. |
| 2026-09-03 | 2.2     | Steering ratified (owner, afternoon grill with concrete examples): purpose sentence, for whom (the group first, public later), the ambition (definitive tool, remote and table, adapting to tastes), what it is not (no 3D, no AI, no chat/voice, 2024 only), the automation line (BG3 default, DM last word, three campaign levels, per-person dice), first milestone (a whole session in-app), delivery posture (production untouched, long-lived new-app branch, mandatory staging, approved cuts), three acceptance stories. `PRODUCT.md` §Steering is the top of the authority stack.                                                                                                                                                                                                                                                                        |

---

> **Origin.** This constitution ratified a 2026-05-31 from-first-principles product exploration.
> Its selected treatments shipped and remain historical evidence, not frozen authority. The living
> design system of record is `DESIGN.md` plus the canonical tokens in `src/index.css` and
> `src/styles/folio.css`, reconciled to the latest owner-ratified direction.
