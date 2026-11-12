# Lazy SRD content: ticket breakdown (2026-11-12)

The new UI's performance pass (#1041) left one big lever: the eager bundle every first
visit downloads before anything paints. Measured on a mid-range phone profile (4× CPU,
~1.6 Mbps, 150 ms RTT, production build, gzip): eager closure 746 KB gz, first paint
4.5 s, the roster's first character name at 9.1 s, Play's at 12.7 s.

## Does it hurt every visit?

No, mainly the first one. On a repeat visit, with the assets already cached (as the
service worker's precache serves them), the same profile gives a first paint at 0.6 s,
the roster's name at 2.3 s and Play's at 2.5 s. The cost is download, not parse: it falls
on a new player, a new device, and the first visit after each deploy (new hashes).

## Why the SRD catalogue is eager

`srd-content` (spells, magic items, equipment, 227 KB gz) is reached statically from the
entry through the save store:

- `main.tsx → saveStore → firestore.ts → character-read → combat-effects → data/spells`
  (and `→ resolve-grant-sources → data/equipment → weapons, armor, gear`);
- `firestore.ts → sanitize-session → item-resources → homebrew-items → data/magic-items`;
- the English SRD text, `i18n/index → srd-en` (eager by design: the engine reads it
  synchronously).

## Tickets (in order; each is behaviour-neutral, proven by the eager-graph guard)

1. **The save store stops importing `firestore.ts` statically.** It only needs the save
   status; the persistence module loads with the first sheet. Add `src/lib/firestore.ts`
   to `eager-graph.guard`'s off-first-paint list. Likely the largest single cut.
2. **`character-read` stops pulling the effect engine.** Split the document-metadata
   reader (what the roster needs) from the effect-aware reader (what the sheet needs).
   Guard: `src/lib/combat-effects.ts` off first paint.
3. **`sanitize-session` stops pulling the magic-item catalogue.** The homebrew-item
   lookup it needs moves behind the sheet's lazy boundary. Guard:
   `src/data/magic-items/index.ts` off first paint.
4. **Re-measure and re-baseline.** Rebuild, rerun the paint harness (cold and warm), lower
   `EAGER_CEILING_KB` in `bundle-budget.guard` to the new measure plus headroom, and
   record the numbers here.
5. **(Later, larger) English SRD text per kind.** Make the eager `srd-en` catalogue lazy
   per kind (as monsters already are), starting with the kinds the shell never reads.
   Needs the engine's synchronous reads audited first; only after 1–4 land.

Expected after 1–3: about 227 KB gz less on first paint (eager ~520 KB), roughly a second
less to first paint on the profile above, more on a slower link.
