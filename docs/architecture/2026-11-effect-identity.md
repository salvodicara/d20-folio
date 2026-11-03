# Effect identity and stacking (2026-11-03)

Edge-case family M10 ([edge cases](2026-11-edge-cases.md)). SRD 5.2.1, "Combining Game Effects":
different game effects stack, but the same effect from more than one source applies once, the most
potent.

## The rule in the fold

`evaluateGrants` records each rule's source. `sameEffectsDontStack` runs before `foldRules`.

- **Identity.** A source's identity is its catalogue entry (`ref.kind:ref.key`). A source with no
  entry (homebrew) is identified by its English name, so a 2014 homebrew copy of Shield of Faith is
  the 2024 spell.
- **The rewrite.** In an identity with more than one source, each numeric `add` rule becomes a
  `max` (a penalty a `min`) in a bucket of its own (`same:<identity>:<stack>`), so the fold keeps
  the most potent and `ruleParts` names it.
- **What it leaves alone.** Different identities, flags and ability terms, and every rule of a
  single source.

## Cases

Two clerics' Shield of Faith (+2, not +4), two paladins' Auras of Protection (+3, the higher), two
attuned Rings of Protection, and a homebrew copy beside the catalogue spell.

## Next

Same-name effects that live outside the grant fold: two Slow-mastery speed reductions from encounter
effects, and the recipient's choice when two effects of one name differ in kind.
