---
# Runtime design tokens of d20 Folio.
#
# Pruning rule (2026-09-09): this block carries ONLY tokens that are defined in
# `src/index.css` and consumed somewhere in `src/` — measured with
#   grep -o 'var(--[a-z0-9-]*)' src/index.css | sort -u
# then confirmed against actual `var(--token)` use across `src/` (a token such as
# `--touch-min` is defined in `src/index.css` but consumed in `src/styles/folio.css`,
# not in `src/index.css` itself). Everything the v1 document listed and the CSS no
# longer consumes was dropped, together with the whole light-theme half (dark only,
# owner 2026-09-05). `src/index.css` remains the authoritative source of the values;
# this block is a summary for design tools, never a second definition to keep in
# sync by hand. The non-colour keys below are group-relative design-token names,
# not literal CSS custom-property names: `spacing: 2` names `--sp-2`,
# `motion: fast` names `--m-fast`, `rounded: md` names `--radius-md`.
name: d20 Folio
description: A premium, dark-only companion for D&D 2024 — one coherent system across every surface, state and breakpoint, in EN and IT.
colors:
  # Mineral-pigment ramps — the raw material the roles are assigned from
  gold-leaf-100: "#ecd28a"
  gold-leaf-300: "#d4ac4d"
  gold-leaf-500: "#b8923d"
  gold-leaf-700: "#7a5f24"
  gold-leaf-900: "#3d2f12"
  lapis-100: "#a8bce0"
  lapis-300: "#6589c4"
  lapis-700: "#1a3358"
  vermilion-100: "#e8a299"
  vermilion-300: "#d4685a"
  vermilion-700: "#8a2418"
  verdigris-100: "#9cc8b3"
  verdigris-300: "#6ba88a"
  verdigris-700: "#2e5a47"
  amethyst-100: "#b89fd1"
  amethyst-300: "#8e5cc0"
  amethyst-700: "#43245d"
  # Role assignments (dark, the only theme)
  bg-page: "#0c0a07"
  bg-surface-1: "#15110b"
  bg-surface-2: "#1d1810"
  bg-surface-3: "#2a2317"
  bg-recessed: "#0a0705"
  text-primary: "#f0e4cb"
  text-secondary: "#c4b89e"
  text-muted: "#988b6e"
  border-soft: "#241e15"
  border-medium: "#352c1f"
  border-strong: "#4d3f29"
  border-accent: "#6b562f"
  accent-primary: "{colors.gold-leaf-500}"
  accent-primary-bright: "{colors.gold-leaf-300}"
  accent-primary-deep: "{colors.gold-leaf-700}"
  accent-text: "{colors.gold-leaf-300}"
  accent-glow: "{colors.gold-leaf-500}"
  focus-ring: "{colors.gold-leaf-300}"
  focus-wash: "rgba(253, 221, 166, 0.25)"
  # Semantics
  semantic-success: "{colors.verdigris-300}"
  semantic-danger: "{colors.vermilion-300}"
  semantic-warning: "{colors.gold-leaf-300}"
  semantic-info: "{colors.lapis-300}"
  # Action-type register (one colour per economy slot, always paired with a shape)
  at-action: "{colors.verdigris-300}"
  at-bonus: "{colors.lapis-300}"
  at-reaction: "{colors.vermilion-300}"
  at-magic: "{colors.amethyst-300}"
  at-free: "{colors.text-secondary}"
  at-nothing: "{colors.text-secondary}"
  # Materials
  metal-silver: "#c4baa9"
  metal-bronze: "#6e5a3c"
  ember-umber: "122, 74, 16" # rgb triplet, composed at any alpha
  glow-stroke-gold: "#5e4a1e"
  sl-3: "#d8c850" # spell-slot ink
typography:
  title:
    fontFamily: "Cinzel Variable, Cinzel, Georgia, serif"
    note: "ceremonial titling; caps-only face; never below 14px"
  display:
    fontFamily: "Alegreya Variable, Alegreya, Georgia, serif"
    note: "content headings"
  body:
    fontFamily: "Alegreya Variable, Alegreya, Iowan Old Style, Georgia, serif"
    fontSize: "0.9375rem"
    lineHeight: 1.5
  numeric:
    fontFamily: "Source Serif 4, Georgia, serif"
    note: "numbers, stats, uppercase label register; tabular lining figures"
    letterSpacing: "0.04em"
rounded:
  md: "2px" # lapidary: chips are facets, never pills
