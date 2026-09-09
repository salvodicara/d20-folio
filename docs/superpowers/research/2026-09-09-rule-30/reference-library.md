# Reference library — compendium lookup, homebrew authoring, sharing, browsing, import/export

Evidence file for the d20 Folio PD rule-30 audit. Compiled 2026-09-09 from official help centres, product docs, wikis, release notes and (labelled) community threads. Behaviour, flow, order and copy only; no visual or taste judgements. Quoted labels are verbatim and under 15 words. "unverified" marks claims not read from a primary source. "Capture:" names the exact URL to screenshot; no art was pasted or downloaded.

Method: D&D Beyond support, Roll20 Help Center and docs.owlbear.rodeo were read in a browser session (they refuse plain fetches). wiki.tercept.net (5etools wiki) and wiki.roll20.net were blocked (JS render / bot wall); facts from them rest on search snippets and the 5etools homebrew repository README and are labelled. Jobs: (a) lookup mid-session, (b) authoring, (c) sharing, (d) browsing mine / shared / official, (e) import/export.

---

## 1. D&D Beyond

### (a) Lookup mid-session

- Spells listing: search field "Spell Name"; filters Class, Spell Level, Spell School, Spell Tags, Casting Time, Components (V/S/M Yes/No), Concentration, Ritual, Save/Attack, Damage Types, Conditions, Sources; toggles "Show Advanced Filters", "Reset All Filters". Rows: level, name (link), school + components, casting time, duration, range/area, attack/save, damage/effect; "Next" pagination. https://www.dndbeyond.com/spells
- Monsters listing: search "Monster Name"; filters Challenge Range, Size, Habitat, Alignment, Armor Class Range, Average Hit Points Range, Senses, Save/Skill Proficiencies, Legendary/Mythic, Lair, Damage Resistances/Immunities/Vulnerabilities, Condition Immunities, Languages, Movement Types, Monster Tags, Source Category, Source; header "Create A Monster" and "Browse Homebrew". Rows: CR, name, source, type, size, alignment, tags. https://www.dndbeyond.com/monsters
- Rules glossary (2024): alphabetical "Term [Tag]" entries with definition and optional "See also"; tags "[Action]", "[Area of Effect]", "[Attitude]", "[Condition]", "[Hazard]"; every term anchored for deep links; abbreviations table first. https://www.dndbeyond.com/sources/dnd/free-rules/rules-glossary
- Inline tooltips: homebrew text embeds `[condition]…[/condition]`, `[spell]…[/spell]`, `[skill]…[/skill]`, `[wprop]…[/wprop]` — the same tooltip system the compendium uses. https://www.dndbeyond.com/posts/1169-how-to-create-a-homebrew-spell-using-d-d-beyond
- Expert shortcut: filtered listings are URL-addressable and bookmarkable (community). https://www.dndbeyond.com/forums/d-d-beyond-general/bugs-support/47831-filter-search-is-there-anyway-to-cut-and-paste
- EN/IT: the Italian core rulebook is a compendium-only purchase; "I tooltip saranno in Inglese anche se il Compendio è in Italiano"; sheets, spell lists, classes, monsters stay English. https://www.dndbeyond.com/it/italian-translation ; https://www.dndbeyond.com/old-changelog/651-italian-players-handbook-compendium-only
- Capture: https://www.dndbeyond.com/spells (filter bar); https://www.dndbeyond.com/sources/dnd/free-rules/rules-glossary (one "[Condition]" entry).

### (b) Authoring

