# BG3 Combat UI — Research Evidence

Purpose: sourced facts on BG3's combat UI so Astra can copy the dominant proven pattern for d20
Folio's "digital table" (maths automated, story stays human, DM overrides). No BG3 assets may be
copied — art/icons/copy are Larian's IP; only pattern/taxonomy are usable. Citations are numeric,
keyed to Sources at the end.

## 1. Hotbar, action economy, tooltip anatomy, targeting

- 1 Action, 1 Bonus Action, 1 Reaction, Movement per turn, refreshed at turn start; extra charges
  from features. Reactions fire outside the normal economy, any time a trigger is met. [1][2]
- Cost badge bottom-left of tooltip: Action = "a green circle with the word 'Action'"; Bonus
  Action = orange triangle. [3]
- Hotbar groups: **Common** (all), **Class**, **Racial**, **Situational** (only while a trigger is
  active, auto-removed), **Weapon** (needs proficiency), **Spells**. Bar is drag-to-slot
  customizable, resizable (+/−), lockable. [1][4]
- Reactions live in an inventory tab, not the hotbar; each has an always/never toggle dot plus a
  separate "Ask" box that pauses play with a confirm/veto popup on trigger. [3]
- Concentration folds into the tooltip's Duration field, not a separate flag; breaking it on
  damage needs a CON save, DC = max(10, half damage). [5]
- Save DC is a flat caster-derived number: "if your Spell DC is 13, enemies need to reach 13 or
  higher." [6]
- **Defect**: PC Gamer reported spell tooltips showed a wrong Save-DC-related figure for months
  while roll math and displayed hit-chance % stayed correct — shown vs. simulated silently
  diverged. [7] (headline+snippet only — **partially verified**)
- Upcast: picking an upcastable spell opens a spell-slot-level picker; tooltip gets an upcast icon
  and inline upcast-effect text. Exact popup layout **unconfirmed — needs a screenshot capture**. [8]
- Targeting shows a live **hit-chance %** at the cursor from terrain/elevation (e.g. 70% flat,
  80% high ground); save spells show DC, not %. AoE ground-target (Fireball) renders two circles:
  small green center + larger magenta footprint; enemy-targeted AoE snaps to nearest target. [9][10]
- Examine: right-click (or hover+key) any creature opens a sheet with ability scores, resistances,
  and a Conditions list beneath the name, at zero action cost; can spoil lore. [11]

## 2. Iconography and visual language

- Conditions: "listed on the top left of the character's portrait," each a small icon; hover a
  party-thumbnail icon for status info. [12]
- bg3.wiki catalogues condition icon assets and per-school spell categories (Evocation,
  Abjuration, etc.). [13][14][15]
- 8 schools organize spells (Abjuration, Conjuration, Divination, Enchantment, Evocation,
  Illusion, Necromancy, Transmutation), each its own wiki category. [16]
  **Gap**: no fetchable source gives the exact color-per-school palette or confirms
  "monochrome-icon-on-colored-background" as the render rule — needs a spellbook screenshot.
- All referenced art is Larian's copyrighted work (mirrored on bg3.wiki) — pattern/taxonomy
  reference only, never traced or copied.
- Some conditions ("ForceOverhead") also render as a floating icon over the model on
  apply/remove — a second, more prominent readout for high-salience effects. [12]

## 3. Reactions and combat log

- Reaction prompt = dot (always/never) + "Ask" box; with Ask on, play pauses and shows a
  confirm/veto popup on trigger (Counterspell, Shield, opportunity attacks). [3][2]
  **Gap**: exact popup contents (caster, spell, resource) unconfirmed — needs direct capture.
- Combat log: attack = d20 + STR(melee)/DEX(ranged) + proficiency vs. AC; "modifiers are listed
  underneath the dice roll and added to the result." Log is where guides say to verify the math
  behind a shown %. [17][18]
  **Gap**: exact expand/collapse of log lines unconfirmed — needs direct capture, not fabricated.

## 4. Initiative, turn order, DM-equivalent gap

- Initiative = d20 + DEX; a turn-order tracker UI shows the encounter order. [19][20]
- "End turn" control sits lower-right (also a timer button). [19]
- Combatants adjacent in initiative order act **simultaneously** — up to all 4 party members at
  once — with free portrait-swapping before any one formally ends their turn; no built-in toggle
  forces strict sequencing (only a mod can). [21][22]
