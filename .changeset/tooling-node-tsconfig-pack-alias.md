---
"d20-folio": patch
---

Map `@pack` to the SRD-only stub in `tsconfig.node.json`. The new beast-projection scripts type-import the engine types, which drags the `@/i18n/srd-en` → `@pack` chain into the node tsconfig program (`scripts/**` is in its `include`) — and its `paths` mapped only `@/*`, so `tsc -b` could not resolve `@pack`. Add `"@pack": ["./src/data/pack-empty.ts"]` (the typed-empty stub, mirroring `tsconfig.srd-only.json`), keeping the scripts typecheck pack-agnostic. Tooling-only; no runtime or user-facing change.
