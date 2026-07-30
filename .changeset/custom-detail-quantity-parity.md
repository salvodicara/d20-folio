---
"d20-folio": minor
---

feat(sheet): a custom item's detail carries the same Qty stepper as an SRD item's

Custom equipment and weapons now offer the add-time quantity stepper their SRD
counterparts do — set 3 on the detail and three land on the sheet — while custom spells
and features offer none, exactly like their SRD legs. One convention for everything a
modal can add.

The stepper moved INTO the shared `PickerDetailFooter` (a `quantity={{ value, onChange,
… }}` prop instead of a hand-built node): the SRD picker's inline label + `NumberStepper`
block is deleted, so both legs now render the one control with the one "hide it once the
item is already added" rule.
