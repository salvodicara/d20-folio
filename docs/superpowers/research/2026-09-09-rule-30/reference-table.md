# Reference-product table: table-play jobs × products

Evidence for the d20 Folio PD rule-30 audit: how reference products structure seven table-play jobs (prep, initiative, resolution, map, dice, rest, manual path). Behaviour, flow, order and copy only; no visual or taste judgements. Compiled 2026-09-09.

Method and access notes

- Fetched directly: foundryvtt.com, bg3.wiki, extensions/blog.owlbear.rodeo, github.com, gitlab.com, dndbeyond.com posts/changelog, roll20.net compendium, bloghub.roll20.net, shacknews.com, gamerguides.com, dungeonsolvers.com, bouncyrock.com, arcaneeye.com.
- HTTP 403 to this agent: help.roll20.net, wiki.roll20.net, docs.owlbear.rodeo, dndbeyond-support.wizards.com, the Larian Baldur's Gate 3 news site (baldursgate3.game), nexusmods.com, riccisi.gitlab.io. Facts from those URLs come from search-index snippets, are tagged "snippet" and count as unverified unless corroborated. web.archive.org was unavailable.
- Quotes under 15 words. "Capture:" = screenshot the auditor should take from that URL; nothing was downloaded. Licensing guard: any line with a product-token URL slug also names Baldur's Gate 3 in full.

Key: BG3 Baldur's Gate 3; OBR Owlbear Rodeo; FVTT Foundry VTT; R20 Roll20; DDB D&D Beyond; K+FC Kobold+ Fight Club; DMG 2024 Dungeon Master's Guide; TS TaleSpire; DA Dungeon Alchemist.

---

## (a) DM prep: encounter building, balancing (2024 XP budgets), reuse, checklists

### DMG 2024 (math reference)

- Structure: three steps in this order: "Choose difficulty level", "Determine XP budget" (table value × party size), "Spend budget" on creatures whose XP totals do not exceed it. https://roll20.net/compendium/dnd5e/Rules:Plan%20Encounters?expansion=33359
- Difficulty tiers are Low / Moderate / High (2014 Easy/Medium/Hard/Deadly and the multiple-monster multiplier are gone). Low: "one or two scary moments" but "no casualties"; Moderate: "could go badly"; High: "could be lethal for one or more characters". Same URL.
- XP budget per character (Low / Moderate / High): L1 50/75/100; L2 100/150/200; L3 150/225/400; L4 250/375/500; L5 500/750/1,100; L6 600/1,000/1,400; L7 750/1,300/1,700; L8 1,000/1,700/2,100; L9 1,300/2,000/2,600; L10 1,600/2,300/3,100; L11 1,900/2,900/4,100; L12 2,200/3,700/4,700; L13 2,600/4,200/5,400; L14 2,900/4,900/6,200; L15 3,300/5,400/7,800; L16 3,800/6,100/9,800; L17 4,500/7,200/11,700; L18 5,000/8,700/14,200; L19 5,500/10,700/17,200; L20 6,400/13,200/22,000. Same URL.
- CR guard copy: a creature whose CR exceeds party level "might deal enough damage with a single action to take out" characters. Same URL. Official explainer adds: prefer "multiple low-value creatures rather than one or two high-value ones". https://www.dndbeyond.com/posts/1901-creating-combat-encounters-using-the-new-dungeon

### Kobold+ Fight Club

- Structure: party first ("Input the number and level of the player characters"), then a monster list ("filter monsters by type, challenge rating, and source material"), then the encounter panel labelled "Easy, Medium, Hard and Deadly" (2014 mode). https://www.dungeonsolvers.com/how-to-use-kobold-fight-club-for-encounter-planning/ (blog walkthrough)
- 2024 rules: release 2.4.0 "Added D&D 5e 2024 encounter rules"; also "Keyboard Shortcut Fixes" and "Move Search Keyboard Shortcut Label" confirm a keyboard search shortcut exists (key unverified). https://github.com/fantasycalendar/kobold-plus-fight-club/releases
- Reuse: "Import Custom Monsters"; "Each import method has an example for reference." https://github.com/fantasycalendar/kobold-plus-fight-club/blob/master/README.md
- Save/load, random generator and empty-state copy: not documented in fetched sources — unverified. Capture: https://koboldplus.club/ (empty encounter panel and the 2014/2024 toggle).

