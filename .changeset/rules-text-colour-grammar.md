---
"d20-folio": minor
---

feat(compendium): the BG3 rules-text colour grammar — damage, conditions, and values read at a glance

Rules prose now scans the way BG3's tooltips do. A new pure, locale-parameterized render-time
formatter (`highlightRulesText`) lifts the mechanically load-bearing tokens in every spell, feat,
trait, and item description: damage phrases ("8d6 Fire damage" · "danni contundenti") wear their
damage type's own ink — the same per-type AA hue ramp the verdict chips already wear, per theme;
condition names (capitalized or adjectival, Italian gender/plural inflections included) wear their
condition's ink; values (dice, save DCs, measured distances/durations) wear the lit special-ink
register; Advantage/Disadvantage wear the success/danger inks. Wired opt-in through
`InlineMarkdown`'s `highlight` prop across every rules-prose surface — compendium entries +
"At Higher Levels", picker details, the sheet's feature/spell/item cards, and the level-up reading
prose — while chronicle/session/user prose stays untouched by construction. Locale match
vocabulary is a typed catalogue (`src/i18n/rules-prose.ts`, exhaustive over damage types ×
locales); every ink is pinned ≥ WCAG-AA on the prose grounds in both themes. The previous
weight-only emphasis grammar (`highlightSrdProse`, `.cmp-hl`/`.cmp-kw`) is deleted wholesale.

Design-review hardening: a multi-type damage list ("Acid, Cold, or Fire damage") now inks each
type in its own hue; measured numbers keep their decimal/thousand separators as one token ("1,5
metri", "1,000 feet"); the lowercase mechanical forms of Advantage/Disadvantage ink in their verb
phrases — in Italian the corpus's real forms ("ha/hai/hanno/avere svantaggio"), not a "con"-only
gate; and "invisible" no longer false-inks on objects: English lifts it as the capitalized defined
term or in creature/condition context, while Italian — which writes native adjective order
("creatura invisibile") and whose mechanical uses are the capitalized "Invisibile" — inks the
defined term only. Homebrew CUSTOM feature descriptions deliberately wear the grammar too — a
homebrew feature is rules text.

Data: five IT magic-item descriptions (Axe of the Dwarvish Lords, Executioner's Axe, Oil of
Sharpness, Sword of Kas, Sword of Sharpness) wrote the nonstandard "danni da Taglio" for slashing;
normalized to the standard adjective "danni Taglienti" so each single-type slashing phrase inks in
the slashing hue.
