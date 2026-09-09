# Stage 5 design — the minimum map

Addendum to `2026-09-02-total-combat-automation-design.md` §1 ("the map is part of the table"),
§2.1–§2.3, §3.1 and §5, and to the stage-2 addendum
(`2026-09-03-v2-stage-2-positions-areas-design.md`). Scope: item 5 of the stage-1 program plan —
background upload (compressed, per-campaign quota), square grid with scale, tokens bound to entity
ids, drag with a Foundry-style ruler, rectangle fog, hidden tokens. **No scenes, layers, drawing,
pointer, walls, vision or lighting.** The §1 sentence is the whole scope boundary.

## 1. Evidence (giants' shoulders)

All captures and the checklist are in
`docs/superpowers/research/2026-09-03-vtt-play-screen-observations.md`; the approved renditions
are dossier 14 (`v8-play*.png`, outside the repository) and the UI spec's rules 33–34 and ledger
§10a.

- **Owlbear Rodeo 2** — the model for the map itself. Fog is one toolbar: fill (cover everything),
  cut/reveal shapes, hide, erase, and a GM "preview as player" toggle; shapes snap to the grid.
  Grid controls live behind a scale badge ("5ft"): cell size in image pixels, alignment offset,
  scale, measurement type (Chessboard for 2024). Hidden tokens: an eye on the token; players do not
  see hidden items, nor items under fog. Image storage: 200 MB free per GM, images resized and
  re-encoded on upload; only the GM needs storage, players join free.
- **Foundry VTT v13** — the model for the ruler: dragging a token draws the path from its origin
  with a distance label, coloured by the mover's movement budget (within remaining movement, needs
  Dash, beyond). Chessboard distance in a 2024 world.
- **D&D Beyond maps** — the fallback pattern for fog: the DM paints reveal rectangles over a fully
  fogged map; hidden tokens render as a hatched circle to the DM and are absent for players.
- **This engine** — `Entity.position` (integer cells), Chebyshev distance × 5 ft, the four-band
  range ladder and area membership already exist (`src/lib/combat/position.ts`); the `move` step
  spends the movement budget and opens the opportunity-attack window on a real departure. The map
  is the surface over exactly this data; nothing here re-derives geometry in a view.

## 2. Decision 1 — the map lives on the encounter document

The map's persisted facts are **actions in the encounter log**, folded into `FoldedState.map`:

- the background reference and grid are a `table` op (`map`);
- fog is a `table` op (`fog`) with three changes: `cover` (fog on/off for the whole map),
  `reveal` (a rectangle of cells), `hide` (a rectangle of cells);
- a token's position is `Entity.position`, changed by the `move` step in the mover's turn or by an
  `override` of the new direct-patch path `position` (the DM placing a token, a controller placing
  their own token before turns begin, and every move at the `log-only` level);
- a hidden token is `Entity.reveal.token === false`, changed by an `override` of `reveal.token`
  (the same direct-patch treatment `reveal.block` and `reveal.hp` gain in this stage).

Nothing ephemeral is persisted: the in-flight ruler, the cursor and the fog rectangle being drawn
live in the component; only the committed destination or rectangle becomes an action.

**Trade-off, stated.** A fog rectangle is ~15 nodes and a placement ~14, the same order as an
intent; a realistic table (40 fog rectangles, 8 positioned entities) adds ~270 nodes to the
checkpoint's state against the codec's 50,000-node budget, and the 200-action compaction trigger
absorbs the append rate. In return the map inherits undo, attribution, one listener, one fold and
the two-client determinism proof without a second codec, second rules and a second answer to
"what does undo mean here". A sibling document would earn its place only if fog became brush- or
polygon-painted (hundreds of shapes per session); that is not this stage, and the door stays open
because `FoldedState.map` is one field a later stage can move.

**Alternatives rejected.** (a) A sibling `campaigns/{id}/maps/{mapId}` document: doubles the
persistence seam for facts that change a few dozen times per session. (b) Position as a
free-floating pixel coordinate on a map document: the reducer's positions are cells, and two
sources of truth for "where is the ogre" is exactly the split the steering forbids.

## 3. Model

