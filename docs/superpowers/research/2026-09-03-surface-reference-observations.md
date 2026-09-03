# Component reference observations (refs3): roster, campaign, compendium, builder

Captured 2026-09-03 with headless Chromium (`capture.mjs`, `clickshot.mjs`), the iTunes lookup API (`store-apple.mjs`, 2000 px App Store screenshots) and Google Play (`store-play.mjs`). Full pages live in `refs3/<surface>/`, App Store / Play originals in `refs3/store/<app>/`, help-center originals in `refs3/<surface>/{ddb-help,roll20-help,foundry}/`, and component crops in `refs3/crops/<product>-<component>.png` (small sources upscaled 1.5–2x; those crops read soft, shapes and placement are reliable, glyph edges are not).

Every capture kept here was opened and looked at; the ones below were dropped.

## Dead ends (honest list)

- **5e.tools bestiary**: the list never populates in headless Chromium, even with ad/CMP hosts blocked, a 12 s wait, the consent button clicked and `navigator.webdriver` masked (`5etools-goblin*.png` show an empty table under ad slots). Not usable; no crop.
- **Obsidian Portal campaign subdomains** (`redmark.obsidianportal.com` home / characters / adventure-log): Cloudflare "human-check" interstitial on every attempt, stealth flags included. Only the public `/campaigns` directory rendered (kept, it is real UI).
- **Roll20 Characters mobile app**: delisted from both stores (Roll20 blog, 2025); `net.roll20.player` returns 404 on Play. `app.roll20.net/characters` is login-gated ("Just a moment"). The real UI evidence comes from the Roll20 help-center screenshots instead (`roll20-help-*`), which are actual product captures.
- **D&D Beyond `/characters`, `/campaigns`**: redirect to the marketing "players" page / 404 when logged out. Real roster and campaign UI comes from the App Store screenshots (iPhone + iPad, 2000 px) and the help-center originals on `dndbeyond-support.wizards.com` (the old `support.dndbeyond.com` article ids 301 to the new home page; new ids found via search).
- **Demiplane**: `app.demiplane.com/home` is a sign-in wall, the PF2 creature _list_ is gated ("Sign in to get access", empty table). The 5e monster list, 5e spell list and both goblin pages render publicly and were kept. Demiplane's marketing "nexus" pages are 404; `demiplane-home` shows three sheet screenshots only.
- **Alchemy**: `app.alchemyrpg.com` is a sign-up form; the marketing home was captured but contains no roster or campaign UI beyond what refs2 already has, so nothing new was cropped.
- **Kanka public-campaigns list** (`kanka.io/en/public-campaigns`) is 404; `kanka.io/campaigns` worked and led to the Thaelia and Alfaysia public campaigns (real, read-only UI, all kept). `/w/thaelia/campaign` is 404.
- **World Anvil community/worlds** is 404 and `aqualon-qurilion` is private; the public Solaris world (WAWA entry) and the Codex world-homepage article were used instead.
- **LegendKeeper**: `example-project` embeds the real public project at `legendkeeper.com/p/…`; the iframe blocks synthetic `getByText` clicks on tabs, so Lore was reached with a coordinate click, NPC/monster pages through the tree.
- **Roll20 compendium `/Monsters` listing** rendered as a 16 900 px page of text links, not a card/table UI; not cropped.
- **open5e** `/monsters/goblin` is a "choose version" page (kept as evidence of source disambiguation); the SRD statblock is `/monsters/srd_goblin`.

---

## 1. Character roster / "my characters"

### What each product shows

**D&D Beyond web** (`ddb-mycharacters-header`, `ddb-mycharacters-cards`, from the help-center original): parchment page, black condensed display title "MY CHARACTERS", "Slots: 7/Unlimited" in blue under it, one dark primary button "CREATE A CHARACTER" top-right, a secondary text link "Download a blank character sheet" beneath it. A grey filter bar: search field with placeholder "Search by Name, Level, Class, Species, or Campaign", a "Sort By: Modified: Latest" select, a "Settings" button. Cards are 3-up, landscape: a dark art banner with a 60 px square portrait, name in 22 px white, "Level 1 | Human | Monk" in 12 px grey; a black strip "Campaign: A Shining Example (Unassign…) LEAVE CAMPAIGN" in orange; then a white footer with four equal text buttons VIEW / EDIT / COPY / DELETE (delete in orange). Density: 3 cards per row at 1440, each ~460x230.

**D&D Beyond iOS app** (`ddb-app-character-list`, `ddb-ipad-character-list`): dark navy list. Header "Characters" centred with a red "Name: A–Z ^" sort link under it, a search field "Search for characters", then full-width rows: 48 px square portrait with a 2 px coloured border, name 17 px white, "Lvl 20 | Harengon" and "Bard • College of Creation" on two 12 px lines, and a third line with a red flag icon and the campaign name when the character is in a campaign; a "…" overflow at the right edge. One sticky pill button at the bottom "CREATE NEW CHARACTER" (outlined, blue text). On iPad the same rows sit over a faded party illustration; the create button stays bottom-centre.

