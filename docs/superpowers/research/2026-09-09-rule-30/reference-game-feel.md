# Reference: what makes a browser tool FEEL like a game (without videogame graphics)

Evidence file for the d20 Folio "too cold, administrative" audit. Written 2026-09-09.
Scope: nine mechanisms, each with 3+ sources, short quotations (<15 words), a testable rule for our
screens, and a capture URL where a screenshot helps. No visual, colour, layout or typography judgements.

Source labels: [official] vendor docs/blog · [talk] recorded conference talk · [research] peer-reviewed
or NN/g · [wiki] community wiki · [press] reputable games/tech press · [forum] corroboration only ·
[unverified] not confirmed against a primary source.

Licensing guard: every line whose URL slug contains a lowercase product token also names the product in
full (e.g. "Baldur's Gate 3"). Method: WebSearch + WebFetch, 2026-09-09; blocked pages (403/402/bot
check) are noted and replaced by the search excerpt or a secondary source, labelled.

---

## 1. Narrative framing of steps

**Games**

- Baldur's Gate 3 — narrator Amelia Tyler: "17 completely different narration styles, depending on what's
  happening [and] which character you're playing" [press, 2023-10-14]
  https://www.thegamer.com/baldurs-gate-3-17-different-narrator-types-lines-change-amelia-tyler/ (Baldur's Gate 3).
  The narration "was designed to echo the choices the player was making": the same step is framed per
  identity. bg3.wiki lists the Narrator's contexts as descriptions, skill checks and dice rolls
  https://bg3.wiki/wiki/Narrator [wiki]; whether she voices character-creation steps is [unverified].
- Baldur's Gate 3 dice screen — bonuses land _after_ the d20, so a failing roll visibly becomes a success;
  this "captures the feeling of D&D ability checks" [press]
  https://gamingrespawn.com/features/54148/baldurs-gate-iiis-new-dice-rolling-interface-truly-captures-the-feeling-of-dd-ability-checks/ (Baldur's Gate 3);
  mechanics https://bg3.wiki/wiki/Dice_rolls [wiki]. "Roll a check" is narrated as die → modifiers →
  verdict, not printed as a total.
- Disco Elysium — the 24 skills "can speak directly to the player to influence their decisions"; the
  player "is communicating with a fragmented persona" [encyclopaedic] https://en.wikipedia.org/wiki/Disco_Elysium.
  A stat is a voice with a personality; Logic 4 is not a cell, it is someone who talks more.
- Hades — the Codex is written in-world by Achilles and unlocks as you meet things [wiki]
  https://hades.fandom.com/wiki/Codex ; dialogue is "advanced with each run through the game, thus making
  each attempt to escape meaningful" [encyclopaedic] https://en.wikipedia.org/wiki/Hades_(video_game).
  The enemy list is a diary with an author; the run counter is a conversation.
- Wildermyth — Nate Austin: the game "[alternates] layers of handcrafted and procedural content"; the
  ledger of what happened is rendered as comic panels [press/encyclopaedic]
  https://en.wikipedia.org/wiki/Wildermyth ; https://www.vice.com/en/article/pkbz78/wildermyth-review.
- Crusader Kings 3 — a character event is a scene: `title`, `desc`, `theme` (background, lighting,
  sound), portraits, and `option`s whose `name` is the button label [official modding wiki]
  https://ck3.paradoxwikis.com/Event_modding ; Paradox dev diary #30 describes the same anatomy
  [official; forum bot-checked on fetch]
  https://forum.paradoxplaza.com/forum/developer-diary/crusader-kings-3-dev-diary-30-event-scripting.1397140/.
  A state change is delivered as scene text + named choices, never as a toast.

**Tabletop tools that already do it**

- Roll20 Charactermancer (2018-06-05) — "will guide you step-by-step through the process of creating a
  character"; current step on the left, "a passage from the rulebook on the right" [official blog]
  https://bloghub.roll20.net/posts/meet-the-charactermancer-roll20s-new/ ; https://wiki.roll20.net/Charactermancer.
- D&D Beyond Quick Builder (2026-03-24, UX Design Manager) — "You shouldn't have to be an expert in the
  rules to build a character."; "Lead with iconic D&D art, not walls of text and rules details in tiny
  pop-ups."; "Provide easy default selections and let players decide how deeply to customize" [official]
  https://www.dndbeyond.com/posts/2135-behind-the-screen-the-new-quickbuilder-and-future. Caution: it was
  chosen as a test bed because it "doesn't see much use" — the shortcut path is not where feel is judged.