spacing:
  2: "8px"
  4: "16px"
  touch-min: "44px"
motion:
  fast: "160ms"
  ease-standard: "cubic-bezier(0.4, 0, 0.2, 1)"
---

# Design

The visual and interaction contract of d20 Folio **v2**: the approved reference, what the code
renders today, and the standing owner corrections that any new surface must already satisfy.

This document owns the **concrete application** of the clarity and craft requirements that
[`PRODUCT.md`](PRODUCT.md) states as principle. It does not own product scope
([`PRODUCT.md`](PRODUCT.md), [`docs/PRODUCT_CONSTITUTION.md`](docs/PRODUCT_CONSTITUTION.md)), the
build ([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)), or the order of work
([`docs/program/PROGRAM.md`](docs/program/PROGRAM.md)). The v1 design system — the Tactical Codex
atlas, the light theme, the numbered construction catalogue — is history at
[`docs/archive/v1/DESIGN.md`](docs/archive/v1/DESIGN.md) and
[`docs/archive/v1/design/`](docs/archive/v1/design/). Nothing there authorises restoring light
parity, the old information architecture or the old palette.

## 1. The reference is the frozen mock, not a resemblance

The approved experience reference for every v2 surface is the frozen HTML laboratory
**`d20-folio-html-0.9.3-2026-09-06`**, plus the shell and Account corrections of 7 September 2026.
Compare a runtime against it, never against a general impression:

- the freeze is identified byte-exactly by
  [`docs/program/reference/mock-0.9.3-manifest.json`](docs/program/reference/mock-0.9.3-manifest.json)
  (523 files with SHA-256, `contentRootSha256` `5cbf9662…`);
- fourteen curated WebP captures are committed under
  [`docs/program/reference/screenshots/`](docs/program/reference/screenshots) — campaign hub,
  character sheet, inventory, targeting, applied outcome, causal correction, the IT play HUD with
  slots, the DM workspace, calendar, Account in IT, the phone sheet and phone navigation, plus the
  two shell-r2 surfaces;
- the laboratory itself is **not committed** (licensed third-party assets); it is named by path in
  [`docs/program/reference/README.md`](docs/program/reference/README.md) and opened locally when a
  block needs a surface the folder does not cover.

A tag or a hash identifies a candidate; it never closes a gate on its own. The light-theme captures
and the 28 legacy P02 screenshots are **withdrawn** and are not references.

Reproducing the state of the art in full — Baldur's Gate 3 for combat feel and every transferable
interaction, D&D Beyond, Owlbear for the map — is binding (golden rule 30): observe the real
sequence, organisation and feedback of the reference before building a surface, then compare actual
gestures and images. A generic form is not an acceptable substitute for a designed journey.

## 2. Dark only

**Dark theme only, in EN and IT** (owner, 2026-09-05 —
[`docs/program/DECISIONS.md`](docs/program/DECISIONS.md)). Light paper exists for printing, never as
a second theme. Desktop is the complete product at 1440×900 and 1280×800; the phone at 390×844
supports consultation and the updates that matter, with its own intentional composition and no
forced combat HUD or map parity ([`PRODUCT.md`](PRODUCT.md) § Core design principles).

WCAG AA is the floor in that single theme, in both locales, enforced by the accessibility sweep and
re-checked after any token change (golden rule 35). Every interactive component ships
default/hover/focus/active/disabled — plus loading and error where relevant — with a visible
keyboard focus ring. Animation respects `prefers-reduced-motion` through one OS-driven
kill-switch; there is no in-app animation toggle and none may be reintroduced. Touch targets are
≥ 44 px (`--touch-min`), and no user-facing text goes below the 10 px legibility floor. Identity
text is never mid-string ellipsized: swap to a shorter true form, or wrap.

## 3. What the code renders today

Two token systems exist in the tree, and this is the single most important thing to know before
touching a v2 surface:

1. **`src/index.css`** — the "Illuminated Folio" system summarised in the frontmatter above:
   mineral ramps, role assignments under `[data-theme="dark"]`, semantic and action-type registers,
   the elevation/material recipes, and the `@theme` bridge that exposes a subset to Tailwind
   utilities. It is imported globally by `src/main.tsx`, and it **still contains a
   `[data-theme="light"]` block** applied by `src/stores/uiStore.ts`, which the dark-only decision
   has made dead weight. Removing it is pending work, not a licence to keep designing light
   surfaces.
