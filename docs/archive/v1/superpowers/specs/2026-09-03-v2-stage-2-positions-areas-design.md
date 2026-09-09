# Stage 2 design — positions and areas in the aggregate

Addendum to `2026-09-02-total-combat-automation-design.md` §1/§2.3/§4 and
`2026-09-02-mechanics-authoring-spec.md` §1.4/§6. Scope: the stage-1 program plan's item 2
("positions and areas in the aggregate"). No screen, no map upload (stage 5); this is the data
model and the pure derivation the stage-3 reducer and stage-5 map will both read.

## 1. Evidence (giants' shoulders)

- **Foundry VTT** measures every grid distance as "chessboard" by default in a 2024-ruleset
  world: diagonal movement costs the same as orthogonal, i.e. Chebyshev distance × grid size.
  Its four AOE templates are circle (sphere/cylinder footprint), cone, rectangle (cube/line) and
  ray (line with width); a cone's width at distance r from the apex equals r (a 90° symmetric
  cone), matching the SRD 2024 "Areas of Effect" text ("cone... as wide at a given point as that
  point is distant from the point of origin").
- **Owlbear Rodeo 2**: the ruler measures point-to-point in grid units and snaps to the square
  grid; movement is drag-and-drop with a live distance readout, no path cost accounting beyond
  the straight-line distance. There is no built-in AOE template; the pattern it contributes here
  is "distance and grid are the only primitives — everything else is table adjudication."
- **`docs/superpowers/specs/2026-09-03-ui-redesign-design.md` §5c** (49-source research, already
  in the repo): every distance-dependent 2024 rule reduces to reach (binary), a range band, cover
  per target and area-set membership; declarations are sticky, made on the turn that changes
  them; the dominant map-less pattern is bands, never coordinates.

## 2. Decisions

### 2.1 Position — grid cells, not free coordinates

`Position = { x: number; y: number }`, integer grid cells; distance is Chebyshev (chessboard,
the SRD 2024 default) × 5 ft/cell (`FEET_PER_CELL`). No `unit`/scale field: stage 5 owns grid
size and measurement-type as a map setting (design spec, UI spec rule 34); until a map exists,
a fixed 5 ft square is the only grid this app has, so a second "point with scale" variant would
have no reader. `Entity.position: Position | null`; `null` is the default and the fallback
path — an entity with no position relies on `declare` alone, exactly the design's invariant
("declared relational facts for map-less play").

### 2.2 Range bands — the four already in the design spec, not the UI spec's proposed five

The UI spec's §5c sharpens the ladder to five bands (reach/near/medium/far/distant) explicitly
"to be ratified by [the design spec's] owner." No stage-3 consumer needs the fifth band: the
walkthroughs that would use it (Counterspell's 60 ft, case 3) are tiered `later`. Ratifying a
five-band cut now would add a rung nothing reads — the opposite of the owner's no-dead-weight
rule. This stage keeps the four-band `RangeBand` already in `types.ts` and derives it:

```
reach ≤ 5 ft   (melee reach)
near  ≤ 30 ft  (a monster's typical move-and-still-swing range)
far   ≤ 120 ft (the common ceiling of SRD ranged weapons and attack spells)
out   > 120 ft
```

These are this engine's own map-less abstraction (the SRD names exact feet per weapon/spell, not
bands); no acceptance story depends on the exact cut points, so they are a documented convention
in `position.ts`, not a ratified rule — revisit when a consumer needs a finer cut (flagged for
the five-band sharpening once Counterspell is in scope).

### 2.3 Derived vs. declared — later action wins, no provenance field

The design's invariant is "derives reach, range bands and area membership (provenance derived);
keeps declared relational facts (declared) for cover, [...] and map-less play." Rather than
adding a `provenance` tag to the closed `Relation` union (touching every construction site across
five files for a fact no test yet reads), this stage uses the log's own ordering: `move`
recomputes and replaces the `adjacent`/`range` relations between the mover and every other
positioned entity every time it runs; a `declare` appended after a `move` still overrides until
the next `move` recomputes fresh. This is not a new mechanism — it is the same "a later action in
the log wins" rule every other override in this engine already uses (§6 of the design spec).
`engaged` is untouched by `move`: it stays a sticky, purely declared fact (a melee lock the table
chooses to end), matching the design's description of it as a retained tactical declaration, not
a raw-distance projection.

### 2.4 `move` is a step, not a top-level action

The vocabulary tiers (authoring spec §6) already name `move` as a stage-3-tier **Step**, so it is
invoked the same way every other program is: `intent` → program → step, gated to the entity's
own turn via `trigger: { kind: "invocation", economy: "free" }` (turn-gated, no action/bonus/
reaction claim — SRD 2024 movement costs neither). The destination cannot be static program data
(unlike a fixed damage die formula, every invocation targets a different cell), so it travels the
same way a rolled number already does: as an `answers` entry, named by the step
(`step.to: string`, an input id) and declared as a new `Input` kind, `{ kind: "position" }`
alongside `d20`/`dice`/`choice`/`table`. `Answer` gains a `Position`-shaped variant.

The step checks the entity's movement budget (`turn.movementUsed` against `stats.speed`, with
the same `overrides["stats.speed"]` seam `effectiveAc` already reads for AC) and rejects
`unaffordable` over budget; multiple `move` invocations in one turn accumulate, matching split
movement. A mover's first placement (`position === null`) is free and does not compare against a
prior position. After moving, the step recomputes `adjacent`/`range` for every other positioned
entity and, for any pair that was `adjacent` and is not anymore, emits `entity-left-reach` and
opens a reaction window through the exact mechanism `applyDeclare` already uses for a manually
declared departure (factored into one shared helper) — so an opportunity attack fires identically
whether reach was left by a `declare` or by a real `move`.

