# Explain-on-demand: how the best game and product UIs teach a term, stat or icon without cluttering the screen

Research report, 2026-09-03. Method: web search + fetch of primary/first-party sources (design guidelines, standards, wikis and API docs of the products named in the brief) plus a few secondary write-ups where the primary page was not fetchable. Every claim below carries a URL; access date is 2026-09-03 unless stated. Where a source could only be read through a search summary (not the full page) it is marked "(via search snippet)".

---

## 0. Source list (28 sources)

| #   | Source                                                                                                                                              | Date                     | URL                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | NN/g, "Tooltip Guidelines" (A. Kendrick)                                                                                                            | 2019-01-27               | https://www.nngroup.com/articles/tooltip-guidelines/                                                                                                                                                                                 |
| S2  | NN/g, "Progressive Disclosure" (J. Nielsen)                                                                                                         | 2006-12-03               | https://www.nngroup.com/articles/progressive-disclosure/                                                                                                                                                                             |
| S3  | NN/g, "Onboarding Tutorials vs. Contextual Help" (P. Laubheimer)                                                                                    | 2023-02-12               | https://www.nngroup.com/articles/onboarding-tutorials/                                                                                                                                                                               |
| S4  | NN/g, "Instructional Overlays and Coach Marks for Mobile Apps" (A. Harley)                                                                          | 2014-02-16               | https://www.nngroup.com/articles/mobile-instructional-overlay/                                                                                                                                                                       |
| S5  | W3C, Understanding SC 1.4.13 Content on Hover or Focus (AA)                                                                                         | WCAG 2.1                 | https://www.w3.org/WAI/WCAG21/Understanding/content-on-hover-or-focus.html                                                                                                                                                           |
| S6  | W3C, Understanding SC 3.1.4 Abbreviations (AAA) + G97                                                                                               | WCAG 2.1                 | https://www.w3.org/WAI/WCAG21/Understanding/abbreviations.html , https://www.w3.org/WAI/WCAG21/Techniques/general/G97                                                                                                                |
| S7  | W3C ARIA APG, Tooltip pattern                                                                                                                       | WIP                      | https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/                                                                                                                                                                                    |
| S8  | H. Pickering, Inclusive Components: "Tooltips & Toggletips"                                                                                         | 2017-07-25               | https://inclusive-components.design/tooltips-toggletips/                                                                                                                                                                             |
| S9  | S. Higley, "Tooltips in the time of WCAG 2.1"                                                                                                       | 2019-08-17               | https://sarahmhigley.com/writing/tooltips-in-wcag-21/                                                                                                                                                                                |
| S10 | Apple HIG, Popovers (current page + archived iOS HIG mirror carrying the "avoid on iPhone" rule)                                                    | current                  | https://developer.apple.com/design/human-interface-guidelines/popovers ; mirror https://miniring.gitbook.io/hig/views/popovers ; https://codershigh.github.io/guidelines/ios/human-interface-guidelines/ui-views/popovers/index.html |
| S11 | Apple, TipKit ("Highlighting app features with TipKit")                                                                                             | current                  | https://developer.apple.com/documentation/tipkit/highlightingappfeatureswithtipkit                                                                                                                                                   |
| S12 | Material 3 Tooltips (guidelines) + Android Compose tooltip doc                                                                                      | current                  | https://m3.material.io/components/tooltips ; https://developer.android.com/develop/ui/compose/components/tooltip                                                                                                                     |
| S13 | Android Compose, Bottom sheets (M3)                                                                                                                 | current                  | https://developer.android.com/develop/ui/compose/components/bottom-sheets                                                                                                                                                            |
| S14 | Mayank, "Making tooltips work on touchscreen"                                                                                                       | 2023-08-27 (2025 update) | https://mayank.co/blog/tooltips-on-touchscreens/                                                                                                                                                                                     |
| S15 | Flook, "13 Mobile Tooltip Best Practices"                                                                                                           | updated 2026-08-24       | https://flook.co/blog/posts/mobile-tooltip-best-practices                                                                                                                                                                            |
| S16 | Foundry VTT API, TooltipManager (v14)                                                                                                               | current                  | https://foundryvtt.com/api/classes/foundry.helpers.interaction.TooltipManager.html                                                                                                                                                   |
| S17 | Roll20 Help Center, "D&D 5E by Roll20" + wiki Tooltip (via search snippet)                                                                          | current                  | https://help.roll20.net/hc/en-us/articles/360037773573-D-D-5E-by-Roll20 ; https://wiki.roll20.net/Tooltip                                                                                                                            |
| S18 | Demiplane Nexus FAQ (Click-To-Know) + Bell of Lost Souls coverage                                                                                   | 2023-05                  | https://resources.demiplane.com/nexus/pathfinder/character-tools/faqs ; https://www.belloflostsouls.net/2023/05/demiplanes-pathfinder-nexus-launches-character-tools-in-open-beta.html                                               |
| S19 | D&D Beyond, "Character Sheet Revamp" changelog + snippet-codes forum thread                                                                         | 2018-06-29               | https://www.dndbeyond.com/old-changelog/256-character-sheet-revamp ; https://www.dndbeyond.com/forums/dungeons-dragons-discussion/homebrew-house-rules/25930-using-snippet-codes-in-your-homebrew?page=4                             |
| S20 | bg3.wiki: Controls (keybinds) and Fire Bolt infobox; Fextralife patch notes (nested condition tooltips); Nexus "Better Tooltips" (via snippet)      | current                  | https://bg3.wiki/wiki/Controls ; https://bg3.wiki/wiki/Fire_Bolt ; https://baldursgate3.wiki.fextralife.com/Patch+Notes ; https://www.nexusmods.com/baldursgate3/mods/6324                                                           |
| S21 | BG3 Examine window (Prima Games) + Steam controller-tooltip thread (via snippet)                                                                    | 2023                     | https://primagames.com/gaming/how-to-examine-enemy-weaknesses-and-resistances-in-baldurs-gate-3 ; https://steamcommunity.com/app/1086940/discussions/0/4034727620339028093                                                           |
| S22 | DOS2: Epip mod docs; Nexus "Detailed Tooltips" (via snippet)                                                                                        | current                  | https://www.pinewood.team/epip/ ; https://www.nexusmods.com/divinityoriginalsin2definitiveedition/mods/506                                                                                                                           |
| S23 | Hearthstone wiki: Keyword; Collection manager                                                                                                       | current                  | https://hearthstone.wiki.gg/wiki/Keyword ; https://hearthstone.wiki.gg/wiki/Collection_manager                                                                                                                                       |
| S24 | Slay the Spire 2 keywords glossary (Metabot)                                                                                                        | 2026                     | https://metabot.gg/en/slay-the-spire-2/guides/keywords-terms-glossary                                                                                                                                                                |
| S25 | Diablo IV advanced tooltips (TheGamer) + Blizzard forum request for a hold-key                                                                      | 2023-06-17               | https://www.thegamer.com/diablo-4-how-advanced-tooltips-work/ ; https://us.forums.blizzard.com/en/d4/t/requesting-advanced-tooltip-information-toggle/131616                                                                         |
| S26 | Path of Exile "Advanced Mod Descriptions" (Alt) / Compare (Ctrl)                                                                                    | 3.1.2 era, current       | https://www.vhpg.com/show-advanced-mod-descriptions/ ; https://www.pathofexile.com/forum/view-thread/3719015                                                                                                                         |
| S27 | MTG Arena keyword reminders: Draftsim settings guide; MTG wiki "Arena/Tooltips" and "Reminder text" (via snippet)                                   | 2024                     | https://draftsim.com/mtg-arena-settings/ ; https://mtg.fandom.com/wiki/Magic:_The_Gathering_Arena/Tooltips ; https://mtg.fandom.com/wiki/Reminder_text                                                                               |
| S28 | Keyword design: N. Kinstler, Game Developer "Card Games – What's in a Keyword" (2018-07-02); Cloudfall Studios "Design Tips: Keywords" (2021-06-30) | 2018 / 2021              | https://www.gamedeveloper.com/game-platforms/card-games---what-s-in-a-keyword ; https://www.cloudfallstudios.com/blog/2021/6/17/design-tips-keywords                                                                                 |
| S29 | Genshin Impact: Details panel and EM tooltip (Fandom Attribute/Elemental Mastery, GameRant; via snippet); Tutorial/Archive (Fandom, via snippet)    | current                  | https://genshin-impact.fandom.com/wiki/Attribute ; https://genshin-impact.fandom.com/wiki/Elemental_Mastery ; https://genshin-impact.fandom.com/wiki/Tutorial                                                                        |
| S30 | Legends of Runeterra mobile: tap card to see keywords (Android Authority, via snippet)                                                              | 2020                     | https://www.androidauthority.com/legends-of-runeterra-1112357/                                                                                                                                                                       |

