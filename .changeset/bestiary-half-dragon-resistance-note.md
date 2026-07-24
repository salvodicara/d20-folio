---
"d20-folio": patch
---

fix(bestiary): render the half-dragon's GM-variable Resistances line. The SRD 5.2.1 half-dragon
prints "Resistances Damage type chosen for the Draconic Origin trait" — a defense line whose element
is GM-chosen, so no closed-set `damageResistances` could carry it and the line was invisible on the
card. `QualifiedDefense` gains a note-only sibling `QualifiedDefenseNote` (`{ kind; noteKey }`) that
expresses a resistance whose "type" is a localized prose note rather than a `DamageType` id — the
closed-set typing of normal qualified defenses is untouched. The statblock now renders the printed
sentence verbatim (EN + IT, from the official IT SRD wording), with the ledger separator logic fixed
so a note-only line carries no stray leading comma. Corpus guard validates the new shape; a card
render test pins the half-dragon line.