- **No DM role**: adjudication is baked into scripted engine logic. This is the gap d20 Folio must
  fill — BG3 gives the player-facing action/turn UI to imitate, but DM affordances (pause, inspect
  any actor, force a result, edit HP/conditions mid-combat) have **no BG3 precedent** — original
  surface for our product team.
- No evidence of a tabletop-style "Ready" action; Reactions (pre-defined triggers) are the closest
  analogue. **Unconfirmed/likely absent** — open question, not asserted.

## 5. Explain-on-demand teaching

- Keywords (Advantage, Prone) get stable, reusable definitions wherever shown — Advantage: "roll
  the D20 twice, take the higher"; Prone lists three effects (advantage within 3m, disadvantage
  on STR/DEX saves, half-movement to stand). [23][24]
  **Gap**: whether the tooltip actually **nests** (a keyword opens a second-level tooltip) vs.
  just reusing text inline is **unconfirmed** — needs video/in-game capture; do not assume nesting.
- Expert speed controls (skip tooltips, faster animations, auto-pass low rolls): **not confirmed**
  — open question for a settings-menu capture.
- BG3 is broadly reported (secondary coverage) as a strong accessibility example, with patches
  adding UI/combat customization — not corroborated against a primary Larian source. [25][26]
  (**secondary, leads only**)

## 6. Known UX criticisms (avoid copying these flaws)

