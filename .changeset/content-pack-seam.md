---
"d20-folio": minor
---

Introduce the content-pack seam — the licensing partition that precedes open-sourcing: a single build-time `@pack` alias composes the private `content-pack/` package (or a typed-empty stub) into every SRD data/i18n aggregate, with strict id-collision guards, pack-only test lanes, an SRD-only build/test lane (`just ci-srd-only`), and the personal team fixtures relocated into the pack.
