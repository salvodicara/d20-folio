---
"d20-folio": patch
---

fix(compendium): rules-prose IT/EN locale-corpus closeout — measured-unit vocabulary + IT damage-type casing

Two data-hygiene closeouts of the shipped BG3 rules-text colour grammar, both invisible-to-slightly-more-scannable and render-safe:

- **Measured-unit vocabulary completion.** The grammar's measured-quantity arm now inks every unit the SRD corpus actually writes: EN gains `inch`/`inches` (item prose — "a 1-inch cube") and IT gains `centimetr[oi]` (magic-item small-scale prose — "misura circa 2,5 centimetri di diametro"). The number-immediately-before-unit gate keeps "pinch" and "1 cubic inch" plain.
- **IT damage-type casing normalized.** The 2024 SRD treats damage types as defined terms; the IT catalogues now capitalize the damage-type noun consistently corpus-wide — `danni da Fuoco`, `danni Necrotici`, and every member of a list (`danni da Acido, Freddo o Fulmine`). 197 occurrences across all `it/srd` catalogues (both the public SRD partition and the content pack) were normalized off the mixed casing. Because the grammar is first-letter case-flexible (`[Ff]uoco`, `[Dd]ann[oi]`), rendering is byte-identical before and after — this is pure catalogue consistency. The convention is documented in `docs/ARCHITECTURE.md` → "Italian source cascade".
