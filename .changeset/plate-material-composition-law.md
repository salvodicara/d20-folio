---
"d20-folio": patch
---

fix(identity): compose the plate material into every state that replaced box-shadow

`box-shadow` is a single REPLACED property, so any higher-specificity or later rule that sets it on
a plate-bearing selector silently deletes the whole plate grammar (edge + basin). Five states shipped
stripped and are now composed back:

- `[data-theme="light"] .combat-current` — the light twin of the already-fixed shared rule; the
  active combatant shed its hero edge in light only.
- `[data-theme="light"] .ch-card:hover` — out-specified the shared hover, so the documented
  quiet→hero promotion never happened in light (and the basin went with it).
- `[data-theme="light"] .info-card` — light info cards shipped with no edge lip and no basin at all,
  permanently.
- `[data-theme="light"] .page-head.framed` — the light framed masthead lost `--plate-edge-hero`.
- `.ch-card[data-selected]` (both themes) — later than `:hover` at equal specificity, so a selected
  roster card had no plate material.

Also: `.ch-card:focus-visible` regains `--plate-basin` at the same list position as rest/hover, so
the basin does not vanish on focus and the box-shadow transition stays interpolable (mismatched
inset-ness at a list position forces CSS to animate the whole shadow discretely).

Pinned by a new STRUCTURAL assertion in `plate-grammar.guard.test.ts`: every declaration block in
`folio.css` is parsed, and any rule that sets `box-shadow` on a plate selector without composing a
`--plate-*` token fails the gate (documented exemptions: pseudo-element subjects and the
`.info-card.tip` opt-out). Re-run against the pre-fix stylesheet it reports exactly these five.

Doc corrections in the same pass: the dark `.folio-panel::before` no longer layers the dead
`var(--plate-sheen)` (dark's sheen is guard-pinned to `none`) and its comment no longer claims the
composite-floor guard models a sheen it has no term for; `DESIGN.md` §4 / `PROGRESS.md` drop the
wrong "eager budget" rationale for the no-painted-9-slice-frames non-goal (bitmaps land in the PWA
precache, not the eager closure) and `PROGRESS.md` stops restating §4's non-goals verbatim.
