---
"d20-folio": patch
---

chore(campaign): difficulty-calc convergence — doc truth + comment hygiene + shrink

Three review findings on the XP-budget difficulty calculator, applied together:

- **PROGRESS.md doc truth.** The new difficulty-calculator SHIPPED clause had absorbed the
  pre-existing "competitive map is `docs/POSITIONING.md`" tail into the wrong parenthetical, where it
  dangled. Reworded so both clauses stand cleanly (rule 16).
- **Comment hygiene.** Stripped the spec-review-cycle "(correction N)" tokens from
  `party-encounter.tsx`; dropped the new §D.x refs that collided with the file's pre-existing
  initiative-spec §D.3 taxonomy (kept the rationale as plain prose); and re-cited the
  `encounter-difficulty.ts` XP-budget table (and its test) by SRD section name rather than a
  line-range extract that isn't in the repo.
- **Shrink.** `EncounterBudgetReadout` now computes the verdict glyph inside the `verdict !== null`
  branch — the outer nullable const forced a dead `? … : undefined` check the total record can never
  hit — and drops the redundant `aria-hidden` the Badge already applies. `encounter-bestiary.tsx`
  hoists `const lairXp = m?.xpInLair` so the `!= null` narrowing survives into the toggle callback,
  removing the unreachable `?? monsterXp(m)` fallback.
