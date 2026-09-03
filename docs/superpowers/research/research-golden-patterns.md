# Golden UI/UX patterns 2023–2026 for a premium D&D companion PWA

Research report for the d20 Folio from-scratch redesign. Date: 2026-09-02.
Method: primary sources first (platform HIGs, the designers' own writing, NN/g, Baymard, W3C, GDC),
secondary analyses flagged as such. Publication dates are given where the source shows them.
Where a claim rests on a source I could not fetch directly (paywalled/403) it is marked "(not fetched;
via search summary)". Nothing below is an invented citation; where I am unsure, I say so.

Product framing used throughout: d20 Folio is a **rules-and-state instrument used at a physical
table** (phone in one hand, dice in the other), plus a **desktop/tablet management surface** (campaign,
compendium, creation). It never rolls dice. Premium therefore means: _fast, legible under table
lighting, one-thumb operable, dense but calm, reversible, and unmistakably itself_ — not "fantasy skin".

---

## Executive summary — the 15 patterns that matter most, ranked

| #   | Pattern                                                                                                                                                       | Who established it / where                                                                                                                                          | Why it matters for d20 Folio                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Restraint-based premium craft**: constrained type scale, 4/8pt spacing, one accent, hairline borders + tonal layering instead of shadows, dark-first tokens | Refactoring UI (Wathan & Schoger, 2018); Linear redesign (Mar 2024); Vercel Geist; Raycast; Stripe                                                                  | This is the whole gap between "decent" and "premium". Almost no new features, just discipline.                                                                       |
| 2   | **Semantic tokens in a perceptual color space (LCH/OKLCH), 3-variable theming, no pure black/white**                                                          | Linear (LCH, base/accent/contrast, 2024); Material dark theme (#121212, 2019); Radix Colors 12-step scales                                                          | Bilingual + light/dark + high-contrast from one token source; dark tables need desaturated accents.                                                                  |
| 3   | **Tabular numerals + numbers-first hierarchy**                                                                                                                | Rauno Freiberg (interfaces); Vercel WIG; MDN `font-variant-numeric`; Stripe                                                                                         | HP, AC, DC, modifiers, timers, slots: every number must align and never reflow.                                                                                      |
| 4   | **Visible bottom navigation (2–5 tabs) on mobile; sidebar/rail on desktop; no hamburger for primary nav**                                                     | NN/g hidden-navigation study (Pernice & Budiu, 2016); Apple HIG tab bars; Material 3 navigation bar/rail                                                            | The core surfaces (Sheet, Combat, Party, Compendium, More) map to a tab bar; NN/g measured hidden nav at −20% discoverability.                                       |
| 5   | **Thumb-zone + center-of-screen touch model; 44pt targets; sticky primary CTA at the bottom**                                                                 | Hoober (2013, revised 2017 UXmatters); Apple HIG 44pt; Material 48dp; WCAG 2.2 2.5.8 (24px AA floor)                                                                | The combat turn is one-handed at a table. "End turn", "Apply damage", "Next" belong in the bottom band.                                                              |
| 6   | **Undo instead of confirm; optimistic UI with rollback**                                                                                                      | Nielsen, "Confirmation Dialogs Can Prevent User Errors" (2018); Gmail Undo; Mishunov, Smashing (2016); Vercel WIG                                                   | Combat is a stream of small reversible mutations; confirm dialogs would kill flow. Append-only encounter log = free undo.                                            |
| 7   | **Progressive/staged disclosure; one primary action per screen**                                                                                              | Nielsen, Progressive Disclosure (2006); NN/g Complex Applications (Kaplan, 2020); Refactoring UI hierarchy                                                          | Character cockpit shows the 8 things you need now; everything else is one tap away, never on the same visual level.                                                  |
| 8   | **Bottom sheets (non-modal → modal on expand) for contextual detail; modals only for genuine interruption**                                                   | NN/g Bottom Sheets (Laubheimer, 2023); Apple HIG Modality; Material 3 sheets                                                                                        | Spell/monster/condition detail during combat must not navigate away; sheet keeps the tracker visible.                                                                |
| 9   | **Fast, interruptible, spring-or-ease-out motion under ~200–300ms; transform/opacity only; reduced-motion variant; View Transitions for continuity**          | Emil Kowalski ("Great animations"); Josh Comeau (springs 2020/2025, `linear()` 2025); Material 3 motion tokens; Apple Reduce Motion; Chrome VT 2025                 | Motion should carry state (HP bar drains, initiative reorders), never decorate. Keyboard-triggered actions never animate.                                            |
| 10  | **Inline validation on blur, labels above fields, errors next to fields, redundant-entry avoidance**                                                          | Baymard (labels 2013, inline validation 2024); NN/g form errors (Krause, 2019); WCAG 2.2 3.3.7                                                                      | Creation wizard and level-up are long forms on phones.                                                                                                               |
| 11  | **Wizard with visible step map, resumable state, review step; never modal-blocking**                                                                          | NN/g Wizards (Budiu, 2017); NN/g Complex Apps guideline 3                                                                                                           | Character creation and level-up branch on class/subclass; users must be able to loop back without losing work.                                                       |
| 12  | **Empty states as teachable moments; skeletons that mirror final layout; spinners only for modules**                                                          | NN/g Empty States (Kaplan, 2021); NN/g Skeleton Screens 101 (Tankala, 2023); Vercel WIG                                                                             | Offline-first PWA loads instantly from cache, so most "loading" is sync, not fetch — design for that.                                                                |
| 13  | **Feedback mapped to urgency: badges/pips for passive state, toasts for confirmations with undo, modal only for action-required**                             | NN/g Indicators/Validations/Notifications (Flaherty, 2024); Nielsen heuristic #1                                                                                    | Concentration, conditions, death saves, slot pips are _indicators_; "HP applied — Undo" is a toast; "Party sync conflict" is action-required.                        |
| 14  | **Command palette (Cmd/Ctrl-K) as desktop power path, never the only path**                                                                                   | Sublime Text/VS Code origin; Linear, Raycast, Notion, Cron adoption; NN/g "UI Copy: command names and shortcuts"                                                    | DM/desktop users jump to "Fireball", "Add goblin ×4", "Long rest". No NN/g article exists specifically on Cmd-K — treat as industry convention, not research-proven. |
| 15  | **Game-grade readability over fantasy ornament: readable typeface, strict tooltip rules, color-coded categories, functional "materials"**                     | Hearthstone GDC 2015 (Sakamoto); Diablo IV tooltip rules; Veilguard GDC 2025 (Porrio: minimal corner UI got ignored); Elden Ring debate (2022); BG3 font complaints | Borrow _behaviour_ from games (juice, hierarchy, category color), not parchment textures.                                                                            |

---

## 1. Craft foundations of premium apps

### 1.1 What the exemplars actually do (evidence)

**Linear** — primary source: "How we redesigned the Linear UI (part II)", linear.app/now, 28 Mar 2024.

- Moved theme generation from HSL to **LCH** ("perceptually uniform … a red and a yellow with lightness 50 appear roughly equally light"), reducing theme definition from 98 variables to **three: base color, accent color, contrast** (with a high-contrast option).
- Darker text in light mode, lighter text in dark mode; limited chroma in neutrals for "a more neutral and timeless appearance".
- **Inter Display for headings**, Inter for body (optical-size pairing).
- The "inverted L" chrome (sidebar + top bar) tested in condensed and spacious configurations.
- Third-party token analyses (VoltAgent awesome-design-md, designmd.cc — _not primary_) describe: weight band 400–510, tracking ≈ −0.022em, 0.5px hairline borders, 6/12px radii, 8–12px paddings, no drop shadows on dark, luminance ladder rather than hue variation. Treat the numbers as illustrative, the direction as confirmed by Linear's own post.

**Vercel / Geist** — vercel.com/geist/introduction; vercel.com/font. Swiss-typography-inspired; Geist Sans for UI, Geist Mono for code/data; one accent; monochrome foundation. The **Web Interface Guidelines** (vercel.com/design/guidelines; repo vercel-labs/web-interface-guidelines, 2025) codify craft rules — see §1.4.

**Raycast** — dark-first; third-party analyses (VoltAgent DESIGN.md, Refero) describe a 4-step near-black surface ladder, hairline borders + inset highlight strokes instead of shadows, a single coral accent used as punctuation, Inter with slight positive tracking on dark. _Not primary_; consistent with what you see in the product.

**Stripe** — third-party breakdowns (925studios "Stripe Dashboard Design Breakdown", 2026; Refero) describe: near-monochrome canvas, one indigo accent that "earns the right to be a button", light-weight display type with tightening tracking, **tabular figures wherever money appears**, depth from background tint shifts rather than shadows, navigation organized by user jobs.

**Family (iOS wallet)** — primary: Benji Taylor, "Family Values", benji.org, 8 Jul 2024. Three values: **simplicity** (a "dynamic tray" that reveals complexity contextually — "like walking through interconnected rooms"), **fluidity** (directional transitions, buttons morph between states, shared letters animate from "Continue" to "Confirm", chevrons rotate → to ⌄; "avoid static transitions"), **delight** on a "delight-impact curve" (rarely used flows get the richest moments: confetti on backup, tokens tumbling into a bin with sound).

**Things 3** — Cultured Code (launch coverage 9to5Mac, May 2017): the goal was an interface "like a simple white sheet of paper" with every animation purposeful; still the reference for a _tactile_ list app on iOS.

**Cron / Notion Calendar** — cron.com blog (rename 17 Jan 2024): the calendar as "an active instrument, not a passive display"; keyboard-first (arrow keys, `n`, `g`), engineering-precision minimalism.

**Notion** — Ryo Lu (early Notion designer): "what are the atoms of software?" — blocks, databases, views, relations; systems thinking over surface aesthetics (Dive Club podcast, 2024).

**Arc** — LogRocket UX analysis; muted palette, serif display type in marketing/onboarding, vertical sidebar + Spaces, ample negative space. Note: Arc was wound down/acquired (2025); the aesthetic still influences the "editorial-premium" direction.

**Apple system apps** — HIG + WWDC25 sessions 219 ("Meet Liquid Glass") and 356 ("Get to know the new design system"), June 2025. See §1.3.

### 1.2 Refactoring UI (Wathan & Schoger, 2018, refactoringui.com) — the rules that still hold

Chapter structure verified on the site. The operative rules:

- **Hierarchy is everything**: "not all elements are equal", "de-emphasize to emphasize", "labels are a last resort", "don't use grey text on colored backgrounds" (use reduced-opacity/tinted text instead), "balance weight and contrast".
- **Layout**: "start with too much white space", "establish a spacing and sizing system" (a constrained scale, non-linear, e.g. 4·8·12·16·24·32·48·64…), "avoid ambiguous spacing" (more space _between_ groups than _within_).
- **Text**: a type scale, line length in check, line-height proportional to size (tighter for large, looser for small), letter-spacing tightened on headings.
- **Color**: "ditch hex for HSL", "you need more colors than you think" (8–10 shades per hue), "greys don't have to be grey", "don't rely on color alone".
- **Depth**: emulate a light source; two-part shadows (ambient + direct); "use fewer borders" — separate with spacing, background tint, or shadow.
- **Finishing**: "don't overlook empty states", accent borders, supercharge defaults.
- _When not to use_: the book's default is light-mode SaaS; on dark UIs the shadow guidance flips to tonal/hairline layering (see Material dark theme, Linear, Raycast).

### 1.3 Apple HIG 2025 — Liquid Glass direction (WWDC25 session 356, June 2025; HIG "Materials")

- Liquid Glass is a **new functional layer for controls and navigation that floats above content**; "UI controls separate from content". Critical rule: controls sit on system materials, **not directly on content**, to keep contrast/legibility.
- **Don't** put glass in the content layer; **don't** stack glass on glass; remove custom bar backgrounds/borders ("customization debt") and express hierarchy through layout and grouping.
- **Shapes**: fixed, capsule (radius = half height, used for touch layouts), and **concentric** (child radius = parent radius − padding). Non-concentric nesting reads as "pinched"/"flared".
- **Typography** became bolder and left-aligned in critical moments (alerts, onboarding). Tab bars: 2–5 tabs, floating pill, dedicated Search tab; tab bars never carry screen-specific actions.
- **Scroll-edge effects** (soft blur) replace hard dividers where floating UI overlaps content — one per view.
- Accessibility: Reduce Transparency and Increased Contrast must be honored; glass is a _material_, not a texture.
- **Web applicability**: `backdrop-filter` glass is expensive on mobile (Rauno: "large blur() values … may be slow"); use it only for the floating control layer (tab bar, sticky CTA), never for cards.

### 1.4 Material 3 Expressive (Google, I/O May 2025; design.google research write-up)

- 46 studies, 18,000+ participants; eye-tracking: key elements spotted "up to four times faster"; older users (45+) performed on par with younger; 87% of 18–24s preferred expressive designs.
- Levers: **color, shape (35+ morphing shapes), size, motion (springs replace duration+easing; "expressive" and "standard" motion schemes), containment**.
- **Warning from the same research**: expressiveness that breaks convention (removing lists, dropping text labels) _reduced_ usability despite looking modern. Expressiveness = emphasis on the primary action, not everywhere.
- Pre-expressive M3 motion tokens (material-components-android docs/theming/Motion.md): durations Short 50–200ms, Medium 250–400ms, Long 450–600ms, ExtraLong 700–1000ms; easing standard `cubic-bezier(0.2,0,0,1)`, emphasized-decelerate `cubic-bezier(0.05,0.7,0.1,1)`, emphasized-accelerate `cubic-bezier(0.3,0,0.8,0.15)`; "shorter durations for small components, longer as area/traversal increases".
- M3 elevation is **tonal** (surface-container-lowest → highest) with shadows de-emphasized; in dark themes "shadows are less effective … surfaces become lighter at higher elevations" (M2 dark theme guidance, 2019: base #121212, white overlays 5%@1dp, 7%@2dp, 8%@3dp, 9%@4dp, 11%@6dp, 12%@8dp, 14%@12dp, 15%@16dp, 16%@24dp; desaturated "200-tone" accents; text at 87/60/38% opacity).

### 1.5 Rauno Freiberg, Web Interface Guidelines (github.com/raunofreiberg/interfaces; public repo since May 2023)

Verbatim/near-verbatim rules most relevant here:

- "Clicking the input label should focus the input field"; "Inputs should be wrapped with a `<form>` to submit by pressing Enter"; dropdowns open on **mousedown**, not click.
- "Font weight should not change on hover or selected state to prevent layout shift"; "Font weights below 400 should not be used"; use `font-variant-numeric: tabular-nums`.
- "Animation duration should not be more than 200ms for interactions to feel immediate"; "Animation values should be proportional to the trigger size"; looping animations pause off-screen.
- "Hover states should not be visible on touch press, use `@media (hover: hover)`"; "Font size for inputs should not be smaller than 16px to prevent iOS zooming"; "Inputs should not auto focus on touch devices".
- "Box shadow should be used for focus rings, not outline which won't respect radius" (note: modern `outline` follows `border-radius` in current browsers; the intent — a radius-respecting visible ring — stands).
- "Optimistically update data locally and roll back on server error with feedback"; "Display feedback relative to its trigger"; "Empty states should prompt to create a new item".

### 1.6 Vercel Web Interface Guidelines (vercel.com/design/guidelines, 2025)

- Keyboard-operable flows following WAI-ARIA patterns; `:focus-visible`; visible unobscured focus ring; focus the first error on submit; every control labelled; never disable paste.
- Loading states: show-delay ~150–300ms and minimum visible ~300–500ms (prevents flicker).
- Animate only `transform`/`opacity`; never `transition: all`; provide a reduced-motion variant.
- Typography: `tabular-nums` for comparisons; real ellipsis `…`; non-breaking spaces between number and unit / shortcut keys.
- Mobile: inputs ≥16px; hit targets ≥44px; safe-area variables; rarely autofocus.
- Performance: mutations complete <500ms; virtualize long lists; explicit image dimensions.
- Design: shadows "mimic ambient + direct light with at least two layers"; "combine borders & shadows; semi-transparent borders improve edge clarity"; "child radius ≤ parent radius & concentric"; APCA-informed contrast; skeletons "mirror final content exactly".

### 1.7 Emil Kowalski, animation principles (emilkowal.ski/ui/great-animations; course animations.dev)

- Keep UI animations **under ~300ms** (a 180ms interaction feels more responsive than 400ms); default to **ease-out** for user-initiated changes; springs for gesture-driven/natural motion.
- Animate `transform`/`opacity` only; prefer CSS transitions/WAAPI over rAF so motion survives a busy main thread.
- **"Never animate keyboard-initiated actions"** — they happen hundreds of times a day.
- **Interruptible**: transitions can be retargeted mid-flight; keyframes restart from zero — for rapid-fire interactions use transitions.
- Respect `prefers-reduced-motion`; match easing to the product's overall feel.

### 1.8 Synthesis: the premium recipe (what to copy, not who to copy)

1. **One type family with an optical-size pair** (e.g. Inter + Inter Display, Geist, or SF via `system-ui` on Apple), weights 400–600 only (Apple HIG: avoid Ultralight/Thin/Light; Rauno: nothing below 400), negative tracking on ≥20px, tabular numerals on all data.
2. **A 4/8-based non-linear spacing scale** (4, 8, 12, 16, 24, 32, 48, 64) and radii that are **concentric** (child = parent − padding), with 2–3 radius sizes max.
3. **Depth by tone, not shadow, in dark mode**; in light mode, two-layer shadows _or_ tint shifts; hairline (1px at 8–12% alpha) borders; "use fewer borders".
4. **Color rationed**: a neutral ladder (never pure #000/#fff — Material #121212; Linear low-chroma neutrals), **one** brand accent, and a small set of _semantic_ hues (danger, warning, success, info) plus **domain hues** (damage types, conditions, rarity) defined as tokens.
5. **Density**: Linear-like compact rows (32–40px) on desktop lists, 44–48px touch rows on mobile; density is a _setting_, not a guess.
6. **Materials only where they float** (tab bar, sticky action bar, sheets), per Apple.

**When NOT to use**: monochrome minimalism fails when the domain _needs_ categorical color (damage types, spell schools, conditions). The fix is not more decoration but a _disciplined categorical palette_ (see §8, Hades/Diablo category color).

---

## 2. Navigation & information architecture

### 2.1 Sidebar vs top nav vs bottom tab bar

- **NN/g hidden-navigation study** (Pernice & Budiu, 26 Jun 2016; 179 users, 6 sites): hidden (hamburger) nav → "more than 20% drop in discoverability"; tasks rated 21% harder; desktop users ≥39% slower, mobile 15% slower; hidden menus used 27% vs 48–50% (desktop) and 57% vs 86% (mobile). Recommendation: **no hidden nav on desktop; on mobile, hide only if >4 top-level links.**
- **NN/g mobile nav primer** (Budiu, 15 Nov 2015): tab bars are efficient and persistent but limited to ~5; hamburger suits "browse-mostly" content; navigation hub (hub-and-spoke) suits single-task sessions but wastes prime real estate.
- **Apple HIG tab bars**: 2–5 tabs (iOS 26 floating pill + separate Search island); "a tab bar answers _where am I_; a segmented control answers _which view of this screen_"; tab bars never trigger actions.
- **Material 3**: navigation bar (compact) 3–5 destinations; navigation rail (medium/expanded) 3–7 + optional FAB; drawer only for many destinations.
- **d20 Folio**: bottom tab bar on phone (Sheet · Combat · Party · Compendium · More); rail on tablet; sidebar on desktop (Linear's inverted-L). Never a hamburger as the only path to core surfaces. Campaign/DM tools that are many-and-rare can live in "More" or a drawer.

### 2.2 Command palette (Cmd/Ctrl-K)

- Origin: Sublime Text / VS Code command palette; spread via Figma, Notion, Linear, Raycast, Cron (documented in Mobbin glossary, uxpatterns.dev). **No dedicated NN/g research article exists** (NN/g's nearest is "UI Copy: UX Guidelines for Command Names and Keyboard Shortcuts" — prioritize shortcuts by observed frequency, name commands consistently).
- Proven because it's Jakob's-law familiar to keyboard users and collapses navigation depth. **Not** a substitute for visible navigation (NN/g hidden-nav numbers apply); useless on phone.
- d20 Folio: desktop/tablet only; searches spells, monsters, conditions, characters, and _verbs_ ("Add condition: Frightened", "Long rest"). Show shortcuts inline (`⌘K`, `/`).

### 2.3 Master-detail / list-detail

- Apple HIG split views; **Material 3 canonical layouts** ("list-detail" for medium/expanded windows); NN/g "The Anatomy of a List Entry" (Budiu) for what a row must carry (identifier, 2–3 discriminators, status, one affordance).
- Proven for roster, compendium, campaign hub on ≥medium widths; on compact widths it collapses to push navigation with a **back** affordance (Apple HIG: swipe-from-edge back; Android: system back must dismiss sheets first — NN/g bottom sheets).
- Not for: linear flows (use a wizard) or when the user must compare many items simultaneously (use a table).

### 2.4 Progressive disclosure, staged disclosure, one primary action

- Nielsen, "Progressive Disclosure" (2006): show the few most important options first, defer the rest; makes apps easier to learn and less error-prone.
- NN/g "8 Design Guidelines for Complex Applications" (Kaplan, 8 Nov 2020): learn by doing without losing work; flexible pathways (skip ahead, loop back); track actions (notes); **reduce clutter without reducing capability via staged disclosure**; ease primary↔secondary information (hover/tap detail without leaving); make important information visually salient.
- One primary action per screen: Refactoring UI hierarchy; Apple WWDC25 ("keep primary actions separate and tinted"); Material button hierarchy (filled > tonal > outlined > text). Competing primaries split attention.
- d20 Folio: the cockpit's primary is contextual (in combat: the current action; out of combat: nothing — the sheet is a reference). The combat turn screen has exactly one filled button.

### 2.5 Breadcrumbs, back behavior

- NN/g "Breadcrumbs: 11 Design Guidelines" (Laubheimer): show hierarchy not history; current page not a link; on mobile a single "up one level" breadcrumb often suffices.
- On mobile PWAs, browser back must map to _one_ level of UI (sheet → page → tab). Use the History API deliberately; a sheet that doesn't close on back is a defect (NN/g bottom sheets).

### 2.6 Sheets/drawers vs modals; tabs vs segmented controls

- NN/g Bottom Sheets (Laubheimer, 11 Jun 2023): anchored overlay for contextual detail/actions; non-modal in minimized state, modal when expanded; **support Back and a visible Close (X)**, don't rely solely on the grab handle; **never stack sheets**; not for long reading or primary navigation.
- Apple HIG Modality: "minimize the use of modality"; modal only when it's critical to get attention, a task must be completed/abandoned, or to save data. Sheets for scoped tasks; alerts for questions/permissions with specific button labels.
- NN/g "Tabs, Used Right" (Sunwall, 2 Aug 2024): tabs for clearly grouped, unequal-importance content with short labels; one row; never for sequential steps; never mix navigation tabs with in-page tabs.
- d20 Folio: in-page segmented control for Sheet sub-views (Actions · Spells · Inventory · Features); a bottom sheet for entity detail during combat; a full page for editing; a dialog only for destructive-and-irreversible (delete character) — and even then prefer undo/trash.

---

## 3. Mobile one-handed, thumb-zone and PWA patterns

- **Hoober 2013** (1,333 field observations): 49% one-handed, 36% cradled, 15% two-thumbed. **Hoober 2017** (UXmatters "Design for Fingers, Touch, and People", 6 Mar 2017) _corrects_ the popular thumb-zone chart: 75% of interactions are thumb-driven; **people prefer to view and touch the center of the screen** and scroll content into the center; accuracy: ~7mm targets suffice at center, ~12mm needed at corners/edges. Implication: put _reading_ at center, _actions_ at the bottom band, avoid corner-critical controls.
- **Targets**: Apple 44×44pt; Material 48×48dp; WCAG 2.2 **2.5.8 Target Size (Minimum) AA = 24×24 CSS px** (2.5.5 AAA = 44). Use 44 as the design floor, 24 as the legal floor for dense desktop tables.
- **Bottom sheets** (§2.6) and **sticky primary CTA**: Material extended FAB "for long scrolling views that require persistent access to an action"; Apple: primary actions in the bottom toolbar; Vercel/Rauno: safe-area padding on fixed elements.
- **FAB**: Material 3 — one FAB, the single most common action (Create/Add). Not for destructive or secondary actions; not on screens that already have a bottom action bar.
- **Swipe actions**: NN/g "Using Swipe to Trigger Contextual Actions" (Li, 12 Feb 2017): swipe is not discoverable; users expect **destructive** actions behind swipe; always provide a visible alternative and undo; don't overload the same gesture with different meanings.
- **Pull-to-refresh**: Twitter 2010 origin (Loren Brichter); fine for feeds; **not** for a local-first app where refresh has no meaning — show sync status instead.
- **Safe areas**: `viewport-fit=cover` + `env(safe-area-inset-*)` (MDN); pad fixed bars and toasts; test both orientations.
- **Haptics**: Apple HIG "Playing haptics" — reinforce actions and events, consistent, never gratuitous. On the web only `navigator.vibrate` (Android Chrome; not iOS Safari) — treat haptics as progressive enhancement.
- **Reduced motion**: `prefers-reduced-motion` (web.dev, MDN); Apple's Reduce Motion exists because iOS 7 animations caused cybersickness; replace slides/parallax with crossfades, keep state-carrying motion minimal.
- **Offline indicators**: web.dev "Offline UX design guidelines" (Kurtuldu & Steiner, 10 Nov 2016): tell the user both the app state and what they can still do; **action-based language rather than "offline"**; never color alone; queue actions and sync later; no blocking modals for network state.
- **PWA specifics**: standalone display, app-shell precache (already in place), 16px inputs to prevent iOS zoom, `@media (hover: hover)` guards, `-webkit-text-size-adjust: 100%`.
- d20 Folio combat turn on phone: **top = read** (initiative order, whose turn), **center = the active creature's card** (HP, AC, conditions, concentration), **bottom band = actions** (Damage/Heal, Condition, Next). Swipe only for "remove from encounter" with undo.

---

## 4. Motion

- **Ranges**: Rauno ≤200ms for interactions; Emil <300ms; Material short 50–200 / medium 250–400 (entering emphasized-decelerate, exiting emphasized-accelerate); Vercel loading show-delay 150–300ms, min visible 300–500ms.
- **Easing**: ease-out for user-initiated state changes; ease-in-out for on-screen moves; **springs** for gesture-driven/interruptible motion (Comeau: springs are "believable"; parameters mass/stiffness/damping; Comeau Oct 2025: native CSS `linear()` can encode springs/bounces, store a few as CSS variables; interrupted CSS springs don't preserve inertia — use JS springs only where gestures need it).
- **Interruptible**: CSS transitions retarget mid-flight; keyframes restart (Emil). Never lock the UI waiting for an animation.
- **Juice vs noise**: juice = motion that _carries information_ (HP bar drains to new value, initiative row slides to its new slot, a condition badge pops in relative to its trigger). Noise = fade-ins on everything, hover bounces, parallax. Material research: expressiveness helps when it emphasizes the primary element; hurts when it breaks conventions. Emil: keyboard-initiated actions never animate.
- **View Transitions API** (Chrome blog, 8 Oct 2025): same-document transitions are Baseline (Chrome 111+, Safari 18+, Firefox 144+); cross-document in Chrome 126+ / Safari 18.2+, Firefox pending. Use for list→detail continuity (`view-transition-name` on the creature card), with a reduced-motion crossfade fallback. React `<ViewTransition>` is canary-only — prefer the DOM API through the router.
- **Reduced motion** must be a first-class variant, not a kill switch: keep opacity crossfades and instant layout, remove translation/scale (Apple, web.dev).
- d20 Folio: three motion tokens are enough — `instant` (0/1 frame, keyboard), `quick` (150–200ms ease-out, taps), `move` (250–350ms emphasized, reorders/sheets); one spring preset for the sheet drag.

---

## 5. Data-dense reading and editing surfaces

- **Tables/lists**: NN/g "Data Tables: Four Major User Tasks" (Laubheimer, 3 Apr 2022): find, compare, view/edit single record, act on records. Guidelines: human-readable identifier first; columns by importance; sticky header/first column; zebra/hover for orientation; **edit in a non-modal side panel, not a modal that hides reference data**; batch actions via checkboxes; hide overflow row actions under a menu. NN/g "How to Fit Big Tables on Small Screens": collapse to cards/priority columns on mobile.
- **Inline editing**: NN/g has no dedicated article; the pattern is standard in Linear/Notion (click-to-edit with visible affordance on hover/focus, Enter commits, Esc cancels, optimistic save). Apply to HP, notes, and quantities; not to structural fields (class, race) — those go through the wizard.
- **Forms**: Baymard "Place labels above the field" (19 Mar 2013; 18 mobile sites): top-aligned labels give full-width inputs, room for helper text, single eye fixation; left-aligned only in landscape. Baymard inline validation (9 Jan 2024): 31% of sites lack it; validate **on blur** (or when the correct length is reached), **remove errors keystroke-by-keystroke** once corrected, use positive validation for complex fields, never validate an empty untouched field. NN/g 10 form-error guidelines (Krause, 3 Feb 2019): errors next to the field, red + icon, don't validate before completion, no tooltip-only errors, summary at top only alongside inline messages. NN/g error-message guidelines: human-readable, precise, constructive, no blame.
- **Steppers/wizards**: NN/g Wizards (Budiu, 25 Jun 2017): for occasional, branching tasks; show a step map, descriptive Next labels ("Choose subclass"), allow exit/resume, self-sufficient steps; cost = more clicks, blocked app when modal. WCAG 2.2 **3.3.7 Redundant Entry**: never re-ask what the flow already knows.
- **Pickers/searchable selects**: NN/g "Listboxes vs Dropdown Lists" (Budiu, 2020): dropdowns hide options and are single-select; for >~15 options use a searchable combobox (WAI-ARIA combobox pattern); for ≤5 use radios/segmented. Spell/monster pickers are search-first with filters as chips.
- **Empty states**: NN/g (Kaplan, 19 Sep 2021): communicate status ("no encounters yet"), teach ("star monsters to list them here"), offer the direct pathway (Create / Import / Try sample).
- **Skeletons vs spinners**: NN/g Skeleton Screens 101 (Tankala, 4 Jun 2023): <1s nothing; 2–10s skeleton for page loads, spinner for single modules; >10s progress bar; skeletons must reflect real layout (no header/footer-only frames). Vercel: skeletons mirror final content exactly.
- **Undo instead of confirm**: Nielsen (18 Feb 2018): confirmations only for serious, irreversible consequences; overuse causes habituation ("if you warn people too much, they stop paying attention"); use action-specific labels ("Delete character"/"Keep character"); provide undo. Gmail Undo Send / Undo archive; iOS shake-to-undo.
- **Optimistic UI**: Mishunov, "True Lies of Optimistic User Interfaces" (Smashing, 15 Nov 2016): apply immediately, keep failure probability low, roll back with clear feedback; Vercel/Rauno codify the same.
- d20 Folio: the encounter reducer over an append-only log makes _every_ combat mutation optimistic and undoable by construction — surface it as a persistent "Undo" affordance in the toast and a history drawer.

---

## 6. Feedback & status

- **NN/g "Indicators, Validations, and Notifications"** (Flaherty, 17 Jan 2024): indicators = conditional supplementary info attached to an element (badges, pips); validations = input errors; notifications = system events. Map **urgency → intrusiveness/persistence**: passive (badge, corner toast) for informational; action-required (modal) only for urgent, must-act events. Mismatch is the classic failure (toast that hides a critical error; modal for trivia).
- **Nielsen heuristic #1, Visibility of System Status** (1994; NN/g article by Harley): appropriate feedback within reasonable time.
- **Toasts**: confirm completed actions, carry Undo, appear relative to the trigger or in a consistent corner, never block; duration claims like "4–8s" circulate but I found no NN/g primary source with those numbers — treat as convention. WCAG **2.2.1 Timing Adjustable** applies: a toast with an action must be pausable/persistent or long enough. Emil Kowalski's Sonner is the de-facto reference implementation (stacking, swipe-dismiss, hover-pause).
- **Badges/counters**: attach to the thing they describe; non-interactive; give them an accessible label ("3 unread"). Don't badge everything (M3 Expressive warning about emphasis inflation).
- **Resource pips/meters/timers**: game UI convention (Hades boons, StS energy, BG3 action-economy pips: Action/Bonus/Reaction/Movement as filled/hollow shapes). Pips beat numbers for ≤6 discrete resources (spell slots per level, Ki, Sorcery Points, death saves); bars for continuous (HP, movement); tabular numerals for the value. Never encode state in color alone.
- **Live-collaboration presence**: Figma "Multiplayer Editing in Figma" (Evan Wallace, Oct 2019): show every participant's cursor/selection because it "provides important context"; avatar stack top-right; per-user color; click avatar to follow. For d20 Folio party play: avatar stack on the campaign hub, "who's editing" on shared encounter, presence dots on the roster — use Firestore presence sparingly (zero-cost posture: one listener per open encounter, not per entity).

---

## 7. Typography specifics for premium

- **Sans vs serif in product UI**: product chrome and data stay sans (Apple SF, Inter/Geist); serifs work as _editorial voice_ in display sizes — Arc, many 2024–25 brand refreshes, Instrument Serif (Google Fonts, Rodrigo Fuenzalida, 2022) paired with Inter is the current trend pairing (Fonts In Use, Creative Boom 2025). **Use serif only for**: campaign titles, chronicle/journal headings, share/OG cards, onboarding — never for tables, stat blocks, or anything under ~18px in dark mode.
- **Variable fonts + optical sizing**: Apple WWDC20 "The details of UI typography": SF has continuous optical sizes (Text ≤19pt, Display ≥20pt); Linear pairs Inter + Inter Display. Ship one variable font file with `opsz` axis where available.
- **Tabular figures**: `font-variant-numeric: tabular-nums` (MDN) on every numeric cell, counter, timer, modifier; proportional figures in prose. Vercel/Rauno both mandate it; Stripe does it for money.
- **Sizes**: iOS body 17pt, secondary 15pt, caption 13pt, tab labels 11pt (HIG minimum 11pt); Material body 16sp; web body 16px minimum on mobile (also prevents iOS zoom in inputs). Reading line length **50–75 characters** (Baymard, "Readability: The Optimal Line Length"), 30–50 on phones; line-height ~1.4–1.5 for body, tighter (1.1–1.2) for display.
- **Dark-mode contrast**: no pure black/white — Material #121212 base, on-surface text at reduced opacity (87/60/38%), desaturated accents (200-tone) because saturated hues "vibrate" on dark; Linear reduces chroma in neutrals; Vercel recommends APCA for judging text contrast (WCAG 2.x ratio still the compliance metric).
- **WCAG 2.2 (W3C Recommendation, 5 Oct 2023)** — what changed: **2.4.11 Focus Not Obscured (AA)** — sticky bars/sheets must not hide the focused element; **2.4.13 Focus Appearance (AAA)** — ring size/contrast; **2.5.7 Dragging Movements (AA)** — every drag (initiative reorder, HP slider) needs a single-pointer alternative (up/down buttons, +/− steppers); **2.5.8 Target Size (AA)** — 24×24 or spacing equivalent; **3.2.6 Consistent Help (A)**; **3.3.7 Redundant Entry (A)**; **3.3.8 Accessible Authentication (AA)**; 4.1.1 Parsing removed.

---

## 8. Gaming-flavored premium UI without a fantasy skin

Reference source: **Game UI Database** (gameuidatabase.com, Edd Coates; 2.0 relaunch 2023; 55,000+ screenshots, 1,700+ videos, 1,341 titles; filters by screen type, HUD element, pattern, color, genre). Use it to compare _screens by function_ (inventory, character sheet, turn tracker, level-up) across titles rather than to copy art.

**Taxonomy**: Fagerholt & Lorentzon, "Beyond the HUD" (Chalmers, 2009): diegetic / non-diegetic / spatial / meta along fiction and geometry axes. Marcus Andrews (EA DICE, Game Developer, 23 Feb 2010): players prioritize **functionality and information access over immersion**; fully diegetic UIs (Dead Space, Far Cry 2) still needed conventional HUD elements. For a companion app the whole UI is non-diegetic by definition — the table is the diegesis. Ornament that pretends otherwise (parchment, wax seals) is the "fantasy skin" to avoid.

Named treatments and what to borrow:

- **Hearthstone** (Derek Sakamoto, GDC 2015 "How to Create an Immersive User Interface"): "our game is UI"; physicality and tactile feedback (the board, card lift/drop, weight), everything responds to touch; readability preserved through strong card hierarchy (cost top-left, stats bottom, name band). Borrow: _every tap has a physical reaction_; a card metaphor for creatures/spells with fixed slots for the numbers people scan for.
- **Hades** (Supergiant; catalogued on Game UI Database / Interface In Game; fan analyses not fetched): HUD kept peripheral and grouped by decision relevance; boon choices are **color-coded per god** with consistent iconography; a Codex gives full info before you need it. Borrow: category color as a _system_ (damage types, spell schools, conditions), generous card-based choice screens for level-up.
- **Diablo IV** (Blizzard; tooltip rules documented in Scott Hernandez's analysis of the 2019 quarterly updates, not fetched): tooltips respect a **safe area around the selection**, **repellant zones** over critical controls, and **content-aware static positioning** (never jitter after appearing). The 2020 ornate-font swap prompted readability complaints — evidence that theme fonts cost legibility. Borrow: the three tooltip rules verbatim for the compendium and combat detail popovers; rarity/quality color scale for item tiers.
- **Elden Ring** (debate reported by Kotaku, 10 Mar 2022): minimal HUD praised for immersion, menus criticized for undecipherable icons and buried actions. Lesson: minimalism is not clarity; icons need labels (Apple WWDC25 says the same: "prefer text labels for ambiguous actions").
- **Dragon Age: The Veilguard** (Bruno Porrio, GDC 2025 via GamingBolt, 18 Mar 2025): unobtrusive corner UI was _ignored_ — testers never noticed primer/detonator prompts. Lesson: critical state must live in the center/primary reading zone, not the periphery (agrees with Hoober's center-of-screen finding).
- **Marvel Snap** (Second Dinner; "SNAPPY U.I." analysis by Andrew Hutcheson on ArtStation, not fetched): "dark piano glass" material with UI as projected holograms; portrait one-hand layout; matches under ~3 minutes; fresh approaches for casual players. Borrow: a _single_ material language (dark glass floating controls) and a decisive hierarchy for a portrait phone.
- **Baldur's Gate 3** (Larian): PC hotbar vs console **radial menus**; combat readability depends on the initiative tracker and action-economy pips; the Quadraat Pro UI font drew legibility complaints (small text, tight spacing) — Larian shipped a UI-scale slider. Borrow: action-economy pips (Action/Bonus/Reaction/Movement), initiative strip with portraits, a user-controlled density/size setting. Avoid: a period typeface for body text.
- **Slay the Spire 2** (Mega Crit, Early Access Mar 2026, PCGamesN): the End Turn button now reads "End Turn 2" — the turn counter lives on the primary control. Borrow: put the round number on the Next-turn button; show relic/effect reminders where the decision is made.

**Diegetic vs non-diegetic for d20 Folio**: keep the UI frankly non-diegetic and let _content_ carry flavor (monster art, spell school color, campaign banners). Premium game feel comes from: tactile feedback on every action, category color systems, decisive hierarchy, tooltip discipline, and a user-controlled density/size setting — not textures.

---

## 9. Anti-patterns / "AI slop" and "generic SaaS dashboard" tells

Sources: 925 Studios "AI Slop Fonts and Gradients: The Tells" (1 Sep 2026); Mania Design "Spot the Slop" (Kosta Canatselis, 23 Jul 2026); SmoothUI "AI Design Slop"; Braingrid "Stop Getting Purple Gradients"; Material card guidance; Refactoring UI.

The tells (each with the fix):

1. **Inter everywhere with no display pair** → choose a deliberate family/pair; Inter is fine _if_ paired and tuned (Linear does exactly that).
2. **Indigo-to-purple gradients** (traced to Tailwind's 2019 defaults) → color by function; one accent.
3. **Three equal cards in a row, icon + heading + two lines** → asymmetry, real hierarchy, lists where a list is right.
4. **Cards in cards / everything boxed**: Material: "a card is a single, contained unit"; Refactoring UI: "use fewer borders" → separate with spacing and tint; one container level per region.
5. **Identical padding/radius/card height everywhere** → vary intentionally so primaries dominate.
6. **Thin interchangeable line icons; emoji as icons** → a consistent icon set with labels; domain glyphs (damage types, conditions) drawn to one grid.
7. **Glassmorphism cards with neon glows, blobs, decorative ornament** → materials only where they float (Apple).
8. **Uniform fade-ins / hover bounces** → motion carries state (§4).
9. **Weightless copy** ("Build faster. Ship smarter") → specific, product-voiced microcopy (Stripe's "tells you exactly what happened and what to do next").
10. **No edge states** (empty, loading, error, offline) → design unhappy paths first (§5, §3).
11. **All panels visible at once** ("dashboard as analyst workbench + exec summary") → staged disclosure; one north-star per screen.
12. **Pure black/white, saturated accents on dark** → Material dark-theme rules (§1.4, §7).
13. **Hamburger-only navigation on desktop** → NN/g numbers (§2.1).
14. **Confirm dialogs for routine actions** → undo (§5).
15. **Fantasy skin**: parchment textures, blackletter/period fonts for body, ornate frames → keep to content and titles (§8; Diablo IV and BG3 font lessons).

---

## Pattern → d20 Folio surface mapping

| Surface                                     | Primary patterns                                                                                                                                                           | Concrete decisions                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Character cockpit** (sheet, mobile-first) | Progressive disclosure; center-of-screen reading; tabular numerals; pips for slots; segmented sub-views; inline edit for HP/notes; indicators for conditions/concentration | Top: name, HP bar + numeric (tnum), AC/Init/Speed/PB as a 4-stat row; center: current sub-view (Actions default); bottom: segmented control (Actions · Spells · Gear · Traits) in a floating glass bar; conditions as attached badges; long-press/hover cockpit tooltips on every abbreviation (owner rule). |
| **Combat turn** (phone at table)            | Sticky bottom action band; one primary; bottom sheet for entity detail; undo toasts; interruptible motion; View Transition list→card; round on the Next button             | Initiative strip (portraits, tnum initiative) top; active creature card center; band: Damage/Heal (stepper + quick values), Condition, **Next (Round 3)** filled; every mutation → toast "−12 HP to Goblin · Undo"; drag reorder + up/down buttons (WCAG 2.5.7); reduced-motion crossfades.                  |
| **Roster / party**                          | List-detail; list-entry anatomy; presence avatars; swipe only for remove + undo; empty state with Create/Import                                                            | Row: portrait, name, class/level, HP mini-bar, status dots; detail in side panel (desktop) / push (mobile); avatar stack for online members; "Invite" as the single primary.                                                                                                                                 |
| **Campaign hub**                            | Hub-and-spoke for rare tasks + visible tabs for frequent; cards only for genuinely distinct units; serif allowed for the campaign title; share surfaces as marketing       | Hero: campaign title (display serif ok), next session, party avatars; sections as lists not card grids; DM tools in a "More" drawer; OG/share preview designed as a card with real hierarchy.                                                                                                                |
| **Compendium**                              | Search-first combobox; filter chips; data-table rules; tooltip rules (safe area, repellant zones, static); category color system; Cmd-K on desktop                         | Results as dense rows (desktop 36px, mobile 48px) with human-readable identifier first; monster stat block in a non-modal panel; damage-type/school/condition colors from tokens; skeleton only if network fetch >1s, else instant from cache.                                                               |
| **Creation wizard**                         | NN/g wizard rules; labels above; blur validation; positive validation; step map; resumable; review step; no redundant entry                                                | Steps: Class → Background → Race/Species → Abilities → Equipment → Spells → Review; branch by class; "Next: choose subclass" labels; autosave draft; summary review with edit-in-place links.                                                                                                                |
| **Level-up**                                | Card-choice screen (Hades boons); one decision per screen; pips/deltas with tnum; undo whole level-up                                                                      | Present choices as 2–3 large cards with clear deltas (+1 HP die, new feature), delight moment on completion (Family's delight-impact curve: rare flow → richer moment), "Undo level-up" for a window.                                                                                                        |
| **Settings**                                | Progressive disclosure; navigation hub; consistent help (WCAG 3.2.6); density/size/motion/contrast controls                                                                | Grouped list (Account · Appearance · Play · Data · About); Appearance: theme (system/light/dark), contrast, density (compact/comfortable), reduce motion (follows OS, overridable), text size; Data: offline status in action language ("Everything on this phone is saved; 2 changes waiting to sync").     |

---

## Sources (URL · author/org · date)

Craft & platform guidelines

- Refactoring UI — Wathan & Schoger, 2018 — https://refactoringui.com/
- How we redesigned the Linear UI (part II) — Linear, 28 Mar 2024 — https://linear.app/now/how-we-redesigned-the-linear-ui
- Web Interface Guidelines — Vercel, 2025 — https://vercel.com/design/guidelines ; repo https://github.com/vercel-labs/web-interface-guidelines
- interfaces: a non-exhaustive list of details — Rauno Freiberg, public since May 2023 — https://github.com/raunofreiberg/interfaces
- Geist introduction / font — Vercel — https://vercel.com/geist/introduction ; https://vercel.com/font
- Great animations — Emil Kowalski (date not shown) — https://emilkowal.ski/ui/great-animations ; course https://animations.dev/
- Family Values — Benji Taylor, 8 Jul 2024 — https://benji.org/family-values
- Things 3 launch coverage — 9to5Mac, 18 May 2017 — https://9to5mac.com/2017/05/18/things-3-mac-iphone-ipad-watch/
- Cron is now Notion Calendar — Cron blog, 17 Jan 2024 — https://www.cron.com/blog/2024-01-17-cron-is-now-notion-calendar
- Get to know the new design system (WWDC25 356) — Apple, Jun 2025 — https://developer.apple.com/videos/play/wwdc2025/356/
- Meet Liquid Glass (WWDC25 219) — Apple, Jun 2025 — https://developer.apple.com/videos/play/wwdc2025/219/
- HIG Materials — Apple — https://developer.apple.com/design/human-interface-guidelines/materials (JS-rendered; not fetched)
- Liquid Glass: hierarchy, harmony, consistency — Create with Swift, 30 Oct 2025 — https://www.createwithswift.com/liquid-glass-redefining-design-through-hierarchy-harmony-and-consistency/
- iOS 26 design guidelines (sizes, 44pt, tab bars) — Learn UI Design, updated 22 Apr 2026 — https://www.learnui.design/blog/ios-design-guidelines-templates.html
- The details of UI typography (WWDC20) — Apple, 2020 — https://developer.apple.com/videos/play/wwdc2020/10175/
- HIG Typography — Apple — https://developer.apple.com/design/human-interface-guidelines/typography (not fetched)
- HIG Playing haptics — Apple — https://developer.apple.com/design/human-interface-guidelines/playing-haptics
- HIG Designing for games — Apple — https://developer.apple.com/design/human-interface-guidelines/designing-for-games
- Expressive Design: Google's UX Research — Google Design, May 2025 — https://design.google/library/expressive-material-design-google-research
- M3 motion tokens (Motion.md) — material-components-android — https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md ; spec https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
- M3 Elevation — https://m3.material.io/styles/elevation ; Dark theme (M2, 2019) — https://m2.material.io/design/color/dark-theme.html (not fetched; values from spec as commonly cited)
- M3 Navigation bar / rail / FAB / canonical layouts — https://m3.material.io/components/navigation-bar/guidelines ; https://m3.material.io/components/navigation-rail/guidelines ; https://m3.material.io/components/floating-action-button/guidelines ; https://m3.material.io/foundations/layout/canonical-layouts/overview
- Radix Colors / Themes color — https://www.radix-ui.com/themes/docs/theme/color
- Third-party token analyses (not primary): Linear, Raycast, Stripe DESIGN.md — https://github.com/VoltAgent/awesome-design-md ; Stripe dashboard breakdown — https://www.925studios.co/blog/stripe-dashboard-design-breakdown ; Arc UX analysis — https://blog.logrocket.com/ux-design/ux-analysis-arc-opera-edge/

Navigation, IA, patterns (NN/g, Baymard, Laws of UX)

- Hamburger Menus and Hidden Navigation Hurt UX Metrics — Pernice & Budiu, 26 Jun 2016 — https://www.nngroup.com/articles/hamburger-menus/
- Basic Patterns for Mobile Navigation — Budiu, 15 Nov 2015 — https://www.nngroup.com/articles/mobile-navigation-patterns/
- Progressive Disclosure — Nielsen, 2006 — https://www.nngroup.com/articles/progressive-disclosure/
- 8 Design Guidelines for Complex Applications — Kaplan, 8 Nov 2020 — https://www.nngroup.com/articles/complex-application-design/
- Bottom Sheets: Definition and UX Guidelines — Laubheimer, 11 Jun 2023 — https://www.nngroup.com/articles/bottom-sheet/
- Tabs, Used Right — Sunwall, 2 Aug 2024 — https://www.nngroup.com/articles/tabs-used-right/
- Breadcrumbs: 11 Design Guidelines — Laubheimer — https://www.nngroup.com/articles/breadcrumbs/
- The Anatomy of a List Entry — Budiu — https://www.nngroup.com/articles/list-entries/
- UI Copy: Command Names and Keyboard Shortcuts — NN/g — https://www.nngroup.com/articles/ui-copy/
- Using Swipe to Trigger Contextual Actions — Li, 12 Feb 2017 — https://www.nngroup.com/articles/contextual-swipe/
- Skeleton Screens 101 — Tankala, 4 Jun 2023 — https://www.nngroup.com/articles/skeleton-screens/
- Confirmation Dialogs Can Prevent User Errors — Nielsen, 18 Feb 2018 — https://www.nngroup.com/articles/confirmation-dialog/
- Wizards: Definition and Design Recommendations — Budiu, 25 Jun 2017 — https://www.nngroup.com/articles/wizards/
- Designing Empty States in Complex Applications — Kaplan, 19 Sep 2021 — https://www.nngroup.com/articles/empty-state-interface-design/
- Data Tables: Four Major User Tasks — Laubheimer, 3 Apr 2022 — https://www.nngroup.com/articles/data-tables/
- 10 Design Guidelines for Reporting Errors in Forms — Krause, 3 Feb 2019 — https://www.nngroup.com/articles/errors-forms-design-guidelines/
- Error-Message Guidelines — NN/g — https://www.nngroup.com/articles/error-message-guidelines/
- Listboxes vs. Dropdown Lists — Budiu, 2020 — https://www.nngroup.com/articles/listbox-dropdown/
- Indicators, Validations, and Notifications — Flaherty, 17 Jan 2024 — https://www.nngroup.com/articles/indicators-validations-notifications/
- Visibility of System Status (Heuristic #1) — NN/g — https://www.nngroup.com/articles/visibility-system-status/
- The Aesthetic-Usability Effect — Moran, 3 Feb 2024 — https://www.nngroup.com/articles/aesthetic-usability-effect/
- Field Label UX: Place Labels Above the Field — Baymard, 19 Mar 2013 — https://baymard.com/blog/mobile-form-usability-label-position
- Usability Testing of Inline Form Validation — Baymard, 9 Jan 2024 — https://baymard.com/blog/inline-form-validation
- Readability: The Optimal Line Length — Baymard — https://baymard.com/blog/line-length-readability
- Laws of UX — Jon Yablonski (book 2020) — https://lawsofux.com/
- Design for Fingers, Touch, and People, Part 1 — Steven Hoober, UXmatters, 6 Mar 2017 — https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php
- How We Hold Our Gadgets — Hoober, A List Apart, 2013 — https://alistapart.com/article/how-we-hold-our-gadgets/
- Command palette glossary — Mobbin — https://mobbin.com/glossary/command-palette ; uxpatterns.dev — https://uxpatterns.dev/patterns/advanced/command-palette
- True Lies of Optimistic User Interfaces — Mishunov, Smashing, 15 Nov 2016 — https://www.smashingmagazine.com/2016/11/true-lies-of-optimistic-user-interfaces/
- Multiplayer Editing in Figma — Evan Wallace, Oct 2019 — https://www.figma.com/blog/multiplayer-editing-in-figma/

Motion, web platform, accessibility

- A Friendly Introduction to Spring Physics — Josh Comeau, 2020 (updated 3 Nov 2025) — https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/
- Springs and Bounces in Native CSS — Josh Comeau, 28 Oct 2025 — https://www.joshwcomeau.com/animation/linear-timing-function/
- What's new in view transitions (2025 update) — Chrome, 8 Oct 2025 — https://developer.chrome.com/blog/view-transitions-in-2025
- View Transition API — MDN — https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
- prefers-reduced-motion — web.dev (Steiner) — https://web.dev/articles/prefers-reduced-motion ; MDN — https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- Offline UX design guidelines — Kurtuldu & Steiner, web.dev, 10 Nov 2016 — https://web.dev/articles/offline-ux-design-guidelines
- env() safe-area-inset — MDN — https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env
- font-variant-numeric — MDN — https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric
- WCAG 2.2 — W3C Recommendation, 5 Oct 2023 — https://www.w3.org/TR/WCAG22/ ; What's new in WCAG 2.2 — TetraLogical, 5 Oct 2023 — https://tetralogical.com/blog/2023/10/05/whats-new-wcag-2.2/
- Target sizes across standards — LogRocket — https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/

Games

- Game UI Database — Edd Coates — https://www.gameuidatabase.com/ ; relaunch coverage, Game Developer — https://www.gamedeveloper.com/design/game-ui-database-relaunches-with-new-features-video-support-and-over-55-000-screenshots
- Beyond the HUD — Fagerholt & Lorentzon, Chalmers, 2009 — https://www.researchgate.net/publication/277202228_Beyond_the_HUD_-_User_Interfaces_for_Increased_Player_Immersion_in_FPS_Games
- Game UI Discoveries: What Players Want — Marcus Andrews (EA DICE), 23 Feb 2010 — https://www.gamedeveloper.com/design/game-ui-discoveries-what-players-want
- Hearthstone: How to Create an Immersive User Interface — Derek Sakamoto, GDC 2015 — https://gdcvault.com/play/1022036/Hearthstone-How-to-Create-an ; coverage https://www.gamedeveloper.com/design/video-designing-an-immersive-user-interface-for-i-hearthstone-i-
- Elden Ring UI debate — Kotaku, 10 Mar 2022 — https://kotaku.com/elden-ring-ui-ux-user-experience-interface-fromsoftware-1848637410
- Veilguard UX (Bruno Porrio, GDC 2025) — GamingBolt, 18 Mar 2025 — https://gamingbolt.com/dragon-age-the-veilguard-ux-designer-revealed-qa-teams-issues-with-figuring-out-combat-system
- SNAPPY U.I. (Marvel Snap) — Andrew Hutcheson, ArtStation — https://www.artstation.com/artwork/GemNDd (403; via search summary)
- Diablo IV tooltip rules — Scott Hernandez, Medium — https://medium.com/@superscott597/diablo-inventory-ui-fan-redesign-figma-ue4-part-i-ae967d6c4917 (403; via search summary); Diablo IV UI font change coverage — https://www.gamepressure.com/newsroom/diablo-4-blizzard-showed-interface-changes-and-divided-players/z154d4
- BG3 console UI analysis — Medium (Jaiwanth) — https://medium.com/design-bootcamp/bridging-the-gap-overhauling-console-experience-in-baldurs-gate-3-43ef3578791b (403; via search summary); Larian forums readability thread — https://forums.larian.com/ubbthreads.php?ubb=showflat&Number=666299
- Hades — Game UI Database — https://gameuidatabase.com/gameData.php?id=534 ; Interface In Game — https://interfaceingame.com/games/hades/ (403)
- Slay the Spire 2 End Turn counter — PCGamesN, 2026 — https://www.pcgamesn.com/slay-the-spire-2/slay-the-spire-2-makes-keeping-track-of-its-new-relics-and-potions-much-easier

Anti-patterns

- AI Slop Fonts and Gradients: The Tells — 925 Studios, 1 Sep 2026 — https://www.925studios.co/blog/ai-slop-design-tells
- Spot the Slop — Kosta Canatselis, Mania Design, 23 Jul 2026 — https://www.mania.design/blog/spot-the-slop-a-ui-designers-guide-to-fixing-ai-defaults/
- AI Design Slop — SmoothUI — https://smoothui.dev/blog/ai-design-slop
- Why Your AI Keeps Building the Same Purple Gradient Website — https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website
- Card UI best practices (Material "single contained unit") — https://www.stan.vision/journal/ui-card-design-examples-best-practices-and-common-patterns
