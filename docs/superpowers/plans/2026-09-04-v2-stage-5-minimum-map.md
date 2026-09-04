# Stage 5 — the minimum map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the table something to look at, on the data stage 4 already shares: a background
image in Storage, a square grid aligned to it, tokens bound to entity ids, drag with a
Foundry-style ruler, rectangle fog and hidden tokens — all folded from the encounter log.

**Architecture:** `docs/superpowers/specs/2026-09-04-v2-stage-5-minimum-map-design.md`. The
map's persisted facts are log actions: two new `table` ops (`map`, `fog`) folded into
`FoldedState.map`, plus the direct-patch override paths `position` and `reveal.*`. The pure kernel
gains `src/lib/combat/map.ts` (rect geometry, fog fold, `planDrop`, `mapView`). Persistence gains
one Storage adapter (`src/lib/map-io.ts`, explicit `FirebaseStorage` like `combat-io`), a moved
pure compressor (`src/lib/image-compress.ts`) and one `storage.rules` block. The surface
(`src/features/play/map/MapCanvas.tsx`, SVG, no new dependency) is built on a proposal branch and
waits for the owner's screenshot verdict (golden rule 25).

**Tech Stack:** TypeScript (strict), Vitest (fast + slow lanes), Firebase Web SDK
(`firebase/storage`), `@firebase/rules-unit-testing` on the Firestore + Storage emulators, React 19
with SVG for the surface. No new dependencies.

**Gates:** `just ci`, `pnpm test:rules` (mandatory — `storage.rules` changes), `pnpm build &&
pnpm test:budget`, `just ci-srd-only` (public modules change). Under 15 minutes combined.

## Decisions taken by this plan

Recorded in `docs/PROGRAM_STATUS.md` by task 6; each is argued in the spec.

1. The map lives on the encounter document (spec §2). No sibling document, no second codec.
2. Positions change through `move` (in-turn, budgeted) or `override position` (placement; the
   `log-only` seam closes here, not at stage 6). A placement recomputes relations and opens no
   window.
3. Fog has one representation: covered-except-revealed rectangles, capped at 256 entries;
   `reveal`/`hide` on an uncovered map are rejected.
4. `reveal.token` joins `Entity.reveal`; `reveal.*` become direct-patch override paths. The
   concealment is by presenter (`mapView`), the same posture as hidden roll faces.
5. `FEET_PER_CELL` stays 5 ft; chessboard only; no token footprint yet (spec §10).
6. Storage: `campaigns/{id}/maps/{mapId}.jpeg`, DM/admin write, member read, 8 MiB per file by
   rule, 100 MiB per campaign by the adapter from `listAll`, JPEG 0.85 at ≤ 4,096 px.
7. Bounded `rolls` is deferred to stage 6 with the map's measured cost (~270 nodes).
8. The surface integrates only after the owner's screenshot verdict; the engine integrates on
   review and green gates.

## Task 1 — types, rectangle geometry, fog fold, the two table ops

- [ ] `src/lib/combat/types.ts`: `MapRect`, `MapBackground`, `MapState`, `FoldedState.map`,
      `Entity.reveal.token`, `TableOp` members `map` and `fog` (shape as in spec §3).
- [ ] `src/lib/combat/fold.ts` `initialState()` and `tests/unit/combat/__helpers__/state.ts`
      `emptyState()`: `map: { background: null, fog: { covered: false, revealed: [] } }`;
      `__helpers__/entities.ts`: `reveal.token: true` (option `hidden?: boolean`).
- [ ] TDD `src/lib/combat/map.ts`: `isMapRect` (integers, `w,h ≥ 1`, |coords| ≤ 10,000),
      `rectContains`, `rectIntersects`, `subtractRect(a, b): MapRect[]` (≤ 4 pieces), `revealRect`,
      `hideRect`, `cellUnderFog(fog, cell)`, `FOG_RECT_CAP = 256`, `isMapBackground` (finite
      positive integers, `cellPx ≥ 8`, `width/height ≥ cellPx`).
      Tests: `tests/unit/combat/map.test.ts` (difference cases: disjoint, contained, overlap on
      each side, identical; normalisation on reveal; cell membership).
