---
"d20-folio": minor
---

The n–p bestiary wave — 27 SRD 5.2.1 monsters (Nalfeshnee through Purple Worm), each with its full
bilingual EN + IT statblock catalogue: the **Pit Fiend** and nalfeshnee fiends and the celestial
**Planetar** heavyweights, the night-hag · oni · pirate-captain and noble/pirate/priest-acolyte NPCs,
the ochre-jelly ooze, the owlbear · otyugh · phase-spider · purple-worm monstrosities, the ogre and
ogre-zombie giants, the nightmare fiend, the pegasus and pseudodragon, and the deep n–p beast bench
(octopus · owl · panther · piranha · plesiosaurus · polar-bear · pony · pteranodon). Structured
attack/save/spellcasting facts are pinned against the printed prose by the corpus guard.

The beast-projection sync re-derives two live-user Polymorph corrections from this wave's corpus.
**Panther** was structurally 2014-era (AC 12, a Bite+Claw pair, Keen Smell + Pounce traits); its
2024 statblock is AC 13, DEX 16, a single `Rend` (+5, 1d6+3 Slashing) with Nimble Escape, no passive
traits, and darkvision 60 ft. **Polar Bear** likewise collapses its stale Bite+Claw to a single 2024
`Rend` (+7, 1d8+5 Slashing), with DEX 10→14, Swim 30→40 ft., the Keen Smell trait dropped, and
darkvision 60 ft. added. Anyone Polymorphed into a panther or polar bear now renders the corrected
2024 form. **Octopus** also loses its `trait.ink-cloud` beast trait — in 2024 Ink Cloud is a reaction,
not a passive trait — so the shared key is pruned from both locales. The other four n–p beasts (owl ·
piranha · plesiosaurus · pony · pteranodon) already matched their generated projection. The polar
bear's CON is 16 (+3) in both the stale entry and the 2024 print, so the giant-spider/polar-bear
Concentration CON-delta pin (`polymorph.test.ts`) is unchanged and no literal moved.

`otyugh` joins the monster-tongue language catalogue (the Blink Dog / gnoll precedent — a
catalogue-only tongue for the otyugh's limited telepathy, not offered in the player language picker).

`KEEP_ENGLISH_SRD` gains the five proper nouns the official IT SRD keeps in English (the IT name
byte-equals the EN): **Nalfeshnee**, **Ogre**, **Oni**, **Otyugh**, and **Planetar** (Piranha and
Pony were already listed).

The bilingual catalogue stays LAZY and precached for offline-first, with the eager startup closure
unchanged.
