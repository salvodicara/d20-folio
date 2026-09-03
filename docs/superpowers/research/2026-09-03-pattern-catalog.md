# d20 Folio — UI pattern catalog (element by element)

Built 2026-09-03 from the captures in `refs/`, `refs2/`, `refs3/` (every cited file was opened and looked at; paged/cropped previews live in `pc/`, raw viewing notes in `pc/notes.md`). Sizes are given in CSS px unless noted; "@2x" captures (D&D Beyond desktop 2880 px, iPhone store shots 1242/2000 px) were divided down. Products: D&D Beyond (DDB) web + iOS, Roll20 (2014 + 2024 sheets), Foundry dnd5e, Demiplane, Pathbuilder 2e, PrismScroll, open5e, Shard, Alchemy, Owlbear Rodeo, Kanka, LegendKeeper, Obsidian Portal, World Anvil; games BG3, Solasta, Divinity OS2, Pathfinder WotR, Hades.

Conventions: **Dominant** = what most products do. **Best** = the single execution worth copying and why. **Measured** = numbers read off the captures. **Mobile** = the narrow-screen variant seen. **Anti** = what not to copy, with the capture that shows the failure.

Dead evidence (do not cite): `refs/ddb-app.png` (App Store 404), `refs3/compendium/ddb-goblin-mobile.png` and `refs3/roster/ddb-characters-mobile.png` (DDB redirect + cookie modal only), `refs2/crops/hades-nameplate.png` (scenery, no nameplate), `refs/bg3-ui.png` and `refs/bg3-conditions.png` (wiki pages with consent modals; only the tiny inset in `pc/bg3-cond-inset.png` is usable), `refs2/web/foundry-dnd5e.png` below y=900 (prose only).

---

## 1. App shell & primary navigation

**Dominant.** Desktop: a dark 56–64 px top bar with 4–6 text menus and one primary CTA at the right (DDB `pc/ddb-desk-1-half.png`: PLAY D&D ▾ / RULES ▾ / LIBRARY ▾ / COMMUNITY ▾ / MARKETPLACE + search + "Sign in" + red CREATE ACCOUNT; Demiplane `refs2/crops/demiplane-sheet-left.png`: LIBRARY / GAME RULES / CHARACTERS / GROUPS; Roll20 `refs3/crops/roll20-compendium-header.png`). Content tools (Kanka, LegendKeeper, Foundry, open5e) use a 240–305 px left sidebar of icon + label rows grouped under 11 px letter-spaced captions (`refs3/crops/kanka-sidebar-nav.png` 243 px, `refs3/crops/kanka-sidebar-nav-dark.png` 240 px, `refs3/crops/legendkeeper-sidebar.png` 305 px, `refs3/crops/open5e-monster-list.png` 225 px). Inside a character, navigation is a **tab strip of 6–8 caps labels with a 3 px accent underline** (DDB `refs/ddb-tabs.png`: ACTIONS SPELLS INVENTORY FEATURES & TRAITS BACKGROUND NOTES EXTRAS, active = black text + blue underline; Roll20 2024 `refs3/builder/roll20-help/30751885990551.png`: Combat/Spells/Inventory/Features & Traits/Notes/About, active red; Pathbuilder `refs3/crops/pathbuilder-ipad-skills.png`: BUILD ABOUT DEFENSE OFFENSE GEAR SKILLS SPELLS PETS FEATS, active = dark-red box; Shard `refs2/crops/shard-players.png`: TOP/WEAPONS/SPELLS/FEATURES/EQUIPMENT/LOG/NOTES).

Mobile: two families. (a) **Section switcher** — DDB iOS puts a 44 px bar "🦉 Abilities, Saves, Senses … ⋮⋮⋮ ⬡" under the header; tapping the red 3×3 grid icon opens the section grid, the cube opens dice (`refs3/crops/ddb-app-sheet-abilities.png`, `refs3/store/ddb-ios/phone-03.png`); DDB web mobile uses two blue FABs bottom-right (grid-dots = section picker, « = collapse) (`refs/ddb-mob-1.png`). (b) **Bottom tab bar** — PrismScroll: dark-red bar, 3 tabs on phone (Sheets ³ / Journal / …) growing to 6 on iPad (Sheets / Journal / Dice / Spells / Equipment / Features), icon over 10 px label (`refs3/crops/prismscroll-skills-proficiency.png`, `refs3/store/prismscroll-ios/ipad-09.png`). Pathbuilder keeps the horizontal tab strip and lets it scroll ("Skil…" clipped at the right edge, `refs3/store/pathbuilder-play/00.webp`). Kanka collapses the tab column into a single "Overview ▾" select (`refs2/crops/kanka-entity-page.png`, phone inset).

**Best.** DDB iOS (`refs3/store/ddb-ios/phone-03.png`, `refs3/store/ddb-ios/ipad-12.png`): the persistent header (name, AC, initiative, portrait, HP, rest/conditions) never scrolls away, and the one-row section selector names the current section in words and exposes the grid + dice as the only two icons. Reasons: the header carries the four numbers a player needs every turn; the section name is text, not an icon, so it survives translation; the same component renders identically on iPad (6 shields in one row instead of 3×2).

**Measured.** DDB top bar 64 px; DDB mobile top bar 64 px (logo + search/user/hamburger); section selector 44 px; PrismScroll bottom bar ≈ 56 px; Kanka sidebar items 36 px rows, captions 11 px caps; tab strips 14–16 px caps bold, 3 px underline; Pathbuilder active tab = 32 px tall dark-red box with 1 px white outline.