### D&D Beyond (Encounters tool; Maps)

- Structure (Encounters): blank encounter → "Manage Characters" (preset party or campaign) → monster search/filter left, encounter summary right → "+Add" → name field at top → "Save". https://www.dndbeyond.com/posts/1135-tutorial-how-to-build-encounters-and-run-them-on-d
- Disclosure: sidebar header shows difficulty, "total XP", "adjusted XP", the "XP bracket for each of the four difficulty levels", a "daily budget" bar (2014 math). Same URL.
- Reuse: "My Encounters" under Collections lists date, campaign, difficulty, player levels, last saved; primary actions "Run" or "Resume". Same URL.
- 2024 gap: the Encounter Builder "lacks 2024 calculations"; Maps "automatically calculates encounter XP budgets" under 2024 rules. https://www.dndbeyond.com/posts/1901-creating-combat-encounters-using-the-new-dungeon ; community toggle extension as demand signal https://chromewebstore.google.com/detail/ddb-2024-difficulty/gmdhbmhciicnhegakpdhkeicmpdoibdk (community)

### Foundry VTT, Roll20, BG3

- FVTT prep is scene-first: place tokens, "Toggle Combat State" from the token right-click; encounters are documents created ahead ("Create Encounter") and switched with "Previous/Next Encounter"; no core XP budgeting. https://foundryvtt.com/article/combat/
- R20 ships a prep checklist document, "Dynamic Lighting Checklist"; no core budget tool. https://help.roll20.net/hc/en-us/articles/360044771413-Dynamic-Lighting-Checklist (snippet)
- BG3: not applicable (pre-authored encounters). DA (corroboration): no fog or encounter tools; "Line-of-sight data gets exported automatically" to VTTs. https://steamcommunity.com/app/1588530/discussions/0/596266163566094231/ (community)

---

## (b) Initiative and turn order; player-facing order; "your turn" signalling

### Baldur's Gate 3

- Structure: on combat start every combatant rolls "D4 + Dexterity Modifier"; ties go to higher Dexterity, and same-player characters with equal initiative "effectively act simultaneously". https://bg3.wiki/wiki/Initiative
- Player-facing order: portraits across the top; adjacent own characters — "you can switch between them at will". https://www.gamerguides.com/baldurs-gate-3/guide/gameplay/getting-started/surprise-rounds-and-initiative-explained (Baldur's Gate 3). Grouping shown as "portrait borders will be intertwined"; initiative number "Above each character's head". https://www.shacknews.com/article/136590/combat-explainer-baldurs-gate-3 (Baldur's Gate 3)
- "Your turn" signalling: an on-screen "Your Turn notification" that, since Patch 2, "now lists which character's turn it is." https://www.shacknews.com/article/136870/baldurs-gate-3-patch-2-notes (Baldur's Gate 3, patch notes)
- Camera option "Dynamic Combat Camera": "the camera follows the character whose turn it is"; "Autoselect character after combat". https://bg3.wiki/wiki/Options
- Primary action: end turn via "the timer button in the bottom right"; "Cancel End Turn" exists. https://www.shacknews.com/article/136590/combat-explainer-baldurs-gate-3 (Baldur's Gate 3)
- Shortcuts: End Turn "Space"; Enter Turn-Based Mode "Shift + Space"; Toggle Group Mode "G"; Reactions "L". https://bg3.wiki/wiki/Controls — keybinds "End Turn", "Cancel End Turn", "Leave Turn-Based Mode", "Flee From Combat". https://bg3.wiki/wiki/Options
- Capture: https://bg3.wiki/wiki/Initiative (turn-order bar) and the "Your Turn" banner from an official Larian video.

### Foundry VTT