- [ ] TDD `src/lib/combat/table.ts`: `map` (accept/replace/clear, reject malformed), `fog`
      (`cover` true/false, `reveal`, `hide`, reject on uncovered map, reject past the cap, reject
      a malformed rect). Tests in `tests/unit/combat/resolve.table.test.ts` (new `describe`).
- [ ] `coverage.ts` / `canonical-order` / any exhaustiveness switch compiles (`pnpm typecheck`).
- [ ] Run `pnpm test --run tests/unit/combat`; commit `feat(combat): map and fog table ops on the
folded state` with a changeset.

## Task 2 — `override position` and `override reveal.*`

- [ ] `src/lib/combat/reposition.ts`: split `repositionRelations` into `recomputeRelations(state,
mover) → { state, left: EntityId[] }` and the window-opening wrapper the `move` step keeps
      calling (same behaviour, same tests green).
- [ ] TDD `src/lib/combat/override.ts`: `patchDirectOverride` handles `position` (`{x,y}`
      integers or `null`; anything else patches nothing) and `reveal.token|block|hp` (booleans);
      `applyOverride` recomputes relations after a `position` patch and opens no window; the
      movement budget is untouched. Tests in `tests/unit/combat/resolve.override.test.ts`: place
      adjacent → `adjacent` relation appears; place away from an adjacent foe → relation gone, no
      window, no `entity-left-reach` event; `null` clears position and relations; `log-only`
      table applies it (contrast: `move` is withheld); hidden toggle.
- [ ] Commit `feat(combat): position and reveal.* as direct-patch override paths` + changeset.

## Task 3 — the drop policy and the concealment projection

- [ ] TDD `planDrop(state, { entity, to, actor: { uid, dm } })` in `map.ts`, exactly the spec §5
      table (first matching row wins); `remainingMovement(entity)` shared with the ruler.
- [ ] TDD `mapView(state, viewer: { uid, dm })` → `{ background, fog: { covered, revealed } |
null, tokens: [{ id, position, hidden, current, controller, kind, label, hp, maxHp }] }`
      per spec §6 (hidden unless DM/controller; under fog invisible to a player unless own; DM sees
      all).
- [ ] Tests: `tests/unit/combat/map.policy.test.ts`. Commit `feat(combat): drop policy and the
map's viewer projection` + changeset.

## Task 4 — codec, the property round-trip, the golden replay

- [ ] `src/lib/combat/codec.ts`: `mapRectSchema`, `mapBackgroundSchema`, `mapStateSchema` in
      `foldedStateSchema`; `reveal.token`; the `map` and `fog` table-op schemas. Example round-trips
      in `codec.test.ts` (a fogged checkpoint; a `fog` and a `map` action; a hidden entity).
- [ ] `tests/unit/combat/codec.property.test.ts`: a seeded PRNG (mulberry32) generator over
      every action kind and table op, entities with/without position, checkpoints with a populated
      `map`; 300 cases; `parseEncounter(encounterWriteData(e))` deep-equals `e`. Also: a mutated
      document (one known key removed) never parses `ok`.
- [ ] `tests/unit/combat/replays/map-fog-and-hidden.json`: Sara's ambush opening, `table:map`,
      `fog cover`, two `reveal`s, a `hide`, the wolf placed hidden by the DM (`override position` + `override reveal.token false`), the DM reveals it, the wolf moves in its turn; expected
      `map`, positions, relations and rejections (one `reveal` on an uncovered map before the
      cover, rejected).
- [ ] Commit `feat(combat): the map in the codec, with the §8 round-trip property test` +
      changeset.

## Task 5 — the Storage seam and the rules lane

- [ ] Move `compressImage` to `src/lib/image-compress.ts`; update the four importers and
      `src/lib/storage.ts` (no re-export). `pnpm typecheck`.
