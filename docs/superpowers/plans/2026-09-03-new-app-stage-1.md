# New app — stage 1 program plan (2026-09-03)

Owner: the steering in `PRODUCT.md` §Steering. This plan turns the first milestone — one whole
session of the group inside the app — into ordered stages on the long-lived branch `v2`. Each
stage gets its own written plan (superpowers writing-plans) when it starts; this document fixes
the order, the gates and what is out.

## Ground rules for `v2`

- `main` = production. Fixes only, released by the owner as today. `v2` never merges into `main`
  until the milestone is reached; `main` fixes are cherry-picked into `v2` when relevant.
- Every `v2` change is owner-approved visually when it changes a screen (golden rule 25) and goes
  through `just ci`; the pack twin (`content-pack/`) moves in the same motion (rule 28).
- Staging is mandatory before anyone plays on `v2`: a separate Firebase project on the free tier
  (owner creates it in the console: Firestore, Auth with Google, Storage, Hosting), the six team
  fixtures seeded anonymised, emulators in CI, the £1 kill-switch armed. `v2` never touches the
  production project.
- The four acceptance stories in the steering are the scope test; golden replays of stories 1 and
  2 are the engine's acceptance tests.

## Stages, in order

0. **Safety gate (blocking).** Migration P1 items 1–3 from
   `docs/superpowers/plans/2026-09-02-combat-p1-data-safety.md`: closed-world codec with unknown-key
   preservation, `instanceId` on custom equipment/spells/features, per-domain sync so conflicts
   surface. Dry-run against the six fixtures and a production export. Nothing else ships before.
1. **Dice seam.** `roll(formula, {by, reason, hidden, mode})` persisted as a log action with
   faces, total, seed, roller, source (`app | manual`); three inputs (in-app, manual entry, hidden
   DM). Numbers and a log line first; the shared 3D animation is a later stage.
2. **Positions and areas in the aggregate.** `position` on entities, `area` in the mechanic
   vocabulary (sphere, cone, line, cube, cylinder); reach, range band, area membership and
   "who left reach" derived with provenance `derived`, declared facts as the fallback.
3. **Reducer for the two story encounters.** From `src/lib/combat`: move, weapon attack,
   cantrip and levelled area save spell, monster multiattack via an adapter over the typed stat
   blocks, conditions, concentration, damage and 0 HP, opportunity-attack window, `override`,
   `undo`, the three campaign automation levels. Golden replays for Marco's turn and Sara's ambush.
4. **Shared encounter document.** `campaigns/{id}/encounters/{eid}` append-only log, one
   listener per client, rules reduced to identity, membership, ownership and shape for that
   collection.
5. **Minimum map.** Background upload (compressed, per-campaign quota), square grid with scale,
   tokens bound to entity ids, drag with a Foundry-style ruler, rectangle fog, hidden tokens.
   No scenes, layers, drawing, pointer, walls, vision or lighting yet.
6. **One play surface.** Dossier 14 as approved in direction: initiative strip, map, hotbar of
   the selected entity, log with undo, DM drawer with hidden/fog/HP editor. Old `PlayTab`,
   `CombatResolver`, `TurnEconomyProvider` stay unreferenced until the surface works, then die.
7. **Cuts.** Delete the mechanics kernel and its tests, the command kernel, the program
   supervisor, the dev scaffolding routes, POSITIONING.md and the superseded plans, the atlas
   authority — once nothing reads them (rule 10). Salvage typed data and coverage knowledge.
8. **The rest of the session.** Character screen in the BG3 grammar (dossier 15), campaign home
   with session card and calendar, notes and recap, chronicle from the log, loot and gold,
   handouts, typed homebrew forms, 3D dice, compendium explain-on-demand, phone second screen.
   Ordered by the jobs table in `PRODUCT.md` once the community research lands.

## Gates

- Stage 0 done = fixtures round-trip byte-identical and a production export dry-run reports zero
  drops.
- Stages 1–4 done = both golden replays pass on the emulator with two clients (DM and player)
  folding the same log; an override and an undo from each side.
- Stage 5–6 done = the group plays one combat on staging without Owlbear; owner screenshots
  approved.
- Milestone = one whole session on staging; then release planning (`docs/RELEASE.md`).

## Out of stage 1

Sheet redesign, level-up rebuild, journal, scheduling, typed homebrew UI, 3D dice animation,
table-play shared display, the name decision.