- Order of operations: select tokens → "Toggle Combat State" → "Roll All" / "Roll NPCs" → "Begin Combat" → players end own turns, GM uses "Next Turn" for NPCs → "End Combat". https://foundryvtt.com/article/combat/
- Header controls in order: "Create Encounter", "Delete Encounter", "Previous/Next Encounter", "Link Combat", "Configure Tracker"; then "Roll All Combatants", "Roll All NPCs", "Reset Initiative", "Previous/Next Round", "Previous/Next Turn", "Begin Combat", "End Combat", "End Turn (players only)". Same URL.
- Row: name, thumbnail, initiative, status "Hidden and Defeated". Context menu: "Update Combatant", "Clear Initiative", "Re-Roll Initiative", "Remove Combatant". "Configure Tracker": tracked "actor resource ... (such as current hit points)", "defeated combatants should automatically be skipped". Same URL.
- Player-facing: player rolls by clicking "the D20 next to your character's name"; can toggle combat from the token's "sword and shield button". https://encounterlibrary.com/foundry-players-guide/combat-tracker/
- "Your turn" signalling (v13): Turn Markers "display below a token when it is their current turn"; animations "Spin", "Pulse", "Spin and Pulse"; texture and disposition tint per combatant. https://foundryvtt.com/releases/13.332
- Motion budget: markers "slowly rotate" / "slowly grow larger and smaller"; no reduce-motion switch, auto-pan or turn sound documented in core (unverified absence).

### Roll20

- Structure: GM opens the tracker from "the Clock icon on the Toolbox"; "once it's open, everyone can see it". https://bloghub.roll20.net/posts/tome-of-tips-turn-tracker/
- Adding turns: roll initiative from a sheet with the token selected, or right-click a token → "Add Turn", or append "&{tracker}" to a chat roll. Same URL; corroborated by https://help.roll20.net/hc/en-us/articles/360039178634-Turn-Tracker (snippet).
- Player-facing: players "will only see turns for the tokens visible on the page they're at"; GM-layer tokens are hidden from players' tracker. Same blog URL.
- Expert devices: custom items with a "round calculation modifier (e.g., -1)" as countdown timers; tracker spans pages for split parties. Same blog URL. Next-turn, sort, round counter and turn highlight: unverified (help page 403). Capture: https://help.roll20.net/hc/en-us/articles/360039178634-Turn-Tracker

### Owlbear Rodeo (Initiative Tracker extension, official)

- Structure: select a character → "Add to Initiative" (same button removes); click the number in the popover to edit; advance with "the arrow icon in the top of the extension popover". https://extensions.owlbear.rodeo/initiative-tracker
- Player-facing: "A basic initiative tracker with a shared view for you and your players". https://github.com/owlbear-rodeo/initiative-tracker — no turn sound, banner, auto-pan or settings documented (unverified absence).

### D&D Beyond

- Encounters tool: "Auto Roll Initiative" above the player or monster list populates fields; "'Next' advances the turn" and "'Undo' rewinds the turn back". https://www.dndbeyond.com/posts/1135-tutorial-how-to-build-encounters-and-run-them-on-d
- Maps: "click the 'Start Combat' button to begin Initiative"; players "see the Initiative order, along with whose turn it is". https://www.dndbeyond.com/posts/1841-roll-for-initiative-combat-tracking-comes-to-the
- Live re-sort: player initiative "updates their place in the combat tracker automatically, even if the combat has already started"; DMs edit initiative "directly within the active combat list" (2026-06-29). https://www.dndbeyond.com/changelog

---

## (c) Combat resolution: attack/damage/save flows, receipts, undo, DM override, hidden rolls

### Baldur's Gate 3

