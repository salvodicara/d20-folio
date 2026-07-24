---
"d20-folio": patch
---

fix(bestiary): register the lycanthrope creature tag + pin tag-key completeness

The t-z wave gave the five weres (werebear/wereboar/wererat/weretiger/werewolf) `typeTags:
["lycanthrope"]` and the tarrasque/kraken `typeTags: ["titan"]`, but neither
`srd.creatureTag_lycanthrope` nor `srd.creatureTag_titan` existed in EITHER locale — so the identity
line (`monster-identity.ts` → `srd.creatureTag_${tag}`) rendered the `⟦…⟧` missing-key placeholder in
prod and threw in dev/test.

- Add `creatureTag_lycanthrope` (EN "Lycanthrope" / IT "Licantropo") and `creatureTag_titan` (EN
  "Titan" / IT "Titano") to `src/i18n/{en,it}/ui/srd.json`. The IT lexemes are the official IT SRD
  5.2.1 parenthetical terms ("Mostruosità … (licantropo)", "Mostruosità Mastodontica (titano)").
- Close the guard gap (golden rule 13): the §F prose sweep drives the spec `row()` string, never the
  deferred-render tag lookup, so type-tag localization was untested. New corpus-guard row §F.13 pins
  every monster's every `typeTag` to resolve non-empty in BOTH locales — caught both gaps (7 red
  rows before the fix).
