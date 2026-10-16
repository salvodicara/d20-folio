---
name: srd-boundary
description: Keep private (non-SRD) content out of the public repo and the public build. Use when a change touches src/data, src/i18n srd catalogues, the @pack seam, content-pack/, or adds rules content.
---

# SRD boundary

Public code and data carry only SRD 5.2.1 (CC-BY-4.0). Everything else lives in the private
`content-pack/` (repo `salvodicara/d20-folio-content`) and reaches players only through the `@pack`
seam: bundled in dev and tests, downloaded at runtime by allowlisted accounts in production.

1. **Place the content.** SRD entries go in `src/data` and `src/i18n/*/srd`; anything else goes in
   the pack. When unsure whether something is SRD, it goes in the pack.
2. **Prove the public build.** `just ci-srd-only` (typecheck, tests and build with the empty pack).
   Done when it is green.
3. **Prove the composed build.** `just ci` with `content-pack` linked. Done when it is green.
4. **Move the pack with the seam.** If a type, export or path the pack consumes changed, update
   `salvodicara/d20-folio-content` in the same change. Done when both repos are green together.
5. **Leak check (runtime pack).** After an emit and a `VITE_CONTENT_PACK=runtime` build:
   `node scripts/pack/check-public-bundle.ts dist <emittedPackDir>`. Done when it prints ✓.

Reference: `docs/ARCHITECTURE.md` → "The content-pack seam". The pack's art and text are never
copied from the internet; original art only.
