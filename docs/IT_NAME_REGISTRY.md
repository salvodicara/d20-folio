# IT Name Registry — the canonical Italian lexicon

> The authoritative source hierarchy and the closed-set glossary for **Italian entity names**. This
> is the "who decides the Italian name" doc; the names themselves live as the `name` fields in
> `src/i18n/it/srd/*.json` (+ the pack's `content-pack/i18n/it/srd/*.json`) — those fields ARE the
> registry, one canonical lexeme per entity. This doc records the **authority**, the **core glossary**
> everything cross-references, and the **guard** that keeps it from drifting.

## Why this exists

A character's Italian sheet names hundreds of entities — spells, feats, class features, magic items,
equipment, conditions, weapon properties. When entity **A**'s prose mentions entity **B** (Fey Touched
grants _Misty Step_; a ranger feature keys off _Hunter's Mark_), it must use **B's one canonical Italian
name**. Historically these drifted: the same spell rendered two different ways in two places
(_Passo Velato_ here, _Passo Brumoso_ there), or Conjure/Summon spells collapsed onto one name. That
drift is a bug. The rule: **one entity → one Italian lexeme → used identically everywhere.**

## The authority hierarchy (D2 cascade)

The canonical Italian name for an entity is chosen in strict priority order (see also
`docs/GOLDEN_RULES.md` → **D2**, and the pack-side retrieval how-to in `content-pack/docs/SOURCING.md`):

1. **Official IT SRD 5.2.1** — the 2024 ruleset, released 2025-12-08 under CC-BY-4.0.
   Direct PDF: `https://media.dndbeyond.com/compendium-images/srd/5.2/IT_SRD_CC_v5.2.1.pdf`
   (read via `pypdf` + grep). **TIER-1 for every SRD entity.**
2. **Asmodee Italia** official 5e books · **Wizards IT** · published errata.
3. **Baldur's Gate 3** Italian localization — a high-quality, internally consistent IT rendering of
   5e-adjacent terminology; the tie-breaker for **non-SRD / content-pack** entities with no official IT.
4. Reputable community sources (cross-check ≥ 2).
5. Only then AI-translate, anchored on SRD terminology, with a `// AI-translated` note.

**Never** trust the Italian fandom wiki (2014 edition) — it predates the 2024 terminology.

**Consistency beats literalism.** Grammatical inflection is expected and correct — _Affascinato_ →
_Affascinata_ agreeing with _creatura_ is the SAME lexeme, not drift. A genuinely different
translation is the bug (never _Ammaliato_ where the canonical is _Affascinato_).

## Core glossary — the closed sets everything references

These small, high-frequency sets anchor the whole lexicon. All verified against the official IT SRD 5.2.1.

### Spell schools — ⚠️ the EN↔IT names are SWAPPED

| English         | Italian        |     | English       | Italian         |
| --------------- | -------------- | --- | ------------- | --------------- |
| Abjuration      | Abiurazione    |     | Illusion      | Illusione       |
| **Conjuration** | **Evocazione** |     | **Evocation** | **Invocazione** |
| Divination      | Divinazione    |     | Necromancy    | Necromanzia     |
| Enchantment     | Ammaliamento   |     | Transmutation | Trasmutazione   |

The classic false friend: **Conjuration = Evocazione**, **Evocation = Invocazione**. Getting this
wrong silently mislabels every spell's school. (Consequently: Conjure _X_ = _Evoca X_; Summon _X_ =
_Richiama X_ — the verb keeps the two families distinct.)

### Damage types

| Acid  | Bludgeoning | Cold   | Fire  | Force | Lightning | Necrotic  | Piercing   | Poison | Psychic  | Radiant | Slashing  | Thunder |
| ----- | ----------- | ------ | ----- | ----- | --------- | --------- | ---------- | ------ | -------- | ------- | --------- | ------- |
| Acido | Contundenti | Freddo | Fuoco | Forza | Fulmine   | Necrotici | Perforanti | Veleno | Psichici | Radiosi | Taglienti | Tuono   |

### Conditions

