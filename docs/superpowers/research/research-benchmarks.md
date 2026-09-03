# Benchmark research: digital companions for tabletop RPG play

Prepared 2026-09-02 for the d20 Folio from-scratch premium redesign (free, EN/IT, offline-first PWA for D&D 2024: character sheet + live combat companion at a physical table + campaign management + rules compendium; no VTT, no dice rolling).

Method: 60+ web sources fetched or surfaced via search between 2026-09-02 searches (official changelogs and help centers, app-store pages, independent reviews, forum/community threads, design analyses and GDC-talk coverage). Reddit is not crawlable by this tool, so "community sentiment" leans on official forums (D&D Beyond, Demiplane, Larian, Blizzard, Steam), Trustpilot/app-store excerpts and blogs that quote community feedback. Every claim below is traceable to the Sources list; where a statement is my own design reading of a product rather than something a source says, it is marked **[designer observation]**.

---

## 1. Executive summary — what the best do that d20 Folio must match (ranked)

1. **Click-to-know everywhere, in place.** Demiplane's "Click-To-Know" (click any sheet element to see its rule, tooltips and cross-references without leaving the sheet) is the most-cited reason its sheets are considered best-in-class, and D&D Beyond's 2018 revamp introduced the same idea as "Snippets" + a swipe-in sidebar. Foundry, Roll20 and BG3 all converge on "the rule lives under the number". d20 Folio already treats unexplained jargon as a defect; the benchmark bar is that _every_ number, condition, action and slot is a live affordance that explains and (where deterministic) acts.
2. **Combat essentials above the fold, everything else collapsible.** Roll20's 2024–25 sheet rebuild is explicitly "the most important numbers in the most readable position" with collapsible skills/AC/speed, card-vs-list density toggles and per-section filters; Shard puts AC/Initiative/Hit Dice/HP/Temp HP/Rest in one stats bar under the header; the physical 2024 sheet moved skills directly under abilities and condensed spells to one side. The mobile D&D Beyond app puts HP/healing, Conditions and Rest as the _large buttons at the very top_ of the sheet.
3. **One entity-generic turn tracker with live HP/conditions and a player-facing view.** Shieldmaiden is the DM-community reference: initiative + HP + conditions + reminders (concentration, per-turn damage) + damage-type defenses + undo log + a separate live "initiative screen" for the table. D&D Beyond's own Maps tracker is criticized precisely for being "static" (no HP editing, no stat block, no dice from the tracker) and for pushing theatre-of-the-mind DMs into a map tool. BG3's top-of-screen portrait strip with linked adjacent turns is the visual ceiling for "whose turn is it".
4. **Reactions and interrupts as explicit prompts, not hidden state.** BG3's Reactions tab (enable + "Ask" per reaction, cost shown under the name, popup on trigger) and the Solasta-style "use reaction Y/N" prompt are what players cite as "truer to D&D". Because d20 Folio never rolls, the analogue is a deterministic _prompt_ ("Opportunity attack available — Shield? Absorb Elements?") with undo.
5. **Density is a user setting, not a designer decision.** Roll20 (card/list, collapsible sections), Foundry v13 (UI scale, opacity, fade-at-rest, dark/light auto), Veilguard (text size, opacity, colour, HUD show/hide), Diablo IV complaints ("nested menus and windows galore", console-first parity on PC), and Metaphor's designer acknowledging "overstimulating" menus all point the same way: premium = configurable calm, not maximal chrome.
6. **Level-up and builder share the sheet's architecture.** Roll20's stated goal is that "the builder doesn't seem like a completely different experience than just playing"; Demiplane's top Daggerheart complaint is "no convenient place to click and level up from the CHARACTER SHEET page"; D&D Beyond is shipping "Quickbuilder" (March 2026) as "a streamlined, art-forward way to build a level 1 character in just a few guided steps" and a ground-up mobile app "to make in-person play easier" (early 2027). d20 Folio must ship level-up as an in-sheet flow, and creation as guided-but-skippable.
7. **Offline is a differentiator that the incumbents still cannot promise.** The D&D Beyond _browser_ sheet is not offline (only the app is), sheets are reported "slow with every click" in 2025, Notion has "no support for running offline", World Anvil is "slow… especially during play". LegendKeeper is praised for instant loads and offline support. A PWA that opens the sheet in under a second offline at the table is a headline feature, not plumbing.
8. **Campaign views that show the party as people, not a table of IDs.** Multiloop's "Player Perspectives" (players write their own recaps, visibility-controlled), Obsidian Portal's Adventure Log + GM-only secrets, Kanka's per-entity visibility layers, and Character Companion's "see teammates' health and active effects" are the patterns; World Anvil's "cliff" learning curve is the anti-pattern.
9. **Compendium reading = the book, linked.** Demiplane's "fully linked digital compendium with tooltips", 5e Bestiary's "mirrors the official Monster Manual layout" praise, D&D Beyond's "Digital reader" all say: readers want the _reference form_ (stat block / spell block) with hyperlinks, filters and a searchable index — not prose reformatted into cards.
10. **A signature visual identity that is still calm.** Persona 5/Metaphor prove that a single dominant hue + gaze-guiding lines + motion tied to meaning make menus feel premium; Foundry v13 and Elden Ring prove that "minimal at rest, larger when in use" reads as modern. Transfer the _system_ (one accent, strong type hierarchy, purposeful motion, information-first framing), not the _skin_ (parchment, faux-leather, medieval fonts — the "dark medieval aesthetic" that BG3 can afford only because it is a AAA game).

---

## 2. Per-benchmark sections

### 2.1 D&D Beyond (web sheet, mobile app, Maps, Sigil, encounter builder, campaigns)

**What it does.** Official WotC toolset: character builder + digital sheet, compendium reader, encounter builder, Maps 2D VTT (browser), campaigns, and a mobile app (character sheet, dice, spells & books, offline). Sigil (Unreal 5 3D VTT, PC only) was sunset on 2025-10-24 with servers closing 2026-10-31; Maps continues. On 2026-02-26 WotC announced a rebuild of the backend engine ("We've been slapping band-aids on the current backend that was built over a decade ago"), a modernized character builder starting with **Quickbuilder** (March 2026), Maps DM tools ("Honda Accord, not F-16"), homebrew (monsters, magic items first), localization, and — at Gen Con 2026 — an all-new mobile app "built from the ground up to make in-person play easier", "designed to surface the right roll or reference quickly during a session", early version planned for early 2027, plus "Mapless DM tools" (encounter management without Maps) as a "highly-requested feature".

**Visual language.** Red/black brand chrome, white sheet panels on desktop with parchment-toned "themes", optional art "backdrops" (desktop only), portrait "frames", an "Underdark Mode" that inverts white-on-black panels. **[designer observation]** The sheet's body copy is a humanist sans, headers in a condensed display face; stat boxes use ornamental shield/rounded-rect frames; density is high (the 2018 revamp explicitly prioritized "utilizing the space much more effectively" on desktop because "almost 70% of the sheet usage is on desktop resolutions").

