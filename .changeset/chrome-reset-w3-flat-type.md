---
"d20-folio": patch
---

The level-up commit screen's number loses the 18px underglow it kept through the sweep that was
meant to remove every glow, and the check that missed it now derives no-underglow from the
stylesheet instead of from a list of retired token names.
