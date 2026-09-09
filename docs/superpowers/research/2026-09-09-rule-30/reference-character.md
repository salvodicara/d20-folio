# Reference products — character jobs (evidence file)

Compiled 2026-09-09 for the d20 Folio progressive-disclosure (rule 30) audit. Behaviour, flow,
information order and copy only — no visual or taste judgements. Every fact carries a URL;
"unverified" marks claims not confirmed against a primary source; "community" marks forum/guide
corroboration. "Capture:" names the exact URL to open for a screenshot (nothing downloaded).
`dndbeyond-support.wizards.com` and `help.roll20.net` block fetchers; read via browser pane.

Products in priority order: D&D Beyond (DDB) · Baldur's Gate 3 (BG3) · Foundry VTT dnd5e ·
Roll20 (D&D 2024 sheet, Charactermancer) · Owlbear Rodeo extensions · Pathbuilder 2e / Dicecloud v2
(corroboration only).

---

## (a) Reading a character sheet

**DDB.** Dark "Character Header" on top: Portrait, Name, Species, Class, Level, `Short Rest` /
`Long Rest`, a hammer-and-anvil "Go to builder" icon, Campaign Name with `Launch game`. Clicking
portrait/name opens the character menu: `Manage Character & Levels`, `Manage Experience`,
`Character Settings`, `Game Log`, `Change Sheet Appearance`, `Export to PDF`.
https://dndbeyond-support.wizards.com/hc/en-us/articles/7747193980820-Character-Header
Section order below the header: Abilities/Saves/Senses → Limited Use → Skills → Actions
(equipped weapons and spell attacks in one list) → Inventory → Spells → Speed/Defenses → Features &
Traits → Proficiencies & Training → Background → Notes → Extras. "Limited Use" collects every
ability with a reset condition "so your options are more visible", with `Short Rest`, `Long Rest`,
`Dawn` reset buttons. Actions/weapons open and offer `Customize`; spells "expand to display the
spell's details and quick-info such as the Save DC and type"; Defenses, Feats and Proficiencies
each have a `Manage …` sidebar. https://dndbeyond-support.wizards.com/hc/en-us/articles/7747193946388-Sheet-Sections
A per-stat calculation breakdown is not documented — unverified. Feedback: with Digital Dice on,
"your attack and damage will have a box around it"; right-click gives Advantage/Disadvantage/Flat
and Critical; shared 3D dice "appear everywhere for everyone at the table".
https://dndbeyond-support.wizards.com/hc/en-us/articles/7747201888404-Digital-Dice-How-to-roll-your-free-or-premium-Digital-Dice (snippet only) ·
https://dndbeyond-support.wizards.com/hc/en-us/articles/46494109625236-Where-can-I-roll-Shared-Dice
Capture: https://www.dndbeyond.com/My-Characters → any sheet (login).

**BG3.** The HUD is the reading surface: party portraits on the left; the selected character's
hotbar at the bottom with action economy, slot pips, and the concentration icon "displayed next to
the caster's main portrait" with an "X" to end it. https://bg3.wiki/wiki/Spells
A separate character-sheet panel (N key) carries Abilities / Proficiencies / Resistances / Notes
tabs — tab names only from a mod page, https://www.nexusmods.com/baldursgate3/mods/6458 (Baldur's Gate 3, community, unverified).
Each ability shows the score as "the big number", the bonus as "the little number" —
https://www.pcgamer.com/baldurs-gate-3-abilities-proficiency-and-skills/ (Baldur's Gate 3; paywalled, unverified).
Patch 8 fixed tooltips leaking "+ProficiencyBonus" in Character Creation and Level Up —
https://deltiasgaming.com/baldurs-gate-3-patch-8-all-ui-changes-explained/ (Baldur's Gate 3, community).
Capture: https://bg3.wiki/wiki/Spells.