- Families: Backgrounds, Feats, Magic Items, Monsters, Species, Spells, Subclasses; no classes. https://dndbeyond-support.wizards.com/hc/en-us/articles/7747238519700-Homebrew-Creation-and-Collection-Basics ; https://dndbeyond-support.wizards.com/hc/en-us/articles/14175512652308-No-Homebrew-Classes
- Hub copy per family: "View the homebrew [type] that users around the world have created and shared, or create your own." with buttons "View Homebrew [Type]" / "Create Homebrew [Type]"; persistent "View My Homebrew Collection" / "View My Homebrew Creations". https://www.dndbeyond.com/homebrew
- Entry points (three, all families): "Collections" menu → "Create Spell"; "My Homebrew Creations" → "Create a…" → type; the official listing → "Create a Spell" / "+ Create a Monster". https://www.dndbeyond.com/posts/1140-tutorial-how-to-homebrew-monsters-on-d-d-beyond
- First screen = template choice: spell "Use an existing spell" vs "Create From Scratch"; magic item "Use an existing item as a template" vs from scratch; monster "Create from Scratch" vs existing monster; species "Create Race" / "Create Subrace" / "Create Variant". https://www.dndbeyond.com/posts/1169-how-to-create-a-homebrew-spell-using-d-d-beyond ; https://www.dndbeyond.com/posts/1103-how-to-create-a-homebrew-magic-item-using-d-d ; https://www.dndbeyond.com/posts/1182-how-to-create-a-homebrew-race-using-d-d-beyond
- Template rights: only free content, owned content and your own homebrew (not subclasses, subraces, variant races); sharing does not grant them ("you need to own that content yourself and content sharing does not provide access to it"); other users' homebrew never ("to avoid players 'stealing' someone else's homebrew"). https://dndbeyond-support.wizards.com/hc/en-us/articles/14175429918612-Unable-to-Use-Existing-Template ; https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/130004-how-to-make-a-copy-of-another-persons-homebrew
- Two-stage editor: "Basic Information" → "Create Spell" / "Create Magic Item" / "Create monster" / "Create Race" / "Create Subclass" saves and unlocks mechanics; later "Save Changes". Spell order: name, version, level, school, casting time, components, range, duration, description, ritual, "At Higher Levels Scaling", "Available for Classes"; post-save "Additional Information", "Modifiers", "Conditions", "At Higher Levels". Magic item: name + version, rarity, base type (Item/Armor/Weapon, conditional fields), "Requires Attunement", description; post-save "Additional Information", "Modifiers", "Conditions", "Spells". Monster: General Information → Special Traits → Actions → Reactions → Characteristics → Bonus Actions → Legendary/Mythic (toggle) → Lair. Subclass: "Add a Class Feature" (level, text, "Has Options", "Actions"). Sources as above plus https://www.dndbeyond.com/posts/845-new-players-guide-how-to-homebrew-on-d-d-beyond
- Validation: a species must carry Ability Score Increases, Languages, Creature Type, Size, Speed; subclass features must sit at the class's gap levels to be publishable. https://www.dndbeyond.com/posts/1182-how-to-create-a-homebrew-race-using-d-d-beyond ; https://dndbeyond-support.wizards.com/hc/en-us/articles/7747240870036-Making-Homebrew-Subclasses-Publishable
- Versions: "Version" field; published items edited via "Create New Version" → unpublished copy labelled "Private, Never Submitted"; all versions grouped in one public entry with history at the bottom; characters keep old versions. https://www.dndbeyond.com/posts/1104-same-vision-new-version-updating-published
- Tone: imperative verbs ("Create", "Save Changes", "Add to Collection", "Publish", "Share with community"). Warning: "Once you publish homebrew material it cannot be undone." https://dndbeyond-support.wizards.com/hc/en-us/articles/14175427969428-Deleting-Published-Homebrew-Content
- Capture: https://www.dndbeyond.com/homebrew/creations/create-spell (template screen; owner login).

### (c) Sharing