**Navigation / IA.** Desktop: header (name/class/level/XP), ability score row, saving throws + senses + proficiencies left column, combat block (AC, Initiative, Speed, HP with temp/max, hit dice, death saves, conditions, rest), then a tabbed area (Actions, Spells, Inventory, Features & Traits, Description/Background, Notes, Extras). A slide-in **sidebar** shows detail for anything clicked ("click or tap it to reveal the new sidebar… swiped in and out on mobile and dismissed or docked on desktop"), with "Snippets" (short rules summaries) so the user rarely needs the full text. Mobile app: first screen shows "Abilities, Saves and Senses" with core stats; **large buttons at the top for Hit Points & healing, Conditions, and a campfire Rest icon**; a **grid icon** (nine red boxes in the 2020 review) opens Equipment, Features & Traits, Spells, Attacks, etc.; a speech-bubble icon opens the Game Log; a D20 icon bottom-right opens digital dice. Actions tab is filtered by Actions / Bonus Actions / Reactions sub-tabs; spells and inventory use the same filter-tab approach.

**Character sheet.** Fully automated; sheet themes/backdrops; PDF export still 2014-style (users complained in Jan 2025). Users praise: automation, "pretty much all the details you could want easily accessible", multiclass/UA handling. Users hate: "all character sheets and character editing takes an age with every click" (2025), Features & Traits "cluttered with WAY too many unnecessary information for a lower-level character… there should at least be an option to hide it", the sheet not adopting the 2024 layout ("a serious miss"), app not letting you edit characters (2020 review; later partially addressed), app "the same bland character theme no matter which character", tablet app is "a resized interface designed for phones", app sometimes not syncing changes for hours.

**Combat / turn tracking.** Legacy Encounter Builder + Combat Tracker: "clean and minimalistic", but only one front-end update in 18 months, no ally NPCs, no conditions/reminders, HP for monsters only, awkward navigation (existing encounters reachable only via the new-encounter breadcrumb), and WotC declined to update it to 2024 CR maths, redirecting DMs to Maps. Maps combat tracker (2024-10-29): "Start Combat" turns the encounter menu into an Initiative Order menu (names incl. hidden, AC, HP, initiative), auto-updates from players' sheets, player view shows initiative "as image flags along the top of the screen", Next button with round/turn counts, duplicates suffixed A–Z. Criticism: "relatively static. You can't adjust a monster's Hit Points, see their stat block, or roll any dice"; 55-minute inactivity timer kills play-by-post; stat blocks "require flipping between multiple pages on small screens".

**Resources.** HP/temp HP/hit dice/death saves in the combat block; spell slots as pip rows per level in Spells tab; conditions via a modal/sidebar list; long/short rest dialogs. Mobile makes HP/Conditions/Rest the primary buttons.

**Compendium.** Digital reader per purchased book, listings for spells/monsters/items with filters; monster stat blocks paginate badly on phones. The 2026 rebuild promises a "new structured data format… quicker load times, more accurate rules lookups and smarter search results".

**Campaign / party.** Campaign page lists characters with a compact card (HP/AC/passive perception), content sharing, Game Log. Users want the tracker to "link instanced characters to the controlling player's Character Sheet in real time".

**Creation / level-up.** Multi-step builder (race/species → class → abilities → description → equipment), level-up via the same builder; Quickbuilder (March 2026) is the response to "too many steps".

**Borrow (3).** (a) Slide-in detail sidebar + Snippets pattern for any tapped element. (b) Mobile-first primary actions: HP/heal, Conditions, Rest as the top buttons, the rest behind one grid. (c) Player-facing initiative "flags" strip that hides unrevealed creatures.
**Avoid (2).** (a) A tracker that cannot edit HP or show the stat block in place. (b) Tab clutter that cannot be hidden per user (Features & Traits complaint) and a tablet layout that is merely a stretched phone.

### 2.2 Demiplane (NEXUS: Pathfinder, Daggerheart, Cyberpunk RED, Marvel, VtM, ALIEN, Cosmere, Fallout; D&D NEXUS reader via Roll20)

**What it does.** Official digital companions per publisher: digital reader + rules/lore compendium + character builder + interactive sheet, on "mobile, laptop, desktop, and tablet" with "no app required". Roll20 acquired Demiplane in June 2024; Roll20 ↔ Demiplane character-sheet integration is in beta (Starfinder 2e first, Pathfinder 2e next; Daggerheart NPC sheets + compendium July 2025). 500,000 Daggerheart characters created by Gen Con 2025. Business model: buy the book to unlock its options; users on ENWorld asked why they would "pay to unlock every book and subscribe" when Pathbuilder is free.

**Visual language.** **[designer observation]** Deep charcoal/near-black canvas with per-game accent (Pathfinder gold, Daggerheart teal/rose), large rounded cards, soft elevation, generous white space, a geometric sans for numbers and a readable serif-free body; art-forward headers (character portrait hero) and pill-shaped chips for traits/conditions. Sources describe it only as a "gorgeous UI" (Daggerheart marketing) and note one reviewer wishing the Marvel sheet "were less cluttered and provided more space for handwriting relevant information rather than fragments of core rulebook text".

**Navigation / IA.** Sheet with a persistent **management sidebar** ("click on your character's name to open the management sidebar", sharing options at the bottom); builder as a separate section; level-up lives in the builder (Daggerheart user: "There is no convenient place to click and level up from the CHARACTER SHEET page" without going sidebar → builder → level-up). Tabs for journal/notes; journal sorts by "latest change made". "Edit by Others" lets a GM edit a player's sheet or share one character across players.

**Character sheet.** "Click-To-Know" on nearly every element; conditions tracked on-sheet; PDF export for several systems; interactive tooltips in the compendium ("Learn the game quickly and find information quickly so you can keep the game rolling"); Daggerheart sheet shows domain cards as cards. Praise: rules integration for new players and GMs ("instantly see the rules for those less common class features"), "gorgeous UI", responsiveness to feedback. Hate: no homebrew/custom cards (Daggerheart, 2024–25; homebrew tools "in progress"), tiny text limits (35-char experience field), no background field outside journal, level-up buried.

**Combat / turn tracking.** None native on the sheet; Roll20 VTT handles initiative; Daggerheart VTT update (Aug 2025) added a fourth token bubble/bar for Health/Hope/Fear/Armor and a "Range Scale" setting to keep "focus… on storytelling instead of number-crunching".

**Resources.** Trackers as bars/pips on the sheet; ability toggles (Marvel), roll buttons for Frenzy/Remorse (VtM).

**Compendium.** "Fully linked digital compendium with tooltips", cross-links and filterable perks/locations/mechanics; digital reader reproduces the book.

**Campaign / party.** Daggerheart NEXUS ships "GM Tools" (May 2025); character sharing; no campaign wiki.

**Creation / level-up.** Guided builder: "build a character in less time than it takes to grab a coffee… explore as deeply as you like; we give you access to all the details without forcing you to wade through them".

**Borrow (3).** (a) Click-To-Know as the universal affordance. (b) Builder copy principle: quick path by default, depth on demand, never forced. (c) GM-editable sheets and "trackers" as a generic pips/bars primitive.
**Avoid (2).** (a) Level-up hidden behind the sidebar → builder detour. (b) Sheet text that is "fragments of core rulebook text" rather than the player's own decisions.