```ts
/** An axis-aligned rectangle of grid cells; `x,y` is the top-left cell, `w,h ≥ 1`. */
interface MapRect { x: number; y: number; w: number; h: number }

interface MapBackground {
  path: string;   // Storage object path: campaigns/{campaignId}/maps/{mapId}.jpeg
  url: string;    // the download URL (token URL, as `bannerUrl` already is)
  width: number;  // stored image size in px
  height: number;
  cellPx: number; // grid cell side in image px (Owlbear "size", Foundry "grid size")
  origin: { x: number; y: number }; // image-px offset of cell (0,0)'s top-left corner
  bytes: number;  // stored size, for the per-campaign quota bar
}

interface MapState {
  background: MapBackground | null;
  fog: { covered: boolean; revealed: readonly MapRect[] };
}
// FoldedState.map: MapState — initial { background: null, fog: { covered: false, revealed: [] } }

type TableOp = …
  | { op: "map"; background: MapBackground | null }
  | { op: "fog"; change: { kind: "cover"; covered: boolean }
                       | { kind: "reveal"; rect: MapRect }
                       | { kind: "hide"; rect: MapRect } };

// Entity.reveal gains `token: boolean` (true = players see the token). Override direct-patch
// paths gain `position` (value `{x,y}` or `null`) and `reveal.token` / `reveal.block` /
// `reveal.hp` (booleans).
```

- **Cells, not pixels.** Fog rectangles and positions are integer cells so the same numbers feed
  the reducer's geometry and the fog membership test (`cellUnderFog`). The image-pixel mapping is
  one pure function pair (`cellToPx`, `pxToCell`) in the view layer, parameterised by
  `MapBackground` alone.
- **Scale.** `FEET_PER_CELL` stays the constant 5 ft (SRD 2024 default; every published 2024
  battle map is 5 ft per square). The grid panel's "Lato di una casella" reads 1,5 m and is not
  editable in this stage: a per-map scale would have to flow into `distanceFt`, the movement
  budget and area membership, and no acceptance story needs it. Recorded as a deliberate
  non-decision; the field is additive when a consumer asks for it.
