---
"d20-folio": patch
---

fix(character): drop the visible empty-state dash from the status rail. When a character has no
active conditions, the cockpit's STATI (status) strip no longer paints a quiet "—" placeholder — the
row now shows just the "Add condition" affordance. The empty state stays fully accessible: the same
"No conditions" / "Nessuna condizione" label is announced to assistive tech via a visually-hidden
(`sr-only`) span, so screen-reader users still hear it while nothing renders on screen. The
`emptyLabel` prop and the `character.noConditions` i18n key are unchanged (now carried by the sr-only
announcement). The shared `.cond-empty` style is untouched — it still backs the override-set empty
state in `OverrideChipSet`.
