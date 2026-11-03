# Forms as a computed layer (2026-11-03)

Edge-case family M2 ([edge cases](2026-11-edge-cases.md)). Owner direction via the Coordinator:
the sheet becomes the beast (RAW), with a beast picker filtered by the druid's limits, one-tap
revert with undo, Temporary HP per 2024 RAW, and spellcasting blocked except Moon's in-form rules.

## Today

Assuming a form (Polymorph, Shapechange, Animal Shapes) **stamps** the beast's AC, speeds and
ability scores into the stored build's override fields, keeping the caster's own values in
`session.polymorphForm.prior` for the revert (`lib/polymorph.ts`, `lib/play/forms.ts`). So:

- the stored build lies while the form lasts, and the breakdown can only say "manual adjustment";
- the beast's defenses and senses never apply, gear keeps granting, and casting isn't blocked;
- Wild Shape is not a form at all (a tracker, Temporary HP and a CR chip).

## The layer

The form becomes **a source in the grants aggregate**, read from the session at derivation time,
never written into the build.

- **Stored state:** a new form is `session.activeForm` (`{ sourceId, beastId, statBlock?, tempHpBefore }`), a new
  optional key. An old stamped form stays `session.polymorphForm` with its `prior`, and its
  existing revert still works until it ends (natural expiry, no migration). A new key, not a
  `prior`-less `polymorphForm`: v0.25.0's parser drops a `polymorphForm` without `prior` and would
  end the form on its next save, while it keeps an unknown key verbatim.
- **`aggregateCharacterGrants`** reads the active form and contributes `aggregate.form`: its name
  for the breakdown ("Wild Shape: Brown Bear"), the ability scores it replaces (all six, or STR /
  DEX / CON when the rule keeps the mind), its natural AC, its speeds. It also contributes the
  beast's defenses and senses as ordinary grants with the form as their source.
- **The readers stay put.** `aggregateAbilityScores`, `computeCharacterAC` and the speed
  derivation already take the aggregate (about 20 call sites), so they read the form through
  it. Build editors keep reading the build, so they show the character's own stats, which is
  right.
- **Precedence:** a hand-set number beats the form, and the form beats the computed number, for
  every number (scores, AC, speeds). Stamping let a hand-set score win but overwrote a hand-set
  AC or speed. A form shows every speed of the beast, even one the character lacks (stamping
  showed only the kinds the character already had).
- **One aggregation session:** the views pass the session itself to the aggregate. They used to
  copy a different subset each, so a new session field reached some views and not others. The
  old rail's memos still narrow it on purpose (render isolation) and list `activeForm`.
- **Proficiency** is the better of the character's and the form's. Merged gear stops granting.
  Casting is blocked by a form grant, with the rule's exceptions (Moon).
- **Wild Shape** declares a `formRule` like the spells (pool: the druid's beast list, CR and
  fly/swim limits by level, keeps INT/WIS/CHA and features, Temporary HP per 2024 RAW). It
  uses the same Transform flow and picker.

## Order

1. Form rules as catalogue data (#569).
2. The layer (done) for the Transform spells: a new form records `activeForm` and stamps nothing; the
   aggregate carries `form`; the readers' tests pin the same numbers as today's stamping.
3. Wild Shape as a form, in parts:
   - **Engine (done).** `druid-wild-shape` carries a `formRule`, and `selfFormRule` reads
     features as well as spells. The druid keeps INT/WIS/CHA. The Temporary HP are the
     best of the form's grants: the Druid level, or a grant marked `forForm`, such as a
     Moon Druid's 3 × level. They stay when the form ends. The form ends on Incapacitated
     (`endsOn`). `formPool` caps the CR from the class table's `wildShapeMaxCR` and allows
     a Fly Speed only from level 8.
   - **The engine ends forms.** `takeDamage` and `addCondition` end a form through
     `endFormIfDue`, so every path ends it: at 0 Temporary HP for Polymorph, and on
     Incapacitated (0 HP included) for Wild Shape.
   - **The form's AC** is the higher of its own AC and an active formula that ignores
     armor (Moon's 13 + WIS, Barkskin's 17).
   - **Gates.** An assumed form lights its source as an active key, so "while in a Wild
     Shape form" is a `while-active` keyed to `druid-wild-shape`.
   - **Casting (done).** A rule with `blocksCasting` (Wild Shape) blocks spells in the
     form. A `form-casting` grant lets some through: everything except a costly or
     consumed Material component (Beast Spells), or the subclass's own spells (Moon).
     The cast law is per spell: `isSpellcastingBlocked(doc, spellId)`. The Moon Druid's
     in-form grants are keyed to `druid-wild-shape`.
   - **Today's UI (done, minimal).** The Wild Shape action carries `assumesForm` and
     opens the Transform picker with `formPool`. The Spells tab's form banner reverts with
     undo. Using Wild Shape again takes a new form, and it never engages Concentration.
     The new UI's picker and revert are lane A's.
4. When no stored character holds a stamped form (a read-only survey), the stamping code and
   `prior` readers can go. That is an owner-gated cleanup, not part of this work.

## Compatibility

`activeForm` is a new optional session key: no migration. A v0.25.0 client keeps it verbatim (it
preserves unknown session keys) but doesn't apply it, so on that client the sheet shows the
character's own stats while the form lasts. Nothing is lost, and the next v0.26 client applies it
again. The v0.26.0 draft notes it.