### 2.5 Area shapes — five kinds, one membership function

`AreaShape` is a closed union over sphere, cone, line, cube, cylinder (the authoring spec's
target vocabulary), each carrying an `origin: Position` and its SRD size in feet; cone and line
also carry an `aim: Position` (the point the caster points at, matching Foundry's ray/cone
templates). Membership is decided at the coordinate level (cells scaled to feet), because a cone
and a line are directional and grid-metric distance alone cannot express that:

- sphere/cylinder: within `radiusFt` of the origin (footprint only; elevation stays declared,
  per the design's invariant — a cylinder's height is never modeled).
- cube: an axis-aligned square from the origin corner, extending toward increasing x/y (no
  rotation UI exists yet to place it otherwise; documented as a convention, not a limitation of
  the shape).
- cone: within `lengthFt` of the origin and within 45° of the origin→aim direction (SRD 2024:
  width at distance r equals r, i.e. a symmetric 90° cone).
- line: within `lengthFt` along the origin→aim direction and within `widthFt / 2` perpendicular
  to it.

`areaMembership(shape, candidates)` is a pure function over `{ id, position }` pairs; it has no
reducer wiring in this stage (no story needs a concrete AOE mechanic before stage 3's Fireball),
but is fully typed and tested so stage 3 calls it directly when Fireball's targets are computed.

## 3. What this stage does not build

- No map, no grid rendering, no token drag (stage 5).
- No `TargetSpec.count: "area"` wiring (extends `mechanic.ts` only when a concrete area mechanic
  — Fireball — needs it, stage 3).
- No cover/visibility/elevation derivation (design's invariant keeps these declared-only; no
  vision system exists).
- No difficult terrain, forced movement, or reach-weapon (> 5 ft reach) support.
- No five-band range ladder (§2.2).

## 4. Touch points

`src/lib/combat/types.ts` (`Position`, `Entity.position`), a new `src/lib/combat/position.ts`
(distance, band, area membership — pure, no state), `src/lib/combat/mechanic.ts` (`move` Step,
`position` Input, one conformance rule), `src/lib/combat/intent.ts` (the `move` step handler and
the shared left-reach-window helper), `src/lib/combat/coverage.ts` (`move` classified
`automated`), `src/data/combat/prototype-catalogue.ts` (one `core:move` mechanic), the golden
replay runner and `dice-provenance.json` (relations become `declare` log actions, closing the gap
`fold.ts` already flags), a new replay proving movement-driven `entity-left-reach`, and
`docs/TEST_PORTFOLIO.md` / `docs/PROGRAM_STATUS.md` / the stage-1 plan (status and format).
