---
"d20-folio": minor
---

The t–z bestiary wave — 46 SRD 5.2.1 monsters (Tarrasque through Young White Dragon), each with its
full bilingual EN + IT statblock catalogue, completing the public 330-monster corpus. The apex
**Tarrasque** (CR 30 `titan`), the legendary **Vampire** (CR 13, with its `xpInLair` 11,500 lair
print) plus vampire-spawn and vampire-familiar, the legendary **Unicorn**, the five lycanthropes
(werebear · wereboar · wererat · weretiger · werewolf), the vrock · water-elemental fiends-and-
elementals, the treant · troll · wight · wraith · will-o-wisp · xorn, the ten **young dragons**
(black · blue · brass · bronze · copper · gold · green · red · silver · white) plus the white dragon
wyrmling, and the tough · tough-boss · warrior-infantry · warrior-veteran NPCs. Structured
attack/save/spellcasting facts are pinned against the printed prose by the corpus guard.

The beast-projection sync re-derives four live-user Polymorph corrections from this wave's corpus.
**Tiger** loses its stale `nimble-escape` trait — 2024 is a single `Rend` (+5, 2d6+3 Slashing) with
no traits. **Warhorse** loses its `charge` trait — 2024 is a single `Hooves` attack (2d4+4). **Triceratops**
loses its `trampling-charge` trait — 2024 is a single `Gore` (2d12+6). **Tyrannosaurus Rex**'s Tail
grows to 4d8+7 with reach 15 ft. (was 3d8+7 / reach 10). Anyone Polymorphed into a tiger, warhorse,
triceratops, or tyrannosaurus rex now renders the corrected 2024 form. `weasel` · `venomous-snake` ·
`vulture` · `wolf` already matched their projection. The t-rex CR-8 offer-cap pin is unaffected (the
tail values aren't pinned), so no `polymorph.test.ts` literal moved.

`worg` joins the monster-tongue language catalogue (the Blink Dog / gnoll / otyugh / sahuagin
precedent — a catalogue-only tongue, not offered in the player language picker).

The vampire-familiar's "Charmed (except from its vampire master)" print adds the closed
`except-vampire-master` condition-immunity note token (the archmage `with-mind-blank` precedent),
rendered as a text affix beside the Charmed chip.

`KEEP_ENGLISH_SRD` gains the eight proper nouns the official IT SRD keeps in English (the IT name
byte-equals the EN): **Tarrasque**, **Treant**, **Troll**, **Vrock**, **Wight**, **Worg**, **Wraith**,
and **Xorn**.

The bilingual catalogue stays LAZY and precached for offline-first (precache re-baselined
8819 → 8945 KiB, measured 8934.23 composed + ~10 KiB never-exact-fit headroom, P3 table updated in
the same commit), with the eager startup closure unchanged.
