# Component reference observations (refs2)

Sources: official Steam store screenshots (1080p) for Solasta, Divinity: Original Sin 2, Pathfinder: Wrath of the Righteous, Hades, Hades II; official marketing pages for Roll20, Foundry VTT (home + dnd5e system page), Demiplane, Alchemy RPG, Shard Tabletop, Owlbear Rodeo, Kanka, LegendKeeper. BG3 was captured earlier in `refs/bg3` and is referenced only where it sharpens a verdict.

Capture caveats (so nobody over-reads the evidence):

- WotR store shots are almost UI-less (cinematics); only the world-map bar, dialogue paper and threat rings show chrome. No sheet, no action bar.
- Hades II store shots hide the HUD; only dialogue nameplates were usable. Hades I carries the HUD evidence for both.
- `roll20.net/features`, `foundryvtt.com/features`, `demiplane.com/nexus` and `app.demiplane.com/nexus/dnd` are 404/redirects; the Demiplane sheet evidence comes from the three product screenshots on its home page, Foundry's from the dnd5e system page.
- Owlbear/LegendKeeper lazy-load their media; the first pass produced blank boxes, the second (scrolling) pass filled them.
- Web crops are upscaled from marketing images (2x-3x), so type is soft; shapes, placement and colour are still reliable, exact glyphs are not.

---

## 1. Identity: portrait + name + HP

**Solasta** (`solasta-portrait`, `solasta-initiative`): circular portrait (~110 px) with a thin light ring, level number "1" overlaid bottom-centre inside the circle in white. Ancestry/class are label-over-value pairs to the right, labels in 10 px letter-spaced grey caps, values in 14 px white. In combat each combatant is a 115x130 px portrait tile; HP is bare text "19/19" centred on the tile's bottom strip, no bar. Current-HP number is white, max is grey, low HP goes red ("2/5"). A small heart or shield glyph in the top-right corner of a tile marks a buff.

**DOS2** (`dos2-party-portraits`, `dos2-hp-header`, `dos2-vitals`): left-column vertical portrait cards (~100x140 px) in ornate bronze frames; underneath each, two stacked slim bars: grey physical armour + blue magic armour on one row, red vitality on the row below. Numeric HP lives only inside the sheet ("225/225" next to a red heart, AP "6 (+4)" next to a green orb) and in the Attributes list ("Vitality 957/957"). Icons are literal: heart = HP, green orb = action points, purple orb = source points.

**Hades** (`hades-hp`, `hades-hp-low`): bottom-left; a wide (~330 px) horizontal red bar in a gold-edged black frame, current/max as big white sans numerals "122 / 160" to the right of the bar, then a red gem icon with "1 / 3" (death defiances). Below the HP bar a second thinner bar (call/gauge) with a flame texture. At low HP the entire panel's backdrop glows red and the numerals turn red ("23 / 100"): state is broadcast by colour, not by an extra label. Boss HP is a slim red bar under a centred name at the top of the screen (`hades-boss-hp`), no numbers.

**WotR** (`wotr-party-bar`): six 100x120 portraits in dark metal frames with a vertical green HP sliver on the left edge of each frame; no numbers on the bar.

**BG3** (`refs/bg3-portrait`): square-ish portrait, HP as a green fill bar under it with number overlaid; conditions stacked as small square icons beside the portrait.

**Foundry dnd5e** (`foundry-dnd5e-sheet`): top band is a dark crimson header with big white serif caps name "HOBBS", class/level "CLERIC 15" in small caps under it, and a round gold "15" level medallion top-right with an XP bar beneath. The portrait is a large square (~200 px) framed panel on the left; directly under it a shield-shaped AC badge and a green HP bar "88 / 153" with a red hit-dice bar "15 / 15" beneath.

**Demiplane** (`demiplane-sheet-left`, `demiplane-sheet-right`): name in an ornate gold-bordered plaque top-left ("FEIYA") with a small round portrait; right-side layout shows a level/tier medallion top-right and HP/stress as rows of hollow pips next to the label rather than a bar.