- Automatic by membership: everything in "My Homebrew Collection" is available to every character in every campaign the user is in; "Any players who have joined a campaign with homebrew materials will be able to see and utilize it." No publish needed. https://dndbeyond-support.wizards.com/hc/en-us/articles/7747210455828-Sharing-and-Publishing-Homebrew-Content
- Three preconditions: item in Collection (not just Creations); character in the campaign and "Active"; character's "Homebrew Content" toggle on. https://dndbeyond-support.wizards.com/hc/en-us/articles/7747210355604-Campaign-Content-Sharing-and-You ; https://www.dndbeyond.com/forums/dungeons-dragons-discussion/homebrew-house-rules/79401-how-do-i-share-homebrew-items-with-people-without
- Purchased content is a separate switch: "Enable Content Sharing" → "Confirm" → "You have enabled Content Sharing in this campaign" + "Disable Content Sharing" / "Content Management"; Master Tier, 5 campaigns, 12 players. https://dndbeyond-support.wizards.com/hc/en-us/articles/7747210355604-Campaign-Content-Sharing-and-You
- Live links: characters reference the element; removal from a collection leaves it on characters already using it (community). Revocation: "Remove From Collection" only; no per-campaign scope, no DM veto ("There is not at this time"). https://dndbeyond-support.wizards.com/hc/en-us/articles/7747238519700-Homebrew-Creation-and-Collection-Basics ; https://www.dndbeyond.com/forums/d-d-beyond-general/bugs-support/48893-removed-homebrew-spells-stay-in-campaign
- Public publish: entry → "Publish" → moderation queue → listing; rejected items can be edited and resubmitted; published items cannot be edited or removed. "You do NOT need to publish your homebrew publically in order to use or share any of it within your own campaign." https://www.dndbeyond.com/homebrew-rules-guidelines
- Maps VTT: all players' shared content shows; only Master Tier DMs use their own homebrew monsters there. https://dndbeyond-support.wizards.com/hc/en-us/articles/46363811293332-Can-I-access-and-use-content-shared-by-other-players-in-the-campaign

### (d) Browsing

- "My Homebrew Creations" (all I made, with status such as "Private, Never Submitted") vs "My Homebrew Collection" (mine + public homebrew I added = the shared set); public listings per family. https://dndbeyond-support.wizards.com/hc/en-us/articles/7747238519700-Homebrew-Creation-and-Collection-Basics
- Public homebrew rows add author, date, views, adds, comments, rating; filters add "Author" and a rating threshold. https://www.dndbeyond.com/homebrew/spells
- No "shared with me" view: shared homebrew just appears in the builder with homebrew on; users ask for a per-campaign dashboard and for homebrew marking in lists (community). https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/129218-is-there-a-way-to-stop-sharing-players-homebrew ; https://www.dndbeyond.com/forums/d-d-beyond-general/bugs-support/94599-cannot-turn-off-homebrew-content-sharing-from

### (e) Import/export

- None documented; cross-account sharing is pasting an entry URL for "Add to Collection" (community). https://www.dndbeyond.com/forums/d-d-beyond-general/bugs-support/157347-homebrew-content-sharing-in-encounter-builder

---

## 2. Foundry VTT (core + dnd5e)

### (a) Lookup mid-session

- "Compendium Packs" sidebar: "Create Compendium", "Create Folder", "Filter Compendium Pack", "Search Compendium Pack", "Toggle Sort Style", "Collapse All Folders"; one document type per pack; lazy loading. https://foundryvtt.com/article/compendium/
- dnd5e "Open Compendium Browser": standard mode tabs "classes, subclasses, spells, feats, and monsters"; advanced mode actor/item lists with type filters; locked mode when opened from a sheet; filters by source, spell list, parent class (4.0); players see results "so long as they are able to view a given compendium pack". https://github.com/foundryvtt/dnd5e/wiki/Compendium-Browser ; https://github.com/foundryvtt/dnd5e/releases/tag/release-4.0.0
- Detail = item sheet with "Description", "Details", "Activities", "Effects" tabs; activity types "Attack, Cast, Check, Damage, Enchant, Forward, Heal, Save, Summon, Transform, Utility". https://github.com/foundryvtt/dnd5e/wiki/Activities
- EN/IT: `languages[]` entries {lang, name, path}; core → system → module merge order; namespaced JSON keys. https://foundryvtt.com/article/localization/
- Capture: https://github.com/foundryvtt/dnd5e/wiki/Compendium-Browser (mode toggle and tabs).

