---
"d20-folio": minor
---

The q–s bestiary wave — 45 SRD 5.2.1 monsters (Quasit through Swarm of Venomous Snakes), each with
its full bilingual EN + IT statblock catalogue: the **Rakshasa** and the celestial **Solar** (CR 21)
heavyweights, the three **Sphinxes** (of Lore and of Valor with their `xpInLair` lair prints, of
Wonder), the stone-giant · storm-giant · stone-golem line, the quasit · salamander · succubus
fiends-and-elementals, the sea-hag · spirit-naga · shambling-mound spellcasters, the
roc · remorhaz · roper · rust-monster monstrosities, the sahuagin-warrior · satyr · scout · spy ·
sprite NPCs-and-fey, the shadow · specter · shield-guardian, the red/silver dragon wyrmlings, and the
seven **swarms** (bats · crawling-claws · insects · piranhas · ravens · rats · venomous-snakes).
Structured attack/save/spellcasting facts are pinned against the printed prose by the corpus guard.

The beast-projection sync re-derives four live-user Polymorph corrections from this wave's corpus and
**closes the original 8-beast drift audit**. **Saber-Toothed Tiger** was the last drifted beast: AC
12→13, DEX 14→17, the stale Bite+Claw pair collapsed to the single 2024 `Rend` (+6, 2d6+4 Slashing)
with Running Leap and Nimble Escape, and darkvision 60 ft. added. **Scorpion** and **Spider** lose
their stale poison-die attacks — the 2024 sting/bite each deal a flat `1` Piercing. **Seahorse** loses
its `trait.bubble-dash` beast trait — in 2024 Bubble Dash is an action, not a passive — so the shared
key is pruned from both locales. Anyone Polymorphed into a saber-toothed tiger, scorpion, spider, or
seahorse now renders the corrected 2024 form. `reef-shark` already matched its projection. The
seahorse zero-attacks premise re-verifies against the 2024 print, so the `polymorph.test.ts` seahorse
pin holds and no literal moved.

The `raven`'s Mimicry unifies the shared `trait.mimicry` IT lexeme to the raven's official catalogue
name (_Imitare_), matching green-hag — no collision.

`sahuagin` joins the monster-tongue language catalogue (the Blink Dog / gnoll / otyugh precedent — a
catalogue-only tongue, not offered in the player language picker).

The **Roper**'s grapple-only Tentacle is the sole attack-roll print in the entire 330-monster corpus
with no Hit damage clause (it applies Grappled + Poisoned only); it is modeled as a narrative entry so
the "attack ⇒ has damage" corpus invariant stays intact for every attack entry, with the printed
+7 / reach / escape-DC carried by the prose.

`KEEP_ENGLISH_SRD` gains the five proper nouns the official IT SRD keeps in English (the IT name
byte-equals the EN): **Quasit**, **Rakshasa**, **Remorhaz**, **Roc**, and **Solar**. The **Specter**
monster's Italian name _Spettro_ byte-collides across the content-pack seam with the Rogue **Phantom**
subclass's _Spettro_ (Italian renders both EN words as the one lexeme); this is sanctioned behind a
narrow exact-pair `ALLOWED_COLLISIONS` entry in the IT-name guard (the Mage/Wizard→*Mago* precedent).

The bilingual catalogue stays LAZY and precached for offline-first, with the eager startup closure
unchanged.