- [ ] `src/lib/map-io.ts` (takes `FirebaseStorage`): `MAP_MAX_PX = 4096`, `MAP_QUALITY = 0.85`,
      `MAP_MAX_BYTES = 8 MiB`, `MAP_QUOTA_BYTES = 100 MiB`, `mapBackgroundPath(campaignId, mapId)`,
      `campaignMapUsage(storage, campaignId)` (`listAll` + `getMetadata`, sum of `size`),
      `uploadMapBackground(storage, { campaignId, blob, width, height, cellPx, origin, now usage })`
      → `MapBackground` (refuses over `MAP_MAX_BYTES` or over quota with a typed error),
      `deleteMapBackground(storage, path)` (ignores not-found). `newMapId()` is `crypto.randomUUID`
      (register in `dice-randomness.guard`'s id allowlist).
- [ ] `storage.rules`: the `campaigns/{campaignId}/maps/{fileName}` block (spec §7).
- [ ] `tests/rules/storage-rules.test.ts`: the map matrix (DM create; member create denied;
      member read; non-member read denied; admin create/read/delete; DM delete; oversize denied;
      non-image denied; `list` by member).
- [ ] `tests/rules/map-io.emulator.test.ts`: upload → returned `MapBackground` (path/url/bytes);
      usage sums two uploads; refuse past the quota (inject a small quota); delete.
- [ ] `tests/rules/encounter-io.emulator.test.ts`: the concurrent-append case — DM and player
      append in the same `Promise.all`, and one client appends ten actions in one burst; the stored
      log holds every id and both clients fold to the same state.
- [ ] `pnpm test:rules` green. Commit `feat(map): the Storage seam for campaign map backgrounds`
      (+ `test(rules): contended appends land and fold identically`) with changesets.

## Task 6 — documents, gates, integration, staging

- [ ] Reconcile: design spec §2.1 (`map` on the folded state; `reveal.token`), §2.2 (`reveal`),
      §3.1 (`map`/`fog` ops, `OverridePath` gains `position`, `reveal.*`), §5.1 (Storage row),
      §5.4 (Storage rules paragraph); `docs/ARCHITECTURE.md` (Storage paths, the map adapter);
      `docs/TEST_PORTFOLIO.md` (counts, the property test, the new replay, rules-lane files);
      the stage-1 plan item 5 status; `docs/PROGRAM_STATUS.md` → "`v2` — stage 5" (done,
      rulings, deferred, gates, what the gate proves, out of stage 5).
- [ ] Independent review of the whole engine diff (reviewer subagent, no session context); fix
      Important findings.
- [ ] Gates: `just ci`, `pnpm test:rules`, `pnpm build && pnpm test:budget`, `just ci-srd-only`;
      record the numbers.
- [ ] Rebase on fresh `origin/v2`, push `HEAD:refs/heads/v2`, verify with `git ls-remote`.
- [ ] Staging (owner-permitted 2026-09-04 for staging only): `firebase deploy --only firestore
-P staging`; `--only storage` only if the staging bucket exists (Blaze) — otherwise record
      the blocker for the owner. Never `-P default`.

## Task 7 — the surface (proposal branch `v2-stage5-map-surface`)

- [ ] `src/features/play/map/geometry.ts`: `cellToPx`, `pxToCell` (snap), `rulerFor(from, to,
remainingFt)` → `{ cells, feet, tone: "ok" | "dash" | "over" }`; fast-lane tests.
- [ ] `src/features/play/map/MapCanvas.tsx` (SVG): props `{ view: MapView, actor, onDrop(plan),
onFog(change), tool }`; layers per spec §8; pan/zoom local; drag with the ruler; fog
      rectangle drawing (DM); player-view toggle; hide/show on the selected token (DM); the
      read-only scale badge. i18n keys in `src/i18n/{en,it}` (`map.*`). Tooltips on every control
      (rule 40).
- [ ] `src/app/routes/map-dev.tsx` + `router.tsx` DEV route `/_map`: folds a fixture log (Sara's
      ambush + map ops) into `MapCanvas` with a procedurally drawn background (canvas → data URL),
      appends to an in-memory log so drags and fog are live; a DM/player switch.
- [ ] Slow-lane tests `tests/unit/map-canvas.test.tsx`: render tokens/fog/hidden; a drag emitting
      `move`, one `place`, one refused; player view hides the hidden wolf.
- [ ] Screenshots (Playwright, real Chromium, 1440 × 900 and 1024 × 768; dark + light; IT + EN):
      DM view with fog and a hidden token, player view, mid-drag ruler within budget and over
      budget, the fog rectangle being drawn. Sent as chat images. Commit on the proposal branch,
      push `HEAD:refs/heads/v2-stage5-map-surface`.

## Task 8 — handoff

- [ ] Rewrite `docs/superpowers/plans/2026-09-04-v2-next-session-handoff.md` for stage 6 (or for
      the surface's verdict, if pending), paste its prompt block as the last message.