**Alchemy** (`alchemy-hero-sheet`, `alchemy-npc-cards`): character card style: small round portrait, name in gold small caps, HP as a short red segment bar; journal entries render a roll as two dice-result chips and the totals "12 ATTACK · 0 DAMAGE" in large numerals.

**Roll20** (`roll20-sheet-zoom`): black sheet with red accent; the header row is name + a row of three boxed stats "10 / 10" HP, a temp box and "1" AC, with "Short Rest / Long Rest" buttons directly under HP.

**Verdict — best practice:** portrait left, name + class/level immediately right, HP as a _bar with the numerals printed on or beside it_, and a colour state that changes the whole component (Hades red glow, Solasta red numeral) rather than a tiny icon. Reasons: (1) Solasta's bare "2/5" text is readable at a glance but gives no proportional sense; Hades and Foundry give both the proportion and the number in one read. (2) DOS2 proves that armour/temp layers work as _stacked slim bars in different hues_ above the red HP bar without text. (3) Foundry shows the level belongs in a medallion attached to the name, not floating in the stat grid. Evidence: `hades-hp`, `hades-hp-low`, `foundry-dnd5e-sheet`, `dos2-party-portraits`, `solasta-initiative`.

---

## 2. Ability scores

**Solasta** (`solasta-abilities`): 3x2 grid of 70x75 px dark tiles; each tile has a 10 px letter-spaced caps label on a slightly lighter header strip ("STR"), a 28 px white score ("11") and a small pill at the bottom edge carrying the modifier, colour-coded: blue pill for positive ("+2"), grey for zero, muted red for negative ("-1"). Score dominant, modifier secondary.

**DOS2** (`dos2-attributes`): plain two-column table on parchment: serif label left, value right-aligned; grouped with blank lines (core attributes / combat derived / movement+initiative / experience / resistances with coloured element glyphs). Derived stats that are "in play" (Accuracy, Dodging) are tinted rust-red. No modifiers because the system has none.

**Foundry dnd5e** (`foundry-dnd5e-sheet`): six shield/pentagon-shaped chips in a horizontal row under the header; modifier "+5" printed large inside the shield, the raw score "20" small underneath, three-letter label above. Modifier-first.

**Demiplane** (`demiplane-sheet-right`): three grouped columns "PHYSICAL / COGNITIVE / SPIRITUAL" each holding three stat boxes (label, big value, small sub-value) in a dark-blue panel with gold section captions; grouping gives the system's structure at a glance.

**Roll20** (`roll20-sheet-zoom`): six red-bordered boxes in one row with score and modifier stacked; dense, sheet-like.

**BG3** (`refs/bg3-abilities`): six vertical cards with a big score and a small modifier badge, gold on dark.

**Verdict — best practice:** a compact grid of six tiles with _one dominant number_ and a colour-coded modifier pill (Solasta), or modifier-dominant chips (Foundry) when the app's math is modifier-first (D&D 2024 is). Reasons: (1) The Solasta pill colouring (blue/grey/red) explains sign without reading the digit. (2) Foundry's shield silhouette makes the six scores recognisable as one family separate from skills. (3) DOS2's flat table is the fallback density mode for a "full sheet" view but reads slower. Evidence: `solasta-abilities`, `foundry-dnd5e-sheet`, `demiplane-sheet-right`.

---

## 3. Vitals: AC / initiative / speed / proficiency / hit dice

**Solasta** (`solasta-vitals`): a second 3x2 tile grid with the same tile grammar as abilities but values in _teal-blue_ instead of white: AC 16, INIT –, MOVE "1" + a cube glyph (cells), PROF +2, HP 11, HIT DICE "1" + a d10 die glyph. Colour separates derived from base stats; the glyphs explain units.

**DOS2** (`dos2-attributes`, `dos2-tooltip-equip`): Physical Armour and Magic Armour as "327/327" pairs; in the tooltip each armour type has its own icon (blue snowflake shield = magic, grey shield = physical) and the number is printed _before_ the label, large.

