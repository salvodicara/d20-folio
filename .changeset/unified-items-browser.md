---
"d20-folio": minor
---

Merge the separate Equipment and Magic Items surfaces into ONE unified "Items"
browser — a single search + list over both corpora (mundane SRD equipment + magic
items), in BOTH the sheet Add-Item modal (now Items · Custom) and the Compendium
page (one Items ribbon entry). A smart facet rail spans both datasets: a Magic
lens (All · Magic · Nonmagical), one Kind axis (Weapon · Armor · Shield · Gear ·
Tool · Pack · Wondrous · Potion · Ring · Rod · Scroll · Staff · Wand — Weapon and
Armor surface mundane and magic alike), and the magic-only Rarity + Attunement
axes that light up only in a magic context. The two data shapes stay separate
under the hood (the unified spec delegates row/detail/onAdd to the per-corpus
specs); jargon axes (Rarity, Attunement) carry teaching tooltips. Old
`?type=equipment` / `?type=magic-item` deep links alias to the merged Items view.
