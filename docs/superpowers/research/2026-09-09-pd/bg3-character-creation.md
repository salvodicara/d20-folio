# Baldur's Gate 3 character creation — research evidence

Sourced facts, for Astra to copy proven BG3 patterns. Unverifiable claims are flagged.
Reference numbers `[n]` map to the Sources list at the end.

## 1. Step order, mandatory/optional, defaults, backtracking, timing

**Order** ([1], [4]): Origin (custom vs. pre-made) → Race/subrace → Appearance (optional, race
changes the model first) → Class → Background (custom only; Origins arrive fixed) → Ability
scores → Skills → Name.

- **Mandatory:** race, class, background, ability allocation, skills, name. The "Proceed" button
  at the character's feet "illuminates only when all requirements are met" — disabled while
  points are unspent or subclass/subrace is unpicked [4].
- **Fully skippable:** pick one of 6 pre-built companions instead [2] — only 7% of players did
  (see §3).
- **Recommended defaults:** a one-click **Recommended** preset fills the 27-point ability pool to
  the class's ideal spread [5]; the primary ability carries a star icon. Skill choice is a short
  class-filtered list (2–4 from ~5–6 options), never the full catalogue [6].
- **Backtracking:** the left-hand step list looks sequential but isn't — "every player seems to
  have their own starting point, and each section can be completed in any order" [4]. Nothing
  commits until final confirm.
- **Timing:** Larian's opening-weekend telemetry [11]: players spent **88 years total** in the
  creator (~9% of all playtime); "10% of characters... were there for over an hour." Guides
  describe 10–20 min for a decisive player, 1–2 hours for full tuning [14]. No verified "expert
  speedrun" number exists — flagged unconfirmed.
- Screenshot refs: bg3.wiki/wiki/Character_creation, /Point_Buy, /Origins.

## 2. How each choice is explained

- Exact flavor-vs-mechanical text split on class/race panels **could not be verified from
  text-only sources** — needs a live screenshot. Confirmed indirectly: the right panel
  "dynamically updates... showing current class and race choices, available spells or abilities,
  spell slot organization" [4].
- **Nested/layered tooltips are a documented Larian UI pattern game-wide** (item/spell/stat
  tooltips reference each other) [21] — not confirmed as chargen-specific; treat as plausible but
  unverified for this screen.
- **Consequences previewed concretely:** wizards pick 3 cantrips and 6 level-1 spells for two
  spell slots inside creation, from the full legal-at-level-1 list [15], [16].
- **Reversible vs. permanent is signaled by mechanism, not copy, and is asymmetric.** Class,
  subclass, ability scores, skills, and spells are changeable later for 100gp via **Withers**
  ("respec... change your class, ability setup, spells, and anything else" [7]). Race/subrace and
  appearance are **not** offered by Withers [8]; a later patch added the **Magic Mirror** for
  cosmetic-only edits at camp, still excluding race [9]. Devs' stated reasoning: companion
  dialogue reacts to race, so changing it later "wouldn't make sense" narratively [10]. No source
  shows an explicit "this is permanent" label at the race step — permanence is communicated only
  by Withers silently omitting the option. Flagged as a gap, not a pattern to copy blindly (§6).

## 3. Engagement devices (non-decorative)

- **Live 3D model reacts to picks**; Larian chose curated preset components over continuous
  sliders on purpose: "small millimetre changes can make or break a face completely... faces
  being a bit blank and characterless if heavily dependent on sliders" — acknowledged gap: no
  height/body-type slider at launch [12].
- **Voice is previewable and decoupled from gender:** 8 options, "Hear Voice" samples a line;
  odd/even numbering loosely maps to masculine/feminine timbre without being locked to the
  gender-identity field ([12]: "gender is not defined by your body, genitals or your voice").
- **Narrator reacts to your build:** Amelia Tyler recorded "17 different narration types" that
  shift tone by character/origin — Shadowheart's runs "higher pitch, lighter, and a little more
  emotionally tense" — and picking **Dark Urge** unlocks distinct extra narration [13].