- **Measurement.** Chessboard only (the reducer's Chebyshev distance); no alternatives.
- **Personal host.** A personal encounter may carry `map.background: null` only; the upload path
  needs a campaign. Nothing forecloses a later personal map.

## 4. Reducer semantics

- `table:map` replaces the background (or clears it with `null`). It rejects a background whose
  numbers are not finite positive integers (`cellPx ≥ 8`, `width`/`height` ≥ `cellPx`), the same
  fail-closed treatment the stage-2 review gave a `NaN` destination. Replacing the background
  leaves fog and positions as they are: the DM realigns and re-uploads without losing the table.
- `table:fog`:
  - `cover: true` → `{ covered: true, revealed: [] }` (Owlbear "fill", the drawer's "Copri tutto
    di nuovo"); `cover: false` → `{ covered: false, revealed: [] }` (fog off).
  - `reveal rect` → appends the rectangle; rectangles fully contained in an existing one are
    dropped, and existing ones fully contained in the new one are replaced by it (a cheap
    normalisation, not a union).
  - `hide rect` → subtracts the rectangle from every revealed rectangle (a rectangle difference
    yields at most four pieces per affected rectangle); empty pieces are dropped.
  - `reveal`/`hide` on an uncovered map are rejected (`invalid-table-op`): one representation
    only — fog is "everything covered except `revealed`", never "everything visible except
    hidden". The surface does not offer them while fog is off.
  - A rectangle must be integer with `w,h ≥ 1` and coordinates within ±10,000; the revealed list
    is capped at `FOG_RECT_CAP` (256) entries, after which `reveal` is rejected — the checkpoint
    budget is bounded by construction, and the cap is far above what rectangles can express
    before a DM reaches for "cover all" again.
- `override position` sets `Entity.position` directly (or clears it with `null`), then recomputes
  `adjacent`/`range` with every other positioned entity **without** opening an opportunity-attack
  window: a placement is forced movement, not a departure (UI spec §5c: "forced movement (no
  opportunity attack)"). The movement budget is not consulted and not spent. The `move` step is
  unchanged. `repositionRelations` is split so both callers share the recomputation and only the
  step opens windows.
- `override reveal.*` patches the boolean; a non-boolean value is recorded but patches nothing
  (the existing contract of an unknown path).
- Overrides apply at every automation level, as today — the DM's last word — which is exactly what
  makes `override position` the `log-only` table's move.

## 5. Which action a drop emits (the commit policy)

A pure function in the kernel, `planDrop(state, { entity, to, actor: { uid, dm } })`, decides for
the surface, so the rule is tested once and read nowhere else:

Rows are read top to bottom; the first that matches wins.

| Situation                                                                                                     | Result                                |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Actor neither controls the entity nor is the DM                                                               | `refused: "control"`                  |
| Actor controls it, turns running, its turn, level ≠ `log-only`, distance ≤ remaining movement                 | `move` (an `intent` of `core:move`)   |
| Actor is the DM (any other case: a token the DM does not control, its own monster over budget or out of turn) | `place` (an `override` of `position`) |
| Actor controls it and turns are not running (`idle`, `gathering`, `ended`)                                    | `place`                               |
| Actor controls it, turns running, level `log-only`                                                            | `place`                               |
| Actor controls it, turns running, not its turn                                                                | `refused: "turn"`                     |
| Actor controls it, its turn, distance > remaining movement                                                    | `refused: "movement"` (snap back)     |

"Controls" = `entity.controllerUid === uid`. The ruler's colour follows the same budget the
first row reads (`stats.speed` with the `stats.speed` override, minus `turn.movementUsed`).

## 6. What each viewer sees (concealment by presenter)

`mapView(state, viewer: { uid, dm })` is the one projection the surface renders from:

- a token is listed when `reveal.token` is true, or the viewer is the DM, or the viewer controls
  it; a hidden token carries `hidden: true` so the DM renders it dashed;
- when fog is on, a player also does not see a token whose position is under fog (Owlbear:
  items under fog are invisible to players), except their own; the DM sees everything with the
  fog dimmed;
- the fog overlay is `revealed` verbatim plus the `covered` flag; the surface draws the mask.

This is the same trust posture as hidden roll faces (ADR-0005 amendment): the raw document
carries everything; presenters conceal. A member reading the API sees hidden tokens, as they see
hidden faces and forged actions.

## 7. Storage seam

- **Path:** `campaigns/{campaignId}/maps/{mapId}.jpeg`, `mapId` a fresh UUID — never the
  encounter id, so a later "scenes" stage can reuse an image across encounters without a rename.
  `deleteMapBackground(path)` exists beside the upload for the surface that clears a background.
- **Compression:** the existing canvas compressor (`compressImage`, moved from `src/lib/storage.ts`
  to its own pure module `src/lib/image-compress.ts` so the map adapter does not import the app's
  Firebase singleton), longest side 4,096 px, JPEG 0.85 — a 30 × 40-cell map at 100 px per cell.
  JPEG only: `canvas.toBlob("image/webp")` silently falls back to PNG on Safari, and one format is
  the honest choice for the group's machines.
- **Ceilings:** `MAP_MAX_BYTES` 8 MiB per file, enforced by `storage.rules` and by the adapter;
  `MAP_QUOTA_BYTES` 100 MiB per campaign, enforced by the adapter from Storage's own metadata
  (`listAll` + `getMetadata` over the campaign's `maps/` prefix — the truth, with nothing to drift)
  and shown as the quota bar. The quota is a client-side courtesy, stated as such: Storage rules
  cannot sum a prefix, and the £1 kill-switch is the real backstop.
- **Rules (`storage.rules`):** the DM (`dmUid` of the campaign, via the cross-service
  `firestore.get` the admin rule already uses) or the admin may create/update/delete under the
  prefix, image content type and size ≤ 8 MiB; any campaign member or the admin may read (which
  covers `list` for the quota). The image's display URL is the token URL stored in the action, so
  a member's `<img>` never evaluates a rule; the read rule matters for `getDownloadURL`, the
  quota listing and the export path.
- **The adapter** (`src/lib/map-io.ts`) takes the `FirebaseStorage` instance explicitly, like
  `combat-io` takes `Firestore`, so it runs unmocked on the Storage emulator under two identities.
- **Staging.** Firebase Storage default buckets on projects created after October 2024 need the
  Blaze plan (free within the no-cost quota; a billing account must be linked). Production is
  Blaze; staging is Spark. Linking billing is a console action by the owner with a £1 budget alert
  like production — until then the map plays on the emulator (`pnpm dev:emulators`) and on
  production only after the release, never before.

## 8. The surface (the ground layer of dossier 14)

`src/features/play/map/` — one React component, `MapCanvas`, and pure helpers, no new
dependency: SVG (the token count is small and SVG masks give rectangle fog for free; a WebGL
renderer is what Owlbear needs for brush fog and thousands of items, not what a table of ten
tokens needs).

- **Layers (bottom to top):** background `<image>`, grid (`<pattern>` of cell lines, faint gold),
  fog (a `<mask>`: black rect, white revealed rects; opacity 1 for players, 0.6 for the DM),
  tokens (portrait clipped to a circle, 2.5 px ring: gold ally, red enemy, cyan with glow on the
  current turn, dashed when hidden; HP bar beneath; name label), the acting creature's reach as a
  dashed cyan ring, the ruler during a drag (dashed path from the origin cell to the hovered cell,
  a distance pill "6 m · 4 caselle", tone by budget), the fog rectangle being drawn (dashed gold).
- **View:** pan (hand tool, or space/middle button), wheel zoom around the cursor, double-click
  to centre; the view state is local.
- **Tools this stage:** select/move (drag a token; `planDrop` decides `move` / `place` /
  refuse-and-snap-back), fog rectangle (DM: drag a rectangle, then reveal or hide; a "cover all"
  and "fog off" pair), the DM's "player view" eye (renders `mapView` as a player would), hide/show
  on the selected token (DM), the scale badge (read-only "1,5 m · casella").
- **Not in this stage:** the tool rail, the sub-toolbars, the grid panel, the token pill, the
  drawer — dossier 14's chrome belongs to stage 6, which mounts `MapCanvas` under the HUD. Stage 5
  ships the map with a minimal, unstyled tool strip that exists only so the map is drivable.
- **Hosting for review:** a DEV-only route `/_map` (the `import.meta.env.DEV` fold the specimens
  and crash probes already use) mounts the component on the folded state of Sara's ambush with a
  procedurally drawn background, so screenshots are reproducible without an upload. It is not a
  user surface.
- **Integration policy (golden rule 25).** The engine, codec, rules and Storage seam are non-visual
  and integrate on `v2` after review and green gates. The surface and its DEV route wait on the
  owner's screenshot approval (desktop, dark and light, IT and EN): they are pushed as the proposal
  branch `origin/v2-stage5-map-surface` and merged into `v2` only after the verdict.

## 9. Tests

- Unit (fast lane): rectangle difference and normalisation; the `fog` and `map` table ops
  (accept, reject, cap); `override position` (recompute, no window, budget untouched, `null`
  clears) and `override reveal.*`; `planDrop` over the table above; `mapView` for DM, controller,
  spectator, hidden and under-fog; `cellToPx`/`pxToCell` snapping and `rulerFor` tones; the codec
  round-trips for the new shapes; a new golden replay `map-fog-and-hidden.json` (Sara's ambush
  with a background, fog, a hidden wolf placed by the DM, then revealed and moved).
- **The §8 codec round-trip property test**, written now rather than inherited as a gap: a
  seeded generator of encounters over every action kind (map ops included) and checkpoints,
  `parseEncounter(encounterWriteData(e))` equals `e`, a few hundred cases, no dependency (a
  30-line PRNG in the test).
- Rules lane (`pnpm test:rules`, mandatory): the Storage matrix for `campaigns/{id}/maps/*`
  (DM create/read/delete, member read only, non-member denied, admin, size and type ceilings); the
  adapter on the emulator (upload → path/url/bytes, quota from `listAll`, refuse past the quota,
  delete); and the **concurrent-append** case the stage-4 handoff asked for — two clients and one
  client's burst of ten appends in the same round-trip, every action lands, both clients fold to
  the same state.
- Component (slow lane, jsdom): render of tokens/fog/hidden from a folded state; a drag that
  emits `move`, one that emits `place`, one refused; the player-view toggle. Motion and pixel
  fidelity are proved by the screenshots, never by jsdom.

## 10. Decisions deferred, with the measurement that justifies deferring

- **Bounded `rolls` in the checkpoint** (stage-4 residual): the map adds ~270 nodes to a realistic
  checkpoint, two orders of magnitude under the 34,200-of-50,000 headroom measured at 1,000
  logged intents, so the map does not force the decision. The safe pruning is known — at
  compaction drop `rolls` whose spender is not a still-open `declared` intent — and belongs to
  stage 6 together with the compaction wiring; recorded, not taken.
- **Per-map scale and measurement type** (§3): fixed at 5 ft chessboard until a consumer asks.
- **Token size** (Large = 2 × 2 cells): `Entity` carries no size; the ogre renders one cell wide
  in this stage. Rendering a footprint needs the size on the entity and a reach rule for
  multi-cell creatures in `position.ts`; stage 6's character/monster projection is where the size
  enters the entity, so the footprint follows it there.
- **Fog shapes beyond rectangles, multi-layer fog, "remember explored"** (drawer mockup): later,
  with the sibling-document question re-opened at that point.

## 11. Touch points

`src/lib/combat/types.ts` (`MapRect`, `MapBackground`, `MapState`, `FoldedState.map`,
`reveal.token`, the two `TableOp` members), `src/lib/combat/map.ts` (rect geometry, fog fold,
`planDrop`, `mapView`, `cellUnderFog`), `src/lib/combat/table.ts` (the two ops),
`src/lib/combat/override.ts` (`position`, `reveal.*`), `src/lib/combat/reposition.ts` (the
split), `src/lib/combat/fold.ts` (`initialState`), `src/lib/combat/codec.ts` (schemas),
`src/lib/image-compress.ts` (moved), `src/lib/map-io.ts` (new), `storage.rules`,
`src/features/play/map/*` (surface, proposal branch), `src/app/router.tsx` (DEV route, proposal
branch), `tests/unit/combat/*`, `tests/rules/*`, and the owner documents: design spec §2.1/§2.2/
§3.1/§5.1/§5.4, `docs/ARCHITECTURE.md` (Storage paths), `docs/TEST_PORTFOLIO.md`,
`docs/PROGRAM_STATUS.md`, the stage-1 plan (item 5 status).