- Flow per turn: "one Action, one Bonus Action and one Reaction per turn" plus movement; Action = "green circle", Bonus Action = "orange triangle", Movement = "blue circle" at bottom right. https://bg3.wiki/wiki/Combat and https://www.shacknews.com/article/136590/combat-explainer-baldurs-gate-3 (Baldur's Gate 3)
- Reaction prompt: reactions are "taken automatically, or the game can be set to prompt the player first"; the Reactions tab (hotkey "L", or from the spellbook/hotbar icons) has per-reaction checkboxes; a "dialogue bubble on each icon" marks those set to "Ask". https://bg3.wiki/wiki/Reactions
- Defaults are tuned by patch: "The Cutting Words reaction is now set to Ask by default." https://www.shacknews.com/article/137161/baldurs-gate-3-patch-3-notes (Baldur's Gate 3, patch notes); tooltips gained "whether the reaction is enabled". https://www.shacknews.com/article/136870/baldurs-gate-3-patch-2-notes (Baldur's Gate 3)
- Fairness device: "Karmic Dice" — "avoid failure streaks, while keeping the results mostly random." https://bg3.wiki/wiki/Options
- Receipts: a Combat Log exists (Patch 2: "entries for all items looted from corpses"); on controller it sits in the R2 shortcut menu with Long Rest / Short Rest / Go To Camp. https://www.shacknews.com/article/136870/baldurs-gate-3-patch-2-notes (Baldur's Gate 3); https://www.resetera.com/threads/baldurs-gate-3-controller-tips-tricks-for-playstation-5-xbox-players.760275/ (community, labelled; Baldur's Gate 3)
- Examine: "Examine / Pin Tooltip" on "T". https://bg3.wiki/wiki/Controls ; tooltip delay "now 200 milliseconds" (Patch 2). https://www.shacknews.com/article/136870/baldurs-gate-3-patch-2-notes (Baldur's Gate 3)
- Undo/override: none for resolved rolls; only "Cancel End Turn". Log line format and hover breakdown: unverified. Capture: a Larian video with the combat log expanded. Demand signal: "Better Combat Log 2" mod https://www.nexusmods.com/baldursgate3/mods/2212 (Baldur's Gate 3; page 403, unverified)

### Foundry VTT (core + dnd5e + midi-qol)

- Roll modes (core): "/publicroll" visible to all; "/gmroll" visible to "the player that rolled and any Game Master users"; "/blindroll" "only visible to Game Master users"; "/selfroll" only to the roller. https://foundryvtt.com/article/dice/
- DM override of visibility after the fact: right-click a private roll → "Reveal to Everyone"; public → "Make Private". Same URL.
- Receipts: chat is the ledger; GM can "delete individual messages" via the trash icon or clear the log; some systems let cards "be popped out into their own window". https://foundryvtt.com/article/chat/
- dnd5e damage application: chat-card context menu offers "Apply Healing" and "Apply Damage" (see failures section for the inverted-labels bug). https://github.com/foundryvtt/dnd5e/issues/5465
- Undo via chat (module): Damage Log adds a separate "Damage Log" chat tab; "Damage can easily be reverted or re-applied using the message's right click menu"; by default "only the GM can see the damage log". https://foundryvtt.com/packages/damage-log
- Automation (midi-qol): "Supports undo/redo operations from the damage card." (13.0.35); card "shows each target on a single line with color-coded icons"; multiplier dropdown "previews damage to be applied" (13.0.33); "choose which rolls will be fastforwarded by default" per role (13.0.43); players not "allowed to see the formula ... can't see the attack advantage attribution" (13.0.40); reaction prompt dialog exists, copy unverified (13.0.51). https://gitlab.com/tposney/midi-qol/raw/master/Changelog.md

### Roll20

- Hidden rolls: "/gmroll" whispers the result to the GM; "/w gm" before a roll template whispers the whole card. https://wiki.roll20.net/Text_Chat and https://wiki.roll20.net/Roll_Templates (snippets)
- Receipts: roll templates are the card format; 5e template carries crit fields such as `{{crit1=crit1}}`. https://wiki.roll20.net/D&D_5E_by_Roll20/Roll_Templates (snippet). No documented roll undo. Capture: https://wiki.roll20.net/Roll_Templates

### D&D Beyond