---

## 1. Anatomy of the best tooltip / explain panel

The strongest examples share one skeleton: an **identity line**, a **cost/economy line**, an **effect line** (numbers first), a **body** with highlighted keywords, then **keyword reference cards**, then a **footer** with a deeper path. Layers are revealed in that order and the user can stop at any layer.

### 1.1 Field order (synthesis)

| Order | Field                          | What goes in it                                                                                                                                        | Evidence                                                                                                                                                                                                                                                            |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **Identity**                   | Icon + name + category/tag line (e.g. "Cantrip · Evocation"; "Condition"; "Bonus Action"). Expanded abbreviation if the trigger was an abbreviation.   | BG3 infobox: title, cantrip + school [S20 Fire Bolt]; M3 rich tooltip "subhead" [S12]; TipKit tip = title + message (+ image, + action) [S11]                                                                                                                       |
| 2     | **Cost / economy**             | Action economy glyphs (Action / Bonus Action / Reaction), resource consumed, concentration flag, range.                                                | BG3: "Action" icon on its own cost line, range icon "18 m (60 ft)" [S20]; DOS2 tooltips show AP cost, range, and (with the Detailed Tooltips mod) area radius, surfaces, statuses with chance and duration [S22]                                                    |
| 3     | **Effect line (numbers)**      | Dice + damage type icon + label ("1d10 🔥 Fire"), scaling ("At higher levels: 2d10 at 5"). Numbers precede prose.                                      | BG3 damage line shows "1~10" then "1d10" + fire icon + "Fire"; separate "At higher levels" block [S20]                                                                                                                                                              |
| 4     | **Body / description**         | 1–3 sentences; game terms are visually marked (colour/underline) and are themselves triggers.                                                          | BG3 highlighted terms hover → T to open own tooltip [S20 Controls, Nexus snippet]; Slay the Spire "hover any underlined keyword" [S24]; Hearthstone "mousing over a minion card with a keyword ability will generate a text display describing the ability" [S23]   |
| 5     | **Keyword reference cards**    | One small card per keyword in the body, stacked beside the parent, opened together rather than one at a time. Related cards/tokens listed to the side. | Hearthstone related cards "presented fully on the left side of the card", list + scroll if >6 [S23]; MTG Arena keyword reminders = floating text beside the card on hover, long-press on mobile, because Arena "usually skips putting reminder text on cards" [S27] |
| 6     | **Advanced layer (on demand)** | Ranges, tiers, additive vs multiplicative, exact formula, compare with current.                                                                        | Diablo IV: affix ranges, lucky-hit values, "[+] additive, [x] multiplicative"; "Advanced Tooltip Compare" shows gained/lost properties [S25]; PoE: hold Alt = prefixes/suffixes, tiers, ranges; hold Ctrl = compare [S26]                                           |
| 7     | **Footer**                     | "Learn more" → full rules page/compendium, cross-references, source book; for teaching tips: dismiss control.                                          | Demiplane Click-To-Know: click a name → "full rules plus tooltips, cross-references, and more" [S18]; DDB: snippet on sheet, click → sidebar with full text and "prev" navigation [S19]; M3 rich tooltip may carry links and action buttons [S12]                   |