- Foundry VTT "Originate — Character Forge" (Origin Studios, V13, dnd5e 5.2+) — sells itself against the
  form: players should feel "they are stepping into your world rather than filling out a tax form";
  step wizard, per-Class/Race/Background art or video, built on Advancement data [official package page]
  https://foundryvtt.com/packages/originate ; https://www.patreon.com/posts/originate-is-for-148132142.
  Limits: no multiclass; creation only. (Our owner's complaint, verbatim, from the Foundry market.)

**Testable rule for our screens:** Every multi-step flow shows, beside the control, one sentence of
in-world framing naming the character and the consequence ("Kaelen learns _Shield_. It costs a
reaction.") — never only the field label. A step with no framing sentence fails.

**Capture:** https://foundryvtt.com/packages/originate · https://bloghub.roll20.net/posts/meet-the-charactermancer-roll20s-new/ ·
https://www.dndbeyond.com/posts/2135-behind-the-screen-the-new-quickbuilder-and-future.

---

## 2. Identity-first moments (name, portrait, voice — early)

- Baldur's Gate 3 telemetry (Larian, 2023-12-05, official X post via press): 94% made a custom character;
  8,196 years (~71.6 M hours) in character creation; 10% of characters took over an hour [press]
  https://www.dexerto.com/baldurs-gate/baldurs-gate-3-players-have-spent-over-8000-years-in-character-creation-2417523/ (Baldur's Gate 3).
  Launch-weekend split (Half-Elf, Paladin) https://gamerant.com/baldurs-gate-3-most-popular-classes-races/ (Baldur's Gate 3).
  Time in a creator is spent willingly when the creator is about _who you are_.
- Baldur's Gate 3 order — Origin → Race → Class → Background → Abilities → Skills → Appearance (name,
  one of eight voices, portrait) [wiki] https://bg3.wiki/wiki/Character_creation. Voice is a first-class
  identity choice made before play.
- Pokémon — "the Pokémon Professor asks the player to name their character or alternatively choose from a
  sample list"; the name is the game's first input [wiki] https://bulbapedia.bulbagarden.net/wiki/Player_character.
- Zelda — NPCs "refer to Link by the name the player has chosen for him, ostensibly to make the player
  feel more like he/she is the hero" [wiki] https://zelda-archive.fandom.com/wiki/Name_Registration.
- D&D Beyond portrait — click the builder portrait → MANAGE PORTRAIT → UPLOAD PORTRAIT; also from the sheet
  via "Change Sheet Appearance" [official]
  https://dndbeyond-support.wizards.com/hc/en-us/articles/7747225600532-How-to-Upload-Custom-Portraits.
  Available early, not _asked for_ early — an opportunity, not a ritual.
- D&D Beyond Quick Build copy: "Pick your species, class, and name, and you're done!" [official]
  https://www.dndbeyond.com/posts/1059-how-to-create-your-first-dungeons-dragons — name is mandatory even
  on the fastest path.

**Testable rule for our screens:** Name and portrait (or a chosen placeholder) are captured before any
numeric field; from then on every title, confirmation and empty state uses the name instead of "the
character" / "this record". A screen saying "Character" where a name exists fails.

**Capture:** https://bg3.wiki/wiki/Character_creation · https://dndbeyond-support.wizards.com/hc/en-us/articles/7747225600532-How-to-Upload-Custom-Portraits.

---

## 3. Live consequence previews before commit

- Fire Emblem combat forecast — shown "after selecting attack and then a weapon" (or on placing the unit
  on an enemy); calculated damage, hit, crit and follow-up, before commit [wiki; fetch 403, search
  excerpt] https://fireemblemwiki.org/wiki/Combat_forecast.
- Into the Breach — "perfect information"; enemy attacks "are telegraphed" so "every death felt like the
  player's own fault" [press interview]
  https://www.gamedeveloper.com/game-platforms/road-to-the-igf-subset-games-i-into-the-breach-i- ;
  design postmortem, Matthew Davis, GDC 2019 [talk] https://www.gdcvault.com/play/1025772/-Into-the-Breach-Design.
- Slay the Spire — Intent shows next-turn action in damage bands ("Attack for 0-4 damage" … "30 or
  more") plus block/buff/debuff icons [wiki] https://slaythespire.wiki.gg/wiki/Intent.
- XCOM 2 — hit % before every shot; Jake Solomon: "an 85 percent chance … basically should not miss";
  displayed odds are inflated on lower difficulties because players read the number emotionally [press]
  https://www.gamedeveloper.com/design/jake-solomon-explains-the-careful-use-of-randomness-in-i-xcom-2-i-.
  Show the number; expect it to be read as a promise.
- Baldur's Gate 3 — hover shows "% chance to hit" per target; a 2024 tooltip bug mis-stated spell numbers
  while the hover stayed correct [press]
  https://www.pcgamer.com/games/baldurs-gate/baldur-s-gate-3-s-spell-tooltips-have-been-lying-to-you-for-potentially-months-though-if-you-ve-been-running-off-the-chance-to-hit-you-re-just-fine/ (Baldur's Gate 3).
  A mod replaces % with the minimum d20 (DC): tabletop players want the _tabletop_ number [mod page]
  https://www.nexusmods.com/baldursgate3/mods/18418 (Baldur's Gate 3).
- Civilization VI — Settler lens colours tiles before founding; Yields toggle (Y) shows per-tile output;
  district lens previews yields "so you can better make a decision" [wiki]
  https://civilization.fandom.com/wiki/City_(Civ6) ; https://civ6.fandom.com/wiki/District.
- D&D Beyond — a natural 20 auto-prepares doubled crit damage (right-click → Critical Hit) [official X,
  2020] https://x.com/DnDBeyond/status/1283894558539956224 — consequence surfaced at the commit.

**Testable rule for our screens:** Every commit control (level up, prepare spell, equip, spend points,
take damage) shows the numeric delta before the click ("AC 16 → 18"; "d20+7 vs AC 15, 65%") and the same
numbers appear in the post-commit log. No preview fails; a preview that differs from the result is a bug.

**Capture:** https://slaythespire.wiki.gg/wiki/Intent · https://fireemblemwiki.org/wiki/Combat_forecast ·
https://www.nexusmods.com/baldursgate3/mods/18418 (Baldur's Gate 3, % vs DC shots).

---

## 4. Language and tone: game copy vs administrative copy

**UX-writing guides (the neutral baseline)**

- NN/g, empty states (Page Laubheimer): communicate status ("There are no records to display for the
  selected date range"), give a learning cue ("Star your favorites to list them here"), give a direct
  pathway (Create + Learn more) [research] https://www.nngroup.com/articles/empty-state-interface-design/.
  Correct and _administrative_: the "before" register for our rewrites.
- Shopify (Polaris content, now at shopify.dev): "Use active voice to clarify the subject and the action";
  "start with a strong verb that describes the action"; "Give merchants enough information to make the
  right decision on their own"; grade-7 reading level [official] https://shopify.dev/docs/apps/design/content
  (polaris.shopify.com/content/voice-and-tone 301s here).
- Mailchimp — voice constant, tone varies; "it's always more important to be clear than entertaining";
  "forced humor can be worse than none at all" [official] https://styleguide.mailchimp.com/voice-and-tone/.
  Flavour never displaces the number.
- GOV.UK (the counter-example): plain English mandatory; "Address the reader as 'you'"; active voice;
  15–20 words a sentence, never more than ~25 [official]
  https://www.gov.uk/guidance/content-design/writing-for-gov-uk ;
  https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/right-tone/.
  Proof that second person + active voice are necessary but not sufficient: obey all of it and a form
  still feels like the post office. What GOV.UK forbids (metaphor, character, world) is what games add.
- Game microcopy practice: Amir Dori's "Motivational Communication Toolkit" (Hearthstone examples)
  [press/Medium] https://medium.com/design-bootcamp/the-motivational-communication-toolkit-verbal-game-design-framework-by-amir-dori-3777b3743588 ;
  GDC's UX Summit exists https://gdconf.com/user-experience-ux-summit/ but no canonical "UX writing for
  games" Vault talk was located [unverified].

**Game copy (the "after" register)**

- Baldur's Gate 3 tooltips — second person, present tense, mechanic + number ("Attack Roll" vs "DEX
  Save", % to hit) [press, PC Gamer link in §3] (Baldur's Gate 3).
- Hades codex — every record has an author (Achilles) and an addressee (Zagreus) [wiki, §1].
- Darkest Dungeon — the Ancestor (Wayne June) narrates state changes as aphorisms: "Remind yourself that
  overconfidence is a slow and insidious killer" [encyclopaedic] https://en.wikipedia.org/wiki/Wayne_June.
  A status effect gets a voice, not a badge.
- Elden Ring messages — ~2 dozen templates and ~200 words; "hard formatting … allows them to be
  automatically translated" [wiki] https://eldenring.fandom.com/wiki/Messages. Constrained templates are
  a bilingual-safe way to let users add flavour (our EN+IT rule).

**Register diff (derived):** administrative = noun phrases, passive/impersonal, system as subject
("Record saved"), no addressee. Game = verb first, second person, present tense, character or world as
subject, consequence stated ("Kaelen readies _Shield_").

**Testable rule for our screens:** Every string passes four checks: (1) second person or the character's
name as subject; (2) present tense, verb-first for controls; (3) the consequence or next action is in the
sentence; (4) no system-as-subject nouns ("record", "entry", "item", "data", "form"). Empty states carry
a learning cue _and_ an in-world reason the container is empty.

**Capture:** https://www.nngroup.com/articles/empty-state-interface-design/ · https://hades.fandom.com/wiki/Codex.

---

## 5. Feedback and micro-rewards ("juice")

- Steve Swink, _Game Feel_ (2008): "real-time control of virtual objects in a simulated space, with
  interactions emphasised by polish" [book, ch. 1 PDF]
  http://mycours.es/gamedesign2014/files/2014/10/Game-Feel-Steve-Swink-chapter-1.pdf. Polish enhances
  interactions "without changing the underlying simulation" — juice must never change the roll.
- Jan Willem Nijman (Vlambeer), "The Art of Screenshake", INDIGO Classes, 2013-12-16 [talk]
  https://www.youtube.com/watch?v=AJdEqssNZ-U ; interactive archive https://archive.org/details/the-art-of-screenshake.
  Stacks ~30 small changes (impact frames, hit-stop, permanence, camera lerp, shake) on one shooter; the
  enumerated list is [unverified] here — take it from the video.
- Jonasson & Purho, "Juice It or Lose It", GDC Europe 2012 [talk] https://gdcvault.com/play/1016789/Juice-It-or-Lose ;
  blurb: "cranking a boring old game up to eleven, live on stage". Counter-voice: Game Developer,
  "resist the urge to 'juice it or lose it'" [press]
  https://www.gamedeveloper.com/design/video-indies-resist-the-urge-to-juice-it-or-lose-it-.
- "Designing Game Feel: A Survey" (arXiv 2020) [research] https://arxiv.org/pdf/2011.09201 — impact
  feedback is measurable and separable from the simulation.
- D&D Beyond digital dice — alpha for subscribers, then public beta; roll buttons wrap attack/damage,
  right-click for advantage [official] https://dndbeyond-support.wizards.com/hc/en-us/articles/7747201888404-Digital-Dice-How-to-roll-your-free-or-premium-Digital-Dice.
  Shared dice (2026): "players' 3D rolls can now be seen in real time by their party" [official]
  https://www.dndbeyond.com/posts/2133-roll-5-sets-of-digital-dice-today-to-celebrate-the. Crit
  celebrations are premium dice sets: nat-20 rune rings with sound, a nat-1 turning into a Mimic;
  numbers "fade in with a glowing font after the dice stops" [forum]
  https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/212327-list-of-digital-dice-with-critical-animations.
- Roll20 3D dice — "a real physics simulation"; "we don't know what the result of the simulation is going
  to be before it starts, either"; dice colour = player colour; per-user "Enable 3D Dice" [official]
  https://help.roll20.net/hc/en-us/articles/360039715613-3D-Dice.
- Foundry "Dice So Nice!" — "physics-based 3D dice … with sounds, special effects"; per-player themes;
  Animation Speed Normal/2x/3x; auto-hide after result, default 2000 ms [official]
  https://foundryvtt.com/packages/dice-so-nice/ ; https://riccisi.gitlab.io/foundryvtt-dice-so-nice/guide/preferences/.
- Owlbear Rodeo 2.0 dice (2022-10-31) — "a new deterministic physics engine which allows us to guarantee
  that all players are seeing the exact same roll"; material-dependent sound; hidden-roll toggle
  [official] https://blog.owlbear.rodeo/owlbear-rodeo-2-0-dice-deep-dive/.
- Baldur's Gate 3 — "bonuses fly onto a d20" so the _build_ is seen rescuing the roll [press, §1];
  counter-signal: Larian forum asks to skip dice animations [forum]
  https://forums.larian.com/ubbthreads.php?ubb=showflat&Number=930971.

**Testable rule for our screens:** Every roll has a visible settle (result after, not with, the trigger),
a distinct crit/fumble state, and a mutable sound; the value is fixed before the animation starts (log and
animation can never disagree). Every juice element is removable by one setting without changing a number.

**Capture:** https://blog.owlbear.rodeo/owlbear-rodeo-2-0-dice-deep-dive/ · https://riccisi.gitlab.io/foundryvtt-dice-so-nice/guide/preferences/.

---

## 6. Sound and motion budgets (durations, frequencies, opt-outs)

**Design-system numbers**

- Material Design 3 durations: short1–4 = 50/100/150/200 ms (ripple, small appear, icon, tooltip/chip);
  medium1–4 = 250/300/350/400 ms (FAB, dialogs/drawers "most common", expanded components, page panels);
  long1–4 = 450–600 ms (layout, shared element, container morph); extra-long1–4 = 700–1000 ms (full
  screen only). Easing emphasized (0.2,0,0,1), decelerate (0.05,0.7,0.1,1), accelerate
  (0.3,0,0.8,0.15) [official spec https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
  — client-rendered on fetch; values confirmed via a token mirror
  https://github.com/aldefy/compose-skill/blob/master/skills/compose-expert/references/material3-motion.md].
- Microsoft WinUI/Fluent: ControlFaster 83 ms, ControlFast 167 ms, ControlNormal 250 ms; enter
  cubic-bezier(0,0,0,1), exit cubic-bezier(1,0,1,1) [official]
  https://learn.microsoft.com/en-us/windows/apps/design/motion/timing-and-easing. Fluent 2: "fast and
  smooth motion without making people wait"; "include a 'no motion' setting … as recommended by the WCAG"
  [official] https://fluent2.microsoft.design/motion. The "150–250 ms" figure in search excerpts is not on
  the fetched page [unverified].
- Apple HIG, Motion: "Add motion purposefully"; "Make motion optional"; "avoid adding motion to
  interactions that occur frequently"; minimise animation under Reduce Motion [official; client-rendered,
  quotes from excerpt] https://developers.apple.com/design/human-interface-guidelines/foundations/motion.
- WCAG 2.1 SC 2.3.3 (AAA): interaction-triggered motion "can be disabled, unless the animation is
  essential" [standard] https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html.

**Game-side budgets**

- Slay the Spire "Fast Mode": animations and transitions ~2×; the bypass ships, the default is not
  shortened [forum] https://www.speedrun.com/slay_the_spire/forums/dg73b.
- Civilization VI "Quick Movement" / "Quick Combat" in Game Options [forum]
  https://steamcommunity.com/app/289070/discussions/0/215439774858639679/.
- Foundry Dice So Nice: Normal/2x/3x and 2000 ms auto-hide [official, §5].
- Baldur's Gate 3: no native combat-speed setting found in patch notes; players use speed mods and ask
  for a dice-animation skip [mod/forum] https://www.nexusmods.com/baldursgate3/mods/18862 (Baldur's Gate 3) ;
  https://forums.larian.com/ubbthreads.php?ubb=showflat&Number=763829 — the cost of an unskippable ritual.

**Derived budget for a sheet-and-controls app:** per-click feedback ≤ 200 ms (Material short4, WinUI
fast 167); state change/panel ≤ 300 ms (Material medium2, WinUI normal 250); roll settle 600–1000 ms
(Material extra-long range, Dice So Nice Normal), skippable; celebration (crit, level-up) ≤ 1500 ms,
skippable, at most once per event type per session; nothing blocks input longer than a roll settle.

**Testable rule for our screens:** Every animation is tagged with one of four budgets (≤200, ≤300,
≤1000 skippable, ≤1500 skippable-celebration); `prefers-reduced-motion` collapses all but the first to
0 ms with the same end state; an in-app "Fast mode" does the same for people without the OS flag.

**Capture:** https://learn.microsoft.com/en-us/windows/apps/design/motion/timing-and-easing (table).

---

## 7. Expert bypass: skip, speed-up, hotkeys, "recommended", remembered choices

- Baldur's Gate 3 — abilities are pre-filled per class; a "Use Recommended" button restores the default
  spread after edits [press guide]
  https://gamefaqs.gamespot.com/ps5/397566-baldurs-gate-3/faqs/81142/character-creation (Baldur's Gate 3);
  point-buy rules https://bg3.wiki/wiki/Character_creation [wiki]. Default first, edit if you care.
- D&D Beyond — Standard / Quick Build / Randomize, and a "Show Help Text" box chosen _before_ the method;
  the (?) toggle in the builder header hides help everywhere; on by default [official]
  https://dndbeyond-support.wizards.com/hc/en-us/articles/7747193997716-Character-Creation-Methods ;
  https://dndbeyond-support.wizards.com/hc/en-us/articles/7747193953556-Miscellaneous-Features.
  The expert turns it off once and it stays off.
- Hades God Mode — 20% damage resistance, +2% per death, cap 80%; Greg Kasavin: "It inherently feels
  bad to die in a game."; framed as a gift: "here is the mode for you" [press interview]
  https://www.inverse.com/gaming/hades-god-mode-interview. No story is gated behind refusing it.
- Slay the Spire Fast Mode, Civilization Quick Combat — global toggles, not per-instance prompts [§6].
- Foundry — a module maps public/private/blind/self roll modes to hotkeys because experts switch
  constantly [official package] https://foundryvtt.com/packages/rollmode-toggle ; Dice So Nice per-player
  2x/3x lets a veteran speed up without changing the table's experience [official, §5].

**Testable rule for our screens:** Every ritual (narrated step, roll settle, celebration, help panel) has
(a) a one-input skip, (b) a remembered global switch, (c) a "Recommended" one-click default on any step
with more than three choices. No skip, or a preference that must be re-set next session, fails.

**Capture:** https://dndbeyond-support.wizards.com/hc/en-us/articles/7747193997716-Character-Creation-Methods.

---

## 8. Documented failures (what to avoid)

- Duolingo streaks — Silverman & Barasch, _J. Consumer Research_ 49(6), 2023: users "consider maintaining
  a logged streak to be a meaningful goal in and of itself"; the effect weakens when a streak can be
  repaired [research] https://academic.oup.com/jcr/article-abstract/49/6/1095/6623414.
  Hadi Mogavi et al., ACM L@S 2022: "users become too fixated on gamification and get distracted from
  learning" (nine years of forum data + 15 interviews) [research] https://arxiv.org/abs/2203.16175.
  Never attach a countable that punishes absence — a D&D group meets every 2–3 weeks.
- Microsoft Clippy — Byron Reeves (Stanford): "the worst thing about Clippy was that he interrupted";
  Clifford Nass: "optimized for first use", never remembered preferences [press]
  https://thenewstack.io/humanity-vs-clippy-lessons-from-microsofts-failed-virtual-assistant/.
  A narrator that speaks uninvited and does not learn becomes the joke.
- D&D Beyond 2026 relayout — "Rant: New D&D Beyond Layout Sucks – Sterile, Empty, and Zero D&D Flavor"
  (2026-03-07 → 08-10): "sterile, minimalist corporate blandness"; "spreadsheet with a dragon logo";
  navigation "flatter and less intuitive"; ~8 agree, ~5 disagree (citing better organisation) [forum]
  https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/237200-rant-new-d-d-beyond-layout-sucks-sterile-empty-and.
  Same complaint as our owner's, same market; the replies show organisation alone does not answer it.
  (Quoted for register only; no visual judgement inferred.)
- Foundry window clutter — PopOut! exists "to pop out most windows that clog up your play area"; Minimal
  UI and Window Controls exist to hide/collapse/pin floating windows; v14 adds native pop-outs [official
  package pages] https://github.com/League-of-Foundry-Developers/fvtt-module-popout ;
  https://github.com/saif-ellafi/foundryvtt-minimal-ui. Every narrated card that opens a window is a
  window someone must close.
- Animation fatigue — Larian forum: "QoL request: skip dice animations option" [forum, §5–6]; Dice So
  Nice ships 2x/3x and auto-hide for the same reason [official, §5].
- Confetti overuse — UX Collective, "The over-confetti-ing of digital experiences": routine celebrations
  "feel cheap"; UX Planet: celebrate what the _user_ wanted, at milestones, not every step [press]
  https://uxdesign.cc/the-over-confetti-ing-of-digital-experiences-af523745db19 ;
  https://uxplanet.org/why-confetti-celebrations-backfire-and-how-to-make-them-work-be838a6e7b8b.
- NN/g on gamification — "The most successful implementations … begin with a learner-centered mindset";
  scoring social life feels wrong; too hard → learned helplessness, too easy → boredom [research video,
  2019-01-18] https://www.nngroup.com/videos/gamification-user-experience/.

**Testable rule for our screens:** No streaks, no daily counters, no mascot that speaks uninvited; a
celebration fires only on events the _rules_ already mark as special (natural 20/1, level gained, death
save, long rest), never on save/submit; every narrated card is inline (no new window) and self-dismisses;
any new "feel" element ships with its §7 skip in the same commit.

**Capture:** https://github.com/League-of-Foundry-Developers/fvtt-module-popout (README image).

---

## 9. Tabletop-specific: reproducing the physical table's rituals

**Rolling in the open vs behind the screen**

- Foundry VTT roll modes: PUBLIC "visible to all players"; PRIVATE "only visible to the player that rolled
  and any Game Master users"; BLIND "The rolling player will not see the result of their own roll"; SELF
  "only visible to the user who rolled it"; private rolls can be revealed later ("Reveal to Everyone")
  [official] https://foundryvtt.com/api/variables/CONST.DICE_ROLL_MODES.html ; https://foundryvtt.com/article/dice/.
- Roll20 — `/gmroll` shows the result to roller + GM; `/sr` and `/ssr` go to the GM only; 3D dice are
  suppressed for secret rolls "to avoid giving away that a hidden roll took place" [official]
  https://help.roll20.net/hc/en-us/articles/360039675093-Text-Chat.
- Owlbear Rodeo — eye icon makes a roll private; otherwise all players watch the same deterministic roll
  [official, §5].
- Demiplane — "Your Dice" drawer, favourite rolls, and a Group roller "for rolls the whole table should
  see" [official] https://support.demiplane.com/hc/en-us/articles/24625566685975-Dice-Commands.
- D&D Beyond Shared Dice — "no more switching tabs or checking the Game Log to reveal results" [official, §5].

**"Roll for initiative"**

- D&D Beyond Maps (2024-10-29): "click the 'Start Combat' button to begin Initiative"; players see a
  player-facing track with "whose turn it is"; hidden creatures stay hidden until revealed [official]
  https://www.dndbeyond.com/posts/1841-roll-for-initiative-combat-tracking-comes-to-the. The control
  carries the table phrase, not "Create encounter instance".

**"You may now level up"**

- D&D Beyond — XP is added on the sheet but levelling happens in the builder; an arrow by the level and an
  exclamation mark near the level dropdown signal "you need to level up or down" [forum corroboration]
  https://www.dndbeyond.com/forums/d-d-beyond-general/general-discussion/52276-level-up-what-needs-to-be-done.
  The threshold is an _invitation_ (marker), not an automatic mutation — like the table, where the DM
  says the words and the player does the work.
- Roll20 Charactermancer also runs on level-up ("Creation and Modification Tool") [official, §1]; Foundry
  Originate explicitly does not [official, §1] — a gap competitors leave open.

**Crits at the table**

- D&D Beyond: nat-20 auto-prepares doubled damage [official, §3]; rune rings / Mimic on premium sets
  [forum, §5]. Roll20, Owlbear and Foundry render the physical tumble itself [§5].

**Testable rule for our screens:** Every roll carries a visibility mode with the four Foundry semantics
(public / private-GM / blind / self), defaulting to public for players; the sheet marks "level available"
as an invitation the player accepts, never as an automatic change; initiative starts from a control
labelled with the table phrase; crit/fumble states come from the rules, not from a purchase.

**Capture:** https://foundryvtt.com/article/dice/ (roll-mode dropdown) ·
https://www.dndbeyond.com/posts/1841-roll-for-initiative-combat-tracking-comes-to-the (Start Combat).

---

## Copy register — before/after examples (EN + IT)

Eight generic administrative strings rewritten in a game register; each names the source pattern it
copies. {name} = character name; numbers are examples. Italian uses informal "tu" to match the EN second
person, and the Italian 2024 rules vocabulary (PF = punti ferita, CA = classe armatura).

| #   | Before (administrative)                           | After — EN                                                                        | After — IT                                                                      | Source pattern copied                                                                                                                          |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "No items found." (inventory)                     | "{name}'s pack is empty. Loot it, buy it, or craft it — then it lives here."      | "Lo zaino di {name} è vuoto. Trovalo, compralo o forgialo: poi vivrà qui."      | NN/g learning cue (§4) + Polaris verb-first + Hades codex: a container has an in-world reason to be empty                                      |
| 2   | "No sessions recorded." (journal)                 | "Your journal is empty. The first session will write its first page."             | "Il tuo diario è vuoto. La prima sessione scriverà la prima pagina."            | Hades codex: entries unlock through play (§1); NN/g status + cue in one sentence                                                               |
| 3   | "Save changes" (level-up confirm)                 | "Take level 4 — +7 HP, a new spell slot, Extra Attack."                           | "Sali al livello 4 — +7 PF, un nuovo slot incantesimo, Attacco Extra."          | Fire Emblem forecast / Baldur's Gate 3 consequence-before-commit (§3); D&D Beyond level-up as invitation (§9)                                  |
| 4   | "Calculate attack"                                | "Roll to hit: d20+7 vs AC 15 (65%)"                                               | "Tira per colpire: d20+7 contro CA 15 (65%)"                                    | XCOM / Baldur's Gate 3 hover percentage (§3); table phrase (§9)                                                                                |
| 5   | "Error: invalid value." (score > 20)              | "Strength can't go above 20 — the rules stop it there."                           | "La Forza non può superare 20: le regole si fermano lì."                        | GOV.UK plain, specific, blame-free as baseline (§4); Mailchimp clarity over humour — the flavour is the rule, not a joke                       |
| 6   | "Are you sure you want to delete this character?" | "Retire {name} for good? Their story ends here and can't be brought back."        | "Ritirare {name} per sempre? La sua storia finisce qui e non torna indietro."   | Darkest Dungeon: consequence spoken as narration (§4); Polaris confirm-with-consequence                                                        |
| 7   | "You have 3 unassigned skill points."             | "3 skill points wait for you. Spend them now, or carry them to the next session." | "3 punti abilità ti aspettano. Spendili ora, o portali alla prossima sessione." | Baldur's Gate 3 second-person present-tense tooltip (§4); Polaris "in control"; D&D Beyond marker-as-invitation (§9)                           |
| 8   | "Submit" (end of creation)                        | "Venture forth"                                                                   | "Parti all'avventura"                                                           | Baldur's Gate 3 final chargen control (label recalled from play, exact string [unverified]); Foundry Originate "stepping into your world" (§1) |

Notes for the designer:

- Rows 3–4 are "numbers first": the game register _adds_ the consequence, never replaces it (Swink, §5).
- Row 5 keeps the GOV.UK register for errors — precise, short, blame-free — then one clause of world.
- Row 8 is pure ritual and must have the §7 skip (Enter submits; the label is just the label).
- Italian: keep the verb-first shape ("Tira", "Sali", "Spendili"); avoid the bureaucratic "Procedere?",
  "Conferma operazione", "Elemento salvato" that Italian admin software defaults to.
- For user-authored flavour (custom empty-state lines, journal captions) the Elden Ring template model
  (§4) keeps EN/IT parity: fixed templates + slot words, translated once.

---

## Cross-cutting testable rules (audit checklist)

1. Framing: every multi-step control has one in-world sentence naming the character and the consequence (§1).
2. Identity: name and portrait before numbers; every later title uses the name (§2).
3. Preview: every commit shows the numeric delta before the click and the same numbers in the log (§3).
4. Register: second person or name as subject; present tense; verb-first controls; no
   "record/entry/item/data/form" nouns; empty states carry a cue and an in-world reason (§4).
5. Feedback: rolls settle after the trigger; crit/fumble states exist; value fixed before animation;
   every juice element removable without changing a number (§5).
6. Budget: ≤200 ms feedback, ≤300 ms state change, ≤1000 ms skippable settle, ≤1500 ms skippable
   celebration; reduced-motion and in-app Fast mode collapse the last two (§6).
7. Bypass: one-input skip, remembered global switch, "Recommended" default on any step with >3 choices (§7).
8. Failures: no streaks/daily counters, no uninvited mascot, celebrations only on rule-marked events,
   narrated cards inline and self-dismissing, skip ships in the same commit (§8).
9. Table rituals: four roll-visibility modes, level-up as invitation, initiative from a table-phrase
   control, crit states from rules not purchases (§9).

## Unverified items to confirm before citing in a decision

- Whether the Baldur's Gate 3 narrator voices character-creation steps (§1).
- Exact wording of Baldur's Gate 3's final character-creation control ("Venture Forth") (copy row 8).
- The enumerated ~30 steps of "The Art of Screenshake" (§5) — from the video, not the archive page.
- Fluent 2's "150–250 ms" typical duration (§6); WinUI's 83/167/250 ms are confirmed.
- Apple HIG Motion quotes (§6) — from search excerpts; the page is client-rendered.
- A canonical GDC "UX writing for games" talk (§4) — none located; the track exists.
