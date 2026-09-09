# D&D Beyond: Character Builder & Sheet — Evidence Brief

Method: WebSearch + WebFetch on dndbeyond.com pages/forums, one third-party post.
dndbeyond-support.wizards.com blocks WebFetch (403/redirect to JS shell); its
content below is from WebSearch snippets only, marked "(snippet, unverified)."

## 1. Character builder (2024 rules)

- Four entry points: **Premade** (pre-gen, fully editable), **Standard** (full
  step-by-step), **Quick Build** (species+class+name, "handy when time is of the
  essence"), **Randomize** (no mandatory picks). [dndbeyond.com/posts/1059]
- Standard step order per DDB's tutorial: Character Preferences (name, sources,
  dice-rolling, advancement) → Class → Background → Species → Ability Scores
  (Standard Array/Manual/Point Buy) → Equipment. [posts/1059] A second DDB post
  describes 2024-PHB order as Class → Origin (Background+Species) → Abilities →
  Alignment, "the Character Builder does all the work for you" for
  saves/skills/attacks. [posts/1787] The two disagree — not reconciled; treat as
  approximate.
- Required picks are outlined in **blue** and block advancing via the blue
  next-arrow. [posts/1059]
- A **Help Text** toggle ("?" icon, header), on by default, is DDB's own
  recommendation for new users to leave on. [posts/1059]
- A **Sources / Partnered Content** checklist (Home step) scopes the builder to
  owned/enabled books, all-on by default; a "2014 Core Rules" box re-adds legacy
  options beside 2024-core defaults. Could not verify the literal phrase "Show
  only my sources" — actual labels found are "Sources" / "Partnered Content."
  [posts/1787; forum "Toggle sources in the Character Builder"]
- New **Quickbuilder** (2025, testing) shows Class/Species as **art tokens**,
  explicitly "iconic D&D art, not walls of text," for players with no rules
  knowledge — a low-traffic testbed per DDB staff. Same post previews unshipped
  concepts: mistake-catching guided defaults, **DM control of available content
  per campaign**, full responsiveness — framed as concept video only.
  [dndbeyond.com/posts/2135]
- Homebrew must be enabled per-source in preferences/content settings; forum
  threads report it silently not appearing until re-toggled. [dndbeyond-support
  "Enabling Content Categories," snippet, unverified]
- A fan blog (not an official DDB post) cites a 2025 update: "33% speed
  enhancement" and multiclass collapsed from a reported 11-click to 5-click popup
  flow. Treat the 33% figure as unverified against a primary source.
  [goodreads.com/author_blog_posts/25862037]

## 2. The character sheet

- Confirmed tabs (via WebSearch snippet of DDB's "Sheet Sections," not directly
  fetchable): **Actions** (Actions/Bonus/Reactions + equipped weapon and spell
  attacks), **Spells** (slots + "Manage Spells" window for known/prepared),
  **Inventory** ("My Inventory" vs "Party Inventory," equip/attune, encumbrance,
  currency). Features & Traits/Description/Notes/Extras tabs are referenced
  elsewhere but their contents were not independently confirmed.