- Hotbar clutter: players call it "too cluttery" as weapon/class/spell actions pile onto one bar;
  recurring request for a separate weapon-ability pop-up. A mod ("Basic Weapon Actions
  Consolidated") merges repetitive weapon entries — evidence the base UI doesn't. [27][28]
  (**forum-level, directional**)
- New/temporary abilities (Wild Magic, Dread Ambusher, recast-concentration) reportedly don't
  auto-populate the hotbar and must be dug from the spellbook mid-combat; temporary icons
  reported to not persist in their slot. [29] (**forum-level, directional**)
- Player feedback flags some menus (party trading) as clunky/info-poor and some spell tooltips as
  under-detailed. [30] (**secondary/aggregated**)
- Tooltip correctness bug (Section 1): displayed vs. simulated DC diverging — keep both under one
  source of truth and one test suite. [7]
- Upcast bug: Animate Dead's slot-level picker documented failing to register a higher slot,
  needing a workaround — chooser state must be unambiguous/testable. [31] (**specific bug**)

## Patterns worth copying (observable behaviour)

1. Cost badge (icon + word: Action/Bonus Action/Reaction/Free) in the tooltip, not color alone.
2. Action taxonomy split Common vs. Class/Weapon/Situational/Spell; situational actions appear
   only while their trigger is active.
3. Live hit-chance % at the cursor during targeting, factoring terrain/elevation.
4. Two-radius AoE ground preview (small center circle + larger footprint circle).
5. Per-reaction three-state control (Always/Never/Ask) instead of a single on/off.
6. Concentration folded into the tooltip's Duration field, visible where duration is read.
7. Examine/Inspect any creature at zero action cost, surfacing conditions and resistances.
8. Condition icons anchored top-left of the portrait as the always-visible strip, with a rarer
   overhead-model treatment for high-salience changes.
9. Customizable hotbar (drag-to-slot, lockable, resizable) rather than fixed.
10. Save DC shown as a flat caster-derived number, not player-computed.

## Do not copy

- Letting the hotbar become an unbounded flat list — group weapon actions from day one.
- Letting newly-granted/temporary abilities silently fail to surface in the active-turn UI.
- Letting a displayed number (tooltip DC/damage) diverge from the simulated one — one source of
  truth, shared tests.
- Shipping tooltips missing mechanically-relevant fields (cost, range, damage/save, duration,
  concentration, ritual) — treat completeness as a checklist.
- Assuming BG3's simultaneous/shared-turn model transfers to a DM-present table without product
  review — it exists because BG3 has no DM; needs an explicit decision, not a silent copy.

## Sources

1. bg3.wiki, Actions: https://bg3.wiki/wiki/Actions
2. Gamer Guides, Reactions: https://www.gamerguides.com/baldurs-gate-3/guide/gameplay/getting-started/reactions-explained-in-baldurs-gate-3
3. Gamer Rant, Action Economy: https://gamerant.com/baldurs-gate-3-action-economy-explained-regular-standard-bonus-free-reactions-all-actions-bg3/
4. ProGameTalk, Hotbar guide: https://progametalk.com/baldurs-gate-3/hotbar-guide/
5. Gamer Guides, Duration/Concentration: https://www.gamerguides.com/baldurs-gate-3/guide/gameplay/getting-started/spell-duration-range-casting-time-and-concentration-explained
6. Fextralife, Spellcasting Ability: https://baldursgate3.wiki.fextralife.com/Spellcasting+Ability
7. PC Gamer, tooltip DC bug: https://www.pcgamer.com/games/baldurs-gate/baldur-s-gate-3-s-spell-tooltips-have-been-lying-to-you-for-potentially-months-though-if-you-ve-been-running-off-the-chance-to-hit-you-re-just-fine/ (Baldur's Gate 3)
8. Fextralife, Spellcasting Guide: https://fextralife.com/baldurs-gate-3-guide-to-spellcasting/
9. Gamer Rant, Spell Hit Chance: https://gamerant.com/baldurs-gate-3-increase-spell-hit-chance-bg3/
10. Larian docs, Making a Basic Spell: https://docs.baldursgate3.game/Making_a_Basic_Spell
11. ScreenRant, Inspect/Examine: https://screenrant.com/baldurs-gate-3-inspect-hidden-details-game-spoilers/
12. bg3.wiki, Conditions: https://bg3.wiki/wiki/Conditions
13. bg3.wiki, Category:Condition Icons: https://bg3.wiki/wiki/Category:Condition_Icons
14. bg3.wiki, Evocation School: https://bg3.wiki/wiki/Evocation_School
15. bg3.wiki, Abjuration School: https://bg3.wiki/wiki/Abjuration_School
16. bg3.wiki, Spells: https://bg3.wiki/wiki/Spells
17. Segmentnext, Dice Rolls Guide: https://segmentnext.com/baldurs-gate-3-roll-modifiers/
18. Deltia's Gaming, D20 Guide: https://deltiasgaming.com/baldurs-gate-3-20-sided-dice-d20-guide/
19. GamesRadar, Combat guide: https://www.gamesradar.com/baldurs-gate-3-combat/
20. Shacknews, How combat works: https://www.shacknews.com/article/136590/combat-explainer-baldurs-gate-3
21. DualShockers, Simultaneous turns: https://www.dualshockers.com/baldurs-gate-3-combat-fixes-divinity-original-sin-biggest-problem/
22. Steam, Shared initiative toggle: https://steamcommunity.com/app/1086940/discussions/0/3808408328760940230/
23. GamesRadar, Advantage/Disadvantage: https://www.gamesradar.com/baldurs-gate-3-disadvantage-advantage/
24. Fextralife, Prone: https://baldursgate3.wiki.fextralife.com/Prone
25. United Spinal Assoc., Accessibility (secondary): https://unitedspinal.org/why-baldurs-gate-3-is-a-triumph-for-accessible-gaming/
26. Can I Play That, Accessibility review (secondary): https://caniplaythat.com/2023/08/31/baldurs-gate-3-accessibility-review/
27. Steam, Hotbar clutter feedback: https://steamcommunity.com/app/1086940/discussions/0/4848778928896905084
28. Nexus Mods, Basic Weapon Actions Consolidated: https://www.nexusmods.com/baldursgate3/mods/16884
29. Steam, Abilities not auto-populating hotbar: https://steamcommunity.com/app/1086940/discussions/0/3471730015126690544
30. PC Gamer, BG3 review: https://www.pcgamer.com/baldurs-gate-3-review/
31. Gamer Rant, Spell Slots (upcast bug): https://gamerant.com/baldurs-gate-3-spell-slots-bg3/

**Captures still needed (screenshot-only):** school color palette in the live spellbook;
Counterspell/Shield popup layout; combat-log line anatomy; nested-tooltip confirmation;
expert/skip-animation settings.
