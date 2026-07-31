---
"d20-folio": patch
---

Symmetric cockpit tail: the sheet's content column now ends the same 12px from
its bottom edge that the tab strip sits from its top edge, on every tab. Removes
the Play tab's legacy 80px tail padding, halves the tab body's tail to mirror
the head, ends a collapsed reference section at its header, and stops trailing
section margins (`.mb-6` wrappers, `.info-card`'s default margin) from stacking
under the panel padding.
