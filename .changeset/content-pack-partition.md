---
"d20-folio": minor
---

Partition the D&D database for licensing: `src/data` + `src/i18n/*/srd` now carry ONLY SRD 5.2.1 (CC-BY-4.0) content — every entry `source: "SRD"`, PI-term denylist guard-enforced — while the 847 non-SRD entries (the Artificer, non-SRD subclasses/feats/spells/species/backgrounds/magic items, the 20 maneuvers) move into the private `content-pack/` with their i18n, team fixtures, dev scenarios, and pack-only suites. The composed (pack) build matches the pre-split app: an overlay restores the 18 PHB creator names (published publicly under their SRD 5.2.1 print names, EN + IT from the official IT SRD), the full Elven Lineage / Pact of the Chain prose, and the pack-owned chrome labels; the engine's setting feat-category/scope vocabulary is renamed to the generic `heritage` (not persisted in any saved character). Both build modes gate green (`just ci` / `just ci-srd-only`).
