---
"d20-folio": patch
---

fix(i18n): Italian Advantage/Disadvantage prose inks like English does. The rules-text colour grammar gates the lowercase forms behind a per-locale verb phrase, and IT's gate had been translated from English's shape (`ha`/`hai`/`hanno`/`avere`/`con`) rather than counted against the Italian corpus — so `dispone di vantaggio` (×64) and `subisce`/`subiscono svantaggio` (×24) never lifted: 88 of the ~115 verb-phrase occurrences in `src/i18n/it/srd/*.json` rendered as plain text while the identical English sentence rendered inked. The gate now carries both forms (plus `dispongono di` / `subire`), still lifting only the adv/dis word and never the verb. Surfaced by the new `mimic` a11y leaf, whose Italian prose reads "le prove … subiscono svantaggio".