**Foundry dnd5e** (`foundry-dnd5e-sheet`): AC "18" in a shield silhouette with three round pips on each side (attunement/exhaustion style trackers), then a row of three small hexagons: "+1 INITIATIVE", "30 WALK", "+5 PROFICIENCY" with tiny caps labels under each value.

**Roll20** (`roll20-sheet-zoom`): "INITIATIVE +5" as a red button-like chip and "AC 18" in a boxed stat, both under the HP row.

**Hades** (`hades-hp`): the "1 / 3" death-defiance counter uses a red gem icon and mono-width numerals inline with HP.

**BG3** (`refs/bg3-sheet-left`): AC shield icon with numeral, initiative and speed as small icon+number pairs beside the portrait.

**Verdict — best practice:** vitals as a row/grid of small stat chips _with a silhouette per stat_ (shield for AC, footprint/arrow for speed, d-icon for hit dice), values in an accent colour distinct from ability scores, labels in 10 px caps. Reasons: (1) Solasta's teal-vs-white split makes "what you rolled" vs "what the rules derived" legible without a header. (2) Foundry's shield-AC and hexagon chips turn a number into a recognisable badge, which matters most on phones. (3) Unit glyphs (Solasta cube, d10) remove the need for "ft" / "cells" text in both locales. Evidence: `solasta-vitals`, `foundry-dnd5e-sheet`, `dos2-tooltip-equip`.

---

## 4. Status / conditions

**Hades** (`hades-boons`, `hades-boons-small`): vertical column of 45 px _diamond_ (rotated square) icons on the left screen edge, each with a coloured inner glyph (red/purple/yellow/green = god) and a gold rim; "Lv.2" tag under some, a "+8"/"+1" floating number for counters. Column can hold 10+ without labels; hover explains.

**DOS2** (`dos2-party-portraits`, `dos2-initiative`): tiny 18 px square icons stacked at the top-right corner of each portrait (green cross, blue music note = status); in the initiative bar, a red frame around a portrait = enemy, a red drip bar = hostile.

**Solasta** (`solasta-initiative`): a single heart (pink) or shield (teal) glyph in the tile's top-right; extremely sparse.

**Foundry dnd5e** (`foundry-dnd5e-sheet`, `foundry-dnd5e-ruletip`): "RESISTANCES / IMMUNITIES" sections list conditions as small rounded pill tags in green (FIRE, POISON, DISEASED) and grey (COMMON, ELVISH...). The ruletip crop shows a rule tooltip for "Darkvision" opening from underlined green text with a "RULE" badge.

**WotR** (`wotr-threat-rings`, `wotr-topbar`): state is shown on the map: red circle under enemies, green under party members; morale as three green banner glyphs in the top bar.

**BG3** (`refs/bg3-conditions`): square icons in a strip below the portrait, each with a number for duration.

**Verdict — best practice:** conditions as a strip of _shaped icons_ (BG3 squares / Hades diamonds) attached to the identity block, with a duration number overlay, plus a _tag-pill list_ (Foundry) inside the sheet where the name must be legible. Reasons: (1) Hades proves a shape + colour system carries 10+ statuses in ~50 px of width. (2) Foundry's pills are the only captured pattern that is readable without hover, which the "explain on demand" rule needs on mobile. (3) DOS2's 18 px corner icons are too small to tap. Evidence: `hades-boons`, `foundry-dnd5e-sheet`, `refs/bg3-conditions`.

---

## 5. Action economy (action / bonus / reaction / movement)

**DOS2** (`dos2-action-economy`): a centred cluster at the bottom: "YOUR TURN" as a teal banner with bevelled ends above; a row of six green orbs (AP) that dim to dark green when spent; below them the wide HP/armour bar; "END TURN" as a matching teal bevelled button to the right. Everything is on one horizontal axis.

**Solasta**: no explicit action pips in the store shots; the round counter "Round 1 / In Battle" sits inside a compass disc bottom-right (`solasta-round-panel`).

**Hades** (`hades-hp`): the "1 / 3" gem counter and the cast/call gauge are the closest analogue: a filled/empty count next to an icon.

