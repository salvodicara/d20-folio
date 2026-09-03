# VTT play-screen reference observations (2026-09-03)

Captured for dossier 14 (play screen). Crops referenced below live outside the repository in
`~/.agents/state/d20-folio/design-2026-09/refs5/` (copyrighted captures, never committed).

# VTT play-screen reference library — observations (refs5)

Captured 2026-09-03. Purpose: design the d20 Folio in-app map (online play, one screen per
player, Discord voice, Owlbear-level map + in-app 3D dice) with the DM working on the SAME play
screen as players and a BG3-style bottom HUD that swaps to the selected creature.

Folder map (all under `refs5/`):

| Folder                                                          | What is in it                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foundry/`                                                      | REAL Foundry v14.365 demo captured live as a player (`demo3-*.png`, `demo-*.png`), official v13 light/dark UI shots, KB images (`kb/`)                                                                            |
| `roll20/`                                                       | Jumpgate/new-toolbar screenshots from Roll20 help center, forum and a review site                                                                                                                                 |
| `ddb/`                                                          | D&D Beyond Maps marketing + support-center images (gifs → `*.frame.png` mid-frames)                                                                                                                               |
| `owlbear/`                                                      | owlbear.rodeo site, `docs/` (docs.owlbear.rodeo), `blog/` (release notes 2.0→2.4), `ext/` (dice, initiative, Bubbles, HP-tracker, dynamic fog, smoke, rings, conditions, Pretty Sordid, Clash, Sheet-from-Beyond) |
| `steam/{talespire,fgu,tts,menyr,bg3}/`                          | Steam store screenshots (appids 720620, 1196310, 286160, 2499260, 1086940)                                                                                                                                        |
| `alchemy/`, `shard/`, `lumen/`, `menyr/`, `talespire/`, `dice/` | product site imagery; `dice/` = Dice So Nice gif, dddice screens                                                                                                                                                  |
| `bg3/`                                                          | BG3 HUD crops (copied from earlier refs)                                                                                                                                                                          |
| `pages/`                                                        | full-page screenshots of every source page + `*.imgs.txt` (harvested image URLs)                                                                                                                                  |
| `sheets/`                                                       | labelled contact sheets per product (quick review)                                                                                                                                                                |
| `crops/`                                                        | the evidence crops cited below                                                                                                                                                                                    |

Not obtainable as real UI (noted, not faked): Roll20's own 3D-dice screenshot (help article has no
image; wiki is Cloudflare-gated) — dddice-on-Roll20 and the Jumpgate screens stand in; AboveVTT ships
no README/store screenshots (repo README is text-only, Firefox listing has no images);
Arkenforge's site is video-only and the product is explicitly "not a tool for online play"; Alchemy's
public imagery is one stylised composite (`alchemy-hero2.png`, Daggerheart) — treat as art-directed,
not a raw capture; Lumen's only public shot is an SEO composite (`lumen-three.png`).

---

## 1. Foundry VTT (v13/v14) — `crops/foundry-*`

Sources: live demo (`foundry/demo3-olegstradingpost.png`, joined as "Player 05"), official v13
UI shots (`foundry/foundry-v13-light.webp`, `-dark.webp`), KB pages.

**Layout grammar.** Map fills 100% of the viewport; every control floats over it. Left edge: a
2-column _scene controls_ palette (layer group column + tool column, `foundry-v13-scene-controls-rail.png`)
under a collapsed scene navigation list (scene names stacked top-left, with a "P" pill for
player-visible). Right edge: a vertical _sidebar rail_ of tab icons (chat, combat, scenes, actors,
items, journal, tables, cards, playlists, compendium, settings) that expands to a ~350 px docked
panel; in v13/14 the sidebar is **collapsed by default** and chat is _not_ the panel — the chat
input is a persistent card bottom-right with roll-mode + formatting toggles above it, and chat
messages appear as floating cards stacked from the top-right (`foundry-chat-roll-cards-blind.png`,
`foundry-hotbar-chat-input.png`). Bottom centre: 10-slot macro _hotbar_ with page selector.
Bottom-left: players list with latency/FPS. Top-centre (GM): world time / pause. DM view = same
screen with more sidebar tabs (scenes directory `foundry-v13-scene-directory-gm.png`, lighting/wall/
fog layer groups in the palette); players lose those layer groups and see only owned actors.

**Token anatomy.** Square tile (default), optional _dynamic token ring_ (subject image inside a
ring that flashes on damage/heal, `foundry/foundry-token-ring.webp`); hover shows name plate under
the token and two resource bars (green HP, blue secondary) on the bottom edge
(`foundry-token-hover-name-bars.png`); selection = orange square outline; conditions = tiny status
icons in a grid at top-left of the token; combat turn marker = animated ring under the active token
(v13 "turn markers"). Right-click = token HUD: 4 quadrants (visibility/status effects/elevation/
target left+right; bar editors) (`foundry-token-hud.jpg`).

**Ruler.** Ctrl-drag a ruler from any point; v13 replaced the old ruler with a **token drag ruler**:
dragging a token draws a segmented line with distance labels at each waypoint and the _total_, colour
coded per movement range (`foundry-token-drag-ruler.png`, `foundry/foundry-v13-movement.gif`).
Measurement tools group = ruler + circle/cone/rect/ray templates in the left palette.

**Fog.** Wall-based dynamic vision: players see only what their tokens see; explored area kept as
dim "fog exploration"; GM has fog reset/hide layer tools. Demo shot shows the classic black-with-
lantern-cone look (`foundry-play-screen-player.png`).

**Dice / rolls.** Chat cards: speaker portrait + name + flavour, formula pill, big total pill; click
total to expand per-die breakdown. Roll modes (public / private GM / blind GM / self) chosen from a
menu on the chat input (`foundry-roll-modes.jpg`). **Hidden rolls**: a blind roll shows to
non-recipients as a violet card "Player privately rolled some dice" with `???` formula and `?`
total (`foundry-chat-roll-cards-blind.png`); with Dice So Nice active the dice still physically
roll on the whole screen but faces render **question marks** (`foundry-dsn-hidden-dice-question-marks.png`)
— the best "you saw it happen but not the number" pattern in the set. DSN dice roll over the
canvas, not in a tray, then fade; a _dice-tray-less_ model.

**Sheet.** Actor sheet is a free-floating draggable window over the map (system-dependent size),
not a docked drawer.

**Initiative.** Combat tracker is a sidebar tab (`foundry-combat-tracker.png`): rows = portrait,
name, HP resource, initiative number; round counter, previous/next-turn buttons pinned at the
bottom; active combatant row highlighted + turn marker on the map.

**Mobile.** None officially (v13 UI scales, but no touch layout).

## 2. Roll20 (Jumpgate + 2024 toolbar) — `crops/roll20-*`

Sources: `roll20-jumpgate-play-screen-dm.png` (review-site capture of the real editor, DM),
`roll20-measure-line-15ft.png` (help-center), forum posts, `roll20-gm-layer-menu.png`.

**Layout grammar.** Map fills the window; **left vertical toolbar** (select, pan, draw, text, fx,
measure, zoom, layers at the bottom with a coloured _current layer_ badge — GM/Tokens/Light/Map)
(`roll20-toolbar-rail.png`); **right docked sidebar** (~290 px) with tabs chat / journal /
compendium / jukebox / collections / settings, chat log + "As:" speaker select + Send at the
bottom (`roll20-sidebar-chat.png`). Turn order = **floating window** over the map
(`roll20-turn-order.png`). Voice/video tiles bottom-left over the map. Zoom slider top-right of the
map. DM sees the layer switcher and GM layer; players see a shorter toolbar and no layer switcher.

**Token anatomy.** Round or square avatar; up to three coloured _bars_ above the token
(green/blue/red, HP as bar 1 by default); status markers = small coloured icons under/around;
name tag under token; selection = light outline; turn = the token named in the floating turn order,
no map marker by default (marketplace token markers exist).

**Ruler.** Tool with a **settings popover** (shape: line/circle/square/cone; snap: corner/centre;
origin: centre/edge; fade delay; _Broadcast to others_ toggle) (`roll20-measure-panel.png`);
the label is a dark card "name / 30 ft / 6 squares" with an eye icon (visibility to others)
(`roll20-ruler-label.png`). Purple filled area templates for AoE.

**Fog.** GM-only fog layer: reveal by polygon/rect, dynamic lighting (walls) as a separate Light
layer (`roll20-gm-layer-menu.png`).

**Dice.** Chat-based (`/roll`), optional WebGL 3D dice that fall on the tabletop and stay until
the next interaction; "dice agency" = click-drag throw. Hidden rolls: `/gmroll` → card only in the
GM's chat; players see nothing. Sheet: separate draggable window (or pop-out tab).

**Mobile.** Companion app for sheets only; VTT itself is desktop.

## 3. D&D Beyond Maps — `crops/ddb-*`

Sources: support center (`ddb-maps-play-screen-dm.jpg` = full DM screen 1920×911), marketing gifs.

**Layout grammar.** Map full-bleed. **Left docked panel** (~350 px) = _Initiative Order_
(DM: full list with AC, initiative, HP x/y, hidden rows greyed; bottom row: reset, ROUND/TURN, red
NEXT button) (`ddb-initiative-sidebar-hp-popover.jpg`, `ddb-initiative-list-and-tokens.jpg`).
Left edge inside the map: a compact **vertical tool rail** (select, pan, fog, draw, shapes, ruler,
ping/pointer, sheet) (`ddb-tool-rail.jpg`). Top bar: map name selector + visibility toggle
("SELF / EVERYONE") + hamburger. Bottom-right: pause session / zoom % / fullscreen / view mode /
info (`ddb-bottom-right-controls.jpg`, `ddb-pause-session-control.png`). Right side: **character
sheet / stat-block drawer** that slides in when you click a token (`ddb-statblock-drawer.png`)
and a **Game Log** drawer for rolls (`ddb-game-log-roll-cards.png`). **Player view**: the left
initiative panel collapses to a **horizontal party strip at the top** (portraits with the active
creature enlarged), no DM rail items (`ddb-player-view-party-strip-no-sidebar.jpg`,
`ddb-dm-vs-player-toolbar.jpg`).

**Token anatomy.** Round portrait with a coloured ring; **name label chip under the token**
(pill, semi-opaque); HP not shown on the token — HP lives in the initiative row (players see their
own); hidden tokens = red hatched circle (DM only) (`ddb-dm-hidden-token-toolbar.png`); selecting a
token opens a **floating mini toolbar under it** (add to initiative, hide/reveal with "Shift+H"
hint, size, lock, delete) (`ddb-token-context-toolbar.jpg`). Active turn: token gets the enlarged
portrait in the strip; on the DM list the row is outlined.

**Ruler / fog / pointer.** Simple line ruler from the rail; fog = DM paints reveal rectangles/
polygons (players just see darkness); pointer tool pings a coloured ripple everyone sees.

**Dice.** Rolls come from the sheet drawer (click any stat); **3D digital dice** tumble over the
whole screen (`ddb-3d-dice-over-sheet.png`), the result is posted as a card in the Game Log
(who / what / breakdown / total). Hidden DM rolls: DM can roll "privately" from a stat block — players
see nothing in the log. Best-in-class _sheet-on-the-map_ since the sheet is the real DDB sheet.

**Mobile.** Maps is desktop/tablet web; phones open the sheet only.

## 4. Owlbear Rodeo 2 — `crops/obr-*` (full DM toolset)

Sources: docs.owlbear.rodeo (`obr-play-screen-gm.jpg` = the documented interface), blog 2.0→2.4,
extension pages.

**Layout grammar.** Map full-bleed, everything floats with rounded glass panels:

- Top-left: role/player avatar chip + **Players** popover (list with GM badge, kebab per player)
  (`obr-players-panel.jpg`, `obr-players-gm-badge.jpg`).
- Left column: **dockable extension windows** (dice tray docked here in `obr-dice-tray-docked.jpg`,
  initiative in `obr-initiative-tracker.jpg`). Any action (extension) can be a popover or docked.
- Top-centre: the **active tool's sub-toolbar** (drawing modes, fog modes, measure modes)
  (`obr-drawing-toolbar-top.jpg`, `obr-fog-toolbar.jpg`, `obr-drawing-modes.jpg`).
- Right edge: **vertical tool rail** — move, select, fog, draw, measure, pointer, text, undo/redo
  (`obr-tool-rail-right.jpg`). Above it a chevron collapses the whole UI.
- Bottom-centre: **character dock** — search + tabs per layer (map, prop, mount, character,
  attachment, note) + asset-manager button, with a selected _pack_ chip at the left
  (`obr-character-dock-bottom.jpg`); dragging a card onto the map places a token.
- Bottom-left kebab = **scene dock** (scene list as cards with open/edit) (`obr-scene-dock.jpg`,
  `obr-scenes-list.jpg`). Bottom-right: **grid scale badge** "5ft" (`obr-scale-badge.jpg`) that
  opens grid controls (size, measurement type, scale) (`obr-grid-controls-panel.jpg`,
  `obr-measurement-type.jpg`).
- DM vs player: identical frame; players lose fog tool, scene dock, asset manager and see only
  layers they may edit; per-player permission dialog (`obr-player-permissions.jpg`); each item can
  be assigned an owner (`obr-token-owner-menu.jpg`).

**Token anatomy.** Circular image, optional **colored ring** (Colored Rings ext,
`obr-colored-rings.jpg`); name via _Text_ label item attached below; **HP/AC bubbles** come from
Bubbles: HP/temp/AC bubbles hugging the token bottom + auto health bar; GM sees numbers, players
can be locked out (`obr-bubbles-hp-ac-on-tokens.jpg`, `obr-bubbles-gm-context.png`). Conditions =
small round icons attached to the token edge (Condition Markers 2, `obr-condition-markers.jpg`).
Selection = purple ring + rotate handle on top + flip handles left/right; **context menu = a
horizontal pill under the token**: visibility (hide), lock, edit, flip, layer, copy, attach, text,
delete, ring colour / add-to-initiative (extensions inject buttons here)
(`obr-token-context-menu.jpg`, `obr-add-to-initiative.jpg`), with an overflow (copy, attach,
accessibility, align image, replace image) (`obr-token-overflow-menu.jpg`).

**Layers.** map → prop → mount → character → attachment → note → text → pointer → fog. The
character dock tabs _are_ the layer picker; the context-menu layer button moves an item.

**Ruler.** Measure tool draws a line with a rounded label "3 sq / 15 ft"-style; measurement type
(Chebyshev / Alternating / Euclidean / Manhattan) in grid controls; ruler can be _attached_ to a
token drag (2.3 "ruler" `owlbear/blog/obr-23-ruler.jpg`); extensions add bendy/segmentable rulers.

**Fog.** Fog toolbar: select-fog, pen, brush, rectangle, circle, triangle, hexagon + fill, cut,
hide, erase, colour (`obr-fog-toolbar.jpg`, diagram `obr-fog-diagram.jpg`); single vs multi-layer
mode; GM preview toggle; **Dynamic Fog** extension adds walls/doors with a door toggle icon on the
wall (`obr-dynamic-fog-doors.jpg`); Smoke & Spectre is the heavier alternative (`obr-smoke-tools.webp`).

**Dice (official extension).** Docked or popover **tray**: dice set chooser, tap dice to build the
pool, +/- bonus and ADV/DIS (`obr-dice-bonus-adv.jpg`), roll button (`obr-dice-roll-button.jpg`),
recent rolls (`obr-dice-recent.jpg`); dice roll **inside the tray's 3D box** on the roller's screen
and the _result_ is shared as a popup for others ("Player rolled 1d20+10 = 24") with a _hidden_
toggle for GM secret rolls (`obr-dice-shared-popup.jpg`, `obr-dice-tray-result.jpg`). Pretty
Sordid initiative shows the tracker as a docked list with an eye (hidden) toggle per row
(`obr-pretty-sordid-initiative.png`). GM's Grimoire (HP-tracker ext) is the maximal DM console:
list of PCs/enemies with HP/AC/initiative and GM-only secret dice (`obr-gm-grimoire.png`).

**Mobile.** Real responsive layout: rail collapses into a bottom bar, dock becomes a sheet
(`obr-mobile-phone.jpg`, `obr-mobile-asset-manager.jpg`). Best mobile of the set.

## 5. Alchemy RPG — `crops/alchemy-play-screen.jpg`

"Theatre of the mind" grammar: full-screen scene art/video, **left column** = chat + card pop
(spell card + roll result), **right column** = character sheet drawer (portrait, HP track, stats)
with a section rail (Actions / Features / Domain cards). Dice tumble over the art. Not map-first;
useful for the sheet-drawer + roll-card pairing only.

## 6. Shard Tabletop — `crops/shard-play-screen.webp`, `shard-chat.webp`

**Split-screen** grammar: left half = full character sheet (tabs TOP/WEAPONS/SPELLS…), right half =
map; a bottom "dice strip" shows the last roll (dice faces = total) and a d20 button. Map tokens =
round portraits with **initiative number in parentheses prefixed to the name** ("(5) Nistor…")
and a yellow selection square. Chat cards show formula, per-die faces, total and an eye icon for
GM-only rolls. Dated visuals but the _sheet-and-map side-by-side_ is a valid desktop grammar.

## 7. Lumen VTT (2026) — `crops/lumen-three-screen.png`

Three-screen model: phone (player actions: "Choose your attack"), laptop GM view (map + activity
log), TV/live view (map only, HP bars over tokens). Only composite marketing imagery; the pattern
(phone as the player's controller, shared map elsewhere) is the relevant idea.

## 8. TaleSpire — `crops/talespire-*` (Steam 720620)

3D board; UI is minimal chrome: top bar "Role: GM ▾ | Build Mode | scene name" (`talespire-topbar.jpg`);
**initiative = horizontal strip of portrait cards at top-centre with PREV/NEXT** (steam/talespire/09);
right rail for GM build tools; **dice tray bottom-centre** (d4…d20 chips + slot bar); 3D dice roll
on the board, and the result appears as a **floating name-plate above the roller's mini: "Dungeon
Master YOU — Rolled 20"** (`talespire-dm-rolled-20.jpg`). Bottom-left compass, camera hints.

## 9. Fantasy Grounds Unity — `crops/fgu-*` (Steam 1196310)

Window-manager grammar: map in a window, **combat tracker window** (rows: init, HP, temp, wounds,
effects, action icons) (`fgu-combat-tracker.jpg`), sheet window, right sidebar of library
buttons, chat bottom-left, **dice tray bottom-left** with modifier box + ADV/DIS/±2/±5 quick
buttons; dice are dragged onto the map to roll (`fgu-dice-tray-modifier.jpg`). Token = portrait in
a coloured ring (green = ally, red = enemy, active = thick green ring). Dense, desktop-only.

## 10. Tabletop Simulator — `crops/tts-physics-dice.jpg`

Pure physics sandbox; dice are objects on the table (`tts-physics-dice.jpg`). No native VTT chrome to
learn from beyond "dice as physical objects everyone watches".

## 11. Menyr — `crops/menyr-*` (Steam 2499260)

3D VTT: hex-grid floor, token base with **HP (red) and resource (blue) bars + "25 Ft" movement
label above the mini**, dashed path line (`menyr-token-hp-and-25ft.jpg`); **bottom hotbar** (hand,
draw, night, dice, weather…) with a chat input to the right (`menyr-bottom-hotbar.jpg`); left rail
= GM build tools; right rail = pen/ruler; top banner "Storyteller".

## 12. Arkenforge — `pages/arkenforge.png`

In-person/TV product ("not a tool for online play"): fog painted on a touch screen; no shareable
online UI. Skip for layout, keep as a reminder that _TV/table view_ is a separate mode.

## 13. Dice references — `crops/*dice*`, `foundry-dsn-*`, `ddb-3d-dice-*`, `obr-dice-*`

| System                 | Where dice roll                                                                     | Result surface                                                        | Hidden GM roll                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Owlbear dice ext       | inside the tray box (docked/popover)                                                | shared popup card for others + recent list                            | "hidden" toggle in the tray; others see nothing                                 |
| Dice So Nice (Foundry) | over the whole canvas, then fade (`dice-so-nice-overlay.png`)                       | Foundry chat card                                                     | dice roll with **? faces**; card shows `???`                                    |
| DDB digital dice       | over the whole screen                                                               | Game Log card                                                         | private roll = nothing shown                                                    |
| Roll20 3D              | on the tabletop, stay until next click                                              | chat card                                                             | `/gmroll` card only for GM                                                      |
| dddice                 | over any host page (browser ext / overlay), bottom dice bar (`dddice-dice-bar.png`) | small result cards "DDDICE: ROLL 12" (`dddice-roll-result-cards.png`) | rooms + per-roll visibility; streaming overlay (`dddice-streaming-overlay.jpg`) |
| TaleSpire              | on the 3D board                                                                     | name-plate above roller                                               | GM-only roll option                                                             |

## 14. BG3 HUD — `crops/bg3-*` (Steam 1086940)

Bottom HUD: **portrait + HP + class emblem** at the left (`bg3-portrait.png`), _action-economy pills_
(action ● / bonus ▲ / reaction / spell slots) centred above the hotbar (`bg3-action-economy-pills.png`),
hotbar with tabbed rows (Common / Class / Items / Passives / Custom) (`bg3-hotbar.png`,
`bg3-hud-bottom.png`), **End Turn** ring button at the right (`bg3-end-turn.png`); condition icons sit above the hotbar (visible in `bg3-hud-bottom.png`). Top-centre **initiative strip** = portrait cards, active card taller with a
hourglass overlay, allies blue-framed, enemies red-framed (`bg3-initiative-strip.png`). Left edge =
party bar (portrait + HP x/y) (`bg3-party-bar-left.jpg`). Targeted enemy shows a name + HP bar +
condition tag at top-centre and the hit % over the creature (`bg3-enemy-hp-bar-target.jpg`).
Reaction popup and spell radial are modal overlays (only visible in-game; not in store shots).

---

## Verdict

**Dominant layout grammar for online play (2026):** _map full-bleed, chrome floats._ Owlbear,
Foundry v13/14, DDB Maps, Menyr and TaleSpire all converge on: (1) a **vertical tool rail on one
edge** (Owlbear right, Foundry/Roll20/DDB left), (2) the **active tool's options as a small
horizontal sub-toolbar at the top centre** (Owlbear, Foundry), (3) **bottom-centre = the thing you
act with** (Foundry hotbar, Owlbear character dock, TaleSpire dice tray, Menyr hotbar, BG3
hotbar), (4) **initiative as a docked left list for the DM and a horizontal portrait strip for
players** (DDB does exactly this split; BG3/TaleSpire use the strip for everyone), (5) the sheet as
a **right-side drawer** (DDB, Alchemy) rather than a floating window (Foundry/Roll20 — the older
grammar), (6) rolls surfaced as **cards in a log** plus 3D dice tumbling over the map.

**Best execution per element (evidence crop):**

- Toolbar: Owlbear's right rail + top sub-toolbar with tooltips and keyboard hints
  (`obr-tool-rail-right.jpg`, `obr-fog-toolbar.jpg`). Runner-up Foundry v13 two-column palette.
- Token: DDB's round portrait + name chip + under-token mini toolbar (`ddb-token-context-toolbar.jpg`)
  for online play; Bubbles for HP/AC on the token (`obr-bubbles-hp-ac-on-tokens.jpg`); Foundry's
  dynamic ring for damage feedback (`foundry/foundry-token-ring.webp`).
- Ruler: Foundry v13 token drag ruler with per-waypoint labels and colour by movement budget
  (`foundry-token-drag-ruler.png`); Roll20's measure panel is the best _settings_ UI
  (`roll20-measure-panel.png`).
- Fog: Owlbear's single toolbar of shapes + fill/cut + preview (`obr-fog-toolbar.jpg`), with
  dynamic-fog doors as the upgrade (`obr-dynamic-fog-doors.jpg`).
- Dice tray: Owlbear dice ext (build pool → bonus/ADV → roll → shared popup)
  (`obr-dice-tray-docked.jpg`, `obr-dice-shared-popup.jpg`); hidden rolls: Dice So Nice "?"
  faces + `???` card (`foundry-dsn-hidden-dice-question-marks.png`, `foundry-chat-roll-cards-blind.png`).
- Sheet drawer: DDB Maps right drawer with the real sheet + game log (`ddb-statblock-drawer.png`,
  `ddb-game-log-roll-cards.png`).
- Initiative: DDB left list (DM) + top strip (players) (`ddb-initiative-sidebar-hp-popover.jpg`,
  `ddb-player-view-party-strip-no-sidebar.jpg`); BG3 strip styling for the active card
  (`bg3-initiative-strip.png`); Pretty Sordid for per-row hidden toggle.
- Bottom HUD: BG3 (`bg3-hud-bottom.png`) — the only reference where the bottom bar _is_ the
  selected creature.

**Anti-patterns seen:**

- Window-manager chrome (FGU, old Foundry/Roll20 sheets) — floating windows hide the map and do
  not work at 13" or on tablets.
- Docked 300 px chat sidebar always open (Roll20) — steals ~20% width for a log that Discord voice
  makes secondary.
- HP numbers on every token for players (GM's Grimoire style) — leaks information; Bubbles' GM
  lock is the right default.
- Initiative number baked into the token name (Shard "(5) Nistor") — string branching, not data.
- Dice that never leave a tray box (Owlbear default) — others don't _see_ the roll; the shared
  popup is a compromise. DSN/DDB/TaleSpire "dice over the shared canvas" is the felt-presence
  pattern the owner wants.
- Modal "What's New"/consent overlays inside the play screen (Roll20 sidebar).
- Layer switcher as a global mode (Roll20 GM/Tokens/Map layer) — users forget which layer they
  are on; Owlbear's per-item layer button + dock tabs is safer.

## Owlbear parity checklist

Each Owlbear 2 capability → best-executed equivalent elsewhere → evidence crop.

| Owlbear capability                                                                    | Owlbear crop                                                                                             | Best equivalent elsewhere                                                                                            | Crop                                                                                                                 |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Scenes list + switching (scene dock, cards, open/edit)                                | `obr-scene-dock.jpg`, `obr-scenes-list.jpg`                                                              | Foundry scene navigation (top-left collapsed list, "P" player-visible pill) + scenes directory                       | `foundry-play-screen-player.png`, `foundry-v13-scene-directory-gm.png`                                               |
| Token context menu: hide/lock/layer/size(flip)/rotate/copy/attach/text/delete         | `obr-token-context-menu.jpg`, `obr-token-overflow-menu.jpg`                                              | DDB under-token mini toolbar (add-to-initiative, hide with Shift+H hint, size, lock, delete)                         | `ddb-token-context-toolbar.jpg`, `ddb-dm-hidden-token-toolbar.png`                                                   |
| Layers (map/prop/mount/character/attachment/note/text/pointer/fog)                    | `obr-character-dock-bottom.jpg` (dock tabs), `obr-token-context-menu.jpg` (layer button)                 | Roll20 layer switcher (Map/Tokens/GM/Light) — global mode, weaker                                                    | `roll20-gm-layer-menu.png`, `roll20-toolbar-rail.png`                                                                |
| Fog tools (fill/cut/brush/pen/rect/circle/poly, hide, preview, single vs multi-layer) | `obr-fog-toolbar.jpg`, `obr-fog-diagram.jpg`                                                             | DDB fog reveal (rect/poly paint, DM only) ; Foundry wall-vision as the automatic upgrade                             | `ddb/ddb-fog-dm.frame.png`, `foundry-play-screen-player.png`                                                         |
| Dynamic fog doors/walls (extension)                                                   | `obr-dynamic-fog-doors.jpg`, `obr-smoke-tools.webp`                                                      | Foundry walls + doors (native)                                                                                       | `foundry-play-screen-player.png` (door markers on walls)                                                             |
| Drawing tools (pen/line/shapes, fill, colour, outline, layer)                         | `obr-drawing-toolbar-top.jpg`, `obr-drawing-modes.jpg`, `obr-draw-stroke-color.jpg`                      | Roll20 draw tools (left rail) — no better; Owlbear wins                                                              | `roll20-toolbar-rail.png`                                                                                            |
| Pointer / ping                                                                        | Owlbear pointer tool in rail (`obr-tool-rail-right.jpg`)                                                 | DDB pointer ripple visible to everyone                                                                               | `ddb/ddb-ping.frame.png`, `ddb/ddb-pointer.frame.png`                                                                |
| Ruler modes (measurement type, scale, attached to drag)                               | `obr-ruler-label.jpg`, `obr-measurement-type.jpg`                                                        | Foundry v13 token drag ruler (waypoints, total, colour by range); Roll20 measure panel (shape/snap/origin/broadcast) | `foundry-token-drag-ruler.png`, `roll20-measure-panel.png`, `roll20-ruler-label.png`                                 |
| Grid settings (size, scale "5ft", measurement type, alignment)                        | `obr-grid-controls-panel.jpg`, `obr-scale-badge.jpg`                                                     | Foundry scene config grid tab; DDB map scaling flow                                                                  | `foundry/kb/foundry-scene-grid.png`, `ddb/ddb-scaling-2.jpg`                                                         |
| Hidden tokens vs player view                                                          | `obr-token-context-menu.jpg` (eye), `obr-pretty-sordid-initiative.png` (eye per row)                     | DDB: red hatched hidden token for DM, absent for players; hidden creature greyed in DM initiative                    | `ddb-dm-hidden-token-toolbar.png`, `ddb-hidden-wolf-in-initiative.jpg`, `ddb-player-view-party-strip-no-sidebar.jpg` |
| GM vs player permissions (per-player dialog, item owner)                              | `obr-player-permissions.jpg`, `obr-token-owner-menu.jpg`, `obr-players-panel.jpg`                        | Foundry per-document ownership + player list with roles                                                              | `foundry-v13-players-latency.png`                                                                                    |
| Dice extension (3D roll, bonus/ADV, shared results, hidden GM rolls)                  | `obr-dice-tray-docked.jpg`, `obr-dice-bonus-adv.jpg`, `obr-dice-shared-popup.jpg`, `obr-dice-recent.jpg` | Foundry + Dice So Nice: dice over the shared canvas, chat card, hidden = "?" faces + `???` card                      | `foundry-dsn-hidden-dice-question-marks.png`, `foundry-chat-roll-cards-blind.png`, `dice-so-nice-overlay.png`        |
| Initiative extension (list, current turn, next, hidden rows)                          | `obr-initiative-tracker.jpg`, `obr-add-to-initiative.jpg`, `obr-pretty-sordid-initiative.png`            | DDB (DM list + player strip + NEXT/round/turn); BG3 strip for the turn card look                                     | `ddb-initiative-sidebar-hp-popover.jpg`, `ddb-player-view-party-strip-no-sidebar.jpg`, `bg3-initiative-strip.png`    |
| Bubbles HP/AC (bubbles on token, auto health bar, inline math, GM lock)               | `obr-bubbles-hp-ac-on-tokens.jpg`, `obr-bubbles-gm-context.png`, `obr-bubbles-action-gm-roll.png`        | Foundry token bars + dynamic ring flash; Menyr HP/resource bars + movement label                                     | `foundry-token-hover-name-bars.png`, `foundry/foundry-token-ring.webp`, `menyr-token-hp-and-25ft.jpg`                |
| Character dock / asset manager (place tokens by drag)                                 | `obr-character-dock-bottom.jpg`, `obr-mobile-asset-manager.jpg`                                          | DDB "add monster/character" from encounter (adds to map + initiative)                                                | `ddb/ddb-adding-monster.frame.png`, `ddb/ddb-placing-tokens.frame.png`                                               |
| Text labels / notes                                                                   | `owlbear/obr-text.jpg`                                                                                   | DDB name chips under tokens                                                                                          | `ddb-initiative-list-and-tokens.jpg`                                                                                 |
| Players panel / invite                                                                | `obr-players-panel.jpg`                                                                                  | Foundry players list w/ latency                                                                                      | `foundry-v13-players-latency.png`                                                                                    |
| Mobile layout                                                                         | `obr-mobile-phone.jpg`                                                                                   | (none of the others) — Owlbear is the only real reference                                                            | —                                                                                                                    |