2. **`src/features/identity/identity.css`** — the shell that is actually mounted on `v2`
   ([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §8) does **not** consume the system above. It
   declares its own six locally scoped tokens on `.identity-app` / `.identity-dialog` and
   `color-scheme: dark`:

   | Token               | Value       | Role                           |
   | ------------------- | ----------- | ------------------------------ |
   | `--identity-bg`     | `#0b1419`   | page field (blue-black canvas) |
   | `--identity-panel`  | `#132128`   | panel                          |
   | `--identity-text`   | `#eee9dd`   | primary ink                    |
   | `--identity-muted`  | `#c0c6c2`   | secondary ink                  |
   | `--identity-line`   | `#d9bc8333` | hairline / divider             |
   | `--identity-accent` | `#a6e4ee`   | cyan action and focus          |

   These are the laboratory's own reference values, so the shell is faithful to the mock — but it
   is a second palette, not the frontmatter's. Any block that unifies the two is a design decision
   with owner-visible screenshots (golden rule 25), not a refactor.

**Typography is verifiable and unchanged in both systems.** Three faces, four registers, shipped as
self-hosted packages (`@fontsource-variable/cinzel`, `@fontsource-variable/alegreya`,
`@fontsource/source-serif-4`, imported in `src/main.tsx`): Cinzel for ceremonial titles (caps-only,
never below 14 px), Alegreya for content headings and reading prose, Source Serif 4 for numbers,
stats and the uppercase label register, with tabular lining figures pinned once app-wide.

**Icons.** `lucide-react` is the icon library (`src/app/shell/Topbar.tsx`,
`src/app/shell/CommandPalette.tsx`, `src/features/identity/IdentityWorkspace.tsx`, …): reuse the
same glyph a concept already uses elsewhere; a new hand-drawn glyph is a defect. The play surface
additionally inlines one licensed sprite referenced by id (`src/features/play/PlayIcon.tsx`,
`src/assets/icons/play-sprite.svg`, pinned both ways by
`tests/unit/play-sprite.guard.test.ts`); attribution is rendered in `src/app/routes/legal.tsx`.
The owner has rejected filling gaps with more generic icons or ad-hoc SVG pictograms — see §6.

## 4. The four scopes

Campaign · Character · Library · At the table are the four permanent scopes; Account is a global
utility ([`PRODUCT.md`](PRODUCT.md) § Clarity). The mounted shell's `primaryDestinations`
(`src/features/identity/navigation.ts`) declares them in a different order — campaign, table,
characters, library; `table` currently carries `unavailable: true` and renders an explaining panel
rather than a fake surface — an unavailable destination must always explain the route back instead
of fabricating content.

Navigation is the browser's own: native history over a hash, with per-frame restoration of query,
scroll and focus, and a deterministic `parentRoute` return from every leaf
([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §8). Back, Forward, deep links and the return from
a detail or a picker preserve valid scoped filters, scroll, selection and drafts. Non-sensitive
filters may travel in the URL; private search text, scroll and focus stay in account-scoped history
frames.

Browse, select and use are distinct: looking at a weapon, or navigating with "use at the table",
never spends a resource. DM inspection of an authorised sheet never silently changes the active
actor, the lease, the control or any balance.

## 5. Standing corrections — 7 September 2026

The owner accepted the direction of the shell and Account review with these corrections, applied as
revision **r2** of the mock copy. They are binding on every new surface and must never be proposed
away again. The full text is
[`docs/program/reference/shell-r2-decisions.md`](docs/program/reference/shell-r2-decisions.md):

- Account sits under the player's name; global search is visible on desktop and becomes a lens on
  the phone; a `?` button opens help and shortcuts; the four scopes and the menu hierarchy stay
  coherent with the mock.
- **No switch to disable shortcuts or animations.** Shortcuts stay available with the normal
  protections while typing and inside dialogs; animations are part of the experience. The absence of
  a product control is not permission to remove existing system or browser safeguards.
- **Direct IT ↔ EN switching**, with no dialog or menu: the button names the destination language
  and carries an explicit accessible label.
- Preferences are game-oriented — **digital or physical dice**, with short descriptions, changeable
  at the table. Do not invent other options to fill the page. Shared campaign settings stay separate
  from personal preferences.
- Account navigation **persists** across Profile, Preferences, Notifications, Privacy, Copies and
  recovery, Offline data and Support; on the phone the section selector persists. No implicit exit
  from the container, no vague titles, no buttons carrying paragraphs.
- Preserve fonts, palette, assets and icon placement outside the agreed delta. No arbitrary
  restyling.

Two further corrections of 5 September are carried in the same register: shadows on items but never
a decorative halo; the HP arc and every bar run green → yellow → red, agreeing with the number and
the text beside them; "Correggi" needs an intuitive icon; allowed and extra movement and Dash's
cost stay visible.

## 6. The open design question — PD, engagement and disclosure

The 9 September owner feedback is the one **open** design question, and the program block that owns
it is **PD** in [`docs/program/PROGRAM.md`](docs/program/PROGRAM.md). The owner found the P10
experience "troppo fredda, distaccata e amministrativa" — a bank's back office; creating a character
answers "mancano i campi", "come una pratica alle poste". The mock was chosen above all for the
battle map, the bridge and those colours; approving it never meant approving every management
surface derived from it.

Until PD's verdict, treat these as unsettled and do not pre-empt them:

- real, recorded study of Baldur's Gate 3 and D&D Beyond as **primary and binding** references —
  how they build engagement, use images, order hierarchies and reward discovery;
- the character-creation journey redesigned as the representative path — the birth of a character
  must engage and must make choices and their consequences understandable;
- a **raster art direction** for spells and, where it makes sense, combat content and actions:
  small artistic raster images in the language of the mock's spell art, curated and contemporary,
  rich without being gaudy — explicitly **not** more generic icons and not ad-hoc SVG pictograms;
- concrete proof of both sides of progressive disclosure: the expert acts fast with no mandatory
  explanation in the way, and the curious beginner can investigate and learn while playing, neither
  side costing depth.

PD does not reopen P10's technical gates, and no replacement of the whole design has been approved;
proposing the width of the revision is part of PD's own delivery. **P11a does not start before the
owner's verdict closes PD.**

## 7. Explain on demand, everywhere

Depth is never simplified away; it is **explained** (golden rule 20;
[`PRODUCT.md`](PRODUCT.md) § Clarity). Concretely, on every surface — deep homebrew forms and
in-play controls included:

1. A user can always tell the current scope, the selected subject, the editable scope and the route
   back.
2. Labels name user concepts. Internal ids, schema terms and implementation structure are never an
   unexplained prerequisite; every non-obvious term, abbreviation or control carries a teaching
   explanation on demand. Unexplained jargon is a defect, not a terse style.
3. Related fields form meaningful groups, with examples, units, prerequisites and validation that
   say how to enter a valid value and how to recover without losing work.
4. Familiar controls behave consistently: selection, preview, saving, publishing and applying have
   legible distinctions and visible results.
5. Consequences and the affected copy or template are understandable **before** a consequential
   choice; pending, saved, conflicting and unsupported states each explain the available next
   action.
6. Progressive disclosure exposes advanced capability without concealing essential decisions or
   removing the table's control.

Essential HP, resources, costs, warnings, consequences and correction stay visible; secondary
configuration is progressively disclosed. Cost is named accessibly as well as coloured: the
action-type register is always paired with a shape and a name, never colour alone, and no permanent
cost badge is invented for every artwork tile.

**One contradiction to settle inside PD.** The mock contract describes the register as a green
circle for the action, an **orange triangle** for the bonus action and a **purple star** for the
reaction. The shipped tokens assign `--at-bonus` to lapis (blue) and `--at-reaction` to vermilion
(red), with amethyst (purple) reserved for `--at-magic` (`src/index.css`). Neither source is wrong
by fiat; the assignment is a design decision for the block that rebuilds the play surface, and this
paragraph is the record that it is open.

## 8. Delivery and evidence

Every visual change ships with curated **actual runtime** screenshots, cropped to the affected
region, covering the locale and viewport combinations that materially differ, delivered as images
in chat (golden rule 25). A local path or a written report is not delivery. On `v2` that evidence
accompanies integration under the owner's standing delivery delegation of 8 September 2026: send
the images, integrate reviewed gate-green work, and never demand a per-block visual verdict — the
owner's hands-on review of the whole application comes when the application is complete and usable.
Broad interim approval is never recorded as a claim that every control has been inspected.

Contested visual choices are decided by the `impeccable` skill from this document and the product
documents; only a genuine remaining tie goes to the owner as concrete alternatives (golden rule 26).
A bespoke restyle of an existing job is a defect: consistency over novelty, reusable patterns over
one-off screens.