**Foundry dnd5e** (`foundry-dnd5e-sheet`): no pips; rests are buttons under HP ("SHORT REST / LONG REST").

**BG3** (`refs/bg3-ecopill`, `refs/bg3-hud-bottom`): action = green circle, bonus action = orange triangle, movement as a horizontal bar with feet remaining; the three shapes are also used as tiny badges on each hotbar icon to show what it costs.

**Verdict — best practice:** a horizontal pip row where each economy slot is a _distinct shape and colour_ (BG3 circle/triangle; DOS2 orbs for uniform points) that dims when spent, placed directly above the action list and next to the "End turn" control. Reasons: (1) DOS2's dim-on-spend orbs read at any size without text. (2) BG3's shape-per-slot doubles as a cost badge on every action, which is the cheapest explanation of "what does this consume". (3) Keeping the round/turn banner ("YOUR TURN") on the same axis means one glance gives turn state + budget. Evidence: `dos2-action-economy`, `refs/bg3-ecopill`, `refs/bg3-hud-bottom`.

---

## 6. Action / attack list (hotbar, attacks table)

**DOS2** (`dos2-hotbar`, `dos2-hotbar-controller`): a full-width bottom strip of 44 px square icons with 1-0 hotkey numerals in the corner; the controller variant uses larger 80 px icons with a green selection frame and a "2" count badge on consumables. Icons are full-bleed illustrations, no text.

**Foundry dnd5e** (`foundry-dnd5e-sheet`): "FAVORITES" block under the portrait: rows with an icon, name "Mace", a subline "Melee Weapon Attack", and right-aligned "+1 / +5" (attack / damage), plus "1st Level Slots 4 / 4" as a favourite; a dashed "DROP FAVORITE" target underneath.

**Roll20** (`roll20-sheet-zoom`): "COMBAT" tab is a table: name, range, to-hit "+5", damage "1d8+3", type; rows striped; red chevrons act as roll buttons.

**Alchemy** (`alchemy-npc-cards`): each journal roll is a card: title, then dice-result chips, then "12 ATTACK / 0 DAMAGE" as two big numerals with tiny caps labels; visually a "receipt" of the action.

**Solasta** (`solasta-combatlog`): combat log lines use inline colour-coded names (blue = ally, yellow = enemy), small caps for weapon/spell names, and result chips "10 (Miss)" red / "14 (Hit)" green.

**BG3** (`refs/bg3-hotbar`): icon grid with cost badges (see §5) and a separate "Attacks" list in the sheet.

**Verdict — best practice:** two surfaces: (a) an icon hotbar for play with the economy-cost badge on each icon (BG3/DOS2), and (b) a list/table row per attack with _icon · name · subline · right-aligned to-hit and damage formula_ (Foundry favourites, Roll20 combat tab). Reasons: (1) Foundry's row pattern surfaces the two numbers players actually need with a subline that explains the type. (2) Solasta's colour-coded hit/miss chips and the Alchemy "attack/damage" numerals show that formula results should be rendered as chips, not prose, which suits a no-dice-rolling app showing formulas. (3) DOS2 full-bleed icons without labels do not survive translation or first-time use; keep the label. Evidence: `foundry-dnd5e-sheet`, `roll20-sheet-zoom`, `solasta-combatlog`, `dos2-hotbar-controller`.

---

## 7. Spell list & slots

**Foundry dnd5e** (`foundry-dnd5e-sheet`): "1st Level Slots 4 / 4" rendered as a favourite row with a blue spell-book icon; the pattern is count-current / count-max text.

**Demiplane** (`demiplane-sheet-left`): the Daggerheart sheet lists "LEVEL 1 ... LEVEL 8" rows in a dark panel, each row a label plus a right-aligned pill button ("+1 DOMAIN CARD"), collapsed into an accordion.

**Roll20** (`roll20-sheet-zoom`): a "SPELLS" tab beside COMBAT/INVENTORY; slots as small boxed counters at the top of the tab.

