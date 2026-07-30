---
"d20-folio": minor
---

feat(sheet): custom rows behave exactly like SRD rows — tap to read, add from the detail

The Custom tab's rows no longer have their own add button. Tapping a row opens the
entry's detail — the SAME read scaffold every SRD entry in these modals uses (eyebrow ·
facts grid · description, built per kind: a spell's casting time / range / components /
duration, a weapon's die / stat / properties, an item's armor · charges · consumable
flags, a feature's source · uses · content) — and the standard Add footer commits it,
with Back returning to the list. One flow for SRD and homebrew alike.

The row's right-edge cluster is now just the two management actions with no SRD
counterpart: edit and delete, still top-aligned on the name line, and siblings of the
row (so neither can trigger the row's tap).