**Foundry dnd5e (3.x/4.x).** Header + left sidebar + tabs `Details`, `Inventory`, `Features`,
`Spells`, `Effects`, plus `Biography`; a Favorites area bottom-left accepts drag-dropped Items,
Effects, Skills, Tools and Spell Slots. A Play/Edit toggle: Play shows "its current value", Edit
"the base value of an attribute" (stated purpose: stop Active Effects confusing the reader); Play
still allows HP edits, slot spending, attunement, effect toggles, checks. Every tab supports
"searching, filtering, grouping, & sorting"; Effects tab exposes condition toggles "when tokens
aren't available". https://github.com/foundryvtt/dnd5e/releases/tag/release-3.0.0
"Rich tooltips" on hover; "Ruletips" expand rules terms ("Spend less time wondering what
'three-quarters cover' means"). https://foundryvtt.com/article/dungeons-dragons-arrives/
Dark mode from 3.1.0. https://github.com/foundryvtt/dnd5e/releases/tag/release-3.1.0
Capture: https://foundryvtt.com/packages/dnd5e.

**Roll20 D&D 2024 sheet.** Fixed blocks above the fold: Character Info (Name & Pronouns, Species,
Class & Level, Background, Proficiency Bonus, XP, Inspiration, "Level Up"); Hit Points (Max /
Current / Temp, Hit Dice, Short/Long Rest, a heal/damage field between red and green heart
buttons, a Death Saves state); Ability Scores & Saves; AC/Speed; Skills; Defenses; Conditions;
Senses. Below: tabs `Combat` (Attack, Mastery, Effect, Action), `Spells`, `Inventory`,
`Features & Traits`, `Notes`, `About`. Numbers explain themselves: "The Armor Class dropdown
contains the breakdown of your AC score into base (10+currently equipped armor), Dex … and
Shield"; Max HP is not typed over — the cogwheel modal exposes `Other Max HP Bonus` / `Override
Max HP`; skills list ability + modifier with a proficiency circle. Every section has a cogwheel
settings modal; the Conditions modal gives each condition an on/off toggle and an expand toggle
whose text lists the modifiers it will apply. Labels: `Roll`, `Stabilize`, `Restore Full HP`,
`Restore 1 HP`; add = "a red plus symbol"; rows end with a chat-bubble button and an `I` edit
button. HP flips into Death Saves at 0 and back on `Stabilize`.
https://help.roll20.net/hc/en-us/articles/30748164251287-Dungeons-Dragons-2024-Character-Sheet
Rationale (UX write-up): old sheet "already pushed to its limits by the complexity of 5e"; new
"Beacon" rules engine treats a magic sword as "sword object + bonus object + damage object".
https://blog.roll20.net/posts/reimagining-roll20s-dd-character-sheet-for-2024/
Viewers without edit rights "see an error message on the Character Sheet tab, but can view the
Bio" — https://startplaying.games/blog/posts/how-to-use-roll20-one-dnd-2024-character-sheet (community).
Capture: https://pages.roll20.net/dnd2024.

**Owlbear Rodeo.** No native sheet. _Sheet from Beyond_: token context menu `Add Sheet` →
`Enter URL` → `View Sheet` opens a popover; only 4 of 10 listed hosts render (D&D Beyond, Shard,
Roll20, Demiplane) because others block iframes. https://extensions.owlbear.rodeo/sheet-from-beyond
_Owl Trackers_: up to twelve stats per token via right-click; inline math `+7`, `-7`, `=-7`; scene
defaults apply HP/Temp HP/AC "in a single click". https://extensions.owlbear.rodeo/owl-trackers ·
_DummySheet_: `EDIT`, `EXPORT`, `IMPORT` (JSON). https://extensions.owlbear.rodeo/dummysheet

**Corroboration.** Pathbuilder web menu: `Character` (`New`, `Save`, `Open`), `Connect` (`Connect
to GM`, `Launch GM Mode`), `Export` (`Character Sheet PDF`, `Stat Block PDF`, `Export JSON`, `Share
Copy of Character`), `Data` (`Backup/Restore`); first-run copy: "permission to save character
information and 3mb+ of data to your browser cache." https://pathbuilder2e.com/app.html ·
Dicecloud v2 tabs `Stats`, `Features`, `Inventory`, `Spells`, `Character`, `Tree`; Stats is where
you cast, rest and manage HP. https://github.com/NappingPiglet/dicecloud-v2-guide/blob/master/creating-your-first-character/the-stats-tab.md

---

## (b) Spell management

**DDB.** Spells section: manage slots, `Manage Spells` "to add known spells and to prepare
spells", and "view your prepared spells for table play" (Sheet Sections URL above). `MANAGE
SPELLS` loads every spell available by class/level; for wizards the sidebar has `Add Spells`,
`Prepared Spells`, `Spellbook`, and both Add Spells and Spellbook use `Learn` / `Delete`, so
"Delete" in the Spellbook means unprepare; subclass spells are "always prepared"; duplicate
cantrips are not flagged; upcast display cannot be toggled from the sheet.
https://whatdoiknowknighterrantjr.wordpress.com/2025/04/15/demystifying-spellcasters-in-dd-beyond/
Casting: click `Cast`, "choose which level slot to use and it automatically spends the slot" —
community, https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/195412-prepared-spells-and-spell-slots
Builder Home: `Show Level-Scaled Spells` "to display and highlight available spells to cast with
higher level spell slots". https://dndbeyond-support.wizards.com/hc/en-us/articles/7747202748436-Builder-Sections
Rest: header `Short Rest` / `Long Rest` open a window "to track Hit Dice and reset Limited Use
abilities" (Character Header URL). Concentration marker: unverified.

**BG3.** Prepared count = "spellcasting ability modifier + class level (minimum of 1)"; change "at
any time except during combat"; racial/feature spells "are always prepared and do not count"; a
spell "always counts as the level of the slot used"; concentration breaks on damage (CON save DC
10 or half damage), Downed, long rest; "Depleted spell slots are generally replenished by taking a
long rest", Warlocks on short rest. https://bg3.wiki/wiki/Spells
Spellbook opens with K; `Prepare Spells` at the top; prepared spells sit in the top row "beside
the spellcasting book symbol" and "Only the spells in this row can be cast" —
https://www.thegamer.com/baldurs-gate-3-prepare-spells/ (Baldur's Gate 3, community).
`Prepare Spells` is also a step "on the left sidebar of your level-up screen" —
https://www.dualshockers.com/baldurs-gate-3-prepare-spells/ (Baldur's Gate 3, community).

**Foundry dnd5e.** Spells tab with "spell slot display" by level, property filters,
active/passive or source grouping (3.0.0 URL). 4.0 shows "the number of spells a character has
prepared on the spells tab, and how many total preparations they have", tracks the source class
per spell, shows which spell lists a spell is on, and auto-generates a free-cast activity for
advancement-granted spells; activities can "have multiple recovery profiles".
https://github.com/foundryvtt/dnd5e/releases/tag/release-4.0.0
3.1 automates concentration: status on cast, a warning "when attempting to cast another
concentration spell while already concentrating", automatic saves on damage, a manual save
button, opt-out in settings. https://github.com/foundryvtt/dnd5e/releases/tag/release-3.1.0

**Roll20 2024.** Top of Spells tab: Spell Save DC, casting attribute, spell attack bonus; then
search, level-sort dropdown and a view toggle for "list view, spell slot view"; level banners with
"empty red check-boxes" = slots. Clicking a row or `I` opens "the Cast modal, which will allow you
to select options (such as the spell slot level you are casting at)"; the chat bubble sends only the
description; `Short Rest` / `Long Rest` modals apply effects. (2024 sheet help URL above.)
`Manage` button "swap spells or … add spell slots" (StartPlaying, community). Concentration: unverified.

**Corroboration.** Dicecloud cast dialog: "the red flame icon next to a spell slot level" opens
"slot levels on the left and spells on the right"; a lower spell with a higher slot is upcast.
Preparation mode swaps drag handles for checkboxes: filled = prepared, empty = unprepared, greyed =
always prepared; it auto-opens "after leveling up".
https://github.com/NappingPiglet/dicecloud-v2-guide/blob/master/creating-your-first-character/the-spells-tab.md

---

## (c) Inventory and equipment

**DDB.** Inventory has tabs `My Inventory` / `Party Inventory`; add, equip and attune in the list
and in the `Manage Inventory` window; encumbrance, other possessions and currency live here (Sheet
Sections URL). Builder Home: `Encumbrance Type`, `Ignore Coin Weight` (Builder Sections URL).
Party Inventory appears only for "a player with an active character in a campaign"; add from
`Add Items` in Manage Inventory or move from My Inventory into it or any container; anyone can
equip from it; "Items display if they are equipped and by which character"; move/delete allowed
"as long as they are not equipped to another player's character"; campaign-name button (top-left)
opens the campaign sidebar; currency button (top-right) manages shared coin; `Put Coins in
Containers` setting in the `Manage Coin` sidebar; DMs can delete any item to unstick items of
removed players; Artificer infused items can be placed but not taken by others.
https://dndbeyond-support.wizards.com/hc/en-us/articles/40964522619540-Shared-Party-Inventory-FAQ
Launch copy: "Who's carrying the gem again?"; items there don't count toward capacity unless
equipped. https://www.dndbeyond.com/posts/2050-new-party-inventory-hoard-treasure-together-on
No direct character-to-character transfer: "delete the item from one character sheet, and the
player in question goes onto their sheet and adds said item" — community,
https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/142248-how-to-handle-group-treasure-and-equipment
Capture: sheet → Inventory → `Party Inventory` (campaign character required).

**BG3.** Per-character inventory (I) with equipment slots and a grid; Tab opens all party
inventories at once; drag onto a portrait to hand over; Ctrl-click multi-select then right-click;
Shift-click range select. https://deltiasgaming.com/baldurs-gate-3-inventory-guide-how-to-transfer-items/ (Baldur's Gate 3, community) ·
https://www.gamepur.com/guides/baldurs-gate-3-inventory-management-multiple-select-search-chest-of-mundane-more (Baldur's Gate 3, community)
Party storage = the Traveller's Chest; right-click `Send to Camp` "from anywhere"; camp supplies
and gold usable from it, which "saves weight in the party member's inventories"; multiplayer gives
each player a colour-coded private chest. https://bg3.wiki/wiki/Traveller's_Chest
Containers: bags/pouches in inventories; auto-sorting Camp Supply Sack, Alchemy Pouch, Keychain.
https://bg3.wiki/wiki/Containers · Weight: capacity 40 + 10×STR kg; `Encumbered` above 80 %,
`Heavily Encumbered` above 93.33 %, shown as conditions with movement penalties.
https://bg3.wiki/wiki/Carrying_capacity · https://bg3.wiki/wiki/Encumbered_(Condition)
Capture: https://bg3.wiki/wiki/Traveller's_Chest.

**Foundry dnd5e.** Inventory tab: grouped/ungrouped toggle, search/filter, manual or alphabetical
sort, "native container support" nested "up to five layers deep", an encumbrance bar; Play mode
handles equip and attunement (3.0.0 URL). 4.0 adds "numeric capacity values to container item
sheets" (4.0.0 URL). Adding items: drag from sidebar/compendium; `Open Compendium Browser` offers
Standard/Advanced modes, multi-pack search, filter by source, and a locked mode for constrained
picks. https://github.com/foundryvtt/dnd5e/wiki/Compendium-Browser
Party inventory on the Group actor: not documented here — unverified.

**Roll20 2024.** Inventory tab header: money, carried weight and "what level of encumbrance";
subsections `Equipment` (toggle equips "including mechanical effects"), `Attunement` (toggle
occupies a slot; slots and occupants shown), `Other Possessions`; red plus to add; cogwheel for
Items settings (2024 sheet help URL). "When equipped and attuned any effects will automatically be
applied" — https://blog.roll20.net/posts/dd-character-sheet-takes-a-level-combat-spells-inventory/
Containers, transfer, party inventory: not documented — unverified.

**Corroboration.** Dicecloud: containers `Carried` and `Equipped`; only Equipped items surface
attacks on Stats. https://github.com/NappingPiglet/dicecloud-v2-guide/blob/master/creating-your-first-character/the-inventory-tab.md

---

## (d) Level-up and growth

**DDB.** XP mode: a bar under the portrait fills; "you'll see a little arrow next to your
Character Level indicating whether you need to level up or down"; nothing changes until Manage
Levels — community, https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/5470-how-do-i-track-experience-points-on-my-character
Menu: `Manage Character & Levels` (builder) and `Manage Experience` (XP or Milestone) — Character
Header URL. In the builder `Class` tab raise the `Level` dropdown; "things that require your
attention will be marked with an icon (!)"; `Add Another Class` for multiclass; HP auto-adds only
with Hit Point Type `Fixed`. https://dndbeyond-support.wizards.com/hc/en-us/articles/7747193953556-Miscellaneous-Features ·
community: https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/52276-level-up-what-needs-to-be-done
No "what you gain" preview or celebration documented — unverified. Respec = edit any level or
choice in the builder at will ("change your class Level, including making multiclass choices",
Builder Sections URL). Capture: builder → Class tab (login).

**BG3.** Signal: "a big yellow up-arrow next to your character" and the text 'Level Up' by the
portrait — https://www.gameleap.com/articles/baldurs-gate-3-how-to-level-up-and-farming-experience (Baldur's Gate 3, community).
Screen: a left sidebar of clickable step circles that vary by class/level (class, subclass, spells,
feats, `Prepare Spells`); it "shows incoming benefits such as health point increases, new unlocked
abilities, additional spells"; multiclass toggle top right; "Just be sure to click on each
circle"; choices are final without respec — https://eip.gg/bg3/guides/how-to-level-up/ (Baldur's Gate 3, community).
`Add Class` button on the Level Up screen; multiclass unavailable on Explorer difficulty.
https://bg3.wiki/wiki/Classes · Capture: https://bg3.wiki/wiki/File:Add_Class_Button_Location.png
Respec (Withers): "100 gold pieces … The price of the service DOES NOT increase"; resets to level
1; class, subclass, abilities, spells change; race/subrace/background do not; unlimited uses;
Oathbreakers restore the oath first; scroll-learned wizard spells persist.
https://baldursgate3.wiki.fextralife.com/Respec (Baldur's Gate 3 wiki) ·
https://www.gamespot.com/articles/baldurs-gate-3-respec-change-class-guide/1100-6516514/ (Baldur's Gate 3)

**Foundry dnd5e Advancement.** Trigger: drag a class item onto Features, or raise the class level
dropdown. Sequential dialog: Hit Points first (roll or average), then each advancement (Item
Grant, Item Choice, Scale Value, ASI, Size, Trait, Subclass); clicking a feature name previews
what will be added; optional items have checkboxes; `Next`, `Restart`, `Continue`, `Complete`.
Lowering a level opens a confirmation with a checked-by-default "remove granted items" toggle.
World setting `Disable level-up automation`. "Manual changes made during advancement are reverted
upon workflow completion." https://github.com/foundryvtt/dnd5e/wiki/Advancement-User-Guide
4.0: "Show a prompt on the character sheet if a character qualifies for a subclass" (4.0.0 URL).

**Roll20.** 2024 sheet: "Automated Level Up functionality" shipped 2024-10-11 with Starting
Equipment; earlier characters "will require choices to be remade when leveling up: including Class,
Species, Background, and Ability Scores" — recreate from scratch, "a one time occurance".
https://blog.roll20.net/posts/dd-character-builder-level-up-release/ ·
https://help.roll20.net/hc/en-us/articles/26981852690583-D-D-2024-Level-Up-Limitations (redirects to sign-in; wording via search snippet — partially unverified)
Charactermancer (2014 sheet): sheet gear → `Launch Charactermancer`; slides Welcome, Race, Class,
Abilities, Background, Equipment, Spells, Feats, Bio, Review; `Back` / `Next` / `Back to Top`;
`Cancel` → `Discard and Exit` / `Save and Exit` / `Continue Charactermancer`; `Apply Changes` only on
Review once all required fields are filled, and "all of your existing character sheet data will be
overwritten"; only a fixed feat list is supported.
https://help.roll20.net/hc/en-us/articles/360039644133-D-D-5e-Charactermancer

**Corroboration.** Dicecloud level-up is the slot interface: "+ button under the heading" →
choose → `Insert`. https://github.com/NappingPiglet/dicecloud-v2-guide/blob/master/creating-your-first-character/character-creation-101.md

---

## (e) Character roster / "my characters" home

**DDB.** `My Characters` lists all characters; shows "how many Characters and Character Slots you
have"; search by Name, Level, Class, Species, Campaign; per-card `View`, `Edit`, `Copy`, `Delete`,
`Leave Campaign`; sort Created / Name / Level / Modified; "Download a blank character sheet"; a
builder character is "Sheet Ready" only once Class, Background, Species and Ability Scores exist
(icon grey → white). (Miscellaneous Features URL.) Free tier 6 slots; lapsed subscribers pick 6 to
keep — community, https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/22899-limited-character-slots
Creation methods: `Standard` (help-text toggle), `Quickbuilder` (Class → Species → Background →
Ability Scores → Name; "All random"; 5E/5.5E toggle; "Lead with iconic D&D art, not walls of text
and rules details"), `Premade` (`Claim Character`).
https://dndbeyond-support.wizards.com/hc/en-us/articles/7747193997716-Character-Creation-Methods ·
https://www.dndbeyond.com/posts/2135-behind-the-screen-the-new-quickbuilder-and-future
Capture: https://www.dndbeyond.com/My-Characters

**BG3.** No roster; the portrait column is home; Tab shows all inventories (c).
**Foundry.** Actors directory; right-click `Export Data` / `Import Data`. https://foundryvtt.com/article/actors/
**Roll20.** Game Journal plus account-level "Roll20 Characters"; unlinked characters "can import
them into the game from Roll20 Characters at any time".
https://help.roll20.net/hc/en-us/articles/24850190801559-Play-with-Both-D-D-5E-Character-Sheets-in-Your-Game
**Pathbuilder.** `Open` / `Save` / `New Character`, browser storage, `Backup/Restore` (app URL).
**Dicecloud.** "Characters tab and select the + button" (creation-101 URL).

---

## (f) Print / PDF and share / public sheet

**DDB.** Two PDF entry points: builder `What's Next`, and "Click Manage near the character's name
… Export to PDF is at the bottom"; output is "a form-fillable PDF" editable before printing.
https://dndbeyond-support.wizards.com/hc/en-us/articles/7747238449556-Export-Sheet
Failures: stale data until cache reset; blank in some viewers — community,
https://www.dndbeyond.com/forums/d-d-beyond-general/bugs-support/169920-changes-to-character-sheet-not-updating-to-pdf ·
https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/161673-export-to-pdf
Privacy: `Character Privacy` in builder Home = Private / Campaign Only / Public; only Public shows
a share button; "DMs can see any player's Character Sheet"; a Private character still lists
name/level/class on the campaign page. Builder Sections URL ·
https://dndbeyond-support.wizards.com/hc/en-us/articles/48753192328852-Can-other-players-see-my-character-sheet (snippet only) ·
community: https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/180046-character-sheets-how-to-generate-a-share-link
"Campaign share" is content entitlement, not sheets: `Enable Content Sharing` → `Confirm` → "You
have enabled Content Sharing in this campaign". https://dndbeyond-support.wizards.com/hc/en-us/articles/7747210355604-Campaign-Content-Sharing-and-You
**BG3.** No print or public sheet.
**Foundry.** `Export Data` to JSON; visibility via actor ownership. https://foundryvtt.com/article/actors/
**Roll20.** Bio readable without edit rights (StartPlaying, community); sheet-URL sharing
"depends on your subscription level" (Sheet from Beyond URL); native PDF: unverified.
**Pathbuilder.** `Character Sheet PDF`, `Stat Block PDF`, `Share Copy of Character`, `Connect to GM` (app URL).

---

## (g) Importing a character

**DDB.** No import: "You need to use their character builder tool"; join a campaign "with
existing character" or `Copy` — community, https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/87798-importing-character-sheets-from-previous-game
DDB is an export source: World Anvil imports by the character ID in the URL.
https://www.worldanvil.com/w/WorldAnvilCodex/a/dndbeyond
**Foundry.** Core right-click `Import Data` (JSON overwrites the actor); bug: importing an NPC JSON
into a Character fails while reporting success. https://github.com/foundryvtt/foundryvtt/issues/12372
DDB Importer: "Import your DDB characters into Foundry, and sync changes back!"; needs the
`CobaltSession` cookie ("this is like handing out a password"); Patreon tier syncs changes back.
https://github.com/MrPrimate/ddb-importer
**Roll20.** 2014→2024 conversion "not yet available, but it's coming soon!"; both sheets can
coexist and `+ Character` prompts for a sheet type; removing a sheet archives its characters and
hides tokens (Play-with-Both URL). Charactermancer `Custom` ability entry "if you are transferring
a character from a different character creation session" (Charactermancer URL).
**BG3.** No import; Withers respec is the migration path (d).
**Pathbuilder.** `Export JSON`; `Backup/Restore` (app URL). **Owlbear DummySheet.** `IMPORT` / `EXPORT` JSON.

---

## Dominant pattern per job

1. **Reading — fixed identity/HP header, then core numbers, then tabs; every derived number opens
   its own breakdown.** DDB Character Header; Roll20 AC dropdown + per-section cogwheel modals;
   Foundry Play/Edit + tooltips. https://dndbeyond-support.wizards.com/hc/en-us/articles/7747193980820-Character-Header ·
   https://help.roll20.net/hc/en-us/articles/30748164251287-Dungeons-Dragons-2024-Character-Sheet ·
   https://github.com/foundryvtt/dnd5e/releases/tag/release-3.0.0
   Rule: any displayed total is openable to its contributors without leaving the sheet.
2. **Spells — prepared list is the play surface, full list one step away, casting asks the slot
   level.** BG3 prepared row vs spellbook; Roll20 Cast modal; Dicecloud two-panel dialog.
   https://bg3.wiki/wiki/Spells · Roll20 URL above ·
   https://github.com/NappingPiglet/dicecloud-v2-guide/blob/master/creating-your-first-character/the-spells-tab.md
   Rule: default spells view shows only castable spells; cast offers slot level and decrements it.
3. **Inventory — equip/attune are row toggles with mechanical effect; shared storage is a
   separate tab that adds no weight until equipped.** DDB Party Inventory; BG3 Traveller's Chest;
   Roll20 Equipment/Attunement/Other. https://dndbeyond-support.wizards.com/hc/en-us/articles/40964522619540-Shared-Party-Inventory-FAQ ·
   https://bg3.wiki/wiki/Traveller's_Chest · Roll20 URL above
   Rule: one-click equip/attune on the row; party storage reachable from the own inventory and
   shows who holds each item.
4. **Level-up — a persistent "level up available" signal, then a stepper that flags every
   unfinished choice.** BG3 arrow + step circles; DDB (!) markers; Foundry sequential dialog.
   https://eip.gg/bg3/guides/how-to-level-up/ (Baldur's Gate 3) ·
   https://dndbeyond-support.wizards.com/hc/en-us/articles/7747193953556-Miscellaneous-Features ·
   https://github.com/foundryvtt/dnd5e/wiki/Advancement-User-Guide
   Rule: level-up cannot complete while a required choice is unmade; each pending choice is marked.
5. **Roster — list with search, sort, per-card View/Edit/Copy/Delete, explicit slot count.** DDB
   My Characters; Roll20 Characters; Pathbuilder Open/Save (URLs in e).
   Rule: create, open, copy, delete and campaign membership are reachable without opening a sheet.
6. **Print/share — PDF from the sheet's own menu; visibility is a three-state setting.** DDB;
   Pathbuilder (URLs in f). Rule: export and privacy share one menu; privacy defaults non-public.
7. **Import — JSON in/out is the interchange; rich platforms import by ID/link.** Foundry Import
   Data + DDB Importer; Pathbuilder JSON; World Anvil by ID (URLs in g).
   Rule: offer JSON export before import; import overwrites only after explicit confirm.

## Documented failures — do not copy

- Roll20 2024: pre-release characters "require choices to be remade … Class, Species, Background,
  and Ability Scores"; official advice is to rebuild. https://blog.roll20.net/posts/dd-character-builder-level-up-release/
- Roll20 Charactermancer `Apply Changes`: "all of your existing character sheet data will be
  overwritten" at the end of a long wizard. https://help.roll20.net/hc/en-us/articles/360039644133-D-D-5e-Charactermancer
- Roll20 2014→2024 conversion "not yet available"; removing a secondary sheet archives its
  characters. https://help.roll20.net/hc/en-us/articles/24850190801559-Play-with-Both-D-D-5E-Character-Sheets-in-Your-Game
- DDB wizard spells: `Learn`/`Delete` reused for prepare/unprepare; duplicate cantrips unflagged;
  upcast display only toggleable in the builder. https://whatdoiknowknighterrantjr.wordpress.com/2025/04/15/demystifying-spellcasters-in-dd-beyond/
- DDB Party Inventory items get "stuck" when the equipping player leaves; DM-only delete added.
  https://dndbeyond-support.wizards.com/hc/en-us/articles/40964522619540-Shared-Party-Inventory-FAQ
- DDB PDF export serves stale data until cache reset; blank in some viewers (community, f).
- DDB has no character-to-character transfer and no import (community, c and g).
- DDB level-up: HP silently does not increase when Hit Point Type is `Manual` (community, d).
- Foundry Advancement: "Manual changes made during advancement are reverted upon workflow
  completion." https://github.com/foundryvtt/dnd5e/wiki/Advancement-User-Guide
- Foundry core: mismatched actor JSON import fails but reports success. https://github.com/foundryvtt/foundryvtt/issues/12372
- BG3: bag sorting "doesn't stay consistent" (community, via search); companions' inventories
  unreachable outside the party until Patch 5 — https://www.gamesradar.com/baldurs-gate-3-patch-5s-best-change-is-the-inventory-fix-that-weve-been-waiting-for-since-launch/ (Baldur's Gate 3; body truncated on fetch);
  story items auto-jumped on dismissal until reverted: "Companions will no longer transfer story
  items" — https://www.pcgamesn.com/baldurs-gate-3/inventory-bg3-patch (Baldur's Gate 3).
- BG3 tooltips leaked "+ProficiencyBonus" until Patch 8. https://deltiasgaming.com/baldurs-gate-3-patch-8-all-ui-changes-explained/ (Baldur's Gate 3, community)
- Owlbear Sheet from Beyond: most sheet hosts refuse iframes; 4 of 10 render. https://extensions.owlbear.rodeo/sheet-from-beyond
- Pathbuilder web keeps characters in browser cache; loss on clear unless `Backup/Restore`. https://pathbuilder2e.com/app.html