**Shard** (`shard-players`): the spell list is a plain table (name, level, school) under an "SPELL LIST" caption on a cream sheet; slots as a row of small cells.

**DOS2** (`dos2-tooltip-item`): a skill-granting item lists five skills as icon + "Grants skill" muted caption + skill name; the last one is crossed with a red X to show it is unavailable.

**Games with slot pips:** none of the captured store shots show D&D-style slot pips; BG3's `refs/bg3-hud-bottom` shows spell-slot dots as small filled/empty circles grouped by level.

**Verdict — best practice:** group by level with a _level header row that carries the slot pips_ (filled/empty circles, BG3 style) on its right edge, then spell rows underneath with icon, name, and a right-aligned casting-time/range chip; collapse levels the character has no slots for (Demiplane accordion). Reasons: (1) Foundry's "4 / 4" text is precise but not scannable; pips read faster and can be tapped to spend. (2) Demiplane's per-level accordion keeps an eight-level list short on a phone. (3) DOS2's red-X-over-icon is the right idiom for "known but unavailable" (e.g. no slot left). Evidence: `refs/bg3-hud-bottom`, `demiplane-sheet-left`, `foundry-dnd5e-sheet`, `dos2-tooltip-item`.

---

## 8. Initiative / turn order

**Solasta** (`solasta-initiative`): a top-edge horizontal strip of 115 px portrait tiles alternating party and enemies; the _active_ combatant's tile is taller (drops below the strip) and has a teal left border; each tile carries HP text; enemies use a dark red backdrop.

**DOS2** (`dos2-initiative`): top-centre strip of 60 px portraits; the active one is enlarged (~90 px) and sits left with its name printed underneath ("The Red Prince"); enemies get a red frame, allies a gold one; a thin vertical white divider marks the round boundary; each portrait has its tiny HP/armour bars beneath.

**Owlbear Rodeo** (`owlbear-initiative`): a floating dark panel "Initiative" with a skip-forward icon in the header; rows are "Fighter 26 / Rogue 22 / Dragon 18 / Paladin 15 / Cleric 12", right-aligned numbers; the active row is highlighted with a purple wash. Pure list, no portraits.

**Hades** (`hades-boss-hp`): not turn-based, but shows two boss names with slim red bars in the top band, which is the same slot games reserve for turn order.

**WotR**: no turn strip in the store shots; green/red rings under tokens signal side.

**BG3** (`refs/bg3-initiative`): top strip of round portraits, active one enlarged, grouped by side.

**Verdict — best practice:** a top strip of portrait chips in turn order with the active chip _enlarged or dropped out of the row_ and named, a side colour (gold/teal ally, red enemy), a round divider, and HP under each chip; on narrow screens fall back to Owlbear's list (name + initiative number, highlighted row). Reasons: (1) Solasta and DOS2 independently converge on "active = bigger + border + name", which is unambiguous without reading. (2) DOS2's round divider is the only captured cue for "when does the round reset", which D&D needs for end-of-turn effects. (3) Owlbear proves a bare list is sufficient when space is short, provided the active row has a strong tint. Evidence: `solasta-initiative`, `dos2-initiative`, `owlbear-initiative`, `refs/bg3-initiative`.

---

## 9. Tooltips / explain-on-demand

**DOS2** (`dos2-tooltip-item`, `dos2-tooltip-equip`): tall dark card with a bronze frame; title in 18 px serif white; a muted caps category line ("HELMET"); stat lines with an icon and the number _before_ the label ("22 Magic Armour"); bonuses in cyan ("+2 Memory"); requirements in grey; italic flavour text; footer row with rarity in colour ("RARE" cyan, "Common" white), weight and price. Hierarchy comes from four text colours on one dark ground.

**Foundry dnd5e** (`foundry-dnd5e-ruletip`): inline rule links are underlined green text with a tiny icon; hovering opens a parchment tooltip titled "Darkvision" with a "RULE" badge top-right and a 4-line definition where related terms ("Darkness", "Dim Light") are themselves grey chips. Also a "Roll Request" card: "DC 15 INTELLIGENCE (NATURE)" in a white capsule, then the formula "1d20 + 2 + 0 + 1" in a grey field and the result "17" in a green box.