### 1.2 Two tooltip species, deliberately different

- **Plain (reference) tooltip**: one line naming an element; for icon-only controls. M3 plain tooltip max width 200 dp, auto-dismisses; rich tooltip max width 320 dp, has subhead + supporting text + optional actions and persists until dismissed [S12, m3 widths via search snippet of the M3 guidelines].
- **Rich explain panel / popover**: multi-field content, persists, can be pinned; on iPad a popover, on iPhone a sheet (HIG: "Avoid displaying popovers on iPhones... reserved for use in iPad apps"; popovers must not cascade; "Show only one popover at a time") [S10].
- **Teaching tip** (TipKit): a title + short message + optional action shown once when a rule/event says the user is eligible; invalidated by `.actionPerformed` or `.tipClosed`; display frequency configurable [S11]. NN/g: contextual "pull" help beats up-front tutorials, which "don't tend to be memorable" and "don't result in better task performance" [S3].

### 1.3 Density devices that keep the screen clean

- **Snippets with computed values**: DDB shows "CHA saving throw (DC **14**)" on the sheet using `{{savedc:cha}}`, `{{modifier:str#signed}}`, `{{proficiency}}`, `{{spellattack}}`; the full text lives in the sidebar [S19]. This is the model for "abbreviated on the surface, full on demand".
- **Keywords as compression**: a keyword condenses rules text "down into no more than a few words", cards with keywords _read_ simpler even when functionally identical; cost = vocabulary burden, so cap the vocabulary (8–12 core keywords; ≤7 new per expansion) [S28 Kinstler]. Cloudfall: keyword only frequent, synergistic, simple mechanics; "only use a keyword when it is absolutely necessary" [S28].
- **Reminder text trade-off**: MTG reminder text "sacrific[es] technical accuracy for ease of understanding" and does not define the mechanic [S27 Reminder text]. So a good panel carries both: a plain one-liner _and_ the exact rule line.

---

## 2. Trigger rules (mouse, keyboard, touch, controller)

