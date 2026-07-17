---
"d20-folio": minor
---

feat(identity): the Gilded Reliquary — wave 1 of the owner-ratified full-BG3 fidelity push

Every hero frame in the app now wears BG3's worked-gold menu framing, struck in the committed
lapidary vocabulary. A faceted corner gem seated inside the mitre — clear of the `--radius-xl`
corner curve so it reads whole on clipped and unclipped hosts alike, never a chipped tip — a
tapered hairline arm along each edge ending in a diamond finial, and a shorter echo hairline cap the three EARNED
hero registers — the framed realm masthead (roster, campaigns, compendium, settings, admin,
campaign hub), the gilt cockpit identity band, and every dialog. One per-theme SVG
(`--frame-ornate`) rendered through `border-image` on an overlay pseudo: dark strikes bright
gilt; light strikes the crest's engraved burnished bronze — designed, never adapted.

With it: engraved ceremonial titling (`--engrave-title` — page/modal titles and the cockpit
name read struck into the plate in dark, letterpressed into vellum in light; never gradient
text), the modal head's seat rule now fades at both tips (the `.sec-rule` idiom instead of a
wall-to-wall border), and the folio panels gain candle-smoke (dark) / morning-shade (light)
edge vignettes so every panel reads top-lit material. All recipe-level and asset-independent;
constitution bumped to v1.8 recording the ratified push.

The two `--frame-ornate` SVGs are shipped size-lean: diagonal-mirror path dedup (one reflected
`use`), quarter-coord rounding, and raw `<>` trim each ~45% with pixels unchanged at render
scale. Landing alongside main's same-day rules-text colour grammar still leaves the closure
within gzip/build noise of budget, so both perf ceilings gain a single minimal step for
deterministic headroom — `EAGER_CEILING_KB` 755 → 756, `PRECACHE_CEILING_KIB` 7150 → 7151
(the per-theme second SVG copy cannot dedup on disk) — baseline doc updated in the same commit.