- Visibility choices per roll: "Everyone", "Self", "Dungeon Master"; chosen by right-click on a rollable box, the dice toolbar, or the Game Log default dropdown (2021-06-02). https://www.dndbeyond.com/old-changelog/1013-keep-your-rolls-secret
- Defaults: players default to Everyone and the DM to Self; long-press/right-click opens the target menu. https://www.dndbeyond.com/forums/d-d-beyond-general/bugs-support/135546-make-dice-roll-privately-by-default-for-dm (community)
- Receipts: Game Log lines show "what action ... rolled, the result of the roll plus any modifiers" and the dice set. https://www.dndbeyond.com/posts/939-share-your-dice-results-with-the-brand-new-game
- DM override of HP: click a monster's HP box → "damage and heal, temp hp, and max hp override"; turn undo: "'Undo' rewinds the turn back to the previous creature." https://www.dndbeyond.com/posts/1135-tutorial-how-to-build-encounters-and-run-them-on-d
- Conditions: Maps "Condition Tracking" launched 2026-07-27; concentration and custom conditions "planned". https://www.dndbeyond.com/changelog — Encounters: "Concentration tracking is not supported" (2025-10-27, DDB forum 138200; community, labelled)

### Owlbear Rodeo (Rumble! extension)

- Hidden rolls: "changing the target of your messages to 'Self'"; whispers "/w". Receipts: chat "stored locally", "the log will be lost upon refresh". Safety buttons: "Raise Hand", "Appreciation", "Warning", "Stop". https://extensions.owlbear.rodeo/rumble

---

## (d) Map, fog, tokens, player view, TV/shared view

### Owlbear Rodeo

- Structure (2.0+): Room → Scene ("a new layer called a Scene ... on top of maps and tokens"); categories Characters / Props / Mounts / Attachments. https://blog.owlbear.rodeo/owlbear-rodeo-2-0-dev-log-2/
- Fog (manual) expert devices (2.2): "Quick Selection Brush", Alt/Option "Quick Cut/Uncut", Shift "Quick Join". https://blog.owlbear.rodeo/owlbear-rodeo-2-2-release-notes/
- Fog (dynamic, 2.3): "drag on any edge of a room to create a door", click to open/close; "Add Light" with range, angle, edge softness; tokens "get stopped by walls"; GPU-parallel processing is the stated budget. https://blog.owlbear.rodeo/owlbear-rodeo-2-3-release-week-day-3/
- Player view: players can use the Outliner, so "if there's anything you don't want them to see make sure you hide it" (hide = the disclosure primitive). https://blog.owlbear.rodeo/owlbear-rodeo-2-2-release-notes/
- GM-only naming (2.1): "GM only name field or add a description"; Tab/Enter/Arrow token navigation. https://blog.owlbear.rodeo/owlbear-rodeo-2-1-release-notes/
- Per-player secrets (extension): Smoke & Spectre — "display tokens that only specific players can see"; doors and windows ("dashed line"); "Trailing Fog". https://extensions.owlbear.rodeo/smoke

### Foundry VTT

- Token disclosure devices: Token HUD (right-click) exposes resource bars, "Status Effects", elevation, target toggle, "Toggle Combat". Resource-bar visibility ranges "Never Displayed" → "Always for Everyone". https://foundryvtt.com/article/tokens/
- Vision: "Vision Enabled", "Vision Range", "Vision Angle", "Vision Mode" (Basic, Darkvision, ...). Same URL.
- Fog: explored areas recorded per user; "Reset Fog of War" clears "for all Users. This includes any that are not currently connected." https://foundryvtt.com/article/lighting/
- Shortcuts: rotate Shift+WASD/arrows/wheel; Ctrl+click ruler waypoints; light right-click toggle, double-click edit. https://foundryvtt.com/article/tokens/
- The v13 turn marker on the map doubles as the player-facing "your turn" cue (job b).

### Roll20

- Dynamic Lighting is paid-tier ("Plus, Pro, and Elite"), updating "line of sight in real-time"; the Lighting Tool places lights, windows, doors. https://help.roll20.net/hc/en-us/articles/4403861702679-How-To-Set-Up-Dynamic-Lighting (snippet)
- GM layer hides tokens from players' map and tracker alike. https://bloghub.roll20.net/posts/tome-of-tips-turn-tracker/

### D&D Beyond (Maps)

