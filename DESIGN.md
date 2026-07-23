---
name: d20 Folio
description: Illuminated Folio — a beautifully bound spellbook for D&D 2024, parchment + gold-leaf, full light/dark parity.
colors:
  # Mineral-pigment ramps (theme-independent; the raw material the themes assign to roles)
  gold-leaf-50: "#f5e6b8"
  gold-leaf-100: "#ecd28a"
  gold-leaf-300: "#d4ac4d"
  gold-leaf-400: "#c69f45"
  gold-leaf-500: "#b8923d"
  gold-leaf-700: "#7a5f24"
  gold-leaf-900: "#3d2f12"
  lapis-300: "#6589c4"
  lapis-500: "#2a4d8c"
  lapis-700: "#1a3358"
  vermilion-300: "#d4685a"
  vermilion-500: "#c0392b"
  vermilion-700: "#8a2418"
  verdigris-300: "#6ba88a"
  verdigris-500: "#4a8a6f"
  verdigris-700: "#2e5a47"
  amethyst-300: "#8e5cc0"
  amethyst-500: "#6b3d96"
  amethyst-700: "#43245d"
  # Dark theme (default) role assignments
  bg-page-dark: "#0c0a07"
  bg-surface-1-dark: "#15110b"
  bg-surface-2-dark: "#1d1810"
  bg-surface-3-dark: "#2a2317"
  bg-recessed-dark: "#0a0705"
  text-primary-dark: "#f0e4cb"
  text-special-dark: "#fff2b3" # the lit-emphasis register (BG3 "special" cream)
  text-secondary-dark: "#c4b89e"
  text-muted-dark: "#988b6e"
  border-medium-dark: "#352c1f"
  border-accent-dark: "#6b562f"
  accent-primary-dark: "#b8923d"
  accent-text-dark: "#d4ac4d"
  # Light theme — "golden-hour" deep-parchment (OWN-36; mirrors src/index.css, the authority)
  bg-page-light: "#bca268" # deep burnished parchment field — ivory cards float off it
  bg-surface-1-light: "#f6ead0"
  bg-surface-2-light: "#fdf6df"
  bg-surface-3-light: "#e2d2a8"
  bg-recessed-light: "#cdbb8e"
  text-primary-light: "#241d12"
  text-special-light: "#4a3006" # lit-emphasis sibling — designed gilt-espresso rubrication (light-parity)
  text-secondary-light: "#342912"
  text-muted-light: "#322710"
  border-medium-light: "#b8a878"
  border-accent-light: "#6a4e18"
  accent-primary-light: "#4a380c" # rich antique gold — AA-safe on the deep field
  accent-text-light: "#3d2f12" # gold-leaf-900 — gold text on tinted card backgrounds
  # Semantic anchors (verdigris / vermilion / gold / lapis)
  success: "#6ba88a"
  danger: "#d4685a"
  warning: "#d4ac4d"
  info: "#6589c4"
typography:
  title:
    fontFamily: "Cinzel Variable, Cinzel, Georgia, serif"
    fontSize: "2.375rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.01em"
  display:
    fontFamily: "Alegreya Variable, Alegreya, Georgia, serif"
    fontSize: "1.3125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  hero:
    fontFamily: "Alegreya Variable, Alegreya, Georgia, serif"
    fontSize: "4.5rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Alegreya Variable, Alegreya, Iowan Old Style, Georgia, serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.12em"
rounded:
  sm: "0px"
  md: "2px"
  lg: "4px"
  xl: "8px"
  2xl: "12px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  12: "48px"
  16: "64px"
  touch-min: "44px"
components:
  button-primary:
    backgroundColor: "{colors.accent-primary-dark}"
    textColor: "{colors.bg-page-dark}"
    typography: "{typography.display}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.bg-surface-2-dark}"
    textColor: "{colors.text-primary-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.bg-recessed-dark}"
    textColor: "{colors.text-primary-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  badge:
    backgroundColor: "{colors.bg-surface-2-dark}"
    textColor: "{colors.accent-text-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.bg-surface-1-dark}"
    textColor: "{colors.text-primary-dark}"
    rounded: "{rounded.xl}"
    padding: "8px 12px"
---

# Design System: d20 Folio

> **This is the single, comprehensive design + UX system of record.** It folds in and supersedes
> all the redesign-era working docs (the old design-system, craft-doctrine, audit, asset-spec, and
> `UI_UX_*` briefs — now pruned; redesign journey in git history). The token
> _values_ are owner-locked in `src/index.css` +
> `src/styles/folio.css` — **on any disagreement between this prose and the CSS, the CSS is
> authoritative.** This doc documents structure, usage rules, the craft discipline, and the identity
> guard; it never re-derives values. Validate every UI surface against it; on conflict with the
> Product Constitution (`docs/PRODUCT_CONSTITUTION.md`), stop and ask.
>
> **Reader's map.** §1–6 = the visual design system (north star, color, type, elevation, components,
> do/don't). §7 = the seven craft laws (the per-surface enforcement checklist). §8 = the identity
> guard + the deliberate-choices "do NOT fix" list. §9 = motion. §10 = light/dark parity. §11 =
> mobile recomposition. §12 = edit-in-place doctrine. §13 = the asset contract. §14 = the audit
> methodology + verification gates.

## 1. Overview

**Creative North Star: "The Illuminated Folio, Evolved"**

The identity is **FROZEN**. "Evolved" names the IA / navigation refinement (the entity model and
D&D-Beyond-style flat hub in `docs/PRODUCT_CONSTITUTION.md`), **not** a new or different look — the
tokens in `src/index.css` / `src/styles/folio.css` are the same shipped "Illuminated Folio" style.

A beautifully bound spellbook or tome made interactive. Warm parchment and vellum surfaces carry
carved and embossed depth; gold-leaf accents and rule-lines, layered shadows, and subtle gradients
give every surface real material weight. The character is aged-manuscript and illuminated-codex:
premium and tactile, never flat. It is committed skeuomorphism on purpose, not a decorative veneer
over a spreadsheet. Surfaces read as struck brass and pigment on parchment.

The two named inspirations set the bar. D&D Beyond is the benchmark for character-sheet information
architecture and data density, and for putting an atmospheric, themed background under a data-heavy
sheet; this system matches that IA/density bar and exceeds its craft. Baldur's Gate 3 menus set the
craft / "wow on sight" bar: ornate gilded framing, rich tactile materials (parchment, leather,
metal), and crisp, highly readable typographic hierarchy layered over decorated backgrounds without
sacrificing legibility. Light and dark are the same world at full parity, not a default plus an
afterthought; each is designed, with its own elevation recipes, accent steps, and contrast tuning.

The system explicitly rejects generic flat SaaS dashboards (Linear/Notion gray-on-white),
Material-flat surfaces, neon/cyber, and corporate fintech navy-and-gold. It also rejects the lazy
warm-neutral "AI cream default": the parchment here is a deliberate, committed identity carried by
the whole tome aesthetic (surfaces, gold accents, serif type, carved depth), not an accidental
tinted near-white body. When the source CSS (`src/index.css`, `src/styles/folio.css`) and this prose
disagree, the CSS is authoritative.

**Key Characteristics:**

- Parchment/vellum surfaces with carved (inset) and embossed (raised) depth, never flat fills.
- Gold-leaf as the single brand voice; semantic and domain pigments do the rest of the talking.
- Serif display for names/titles/numbers, serif body for reading, mono for every label and count.
- Lapidary geometry: sharp-to-small radii (0 to 12px); chips are 4px facets, not pills.
- Full light + dark parity, each AA-tuned, driven by `[data-theme]` on `<html>`.
- Motion is brass-and-spring: snappy, slightly overshooting, and fully reduced-motion-safe.

## 2. Colors

A mineral-pigment palette: gold-leaf primary over warm charcoal (dark) or aged vellum (light), with
five saturated pigment ramps assigned to roles per theme.

### Primary

- **Gold Leaf** (`accent-primary`: `#b8923d` dark / `#4a380c` light — a rich antique gold tuned AA-safe
  on the deep light field): the single brand voice. Used for primary actions, current selection, focus
  illumination, emphasis, and the edit-mode voice. Its rarity is the point; it is never decoration.
- **Deep Gold Ink** (`accent-text`: `#d4ac4d` dark / `#3d2f12` light): the AA-safe variant for gold
  _text_ (rubrics, eyebrows, labels) on gold-tinted surfaces. Distinct from the mid gold UI-fill.

### Secondary

- **Lapis** (`#6589c4` / `#1a3358`): the bonus-action slot and the `info` semantic. Cool counterpoint
  to the warm field.
- **Vermilion** (`#d4685a` / `#8a2418`): the reaction slot and the `danger` semantic. Reserved for
  destructive and reactive meaning.
- **Verdigris** (`#6ba88a` / `#2e5a47`): the action slot and the `success` semantic.
- **Amethyst** (`#8e5cc0` / `#43245d`): the "magical source" marker only. Never repurposed for
  neutral chrome.

### Neutral

