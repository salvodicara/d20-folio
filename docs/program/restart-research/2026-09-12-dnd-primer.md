# Dungeons & Dragons — a domain primer for the d20 Folio owner

Written 2026-09-12 for a product owner who has played little D&D but must answer an interviewer's
questions about every feature of a D&D 5e (2024 rules) companion app. Every term is defined the
first time it appears. Sources are numbered `[n]` and listed at the end. Where a number comes from
a self-selected online poll rather than a census, the text says so: treat such figures as
directional, not authoritative.

**One-paragraph orientation.** Dungeons & Dragons (D&D) is a _tabletop role-playing game_ (TTRPG):
a small group of people sit around a table (or a video call), one of them — the _Dungeon Master_
(DM) — describes an imaginary world and plays every character in it except the players' own; each
other player controls one _player character_ (PC) described on a _character sheet_. Uncertain
actions are resolved by rolling dice, most often a twenty-sided die (_d20_), adding modifiers and
comparing against a target number. There is no board and no winner; a _campaign_ is an ongoing
series of _sessions_ in which the same characters accumulate experience, treasure and story.
Since 2014 the game runs on its _fifth edition_ ("5e"), revised in 2024; the free, openly licensed
core of those rules is the _System Reference Document_ (SRD) 5.2.1 [10][11].

---

## 1. History in brief

### 1974–1999: from wargame to TSR to Wizards of the Coast

- **Origins.** D&D was created by Gary Gygax and Dave Arneson and first published in 1974 by
  Tactical Studies Rules (TSR) as three digest booklets. Its combat system was a variation of
  _Chainmail_ (1971), a medieval miniatures wargame co-written by Gygax; Arneson's innovation was
  letting each player control one individual rather than an army, in a game descended from Dave
  Wesely's "Braunstein" scenarios. Arneson added the ideas that still define the game: character
  classes, experience points, level advancement and armor class [1][2].
- **The Basic/Advanced split (1977).** TSR split the line into a rules-light _Basic_ D&D for
  beginners and the heavier _Advanced Dungeons & Dragons_ (AD&D, three hardcovers 1977–79). AD&D
  **2nd edition** (1989) cleaned the rules and removed demons, devils and assassins in response to
  the 1980s "Satanic panic" [1][2].
- **TSR's collapse and Wizards (1997).** TSR went bankrupt and was bought in 1997 by Wizards of the
  Coast (WotC), the _Magic: The Gathering_ publisher; Hasbro bought WotC in 1999 [1].

### 2000–2013: 3e, the OGL, 3.5, 4e and Pathfinder

- **3rd edition (2000)** dropped the "Advanced" prefix, unified the lines and introduced the
  _d20 System_: one core mechanic (roll d20 + modifiers vs. a target number) for everything. It
  also shipped with the **Open Game License (OGL)**, a perpetual license letting third parties
  publish compatible material from an SRD; this created an entire industry of compatible
  publishers. **v3.5 (2003)** was a balance revision [1][2].
- **4th edition (2008)** was a major overhaul (every class got a uniform "powers" list, combat
  became explicitly grid-based) under a more restrictive _Game System License_. It fragmented the
  player base; Paizo, a former WotC licensee, published **Pathfinder** (2009) on the 3.5 rules
  and for a while outsold D&D [1][2].
- **D&D Next.** WotC ran an open public playtest from May 2012 to September 2013 to design 5e,
  explicitly aiming for a simpler, modular game that would win back every era's players [2].

### 2014–2022: 5e and its explosion

- **5e (2014)** shipped three core books (Player's Handbook, Monster Manual, Dungeon Master's
  Guide) and became the most successful edition ever. Drivers cited in journalistic histories:
  _Critical Role_ (a livestreamed game by voice actors, since 2015, later its own media company
  with >120 million YouTube views by March 2020), Netflix's _Stranger Things_ (2016) which put
  basement D&D in front of a mass audience, and a general "actual play" boom on Twitch/YouTube.
  WotC said 2017 was its most profitable year; 12–15 million people played in North America in
  2017; sales rose 52% in 2018; revenue grew from roughly $15M (2013) to $71M (2019); the COVID-19
  pandemic pushed play online and 2020 was the biggest year yet, with an 86% increase in virtual
  play [1][3][4].
- **D&D Beyond** (DDB, launched 2017 by Fandom/Curse) became the de-facto digital character sheet
  and rules compendium; WotC bought it in 2022 for $146.3M and it is now the official "digital
  hub" [5]. Hasbro's official line since 2019, repeated for the 50th anniversary in 2024, is
  "more than 50 million fans" lifetime [6].

### 2023: the OGL crisis and the Creative Commons SRD

- On 5 January 2023 Gizmodo published a leaked draft "OGL 1.1" that would have _deauthorised_
  OGL 1.0a (revoking the 2000 license), imposed revenue reporting and royalties, and given WotC a
  license to third-party content. The community response was the largest in the hobby's history:
  mass cancellation of DDB subscriptions, Paizo announcing the system-neutral **ORC** license,
  Kobold Press announcing "Project Black Flag". WotC apologised (13 Jan), tried an "OGL 1.2"
  (19 Jan; 88–90% of its own survey respondents rejected it) and on **27 January 2023** fully
  reversed: OGL 1.0a stays, and **SRD 5.1 was released under Creative Commons Attribution 4.0
  (CC-BY-4.0)**, an irrevocable license WotC cannot rewrite [1][7][8].

### 2024: the core rules revision ("D&D 2024", not "6e")

- Announced September 2021 as "One D&D" for the 50th anniversary, the revision shipped the new
  _Player's Handbook_ (Sept 2024), _Dungeon Master's Guide_ (Nov 2024) and _Monster Manual_
  (Feb 2025). WotC positioned it as a "backward compatible evolution" of 5e, not a sixth edition:
  2014 adventures and supplements are meant to work with the 2024 rules. The community called it
  "5.5e"; by March 2026 WotC and D&D Beyond had adopted that shorthand themselves [1][2][9].

### 2025–2026: the current state

- **SRD 5.2 / 5.2.1.** The 2024 rules' SRD was released under CC-BY-4.0 on 22 April 2025;
  **SRD 5.2.1 (1 May 2025)** added 15 accidentally omitted magic items and corrections. SRD 5.1
  (2014 rules) and 5.2.1 (2024 rules) coexist and creators may mix them. Future errata will bump
  the version number, always under CC-BY-4.0 [10][11]. This is the legal basis for the app's
  public `src/data`: SRD content only, attribution required, everything else in the private pack.