### (b) Authoring

- Editor = sheet. "Create Item" → name + type → sheet; "Create Actor" → "Create New Actor". https://foundryvtt.com/article/items/ ; https://foundryvtt.com/article/actors/
- Start from existing: drag from pack, right-click → "Import Entry", or "Import" in the sheet header, then edit the world copy; directory right-click → "Duplicate" ("Creates a copy of the item in the directory."). World copies do not sync back unless re-exported. https://foundryvtt.com/article/compendium/ ; https://foundryvtt.com/article/items/
- Mechanics: Active Effects with modes "Add", "Subtract", "Multiply", "Override", "Downgrade", "Upgrade" on keys such as `system.attributes.ac.bonus`. https://github.com/foundryvtt/dnd5e/wiki/Active-Effect-Guide
- Activities: "Activities" tab → plus → type → "Create Activity"; tabs "Identity" (Name, Icon, Chat Flavor), "Activation" (Time, Consumption, Targeting), effect tab; "Applied Effects" list. https://github.com/foundryvtt/dnd5e/wiki/Activities
- Classes/subclasses/species/backgrounds: "Advancement" tab with "+", pen, trash; types "Ability Score Improvement", "Hit Points", "Item Grant", "Item Choice", "Scale Value", "Trait" (later "Subclass", "Size"); level-up manager "Next", "Continue", "Complete", "Restart"; "Modify Choices" reopens a level; level-down toggle strips earned items. https://github.com/foundryvtt/dnd5e/wiki/Advancement-User-Guide ; https://github.com/foundryvtt/dnd5e/wiki
- Versions: none per record; module manifest `version`. Validation/preview: unverified beyond field types; preview is the sheet. https://foundryvtt.com/article/module-development/

### (c) Sharing

- Per document "Configure Ownership": "None", "Limited", "Observer", "Owner"; default "only visible and editable by gamemaster accounts"; roles None, Player, Trusted, Assistant, Game Master. https://foundryvtt.com/article/users/
- Packs: right-click "Toggle Visibility", "Toggle Edit Lock", "Duplicate", "Import Data", "Delete"; Limited players see accessible packs. https://foundryvtt.com/article/compendium/
- Copies: item dropped on an actor becomes an "Owned Item", "a separate copy independent of the original". https://foundryvtt.com/article/items/
- Beyond one world: package packs into a module ("A Module that contains one or more Compendium Packs is a great solution to distribute your content."); install by pasting a `module.json` URL → "Install"; per world "Manage Modules" → "Save Module Settings". https://foundryvtt.com/article/packaging-guide/ ; https://foundryvtt.com/article/modules/

### (d) Browsing

- Tiers by location: world directories (mine, editable), world packs (mine, lockable), system/module packs (official, locked, badge in Manage Modules); the browser merges them and the GM toggles sources. https://foundryvtt.com/article/modules/ ; https://github.com/foundryvtt/dnd5e/wiki/Compendium-Browser
- "Shared with me" = anything at Limited+ for my user, in the same sidebar. https://foundryvtt.com/article/users/

### (e) Import/export

- Per document "Export Data" (JSON) / "Import Data". Bulk: folder → "Export to Compendium" with "Merge By Name", "Keep Document IDs", "Keep Folder Structure"; pack → "Import All Content". Manifest packs: `name`, `label`, `path`, `type`. https://foundryvtt.com/article/items/ ; https://foundryvtt.com/article/compendium/ ; https://foundryvtt.com/article/packaging-guide/

---

## 3. Roll20

### (a) Lookup mid-session