### 2.1 Mouse

- Show on hover **after a delay** so passing the pointer does not spray tooltips: Foundry `TOOLTIP_ACTIVATION_MS = 500` ("long hover") [S16]; Hearthstone waits about one second before the keyword box appears (via snippet, hearthstoneplayers) [S23]; Roll20 `title` tooltips appear "after a couple of seconds" and cannot be styled — the community moved to the Tipsy library for immediate, HTML tooltips [S17].
- Content must be **hoverable** (pointer can move onto it) and **persistent** (no auto-timeout) [S5].
- Provide a **pin/lock**: Foundry `lockTooltip()`/`createLockedTooltip()` with a 50 px buffer zone and `dismissLockedTooltips()` [S16]; BG3 `T` = "Examine / Pin Tooltip", `Left Alt` = "Expand Tooltip" (⌘ on macOS) [S20 Controls].
- Provide a **hold-to-reveal advanced layer** rather than a settings toggle: PoE hold Alt/Ctrl, rebindable in Options → Input [S26]. Diablo IV put the same information behind a permanent Options toggle and players explicitly requested a hold-key instead ("appears when you hold down a button and goes back to hidden when you release") [S25].

### 2.2 Keyboard

- The trigger **must be focusable**; the tip appears on focus as well as hover; **Esc dismisses without moving focus**; focus stays on the trigger [S7, S9, S1 "support both mouse AND keyboard hover"].
- A tooltip is referenced with `aria-describedby` when it is a description, `aria-labelledby` when it is the only label [S8].
- A tooltip **cannot contain interactive content**; if it needs links/buttons, it is a non-modal dialog (or a "toggletip" button + live region) [S7, S8, S9].

### 2.3 Touch

- There is no hover. Options, in order of reliability: (a) **tap on a dedicated non-actionable trigger** (info glyph, underlined term, stat chip); (b) **long-press as an enhancement only** — on mobile web a long-press on text opens the native selection menu and on a link/image the context menu, so "never [make] it the only route" [S15]; Mayank's long-press-with-haptics technique is "untested" and later recommended switching to the `contextmenu` event, buttons only [S14].
- Games that solved it: MTG Arena = long-press the card on mobile [S27]; Legends of Runeterra = tap the card to reveal keywords [S30]; M3 = long-press on touch, hover on pointer [S12].
- Anything longer than a few words goes in a **bottom sheet or popover**, not a bubble [S15]; on iPhone Apple wants sheets, not popovers [S10]; M3 modal bottom sheet dismisses by swipe-down, scrim tap or Back [S13]. DDB's sidebar "can be swiped in and out on mobile" [S19].
- Tap targets ≥ 24×24 CSS px (WCAG 2.2) / 44×44 pt (Apple) [S15].
- Pair at least two dismissal methods (close control + tap outside/swipe) [S15].

### 2.4 Controller (lesson from BG3)

- bg3.wiki lists **no direct controller binding** for Expand/Examine tooltip ("must instead be done through a menu") and Steam threads report controller tooltips drawing over context menus [S20, S21]. Lesson: give explain a first-class, discoverable action (a visible "?"/Examine affordance), never a hidden chord.

### 2.5 Recommended timing table

| Input    | Open                                       | Keep open                       | Pin                      | Close                                         |
| -------- | ------------------------------------------ | ------------------------------- | ------------------------ | --------------------------------------------- |
| Pointer  | hover 400–500 ms, or click                 | while over trigger **or** panel | click / `T`-like key     | mouse-out (unless pinned), Esc, click outside |
| Keyboard | focus (instant)                            | while focused                   | Enter/Space on trigger   | Esc, blur                                     |
| Touch    | tap trigger (instant); long-press optional | until dismissed                 | n/a (already persistent) | swipe down, scrim tap, close button, Back     |

---

## 3. Nested keywords

- **Mark them**: keyword occurrences inside body text are visually distinct and are triggers (BG3 highlighted terms; StS underline; DDB tooltips underline) [S20, S24, S19].
- **Flatten before you nest**: Hearthstone, MTG Arena and StS do not open a tooltip-inside-a-tooltip; they render **all** keyword reference cards of the parent at once, stacked beside it [S23, S27, S24]. Depth stays at 1 while the user still sees every definition.
- **Link, don't recurse**: when a keyword's definition itself references another mechanic, BG3 makes the term a link that "link[s] out" to the other tooltip (patch note: Hunted → Blinding Ambush) [S20 Fextralife]. DDB's sidebar replaces content in place and offers "prev" to go back [S19]; Demiplane exposes cross-reference links rather than nested bubbles [S18].
- **Depth limit**: NN/g — "designs that go beyond 2 disclosure levels typically have low usability because users often get lost" [S2]. Level 1 = panel; level 2 = one in-place replacement with Back; level 3 = "open in compendium" (page navigation), never another bubble. Apple: "Never display cascading popovers" [S10].
- **Vocabulary control**: cap the keyword set and reuse the same word everywhere (Kinstler 8–12; Cloudfall "only when necessary") [S28]. Sort keywords into stable buckets (StS2: buffs, debuffs, card behaviours, orbs) so users learn the _class_ first ("sort first, then read") [S24].