**Solasta** (`solasta-combatlog`, `solasta-section-titles`): the log explains every roll inline: "rolls 10+4 = 14 (Hit)"; the character-creation panel labels every control with an icon + caps label + chevron.

**Hades / Hades II** (`hades-nameplate`, `hades2-nameplate`): speaker nameplates are a dark rounded plaque with the name in a custom display face and a subtitle in small caps ("PRINCESS OF THE UNDERWORLD"), edged with a thin gold (Hades) or silver (Hades II) filigree; the body text box hangs below in the same dark glass.

**WotR** (`wotr-dialogue`, `wotr-map-labels`): parchment paper with a red-drop-cap name and numbered options; map labels are small parchment scrolls with a red initial capital.

**Alchemy** (`alchemy-npc-cards`): every roll is explained as a card with the individual dice values as chips, then totals.

**Verdict — best practice:** a dark card tooltip with a title, a small caps category line, number-first stat lines with an icon, colour for bonuses/requirements, and a footer strip (DOS2), plus Foundry's _chip-in-tooltip_ pattern for nested terms and its "formula field then result box" layout for rolls. Reasons: (1) DOS2's four-colour text hierarchy explains an item in under two seconds with zero layout tricks. (2) Foundry's chips inside a tooltip solve the "term inside an explanation" recursion the explain-everywhere rule creates. (3) The Foundry roll-request card is the clearest captured rendering of "formula shown, result entered", which maps onto a no-RNG app. Evidence: `dos2-tooltip-equip`, `dos2-tooltip-item`, `foundry-dnd5e-ruletip`, `solasta-combatlog`.

---

## 10. Section titles / panels

**Solasta** (`solasta-section-titles`, `solasta-stepper`): panel title "IDENTITY" in 32 px letter-spaced caps at low contrast (grey on dark) with a small filigree in the corner; field labels 10 px caps grey; values 20 px small-caps serif white; sections are separated by hairlines and each collapsible row has an icon + 11 px caps label + a chevron on the right. Wizard steps run along the bottom as a dotted rail with checkmarks and the current step as a hexagonal gem.

**DOS2** (`dos2-sheet`): tab strip of five square icon tabs, active tab has a red underline; panel title "Attributes" as a centred serif title in a dark bar over parchment; the page body is a lighter parchment sheet inside a dark bronze frame.

**Foundry dnd5e** (`foundry-dnd5e-sheet`): sub-panels are cream cards with a centred 11 px caps title with an icon ("SKILLS", "SAVING THROWS") inside a rounded gold hairline border; right-column groups ("SENSES", "RESISTANCES", "ARMOR", "WEAPONS", "LANGUAGES") are caps captions with an icon and a rule underneath, contents as pills.

**Demiplane** (`demiplane-sheet-right`): gold small-caps captions ("PHYSICAL", "COGNITIVE", "SPIRITUAL") over dark blue boxes; the section header is the group name of the three stats below it.

**Alchemy** (`alchemy-party-panel`): tab pairs "PARTY / NPCS" and "JOURNAL / NOTES" in small caps with the active tab underlined in white; rows are avatar + bold name + muted handle.

**Owlbear** (`owlbear-initiative`, `owlbear-players-panel`): floating dark glass panel, 22 px semibold title left, icon actions right, hairline under the header, list rows below.

**LegendKeeper** (`legendkeeper-lore-page`, `legendkeeper-timeline`): tab row under the page title (Overview / Map / History), left sidebar tree, cards with image headers for timeline entries.

**Kanka** (`kanka-entity-page`): white app, blue accent, entity name as page title with a left nav; standard SaaS.

**Hades** (`hades-nameplate`): title plaque with name + subtitle in a display face; the only captured example of a _two-line_ title (name + descriptor) as a fixed component.

