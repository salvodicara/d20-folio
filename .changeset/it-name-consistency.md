---
"d20-folio": patch
---

Italian names are now re-sourced to their official form and made cross-reference-consistent. Every
entity's canonical Italian `name` was audited against the official **IT SRD 5.2.1** (the 2024
ruleset, parsed from the CC-BY PDF), and every place one entity's prose _names_ another was aligned
to that one canonical lexeme — so a spell, feat, item, or condition reads the SAME Italian name
wherever it is referenced (Fey Touched grants _Passo Velato_, never _Passo Brumoso_).

- **288 names corrected to official** across spells, magic items, equipment, class features, beasts,
  invocations, metamagic, feats, backgrounds, languages, proficiencies, and weapon properties — e.g.
  Geas _Imposizione → Costrizione_, Acid Splash _Spruzzo Acido → Fiotto Acido_, Druidcraft
  _Trucchetto → Artificio Druidico_, and dozens of magic items that still carried raw English
  (_Verga di Resurrection → Verga della Resurrezione_).
- **All name collisions resolved** — distinct entities that had collapsed onto one Italian name are
  split by the official convention: Conjure _X_ = _Evoca X_ vs Summon _X_ = _Richiama X_; crossbow
  Bolt = _Quadrello_ (freeing _Dardo_ for the Dart weapon); Portent = _Auspicio_ (Augury keeps
  _Presagio_); and more.
- **Every prose cross-reference aligned** to the canonical name, with grammatical inflection
  preserved (_Affascinato_/_Affascinata_ agreeing with gender is correct; only genuinely different
  translations were fixed).
- **New consistency guard** (`tests/unit/it-name-consistency.guard.test.ts` + composed
  `content-pack/…/it-name-consistency.guard.pack.test.ts`) fails the build on future name
  collisions, untranslated regressions, and retired-lexeme drift.
- **New authority doc** `docs/IT_NAME_REGISTRY.md` (the source hierarchy + core glossary), and the
  D2 cascade in `docs/GOLDEN_RULES.md` now cites the now-available IT SRD 5.2.1 and the Baldur's
  Gate 3 tier.

Character data is unaffected — sheets store stable ids, not display strings, so renaming a canonical
Italian name carries no migration.