- Hidden creatures "remain invisible until revealed"; DM can add/remove creatures mid-combat. https://arcaneeye.com/articles/dnd-beyonds-maps-vtt-gets-a-huge-upgrade-encounter-tracking/

### Baldur's Gate 3

- Shared/TV view n/a; camera options are the analogue (see job b); "Tactical Camera" on "O", Toggle HUD "F10". https://gamerant.com/baldurs-gate-3-best-hotkeys-most-important-bg3/ (Baldur's Gate 3)

---

## (e) Dice: in-app animation, physical-dice entry, shared trusted log

### Owlbear Rodeo (Dice extension, official)

- Structure: 3D physics roll synced "over the network so all connected players can see the roll in real-time"; others' trays appear "as a small preview in the bottom right". https://extensions.owlbear.rodeo/dice
- Hidden: "select the eye icon in the sidebar when making a roll." History: "the search glass icon". Advantage/bonus: "the +/- icon". No skip-animation or reduced-motion setting documented (unverified absence). Same URL.

### Foundry VTT

- Physical dice: core "Dice Configuration" lets each denomination be "fulfilled via digital dice rolling, manual input, or some other external service" (GoDice/Pixels named). https://foundryvtt.com/article/dice-advanced/ ; origin issue https://github.com/foundryvtt/foundryvtt/issues/9775
- Animation (module): Dice So Nice — "Every roll is rendered as a real dice throw on screen, with sounds, special effects"; "Special Effects" fire "animations, sounds, and Foundry macros" on conditions (crit hook). Speed/hide settings unverified (guide unfetchable). https://foundryvtt.com/packages/dice-so-nice ; physical-entry-with-animation module https://github.com/yonatankarp/manual-physical-dice-tray

### Roll20

- "/gmroll 1d20+5" — "a roll that only you and the GM can see". https://wiki.roll20.net/Text_Chat (snippet)
- Sound budget corroboration: Jukebox — GM sets per-track volume; each participant owns a "Master Music Volume Level" in "My Settings"; loop "not [for] circumstantial sound effects". https://help.roll20.net/hc/en-us/articles/360039178714-Jukebox (snippet)

### D&D Beyond

- Animated dice: "3D Dice on Maps" (2026-02-23); "Shared Dice" lets all participants "view dice rolls simultaneously"; 2026-03-11 users can "disable Shared Dice while keeping personal 3D dice". https://www.dndbeyond.com/changelog
- Monster rolls from stat blocks "directly into the Game Log" (subscriber gated). https://www.dndbeyond.com/posts/1135-tutorial-how-to-build-encounters-and-run-them-on-d
- Visibility targets Everyone / Self / Dungeon Master (job c). https://www.dndbeyond.com/old-changelog/1013-keep-your-rolls-secret

### Baldur's Gate 3

- Only "Karmic Dice" documented (job c); animation skip/speed unverified.

---

## (f) Rest automation

### Baldur's Gate 3

- Long rest: at camp, "costs 40 (80 in tactician or honour difficulty, ...) camp supplies", up to 120 in custom difficulty; restores "Hit points - all", "Spell slots - all", "Resources - all", both short rests. https://bg3.wiki/wiki/Long_Rest
- Graceful degradation: with insufficient supplies a partial rest restores "up to half of their maximum, rounded down" and "Short rests are not restored". Same URL.
- Short rest: two per long rest, no travel to camp; heals "up to half of their maximum, rounded down"; absent party members "do not benefit". Same URL. Hotkey Short Rest "Y". https://bg3.wiki/wiki/Controls

### Foundry VTT (dnd5e)