**Verdict — best practice:** section title as _small caps letter-spaced caption with a leading icon and a hairline_ (Solasta / Foundry), never a large bold heading; panel body on a slightly different value of the same dark ground with one hairline border; tabs as an underlined small-caps strip (Alchemy / DOS2 underline). Reasons: (1) Solasta and Foundry both keep titles quiet (10-11 px caps) so values (20-28 px) own the hierarchy, which is what a stat sheet needs. (2) Foundry's icon-in-caption gives each section a glyph that can double as the mobile tab icon. (3) The Hades name + subtitle plaque is the right model for the character header (name / "Level 5 Wood Elf Ranger") rather than a generic panel title. Evidence: `solasta-section-titles`, `foundry-dnd5e-sheet`, `alchemy-party-panel`, `hades-nameplate`.

---

## Crop index (`refs2/crops/`)

Games

- `solasta-portrait.png` — round portrait with level "1" inside, ancestry/class label-value pairs (2x).
- `solasta-abilities.png` — 3x2 ability tiles, score big, colour-coded modifier pill (2x).
- `solasta-vitals.png` — 3x2 vitals tiles in teal: AC, INIT, MOVE+cube glyph, PROF, HP, HIT DICE+d10 glyph (2x).
- `solasta-sheet-panel.png` — full left panel of the character creator: portrait, abilities, vitals (1.5x).
- `solasta-section-titles.png` — "IDENTITY" panel: big low-contrast title, field labels, gender toggle, collapsible icon rows with chevrons (1.5x).
- `solasta-stepper.png` — creation wizard rail with checkmark steps and hexagonal current-step marker (1.5x).
- `solasta-initiative.png` — top turn-order strip: alternating party/enemy portrait tiles, HP text, active tile taller with teal border (1.5x).
- `solasta-combatlog.png` — combat log with colour-coded names, small-caps weapon names, red "(Miss)" / green "(Hit)" chips (2x).
- `solasta-round-panel.png` — quest tracker, FACTIONS/QUESTS buttons, compass disc with "Round 1 / In Battle" (1.5x).
- `dos2-initiative.png` — top turn order: enlarged active portrait with name, gold/red frames, round divider, mini bars under each (1.5x).
- `dos2-party-portraits.png` — left column portrait cards with stacked armour/magic/HP bars and corner status icons (1.5x).
- `dos2-action-economy.png` — "YOUR TURN" banner, six AP orbs, HP/armour bar, "END TURN" button (2x).
- `dos2-hotbar.png` — full-width PC hotbar with numbered 44 px icons (1x).
- `dos2-hotbar-controller.png` — controller hotbar with 80 px icons, green selection frame, count badge (1.5x).
- `dos2-sheet.png` — whole character sheet: icon tabs, Attributes parchment, equipment column, item tooltip (1x).
- `dos2-attributes.png` — parchment two-column attribute table with grouped blocks and elemental resistances (1.5x).
- `dos2-vitals.png` — Vitality / Action Points / Source Points rows with heart, green orb, purple orb icons (2x).
- `dos2-tooltip-item.png` — item tooltip: title, category, level, "Grants skill" list with crossed-out entry, flavour text, rarity/weight/price footer (1.5x).
- `dos2-tooltip-equip.png` — equipment tooltip: "22 Magic Armour / 8 Physical Armour" with icons, cyan bonuses, requirements, RARE footer (1.5x).
- `dos2-hp-header.png` — sheet header "225/225" heart and "6 (+4)" AP orb (2x).
- `hades-hp.png` — bottom-left HP bar frame with "122 / 160" and gem "1 / 3", flame gauge below (2x).
- `hades-hp-low.png` — same HP component at 23/100: red glow backdrop, red numerals (2x).
- `hades-boons.png` — left column of diamond boon icons with Lv tags and "+8" counter (1.5x).
- `hades-boons-small.png` — short boon column with "+1" and Lv.3 / Lv.2 tags (2x).
- `hades-boss-hp.png` — two boss name + slim red bar pairs in the top band (1.5x).
- `hades-nameplate.png` — dialogue plaque: name in display face, small-caps subtitle, gold filigree (1.5x).
- `hades2-nameplate.png` — Hades II plaque variant with silver filigree and dark glass text box (1x).
- `wotr-party-bar.png` — six framed portraits with green vertical HP slivers (1.5x).
- `wotr-topbar.png` — world-map top bar: morale banners, clock, date, "Skip Day" button (1x).
- `wotr-map-labels.png` — parchment scroll location labels with red drop-cap initials (1.5x).
- `wotr-threat-rings.png` — combat: red rings under enemies, green under party (0.6x).
- `wotr-dialogue.png` — parchment dialogue with portrait, red drop-cap speaker, numbered options (1x).