- **"Recommended" tags + primary-ability star** reduce blank-page anxiety without removing choice.
- **Ability scores — the 2024-style floating +2/+1:** point-buy base is 8 in every ability, 27
  points to spend, 1 point per increase up to 13, 2 points each for 14–15 (cap 15 pre-bonus).
  Independent of race, the player then assigns a **floating +2 to one ability and +1 to a
  different ability of their choice** (matching 2024 D&D's rule that ability bonuses are a
  player choice, not a race trait), pushing a starting score as high as 17 [3], [17].
- **Background → skill tie-in is concrete:** every background grants exactly 2 fixed
  proficiencies, e.g. Soldier → Athletics + Intimidation; Criminal → Deception + Stealth; Sage →
  Arcana + History; Folk Hero → Animal Handling + Survival [19], [20]. Background also gates the
  Inspiration reward system and origin dialogue hooks.
- **Origin characters as pre-built exemplars:** 6 fixed companions (Astarion, Gale, Lae'zel,
  Karlach, Shadowheart, Wyll) + customizable-but-fixed-backstory **Dark Urge** + full custom Tav
  [2]. Despite the shortcut, **93% of players chose custom** over the six presets [11] — the
  pre-built path is reassurance/demo, not the dominant flow.

## 4. Speed for experts

**Could not be fully answered.** No source gives a verified click-count or documented
"quick create." Confirmed: the Recommended ability preset and fixed skill shortlists remove the
two slowest decisions in one action each (§1); origin characters are a zero-decision path used
by 7% of players. No "skip creation" shortcut or GDC talk on chargen speed turned up — do not
assert a click count to Astra.

## 5. Progressive disclosure after creation

- **Subclass:** most classes choose at level 3, not creation; a few (e.g. Cleric domain) choose
  at level 1 — generalize as "level 1 or 3 depending on class" [22], [18].
- **Feats:** every 4 class levels (4/8/12 single-class). Multiclassers only hit a breakpoint if
  they stay 4 levels deep in one class, so can end with 2 feats instead of 3 [18].
- **Multiclassing:** unavailable at creation — first offered on the level-up screen at level 2.
- **Ability Score Improvements** land at the same 4/8/12 breakpoints as feats (2024 rules fold
  ASIs and feats into one choice).

## 6. Known criticisms — do not copy these

- **"Overwhelming" is the single most repeated complaint**, especially for newcomers: "the amount
  of choice and detail is to some level overwhelming, but in a good way" vs. "I am totally
  overwhelmed and paralyzed... afraid of getting the build wrong" (Steam community threads,
  corroborating [21]).
- **Ambiguous step ordering:** the step list visually implies a strict sequence but isn't one;
  guides had to clarify this explicitly — the UI under-communicates its own flexibility [4].
- **No in-game build planning:** "players shouldn't have to rely on external guides for character
  building and planning" is a recurring, never-addressed community ask — tooltips are detailed
  but don't project forward into a full build plan.