- Rest dialogs (PR #4743): "Auto Spend HD" shown "for all users ... in case players don't feel like rolling their own hit dice"; #4735 "Remove question-mark phrasing from Rest dialogs". https://github.com/foundryvtt/dnd5e/pull/4743
- Group rest: a chat message "automatically opens the appropriate rest dialog for each player", then updates with progress. https://github.com/foundryvtt/dnd5e/issues/5129 (issue thread; labelled). "New Day" checkbox label unverified.

### Roll20 (D&D 2024 sheet)

- "Short Rest" / "Long Rest" buttons open a modal; "Clicking a die icon rolls it in the chat, checks it off" and tallies under "Recover ## Hit Points"; HP "does not update until after the rest". https://help.roll20.net/hc/en-us/articles/30748164251287-Dungeons-Dragons-2024-Character-Sheet (snippet)

### D&D Beyond, Owlbear Rodeo

- DDB: rest automation lives on the character sheet, not in Encounters — not covered by fetched sources (unverified). OBR: none in core; extension territory (unverified).

---

## (g) "Resolve at the table": the manual path when automation cannot model something

- FVTT: initiative "directly editable in the Combatant Configuration panel"; "Clear Initiative"; HP by typing "+15"/"-10"; fulfilment "manual input" asks for the physical result; GM can delete any receipt message. https://foundryvtt.com/article/combat/; https://encounterlibrary.com/foundry-players-guide/combat-tracker/; https://foundryvtt.com/article/dice-advanced/; https://foundryvtt.com/article/chat/
- DDB Encounters: typed initiative and HP; HP box offers "max hp override"; "Undo" for turn order. https://www.dndbeyond.com/posts/1135-tutorial-how-to-build-encounters-and-run-them-on-d — Maps: initiative editable "directly within the active combat list". https://www.dndbeyond.com/changelog
- R20: turns can be added without a sheet ("Add Turn") and custom tracker items with arbitrary values/counters. https://bloghub.roll20.net/posts/tome-of-tips-turn-tracker/
- OBR: initiative is a number you "click on ... in the extension popover"; fog is hand-cut shapes; Rumble "Self" rolls for off-log arbitration. https://extensions.owlbear.rodeo/initiative-tracker; https://extensions.owlbear.rodeo/rumble
- BG3: only the reaction "Ask" prompt and "Cancel End Turn" are overridable (closed simulation). https://bg3.wiki/wiki/Reactions
- DMG tolerates imprecision: "It's OK if you have a few unspent XP left over." https://www.dndbeyond.com/posts/1901-creating-combat-encounters-using-the-new-dungeon

---

## Dominant pattern per job

(a) Prep — party (size × level) first, tier second, running remaining budget while adding monsters; saved encounters reopen via one "Run/Resume". DDB https://www.dndbeyond.com/posts/1135-tutorial-how-to-build-encounters-and-run-them-on-d ; K+FC https://www.dungeonsolvers.com/how-to-use-kobold-fight-club-for-encounter-planning/ ; DMG https://roll20.net/compendium/dnd5e/Rules:Plan%20Encounters?expansion=33359 . Rule: after any add/remove the tier label and remaining XP update in place, no confirm step.

(b) Initiative — one shared ordered list; GM owns "Next", players own only their own "End Turn"/initiative roll; the active row is mirrored on the map (marker/portrait/banner). FVTT https://foundryvtt.com/article/combat/ + https://foundryvtt.com/releases/13.332 ; BG3 https://www.shacknews.com/article/136870/baldurs-gate-3-patch-2-notes (Baldur's Gate 3) ; DDB Maps https://www.dndbeyond.com/posts/1841-roll-for-initiative-combat-tracking-comes-to-the . Rule: a player device names whose turn it is, and a player can end only their own turn.

(c) Resolution — append-only shared log; each roll is a card with visibility (public / GM / self), right-click reveal/hide, right-click apply/undo for HP. FVTT https://foundryvtt.com/article/dice/ + https://foundryvtt.com/packages/damage-log ; DDB https://www.dndbeyond.com/old-changelog/1013-keep-your-rolls-secret ; R20 https://wiki.roll20.net/Text_Chat (snippet). Rule: every resolved roll yields one line naming roller, action, total, modifiers; a hidden line can be revealed without re-rolling.

(d) Map/fog — hide/reveal is per-item (hidden flag, GM layer) plus manual fog shapes; dynamic vision is an add-on (paid tier, extension, module), never the only path. OBR https://blog.owlbear.rodeo/owlbear-rodeo-2-2-release-notes/ ; R20 https://bloghub.roll20.net/posts/tome-of-tips-turn-tracker/ ; FVTT https://foundryvtt.com/article/tokens/ . Rule: hiding a token removes it from the players' map and turn list in one action.

(e) Dice — 3D roll synced to all viewers, per-roll privacy toggle at roll time, physical entry writing to the same log. OBR https://extensions.owlbear.rodeo/dice ; DDB https://www.dndbeyond.com/changelog ; FVTT https://foundryvtt.com/article/dice-advanced/ . Rule: a typed result and an animated result differ in the log only by a source tag.

(f) Rest — a dialog showing cost/degradation up front, hit dice spent one click at a time, one summary line posted. BG3 https://bg3.wiki/wiki/Long_Rest ; FVTT dnd5e https://github.com/foundryvtt/dnd5e/pull/4743 ; R20 https://help.roll20.net/hc/en-us/articles/30748164251287-Dungeons-Dragons-2024-Character-Sheet (snippet). Rule: current HP does not change until the rest is confirmed.

(g) Manual path — every automated number is a plain editable field; every automated roll has a "type it" alternative. FVTT https://foundryvtt.com/article/combat/ ; DDB https://www.dndbeyond.com/posts/1135-tutorial-how-to-build-encounters-and-run-them-on-d ; OBR https://extensions.owlbear.rodeo/initiative-tracker . Rule: no combat value requires a roll to be set.

---

## Documented failures — do not copy

1. Inverted action labels on a receipt: dnd5e chat-card menu where "Apply Healing" deals damage and "Apply Damage" heals, defended as "a holdover". https://github.com/foundryvtt/dnd5e/issues/5465
2. Shipping a shared log without privacy: DDB Game Log launched with "no DM rolls, no hidden rolls" (user comments), patched two years later with Everyone/Self/DM. https://www.dndbeyond.com/posts/939-share-your-dice-results-with-the-brand-new-game ; https://www.dndbeyond.com/old-changelog/1013-keep-your-rolls-secret
3. Visibility defaults that surprise the DM: recurring "Players can see all my rolls!" threads. https://www.dndbeyond.com/forums/d-d-beyond-general/bugs-support/165130-players-can-see-all-my-rolls (community)
4. Removing a visibility option in a redesign: "New Digital Dice Roller missing Roll to Self". https://www.dndbeyond.com/forums/d-d-beyond-general/bugs-support/236955-new-digital-dice-roller-missing-roll-to-self (community)
5. Balancing math left on an old ruleset: DDB Encounter Builder still on 2014 tiers after the 2024 DMG, spawning browser extensions and "Will the Encounter Builder Ever be Updated Again?". https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/212428-will-the-encounter-builder-ever-be-updated-again (community)
6. A tracker with no way to act: DDB Maps launch where the DM "can't adjust a monster's Hit Points, see their stat block, or roll any dice". https://arcaneeye.com/articles/dnd-beyonds-maps-vtt-gets-a-huge-upgrade-encounter-tracking/
7. Fog that blocks the GM: TaleSpire's demo "blocks the GM's view" and "doesn't reveal in many cases when my creature can clearly see it". https://bouncyrock.com/news/articles/fog-of-war-how-janky-are-thee-let-me-count-the-ways
8. Non-durable receipts: Rumble chat "will be lost upon refresh". https://extensions.owlbear.rodeo/rumble
9. Turn signalling that omits the subject: BG3 needed a patch so the "Your Turn notification now lists which character's turn it is."; same patch fixed "cannot be selected to end turn". https://www.shacknews.com/article/136870/baldurs-gate-3-patch-2-notes (Baldur's Gate 3)
10. Undo that leaves residue: midi-qol "Undoing damage not always working" with third-party save handlers. https://gitlab.com/tposney/midi-qol/-/work_items/636
11. Question-phrased dialogs: dnd5e removed "question-mark phrasing from Rest dialogs" (#4735) — labels should be imperatives. https://github.com/foundryvtt/dnd5e/pull/4743

Open captures (403 to this agent): https://docs.owlbear.rodeo/docs/fog/ ; https://dndbeyond-support.wizards.com/hc/en-us/articles/46385444116372-Game-Log