### 2.3 Roll20 (Roll20 Tabletop / Jumpgate, Beacon sheets, Roll20 Characters, new D&D sheet)

**What it does.** Browser VTT; "Roll20 Tabletop" (ex-Project Jumpgate) became the only way to create new games in Nov 2025; **Roll20 Characters** (beta Dec 2024) lets you "create, manage, and play characters" outside the VTT for "virtual, in-person, or both"; the new D&D sheet + builder (announced 2024-02-12, alpha 2024-06-18) supports 5e 2014 and 2024 on the Beacon SDK.

**Visual language.** **[designer observation]** The Jumpgate refresh moved from grey-beige 2010 chrome to a dark slate UI with a slimmer left toolbar, rounded panels and a bolder sans; the new D&D sheet uses a cream/ivory sheet on dark app chrome with red accents, large stat "coins" across the top. Sources say the key idea is "a spiffy new look, one that places the most important numbers in the most readable position".

**Navigation / IA.** Sheet: prominent top row (AC, ability scores, initiative), collapsible sections for skills/AC/speed "to focus on the things you need to use in your game", dedicated **Spells tab** with level filters and card/list view toggle, inventory filter by item type, settings toggle per window (optional rules like Honor/Sanity live "within the ability score setting panel"), manual modifier adjustments that "automatically propagate without losing automation". VTT: undo/redo, copy/paste, right-click menus, smoother pan/zoom.

