# Clear short-rest input

The owner requested an intuitive, concise short-rest flow on 2026-09-22 as part of
the production recovery. Continue in the existing isolated `fix/simple-play`
candidate; no integration or deployment is authorized.

## Design

Keep the rest chooser and existing rest persistence/recovery boundary. The short
rest form shows current HP, available Hit Dice, a labeled dice-count control, and
one empty field for the physical dice total. Show the exact dice to roll and say
that Constitution is excluded from the input. Show the Constitution adjustment
and actual capped HP outcome separately. One primary button completes the rest;
zero dice explicitly means resting without healing. Cancel changes nothing.

Remove average/range estimates from this flow. An unentered roll must never be
treated as a result of 1. Changing the dice count clears the previous roll. Use
the existing input/button styles, EN/IT, keyboard access and mobile touch targets.
The roll input accepts an empty editing state and reports invalid totals instead
of silently clamping an entered physical result. Preserve effective Constitution,
HP caps, minimum healing and existing short/long-rest recovery mechanics.

### Product reference

[Roll20's documented 2024 rest interface](https://wiki.roll20.net/index.php?action=edit&oldid=34938&title=D%26D_2024)
keeps current HP, available Hit Dice and recovery together before finishing the
rest. Adopt that information hierarchy while retaining Folio's physical dice.
This is a documented pattern, not a claim that the current live UI was inspected.

## Implementation and verification

1. Add failing interaction tests for explicit roll entry, count changes,
   validation, cancellation, zero dice, capped healing and effective CON.
2. Simplify `RestModal.tsx` and the EN/IT rest copy; use existing visual primitives.
3. Update rest browser journeys; check EN/IT, light/dark, desktop/mobile,
   accessibility and persisted HP/dice after reload. Capture curated screenshots.
4. Request a fresh bounded code review per requesting-code-review, resolve
   findings, run focused tests followed by the repository's required gates.
5. Record verification, add one changeset and commit locally. Owner visual review
   remains required before integration; release/deploy is separately gated.

## Status

Implemented in the existing production candidate. The old rest-only
`HealRollEntry` component has no callers and was removed; its CSS remains used by
an unrelated existing manual roll input.

- RED: nine new input-contract cases failed against the previous form.
- Focused checks cover entered healing, count changes, invalid totals, minimum and
  maximum HP, cancellation, zero-dice recovery and frozen async confirmation.
- Browser: 15/15 rest cases passed, including eight locale/theme/viewport journeys
  with axe, keyboard completion and saved HP/Hit Dice after reload.
- Independent read-only review: no Critical or Important introduced regressions.
- Curated Italian dark/light desktop/mobile captures are outside the worktree.
- Final typecheck/build, full lint (zero warnings), i18n check, application suite
  and Functions suite passed. The app suite used four workers and the existing
  15-second allowance for filesystem-heavy fixtures; no assertions were skipped.
- No schema, backend or content-source changes. No integration/deployment.
- Delivery is a local topic-branch commit; visual approval precedes integration.
