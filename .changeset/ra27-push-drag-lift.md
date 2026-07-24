---
"d20-folio": patch
---

feat(inventory): show your push, drag, and lift limit in the capacity tooltip (RA-27)

The encumbrance chip's tooltip now tells you how much you can push, drag, or lift (your Strength
score times 30, twice your carrying capacity). The value was already computed by the rules engine
but never shown; it now appears alongside the carried-weight readout, locale-formatted in pounds
(EN) or kilograms (IT), and reads your effective Strength.