- **Sigil.** WotC's 3D virtual tabletop (VTT — software that draws the map and tokens for online
  play) launched 27 Feb 2025; on 19 March 2025 ~90% of its ~30-person team was laid off; on 24 Oct
  2025 WotC announced development had ended permanently; servers close **31 October 2026**. Its
  2D sibling, **D&D Beyond Maps**, continues (free tier since 2025; 2026 roadmap: DM Scene Prep,
  a refreshed Encounter Builder usable outside the VTT, shared 3D dice; "Master Tier"
  subscription gates homebrew tokens and 10 GB storage) [12][13][14].
- **People and layoffs.** Hasbro cut ~20% of its workforce in Dec 2023, "fewer than 100" more in
  Oct 2024 (including D&D's creator-relations manager) and 3% in mid-2025. In 2025 Chris Perkins
  (28 years at WotC) and Jeremy Crawford (5e's lead rules designer) left and joined Critical
  Role's Darrington Press as creative and game directors [15][16][17].
- **Hasbro strategy.** The February 2025 "Playing to Win" plan names D&D one of three anchor
  franchises, prioritises "Aging Up" (13+), "Digital & Direct" and licensing (_Baldur's Gate 3_
  is the model), with five D&D video games in development. Hasbro's Wizards + Digital Gaming
  segment set records in 2025 [18][19].
- **2026 roadmap.** Announced at GAMA Expo (3 March 2026): releases grouped in _Seasons_ —
  Season of Horror (Apr–Jun, _Ravenloft: The Horrors Within_), Season of Magic (Jul–Sep, _Arcana
  Unleashed_ + _Deadfall_), Season of Champions (Oct–Dec). At Gen Con (30 July 2026) WotC
  launched **D&D Universes Beyond** (licensed crossovers, mirroring Magic): _D&D: World of
  Warcraft_ with Blizzard, 17 Nov 2026, and a _Star Wars_ "Season of Rebellion" in 2027, plus
  licensed partners extending Ravenloft, Eberron and the Forgotten Realms [20][21][22].

### The OSR and the competitors — why they matter as pattern sources

- **OSR (Old School Renaissance/Revival).** A movement, dated from OSRIC (2006), that reprints
  and re-imagines pre-2000 D&D under open licenses. Its mantra "rulings, not rules" (Matthew
  Finch's _Quick Primer for Old School Gaming_) means sparse rules and a referee who adjudicates
  from fiction; combat is deadly, player skill beats character skill, exploration and resource
  tracking are the game [23][24].
- **Shadowdark** (Kelsey Dionne, 2023; $1.4M Kickstarter; swept the 2024 ENnies incl. Best Game
  and Product of the Year): 5e's core math with OSR deadliness, real-time torch timers and a
  one-page-per-class layout. Pattern source: extreme UI simplicity of the sheet and stat block [25].
- **Pathfinder 2e** (Paizo, 2019; "Remaster" 2023 on the ORC license, alignment removed): the
  three-action economy (three uniform actions per turn + one reaction) and the crunchiest
  character builder. Pattern source: tightly typed conditions and automation-friendly rules —
  Foundry's PF2e module is the benchmark for full automation [26].
- **Daggerheart** (Darrington Press/Critical Role, 2025): two d12 "Duality Dice" (Hope and Fear)
  that resolve the action _and_ generate a resource for player or GM; narrative-first, cards for
  abilities. Pattern source: card-shaped ability UI and lightweight GM resource tracking [27].
- **Draw Steel** (MCDM/Matt Colville, PDF 31 July 2025): grid-first tactical heroics with no
  attack rolls (every power hits, a 2d10 "power roll" sets the tier), heroes grow stronger the
  longer they fight. Pattern source: combat automation and initiative design [28].
- **Tales of the Valiant** (Kobold Press, 2024, "Black Flag" engine, CC-licensed BFRD): a
  5e-compatible fork born from the OGL crisis. Pattern source: how a 5e clone restructures
  lineage/heritage and "Luck" [29].

**What this means for the app**

- Licensing is not a technicality: the CC-BY-4.0 SRD 5.2.1 is why a zero-cost companion app can
  exist at all; the interviewer will expect the owner to explain the SRD/private-pack partition.
- "2024 rules" is the current baseline; "backward compatible" means the app must tolerate 2014
  content (subclasses, monsters, adventures) at the same table.
- Sigil's failure and Maps' survival are the market lesson: 3D spectacle lost to practical 2D
  tooling and the character sheet. The app competes on the DDB gaps (table automation, party
  loot, DM tools), not on graphics.
- The competitors are the pattern library: PF2e/Foundry for automation, Shadowdark for sheet
  simplicity, Draw Steel for combat flow, Daggerheart for resource UI.

---

## 2. How the game is actually played

### The campaign and the session

- **Group size and length.** The design assumption is 4–5 PCs plus a DM. Sly Flourish's 2022
  poll (4,400 self-selected respondents): 4 players 39%, 5 players 28%, fewer than 4 18%, 6 11%,
  7+ 4%. Sessions: "around 4 hours" 47%, 2–3 hours 42% (2021, n=2,152); a 2026 measurement of
  recorded sessions found a median of 3.05 h with 90% under 4 h [30][31].
- **In person vs online.** 2023 poll: primarily in person 46%, primarily online 41%, both 13%;
  the 2022 poll during the pandemic tail was 63% online. Online play uses a VTT (Roll20, Foundry,
  Owlbear Rodeo, DDB Maps) plus voice; in-person play uses paper or DDB sheets, physical dice,
  and often a printed map or TV screen [30].
- **Campaign anatomy.** A _campaign_ is a series of linked sessions with the same characters,
  typically from level 1–3 to somewhere in the teens; most campaigns end early, and 20th level
  is rare. Campaigns run on a _home-brewed_ world (59% in 2024, n=4,046) or a published setting
  (the Forgotten Realms is the default one, 38% in 2023), using either a _published adventure_
  ("module", e.g. _Curse of Strahd_) or the DM's own material (15% pre-written campaigns) [30].
- **Session zero.** A meeting before play to agree tone, content limits, house rules, character
  concepts and the "social contract" (players follow the hooks, DM shares the spotlight). It was
  a community practice that the 2024 DMG codified in chapter 1 (Table Dynamics) and chapter 3
  (session-zero guidelines and _safety tools_ such as the X-card and lines/veils) [32].
- **A typical session.** _Recap_ of the previous session → play across the **three pillars**:
  _exploration_ (travel, dungeons, traps, searching), _social interaction_ (talking to
  _non-player characters_ — NPCs, everyone the DM plays) and _combat_ → treasure/XP → cliffhanger.
  Rests punctuate it: a **short rest** (1 hour; spend _Hit Point Dice_ to heal, some features
  recharge) and a **long rest** (8 hours; all HP, all Hit Dice, one level of exhaustion
  recovered, spell slots and most features reset) [33].
- **Downtime and level-up.** Between adventures characters _craft_ (2024 PHB: tool proficiency,
  raw materials = half price, 8-hour workdays = price/10), research, train, run a _Bastion_ (a
  stronghold, from level 5, acting every 7 in-game days). _Levelling up_ adds HP, a proficiency
  bonus step, class features, spell slots and sometimes an Ability Score Improvement or feat
  [34][35].

### The combat round

Combat is turn-based and abstract; a _round_ is about six seconds of fiction in which everyone
acts once [33].

1. **Initiative.** Everyone rolls d20 + Dexterity modifier; turns go in descending order for the
   whole fight. **Surprise** (2024) no longer skips a turn: a surprised creature has
   _disadvantage_ on its initiative roll [33].
2. **A turn** = **movement** (up to Speed, usually 30 ft, splittable), one **action** (Attack,
   Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Utilize, etc.), at most one
   **bonus action** (only if some feature grants one, e.g. an off-hand attack or a healing potion
   in 2024) and _free_ interactions (draw a weapon, open a door). Between turns each creature
   has one **reaction** per round, spent on a trigger: the **opportunity attack** when an enemy
   leaves your reach, or spells like _shield_ [33].
3. **Attack roll.** d20 + ability modifier + proficiency bonus vs the target's **Armor Class
   (AC)**; equal or higher hits. A natural 20 is a **critical hit** (roll the damage dice twice);
   a natural 1 always misses. Damage subtracts **Hit Points (HP)**; at 0 HP monsters die and PCs
   fall unconscious.
4. **Saving throws.** The defender rolls d20 + save modifier against the attacker's **Difficulty
   Class (DC)**, e.g. spell save DC = 8 + proficiency bonus + spellcasting modifier; most spells
   and traps use saves instead of attack rolls. Ability checks, attack rolls and saving throws
   are collectively **D20 Tests** in 2024 vocabulary [33].
5. **Advantage/disadvantage.** Roll two d20s and take the higher (advantage) or lower
   (disadvantage). They never stack and cancel each other out; 5e replaced most situational
   +2/−2 modifiers with this single mechanism [33].
6. **Conditions.** Named status effects with fixed rules text (Blinded, Charmed, Frightened,
   Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained,
   Stunned, Unconscious, plus the six-level Exhaustion). The 2024 rules made grapple and shove
   saving throws (DC 8 + Str mod + proficiency) instead of contested checks [33][36].
7. **Concentration.** Many spells persist only while the caster concentrates; taking damage
   forces a Constitution save (DC 10 or half the damage, whichever is higher, max 30); casting
   another concentration spell or becoming Incapacitated ends it [33].
8. **Death saves.** A PC at 0 HP rolls a bare d20 at the start of each turn: 10+ is a success,
   9− a failure; three successes stabilise, three failures kill; a natural 1 counts as two
   failures, a natural 20 restores 1 HP; any damage at 0 HP is a failure (two if a critical),
   and any healing ends the sequence [33].

### The DM's job

- **Prep.** Sly Flourish's _Return of the Lazy Dungeon Master_ — the most widely copied prep
  method — has eight steps: review the characters, create a strong start, outline potential
  scenes, define secrets and clues, develop fantastic locations, outline important NPCs, choose
  relevant monsters, select magic item rewards. Polls: about one hour of prep per session is
  the mode (33%), 30 minutes or less 10% [37][30].
- **Adjudication.** The core loop (the Angry GM's formulation): learn the player's _intent_ and
  _approach_, decide whether the action can succeed, fail and carry a cost, call for a roll only
  when there is uncertainty and a consequence, then narrate the outcome [38]. "Rulings, not
  rules" — the OSR phrase that 5e adopted — means the DM decides in seconds and stays
  consistent rather than searching the book; Matt Colville's _Running the Game_ series is the
  standard onboarding for new DMs and defends this stance [39][24].
- **Situations, not plots.** The Alexandrian's "Don't Prep Plots" argues a DM should prepare
  _situations_ (NPCs with goals, locations, resources) rather than a sequence "A then B then C",
  because a scripted sequence forces _railroading_ (pushing players back onto the intended path)
  whenever they deviate; node-based design and the "Three Clue Rule" (every conclusion needs at
  least three clues) are its practical tools [40][41].
- **Fudging dice.** Secretly altering a roll or a monster's HP to shape the story. Divisive:
  92% of DMs in a 2021 poll admitted changing monster HP mid-fight; Colville defends occasional
  fudging; many DMs and the OSR consider it a betrayal of the dice. Note this is a _DM_
  behaviour — players fudging is cheating [30][39].
- **Pacing.** The DM cuts scenes, calls for initiative, skips the dull travel, and ends on a hook;
  a common rule of thumb is "prep less, react more" and keep combat rounds moving.

### Theatre of the mind vs grid

_Theatre of the mind_ resolves combat in narration only; a _grid_ maps 5-ft squares with
miniatures or tokens; an _abstract map_ sketches zones. 2024 poll (n=2,800): 5-ft grid 78%,
theatre of the mind 14%, abstract 8% — up from 56% grid in 2018. Grid gives shared
understanding and tactical play but slows fights; theatre of the mind is faster and freer but
invites disputes [30][42].

**What this means for the app**

- The unit of work is the _session_: recap, three pillars, rests, level-up. The hotbar and
  automatic resolution serve combat; exploration and social play need the sheet, the log and
  notes, not automation.
- Every automated step above (initiative, attack vs AC, saves, advantage, conditions,
  concentration, death saves) is a place the DM expects to override; correction and undo are
  first-class, and "fudging" must be possible without lying to the log.
- Grid play is the majority, but a large minority runs without a map: combat must work with
  the map absent.
- Assume 4–6 people, 3–4 hours, one DM doing most of the work, and a mix of in-person and
  online tables; the DM prep tools should fit in an hour.

---

## 3. The rules as a system, from a software point of view

### The core mechanic

Everything reduces to **d20 + modifiers ≥ target**. The modifier is an _ability modifier_
(derived from six ability scores: Strength, Dexterity, Constitution, Intelligence, Wisdom,
Charisma; modifier = floor((score − 10)/2)) plus, when proficient, a _proficiency bonus_ that
scales only with total character level (+2 at levels 1–4, +3 at 5–8, +4 at 9–12, +5 at 13–16,
+6 at 17–20). The target is an AC (attack rolls) or a DC (checks and saves). Advantage and
disadvantage are the only common situational modifiers. This "bounded accuracy" keeps numbers
small and is why a d20 companion app can compute nearly every derived value from a few inputs
[11][33].

### The character sheet as derived state

Inputs: species, background, class(es) with levels and subclass, ability scores, chosen
proficiencies, feats, equipment, spells known/prepared, HP current/max/temporary, Hit Dice,
conditions, exhaustion level, inspiration, and per-feature resource counters. Derived: ability
modifiers, proficiency bonus, saving throw and skill bonuses, passive Perception (10 + Wisdom
(Perception) bonus), initiative (Dex mod), AC (armour formula or class feature, never
stacking), attack and damage bonuses per weapon, spell save DC and spell attack bonus,
spell slots by class level (with the multiclass slot table), carrying capacity (15 × Strength),
Speed after conditions. Everything that is not an input must be recomputed, never stored —
the same principle as the app's `evaluateGrants` seam [11].

### How features are granted

A character is a stack of _sources_ that each grant _features_:

- **Species** (2024 term for _race_): size, speed, senses (e.g. Darkvision), innate traits. No
  ability scores since 2024 [36].
- **Background**: +2/+1 or three +1 ability score increases, an _Origin feat_ at level 1, two
  skill proficiencies, one tool proficiency [36].
- **Class** (12: Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue,
  Sorcerer, Warlock, Wizard): Hit Die size, saving throw and armour/weapon proficiencies, a
  feature table by level, spellcasting for casters; every class picks a **subclass** at level 3
  in 2024 (e.g. Champion Fighter, Evoker Wizard). _Multiclassing_ stacks classes level by level.
- **Feats**: four categories in 2024 — Origin (level 1), General (level 4+, each includes a +1
  ability score), Fighting Style, Epic Boon (level 19+). Taken in place of an Ability Score
  Improvement at class levels 4, 8, 12, 16, 19 (Fighters and Rogues get extras) [36].
- **Items**: weapons (with properties and a 2024 _mastery_ property), armour, magic items;
  attunement-bearing items grant features only while attuned.

### Spells and spell slots

A _spell_ has level 0–9, school, casting time (action, bonus action, reaction, minutes),
range, components (Verbal, Somatic, Material), duration, concentration flag, ritual flag and an
effect (attack roll, save, or automatic). Level-0 spells are **cantrips**, castable at will and
scaling with character level. Levelled spells consume a **spell slot** of that level or higher
(_upcasting_); slots come from a per-class table and reset on a long rest (Warlock _Pact Magic_
slots reset on a short rest). _Prepared_ casters (2024: all of them) choose a daily list;
_rituals_ can be cast without a slot at +10 minutes. Spell save DC and attack bonus derive from
the class's spellcasting ability [11][33].

### Items and attunement

Magic items have rarity (Common → Legendary, Artifact), sometimes charges that recharge at
dawn, and sometimes require **attunement**: a short rest spent bonding, maximum **three**
attuned items per creature, ended by 24 hours apart or death. Coins, gear and consumables
(potions, scrolls) live in an inventory with weight; the 2024 PHB removed the variant
encumbrance rule from the core (only the 15 × Str capacity remains) [33][43].

### Monsters and stat blocks

A _stat block_ is a monster's fixed record: size, type, alignment, AC, HP (average and dice),
Speed, six ability scores with save and skill bonuses, resistances/immunities, senses,
languages, **Challenge Rating (CR)** with an XP value, proficiency bonus, traits, actions,
bonus actions, reactions, and for bosses _legendary actions_ and _lair actions_. 2024 stat
blocks give ability modifiers and saves in one table, fold spellcasting into actions and use
the same condition vocabulary as PCs [11][36].

### Encounter building

The 2024 DMG replaced 2014's Easy/Medium/Hard/Deadly plus a multiplier table with a single
**XP budget per character** table with three tiers (Low, Moderate, High) — e.g. level 1: 50/75/
100; level 5: 500/750/1,100; level 10: 1,600/2,300/3,100; level 20: 6,400/13,200/22,000 —
multiplied by party size and "spent" on monsters' XP values with no multiplier; guidance
caps creature count at about two per character for fragile parties [44][45]. Sly Flourish's
_Lazy Encounter Benchmark_ (an encounter is deadly if monster CR total exceeds ¼ of the sum of
character levels, ½ at level 5+) is the popular shortcut [46]. Adventure design also thinks in
_adventuring days_ — several encounters between long rests — because a party that long-rests
after every fight breaks the game's resource balance.

### Conditions, durations and resource resets

Conditions are boolean flags with rules text; several (Paralyzed, Petrified, Stunned,
Unconscious) _include_ Incapacitated; Exhaustion is a counter 1–6 (2024: −2 to every D20 Test
and −5 ft Speed per level, death at 6). Durations are "until the end of your next turn",
"1 minute" (10 rounds), "concentration, up to N", "until removed", or "until a save succeeds at
end of turn" — all reducible to initiative-indexed timers. Resources reset on one of:
short rest, long rest, dawn, a fixed number per day, or "1/turn" [33][36].

### What changed in 2024 and how 2014 content coexists

| Area           | 2014                                                        | 2024                                                                                                                             |
| -------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Race/species   | _Race_ with fixed ability score increases                   | _Species_, physical/magical traits only; Half-Elf and Half-Orc dropped, Orc, Goliath, Aasimar added [36]                         |
| Background     | Story flavour + two skills                                  | Ability score increases, Origin feat, skills, tool [36]                                                                          |
| Feats          | Optional, no ability bonus                                  | Everyone gets an Origin feat; General feats include +1 [36]                                                                      |
| Weapons        | Properties only                                             | **Weapon Mastery**: Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex; usable by Barbarian, Fighter, Paladin, Ranger, Rogue [47] |
| Exhaustion     | Six escalating effects                                      | Six levels of −2 to D20 Tests / −5 ft Speed [33]                                                                                 |
| Surprise       | A skipped first turn                                        | Disadvantage on initiative [33]                                                                                                  |
| Grapple/shove  | Contested checks                                            | Save vs DC 8 + Str mod + prof, via Unarmed Strike [36]                                                                           |
| Healing potion | Action                                                      | Bonus action (the most popular house rule became a rule) [36]                                                                    |
| Subclass       | Level 1–3 by class                                          | Level 3 for every class                                                                                                          |
| Crafting       | Downtime tables in DMG                                      | PHB rules (tool + half cost + workdays) [34]                                                                                     |
| Bastions       | —                                                           | DMG stronghold system from level 5 [35]                                                                                          |
| Encounters     | 4 tiers + multipliers                                       | 3 tiers, no multipliers [44]                                                                                                     |
| Optional rules | Flanking, gritty rests, encumbrance, injuries, spell points | Removed from the DMG; remain legal as legacy content [43]                                                                        |

Coexistence: WotC's stance is backward compatibility — 2014 subclasses, spells, monsters and
adventures are playable with the 2024 core, and DDB lets a character mix "legacy" and 2024
content. Organised play grants a 60-day window to convert characters after each new core book
[9][48]. In practice tables run 2024 core + 2014 supplements, so an engine needs a
_rules version_ on every content entity and must accept both.

**What this means for the app**

- Model rules as typed data, not prose: sources grant features; conditions, durations and
  resources are enumerations with reset triggers; everything derived is recomputed.
- Every content entity carries an edition tag (2014/2024) and the engine tolerates both at
  one table; "legacy" is a first-class state, not an error.
- The encounter builder should implement the 2024 XP-budget table and can offer the Lazy
  Benchmark as a fast path; the adventuring-day concept explains why rests are gated.
- The interviewer's likely trap questions: "what happens to a 2014 Half-Elf?", "how do you
  handle attunement limits?", "do you automate concentration checks?" — all have exact answers
  in the SRD.

---

## 4. Table cultures and styles a product must support

- **Rules-as-written (RAW) vs rulings.** Some tables (organised play, competitive optimisers)
  want the book's exact text; most run rulings-first. The Angry GM and Colville both note
  that consistency matters more than fidelity; automation must therefore be overridable
  without a fight [38][39].
- **Grim vs heroic.** _Grimdark/gritty_ play (OSR, Shadowdark, low magic, slow healing,
  permanent injuries) vs _heroic_ play (the 5e default: PCs rarely die, death saves, easy
  healing). The removed "gritty realism" rest variant and the 2024 DMG's "defeated, not dead"
  option mark the two ends [43].
- **Sandbox vs linear.** _Sandbox_: the world is prepared, players choose what to pursue
  (hexcrawls, West Marches). _Linear/plotted_: a story with an intended sequence, at worst a
  _railroad_. Published adventures skew linear; The Alexandrian's node-based design is the
  middle ground [40][41].
- **West Marches.** A large-pool campaign (from Ben Robbins's 2007 essay): no fixed group, no
  fixed schedule, players organise each expedition, every session starts and ends in the home
  base, multiple DMs share one world. Needs shared logs, a persistent map and per-character
  continuity across parties [49].
- **One-shots.** Single-session adventures with pre-generated characters — conventions, trial
  games, holidays. Need instant character import and a two-to-four-hour scope.
- **Adventurers League (AL).** WotC's official _organised play_: episodic 2–4 hour adventures
  at stores and conventions, a legal-content list, characters portable between tables with
  logged progress and loot, characters start at level 1 with the standard array
  (15, 14, 13, 12, 10, 8), and 2024 rules mandatory 60 days after each core book [48][50].
  Needs strict legality checks and an exportable log.
- **Homebrew-heavy tables.** Home-made species, subclasses, items and monsters are pervasive:
  70% of DMs allow non-WotC options "sometimes" or "often" (2024 poll); DDB's homebrew tools
  and its "Unrolled" data show hundreds of thousands of characters per species [30][51].
- **Published vs home campaigns.** Home worlds dominate (59% homebrew world; only 15% run a
  pre-written campaign); published adventures still need importable encounters and NPCs [30].
- **High customisation vs quick play.** Optimisers ("min-maxers") want every option and exact
  math; casual players want a pregen and a big "attack" button. Both exist at the same table.
- **The beginner-DM problem.** About one player in six also DMs; a healthy table ratio needs
  one in four or five; DM-seeking posts on r/lfg get almost no replies while DMs offering games
  get dozens of applications. DMing takes disproportionate effort and burns out; the 2024 DMG
  was rewritten to onboard beginners (session zero, safety tools, lazy prep) [52][32].

**What this means for the app**

- Support the three automation levels (full auto / propose-and-confirm / log only) as a
  campaign policy — that is the RAW-vs-rulings spectrum encoded (ADR-0011 in the repo).
- Provide the DM's tools that reduce prep and improvisation load (lazy-prep template, encounter
  builder, monster search), since the DM shortage is the adoption bottleneck.
- Homebrew and legacy content are normal, not edge cases: every content type must be
  user-authorable and versioned.
- One-shots and AL need fast import/export; West Marches needs shared, persistent logs.

---

## 5. Common house rules and popular optional rules

A _house rule_ is a table's standing change to the printed rules; an _optional/variant rule_
is one the books themselves offer. Adoption data is thin: the best sources are Sly Flourish's
self-selected social-media polls (thousands of respondents, DM-heavy audience) and community
lists (DM David's "9 most popular", EN World's threads, Dungeon Dudes' videos) [30][53][54].

| Rule                                          | What it does                                                                                    | Status / how common                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Milestone levelling                           | DM levels the party at story beats instead of tracking XP                                       | 66% milestone vs 21% XP (2020, n=6,009); "DM decides" 69%, XP 15%, DMG milestones 14% (2022, n=6,008). Effectively the default [30] |
| Potions as a bonus action                     | Drink a healing potion for a bonus action                                                       | Universal favourite; became the 2024 rule [36][53]                                                                                  |
| Flanking                                      | Advantage (2014 DMG) or +2 (older editions) when enemies are on opposite sides                  | 45% use it (2020, n=1,194); removed from the 2024 DMG [30][43]                                                                      |
| Critical hits: max + roll                     | Maximise the first damage dice, roll the second set                                             | Very common; DM David's #4 [53][54]                                                                                                 |
| Critical hit / fumble tables                  | Extra effects on natural 20/1 (injuries, broken weapons)                                        | Popular but divisive; injuries dropped from the 2024 DMG [43][54]                                                                   |
| Free feat at level 1                          | Every character starts with a feat                                                              | Common; became the 2024 Origin feat [36][53]                                                                                        |
| Inspiration variants                          | Spend for a reroll; award for good play; "heroic inspiration" on a natural 1 (2024 Human trait) | DM David's #1; 2024 renamed it _Heroic Inspiration_ and made it a reroll [33][53]                                                   |
| Secret death saves                            | Player or DM rolls death saves hidden                                                           | DM David's #2 and #3 [53]                                                                                                           |
| Delay turn                                    | Allow moving down the initiative order                                                          | DM David's #8 [53]                                                                                                                  |
| Exhaustion on failed death save / on 0 HP     | Discourages "yo-yo" healing                                                                     | DM David's #9; "healing threshold" variants [53][54]                                                                                |
| Gritty realism                                | Short rest = 8 h, long rest = 7 days                                                            | 2014 DMG variant, dropped in 2024; used by low-magic tables [43]                                                                    |
| Variant encumbrance                           | Speed penalties by weight thresholds                                                            | 2014 DMG variant, dropped in 2024 [43]                                                                                              |
| Rolled vs average HP; roll twice              | Alternative HP on level-up                                                                      | Common [54]                                                                                                                         |
| Changing monster HP mid-fight                 | DM fudges HP for pacing                                                                         | 92% yes (2021, n=1,321) [30]                                                                                                        |
| Attunement limit = proficiency bonus          | Raises the 3-item cap                                                                           | Seen on EN World lists [54]                                                                                                         |
| Spell points, lingering injuries, hero points | 2014 DMG variants                                                                               | Niche; not in the 2024 DMG [43]                                                                                                     |

**What this means for the app**

- The three or four highest-adoption deviations (milestone, bonus-action potions, flanking,
  max-crit) should be first-class campaign toggles, not homebrew; the rest can be free-text
  house rules the DM records in session zero.
- The rules engine must expose a policy layer for exactly the seams these rules touch:
  levelling trigger, action economy of consumables, advantage sources, crit damage formula,
  rest duration, encumbrance mode.
- Because 2024 absorbed several house rules and deleted the DMG variants, the edition tag on
  a rule matters: "flanking" is a 2014 optional rule, not a 2024 one.

---

## 6. Glossary (~60 terms)

- **Ability score / modifier** — six stats 1–20 (Str, Dex, Con, Int, Wis, Cha); modifier =
  floor((score − 10)/2), the number actually added to rolls.
- **Action / Bonus action / Reaction** — the three budgets of a turn: one action, at most one
  bonus action (only if granted), one reaction per round on a trigger.
- **Advantage / Disadvantage** — roll 2d20, keep higher/lower; never stacks; cancels.
- **Adventurers League (AL)** — WotC's official organised play with portable characters.
- **Adventuring day** — the encounters between two long rests that the balance assumes.
- **Armor Class (AC)** — the target number an attack roll must reach.
- **Attunement** — bonding with a magic item over a short rest; max three per creature.
- **Bastion** — the 2024 DMG stronghold a character runs from level 5.
- **Bounded accuracy** — 5e's design of small, slowly growing modifiers.
- **Cantrip** — a level-0 spell cast at will.
- **Challenge Rating (CR)** — a monster's difficulty rating, mapped to an XP value.
- **Character sheet** — the record of a PC; DDB's is the reference implementation.
- **Concentration** — a caster holds one such spell at a time; damage forces a Con save.
- **Condition** — a named status with fixed rules (Prone, Stunned, …).
- **Critical hit** — natural 20 on an attack; roll damage dice twice.
- **d20 / D20 Test** — the twenty-sided die; the 2024 umbrella for checks, attacks, saves.
- **Death saving throw** — the 0-HP bare d20: three successes stabilise, three failures kill.
- **Difficulty Class (DC)** — the target for a check or save.
- **Downtime** — in-world time between adventures for crafting, research, training.
- **Dungeon Master (DM) / Game Master (GM)** — the referee and narrator; GM is the generic term.
- **Encounter** — one scene of conflict (combat, social, exploration) with a budget.
- **Exhaustion** — six cumulative levels; 2024: −2 per level to D20 Tests, death at 6.
- **Experience points (XP)** — points from encounters that trigger level-ups by table.
- **Feat** — a chosen special ability (Origin, General, Fighting Style, Epic Boon).
- **Fudging** — the DM secretly altering a roll or HP.
- **Grid / battle map** — 5-ft squares with tokens; vs _theatre of the mind_ (narration only).
- **Heroic Inspiration** (2024; _Inspiration_ in 2014) — a token to reroll any die.
- **Hit Points (HP) / Temporary HP** — damage capacity; temporary HP is a buffer that does not stack.
- **Hit Point Dice (Hit Dice)** — per-level dice spent to heal on a short rest.
- **Homebrew** — user-made content or worlds; also "homebrew campaign".
- **Initiative** — d20 + Dex that orders turns; 2024 initiative score = 10 + Dex mod.
- **Legacy content** — 2014-rules material used alongside 2024 rules.
- **Legendary / lair actions** — extra boss actions between turns and on initiative 20.
- **Level / tier** — 1–20; tiers 1–4 (1–4, 5–10, 11–16, 17–20) set the scope of play.
- **Long rest / Short rest** — 8 h (full reset) / 1 h (Hit Dice, some features).
- **Meta-gaming** — a player using knowledge the character lacks.
- **Milestone** — levelling at story beats instead of XP.
- **Module / adventure** — a published scenario.
- **Multiclassing** — taking levels in more than one class.
- **NPC** — any character the DM plays.
- **OGL / SRD / CC-BY-4.0** — the 2000 open license; the reference documents (5.1 = 2014, 5.2.1 =
  2024); the Creative Commons license they now carry.
- **One-shot** — a single-session adventure.
- **Opportunity attack** — a reaction attack when an enemy leaves your reach.
- **OSR** — Old School Renaissance; rulings-first, deadly, exploration-driven play.
- **Passive check** — 10 + bonus, used without rolling (passive Perception).
- **Pillars** — exploration, social interaction, combat.
- **Player character (PC) / party** — a player's character / the group of PCs.
- **Proficiency bonus** — +2 to +6 by level, added when proficient.
- **Railroading / Sandbox** — forcing the plot's path / letting players choose their path.
- **Rest variants (gritty realism)** — longer rests for slower pacing (2014 DMG, dropped 2024).
- **Rulings, not rules** — the DM decides fast and consistently instead of consulting the book.
- **Saving throw** — the defender's d20 roll against an effect's DC.
- **Session / Session zero** — one sitting of play / the expectations meeting before the first.
- **Species** (2024; _race_ in 2014) — a character's ancestry and its traits.
- **Spell slot / upcasting / ritual** — the per-day resource for levelled spells; casting with a
  higher slot; casting a tagged spell slot-free in 10 extra minutes.
- **Stat block** — a monster's rules record.
- **Subclass** — the specialisation every class picks at level 3.
- **Surprise** — 2024: disadvantage on initiative for the unaware side.
- **TPK** — total party kill; every PC dies.
- **VTT** — virtual tabletop software (Roll20, Foundry, Owlbear Rodeo, DDB Maps).
- **Weapon Mastery** — 2024 per-weapon property (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex).
- **West Marches** — a player-driven, drop-in, shared-world campaign format.

**What this means for the app**

- The glossary is also the i18n contract: each term has an official EN name in the SRD and an
  official IT name in the Italian PHB; the app never invents a third.
- Terms that changed between 2014 and 2024 (race/species, Inspiration/Heroic Inspiration,
  surprise, exhaustion) should be spelled in the 2024 form with the 2014 alias searchable.
- The interviewer will use these words casually; the owner should be able to define AC, DC,
  CR, concentration, attunement and the rest cycle in one sentence each.

---

## Sources

1. Wikipedia, _Dungeons & Dragons_ — https://en.wikipedia.org/wiki/Dungeons_%26_Dragons
2. Wikipedia, _Editions of Dungeons & Dragons_ — https://en.wikipedia.org/wiki/Editions_of_Dungeons_%26_Dragons
3. CNBC, "How Critical Role helped spark a Dungeons & Dragons renaissance" (2020) — https://www.cnbc.com/2020/03/14/critical-role-helped-spark-a-dungeons-dragons-renaissance.html
4. CNBC, "Dungeons & Dragons had its biggest year ever as Covid forced the game… onto the web" (2021) — https://www.cnbc.com/2021/03/13/dungeons-dragons-had-its-biggest-year-despite-the-coronavirus.html
5. Wikipedia, _D&D Beyond_ — https://en.wikipedia.org/wiki/D%26D_Beyond
6. Hasbro newsroom, "D&D Celebrates 50th Anniversary in 2024 with More than 50 Million Fans" — https://newsroom.hasbro.com/news-releases/news-release-details/dungeons-dragons-celebrates-50th-anniversary-2024-more-50
7. EN World, "We All Won – The OGL Three Years Later" — https://www.enworld.org/threads/we-all-won-%E2%80%93-the-ogl-three-years-later.717946/
8. Designers & Dragons, "Is the OGL Era Over? (Two Years Later)" — https://www.designers-and-dragons.com/2025/03/10/is-the-ogl-era-over-two-years-later/
9. D&D Beyond, "Updates in the Dungeon Master's Guide (2024)" — https://www.dndbeyond.com/posts/1916-updates-in-the-dungeon-masters-guide-2024
10. D&D Beyond, "You Can Now Publish Your Own Creations Using the New Core Rules" — https://www.dndbeyond.com/posts/1949-you-can-now-publish-your-own-creations-using-the
11. D&D Beyond, SRD v5.2.1 — https://www.dndbeyond.com/srd ; Roll20 SRD 5.2 FAQ — https://pages.roll20.net/dnd-srd
12. EN World, "'Project Sigil' 3D Virtual Tabletop Finally Laid To Rest" — https://www.enworld.org/threads/project-sigil-3d-virtual-tabletop-finally-laid-to-rest.715907/
13. TechRaptor, "Wizards of the Coast Closes Doors on Sigil" — https://techraptor.net/tabletop/news/wizards-of-coast-closes-doors-on-sigil-dd-beyond-vtt
14. D&D Beyond, "Mid-Year Update: D&D Beyond's 2026 Development Roadmap" — https://www.dndbeyond.com/posts/2223-mid-year-update-d-d-beyonds-2026-development
15. EN World, "Hasbro Hit With Layoffs, Wizards of the Coast Impacted" (Oct 2024) — https://www.enworld.org/threads/hasbro-hit-with-layoffs-wizards-of-the-coast-impacted.707539/
16. PC Gamer, "D&D's Jeremy Crawford and Chris Perkins… change teams to Critical Role's Darrington Press" — https://www.pcgamer.com/gaming-industry/d-and-ds-jeremy-crawford-and-chris-perkins-un-retire-change-teams-to-critical-roles-darrington-press-after-a-combined-46-years-at-wizards-of-the-coast-leaving-jaws-dropped/
17. StartPlaying, "Perkins & Crawford Head To Darrington Press, Hasbro Layoffs…" (June 2025) — https://startplaying.games/blog/posts/perkins-crawford-head-o-darrington-press-hasbro-layoffs-tariffs-leaked-dnd-video-game-footage
18. Hasbro, "Hasbro Unveils New Strategy – Playing to Win" (20 Feb 2025) — https://newsroom.hasbro.com/news-releases/news-release-details/hasbro-unveils-new-strategy-playing-win
19. Hasbro FY2025 Form 10-K — https://www.sec.gov/Archives/edgar/data/46080/000004608026000011/has-20251228.htm
20. ICv2, "GAMA Expo 2026 News: Wizards of the Coast Unveils 'D&D' Roadmap" — https://icv2.com/articles/news/view/61769/gama-expo-2026-news-wizards-coast-unveils-d-d-roadmap
21. Game Informer, "Everything D&D Announced At Gen Con" (30 Jul 2026) — https://gameinformer.com/2026/07/30/everything-dd-announced-at-gen-con-including-a-huge-world-of-warcraft-collab-star-wars
22. Dungeons & Dragons Fanatics, "D&D Universes Beyond Has Officially Been Confirmed" — https://dungeonsanddragonsfan.com/dnd-universes-beyond/
23. osrwiki, _Old School Renaissance_ — https://osrwiki.org/wiki/Old_School_Renaissance
24. Hipsters & Dragons, "Rulings, Not Rules: An OSR Mantra Relevant to 5e" — https://www.hipstersanddragons.com/rulings-not-rules/
25. Wikipedia, _Shadowdark_ — https://en.wikipedia.org/wiki/Shadowdark ; ENnie 2024 winners — https://www.enworld.org/threads/congratulations-to-the-2024-ennie-award-winners.705989/
26. Paizo, "New and Revised Licenses" (ORC) — https://paizo.com/blog/new-and-revised-licenses ; Gaming Trend PF2e Remaster review — https://gamingtrend.com/reviews/pathfinder-2e-remaster-player-core-review-youve-got-three-actions-what-are-you-going-to-do/
27. Wikipedia, _Daggerheart_ — https://en.wikipedia.org/wiki/Daggerheart ; Darrington Press, "Daggerheart: Hope & Fear Unveiled" — https://darringtonpress.com/daggerheart-hope-fear-unveiled/
28. Bell of Lost Souls, "MCDM's New Fantasy RPG Officially Launches… 'Draw Steel'" — https://www.belloflostsouls.net/2025/08/mcdms-new-fantasy-rpg-officially-launches-with-starter-adventure-draw-steel.html ; BackerKit project — https://www.backerkit.com/c/projects/mcdm-productions/mcdm-rpg
29. Kobold Press, _Black Flag Roleplaying_ — https://koboldpress.com/black-flag-roleplaying/ ; BFRD announcement — https://koboldpress.com/kobold-press-unveils-the-black-flag-reference-document-bfrd/
30. Sly Flourish, "D&D & RPG Surveys and Results" (all polls cited with n and date) — https://slyflourish.com/facebook_surveys.html
31. Threadfall, "How Long Is a D&D Session? Measured: the Median Is 3 Hours" — https://thread-fall.com/dnd-session-length ; Dice Dragons, "What Is the Ideal D&D Party Size?" — https://www.dicedragons.co.uk/blogs/tabletop-tips/what-is-the-ideal-dnd-party-size
32. Dungeons & Dragons Fanatics, "The 2024 Dungeon Master's Guide (Deep Dive)" — https://dungeonsanddragonsfan.com/new-dungeon-masters-guide/ ; "The D&D Session Zero Checklist" — https://dungeonsanddragonsfan.com/dnd-session-zero-checklist/
33. D&D Beyond, Free Rules (2024), _Rules Glossary_ — https://www.dndbeyond.com/sources/dnd/free-rules/rules-glossary
34. Roll20 Compendium, "Crafting Equipment" (2024 PHB) — https://roll20.net/compendium/dnd5e/Rules:Crafting%20Equipment?expansion=32231 ; D&D Beyond, "Let's Explore the Crafting Rules in the 2024 Player's Handbook" — https://www.dndbeyond.com/posts/1788-lets-explore-the-crafting-rules-in-the-2024
35. RPGBOT, "DnD 5.5 Bastions Guide" — https://rpgbot.net/2024-dnd/bastions/ ; The Alexandrian, "D&D 2024: The Bastion Bubble" — https://thealexandrian.net/wordpress/52045/roleplaying-games/dd-2024-the-bastion-bubble
36. dndtools.online, "D&D 5e vs 5.5e (2024) — Key Rules Changes" — https://dndtools.online/rules/2024-changes ; Dungeon Mister, "Important Rules Changes In D&D 2024" — https://dungeonmister.com/guides/important-rules-changes-in-dnd-2024/ ; Dungeon Mister, "Grappling In D&D 2024" — https://dungeonmister.com/guides/grappling-in-dnd-2024/
37. Sly Flourish, "The Eight Steps of the Lazy DM – 2023 Review" — https://slyflourish.com/eight_steps_2023.html
38. The Angry GM, "Adjudicate Actions Like a Motherf$&%ing Boss!" — https://theangrygm.com/adjudicate-actions-like-a-boss/
39. Bell of Lost Souls, "Matt Colville On 5th Edition's Rulings, Not Rules" — https://www.belloflostsouls.net/2021/09/dd-matt-colville-on-why-5th-edition-is-the-way-it-is.html ; Wikipedia, _Matt Colville_ — https://en.wikipedia.org/wiki/Matt_Colville
40. The Alexandrian, "Don't Prep Plots" — https://thealexandrian.net/wordpress/4147/roleplaying-games/dont-prep-plots
41. The Alexandrian, "Node-Based Scenario Design – Part 1" — https://thealexandrian.net/wordpress/7949/roleplaying-games/node-based-scenario-design-part-1-the-plotted-approach
42. Tribality, "Theatre of the Mind Vs Grid-based combat" — https://www.tribality.com/2019/02/12/theatre-of-the-mind-vs-grid-based-combat/ ; EN World poll "The Grid vs. Theater of the Mind vs. a Mix" — https://www.enworld.org/threads/the-grid-vs-theater-of-the-mind-vs-a-mix-a-poll-discussion.683660/
43. Wargamer, "DnD quietly axed a stack of optional rules from its DM's Guide" — https://www.wargamer.com/dnd/axed-optional-rules ; Michael Ghelfi Studios, "2024 Dungeon Master's Guide: What Changed" — https://www.michaelghelfistudios.com/2024-dungeon-masters-guide/
44. Roll20 Compendium, "Plan Encounters" (2024 DMG XP budget table) — https://roll20.net/compendium/dnd5e/Rules:Plan%20Encounters?expansion=33359
45. EN World, "New DMG Encounter Building Math vs 2014" — https://www.enworld.org/threads/new-dmg-encounter-building-math-vs-2014.707688/
46. Sly Flourish, "2024 DMG Versus the Lazy Encounter Benchmark" — https://slyflourish.com/2024_dmg_encounter_building_versus_the_lazy_benchmark.html
47. Roll20, "D&D 2024's New Weapon Mastery System" — https://pages.roll20.net/dnd/2024-weapon-mastery ; RPGBOT, "Weapon Mastery Guide" — https://rpgbot.net/2024-dnd/weapon-mastery/
48. D&D Beyond, "D&D Adventurers League Update for the 2024 Core Rules" — https://www.dndbeyond.com/posts/1819-d-d-adventurers-league-update-for-the-2024-core
49. Ben Robbins, ars ludi, "Grand Experiments: West Marches" — https://arsludi.lamemage.com/index.php/78/grand-experiments-west-marches/ ; westmarches.games guide — https://www.westmarches.games/guide/what-is-west-marches
50. D&D Beyond, "What Is Adventurers League?" — https://www.dndbeyond.com/posts/1676-what-is-adventurers-league ; Wikipedia, _D&D Adventurers League_ — https://en.wikipedia.org/wiki/D%26D_Adventurers_League
51. EN World, "D&D Beyond Releases 2023 Character Creation Data" — https://www.enworld.org/threads/d-d-beyond-releases-2023-character-creation-data.702275/ ; D&D Beyond Homebrew — https://www.dndbeyond.com/homebrew
52. StoryRoll, "The DM Shortage Is Real — And the Data Proves It" — https://storyroll.app/blog/dm-shortage-is-real ; EN World, "The DM Shortage" — https://www.enworld.org/threads/the-dm-shortage.693711/ ; Sly Flourish 2016 DM survey — https://slyflourish.com/2016_dm_survey_results.html
53. DM David, "Scrutinizing the 9 Most Popular House Rules for D&D" — https://dmdavid.com/tag/scrutinizing-the-9-most-popular-house-rules-for-dd/
54. EN World, "Common house rules for 5e" — https://www.enworld.org/threads/common-house-rules-for-5e.690698/ ; Dungeon Dudes, "Five Simple House Rules for Better Combat in D&D 5e" (video; PDF mirror) — https://www.scribd.com/document/452596434/Dungeon-Dudes-Five-Simple-House-Rules-for-Better-Combat-in-D-D-5e ; Gamers Decide, "Top 15 D&D Best House Rules" — https://www.gamersdecide.com/articles/dnd-best-house-rules
