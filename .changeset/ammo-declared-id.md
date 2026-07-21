---
"d20-folio": patch
---

Ammunition tracking now reads a weapon's ammo from DECLARED data instead of parsing it out of the
weapon's property prose. Each ranged weapon carries a typed `ammunitionId` naming the gear it fires
(Longbow → Arrows, the crossbows → Crossbow Bolts, Sling → Sling Bullets, Blowgun → Blowgun Needles,
Musket/Pistol → the new Firearm Bullets), and the combat resolver reads it directly. This fixes a
real ambiguity: the Sling and the SRD firearms all print "; Bullet", so a character carrying a
firearm alongside sling ammunition used to see the firearm wrongly debit the sling's bullets. A
firearm now debits its own Firearm Bullets and leaves the sling stock untouched. Adds the SRD 5.2.1
Firearm Bullets ammunition item (EN + IT) that accompanies the Musket and Pistol.