- "Compendium" sidebar tab between Journal and Jukebox; search and browse "behave exactly as the webpage version"; drag entries onto sheets. https://help.roll20.net/hc/en-us/articles/360039178694-Compendium
- Web: "Type to search for a spell, item, class — anything!"; "Searches must be at least 2 characters."; categories Spells, Monsters, Items, Rules, Races, Classes; sorts "by Name", "by Level", "by School", "by Type", "by Challenge Rating"; "2024 Essentials" / "2014 Essentials". https://roll20.net/compendium/dnd5e/
- Scope: "The search looks for keywords used in the page title and header tags of an entry."; list pages have "Search Filters" (Monsters: name, Alignment, Speed, Type…; Spells: Name, Level, Class, School…). https://help.roll20.net/hc/en-us/articles/360039178694-Compendium
- Search-as-you-type: typing "will generate a dropdown list for you" with subheadings and alphabetised categories; results hide a summary behind a down-arrow. https://bloghub.roll20.net/posts/compendium-searching-enhanced/
- Duplicate names across books marked "with source information, publisher icon, and book title abbreviation". Expansions page like a book with "<< Previous Page" / "Next Page >>" (snippet; unverified verbatim). https://help.roll20.net/hc/en-us/articles/360039178694-Compendium
- Capture: https://roll20.net/compendium/dnd5e/ (search prompt and categories).

### (b) Authoring

- No custom compendium ("you can't add homebrew items or custom content to the compendium"); staff described a "fork the SRD" idea with no timeline (community). https://app.roll20.net/forum/post/8407799/can-i-add-homebrew-items-to-the-compendium ; https://app.roll20.net/forum/post/7342282/is-there-any-way-to-make-a-custom-compendium-currently
- Feature request closed for lack of votes. https://app.roll20.net/forum/post/11112330/ability-to-add-custom-spells-magic-items-etc-to-game-compendium
- Homebrew lives on the sheet: Charactermancer has a "custom" option for class, races, subraces, backgrounds but not subclasses ("Not at this time, though it is a common request."); workaround via the sheet cog and Traits & Features. https://app.roll20.net/forum/post/10461061/homebrew-subclasses-in-the-charactermancer
- Charactermancer flow: slides with "Next", "Back", "Cancel Charactermancer", "Apply Changes"; required inputs block "Next" and are highlighted; selects auto-fill from the compendium via an `accept` string. https://help.roll20.net/hc/en-us/articles/360037257394-Charactermancer
- Start from existing: character "Duplicate" "can be useful when using a Character entry as a template" (Journal article in the same help section). https://help.roll20.net/hc/en-us/articles/360039178694-Compendium

### (c) Sharing

- Settings → "Game Settings" → "Share my compendium with players?" → "Yes" → "Save Changes"; Free 1 game/5 players, Plus 3/10, Pro 5/15; "You can only share all or none of your compendiums."; over the cap sharing is disabled with a warning; remove a game with the "X". https://help.roll20.net/hc/en-us/articles/360037258674-Compendium-Sharing
- Without sharing, drag entries to the tabletop to make handouts/characters and share those copies "as-needed". Per record: "In Player's Journals" (view), "Can Be Edited & Controlled By" (edit), each accepting "All Players". https://help.roll20.net/hc/en-us/articles/360039178694-Compendium

### (d) Browsing

- Official: Compendium tab; mine: Journal tab ("Tags" search, "Archive"); shared with me: entries in "In Player's Journals". No homebrew listing. Same article.

### (e) Import/export