- **Irreversible race/appearance choice is a persistent pain point** — players report regret
  after committing hours ("picking Human... wanting to change but being too far in to start
  over"), partially mitigated post-launch by the cosmetic-only Magic Mirror, but race stays
  locked with no explanation offered at the point of choice [9].
- **Acknowledged missing controls:** no height or body-type/weight slider at launch — Larian's
  own art director called these "potential areas of improvement for us in the future" [12].

## Patterns worth copying (observable behaviour)

1. One-click "Recommended" preset fills ability-score allocation to the class ideal; every value
   stays hand-editable after.
2. Each class's primary ability carries a small badge/star directly on the allocator, at the
   moment of choice.
3. Skill proficiency picks are a short, class-filtered list (2–4 from ~5–6), never the full
   catalogue.
4. Background shows its two granted skill proficiencies inline with its flavor description — the
   mechanical payoff of a "flavor" choice is never hidden.
5. A single persistent "Proceed" affordance stays disabled with incomplete requirements visible,
   rather than surfacing validation only on submit.
6. Every creation step is independently revisitable before final confirm — no "you can't go
   back" gate mid-flow.
7. Reversibility is segmented by design: mechanical choices (class, spells, ability scores,
   skills) are undoable later through an in-fiction respec; identity choices (race, appearance)
   are not — and BG3 was criticized for leaving that permanence unstated, so state it explicitly.
8. Spellcasters preview and select their actual starting spells/cantrips during creation, not a
   generic "spellcaster" label.
9. A zero-decision "pre-built character" path exists for indecisive players, but stays a minority
   path (~7% uptake) — support the guided custom flow, don't replace it.
10. Voice/audio identity is previewable and sampleable, independent of other identity fields, via
    a one-click "hear it" affordance.

## Sources

1. [bg3.wiki — Character creation](https://bg3.wiki/wiki/Character_creation)
2. [bg3.wiki — Origins](https://bg3.wiki/wiki/Origins)
3. [bg3.wiki — Point Buy](https://bg3.wiki/wiki/Point_Buy)
4. [GameRant — UI Explained](https://gamerant.com/baldurs-gate-3-character-creation-guide-ui-explained/)
5. [RPG Site — Character Creation Guide](https://www.rpgsite.net/feature/14583-baldurs-gate-3-character-creation-guide-the-best-classes-races-and-subclasses-to-choose)
6. [PC Gamer — Abilities/proficiency/skills](https://www.pcgamer.com/baldurs-gate-3-abilities-proficiency-and-skills/)
7. [PC Gamer — Respec guide](https://www.pcgamer.com/baldurs-gate-3-respec-guide/)
8. [Deltia's Gaming — Withers & Respec](https://deltiasgaming.com/baldurs-gate-3-find-withers-how-to-respec-your-class/)
9. [Escapist — Can You Change Your Race?](https://www.escapistmagazine.com/can-you-change-your-race-in-baldurs-gate-3-bg3/)
10. [GameSkinny — Can You Change Your Race?](https://www.gameskinny.com/tips/baldurs-gate-3-can-you-change-your-race/)
11. [TheGamer — 88 years in chargen](https://www.thegamer.com/baldurs-gate-3-player-time-spent-in-character-creator-88-years-stats/)
12. [Game Developer — Inclusive character creator (Alena Dubrovina)](https://www.gamedeveloper.com/art/building-an-inclusive-character-creator-for-the-fantasy-world-of-baldur-s-gate-3)
13. [TheGamer — 17 narrator types](https://www.thegamer.com/baldurs-gate-3-17-different-narrator-types-lines-change-amelia-tyler/)
14. [MemoryPC — Beginner's Guide](https://www.memorypc.eu/blog/gaming-tips/baldurs-gate-3-beginners-guide-character-creation/)
15. [RPGBot — Wizard Spells](https://rpgbot.net/video-games/baldurs-gate-3/classes/wizard/spells/)
16. [Shacknews — Spells/cantrips/slots](https://www.shacknews.com/article/136610/spell-guide-baldurs-gate-3)
17. [GameFAQs — Character Creation](https://gamefaqs.gamespot.com/ps5/397566-baldurs-gate-3/faqs/81142/character-creation)
18. [Mobalytics — Multiclass Guide](https://mobalytics.gg/blog/baldurs-gate-3/multiclass-guide-class-abilities-features-list/)
19. [HardcoreGamer — Background guide](https://hardcoregamer.com/db/bg3/baldurs-gate-3-background-beginner-guide/)
20. [Charlie INTEL — Backgrounds explained](https://www.charlieintel.com/baldurs-gate/all-baldurs-gate-3-character-backgrounds-explained-263652/)
21. [Steam Community — Tooltip discussion](https://steamcommunity.com/app/1086940/discussions/0/3792631782308722218/)
22. [TheGamer — How to multiclass](https://www.thegamer.com/baldurs-gate-3-bg3-multiclass-explained-how-to/)