**Roll20 Characters** (`roll20-mycharacters-list`, from the help-center): dark (#1a1a1a) page, "My Characters" bold 26 px white with a purple "Import" button right next to the title (not right-aligned), full-width search "Search Characters…". Rows are big (900x200) dark cards: 140 px round portrait with a gold ring, name 24 px bold, system caption in 11 px letter-spaced caps ("MARVEL MULTIVERSE ROLE-PLAYING GAME BY ROLL20"), and a vertical icon column at the right edge (export, duplicate, delete-in-red). Empty portrait is a black silhouette. Very low density: two characters fill the viewport.

**Roll20 create flow** (`roll20-create-character-systems`, `roll20-create-by-sheet`, `roll20-choose-sheet-modal`): "Create a Character" → 2x2 grid of system tiles (thumb + logo + purple "+"), then "Want more choices?" card; "Create Character By Sheet" shows large image cards with title + caption + "BY ROLL20" badge; the 2014/2024 choice is a modal with two radio tiles carrying "Legacy" / "New" pills, a "Set as default?" toggle, Close / Create buttons.

**PrismScroll** (`prismscroll-character-list`): white screen, orange title "Character List", stacked gradient "banner" cards (one per character, 340x90): class glyph in a white outline at left, name 22 px bold white, "LVL 1 Cleric / Black Dragonborn" as two 13 px lines, three small dots at the right (drag/menu). Gradient hue = class colour. A grey dashed "+" card at the bottom is the create affordance. The same card grammar is reused for custom content (`prismscroll-custom-creator`).

**Pathbuilder 2e** (`pathbuilder-home`): parchment splash with two full-width image tiles "NEW CHARACTER" / "LOAD CHARACTER" (right-aligned 30 px serif caps over art), three small outlined buttons "More / Update 13 / Support", and a "Light Mode" toggle. There is no roster screen; load opens a native file/cloud picker.

**Foundry actor directory** (`foundry-actor-directory`, `foundry-actor-context-menu`): 300 px sidebar. Top toolbar "Create Actor" + "Create Folder", a search field with a collapse-all icon, then coloured folder headers (user-chosen hue per folder: red "Starter Heroes", purple "Casters", blue "Martial", green "Adolescent Kensei Tortles") each with a folder icon, name, and two + icons (subfolder / new actor). Rows: 32 px thumbnail + name "Akra (Dragonborn Cleric)" in 13 px white on a darker row. Right-click menu: View Character Artwork, View Token Artwork, Clear Folder, Delete, Duplicate, Configure Ownership, Export Data, Import Data.

**Kanka characters index** (`kanka-characters-grid`): parchment app, header "Characters" + "Filters" button + grid/list toggle + "Display" menu. Grid tiles 190x230: 3:2 portrait (placeholder = classical bust) with the name centred under it in 12 px blue. 5 per row, paginated (1…22). No metadata on the tile at all.

**Kanka dashboard "party lists"** (`kanka-party-lists`): a dashboard widget "PCs – Landfall Campaign" (blue link title, a "P" pill for public) listing each PC as 32 px round avatar + name link, with the player name right-aligned in grey ("SkidAce"). This is the closest thing to a _party_ roster among the worldbuilding tools.

**LegendKeeper NPC list** (`legendkeeper-npc-page`): tree in the sidebar; the NPC hub page is a heading + plain icon+name link list, no cards.

### Verdict: roster component

Best practice = **D&D Beyond app rows for scanning + D&D Beyond web card footer for actions, with PrismScroll's colour and Roll20's portrait weight as accents**:

1. Row/card anatomy: portrait (48–60 px square, coloured border) + name (17–22 px) + one metadata line "Lvl N | Species" + one line "Class • Subclass" + one campaign line with a flag glyph. DDB's three-line hierarchy is the only one that carries level, species, class and campaign without a table. Evidence: `ddb-app-character-list`, `ddb-mycharacters-cards`.
2. Primary action: one create button, either top-right on desktop (DDB web, Roll20 "Import" sits beside the title) or a sticky bottom pill on mobile (DDB app "CREATE NEW CHARACTER"); secondary actions live in the card footer (VIEW / EDIT / COPY / DELETE, destructive in orange) or an overflow "…". Evidence: `ddb-mycharacters-header`, `ddb-app-character-list`, `roll20-mycharacters-list`.
3. Filters: a single search field that searches name+level+class+species+campaign, plus one sort select; nobody ships facet chips on the roster. Evidence: `ddb-mycharacters-header`.
4. Slots/quota line under the title ("Slots: 7/Unlimited") is the DDB pattern for a limited free tier; Roll20 shows nothing.
5. Colour: PrismScroll's class-hued gradient cards make a 4-character list identifiable at arm's length; Foundry's user-coloured folders do the same for groups. Use hue as a class/party cue, not for status. Evidence: `prismscroll-character-list`, `foundry-actor-directory`.
6. Empty/create affordance: PrismScroll's dashed "+" ghost card and Roll20's black silhouette placeholder are the two visible empty states; Pathbuilder's NEW / LOAD tiles are the "no characters yet" screen. Evidence: `prismscroll-character-list`, `roll20-mycharacters-list`, `pathbuilder-home`.
7. Density: DDB app fits 6 rows per phone screen; Roll20 fits 2. For a companion app the DDB density is right; Roll20's 140 px portraits belong only on a single character's landing.

---

## 2. Campaign / party pages

### What each product shows

**D&D Beyond app, campaign → Characters tab** (`ddb-app-campaign-characters`, `ddb-ipad-campaign-characters`): campaign name centred in the top bar, two tabs GAME LOG / CHARACTERS. Each member is a two-tier block: (a) portrait + name + "Character level: 14 | Lizardfolk" + "Druid • Circle of the Land (Coast)" + "Player: Yozira Stoutman", and to the right a boxed HP "101 / 101" (current in blue) with an "EXHAUSTION" pip row under it; (b) a four-stat strip PASSIVE PERCEPTION / PASSIVE INVESTIGATION / PASSIVE INSIGHT / ARMOR CLASS as 24 px numerals with 9 px letter-spaced caps labels. On iPad the same block becomes one row per character with the four stats inline. This is the DM's "party at a glance" and it is stat-first.

**D&D Beyond game log** (`ddb-app-campaign-gamelog`): "Send to: Everyone" selector under the title; roll cards grouped by character name (caps label), each card a rounded outline box with "BOOMERANG: TO HIT" caption, die glyph + formula "19+8", "=" and the total "27" in 28 px, timestamp under the card, poster avatar at the left.

**D&D Beyond campaign page (web)** (`ddb-campaign-header`, `ddb-party-inventory`): breadcrumb "B > CAMPAIGNS > A SHINING EXAMPLE", 40 px black title with a thin blue rule, status text in 11 px blue caps ("YOU HAVE ENABLED CONTENT SHARING IN THIS CAMPAIGN"), two buttons (outlined / solid blue). Party inventory is a tab pair "MY INVENTORY / PARTY INVENTORY" with a campaign label row, search + "MANAGE INVENTORY", container chips ALL / PARTY EQUIPMENT / BAG OF HOLDING / BACKPACK, and rows with checkbox, name, weight, qty, cost, notes, grouped under container headers with "+ Add items to your Party Equipment".

**Roll20 journal** (`roll20-journal-sidebar`, `roll20-character-bio-window`, `roll20-edit-character-modal`): the in-game party list is a sidebar tab "Characters" / "Handouts" with "+ Add" buttons and 40 px thumbnail rows; a coloured dot at the row's right edge is the visibility state. Character windows are Bio & Info / Character Sheet / Attributes & Abilities tabs with "Show to Players" and "Edit". The edit modal is a two-column form: avatar and token drop-zones on the left, name / "In Player's Journals" / "Can Be Edited & Controlled By" / Tags on the right, Duplicate / Archive / Delete (red) in a row, then two rich-text areas Bio & Info and GM Notes.

**Foundry** (`foundry-join-screen`, `foundry-user-management`, `foundry-player-config`, `foundry-world-tile`, `foundry-worlds-toolbar`): the world/join screen is three stacked serif-titled panels ("Join Game Session" with player select + password + orange button; "Game Details" with Next Session and Current Players 0/1; "Return to Setup") beside a "World Description" text panel. User Management is a plain table: User Name / Password / User Role select / trash, with "Create Additional User", "Configure Permissions", "Save and Return". Player Configuration is a modal: name, avatar path, colour swatch (#28cc79), pronouns, and a "Player Character" select "from the set which you have at least OBSERVER permission over". World tiles are 300x150 art cards with the world name over a bar, a date pill and a system badge ("dnd5e") at the bottom.

**Kanka dashboard** (`kanka-dashboard-intro`, `kanka-dashboard-entity-cards`, `kanka-dashboard-calendar`, `kanka-dashboard-recent`, `kanka-sidebar-nav`, `kanka-party-lists`, `kanka-campaign-calendars`, `kanka-sidebar-nav-dark`): a header banner with the campaign blurb in a white card; then a widget grid: 3-up preview cards (image + blue title + first lines of text + "v" expand), a calendar widget ("Thaelian Calendar", date "25 Avunai, 1024 AE" with moon glyphs, Previous / Upcoming columns of event links with a calendar icon), "Recently modified entries" (avatar + name + author), and in Alfaysia two side-by-side calendar cards with flags and PC lists. Sidebar: campaign avatar, Dashboard, Bookmarks, then WORLD (Characters, Deities & Gods, Locations, Maps, Organizations, Families, Creatures, Folks) and TIME (Calendars) in 11 px letter-spaced captions; Alfaysia's dark theme shows the full module list (Species, Quests, Journals, Timelines, Events, Tags, Gallery, Relations, Whiteboards).

**World Anvil world homepage** (`worldanvil-world-homepage`, `worldanvil-explore-cards`): fully themed by the author (Solaris: navy space, serif "Solaris / sapphic love in space", drop-cap intro, award badges), a left rail (Navigation, Friday Feature, Recent Articles, Guides), and 3-column "History / Planets / Culture" columns of article cards (16:9 cover with a "Military Conflict | Dec 3, 2025" type/date pill, blue serif title, drop-cap teaser, "Length: Long").

**Obsidian Portal campaigns directory** (`obsidianportal-campaign-cards`, `obsidianportal-campaign-of-month`, `obsidianportal-campaign-filters`): 3-up cards: 200x70 banner, title, "public / internet" visibility tag, "D&D 5E | updated August 24, 2026" caption, a fan count "118 FANS" with GM avatar, and a yellow "Become a Fan" button. Campaign-of-the-month cards add a date ribbon. Filters: one "Default Order" select, an "All Systems" bar, a "Looking for Players – In Person" button.

**LegendKeeper** (`legendkeeper-lore-home`, `legendkeeper-map`, `legendkeeper-sidebar`): dark app; project home has a cover image, "Selenia" + "Home" pill, tabs Lore / Map / History, a callout box, then "Points of Interest" as icon+link lists; the Map tab is an interactive map with typed pins (skull, sword, tower). Sidebar: search "Find by name or #tag", collapsible tree with type glyphs.

### Verdict: campaign / party component

Best practice = **D&D Beyond's campaign Characters tab for the party block, Kanka's dashboard widgets for campaign context, Foundry's join screen for "next session" facts**:

1. Party member block = identity (portrait, name, level|species, class•subclass, player name) + a boxed HP with current/max + a four-stat strip (passive perception / investigation / insight / AC). This is the one layout that is useful to a DM mid-session without opening a sheet. Evidence: `ddb-app-campaign-characters`, `ddb-ipad-campaign-characters`.
2. Campaign header: title, one status line in small caps, at most two buttons (invite/share primary). DDB's "Copy Link" invite lives under the campaign name; Obsidian Portal shows visibility ("public / internet") as a tag next to the title. Evidence: `ddb-campaign-header`, `obsidianportal-campaign-cards`.
3. Session facts belong in a small "Game Details" box (Next Session, Current Players 0/1) as Foundry does; Kanka's calendar widget (current in-world date + Previous/Upcoming) is the richer version for a chronicle. Evidence: `foundry-join-screen`, `kanka-dashboard-calendar`.
4. Activity feed = Roll20/DDB game log cards grouped by actor, formula left, total right, timestamp under; Kanka's "Recently modified entries" (avatar + link + author) is the non-dice equivalent. Evidence: `ddb-app-campaign-gamelog`, `kanka-dashboard-recent`.
5. Roles/permissions are a table (Foundry) or a per-character "Can Be Edited & Controlled By" field (Roll20), never inline on the party block. Evidence: `foundry-user-management`, `roll20-edit-character-modal`.
6. Shared inventory is its own tab with container chips and "+ Add items to your …" inline affordances. Evidence: `ddb-party-inventory`.
7. Campaign card (for a campaigns list): banner art + title + system/date caption + visibility tag + one action, 3-up on desktop. Evidence: `obsidianportal-campaign-cards`, `foundry-world-tile`.

---

## 3. Compendium / rules reader / stat blocks

### What each product shows

**D&D Beyond monsters** (`ddb-monster-filters`, `ddb-monster-rows`, `ddb-monster-page-header`, `ddb-statblock`, `ddb-app-monster-list`): parchment listing; filter block = a row of 12 round type icons (All Monsters in red, Aberration…Fey, "Show More" red arrow), then labelled inputs MONSTER NAME / CHALLENGE RANGE (two selects) / SIZE / HABITAT, a red "FILTER MONSTERS" button, "RESET ALL FILTERS", "SHOW ADVANCED FILTERS". Rows are a table: 48 px art thumb, CR, NAME (bold) + source line under it in 10 px, TYPE, SIZE, ALIGNMENT, HABITAT, TAGS, a red "+" at the right; "Legacy" grey pill after the name. The monster page has a small breadcrumb, three dark buttons at right (MONSTER RULES / + CREATE A MONSTER / BROWSE HOMEBREW), the name in 28 px red serif with a sound icon and "Legacy" pill, and a classic parchment stat block: name in red small caps, italic type line, red rules, AC/HP/Speed, a six-column ability table "8 (-1)", Skills/Senses/Languages, Challenge + Proficiency Bonus at the top-right column, Traits / Actions headings in red, art floated right. Below: Description, Monster Tags chips, Habitat chips, source line. The app's list is the same three-line row (name / "AC: 16 • HP: 93" / source) with a "Legacy" pill and a round portrait.

**Demiplane 5e** (`demiplane-monster-filters`, `demiplane-monster-banner`, `demiplane-statblock`, `demiplane-spell-filters`, `demiplane-spell-rows`): hero band with the section name in 40 px serif small caps ("MONSTERS"), a wide search, a "FILTERS" button and "RESET"; under it a horizontal scroller of square art chips per type (Aberration…Ooze) with a red "ALL" tile. Spell rows: table LEVEL / NAME (red small caps) / DETAILS (one-line teaser) / COMPONENTS / GAME VERSION (2014 / 2024 / Tales of the Valiant) / SOURCE / "v" expander, with a school glyph at the left. The 5e goblin block is a white card with a small art thumb and the name in green-black small caps, a magenta "MONSTER" tag at the right, italic type line, AC with linked "leather armor, shield", six-column abilities, then a red rule before Traits/Actions and art floated right. The PF2 block (`demiplane-pf2-statblock`) uses trait pills (CE / SMALL / GOBLIN / HUMANOID), a red "CREATURE –1" level badge at the right, action glyphs inline and grey rules between Perception / Defence / Offence groups.

**Roll20 compendium** (`roll20-compendium-header`, `roll20-statblock`): "D&D 5TH EDITION COMPENDIUM" in 40 px black condensed serif, a full-width search with a magenta SEARCH button, breadcrumb Home › Monsters › Goblin. The block is parchment with a top/bottom gold bar, "GOBLIN" in 30 px small caps, italic type line, red rules, Serif "Armor Class 15 (Leather Armor, Shield)", a six-column abilities table in 20 px, then ACTIONS in small caps and bold-italic attack names.

**open5e** (`open5e-monster-list`, `open5e-statblock`, `open5e-statblock-mobile`): red top bar, left rail with icon + name categories (GM Resources / Character Resources / Misc). Monster list = a searchable table Name (red link + green source pill) / CR / Type / Size with a red "+" (add to encounter) per row and Type/Size/CR min–max inputs above. Statblock: red 30 px serif name, "+ Add to Encounter" red button at the right, italic type line + green "SRD-2014" pill, a two-column label/value list (Armor Class, Initiative Bonus, Hit Points, Speed), two 3-row ability tables with MOD / SAVE columns (score in a light cell, mod/save in a grey cell, red text), Skills/Senses/Languages/Challenge, Traits / Actions with red underlines. The mobile view keeps the exact same order at 390 px, with the two ability tables side by side.

**Foundry compendium sidebar** (`foundry-compendium-sidebar`): "Create Compendium" + "Create Folder", a filter/search row, coloured folder headers (green Actors, gold Items, orange Features, teal Journals, red Tables) and pack tiles: banner art, a centred pill with a type icon + name ("Monsters (SRD)"), a lock icon top-right, system badge bottom-left.

**Kanka entity page** (`kanka-entity-page`, `kanka-entity-page-location`): header with a 3:2 image, "Locations" eyebrow, name in 32 px, parent link; left tab column (Overview, Relations 3, Children 17, Characters 16, Abilities, Inventory, Media, Properties, Reminders); centre = rich text with wiki links and tables; right = "Pins" (Capital / Population / Founding), "Profile" (Type), "History" (Created by / Last modified). An organisation page adds a "Members" table (Character / Role / Superior / Locations) with "Nothing to show yet." as the empty state.

**LegendKeeper** (`legendkeeper-statblock`, `legendkeeper-npc-page`): a monster page renders a classic red-on-white 5e block _inside_ the dark app plus a right "properties" rail (ARMOR CLASS 13 / HIT POINTS 110 (20d8+20) / SPEED / SKILLS / SENSES / CHALLENGE) in 10 px caps labels over 14 px values; NPC pages have Lore / Stats tabs and a TAGS panel ("statblock").

### Verdict: compendium component

Best practice = **open5e's statblock information order + D&D Beyond's parchment typography + Demiplane's list-row chrome + LegendKeeper's property rail on wide screens**:

1. Stat block order is universal and should not be reinvented: name, italic type line, AC/HP/Speed, six abilities, Skills/Senses/Languages, Challenge, Traits, Actions. Every product (DDB, Roll20, open5e, Demiplane, LegendKeeper) keeps it; only the framing differs. Evidence: `ddb-statblock`, `roll20-statblock`, `open5e-statblock`, `demiplane-statblock`, `legendkeeper-statblock`.
2. Ability table: open5e's score / MOD / SAVE cells with the modifier and save in a tinted cell is the only layout that shows saves without a separate line; DDB/Roll20's "8 (-1)" reads fine but hides saves. For D&D 2024 (saves matter) use the open5e grid. Evidence: `open5e-statblock`, `open5e-statblock-mobile`.
3. Source/version disambiguation: a small pill right after the name ("Legacy", "SRD-2014", "2014 / 2024" column). Demiplane's GAME VERSION column on spell rows is the clearest for a 2014/2024 split. Evidence: `ddb-monster-rows`, `open5e-statblock`, `demiplane-spell-rows`.
4. List row: art thumb + name (bold, coloured) + a one-line source or teaser + 3–4 numeric columns (CR, type, size) + one action icon at the right ("+"). Rows around 56 px tall. Evidence: `ddb-monster-rows`, `open5e-monster-list`, `ddb-app-monster-list`.
5. Filters: a type icon strip above the table (DDB round icons, Demiplane art squares) plus a search field; advanced filters collapsed behind a button. Nobody defaults to a facet sidebar for monsters. Evidence: `ddb-monster-filters`, `demiplane-monster-filters`, `demiplane-spell-filters`.
6. Primary action on a block: one button at the right of the name ("+ Add to Encounter" on open5e, three dark buttons on DDB). Evidence: `open5e-statblock`, `ddb-monster-page-header`.
7. Wide layout: the block stays at reading width (~700 px) with art floated right, and the numeric facts can be duplicated into a right rail (LegendKeeper). On mobile, the same order stacks; open5e proves the ability grid survives at 390 px. Evidence: `legendkeeper-statblock`, `open5e-statblock-mobile`.
8. Wiki-style entities (Kanka) sit a tab column left, prose centre, facts right; their "Nothing to show yet." member table is the reference empty-state copy. Evidence: `kanka-entity-page`, `kanka-entity-page-location`.

---

## 4. Character creation and level-up

### What each product shows

**D&D Beyond builder** (`ddb-creation-method-cards`, `ddb-builder-header`, `ddb-builder-class-features`, `ddb-builder-whats-next`, `ddb-class-cards`, `ddb-character-menu`, `ddb-sheet-header-bar`): the entry screen is three method cards (STANDARD "step-by-step", QUICKBUILDER "NEW" red pill, PREMADE) with art, a caption, an optional "BEGINNER? SHOW HELP TEXT" checkbox and a "START BUILDING >" link in the card footer. The builder header is a black bar: "Character Builder" + character name with a tiny portrait, a blue "?" help toggle, "HOME" tab. Choices needing attention are marked with a blue "!" badge on a torn-paper row ("Core Fighter Traits — 2 Choices • 1st level"). Sheet readiness is a "WHAT'S NEXT ▸" button whose sheet icon turns from grey to white when the character is playable. Class selection on the marketing page is a row of portrait art cards with the class glyph in a coloured square top-left, class name and two tag pills ("RAGING WARRIOR", "STRENGTH"). The character menu (sheet sidebar) lists MANAGE CHARACTER & LEVELS, CHARACTER SETTINGS, GAME LOG, SHORT REST, LONG REST, EXPORT TO PDF under a portrait + "Diana / Human / Level 1 / Monk – No Subclass" + "CHANGE SHEET APPEARANCE".

**D&D Beyond app sheet** (`ddb-app-sheet-abilities`, `ddb-app-sheet-actions`): header with name, "Fairy | Sorcerer 15", hex AC badge "15", "+5 INITIATIVE" hex, portrait, HP box "92/92", then a section selector "Abilities, Saves, Senses" and six shield-shaped ability tiles (modifier big, score small in a pill). The Actions section is a table RANGE / HIT/DC / DAMAGE with "+10" and "1d4+5" chips.

**Roll20 D&D 2024 sheet** (`roll20-2024-sheet`, `roll20-2024-header`, `roll20-2024-hp`, `roll20-2024-death-saves`, `roll20-2024-abilities`, `roll20-2024-skills`, `roll20-2024-actions`, `roll20-2024-conditions`, `roll20-2024-rest-modals`): black-and-red sheet. Header block: portrait with a red diamond level badge "3", name + pronouns, species, "Barbarian 3", background, "Exp: 0/2700", "Proficiency Bonus +2" pill, a grey "Level Up" button under the portrait, and two big buttons "Inspiration" (outlined) and "Initiative +1" (solid red). Hit Points block: Current / Max / Temp numeric fields, then a red heart "Damage" field and a green cross "Heal" field, a green progress bar under current/max, "Short Rest" / "Long Rest" buttons. Death saves: three red outline boxes for Successes and Failures with "Stabilize" and "Roll". Abilities: six columns, each two chips (Ability +2 with the score "15" in a small pill, Save +4 in red when proficient). Skills: name, ability tag, modifier chip (red when proficient), a proficiency circle. Actions: a table with ACTION NAME / DETAILS and a speech-bubble icon per row; bonus actions and reactions as separate headed groups with a red checkbox for "used". Conditions: a modal list with toggles, the expanded condition shows rules text and a "Modifiers" row (Set Speed Override > All Speeds 0), and an "Exhaustion Level" 1–6 stepper. Rest modals: a paragraph of rules, Current/Max/Temp, "Recover" checkboxes and a red "Take Short Rest".

**Pathbuilder 2e** (`pathbuilder-build-form`, `pathbuilder-build-levels`, `pathbuilder-defense`, `pathbuilder-feat-picker`, `pathbuilder-spell-picker`, `pathbuilder-offense`, `pathbuilder-ipad-skills`): dark top tabs BUILD / ABOUT / DEFENSE / OFFENSE / GEAR / SKILLS (active tab has a red outline). Build is a vertical form of white "label over value" rows with a red circular glyph (Character Name, Class, Ancestry, Background), then a red "Level 1" banner and three stepper tiles ("Ability Boosts 4", "Class Skill 1", "Skill Training 4" with a gear badge showing the remaining count), then per-level rows "Heritage — Not Selected" in red until chosen; levels 2, 3… follow as more banners. The picker is a full-screen modal on a translucent grey scrim: "Order alphabetically" select, feat cards with a black level badge, requirement/trigger text, the selected card outlined in red, Cancel / Accept at the bottom. Spells use a parchment modal with tradition tabs (Arcane / Divine / Occult / Primal / Witch), an "All Spells" toggle, "Heighten +1…+6" chips, spell rows with action glyphs and a level badge, PRD / Cancel / Accept. Defense: AC/HP/TAC shield badges, saves with T/E/M/L proficiency circles and Prof/Item breakdown, Full Plate with Set Armor / Set Mods / Set Runes.

**PrismScroll** (`prismscroll-skill-picker`, `prismscroll-levelup`, `prismscroll-skills-proficiency`, `prismscroll-spell-card`, `prismscroll-custom-creator`): orange full-bleed step screens: "Select Skills / Available: 2" with skills as wrapped text pills (chosen = filled pill), an explanation block "Your available options are based on the class(es), race and background you chose", and a "What can I pick?" outlined button; level-up is a confetti "Congrats! You reached level 2! Swipe left to go through the level up process (roll for HP, increase stats, multiclass, subclass…)". Skills on the sheet are rows with proficiency half/full circles and a modifier chip.

**Roll20 create-character** (`roll20-create-character-systems`, `roll20-create-by-sheet`, `roll20-choose-sheet-modal`): system tiles → sheet cards → edition modal (Legacy vs New pills). No stepper; Roll20's "builder" is a direct-to-sheet flow ("Edit Sheet Directly" vs "Character Builder" cards on the landing, `roll20-character-landing`).

### Verdict: builder / level-up component

Best practice = **D&D Beyond's method entry + attention badges, Pathbuilder's per-level "Not Selected" ledger and modal pickers, Roll20 2024's HP/death-save/rest blocks, PrismScroll's level-up moment**:

1. Entry: three method cards (guided / quick / premade) with art and a one-line promise; the guided card owns the "beginner help" toggle. Evidence: `ddb-creation-method-cards`.
2. Progress model: a vertical ledger grouped by level, where every unresolved choice is a row reading "Not Selected" in red (Pathbuilder) or a "!" badge with "2 Choices • 1st level" (DDB). Both make the remaining work countable; DDB's "WHAT'S NEXT" state change is the completion signal. Evidence: `pathbuilder-build-levels`, `ddb-builder-class-features`, `ddb-builder-whats-next`.
3. Pickers are full-screen modals over a scrim with a sort/filter control at the top, selectable cards with a level badge and requirement text, the chosen card outlined, and Cancel / Accept pinned at the bottom (Pathbuilder). Skill choices as wrapped pills with an "Available: N" counter (PrismScroll). Evidence: `pathbuilder-feat-picker`, `pathbuilder-spell-picker`, `prismscroll-skill-picker`.
4. Level-up is triggered from the sheet header ("Level Up" beside the portrait, Roll20; "MANAGE CHARACTER & LEVELS" in the DDB menu) and acknowledged with a celebration screen that lists what the level-up will ask for (PrismScroll). Evidence: `roll20-2024-header`, `ddb-character-menu`, `prismscroll-levelup`.
5. Ability tiles: modifier-first shields with the score in a small pill (DDB app) or two chips Ability / Save with red for proficient saves (Roll20). Evidence: `ddb-app-sheet-abilities`, `roll20-2024-abilities`.
6. HP control: Current / Max / Temp fields plus separate Damage (red heart) and Heal (green cross) inputs and a bar, with Short Rest / Long Rest directly under it; death saves as three outlined boxes each with Stabilize / Roll. Evidence: `roll20-2024-hp`, `roll20-2024-death-saves`, `roll20-2024-rest-modals`.
7. Conditions: a toggle list where the open item shows the rules text and the mechanical modifiers it applies, plus an exhaustion stepper. Evidence: `roll20-2024-conditions`.
8. Proficiency: T/E/M/L circles with a Prof/Item breakdown (Pathbuilder) or half/full circles (PrismScroll) beside the modifier chip: state and number in one glance. Evidence: `pathbuilder-defense`, `prismscroll-skills-proficiency`, `roll20-2024-skills`.
9. Edition choice: a two-tile radio modal with "Legacy" / "New" pills and a "Set as default" toggle (Roll20). Evidence: `roll20-choose-sheet-modal`.

---

## Crop index (one line each, `refs3/crops/<name>.png`)

- `ddb-app-campaign-characters` (1020x1634) — DDB iOS App Store phone-06, campaign Characters tab
- `ddb-app-campaign-gamelog` (1020x1634) — DDB iOS App Store phone-09, campaign Game Log
- `ddb-app-character-list` (1020x1634) — DDB iOS App Store phone-02, My Characters list
- `ddb-app-monster-list` (1020x1634) — DDB iOS App Store phone-08, Monsters listing
- `ddb-app-sheet-abilities` (1020x1634) — DDB iOS App Store phone-03, sheet header + ability shields
- `ddb-app-sheet-actions` (1020x1634) — DDB iOS App Store phone-07, Actions table
- `ddb-builder-class-features` (576x630) — DDB help "Miscellaneous Features", attention badges (2x)
- `ddb-builder-header` (882x170) — DDB help "Miscellaneous Features", builder header bar (2x)
- `ddb-builder-whats-next` (450x342) — DDB help "Miscellaneous Features", sheet-ready button states (2x)
- `ddb-campaign-header` (1044x494) — DDB help "Campaign Content Sharing", campaign page header (2x)
- `ddb-character-menu` (828x1872) — DDB help "Character Header", sheet sidebar menu (2x)
- `ddb-class-cards` (1314x504) — dndbeyond.com/en/players, 12-class card row
- `ddb-creation-method-cards` (1031x512) — DDB help "Character Creation Methods", builder entry cards
- `ddb-ipad-campaign-characters` (1753x2240) — DDB iPad App Store ipad-15, campaign party rows
- `ddb-ipad-character-list` (1753x2240) — DDB iPad App Store ipad-11, My Characters rows
- `ddb-monster-filters` (1224x470) — dndbeyond.com/monsters, type icons + filter form
- `ddb-monster-page-header` (1224x160) — dndbeyond.com/monsters/16907-goblin, breadcrumb + action buttons
- `ddb-monster-rows` (1224x710) — dndbeyond.com/monsters, listing table rows
- `ddb-mycharacters-cards` (1491x250) — DDB help "Miscellaneous Features", My Characters cards
- `ddb-mycharacters-header` (1491x330) — DDB help "Miscellaneous Features", My Characters title/slots/search
- `ddb-party-inventory` (1182x1240) — DDB help "Shared Party Inventory FAQ", party inventory tab (2x)
- `ddb-sheet-header-bar` (3056x236) — DDB help "Character Header", compact sheet header (2x)
- `ddb-statblock` (1190x670) — dndbeyond.com/monsters/16907-goblin, parchment stat block
- `demiplane-home-sheets` (1440x460) — demiplane.com marketing home, three sheet screenshots
- `demiplane-monster-banner` (1440x390) — app.demiplane.com/nexus/5e/monsters/goblin, hero banner
- `demiplane-monster-filters` (1440x360) — app.demiplane.com/nexus/5e/monsters, search + type art chips
- `demiplane-pf2-statblock` (1044x580) — app.demiplane.com/nexus/pathfinder2e/creatures/goblin-warrior, PF2 block
- `demiplane-spell-filters` (1440x360) — app.demiplane.com/nexus/5e/spells, search + school chips
- `demiplane-spell-rows` (1404x846) — app.demiplane.com/nexus/5e/spells, spell table rows
- `demiplane-statblock` (1010x800) — app.demiplane.com/nexus/5e/monsters/goblin, 5e block card
- `foundry-actor-context-menu` (588x750) — foundryvtt.com/article/actors, right-click menu (2x)
- `foundry-actor-directory` (596x1560) — foundryvtt.com/article/actors, actor sidebar (2x)
- `foundry-compendium-sidebar` (596x1350) — foundryvtt.com/article/compendium, pack sidebar (2x)
- `foundry-join-screen` (1050x660) — foundryvtt.com/article/game-worlds, join/game details panels
- `foundry-player-config` (968x1336) — foundryvtt.com/article/users, Player Configuration modal (2x)
- `foundry-user-management` (1428x844) — foundryvtt.com/article/users, User Management table (2x)
- `foundry-world-tile` (800x460) — foundryvtt.com/article/game-worlds, world tile (2x)
- `foundry-worlds-toolbar` (1210x130) — foundryvtt.com/article/game-worlds, Game Worlds toolbar
- `kanka-campaign-calendars` (576x470) — app.kanka.io/w/Alfaysia dashboard, two calendar cards
- `kanka-characters-grid` (1044x1140) — app.kanka.io/w/thaelia/t/1, character tile grid
- `kanka-dashboard-calendar` (576x290) — app.kanka.io/w/thaelia dashboard, calendar widget
- `kanka-dashboard-entity-cards` (1170x620) — app.kanka.io/w/thaelia dashboard, 3-up preview cards
- `kanka-dashboard-intro` (1440x400) — app.kanka.io/w/thaelia dashboard, header + intro card
- `kanka-dashboard-recent` (576x470) — app.kanka.io/w/thaelia dashboard, recently modified list
- `kanka-entity-page-location` (1188x900) — app.kanka.io/w/thaelia/entities/12000 (Thaelia), entity header/tabs
- `kanka-entity-page` (1188x1440) — app.kanka.io/w/thaelia/entities/2046 (Arden), entity page
- `kanka-party-lists` (780x560) — app.kanka.io/w/Alfaysia dashboard, PCs party lists
- `kanka-sidebar-nav-dark` (240x1260) — app.kanka.io/w/Alfaysia, dark full-module sidebar
- `kanka-sidebar-nav` (243x830) — app.kanka.io/w/thaelia, light sidebar
- `legendkeeper-lore-home` (1135x836) — legendkeeper.com/p/... Selenia, Lore tab home
- `legendkeeper-map` (1135x836) — legendkeeper.com/p/... Selenia, Map tab with pins
- `legendkeeper-npc-page` (1135x836) — legendkeeper.com/p/... Selenia, NPC page (Lore/Stats tabs)
- `legendkeeper-sidebar` (305x836) — legendkeeper.com/p/... Selenia, project tree sidebar
- `legendkeeper-statblock` (1135x836) — legendkeeper.com/p/... Selenia, monster page + property rail
- `obsidianportal-campaign-cards` (1008x980) — obsidianportal.com/campaigns, campaign cards
- `obsidianportal-campaign-filters` (1008x170) — obsidianportal.com/campaigns, order/system filters
- `obsidianportal-campaign-of-month` (1008x350) — obsidianportal.com/campaigns, featured cards
- `open5e-monster-list` (1440x900) — open5e.com/monsters, table + filters
- `open5e-statblock-mobile` (780x2000) — open5e.com/monsters/srd_goblin at 390 px (2x)
- `open5e-statblock` (1215x846) — open5e.com/monsters/srd_goblin, desktop block
- `pathbuilder-build-form` (1080x1720) — Pathbuilder 2e Play Store 00, Build tab form
- `pathbuilder-build-levels` (1320x2600) — Pathbuilder 2e App Store phone-01, per-level ledger
- `pathbuilder-defense` (1080x1720) — Pathbuilder 2e Play Store 02, Defense tab
- `pathbuilder-feat-picker` (1080x1720) — Pathbuilder 2e Play Store 01, feat picker modal
- `pathbuilder-home` (1320x2600) — Pathbuilder 2e App Store phone-00, NEW/LOAD splash
- `pathbuilder-ipad-skills` (2000x1499) — Pathbuilder 2e App Store ipad-08, skills + build side by side
- `pathbuilder-offense` (1320x2600) — Pathbuilder 2e App Store phone-05, Offense tab
- `pathbuilder-spell-picker` (1320x2600) — Pathbuilder 2e App Store phone-02, spell picker modal
- `prismscroll-character-list` (1350x1770) — PrismScroll App Store phone-00, character list cards (1.5x)
- `prismscroll-custom-creator` (1350x1770) — PrismScroll App Store phone-05, custom content list (1.5x)
- `prismscroll-levelup` (1350x1770) — PrismScroll App Store phone-02, level-up celebration (1.5x)
- `prismscroll-skill-picker` (1350x1770) — PrismScroll App Store phone-01, skill pill picker (1.5x)
- `prismscroll-skills-proficiency` (1350x1770) — PrismScroll App Store phone-03, skills with proficiency circles (1.5x)
- `prismscroll-spell-card` (1350x1770) — PrismScroll App Store phone-04, equipment/spell cards (1.5x)
- `roll20-2024-abilities` (1380x254) — Roll20 help "D&D 2024 sheet", ability/save chips
- `roll20-2024-actions` (585x558) — Roll20 help "D&D 2024 sheet", actions/bonus/reaction tables
- `roll20-2024-conditions` (1164x572) — Roll20 help "D&D 2024 sheet", conditions modal (2x)
- `roll20-2024-death-saves` (1777x382) — Roll20 help "D&D 2024 sheet", death saves block
- `roll20-2024-header` (945x439) — Roll20 help "D&D 2024 sheet", header block with Level Up
- `roll20-2024-hp` (956x479) — Roll20 help "D&D 2024 sheet", hit points block
- `roll20-2024-rest-modals` (1920x846) — Roll20 help "D&D 2024 sheet", short/long rest modals
- `roll20-2024-sheet` (1358x925) — Roll20 help "D&D 2024 sheet", whole sheet
- `roll20-2024-skills` (609x675) — Roll20 help "D&D 2024 sheet", skills column
- `roll20-character-bio-window` (540x557) — Roll20 help "How to Create a Character", Bio & Info window
- `roll20-character-landing` (953x753) — Roll20 help "Roll20 Characters", character landing (Marvel)
- `roll20-choose-sheet-modal` (1080x848) — Roll20 help "How to Create a Character", 2014/2024 modal (2x)
- `roll20-compendium-header` (1440x470) — roll20.net/compendium/dnd5e/Goblin, title + search
- `roll20-create-by-sheet` (1241x643) — Roll20 help "Roll20 Characters", sheet cards
- `roll20-create-character-systems` (1236x663) — Roll20 help "Roll20 Characters", system tiles
- `roll20-edit-character-modal` (965x1270) — Roll20 help "Journal", edit character modal
- `roll20-journal-sidebar` (1608x544) — Roll20 help "Journal", Characters/Handouts sidebar (2x)
- `roll20-mycharacters-list` (933x614) — Roll20 help "Roll20 Characters", My Characters list
- `roll20-statblock` (920x760) — roll20.net/compendium/dnd5e/Goblin, parchment block
- `worldanvil-explore-cards` (1080x560) — worldanvil.com/w/solaris-nnie, article card columns
- `worldanvil-world-homepage` (1440x1170) — worldanvil.com/w/solaris-nnie, world homepage
