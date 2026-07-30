---
"d20-folio": patch
---

The pack bestiary rides its own lazy alias instead of the `@pack` barrel — the MM wave-2 blocker is
gone.

`src/data/monsters/index.ts` is lazy and forbids eager importers, but it composed `packMonsters`
from `content-pack/index.ts`. That barrel is eager-reachable (the always-eager Grant engine reads
`packFeats`/`packSpells`/… through it), and Rolldown places whatever a barrel re-exports in the
eager chunk regardless of the `manualChunks` bucket the source module claims — so the pack's
monster corpus was double-shipped into the eager `cockpit-engine` chunk. Harmless for a
fixed-size export; fatal for a corpus that grows (the 10-statblock wave-1 pilot cost 1.24 KB gz
eager against 1.12 KB of remaining headroom, and 163 more were queued).

`packMonsters` is now served by the pack's ONE sub-entry alias, `@pack/monsters`
(`packMonstersAliasTarget()` in `scripts/content-pack-mode.ts`, mirrored in the vite/vitest alias
maps and the three tsconfig `paths`; SRD-only resolves it to the same typed-empty stub), and is
removed from the barrel — so the corpus is reachable only from the lazy aggregate. Measured on one
app SHA with one pinned pack worktree, only the seam varying: eager closure 777.87 → 776.50 KB gz
across the same 14 chunks (`cockpit-engine` 387.7 → 386.3), entry unchanged at 61.81, precache flat
at 9044 KiB / 301 entries, and the pilot's ids are absent from every eager chunk. Ceilings are
unchanged — they are ratchets, not trackers. No user-visible behaviour change.
