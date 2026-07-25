---
"d20-folio": patch
---

fix(engine): Escape the Horde stops marking every one of the Hunter's own attacks Disadvantaged

Hunter _Defensive Tactics_ → **Escape the Horde** shipped as a Disadvantage on the character's OWN
attack rolls, so every attack card on the Play tab read "Disadv." from Ranger 7 onward. RAW the
Disadvantage lands on Opportunity Attacks made _against_ you — the same direction as Blur's "attacks
against you have Disadvantage". The option now emits `incoming-attack-disadvantage`, so it renders
as a framed defensive line in the rail's Advantages section ("Opportunity Attacks against you have
Disadvantage" / "Gli Attacchi di Opportunità contro di te hanno Svantaggio") and never touches the
player's own to-hit gloss.