| Blinded  | Charmed     | Deafened  | Exhaustion    | Frightened | Grappled  | Incapacitated | Invisible  | Paralyzed   | Petrified    | Poisoned   | Prone | Restrained | Stunned  | Unconscious    |
| -------- | ----------- | --------- | ------------- | ---------- | --------- | ------------- | ---------- | ----------- | ------------ | ---------- | ----- | ---------- | -------- | -------------- |
| Accecato | Affascinato | Assordato | Indebolimento | Spaventato | Afferrato | Incapacitato  | Invisibile | Paralizzato | Pietrificato | Avvelenato | Prono | Trattenuto | Stordito | Privo di Sensi |

Used as a **status descriptor** — the closed-set lexeme naming a creature's condition state (`è
Afferrato`, `viene Afferrato`, `resta Trattenuto`, `cade a terra Prono`, `il bersaglio Avvelenato`,
inflected for gender/number) — the form is **Title-Case**. Ordinary vocabulary that merely shares a
root stays lowercase: the abstract nouns (`invisibilità`, `paralisi`) and the active verb of the
monster's own action (`l'aboleth ha afferrato una creatura` — the compound past of _afferrare_, not
a descriptor of the target's state).

### Weapon masteries

| Cleave          | Graze             | Nick    | Push   | Sap      | Slow     | Topple        | Vex        |
| --------------- | ----------------- | ------- | ------ | -------- | -------- | ------------- | ---------- |
| Doppio Fendente | Colpo di Striscio | Graffio | Spinta | Fiaccare | Lentezza | Rovesciamento | Vessazione |

### Weapon properties

| Finesse  | Light   | Heavy   | Loading  | Reach   | Two-Handed | Thrown    | Ammunition | Versatile |
| -------- | ------- | ------- | -------- | ------- | ---------- | --------- | ---------- | --------- |
| Accurata | Leggera | Pesante | Ricarica | Portata | Due Mani   | Da Lancio | Munizioni  | Versatile |

Crossbow ammunition (**Bolt**) is **Quadrello**; the thrown **Dart** weapon is **Dardo** — distinct,
per the SRD weapons table.

## Enforcement — the consistency guard

`tests/unit/it-name-consistency.guard.test.ts` (public, SRD-only) and its composed companion
`content-pack/tests/unit/it-name-consistency.guard.pack.test.ts` (cross-repo, pack mode) fail the
build on:

- **Collisions** — two _distinct_ entities sharing one Italian name (the Conjure/Summon class).
- **Untranslated regressions** — an Italian name byte-equal to English, outside the allowlist of
  proper nouns Italian D&D genuinely keeps (Tiefling, Goliath, Halfling, Ranger, Warlock…).
- **Retired-variant regressions** — a superseded old name reappearing as a `name` field.

The guard reads the `name` fields directly, so the JSON stays the single source of truth — this doc
never duplicates the full per-entity list (that would just be a second thing to drift).

## Provenance

Built 2026-07-21 by auditing every SRD `name` field against the official IT SRD 5.2.1 (parsed via
`pypdf`) and every cross-reference in prose against the canonical names: **288 names re-sourced to
their official Italian form** (spells, magic items, equipment, class features, beasts, invocations,
metamagic, feats, backgrounds, languages, proficiencies, weapon properties), **all name collisions
resolved** (Conjure→*Evoca* / Summon→*Richiama*, Bolt→*Quadrello*, Portent→*Auspicio*, …), and
**every prose cross-reference aligned** to the canonical lexeme.

The bilingual **bestiary monster catalogue** (2026-07-24) sources every monster name + statblock
prose from the official IT SRD 5.2.1 (tier 1 — extraction, never a fresh translation); IT prose
reuses the closed-set glossary lexemes (damage nouns capitalized as defined terms, the condition
lexemes verbatim). Monsters join the guard's kind list (`monsters`), so a monster name colliding with
any other entity's Italian name (e.g. the reason the _Mage_ NPC — official IT _Mago_, which the
_Wizard_ class already owns — is deferred, not renamed) fails the build.