- Sitewide `[tag]` tooltips (conditions, abilities, AC, cover, crit, HP, etc.) work
  in forum posts/notes/homebrew text but **explicitly do not work on the character
  sheet**; clicking a term there instead navigates a sidebar panel with a "prev" to
  return. Named limitation, not a feature. [forum "Tooltip in character builder and
  character sheet issue"]
- **Short/Long Rest/Dawn** buttons reset per-rest resources at once; the Short Rest
  panel shows available Hit Dice and what each returns but does **not auto-roll or
  apply them** — HP must be edited manually. [dndbeyond-support "Sheet Sections,"
  snippet, unverified]
- **Digital Dice**: clicking any rollable value animates dice on-screen; does not
  cover hit-dice-during-rest specifically — a gap DDB staff acknowledged in forum
  threads, with more sheet-integrated rolling "planned."
- **PDF export**: "Manage" menu → "Export to PDF" produces a **form-fillable PDF
  matching WotC's official printed template**, fixed layout. Forum reports call it
  "glitchy" (stale data, missing fields), with a workaround of opening in Adobe
  Acrobat instead of a browser viewer. [dndbeyond-support "Export Sheet," snippet;
  forum "PDF Export and Printing Suggestions"]
- Mobile: phone sheet splits into **separate pages/tabs**, not one scroll; a
  relayout reportedly moved proficiency bonus and speed to their own tab — a
  regression per one forum thread. Tablets get phone layout below a size
  threshold, desktop above it in landscape. [forum "phone app sheet changes";
  "mobile view of character sheets"]

## 3. Imagery

- **Portraits**: default art sourced from official book character art; users may
  swap to another stock portrait or upload their own (small-file guidance given).
  Sits as a header element, not embedded per-mechanic. [forum "Change character
  portrait?"; "Default Character Portrait source?"]
- **Spells are confirmed text-only** beyond a small school-of-magic icon — verified
  directly: Fireball's page is a structured text block (level, casting time, range,
  components, duration, description) with one Evocation badge, no per-spell art.
  [dndbeyond.com/spells/fireball, direct fetch]
- **Items do carry art**, contradicting a "text-only compendium" assumption: the
  Shortsword page shows a weapon illustration beside the stat block. Likely one
  image per base item/weapon type, not bespoke per unique magic item —
  unconfirmed either way. [dndbeyond.com/equipment/shortsword, direct fetch]
- Quickbuilder foregrounds class/species art tokens; standard builder stays
  text-dense — art density is a mode choice, not a universal skin.

## 4. Explain-on-demand and progressive disclosure

- Sitewide `[tag]` tooltip system covers rules terms in most text boxes —
  **excluded from the sheet itself**, where the same links navigate a sidebar
  instead of hovering inline. [forum "How to add tooltips"; "Tooltip in character
  builder and character sheet issue"]
- Builder "Help Text" toggle (default on) is the closest verified global
  explain-on-demand switch. [dndbeyond.com/posts/1059]
- Beginner path = Quick Build/Quickbuilder (3 choices, art-forward) or Premade.
  Expert path = Standard mode, Help Text off, full source list, manual ability
  entry, multiclass popup for fast reordering. [dndbeyond.com/posts/1059;
  dndbeyond.com/posts/2135; goodreads.com/author_blog_posts/25862037]
- No "What's this?" affordance was found in any source — likely present but
  unconfirmed; do not cite as fact.

## 5. Campaign / DM side

- Campaign membership gives the DM live access to each player's sheet (HP,
  spells, equipment); the mobile app's Campaign View adds a **Game Log** of
  players' dice rolls in real time. [dndbeyond.com/posts/1087; posts/754]
- **Encounter Builder**: picking a campaign auto-computes **Average Party Level**
  from linked characters, plus a difficulty readout — four colored bands,
  current/adjusted XP, color-coded budget bar — with no need to open any player
  sheet; linking also shares rolls to the Game Log. [dndbeyond.com/posts/1135;
  forum "Combat Encounter Building: Refining, Fine Tuning and Adjustments"]
- Encounter-difficulty accuracy is **contested** by the DM community across
  multiple threads — a heuristic, not a validated prediction.
- Shared homebrew/content to a campaign is reported to fail to propagate to
  players without manual re-toggling. [forum "Players Not Able to See Shared
  Content and Homebrew Content in My Campaign"]

## 6. Known criticisms

- Tooltips **stop working on the sheet**, the one surface where lookup matters
  most — a named, acknowledged gap.
- Hit-dice rest math is displayed but **not automated**; manual HP entry is the
  last mile.
- PDF export is **shipped but flaky** (stale data, render bugs).
- 2025 relayout backlash: a large thread ("Rant: New Layout Sucks") calls the
  redesign "sterile, empty, and zero D&D flavor," "washed out," features "buried
  or hidden behind vague menus," reading as "any random productivity app" — a
  warning against genericizing a genre product for cleanliness's sake.
- Mobile relayout regressions: lost one-tap access to notifications/messages,
  homebrew pointing to public content instead of the user's own, animation-heavy
  menus that "slow down the experience"; DDB reportedly rolled the change back.
- Users flagged "developer time was wasted on ... purely cosmetic change[s]"
  while functional gaps (encounter accuracy, exhaustion) went unaddressed.
- Content-visibility bugs (homebrew/shared content not reaching players) recur —
  argues for visible/debuggable source-availability state, not a silent toggle.

## Patterns worth copying

- Three creation speeds (Premade/Quick Build/Standard), each scoped to intended
  use, not just labeled.
- Required fields get a distinct visual state (blue outline) that blocks
  progression, instead of after-the-fact validation errors.
- One global "Help Text" toggle changing verbosity everywhere at once, instead
  of per-tooltip toggles.
- Source/book scoping as the first builder step, pre-filtering later choices
  rather than showing everything then erroring on unowned content.
- Art-forward browsing reserved for the fast mode; the deep mode stays
  text-dense — art density as a mode choice, not a universal skin.
- Encounter difficulty computed from live roster data with no per-sheet lookup,
  shown as a banded budget bar plus the raw XP numbers underneath.
- One-click Short/Long Rest resetting all per-rest resources together, with a
  panel stating exactly what each Hit Die spend returns.
- Sourcebook art spent on identity moments (portraits, class/species) and
  withheld from high-frequency lookup surfaces (spells stay icon+text only).
- Fixed, official-template PDF export matching the physical game's expectations.
- DM-side content scoping planned as a first-class concept, even unshipped.

## Do not copy

- A tooltip system that stops working on the sheet itself.
- Hit-dice/rest math displayed but not automated.
- A PDF export pipeline with known staleness/render bugs.
- Relayouts trading legible, genre-flavored density for generic minimalism — the
  single most negative, highest-volume reaction found here.
- Mobile changes that bury previously one-tap features for a visual refresh.
- A computed difficulty number shown without inspectable underlying math.
- Silent homebrew/content visibility drift between DM and player.

Unresolved (see inline "unverified" flags above): full tab list beyond
Actions/Spells/Inventory; literal "Show only my sources" copy; a "What's this?"
affordance; exact 2024 step order; source for "33% faster"; whether unique
magic items get bespoke art.

## Sources

DDB official posts: dndbeyond.com/posts/1059, /1787, /2135, /1087, /754, /1135.
Direct-fetched pages: dndbeyond.com/spells/fireball, dndbeyond.com/equipment/shortsword.
Forum threads (all dndbeyond.com/forums/...): d-d-beyond-general/d-d-beyond-feedback/
237200 (layout rant), /231232 (mobile unfriendly), /53133 (toggle sources), /150200
(PDF export); d-d-beyond-general/bugs-support/56575 (tooltip issue), /161101 (shared
content not visible); dungeons-dragons-discussion/homebrew-house-rules/9811 (add
tooltips); d-d-beyond-general/general-discussion/197141 (portrait source), /11119
(change portrait), /190355 (difficulty accuracy), /20911 (mobile sheet view);
dungeons-dragons-discussion/dungeon-masters-only/138400 (encounter tool accuracy);
d-d-beyond-general/bugs-support/mobile-beta-testing-bugs-support/194223 (phone sheet
changes). Third party: goodreads.com/author_blog_posts/25862037. Support (snippet
only, WebFetch returns 403): dndbeyond-support.wizards.com articles 7747193946388,
7747202748436, 7747238449556, 7747201820948.

Reference capture (not taken): dndbeyond.com/play/characters/build(/species), a
logged-in sheet's tabs, dndbeyond.com//encounter-builder.
