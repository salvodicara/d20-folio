---
"d20-folio": patch
---

fix(build): restore eager chunk cohesion + re-baseline precache for the monster corpus

The bestiary's Compendium-Monsters commit added a top-level `await ensureSrdKind("monster")` to the compendium specs barrel (`picker/specs/index.ts`). A module-level `await` turns that barrel into an async module, which rippled through Rolldown's chunk-merge heuristic and stopped it inlining ~60 shared app-shell modules (popover, dialog, toasts, the stores, StatBadge, the io helpers, icons…) into the entry chunk — fragmenting the eager closure from 14 chunks into 76, shrinking the entry 62.6 → 24.7 KB gz while ~13 KB of chunk wrappers + lost gzip cohesion pushed the eager download 770 → 786 KB gz (over the 773 KB P3 ceiling), and inflating the precache with the extra fragments.

The monster corpus itself was never the eager problem — the data + EN/IT catalogue chunks are correctly lazy. The fix moves the load-before-render gate off the barrel and onto the two runtime consumers of the registry: the compendium route factory (`router.tsx`, awaited in parallel with the route chunk) and the palette's specs `import()` effect (`CommandPalette.tsx`). The specs barrel is now a plain synchronous module, so Rolldown restores main's exact 14-chunk eager shape (measured 771.4 KB gz — **the 773 KB ceiling is unchanged and satisfied; zero eager delta from the bestiary**).

With the fragmentation gone, the remaining precache growth is the legitimate lazy monster corpus (the `srd-monsters` / composed `monsters` data chunks + the EN/IT `monsters` i18n catalogue shards, precached for offline-first). `PRECACHE_CEILING_KIB` is re-baselined 8039 → 8284 KiB (measured 8273.55 on the composed lane + ~10 KiB never-exact-fit headroom; the SRD-only lane measures smaller and passes under the same shared ceiling), with the `docs/ARCHITECTURE.md` "Performance budget (P3)" table updated in the same commit.

No tripwire weakened: M1 (no idle compendium prefetch) and D-2 (the picker index re-exports concrete specs, never the corpus-importing barrel) still stand — the barrel still statically imports the corpus via `monsterSpec`, so the D-2 separation is as load-bearing as before.