**Anti.** Six-plus icon-only vertical rails (Foundry's 12-icon rail `refs3/crops/foundry-compendium-sidebar.png`, Roll20 tool rail `refs2/crops/roll20-app-overview.png`) — unreadable without hover. Kanka's dark sidebar lists 25 modules at once (`refs3/crops/kanka-sidebar-nav-dark.png`). The DDB web mobile capture is identical across four scroll positions because the sheet is one 3 000 px column with no anchoring (`refs/ddb-mob-2.png`…`ddb-mob-4.png`).

---

## 2. Character list card / row

**Dominant.** A **row** = square portrait with a 2 px coloured border + name + two grey metadata lines + overflow "…" at the right (DDB iOS `refs3/crops/ddb-app-character-list.png`, `refs3/store/ddb-ios/phone-02.png`, iPad `refs3/store/ddb-ios/ipad-11.png`; Foundry actor rows `refs3/crops/foundry-actor-directory.png`; Roll20 journal `refs3/crops/roll20-journal-sidebar.png`). Web roster pages use 3-up landscape **cards** with an art banner and a text-button footer (DDB `refs3/crops/ddb-mycharacters-cards.png`). One create affordance: a top-right dark button on desktop (`refs3/crops/ddb-mycharacters-header.png`), a sticky bottom pill on mobile (`phone-02`), or a dashed "+" ghost card (PrismScroll `refs3/crops/prismscroll-character-list.png`).

**Best.** DDB iOS row (`phone-02.png`): 48 px portrait with red 2 px border, name 17 px bold, line 2 "Lvl 20 | Harengon" and line 3 "Bard • College of Creation" with the pipe and dot in the accent red, an optional 4th line "⚑ My Waterdeep Adventures" for campaign membership, "•••" at the right, hairline dividers, 6 rows per phone screen, and one sticky "CREATE NEW CHARACTER" pill. Reasons: level/species/class/subclass/campaign all fit without a table; the coloured punctuation gives structure with zero chrome; iPad collapses lines 2–3 into one line (`ipad-11.png`) with no other change. Add PrismScroll's hue-per-class gradient (`prismscroll-character-list.png`, teal→red cleric, purple→blue warlock, red→yellow barbarian) as the border/band colour so four characters are distinguishable at arm's length.

**Measured.** DDB iOS row 73 px (portrait 48 px, name 17 px, meta 12 px); iPad row ≈ 75 px with 30 px portrait; DDB web card 460×230 (banner 110 px, 60 px portrait, name 22 px, footer VIEW/EDIT/COPY/DELETE with DELETE in orange); PrismScroll card 340×90 (glyph 60 px, name 22 px, meta 13 px); Roll20 card 900×200 with 140 px round portrait (2 per screen); Kanka tile 190×230 with name only; Foundry row 50 px with 45 px token.

**Mobile.** DDB iOS row as above; PrismScroll full-width gradient banners; Pathbuilder has no roster — a NEW / LOAD splash with two 16:7 art tiles (`refs3/store/pathbuilder-ios/phone-04.png`).

**Anti.** Roll20's 200 px cards fit two characters per screen (`refs3/crops/roll20-mycharacters-list.png`); Kanka's tiles carry no metadata (`refs3/crops/kanka-characters-grid.png`); DDB web's black "Campaign: … LEAVE CAMPAIGN" strip puts a destructive orange action on every card (`ddb-mycharacters-cards.png`).

---

## 3. Character header (portrait, name, class/level, XP)

**Dominant.** Portrait left (square, bordered), name 20–28 px, one grey line "Species Class N", level as a small label or badge; secondary actions at the right (rest buttons, campaign, manage). DDB desktop band (`pc/ddb-desk-1-half.png`): 60 px portrait with blue border, "Presto" 22 px, "Human Wizard 1" 11 px grey, "Level 1". DDB compact bar (`refs3/crops/ddb-sheet-header-bar.png`, 1528×118): 50 px portrait | name + tiny outlined "MANAGE" pill | "Human Monk 1" | "Level 1" — right: outlined "🔥 SHORT REST" "☾ LONG REST" (95×22 each) and a "CAMPAIGN: Heroes of the Realm | ▷ | ⬡" segmented box. Roll20 2024 (`refs3/crops/roll20-2024-header.png`): 100 px portrait with a red **diamond level badge "3"** hanging from its bottom edge, name + pronouns, Gnome / Barbarian 3 / background / "Exp: 0/2700", "Proficiency Bonus +2" chip, grey "Level Up" button under the portrait, and a stack "Inspiration ☆" (outlined) + "Initiative +1" (solid red 45 px). Foundry (`refs2/crops/foundry-dnd5e-sheet.png`): crimson band, "HOBBS" white serif caps 28 px, "CLERIC 15" small caps, and a gold **level medallion "15" with a thin XP bar "180,000 / 195,000"** under it at the far right. Games: Solasta prints the level inside the round portrait (`refs2/crops/solasta-portrait.png`), BG3 puts a class emblem badge beside a 120 px round portrait (`pc/bg3-10-bottom.png`).

**Best.** DDB iOS header (`refs3/store/ddb-ios/phone-03.png`, `ipad-12.png`): name 17 px centred with "Fairy | Sorcerer 15" under it (pipe in red), then one row: ARMOR-CLASS shield "15" | "+5 INITIATIVE" hexagon | 80 px portrait with a HEROIC INSPIRATION sun badge | HIT POINTS box "92/92" with a 2 px blue bar; second row: rest (campfire) | ⚙ | CONDITIONS button. Reasons: it is the only header that carries AC, initiative, HP, inspiration, rest and conditions in 160 px and stays pinned; Foundry's medallion + XP bar is the right way to show level/XP (level is a badge, XP is a progress bar, both attached to the name, `foundry-dnd5e-sheet.png`) and should be merged into it.

**Measured.** DDB iOS header block ≈ 160 px tall; shields 50×55; portrait 80 px rounded 8; HP box 150×50 with 2 px bar. Roll20 portrait 100 px + 22 px diamond badge; Foundry medallion 44 px, XP bar 3 px.

**Mobile.** Same DDB iOS header; DDB web mobile stacks portrait 44 px + name 20 px + red WATCH TOUR (`refs/ddb-mob-1.png`).

**Anti.** DDB web desktop header wastes 110 px on a "WATCH TOUR" button and pushes vitals to the next row (`pc/ddb-desk-1-half.png`); Roll20 2024 duplicates initiative in the header and in the AC/Speed card; Demiplane's ornate gold plaque (`refs2/crops/demiplane-sheet-left.png`) is 90 px tall for one word.

---

## 4. HP control (current/max/temp, heal/damage entry, death saves)

**Dominant.** Two families. (a) **Number-first box** — DDB (`refs/ddb-hp.png`): "CURRENT 9 / MAX 9" 32 px, "TEMP --", and a left stack HEAL (green-outline pill) / [input] / DAMAGE (red-outline pill), each ≈ 70×24; caption "HIT POINTS" at the bottom. (b) **Bar-first** — Foundry (`foundry-dnd5e-sheet.png`): green bar "88 / 153" + TEMP box + red HIT DICE bar "15 / 18"; Hades (`refs2/crops/hades-hp.png`): gold-framed red bar ≈ 330 px with "122 / 160" in 36 px bold beside it; Pathbuilder (`refs3/crops/pathbuilder-defense.png`): solid red bar with "HP 18/18" printed inside; DOS2 (`refs2/crops/dos2-party-portraits.png`): stacked slim bars (grey physical armour + blue magic armour above red vitality) — the temp-HP-as-a-second-bar idiom. Roll20 2024 (`refs3/crops/roll20-2024-hp.png`) merges both: one box "[25 / 25]" with a green bar along its bottom edge, "[0] Temp", then "Damage (red heart-minus chip) [1] Heal (green heart-plus chip)" on one row, and "🔥 Short Rest / ☾ Long Rest" buttons directly beneath. Death saves: Roll20 2024 (`refs3/crops/roll20-2024-death-saves.png`) — "Successes □□□ / Failures □□□" 20 px red-outline boxes with "Stabilize" (outlined) and "⚄ Roll" (tan). State colour: Hades floods the whole HUD red and turns the numerals red at 23/100 (`refs2/crops/hades-hp-low.png`); BG3 fills the portrait from the bottom with red and turns "13/36" yellow (`pc/bg3-10-leftrail.png`); Solasta turns "2/5" red (`refs2/crops/solasta-initiative.png`).

**Best.** Roll20 2024 HP card (`roll20-2024-hp.png`) for the anatomy + Hades for the state colour. Reasons: one input serves both damage and heal (the amount sits between the two verbs, so the user types once and picks the sign); current/max share a box so the bar can live under them; temp is a sibling box, not a footnote; rests are attached to HP because they change HP. Hades proves the low-HP state should change the component's own colour (bar + numerals + a glow), not add a badge.

**Measured.** Roll20 HP box 130×50 (numerals 20 px), bar 3 px green; Damage/Heal chips 80×32 with 16 px icons; rest buttons 130×32. DDB: numerals 32 px, pills 70×24. Hades: bar 330×22, numerals 36 px. Death-save boxes 20 px square, 3 per row, 8 px gap.

**Mobile.** DDB iOS reduces HP to a 150×50 box "92/92" with a 2 px bar in the pinned header; tapping opens the editor (`phone-03.png`). Pathbuilder keeps the full bar inside the DEFENSE tab card (`pathbuilder-defense.png`).

**Anti.** DDB desktop's separate HEAL/DAMAGE pills plus a blank input read as three controls for one action (`refs/ddb-hp.png`); Solasta's bare "19/19" text gives no proportion (`solasta-initiative.png`); Roll20 2024's rest modals bury the "Recover" checkboxes under a paragraph of rules text (`refs3/crops/roll20-2024-rest-modals.png`).

---

## 5. Ability score tiles and saving throws

**Dominant.** Six tiles in one row (desktop) or 3×2 (mobile), each with a 9–13 px caps label, one dominant number and one secondary number. **Modifier-first** is the majority for 5e apps: DDB iOS shield tiles show "+5" 26 px boxed with "20" small in an oval at the bottom (`refs3/crops/ddb-app-sheet-abilities.png`); Foundry shield chips show "+1" big over "13" small (`foundry-dnd5e-sheet.png`); Roll20 2024 shows two chips per ability — "Ability +2" (score "15" as an 11 px tag under it) and "Save +4" (red fill + red dot when proficient, dotted circle otherwise) (`refs3/crops/roll20-2024-abilities.png`). **Score-first**: DDB web (`refs/ddb-abilities.png`: score 26 px boxed, modifier in an oval overlapping the bottom edge), Solasta (`refs2/crops/solasta-abilities.png`: score 28 px, modifier in a **colour-coded pill** — blue positive, grey zero, muted red negative), BG3 creation summary (`refs/bg3-abilities.png`). Saving throws are a separate 2×3 pill grid with a proficiency dot at the left edge: DDB "○ STR −1" pills with title "SAVING THROWS ⚙" (`pc/ddb-desk-1-half.png`), DDB iOS "○ STRENGTH [+0]" hex-ended pills, filled white dot when proficient (`ipad-12.png`), Foundry "SAVING THROWS" card with ● dots.

**Best.** DDB iOS shields (`ddb-app-sheet-abilities.png`, `ipad-12.png`) with Solasta's pill colouring and Roll20's inline save chip. Reasons: D&D 2024 math is modifier-first, and the DDB shield makes the modifier the 26 px number while keeping the score visible for point-buy/ASI; a coloured pill (Solasta) tells the sign before the digit is read; Roll20 proves that the save can sit under the ability as a second chip so the sheet needs no separate saving-throw card.

**Measured.** DDB iOS tile 88×100 (label 10 px caps, modifier 26 px, score 14 px in a 40×22 oval); DDB web tile 85×90; Solasta tile 70×75 (score 28 px, pill 34×16); Foundry chip 60×70; Roll20 chip 60×50, score tag 11 px. Save pills: DDB 120×36; DDB iOS 260×44 with a 12 px dot.

**Mobile.** 3×2 grid of the same shields (`phone-03.png`); saves become full-width pills in two columns (`ipad-12.png`), one column on phone (`refs/ddb-mob-1.png`).

**Anti.** Uncoloured modifier ovals (DDB web `refs/ddb-abilities.png`) force reading the sign; DOS2's flat two-column table (`refs2/crops/dos2-attributes.png`) is the slowest to scan; Demiplane's three "PHYSICAL/COGNITIVE/SPIRITUAL" columns (`refs2/crops/demiplane-sheet-right.png`) only work for systems that group stats.

---

## 6. Skills list

**Dominant.** A single column of 18 rows, each: proficiency marker | ability tag | skill name | modifier chip, 36–40 px tall. DDB web (`pc/ddb-desk-1-half.png`): header PROF | MOD | SKILL | BONUS, "●/○" dot, "DEX" 11 px grey caps, name 15 px, "+4" in a bordered box; title "SKILLS ⚙" at the bottom of the card. Roll20 2024 (`refs3/crops/roll20-2024-skills.png`): name | grey box "DEX" | modifier chip (red background when proficient) | circle (red when proficient), 38 px rows. Foundry (`foundry-dnd5e-sheet.png`): dot | ability | name | modifier | passive value as a fifth column. Pathbuilder (`refs3/crops/pathbuilder-ipad-skills.png`): "Acrobatics +1" + "Armor +0" + T E M L four-circle rank strip (X on the achieved rank) + "Dex +1 / Prof +0 / Item +0" breakdown — the fullest explanation of where the number comes from. PrismScroll (`refs3/crops/prismscroll-skills-proficiency.png`): three circles (expertise / proficient / half) + pill name + "+4" chip.

**Best.** Roll20 2024 rows (`roll20-2024-skills.png`) for density, plus Pathbuilder's breakdown as the expand/tooltip (`pathbuilder-ipad-skills.png`). Reasons: colouring the modifier chip itself when proficient makes proficiency visible without a separate column; the ability tag sits in a box so it reads as a category, not as text; Pathbuilder's "Dex +1 / Prof +0 / Item +0" is the explain-on-demand content for every skill (fits the product's teaching-tooltip rule) and its X-on-rank circles are a real proficiency-tier control.

**Measured.** Row height: DDB 36 px, Roll20 38 px, Pathbuilder 66 px (iPad, with breakdown), PrismScroll 60 px (phone, 44 px circles). Modifier chip 40×24; proficiency circle 14–18 px; ability tag box 32×20.

**Mobile.** PrismScroll bottom sheet with 3 tap-targets per row (`prismscroll-skills-proficiency.png`); DDB iOS keeps the desktop row inside the "Skills" section (not captured; the section selector is `phone-03.png`).

**Anti.** DDB puts the card title at the bottom ("SKILLS ⚙" under 18 rows), so the list has no heading when scrolled into view (`pc/ddb-desk-1-half.png`); Foundry's five-column row overflows at sheet width and needs an 11 px font (`foundry-dnd5e-sheet.png`); Shard's 3-column skills table (`refs2/crops/shard-players.png`) hides proficiency entirely.

---

## 7. Combat vitals (AC, initiative, speed, proficiency)

**Dominant.** A row of 3–5 **badge-shaped chips with a silhouette per stat**: AC = shield (DDB `refs/ddb-ac.png` 85×100 with "12" 30 px between "ARMOR" / "CLASS"; DDB iOS 50×55; Roll20 2024 "ARMOR CLASS [13 shield]"; Foundry shield with 3 round pips per side; Pathbuilder shield "AC 18"), initiative = octagon/hexagon (DDB "+2", DDB iOS "+5 INITIATIVE" hex, Foundry "+1 INITIATIVE" hexagon), speed = octagon "30 ft. SPEED" (DDB) / hexagon "30 WALK" (Foundry) / shield "SPEED (ft) [10]" (Roll20), proficiency = octagon "+2 BONUS" (DDB) / hexagon "+5 PROFICIENCY" (Foundry) / chip "Proficiency Bonus +2" (Roll20). Solasta uses a 3×2 tile grid in **teal** (AC 16 / INIT – / MOVE 1 + cube glyph / PROF. +2 / HP 11 / HIT DICE 1 + d10 glyph) to separate derived values from the white ability scores (`refs2/crops/solasta-vitals.png`). DDB web mobile compresses all four into one dark 70 px strip: PROFICIENCY +2 BONUS | WALKING 30 ft. SPEED | +2 INITIATIVE | ARMOR 12 CLASS (`refs/ddb-mob-1.png`).

**Best.** DDB iOS header pair (shield + hexagon, `phone-03.png`) plus Solasta's unit glyphs and accent colour (`solasta-vitals.png`). Reasons: a shield with the number inside is recognisable at 50 px on a phone and needs no label in either locale; the hexagon differentiates initiative from AC by shape alone; Solasta's cube (cells) and d10 glyphs replace "ft." / "1d10" text, which removes two localisation strings; the teal-vs-white split is the cheapest way to say "computed by the rules, not chosen by you".

**Measured.** DDB web badges 85×90–100, numerals 30 px, labels 9 px caps; DDB iOS 50×55, numeral 22 px; Foundry hexagons 56×52; Solasta tiles 70×75, values 22 px teal; Roll20 shield 40×44 inside a 100 px card.

**Mobile.** DDB iOS keeps AC + initiative in the pinned header and moves speed/proficiency into the Abilities section; DDB web mobile strip (`ddb-mob-1.png`) keeps all four at 70 px.

**Anti.** Roll20 2024 prints initiative as a 45 px solid red button — the loudest element on the sheet (`refs3/crops/roll20-2024-header.png`); Foundry's six attunement/exhaustion pips around the AC shield are unlabeled (`foundry-dnd5e-sheet.png`); Shard uses plain text boxes with no shapes (`shard-players.png`).

---

## 8. Conditions & defenses

**Dominant.** Two surfaces. Sheet: a **pill list** — Foundry "RESISTANCES" green pills FIRE / POISON, "IMMUNITIES" DISEASED, "SENSES" pill "DARKVISION 60" (`foundry-dnd5e-sheet.png`); Roll20 2024 right-rail cards DEFENSES (RESISTANCE Fire / DETAILS "Fire Resistance: Wife's Locket") and CONDITIONS (icon + "Poisoned", "Exhaustion 3") (`refs3/crops/roll20-2024-sheet.png`); DDB web a DEFENSES box "Resistances, Immunities, or Vulnerabilities" beside CONDITIONS "Add Active Conditions" as grey placeholders (`pc/ddb-desk-1-half.png`); DDB iOS a single "CONDITIONS" button in the header (`phone-03.png`). Editing: Roll20 2024's Conditions modal (`refs3/crops/roll20-2024-conditions.png`) — list rows (icon + name + red toggle + chevron), the expanded row shows the rules text, a "Modifiers" caption with a chip chain "Set Speed Override > All Speeds [0]", and an "Exhaustion Level" 1–6 stepper of filled tan circles with a skull at 7. Games: BG3 stacks small square icons with a duration number beside the portrait (`pc/bg3-cond-inset.png`), Hades stacks 45 px diamond icons in two staggered columns with "Lv.2" tags (`refs2/crops/hades-boons.png`), DOS2 uses 18 px corner icons (`refs2/crops/dos2-party-portraits.png`), Solasta a single heart/shield glyph (`solasta-initiative.png`).

**Best.** Roll20 2024 conditions modal (`roll20-2024-conditions.png`) for the editor and Foundry pills (`foundry-dnd5e-sheet.png`) for the read-only strip. Reasons: Roll20 is the only capture that shows _what the condition does_ (rules text + the mechanical modifier it applies) next to the toggle, which is exactly the "explain every term" requirement; its exhaustion stepper makes a 1–6 track a single control; Foundry's green pills are legible without hover and group by category (resist / immune / vulnerable) with one caption each. On the header, adopt BG3's square-icon-with-duration strip next to the portrait (`bg3-cond-inset.png`) as the compact form.

**Measured.** Roll20 modal 600 px wide, rows 44 px, toggle 36×20, exhaustion circles 28 px; Foundry pills 22 px tall, 11 px caps, 6 px gap; Hades diamonds 45 px; BG3 squares ≈ 28 px with 10 px number.

**Mobile.** DDB iOS reduces to a full-width "CONDITIONS" button (150×40) in the header (`phone-03.png`).

**Anti.** DDB's grey placeholder text "Add Active Conditions" is the only affordance and disappears once a condition exists (`pc/ddb-desk-1-half.png`); DOS2's 18 px icons are not tappable (`dos2-party-portraits.png`); Hades' unlabeled diamonds require hover (`hades-boons.png`).

---

## 9. Action economy & turn controls

**Dominant (games only — no web sheet shows economy pips).** A horizontal cluster on one axis: turn banner + economy pips + end-turn. DOS2 (`refs2/crops/dos2-action-economy.png`): "YOUR TURN" teal bevelled banner, six AP orbs (lit green = available, dark = spent), the HP/armour bar, and an "END TURN" teal bevelled button at the right. BG3 (`refs/bg3-ecopill.png`, `refs/bg3-hotbar.png`, `pc/bg3-10-bottom.png`): an economy pill of four dark squares — green **circle** (action), orange **triangle** (bonus action), magenta squares (spell slots), hollow cyan square (reaction) — centred above the hotbar, the same shapes reused as cost badges on every hotbar icon, and "End Turn" as a 180 px round blue-glass dial at the right with a reaction toggle (red circle) beside it. Solasta shows only "Round 1 / In Battle" inside a compass disc bottom-right (`refs2/crops/solasta-round-panel.png`). Roll20 2024's nearest equivalent is a red ✓ "used" checkbox on each bonus action row (`refs3/crops/roll20-2024-actions.png`); DDB iOS shows "Available Charges: [−] 15 / 15 [+] Apply" steppers per resource (`ipad-16.png`).

**Best.** BG3 economy pill (`bg3-ecopill.png`) + DOS2's dim-on-spend and axis (`dos2-action-economy.png`). Reasons: shape + colour per slot (circle/triangle/square) is readable at 24 px and doubles as a cost glyph on every action row, so "what does this consume" is explained without text; DOS2's dimming shows spent state without a counter; keeping "your turn" / pips / "end turn" on one horizontal line means one glance gives turn state and budget.

**Measured.** BG3 pill 4 squares of 28 px in a 140×36 frame; BG3 End Turn dial 180 px (1080p); DOS2 orbs 22 px, 6 in 160 px, END TURN button 150×36; Solasta compass disc 90 px.

**Mobile.** No capture. Derive: the BG3 pill at 4×32 px fits beside a 44 px End-turn button in a 56 px bar.

**Anti.** DOS2's uniform orbs cannot distinguish action from bonus action (`dos2-action-economy.png`); Roll20's "used" checkbox per row hides the budget (`roll20-2024-actions.png`); BG3's End Turn dial is 180 px of chrome for one verb.

---

## 10. Attack/action list and per-attack row

**Dominant.** A table with a 3-column numeric tail: **RANGE | HIT/DC | DAMAGE**, name + type subline at the left, an icon per row. DDB web (`refs/ddb-attacks.png`, `pc/ddb-desk-1-half.png`): row ≈ 52 px, crossed-swords icon, "Dagger" 15 px + "Melee Weapon" grey, "20 (60)" bold + light, "+4" in a bordered 24 px box, "1d4+2 ⇐" in a bordered box with a damage-type glyph, notes grey "Simple, Finesse, Light, Thrown, Nick, Range (20/60)"; group captions "ACTIONS • Attacks per Action: 1", "BONUS ACTIONS", "REACTIONS" in blue caps; filter chips ALL / ATTACK / ACTION / BONUS ACTION / REACTION / OTHER / LIMITED USE. DDB iOS (`refs3/crops/ddb-app-sheet-actions.png`, `ipad-16.png`): rows 77 px, "+10" and "1d4+5 ⇐" as **glowing** bordered boxes (tap targets), spell rows italic "Chaos Bolt" + "1ST LEVEL • SORCERER", "120 FT."; below the table "Actions in Combat" as a comma list with a left blue bar and per-resource steppers. Roll20 2024 (`refs3/builder/roll20-help/30751697876247.png`): ATTACK NAME | RANGE | HIT / DC | DAMAGE with "+4 Attack" dark chip and "1d8+2 ⚔" red chip, speech-bubble + ⓘ per row; versatile weapons are two rows. Foundry favourites (`foundry-dnd5e-sheet.png`): icon, "Mace", subline "Melee Weapon Attack", right-aligned "+1 / +5". Pathbuilder (`refs3/crops/pathbuilder-offense.png`): weapon card with trait chips, "⚔ +6" + TEML, "▲ 1d4+3ˢ", and a button row Roll | Options | Runes | Info | Stow | X. Games: BG3/DOS2 icon hotbars with cost badges (`bg3-hotbar.png`, `refs2/crops/dos2-hotbar-controller.png`); Solasta's log renders results as "10 (Miss)" red / "14 (Hit)" green chips (`refs2/crops/solasta-combatlog.png`).

**Best.** DDB iOS row (`ddb-app-sheet-actions.png`) with Roll20's chip labels. Reasons: the two numbers a player needs are the two boxed elements, and boxing them makes them tap targets (formula → detail) without a separate button; the damage-type glyph inside the box explains the damage kind without a word; Roll20's "+4 Attack" wording inside the chip is clearer than a bare "+4" for beginners (matches the explain rule). BG3's cost badge (shape from §9) belongs in the row's left icon.

**Measured.** DDB web row 52 px; DDB iOS row 77 px, hit box 44×36, damage box 90×36; Roll20 chips 80×28 (attack) and 70×28 (damage, red); Foundry favourite row 40 px; Pathbuilder card 190 px on phone.

**Mobile.** DDB iOS drops NOTES and keeps RANGE | HIT/DC | DAMAGE at 390 px (`ddb-app-sheet-actions.png`).

**Anti.** DOS2/BG3 label-less icon grids do not survive first use or translation (`dos2-hotbar-controller.png`, `bg3-hotbar.png`); DDB's NOTES column repeats the weapon properties as prose on every row (`refs/ddb-attacks.png`); Roll20's speech-bubble icon (send to chat) has no meaning outside a VTT.

---

## 11. Spell list (levels, slots, prepare, cast)

**Dominant.** Group by level with a **caps header row per level** and the slot tracker on that header; rows carry name + school/components + a time/range/effect tail. DDB sheet SPELLS tab (`pc/ddb-hank-spells.png`, from `refs/ddb-characters.png` y≈2450): "CANTRIPS" header, then "1ST LEVEL" with slot pips ○○ at the right, rows NAME | TIME | RANGE | HIT/DC | EFFECT | NOTES, a "CAST" pill per row and a ✓ prepared toggle. Roll20 2024 (`refs3/builder/roll20-help/30751697884311.png`, `30751697886103.png`): header "All Classes ▾" + a per-class caster line "Wizard DC 13 | INT | +5 · Ranger DC 13 | WIS | +5" + search + "Manage"; CANTRIPS group in a dark caps bar with RANGE | HIT / DC | DAMAGE columns; row = name 16 px + class in gold, "+5 Attack" chip, "2d10 🔥" red chip, second line chips [V][S][M][Action], one-line description + "Show More"; the Spells manager modal (`30751697883543.png`) has tabs My Spells | Add Spell | Spellcasting Ability | Spell Slots, a "Prepare Spells" toggle, and rows with glyph + name + chips [Level 1][Evocation][Action] + red ⊖. Shard (`refs2/crops/shard-players.png`): "1st level ○○" slot circles in the group header. Foundry: "1st Level Slots 4 / 4" as a favourite row (`foundry-dnd5e-sheet.png`). Demiplane PF2 (`refs2/crops/demiplane-sheet-left.png`): per-level accordion rows. Pathbuilder picker (`refs3/crops/pathbuilder-spell-picker.png`): tradition tabs, "Heighten +1…+6" chips, rank badge per row. PrismScroll spell card (`refs3/crops/prismscroll-spell-card.png`): coloured level circle "0", name 30 px, school italic, "1d6 Acid Damage" with cube icon, Casting Time / Range / Duration / Components as bold-label lines, favourite star. BG3 shows slot dots as filled/empty circles grouped by level in the economy pill (`bg3-ecopill.png`).

**Best.** DDB sheet grouping + Shard/BG3 slot pips in the level header + Roll20's row anatomy. Reasons: putting the pips on the level header ties the resource to the group it gates and lets a tap spend a slot in place; Roll20's second line of V/S/M + casting-time chips is the only row that explains components without a column; Roll20's caster line ("Wizard DC 13 | INT | +5") is the one-line explanation of where spell attack/DC come from; DDB's "CAST" pill and prepared ✓ are the two verbs a row needs. Level colour from PrismScroll (0 green, 1 orange, 2 teal) can tint the level header.

**Measured.** Roll20 rows 165 px (two-line rows with description); DDB rows ≈ 48 px; slot pips 12–14 px circles, 6 px gap; Roll20 modal rows 120 px; chips 22 px tall; PrismScroll level circle 60 px.

**Mobile.** Pathbuilder's full-screen picker with tabs + pinned Cancel/Accept (`pathbuilder-spell-picker.png`); PrismScroll's fanned cards (`refs3/store/prismscroll-ios/ipad-10.png`).

**Anti.** Demiplane's compendium lists the same spell three times (2014 / 2024 / Tales of the Valiant rows, `refs3/crops/demiplane-spell-rows.png`) and DDB's compendium duplicates "Legacy" rows (`pc/ddb-spells-top.png`); Foundry's "4 / 4" text is not scannable as a resource (`foundry-dnd5e-sheet.png`); Roll20's 165 px rows show four spells per screen.

---

## 12. Inventory / equipment rows (equip, attune, quantity, weight, currency)

**Dominant.** A table: **equip toggle | name + type subline | weight | qty | cost/details | ⓘ**, with a currency strip and total weight above. Roll20 2024 (`refs3/builder/roll20-help/30751697889047.png`): header EQUIPMENT | WEIGHT 18 LBS | QTY | DETAILS; rows 130 px with a red toggle (equipped), name 18 px + "Ranged Weapon, Gear" grey, "2 lb", "1", property chips (Ammunition, Range (80/320 ft), Proficient, Ranged, Shortbow, Simple); currency strip "Platinum = 0 Gold = 23 Electrum = 0 Silver = 0 Copper = 22 ⌄" and "Total Weight: 33.9 lb (Unencumbered)" (`30751697887383.png`); ATTUNEMENT as three slots — a filled tan chip with icon + item name and two dashed empty boxes (`30751697893399.png`); OTHER POSSESSIONS rows show "–" where the toggle would be (`30751697894679.png`); item modal with Quantity / Weight / Cost fields, "Attunable" red checkbox, "Equippable" greyed, "Edit Attack" button, "− Remove Item" (`30751697889047.png` right). DDB party inventory (`refs3/crops/ddb-party-inventory.png`): tabs MY INVENTORY | PARTY INVENTORY, search "Search Item Names, Types, Rarities, or Tags", container chips ALL / PARTY EQUIPMENT / BAG OF HOLDING / BACKPACK, header ACTIVE | NAME | WEIGHT | QTY | COST (GP) | NOTES, group rows "PARTY EQUIPMENT (2) 0 lb." and "BAG OF HOLDING (0) 5 lb. (0/500 lb)" with capacity, green "+ Add items to your …" inline links; coin management in a side panel with per-container gold rows (`refs3/campaign/ddb-help/party-inventory-2.png`). Pathbuilder gear picker (`refs3/store/pathbuilder-ios/ipad-07.png`): rows "Ⓔ Dagger (1d4 P)" with a proficiency letter circle and a price badge, expanded card with trait chips + "Price 2.0sp; Bulk L; Hands 1", footer PRD | Cancel | Give | Buy. DOS2 tooltip footer "RARE | 0.3 | 236" = rarity/weight/price on one line (`refs2/crops/dos2-tooltip-equip.png`). PrismScroll card "W Battleaxe / 1d8 Slashing / Type / Weight / Cost / Skill" (`prismscroll-spell-card.png`).

**Best.** Roll20 2024 inventory (`30751697889047.png`, `30751697893399.png`, `30751697887383.png`) with DDB's container grouping (`ddb-party-inventory.png`). Reasons: the equip toggle at the row's left edge is the one control most rows need; property chips replace a NOTES column; the attunement block shows the 3-slot limit as three physical slots (filled / dashed) rather than a counter; the currency strip collapses five denominations to one line; DDB's container headers with "(0/500 lb)" capacity are the only capture that shows weight limits per container.

**Measured.** Roll20 rows 130 px (with chips) / 75 px (possessions), toggle 36×20, chips 20 px tall; attunement slots 190×50; currency strip 40 px; DDB rows 40 px, checkbox 20 px, group row 36 px; Pathbuilder picker rows 72 px.

**Mobile.** Pathbuilder's full-screen picker; PrismScroll cards. No captured phone inventory table — DDB iOS store shots do not include it.

**Anti.** Roll20's 130 px rows because every property is a chip (four items per screen); DDB's "ACTIVE" checkbox column doubles the equip toggle as a filter; PrismScroll's card-per-item is unusable for a 30-item pack.

---

## 13. Features / traits cards and limited-use trackers

**Dominant.** A list of name + source + truncated description with "Show More", and limited uses as a **row of checkboxes/pips under the feature**. Roll20 2024 (`refs3/builder/roll20-help/30751697895447.png`): CLASS FEATURES caps caption; rows "Danger Sense / Class" bold + grey source at the left, description at the right truncated + red "Show More", speech + ⓘ; "Rage" shows a "Rage" sub-caption with three red ✓ checkboxes = 3 uses. DDB iOS (`ipad-16.png`): "Sorcery Points — You have 15 sorcery points… / Available Charges: [−] 15 / 15 [+] Apply / ⓘ Resets on Long Rest". DDB builder (`refs3/crops/ddb-builder-class-features.png`): class icon + "Fighter" 28 px, "CLASS FEATURES ⌃" caps with green underline, torn-paper rows with a blue "!" badge and "2 Choices • 1st level". Pathbuilder (`refs3/crops/pathbuilder-build-levels.png`): feature rows "Reactive Strike ⤵" (reaction glyph) with a dark "1" level badge. Demiplane PF2: per-level accordion with "SELECTIONS" pills (`demiplane-sheet-left.png`). Hades boons: diamond icon + "Lv.2" tag (`hades-boons.png`).

**Best.** Roll20's list anatomy (`30751697895447.png`) with DDB's charge stepper (`ipad-16.png`) and Pathbuilder's action-cost glyph (`pathbuilder-build-levels.png`). Reasons: name-left / description-right keeps 5 features per screen while still showing the first sentence; Roll20's checkbox row is a tappable use tracker that reads at a glance (3 boxes = 3 uses), and DDB's "[−] 15/15 [+] · Resets on Long Rest" is the right form for large pools and states the recharge rule inline; Pathbuilder's ⤵/◆◆ glyph on the name tells the action cost without a column.

**Measured.** Roll20 feature rows 80 px; checkboxes 20 px red, 8 px gap; DDB stepper buttons 32 px red squares with a 120×32 field; DDB builder rows 56 px with a 20 px badge; Pathbuilder rows 60 px with a 24 px level badge.

**Mobile.** Pathbuilder rows at 390 px (`refs3/crops/pathbuilder-build-form.png`, 130 px rows); DDB iOS stepper as above.

**Anti.** Roll20's "Show More" on every row hides the mechanic line (uses / recharge) below the fold; Demiplane's accordion needs a tap per level; Hades' unlabeled diamonds.

---

## 14. Stat block (monster) reading layout

**Dominant.** Universal order: name, italic type line, AC / HP / Speed, six abilities, Skills / Senses / Languages, Challenge, Traits, Actions — in every product (DDB `refs3/crops/ddb-statblock.png`, Roll20 `refs3/crops/roll20-statblock.png`, open5e `refs3/crops/open5e-statblock.png`, Demiplane `refs3/crops/demiplane-statblock.png`, LegendKeeper `refs3/crops/legendkeeper-statblock.png`, Shard `refs2/crops/shard-gm.png`). Framing: parchment card ≈ 700–760 px with red name in small caps serif, 2 px red rules between groups, bold red labels, art floated right (DDB, Roll20); white card with green underlined links for armour/skills (Demiplane); plain page with a two-column label/value list and **two 3-row ability tables with MOD / SAVE columns** (open5e). Source/version as a small pill after the name or type line: "Legacy" grey (DDB rows `refs3/crops/ddb-monster-rows.png`), "SRD-2014" green (open5e), "5e SRD 5.1 (2014)" gold ribbon (Demiplane `refs3/crops/demiplane-monster-banner.png`), "MONSTER" magenta tag (Demiplane). One primary action at the right of the name: "+ Add to Encounter" red (open5e); three dark buttons (DDB `refs3/crops/ddb-monster-page-header.png`). LegendKeeper duplicates AC / HP / Speed / Skills / Senses / Challenge into a right rail of 11 px caps labels over 14 px values (`legendkeeper-statblock.png`).

**Best.** open5e (`open5e-statblock.png`, `open5e-statblock-mobile.png`) for information design, DDB (`ddb-statblock.png`) for typography. Reasons: open5e's ability grid shows score / modifier / save per ability in three cells (score light, mod/save darker with red bold) — the only layout that surfaces saves, which 2024 monsters need; its "+4 to hit" and "(1d6 + 2)" in red inside the action sentence are the tap targets for formula explanation; at 390 px the two 3-row tables sit side by side and nothing else changes. DDB's parchment hierarchy (red small-caps name 26 px, italic type, red 2 px rules, 12 px red caps ability labels, 22 px "Traits" heading with hairline) is the reading rhythm players recognise; "Monster Tags: [GOBLINOID]" and "Habitat" chips under the block are the right home for tags.

**Measured.** DDB card 760 px, name 26 px, rules 2 px red, abilities 14 px, art 370 px floated; open5e name 32 px red serif, label/value 16 px, ability table cells 44×36, "Traits" 26 px + 3 px red underline; open5e mobile ability tables 170 px each; Roll20 name 30 px, abilities 24 px labels; LegendKeeper rail 305 px, labels 11 px caps.

**Mobile.** open5e mobile (`open5e-statblock-mobile.png`): same order, tables side by side, red bar with ≡ and « round buttons; Demiplane mobile (`refs3/compendium/demiplane-5e-goblin-mobile.png`) wraps abilities 4 + 2 per row — worse.

**Anti.** DDB's "8 (−1)" cells hide saves (`ddb-statblock.png`); Demiplane's 4+2 ability wrap on phone; Roll20's 24 px ability labels dominate the block (`roll20-statblock.png`); Shard's stat block inside a 300 px side panel (`shard-gm.png`).

---

## 15. Compendium list + filters + detail

**Dominant.** List page: title + accent rule, a **horizontal strip of type icons** (DDB 9 round 76 px icons with caps labels, "ALL MONSTERS" red filled, `refs3/crops/ddb-monster-filters.png`; Demiplane 80 px square art chips with a red ALL tile, `refs3/crops/demiplane-monster-filters.png`, and school glyph chips for spells, `demiplane-spell-filters.png`), a labelled filter form (MONSTER NAME / CHALLENGE RANGE / SIZE / HABITAT + "FILTER MONSTERS" + "RESET ALL FILTERS" + "SHOW ADVANCED FILTERS"), then a **table** whose row = 40–52 px art thumb | CR/level | NAME bold + source 10–12 px grey (+ "Legacy" pill) | 3–4 columns | a "+" at the right (DDB rows `ddb-monster-rows.png` 60 px torn-paper; open5e `open5e-monster-list.png` 41 px rows with a red "+" square; Demiplane spells `demiplane-spell-rows.png` 60 px with a 52 px coloured school glyph and a chevron expander; DDB spells `pc/ddb-spells-top.png` 60 px with a 36 px school glyph, CASTING TIME | DURATION | RANGE/AREA | ATTACK/SAVE | DAMAGE/EFFECT and a blue "+"). DDB iOS list (`refs3/crops/ddb-app-monster-list.png`, `ipad-17.png`): rows 100 px = 65 px art + name 20 px + "AC: 16 • HP: 93" grey + source, "Legacy" pill right, category bar "🐾 Monsters" with a red grid icon, sort "Name: A–Z ⌃" in red under the title. Roll20 compendium: 60 px condensed title + full-width pill search + magenta SEARCH (`refs3/crops/roll20-compendium-header.png`). open5e: 225 px left rail of icon + label groups, breadcrumb, Type / Size / CR min–max inputs. Detail: §14 plus breadcrumb and action buttons.

**Best.** DDB iOS row (`ipad-17.png`) for the list and DDB web filters (`ddb-monster-filters.png`) for the filter grammar. Reasons: "AC: 16 • HP: 93" plus source on a 3-line row is the whole triage a DM does when picking monsters, and the row is 100 px with a 65 px thumb — art carries recognition; the type-icon strip is a visual filter that works in both locales and doubles as a legend; the labelled form (name / CR range / size / habitat) is the complete useful set, and "advanced" stays collapsed. Keep open5e's red "+" per row as the add-to-encounter verb (`open5e-monster-list.png`).

**Measured.** DDB type icons 76 px round, 12 px caps labels, 9 per 1 200 px; DDB rows 60 px, thumb 40 px, name 15 px bold, source 10 px; open5e rows 41 px, "+" 20 px; Demiplane rows 60 px, glyph 52 px; DDB iOS rows 100 px (phone 73 px), thumb 65 px (48 px), "Legacy" pill 60×22.

**Mobile.** DDB web mobile (`pc/ddb-monsters-mobile-top.png`): 70 px icons in a horizontal scroller, one MONSTER NAME field + full-width red FILTER MONSTERS, rows collapse to thumb | CR | name + source | "+" (type/size/alignment dropped). DDB iOS rows as above.

**Anti.** DDB and Demiplane duplicate every entry per edition ("Legacy" rows, 2014/2024 rows: `pc/ddb-spells-top.png`, `demiplane-spell-rows.png`); Roll20's compendium listing is a 16 900 px page of text links (`refs3/compendium/roll20-comp-monsters.png`, not cropped); open5e's left rail lists 20 categories for one list.

---

## 16. Campaign page & party block

**Dominant.** Campaign = header (title, one status line, ≤ 2 buttons) + tabs (log / characters) + a party list where each member is identity + HP + a few stats. DDB iOS campaign (`refs3/crops/ddb-app-campaign-characters.png`, `phone-06.png`, iPad `refs3/crops/ddb-ipad-campaign-characters.png`): title centred, tabs GAME LOG | CHARACTERS with a blue underline; member block 180 px = 63 px portrait (red border) | name 20 px | "Character level: 14 | Lizardfolk" / "Druid • Circle of the Land (Coast)" / "Player: Yozira Stoutman" | right: outlined box "101 / 101" (current in **blue**) + "HIT POINTS" + "EXHAUSTION" 6 dash pips; second tier: four 18 px numerals over 2-line 9 px caps labels PASSIVE PERCEPTION / PASSIVE INVESTIGATION / PASSIVE INSIGHT / ARMOR CLASS; iPad puts the four stats inline on one row per member. DDB web campaign header (`refs3/crops/ddb-campaign-header.png`): breadcrumb chip "B › CAMPAIGNS › A SHINING EXAMPLE", 40 px condensed title, 3 px blue rule, 11 px blue caps status, outlined + solid button pair. Game log (`refs3/crops/ddb-app-campaign-gamelog.png`, `ipad-18.png`): roll cards grouped by character caps label, card = "BOOMERANG: TO HIT" (roll type coloured: ROLL orange, TO HIT blue, DAMAGE red), die glyph + "19+8" 28 px, "=", total 36 px, "1d20+8" small, timestamp under, avatar left for own / right for others (chat alignment). Kanka dashboard (`refs3/crops/kanka-dashboard-intro.png`, `kanka-dashboard-calendar.png`, `kanka-dashboard-recent.png`, `kanka-party-lists.png`): intro card, 3-up entity preview cards, calendar widget with in-world date + Previous/Upcoming, "Recently modified entries" (32 px avatar + name + author), "PCs – Landfall Campaign" list (avatar + name + player right). Foundry join screen (`refs3/crops/foundry-join-screen.png`): "Game Details — 🕓 Next Session / 👥 Current Players 0 / 1". Alchemy PARTY panel (`refs2/crops/alchemy-party-panel.png`): avatar + name + handle + green online dot + "GM" pill. Owlbear Players panel (`refs2/crops/owlbear-players-panel.png`): colour dot + name + GM badge + ⋮. Obsidian Portal / Foundry campaign cards: banner + title + system/date + visibility tag + one action (`refs3/crops/obsidianportal-campaign-cards.png`, `refs3/crops/foundry-world-tile.png`).

**Best.** DDB iOS member block (`ddb-app-campaign-characters.png`) with Kanka's "next session / in-world date" widget (`kanka-dashboard-calendar.png`) and Alchemy's online dot. Reasons: identity + HP (current tinted) + exhaustion + the four DM numbers (three passives + AC) is exactly what a DM needs mid-scene without opening a sheet, and it is the only capture that puts passives on the party surface; the iPad variant proves the block reflows to one row; the DDB game-log card (formula left, total right, timestamp under, own/others alignment) is the model for a chronicle entry even without dice.

**Measured.** DDB member block 180 px phone / 100 px iPad; portrait 63 px; HP box 110×50, numerals 22 px; stat numerals 18 px, labels 9 px caps; log card 540×110 (iPad), total 36 px; campaign header title 40 px, rule 3 px, buttons 190×40; Kanka avatar rows 44 px; Owlbear rows 40 px with 12 px colour dot.

**Mobile.** DDB phone block as above (two tiers); Kanka mobile stacks intro card + full-width preview cards (`pc/kanka-mobile-top.png`).

**Anti.** DDB web's campaign page shows content-sharing status as the only header fact (`ddb-campaign-header.png`); Foundry's user table with a password column is admin UI, not a party block (`refs3/crops/foundry-user-management.png`); Obsidian Portal's "432 FANS" + "Become a Fan" is social chrome.

---

## 17. Initiative / encounter tracker (DM)

**Dominant.** Games: a **top strip of portrait tiles in turn order**, active = enlarged / bordered / named, side colour, HP under each. Solasta (`refs2/crops/solasta-initiative.png`): 115×130 tiles with a teal left border, HP "5/5" (current white bold, max grey), enemies on a dark-red backdrop, buff glyph top-right. DOS2 (`refs2/crops/dos2-initiative.png`): active portrait enlarged (~90 px vs 60 px) at the left with its name under it, gold frame allies / red frame enemies, a thin vertical white divider = round boundary, two slim bars under each. BG3 (`refs/bg3-initiative.png`): 100×160 rounded cards, enemy card filled red from the bottom (HP), active card with a blue border + hourglass. Web: Owlbear (`refs2/crops/owlbear-initiative.png`) — floating dark panel "Initiative" + skip icon, rows name left / number right, active row purple wash; Shard GM (`refs2/crops/shard-gm.png`) — encounter table "Round 1", Turn select, columns # / name / eye / AC / HP; Roll20 "Choose Target" banner + "40/40" token pill (`refs2/crops/roll20-customize-ui.png`); Solasta's round counter in a compass disc (`solasta-round-panel.png`).

**Best.** DOS2 strip (`dos2-initiative.png`) for desktop, Owlbear list (`owlbear-initiative.png`) for narrow widths. Reasons: DOS2's enlarged + named active tile is unambiguous without reading; its round divider is the only captured cue for end-of-round effects; frame colour (gold/red) is a side code that needs no legend; Owlbear proves a bare name + number list with a strong tint on the active row is sufficient at 300 px, and its header holds the one control (skip/next). Add Shard's AC/HP columns to the list variant for the DM.

**Measured.** DOS2 tiles 60 px, active 90 px, bars 4 px; Solasta tiles 115×130, border 3 px; BG3 cards 100×160; Owlbear panel 330 px wide, rows 44 px, title 22 px; Shard table rows 32 px.

**Mobile.** Owlbear list; no phone tracker captured.

**Anti.** Solasta's bare HP text without a bar; BG3's hourglass overlay as the only "waiting" cue; Roll20's full-screen "Choose Target" banner.

---

## 18. Creation wizard entry & steps

**Dominant.** Entry = 2–3 **method cards with art** (DDB `refs3/crops/ddb-creation-method-cards.png`: STANDARD "step-by-step" / QUICKBUILDER with a red "NEW" pill / PREMADE, 315×400, art 200 px, dark body, white footer "START BUILDING ›", and a "BEGINNER? SHOW HELP TEXT" checkbox on the guided card; Roll20 `refs3/crops/roll20-character-landing.png`: "Edit Sheet Directly" / "Character Builder" cards; Pathbuilder `refs3/store/pathbuilder-ios/phone-04.png`: NEW / LOAD art tiles). Steps = a **stepper** either horizontal (Solasta `refs2/crops/solasta-stepper.png`: 6 labelled steps on a rail, check-circles for done, hexagonal gem for current) or vertical (BG3 `pc/bg3-09.png`: 9 rows of check-circle + "label / chosen value" e.g. "Abilities 27/27"; Demiplane `demiplane-sheet-left.png`: 7 art-thumb steps with gold check badges connected by a line + "CHARACTER SHEET" button; Pathbuilder `refs3/crops/pathbuilder-build-form.png`: a vertical ledger of "label over value" rows with a glyph, a "Level 1" banner, three gear tiles "Ability Boosts 4 / Class Skill 1 / Skill Training 4", and "Not Selected" in red). Attention cues: DDB blue "!" badge + "2 Choices • 1st level" (`refs3/crops/ddb-builder-class-features.png`); DDB "WHAT'S NEXT ▸" whose sheet icon turns white when playable (`refs3/crops/ddb-builder-whats-next.png`). Pickers: full-screen modal over a scrim with a sort/filter header, cards with a level badge + requirement text, the chosen card outlined, Cancel / Accept pinned (Pathbuilder `refs3/crops/pathbuilder-feat-picker.png`, `refs3/store/pathbuilder-ios/ipad-06.png`); wrapped pill chooser with "Available: N" (PrismScroll `refs3/crops/prismscroll-skill-picker.png`); 3 icon tiles with a gold outline for subclass (BG3 `pc/bg3-09.png`). Edition choice: Roll20's two-tile radio modal with "Legacy" / "New" pills + "Set as Default?" toggle (`refs3/crops/roll20-choose-sheet-modal.png`).

**Best.** DDB method cards for entry (`ddb-creation-method-cards.png`) + BG3's vertical stepper (`pc/bg3-09.png`) + Pathbuilder's "Not Selected" ledger and picker (`pathbuilder-build-levels.png`, `pathbuilder-feat-picker.png`). Reasons: the entry cards state the promise ("step-by-step") and own the beginner toggle; BG3's stepper shows the chosen value under each step label so the rail is also the summary ("Race / Dragonborn", "Abilities 27/27"), and its right-hand live summary card (STR…CHA, HP, cantrips) shows consequences while choosing; Pathbuilder makes remaining work countable (red "Not Selected" rows, gear tiles with the remaining count) and its picker pins Cancel/Accept where thumbs are.

**Measured.** DDB cards 315×400; Solasta rail 1 380×120 with 24 px nodes; BG3 stepper rows 44 px in a 260 px column; Pathbuilder rows 130 px on phone (glyph 80 px, label 26 px, value 34 px), gear tiles 250×170; picker rows 72 px, level badge 30 px; PrismScroll pills 28 px tall.

**Mobile.** Pathbuilder Build tab (`pathbuilder-build-form.png`) and PrismScroll full-screen steps (`prismscroll-skill-picker.png`); DDB builder mobile not captured.

**Anti.** DDB's torn-paper rows + "!" badges need a separate "WHAT'S NEXT" button to know when you are done (`ddb-builder-whats-next.png`); Roll20 has no stepper at all (direct-to-sheet, `roll20-character-landing.png`); Solasta's 32 px low-contrast "IDENTITY" panel title (`refs2/crops/solasta-section-titles.png`).

---

## 19. Level-up flow & completion

**Dominant.** Trigger from the header ("Level Up" grey button under the portrait, Roll20 `roll20-2024-header.png`; "MANAGE CHARACTER & LEVELS ↗" in the DDB sheet menu `refs3/crops/ddb-character-menu.png`; LEVEL select "3" on Demiplane `demiplane-sheet-left.png`), then a per-level ledger (Pathbuilder "LEVEL 2" ribbon with new "Not Selected" rows, `pathbuilder-build-levels.png`; Demiplane LEVEL 1..8 accordion), and a completion moment (PrismScroll `refs3/crops/prismscroll-levelup.png`, `refs3/store/prismscroll-ios/ipad-07.png`: confetti, orange d20 gem in a grey circle, "Congrats!" + "You reached level 2! Swipe left to go through the level up process (roll for HP, increase stats, multiclass, subclass, etc)"). Foundry shows progress as the XP bar under the level medallion (`foundry-dnd5e-sheet.png`); Roll20 as "Exp: 0/2700" text.

**Best.** Roll20's placement (button under the portrait) + Pathbuilder's ledger + PrismScroll's celebration that lists what comes next. Reasons: the level-up verb belongs where the level is displayed; the ledger keeps every level's choices inspectable afterwards; PrismScroll's screen is the only capture that tells the player the sequence of decisions before starting, which lowers the fear of a multi-step flow.

**Measured.** Roll20 "Level Up" 100×28; Pathbuilder level ribbon full-width 44 px; PrismScroll gem 300 px in a 360 px circle (iPad) / 200 px (phone), title 32 px.

**Mobile.** PrismScroll phone (`prismscroll-levelup.png`); Pathbuilder phone ledger.

**Anti.** DDB hides level-up two taps deep behind the sidebar menu (`ddb-character-menu.png`); Demiplane's LEVEL select changes level without a flow (`demiplane-sheet-left.png`).

---

## 20. Tooltips / explain panels

**Dominant.** Two kinds. (a) **Item/entity card tooltip** — DOS2 (`refs2/crops/dos2-tooltip-equip.png`, `dos2-tooltip-item.png`): dark card with a bronze frame, title 18 px (rarity colour: cyan "GLARE"), muted caps category "HELMET", number-first stat lines with an icon ("22 Magic Armour" snowflake-shield, "8 Physical Armour" grey shield), bonuses in cyan with a star ("+2 Memory"), requirements grey ("Requires Intelligence 12"), italic flavour, footer "RARE | 0.3 | 236" (rarity / weight / price); unavailable entries get a red X over the icon. (b) **Rule tooltip** — Foundry (`refs2/crops/foundry-dnd5e-ruletip.png`): inline term = underlined green text with a tiny icon; hover opens a parchment card "Darkvision" with a "RULE" badge top-right, 4 lines of definition, and nested terms ("Darkness", "Dim Light") as grey chips inside the tooltip. Roll request card: "DC 15 INTELLIGENCE (NATURE)" white capsule, then formula "1d20 + 2 + 0 + 1" in a grey field and result "17" in a green box. Inline explanation: Solasta's log "rolls 9+1 = 10 (Miss)" with red/green chips (`solasta-combatlog.png`); Alchemy's roll card with dice chips + "12 ATTACK · 0 DAMAGE" numerals (`refs2/crops/alchemy-npc-cards.png`); DDB game-log card "19+8 = 27 / 1d20+8" (`ddb-app-campaign-gamelog.png`); Pathbuilder's "Dex +1 / Prof +0 / Item +0" breakdown next to every skill (`pathbuilder-ipad-skills.png`); Roll20's ⓘ icon on every row (`30751697876247.png`). Help copy patterns: PrismScroll "What can I pick?" outlined button + a two-line explanation block (`prismscroll-skill-picker.png`); DDB "BEGINNER? SHOW HELP TEXT" checkbox (`ddb-creation-method-cards.png`); DDB "ⓘ Resets on Long Rest" italic under a stepper (`ipad-16.png`); DDB inventory settings with a full sentence under each toggle (`refs3/campaign/ddb-help/party-inventory-3.png`).

**Best.** Foundry rule tooltip (`foundry-dnd5e-ruletip.png`) for terms, DOS2 card (`dos2-tooltip-equip.png`) for items, Foundry roll-request card for formulas. Reasons: the RULE badge + nested chips solve "a term inside an explanation" recursively; DOS2's four text colours (white value, cyan bonus, grey requirement, italic flavour) explain an item in two seconds with no layout; the roll-request card's "formula field → result box" is the exact shape of a no-RNG app that shows the formula and takes the result as input.

**Measured.** Foundry tooltip 260 px wide, title 14 px, badge 10 px caps, chips 18 px tall; DOS2 card 420 px wide (1.5×), title 18 px, stat lines 14 px, footer 12 px; Foundry roll card 300 px, capsule 24 px, result box 36 px green; Pathbuilder breakdown 11 px labels / 14 px values.

**Mobile.** No hover: Roll20's ⓘ per row and Pathbuilder's inline breakdown are the tap-friendly forms; PrismScroll's full-screen explanation block.

**Anti.** DDB's blank grey placeholders as explanation (`pc/ddb-desk-1-half.png`); Roll20 rest modals that explain with a paragraph before the controls (`roll20-2024-rest-modals.png`); Hades' hover-only diamonds.

---

## 21. Dialogs / sheets / pickers (modal patterns)

**Dominant.** Dark modal 600–860 px wide over a scrim, title 24–30 px top-left, × top-right, body, footer with **Cancel (outlined) + primary (solid accent) right-aligned**: Roll20 2024 Conditions / Spells / New Note / New Feature / item modals (`roll20-2024-conditions.png`, `30751697883543.png`, `30751697912471.png`, `30751697902231.png`, `30751697889047.png` — Cancel outlined red, Save solid red, Save greyed until valid, required field red-outlined, "− Remove Item" destructive outlined at the left); Roll20 choose-sheet (`roll20-choose-sheet-modal.png`: Close outlined / Create purple full-width); Foundry player config (`refs3/crops/foundry-player-config.png`: fieldsets with legends, help text under each field, one full-width "💾 Save" button); Pathbuilder pickers (full-screen 860 px sheet with a dark-red tab header and a pinned footer PRD | Cancel | Accept, `ipad-06.png`, `ipad-07.png`); DDB side panels (inventory "Manage Coin" / "Settings" with "‹ PREV / NEXT ›" pager in a teal-framed drawer, `party-inventory-2.png`, `party-inventory-3.png`); DDB cookie modal (black, three stacked full-width outlined buttons, `pc/ddb-sheet-desktop-half.png`, `pc/ddb-monsters-mobile-top.png`); Foundry right-click context menu (8 icon + label rows, 32 px, orange top border, `refs3/crops/foundry-actor-context-menu.png`); PrismScroll number-picker card ("BASE 13, 7 / 13", `prismscroll-skills-proficiency.png`) and bottom sheet "Skills"; Roll20 legacy light edit modal (`roll20-edit-character-modal.png`).

**Best.** Roll20 2024 modal grammar (`30751697883543.png`, `30751697902231.png`) for forms, Pathbuilder for pickers (`ipad-06.png`), PrismScroll bottom sheet for phone. Reasons: Roll20's footer is consistent across every modal (Cancel outlined left of a solid Save, Save disabled until valid, destructive action at the far left), and its tabbed modal (My Spells | Add Spell | Spellcasting Ability | Spell Slots) keeps related editors in one surface; Pathbuilder's picker pins the decision buttons at the bottom edge and keeps the filter tabs at the top, which is the thumb-zone layout on tablets/phones; PrismScroll's bottom sheet keeps the sheet visible behind the picker.

**Measured.** Roll20 modal 600–1 128 px, title 24 px, footer buttons 100×44, gap 16 px; Pathbuilder picker 860×1 250 (iPad), footer buttons 44 px; DDB side panel 555 px; Foundry menu 290 px, rows 32 px; PrismScroll sheet 90 % height with 16 px radius.

**Mobile.** Pathbuilder full-screen picker (`pathbuilder-feat-picker.png`, 1080 px Android); PrismScroll bottom sheet; DDB cookie modal's stacked full-width buttons.

**Anti.** Roll20's legacy light modal with 8 numbered regions (`roll20-edit-character-modal.png`); Foundry's fieldset-with-legend form language; DDB's "Your Privacy Choices" modal that covers the content on every page load (`pc/ddb-monsters-mobile-top.png`).

---

## 22. Empty / loading / error states

**Dominant (thin evidence — nobody designs these).** Empty: a grey placeholder sentence in the slot ("Add Active Conditions", "Resistances, Immunities, or Vulnerabilities" — DDB `pc/ddb-desk-1-half.png`; "No Conditions", "No Masteries" — Roll20 `roll20-sheet-zoom.png`, `roll20-2024-sheet.png`; "Your appearance is unclear…" — Roll20 About `30751697914647.png`; "Nothing to show yet." — Kanka members table per `refs3/observations.md`, not re-verified in a crop), a **dashed ghost slot** ("DROP FAVORITE" Foundry `foundry-dnd5e-sheet.png`; empty attunement boxes Roll20 `30751697893399.png`; PrismScroll dashed "+" card `prismscroll-character-list.png`; Roll20 avatar drop zone "Drop a file… or Click to Upload" `roll20-edit-character-modal.png`), a silhouette placeholder (Roll20 black portrait `roll20-mycharacters-list.png`; Kanka classical bust `kanka-characters-grid.png`), or a first-run splash with two big verbs (Pathbuilder NEW / LOAD `phone-04.png`). Error: DDB 404 "Not found / Page Not Found … in another realm" with art (`refs3/compendium/ddb-goblin-mobile.png`), App Store "The page you're looking for can't be found." (`refs/ddb-app.png`). Loading: no capture shows a skeleton or spinner. Validation: Roll20's red-outlined required field + greyed Save (`30751697902231.png`); Pathbuilder's red "Not Selected" value (`pathbuilder-build-form.png`); DDB's blue "!" badge (`ddb-builder-class-features.png`).

**Best.** Dashed ghost slot with the verb inside (Foundry "DROP FAVORITE", Roll20 attunement, PrismScroll "+") for empties; Pathbuilder's red "Not Selected" for missing choices; Roll20's disabled-until-valid Save for forms. Reasons: a ghost slot shows the shape of what will appear and is itself the affordance; a red value in the normal row position (not a toast) makes incompleteness countable; disabling the primary button removes an error dialog.

**Measured.** Ghost slots: Foundry 200×36 dashed 1 px; Roll20 attunement 190×50; PrismScroll card 340×90 with a 40 px "+"; Pathbuilder red value 34 px.

**Mobile.** Same components; DDB 404 art page at 390 px.

**Anti.** Placeholder-text-as-affordance (DDB conditions box) — vanishes once filled and is invisible in dark themes; Roll20 "No Conditions" plain text with no action; no product shows a loading state at all.

---

## 23. Settings / profile

**Dominant.** Settings are scattered: a ⚙ on every card header (DDB "SAVING THROWS ⚙", "SKILLS ⚙", `pc/ddb-desk-1-half.png`; Roll20 2024 ? + ⚙ on every card, `roll20-2024-sheet.png`), a sheet-level menu (DDB sidebar `refs3/crops/ddb-character-menu.png`: portrait 160 px, name ✎, species, level, class icon with a level badge, outlined "CHANGE SHEET APPEARANCE", groups MY CHARACTER / PLAY / SHARE with icon + caps rows 50 px — MANAGE CHARACTER & LEVELS ↗, CHARACTER SETTINGS, GAME LOG, SHORT REST, LONG REST, EXPORT TO PDF), a per-feature settings drawer with **toggle + one explanatory sentence** (DDB inventory Settings: "IGNORE COIN WEIGHT [toggle] — Coins do not count against your total weight carried (50 coins weigh 1 lb.)", `party-inventory-3.png`), a roster-level "⚙ Settings" button beside search (`ddb-mycharacters-header.png`), a theme toggle on the splash (Pathbuilder "Dark Mode" switch, `phone-04.png`; LegendKeeper moon icon bottom of sidebar `legendkeeper-sidebar.png`; open5e moon in a floating rail `open5e-monster-list.png`), a "Settings" row at the bottom of the nav (Kanka `kanka-sidebar-nav-dark.png`), and a profile/player form (Foundry Player Configuration: name, avatar, colour swatch #28cc79, pronouns, "Player Character" select, `foundry-player-config.png`; Roll20 "Can Be Edited & Controlled By", `roll20-edit-character-modal.png`; Owlbear Players panel colour dot + GM badge `owlbear-players-panel.png`).

**Best.** DDB inventory settings drawer (`party-inventory-3.png`) for the setting row, DDB character menu (`ddb-character-menu.png`) for the per-character hub, Foundry player config (`foundry-player-config.png`) for the profile fields. Reasons: caps title + toggle + a full sentence of consequence is the only settings row in the set that explains itself; DDB's menu groups by intent (MY CHARACTER / PLAY / SHARE) and keeps rests and export one tap from the sheet; Foundry's colour swatch + pronouns + owned-character select is the minimal profile a party needs.

**Measured.** DDB setting row 120 px (title 22 px caps, toggle 50×28, sentence 18 px); DDB menu rows 50 px, icons 20 px, portrait 160 px; Foundry form fields 36 px with 12 px help text; Pathbuilder toggle 50×30.

**Mobile.** DDB drawer is already a phone-width panel (555 px @2x); Pathbuilder splash toggle.

**Anti.** A ⚙ on every card (DDB, Roll20) fragments settings into 10 places; Kanka's Settings row at the end of a 25-item sidebar; Foundry's fieldset + legend visual language.

---

## Copy list — the one pattern d20 Folio should copy per element

1. **App shell** — DDB iOS pinned header + one-row text section selector (`refs3/store/ddb-ios/phone-03.png`); PrismScroll 5-tab bottom bar on phone (`refs3/store/prismscroll-ios/ipad-09.png`).
2. **Character list row** — DDB iOS 73 px row: 48 px bordered portrait, name, "Lvl N | Species", "Class • Subclass", campaign flag line, "…" (`refs3/store/ddb-ios/phone-02.png`), class-hued border from PrismScroll.
3. **Character header** — DDB iOS header block (AC shield | init hex | portrait | HP box; rest | ⚙ | conditions) with Foundry's level medallion + XP bar attached to the name (`ipad-12.png`, `foundry-dnd5e-sheet.png`).
4. **HP control** — Roll20 2024 card: one current/max box with a bar, temp box, Damage ◄ [amount] ► Heal, rests beneath; Hades' red state flood at low HP (`roll20-2024-hp.png`, `hades-hp-low.png`).
5. **Abilities & saves** — DDB iOS modifier-first shields with the score in an oval, Solasta's colour-coded pill, Roll20's save chip under each ability (`ddb-app-sheet-abilities.png`, `solasta-abilities.png`, `roll20-2024-abilities.png`).
6. **Skills** — Roll20 2024 38 px row (name | ability box | tinted modifier chip | prof circle) with Pathbuilder's "Dex +1 / Prof +0 / Item +0" breakdown on expand (`roll20-2024-skills.png`, `pathbuilder-ipad-skills.png`).
7. **Combat vitals** — shield / hexagon / octagon badges with the number inside (DDB iOS) and Solasta's unit glyphs + accent colour for derived values (`phone-03.png`, `solasta-vitals.png`).
8. **Conditions & defenses** — Roll20 2024 conditions modal (toggle + rules text + modifier chain + exhaustion stepper) and Foundry's category pills on the sheet (`roll20-2024-conditions.png`, `foundry-dnd5e-sheet.png`).
9. **Action economy** — BG3's shape-per-slot economy pill (circle / triangle / square) that dims when spent, on one line with "Your turn" and "End turn" (`bg3-ecopill.png`, `dos2-action-economy.png`).
10. **Attack row** — DDB iOS row: icon + name + type subline, RANGE | boxed HIT/DC | boxed DAMAGE-with-glyph, boxes are tap targets (`ddb-app-sheet-actions.png`); label chips "+4 Attack" from Roll20.
11. **Spell list** — DDB level groups with slot pips on the level header (Shard/BG3 style), Roll20's row second line of V/S/M + time chips and its caster line "Wizard DC 13 | INT | +5" (`pc/ddb-hank-spells.png`, `30751697886103.png`, `30751697884311.png`).
12. **Inventory** — Roll20 2024: equip toggle | name + type | weight | qty | property chips, currency strip, 3 physical attunement slots; DDB container headers with capacity (`30751697889047.png`, `30751697893399.png`, `ddb-party-inventory.png`).
13. **Features & limited uses** — Roll20's name-left / description-right list with a checkbox row under the feature for uses; DDB's "[−] 15/15 [+] · Resets on Long Rest" for pools (`30751697895447.png`, `ipad-16.png`).
14. **Stat block** — open5e's score / MOD / SAVE ability grid and red formula tokens inside DDB's parchment typography (`open5e-statblock.png`, `ddb-statblock.png`).
15. **Compendium** — DDB type-icon strip + labelled filter form; DDB iOS 3-line row (art, name, "AC • HP", source, version pill) with open5e's "+" per row (`ddb-monster-filters.png`, `ipad-17.png`, `open5e-monster-list.png`).
16. **Campaign & party** — DDB iOS member block (identity + tinted HP + exhaustion pips + passives/AC strip) reflowing to one row on wide screens; Kanka's date/next-session widget (`ddb-app-campaign-characters.png`, `ddb-ipad-campaign-characters.png`, `kanka-dashboard-calendar.png`).
17. **Initiative tracker** — DOS2 strip (enlarged + named active tile, gold/red frames, round divider) on desktop; Owlbear tinted-row list with AC/HP columns on phone (`dos2-initiative.png`, `owlbear-initiative.png`).
18. **Creation wizard** — DDB three method cards with the beginner toggle; BG3's vertical stepper that shows the chosen value under each step plus a live summary card (`ddb-creation-method-cards.png`, `pc/bg3-09.png`).
19. **Level-up** — Roll20's "Level Up" button under the portrait → Pathbuilder's per-level ledger with red "Not Selected" rows → PrismScroll's completion screen that lists the coming decisions (`roll20-2024-header.png`, `pathbuilder-build-levels.png`, `prismscroll-levelup.png`).
20. **Tooltips** — Foundry's RULE tooltip with nested term chips for rules; DOS2's four-colour item card; Foundry's "formula field → result box" for rolls (`foundry-dnd5e-ruletip.png`, `dos2-tooltip-equip.png`).
21. **Modals** — Roll20 2024 grammar (title, ×, Cancel outlined + Save solid right, Save disabled until valid, destructive far-left) on desktop; Pathbuilder full-screen picker with pinned footer / PrismScroll bottom sheet on phone (`30751697902231.png`, `ipad-06.png`, `prismscroll-skills-proficiency.png`).
22. **Empty states** — dashed ghost slot with the verb inside (Foundry "DROP FAVORITE", Roll20 attunement, PrismScroll "+"), red "Not Selected" for missing choices (`foundry-dnd5e-sheet.png`, `30751697893399.png`, `pathbuilder-build-form.png`).
23. **Settings** — DDB's toggle-plus-one-sentence setting row and its MY CHARACTER / PLAY / SHARE menu; Foundry's colour swatch + pronouns + owned-character profile (`party-inventory-3.png`, `ddb-character-menu.png`, `foundry-player-config.png`).
