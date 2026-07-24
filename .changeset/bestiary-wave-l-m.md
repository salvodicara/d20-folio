---
"d20-folio": minor
---

The l–m bestiary wave — 21 SRD 5.2.1 monsters (Lamia through Mummy Lord), each with its full
bilingual EN + IT statblock catalogue: the lamia · medusa · manticore · merrow · mimic ·
minotaur-of-baphomet monstrosities, the lemure and marilith fiends, the legendary **Lich** and
**Mummy Lord** undead (both carrying their `xpInLair` lair prints) alongside the mummy and the
minotaur-skeleton, the magma-mephit · magmin · merfolk-skirmisher elementals, the **Mage** NPC, and
the l–m beast bench (lion · lizard · mammoth · mastiff · mule). Structured
attack/save/spellcasting facts are pinned against the printed prose by the corpus guard.

The beast-projection sync re-derives two live-user Polymorph corrections from this wave's corpus:
**Lion** drops its stale `Roar` trait (2024 models Roar as a Wisdom-save action, not a passive
trait), and **Mammoth** collapses to its 2024 single-Gore statblock (Speed 40→50 ft., Gore
4d8+7→2d10+7, the old Stomp attack and Trampling Charge trait removed). Anyone Polymorphed into a
lion or mammoth now renders the corrected 2024 form. The other three l–m beasts (lizard, mastiff,
mule) already matched their projection, so no `polymorph.test.ts` literal moved.

The **Mage** statblock's official IT name _Mago_ byte-collides with the Wizard class's canonical
_Mago_ — distinct English entities (Italian lacks the Wizard/Mage lexical split) that the pilot had
dropped for want of an allowlist. This wave reintroduces Mage behind a narrow `ALLOWED_COLLISIONS`
sanction in the IT-name guard, covering exactly the `classes:wizard` ↔ `monsters:mage` pair (both
tier-1 IT SRD 5.2.1 prints). `KEEP_ENGLISH_SRD` also gains the eight proper nouns the official IT
SRD keeps in English (the IT name byte-equals the EN): **Lamia**, **Lemure**, **Lich**, **Magmin**,
**Marilith**, **Medusa**, **Merrow**, and **Mimic**.

The bilingual catalogue stays LAZY and precached for offline-first, with the eager startup closure
unchanged.