- **Ink Charcoal / Deep Parchment** (`bg-page`: `#0c0a07` dark / `#bca268` light): the page field,
  always wearing the `--vellum-grain` texture. In light it is a deep burnished parchment so the bright
  ivory cards float off it (the golden-hour answer to dark's near-black-field pop — see §10).
- **Warm Surfaces** (`bg-surface-1/2/3`: `#15110b`-`#2a2317` dark / `#f6ead0`-`#e2d2a8` light): the
  three raised tiers for panels, cards, and shadow surfaces. Light's cards are bright gilt-ivory.
- **Recessed** (`bg-recessed`: `#0a0705` dark / `#cdbb8e` light): the carved-channel fill for inputs
  and inset wells (writable fields use the cleaner `--input-fill`).
- **Parchment Inks** (`text-primary/secondary/muted`: `#f0e4cb`/`#c4b89e`/`#988b6e` dark /
  `#241d12`/`#342912`/`#322710` light): reading text and labels, all tuned to clear AA on their
  surface — in light, tuned to clear AA even on the deep bare field, including the deepest recessed
  fill.
- **Special Ink** (`text-special`: `#fff2b3` dark / `#4a3006` light): the LIT-EMPHASIS register
  between `--text-primary` and gold `--accent-text` — active/selected titles, the name of the thing
  you're reading. From BG3's shipped one-ramp text hierarchy, whose warm-cream "special" tier tops
  the umber→cream ramp (identity epic, owner-ratified 2026-07-02). Dark lights a title by going
  BRIGHTER than the cream body; the light-parity rebuild lights it with a **designed gilt-espresso
  rubrication** — an ink that reads more luminous and visibly gold-cast beside the neutral-brown
  body, so an open/active title glows like illuminated-manuscript rubrication rather than flattening
  into `--text-primary` (the prior `#33260a` sat a hair off body ink). Always the more-luminous "lit"
  ink of the pair (guarded), clearing AA on EVERY ground: ≥13:1 dark / 10.2:1 surface-1 · 8.2:1
  surface-3 · 4.95:1 even on the bare deep-parchment field in light (contrast-test guarded).
- **Brass Edges** (`border-soft` to `border-accent`: dark brass / tan to deep-gold in light): 1px
  carved edges, escalating to gold-touched.

### Domain palettes (inline custom-props, never Tailwind colors)

Spell levels (`--sl-c`, `--sl-1..9`, chromatic rainbow), spell schools (`--school-<id>`, the
8-school champlevé-enamel set — genre school hues desaturated into the mineral world, bright on
dark / struck deep on vellum; the codex spell chip's colour voice, its text derived in-recipe via
color-mix toward `--text-primary` so no `-ink` twin exists), damage types (13, D&D Beyond
convention), conditions (15 individual hues), exhaustion (6-step amber to crimson), currencies
(metal + deep pair), and action types (`--at-action/bonus/reaction/free/magic/nothing`). Each
saturated hue ships an AA-safe `-ink` text variant (schools excepted, as above — their chip math is
AA-guarded in `tests/unit/verdict-ink-contrast.test.ts`). Consumed inline via
`style={{ "--sl": "var(--sl-3)" }}`.

**One hue vocabulary per fact.** A surface never encodes two different facts with one palette: on a
codex spell row the seal speaks LEVEL (the chromatic rainbow) and the classifier chip speaks SCHOOL
(the enamel set) — the old level-tinted school chip said "level" in colour while reading "school" in
text, and is the canonical counter-example.

### Named Rules

**The Gold-Text Rule.** Gold text always uses `--accent-text`, never `--accent-primary`. The mid gold
fails contrast on gold-tinted light surfaces (the "yellow-on-yellow" failure). Forbidden.

**The Ink-Variant Rule.** A saturated domain hue is the 3:1 graphic (chip border, icon). Its `-ink`
variant is the >=4.5:1 label text. Never set small text in a raw domain hue.

**The Token-Only Rule.** Components reference token names only. Literal hex in component code is
prohibited; the only source of truth for values is `src/index.css`.

**The Warm-Black Rule.** Every NEUTRAL dark surface/border/text-neutral is red-biased — R > G > B —
never neutral grey, never blue-cast (pure `#000000` is allowed for the neutral `--carve-shade` and
scrims). From BG3's shipped red-biased darks, `#0b0908` family (identity epic, 2026-07-02). Semantic
and domain hues (lapis, spell levels, damage types, …) are MEANT to be colored and are exempt.

**The Scrim Tiers.** Exactly two overlay-backdrop weights, both theme-independent `:root` tokens:
`--scrim-dim` (black 46%, standard dialogs — the `.scrim` recipe) and `--scrim-heavy` (black 75%,
fullscreen/blocking surfaces — the portrait lightbox). BG3 ships exactly these two modal-scrim
weights (identity epic, 2026-07-02). Never a literal black alpha behind an overlay.

**The Focus Wash.** Keyboard focus = the crisp gold a11y ring PLUS a warm interior wash
(`--focus-wash`: `#fddda6` @ 25% dark / struck-gold @ 35% light), layered in the shared
`:focus-visible` recipe. BG3 focuses controls by washing their interior with warm light at 23–60%
alpha (identity epic, 2026-07-02). The wash is additive warmth; the ring is the a11y contract and
never drops.

**The Grounded Glow.** A glow never floats free of an edge: every halo carries a 1px deep muted
stroke-twin of its hue — `--glow-stroke-gold` (`#5e4a1e`) grounds the gold `--illumination` today;
per-hue twins follow. BG3's stroke-twin pattern pairs each glow with a dark grounding stroke
(identity epic, 2026-07-02).

## 3. Typography

**"The Gilded Plate"** (owner-ratified 2026-07-02, the BG3-identity epic) — four registers, three
faces:

**Title Font (`--font-title`, ceremonial):** Cinzel (with Georgia, serif) — a caps-only titling face
(lowercase renders as small capitals), reserved for the ceremonial register.
**Display Font (`--font-display`, content headings):** Alegreya (with Georgia, serif) — real
lowercase, BG3's own OFL face.
**Body Font (`--font-body`):** Alegreya (with Iowan Old Style, Georgia, serif).
**Numeric/Label Font (`--font-numeric`):** Source Serif 4 (with Georgia, serif) — numbers, stats,
and the uppercase label/eyebrow register; Tailwind's `font-mono` utility resolves here.

**Character:** an engraved ceremonial plate over manuscript warmth. Cinzel carries the handful of
ceremonial moments; Alegreya does the reading; Source Serif 4 gives data a crisp, even column. The
pairing reads bound-manuscript, not app-chrome; the contrast axis is titling-versus-text, so the
faces never compete.

### Hierarchy

- **Hero** (Alegreya 600, 72px, line-height 1.1): the character display number and top-level hero
  moments.
- **Page Title** (Cinzel 700, 38px, 1.1): page headings — the ceremonial register.
- **Section** (Alegreya 600, 28px, 1.25): section headings.
- **Card Title** (Alegreya 600, 21px, 1.25): card and entity names.
- **Lede** (Alegreya 400, 17px, 1.5): introductory prose.
- **Body** (Alegreya 400, 15px, 1.5): reading copy, capped at `--measure` (72ch).
- **Label** (Source Serif 4 600, 11px, letter-spacing 0.12em, uppercase): eyebrows, counts, stat
  values, button text; always `.tnum` for tabular alignment.
- **Micro** (Source Serif 4, 10px floor): the smallest any state-cue or label may go.

### Named Rules

**The Four-Register Rule.** Numbers and labels are the numeric register; names and content headings
are display; ceremonial titles are the title register; reading copy is body. A number never renders
in the serif body; a name never renders in the label register.

**The Ceremonial-Title Rule.** Cinzel appears ONLY on the ceremonial register — page-shell page
titles, the brand lockup, the cockpit identity-band character name, and modal-head titles — and
**never renders below 14px** (a caps-only face turns illegible and shouty at label sizes). Anything
smaller, or any new surface, stays on `--font-display` until deliberately promoted.

**The Cinzel-Never-Italic Rule** (owner-reported 2026-07-02: the brand "d20" shipped with a
truncated "0"). Cinzel ships no italic: `font-style: italic` is FORBIDDEN on any `--font-title`
context. The browser synthesizes a faux oblique that shears glyph ink outside the layout box —
where a `background-clip: text` fill cannot paint, so the sheared ink renders transparent. Italic
belongs to Alegreya only (`--font-display` / `--font-body`, which ship a true italic). This also
means no `<em>` wrapping inside a Cinzel element (the UA default italicises it). Guarded in
`tests/unit/cinzel-no-italic.guard.test.ts`.

**The Tabular-Numeric Rule.** Alegreya and Source Serif 4 both default to proportional oldstyle
text figures; the app pins tabular LINING figures ONCE, app-wide, at the `body` seam
(`font-feature-settings: "tnum", "lnum"` in `src/index.css`) so every digit reads at cap height and
stat columns align in every register. Never re-derive this per component.

**The Legibility-Floor Rule.** No user-facing text below 10px (`--text-micro`). The old 8px eyebrows
are forbidden; they fail at default zoom and on reflow.

**The No-Truncation Rule** (owner, 2026-06-12: "truncations are a sign of unprofessionality";
extended same day to card/row names: "the ellipsis on mobile … like 'Pozione di G…' are not really
acceptable"). Identity text (a person's, character's, or SRD entity's name) is never mid-string
ellipsized. Give it natural width; where space is genuinely constrained, either swap to a SHORTER
true form at a breakpoint (first name → avatar-only, with the full string in the adjacent
menu/tooltip) or — when no shorter true form exists, as for SRD names — WRAP at spaces, balanced,
instead of `text-overflow: ellipsis`. Canonical examples: the topbar account trigger
(`.acct-trigger-name` — full name at xl+, first name lg→xl, avatar-only below; guarded in
`settings-dropdown.test.tsx`), and the cockpit header name (`CombatHeader` h1 — wraps at spaces,
balanced, one type step down on phones, `break-words` only for a pathological single-word name;
guarded in `combat-header.test.tsx`).

**Card/row names — "names wrap, chips don't"** (the rule's recipe for the two list families,
CARD-NAMES 2026-06-12). A `UniversalCard` name (`.uc-name`) renders INLINE inside its cell so the
marks (✦ · ◎ · RIT · ×qty) flow after the LAST word, and the cell wraps balanced
(`text-wrap: balance`); a picker/codex row name (`.pick-name`) wraps balanced the same way. The
trailing cluster keeps natural width — the verdict chip is never compressed or clipped (the
`max-content` grid track). At phone width (≤430px) the chip moves DOWN
to the secondary band (right-aligned beside the gloss) so the name owns the full first line minus
seal + CTA — at 360–430px a combat row (chip + CTA + pips) otherwise left the name a track so
narrow that even wrapping broke words mid-syllable. Budget ~50 characters: Italian
SRD names run ~25–45% longer than English (worst: "Turibolo del Controllo degli Elementali
dell'Aria", 49ch). The recipe also covers the roster card title (`.ch-name`, AC-ZERO 2026-06-12:
the owner's "Coralino di Sanval…" on a ~480px-wide card), which wraps balanced — the vitals band
below it keeps natural width. Guarded four ways: the CSS-recipe lock
(`tests/unit/no-truncation-names.guard.test.ts` — `.uc-name` · `.pick-name` · `.ch-name` ·
`.party-id-hero`), the
manifest-wide 390px DOM probe (no protected name element with `scrollWidth > clientWidth`, check 4
in `tests/e2e/mobile-layout.spec.ts`), a desktop card-width (480/360px) clipping probe (same spec),
and the longest-real-IT-names stress tests (same spec).

**The party combatant-card title — owns its row, WRAPS balanced** (CARD-NAMES; owner 2026-07-07
re-decision under golden rule 26, which **reverses** the 2026-06-29 single-line/ellipsis exception).
On the campaign party / encounter card the character NAME (`.party-id-hero`) once shared its row with
a player tag + role chip + the disclosure caret, so long names ("Coralino di Sanvaldo", "Bren
Ironbeard of the Thunderhold") were squeezed into a narrow track and **wrapped mid-syllable** on
phones — which the owner (2026-06-29) judged worse than a graceful ellipsis, and so that title alone
became a nowrap+ellipsis exception. But the **same** 2026-06-29 change relocated the player
attribution to the SUBTITLE (`.party-sub-player`: a gold-crown=DM role icon + the player's name,
beneath the race·class·subclass line), **freeing the full row width for the name** — which removed the
very cause of the mid-syllable wrap. Impeccable's re-evaluation (golden rule 26): at the freed width
the name breaks at a SPACE, so a graceful two-line wrap now reads intentional, and the ellipsis is a
net loss — it **hides identity content** (a name is common info, §2.3), the `title` hover recovers
nothing on touch (the mobile surface where the owner reported the clip), and the expanded body no
longer repeats the name, so on a phone the clipped name became genuinely unreadable. The title now
uses the **same wrap recipe as every other name family** (`white-space: normal` · `text-wrap: balance`
· `overflow-wrap`/`word-break: break-word`), so the app carries ONE truncation doctrine with no
carve-out; the common case ("Coralino di Sanvaldo", "Bo") still fits one line, and only a genuinely
long name spends the extra line. No `title` tooltip (a wrapped name is never clipped, nothing to
recover). Considered-and-rejected alternatives: (C) auto-shrink the font to fit one line — invents a
one-off type-size mechanic (product-register ban on reinvented affordances), rags the name sizes
across a card grid, and still wraps/clips on longer IT names; (D) lift the name to its own full-width
row above a detached avatar — breaks the avatar-anchored identity vocabulary shared with the roster +
cockpit (§7 consistency). Pinned by the wrap-recipe lock in the unit guard (`.party-id-hero` now in
the protected family) + the no-clip e2e probe at the real card widths (`mobile-layout.spec.ts`,
campaign-hub-party). The character name stays predominant; the player is secondary. The EXPANDED card
body no longer **repeats** the name (owner 2026-06-29): a second `.party-detail-name` heading just
read as "Bo" under the header's "Bo" — redundant, so it (and its CSS) were removed; the header is the
single name.

**The DM control banner — a full-width strip, never a combatant card** (FIX 1, owner-decided Option C,
2026-06-29). The DM is **not a combatant**, so they no longer take a half-width identity card in the
party grid (which read as smaller than the player cards and left an ugly gap). Instead `DmControlBanner`
(`party-encounter.tsx`) is a slim **full-width** `.dm-banner` strip at the top of the party surface —
in both the resting dashboard and the combat layer. **Left, always:** the gold accent — a crown glyph +
the DM name (a non-DM viewer reads `narratedBy`, "Narrated by {name}") + the DUNGEON MASTER `Badge`.
**Right, DM viewer only:** the contextual encounter controls, surfaced from the **existing** flows per
the real encounter phase — out of combat / no encounter → just **Run encounter**; during an encounter →
a tight right-aligned **pair**, `[ + Add monster ] [ Begin turns ]`, both inline on the banner so its
**closed** state stays a single slim row. The **Add monster** button is a disclosure trigger: pressing it
expands the add-monster form full-width below the banner (the `extra` slot); it stays available all
through the fight (reinforcements). **Non-DM viewer:** identity only, no controls. A DM **with** a
character (a rare DMPC) still renders as a normal gold combatant card in the grid — the banner is
independent and stays above it; the DM is filtered out of the grid **only** when they have no character.
The optional **attach-a-DMPC** affordance (`DmpcAttachControl`, the old DM-tile recipe relocated) lives
on the banner's extra slot for the DM themselves. The gold accent reuses the `--accent-primary` /
`--accent-text` tokens + the 2px crown-line idiom (no raw hex), with a deepened light-theme edge for AA.

**The party PC card resting vitals — AC · HP · Speed, top-aligned** (B3, owner 2026-06-29).
The `.party-vitals` band on a player card carries the same shared `StatBadge` chips as the cockpit
hero bar, in the order **AC · HP · Speed** (the combat-only INIT roll-to-total chip stays the
card's leading-edge chip, not in this band). Speed reads `formatSpeed(stats.walkingSpeedFt, locale)`
with the `Footprints` icon — the cockpit's vocabulary. Chips are **top-aligned**
(`.party-vitals { align-items: flex-start }`): the HP chip is taller (it carries the bar) than the
AC/Speed chips, so the prior `center` drifted every chip's value line — `flex-start` pins them to a
shared baseline exactly like the cockpit tiles, and no chip needs a one-off `self-start`. **Monster**
cards and the doc-unavailable `FallbackVitals` stay **AC · HP only** — a monster has no
walking-speed concept, so adding a Speed chip there would be dishonest. **Uniform chip width** (FIX 3,
owner 2026-06-29): the chips share a `min-width: 4.5rem` floor (`.party-vitals > .vital[data-density=chip]`),
the **same min-width technique** the cockpit hero bar uses for its tiles (base `.vital` 46px, HP wider) —
the HP chip already sets 4.5rem, so floating the single-value chips (AC · SPD · INIT) to the same floor
makes them read as one tidy set instead of an AC-too-narrow ragged row, without an empty gap (their
natural content is ~4.5rem). Applies to PC and monster chips alike.

**My attached hero is swappable/detachable IN PLACE** (owner-reported 2026-07-02: an attached
character could be neither changed nor removed — the picker lived only in the no-character branch).
The member's OWN card carries the roster attach `Select` in its disclosure body ("Your character"
eyebrow, below Open sheet), on the ready AND doc-unreadable branches — the blank option reads
**"Detach character"** while attached, an attached id missing from the roster still shows as the
selected value (the snapshot name, never a lying detach face), and the whole control hides **in
combat** (the encounter holds pure `(uid, characterId)` references; swapping mid-fight would orphan
the row — it returns when the fight ends). The one-campaign guard toast **names the blocking
campaign** ("already in “{campaign}”. Detach it there first" — `attachAlreadyElsewhere`); a nameless
"another campaign" read as data corruption. Pinned by the attach → swap → detach + in-combat-hidden
tests in `party-unified.test.tsx`.

**Begin-turns hard-disables until everyone has rolled** (FIX 2, owner 2026-06-29 — this **reverses** the
earlier tolerant hybrid). During the gathering-initiative phase the DM's **Begin turns** button (now on
the control banner) is **disabled** whenever `rolled < total`, reading the secondary
`encounterBeginTurnsPartial` label ("Begin turns · {rolled}/{total} rolled") with a locked tooltip
(`encounterBeginTurnsLockedHint`) **and a `Lock` glyph** in place of the crossed-swords icon, so the
locked state reads at a glance; it becomes the **primary** swords "Begin turns" only when `rolled === total`.
The prior behaviour let the DM start early (un-rolled PCs sorted last); the owner reversed that so no
combatant is skipped. The reducer's blank-initiative-last sort is **kept** (defence in depth).

**Monster per-token HP reuses the PC HP control** (B9a, owner 2026-06-29). Each token in a
monster group (`Goblin ×5`) edits HP through the **same `.vital-hp` chip + shared `HpEditPopover`**
the PC card uses — no parallel widget (golden rule 10). A lone token labels with the monster NAME
(the card title already names it, so no extra visible label); a group shows a compact `Token N`
lead-in. Monsters have no temp pool, so the popover opens with **`hideTemp`** — a boolean prop that
hides every temp affordance (the `+temp` readout, the TEMP verb, the clear-temp button); it defaults
`false`, so the cockpit + PC-card popover is byte-identical (TEMP still shown). The popover emits
DAMAGE/HEAL **deltas**; the absolute `onSet` write goes through `setHp`→`clampHp`, which clamps
`hp ± n` to `[0, maxHp]`, so the bridge needs no local clamp.

**DM drag-reorder — LIFT & FOLLOW via Pointer Events (mouse + touch), FLIP slide**
(owner, 2026-06-30 — confirmed from a prototype, **supersedes** the gilt insertion line below).
The DM reorders the frozen turn order by dragging a combatant card's grip; the keyboard path
(ArrowUp/Down on the handle) is unchanged. The mechanic is **lift & follow** (the iOS-home-screen /
Trello / BG3 feel), built on **Pointer Events** — `pointerdown` → `setPointerCapture` →
`pointermove` → `pointerup` — so ONE code path serves mouse, touch, and pen (native HTML5 `draggable`
never fires on touch). The grip is `touch-action: none` so a touch-drag never scrolls the list.
On lift: the grabbed card **lifts into a floating clone** (`.combatant-lift-clone`, a `cloneNode`
snapshot appended to `<body>`, `scale(1.03)` + gilt ring + `--accent-glow` halo + deep shadow) that
**follows the pointer**; its original slot stays as a **faded GAP placeholder** (`[data-lifted]` →
`opacity: .4`, dashed, contents hidden) so the list keeps its height. As the pointer crosses the
other cards' vertical midpoints the **preview order** (React state) updates and the other cards
**FLIP-slide** apart to open the landing slot — measure rects before/after, transform old→new, animate
`transform 190ms cubic-bezier(.2,.8,.2,1)`. Rows are keyed by id, so a reorder MOVES each card (never
remounts) and the engine layer is untouched. On release the clone glides into the open slot and the
new order COMMITS through the same `reorderCombatant` insert-before-id reducer; a drop-in-place is a
reducer no-op. **Reduced motion** (`[data-motion="reduced"]`): the FLIP slide is skipped (cards snap)
and the clone's scale/glow is dropped — still fully functional, no animation. The lift/FLIP machinery
lives in `useLiftReorder` (`src/features/campaigns/use-lift-reorder.ts`); the clone is the ONLY
imperative DOM (a transient visual snapshot), never the list (state drives order). The old
`[data-dragging]` / `[data-drop-target]` insertion-line styling was removed (the live shift replaces
the line cue).

**The chip token contract — single-line, evaluated, budget-gated** (CHIP-COMPACT 2026-06-12; owner:
"chips in action cards should never be that big — it's so verbose"). A chip (`.uc-verdict` and every
verdict-chip family: damage, heal, save/condition, uses, rider) is a single-line token BY
CONSTRUCTION, locked at three seams:

1. **Evaluation** — every quantity the engine knows (class level, ability mod, PB) is resolved to a
   NUMBER at emission (`resolveActionHeal` in `smart-tracker.ts`): the Second Wind chip reads
   `1d10+5 Cura`, never `1d10 + livello da Guerriero / Cura`. The provenance moves to the breakdown
   tip — the heal chip is the `DamageBreakdownTip` trigger (the SAME register as the weapon damage
   label: tap → "Recuperare Energie 1d10 · livello da Guerriero +5"), composed by
   `localizeHealBreakdown` (`lib/views/combat-action-view.ts`).
2. **The `chipText` gate** (`CHIP_BUDGET = 20` ch, `lib/views/combat-action-view.ts`) — EVERY chip
   composer routes through it (combat `combat-card-helpers.ts`, spells `spell-card-helpers.ts`,
   inventory `WeaponCard`/`GearCard`, features tracker/rider chips): a labelled composition over
   budget drops its LABEL word (the chip colour carries the semantics, "1d10+5" stays green); an
   over-budget core (unbounded custom content) is omitted entirely — detail stays one tap away.
   Never mid-word, never multi-line.
3. **The CSS lock** — `.uc-verdict` is `white-space: nowrap` (the old `max-width: 20ch +
text-wrap: balance` wrap recipe is DELETED); with the gate upstream, nowrap can never clip.

Guarded by `tests/unit/chip-budget.guard.test.ts`: every SRD heal action at the worst evaluated
case, every combat verdict the REAL composer emits for the team fixtures + mock + every dev
scenario + an all-SRD-spells character, the spells-page compositions, every base-action verdict
word, and every class-feature rider chip at levels 1–20 — both locales — plus the CSS lock. An
over-budget chip is unrepresentable in shipped data.

**Card gloss — complete one-liners, never sliced** (CARD-SUMMARIES 2026-06-12, extending the rule
beyond identity text to the collapsed subtitle). The `UniversalCard` gloss (`.uc-gloss`) carries NO
ellipsis mechanism: the old `nowrap + hidden + text-overflow: ellipsis` recipe is deleted, and the
line WRAPS at word boundaries (`overflow-wrap: break-word`) — one line on desktop, ~2 complete
lines on a 390px phone. The content is budget-bounded upstream so wrapping stays rare: every
SRD-derived effect line is an authored ≤60-char summary or a description that fits
(`EFFECT_LINE_BUDGET` + the omit-not-slice presenter gate + the subtitle-budget guard — see
`docs/MECHANICS.md` "Per-action summary"). At phone width the gloss takes its OWN full-width row
under the chip band (an empty row collapses on gloss-less cards) — beside a wrapped 20ch verdict
chip it was starved to a words-split-mid-glyph sliver.

**Inline SRD markdown.** SRD prose carries `**bold**`/`*italic*` markers; every surface rendering it
routes through the ONE shared renderer (`parseInline` / `InlineMarkdown` — the seams are
`UniversalCardDesc`/`UniversalCardHigher`, `CompendiumDetailBody`, and the wizard/level-up cards);
native `title` tooltips use `stripInline`. Raw asterisks on screen are a routing bug, never a
content fix.

## 4. Elevation

The system is the opposite of flat. Depth is the identity: every surface is either carved (inset
shadow, receding into the page) or embossed (raised, with an inner top highlight). Six theme-tuned
recipes carry it, each a stack of inset highlight + inset shadow + brass lip + contained drop. Inputs
and pip sockets recede; cards, buttons, and modals rise. Surfaces are never flat at rest, and the
material reads as struck brass and pigment on parchment.

### Shadow Vocabulary

- **Recessed** (`--elev-recessed`): carved channel for inputs, pip sockets, inset wells. Inset
  shadow + inset top line + a faint bottom highlight.
- **Resting** (`--elev-resting`): the default raised tile (cards, list rows). Inset top sheen, inset
  bottom shadow, brass lip, soft 3-6px drop.
- **Raised** (`--elev-raised`): hover and emphasized tiles; a deeper 6-14px drop with a 3px brass lip.
- **Floating** (`--elev-floating`): popovers and floating chrome; 14-32px drop.
- **Modal** (`--elev-modal`): dialogs; a 30-70px drop for clear separation from the scrim.
- **Illumination** (`--illumination`): the gold-leaf halo, applied on focus and emphasis, theme-tuned.

### Named Rules

**The No-Flat-Fill Rule.** A surface is never a flat color. It is a carved channel or an embossed tile.
If a panel looks like a flat rectangle, the elevation token is missing.

**The Carved-In / Embossed-Out Rule.** Anything the user types or spends into recedes (inputs, pips);
anything they read or act on rises (cards, buttons). Depth direction encodes interaction.

## 5. Components

Every interactive component ships default, hover, focus-visible, active, disabled, and (where it
applies) loading and error states. Affordances are consistent across every surface.

### Buttons

- **Shape:** 2px radius (`--radius-md`); icon-only buttons are 32px square (28px sm, 40px lg).
- **Primary (brass):** display font, 12px, a four-stop gold-leaf gradient with a metallic bevel (inset
  top sheen, bottom inset, brass lip, contained drop). Label is `--text-inverse` in dark and
  `--accent-text` (deep gold) on a lighter gold band in light. It rests quiet and warm, then
  crisp-brightens on hover; no colored halo at rest.
- **Secondary:** mono uppercase 11px on `--bg-surface-2` with a `--border-medium` edge; hover lifts to
  `--bg-surface-3` and `translateY(-1px)`, active depresses 1px into the page.
- **Ghost / Destructive / Dashed:** transparent ghost for low-emphasis; destructive carries the
  vermilion voice; dashed for add-affordances.
- **Hover / Focus:** brass-eased background + transform; focus paints the gold `--illumination` halo
  plus a 2px `--focus-ring` outline. Loading swaps the label for a centered brass spinner (a steady
  full ring under reduced motion, never a frozen arc).

### Chips / Badges

- **Style:** one atom parameterized by `--bd-c` (the hue). Background is a 14% tint of the hue over the
  surface; border is the full `--bd-c`; label is `--bd-ink` (the AA-safe variant) for domain colors.
  Mono uppercase, 11px, 4px facet radius.
- **Variants:** `emphasized` (22% tint + glow), `solid` (gradient fill, inverse text), `outline`
  (transparent), `muted` (neutral). Any domain-colored badge must pass `--bd-ink`.

### Combat pip (topbar combat indicator)

- **The Portrait-Socket split switch** (`.combat-pip.combat-pip-split`, `src/app/shell/CombatPip.tsx`,
  owner pick P1 2026-07-03): `[ ⚔ R{n} · {state} ] [ {portrait|party} {verb} › ]`. A pure-STATUS left
  segment (`.cp-status`, `aria-hidden` — its content is restated in the chip's `aria-label`) + a raised
  carved-button destination chip (`.cp-dest-chip`) split by a 1px `--border-medium` divider — the chip is
  the ONLY interactive element (the outer wrapper is a plain `<div>`, so no nested-interactive). The chip
  wears a `#241d12→#191309` fill with an inset gold top hairline (`rgba(243,223,174,.12)`); hover brightens
  it one step + inks the text to `--gold-leaf-100`, active presses `translateY(1px)` + an inset shadow. The
  state COLOUR still carries the phase via `data-phase` on the wrapper: `needs-roll` → `--dmg-fire` (loud
  red), `your-turn` → `--accent-primary`/gold (pulse), quiet `actor-turn` / `gathering` → `--text-secondary`.
  (Phase rides `data-phase`, NOT `data-state` — Radix owns `data-state` on the red pip's popover trigger.)
  Both themes designed (the tokens flip).
- **The destination WEARS its identity** (why P1 won): the group destination shows the `Users` party glyph;
  the own-character flip shows the hero's **portrait seal** — a 22px gold-framed (`--gold-leaf-700`, radius
  3px) tile via the shared `Portrait` primitive (real portrait when present; the light topbar pip model
  carries no portrait URL, so the monogram fallback renders). A fixed 22px `.cp-dest-glyph` slot keeps both
  destinations at the same pill height. The verb reuses the canonical strings (`campaigns.openHubNamed` =
  "Open {name}" / `combatPip.destGroup` = "Go to Party"); a `--gold-leaf-300` chevron trails.
- **The needs-roll exception — an inline roller, not a switch.** The loud red `needs-roll` pip is the ONE
  state that ACTS: a `<button>` that opens an `InitVital` roll-to-total popover (the cockpit roll control,
  reused) so you roll initiative from anywhere — so it keeps its own single-purpose anatomy (no destination
  chip). On mobile a transparent ≥44px hit overlay gives it a touch-sized target without growing the visual
  pill. Keyboard: Escape dismisses, the d20 input is auto-focused, focus ring on the trigger.
- **Contextual destination:** on the encounter the chip flips to the viewer's hero sheet (portrait seal +
  "Open {hero}"); everywhere else it points at the group (party glyph + "Go to Party"). On mobile (≤720px)
  the chip drops the verb, keeping the glyph/portrait + a short name / "Party" + chevron. A group destination
  is a PLAIN navigation to the hub (`/campaigns/<id>`), landing at the top like any push (owner 2026-07-11:
  the old `?scrollTo=party` auto-scroll to the encounter read as a jump — the standing "never surprise"
  navigation doctrine wins; the param, its hub reader, and the `ScrollRestorer` hand-off are all removed).
  A count chip opens the multi-encounter chooser
  (state-coloured rows, one tap-target each). Pulses respect `prefers-reduced-motion`; the pill + chooser
  are axe-clean both themes.
- **The pip is the topbar's ONE flexible element — the brand/search/account are fixed-size invariants**
  (owner 2026-07-11: "The INVARIANTS (logo, search bar, profile) cannot change or users will be wtf. If
  anything has to adapt on mobile it's the ENCOUNTER CHIPS"). The brand lockup, the "Ask the Folio" search
  trigger, and the account cluster carry `flex-shrink: 0` and NEVER resize or shift when combat starts; the
  pip lives in the topbar's `flex: 1` spacer (`min-width: 0`) and absorbs the slack. At ≤640px the pip
  collapses to a single **glyph+count** tap target — `⚔ {round}` (the reused `.cp-dest-lead` inside the
  dest-chip for the split switch; the same bare form for the red needs-roll roller) — dropping the status
  segment, the destination seal/label, and the chevron so it fits the ~49px spacer slack at 390px without
  nudging one invariant pixel. Two guards on the collapse: (a) the wrap is capped to the slack with
  `max-width` + `min-width: 0` but NEVER `overflow: hidden` — that would clip the needs-roll pip's ≥44px
  `::before` touch overlay back to the pill height; (b) the rare multi-encounter wrap (two live fights) drops
  the primary pill entirely and stands the count chip alone as `⚔ {N}` (its own `.cp-count-glyph` revealed) —
  the chooser still reaches every fight, and nothing overflows. A prior fix that SHRANK the "d20 Folio" brand
  (die 34→26px, smaller wordmark) + tightened the bar padding when a pip appeared is DELETED — the owner
  flagged it as a "big bug" (the wordmark clipped "FOLIO"→"FOL"). Pinned by
  `tests/e2e/topbar-brand-invariant.spec.ts` (brand/search/account bounding boxes byte-identical with and
  without an active encounter at 390px, both pip forms, plus the needs-roll touch-reach probe).

### The sheet management chrome — two homes, one signal

The sheet's management chrome (Undo · Redo — the session stack; Edit — the mode toggle; ⋯ — the
document extras: History · Export JSON · Export PDF) lives ON the sheet, never in the global topbar
(undo is page-scoped by design). It has exactly **two homes**, split by ONE seam
(`useBinderFobHome`, `src/features/character/use-binder-fob-home.ts` — `(pointer: fine) and
(min-width: 768px)`), so exactly one home ever renders. Both drive the SAME seams as the keyboard
(golden rule 6): `useUndoActions` (⌘Z / ⌘⇧Z), `uiStore.sheetMode` (⌘E / Esc). All of it is
owner-only — on a read-only glass-case sheet neither home renders.

**THE BINDER'S FOB — the desktop home** (`BinderFob`,
`src/features/character/BinderFob.tsx`; owner-ratified 2026-07-11). A fixed bottom-right coin chain
in the Rest medallion's struck-metal family (`.fob` / `.fob-coin` / `.fob-edit`, folio.css) —
completely detached from the masthead, so the tools are reachable at every scroll depth **by
construction**. The masthead carries NO management row on ANY viewport (both homes live off it): the
masthead is pure identity + vitals, the vitals strip aligned clean against the name.

- **The chain, bottom-up:** `[✎ 46px]` standing · `[⋯ 36px]` above it · `⟳ · ⟲` (36px) mounting
  ABOVE only while history exists — the bottom-anchored column grows upward, so the standing coins
  never move; an empty side shows disabled (no in-pair shift while you work the stack); the pair
  unmounts with an empty stack (zero standing chrome).
- **The activated ✎ coin (the "done editing" grammar):** the edit coin is a TOGGLE — uncolored at
  rest, **lit amber** (`data-editing` + `aria-pressed`, the editing pill's own material) while
  editing, with zero geometry change either way, so flipping the mode can never reflow anything.
  One control enters, signifies, and exits. The lit coin + the `.content[data-mode="edit"]` amber
  frame carry the mode together — no other standing signifier, and **no floating deep-scroll exit**
  (the fixed fob is the always-reachable exit at every depth).
- **Tooltips (really non-invasive):** the branded quiet `HoverTip` idiom (200ms, `side="left"` —
  opening toward the content, never clipped at the viewport edge). Two-line body: the act over its
  key hint — "Edit · ⌘E" / "Done editing · Esc" for ✎; the concrete acted-on entry ("Undo: Cast
  Cure Wounds…" — the SAME localized string its toast showed, rule 6) over ⌘Z / ⌘⇧Z for the pair.
  The `aria-label` always mirrors the tooltip's first line. Glyph-only coins ⇒ the chain is
  byte-identical EN vs IT.
- **Collision story — lanes, not layers:** the fob owns the bottom-right column (right 20px, clear
  of scrollbars); `body:has(.fob) .toast-region` slides the desktop toast lane LEFT of the coin
  column, so a stack of toasts can never rise over the coins. Both themes designed: struck dark
  coins with the gold bloom in dark; struck-gold coins with the deep-gilt ink + `--gilt-glow-sm`
  kindle in light (the Rest-coin light-hover grammar).

**THE SIGNET — the mobile home** (`MobileSignet`, `src/features/character/MobileSignet.tsx`;
owner-ratified 2026-07-11 — the fob collapsed to ONE coin, the fob family's compact sibling). One
struck-metal coin (`.signet` / `.signet-fab`, reusing the fob's `.fob-coin` / `.fob-edit` material)
fixed above the bottom nav on coarse pointers / <768px — likewise detached from the masthead, so the
tools are reachable at every scroll depth **by construction** (no floating deep-scroll exit).

- **The tools glyph, not a pencil (the de-duplication ruling — "the edit icon is repeated twice"):**
  the IDLE coin bears the lucide **`Wrench`** glyph (owner-picked 2026-07-12) — reading "the tools
  you tap to open", matching the aria "Sheet tools" label, never "edit". The pencil lives ONLY in
  the bloomed chain.
- **Tap → the chain blooms upward:** `⟲ ⟳` (only while history exists, the empty side disabled) ·
  `⋯` · `✎ Edit`. Tap-away collapses it (`useDismissOnOutside`). The chain reuses the fob's coins
  and the shared ⋯ overflow (History · Export JSON · Export PDF) verbatim.
- **The activated ✎ coin (the "done editing" grammar):** while EDITING the coin itself becomes the
  **lit amber ✎** (`data-editing` + `aria-pressed`, the editing pill's own material) — a one-tap
  exit (aria "Done editing" / "Fine modifica"), exactly the fob's activated-toggle grammar (a lit
  toggle tap deactivates). The lit coin + the `.content[data-mode="edit"]` amber frame carry the
  mode together. If the chain is bloomed while editing it shows ONLY `⟲ ⟳ · ⋯` — **never a second
  pencil**, because the coin IS the edit control now (the invariant the de-dup ruling demands).
- **Long-press side-flip:** long-pressing the coin flips the whole Signet to the LEFT edge
  (`.signet-left`, persisted to `localStorage`) for left-thumb reach / occlusion relief.
- **Coarse pointer = no tooltips:** the aria labels carry every word (EN + IT); glyph-only coins ⇒
  the chrome is byte-identical across locales apart from those labels.
- **Visibility + collision:** owner-only — renders only when a character doc is loaded, the sheet is
  not read-only, and this is the mobile home (`!useBinderFobHome()`). Its bottom offset clears the
  bottom nav AND the centred toast band, so neither the nav nor a live toast ever overlaps it.

### THE REVERSAL CONTRACT (owner-ratified 2026-07-11 — "once and for all")

How a user takes back a mistake, everywhere, always the same way. **One primary seam, one
in-the-moment affordance, one keyboard path — and CTAs never reverse.**

1. **The session undo stack (`src/stores/undoStore.ts`) is THE reversal seam.** Every undoable act
   — an economy commit, a cast, an attack swing, a reaction, a rider/Cunning-Strike spend, an HP
   damage/heal/temp apply (incl. a typed multi-part intake, a knockout's Unconscious+track reset,
   an at-0 failure mark, a massive-damage death), a roll-entry heal, a death-save d20 entry, a
   tracker spend/restore, a condition/defense/
   concentration removal, a coin re-arm, End Turn — registers exactly ONE reverse-applier on the
   stack (`registerUndoableToast`, or the Pattern-B manual `register` + `wireUndoToast` when the
   message depends on the mutation's result). Standard LIFO undo/redo; redo re-runs the SAME
   resolved execute.
2. **Three references to the one stack — never a fourth copy:** (a) the **undo snackbar** — the
   ephemeral 5 s announcement of the LAST act, carrying its Undo button; (b) the **standing
   Undo · Redo control** (the sheet management chrome above — the Binder's Fob's ⟳ · ⟲ pair on
   desktop, the Signet's bloomed ⟳ · ⟲ pair on mobile) walking the stack; (c)
   **⌘Z / ⌘⇧Z**. All three fire the same `UndoEntry` — undoing from any of them behaves
   identically.
3. **CTAs never reverse (the CTA grammar — see "The combat-CTA grammar" below).** No inline
   cancel/"Annulla" affordance exists on any card: a spent CTA is disabled and reads **"Used"**;
   taking the act back is ALWAYS the undo system. A user who mis-taps anything learns one gesture,
   once.
4. **The one-snackbar rule (`src/stores/toastStore.ts`):** at most ONE undo snackbar is visible; a
   new undoable act's announcement REPLACES the live one in place (content swapped, countdown
   reset — this is also what gives Extra Attack its single evolving "attack 2 of 2" toast). Depth
   is never lost: superseded acts stay individually undoable on the stack. Undo snackbars are
   uniformly 5 s.
5. **Notices are not reversal affordances.** A toast without an Undo action (a guard notice, a
   reminder, an error) is a message in its own lane — short (2–6 s), rare, never claiming the
   snackbar slot.
6. **Semantically different ≠ undo.** Ending an ONGOING state is a forward act with its own
   affordance (the lit rail chip ends Rage/a buff; the concentration banner's drop control ends a
   spell; the wield-stance toggle is stateless display) — each itself undoable where destructive.
   The turn-meter **coin re-arm** is a bookkeeping EDIT of the economy display (owner-ratified
   2026-07-03), registered on the stack like any act. A **level-down** is the deliberate reversal
   of a level-up (a feature, not an undo). **Fences** (the stack's never-list, `undoStore.ts`):
   rests, build edits, imports, snapshot restores, and character switches CLEAR the stack — a rest
   is a story beat, not a mistake; an import's toast-only restore is its own one-shot.

### Cards / Containers

- **Corner Style:** 8px (`--radius-xl`) for cards; 12px (`--radius-2xl`) for the largest containers.
- **Background:** `--bg-surface-1`; carried on an embossed (`--elev-resting`) tile.
- **Shadow Strategy:** resting at rest, raised on hover; see Elevation. Never flat.
- **Border:** 1px `--border-soft` dividers between stacked rows.
- **Internal Padding:** `--sp-2`/`--sp-3` (8/12px) on dense rows; larger containers use the 4px scale.

### Universal Card (signature component)

The single content primitive: one card shape serves spells, features, feats, weapons, and gear. A
4-column header grid (34px seal, name/gloss `minmax(0,1fr)`, a `max-content` verdict chip that never
compresses, and an action column) over an expandable detail region (progressive disclosure: collapsed
shows the at-a-glance facts, expanded reveals description, scaling, and tags). A 3px left edge in the
action-type color encodes the action economy (verdigris action, lapis bonus, vermilion reaction, muted
free/passive). Hover tints the header 5% gold; the magic mark settles once on mount.

**The expanded reading spread = the typed-document anatomy** (BG3 identity P2, 2026-07-02 — the
tooltip anatomy from the BG3 research, applied as an upgrade of this ONE card, never a parallel
component): the OPEN card's name — and an `active` card's (concentrating / committed) — takes the
`--text-special` cream title tier (§2, "the name of the thing you're reading"); the facts grid rows
are **icon-anchored** (an optional 12px lucide glyph per fact in the label ink — spells pass
clock/ruler/shield/crosshair/hourglass/hand; inventory + combat weapon/armor/gear facts pass
swords/crosshair/ruler (the shared `WeaponFacts` rows) and shield/zap/layers/weight/coins/heart
(AC · charges · quantity · weight · value · heal); an anchor, never decoration); every detail block
(facts | description | higher-levels | notes | foot) is separated by a **quiet hairline fading at
both tips** (a background gradient on `.uc-detail > * + *` — nodeless: the diamond-node divider is
the SECTION register, in-card dividers stay quiet); and the detail foot is the **cost footer** —
tags left, the verb-bearing commit CTA right (`spells.castAtLevel` "Cast · Lv 3", never a verb-less
slot label). The facts grid drops to 2 columns ≤430px (three starved IT values into mid-word
breaks), and ≤430px the head's trailing CONTROL CLUSTER (equip / attune / charge-Use / edit
delete) drops to its own full-width row under the gloss — a max-content button pair
("Equipaggiato" + "Sintonizzato") in the head columns starved the name track until it
letter-stacked (No-Truncation Rule); the row collapses to 0 on control-less cards.

### Stat Cartouche (signature component)

The ability-score tile ("Carved Cartouche"): an engraved hero modifier over a carved gem score, with
proficient saves shown at rest and a carved-base disclosure on hover/tap. Pips use the carved-socket
recipe (`--pip-empty-*`) so spent and empty states read as recessed gems, not voids.

### Cockpit masthead — the Living Sheet (`CombatHeader`)

The sheet's masthead reads **identity (seal · name · lineage) left, the vitals strip (DATA)
right** — and that is the WHOLE masthead on every viewport (the management chrome lives OFF it in
the fob family: the Binder's Fob on desktop, the Signet on mobile). Controls
are never mixed into the data row. The two per-session rituals, Rest and Level Up, are quiet
**ceremony rendered ON the sheet itself**, each with zero standing verb text (the verb lives in
the branded folio `Tooltip` on hover + the `aria-label`, never a native `title`), so the vitals row
is geometry-identical EN vs IT.

- **Vitals strip** (`.hdr-vitals`): HP (the `.vital-hp` bar tile) + AC · Init · Speed · PB as
  `StatBadge` tiles. On phones (≤639px) the strip composes **1+4 deliberately**: HP leads the top
  row (the stat touched most in play earns the longest Liquid-Mercury bar) with the Rest coin
  trailing it (below), and the four reference tiles share one even row — never an accidental 4+1
  wrap orphaning PB.
- **HP entry — the defense-aware damage intake (RA-05/RA-03, 2026-07-12).** The `.vital-hp` tile
  opens the ONE shared `HpEditPopover` in every state — at 0 HP the same-footprint danger pill stays
  the trigger (the editor never moves). Inside, the plain amount + Damage/Heal/Temp verbs are
  unchanged for everyone; a character who actually DEFENDS something (resistance / immunity /
  vulnerability / flat reduction / source resistance, incl. while-active ones — a raging Barbarian)
  additionally gets one lit-toggle chip per defended type (the `ActivatableFeaturesBar` toggle
  grammar, sized down), a live mono math line ("12 → 6 · Resisted") computed by the SAME pure
  functions the commit applies, and a ghost "+ Add another" that stages multi-type parts with a
  running total. Chips are an OFFER, never a demand — an untyped amount applies verbatim
  (override-first). At 0 HP a "Critical hit" toggle joins (two failures) with a quiet hint line;
  once dead the Damage verb disables.
- **The dying strip — the verdict register (RA-11).** The global `.dying-banner` danger plate is
  state-driven: **Dying** (pulsing beacon + HeartCrack) → **Stable** (verdigris Heart) →
  **Dead** (Skull), ONE label owning the verdict (the pips molecule carries no duplicate
  announcement). While the outcome is open, the PRIMARY act is the death-save d20 **roll entry**
  (clamped NumberStepper 1–20 + Apply — the `heal-roll-entry` idiom): the entered face applies the
  SRD outcome automatically, undoable; the pips remain directly tappable as the override path. The
  quick heal and the at-0 interrupts keep their places; read-only viewers lose the roll entry via
  the glass-case recipe (`.ds-roll`).
- **Rest — the wax-seal moon medallion** (`.rest-medal` / `.rm-coin`, folio.css): a **glyph-only**
  44px struck-metal coin (the combat-economy coin recipe family) bearing the moon glyph, opening
  the Rest modal. It TRAILS the HP tile as a same-row **sibling** — data leads, its control follows —
  with ONE placement rule across breakpoints (the exact desktop DOM, `hp.after(medal)`): on desktop
  a natural inline peer so `[HP][coin][AC…]` read as one row; on phones HP yields it a coin-width +
  gap (`.hdr-vitals .vital-hp` → `flex: 1 1 calc(100% - 52px)`, the coin `flex: 0 0 44px`) so the
  full-size coin shares HP's top row with clear air past the Liquid-Mercury bar — **zero track
  overlap**, the four reference tiles wrapping to their own even row beneath. The verb ("Rest" /
  "Riposo") lives ONLY in the branded folio `Tooltip` (shown on fine pointers, the shared quiet-icon
  tooltip idiom) + the `aria-label` — no rendered locale text, no native `title` — which is exactly
  what keeps the vitals row locale-stable. Light theme kindles the coin to struck gold on the cream
  page.
- **Level Up — pure availability ceremony:** a single gold mono-caps chip beside the lineage
  (`.lvl-chip`) reading the AWAITING level — "⌃⌃ LEVEL {n+1}" / "⌃⌃ LIVELLO {n+1}". The portrait
  seal carries **NO** level-up mark (owner: users won't read a corner gem — the chip alone carries
  availability). The chip routes to the level-up wizard (`/characters/:id/level-up`); its accessible
  name carries the verb AND the level (Label-in-Name), while the visible text is just the level. The
  chip is **absent at L20** (the shipped availability knowledge) — no dangling ceremony when there is
  nothing to advance to.
- **The management chrome lives off the masthead, in the fob family** (see "The sheet management
  chrome" above). On EVERY viewport the masthead carries NO management row — the right deck is the
  vitals strip alone, aligned against the identity. The chrome is a fixed coin: the **Binder's Fob**
  coin chain at the bottom-right on fine-pointer ≥768px desktop, the **Signet** coin above the
  bottom nav on coarse/compact mobile (`useBinderFobHome` picks exactly one). Both are struck-metal
  `.fob-coin` / `.fob-edit`, reachable at every scroll depth by construction.
- **The edit signifier, per home.** Either home lights the SAME ✎ coin amber IN PLACE (activation,
  not wording — same box, zero geometry change), paired with the `.content[data-mode="edit"]` amber
  frame; nothing else stands. Desktop: the fob's ✎ coin stands and lights. Mobile: the Signet's seal
  coin becomes the lit amber ✎ (the chain's Edit coin enters, the seal coin itself exits). There is
  **no sticky "Editing" banner** (deleted with its layout shift) and **no floating deep-scroll
  exit** (both homes are fixed, so the lit coin IS the always-reachable exit at any depth). Esc /
  ⌘E still exit from anywhere.
- **Read-only glass case:** the fob, the Signet, and the Level-Up chip are ALL owner-only
  (`useSheetReadonly`) — a member/DM/admin viewer sees pure identity + vitals (the Rest medallion is
  untouched).

### Inputs / Fields

- **Style:** mono 13px in a carved channel: a recessed gradient fill (`--bg-recessed`) with
  `--elev-recessed` inset shadow and a near-black `--border-strong` edge; 2px radius. Inputs push into
  the page.
- **Focus:** border shifts to `--accent-primary-bright` with a 1px ring and a 24px gold glow stacked on
  the inset shadow.
- **Error / Disabled:** error borders vermilion with a red glow; disabled drops to 40% opacity. Native
  number steppers and search-clear buttons are hidden so browser defaults never leak through.
- **Placeholders:** italic `--text-faint`, tuned to clear AA on the recessed fill (no light-gray
  placeholder).

### Navigation

- **Style:** a persistent left nav rail on `--bg-page` with a hairline `--border-soft` edge; section
  heads carry the gold diamond motif (`.rh-diamond`) shared with content dividers. Mono labels.
- **States:** default / hover / active with the gold voice on the active item; focus paints the halo.
- **Mobile:** the rail is replaced (not shrunk) by a bottom nav + drawer below `--bp-mobile` (720px);
  the game rail drops below `--bp-rail` (1180px). `--safe-bottom` keeps fixed bottom chrome clear of
  notch insets. (Full mobile recomposition in §11.)

**The anchor rule (D1 — replaces "breadcrumbs").** This is a flat-hub app: it has NO drill-down
breadcrumbs, and does not need them (every surface is ≤2 levels deep and names itself). Instead
**every routed surface lights exactly one persistent anchor — a realm tab, the account cluster, or
the footer legal link — except the 404, which deliberately lights nothing** (an unknown location is
anchored to nowhere). The three anchors:

- **Realms** (Characters · Campaigns · Compendium) → the topbar hub tabs (desktop) + mobile bottom
  nav; a realm stays lit across its whole subtree (cockpit, campaign hub, member sheet, compendium
  entry, the creation / level-up flows).
- **The account ring** (`/settings`, `/admin`, `/admin/users/…`) → the **account cluster** (the
  avatar trigger), which persists on desktop AND mobile, so ONE rule anchors both platforms. Lit
  with the SAME gold grammar as a hub tab: a 2px accent underline + the name in accent ink on
  desktop; the avatar ring brightens to accent when the trigger is avatar-only (mobile). The
  account menu marks the current row (`aria-current="page"`), one grammar shared with the palette's
  Section rows (gilt ink + a leading gold diamond).
- **The colophon leaf** (`/legal`) → the footer's "Legal & attribution" link (gilt-current).

**The mobile bottom nav stays exactly 3 realms (D6).** It is a realm _switcher_, not a location bar:
it stays deliberately unlit on the ring / legal pages (orientation there is carried by the
persistent, now-lit topbar avatar + the framed masthead). No 4th "More" tab, ever — it would dilute
the thumb-zone switcher and duplicate the account cluster.

**The Back grammar has three cases (D4), one rule each:**

- **A leaf with a UNIQUE structural parent** → a NAMED Back to that parent ("Back to campaign", the
  compendium leaf's "Back"). NEVER a `navigate(-1)` browser-back mimic here — the destination is
  deterministic, so name it.
- **A MANY-PARENTS leaf** (`/legal` is the only one today — linked from every footer + the login
  page) → history-back-with-fallback via the shared `useBackWithFallback(fallback)` hook: step back
  when there is history, else land on `fallback` (`/` for legal). One canonical hook, never an
  inline copy. **Exception:** legal keeps its masthead Back even though it is anchored (its footer
  link), because that anchor sits below the fold on tall pages.
- **An ANCHORED page** (realms, the ring pages Settings / Admin) → NO Back button. The persistent
  anchor is the way out; a Back would contradict the "anchored pages are tops" grammar. The 404
  keeps its single "Back to your characters" CTA.

### Keyboard shortcuts

One declarative registry (`src/lib/shortcuts.ts` → `SHORTCUTS`) is the single source of truth: the
`?` shortcuts sheet AND the listeners render from it, so they can never drift. `useGlobalShortcuts`
(one `window` listener in `AppShell`) implements the global rows; the cockpit (`useEditModeShortcut`)
and encounter (`useTurnAdvanceShortcut`) accelerators stay route-scoped.

**Touch gate — no keyboard, no advertisement.** Every UI that _advertises_ a key routes through one
seam, `useCoarsePointer()` (`src/hooks/useCoarsePointer.ts`, a `(pointer: coarse)` media query):
the topbar ⌘K hint chip, the palette's `? Shortcuts` footer chip, and the palette's "Keyboard
shortcuts" action all hide on a coarse-pointer device — they'd promise keys a phone doesn't have.
The listeners stay armed regardless (harmless without a keyboard; a tablet with a hardware keyboard
still fires them), and `aria-keyshortcuts` attributes stay (AT-facing, not a visual promise).

| Scope          | Keys                     | Action                                                    |
| -------------- | ------------------------ | --------------------------------------------------------- |
| Global         | ⌘K / Ctrl+K              | Toggle the command palette (fires even under a dialog)    |
| Global         | `/`                      | Open the palette (the "focus search" key)                 |
| Global         | `?`                      | Toggle the shortcuts sheet (layout-independent character) |
| Global         | `g` then `1` / `2` / `3` | Go to Characters / Campaigns / Compendium (POSITIONAL)    |
| Global         | `g` then `s` / `a`       | Go to Settings / Admin (`a` admin-only, else silent)      |
| Global         | Esc                      | Close / dismiss the topmost layer                         |
| Cockpit        | ⌘E / Ctrl+E · Esc        | Toggle edit · leave edit                                  |
| Cockpit        | ←/→ · Home/End           | Move through sheet tabs (while the tab strip is focused)  |
| Encounter (DM) | ← / →                    | Previous / next turn                                      |
| Palette        | ↑↓ · Home/End · ↵ · Esc  | Move · jump to ends · open · close                        |
| Compendium     | Esc                      | Close the open entry back to its list                     |

**The limits (what deliberately gets NO shortcut):** nothing that MUTATES game state gets a
global / single-key binding (End Turn, Rest, HP / resource changes, Level Up, Sign Out are
palette-searchable only — a stray keypress must never alter a live character; the DM ←/→ turn keys
are the one route-scoped, empty-guarded exception). No ⌘1…⌘9 / ⌘W/T/L/N/R / bare-arrow / Alt+arrow
chords (browser + OS shortcuts); never `preventDefault` a key we didn't handle. No digits for
cockpit tabs (the set varies per class). No `[` / `]` (AltGr-only on Italian layouts). **Bindings
are FROZEN** — EN mnemonics / positional digits in both locales (only labels localize); no custom
rebinding UI, no per-user persistence (YAGNI at 6 users).

### Navigation feel (cross-page scroll / focus / overlay-Back)

Cross-page navigation must feel native on this lazy-route SPA. One renderless seam
(`ScrollRestorer`, mounted in `AppShell`) owns it — React Router's own
`<ScrollRestoration>` restores the instant navigation completes, but our heavy
routes are `React.lazy` + Suspense, so at that instant the page is still the empty
`FolioLoader` with no height and the restore clamps to 0. The contract:

1. **Back / forward restores the exact scroll; EVERY fresh forward PUSH starts at
   the top.** POP restoration WAITS (rAF) until the freshly-mounted route is tall
   enough to hold the saved offset — it never restores into the empty loader window.
   A PUSH's scroll-to-top runs SYNCHRONOUSLY in the layout effect — before the
   committed route's first paint — so the destination never flashes at the source
   page's offset. EVERY PUSH tops out — including the combat-pip's sheet→party
   navigation (owner 2026-07-11: the old `?scrollTo` auto-scroll-to-encounter read as
   a jump and is removed; the pip navigates to `/campaigns/<id>` plainly).
2. **A realm switch is rock-solid** (owner, 2026-07-10). Switching between the three
   realm indexes (`/characters`, `/campaigns`, `/compendium`) always lands at the
   top: no per-realm scroll memory, no post-mount restore jump — the framed masthead,
   its crest, and its ink land in exactly the same place every time, and no mount
   animation plays on them (the masthead is static; the content change IS the
   navigation signal). The realm tabs still return to the index's last query
   (`realm-memory` → the compendium's `?type`); Back (POP) still restores exactly.
3. **In-place `?tab` / `?type` rewrites are REPLACE** — scroll and focus untouched.
4. **Focus (a11y).** A PUSH moves focus to the page's `#main` with `preventScroll`
   (the tab-strip anti-jump precedent); a POP never steals focus. The skip-link is
   unchanged.
5. **Back closes overlays, not the page.** `useOverlayBack` (in the ModalShell /
   Dialog / lightbox primitives — never per-dialog) pushes a sentinel history entry
   per open overlay tier; hardware / gesture Back peels the topmost overlay and
   stays on the page. Esc / scrim / close-button dismissal is unchanged (Radix owns
   it). The non-Back retirement `history.back()` fires ONLY when the live entry is
   still the overlay's own sentinel (id-guarded), so a modal cancel/commit can never
   rewind off the sheet — even under a StrictMode/remount double-invoke. Confirm-tier
   dialogs additionally opt out (`backDismiss={false}`) — a flow-owned transient, not
   a navigable surface. See `docs/ARCHITECTURE.md` → the overlay-history seam.
6. **Transition polish.** Restoration composes with the motion grammar with no
   white-flash or double-animate; reduced-motion safe.
7. **A page COMPOSES ONCE — it never reorganizes itself after paint** (nav-feel
   audit, 2026-07-10; the frame-measured "page moves without the user causing
   it" class). Three mechanisms carry it:
   - **Data gates compose the page before it paints.** A surface fed by several
     async sources holds its `FolioLoader` until every INITIAL snapshot has
     landed — the campaign hub gates on the campaign doc AND the chronicle's
     first snapshot (the book-spread arriving after paint glided +226px via
     `AutoAnimateHeight` and shoved four sections down every hub entry). A
     source's ERROR settles its gate (never a wedged loader). Late-arriving
     SUB-content that can't be gated renders a stand-in with the FINAL
     geometry: a party member's doc-loading cluster shows the saved SNAPSHOT
     vitals in the same barred chips the live card renders
     (stale-while-revalidate — values swap in place, zero height change).
   - **The footer never paints mid-load.** The `FolioLoader` WRAPPER mounts
     immediately (only the die waits out the ~250ms delay) as the "content
     settling" marker; `.app-canvas:has(.folio-loader) .site-footer` keeps the
     SiteFooter invisible until the content lands, then it fades in at its
     final position — a cold/deep-link load used to pin the footer under the
     tumbling die and shove it off when the sheet mounted (CLS ≈ 0.08). The
     die's own fade-in rides `--m-normal`, so a near-miss load (content ~50ms
     behind the die) reads as a faint shimmer, never a blink.
   - **Art boxes carry an art-toned base.** A card art area paints the art's
     own darkness while the image decodes (`.cmp-banner`'s `#16100a` base under
     the url) — on light theme the bright ivory tile flashed before the dark
     banner popped in.
     A whole-page swap that moves the persistent footer in the SAME frame as
     the content change (short campaigns page → tall compendium) is NOT a jump
     — nothing the eye tracks moves twice; only post-paint reorganization is.

### Tabs (the character cockpit modes: Play · Spells · Inventory · Features · Bio)

A `TabStrip` on `--bg-surface-2`; inactive = mono `--text-muted`; **active = `--accent-text` label + a
gold underline / seated fill + a carved `--elev-recessed` seat** so the selected panel is obvious and
on-identity. Tab selection is **state, not navigation** — hidden tabs (e.g. Spells for a non-caster)
are simply absent. When the strip overflows (phones; the tightest IT bands) the `.tabstrip-shell`
wrapper paints a soft `--input-fill` fade over whichever edge still hides tabs (`data-fade` l/r/lr,
scroll + resize observed) so a cut tab always reads as "more this way", never as the end of the strip.
Selecting a tab that sits past the edge REVEALS it by scrolling only the strip's own horizontal track
(`useActiveTabScroll` → `scrollLeft`), never the page, and roving-tab keyboard focus uses
`focus({ preventScroll: true })` — so a tap or arrow-key on an off-screen tab can never jump the page
(the same anti-jump seam backs the compendium `.cmp-ribbon`). The same one tab primitive serves the
campaign hub if it adopts tabbed IA — never re-roll a second tab look.

### Modals (`ModalShell`) + command palette

- **`ModalShell`:** centered, `--bg-surface-2`, `--elev-modal`, `--radius-xl`, scrim behind, at
  `--z-modal`; a diamond-rubric Cinzel-titled head; body scrolls; footer actions right-aligned
  (primary = Pressed-Brass). Always commit/cancel; a modal never relocates the realm. **One trap
  owner:** it must trap focus, handle Escape, and set initial focus (WCAG 2.1.2 / 2.4.3).
  - **Scrollable body is keyboard-reachable.** The shared `.modal-body`/`DialogBody` is a
    `max-height: 64vh; overflow-y: auto` scroll region, so it carries an unconditional `tabIndex=0`
    (in `ModalBody`, `src/components/ui/modal-head.tsx`) — otherwise a non-pointer user cannot reach
    it to arrow-scroll (axe `scrollable-region-focusable`, serious). Because a large region is not an
    interactive control, `.modal-body:focus-visible` draws the crisp ring INSET and suppresses the
    global interior focus-wash that would otherwise flood the whole body.
- **Command palette ("Ask the Folio"):** a floating panel (`--bg-surface-2` + `--elev-floating`,
  `--z-overlay`, scrim) with a carved search field and keyboard-navigable result rows (hover/selected
  → `--bg-surface-3` + a left `--accent-primary` marker), section eyebrows, and `aria-current` on the
  active route. Search is bilingual + accent-insensitive + token-based (`matchesSearch`), never raw
  `includes()`.

### Glossary terms (`GlossaryTip`)

- **The ONE plain-language explainer** (P2 — "beginner-friendly, expert-capable"). A D&D term's own
  label becomes the trigger: typography fully inherited, flagged only by a quiet dotted gold
  underline (`.glossary-term`, solid + `--accent-text` on hover/open) and `cursor: help`; the hit
  area is padded outward 6px (negative margin, zero layout shift) so it stays tappable on touch.
- **Click/tap to open** (never hover-only — phones), Esc/outside-tap dismiss via Radix Popover. The
  panel is the branded `.popover`/`.pop-head` recipe verbatim; `.glossary-pop` only caps reading
  width (300px) and lifts to `--z-tooltip` so a gloss opened inside another popover floats above it.
- **Progressive disclosure, strictly:** nothing visible by default; bodies are one breath of plain
  language from the id-keyed `ui/glossary.json` catalogue (EN + IT); the rubric reuses the term's
  existing canonical key. Never annotate prose, collapsed-row chips, or already-explained
  controls.
- **Weapon facts chips ARE glossed** (owner mandate 2026-06-12): inside the expanded weapon card
  (the shared `WeaponFacts` block on Combat + Inventory), every category / property / mastery chip
  whose term carries a real rule (Finesse, Thrown, Versatile, Sap, Vex, …) wraps in a GlossaryTip —
  detail-on-demand inside an already-disclosed detail surface, so collapsed rows stay quiet. The
  chip keeps its per-weapon numbers ("Da Lancio (Gittata 6/18 m)"); the rubric strips them.

### Health + resource bars

- **HP bar = "Liquid Mercury":** a recessed channel (`--elev-recessed`) filled by a 3-stop gradient +
  sheen + glow; thresholds **healthy `--verdigris` / wounded `--gold` / critical `--vermilion`
  (pulses, reduced-motion-safe) / down**; **temp HP = a `--lapis` overlay segment**. (Never override
  `.pg-bar-fill { position:absolute }`.) The `.hp-fill` **`transition: width`** animates genuine HP
  changes (damage/heal) — but on the **roster tile** the HP arrives in two phases (parent doc's
  full-HP placeholder → the `combat/state` subdoc folds the real HP a beat later), so the card
  **renders `.hp-fill` only once that subdoc has hydrated** (`hpReady`): the fill then MOUNTS at the
  real width instead of painting a full bar that slides down. Until then the empty recessed channel is
  the rail and the number shows the honest `—` blank.
- **Spell slots = carved gem sockets:** empty = the `--pip-empty-*` recessed socket; filled = the
  chromatic `--sl-*` gem. **Trackers** = pips when max ≤ 5, a pool bar when > 5 (`Tracker` auto-mode),
  with a die badge + recovery chip (LR/SR).

### "This Turn" action-economy band

A wide band on `--bg-surface-2` above the tabs: three action-economy **struck-medallion coins**
(`Action` = `--at-action`, `Bonus` = `--at-bonus`, `Reaction` = `--at-reaction`), a Movement **spectrum
channel**, a mono Round counter, an `[End Turn]` Pressed-Brass button, and an undo affordance. The economy
is **immediate-commit-per-action-with-undo** — a budget meter, not a queued batch; End Turn is pure
bookkeeping. **End Combat** (`.end-combat`, beside End Turn) is **SOLO-ONLY** (owner-ratified
2026-07-03): in an encounter the DM ends the fight from the hub, so the band hides it entirely and shows
End Turn alone (plus the encounter `data-phase` treatment below). It is a quiet secondary carved chip behind
the standard store-driven `ConfirmDialog`, whose body states the exact scope: round → 1, actions re-armed,
movement refilled, and initiative CLEARED — and NOTHING else (the Action Log keeps its own Clear;
conditions, concentration, HP, and death saves are untouched). It runs the scoped `combatStore.endCombat()`;
the initiative clear flows through the sanctioned explicit-clear path (the character's own `combat/state`
subdoc) and, being solo-only, never touches shared encounter state. **There is no re-arm button** — mis-tap
recovery lives on the coins (below).

- **Solo↔encounter band precedence** (`.turn[data-phase]`; owner-ratified 2026-07-03, the ONE seam
  `useTurnState` → `useSheetCombat`, `turn-state.ts`): when the OPEN hero is a combatant in its encounter the
  solo lifecycle YIELDS — `data-phase` drives the treatment and End Combat is absent. **`gathering`** (pre-Begin):
  Action / Bonus / Reaction coins, Movement, and End Turn all quiet + inert (no turn to spend yet), the ONE call
  to action being the urgent-glow init entry. **`waiting`** (someone else's turn): Action / Bonus / Movement +
  End Turn dim + go inert, but the **Reaction coin carves back to LIVE** (full opacity, spendable via its board
  cards + the coin's re-arm) — RAW reactions happen on other combatants' turns (opportunity attacks, Shield,
  Counterspell). **`my-turn`**: the full live meter. Applied PER-COIN (not on the `.econ` parent) so the child
  carve-out can exceed the faded siblings. **CHARACTER SCOPING**: the status is keyed on the USER's uid, so
  `useSheetCombat` gates it to the open hero (`gc.characterId === open id`) — a SECOND hero of the same user,
  not in this fight, is pure solo (own round, End Combat present) even while another of their heroes is live;
  the topbar pip stays the user-wide signal. **ENCOUNTER ENDED** (DM ends it / PC removed): the sheet returns
  to SOLO AT BASELINE — round 1, economy re-armed, movement full, initiative cleared — via a
  `TurnEconomyProvider` subscription that runs `endCombat()` the instant the open hero's scoped status drops,
  so an open sheet reverts cleanly with no stuck `waiting` state (the encounter WAS the combat; no stale
  pre-encounter solo state resumes).

- **Champlevé coins** (owner pick, 2026-07-03; `.econ-disc` recipe): each economy token is a coined bronze
  disc — a reeded milled edge (`::before`, masked to the outer annulus) and the lucide sigil (Swords / Zap /
  RefreshCw — never hand-drawn) with the slot's hue **poured into the engraving** (no inlay ring): the icon
  is struck in the hue's light ramp step (`--sigil-ink` = `--verdigris-100`/`--lapis-100`/`--vermilion-100`)
  with a dark setting edge + a glassy bloom of the base hue (`--sigil-glow` = `--at-action`/`-bonus`/
  `-reaction`), and the available coin carries a whisper halo of that hue. AVAILABLE = struck bronze;
  committing an action **tarnishes** the coin to a cold dark radial with a dark, hueless sunk sigil (rim
  sheen + halo drop). The coin-metal hexes are recipe-local (no literal hex in the TSX). Same 40px
  footprint — a pure re-skin; the band layout, the label mechanism, and the filter/press behaviours are
  untouched.
- **Movement gold channel** (owner pick D1-inverted, 2026-07-03; `.move-bar-track` + `.move-fill`): a slim
  carved groove holding one left-anchored **gold** fill (width = remaining / max feet) that drains from its
  leading edge as movement is spent — "golden steps" (`--gold-leaf-500`→`--gold-leaf-100`, deep at the
  anchored end brightening toward the leading edge; NO hue-with-fraction shift — gold reads as movement,
  never health, which is why the earlier green→red spectrum was rejected). A small warm dot marks the leading
  edge; engraved 5-ft ticks sit above it. Still ONE `role="slider"` (click / arrow-key / type); the
  remaining-first numeral and its dotted-underline edit affordance are unchanged.

Every economy token (Reaction included) is one button with **two tap meanings by state**: an OPEN coin
is a **board filter** (narrows the Play board to that type; the ACTIVE filter is the **lit-socket**
treatment, in the token's own semantic hue, never monochrome gold — the disc gains a detached signet ring

- halo `--ec`/`--ec-vivid`, and the caption becomes a carved cartouche: tonal pill, full-colour hairline,
  recessed inner shade, no underlines); a SPENT coin **re-arms its slot in place** (owner-ratified
  2026-07-03) — mis-tap recovery WITHOUT a button, registered on the session undo stack like any act
  (the reversal contract) with the standard 5s snackbar. SPENDING still happens on the action board
  (reactions via a card's `React` CTA or the off-list "Mark used" row); only UN-spending lives on the
  coin. The coin re-arms the ECONOMY (`deselectSlot` / `resetReaction`); the RESOURCE (spell slot /
  tracker) is refunded by undoing the commit itself (its snackbar / the standing control / ⌘Z) — the
  two affordances split cleanly.

- **THE COMBAT-CTA GRAMMAR — a CTA states usability NOW; the undo system owns reversal**
  (owner-ratified 2026-07-11; the pure composer is `combatCtaState` in
  `src/features/character/center/tabs/combat-card-helpers.ts` — one seam, every card derives the
  same states by construction). Five states, ONE rule a player learns in one encounter:
  - **Usable** → the enabled carved-brass CTA with its verb (Cast / Attack / Use / React).
  - **Live Extra-Attack swings** → enabled + struck gold (the Extra-Attack bullet below).
  - **Spent** — the card's economy token is gone (this card committed it, its slot is at budget,
    the Attack action is fully swung, or the round's Reaction is used) → the CTA **DISABLES and
    reads "Used"** (`combat.used` — EN "Used" / IT "Usata", agreeing with azione/reazione), the
    reaction contract generalized to EVERY token: when your Action is spent the whole action group
    greys together (BG3's exact read). The **occupant** — the card that spent the token — additionally
    wears the recessed `.cc-btn.is-committed` treatment + the card's gold `is-active` ring, so WHICH
    card spent the token stays legible; this holds **identically across all three groups**
    (owner 2026-07-11): Action / Bonus = the committed card (its `selected.action/bonus` entry);
    **Reaction** = the reaction that spent the round's Reaction (`reactionUsedId`, the off-list
    "Mark used" row included); **Attack group** under Extra Attack = every attack card that rode a
    swing this turn (`attackSwingIds`) — since the swings ride a synthetic Attack-group slot entry,
    not any card's id, the ring is derived from the swing ledger and lights only once the action is
    fully SPENT (mid-swings each swung card wears the struck-gold `is-emphasis` instead, so exactly
    one signal shows at a time; multi-weapon swings ring every weapon that consumed a swing). The
    accessible name mirrors the label ("Used: Fireball" — WCAG 2.5.3); native `disabled` carries the
    state to AT. **No inline cancel exists** — reversal is the reversal contract's undo system
    (snackbar · standing control · ⌘Z), full stop.
  - **Depleted** (no uses left / no cast route, slot still open) → DISABLED with the verb kept +
    the persistent quiet reason line (`.cc-reason` — "No uses left").
  - **Condition-blocked** (Frightened, unproficient armor…) → **dimmed but TAPPABLE**
    (`.cc-btn.is-dimmed` + the condition named in the reason line) — override-first: the table's
    adjudication wins, the post-tap toast is the backstop. The ONLY non-disabled "can't" state,
    because it is the only adjudicable one.

- **Action-group headers are pure rubrics — the coins ALONE carry availability** (owner order 2026-07-10:
  "the coin already shows that"). The board's Actions / Bonus Actions / Free Actions headers are
  diamond · title · rule only — no "1 available" / "spent this turn" hint — and the Reactions header carries
  no Available/Used chip: spent-ness reads on the turn-meter coins (and on the cards' own disabled "Used"
  CTAs), never as duplicated header text.

- **Extra Attack — the struck-gold attack CTA IS the signal, no text anywhere** (`attackBudget > 1`; owner
  rulings 2026-07-10, the BG3 grammar). The turn-meter Action **coin behaves like ANY action** — it spends
  fully on the FIRST swing (plain `open` → `spent`; no `partial` state, no segmented rim ring). While swings
  remain after the Attack action is taken, every attack-capable weapon / War-Magic **card** stays fully LIVE
  and its **CTA turns struck gold** (`.uc-cta.is-emphasis` — the `.cc-btn` swaps `--at-c` to `--accent-primary`,
  so its text-safe band + border logic carry over, and gains the `--accent-glow` rest bloom that marks a
  lit-at-rest CTA). **Deliberate hierarchy** (adjudicated design review, ratified 2026-07-10): on DARK,
  `--accent-primary` is the flat, quieter gold-500 band — a step duller than End Turn's articulated gold-300
  leaf gradient — ON PURPOSE, so kindled attack CTAs read lit-but-subordinate and the End Turn seal keeps
  sole claim to the board's brightest gold. On LIGHT there is only the one AA-safe gold, so the CTA folds
  into the shared `.btn.primary` bright-gilt recipe (deep-gold `--accent-text` ink on the gold-300 leaf
  band) — hierarchy there is carried by End Turn's larger surface area instead of a duller band. The gold
  ALONE says "this swing is already paid
  for" — BG3's exact grammar (the action point is consumed on the first attack; the attack buttons then glow
  with their cost removed; zero text, zero counters, zero per-swing ceremony): **no standing label anywhere**
  — no card marker, no count, no header text. The exact count is discoverable on demand via the CTA's
  **hover title** and its **sr-only status** (`combat.attacksRemainingStatus`). On the **last swing** the
  gold drops and the attack cards enter the CTA grammar's SPENT state like any action (disabled "Used" —
  never a tap that toasts "already used"); under **Action Surge** a completed Attack action returns them to
  PLAIN live instead (a fresh attack costs the second action — gold only while an open action holds swings).
  War Magic is an interaction, not signage: while an Attack action is in progress, casting a qualifying
  cantrip replaces one attack (rides a swing via the existing `ridesPip` path), so those cards wear the same
  gold while eligible. **One evolving feedback, no stacking:** the reversal contract's one-snackbar rule
  gives the whole Attack action a single live toast, its text updating "Longsword · attack 2 of 2", undo
  always popping the LAST swing — each swing is its own stack entry, so deeper swings stay individually
  undoable via the standing control/⌘Z (THE double-attack answer: per-swing undo, not a cancel button).
  Everything is inert at `attackBudget === 1` (most characters): no gold, no title, no ring, the coin
  byte-identical. ONE derivation — `attacksRemainingInAction` in `combat-action-view.ts` feeds the CTA
  state + its on-demand count (golden rule 6); `isPipAttackAction` / `maxReplaceAttackSpellLevel` are the
  shared pip-eligibility predicate the economy provider and the card CTA both read.

### Wizard pick lists — the morph-list (signature interaction)

The ONE F-family picker for every in-wizard choice pool (`WizardPickList` in
`src/features/wizard/pick-list.tsx`; its large-feat-pool sibling `feat-list.tsx`; spells in
`spell-list.tsx`). It implements the Picker Doctrine (Constitution §2.7) as one recipe:

- **Three states, one geometry:** every entry keeps ONE header and ONE body through
  collapsed · reading · chosen. A tap unfolds the reading spread (free browsing — an exploratory
  tap never burns a pick); an explicit **Choose / Learn** commits; the committed row swaps the
  primary act in place for the ghost **"Remove choice"** (the one release affordance — an
  in-place undo, never a separate flow). Reading→chosen keeps the same card height (equal-height
  enthronement) and counter-scrolls pre-paint (`useEnthroneAnchor`) so the tapped spot never moves.
- **Prose vs fact rows:** an option with `description` is read-then-choose; a fact option (skill,
  tool, language, weapon) commits directly on tap — there is nothing to read first.
- **The spell reading spread is a typed document:** the spell list's unfold leads with the
  `UniversalCardFacts` icon-anchored fact rows (range · damage · save · duration · components —
  the SAME glyph vocabulary as the cockpit spell card; casting time + concentration already ride
  the header eyebrow) before the prose, so a player weighs the choice without leaving the row.
- **Asks open under their cause:** a chosen entry's follow-up choices animate open as the
  `.wiz-spread` asks column (gold-thread separator), or — for cross-component cascades — render in
  a `.cause-block` ("From <feat>" rubric) directly beneath the choice that spawned them.
- **Detail on SELECTED only:** no per-row ⓘ; the deeper compendium read (`PickerDetailModal`, the
  one shared detail view) is offered via the open-book affordance that grows on a picked row.
- **Illegal options are absent, not greyed:** the presenter (`lib/views/feat-pick-view.ts` et al.)
  filters out unmet-prerequisite and already-taken options; the only disabled-row note is a
  blocking reason ("Already taken"). Met preconditions are never announced.
- **The commit moment is marked (the Create ceremony):** the wizard's final commit control — the
  creation "Create Character" and the level-up confirm — is the ONE `WizardNav` next button that
  takes `commit`, whose gold seal emits a single gold-leaf **bloom** on press (an expanding, fading
  radial halo on `--ease-settle`, ~400ms; reduced motion collapses it to the existing press). No new
  colours, no confetti; both wizards share the one recipe (`.wiz-pager-btn.commit`).

### Compendium codex — the two-leaf spread (COMPENDIUM-LUX)

The Compendium realm is an open illuminated tome (`.cmp-tome` on the shared `.tome-leaf-surface`
material), and from **1024px it opens as a literal TWO-LEAF SPREAD** (`.cmp-body[data-spread]`, a
`useMediaQuery` render fork in `CompendiumPage`): the **index leaf** (rubric + count · search ·
the facet disclosure · the entry list) on the verso, the **reading leaf** on the recto, joined by
a book-fold gutter (both pages shade toward the fold; a gilt spine thread runs down it). Reading
never hides the index — click entry after entry and the list keeps its scroll; below the
breakpoint the two leaves SWAP in place (the phone model) and the picker's scroll memory restores
the index depth on Back. The recipe's parts:

- **The facet disclosure + LEDGER — one model at every width** (owner, 2026-07-10 ×2): the facets
  start COLLAPSED behind a single `Filters ⌄` chip in the index head (a gilt tally counts the
  active facets while collapsed; the open state is page-level, surviving type switches), and the
  OPEN state is the **facet ledger** (`.cmp-facet-ledger`), not a wrap-wall: an aligned rubric
  rail (LEVEL · CLASS · SCHOOL · PROPERTIES — a `subgrid` column shared by every group; stacked
  above the chips <720px) with each group's chips wrapping beside it in a condensed `.fchip` cut.
  Spell LEVELS render as seal numerals (C · 1–9 — the vocabulary the rows' level seals teach; full
  names stay on `aria-label`) laid on a deliberate 6-column grid (the "All" reset spans two cells),
  so the eleven chips split an even 6+6 band instead of a ragged wrap at both the desktop leaf and
  390px mobile. CLASS chips are uniform 84px cells (no one-word orphan
  rows), and reset chips read short under the rail ("All"/"Tutte" — gender-correct per group noun
  in IT) via `ctx.mode === "browse"` while the cockpit's unlabelled strips keep their own noun
  ("All levels"). Two hard guarantees (the owner's silent-scroll-fail report): the LIST keeps a
  `min-height` floor the ledger can never eat — filtering never buries the results — and the
  ledger's bounded scroll valve (`.cmp-facet-scroll`, `max-height` + a real `overflow-y` with the
  shared edge-fade cue, `useOverflowFadeY`) means that when content must clip, scrolling WORKS. The
  bottom fade runs a **full row deep** (~44px) so the last visible row is always perceptibly dimmed
  even when the phone-height cut lands in a group gap — the "more below" cue can never read as a
  complete panel. The fold opens through the single `grid-template-rows: 0fr → 1fr` reveal, `inert`
  while closed.
- **School enamel chips:** the spell row's classifier chip wears its school's `--school-*` enamel
  (§2 "One hue vocabulary per fact"); rarity/category chips keep their existing tones.
- **The frontispiece** (`.cmp-frontis`, reading leaf at rest): the brand crest as a whisper
  watermark behind the active type's gold seal, name, live count, and the one next action — a
  quiet facing page, never louder than the content it awaits.
- **Seated selection:** the open entry's index row wears the active-tab idiom (accent edge +
  seated illumination + `--text-special` title) with `aria-current` — the index always shows which
  page the book is open to.
- **Leaf chrome by model:** the phone leaf leads with a labelled Back; the spread's recto closes
  with a quiet corner ✕ (the index never left, so "Back" would lie). Esc mirrors both.
- **Keyboard roam:** ↓ from the search field drops into the first result, ↑/↓ roam the rows, ↑
  from the first row returns to search, Enter reads, Esc closes — focus stays on the row after
  opening, so arrow-Enter-arrow reads the codex hands-on-keyboard.
- **One scrolling ribbon row:** the type ribbon never wraps; overflow scrolls with the shared
  edge-fade cue at every width.

The **legal colophon leaf** (`/legal`, `.colophon`) is the `.tome-leaf-surface` material's other
consumer: it spans the **full masthead footprint** — the SAME page-shell width the framed
`<PageHeader>` above it uses, so header and leaf share one edge and read as one bound spread.
Inside, the page is set as **THE COLOPHON SPREAD** (owner 2026-07-10, after three verdicts
against a swimming prose column: "still wastes a lot of space. Do it properly and SOTA!") — the
credits leaf of a fine bound game edition, composed to EARN the leaf's width at desktop instead
of centring one measure in dead parchment:

- **The engraved plaque** (`.colophon-hero` + `.colophon-statement`): the required SRD 5.2.1 /
  CC-BY-4.0 attribution, reproduced VERBATIM as a quotable `<blockquote>`, is the ceremonial
  centrepiece — a centred chapter-head ornament (the site-footer's diamond-on-fading-rule
  grammar) + the display-italic rubric, then a full-width engraved plate (double gilt frame:
  outer edge + inset hairline, the tome's own inked-margin grammar; recessed gilt wash) whose
  inscription centres at a capped ~80ch measure via `max()` padding — the OBJECT spans, the
  text keeps its measure. The register rule holds: the page's one elevated treatment is spent
  on the one legally load-bearing block.
- **The twin deed columns** (`.colophon-licenses`): the two governing licenses (SRD content
  under CC-BY-4.0 · the app under MIT) as equal definition-list columns split by an upright
  fading hairline thread (the one divider rule, turned vertical).
- **The bottom register** (`.colophon-register`): Trademarks · The App side by side, each under
  its own standard `.sec-head` rubric whose fading rule runs to its column edge; every column
  holds a ≤68ch reading measure — a paragraph never stretches across the spread.

The register pairs from **900px**; below it the spread stacks into one clean single column (the
plaque stays the featured head). The spread compresses the page to roughly one viewport at
desktop, so the former sticky "On this page" rail and its scroll-spy were **deleted** — an
in-page TOC had no job left. Contract pinned in `tests/e2e/legal-colophon.spec.ts` + the
legal-page unit tests.

### Rules-text colour grammar — BG3's tooltip craft on the folio's inks (`highlightRulesText`)

**The full-BG3 treatment (owner-ratified 2026-07-16):** when a player reads a spell, feat, trait,
or item, the mechanically load-bearing tokens read at a glance — the way BG3's tooltips ink "2d6
Fire" in fire-orange and a status in its own hue. Rules prose runs through `highlightRulesText`
(`src/components/shared/highlightRulesText.tsx`), a pure, locale-parameterized RENDER-TIME
formatter with four arms:

- **DAMAGE PHRASES → the type's own ink** (`.rt-dmg`): the whole phrase — optional dice + type +
  damage noun (`8d6 Fire damage` · `2d6 fire damage` · `8d6 danni da fuoco` · `danni contundenti`)
  — is one token inked inline in `var(--dmg-<type>-ink)`. That is the SAME per-fact AA ramp the
  verdict chips wear (§11b), so a damage word in prose and its chip agree **by construction** —
  one hue vocabulary per fact, and each theme's ramp is already DESIGNED (luminous inks on the
  dark leather; deep pigments on the parchment). A **multi-type list** ("Acid, Cold, or Fire
  damage" · "danni contundenti, perforanti e taglienti") inks EACH type word in its own hue, the
  damage noun riding the terminal (EN) / leading (IT) type so it reads like the single-type form. A
  type word without the damage noun ("The fire spreads…", "prova di Forza") is never inked — the
  noun context is the false-positive gate.
- **CONDITION names → the condition's own ink** (`.rt-cond`, `var(--cond-<id>-ink)` — the §13
  ramp the condition chips wear). Base names come from the localized catalogue
  (`localizeSrd("condition", …)`), matched with word-initial case flexibility — the corpus writes
  both `the Paralyzed condition` and `be paralyzed`, and in rules prose both ARE the condition
  (verified corpus-wide). Italian's gendered/plural inflections (`Spaventata` · `Privi di Sensi`)
  come from the typed match vocabulary in `src/i18n/rules-prose.ts`.
- **VALUES → the lit special register** (`.rt-value`, `--text-special` — BG3's bright-bold
  numbers): dice (`1d6`, `2d8+3`), the save DC (`DC 15` EN · `CD 15` IT), and measured
  distance/duration (`30-foot` · `10 minutes` · `9 metri`). A **bare integer is never lifted** — a
  number needs dice or a unit to read as a measured fact.
- **ADVANTAGE / DISADVANTAGE → the success/danger inks** (`.rt-adv`/`.rt-dis`) — BG3's iconic
  green/red fork, capitalized defined terms only.

All tokens sit at **font-weight 600** on the serif (never the shouted UA 700), so a lifted token
reads emphasized beside real `**bold**` labels, not louder. The formatter is **opt-in** via
`InlineMarkdown`'s `highlight` prop and wired only where RULES text renders — the compendium
description + "At Higher Levels", every picker detail (`CompendiumDetailBody`), the sheet's
feature/spell/item cards (`UniversalCardDesc`/`Higher`, FeaturesTab), and the level-up reading
prose. **The opt-in seam is what keeps free prose plain, not a "no user text" rule:** a
user-authored CUSTOM/homebrew feature description (FeaturesTab's "custom" group) DELIBERATELY wears
the grammar — a homebrew feature IS rules text, so "8d6 Fire damage" in a player's own feature
scans exactly like an SRD one. Chronicle, session, and player-note prose stays plain simply because
the `highlight` prop is never passed there (omit it and the render is byte-identical). Beyond the
four arms above, three false-positive gates earn their place: a measured number keeps its
decimal/thousand separators as one token (IT "1,5 metri", EN "1,000 feet"); "invisible" inks only as
the capitalized defined term or in creature/condition context (objects wear "an invisible barrier"
without the condition); and Advantage/Disadvantage also ink their lowercase verb-phrase forms ("has
advantage" / "con vantaggio"), gated so only the adv/dis word lifts. All locale words live in
`src/i18n/rules-prose.ts` (typed over `DamageType` × `Locale`); it edits ZERO SRD strings and never
touches `parseInline`. Contract pinned in `tests/unit/highlight-rules-text.test.tsx`;
ink-on-prose-ground AA pinned in `tests/unit/verdict-ink-contrast.test.ts`.

### Bounded prose + bounded lists (the overflow recipes)

Anything user-authored can grow indefinitely; nothing may grow a surface unboundedly. Two
canonical recipes, never re-rolled:

- **Prose → `NoteClamp`** (`src/components/shared/NoteClamp.tsx`): a per-variant max-height cap
  (`note` for at-a-glance card lists, `reading` for opened prose) that only ENGAGES when content
  actually overflows — short notes render untouched, no reserved space. The cut edge fades and a
  quiet "Show more" expands IN PLACE; the page scrolls, never a nested scrollbar (the D27 reading
  rule).
- **Lists → latest-N + "View all"** (the Treasury-log recipe; e.g. `Sessions.tsx`): show the
  newest N entries at a glance, the archive behind one "View all" toggle. New entries prepend so
  they are always visible; recency stays scannable without an unbounded page.
- **Section COUNT → struck gilt MEDALLION** (`.sec-count`, `SectionHeader count={n}`): a NUMERIC
  section count (sessions, notes, chapters) renders as an "illuminated premium" coin docked BESIDE the
  title — in `SectionHeader`'s 4-column `.has-count` grid it sits in **column 3, between the title and
  the fading rule** (NOT a bare number floating in a thin far-right box, which read weak on parchment).
  The coin is a deliberately-designed object in BOTH themes: a saturated gilt radial fill from
  `--accent-primary-bright` (bright gold on dark, rich gold-500 on light), a full-colour gold border, a
  top emboss + gold glow, and an **engraved inner ring** (`::before`); the numerals take `--accent-text`
  (gold-leaf-300 on dark, deep gold-leaf-900 on light) → gilt-on-dark / dark-gold-on-gilt, never a flat
  box. **Counts only** — a string TOTAL/hint ("120 gp", "168 mo in totale") stays on `meta`, which keeps
  the far-right `.sec-meta` slot (the two are mutually exclusive per header).
- **Hub section → `SectionPanel` with a CHEVRON disclosure** (`src/features/campaigns/SectionPanel.tsx`):
  a static `SectionHeader` rubric (diamond · title · count medallion · rule — never a control) over an
  always-rendered fixed panel (the at-a-glance signal), and the bulky secondary list folded behind a
  **compact, centred chevron expander**. A collapsible section is **ONE card** (`.section-card` — the same
  `.info-card` struck-vellum surface, trailing margin dropped) that ENCLOSES the fixed panel + the
  disclosure + the expandable detail: the chevron docks at the card's **BOTTOM EDGE**, inside the surface,
  a hairline divider above it; the detail (`.section-detail-wrap`) reveals **IN PLACE inside the SAME card**
  (it grows taller) through the single `grid-template-rows: 0fr → 1fr` reveal — **never** a strip floating
  in the gap beneath the card (owner: the gilt knob must sit ON the card, not float below it). A
  NON-collapsible section (no `detail`) renders its children directly, keeping whatever surface they bring
  (Chronicle's book-spread, DM Tools' card grid) — EXCEPT a bare-content section (Sessions' rows, the
  notes board's empty line), which passes `framed` so the SAME `.section-card` frame holds without a
  chevron: a 0/1-item Sessions/Notes otherwise floated card-less on the backdrop while its populated
  sibling wore the card (the Treasury empty-ledger bug class; pinned in `section-panel.test.tsx`). The
  control (`.section-disclosure`: ≥44px tap target) is **icon-only, with no
  visible label** — the header count medallion already carries the number — just a refined gilt `knob`
  struck from the SAME illuminated-premium coin material as `.sec-count` (`.section-disclosure-knob`: a
  saturated `--accent-primary-bright` radial fill, full-colour gold border, top emboss + gold glow, and
  an engraved `::before` ring; the `--accent-text` chevron reads on BOTH themes where the old worded pill
  failed) that brightens on hover/focus and rotates a satisfying 180° when open. The per-section worded
  intent ("Show transactions (12)" / "Hide transactions") rides as the button's `aria-label` (a11y only)
  — never visible text (owner explicitly rejected worded disclosure pills: "just an intuitive chevron in
  the box"). The disclosure is on the CARD, never the header (owner: a toggle on the header "is NOT
  intuitive"). The keyboard focus halo is moved onto the knob so it matches the compact affordance. Sticky
  open/closed per `campaignId × sectionId`.
  EVERY desk card rides this one chrome — Chronicle, Sessions, Shared-notes, Treasury, **Access**
  (the compressed invite + lock), and **DM Tools** — via the optional `className` prop (the full-width
  bands pass `lg:col-span-2`); no parallel section component exists.
- **Campaign-hub MANAGE band → read-frequency dashboard** (`CampaignHubPage.tsx`, `.campaign-hub-grid`):
  below the always-open full-width PLAY band (the Party), the MANAGE sections sit in a two-column grid
  (`grid-cols-1 lg:grid-cols-2`, `gap-x-6 gap-y-12`, `items-start`) read top-to-bottom in vertical
  read-frequency bands: **Chronicle** (full width) → **Sessions | Shared-notes** (the latest-item +
  add pair) → **Treasury | Access** (the compact utility pair) → **DM Tools** (full-width foot,
  role/danger only — renders null for a non-manager, so the page just ends at the utility pair with no
  phantom cell). Chronicle + DM Tools span both tracks via `lg:col-span-2` on their own panel root;
  every grid child is pinned `min-width: 0` so a wide child never forces a sideways scroll.
- **Chronicle book-spread** (`.chronicle-spread`, `.chronicle-rail`): on the full-width hub band the
  reading view is a book SPREAD — a reading column (its prose still clamped to the ~72ch `--measure`
  reading measure; the extra band width buys the rail, NOT longer lines) beside a vertical chapter
  **rail** in the freed gutter (`lg:grid-cols-[1fr_16rem]`, normal-flow — NOT sticky (#64: a sticky rail
  clipped under the topbar), current chapter highlighted with an
  accent tint, click to jump). The rail appears only for a multi-chapter log (`[data-spread]`) at `lg`;
  below that it collapses away and the inline top-navigator (prev/next + jump select) serves mobile.
  (The recommended of the taste fork; the alternative — a centred narrower manuscript `mx-auto`, no
  rail — was set aside.)

### The register ladder (premium treatments are earned)

Elevated registers exist on a ladder — gilt frame (hero surfaces, §7 law 1) → **hero altar** (the
wizard gallery's reading destination / chosen entry: altar-scale seal, eyebrow, gold ceremony) →
**carved cartouche** (the ability tile; the active economy token's caption) → **lit-socket** (the
active economy filter: detached signet ring + halo in the token's own hue) → **gold-thread** (the
asks-column separator). Each treatment is **earned by information** — it marks a decision the
player is making or live state they must read — never spent on decoration (Constitution §4.16;
golden rule 19, docs/GOLDEN_RULES.md). Adding a premium register to a surface requires naming the information
that earns it.

### The ornament vocabulary (BG3 identity T5)

The app's one ornament grammar, adapted from BG3's menu language into the committed **lapidary**
identity (sharp facets, 0–4px radii): everything is **geometric** — faceted diamond nodes and
gems, tapered hairlines — never organic foliage; everything is vector (SVG data-URIs / pure CSS),
theme-tintable, crisp at 1x and 2x. The grammar's placement rules:

- **Ornament marks the START of a rubric, a rail-head, slot/charge pips — and, since the
  full-BG3 push (owner-ratified 2026-07-16), the CORNERS of the earned hero frames.** A faceted
  diamond leads a section head, caps a rail, or sits in a socket; straight runs, divider centres,
  and scrollbar ends stay QUIET. A border is a plain hairline; a divider fades to nothing at its
  tips. Panel corners stay quiet EXCEPT on the three reliquary registers (below) — resting cards
  and ordinary panels never take corner goldwork. (The old free-floating corner diamonds, selection
  crests, divider-centre nodes, and scrollbar ends stay removed — the reliquary corners are a
  designed frame treatment on earned surfaces, not a return of scatter ornament.)
- **Ornament marks STATE.** Selection is the `--frame-selected` silver-over-bronze gradient frame
  (BG3's silvery-over-bronze adapted to the gold-leaf ramp via the per-theme
  `--metal-silver`/`--metal-bronze` pair) on the wizard hero altar + the chosen plaque, and the
  seated illumination + accent edge on the active compendium ribbon tab. At-rest surfaces are
  never decorated with selection ornament.

The pieces and their ONE home (`src/styles/folio.css`; the metal tokens in `src/index.css`):

- **Reliquary corners (the Gilded Reliquary grammar — the full-BG3 push, owner-ratified
  2026-07-16; two-tone strike + discreet-weight refinement wave 2, 2026-07-17).** The worked-gold
  corner caps on the app's HERO frames: a small faceted corner gem seated on the border corner and
  ONE short tapered hairline arm along each edge ending in a diamond finial — BG3's mitred-corner
  menu framing struck in the lapidary vocabulary, at BG3's actual quietness. **The discreet-weight
  rule (owner, 2026-07-17 — "should be a bit more discreet … is it normal they oppress the
  text?"):** the ornament must NEVER compete with content ink — the corner unit stays a small
  jewel (gem ≈ 7px, arm reach ≈ 33px at the desktop 48px render), and the old second "echo"
  hairline + mid-arm diamond are DELETED (they reached within ~14px of the title's cap height —
  frame and content ink must never share air). The two-tone strike carries the wow at the small
  size: a small jewel that reads as worked metal beats a large flat one. EXACTLY three earned
  registers wear it (Constitution §4.16):
  the framed realm masthead (`.page-head.framed::before`), the gilt-framed hero band
  (`.folio-panel.gilt-frame::after` — cockpit identity), and dialogs (`.modal::after`).
  Mechanism: ONE per-theme 500×500 SVG (`--frame-ornate`, `src/index.css`) rendered through
  `border-image: var(--frame-ornate) 40% / 48px / calc(48px * 0.2 + 0.5px)` on an overlay
  pseudo — corner slices carry the ornament, edge slices are EMPTY so the element's own 1px
  border remains the quiet run, and `border-image` proportionally shrinks corners on small boxes
  (phone mastheads, `sm` modals). **The fitting rule (owner, 2026-07-17 — "rilegatura"):** the
  goldwork sits ON the frame like a bookbinding corner fitting, never floating inside the panel.
  The SVG's arm/gem centerline lies at 20% of the corner tile, so the border-image OUTSET of
  `20% × 48px + 0.5px` seats the arms exactly on the host's 1px border stroke and the gem's
  center on the stroke's corner vertex — the diamond caps the corner where the two arms merge;
  the host's `--radius-xl` (8px) rounding tucks under the gem. Outset ink is paint-only overflow
  (no scrollbars), but it CAN be clipped by the host's own child-paint clipping — hero hosts
  therefore carry no `overflow: hidden` (`.modal` scroll-clips on `.modal-body`; the masthead
  crest self-clips via `mask-size` on an `inset: 0` element; the full-bleed `.modal-head`
  gradient band rounds its own top corners to the card radius so no child paint overruns the
  corner arc).
  **The metal is DIMENSIONAL, not line-art (the two-tone strike):** every member carries a
  light/shade pair, built the same way the panel embossing works. Dark = raised struck gold —
  the gold-300 body sits on a near-black under-shadow seat offset below-right (+1.5,+2 SVG units
  ≈ half a screen px) with a faint gold-200 top-edge glint above-left; the corner gem is truly
  faceted (gold-200 lit top facet / gold-500 shaded lower facet / gold-700 core). Light INVERTS
  to the letterpress logic (like `--engrave-title`): members are pressed INTO the vellum — a
  warm-cream understroke below-right (the groove's lit far wall) + a faint umber upper shadow
  wall under the bronze-700 body; the gem is an intaglio pair (gold-900 shaded top wall / lit
  bronze lower wall / near-black pit core). Construction rule (guard-pinned in
  `ornament-vocabulary.guard.test.ts`): the geometry is mirrored to the four corners UNFILLED
  first and toned AFTER (offset tone layers over the whole four-corner closure), and the gem
  facet group is placed per-corner unflipped via `use x/y` — toning inside the mirrored unit
  would flip the bevel light upside-down on the bottom corners. Decor only:
  `pointer-events: none`, no layout, no animation. ⚠️ The SVG data-URIs carry explicit
  `width`/`height` attributes — an SVG with no intrinsic size defaults to 300×150 and
  border-image slices sample phantom regions; the slice is a PERCENTAGE for the same reason.
- **Engraved ceremonial titling** (same push) — the Cinzel register reads STRUCK into the plate
  via the per-theme `--engrave-title` text-shadow (`src/index.css`): dark = a tight shade seat +
  faint warm gold underglow; light = a letterpress bright understroke + umber lift. Applied to
  `.page-title`, `.modal-title`, and the cockpit identity h1 (`.folio-panel.gilt-frame h1`) —
  NEVER gradient text (§7 hard ban holds), and the light on-art rules (higher specificity) still
  win where a title sits loose on the backdrop.
- **The modal-head seat rule** (same push) — `.modal-head`'s bottom border is the `.sec-rule`
  idiom instead of a wall-to-wall line: a gilt-touched hairline that fades at both tips
  (a to-right gradient through `border-image … 1` on the 1px bottom border).
- **Panel smoke / morning shade** (same push) — the `.folio-panel` material pseudo carries an
  edge vignette as its top background layer: dark pools candle-smoke black toward the lower edges
  (top-lit, recedes into shadow); light pools a whisper of warm umber (sunlit-from-above vellum,
  designed not adapted — a black vignette would read as grime). Darkening only, so the
  composite-contrast floor (brightest stop) is untouched and light ink at edges only gains
  contrast.
- **Section rubric** — the leading `.sec-diamond` (an 8px faceted diamond, deep gilt on cards,
  bright gilt on the candlelit backdrop) marks the head; the `.sec-rule` hairline fades at BOTH
  tips and is **nodeless**, parameterized by `--rule-c` (light theme and econ-typed headers only
  re-tint the parameter). The leading diamond IS the divider's marker; tab-seat rules
  (`.cmp-ribbon-rule`) and the disclosure docking hairline stay nodeless too.
- **The diamond-marker family** — the rail-head node (`.rh-diamond`), the spell-slot / charge
  gem pips, the scene-break diamond, and the footer node: the same faceted-diamond mark struck at
  different scales, geometric and theme-tintable, always leading or seated in what it marks.
- **Scrollbar** — jewelry-thin, app-wide (`src/index.css` §Scrollbars): transparent track and a
  ghost thumb (`--text-muted` at 40%, a 4px core in a 10px rail) warming to gold on grab; the
  scroll buttons are hidden. Firefox gets `scrollbar-width: thin` + `scrollbar-color` behind the
  `@supports not selector(::-webkit-scrollbar)` fence — an unfenced `scrollbar-width` would
  DISABLE the whole `::-webkit-scrollbar` recipe in Chromium ≥121. `<html>` OWNS the viewport
  scrollbar (`overflow-y: auto` + `scrollbar-gutter: stable`): the gutter is the single space
  reservation, and owning the scroll on `<html>` (rather than letting it propagate up from
  `<body>`) stops a Radix dialog's react-remove-scroll lock (`body { overflow: hidden }`) from
  removing the viewport scrollbar — otherwise the thumb blinked out on ⌘K-palette/dialog open
  and back on close (the lock still holds; its wheel/touch blockers are JS, not the overflow).

### Surface hierarchy (never skip the ramp)

| Layer           | Token                                       | Used for                                                |
| --------------- | ------------------------------------------- | ------------------------------------------------------- |
| Page            | `--bg-page` + `--vellum-grain`              | the app background (fixed)                              |
| Panel / rail    | `--bg-surface-1`                            | left HUD, right HUD, topbar                             |
| Content surface | `--bg-surface-2`                            | center panel, cards, modal body                         |
| Raised inset    | `--bg-surface-3`                            | nested headers, portrait well, hover                    |
| Recessed        | `--bg-recessed` / `--input-fill`            | carved channels: inputs, HP/resource sockets, pip wells |
| Overlay         | surface-2 + `--elev-floating/modal` + scrim | popovers, palette, dialogs                              |

A card on a rail (surface-1) is surface-2; a control inside a card is recessed. This one ordering
holds on every screen.

**Candlelit / morning-light translucency (BG3 identity epic T3 + the daylight-sibling rebuild).**
The OUTERMOST layer of each screen — the surfaces sitting directly on the page field:
`.folio-panel` panels/rails, the framed `.page-head` band, the cockpit game `.rail` (the topbar
already ships its own 92% + blur glass) — renders at `--panel-alpha` so the atmospheric backdrop
glows through it in BOTH themes: dark `0.9` (BG3's exact shipped panel alpha; the candle glow) and
light `0.94` (the gentler MORNING-LIGHT sibling — the ivory panels must stay unmistakably bright,
so the daylight scene only breathes at the edges). NESTED content surfaces (cards, inputs, wells,
modals, the `.cmp-tome` photo material) stay fully opaque — **translucency never compounds**: at
most ONE glow-through layer under any pixel of text. The `.folio-panel` material sandwich (dark:
`panel-leather.webp` under a 62% gradient copy; light: the owner-P8 `panel-light.webp` cream grain
under an 80% copy — the higher share because the grain band sits below the ivory surfaces) renders
on a `::before` at that opacity (CSS has no per-layer background alpha and the tiles are opaque —
the pseudo is what lets texture and glow-through coexist); the framed head + rail derive
translucent gradient stops via `color-mix(… calc(var(--panel-alpha) * 100%), transparent)`.
**Composite contrast floor:** `--text-muted` on the brightest translucent tone (surface-2),
composited over the brightest glyph-scale backdrop region at `--app-bg-art-opacity`, must clear
4.5:1 — dark ≈ 4.95:1 at 0.9, pinned by the "candlelit translucency composite floor" guard in
`tests/unit/verdict-ink-contrast.test.ts`; light's deep espresso inks on the 0.94 ivory composite
hold >10:1 (the honey plate can only darken the composite, which only helps dark-on-light).

## 6. Do's and Don'ts

### Do:

- **Do** carry the committed parchment + gold-leaf skeuomorphic identity in both themes; warmth comes
  from surfaces, serif type, gold accents, and carved depth, not a tinted near-white body.
- **Do** give every surface a carved (`--elev-recessed`) or embossed (`--elev-resting`+) recipe; never
  ship a flat fill.
- **Do** set gold text in `--accent-text` (deep gold) and domain-colored labels in their `-ink`
  variant; keep the raw saturated hue for borders and icons only.
- **Do** use mono for numbers/labels/counts (`.tnum`), display serif for names/titles, body serif for
  reading copy capped at 72ch.
- **Do** keep chips as 4px facets; the only true 999px pill is the settings switch track.
- **Do** give every interactive element default/hover/focus/active/disabled (plus loading/error where
  relevant), and provide a reduced-motion alternative for every animation.
- **Do** hold gold-leaf to its single brand voice (primary action, selection, focus, edit); let
  semantic and domain pigments carry the rest.

### Don't:

- **Don't** flatten, de-parchment, or strip the gradients and carved/embossed depth in the name of
  "modern minimalism." Identity-preservation wins.
- **Don't** drift toward the lazy warm-neutral "AI cream default"; the vellum here is deliberate and
  committed, not an accidental tinted off-white.
- **Don't** make this look like a generic flat SaaS dashboard (Linear/Notion gray-on-white),
  Material-flat, neon/cyber, or corporate fintech navy-and-gold.
- **Don't** set gold text in `--accent-primary` (the yellow-on-yellow failure) or render a saturated
  domain hue as small label text.
- **Don't** render any user-facing text below 10px (`--text-micro`).
- **Don't** round chips into pills or use literal hex values in component code.
- **Don't** use a `border-left` greater than 1px as a decorative colored stripe; the only sanctioned
  thick left edge is the Universal Card's 3px action-type economy marker, which carries real meaning.
- **Don't** assume a Tailwind utility overrides `.btn`. ⚠️ **FOOTGUN:** `.btn { all: unset }` resets
  _every_ property (including `visibility`), and `folio.css` is **unlayered** — so it outranks Tailwind's
  `@layer utilities`. A utility like `invisible` / `hidden` therefore **silently loses on a button** (it
  works on a plain `<div>`, so the bug hides). When you need a utility to win on a `.btn`, add an
  **unlayered, ≥`.btn`-specificity** rule in `folio.css` (the shipped `.btn.invisible { visibility: hidden }`
  is the canonical example — it keeps the footprint so a contextual mode can hide a CTA jump-free), or use
  an inline `style`. Verify in the running app, never by reading the className.

## 7. The Seven Craft Laws (per-surface enforcement)

The north star in one line: **an heirloom illuminated tome made interactive** — struck brass,
gold-leaf, and pigment on aged vellum, with the **information density of D&D Beyond** and the
**tactile gilded craft of Baldur's Gate 3 menus**. Premium on sight, in both themes, without
sacrificing legibility or speed. Every surface (light + dark, mobile + ultrawide, EN + IT) must pass
all seven laws. On conflict with a "modern-minimal" instinct, the committed-skeuomorphic identity
**wins** — deepen the tome, never flatten it.

1. **Material depth, not flat fills.** Every panel/card/control reads as a struck tile on parchment:
   layered carved/embossed elevation (`--elev-*`), a top sheen (`--emboss-sheen`), a real cast shadow
   over the field. No surface is a plain rectangle of flat color. Hero surfaces (cockpit identity
   band, home hero, campaign banner, modal heads) carry a **gilt frame** (a gold-leaf edge, §5 —
   `.folio-panel.gilt-frame`), not just a 1px border.
2. **Gold-leaf is gilding, not just text color.** Use gold as a _material_: gradient gilt on seals,
   active states, section heads, and frames, with an inner highlight + deeper edge. Reserve thin gold
   _outlines_ for quiet chrome. Never let gold read as flat mustard.
3. **Atmosphere under content.** No barren flat field. The `--vellum-grain` texture + (where specced)
   painterly backgrounds under app-owned scrims give every page air and depth. Content always sits on
   a legible scrimmed zone (AA-guaranteed); art enriches, never competes.
4. **Light = dark's equal, designed not adapted.** Light is aged-gilt vellum with the SAME depth
   budget as dark: gilt-cream surface gradients (never plain white), the warm-near-white emboss
   sheen, full-color borders, real umber cast shadows. If a light surface reads flatter or cheaper
   than its dark twin, it FAILS. (Detail in §10.)
5. **Density with air (the D&D Beyond bar).** Pack the useful-at-a-glance info, but with deliberate
   rhythm: the spacing scale, clear sectioning (diamond rubric + the one divider rule, §5 "The
   ornament vocabulary"), no clutter, no buggy
   overflow at ANY width (test 360 → 2560). Progressive disclosure for the rest — on demand, never by
   default.
6. **One vocabulary, zero one-offs.** Reuse the shared recipes/primitives (buttons, inputs, badges,
   `UniversalCard`, panels, seals, dividers, `OptionGrid`, `ModalShell`, `InlineEditable`, trackers,
   `WizardPickList` — the one in-wizard choice-pool picker, and the bounded-overflow recipes
   (`NoteClamp` for prose, latest-N + "View all" for lists — see §5)).
   A bespoke restyle of an existing job is a **defect**. Same component → same look everywhere, so a
   fix in one place propagates.
7. **Motion + affordance are part of the build.** One coherent motion language (`--m-*` durations +
   `--ease-settle`/`--ease-standard`), reduced-motion-safe, render-isolated (no jank). Every clickable
   thing shows `cursor:pointer` + a gold focus halo + a tactile press; nothing non-interactive lies
   with a pointer. (Detail in §9.)

### The "wow on sight" test (the bar, per surface)

For each surface, in BOTH themes + mobile: would a first-time player react _"this looks like a
premium published app, better than D&D Beyond"_? And does a lazy user get everything at a glance
while a curious user can drill in without dead-ends? If either answer is no, it is not done.

### Hard bans (reconciled with the committed identity)

- No flat barren fields; no plain-white light surfaces; no gold-as-flat-mustard.
- No `border-left/right` colored side-stripes as accents; no gradient _text_; no decorative
  glassmorphism.
- No permanent edit-input boxes around at-rest values; no `Math.random` for any deterministic visual
  (tints must be derived, not rolled).
- No surface that reads cheaper in light than dark; no clutter/overflow at any tested width.
- No text below the 10px `--text-micro` floor; no literal hex in component code.
- No em dashes / marketing buzzwords in UI copy; button labels are **verb + object**; EN + IT both
  natural (test every term "cool AND natural in Italian too").

## 8. The Identity Guard + "Deliberate Choices, Do NOT Fix"

**The identity guard (binding).** The candlelit struck-gold skeuomorphism (carved/embossed depth
over the owner-generated atmospheric art, translucent leather panels, gold-leaf accents, champlevé
enamel sigils, the Gilded Plate type triad — Cinzel / Alegreya / Source Serif 4) is a **deliberate,
committed identity** — NOT the "AI cream default." No review, audit, or design-skill pass ever
flattens, de-parchments, or "modernizes away" the folio look. Every change improves craft,
consistency, hierarchy, a11y, responsiveness, or richness **within** the identity. Light must reach
**dark-mode parity** in depth/richness, never be flattened toward it. Generic anti-parchment
heuristics (including those a design-critique tool emits) are **overridden** by this guard.

**The do-NOT-fix list.** These are things a naive reviewer (or an automated design-critique pass)
would flag that are **intended**. Filing them as defects violates the identity guard.

1. **Candlelit translucent panels over atmospheric art + struck-gold gradients + carved/embossed
   elevation everywhere** — the committed skeuomorphic identity (the dark flagship glows over the
   owner-generated painted darkness; light wears its golden-hour parchment). Never flatten or
   de-parchment.
2. **The Cinzel / Alegreya / Source Serif 4 triad** (ceremonial Cinzel titling on the four
   ceremonial surfaces, Alegreya headings + body prose, Source Serif 4 tabular-lining numbers and
   uppercase labels) — the deliberate "Gilded Plate" type system (owner-ratified 2026-07-02), not
   "old/heavy."
3. **Lapidary square avatars + sharp/small radii (0–4px) + chips as 4px facets** — the locked
   lapidary geometry. The round-avatar / pill-chip "fix" is explicitly rejected.
4. **The single 999px pill = the settings switch track** — the one sanctioned pill.
5. **Gold-halo focus rings** (`--illumination` + `--focus-ring`) — the deliberate "Gold Halo" pick,
   not "too much glow."
6. **Gold-on-gold defenses** (`--accent-text` deep-gold for all gold text; the brand mark shifting to
   the deep ramp under light) — these are _correct_ Rule 1/2 compliance, not findings.
7. **Skeuomorphic "lit" states** — the gilded End-Turn climax, the editing-pill amber gradient +
   breathing dot (`.editpill.editing`), the struck-medallion economy discs + the gold movement
   channel, the runic login sigil — all deliberate craft, all reduced-motion-gated. Not "too loud."
8. **CreationWizard selected tints** — the fix direction is to route selection through the carved
   `.opt-cell` gold-leaf (more depth), **not** to neutralize it.
9. **Login `GoogleIcon` literal brand hex** (`#4285F4` …) — a brand-guideline requirement; a
   sanctioned exception to the token-only rule.
10. **DmTools showing unbuilt tools as muted Phase-2 badges** — correct stub-signalling, not a defect.
11. **`·` middot separators / engraved mono letter-spacing on invite codes** — idiomatic folio.
12. **The geometric ornament vocabulary** — the leading section-rubric diamond over its nodeless
    tip-fading `.sec-rule` divider, the diamond-marker family (rail-head node, slot/charge gem
    pips, scene-break, footer node), the silver-over-bronze `--frame-selected` selection frame,
    the jewelry-thin scrollbars, and — since the full-BG3 push (owner-ratified 2026-07-16) — the
    **reliquary corner goldwork** on the three earned hero frames (framed masthead, gilt hero
    band, dialogs), the **engraved ceremonial titling**, the tapered modal-head seat rule, and the
    panel smoke/morning-shade vignettes (§5, "The ornament vocabulary"). Ornament marks STATE,
    leads a rubric / rail-head / slot pip, and caps an EARNED hero frame's corners; "strip the
    flourishes" is rejected.
13. **The settling motion grammar** — entrances / presses / expansions ease INTO place on
    `--ease-settle` with no overshoot (BG3's "settles, never travels", §9); overshoot survives only
    on `--ease-pop`, reserved for warning/urgent pops. "Add bounce / a snappier spring" is rejected.

> **The one genuine violation that looks like a misfire but is NOT** (always fix it): sub-10px
> arbitrary text literals (`text-[0.55rem]` etc.) breach the project's own 10px legibility floor.
> Raise them to `--text-micro`.

## 9. Motion + Feedback

**Principle:** motion conveys **meaning** (commit · recede · illuminate), never decoration, and it
**settles, never travels** (the BG3 grammar): short fades with tiny translates that ease INTO place.
One orchestrated, staggered entrance per view (~100ms stagger step); purposeful micro-interactions
on interactive elements.

- **Easing:** `--ease-settle` `cubic-bezier(0.22,1,0.36,1)` — the primary settling voice for
  entrances / presses / expansions: fast start, long soft landing, **no overshoot**; `--ease-pop`
  `cubic-bezier(0.34,1.56,0.64,1)` — spring overshoot, **reserved exclusively for warning/urgent
  notification pops** (BG3 keeps bounce for alerts, never chrome — currently the warning/error
  toast entrances); `--ease-standard` `cubic-bezier(0.4,0,0.2,1)` — exits / fades;
  `--ease-instant` linear — micro.
- **Durations:** `--m-instant` 90ms (toggles, pips) · `--m-fast` 160 (hover/focus) · `--m-normal` 240
  (card expand, slot commit, tab switch) · `--m-slow` 380 (modal in) · `--m-page` 540 (route).

| Interaction               | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| Gilt glint (hover)        | The STRUCK-GOLD tier only (`.btn.primary` / `.btn.brass` / `.endturn` — the earned metal CTAs, never the quiet tiers) plays ONE quiet specular sweep on hover: a narrow diagonal `--glint-ink` band on an overlay `::before`, transform-only (GPU, no layout), 900ms on `--ease-standard` (the deliberate BG3 pass; the why-this-easing forensics live in the folio.css comment). One-shot by construction: the transition lives only on the hover rule, so un-hover resets instantly + invisibly and re-hover replays. Gated on `[data-motion="auto"]` — under reduced motion the band never moves. Guard: `interactive-kindle.guard.test.ts`. Companion rule — "warm to the touch": interactive hover KINDLES toward candle-gold (opt-cell, tabstrip, secondary btn, pick-row, cmp-tab), never a plain neutral fill                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Masthead mount            | **NONE — deliberately static** (owner, 2026-07-10). The framed mastheads (roster, campaigns, compendium, settings, admin, legal) play NO mount animation: on a realm switch the band, crest, and ink land in exactly the same place with zero motion, and only the words change — the content swap IS the navigation signal. Any animation here reads as the page "refreshing" on every switch (the 2026-07-09/10 masthead-jump bug); a source-level unit guard (`page-header-crest.test.tsx`) pins that no `.page-head*` rule carries an `animation:`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Progressive disclosure    | card height + opacity on `--ease-settle`/`--m-normal`; chevron rotates; content fades in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| HUD resource feedback     | pip/socket fills/empties + a brief `--illumination` pulse; the HP bar animates fill; **critical HP pulses (reduced-motion-safe)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Action commit             | `[Use]` = physical press (translateY + `--elev-recessed`) on `--ease-settle`; slot fills + a gold glint; **undo** reverses on exits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Concentration             | the `focus-mark` (concentric rings) pulse — distinct from the `✦` magic-mark                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Missing initiative        | the un-rolled init chip (`.vital-init[data-urgent]`) earns a gold `--accent-primary` ring + the shared `save-pulse` opacity breath while in combat and the d20 is unentered — reduced-motion-safe; clears the instant a roll lands. The glow is shown for EVERY chip the viewer may write (`urgent = canEdit && unrolled`): a player sees only their own, a DM/admin sees the whole table light up — making it discoverable they can roll for all (the write is rules-authorized cross-member); a BLANK monster typed-init chip (the DM cleared it during gathering) wears the same cue, so the Begin-turns "rolled/total" gate's missing entry is findable at a glance. The shared `InitVital` roll-to-total tile lives in its OWN light leaf module (`src/features/campaigns/init-vital.tsx`) so the always-eager `CombatPip` topbar widget imports it SYNCHRONOUSLY — its loud-tier popover renders at final size on open (no `React.lazy`/`Suspense` empty-then-jump flicker), with the rolled-for character named in the popover rubric (`Initiative · {name}`). The edit input **seeds from the current committed roll ONLY when that roll belongs to the CURRENT fight epoch** (`rollBelongsToEpoch`/`rollForEpoch`, `src/lib/combat-state.ts`) — a NEW encounter (epoch bump) makes a prior-fight roll read as un-rolled, so the input starts EMPTY across the sheet, the tracker and the pip (one gate, D9 — owner 2026-07-03); WITHIN a fight it still pre-fills on re-open (selected on focus → overtype to re-roll), an **unchanged blur re-commits the same roll** (never a destructive reset), and only an **explicit clear** empties it (owner 2026-06-30) |
| Turn hand-off (encounter) | End Turn is OPTIMISTIC: on click the sheet publishes the advanced encounter status (`advanceGlobalCombat`/`optimisticPipAfterAdvance`, `turn-state.ts`) so the band flips to its not-your-turn `waiting` state in the SAME tick — the Action / Bonus / Movement coins dim + go inert (the **Reaction coin stays LIVE** — RAW off-turn reactions) and the `[End Turn]` button quiets (grayscale, non-interactive) on `--ease-settle`, the own-turn controls vanish, and the topbar pip flips gold→quiet — instead of waiting on the `runTransaction` server round-trip (the "End Turn feels dead" bug, owner 2026-07-03). The real snapshot reconciles; solo play is unchanged (no encounter → no `waiting`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Search / command palette  | open = scale + fade `--ease-settle`; top-anchored so results grow downward only; type filters instantly; rows keyboard-navigable; close on Esc/scrim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Toasts / undo             | slide + fade (`UndoToasts`) on `--ease-settle`; warning/error variants enter on `--ease-pop` (the one sanctioned overshoot); the 5s undo window                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Login hero                | The splash is deliberately **STATIC** at its composed framing (owner 2026-07-07 — the old pointer-parallax drift was removed: input-coupled decorative motion reads as the page dragging under the cursor, off the calm identity). "Alive" is carried by the one-shot `brand-intro` reveal + the ambient loops (halo breathe, constellation orbit, gleam sweep), all reduced-motion-safe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Loading                   | ONE idiom — the **gilt d20 `FolioLoader`**, a solid 3D icosahedron that tumbles like a thrown roll (canvas: 20 lit facets, frame-rate-independent, static under reduced-motion). Used for EVERY content wait (auth · lazy routes · sheet · roster · campaigns); the **die is delayed ~250ms** so warm/sub-second loads show nothing, while the WRAPPER mounts immediately (the "content settling" marker — reserves the region height + keeps the SiteFooter hidden until the page composes; see Navigation feel §7). The die fades in on `--m-normal`, so a near-miss load reads as a shimmer, never a blink. Cold start = the matching inline gilt-d20 boot splash (index.html, removed on mount). NO skeletons; data fills from the warm cache                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |     |

**Global kill-switch.** `[data-motion]` is a pure mirror of the OS `prefers-reduced-motion`
setting (there is **no in-app animations toggle** — removed 2026-06-07), written to `<html>` by the
`index.html` boot script + kept in sync by `uiStore`; it collapses all animation/transition to ~0ms.
**Any looping cue (critical-HP pulse) must be reduced-motion-safe** — no infinite motion under reduced.

## 10. Light ↔ Dark Parity

1. **Structurally identical.** Dark and light share **identical token names**, component recipes,
   surface hierarchy, elevation semantics, motion, spacing, radii, and typography. **Only the values
   inside `[data-theme="dark"]` / `[data-theme="light"]` differ** (driven by `uiStore.applyTheme`).
   Switching theme is a value swap with zero structural change — because components reference token
   _names_, never hex.
2. **Same world, two times of day.** Both are warm gold-leaf on vellum: dark = ink/charcoal vellum;
   light = the **golden-hour sibling** of dark (the binding OWN-36 mandate) — NOT a bright/pale
   light-mode and NOT a parchment-first system. Light keeps dark's exact grammar (art at full
   prominence, glowing gold, deep gradients, carved depth) and remaps only the base key:
   near-black → warm-parchment field, with dark espresso ink on bright ivory cards. The deep-parchment
   field (`--bg-page #bca268`) opens a wide value canyon so the bright ivory cards (`--bg-surface-1
#f6ead0`) float off it with real drama — the light-mode answer to dark's near-black-field pop.
   Since the daylight-sibling-plates batch this is LITERAL: the three scene plates each ship a
   candlelit night original (dark) and a daylight twin of the same room (light), riding the
   per-theme `--asset-home-hero` / `--asset-login` / `--asset-campaign-backdrop` tokens (§13) — the
   theme switch swaps the hour, never the world.
3. **Theming is a derivation architecture.** Dark is the base grammar; each theme is a palette-key
   remap, so future themes drop in cheaply. Light's depth is engineered, not adapted: light inverts
   shadow direction (warm-umber insets + a warm-near-white `--emboss-sheen` highlight), and ships its
   own `--gilt-gradient`, `--surface-sheen`, `--gilt-glow`, and `--illumination`.
   - **EMBER PENUMBRA — light's lit-magic grammar (owner-ratified 2026-07-11).** On dark, magic is
     luminance: a gold bloom on near-black. The bright vellum field has no headroom above ivory for a
     literal bloom, so a lit gilt control reads as **HEAT** instead — a saturated struck-gilt fill over
     a warm burnt-umber shadow that pools BELOW the control (the parchment toasts around a hot object);
     the glow is DARK, not bright ("glow-below"), the light sibling of dark's bright-on-black bloom. The
     shared **`--ember-umber`** token (a `122, 74, 16` comma-triplet, light-block only, composed at any
     alpha via `rgba(var(--ember-umber), α)`) is the pooled tone, with two companions —
     **`--ember-edge`** (the deep struck-gilt border ringing a solid-gold small control) and
     **`--ember-seat`** (the near-black seat-shadow triplet directly under a struck control); the hot
     gilt fill stops ride the `--gold-leaf-200`/`-400` ramp steps. The light `--gilt-glow` /
     `--gilt-glow-sm` aura tokens and `--illumination` carry it, so every light surface that consumes
     them (hero bands, portrait wells, caster tiles, seals, selected tiles) toasts by construction,
     alongside the emblematic controls (Heroic-Inspiration chip/coin, the kindled attack + primary CTA
     family, the LEVEL chip, the Rest moon, dashed add-affordances, compendium seal/empty leaf, slot &
     tracker pips, the scorched crest). Scale rule: large controls take the two-stage penumbra, small
     controls (pill/coin/pip scale, where a tinted wash vanishes) go FULL solid gilt + a tight ember.
     The whole grammar is light-scoped/light-only, so **dark output is byte-identical** — proven by the
     diff (every hunk is inside a `[data-theme="light"]` selector or the light token block). Pinned by
     `tests/unit/light-theme-backdrop-legibility.guard.test.ts` (the ember-penumbra grammar block).
   - **Glow ≠ fill — `--accent-glow` is the glow-only gold.** The UI-fill/ink gold (`--accent-primary`)
     is AA-constrained: on light it is a deep umber (`#4a380c`) so small gold UI-text clears 4.5:1 on
     the bare deep-parchment field. A deep umber **cannot glow** on cream, so every halo/drop-shadow
     routes through the dedicated **`--accent-glow`** token instead — a BRIGHT struck gold
     (light `--gold-leaf-300`, dark `--gold-leaf-500`). On light the `--gilt-glow` / `--gilt-glow-sm`
     aura tokens now spend `--accent-glow` only on the tight struck-gold hairline and pool the
     `--ember-umber` heat below (the ember grammar above); the magic-mark drop-shadow still blooms
     `--accent-glow`, so gilt accents (section diamonds, the identity medallion, total chips, the `✦`
     magic mark) read struck instead of smearing brown. On dark both tokens resolve to bright gold and
     `--gilt-glow*` are undefined (dark surfaces glow via their own recipes), so dark output is unchanged.
     **CONVENTION (light-polish pass, 2026-07-10):** every base-rule (non-light-scoped)
     selected/lit surface TINT (`color-mix(… N%, var(--bg-…))`) and outer BLOOM
     (`0 0 Npx color-mix(… N%, transparent)`) mixes from `--accent-glow`, never
     `--accent-primary` — dark output is byte-identical by construction, and light renders
     struck gold instead of the gray-umber wash (the flat Heroic-Inspiration panel /
     fork-tab / path-plaque failure). `tests/unit/light-theme-backdrop-legibility.guard.test.ts`
     #9 mechanically pins the **selected/lit surface tints mixing toward `--bg-`** subset
     (the umber-wash failure it was written for); the outer blooms follow the same
     convention by construction. Deliberate deep tints live only inside
     `[data-theme="light"]` rules. The gilt-SELECTED light family (facet
     chip · wizard path plaque · wizard fork tab) shares one band: a struck
     `--accent-primary-bright` gradient + full-strength gold edge (+ `--gilt-glow-sm` on
     plaque-scale elements); the light long-rest CTA wears the same bright-gilt band as
     every light primary (`.btn.primary`) instead of the umber `--rc` slab (guard #10).
4. **The two-token vivid/ink contract.** Gems, pips, economy discs, and color chips are **bright +
   glowing in BOTH themes**. Each domain hue ships two tokens: the **vivid base** `--x` is the 3:1
   graphic (chip border / icon / gem body), and the pinned **`--x-ink`** is the ≥4.5:1 label. Dark
   uses mid (`-300`) hues that are already bright; light brightens its graphic hues (and adds the
   `--at-*-vivid` set for pure graphics) while keeping the `-ink` AA-deep — so chips read bright in
   light without sacrificing legibility.
5. **Text on the atmospheric backdrop.** Where text sits directly on the prominent atmospheric art
   (not on a card), light uses the BG3/DDB pattern — **bright ink + a dark halo** (`--text-on-
backdrop` + `--text-on-backdrop-title` + `--text-on-backdrop-danger` for error/required ink, the
   halo = the single `--on-art-halo` token, via the `.on-art` / `.on-art-scope` recipes). The halo
   was RE-STRUCK for the daylight sibling plates: the original four-direction 1px offset copies were
   a hard stroke — right on the borrowed night art, but on the honey/amber morning plates every
   loose label read as OUTLINED "game subtitle" text. It is now a tight dark micro-edge (the a11y
   separation the bright ink needs on a sunlit patch) plus a soft lifted umber shadow, so on-art
   text reads as gilt lettering catching light. The bright fill pops on dark patches; the dark edge
   separates it on the sunlit ones and is what clears the a11y gate. (Dark already uses light
   loose-text, so `.on-art` is light-only.)
   - ✅ **GUARDED MANIFEST-WIDE (ON-ART-INK, 2026-06-12).** This used to be the #1 recurring light
     bug ("apply the recipe when you add loose-on-backdrop UI" relied on memory; the member-sheet
     back button + the wizard page-turn captions/facet chips shipped dark-on-dark). It can no longer
     ship unnoticed: **`tests/e2e/on-art-ink.spec.ts`** sweeps EVERY surface in the shared manifest
     in light theme, finds each visible text element that sits on the RAW backdrop (no opaque
     background in its ancestor chain up to `<body>`), and FAILS unless its computed ink is
     light-legible (relative luminance ≥ 0.45 — the on-backdrop inks pass ≥ 0.65, every standard
     light ink fails ≤ 0.25). Text inside any card/leaf/chip/input is never probed (no false
     positives). A red `on-art ink:` test = put the element in the canonical treatment, never a
     one-off colour:
     - loose **text** → the region under `.on-art-scope` (preferred), or the `.on-art` class on the
       **leaf** element (context-fixed surfaces only — never a wrapper);
     - a **ghost button** → automatic inside `.on-art-scope` (one recipe, surface-excluded), or the
       explicit `.btn.ghost.on-art` leaf (login hero);
     - **facet chips** (`.fchip`), the wizard **page-turn captions**, **`.text-error`**, and the
       **RunicEmptyState** family are already in the scope vocabulary (mechanism pins in
       `on-art-scope.guard.test.ts`).
     - **A gilt OBJECT is SELF-BACKED — never background-dependent (gilt-coin rule, 2026-06-30).**
       A struck "coin" (the section count **medallion** `.sec-count`, the disclosure **knob**, any
       seal) is a premium gilt register (§ register ladder) and must read on a card OR on the raw
       backdrop **by itself** — its legibility may never depend on what is painted behind it. The
       trap is a TRANSLUCENT gilt fill (`color-mix(…, transparent)`): fine on dark (the page bleeds
       through and the BRIGHT numeral reads), it shipped BROWN on light — the candlelit art bled
       through the faint disc and the DEEP-gold numeral died on it (owner-reported, recurring). The
       fix is **not** an on-art ink flip (a coin is an object, not loose text): strike the light
       coin as a genuinely **OPAQUE struck disc** — an opaque `--gold-leaf` background-color base
       carries the ink, a bright top sheen reads as metal, the `--accent-glow` halo kindles it. This
       had a guard FALSE NEGATIVE — the on-art-ink walk skips any background-image as a "self-
       surface", so a translucent gilt gradient counted as backing it did not provide. Closed: a
       dedicated **gilt-coin disc probe** in `on-art-ink.spec.ts` flags any coin on the backdrop
       whose disc is not opaque enough (alpha ≥ 0.8) AND whose ink is not light-legible; the opaque
       struck-disc recipe is mechanism-pinned (`light-theme-backdrop-legibility.guard.test.ts` #7).
     - **Material `::before` counts as backing (probe refinement, 2026-07-11).** The daylight-sibling
       panel/card material (§13) paints its ivory fill on a full-bleed `inset:0` negative-z `::before`
       pseudo (so the candlelit backdrop glows through uniformly) and leaves the element's own
       `background:none`. `getComputedStyle(el)` cannot see a pseudo, so the surface check ALSO probes
       `::before`/`::after` — but only a genuine BACKING layer (generated + absolutely/fixed
       positioned + full-bleed, with an opaque fill). The ONE full-bleed pseudo that is never a
       surface is `body::after` itself — it IS the raw art this guard protects — so `<body>`/`<html>`
       pseudos are excluded. This closed a FALSE POSITIVE (every rail number inside a `.folio-panel`
       read as "on raw art" though the panel plainly backs it).
   - ⚠️ **The INVERSE leak — never hardcode `.on-art` in a SHARED component** (`src/components/**`).
     A shared leaf renders in BOTH contexts: on the creation art it would read fine, but inside a
     modal/card the white-ink + dark-outline backdrop treatment leaks onto the plain surface (owner-
     reported: the savant spellbook hint inside the level-up modal, 2026-06-10). Context decides —
     rely on the `.on-art-scope` ancestor flip (it restyles loose text per context and never matches
     surfaces). Guarded: `on-art-scope.guard.test.ts` fails on any hardcoded `on-art` under
     `src/components/`.
6. **AA engineered per token, per theme.** The `-ink` variants, the deepened light muted/faint inks
   (tuned to clear AA on the deep field), and the light `--focus-ring` = gold-900 all hold the AA +
   10px floor in both themes. The semantic mapping (action=verdigris, fire=red, …) is theme-invariant.
   - ✅ **The FIXED-DARK SOCKET class — a control that stays dark in BOTH themes must ink itself in a
     FIXED light token, never a theme-flipping one (dark-socket rule, 2026-07-08).** A pill/chip that
     hardcodes a dark fill is INVISIBLE to the per-token-pair contrast guards: those pin ink/surface
     pairs that BOTH flip, so a dark socket painted with `--text-secondary` (light-on-dark → readable in
     dark; in light the ink flips to a dark espresso and dies on the still-dark socket, ~1.3:1) ships
     unnoticed. The combat-pip "Open {hero}" destination chip (`.cp-dest-chip`) shipped exactly that
     ("Apri Lyra ›" unreadable in light, owner-reported). The fix is a chip-local themed pair
     (`--cp-dest-bg` = the darkest stop + `--cp-dest-ink` = a fixed parchment, both `index.css` theme
     blocks) so the label reads on the socket in EITHER theme (~9.4:1). Guarded: `verdict-ink-contrast.
test.ts` READS the live `.cp-dest-chip` declaration out of `folio.css`, resolves its `color` /
     `background` tokens against EACH theme block, and fails unless the ink clears 4.5:1 on the darkest
     stop in BOTH themes — so reverting to a flipping ink re-fails CI; a real-Chromium proof lives in
     `combat-pip-dest-contrast.spec.ts`.
7. **Forbidden:** hard-coding a theme value; a light-only/dark-only component; `--accent-primary` for
   text; `--accent-primary` for a glow/halo (use `--accent-glow` — accent-primary is the deep-umber
   AA-fill on light and dies as a glow); skipping the surface ramp; a surface that reads flatter/cheaper
   in light.

8. **The light-craft batch — nine parity fixes (2026-07-09).** A 5-auditor sweep found nine light
   surfaces reading below the dark flagship's register; each was re-struck LIGHT-ONLY (dark
   byte-unchanged), and the recurring root cause was almost always the deep-umber `--accent-primary`
   used where a glow/gilt was meant (rule 3 above). The fixes, all value-level in `index.css` /
   `folio.css`:
   - **Empty pips read HOLLOW, both themes.** The light empty/spent pip (`--pip-empty-*`) was a solid
     muddy-khaki disc while dark's is a hollow gold ring — the hollow-vs-filled SEMANTIC drifted.
     Light now strikes it as a near-transparent centre (the card ground reads through = "empty") ringed
     by a full-strength deep-gold hairline, so a spent pip reads unfilled in both themes.
   - **Economy coins + the wizard forward-nav disc + the selected pick glow gilt on cream.** The coin
     lit-socket aura (`.econ-disc` `--coin-halo`), the "Continue" seal (`.wiz-pager-seal.gold`), and
     the selected `.wiz-card[data-chosen]` / `.lvl-pick.selected` all mixed/haloed with the deep
     `--accent-primary`, so on cream they read flat/olive/GREYER-than-unselected. Each now tints from
     the bright gold-leaf ramp (`--ec-vivid` / `--lvl-accent-bright`) and haloes through
     `--accent-glow` (`--gilt-glow*`) — selection ALWAYS outshines non-selection; the coin sits in its
     teal/blue/red socket; the forward disc reads as THE primary action.
   - **Error/404 field + medallion.** The fullscreen crash net (`.crash-field`) grounds on a designed
     field with an edge vignette instead of a flat mustard slab; the `RunicEmptyState` medallion gets a
     tinted inset SOCKET disc + full-strength ring + a kindled `--accent-glow` aura so it holds contrast
     on light ground.
   - **Floating chrome separates.** Light `--elev-floating` gains a hairline umber definition ring +
     deepened drops so menus/popovers lift off the parchment.
   - **The backdrop dissolve.** `[data-theme="light"] body::after` carries a vertical `mask-image` that
     dissolves the candlelit art's lower band into `--bg-page` so it melts into the field with no
     horizontal tone-step (dark blends naturally against near-black). This is a per-pixel MASK dissolve,
     NOT a change to the owner-ratified 0.55 art opacity.
   - **On-field inks + foil.** The light muted/faint/secondary inks are deepened one crisp step (loose
     labels on the bare deep-parchment field read crisp; every AA pin only gains headroom). The on-art
     gold-foil section titles (`.on-art-scope .sec-title`) take a tight crisp outline + warm sheen
     instead of the body-tuned soft-blur halo that smudged, and the treasury GP-total cartouche
     (`.on-art-scope .badge.muted`) self-backs on a warm plate + gilt edge so its gold reads struck, not
     outlined-and-floating.

> **Do not re-wire the intentionally-orphaned `--surface-sheen` / `--gilt-gradient`** as a blanket
> second sheen — a stacked second sheen caused a documented gold-corner artifact. They are consumed
> by specific signature recipes only.

## 11. Mobile Design Language

The same system, **deliberately recomposed** (not reflowed). Breakpoints are a single source:
`--bp-mobile` 720px (HUD rails → bottom nav + drawer; header wraps) and `--bp-rail` 1180px (the right
HUD / game rail drops). CSS `@media` can't read a `var()`, so the literal px in folio.css media
queries mirror these tokens — keep them in lockstep so ribbon-hide / drawer-show / header-wrap all
flip at one coherent width.

- **Hierarchy preserved — regions recompose, never vanish:**
  - **Top:** context (character + campaign chip) + search.
  - **Vitals strip (always on screen):** HP (tap = control) + AC + the **This Turn** economy
    (`⚔ / ✦ / ⟲ / ◇` + Movement). This is the deliberate mobile fix over D&D Beyond — the two
    table-critical things never leave the screen.
  - **Center:** the active tab's content, full-width cards (progressive-disclosure stacks).
  - **Bottom nav (`.m-nav`):** the current view's primary destinations (Play · Spells · Inventory ·
    Features · More), Play orb centered. It is a realm/destination switcher, not a shrunk rail.
  - **Right HUD → a one-tap "Resources" bottom-sheet; Left HUD → a one-tap "Stats" sheet.**
- **Touch:** targets ≥ `--touch-min` 44px; `--safe-bottom` (notch inset) respected on all fixed
  bottom chrome; pages add `--m-nav-h` (58px) + `--safe-bottom` as bottom padding so fixed chrome
  never occludes the last row. The PWA dock (offline strip / install prompt, `.pwa-dock`) joins the
  same contract dynamically: it publishes its measured height as `--pwa-banner-h` on `<html>` and
  the AppShell adds it to that bottom padding (0 when hidden), so the legal footer stays readable
  under every fixed bottom bar; on phone the dock rides above the `.m-nav` whenever it is mounted.
- **The realm bottom-nav shows on EVERY signed-in route** — wizards included (owner fb3: "wizards
  are routes, not jails"); the login screen (no signed-in shell) is the only exception.
- **No page-level horizontal scroll, ever.** Two code-level defenses: `body { overflow-wrap:
break-word }` (src/index.css) so user-authored prose — a pasted URL in a chronicle/note, a long
  unbroken name — wraps instead of widening the page (the owner's campaign-hub sideways-scroll
  root cause), and a row that can't fit a wide control WRAPS it onto its own line instead of
  crushing its label into a sliver (the `.set-row` phone rule, folio.css). A third, combat-scoped
  defense: on the tight 390px phone topbar the brand die+wordmark leaves no slack for the global
  combat pip, so while a live pip shares the bar (`.topbar:has(.combat-pip-wrap)`, ≤640px) the topbar
  runs a COMPACT-BRAND treatment — the **"d20 Folio" wordmark never vanishes** (owner 2026-07-09:
  a lone die glyph "looks very unprofessional"); instead everything else compresses FIRST, so the
  full lockup stays legible down to 360px: the bar tightens its own gap + padding, the die/wordmark
  drop one size step, the icon-only search pill tightens, and the pip sheds its DESTINATION LABEL
  (the portrait/party seal + chevron still wear the identity; the full "Open {name}" survives in the
  chip's aria-label). The wordmark-never-hidden invariant is pinned by
  `tests/unit/topbar-brand-never-hidden.guard.test.ts`. All are
  **gated** by `tests/e2e/mobile-layout.spec.ts`: it walks the whole surface manifest at 390×844
  and asserts no horizontal overflow + the m-nav present, fully in-viewport, and cleared
  (`--m-nav-h` padding) on every non-`shellless` surface (the app-root crash fallback renders above
  the router, so it carries no nav — the overflow check still applies; `/legal` now mounts in a
  public shell above the AuthGuard, so it carries the nav like every other page — owner 2026-07-07)
  — a new surface inherits the gate automatically.
- **Tokens unchanged:** the carved-brass material, motion, and type render identically at touch
  scale; reduced-motion honored. Mobile is a **layout recomposition of the same components**, not a
  separate design.

## 12. Edit-in-Place Doctrine

Values are **clean display at rest** (optimal typography, no permanent input chrome) and become
editable **on intent** — never wrapped in standing edit boxes.

- **`InlineEditable` default affordance = `quiet`:** reads as plain text at rest; the carved input +
  gold override-border + reset reveal on hover / `:focus-visible` / activate. `box` is opt-in only
  for genuine form contexts.
- **Quiet TEXT fields have ZERO layout footprint** (`[data-affordance="quiet"][data-kind="text"]` —
  the cockpit name, campaign title, session label). The at-rest box is exactly the text (no
  padding/border), so edit-mode line breaking matches read mode by construction, and the hover/focus
  frame is drawn entirely in `box-shadow` (fill halo + ring) — revealing it never moves a pixel and
  never adds scrollable overflow. This is also the root fix for the edit-mode name-fold bug: any
  horizontal padding on the atomic at-rest button makes Chromium under-measure its intrinsic width
  by a sub-pixel, so content-sized ancestors box a multi-word name one fraction too narrow and it
  folds onto two balanced lines despite free space ("Coralino di / Sanvaldo"). Numeric/select chips
  keep the padded carved recipe (single tokens — they can never fold). Guards:
  `combat-header.test.tsx` (seam) + `tests/e2e/edit-mode.spec.ts` "Edit-mode name layout" (real
  layout measurement, IT-seeded). The cockpit name also steps its type DOWN in the 768–1023px header
  band (`text-xl sm:text-2xl md:text-xl lg:text-2xl`): the ceremonial Cinzel `font-title` is a wide
  caps-only face, so the 38px `text-2xl` page-title size fits one line only where the identity has
  room (stacked below `md`; wide from `lg`) — in the `md`→`lg` flex-row band it shares width with the
  vitals deck (capped at 65%) and must drop to 28px `text-xl` or it folds beside a half-empty
  header (gated by the "md band (800px)" case).
- **Edit mode** (the frame/banner) is the explicit "I'm authoring" overlay; within it, fields still
  render as polished display with a _subtle_ editable affordance until focused/activated.
- **Override-first throughout:** every derived value shows its computed value, is overridable in
  place, and offers reset-to-computed. An override-able value is not "done" until the default
  **auto-computes**. (This is the supreme product rule — derive by default, expose a manual override
  everywhere; see the Product Constitution.)
- **Editing happens IN PLACE.** Never force users to a sub-page to edit a visible field. Use
  `InlineEditable` / `OverrideControl` everywhere a value is shown.
- **Prose editors are CONTENT-SIZED, not fixed-row boxes** (the session-summary `.sess-notes-edit`
  recipe; D28). A `<textarea>` for authored prose (a session recap) uses `field-sizing: content`
  capped at the SAME reading bound as its rendered read view (`NoteClamp --reading` →
  `min(420px, 55vh)`), off a ~2-line floor and with `resize: none` — so the read↔edit swap keeps ONE
  footprint and the box never resizes/jumps (the owner's "traumatic" report; past the cap it scrolls
  natively while authoring). Focus is placed with `preventScroll` (no scroll-yank). The three states —
  empty / read / edit — share one structure: a body region over a right-aligned `.sess-notes-actions`
  row whose height is identical whether it holds one button or two, so the affordance never resizes the
  surface. Prose commits explicitly (Save / Cancel — safe against blur-loss); only short
  always-complete tokens (the session NAME) commit-on-blur via `InlineEditable`. Guard:
  `tests/e2e/session-edit-no-jump.spec.ts`.
- A page-level edit toggle gates campaign-hub editing (cleaner separation of concerns for multi-actor
  Phase 2) rather than the character-scoped global sheet mode.

### The read-only glass case (member / DM / admin sheet viewers)

A read-only sheet (a teammate's sheet via `MemberSheetView`, the admin console's `AdminSheetView` —
both render the ONE shared `CockpitView`) is a **specimen under glass**: every piece of STATE stays
fully legible (round, initiative, economy tokens, movement remaining, spell slots, trackers,
conditions, concentration, defenses, the dying strip's death saves), and every **pure-commit
affordance** — a control whose only job is to mutate — is **removed, not merely disabled**. Two
seams enforce it, both required:

- **Behavioral:** the `characterStore` mutators AND the `combatStore`'s player-driven mutators
  (`selectAction` / `useReaction` / `endTurn` / `setMovementUsed` / deselects) no-op while the
  store's `readonly` flag is up; hydration/display setters (`setRound`, `setInitiative`,
  `resetCombat`) stay open so a viewer mirrors the member's persisted state. Pinned by
  `combat-store.test.ts` → "read-only backstop".
- **Visual:** `CockpitView` marks its root `data-sheet-readonly`; the folio.css **glass-case
  recipe** hides the commit affordances by their recipe classes — the authoritative selector list
  is the READ-ONLY GLASS CASE block in `src/styles/folio.css` — while the card's damage-formula
  chips, status chips, and pips remain, because they are the information a reader came for. The
  HUD rails additionally stay `inert` (focus/interaction backstop), and the turn meter's roll
  widget + movement slider lock (`ThisTurnTracker`). Pinned by
  `member-sheet-readonly-header.test.tsx`.

A new mutating affordance on any cockpit surface MUST either wear one of the recipe classes above or
gate itself on `useSheetReadonly()` — a live-looking control on a read-only sheet is a defect.

## 13. Asset Contract

The app references every asset path and **falls back gracefully** (the gilt-vellum gradient) until
art is dropped in — a missing file is never a broken image. North star for painterly art: **D&D
Beyond splash + Baldur's Gate 3 menus** — warm amber/umber + one lapis accent; **no text, no faces,
no central clutter; edges recede to shadow; the middle stays calm and low-contrast**. Ship **WebP**
(q75 + sharp_yuv for the scene plates — visually transparent at 1:1; ~q80 for textures) within each
size budget (free-tier / offline PWA — every byte lands in the guarded precache, so compress to the
visually-transparent minimum first and re-baseline the ceiling only for deliberate richness).

**Asset intent** (the aim, so no future agent has to reconstruct it):

- **Provenance.** The plates are **owner-generated** from orchestrator-authored prompts, delivered
  in owner batches: P1–P3 the material set (leather / dark vellum / candlelit study), P4–P6 the
  chrome plates (glowing-grimoire login, war-table campaign default, engraved crest), P7 the
  ornament reference board, P8 the light panel material, P9–P11 the daylight sibling plates
  (daylight study / daylight war table / dawn grimoire login), and Batch 4 (the full-BG3 push,
  `~/Documents/d20-folio-bg3-asset-prompts.md`) — P12–P23 shipped so far: the v2 repaints of all
  three scene-plate pairs (study pair, login pair, war-table campaign pair) at BG3 main-menu
  richness (same rooms, richly painted edges, calm centres preserved), plus the NEW realm
  scenes — the compendium's Grand Library pair (P18–P19), the roster's Hall of Heroes pair
  (P20–P21), and the wizards' Ritual of Making scriptorium pair (P22–P23).
- **North star.** The D&D-Beyond-splash / BG3-menu grammar stated above — warm amber + one lapis
  accent, a calm dark centre, edges that recede. Every new plate holds to it.
- **Daylight Sibling Plates (owner-ratified, the light-theme art direction).** Each of the three
  SCENE plates is a per-theme PAIR: the candlelit night original (dark) and a daylight twin of the
  SAME room (light) — same composition, same calm-centre rules, lit by morning sun — so switching
  theme reads as _the same world at a different hour_, never a different app. The pair rides ONE
  per-theme token each (`--asset-home-hero` / `--asset-login` / `--asset-campaign-backdrop`,
  `src/index.css`: dark values in `:root`, light re-points in `[data-theme="light"]`), and because
  CSS only fetches the value a rule actually applies, **each theme downloads only its own plates**.
  The material textures (panel leather/light, vellum/parchment) were already per-theme.
- **Light theme never blocks on art.** The light theme is designed from tokens and must never wait
  on new art.
- **Ornament reference board (not a bundled asset).** The P7 ornament style board (corner
  flourishes, centre-diamond dividers, finial end-caps, a quiet-run frame) lives in the owner's asset
  folder as the **drawing reference** for the in-code ornament vocabulary — it is never shipped in the
  bundle; the ornaments are hand-authored in code/SVG, and the board only guides their look.

| Asset (exact path)                                                              | Size / format        | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/assets/backgrounds/home-hero.webp`                                      | 1672×941, < 320 KB   | App-wide atmospheric backdrop (`--asset-home-hero`), behind every page — the DARK plate of the pair. The Batch-4 v2 candlelit-study plate (owner-generated P12, full-BG3 push 2026-07-17): richly painted edges at BG3 main-menu confidence — a three-flame brass candelabrum with warm gold bloom left, gold-tooled bookshelves + suspended orrery right, armillary sphere and grimoires below, one lapis inkwell accent — while the middle half stays dead-calm warm near-black (centre mean `#0d0602`, σ4 — panels and text sit there). Ships ~80 KB at q75 + sharp_yuv. **Shipped.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `public/assets/backgrounds/home-hero-light.webp`                                | 1672×941, < 320 KB   | The **daylight sibling** of `home-hero.webp` (owner-generated P13, Batch-4 v2 2026-07-17) — the LIGHT theme's app-wide backdrop via the light `--asset-home-hero`. Unmistakably the same v2 study at morning: the candelabrum unlit by a high sun-flooded window, the same shelves/orrery/armillary richly painted, golden shafts full of dust motes, the middle half a calm honey mid-tone (centre mean `#bb843d`, σ23 — never near-white, ivory cards still pop), one lapis inkwell remnant. Renders native at the same 0.55 prominence, dissolving into the field at its foot. Ships ~113 KB at q75 + sharp_yuv. **Shipped.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `public/assets/backgrounds/login.webp`                                          | 1672×941, < 320 KB   | Sign-in splash — the DARK plate of the pair, via `--asset-login`. The Batch-4 v2 grimoire-altar plate (owner-generated P14, full-BG3 push 2026-07-17): the ancient open grimoire RIGHT-of-centre is genuinely the light source of the whole painting — golden magical bloom off the pages, one lapis energy wisp curling into the dark, a single candle at the far right, carved stone + chains + a lapis banner in Rembrandt chiaroscuro behind — while the ENTIRE LEFT THIRD stays deliberate calm near-black negative space (mean `#060402`, σ2) for the sign-in lockup. Desktop (≥1024px) seats the brand column in that void under the LEFT-anchored scrim wash that fades before the book; narrow crops (<1024px) centre book + lockup + scrim (`.login-splash`, folio.css). Ships ~78 KB at q75 + sharp_yuv. **Shipped.**                                                                                                                                                                                                                                                                                                                                                  |
| `public/assets/backgrounds/login-light.webp`                                    | 1672×941, < 320 KB   | The **dawn sibling** of `login.webp` (owner-generated P15, Batch-4 v2 2026-07-23) — the LIGHT login splash via the light `--asset-login`. Unmistakably the same v2 altar at first light: the open grimoire RIGHT-of-centre still genuinely radiant with its own golden magic (the magic persists into morning), one lapis energy wisp curling through sun shafts full of dust motes, carved colonnade + censer chains + an ivy-framed window with in-scene sun-wheel goldwork richly painted at BG3 confidence — while the LEFT THIRD stays calm softly-shadowed umber for the sign-in column. The light scrims are warm-umber morning washes (folio.css) — they steady the calm void for the bright-ink copy without impersonating night. Ships ~93 KB at q75 + sharp_yuv. **Shipped.**                                                                                                                                                                                                                                                                                                                                                                                          |
| `public/assets/backgrounds/campaign-backdrop.webp`                              | 1672×941, < 120 KB   | The campaign default art (DESIGN Law 6) — the DARK plate of the pair, via `--asset-campaign-backdrop`: the campaign HUB backdrop (`--app-bg-art`) AND the campaign LIST-card banner (`.cmp-banner`, **16:9** — the asset's native ratio, shown whole) when the DM hasn't set custom art. The Batch-4 v2 war-table plate (owner-generated P16, 2026-07-23): a candlelit war table under a blank aged map holding the calm low-contrast centre (panels overlay it), edges at BG3 main-menu richness — armillary astrolabe + glowing lantern at the LEFT (the v2 prompt seats them there; v1 had the astrolabe right), candelabra + brass vessels in the shadows, one lapis banner blurred behind, the table runner graded to warm dark bronze (twin-matched with the light sibling). Ships ~96 KB at q75 + sharp_yuv. **Shipped.**                                                                                                                                                                                                                                                                                                                                                  |
| `public/assets/backgrounds/campaign-backdrop-light.webp`                        | 1672×941, < 320 KB   | The **daylight sibling** of `campaign-backdrop.webp` (owner-generated P17, Batch-4 v2 2026-07-23) — the LIGHT campaign default via the light `--asset-campaign-backdrop` (hub backdrop + list-card banner alike; the card's decode base flips to the plate's own honey tone `#856337`). Unmistakably the same v2 hall at breakfast: morning sun through leaded ivy-framed windows, the same blank map + astrolabe + lantern at the LEFT, the lapis banner behind, the runner graded to the same warm bronze as its dark twin, wood and parchment in the honey band. Ships ~173 KB at q75 + sharp_yuv (budget raised 120 → 320 KB to match the other scene plates for the deliberate v2 richness). **Shipped.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `public/assets/backgrounds/compendium-scene.webp`                               | 1672×941, < 320 KB   | The **compendium realm scene** (the Grand Library) — the DARK plate of the pair, via `--asset-compendium-scene`: swapped in for the app-wide study backdrop while the codex is mounted (`useRealmBackdrop`, the per-route seam below). The Batch-4 Grand Library plate (owner-generated P18, 2026-07-23): a candlelit library nave — gold-tooled damask, shelf stacks and candle clusters at the richly painted edges, one lapis accent glowing mid-right, an unlit deep-blue banner drape (twin-consistent with the light sibling) — while the centre aisle stays calm warm near-black (centre mean `#190f05`) where the `.cmp-tome` spread sits. One stray AI signature clone-patched out top-right. Ships ~85 KB at q75 + sharp_yuv. **Shipped.**                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `public/assets/backgrounds/compendium-scene-light.webp`                         | 1672×941, < 320 KB   | The **daylight sibling** of `compendium-scene.webp` (owner-generated P19, Batch-4 2026-07-23) — the LIGHT compendium scene via the light `--asset-compendium-scene`. Unmistakably the same Grand Library at morning: a sun-shafted aisle, shelves / rolling ladder / orrery / globe table crisp at the edges, both candles unlit (their flames retouched out), and the deep centre arcade melted to tone-on-tone honey bokeh by a masked soft-focus (fine-detail 2.7 — the P13 calm discipline) so the tome always fronts the sharpest plane. The optional centre contrast-compression grade was judged unnecessary in situ: the codex spread covers the busy centre at every matrix dim (desktop + mobile, both themes; the bottom-edge parquet and the tiny centre window slot sit under the tome at every current crop). Ships ~75 KB at q75 + sharp_yuv. **Shipped.**                                                                                                                                                                                                                                                                                                         |
| `public/assets/backgrounds/roster-scene.webp`                                   | 1672×941, < 320 KB   | The **roster realm scene** (the Hall of Heroes) — the DARK plate of the pair, via `--asset-roster-scene`: swapped in for the app-wide study backdrop while the roster is mounted (`useRealmBackdrop`, the per-route seam below). The Batch-4 Hall of Heroes plate (owner-generated P20, 2026-07-23): a candlelit trophy hall — EMPTY armor suits (dark voids under every helm) and axe stands hugging both walls, a warm lit hearth at the far right edge under a faceless gold filigree medallion, exactly one saturated lapis pennant (gold fleur device) among near-neutral dark heraldry — while the centre band stays calm near-black warm umber (mean `#160c02`, two soft in-band sconce embers) where the character cards + toolbar sit. One dim AI signature median-smudged out top-right (feathered mask — the hard rectangle seamed under a brightness boost). Ships ~82 KB at q75 + sharp_yuv. **Shipped.**                                                                                                                                                                                                                                                            |
| `public/assets/backgrounds/roster-scene-light.webp`                             | 1672×941, < 320 KB   | The **daylight sibling** of `roster-scene.webp` (owner-generated P21, Batch-4 2026-07-23) — the LIGHT roster scene via the light `--asset-roster-scene`. Unmistakably the same Hall at morning (every anchor coincides: alcove suit, leaning round shield, suit rows, hearth + the same faceless medallion, the same lapis pennant device): sun shafts from the clerestory night conceals, the centre squarely in the honey band (mean `#b17e3c`), four extra blue banners re-tinted to parchment so exactly one lapis pennant remains, the pseudo-glyph runner border dissolved. The optional centre calm-down blur (raw-plate centre sigma ~36 vs P13's ~23) was judged unnecessary in situ: with the real UI composited the 0.55 backdrop opacity over the parchment field melts the lower-centre mosaic to one soft honey tone — cards, toolbar, and the runic empty state all hold the calm-centre law at every matrix dim (dark/light × desktop/mobile, populated + empty). Ships ~175 KB at q75 + sharp_yuv. **Shipped.**                                                                                                                                                  |
| `public/assets/backgrounds/creation-scene.webp`                                 | 1672×941, < 320 KB   | The **wizards' realm scene** (the Ritual of Making — creation AND level-up) — the DARK plate of the pair, via `--asset-creation-scene`: swapped in for the app-wide study backdrop while either wizard is mounted (`WizardFrame`, the one chrome both wizards share, mounts it once via `useRealmBackdrop` — the per-route seam below). The Batch-4 scriptorium plate (owner-generated P22, 2026-07-23): a candlelit scriptorium — a great blank-paged ledger on its desk right-of-centre with the glowing lapis inkwell + standing quill beside it (the login plate's tool-of-making grammar), armillary sphere at the right edge, star-chart banners top-right, candles + altar at the left, an abstract gold ritual circle faint on the floor lower-left — while the calm zone (x~17–62%, full mid-band height) stays warm near-black (mean `#140c03`, σ8.2 — P12-calibration calm) where the wizard column sits. Ships ~95 KB at q75 + sharp_yuv. **Shipped.**                                                                                                                                                                                                                |
| `public/assets/backgrounds/creation-scene-light.webp`                           | 1672×941, < 320 KB   | The **daylight sibling** of `creation-scene.webp` (owner-generated P23, Batch-4 2026-07-23) — the LIGHT wizards' scene via the light `--asset-creation-scene`. Unmistakably the same scriptorium at morning — every object recurs in place (desk + blank ledger + clasp, inkwell + quill, armillary, chart banners, candelabra, lantern, the floor circle identical ring for ring) with every candle genuinely unlit: a sun-shafted colonnade, the centre in the honey band (centre mean `#cc9244`, right beside the accepted P13 calibration), the floor circle still faintly magical by day. Both plates ship ungraded: the optional dossier ops (P22 calm-margin widening + blue taming, P23 centre compression + honey pull-down) were judged unnecessary in situ — with the real UI composited the wizard column sits on the calm corridor at every matrix dim (dark/light × desktop/mobile, creation + level-up), the ledger fills only the empty right gutter as atmosphere, the mobile centre-top cover slice (image x~35–65%) stays calm, and the gutter pager captions hold the on-art register over the desk wood. Ships ~153 KB at q75 + sharp_yuv. **Shipped.**      |
| `public/assets/textures/parchment.webp`                                         | ~1600×1000, < 180 KB | Compendium "ancient tome" cover (`--asset-parchment`) — the LIGHT-theme leaf. A weathered aged scroll in the deep **#6b5a36 → #b8975a** band. **Shipped.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `public/assets/textures/panel-leather.webp`                                     | 1024×1024, < 150 KB  | Seam-blended tileable dark leather grain (`--asset-panel-leather`), in the **#0b0908 → #1d1810** band. **DARK theme only:** laid under a translucent copy of the `.folio-panel` surface gradient (512px tile) — quiet mottle on empty panel areas; the whole sandwich renders on the panel's `::before` at `--panel-alpha` (§5 candlelit translucency) so the backdrop glows through the material. Its **light sibling** is `panel-light.webp` (next row). Ships ~31 KB. **Shipped.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `public/assets/textures/panel-light.webp`                                       | 1024×1024, < 150 KB  | The **LIGHT-theme sibling of `panel-leather.webp`** (owner-generated P8): seamless tileable pale cream bookbinding leather grain, colour-graded into the **#e9ddc4 → #cdb488** band (mean ~#ddcaa5 · per-channel remap of the source's actual range into the band; verified seamless by a 512-offset wrap test — the wrap discontinuity 3.4/255 is smaller than the texture's own interior drift). Sits **under the light `.folio-panel` surface the same way dark does** — the same 512px-tile sandwich under the panel `::before`, at the light `--panel-alpha` 0.94 (morning-light translucency, §5) with an 80% gradient share (the grain band sits below the ivory surfaces, so a lower share would darken the panel). Wired by the daylight-sibling rebuild. Ships ~25 KB at q80. **Shipped.**                                                                                                                                                                                                                                                                                                                                                                              |
| `public/assets/textures/vellum-dark.webp`                                       | 1024×1024, < 150 KB  | Seam-blended dark vellum (`--asset-vellum-dark`), colour-graded into the **#241c12 → #3a2d21** candlelit-umber band (mean ~#2d2216). **DARK theme only:** IS the `.cmp-tome` surface via the `--tome-leaf` indirection (light keeps `parchment.webp`). Ships ~19 KB. **Shipped.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `public/assets/brand/crest.webp`                                                | 349×384, < 40 KB     | The engraved brand crest (owner-generated P6): a bronze d20 in a laurel + acanthus wreath, shipped as an **alpha mask** (white ink, alpha = engraving luminance) and painted through CSS `mask-image` with the theme's gold as ink (`--asset-crest` → `.page-head-crest`), so ONE file wears each theme's own metal. Seated as the folio's **frontispiece watermark**: every framed realm masthead that sits on the standard app field — roster, campaigns list, compendium, settings, admin, legal — carries it via the `PageHeader` `crest` prop. Dark inks it in the bright accent at **0.11**; light inks it in the **burnished antique gold** (`--accent-primary-deep`, gold-leaf-700) at **0.2** — light's `--accent-primary` is a near-black umber that vanished at a whisper opacity on ivory (owner: "basically not visible in light theme"), so the light emblem is re-inked in real chroma and lifted until it reads clearly at a glance while staying subtler than any text on the band. The art-backed campaign hub is the ONE exception: its backdrop is the campaign's own art, so that art is the frontispiece and it omits the crest. Ships ~30 KB. **Shipped.** |
| `public/favicon.svg` + `public/favicon.ico` (16/32/48)                          | SVG + ICO            | **Browser-tab favicon** — a favicon-optimised redraw of the gilt d20: the die FILLS the canvas edge-to-edge (no umber tile / brown padding) on a transparent ground, with an **enlarged central "20" face** so the numeral is bold. "20" reads cleanly at 32–48 px (retina tabs); at legacy 16 px it softens to a bold mark on an unmistakable d20 silhouette. `.svg` for modern browsers, `.ico` the legacy fallback. **Shipped.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `public/icons/{icon-192,icon-512,icon-512-maskable,apple-touch-icon}.{svg,png}` | SVG source + PNG     | PWA / home-screen install icons — the same gilt d20 on a full-bleed **umber** crest tile (OS rounds it); `-192`/`-512` rounded, `apple-touch` + `-maskable` full-bleed (die kept inside the maskable 80% safe zone). Hand-authored SVG sources rasterised to PNG (headless-Chromium render); the `.png` set is what the manifest ships. **Shipped.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Brand mark = in-code SVG, not an AI raster** (`D20Mark` in `brand-mark.tsx`, gilt variant,
theme-aware, used in the header + login). The d20 face geometry is **solved in
code** (OWN-26): the `line` + `gilt` marks draw the derived face-on icosahedron projection — a
pointy-top hexagon whose front hemisphere is the true 10 triangular facets with the "20" face
visible. Every external image model produced geometrically-wrong "AI-slop" triangles, so the shipped
geometry is canonical and must NOT be replaced by a raster. The **favicon + install icons**
(`favicon.svg`/`.ico` + `public/icons/*`, table above) are hand-authored SVGs that echo this same
gilt geometry but are **favicon-optimised, not a scaled `D20Mark`** — a favicon is redrawn for tiny
sizes: the die fills the canvas (favicon) and the central "20" face is enlarged so the numeral is
legible at 16–48 px. Keep them in step with `D20Mark`'s look on any brand change. (The `crest.webp` watermark above is
**material, not mark** — a background engraving that never stands in for `D20Mark` in chrome,
lockups, or icons.)

**Two owner knobs in `src/index.css`:**

- `--app-bg-art-opacity` — backdrop prominence. Per the binding OWN-36 light mandate it is **`0.55`
  in BOTH themes** (the atmospheric art is as visible in light as in dark). Each theme renders its
  OWN sibling plate natively — the old light-theme `saturate/contrast` lift (a compensation for
  borrowing the dark plate) is retired; light keeps only its lower-band mask dissolve into the field.
- `--app-bg-art: none` on `:root` — disables app-wide art entirely.

**User-uploaded campaign art never breaks the light chrome (the custom-art veil).** A DM's banner is
ANY image — pure white, neon, pitch black. While a custom banner is the backdrop the hub raises
`data-app-bg-custom` on `<html>` (`useCampaignBackdrop`), and the LIGHT theme applies a designed
two-part veil to `body::after` (index.css): a **parchment glaze** (a uniform translucent wash of
`--bg-page` layered over the image in the same element) pulling every upload toward the warm honey
world, plus a **gentle harmonizer filter** (`saturate(.82) contrast(.94)`) so oversaturated uploads
sit back as atmosphere. Legibility never depends on the upload — loose on-backdrop text is the
guarded `.on-art` register, and the glaze only narrows the art's dynamic range. The bundled plates
render native (no veil); dark needs none (0.55 over the near-black field tames any upload) and is
untouched.

**Per-route backdrop override (the campaign hub).** The same `--app-bg-art` variable is the ONE
backdrop seam — a route may swap it instead of building a second band. The **campaign hub**
(`CampaignHubPage`) does exactly this: it opens on a **slim framed `PageHeader`** (the same header
the campaigns LIST uses — title + member/DM hint + a quiet "Change art" action), NOT a big 3:1 hero
band, so the Party/combat sit in the fold. The campaign's art — the DM's custom `bannerUrl` when set,
else `campaign-backdrop.webp` — is fed to `--app-bg-art` on the document root for as long as the hub
is mounted (restored on unmount), so the global `body::after` painter renders it atmospherically
under the app's own scrim/grain (craft law 3 — atmosphere under content, never a competing band). The
hub content keeps its `.on-art-scope` wrapper so every loose-on-backdrop element (section labels, the
DMPC "attach" button, the treasury "total" chip) stays legible in light theme (guarded by
`on-art-ink.spec.ts`).

**Realm scene plates ride the same seam (`useRealmBackdrop`).** A realm whose backdrop is a fixed
per-theme PAIR (no custom art, no crop) uses the tiny shared hook `src/hooks/useRealmBackdrop.ts`:
mount points `--app-bg-art` at the realm's token — always a css-var REFERENCE (e.g.
`"var(--asset-compendium-scene)"`), never a URL, so the theme cascade keeps resolving the right
sibling plate and each theme still downloads only its own file — and unmount clears it back to the
app-wide study. Current realm scenes: the
**compendium** (`CompendiumPage` → `--asset-compendium-scene`, the Grand Library pair above — the
codex spread sits over the plate's calm centre aisle in both themes, desktop and mobile), the
**roster** (`RosterPage` → `--asset-roster-scene`, the Hall of Heroes pair — the character cards +
toolbar sit over the hall's calm centre band; the page's existing `.on-art` / `.on-art-scope`
loose-element chrome stays correct over the new plates), and the **wizards** (`WizardFrame` →
`--asset-creation-scene`, the Ritual of Making scriptorium pair — ONE mount in the shared frame
covers both creation and level-up, and the frame's `.wiz on-art-scope` chrome already carries the
on-art register; no focal bias is set — the default `center top` seats the calm corridor under the
wizard column on every current crop). The
campaign hub deliberately keeps its own `useCampaignBackdrop` (custom banners + crop focal/zoom +
the custom-art veil are its concerns, not a fixed plate's).

**One 16:9 shape across crop · card · backdrop focal.** Custom campaign art is framed by a single
**16:9** crop (the `campaign-backdrop.webp` asset's native ratio) — the SAME shape the realm-list card
(`.cmp-banner`, `aspect-ratio: 16 / 9`) and the full-page hub backdrop render, so what the DM frames is
what every surface shows (the old thin **3:1** banner-band ratio — a letterbox that lopped the
image's top/bottom — is **retired**). The shared `PortraitCropModal` takes `variant="banner"` (aspect
`16/9`); the card path reuses `PortraitImg`, which **cover-fits** the crop into the box —
`cropToCssStyle` over-sizes the image so the crop rectangle maps to the frame, then `object-fit: cover`

- `object-position: <focal>` apply a **single uniform scale** (never the old `object-fit: fill`, which
  scaled width/height independently and **stretched** any crop whose pixel-aspect differed from the
  frame's). So a 16:9 crop shows **exactly** the rectangle (cover has zero overflow when the aspects
  match), and a mismatched crop renders **undistorted**, cover-centred on its focal — the card can never
  stretch. Because a `cover` backdrop shows MORE than the crop rectangle, it can only honour the crop's
  **focal** — the centre of the rect: `cropToBackgroundPosition(bannerCrop)` derives an `x% y%` (the SAME
  focal the card's `object-position` uses) and the hub sets it as `--app-bg-art-position` (the
  `body::after` painter reads `var(--app-bg-art-position, center top)`), so the DM's chosen focus is what
  the cover backdrop centres on. The default asset (and an un-cropped banner) keep the global `center
top`. A live **pre-16:9** `bannerCrop` (a ~3:1 rect from the retired cropper) renders undistorted via
  cover-fit — focal preserved, image bytes untouched.

## 14. Audit Methodology + Verification Gates

The reusable discipline that keeps the system impeccable.

### The impeccable-audit pattern

Reason every surface across the matrix **{desktop + mobile} × {dark + light} × {EN + IT}**. Tag each
finding by **track** — FEATURE-LAYER (fixable in a component / Tailwind utility, no `index.css` /
`folio.css` edit) vs DESIGN-SOURCE (needs a locked-token change). Severity **P0** broken /
a11y-blocking → **P1** clear defect → **P2** notable polish → **P3** nice-to-have. **Definition of
done per finding:** the fix is applied at the stated track, the failed matrix dims now pass, the a11y
gate stays green, and **no identity regression** is introduced (§8 guard). Walk every flow as a lazy
user AND a curious explorer — act as a senior design team that finds its own pain points so the owner
never has to report a rough edge. Design a better alternative when a re-skin is not enough.

### Screenshot-based verification (the default proof)

Never trust a claim that a UI works. Verify in the running app via cropped screenshots, **every
variant (theme × viewport × locale)**, scrolling below the fold. The owner does not read code — after
each session, give exact UI steps to verify (how to start dev, which route, what to look for, how to
trigger each state).

### Self-enforcing gates (do not let them rot)

- **A11y surface gate:** `tests/e2e/a11y.spec.ts` iterates SURFACES × dark/light and fails on
  serious/critical axe violations; the app is axe-clean. **Re-run after ANY light-token change.**
- **E2E coverage gate:** a guard test maps router surfaces → harness entries; the rule "new
  page/form/prompt → add its screenshot" keeps visual coverage honest.
- **Contrast unit tests** (e.g. `verdict-ink-contrast`, `bg-recessed`, the seal-ink test) guard the
  per-hue AA math; keep them green when tuning any domain or `-ink` token.
- **Pure-modules guard:** keep CI-pure lib modules free of Firebase imports.

> Near-miss contrast figures from static analysis (e.g. a recipe author's inline "~4.45:1" note) are
> **advisory** — confirm them with a live contrast check before declaring a fix done.

## 15. The d20-Folio Checklist (companion to the `impeccable` skill)

The generic `impeccable` skill (`.claude/skills/impeccable/`, github.com/pbakaus/impeccable) supplies
the general design craft + anti-slop guidance and reads `PRODUCT.md` + this file for project context.
This section is the project-specific audit checklist that guidance can't know on its own — run it
against every surface being designed or changed, alongside whichever `impeccable` command applies
(`critique`, `audit`, `polish`, …). A surface is not done until every item below is checked.

### 15.1 Information Architecture

- At-a-glance common info visible immediately — no digging required for the things users need every
  time (HP, AC, action economy, current resources).
- Detail on demand (progressive disclosure, Product Constitution §2.3): collapsed cards show summary;
  expanded cards show full detail. The same principle applies everywhere.
- Never cluttered, never overwhelming — density is intentional, not maximal.
- No information hidden behind unnecessary navigation.
- Every element on the surface is justified — only and all the necessary. If in doubt, remove it or
  move it behind progressive disclosure.
- Premium registers (altar / cartouche / lit-socket / gold-thread / gilt frame) are earned by
  information — a decision being made or live state being read — never decoration (Product
  Constitution §4.16; §5 above, "register ladder").
- No mid-string truncation of identity text (§3 above, the No-Truncation Rule).
- Unbounded user prose/lists are bounded: `NoteClamp` for prose, latest-N + "View all" for lists —
  never an unboundedly growing surface, never a nested scrollbar.

### 15.2 Pickers — the Picker Doctrine (Product Constitution §2.7)

- Read-then-choose: browsing never commits; an explicit act commits; release is an in-place undo on
  the same row. Fact options (nothing to read) commit directly on tap.
- Detail on SELECTED only — no per-row ⓘ / hover previews; the full compendium read view is offered
  only on an already-picked row.
- Never state met preconditions: unmet-prerequisite options are filtered out of the pool (not
  greyed); only blocking reasons and open asks are surfaced.
- Cascading choices expand inline under their visible cause, never on a detached page or modal.

### 15.3 Complete States

Every interactive surface must design (not stub) all states: default/idle, hover, focus
(keyboard-accessible, `--ring` tokens), loading/skeleton (never a blank flicker), empty (honest blank
— explain why, offer a next action), error (explain what went wrong + what to do next, never a raw
error string), and edit/active/selected.

### 15.4 Responsive — Desktop + Mobile

Desktop and mobile serve different purposes (Product Constitution §3): desktop is optimized for
active gameplay, combat, management (full density, multi-column, tables); mobile is optimized for
reading, reviewing, between-session use (cards, ≥44px touch targets, stacked layout) — a deliberate
mobile design, never a collapsed desktop layout.

### 15.5 Dark + Light — Each Designed, Not Adapted

Dark: gradient surfaces, glowing gold accents, rich contrast. Light: full-color borders, 14–22%
background tints on interactive chips/cards, no inline hex, every chip reads as intentional. Neither
theme is adapted from the other — both are designed directly using the token set (§10 above). Run the
a11y gate after any token change.

### 15.6 Reuse Existing Recipes — Never Author Bespoke CSS

Before writing new CSS or a new component, check what existing primitives already solve it (`OptionGrid`,
`InlineEditable`, `NumberStepper`, `InfoCard`, `SectionHeader`, `Button`, `IconButton`, `Input`,
`Textarea`, `ModalHead`) and whether a sibling surface already uses the pattern. Search is bilingual +
accent-insensitive + **token-based** via `matchesSearch` (pass both the localized label and `name.en`)
— the query is split into whitespace tokens and every token must appear somewhere in the joined
candidate corpus, so word order and interstitial words ("di"/"of") never break a match ("pozione
guarigione" finds "Pozione di Guarigione"); never roll your own search. **Ranking is name-priority:**
the compendium / add-item picker (`useCompendiumPicker`) and the wizard pickers rank results through
`rankedSearch` — an entry whose NAME matches (localized name / EN name / id, exposed by each spec's
`nameText`) sorts ABOVE one that matches only in its DESCRIPTION, stable within each tier, with the
`DESC_QUERY_MIN` gate suppressing description hits for 1–2-char queries; an empty query keeps the
natural data order. Pickers reuse `OptionGrid` +
picker parts (`PickerSearch`, `FilterChip`, `PickerRow`). One
mock, all edge cases: `src/lib/mock.ts → MOCK_CHARACTER` — extend it, never add a second mock.

### 15.7 Constrained Inputs (Golden Rule 20)

Every numeric field is `type="number"` / `inputMode="numeric"`, integer-rounded where appropriate,
clamped to `[min, max]`; a pre-filled numeric field selects its value on focus; both typing AND
stepper controls work; prefer `NumberStepper` or `InlineEditable` over a raw `<input>`; invalid states
are unreachable by construction, not caught after entry.

### 15.8 Stable IDs — Never Branch on Display Strings (Golden Rule 7)

Pickers and selects bind to and emit ids (`classId`, `subclassId`, `srdId`, …); the visible label is
derived from the id for display only, never stored as a logic anchor; engine logic resolves to ids
first (`resolveClassId`, `resolveSrdToken`, …).

### 15.9 Bilingual — EN + IT on the Spot (Golden Rule 9)

Every user-visible string added or changed has a key in BOTH `src/i18n/en/ui/<group>.json` and
`src/i18n/it/ui/<group>.json` (SRD content → `{en,it}/srd/<kind>.json`) before the commit is staged.
No `defaultValue` on any `t()` call. IT translations follow the i18n priority cascade (official IT
SRD 5.2.1 → Asmodee Italia → reputable community ≥2 → AI-translated with comment).

### 15.10 Production Polish

Full density (no extra whitespace that makes the app feel sparse or unfinished); refined depth +
motion; consistent inline-SVG icons (never mixed icon libraries); honest blanks (empty states explain
the state + offer a next action). Every surface reads as a shipping product, not a prototype.

### 15.11 Verification Loop

After every design/change pass — not before:

1. **Run the app** and navigate to the changed surface (`pnpm dev`).
2. **Screenshot every changed surface**: dark + light × desktop + mobile = 4 screenshots minimum, all
   relevant states (hover, empty, error, loading).
3. **a11y gate**: `pnpm exec playwright test tests/e2e/a11y.spec.ts` — must stay green; re-run after
   any light-token change.
4. **New surfaces**: add an entry to `tests/e2e/surface-manifest.ts` so the a11y gate covers it.
5. **i18n check**: confirm no raw English strings in the IT locale path.
6. **Lint + typecheck**: `pnpm tsc -b && pnpm lint --max-warnings 0`.

### 15.12 Escalation Rules

Escalate to the owner **only** for genuine taste forks ("Which of these two layouts looks better?",
"Is this tone right for the brand voice?"). **Never** escalate "Does this work?", "Does this look as I
intended?", or "Is the a11y gate passing?" — verify all three yourself first (screenshots + the gates
above).

### 15.13 Quick Reference — Canonical Primitives

| Need                        | Reach for                                       |
| --------------------------- | ----------------------------------------------- |
| Editable field in-place     | `InlineEditable`                                |
| Numeric input with stepper  | `NumberStepper`                                 |
| Option grid / card picker   | `OptionGrid` (card mode or list mode)           |
| Picker with search + filter | `PickerSearch` + `FilterChip` + `PickerRow`     |
| Info display card           | `InfoCard` / `.info-card`                       |
| Section heading + ledger    | `.sec-head` pattern (see Treasury surface)      |
| Modal header                | `ModalHead`                                     |
| Icon-only button            | `IconButton`                                    |
| Accent / neutral button     | `Button` (variant prop: accent / neutral / …)   |
| Bilingual search            | `matchesSearch(query, localized, name.en)`      |
| Bounded prose preview       | `NoteClamp` (overflow-engaged, in-place expand) |
| In-wizard choice pool       | `WizardPickList` (the morph-list; §5 above)     |
| Bounded growing list        | latest-N + "View all" (the Treasury-log recipe) |
