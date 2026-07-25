---
"d20-folio": patch
---

feat(identity): the chrome reset, phase 2 — one material, measured

Every container in the app is now built from ONE plate material instead of two
independently-authored depth grammars stacked on each other. A plate is four tonal events —
**moat → metal → groove → body** — plus ONE elliptical specular dome at (50%, 30%), in one of
exactly **two tiers** that differ only in light.

- **The dome ships in BOTH themes.** It used to be `none` in dark, so the flagship theme's plates
  were the only undomed ones in the system; its falloff **is** the vignette and **is** the basin, so
  the panel's separate smoke-vignette layer and every inset-haze "basin" go with it.
- **There is no cream inner lip anywhere.** Inside a frame is darkness; a plate brightens away from
  its edge because of the dome, not because of a highlight. (The light masthead used to resolve
  three independent cream top-highlights on one 1px edge.)
- **Two tiers.** Quiet — cards, panels, rails: 1px metal, the near seat. Earned — dialogs, the
  identity band, the realm masthead, the codex leaf: 2px metal, the far seat. Four shadow terms per
  plate, where the doubled grammars used to resolve to ten.
- **One recipe, two strikes.** `.folio-panel`'s two 30-line per-theme material blocks collapse into
  a single rule; the whole light delta is now four colour roles in tokens (the dome, the grain, the
  groove, the cast). The light groove is warm umber, never black — a black groove on cream reads as
  grime on vellum.
- **The dome's ink cost is paid.** `--text-muted` `#988b6e` → `#ae9f7e`: on the worst measured
  composite (surface-2 at `--panel-alpha` over the brightest glyph-scale backdrop region) a 10% dome
  left the old value at 3.58:1, under AA. The new value measures 4.62:1 there, 5.24:1 on a plain
  domed plate and 5.43:1 on the game rail. `verdict-ink-contrast.test.ts` now composites the dome
  term, so the floor is computed against the plate the app actually paints.
- **A state never costs a surface its substance.** `.ch-card:focus-visible`, `.ch-card.retired:hover`
  and `.ch-card[data-selected]` were each replacing the whole `box-shadow` and silently stripping the
  material; selection now reads as light and colour only (full-accent metal + the earned seat), with
  no inner ring.

New guard `chrome-system.guard.test.ts` pins the closed set of primitives, both theme strikes, the
no-cream-lip law, the single dome, the two tiers, and — the load-bearing one — that the plate edge
and the legacy `--elev-*` stack may never coexist on one element.