- Transmogrifier copies elements (incl. macros) between games you own by drag and drop; subscription feature (snippets of https://wiki.roll20.net/Transmogrifier ; bot wall; unverified verbatim). No file export documented.

---

## 4. 5etools and Kobold+ Fight Club

### (a) Lookup

- 5etools list pages: list pane with search bar and "Filter" button, detail alongside; site-wide "Search everywhere..." searches titles and repeats `in:` / `page:` operators (wiki snippets; unverified verbatim). https://wiki.tercept.net/en/5eTools/5etools_FAQ ; https://github.com/5etools-mirror-3/5etools-src/releases/tag/v2.20.0
- Filter reset copy: elements "in red", click to "blue or grey", or "hold SHIFT and click on reset"; a "Help" button under Utilities on every page (snippets). https://wiki.tercept.net/en/5eTools/HelpPages
- Kobold+ first screen (browser-verified): search placeholder "Qorgeth, Demon Lord of the Devouring Worm"; "10 per page" … "100 per page"; links "Keyboard Shortcuts", "Import Custom Monsters", "Manage" (sources), "History", "Settings"; party count/level inputs; light mode "ctrl+shift+\". https://koboldplus.club/
- Kobold+ filters: negatable size, creature type, environment; type/environment lists "populate from active sources". https://github.com/fantasycalendar/kobold-plus-fight-club/releases
- Capture: https://koboldplus.club/ (top bar); https://5e.tools/bestiary.html (list + filter).

### (b) Authoring

- 5etools Homebrew Builder: "Load Existing Creature/Spell/Legendary Group" as base; source selector + "Edit Selected Source"; "Download Creatures/Spells/Legendary Groups as JSON" with `_meta` (snippets; unverified verbatim). https://wiki.tercept.net/en/5eTools/HelpPages/makebrew
- Format: site-data JSON; `_meta.sources[]` needs unique `json`, `author`, `convertedBy`, `dateAdded`; published schemas; JSONLint / VS Code language server for validation. https://raw.githubusercontent.com/TheGiddyLimit/homebrew/master/README.md
- Kobold+: "Import Custom Monsters" accepts Google Sheets, JSON files, raw JSON, CSV, each with an example; "additional validation … to catch user errors". https://github.com/fantasycalendar/kobold-plus-fight-club/releases

### (c)/(d) Sharing and browsing

- 5etools "Manage Homebrew": "Get Homebrew" (repository list sortable by name, author, type, dates, with search), "Upload File" (.json; merged locally, "no data is sent across the Internet"), "Load from URL" (raw link); loaded homebrew appears in every list with its source tag. No accounts or permissions; sharing = a file or link. https://raw.githubusercontent.com/TheGiddyLimit/homebrew/master/README.md ; snippets https://wiki.tercept.net/en/5eTools/HelpPages/managebrew

### (e) Import/export

- 5etools JSON in/out; Roll20/Foundry exports rejected ("not all JSON files are 5eTools-compatible"). Kobold+ "Send to Improved Initiative". Same sources.

---

## 5. Homebrewery and GM Binder

### (b) Authoring

- Homebrewery: Markdown source pane + preview; snippet menus ("so you'll never have to memorize exactly how a Monster Stat Block is supposed to be formatted"); custom "BREW SNIPPETS"; "Properties" with "TAGS" (systems checkboxes removed) and a "THEME" dropdown of brews tagged `meta:theme` incl. "Blank"; "HISTORY" restores five local snapshots; "GET PDF" opens print; "SYNC VIEWS". https://github.com/naturalcrit/homebrewery/releases
- GM Binder: "My Documents" → name → "Create Document!"; left editor / right preview with separate toolbars; "magic wand" Snippets; `Ctrl+Z`, `Ctrl+D`, `Ctrl+Alt+H`, `Ctrl+Space`; `\pagebreak`; themes via snippets/CSS. https://www.gmbinder.com/share/-LPnHKXC8G7OGTlzInnQ ; https://www.gmbinder.com/share/-M7sLg5p_dV7KfYIV91h
- Start from existing = paste a snippet or duplicate; one brew can be another's theme (3.14.0). Validation: render only. Versions: Homebrewery local snapshots; GM Binder "Versions" → "Create Version" freezes a read-only share URL.

### (c) Sharing

- Homebrewery: edit URL and share URL per brew; "anyone with the edit URL will be able to make edits"; share URL read-only; autosave (welcome brew snippet; unverified verbatim). Roles "owner" / "invitedAuthor"; author removal and owner promotion are open requests. https://github.com/naturalcrit/homebrewery/issues/4101
- Save error copy: "500 Means our server is broken."; "Error updating permissions: The user does not have sufficient permissions for this file."; 403 = expired credentials. https://github.com/naturalcrit/homebrewery/wiki/Saving-Issues-and-Error-Codes
- GM Binder: "Document Settings" sets public/private; public documents enter GM Binder Search; share URL → "Print to PDF". Revocation: GM Binder toggles private; Homebrewery unverified.

### (d)/(e) Browsing, import/export

- Homebrewery user page searchable by tag ("clicking a tag adds it to the filter"); folders planned as "collections of references/bookmarks" with `isPublished`. GM Binder "My Library". Both: Markdown in, PDF via print out. https://github.com/naturalcrit/homebrewery/wiki/Folders-etc

---

## 6. Baldur's Gate 3 — lookup patterns only

- Keybinds: "Examine / Pin Tooltip" = T; "Expand Tooltip" = Left Alt; "Spellbook" = K; "Character Sheet" = N → three disclosure levels: hover, expand, pin. https://bg3.wiki/wiki/Controls
- Examine also via right-click → Examine; window has a "Resistances" section (snippet of primagames.com/gaming/how-to-examine-enemy-weaknesses-and-resistances-in-baldurs-gate-3 — Baldur's Gate 3 — page 403; unverified). Section order unverified.
- Spellbook: tabs for class, "Common", "Reactions"; prepared row above known spells by level; prepared = golden border; cantrip square, class action circle, always-prepared infinity; tooltip shows slot level (Roman numeral), concentration, upcast icon; saves with a shield symbol. https://www.shacknews.com/article/136610/spell-guide-baldurs-gate-3 (Baldur's Gate 3)

---

## 7. Owlbear Rodeo — corroboration

- Extensions: "Copy Install Link" → profile "Add Extension" → paste → enable per room. https://extensions.owlbear.rodeo/guide
- Permissions: "Player Permissions" dialog, create/update/delete per layer; "Owner Only" on characters; a player "owns" what they created; GM sets owner via the "Owner" menu. https://docs.owlbear.rodeo/docs/permissions/
- Lookup is an extension: "Game Master's Grimoire" statblock search over 5e/PF2e; custom statblocks listed first with a green tint; players see only statblocks of tokens they own. https://extensions.owlbear.rodeo/hp-tracker

---

## Dominant pattern per job

1. Lookup — one search box plus a faceted filter rail over a list; search-as-you-type grouped by category; detail in place. D&D Beyond https://www.dndbeyond.com/spells ; Roll20 https://bloghub.roll20.net/posts/compendium-searching-enhanced/ ; Foundry https://github.com/foundryvtt/dnd5e/wiki/Compendium-Browser. Rule: typing a name from any screen returns grouped results, and every filter set is URL-addressable.
2. Authoring — first screen offers "use an existing entry" vs "from scratch"; a short basic form creates the record, then mechanics unlock. D&D Beyond https://www.dndbeyond.com/posts/1169-how-to-create-a-homebrew-spell-using-d-d-beyond ; Foundry "Import"/"Duplicate" https://foundryvtt.com/article/compendium/ ; 5etools "Load Existing Creature" https://wiki.tercept.net/en/5eTools/HelpPages/makebrew. Rule: every family's create flow starts with "Start from [existing]" and yields a saved draft after one form.
3. Sharing — membership-based automatic availability with a per-item switch, never a publish step. D&D Beyond Collection https://dndbeyond-support.wizards.com/hc/en-us/articles/7747210455828-Sharing-and-Publishing-Homebrew-Content ; Foundry ownership https://foundryvtt.com/article/compendium/ ; Roll20 "Share my compendium with players?" https://help.roll20.net/hc/en-us/articles/360037258674-Compendium-Sharing. Rule: a member sees a shared item within one refresh and the owner can revoke it per item per group.
4. Browsing — three explicit sources: mine, shared/added, official; the "shared" set is what reaches the group. D&D Beyond Creations vs Collection https://dndbeyond-support.wizards.com/hc/en-us/articles/7747238519700-Homebrew-Creation-and-Collection-Basics ; Foundry world vs pack vs module https://foundryvtt.com/article/modules/ ; 5etools source tags https://raw.githubusercontent.com/TheGiddyLimit/homebrew/master/README.md. Rule: every list row shows its source and every list has a Mine / Shared / Official filter.
5. Import/export — JSON per record and per bundle with a declared schema and source metadata. Foundry https://foundryvtt.com/article/items/ ; 5etools https://raw.githubusercontent.com/TheGiddyLimit/homebrew/master/README.md ; Kobold+ https://github.com/fantasycalendar/kobold-plus-fight-club/releases. Rule: any record exports to JSON that re-imports losslessly and rejects foreign files with a named reason.

## Documented failures — do not copy

- Shared homebrew not reaching players (D&D Beyond): three hidden preconditions (Collection not Creations; character active in campaign; "Homebrew Content" toggle) drive recurring unresolved threads. https://www.dndbeyond.com/forums/d-d-beyond-general/bugs-support/161101-players-not-able-to-see-shared-content-and ; https://dndbeyond-support.wizards.com/hc/en-us/articles/7747210355604-Campaign-Content-Sharing-and-You
- No per-campaign scope or DM veto (D&D Beyond): every member's Collection is force-shared; removed items persist on characters. https://www.dndbeyond.com/forums/d-d-beyond-general/bugs-support/48893-removed-homebrew-spells-stay-in-campaign ; https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/129218-is-there-a-way-to-stop-sharing-players-homebrew
- "DM = campaign creator = author" assumption (D&D Beyond): co-DMs cannot use each other's monsters in the Encounter Builder; staff: "The system was designed under the assumption that the DM … would all be the same individual". https://www.dndbeyond.com/forums/d-d-beyond-general/bugs-support/157347-homebrew-content-sharing-in-encounter-builder
- Irreversible publish blocking edits (D&D Beyond): "Once you publish homebrew material it cannot be undone." https://dndbeyond-support.wizards.com/hc/en-us/articles/14175427969428-Deleting-Published-Homebrew-Content
- Silently filtered template list (D&D Beyond): an active filter hides your own homebrew from the template dropdown with no hint. https://www.dndbeyond.com/forums/dungeons-dragons-discussion/homebrew-house-rules/37124-is-it-possible-to-create-a-copy-of-a-homebrew
- Sharing rights ≠ template rights (D&D Beyond): "content sharing does not provide access to it". https://dndbeyond-support.wizards.com/hc/en-us/articles/14175429918612-Unable-to-Use-Existing-Template
- Translation without tooltips (D&D Beyond IT): Italian compendium, English tooltips/lists/sheets, separate purchase. https://www.dndbeyond.com/it/italian-translation
- No homebrew home (Roll20): no custom compendium; no Charactermancer subclass option; dummy-game workaround. https://app.roll20.net/forum/post/11112330/ability-to-add-custom-spells-magic-items-etc-to-game-compendium ; https://app.roll20.net/forum/post/10461061/homebrew-subclasses-in-the-charactermancer
- All-or-nothing sharing with silent shutdown (Roll20): "You can only share all or none of your compendiums."; over the cap, sharing is disabled for the whole game. https://help.roll20.net/hc/en-us/articles/360037258674-Compendium-Sharing
- Imported copies drift (Foundry): world copies never sync back to the pack. https://foundryvtt.com/article/compendium/
- Foreign JSON accepted as JSON, rejected as content (5etools): site-level error copy unverified. https://raw.githubusercontent.com/TheGiddyLimit/homebrew/master/README.md
- Edit-by-URL sharing (Homebrewery): anyone with the edit URL edits; author removal and owner transfer still open. https://github.com/naturalcrit/homebrewery/issues/4101
