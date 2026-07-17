---
"d20-folio": patch
---

test: strengthen vacuous presence matchers + drop dangling visual.spec.ts references

Converts three standalone `getByTestId(...).toBeTruthy()` / `getByText(...).toBeTruthy()` presence
checks (turn-economy-undo, level-up-wizard) to the idiomatic `toBeInTheDocument()` — it verifies the
node is attached, not merely that the query returned truthy. Also removes the dangling references to
a long-deleted `visual.spec.ts` from `visual-full.spec.ts`'s header (broken cross-references are a
bug, golden rule 16); `visual-full.spec.ts` is the sole baseline suite, gated via `visual-gate.ts`.