Web

- `roll20-hero-product.png` — hero mockup of the tabletop with a map window (2x, soft).
- `roll20-app-overview.png` — full Roll20 tabletop: toolbar rail, character sheet window, map, journal list (1.5x).
- `roll20-customize-ui.png` — "Choose Target" overlay and token HP "40/40" pill (2x).
- `roll20-sheet-zoom.png` — the 5e sheet window: header HP/AC boxes, rest buttons, six ability boxes, skills column, combat table (3x, soft).
- `foundry-core-features.png` — Foundry marketing slide: system-agnostic map with sheets, journal and 3D dice (1.5x).
- `foundry-dnd5e-sheet.png` — Foundry dnd5e sheet: crimson header with level medallion, shield ability chips, AC shield with pips, HP and hit-dice bars, favourites, skills and saves cards, pill tags (2.5x).
- `foundry-dnd5e-ruletip.png` — roll-request card (DC capsule, formula field, green result) and "Darkvision" RULE tooltip with nested term chips (2.5x).
- `shard-players.png` — Shard player view: cream sheet with spell list table next to a map (2.5x, soft).
- `shard-gm.png` — Shard GM view: encounter table, map, stat block panel (2.5x, soft).
- `demiplane-sheet-left.png` — Daggerheart sheet: ornate name plaque, left nav of build steps, per-level accordion rows with pill buttons (2.5x).
- `demiplane-nexus-center.png` — Daggerheart Nexus landing page with nav and "PLAY NOW" (2x).
- `demiplane-sheet-right.png` — Daggerheart sheet: three gold-captioned stat groups, pip trackers, tabbed lower panel (2.5x).
- `alchemy-hero-sheet.png` — Alchemy tablet mockup: cinematic scene with a sheet drawer on the right (1.5x).
- `alchemy-play-screen.png` — Alchemy play screen: journal cards left, tavern scene, PARTY panel and scene list right (1x).
- `alchemy-party-panel.png` — PARTY/NPCS tabs, avatar + name + handle rows, online dots (2.5x).
- `alchemy-npc-cards.png` — journal roll cards with dice chips and ATTACK / DAMAGE numerals (2.5x).
- `kanka-entity-page.png` — Kanka entity page on laptop + phone: sidebar, entity header, tabbed body (2x).
- `legendkeeper-hero.png` — LegendKeeper hero: wiki page card, interactive map with pins, d20 (1.2x).
- `legendkeeper-lore-page.png` — wiki page with tabs, prose, image cards, side properties (2.5x).
- `legendkeeper-map.png` — nested map with coloured pins (1.5x).
- `legendkeeper-timeline.png` — timeline view: date rail with diamonds, image-header event cards (2x).
- `legendkeeper-board.png` — whiteboard: pinned map, notes, arrows, right properties panel (1.5x).
- `owlbear-initiative.png` — floating Initiative panel: name + number rows, purple active row, skip icon (3x).
- `owlbear-dice-panel.png` — dice tray extension with a die-type rail and "42" total (2x).
- `owlbear-token-bar.png` — round token picker bar and bottom tool row (2x).
- `owlbear-players-panel.png` — Players panel: colour dots, GM badge, overflow menus (3x).

Full frames: `refs2/<game>/NN.jpg` plus `contact.png` per game; `refs2/web/*.png` full-page captures (alchemy, demiplane, foundry home + dnd5e, kanka, legendkeeper, owlbear, roll20 home + characters, shard).