---

## 4. What to show, by object type

### 4.1 NUMBER (a derived stat) — "total, then why"

1. **Total**, large, exactly as shown on the surface (no reformatting between chip and panel).
2. **Formula in words** ("10 + DEX modifier + shield").
3. **Line items**: base, each modifier with its **source** (item, feature, condition), then an **override** row flagged as such (D&D Beyond exposes "Override AC" and "Base AC + DEX" as separate concepts [S19 forum snippet]; DDB's computed snippets already show the derived number inline [S19]). BG3's AC guidance lists armour, shield and DEX contributions as the components a player is expected to see [S20/BG3 AC guides].
4. **Operator semantics**: mark additive vs multiplicative like Diablo IV "[+]" / "[x]" [S25]; show ranges/tiers only in the advanced (hold/expand) layer like PoE [S26].
5. **Effect preview** for stats that only matter through something else: Genshin's Details panel shows "Increases damage of Vaporize and Melt by A%" for Elemental Mastery — i.e. the _consequence_ computed for this character, not just the raw number [S29].
6. **Compare** (optional): "if you equip X: +1" à la D4/PoE compare [S25, S26].

### 4.2 TERM (a rule keyword or condition)

1. **Definition** — one plain sentence (the "reminder text" register) [S27].
2. **Rule** — the exact mechanical effects as ≤3 bullets, plus **what ends it** and **duration** (DOS2 status tooltips show saving throw and "how to get rid of a status" [S22]).
3. **Example** — one concrete line tied to the current character when possible ("Your DC now is 14").
4. **Related keywords** as chips (stacked reference cards) [S23].
5. **Learn more** → compendium entry [S18].

### 4.3 ICON

1. **Name** (plain tooltip; ≤ 200 dp width) [S12].
2. **Meaning in one clause** ("Fire damage: … resisted by …").
3. If the icon is a state (resistance/vulnerability/immunity), state the _effect_ ("takes half damage") the way BG3's Examine icons do on hover [S21].
   NN/g: prefer a visible label; a tooltip supplements, it does not replace [S1]. Skip explaining conventional icons (gear, close) [S3].

### 4.4 RESOURCE (slots, uses, points)

1. **What it is** and **current / max**.
2. **What consumes it** (which actions/spells).
3. **How it recharges** (short rest / long rest / dawn / per turn), with the next recharge event named. StS2 frames orbs as "channelled resources that trigger every turn" — the recharge rhythm is part of the definition [S24].
4. **Override/temporary sources** listed as line items (like a number).

---

## 5. Accessibility rules (hard requirements)

1. **WCAG 1.4.13** (AA): hover/focus content must be **dismissible** without moving pointer/focus (Esc), **hoverable** (pointer can travel onto it), **persistent** (until dismissed, trigger removed, or invalid); only user-agent `title` tooltips are exempt [S5].
2. **Never use `title`** for explain content: "If you want to hide content from mobile and tablet users as well as assistive tech users and keyboard only users, use the title attribute" [S8].
3. **ARIA**: `role="tooltip"` + `aria-describedby` on the trigger; Esc closes; focus never moves into a tooltip; **no interactive content** inside — use a non-modal dialog for that [S7, S9]. Toggletips: a real `<button>`, content announced through a `role="status"` live region, not `aria-describedby` [S8].
4. **Trigger must be focusable** and the tooltip must open on focus as well as hover [S9, S1].
5. **Essential information is never only in a tooltip**: "It should be possible to infer how to use the UI without reading any tooltips" [S9]; NN/g: if information is necessary to complete the task it stays on the page [S1].
6. **Abbreviations (WCAG 3.1.4, AAA but cheap)**: provide a mechanism to expand — G97 expanded form immediately before/after first use, G55 link to definition, G62 glossary, H28 `<abbr>` [S6].
7. **Touch**: targets ≥ 24 px (44 pt on Apple), two dismissal methods, no hover-only paths [S15]; sheets on phones [S10, S13].
8. **No auto-timeouts** on instructional content (allowed only for confirmations) [S15, S5].
9. **One at a time**: no cascading popovers; only one teaching tip on screen [S10, S4].
10. **Contrast, positioning, arrow**: readable contrast, do not cover the trigger or related content, arrow points to the trigger when neighbours cluster [S1, S10].

---

## 6. Anti-patterns (observed failures)

| Anti-pattern                                                                                                  | Why it fails                                                               | Source     |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- |
| Essential info hidden in tooltips ("the more we strive for extreme minimalism, the more tooltips we'll need") | Users must hunt; touch/keyboard users may never see it                     | S1, S9     |
| `title` attribute tooltips                                                                                    | Unstyled, delayed, invisible to touch/keyboard/many screen readers         | S8, S17    |
| Interactive content (links/buttons) inside a hover tooltip                                                    | Unreachable by keyboard; violates ARIA pattern                             | S7, S8, S9 |
| Tooltip on a non-focusable element                                                                            | No keyboard path                                                           | S9         |
| Auto-dismiss timers on explanations                                                                           | Race condition for slow readers / magnifier users                          | S5, S15    |
| Nested bubbles > 2 levels; cascading popovers                                                                 | Users get lost; HIG forbids popover-on-popover                             | S2, S10    |
| Advanced info behind a global settings toggle                                                                 | Either always cluttered or always hidden; players asked for hold-to-reveal | S25        |
| Tooltips drawn over context menus / no controller path                                                        | BG3 controller reports; explain becomes unreachable                        | S20, S21   |
| Coach-mark chains, front-loaded tutorials                                                                     | Not memorable, dismissed, "short-term memory... fades in about 20 seconds" | S3, S4     |
| Explaining conventional icons                                                                                 | Wastes the user's attention budget                                         | S3         |
| Reminder text as the _only_ explanation                                                                       | Reminder text is deliberately imprecise                                    | S27        |
| Long-press as the only touch trigger                                                                          | Browser hijacks the gesture (selection/context menu)                       | S14, S15   |
| Tooltip restating visible text; duplicated definitions per surface                                            | Redundant, drifts out of sync                                              | S1, S12    |
| Keyword bloat (many rare keywords)                                                                            | Vocabulary burden outweighs compression                                    | S28        |

---

## 7. Recommended spec for a D&D 2024 companion app (d20 Folio)

### 7.1 One primitive, four trigger kinds

`<Explain kind="term|stat|icon|resource" id="…">` wraps any surface element. It never carries prose itself: it points at an **explain entry** (`explain/<id>`) resolved through i18n, so EN and IT ship together and the same entry is reused on every surface (rule from the owner: unexplained jargon = defect, on every surface).

| kind     | Surface affordance                                        | Desktop                                          | Mobile             |
| -------- | --------------------------------------------------------- | ------------------------------------------------ | ------------------ |
| term     | dotted underline, inherits text colour                    | hover 450 ms / focus → popover; click pins       | tap → bottom sheet |
| stat     | number chip; "ⓘ" appears on hover/focus, always for touch | same                                             | same               |
| icon     | icon button                                               | hover → plain tooltip (name); click → full panel | tap → sheet        |
| resource | pip row / counter                                         | hover → panel                                    | tap → sheet        |

- Desktop container: Radix `Popover` (not `Tooltip`) because it must be hoverable, pinnable, persistent and may contain links; open on hover/focus, `Esc` closes, focus stays on trigger, `aria-describedby` for unpinned state, `aria-haspopup="dialog"` once pinned. Max width 320 px (M3 rich) [S12]; arrow to trigger; never cover the trigger [S10].
- Mobile container (≤ 768 px or coarse pointer): modal bottom sheet with drag handle, two detents (peek = header + definition; full = everything), dismiss by swipe/scrim/Back/close button [S13, S15]; never a popover on phone [S10].
- Nesting: keyword chips inside the panel **replace content in place** with a "← Indietro" breadcrumb (level 2). Any further link is "Apri nel compendio" (route navigation). Depth never exceeds 2 [S2].
- Pin: click/Enter pins the desktop popover (à la BG3 `T`, Foundry lock); pinned panels get a close button; only one pinned panel at a time [S10].
- Advanced layer: a "Dettagli" disclosure inside the panel (touch-friendly) and hold-`Alt` on desktop reveals breakdown rows and formulas without a settings toggle [S26 over S25].
- No dice: the panel shows the formula and modifiers; it never rolls or suggests a result (product invariant).

### 7.2 Content template (order is fixed)

```
[1] HEADER      icon · Name (Abbr) · tag chips [Regola | Condizione | Risorsa | Tipo di danno]
[2] VALORE      big number or dice line · economy glyphs (Azione/Bonus/Reazione) · range
[3] IN BREVE    one sentence, plain register (reminder text)
[4] REGOLA      ≤3 bullets: effect · when it ends · edge cases
[5] PER TE      one line computed for this character ("Il tuo bonus di competenza è +3")
[6] DA DOVE VIENE  breakdown table: base / modifier (source) / override
[7] CORRELATI   keyword chips (in-place, level 2)
[8] FOOTER      "Apri nel compendio →"  ·  [teaching tips only] "Non mostrare più"
```

Rules: sections 3–4 mandatory for `term`; 2 and 6 mandatory for `stat`/`resource`; 1 + 3 mandatory for `icon`. Strings live in `src/i18n/{en,it}`; entries reference SRD text only in the public build.

### 7.3 Abbreviations on first sight without permanent verbosity

- **First render per screen**: show `Classe Armatura (CA)` once (G97), then `CA` everywhere with `<abbr title>` and the `term` trigger [S6]. Track "first sight" per screen session, not per user, so returning users are not re-taught but every screen still self-explains once.
- Compact surfaces (combat tracker cells, badges) always use the abbreviation + trigger; headers and panels use the full word.
- Settings toggle "Etichette estese" (off by default) forces full labels for users who want permanent verbosity — the inverse of D4's toggle: verbosity is opt-in, explanation is always one tap away.

### 7.4 Teaching tips vs reference explains

|             | Teaching tip                                                                                                                             | Reference explain                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Purpose     | "This exists / this changed for you"                                                                                                     | "What does this mean / why this number" |
| Trigger     | Auto, on first eligible event (first Concentration spell prepared, first condition applied, first level with new PB) [S11]               | Always user-initiated [S3]              |
| Frequency   | Once; invalidated by action performed or closed [S11]; one on screen at a time [S4]                                                      | Unlimited                               |
| Persistence | Per-user `settings.hints.seen[id]` (Firestore `users.settings` is live — extend, don't replace); "Mostra di nuovo i suggerimenti" resets | n/a                                     |
| Copy        | Title + 1 sentence + optional action                                                                                                     | Full template 7.2                       |
| Shape       | Inline callout or anchored tip (not modal)                                                                                               | Popover / sheet                         |

"Hide learned hints" therefore only ever hides _teaching_ tips; reference explains can never be hidden (owner rule: explain on demand everywhere).

### 7.5 Exact content templates (IT primary; EN mirrors ship in the same i18n commit)

Values in `{…}` are computed by the engine; nothing is rolled.

**Classe Armatura (CA)** — kind: stat

```
[1] 🛡 Classe Armatura (CA) · Statistica
[2] {ac}
[3] Quanto è difficile colpirti: un attacco ti colpisce solo se il tiro per colpire è ≥ alla tua CA.
[4] • Base 10 + modificatore di Destrezza, oppure la CA dell'armatura indossata (limite DES per armature medie, nessun DES per pesanti).
    • Uno scudo aggiunge +2. • Alcune capacità (es. Difesa senza armatura) sostituiscono il calcolo: si usa il valore più alto, non si sommano.
[5] Ti colpisce un tiro per colpire di almeno {ac}.
[6] Base {baseSource}: {base} · DES {dexMod} (limite {dexCap}) · Scudo {shield} · {featureName} {bonus} · Override manuale: {override?}
[7] Tiro per colpire · Armatura · Scudo · Copertura
[8] Apri nel compendio → Classe Armatura
```

**Slot incantesimo** — kind: resource

```
[1] ✦ Slot incantesimo · Risorsa
[2] Livello {n}: {used}/{max} usati   (pip row)
[3] Il "carburante" degli incantesimi: lanciare un incantesimo di livello 1+ consuma uno slot di quel livello o superiore.
[4] • Uno slot più alto potenzia molti incantesimi ("A livelli superiori"). • Non spendi slot per i trucchetti. • Torna disponibile con un riposo lungo{warlock? " (Magia del Patto: riposo breve)"}.
[5] Prossimo recupero: {nextRecharge} · Slot più alto libero: livello {highestFree}
[6] Da: {className} liv. {level} → {slotsTable} · {extraSource}: {extra}
[7] Riposo lungo · Riposo breve · Trucchetto · Livello dell'incantesimo
[8] Apri nel compendio → Slot incantesimo
```

**Movimento (Velocità)** — kind: stat

```
[1] 👣 Velocità di movimento · Statistica
[2] {speed} m ({speedFt} ft) · {remaining} rimasti in questo turno
[3] Quanto puoi spostarti nel tuo turno, anche a pezzi, prima/dopo un'azione.
[4] • Terreno difficile: ogni 1,5 m costa 3 m. • Alzarsi da prono costa metà velocità. • Scatto (azione): raddoppia il movimento del turno.
[5] Con Scatto potresti muoverti di {speed*2} m questo turno.
[6] Base {speciesName}: {base} · {featureName} {bonus} · {conditionName}: {penalty} · Override: {override?}
[7] Scatto · Terreno difficile · Prono · Afferrato
[8] Apri nel compendio → Movimento
```

**Iniziativa (INIT)** — kind: stat

```
[1] ⚡ Iniziativa (INIT) · Statistica
[2] {initMod:+}
[3] Decide l'ordine dei turni: all'inizio del combattimento ogni creatura fa una prova di Destrezza.
[4] • Tira 1d20 e aggiungi il tuo modificatore (mostrato qui, il tiro lo fai tu). • Vantaggio/svantaggio si applicano normalmente. • In caso di parità decide il DM (o la DES più alta).
[5] Il tuo modificatore: {initMod:+} → scrivi d20 + {initMod}.
[6] DES {dexMod} · {featureName} {bonus} (es. Vigile) · Override: {override?}
[7] Prova di caratteristica · Vantaggio · Sorpresa
[8] Apri nel compendio → Iniziativa
```

**Competenza (Bonus di competenza, BC)** — kind: stat

```
[1] ★ Bonus di competenza (BC) · Statistica
[2] {pb:+}
[3] Il bonus che aggiungi a ciò in cui sei competente: abilità, tiri salvezza, attacchi con armi e incantesimi, CD.
[4] • Dipende solo dal livello totale: +2 (1–4), +3 (5–8), +4 (9–12), +5 (13–16), +6 (17–20). • Non si somma mai due volte. • Maestria: lo raddoppi.
[5] Livello {level} → {pb:+}. Con Maestria: {pb*2:+}.
[6] Livello totale {level} → {pb} · Override: {override?}
[7] Maestria · Tiro salvezza · CD dell'incantesimo
[8] Apri nel compendio → Competenza
```

**Concentrazione** — kind: term

```
[1] ◎ Concentrazione · Regola
[2] {activeSpell? "Attiva: {spellName} ({remaining})" : "Nessun incantesimo attivo"}
[3] Alcuni incantesimi restano attivi solo finché ti concentri: puoi mantenerne uno alla volta.
[4] • Termina se lanci un altro incantesimo a concentrazione, se sei Incapacitato o muori, o se decidi di interromperla. • Se subisci danni: tiro salvezza su Costituzione CD 10 o metà del danno subito, il maggiore.
[5] Ora: {damage? "Danno {dmg} → CD {max(10, floor(dmg/2))}, il tuo bonus è {conSave:+}" : "Il tuo TS su COS è {conSave:+}"}.
[6] — (nessun breakdown)
[7] Incapacitato · Tiro salvezza · Costituzione
[8] Apri nel compendio → Concentrazione
```

**Spaventato** — kind: term (condition)

```
[1] 😨 Spaventato · Condizione · {source? "da {sourceName}" }
[2] Durata: {duration ?? "fino alla fine dell'effetto"}
[3] Hai paura di qualcosa che vedi: combatti peggio e non riesci ad avvicinarti.
[4] • Svantaggio a prove di caratteristica e tiri per colpire finché la fonte della paura è in linea di vista. • Non puoi muoverti volontariamente verso la fonte. • Finisce come indicato dall'effetto che l'ha causata (spesso con un tiro salvezza a fine turno).
[5] Fonte: {sourceName} — tiro salvezza {saveAbility} CD {dc} {when}.
[6] —
[7] Svantaggio · Tiro salvezza · Linea di vista · Incapacitato
[8] Apri nel compendio → Condizioni
```

**Icona tipo di danno (es. Fuoco)** — kind: icon

```
[plain tooltip] Fuoco
[panel]
[1] 🔥 Fuoco · Tipo di danno
[2] {context? "{dice} danni da fuoco" }
[3] Danno da fiamme e calore.
[4] • Resistenza: subisce metà danni. • Immunità: nessun danno. • Vulnerabilità: danni raddoppiati. • Può incendiare oggetti infiammabili non trasportati.
[5] {target? "{targetName}: {resistance|immunity|vulnerability|"nessuna modifica"}" }
[6] —
[7] Resistenza · Vulnerabilità · Immunità
[8] Apri nel compendio → Tipi di danno
```

### 7.6 Acceptance checklist for the component

- Opens on hover+focus (desktop), tap (touch); Esc/close/scrim/swipe/Back all work; no timers.
- Panel is hoverable; pinned state announced; no interactive elements inside the _unpinned_ hover state except keyword chips that only replace content.
- Every abbreviation on a screen is expanded once (G97) and always has a trigger.
- Depth ≤ 2, then route to compendium; one panel at a time.
- Same entry id renders identically in EN and IT and on every surface (sheet, tracker, /view share page).
- Teaching tips only: per-user seen-state, reset in settings; reference explains never hideable.
