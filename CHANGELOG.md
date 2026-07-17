# Changelog

All notable changes to d20 Folio are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project adheres to [Semantic Versioning](https://semver.org/).

## 0.20.0

**The 2024 rules-correctness wave. Enter what your dice actually said and d20 Folio applies your
resistances, drops you at 0 HP, runs your death saves, and heals you by real rolls — every
consequence one undo away — alongside a run of 2024-RAW corrections across resting, grappling,
concentration, upcasting, and movement, plus a few points of interface polish.**

### Added

- **The damage & dying flow — enter your roll, the app rules on it.** The HP popover now applies
  YOUR character's own defenses to a damage amount you enter: one toggle chip per damage type you
  actually defend (a raging Barbarian's Bludgeoning/Piercing/Slashing, an Abjurer's Spells — and
  nothing at all for a character who defends nothing), with a live math line ("12 → 6 · Resisted")
  that halves once and rounds down, doubles for a vulnerability, and applies immunity in strict SRD
  order with no stacking, staging multiple types for a hit like a Flame Tongue. An untyped amount
  still applies verbatim — direct entry is always there. Crossing 0 HP applies Unconscious and opens
  a fresh dying track automatically; damage whose remainder meets your HP maximum is instant death; a
  hit while you are already dying marks a death-save failure (two on a Critical Hit) instead of
  lowering HP. The dying banner takes the d20 death saves you enter and rules on each — a nat 1 is
  two failures, 10+ a success, three successes Stable, and a nat 20 (or a Champion's 18+) wakes you
  at 1 HP — with the banner label reading the verdict, Dying → Stable → Dead, and the pips still
  hand-tappable as the manual override. Every consequence is one undo away. EN + IT.
- **Upcast healing scales in the cast preview.** Casting Cure Wounds and its family from a higher
  slot now shows the scaled healing, exactly as upcast damage already did (Cure Wounds at L3 → 6d8):
  Cure Wounds and Prayer of Healing gain +2d8 per level, Healing Word +2d4, Mass Healing Word +1d4,
  Mass Cure Wounds +1d8.
- **Dash extends your movement meter.** Taking the Dash action now adds your Speed to the turn's
  movement total (30 → 60 ft after one Dash) instead of doing nothing; it resets at every turn
  boundary and is fully undoable.
- **A one-spell-slot-per-turn advisory.** Once you have expended more than one spell slot in a turn,
  the "what's limiting you this turn" banner notes the 2024 one-slot-per-turn rule — an advisory
  hint, never a hard block (cantrips and free casts do not count). EN + IT.

### Changed

- **Grapple and Shove now teach the 2024 Unarmed Strike rule.** Both action cards drop the old 2014
  "STR contest" for the current wording — the target makes a Strength or Dexterity save against your
  DC of 8 + STR modifier + proficiency — and each shows a live "STR · DC N" save chip. The cards stay
  available to every character, not just Monks. EN + IT.
- **The mobile Signet wears a Wrench.** The idle tools-coin above the bottom nav swaps its stamp
  glyph for a wrench — "the tools you tap to open," matching its "Sheet tools" label.
- **The short-rest Cancel button is quiet again.** On the Hit-Die roll-entry step it had been
  rendering as a tall boxy outlined rectangle; it is now a normal-height ghost button seated in the
  action row, in line with the Long Rest step and every other confirm dialog.

### Fixed

- **A Long Rest returns ALL your Hit Dice.** Per the 2024 rules a Long Rest restores every spent Hit
  Die; it had still been using the retired 2014 half-rule (roughly half your level). The Rest preview
  and summary now show the full count restored.
- **A Short Rest heals by real dice, not a fabricated average.** Spending Hit Dice on a Short Rest
  now asks you to roll them yourself and enter the result (adding your Constitution modifier per die),
  the same way Second Wind already works — the invented average total is gone. The summary reports the
  actual HP you healed.
- **Concentration drops automatically when you are incapacitated.** Gaining Stunned, Paralyzed,
  Petrified, Unconscious, or Incapacitated now ends held Concentration on its own, per the 2024 rule,
  with an undoable notice — undo restores the spell and its active effects.
- **The Compendium reads one page at a time again.** Opening an entry while another is open now
  replaces it instead of stacking a pile, so closing (X) returns straight to the index with your
  scroll and filters intact; the header Compendium tab always lands on a fresh index rather than
  resurrecting the last open entry.
- **SAFE-01 billing kill-switch (ops).** `just safe-status` no longer misreports billing as detached
  (the gcloud output is now compared case-insensitively), and the budget wiring uses gcloud's renamed
  `--notifications-rule-pubsub-topic` flag.

## 0.19.0

**A landmark release: encounter initiative re-architected onto a single, honest source of truth; the
Living Sheet cockpit with its floating management chrome; a fully realized daylight light theme; a
global keyboard-shortcut system; and a two-leaf Compendium — plus a wave of new rules automations,
navigation-stability fixes, and Italian corrections.**

### Added

- **The Living Sheet cockpit.** The character sheet's management actions leave the identity band and
  become quiet ceremony on the sheet itself. Rest is now a wax-seal moon medallion trailing the HP
  tile; Level Up is a gold "⌃⌃ LEVEL" chip beside your lineage, shown only when there is a level to
  gain. The masthead reads as a proper folio frontispiece — identity on the left, vitals on the
  right — and a read-only viewer (a DM opening a member's sheet) sees pure identity and vitals with
  no controls.
- **The Binder's Fob and the Signet — a home for your sheet tools at any scroll depth.** On desktop,
  Edit, Undo, Redo, and the ⋯ extras live as a fixed bottom-right chain of struck-metal coins, always
  within reach; the Undo/Redo coins appear only while there is history to act on, and the ✎ edit coin
  lights amber while you edit with zero layout shift. On phones the same tools gather into one
  discreet coin fixed above the bottom nav — tap to bloom the chain upward, tap once more while
  editing to finish. Both homes share one History / Export overflow so they can never drift.
- **Session undo/redo for play.** ⌘Z / ⌘⇧Z (and the standing Undo/Redo coins) now reverse the last
  several minutes of play — action, spell, and attack commits, HP damage/heal/temp, death saves,
  conditions, concentration, resource conversions and more — instead of only the 5-second toast
  window. The stack is own-sheet-only and clears on character switch, rest, level-up, and build
  edits; Redo re-runs the exact resolved action and re-validates every guard, so nothing is ever
  re-rolled or re-picked.
- **A global keyboard-shortcut system.** `/` opens the command palette, `g`-prefixed sequences jump
  between the three realms and Settings, and `?` opens a branded shortcuts reference sheet rendered
  from one registry — so it can never drift from what actually fires. Every binding is guarded behind
  typing / dialog checks, and nothing that mutates game state ever gets a global key. EN + IT
  throughout.
- **The Compendium opens as a two-leaf spread.** On desktop the index (search, filters, list) sits on
  the left page and the reading page on the right, joined by a book-fold gutter — read entry after
  entry without ever losing your place. Every spell's school chip now wears its school's own enamel
  colour, so scanning 421 spells by school works at a glance, and the filters fold into a compact
  facet ledger with a bounded scroll valve. The keyboard roams the whole index, from the search box
  into the results.
- **A proper Legal & Attribution colophon.** The `/legal` page is rebuilt as the credits leaf of a
  fine bound edition — a full-width engraved attribution plaque carrying the exact SRD 5.2.1 /
  CC-BY-4.0 statement verbatim (the English page in English, the Italian page in Wizards of the
  Coast's own official Italian), twin license columns, and Trademarks and The App sharing the bottom
  register. Designed in both themes.
- **New rules automations (all display-only — the app never rolls).** Hunter's Mark and Hex riders
  now extend to spell-attack rows (Eldritch Blast shows "+1d6 vs marked/cursed target"); four
  defensive buff spells are modelled (Blur, Warding Bond, Death Ward, Mirror Image); Assassin Death
  Strike (L17) and Heroism's recurring per-turn Temporary HP are surfaced; and Wild Magic sorcerers
  get a post-cast Wild Magic Surge reminder.
- **SAFE-01 billing kill-switch (ops).** A new `onBudgetAlert` Cloud Function detaches billing if the
  £1 budget is ever exceeded, hard-guaranteeing the zero-budget promise; its whole lifecycle is
  wrapped in three `just` commands (`safe-arm` / `safe-status` / `safe-restore`). No user-facing
  change.

### Changed

- **One combat-CTA grammar, and one way to take anything back.** Action buttons now state usability
  only: once you spend your Action, Bonus Action, or Reaction, every card that needs that token greys
  to "Used" while the card you committed keeps its gold occupant ring — consistently across all three
  action groups. Taking an act back is always the same gesture (the 5-second Undo snackbar, the
  standing Undo/Redo coins, or ⌘Z), and announcements no longer stack. Extra Attack now spends the
  Action coin on the first swing while every attack card stays struck gold until the swings run out —
  each swing individually undoable, with the exact "N of M remaining" shown only on hover — and
  Eldritch Knight War Magic replaces a swing within the same grammar.
- **The daylight light theme reaches full parity.** The light theme now paints its own
  owner-generated morning art (the same three rooms as dark's candlelit plates, at dawn) with the
  "Ember Penumbra" gilt grammar — a lit control reads as heat pooling on warm parchment rather than a
  dim glow — the cream bookbinding panel material wired under every panel, a parchment veil over
  user-uploaded campaign art, and a designed gilt-espresso emphasis ink. Login and footer ground
  cleanly on the candlelit scene. The dark theme is byte-unchanged.
- **Navigation never surprises.** Switching between Characters, Campaigns, and Compendium is now
  rock-solid — every switch lands at the top before first paint, the framed mastheads stay static
  (only the words change), and pages compose once instead of reorganizing after paint (measured CLS
  drops to ~0). Every routed surface gains its own browser-tab title and lights exactly one
  persistent "you are here" anchor, and the combat pip's "Go to group" lands at the top like any
  navigation rather than auto-scrolling to the tracker.
- **The phone topbar holds steady during combat.** The brand, search, and account cluster are now
  fixed-size invariants; only the combat pip adapts, collapsing to a compact glyph+count target at
  the tightest widths — ending the jarring brand-shrink that used to clip the wordmark to "FOL".
- **Keyboard-affordance polish.** The shortcuts sheet shows the command palette as a single
  `⌘K · /` row instead of two; the DM turn-advance ←/→ shortcut is now discoverable via its tooltip;
  and keyboard hints are gated off touch devices that cannot use them.
- **Compendium, sheet, and form polish.** Weapon-mastery rows show each property's effect at a
  glance; a teammate's read-only cockpit opens with the first tab in view and sheds its
  editable-looking dress; Settings' Appearance rows sit in a proper card; the bug/idea report dialog
  pins its actions in a sticky footer; and the creation and level-up number fields become clamped
  steppers with no unreachable values.
- **Italian: "Bloodied" is now "Sanguinante."** The prior "Dimezzato" read like a mechanical status;
  "Sanguinante" is the official IT SRD 5.2.1 term, applied across the HP copy, class features, and
  magic items so the whole app speaks one word.
- **A simpler ornament vocabulary.** The recently-added decorative diamonds are removed; the
  load-bearing marks (section rubrics, dividers, rail-head nodes, spell-slot gems) are unchanged.

### Fixed

- **Encounter initiative, re-architected onto a single source of truth — curing the "DM access out of
  date / initiative never saves" outage at the root.** A PC's encounter roll now lives in one place,
  written by both authorized roles on the document they own: the DM rolls for anyone, and a player
  rolls their own row (a four-direction allow/deny matrix, emulator-pinned). Cross-user character and
  combat access is now derived live in the security rules from the character's campaign claim and the
  roster, so a DM transfer or roster change takes effect on the very next request. A rejected combat
  write now surfaces one honest toast instead of faking a grant-refresh retry. Several downstream
  bugs are fixed alongside it: the roll no longer flashes in and reverts, the roller reliably commits
  the typed value on close, and a second click on its trigger closes it.
- **Opening the command palette or any dialog no longer moves the page.** The scroll-lock keeps the
  scrollbar in place instead of blinking it out, so the layout stays perfectly still through open and
  close. Overflowing dialog bodies (such as the shortcuts sheet) are now keyboard-scrollable.
- **"Show more" only appears when there is more to show.** The level-up feature-card toggle is now
  gated on real measured overflow, so expanding it never reveals nothing.
- **A recoverable empty-roster bug after "Clear site data."** While online, an empty result is now
  trusted only once the server confirms it, with a Retry that reloads into a fresh data layer — so a
  wiped local cache no longer shows a false "create your first character" or "no campaigns" screen.
  Your data was always safe on the server.
- **Mobile combat pip touch targets** no longer clip below the 44px minimum when the pip collapses to
  fit the topbar.

## 0.18.2

**Cleaner sign-in and roster copy, players-only party counts, and a run of combat and navigation
layout-stability fixes.**

### Changed

- **Sharper sign-in and roster copy.** The roster hint drops the year — it now reads simply "your
  D&D characters" (EN + IT) — and the sign-in claim is now plural: "Your D&D characters, always
  ready." (IT: "I tuoi personaggi D&D, sempre pronti.").
- **The DM no longer counts toward a campaign's party.** The party summary line and the
  campaign-list Party chip now count the players only, and the reworded count reads "N adventurers"
  / "N avventurieri". The separate "N members" stat still includes the DM, who remains a member of
  the campaign.

### Fixed

- **The combat pip's "Go to group" jump lands cleanly.** Following "Go to group" / "Vai al gruppo"
  from the combat pip now settles straight onto the encounter under a single scroll authority — no
  more jumping to the top of the frame and then gliding down, and no snap-to-zero race.
- **Entering your initiative no longer makes the encounter cards jump.** The roll editor now floats
  in a popover instead of expanding the chip in place, so typing your initiative on an encounter
  card no longer shoves that card — and the cards below it — down the page. Applies to both player
  and monster cards.
- **Opening the command palette no longer resizes the page on mobile.** ⌘K no longer auto-focuses
  the search field on touch devices, so it stops popping the soft keyboard and reflowing the layout.
  Desktop auto-focus is unchanged.

## 0.18.1

**Marked-target damage riders on your attack rows, one-tap temporary-HP entry, and a round of
sign-in, combat, and navigation fixes.**

### Added

- **Hunter's Mark and Hex show their bonus die on your attack rows.** While either spell is active,
  every weapon displays its per-hit rider — "+1d6 Force vs marked target" for Hunter's Mark, "+1d6
  Necrotic vs cursed target" for Hex. The label makes clear the die applies only when you hit that
  one marked or cursed creature; it is shown for you to add on the right hit, never folded into the
  weapon's base damage. On the collapsed mobile weapon chip a compact crosshair marks the die as
  conditional, so it never reads as always-on. This also restores Divine Favor's +1d4 Radiant to the
  weapon rows.
- **False Life applies its Temporary HP in one tap.** Casting it on the Play tab shows a quick
  roll-entry: enter your externally-rolled 2d4, tap once, and the app adds the flat +4 and applies
  the total (temporary HP don't stack, so it keeps the higher value; higher slots add +5 each). Cast
  through Warlock Fiendish Vigor it one-taps the maximized 12. Undoable.
- **Monk Patient Defense temporary HP (Heightened Focus, level 10).** Spending a Focus Point on
  Patient Defense now offers a one-tap "gain 2d8 temporary HP" entry (scaling to 2d10 / 2d12 with
  your Martial Arts die). The Focus-Point cost is stated on the row, so the free Disengage-only tier
  is never told it gains temp HP it didn't earn.
- **Gaze of Two Minds appears as a combat action.** A Warlock who knows this Eldritch Invocation now
  sees a Bonus-Action row for it on the Play board, alongside every other feature action.

### Changed

- **A new sign-in claim.** The line under the tagline now reads "Your whole D&D character, ready when
  you are." (IT: "Il tuo personaggio D&D, sempre pronto.").
- **A clearer initiative waiting state.** While you wait for the rest of the party to roll, the
  combat pip now reads "Waiting for others…" (IT: "In attesa degli altri…") instead of "Rolling
  initiative".
- **A redrawn browser-tab favicon.** The tab icon now fills the tab with a bold, readable "20" on an
  edge-to-edge d20, replacing the small padded mark that showed no numeral. Ships a proper multi-size
  favicon and re-cut PWA / home-screen install icons.
- **The roster brand crest is parked.** The engraved crest watermark no longer appears on the home
  roster header — it was the only surface that carried it, and a single placement read as an
  inconsistency. It can be switched back on after a UI review.

### Fixed

- **Dialogs no longer bounce you off your character sheet.** Closing or confirming a dialog on a
  character sheet — for example the Zealot "Warrior of the Gods" pool spend, or the combat "Import
  from JSON" dialog — could kick you out to "My Characters". Every modal now closes in place.
- **The turn indicator no longer flickers "Your turn" when you end your turn.** Ending your turn now
  advances straight to the next combatant's name, instead of flashing your own turn for a frame.
- **A teammate's read-only note is fully readable.** Viewing another character's rail note (as a
  teammate or DM) now renders the whole note as flowing text at full height, with line breaks
  preserved, instead of trapping it in a tiny fixed scrollbox. The page scrolls past a long note;
  readers still cannot edit it.
- **The combat top-bar "Open {hero}" pill is readable in the light theme.** Its destination chip was
  legible only against the dark theme; its label now reads clearly in both themes.
- **The Legal & attribution page carries the app chrome.** `/legal` used to render as a bare,
  chrome-less dead-end; it now shows the standard top bar, navigation, and footer while staying
  readable without signing in.
- **A tuned sign-in composition.** The brand column now sits in the dark negative space of the
  sign-in art, so the glowing tome reads bright and the copy stays crisp, instead of being washed out
  by a centred scrim.

## 0.18.0

**A complete shape-changer's bestiary, two new Barbarian rage trackers, and a hand-painted
dark-theme refresh for sign-in, campaigns, and the roster.**

### Features

- **Polymorph's Beast catalogue is complete.** The Polymorph / wild-shape form picker now offers the
  full CR 0–8 SRD roster — 91 forms in all, 73 newly added — from CR-0 critters (Badger, Cat, Rat,
  Owl) through the CR-6 heavyweights (Giant Squid, Killer Whale, Triceratops). Every form carries
  bilingual EN + IT names, traits, and attacks, so any Beast you can legally become is here and gated
  to your level.
- **Barbarian rage trackers gained two riders.** Relentless Rage (L11) now surfaces its modelable
  facts as derived chips — the initial Constitution save DC and the revive HP on a success (twice
  your Barbarian level) — replacing a one-use tracker that wrongly implied you couldn't survive
  again; the +5-per-use DC escalation stays described in the feature. Fanatical Focus (L6, Zealot)
  shows its reroll bonus (+2/+3/+4, tracking your Rage Damage) as a chip alongside its once-per-Rage
  tracker.

### Design & chrome

- **A hand-painted dark-theme refresh.** Sign-in now opens on a glowing grimoire on a dark altar,
  and campaigns without custom art wear a candlelit war table whose aged map keeps a calm centre
  behind the hub panels — the owner-generated Fable batch-1 plates.
- **An engraved brand crest on the roster.** The home roster's framed header now carries the brand
  emblem — a bronze d20 in a laurel wreath — as a whisper-faint frontispiece watermark that wears
  each theme's own accent metal. One placement only; every other surface is untouched.
- **The sign-in splash sits still.** The pointer-parallax drift is gone — it read as the page
  dragging under the cursor rather than as depth — so the scene holds its composed framing while
  keeping its one-shot brand reveal and ambient candlelit loops.

### Fixes

- **Party-card names wrap instead of clipping.** On the campaign party / encounter cards a long
  member name now breaks onto two clean lines rather than truncating mid-word — "Bren Ironbeard of
  the Thunderhold" reads in full instead of "Bren Ironbeard of the Thunderho…".
- **Artificer tool proficiencies reconciled.** The five Artificer subclasses' "Tools of the Trade"
  tool, armor, and weapon proficiencies are verified against the 2024 rules and pinned into the
  aggregated grants; a stale coverage doc that called them unmodeled is corrected to automated.
- **Polymorph picker hides empty sections.** A Beast with no attacks (e.g. the Seahorse) no longer
  shows a bare "Attacks" header, and the Italian Bloodied Fury trait name is aligned to the app's
  canonical Bloodied term.
- **Steadier abilities test.** The abilities end-to-end selectors are scoped to the visible ability
  card, removing a flaky match.

### Docs & process

- Added golden rule 26: contested design decisions resolve via the impeccable skill first, then
  owner screenshots break genuine ties. Noted that GitHub Actions is unreliable while the repo is
  private — deploy locally.

## 0.17.0

**Three new ways to play at the table — Polymorph shape-changing, one-tap casting from charged
wonder-items, and a combat-screen readout of every save and check.**

### Spells

- **Polymorph and True Polymorph transform you into a Beast.** Casting Polymorph adds a Transform
  button that opens a Beast-form picker — around 18 iconic forms spanning CR ¼ to 8, each gated to
  your level. Choosing a form for yourself swaps in the Beast's AC, speeds, ability scores, and
  attacks, grants Temporary Hit Points equal to its Hit Points, and engages Concentration —
  everything editable and undoable. The form ends the moment you revert, break Concentration, run
  out of that Temporary HP, or drop to 0 HP. Polymorphing another creature instead shows a
  read-only stat-block reference card.

### Magic items

- **Charged items that cast a choice of spells now play as one guided tap.** The Wand of Binding,
  Wand of Fear, Ring of Animal Influence, and Staff of Charming each cast one of several spells from
  their shared charge pool — pick a spell and it casts at the correct per-spell charge cost, with
  any spell you can't currently afford clearly disabled.

### Combat

- **Saves & Checks, without leaving the Play view.** A new collapsible Saves & Checks panel on the
  combat screen lays out every saving-throw, skill, and passive modifier at a glance, each with a
  tap-for-breakdown — so you never have to open the Stats rail to answer "what's my DEX save?"
  mid-fight. It shows formulas only; you roll your own dice. A save is auto-flagged when a condition
  (such as Stunned) forces it to fail automatically.
- **The turn summary names what's blocking your action economy.** When a condition strips your
  Action, Bonus Action, or Reaction — Stunned, Paralyzed, Incapacitated, and the like — the "what's
  limiting you this turn" summary now spells it out ("You can't take Action, Bonus, Reaction
  (Stunned)") instead of leaving you to infer it from greyed-out cards.

## 0.16.5

**A D&D 2024 mechanics-accuracy pass across spells, conditions, feats, magic items, classes, and
species.** Every fix below realigns a modeled rule with the 2024 source text, so the sheet,
trackers, and action cards show what the rulebook actually says.

### Spells

- **Dual-damage spells show both instances.** Ice Storm now reads 2d10 Bludgeoning + 4d6 Cold, Ice
  Knife 1d10 Piercing on hit + 2d6 Cold on a failed save, and Meteor Swarm its full 20d6 Fire +
  20d6 Bludgeoning — each previously collapsed to a single mislabeled instance. Sorcerous Burst now
  shows its 1d8 damage in the type you choose.
- **Corrected spell facts.** Healing Word is now Abjuration, and Dancing Lights, Demiplane, Mind
  Spike, Mislead, and Steel Wind Strike carry their correct V/S/M components. Dawn and Sickening
  Radiance are re-tagged as non-2024 provenance.

### Conditions

- **Grappled and Stunned match the 2024 rules.** Grappled now imposes Disadvantage on attack rolls
  against any target other than the grappler, and Stunned no longer wrongly zeroes your Speed (a
  2014 holdover — 2024 Stunned still lets you move). The Incapacitated, Invisible, Grappled, and
  Stunned reference text is refreshed to the full 2024 wording.

### Feats

- **Four missing feats added.** Shifting Combatant and Tactical Combatant (general feats), plus Pack
  Fighting and Prone Fighting (fighting styles), are now available.
- **Boon of Fate** shows its real 2d4 Improve Fate roll instead of a d4.

### Magic items

- **The +1/+2/+3 gear family works.** The generic Weapon, Armor, and Shield bonus entries are now
  superseded by correctly-modeled tiered items, and Rod of the Pact Keeper and Wand of the War Mage
  offer their Rare (+2) and Very Rare (+3) tiers.
- **Belt of Dwarvenkind** grants its Resilience benefit (poison resistance + Advantage on poison
  saves), and **Ioun Stone**'s rarity now matches a real stone tier.

### Classes & species

- **The Artificer spell list is restored.** 76 spells (cantrip–5th) were missing the "artificer"
  class tag, leaving the prepared-spell pool effectively empty at every level; all 81 roster spells
  are now selectable.
- **Cleric Channel Divinity cleaned up.** Removed a dead, off-by-one Channel Divinity uses value
  (the feature tracker was already the correct 2/3/4 source of truth) and fixed the level-up
  regression it exposed — classes with no class-specific data (Wizard, and now Cleric) were silently
  skipping the level 5/11/17 cantrip-damage-scaling changelog entry.
- **Monk Patient Defense and Step of the Wind fixed.** Their swapped descriptions are corrected in
  English and Italian (Patient Defense is Disengage-free/Dodge-enhanced, Step of the Wind is
  Dash-free/Disengage-enhanced), and neither hides its RAW free base option behind a mandatory Focus
  spend anymore.
- **More class and species gaps closed.** Fighter Banneret's Shared Resilience reaction now spends
  an Indomitable use, Wizard Illusionist's Improved Illusions waives the Verbal component on
  Illusion spells, Warlock's Eldritch Mind invocation grants Advantage on Concentration saves, and
  a species' Inner Radiance end-of-turn Radiant aura is documented.
- **Martial and reaction fixes.** Beast Master's Beast's Strike now includes the beast's flat
  +2/+2/+3 damage (Land/Sea/Sky), Berserker Frenzy's extra damage only shows while raging, and three
  reaction cards show their correct trigger — World Tree Branches of the Tree (a creature starts its
  turn near you), Winter Walker Chilling Retribution (when you're hit), and Fey Wanderer Beguiling
  Twist (a creature resists charm or fear).

## 0.16.4

**A 32-fix reliability sweep across encounter play, campaign sync, and the character sheet.** A
full-app pass hardened the surfaces you touch most at the table — shared campaign data that two
players edit at once, the encounter and initiative tracker, HP and the death-save tracks, character
creation, and the everyday numeric fields — closing a long tail of quiet correctness and
interaction bugs.

### Encounter & combat play

- **Initiative can no longer corrupt the turn order.** A monster's initiative typed with a
  misplaced minus ("5-", "1-2") used to commit garbage that broke the order, unblocked "Begin
  turns" with an invalid value, and displayed "NaN". The field now accepts only a single leading
  minus and always commits a valid number (or blank).
- **The first roll of a fight refreshes your trackers.** Beginning an encounter now correctly
  re-arms per-encounter trackers — Persistent Rage, Relentless, Superior Inspiration, Archdruid,
  Perfect Focus — even when a stale solo roll was still sitting in memory from before the fight.
- **Rolling from the topbar pip can't knock a healthy hero down.** A roll started before that
  character's own sheet had finished loading could write 0 HP and mark them Dying; the pip now
  waits for the character to load before allowing the roll.
- **Back-to-back monsters keep their own stats.** Adding a monster now resets AC, Max HP, and
  initiative to their defaults after each add, so the next creature no longer silently inherits the
  previous one's numbers. Tapping an off-screen initiative chip to edit it no longer scrolls the
  page.
- **The round counter stops under-counting.** Removing the current combatant when they are last in
  the turn order now advances the round, matching what ending their turn would have done.
- **The pip's encounter chooser lands on the tracker.** Picking a fight from the topbar pip's
  multi-encounter menu now opens that encounter's tracker instead of the bare top of the campaign
  hub.

### Campaign sync & shared data

- **Two players editing at once no longer corrupt shared data.** The shared campaign write path is
  now concurrency-safe: pooled-treasury add/take and their undo compose atomically (no lost coins,
  no dropped ledger rows), a Chronicle save snapshots the current shared text into its restore
  history before overwriting (so a second editor's paragraph is never lost), and a debounced
  monster edit can no longer rewind a turn another player just advanced. Advancing the turn right
  after "Begin turns" now works instead of silently doing nothing, a turn advance that can't reach
  the server now says so instead of failing quietly, and the session list stays newest-first past
  100 sessions.
- **Membership, DM role, and the gathering roster are hardened.** Removing a party member
  mid-encounter now also removes their combatant, so "Begin turns" is no longer locked by an
  orphaned slot; a character can no longer be attached to two campaigns at once from two devices;
  and handing over the DM role or removing a member now reports a failed write and restores the
  previous state instead of leaving the party with no DM. Committing your initiative while everyone
  is still rolling no longer jumps the page to a different card.
- **The Campaigns list shows each party's level again.** The list card's level chip had been
  reading a legacy field no character has stamped since the multiclass migration; it now sums each
  attached character's class levels and shows for every current-format party.
- **The Chronicle byline names you, not your account.** Your own entries and revisions now read
  "you" ("te" in Italian) instead of your raw account name.

### Character sheet & HP

- **Editing Max HP no longer bakes in a temporary bonus.** Max HP edits now change the stored base
  rather than the boosted total, so a bonus from Aid, a draconic feature, or an HP item is never
  permanently written into your character. The field also gains a reset-to-auto control, matching
  AC, initiative, and the other override-first stats.
- **Death-save resets stick.** Clearing the death-save tracks now persists to your live combat
  state, so it survives a reload and shows correctly on your other devices and in DM views instead
  of quietly reverting.
- **The HP editor starts clean each time.** Its amount field no longer carries a stale typed value
  across an Escape or outside-click dismiss, and reopening it selects the amount so typing replaces
  it rather than appending to whatever was last there.

### Character creation & leveling

- **Creation asks for the choices a character needs.** The wizard now requires class skills — and,
  for casters, cantrips and starting spells — before a character can be created, so Quick Start can
  no longer finish a caster with no spells or skills.
- **Ability scores stay within the rules.** The background ability boost now caps at 20 like every
  other ability path, and Point-Buy can no longer be defeated by round-tripping through Manual
  entry — a score left outside the legal 8–15 range stays unspendable rather than counting an
  illegal value as a free purchase.
- **Class levels can't exceed 20.** A malformed character (a hand-edited write or a bad multiclass
  sum) can no longer carry a level above 20 and silently scale proficiency bonus and class features
  past their legal maximum.

### Inputs & navigation

- **Typing into a numeric field replaces the value instead of mangling it.** Editing any inline
  number — AC, initiative, speed, proficiency bonus, Max HP, hit dice, ability scores, currency,
  and more — now selects the existing value on focus, so a typed digit replaces it rather than being
  inserted into the middle of it.
- **Large coin amounts are no longer truncated.** Personal currency no longer silently clamps to
  9,999 on a big edit; coins now commit up to a currency-appropriate maximum instead of an arbitrary
  UI default.
- **The offline indicator is honest.** A device that goes offline now shows "Offline" instead of a
  perpetual "Saving…" spinner.
- **The tag picker stops shadowing real entries.** Adding tools or languages no longer offers — or
  lets Enter commit — a homebrew "add custom" entry when your text ambiguously matches a real
  catalogue entry, so a valid SRD pick is never replaced by an off-catalogue, id-less duplicate.
- **The command palette no longer strands a dead Back step.** Choosing a result that navigates away
  no longer leaves an orphaned overlay-history entry that could make the first hardware/gesture Back
  press do nothing.

### Italian localization

- **The Disengage chip reads correctly in Italian.** It now shows "No AdO" — matching the app's own
  "Attacco di Opportunità" wording — instead of the orphan abbreviation "No AA".

## 0.16.3

**Ships the 0.16.2 navigation patch with its confirmation-dialog regression fixed.** 0.16.2 was
tagged but never reached players — its release was held back when a confirmation dialog was found to
interfere with the new Back-button behaviour — so this release delivers both together.

### Fixed

- **Confirmation dialogs no longer derail the flow they guard.** Leaving the level-up wizard with
  unsaved choices and then choosing to stay now keeps you in the wizard, and cancelling a class
  change on the character's Bio tab correctly keeps your original class. The confirm prompt no
  longer quietly steals a Back step from the page underneath it.

## 0.16.2

**A navigation-and-interaction-feel patch.** Moving through the app now behaves the way a native
app does — the browser Back button restores exactly where you were, taps no longer jerk the page,
and mobile Back closes what's open instead of leaving the screen.

### Fixed

- **No more page jumps on taps.** Selecting a tab that sits off the edge of the compendium type
  ribbon or the cockpit tab strip now scrolls only that ribbon's own horizontal track into view —
  never the whole page — through one shared seam, and moving between tabs with the keyboard no
  longer nudges the page either.
- **Double-click can't skip a turn.** Advancing an encounter turn now commits only against the
  turn the presser actually saw and cleanly no-ops if it already moved, so a fast double-click can
  no longer jump past a combatant — for the DM and players alike. The turn buttons also disarm
  while an advance is in flight.

### Changed

- **Back and forward restore your exact scroll position.** A fresh forward navigation starts at
  the top, while Back returns you to where you were — even on lazy-loaded pages (the character
  sheet, compendium, and campaign hub), which now wait to finish mounting before restoring instead
  of dumping you at the top.
- **Per-realm place memory.** Switching between Characters, Campaigns, and Compendium and coming
  back finds your spot, and the Compendium returns to the category you were reading.
- **On mobile, Back closes an open dialog or lightbox and keeps you on the page** rather than
  navigating away; Escape and tapping the backdrop still work. Navigating to a new page also moves
  focus to its heading for screen-reader users, with no scroll side effect.

## 0.16.1

**A correctness-and-velocity patch.** A focused wave of engine, combat, and interface fixes from the
post-0.16.0 issue batch — sharper rules accuracy, cleaner combat-tab behaviour across solo and
encounter play, and a deploy gate cut to less than half its wall-clock.

### Fixed

- **Solo ↔ encounter combat precedence.** The cockpit combat tab now scopes its status to the open
  hero, so a second character not in the fight reads pure solo (own round, End Combat, own initiative)
  while the topbar pip stays the user-wide signal. Off-turn the Reaction coin stays live while the
  other actions dim (RAW opportunity attacks, Shield, Counterspell), the gathering phase reads inert,
  and ending the encounter reverts the sheet cleanly to solo baseline.
- **Initiative stays in sync.** A remotely edited initiative roll (e.g. the DM rolling for a player)
  now updates the open sheet live instead of showing a stale value until reload; an in-progress local
  roll is never clobbered.
- **Attunement is required before it counts.** A magic item that requires attunement is now inert
  until you actually attune it — no more silently receiving a Ring of Protection's AC before bonding
  to it. The sheet and the engine share one attunement predicate so they can't disagree.
- **No duplicate Fighting Style card.** A Paladin's chosen Fighting Style no longer renders beside a
  leftover generic placeholder; the chosen style is the feature. Classes that pick a style as a
  separate feat keep their picker.
- **Cleaner feat and invocation text.** Eldritch Invocation prerequisites now read in Italian for
  Italian players, and the Sharp Eye feat's description no longer leaks its source-book citation ahead
  of the rules text.
- **Responsive header fixes.** The cockpit character name no longer folds to two lines in the
  768–1023px band, and the phone topbar no longer scrolls sideways during an encounter (the brand
  collapses to its die glyph to make room for the combat pip).
- **Admin bug inbox hides resolved reports.** The admin inbox now drops reports whose GitHub issue is
  closed (an admin-only public-API read, cached per session), degrading gracefully to show everything
  if GitHub is unreachable.

### Changed

- **Deploy gate cut ~29 → ~13 min.** The Playwright shards were rebalanced (chromium ×5 / mobile ×3)
  so the slow visual-navigation block spreads across isolated runners instead of piling into one
  ~27-minute tail shard. Same specs, assertions, and coverage — CI configuration only.

## 0.16.0

**The BG3 identity epic.** d20 Folio grows into its own material world. The interface is restruck in
gold leaf and candlelight — a new typographic voice, a warmer palette, translucent leather panels
over atmospheric art, engraved ornament, and a combat surface of struck-bronze coins and gilded
movement. Riding alongside the visual evolution is a broad wave of interaction and correctness work
across the cockpit, spells, inventory, wizards, encounters, roster, and compendium.

### The evolved identity — "The Gilded Plate"

- **A new typographic voice.** Cinzel now sets the ceremonial titling register (page titles, the
  brand lockup, the cockpit name, modal heads), Alegreya carries content headings and body prose, and
  Source Serif 4 sets every number and label with tabular lining figures pinned app-wide.
- **A warmer, candlelit palette.** Warm-black neutrals replace the old blue-cast darks, a new
  lit-emphasis text tier warms key labels, and a two-tier modal scrim, a warm focus wash, and a
  grounded gold illumination halo complete the foundation.
- **Candlelit surfaces.** The dark theme now glows through its outermost panels: a candlelit-study
  backdrop, seam-blended leather grain beneath the folio panels, and a colour-graded vellum leaf under
  the compendium tome. The panels, page headers, and game rail render translucently over the scene
  while nested cards and inputs stay crisp.
- **Engraved ornament.** A geometric vocabulary of hairline corner pieces, silver-over-bronze
  selection frames with a crest node, a single tip-fading section divider, and a jewelry-thin gold
  scrollbar now frames the ceremonial surfaces.
- **Settling motion.** A no-overshoot "settle" ease is now the primary motion for entrances, presses,
  and expansions, with the spring overshoot reserved for urgent notifications. The creation and
  level-up wizards crown their final commit with the crest and a single gold-leaf bloom.

### Combat & encounters

- **A struck-metal turn economy.** The Action / Bonus / Reaction tokens are now struck-bronze coins
  whose sigil is enamelled in the action-type hue and tarnishes dark when spent, the movement meter is
  a gold channel that drains as you move, and the combat pip wears the hero's portrait seal.
- **End Combat replaces Reset.** In solo play a quiet End Combat control resets the round, re-arms
  actions, refills movement, and clears initiative — leaving the log, conditions, concentration, HP,
  and death saves untouched. Mis-tap recovery moved onto the coins themselves: tap a spent coin to
  re-arm that slot with a 5-second undo.
- **Four encounter fixes.** A new fight no longer pre-fills the previous fight's initiative roll; End
  Turn on the sheet now flips optimistically instead of waiting on the server round-trip; an
  in-progress combat edit survives a turn change or remote update; and the pip reads a true "Rolling
  initiative" label instead of a clipped one.
- **Read-only sheets are a true glass case.** A teammate's, DM's, or admin's view of a sheet now hides
  every commit affordance while keeping all live state legible — and can no longer advance the combat
  round.
- Encounter and party polish: an un-rolled monster initiative glows like a player's, a uniform party
  reads "level 8", touch targets reach the 44px floor, and temporary HP finally draws as its lapis
  overlay segment on the HP bars.

### The character cockpit

- The header no longer folds the character name mid-band, the three-column HUD mounts at the right
  width for iPad landscape, an overflowing tab strip fades to signal hidden tabs, the Action Log
  adopts the shared section vocabulary, and death-save pips gain the app's oversized touch target.

### Spells

- The expanded spell card is now a typed document — a lit title, an icon-anchored facts grid,
  hairline-separated detail, and a cost footer. Casting a concentration spell while already
  concentrating asks first, a new "Conc." filter answers "which of my spells need concentration?", the
  cast button reads "Cast · Lv 3", and a homebrew spell's casting time is now editable in place.

### Inventory

- Magic items can be worn and attuned directly from the sheet (the affordance derived from the SRD
  data, so even minimally-stored items offer it), charged items show and spend their real charge pool
  from a single source, an empty pack teaches instead of showing a bare currency row (with Add Item
  available in play), and the cards join the typed-document reading anatomy.

### Creation & level-up wizards

- Both wizards gain a Review recap ledger attributing every choice to the step that owns it, each row
  a one-tap jump back. The level-up Subclass step enthrones the chosen subclass and reveals everything
  it grants; the manual HP roll is clamped to the die's real faces (and tappable as chips); the
  background-ASI picker names its constraint; honest create gates block an unassigned ability boost in
  every mode; the all-gold starting option names its purse; and the HP average badge folds in
  per-level grants.

### Roster, shell & compendium

- The first-run roster welcome carries its own Create CTA, crash screens wear the shared runic hero,
  character-import rejections read identically offline, and "Ask the Folio" search ranks name matches
  first and finds characters by class. A retired character's tile names its state, a long name never
  runs under the overflow dots, and a wounded hero's HP bar first-paints at its real width instead of
  sliding down from full.
- The Compendium facets magic items by attunement and spells by school and concentration/ritual, pins
  parsed engine facts above item and spell prose, and offers a one-tap reset when a search misses; the
  mobile Filters disclosure shows a tally of active facets.

### Bio, features & campaign hub

- The Bio Background select binds to the stable id — fixing every live character showing the wrong
  background in edit mode — blank Bio states carry the monogram seal and the runic empty state, and
  the portrait crop dialog hugs its content. The Features tab reports a missed search and rides its
  counts on a gilt medallion, and its swappable choice groups (maneuvers, metamagic, invocations,
  weapon mastery) are choosable in play. Your attached campaign character can be swapped or detached
  in place from your own party card.

### Account, admin & accessibility

- Admin: blocking a user now confirms first, metric chips pluralize correctly, and a never-signed-in
  user reads "Never active". Pre-auth: the Legal & attribution page is public with a colophon link,
  and a cancelled Google sign-in no longer logs an error. A bug report sent offline is queued and
  confirmed instead of spinning. Accessibility: the full surfaces × dark/light axe matrix is green
  (90/90), including the new level-up subclass altar and the restored crash-net anchor.

## 0.15.2

### Changed

- **Combat state now has a single home; the transitional legacy fallback is gone.** HP, conditions, initiative, and death saves live solely in the per-character `combat/state` document. The read-time fallback that reconstructed them from the old location during the rollout — and the spent one-off migration — have been removed _after_ every character's live data was migrated to the new home, so nothing changes for players; the code is just simpler and can no longer drift (golden rule 10: _migrate, then delete completely_).

## 0.15.1

### Fixed

- **Offline combat edits no longer vanish.** HP damage/healing, temp HP, conditions, death saves, and initiative changed while offline now persist (queued locally, replayed on reconnect) instead of silently reverting — the combat-state write dropped the one transaction that couldn't reach an offline server.
- **Rolling initiative no longer resets a wounded character's HP.** Rolling from the topbar combat pip kept a full-HP reset in one code path for a wounded character whose combat state hadn't migrated yet; it now uses the same current-HP fallback the sheet and DM tools already use.

## 0.15.0

A ground-up encounter and combat re-architecture: HP, conditions, initiative, and death saves now live in one place shared by the character sheet, the campaign hub, and the DM, so multi-writer play stays consistent by construction. This release also redesigns the campaign hub around an atmospheric two-band dashboard, opens every teammate's sheet to the party, and adds admin god-mode tooling.

### Added

- **In-hub party & encounter surface.** The campaign hub's Party section is now one live team surface for the whole table. At rest the DM sees a live party-overview dashboard — each PC's AC, HP, passive Perception, speed, senses, and conditions computed live from their real sheet, with progressive disclosure and "Open sheet". "Run encounter" promotes the party into a group-initiative tracker (typed initiative — no dice — add monsters/NPCs with per-token HP and DM notes, edit HP and conditions, step the round and turn pointer, and stage hidden combatants for ambushes). Every player gets the SAME read-only live view (initiative order · AC · HP · conditions · whose turn). PCs and monsters render on one unified combatant card, with enemy HP concealed from players as a qualitative band (Healthy / Bloodied / Near Death) that the DM can one-tap reveal.
- **Persistent global combat pip.** A topbar indicator surfaces your combat state anywhere in the app as a labelled, colour-coded switch (needs-roll · your-turn · actor's-turn · gathering), with a one-tap inline "roll a d20" initiative popover and a gentle "it's your turn" nudge. A DM/admin without a PC gets a one-way pip, and a chooser handles being in several fights at once.
- **Multi-writer combat editing.** The owning player and the DM can both edit a PC's HP, conditions, and initiative — from the character sheet OR the encounter card — with transactional, no-lost-update concurrency; edit rights match the security rules (your own character, or the DM for anyone in their campaign).
- **DM invite management.** Remove a member from a campaign, and lock new joins so a leaked invite link stops admitting anyone new while current members stay.
- **Shared campaign invites.** Any member (not just the DM) can copy or native-share the invite link from an "Invite to the table" panel.
- **Shared-notes reveal lens.** A DM can hold a note hidden from the players and reveal it when the moment comes; genuinely enforced (a hidden note is never sent to a player's app), with existing notes unaffected.
- **Open team sheets.** Every campaign member can now read every teammate's full sheet and live combat state (secrecy is DM-vs-players, never player-vs-player); write access is unchanged.
- **Admin god-mode.** An admin can inspect any user's characters as a read-only sheet, browse a bug inbox of stranded error reports, and permanently delete an account — a `deleteUser` Cloud Function that cascades characters, portraits, campaign membership, the user doc, and the Auth user, behind a typed-email re-confirm and an immutable audit record.
- **Cockpit "In combat" chip.** When your character is in an active encounter, a quiet chip on the sheet links straight to that campaign hub, completing sheet ↔ campaign ↔ encounter navigation.

### Changed

- **Single-source combat state.** HP `{current, temp}`, conditions, initiative, and death saves now live in one per-character Firestore subdoc, so the sheet, the encounter, the roster, and the DM read and write the same document and stay aligned by construction. Ships with a dry-run-by-default migration that backfills the subdoc from the legacy fields, and a load-boundary fallback that keeps a not-yet-migrated character's HP/conditions correct before and after the migration runs.
- **One initiative, one round, one turn.** Initiative is entered once app-wide via a shared roll-to-total tile — type your d20, the app adds your override-first bonus and stores the total. The turn order is frozen onto the encounter doc at "Begin turns" (disabled until every combatant has rolled), and round + turn advance transactionally from either the sheet or the hub, so the two surfaces can never disagree.
- **Redesigned campaign hub.** A two-band dashboard — an always-on Party PLAY band over a MANAGE band (Access · Sessions · Chronicle · Treasury · Shared notes · DM Tools). Each MANAGE section is a fixed at-a-glance panel plus one collapsible detail (the new `SectionPanel`), remembering its fold state per campaign, with an always-visible count badge; section counts render as struck gilt medallions and the disclosure control as a matching gilt knob that expands the detail in place.
- **Atmospheric campaign art.** The hub retires its big hero band for a slim header and renders the campaign's art (custom banner or the bundled default) as a full-page backdrop under the app scrim. The art is one 16:9 shape end to end — the crop dialog, the list card (cover-fit, no stretch), and the backdrop focal + zoom all frame the same region.
- **Simplified invite flow.** One link-based invite everywhere (the redundant bare "invite code" wording is gone); the Join dialog accepts a full invite link or a bare code.
- **Unified stat tiles and reused HP control.** Every stat tile is one shared `StatBadge` atom, and encounter + monster HP editing reuse the exact damage/heal/temp popover from the character sheet, so they always look and behave identically and improvements land in both places.
- **DM drag-to-reorder.** The DM reorders the frozen turn order with a lift-&-follow drag (mouse, touch, and pen — the cards FLIP-slide apart) or ArrowUp/ArrowDown; players never see the affordance.
- **Sheet declutter.** The cockpit combat header is now pure identity plus the reference vitals; combat controls (turn advance, initiative entry, round) live with the turn meter, and the redundant "In combat" status badge is gone (the topbar pip is the single combat signal).
- **One campaign at a time.** A character may belong to at most one campaign, enforced with a verify-first check and a friendly guard at attach time.
- **Player handle removed.** The separate per-campaign table handle is gone end to end; members now show their account name (an owner-gated cleanup script purges the dead field).

### Fixed

- **The "round 6, 7, 8…" bug.** The character sheet's End Turn used to climb a private round counter while the shared encounter stayed at round 1; End Turn now routes through one turn seam and advances the shared encounter, so the sheet and the encounter can never disagree on round or turn.
- **Roster showed 0/N HP.** A full-HP character read `0 / N` because the roster still read the stripped parent doc; it now reads the canonical combat-state subdoc, live-updates on every HP change, and flags a hero who fell in play.
- **Wounded-PC data corruption.** A combat op (rolling initiative, toggling a condition, ticking a death save) on a wounded, not-yet-migrated character no longer resets it to full HP.
- **Combat writes were denied in production.** The deployed Firestore ruleset predated the combat-state rule, so every combat write failed until the rules were redeployed; the rule is now secured and field-locked to the exact combat shape (owner + admin + campaign DM).
- **Global combat pip reliability.** The pip now lights from anywhere (not only the open sheet), reflects your own start/end/begin-turns immediately (no ~2s echo lag), reds a genuinely-new fight without a false "gathering" flash, never bleeds roll-state between simultaneous fights, and its roll popover no longer flickers on dismiss or blanks its value on re-open.
- **Encounter card interactions.** A click that dismisses an inline HP/initiative/conditions editor no longer also expands or collapses the card (portal-aware, both disclosure entry points), and the drag clone no longer freezes mid-drag.
- **Campaign art rendering.** A newly created campaign now stamps `createdAt` so its card shows the start date (with a one-off backfill for existing campaigns); the list card cover-fits the 16:9 crop without stretching, and the backdrop honours the crop's zoom and focal.
- **Light-theme legibility.** Restored the gilt glow via a dedicated bright glow token (gold halos bloom on cream instead of smearing brown), fixed the section-count medallion reading brown on the hub backdrop, and killed hardcoded near-black/brown text at the token seam.
- **Encounter and layout polish.** Inline title editing renders at its full display size and width (no left-truncation of long titles), the character name owns its card header row (no mid-name wrapping), the add-monster form is compact and stepper-based, an empty Treasury shows an honest card-framed empty state, the initiative input no longer overlaps the portrait, and the Chronicle chapter rail no longer clips under the topbar.
- **Turn economy.** The per-turn action/bonus/reaction/movement budget now resets at turn-START (robust even if you never formally end your turn), and off-turn reactions stay available.
- **Encounter round-badge contrast.** The ROUND badge now clears the AA 4.5:1 contrast floor in both themes.

## 0.14.0 — 2026-06-27

The push toward 100% D&D 2024 automation — dozens of mechanics wired override-first, multiclass correctness fixes, and structured spell data.

### Added

- Many class, subclass, and species mechanics now auto-compute: Monk Stunning Strike save reminder and a Monk automation cluster, Fighter Studied Attacks toggle, Champion's second Fighting Style at L7, the two caster Fighting Styles (Blessed Warrior, Druidic Warrior), Paladin Oath of Devotion Sacred Weapon (+CHA to-hit) and the oath L20 capstones, a species' Celestial Revelation (all three forms' +PB damage, Healing Hands PB×d4, Necrotic Shroud CHA save), Wizard Abjurer Arcane Ward on-cast HP refill, Wizard Diviner Expert Divination slot regain, Armorer Arcane Armor model weapons (Dreadnaught / Guardian / Infiltrator), Artificer Replicate Magic Item count chips and companion attacks, Gloom Stalker Ambusher's Leap, Druid Elemental Fury Potent Spellcasting, War God's Blessing free cast, Warlock Magical Cunning / Eldritch Master pact-slot restore, the Weapon Master feat's Mastery slot, and single-fixed-spell magic-item casts (Wand of Web among them, plus the Boots of Striding Speed floor).
- Item ability-score bonuses (both set-score and additive) now reach all combat, cast, and inventory math through the single effective-scores chokepoint, without double-counting feat ASIs.
- New data-layer seams: a save-based action primitive (S11), structured spell damage/heal dice that scale on a higher-level slot (S12), and the effective walking Speed surfaced in the UI (S13).

### Fixed

- Class-feature level-scaling now resolves at the owning-class level, not the total character level (multiclass, B2).
- Pact Magic and normal spell slots that share a level no longer share one usage counter (multiclass, B3).
- Multiclass spell save DC / attack now reaches the right class's spells (B6).
- Inventory weapon math and carrying capacity read effective ability scores (B4/B7), the Max-HP breakdown sums to the headline (B5), additive ability-keyed bonuses read effective scores (B8), the Dueling style applies only to a one-handed melee weapon (W9), plus numerous 2024-RAW data corrections.

### Changed

- Reconciled area-spell recurrence prose, Polymorph / True Polymorph, and cantrip concentration flags to 2024 RAW (EN + IT).
- Stable-id discipline: advantage/disadvantage `vs` fields normalized to id slugs (GR7).

## 0.13.0 — 2026-06-23

The id-storage and i18n-leak-eradication campaign, plus official-layout PDF export.

### Added

- Export PDF produces a faithful recreation of the official 2024 character sheet, filled with the character's data.
- Sheet ⋯ menu gains Export JSON; spell slots get a labelled group.
- Independent feat free-casts and a manual spell-slot override.
- Download the shared campaign chronicle as a Markdown file.

### Changed

- Codec-wide stable-id discipline: alignment, race, class, weapon/armor proficiencies, and concentration are stored as branded ids, not localized display strings (golden rule 7).
- i18n leak-proofing: dynamic-key crash classes closed, Italian leaks fixed, and the SRD-name leak-detector allowlist is now empty.

### Fixed

- A SEV-1 Italian Play-tab crash, a combat-log id-ref regression, Magic Initiate's chosen spell now castable without a slot, and re-opening an invite link no longer wipes an attached character.

### Removed

- Spent one-off migrations and assorted dead code (golden rule 10).

## 0.12.0 — 2026-06-22

The combat-on-rails campaign — a cadence engine and in-play resolvers.

### Added

- Cadence engine (A2): per-turn recovery, round timers, and round-1 clauses.
- In-play resolvers (A3): a per-attack Rogue Cunning Strike picker, an alternate-payment picker, and a rail alternate-recovery affordance — each an explicit tap with immediate commit and undo.
- Active conditions project onto the Play surface (Speed 0, auto-fail saves, blocked concentration) with a "what's limiting you this turn" summary (B1/B3).
- Multi-action awareness raises the per-turn budget for Action Surge / Haste (B6).
- Form-swap attack rows for Wild Shape, Starry Form, and Arcane Armor (S7); magic-item charge-cast rows and potion duration timers (S9); on-hit rider chips with provenance.
- Build-time i18n leak-lock: `pnpm build` now fails on any untranslated string before a bundle is emitted.

### Changed

- Combat surface decluttered; the canonical doc set consolidated to a lean tick-box roadmap.

## 0.11.1 — 2026-06-15

Cleanup patch following 0.11.0's non-nullability invariant: removed the now-dead empty-string fallbacks it made unreachable, with no behavior change.

## 0.11.0 — 2026-06-15

The hardening release — making the foundation unbreakable for live players.

### Added

- A character can belong to more than one campaign at once; DMs read a member's real sheet through a `dmReaders` ACL with no denormalized copy.
- All 13 classes ship structurally-correct 2024 starting equipment ("Choose A or B" packages with leftover gold), plus Monk/Bard tool-proficiency choices.

### Changed

- Structural cure for the production render-crash class: a character name is a branded non-empty string, and a corrupt or nameless member degrades in place behind per-section error boundaries.
- "Play, don't edit": every mid-session action works without entering edit mode; the combat log is a locale-free play narrative; tap-for-breakdown generalizes to Max HP, AC, initiative, saves, passives, and spell DC/attack.
- Multiclass casters compute spell save DC and attack per spell, keyed to each spell's class; Rage is a fully-automated active state; Weapon Mastery count scales with class level; multi-action features surface as separate, correctly-named cards.
- The Firestore character doc and the portable export share one `{ schema, build, state }` codec and a single read path.

### Fixed

- Italian leaks, systemic truncated-text elimination, unified weapon cards, single-source derived formulas, and a board-wide dead-code purge.

## 0.10.0 — 2026-06-12

The wizard release.

### Added

- True D&D 2024 multiclassing: a character is an array of classes with RAW prerequisites, partial entry proficiencies, and multiclass spell-slot math; every feature scales at its own class level.
- Client-side PDF export in the official 2024 sheet layout; the minimal portable character model (explicit choices in, everything derivable inferred at render).

### Changed

- Character creation and level-up rebuilt as one full-screen wizard family, with the canonized picker doctrine and two-tier bilingual search.
- Deep rules-correctness and automation sweep across the whole SRD (Epic Boons for every class, heritage feats, prose-to-grant conversions, new grant primitives) with a self-enforcing automation coverage matrix.
- Premium UX register (Cockpit / Compendium LUX, full mobile sweep) and an i18n re-architecture that makes untranslated strings impossible to ship.

### Fixed

- A class of i18n/identity bugs removed at the root by storing class and subclass as canonical ids; the 6 live team characters made 100%-legal 2024 and pinned as conformance fixtures.

## 0.9.0 — 2026-06-07

The premium release.

### Added

- The "Illuminated Folio, Evolved" design system, rebuilt from first principles with full dark + light parity and shared chrome (Universal Card, Carved Cartouche, rail shell + cockpit).
- "Ask the Folio" (⌘K) universal command palette; the full campaign and party toolset (Party, Chronicle, Treasury, SharedNotes, Sessions, DM Tools); the compendium codex.
- A large expansion of the declarative `Grant` engine and its consumers toward 100% 2024 automation (override-first); an in-app bug/feature reporter.

### Changed

- Bilingual everywhere (EN + IT) via the i18n cascade; combat is immediate-commit-per-action with undo; one-way engine→UI architecture enforced; first-load performance and accessibility hardened.

### Release engineering

- Stood up the `@changesets/cli` version-PR release flow in CI.

## 0.8.0 — 2026-05-28

Code-quality pass: stricter TypeScript and a dead-code purge, plus real bug fixes — the combat hydration race on reload, concentration save DC now counting total damage through temp HP, long-rest Hit Dice regain, concentration auto-drop at 0 HP, and auto-save flush on unmount/close.

## 0.7.0 — 2026-05-28

Phase E content ingestion: 4 missing feats added (feat coverage gap closed) and 329 magic items ingested from the wiki (catalog 65 → 394), each bilingual with provenance; Italian descriptions marked for owner refinement.

## 0.6.0 — 2026-05-28

Audit closure: character-io v3 converter extraction, the cover-rule AC tooltip, and Vite code-splitting (main bundle 638 KB → 84 KB gzipped).

## 0.5.0 — 2026-05-28

Feat-granted spells go declarative: Magic Initiate, Fey-Touched, and Shadow-Touched declare their cantrip and spell grants through the Grant union.

## 0.4.0 — 2026-05-28

Feature riders go declarative (a per-feature `mechanics.rider` field replaces the hard-coded map); shipped `docs/ARCHITECTURE.md` and `docs/CONTRIBUTING.md`.

## 0.3.0 — 2026-05-28

Mechanics taxonomy mined from the 1229-page wiki corpus; the Grant schema extended to 30 kinds with 27 merged effect fields; the UI/UX brief shipped.

## 0.2.0 — 2026-05-28

Foundational declarative-effect work: the `Grant` discriminated union with race traits, feats, magic items, and class features migrated off regex; subclass "always prepared" spells skip the prepared count; correct Sorcerous/Arcane Recovery semantics; the polite wiki scraper; and the Keep a Changelog + changesets bootstrap.

## 0.1.0 — Pre-audit baseline (2025–2026 incremental)

The initial milestone: the React 19 + Firebase PWA with a bilingual character sheet, creation and level-up wizards, JSON import/export, the smart-tracker engine, the pre-loaded 2024 SRD database, offline support, and the admin panel.

[0.12.0]: https://github.com/salvodicara/d20-folio/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/salvodicara/d20-folio/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/salvodicara/d20-folio/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/salvodicara/d20-folio/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/salvodicara/d20-folio/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/salvodicara/d20-folio/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/salvodicara/d20-folio/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/salvodicara/d20-folio/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/salvodicara/d20-folio/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/salvodicara/d20-folio/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/salvodicara/d20-folio/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/salvodicara/d20-folio/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/salvodicara/d20-folio/releases/tag/v0.1.0