**Creation / level-up.** Builder "shares consistent architecture" with the sheet ("the builder doesn't seem like a completely different experience than just playing"); premade characters available. Beta criticism (Aug 2024): "Every existing NPC that I open requires the character to be rebuilt", NPC attack rolls dropped bonuses, missing toggles (Tasha's ASI alternatives, full-caster toggle). A D&D Beyond forum user described Roll20's older sheets as "pretty awful, especially once I had used DDB character sheets" — the redesign is a catch-up.

**Combat / resources.** Turn tracker in the VTT; sheet-side spell slots and "effect toggles" (cited positively by DDB users).

**Borrow (3).** (a) Card/list density toggle per section. (b) Collapsible sections with per-window settings gear. (c) Builder and sheet as one architecture.
**Avoid (2).** (a) Migration that forces rebuilding existing characters (d20 Folio has live users and a codec — never regress this). (b) Shipping a redesign with automation regressions (dropped bonuses).

### 2.4 Foundry VTT v13 (ApplicationV2, Theme V2)

**What it does.** Self-hosted VTT; v13 (stable 2025-04-27, 13.347 on 2025-08-07) converted every app to ApplicationV2 and shipped Theme V2 with automatic dark/light from OS preference, world-level overrides, UI scale, opacity and fade controls, and CSS Layers for module styling.

**Visual language.** "More minimalistic, with UI elements having a smaller profile and fading away when 'at rest' – while elements are slightly larger and more spaciously arranged when actively in use"; sidebar is a "collapsible cabinet occupying full vertical space, defaulting to collapsed to keep focus on the canvas"; centered macro hotbar; chat cards "without backgrounds"; roll-mode dropdown replaced by four icons; chat entry visible on every sidebar tab; brief notifications tray; "smooth modern animations" without performance cost. **[designer observation]** Dark translucent panels with a thin light border, Signika-style humanist sans, gold/amber accent for active states.

**Navigation / IA.** Left: scene controls (smaller, more spacing); top: scene navigation collapsed into a menu; right: sidebar cabinet (chat, combat, scenes, actors, items, journal, tables, playlists, compendia, settings); combat tracker pops out on right-click. The popularity of **Carolingian UI** (a "sleek minimalist UI overhaul… removing clutter", horizontal actor-sheet tabs, per-section toggles, floating chat, player avatars) shows users still want _more_ calm and per-element control than core offers.

**Combat / turn tracking.** Sidebar combat tracker with initiative list, current-turn highlight, round counter, D20 to roll initiative, token "sword and shield" toggle; v13 added a combat "turn marker" on the canvas. dnd5e system sheets show effects/conditions on the sheet and tokens.

**Borrow (3).** (a) "Minimal at rest, larger in use" as an explicit motion/density principle. (b) OS-driven theme with world/user override + scale/opacity settings. (c) A combat panel that can be docked or popped out (for a second screen at the table).
**Avoid (2).** (a) A sidebar that assumes a large landscape canvas — d20 Folio's primary surface is a phone. (b) Leaving so much default clutter that users need an overhaul module.

### 2.5 Alchemy RPG

**What it does.** Narrative-first browser VTT: animated scene art + soundscapes, a "Player Bar", tabs (Actions, Skills & Abilities, Equipment, Spells, Trackers), Tactical Mode grid, "Zen Mode" (Ctrl-Shift-Z hides all UI), System Builder for custom games.

**Visual language.** Full-bleed moving scene art as the canvas; UI as translucent dark panels at the corners (top-left Journal & Notes; top-middle scene name; top-right Party/NPC/Spectator; bottom-right Handouts; bottom-middle settings/dice/audio; bottom-left Actions/Skills/Equipment/Trackers; center Player Bar). HP shown as two tracker elements on the Player Bar; d20 button held-and-dragged for advantage/disadvantage.

**Praise.** "clean and easy to navigate", "Clicking through the different menues, switching between characters, and most importantly, rolling" are easy; "doesn't distract from the narrative"; character creation "very easy, especially for my less savvy players"; GM can edit player sheets.
**Hate.** "why doesn't it just roll if you click on the skill? Why instead does it just load the dice roller?"; equipment toggles "so small that it really is difficult to see"; sheet split "into several tabs which some find not very user friendly"; no initiative for some systems; cramped for 30-skill games; incomplete paid modules.

**Borrow (3).** (a) A "Zen/table mode" that strips chrome to the essentials. (b) Trackers as first-class pips/bars on the always-visible player bar. (c) Scene mood (art + optional audio) as the campaign's emotional layer.
**Avoid (2).** (a) Two-step interactions where one tap should act. (b) Micro toggles below touch-target size.

### 2.6 Shard Tabletop

**What it does.** 5e VTT + sheet with Kobold Press content; the sheet is "a giant, scrolling piece of paper" that "works basically the same on a desktop, phone or tablet", with a sticky nav bar (Top, Weapons, Spells, Features, Equipment, Companions, Traits, Log).

**Layout.** Top: race/background/class/XP (clickable) → **stats bar: AC, Initiative, Hit Dice, Hit Points, Temp HP, Rest** → ability scores, saves, skills, tools (skills/saves in a table since the 2023 refresh) → Death Saves tracker appears only at 0 HP → Weapons (click hit/damage) → Spells with a Cast column that auto-spends slots or offers options → Features → Equipment (coins, counts, usage) → Companions (scale with level) → Log. Rest dialogs list recoverable features and "SPEND HIT DIE". Conditions and shape changes via the character menu with automatic stat/token updates. Reviewer (Gnome Stew, 2024-10-07): tracks spell durations and concentration automatically; condition icons on tokens; "you can get lost in the options, but… it's a matter of understanding terminology".

**Borrow (3).** (a) One long scroll with a sticky section nav — the same IA on every device. (b) Contextual widgets that appear only when relevant (death saves at 0 HP). (c) Rest dialog that previews what will be recovered.
**Avoid (2).** (a) Terminology-driven learning curve. (b) No visual differentiation at scale — a long scroll needs strong section anchors.

### 2.7 Owlbear Rodeo 2

**What it does.** Deliberately minimal browser VTT: maps, tokens, fog, dice; extensions for everything else (official Initiative Tracker popover with add/remove via context menu, click the number to edit, arrow to advance; SIT and Battle Board add rounds/effects/HP). 2.0 was "a lot more compact horizontally which will help the UI scale better on phones".

**Design philosophy (blog "Designing for Fun", 2023-07-01).** Consider "motion of the design during the concept phase"; the 2.0 dice roller "removed a lot of the fun" by prioritizing predictability, so it was rebuilt with expand → shake → throw, adding friction on purpose because it "mirrors real-world table behavior". Reviews: up and running "in about 10 minutes"; complaints: no character sheet integration, no roll history, unintuitive token removal.

**Borrow (3).** (a) Ruthless scope + extension seams (d20 Folio's "complements the physical table" posture). (b) Consider motion at concept time. (c) Horizontal compactness for phones.
**Avoid (2).** (a) Feature creep perceived by the minimalist base. (b) Removing delight in the name of predictability.

### 2.8 Fantasy Grounds Unity, DiceCloud, Pathbuilder 2e (alternatives)

- **Fantasy Grounds Unity**: strongest 5e automation, but "curse the UI": "many features hidden away behind undocumented key controls", "clunky in operation with missing clicks", no standard text selection, minimize via right-click menus, no undo; desktop client only. Pattern to avoid: power hidden behind idiom.
- **DiceCloud v2**: free, open-source, "very clean, and customizable interface"; formula-driven so spell effects become "a one button click"; "it will take you a little longer than average to set up your character, but it will be worth the effort". Pattern to borrow: effect toggles as first-class objects; avoid: setup tax.
- **Pathbuilder 2e**: free, 4.79/5 from 5.5k ratings; "UI is pleasant and succinct", "easy to learn, quickly updated", exports PDF/JSON. The clearest evidence that a free, fast, mobile-first builder wins a community even against the official paid product.

### 2.9 Campaign tools: Kanka, World Anvil, Obsidian Portal, LegendKeeper, Notion, Multiloop

| Tool                 | Model                                                                                                                                                                                                                                      | UI reading                                                   | Praise                                                                                                                 | Hate                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kanka**            | Structured wiki, 20+ entity types, custom types, relations, calendars, per-entity visibility layers; open source, unlimited free tier                                                                                                      | "utilitarian", "straightforward wiki interface"              | "strongest cross-linking of any wiki tool at this price"; flexible; no lock-in                                         | "complexity from flexibility"; basic maps (pins/layers, no nested zoom); "limited presentation layer… not particularly engaging for player exploration" |
| **World Anvil**      | Article encyclopedia + publishing suite; Oct 2025 release added new dashboard, full-screen article editing, category tree, advanced filters; Apr 2024 added side menus replacing list pages, Ctrl+K "continue working", notification modal | dense, many menus; light-theme legibility fixes needed       | "The scope is genuinely impressive"; "I can now just write and reference stuff all at once"                            | "The learning curve isn't just steep; it's a cliff"; "slow page loading, especially during play"; mobile "cluttered"                                    |
| **Obsidian Portal**  | Campaign site: Adventure Log (blog), wiki, NPC tracker, GM-only secrets, forum, maps                                                                                                                                                       | web-2.0 era                                                  | "setting up a campaign… is refreshingly easy"; wiki "particularly well-implemented"; secrets + logs "endlessly useful" | "no direct way of returning to your own campaigns"; crunch-before-fluff field order; date "at the very bottom of the page"                              |
| **LegendKeeper**     | Map-first workspace; Jan 2026 map tool: regions, paths with distances, labels by zoom, pins, right-click radial menu, multiplayer cursors, map embed blocks that auto-center on the page's pin; whiteboard                                 | "clean, professional interface prioritizing speed"; polished | "The speed is genuinely impressive"; offline support; nested Google-Maps-like zoom                                     | no real free creation tier; single-developer risk; limited features                                                                                     |
| **Notion templates** | Databases for NPCs/locations/items/sessions; Lazy DM 8-step session template; gallery views; @-mention linking                                                                                                                             | generic                                                      | "simple to add and change"; evocative cover images                                                                     | "no support for running offline" — "a game-breaker for some people"; requires manual structuring                                                        |
| **Multiloop** (2026) | Campaign-native relationship board, typed connections, faction clustering, "Player Perspectives" (players write recaps separately with visibility controls), full session workflow                                                         | modern                                                       | only tool with a real player-facing recap surface                                                                      | new/small                                                                                                                                               |

**Borrow (3).** (a) Per-entity visibility (GM-only vs party) as a primitive, with an Adventure Log/Chronicle that players can contribute to. (b) Instant load + offline (LegendKeeper) as the felt quality of "premium". (c) Map/entity embeds that auto-focus (LegendKeeper) — the same idea applies to "this NPC → its stat block → its location".
**Avoid (2).** (a) The World Anvil "cliff" of configuration before the first useful page. (b) Presentation-poor player views (Kanka) — the party page is marketing (see d20 Folio share-surface rule).

### 2.10 Video-game UI craft (benchmark ceiling)

**Baldur's Gate 3.** Top-of-screen initiative strip of portraits (adjacent allied turns "linked" so you can switch freely; same-side equal initiatives merge into one turn); bottom action bar with four category filters (action, bonus action, spell slot, cantrip), lockable rows, consumables tray; portrait double-click centers camera; equipped gear sets; battle log records "damage, attacks, saving throws"; TAB opens party view with Inventory / Spellbook / Character Sheet tabs; Reactions tab with per-reaction Enable and "Ask" toggles, resource cost under the name, and a popup prompt on trigger. Players' debates: Solasta's grouped Action/Bonus/Reaction layout and "Cast Spell" list are "a list of all my options and then guides me" vs BG3's "customizable hotbars… less menu navigation"; complaints about the secondary icon overlaying the reaction icon and small reaction icons. UX-writing praise: "myriad choices that have to be communicated clearly and lengthy histories of magic rendered concise". Visual language: "dark medieval aesthetic", gold-on-charcoal, ornamental frames — **[designer observation]** affordable only because every screen is hand-composited art; on the web this reads as a skin.

**Diablo IV.** Two-section character screen (Character / Abilities), tabbed inventory (Equipment, Consumables, Quest, Aspects), materials separated "preventing inventory clutter", stats panel grouped Core/Offensive/Defensive/Utility, skill window with keyword search that highlights related skills. Complaints: "There is very little fluency between menus", "nested menus and windows galore", "in Diablo III you could tell which items were in which slots at a glance, whereas in Diablo 4 everything has equal weight", wide-monitor cursor travel; consensus blames console-PC parity. Lesson: equal visual weight = no hierarchy.

**Hades / Hades II.** Boons as cards with god colour-coding; HUD analyses aim to "minimize eye travel distance" and group "important combat resources"; Hades II criticisms: "thin lines and abundance of graphics making it challenging to identify selected items", vow names vs effects hard to distinguish, boon availability "very complicated" → community mod adds "clear colors that show which boons are already picked, available, or unavailable". Lesson: selection state and availability must be colour-and-shape explicit; thin decorative lines fail at small sizes.

**Elden Ring.** HUD "only displaying health and stamina bars when depleted"; menus "streamlined, focusing on essential information"; the 2022 designer debate: critics said it "poorly communicates icon meanings and status effects without consulting equipment descriptions"; supporters: intrusive UI "doesn't have to be in every game". Lesson: fade-at-rest is premium; unexplained icons are not.

**Dragon Age: The Veilguard.** Ability wheel "centered… instead of a bottom bar, which minimizes pause time and eye fatigue"; companions "move and react within menus"; accessibility from day one: text size/opacity/colour, HUD show/hide, wayfinding toggles, hold-to-tap conversion, audio cues for visual-only elements. Community: some found it "cluttered and visually noisy", PC Gamer told players to turn off wayfinding. Lesson: ship the calm-down settings; radial/centered actions reduce eye travel.

**Metaphor: ReFantazio.** Lead UI designer Koji Ise (ex web/advertising, first game) rejected five concepts that "looked cool, but they lacked emotional resonance" for a "Hyper-Stylish UI" with four pillars (instantly cool, emotional immersion, intrigue, shareability); paint splatter = turmoil, geometric lines = the protagonist's thinking, bird's-eye battle screen = the king's gaze; screens printed and pinned to a wall for cohesion; menus use "character body parts as navigation elements" (Vitruvian Man); Ise concedes players find menus "overstimulating" and accessibility options are needed. GDC 2025 talk "From 'Persona' to 'Metaphor: ReFantazio'" is public.

**Persona 5.** One dominant colour (red) with "no sub-colors other than in HP/MP", white "central lines" that guide the gaze, "changes in the angle and contrast of menus… to provide easy context", bright vs dim lighting for priority, 3D poses baked to 2D for menu motion, pixel-level paper specs; concept "pop punk". Born from a budget crisis: UI turned from "unsung hero" to "strong assertive hero".

**What transfers to a web app without becoming a fantasy skin.**

1. One dominant accent + neutral canvas (Persona rule) — d20 Folio's accent for "this matters now" (your turn, concentration, 0 HP), never decorative.
2. Gaze lines and angle/contrast as hierarchy — in CSS terms: a single strong divider/rule that leads to the primary number, lighter weight for everything else.
3. Meaning-bound motion — animate state changes (HP delta, slot spent, turn advance), never idle ornament; Foundry's "smaller at rest, larger in use".
4. Initiative as a portrait strip with linked groups (BG3) — works with plain avatars and a 2px accent underline.
5. Reactions as explicit "Ask" prompts with the cost visible (BG3/Solasta).
6. Colour-coded availability (Hades mod lesson): available / spent / unavailable must differ in fill _and_ shape, not just hue.
7. Category filter chips for actions (Action / Bonus / Reaction / Free) at the bottom edge where thumbs live (BG3 bar → mobile).
8. Accessibility knobs as product features (Veilguard).
   What does _not_ transfer: gold filigree, parchment, blackletter, faux-leather panels, 3D dice theatre, full-bleed character renders behind text (Diablo IV's model-first inventory was criticized for reducing legibility).

### 2.11 Indie companions, trackers and PWAs (2024–2026)

- **Shieldmaiden** (web, free core): "modern and clean design… logical hierarchical structure; effective color coding for button functions; 'efficiently' uses screen real estate"; conditions + custom reminders (concentration, per-turn damage), damage-type defenses auto-halving, transformations, combat log with undo, multi-target, a separate live initiative screen with atmosphere; DDB character import; "specifically designed for in-person D&D play". Reviewer: "No D&D combat tracker… come[s] close… when it comes to the sheer amount of features".
- **Improved Initiative**: D&D-themed, collapsible menus, but "unintuitive" pathing, round counter hidden in settings, "clumsy" HP editing that stacks fields, no undo.
- **Kobold+ Fight Club**: three-column (encounter | monster list | filters), "minimalist color scheme using greens and grays", "never requires page navigation", but "cluttered when glancing quickly"; adding D&D 2024 difficulty.
- **PrismScroll** (iOS, 4.6/5, 3.2k ratings): "mobile-optimized character sheet designed for single-handed table use", 2014+2024 rules, homebrew, "the creators have done an amazing job at making something as complex as D&D as simple as choosing options"; criticized for 2-character cap and paid export.
- **Character Companion** (free, husband-and-wife team): sheet + spellbook + "see teammates' health and active effects" via local session connectivity; separate phone/tablet layouts.
- **5e Bestiary**: praised because the interface "mirrors official Monster Manual layout" and is "refreshingly free of fat".
- **D&D Spellbook 5e**: "all the spells and information on spell slots are quick to access"; no ads.
- **Obsidian (notes)**: "intuitive note-taking without disrupting gameplay flow", plugin ecosystem.
- Open-source offline sheets (derikb/character-sheet-app, codemag single-HTML sheet, charactergenerator.github.io "works offline") exist but are utilitarian; none has been singled out in 2025–26 as a UI benchmark. No Product Hunt launch of a praised D&D character-sheet PWA surfaced in 2025 (only Dungeon Alchemist and AI portrait tools).

---

## 3. Precise layout teardowns

### 3.1 D&D Beyond digital sheet (desktop) and app (mobile)

Desktop (from help-center section list, the 2018 revamp notes and reviews; **[designer observation]** for exact placement):

1. **Header band**: portrait + frame left; name, "Level N Class (Subclass) • Species • Background"; XP bar; theme colour applied to the band; buttons for Manage/Share/Short & Long Rest.
2. **Ability scores row** (six coins: modifier large, score small) directly under the header.
3. **Left column**: Saving Throws (with condition-linked advantages), Senses (passive Perception/Investigation/Insight), Proficiencies & Languages (accordion), Skills table (proficiency dot, mod, skill name, ability).
4. **Center-top combat block**: Proficiency Bonus / Walking Speed / Initiative / Armor Class as four framed values; Hit Points card with current/max, temp HP and +/- stepper; Hit Dice and Death Saves side by side; Conditions and Defenses/Resistances rows below.
5. **Center-bottom tabbed area**: Actions | Spells | Inventory | Features & Traits | Background | Notes | Extras. Actions is sub-tabbed Attack / Action / Bonus Action / Reaction / Other; Spells grouped by level with slot pips and a prepare toggle; Inventory with equipped/attuned toggles and weight.
6. **Right sidebar** (slides in on click): full detail of whatever was clicked, with Snippets first, then rulebook text; dockable on desktop, swipe-dismiss on mobile.
   Mobile app: first screen = header (portrait, name, class) → **three large buttons: Hit Points (+/-, temp), Conditions, Rest (campfire)** → Abilities / Saves / Senses stat grid → grid icon opens the section list (Attacks, Spells, Equipment, Features & Traits, Proficiencies, Notes…); persistent Game Log (speech bubble) and dice (d20) FABs. Above the fold on a phone: portrait, name/level, HP/Conditions/Rest, and the six ability scores; AC/Initiative/Speed appear in the next band.

### 3.2 Demiplane NEXUS sheet (Pathfinder / Daggerheart)

From help articles, blog posts and the feedback threads; **[designer observation]** for exact placement:

1. **Top hero**: large portrait, name, ancestry/class/level, with a chevron that opens the **management sidebar** (rename, share/"Edit by Others", export PDF, campaign/link, delete).
2. **Core strip**: HP (current/max/temp with +/- and a heal/damage input), AC, class DC/Perception (PF2) or Evasion/Armor/Hope/Fear (Daggerheart) as clickable coins; conditions chips row with an "Add condition" chip.
3. **Ability/attribute row** with modifiers; every value is Click-To-Know (opens a right detail drawer with rule text, source, and cross-links).
4. **Tabbed body**: Actions/Attacks | Skills | Feats & Features | Spells (slots as pips per rank/level, prepared list, cast button) | Inventory | Journal/Notes; Daggerheart adds Domain Cards (loadout vs vault) rendered as cards.
5. **Level-up** and **builder** are separate routes reached through the sidebar (the #1 user complaint).
   Mobile: same hierarchy stacked; hero collapses to a compact row; core strip stays above the fold (HP, AC, conditions); tabs become a horizontal scroll bar; the Click-To-Know drawer becomes a bottom sheet.

### 3.3 Physical D&D 2024 sheet (WotC, June 2024) — reference order

Header → ability scores with **skills directly under each ability** → combat numbers → weapons/spellcasting condensed to one side → attunement slots (3) → flaws/ideals removed from the front. Reception: "clean", better spell layout; some disliked skills grouped with abilities. D&D Beyond has _not_ adopted this layout, which users called "a serious miss".

---

## 4. Comparison matrix (pattern used per surface)

| Surface                             | D&D Beyond                                                                                                                 | Demiplane                                                                   | Roll20 (2024–25 sheet)                                                          | Foundry v13                                               | Alchemy                                                                           | Shard                                                                               | Owlbear 2                                            | Shieldmaiden                                                            | BG3 (ceiling)                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Sheet**                           | Header + ability row + combat block + 7 tabs; slide-in detail sidebar with Snippets                                        | Hero + core strip + tabs; Click-To-Know drawer on every element; GM co-edit | Key numbers on top; collapsible sections; card/list toggle; per-window settings | System sheet (dnd5e) in a window; effects on sheet/tokens | Bottom-left tabs (Actions, Skills, Equipment, Spells, Trackers) on a scene canvas | One long scroll + sticky section nav; stats bar (AC/Init/HD/HP/THP/Rest)            | none (extensions)                                    | n/a (DM tool; imports DDB)                                              | TAB party view: Inventory / Spellbook / Character Sheet              |
| **Combat turn**                     | Maps: Initiative Order menu (name, AC, HP, init), Next with round/turn; player flags strip; static (no HP edit/stat block) | none (Roll20 VTT)                                                           | VTT turn tracker                                                                | Sidebar combat tracker, pop-out, canvas turn marker       | Tactical Mode grid; no native initiative for some systems                         | Initiative transitions "smoothly"; condition icons on tokens; concentration tracked | Popover list, arrow to advance, click number to edit | Initiative + HP + conditions + reminders + undo log + live table screen | Portrait strip on top, linked adjacent turns, merged same-side turns |
| **Resources (HP/slots/conditions)** | HP card +/-; slot pips; conditions modal; rest dialogs                                                                     | HP +/-; pips/bars "trackers"; condition chips; ability toggles              | Slot pips; effect toggles; modifier overrides keep automation                   | Resource bars + active effects                            | Two trackers on Player Bar; Trackers tab (bars/pips)                              | HP/THP in stats bar; Cast column auto-spends; rest previews recovery                | Token bubbles (extensions)                           | HP with THP/max mods; conditions; resistances auto-halve                | Slot pips in action bar; Reactions tab Enable + Ask + cost           |
| **Compendium**                      | Digital reader + filterable listings; stat blocks paginate on phone                                                        | Fully linked reader with tooltips; cross-links                              | Compendium panel in VTT; Demiplane reader for D&D NEXUS                         | Compendium packs, drag to sheet                           | Handouts panel                                                                    | Import tools for stat blocks/spells                                                 | none                                                 | Monster DB with DDB import                                              | Tooltips + battle log                                                |
| **Campaign / party**                | Campaign page (character cards, HP/AC/PP), Game Log, content sharing                                                       | Sharing; GM Tools (Daggerheart)                                             | Game page                                                                       | World/players list; journals                              | Party panel with Here/Away status and audio state                                 | Campaign customization                                                              | Room with 24h lifespan (v1)                          | Campaign > encounters; live player screen                               | Party portraits bar                                                  |
| **Creation**                        | Multi-step builder; Quickbuilder (Mar 2026) "art-forward… few guided steps"                                                | "Less time than it takes to grab a coffee"; depth on demand                 | Builder shares sheet architecture; premades                                     | System-dependent (dnd5e advancement)                      | "Very easy, especially for less savvy players"                                    | Guided; import                                                                      | none                                                 | n/a                                                                     | Origin/custom; class → race → abilities                              |
| **Level-up**                        | Through builder                                                                                                            | Through sidebar → builder (complaint)                                       | Same builder                                                                    | dnd5e advancement dialog on level change                  | n/a                                                                               | n/a                                                                                 | none                                                 | n/a                                                                     | Level-up prompt on sheet with choice screens                         |
| **Mobile nav**                      | App: HP/Conditions/Rest buttons on top; grid icon for sections; dice/log FABs; tablet = stretched phone                    | Responsive web, no app; sidebar becomes drawer                              | Roll20 Characters for in-person; VTT desktop-first                              | Desktop-first                                             | Browser; panels crowd on phones                                                   | Same scroll + sticky nav on phone                                                   | Horizontally compact 2.0                             | Web; live screen for table                                              | n/a (console: radial)                                                |

---

## 5. Borrow / avoid list for d20 Folio

**Borrow**

1. Click-To-Know drawer/bottom-sheet on every number, chip and row (Demiplane; DDB sidebar + Snippets).
2. Combat strip above the fold: AC · Initiative · Speed · HP(+temp) · Conditions · Rest — DDB-app top buttons + Shard stats bar.
3. Sticky section nav on one scroll (Shard) rather than deep tab trees; same IA on phone/tablet/desktop.
4. Density controls: card/list toggle, collapsible sections, per-user "hide learned features" (Roll20; DDB Features & Traits complaint).
5. Turn tracker with in-place HP/condition editing, reminders (concentration, start/end-of-turn), undo log, and a player-facing "initiative flags" view that hides unrevealed creatures (Shieldmaiden; DDB Maps player view; BG3 strip).
6. Reactions/interrupts as explicit prompts with the cost shown (BG3 "Ask"; Solasta Y/N) — deterministic prompt + undo, no roll.
7. Availability encoded by fill + shape, not hue only (Hades mod lesson; a11y).
8. "Minimal at rest, larger in use" motion policy; OS-driven theme with override; UI scale/opacity (Foundry v13; Veilguard).
9. One accent colour for "now" states; gaze-leading rule lines; motion bound to state changes (Persona 5 / Metaphor principles).
10. Builder = quick path by default, depth on demand; level-up launched from the sheet header (Demiplane copy; fix its complaint).
11. Compendium as _the reference block_ (stat block / spell block layout users recognise) with hyperlinks and filters (5e Bestiary praise; Demiplane linking).
12. Party/campaign page as identity cards with per-member visibility and a player-contributed Chronicle (Multiloop Player Perspectives; Obsidian Portal secrets + Adventure Log).
13. Instant, offline, sub-second loads as the felt definition of premium (LegendKeeper praise vs DDB/World Anvil slowness).
14. "Zen/table mode" that hides all chrome except the combat strip (Alchemy).

**Avoid**

1. Static trackers (no HP edit / stat block in place) — the DDB Maps complaint.
2. Tabs-inside-tabs and nested modals ("very little fluency between menus" — Diablo IV; Alchemy tab split; FGU hidden controls).
3. Fantasy skins: parchment, filigree, blackletter, character render behind text (BG3/Diablo IV are art budgets, not web patterns).
4. Thin decorative lines and equal visual weight (Hades II selection-state and Diablo IV slot-legibility complaints).
5. Two-step interactions where one tap should act (Alchemy skill → dice roller detour).
6. Tablet as a stretched phone (DDB app).
7. Level-up hidden behind a sidebar detour (Demiplane).
8. Configuration-first onboarding (World Anvil "cliff", Kanka entity setup, DiceCloud setup tax).
9. Migrations that force rebuilding characters or regress automation (Roll20 beta).
10. Overstimulating motion with no calm setting (Metaphor's own admission; Veilguard wayfinding).

---

## 6. Sources (URL, date seen or published)

D&D Beyond

- https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/210852-new-2024-character-sheets (thread 2024–25)
- https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/206562-2024-character-sheets (2024)
- https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/197713-dnd-beyond-character-sheet-refresh (May 2024)
- https://www.dndbeyond.com/old-changelog/256-character-sheet-revamp (2018-06-29)
- https://www.dndbeyond.com/posts/1003-how-to-customize-your-character-sheet-on-d-d (2022-02-28)
- https://dndbeyond-support.wizards.com/hc/en-us/articles/7747193946388-Sheet-Sections (help center; 403 to fetch, section list via search)
- https://blizzardwatch.com/2020/07/07/dd-beyond-character-sheet-app/ (2020-07-07)
- https://www.makeuseof.com/how-to-use-dnd-beyond-app/ (2021-03-11)
- https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/d-d-beyond-mobile-app-feedback/189085-ux-improvement-suggestions-for-actions-tab (2024-01-14)
- https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/d-d-beyond-mobile-app-feedback/125828-full-character-sheet-for-tablets-ipads
- https://www.dndbeyond.com/forums/d-d-beyond-general/bugs-support/207135-d-d-beyond-loading-changes-to-character-sheets (2024–2025)
- https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/95515-how-to-declutter-features-traits-in-character
- https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/215302-encounter-builder-2024 (2024–25)
- https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/189153-encounter-builder-feedback
- https://www.dndbeyond.com/posts/1841-roll-for-initiative-combat-tracking-comes-to-the (2024-10-29)
- https://arcaneeye.com/articles/dnd-beyonds-maps-vtt-gets-a-huge-upgrade-encounter-tracking/ (2024-10-29)
- https://www.dndbeyond.com/posts/1918-sigil-and-d-d-beyond-maps-what-are-they-and-how-do (2025)
- https://www.thegamer.com/sigil-vs-dnd-beyond-maps-which-is-better-comparison/ (2025-04-16)
- https://screenrant.com/dungeons-dragons-sigil-3d-vtt-experience-op-ed/ (2025-03-04)
- https://www.dndbeyond.com/posts/2086-closing-the-chapter-on-sigil-and-thanking-the (2025-10-24)
- https://www.rascal.news/wizards-of-the-coast-set-to-rebuild-d-d-beyond-add-more-features/ (2026-02-26)
- https://www.dndbeyond.com/posts/2132-d-d-beyonds-2026-development-roadmap (2026)
- https://www.vice.com/en/article/dungeons-and-dragons-every-new-tool-announced-for-dd-beyond/ (Gen Con 2026)
- https://www.wargamer.com/dnd/redesigned-character-sheet-2024 (2024-06-20)
- https://homebrewcreation.com/reviews/best-dnd-encounter-builders-initiative-trackers/ (2024-02-21)

Demiplane

- https://www.demiplane.com/blog/demiplane-q1-2025-review (2025)
- https://resources.demiplane.com/nexus/pathfinder/character-tools
- https://www.enworld.org/threads/test-pathfinder%E2%80%99s-new-online-%E2%80%98nexus%E2%80%99.697893/ (2023-05-23)
- https://forums.demiplane.com/t/demiplane-daggerheart-character-sheet-feedback/3568 (2024-06-22)
- https://www.demiplane.com/blog/the-magic-of-daggerheart-vtt-updates (Aug 2025)
- https://www.demiplane.com/changelog (latest entry 2024-11-11)
- https://fantasticsuccess.substack.com/p/review-demiplanes-new-printable-character
- https://support.demiplane.com/hc/en-us/articles/33046325857815-Getting-Started-on-Demiplane-Your-Official-Digital-Companion (403 to fetch; surfaced via search)
- https://en.wikipedia.org/wiki/Demiplane_(company)

Roll20

- https://blog.roll20.net/posts/introducing-the-new-roll20-dungeons-dragons-character-sheet/ (2024-02-12)
- https://startplaying.games/blog/posts/roll20-dnd-character-sheet-upgrade-beta (alpha 2024-06-18)
- https://whatdoiknowknighterrantjr.wordpress.com/2024/08/02/looking-at-roll20s-new-dd-character-sheet-beta/ (2024-08-02)
- https://pages.roll20.net/redesign
- https://help.roll20.net/hc/en-us/articles/38597501957015-2025-Change-Log (2025)
- https://app.roll20.net/characters (Roll20 Characters beta Dec 2024)
- https://help.roll20.net/hc/en-us/articles/30050730960151-Demiplane-and-Roll20-Character-Sheet-Integration-Beta

Foundry VTT

- https://foundryvtt.com/releases/13.341 (2025-04-27)
- https://foundryvtt.com/article/year-in-review-2025/ (2025-05-26)
- https://github.com/foundryvtt/foundryvtt/issues/9778 (UI Redesign and Themes – Phase 2)
- https://foundryvtt.com/packages/crlngn-ui (Carolingian UI 4.1.1)
- https://encounterlibrary.com/foundry-players-guide/combat-tracker/

Alchemy, Shard, Owlbear, FGU, DiceCloud, Pathbuilder

- https://help.alchemyrpg.com/en/articles/9821384-player-orientation
- https://churapereviews.com/2025/04/11/why-alchemy-rpg-is-the-best-virtual-tabletop-for-storytelling/ (2025-04-11)
- https://www.numtini.com/2025/01/14/alchemy-vtt-changing-gold-into-lead/ (2025-01-14)
- https://yourgmchandler.medium.com/play-your-game-not-the-vtt-0a2f3882df9f (403; surfaced via search)
- https://www.shardtabletop.com/howto/using-character-sheet
- https://www.shardtabletop.com/blog/improved-character-sheet
- https://gnomestew.com/shard-tabletop-vtt-impressions/ (2024-10-07)
- https://blog.owlbear.rodeo/designing-for-fun/ (2023-07-01)
- https://blog.owlbear.rodeo/owlbear-rodeo-2-0-dev-log-1/
- https://lairofsecrets.com/gaming/review-owlbear-rodeo/ (2023-04-24)
- https://extensions.owlbear.rodeo/initiative-tracker
- https://steamcommunity.com/app/1196310/discussions/0/3049482570175423082/ (FGU "Improving the UI/UX?")
- https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/81998-fantasy-grounds-unity-vs-foundry-vtt?page=3
- https://dndcheatsheet.com/blog-posts/dicecloud (2019-08-09)
- https://www.saashub.com/dicecloud-reviews
- https://knowdirectionpodcast.com/2020/01/the-best-app-for-pathfinder-is-free-pathbuilder-2e-review/ (2020-01-29)
- https://apps.apple.com/us/app/pathbuilder-2e/id6740821064 (4.79/5, 5.5k ratings)

Campaign tools

- https://char-gen.com/alternatives/kanka-legendkeeper (2026-07)
- https://stormscape.app/blog/world-anvil-vs-legendkeeper-vs-kanka-vs-stormscape (2026-02-14)
- https://multiloop.app/compare (2026-07-10)
- https://www.legendkeeper.com/best-world-anvil-alternatives/
- https://www.legendkeeper.com/the-new-legendkeeper-map-tool-is-here/ (2026-01-13)
- https://blog.worldanvil.com/worldanvil/dev-news/more-ui-updates-for-a-faster-and-more-integrated-world-anvil/ (2024-04-08)
- https://blog.worldanvil.com/worldanvil/dev-news/world-anvil-just-got-even-better/ (2025-10-28)
- https://www.trustpilot.com/review/worldanvil.com?page=7
- https://www.roleplayingtips.com/articles/reviews/obsidian_portal_review_2.php
- https://blog.obsidianportal.com/obsidian-portal-campaign-of-the-month-october-2024-aloft/ (2024-10)
- https://slyflourish.com/lazy_dnd_with_notion.html (2020-07-06)
- https://www.notion.com/templates/dnd5e-campaign-database (reviews Jul–Aug 2025)
- https://gridfiti.com/notion-rpg-templates/

Video-game UI

- https://www.gamepressure.com/baldurs-gate-iii/interface/zad9f7
- https://baldursgate3.wiki.fextralife.com/Reactions
- https://forums.larian.com/ubbthreads.php?ubb=showflat&Number=767563 (2021-03-29)
- https://steamcommunity.com/app/1086940/discussions/1/3076503022323419187/?ctp=3 (BG3 Reactions feedback)
- https://uxdesign.cc/the-ux-writing-of-baldurs-gate-3-6ea80e6cc278 (surfaced via search)
- https://www.gamerguides.com/baldurs-gate-3/guide/gameplay/getting-started/surprise-rounds-and-initiative-explained
- https://gamerant.com/diablo-4-how-to-use-the-character-user-interface-and-why-its-important/ (2023-06-08)
- https://www.gamepressure.com/diablo-iv/interface/z0109a5
- https://us.forums.blizzard.com/en/d4/t/d4-menus-and-ui-feel-like-a-console-game/176535 (2024-06-29)
- https://dotesports.com/diablo/news/diablo-4-players-are-pining-for-diablo-3s-inventory-ui-after-last-weeks-beta-test (2023)
- https://medium.com/@bramhadalvi/hud-redesign-fdc332d05291 (Hades HUD redesign; surfaced via search)
- https://www.zleague.gg/theportal/struggling-to-navigate-the-ui-in-hades-users-discuss-their-frustrations-and-suggestions/
- https://thunderstore.io/c/hades-ii/p/SMarBe/Improved_Boon_Info_UI/
- https://kotaku.com/elden-ring-ui-ux-user-experience-interface-fromsoftware-1848637410 (2022-03-10)
- https://www.ea.com/able/resources/dragon-age-the-veilguard
- https://game8.co/games/Dragon-Age-The-Veilguard/archives/483117 (2024-11-01)
- https://www.pcgamer.com/games/dragon-age/before-you-play-dragon-age-the-veilguard-you-really-should-change-the-annoying-wayfinding-settings/
- https://noisypixel.net/persona-metaphor-ui-design-evolution/ (2025-03-22)
- https://gameranx.com/updates/id/533158/article/metaphor-refantazio-team-worked-hard-to-make-games-ui-different/ (2025-03-26)
- https://www.gamesradar.com/games/jrpg/the-lead-ui-designer-on-metaphor-refantazio-had-never-designed-for-a-game-before-he-just-rolled-up-and-made-some-of-the-best-ui-ive-ever-seen-in-a-jrpg/
- https://www.pcgamer.com/games/rpg/persona-and-metaphor-refantazios-ui-designer-is-open-to-accessibility-options-for-players-who-find-the-stylish-menus-overstimulating-that-is-something-we-understand-well-need-to-work-on-and-provide-in-the-future/
- https://gdcvault.com/play/1035332/From-Persona-to-Metaphor-ReFantazio (GDC 2025)
- https://www.siliconera.com/atlus-reveals-design-secrets-behind-persona-5s-distinctive-ui/ (2017-11-13)
- https://personacentral.com/persona-5-panel-concept-development-ui/ (2017-10-28)
- https://medium.com/design-bootcamp/how-persona-5s-ui-balances-both-style-and-substance-de8cb1b807ef

Indie apps / trackers

- https://shieldmaiden.app/tools/combat-tracker
- https://github.com/HarmlessKey/Shieldmaiden
- https://www.dungeonsolvers.com/reviews-of-kobold-fight-club-for-dd/ (2024-01-16, upd. 2025-02-17)
- https://www.dungeonsolvers.com/dnd-character-sheet-apps/ (2023-12-03, upd. 2025-02-20)
- https://apps.apple.com/us/app/prismscroll-character-sheet/id1364209163 (4.6/5, 3.2k; upd. 2024-08-18)
- https://charactercompanion.com/
- https://screenrant.com/dungeons-dragons-best-apps-dnd-2024/ (upd. 2024-09-20)
- https://github.com/derikb/character-sheet-app ; https://www.codemag.com/Article/268071/Roll-for-Initiative-Building-an-Offline-D&D-Character-Sheet-in-a-Single-HTML-File ; https://charactergenerator.github.io/
- https://www.producthunt.com/products/dungeon-alchemist/reviews (only D&D-adjacent PH result for 2025)

Not fetchable (403/404) and therefore _not_ relied on for specifics: interfaceingame.com (BG3, Hades, Veilguard), gameuidatabase.com, Medium articles (Metaphor/Kwan, Hades/Rowley, Elden Ring/Fajfar, Diablo fan redesign), kanka.io/features, dndbeyond Sheet Sections help page, Demiplane Getting Started help page, Google Play DDB listing (truncated).
