---
"d20-folio": patch
---

The Compendium and add-item pickers now rank NAME matches above description-only matches. Searching
"pozione guarigione" used to surface "Pozione di Guarigione" only third — below items like "Calderone
della Rinascita" that merely mention it in their body text — because the picker flat-filtered with no
ranking. It now reuses the same two-tier `rankedSearch` primitive the character-creation pickers use:
an entry whose name (localized name, English name, or id) matches sorts above one that matches only in
its description, the order stays stable within each tier, and an empty query keeps the natural order.
One fix covers both the Compendium page and the add-item Equipment / Magic Items tabs.
