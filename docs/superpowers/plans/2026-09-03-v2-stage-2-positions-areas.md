# Stage 2 — positions and areas in the aggregate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the combat aggregate a grid position, an area-shape vocabulary, and the pure
derivation of reach/range-band/area-membership/left-reach from positions, with a working `move`
step that keeps the opportunity-attack window working from real movement instead of only from a
manually declared departure.

**Architecture:** A new pure module `src/lib/combat/position.ts` owns distance, range-band and
area-membership math (no state, no reducer dependency). `types.ts` gains `Position` and
`Entity.position`. `mechanic.ts` gains the `move` Step and the `position` Input. `intent.ts` gains
the `move` step handler and a shared helper (factored out of the existing `applyDeclare` path)
that opens an opportunity-attack window when a mover leaves another entity's reach. The golden
replay runner stops accepting a pre-log `relations` fixture; every fixture that used it moves its
relations into `declare` log actions instead, and a new replay proves movement-driven
`entity-left-reach`.

**Tech Stack:** TypeScript, Vitest, the existing pure `src/lib/combat` engine (no React, no
Firebase, no RNG, no clock — enforced by `tests/unit/combat/boundary.guard.test.ts`).

**Spec:** `docs/superpowers/specs/2026-09-03-v2-stage-2-positions-areas-design.md` (this plan
implements it in full); background in
`docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` §1/§2.3/§4 and
`docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md` §1.4/§6.

## Global Constraints

- Every union in `src/lib/combat` is closed; every `switch` ends in `assertNever` (import from
  `./ids`). A new union member is a compile error everywhere it isn't handled — expect this to
  surface every call site that needs a new `case`.
- `src/lib/combat/**` stays pure: no `react`/`firebase`/`zustand`/`@/i18n`/`@/features`/
  `@/components`/`@/stores` imports, no `Date.now`/`new Date`/`Math.random`/`crypto.*` (guarded by
  `boundary.guard.test.ts`).
- Grid distance is Chebyshev ("chessboard", the SRD 2024 default) × 5 ft/cell. Range bands stay
  the four already in `types.ts` (`reach | near | far | out`) — do not add a fifth band (design
  doc §2.2).
- `move` never touches `engaged` relations — only `adjacent`/`range` are derived.
- Every commit is a small Conventional Commit with one `.changeset/*.md`; owner is the sole
  author (no co-author trailer). Never `--no-verify`.
- After the mechanic catalogue changes (Task 5), the coverage guard's committed JSON must be
  regenerated: `WRITE_COMBAT_COVERAGE=1 pnpm exec vitest run tests/unit/combat/coverage.guard.test.ts`.

---

## Task 1: `Position` type and `Entity.position`

**Files:**

- Modify: `src/lib/combat/types.ts`
- Modify: `tests/unit/combat/__helpers__/entities.ts`

**Interfaces:**

- Produces: `export interface Position { readonly x: number; readonly y: number }` and
  `Entity.position: Position | null`, both importable from `@/lib/combat/types`.

- [ ] **Step 1: Add the `Position` type and the entity field**

In `src/lib/combat/types.ts`, add near the top of the Entities section (after the `Ability`/
`DamageType` block, before `DerivedStats`):

```ts
/** A grid cell; distance is Chebyshev (chessboard) × 5 ft/cell (`position.ts`). */
export interface Position {
  readonly x: number;
  readonly y: number;
}
```

Add `readonly position: Position | null;` to `Entity`, directly after `readonly reveal: ...` and
before `readonly mechanics: ...`.

- [ ] **Step 2: Give `testEntity` a `position` option**

In `tests/unit/combat/__helpers__/entities.ts`, add `position?: Entity["position"]` to the
options type and `position: opts.position ?? null,` to the returned object (place it next to
`reveal`, matching the field order in `types.ts`).

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc -b --noEmit`
Expected: every construction site of an `Entity` literal that isn't `testEntity` now needs a
`position` field too — TypeScript's error list names them. Fix each by adding
`position: null,` (there are no other `Entity`-literal construction sites outside
`testEntity` and the reducer's own `{ ...entity, ... }` spreads, which already carry the field
forward).

- [ ] **Step 4: Commit**

```bash
git add src/lib/combat/types.ts tests/unit/combat/__helpers__/entities.ts
```

(Commit together with Task 2 — a bare `Position` type with no consumer is not independently
testable; fold this commit into Task 2's.)

---

## Task 2: `src/lib/combat/position.ts` — distance, range band, area membership

**Files:**

- Create: `src/lib/combat/position.ts`
- Test: `tests/unit/combat/position.test.ts`

**Interfaces:**

- Consumes: `Position`, `RangeBand`, `EntityId` from `./types` / `./ids`.
- Produces:
  - `export const FEET_PER_CELL = 5`
  - `export const REACH_FT = 5`
  - `export function cellDistance(a: Position, b: Position): number`
  - `export function distanceFt(a: Position, b: Position): number`
  - `export function isAdjacent(a: Position, b: Position, reachFt?: number): boolean`
  - `export function rangeBand(feet: number): RangeBand`
  - `export type AreaShape = { kind: "sphere" | "cylinder"; origin: Position; radiusFt: number } | { kind: "cube"; origin: Position; sizeFt: number } | { kind: "cone"; origin: Position; aim: Position; lengthFt: number } | { kind: "line"; origin: Position; aim: Position; lengthFt: number; widthFt: number }`
  - `export function areaMembership<T extends { readonly id: EntityId; readonly position: Position | null }>(shape: AreaShape, candidates: readonly T[]): EntityId[]`

These are the exact names Task 4 (the `move` step handler) and future stage-3 work (area
mechanics) import.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/combat/position.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  areaMembership,
  distanceFt,
  isAdjacent,
  rangeBand,
  type AreaShape,
} from "@/lib/combat/position";

describe("distanceFt — Chebyshev (chessboard) × 5 ft/cell", () => {
  it("orthogonal steps cost 5 ft each", () => {
    expect(distanceFt({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(15);
  });
  it("a diagonal step costs the same as an orthogonal one (2024 default)", () => {
    expect(distanceFt({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(15);
  });
  it("the larger axis wins when the steps differ", () => {
    expect(distanceFt({ x: 0, y: 0 }, { x: 2, y: 5 })).toBe(25);
  });
  it("the same cell is zero distance", () => {
    expect(distanceFt({ x: 4, y: 4 }, { x: 4, y: 4 })).toBe(0);
  });
});

describe("isAdjacent", () => {
  it("is true within 5 ft (the default reach)", () => {
    expect(isAdjacent({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
  });
  it("is false beyond reach", () => {
    expect(isAdjacent({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });
  it("accepts a longer reach for reach weapons", () => {
    expect(isAdjacent({ x: 0, y: 0 }, { x: 2, y: 0 }, 10)).toBe(true);
  });
});

describe("rangeBand", () => {
  it("bands the four thresholds", () => {
    expect(rangeBand(0)).toBe("reach");
    expect(rangeBand(5)).toBe("reach");
    expect(rangeBand(6)).toBe("near");
    expect(rangeBand(30)).toBe("near");
    expect(rangeBand(31)).toBe("far");
    expect(rangeBand(120)).toBe("far");
    expect(rangeBand(121)).toBe("out");
  });
});

describe("areaMembership", () => {
  const at = (id: string, x: number, y: number) => ({ id, position: { x, y } });

  it("sphere/cylinder: within radius of the origin", () => {
    const shape: AreaShape = { kind: "sphere", origin: { x: 0, y: 0 }, radiusFt: 20 };
    const candidates = [at("a", 0, 0), at("b", 4, 0), at("c", 5, 0), at("d", 0, 6)];
    expect(areaMembership(shape, candidates)).toEqual(["a", "b", "c"]);
  });

  it("cube: an axis-aligned square from the origin corner", () => {
    const shape: AreaShape = { kind: "cube", origin: { x: 0, y: 0 }, sizeFt: 15 };
    const candidates = [
      at("in", 2, 2),
      at("edge", 3, 0),
      at("out", 4, 0),
      at("behind", -1, 0),
    ];
    expect(areaMembership(shape, candidates)).toEqual(["in", "edge"]);
  });

  it("cone: within length and within 45° of the aim direction", () => {
    const shape: AreaShape = {
      kind: "cone",
      origin: { x: 0, y: 0 },
      aim: { x: 4, y: 0 },
      lengthFt: 30,
    };
    const candidates = [
      at("ahead", 3, 0),
      at("edge", 3, 3),
      at("wide", 1, 3),
      at("behind", -2, 0),
      at("apex", 0, 0),
    ];
    expect(areaMembership(shape, candidates)).toEqual(["ahead", "edge", "apex"]);
  });

  it("line: within length along the aim and within half-width across it", () => {
    const shape: AreaShape = {
      kind: "line",
      origin: { x: 0, y: 0 },
      aim: { x: 6, y: 0 },
      lengthFt: 30,
      widthFt: 10,
    };
    const candidates = [
      at("in", 3, 1),
      at("edge", 3, 1),
      at("wide", 3, 2),
      at("far", 8, 0),
    ];
    expect(areaMembership(shape, candidates)).toEqual(["in", "edge"]);
  });

  it("candidates with no position never match", () => {
    const shape: AreaShape = { kind: "sphere", origin: { x: 0, y: 0 }, radiusFt: 100 };
    expect(areaMembership(shape, [{ id: "ghost", position: null }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/unit/combat/position.test.ts`
Expected: FAIL — `Cannot find module '@/lib/combat/position'`.

- [ ] **Step 3: Implement `src/lib/combat/position.ts`**

```ts
/**
 * Positions and areas: pure geometry over grid cells. No state, no reducer dependency — the
 * `move` step (intent.ts) and stage 3's area mechanics both call these functions directly.
 * Design: docs/superpowers/specs/2026-09-03-v2-stage-2-positions-areas-design.md.
 */
import { assertNever, type EntityId } from "./ids";
import type { Position, RangeBand } from "./types";

/** SRD 2024 default: a square grid, 5 ft per cell, no other scale until stage 5's map. */
export const FEET_PER_CELL = 5;
/** Melee reach; a reach weapon or creature passes a longer value to `isAdjacent`. */
export const REACH_FT = 5;
const NEAR_FT = 30;
const FAR_FT = 120;

/** Chebyshev distance in cells: 2024's "chessboard" method — every step costs the same,
 *  diagonal included. */
export function cellDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function distanceFt(a: Position, b: Position): number {
  return cellDistance(a, b) * FEET_PER_CELL;
}

export function isAdjacent(
  a: Position,
  b: Position,
  reachFt: number = REACH_FT
): boolean {
  return distanceFt(a, b) <= reachFt;
}

/** This engine's own map-less band convention (design doc §2.2) — the SRD names exact feet
 *  per weapon/spell, not bands; no acceptance story depends on the exact cut points. */
export function rangeBand(feet: number): RangeBand {
  if (feet <= REACH_FT) return "reach";
  if (feet <= NEAR_FT) return "near";
  if (feet <= FAR_FT) return "far";
  return "out";
}

export type AreaShape =
  | {
      readonly kind: "sphere" | "cylinder";
      readonly origin: Position;
      readonly radiusFt: number;
    }
  | { readonly kind: "cube"; readonly origin: Position; readonly sizeFt: number }
  | {
      readonly kind: "cone";
      readonly origin: Position;
      readonly aim: Position;
      readonly lengthFt: number;
    }
  | {
      readonly kind: "line";
      readonly origin: Position;
      readonly aim: Position;
      readonly lengthFt: number;
      readonly widthFt: number;
    };

interface Vec {
  readonly x: number;
  readonly y: number;
}

function toFeet(p: Position): Vec {
  return { x: p.x * FEET_PER_CELL, y: p.y * FEET_PER_CELL };
}
function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}
function length(v: Vec): number {
  return Math.hypot(v.x, v.y);
}

const HALF_CONE_COS = Math.SQRT1_2; // cos(45°): SRD 2024 cones are symmetric and 90° wide

function inShape(shape: AreaShape, at: Position): boolean {
  const p = toFeet(at);
  const o = toFeet(shape.origin);
  switch (shape.kind) {
    case "sphere":
    case "cylinder":
      return length(sub(p, o)) <= shape.radiusFt;
    case "cube": {
      const v = sub(p, o);
      return v.x >= 0 && v.x <= shape.sizeFt && v.y >= 0 && v.y <= shape.sizeFt;
    }
    case "cone": {
      const dir = sub(toFeet(shape.aim), o);
      const dirLen = length(dir);
      if (dirLen === 0) return false;
      const v = sub(p, o);
      const dist = length(v);
      if (dist === 0) return true; // the origin point itself is inside its own cone
      if (dist > shape.lengthFt) return false;
      const cos = (v.x * dir.x + v.y * dir.y) / (dist * dirLen);
      return cos >= HALF_CONE_COS;
    }
    case "line": {
      const dir = sub(toFeet(shape.aim), o);
      const dirLen = length(dir);
      if (dirLen === 0) return false;
      const ux = dir.x / dirLen;
      const uy = dir.y / dirLen;
      const v = sub(p, o);
      const along = v.x * ux + v.y * uy;
      const across = Math.abs(v.x * -uy + v.y * ux);
      return along >= 0 && along <= shape.lengthFt && across <= shape.widthFt / 2;
    }
    default:
      return assertNever(shape, "area shape");
  }
}

export function areaMembership<
  T extends { readonly id: EntityId; readonly position: Position | null },
>(shape: AreaShape, candidates: readonly T[]): EntityId[] {
  return candidates
    .filter((c): c is T & { position: Position } => c.position !== null)
    .filter((c) => inShape(shape, c.position))
    .map((c) => c.id);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/unit/combat/position.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Typecheck and commit (with Task 1)**

Run: `pnpm exec tsc -b --noEmit` — expect clean.

```bash
git add src/lib/combat/types.ts tests/unit/combat/__helpers__/entities.ts \
  src/lib/combat/position.ts tests/unit/combat/position.test.ts
git commit -m "feat(combat): add entity positions and the area/range geometry module"
```

Add `.changeset/v2-stage-2-position-module.md`:

```markdown
---
"d20-folio": patch
---

Give combat entities a grid position and add the pure geometry module (Chebyshev distance,
the four-band range ladder, and sphere/cone/line/cube/cylinder area membership) stage 3's
positioning and area mechanics will read.
```

```bash
git add .changeset/v2-stage-2-position-module.md
git commit --amend --no-edit
```

---

## Task 3: `move` Step and `position` Input in the mechanics contract

**Files:**

- Modify: `src/lib/combat/mechanic.ts`
- Test: `tests/unit/combat/mechanic.test.ts`

**Interfaces:**

- Consumes: `Position` from `./types`.
- Produces: `Step` gains `{ readonly id: string; readonly when?: Predicate; readonly kind: "move"; readonly to: string }` (`to` names an `Input` id, exactly like `attack`/`save` name their `roll` input); `Input` gains `{ readonly id: string; readonly kind: "position" }`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/combat/mechanic.test.ts` (the existing describe blocks show the pattern —
match whatever import/setup the file already uses for `conformMechanic`):

```ts
describe("conformMechanic — move step", () => {
  const base = {
    schema: 1 as const,
    id: "test:move",
    source: "srd" as const,
  };

  it("accepts a move step whose `to` names a declared position input", () => {
    const result = conformMechanic({
      ...base,
      active: [
        {
          id: "move",
          trigger: { kind: "invocation", economy: "free" },
          inputs: [{ id: "to", kind: "position" }],
          steps: [{ id: "step", kind: "move", to: "to" }],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a move step whose `to` names an input the program never declares", () => {
    const result = conformMechanic({
      ...base,
      active: [
        {
          id: "move",
          trigger: { kind: "invocation", economy: "free" },
          inputs: [],
          steps: [{ id: "step", kind: "move", to: "to" }],
        },
      ],
    });
    expect(result).toEqual({
      ok: false,
      rule: "move-input-declared",
      path: "active[0].steps[0].to",
    });
  });
});
```

(Adjust the exact `describe`/import style to match the file's existing conventions — read
`tests/unit/combat/mechanic.test.ts` first and follow it; the assertions above are what must
hold regardless of formatting.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/unit/combat/mechanic.test.ts`
Expected: FAIL — `unknown-step-kind` at `active[0].steps[0].kind` (the first test), because
`"move"` is not yet in `STEP_KINDS`.

- [ ] **Step 3: Implement the union and conformance rule**

In `src/lib/combat/mechanic.ts`:

1. Add to the `Input` union (after the `table` variant):

```ts
  | { readonly id: string; readonly kind: "position" }
```

2. Add to the `Step` union (after `manual-table`, before the closing `);`):

```ts
  | { readonly kind: "move"; readonly to: string }
```

3. Add `"move"` to the `STEP_KINDS` set literal.

4. In `checkProgram`, alongside the existing `(step.kind === "attack" || step.kind === "save") &&
!inputIds.has(step.roll)` check, add:

```ts
if (step.kind === "move" && !inputIds.has(step.to)) {
  return fail("move-input-declared", `${stepPath}.to`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/unit/combat/mechanic.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc -b --noEmit`
Expected: FAIL — `src/lib/combat/coverage.ts`'s `stepStatus` switch is now non-exhaustive
(`move` unhandled). This is expected; Task 6 fixes it. If a coverage.ts error is the _only_
error, proceed to commit; otherwise fix any other reported site first.

- [ ] **Step 6: Commit**

```bash
git add src/lib/combat/mechanic.ts tests/unit/combat/mechanic.test.ts
git commit -m "feat(combat): add the move step and the position input to the mechanics contract"
```

```markdown
---
"d20-folio": patch
---

Add the `move` step and the `position` input to the mechanics authoring contract, so a program
can carry a destination the way it already carries a rolled number.
```

Save as `.changeset/v2-stage-2-move-step-contract.md` and `git add` + amend into the same commit.

---

## Task 4: the `move` step handler and the shared left-reach-window helper

**Files:**

- Modify: `src/lib/combat/intent.ts`
- Test: `tests/unit/combat/resolve.intent.test.ts` (or a new
  `tests/unit/combat/resolve.move.test.ts` if the existing file's fixtures don't fit — read it
  first and follow its pattern for `catalogue`/`state` setup)

**Interfaces:**

- Consumes: `Position`, `distanceFt`, `isAdjacent` from `./position`; `mustEntity` from
  `./state`; `subscribersFor` from `./windows` (already imported in this file).
- Produces: no new exports — `runStep`'s `case "move"` and the internal
  `openLeftReachWindow`/`repositionRelations` helpers are consumed only through `resolve()`.

- [ ] **Step 1: Write the failing tests**

Read `tests/unit/combat/resolve.intent.test.ts` first to match its `run`/`intent`/`testEntity`
helpers exactly (they mirror `resolve.window.test.ts`, already read during design). Add a new
mechanic-free test path: since `move`'s mechanic isn't in the catalogue yet, write these against
a small ad-hoc catalogue built inline, or wait for Task 5's `core:move` catalogue entry and place
these tests there instead (recommended — avoids inventing a second move mechanic just for the
handler test). If placed here, add a local `buildCatalogue([moveMechanic])` with the same shape
Task 5 defines, so the assertions below hold either way:

```ts
it("moves within budget, updates position, and does not touch relations beyond reach", () => {
  let state = run(
    emptyState(),
    openingActions("dm", seq, [ranger, goblin], { ranger: 20, "monster-1": 10 }, [
      "ranger",
      "monster-1",
    ])
  );
  state = run(state, [
    intent("p1", "ranger", "core:move", "move", { answers: { to: { x: 0, y: 0 } } }),
  ]);
  expect(mustEntity(state, "ranger").position).toEqual({ x: 0, y: 0 });
  expect(mustEntity(state, "ranger").turn.movementUsed).toBe(0); // first placement is free
});

it("rejects a move beyond the remaining speed budget", () => {
  let state = /* opened + first placement at 0,0 */;
  const result = resolve(
    state,
    intent("p1", "ranger", "core:move", "move", { answers: { to: { x: 7, y: 0 } } }), // 35 ft > 30
    catalogue
  );
  expect(result).toEqual({
    kind: "rejected",
    rejection: { reason: "unaffordable", cost: "movement" },
  });
});

it("moving away from an adjacent creature emits entity-left-reach and opens the opportunity window", () => {
  // ranger and goblin placed adjacent (0,0) and (1,0); goblin has srd:weapon:shortsword's
  // "opportunity" program (window subscriber). Move the goblin to (5,0) — 25 ft, beyond reach.
  // Assert: state.relations no longer has an `adjacent` between them; state.windows has one
  // entry with event { kind: "entity-left-reach", entity: "monster-1", from: "ranger" }.
});
```

(Write the full three tests with concrete fixtures, following this file's existing entity/seq
setup — the assertions above are the contract; fill in the setup lines from the patterns already
in `resolve.window.test.ts` and `resolve.intent.test.ts`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/unit/combat/resolve.intent.test.ts` (or the new file)
Expected: FAIL — `unknown-mechanic` (no `core:move` in scope yet) or a TypeScript error on
`runStep`'s switch once `move` is a `Step` member (from Task 3) but unhandled here.

- [ ] **Step 3: Implement the handler**

In `src/lib/combat/intent.ts`:

1. Add to the imports: `import { distanceFt } from "./position";` and add `Position` to the
   `type { ... } from "./types"` import list.

2. Factor `applyDeclare`'s inline left-reach block into a shared function, placed above
   `applyDeclare`:

```ts
/** Opens an opportunity-attack window when `mover` has just left `from`'s reach; a no-op if
 *  nothing subscribes. Shared by `applyDeclare` (a manual departure) and the `move` step (a
 *  real one) — design doc §2.4. */
function openLeftReachWindow(
  state: FoldedState,
  events: CombatEvent[],
  mover: EntityId,
  from: EntityId,
  causedBy: string,
  catalogue: Catalogue
): FoldedState {
  const event: CombatEvent = { kind: "entity-left-reach", entity: mover, from };
  events.push(event);
  const eligible = subscribersFor(state, catalogue, event);
  if (eligible.length === 0) return state;
  const window: ReactionWindow = {
    id: `window-${state.nextOrdinal}`,
    event,
    eligible,
    declared: causedBy,
  };
  return {
    ...state,
    nextOrdinal: state.nextOrdinal + 1,
    windows: [...state.windows, window],
  };
}
```

3. Replace `applyDeclare`'s inline block (the `if (action.remove && action.mover !== null && ...)`
   body) with a call to the shared helper:

```ts
if (
  action.remove &&
  action.mover !== null &&
  (relation.kind === "adjacent" || relation.kind === "engaged")
) {
  const from = relation.a === action.mover ? relation.b : relation.a;
  next = openLeftReachWindow(next, events, action.mover, from, action.id, catalogue);
}
```

4. Add the relation-recompute helper, placed near `openLeftReachWindow`:

```ts
/** Recomputes `adjacent`/`range` between `mover` and every other positioned entity after it
 *  moves; opens an opportunity-attack window for any pair that was `adjacent` and is not
 *  anymore. `engaged` is untouched — it stays a purely declared, sticky fact (design §2.3). */
function repositionRelations(
  state: FoldedState,
  mover: EntityId,
  from: Position | null,
  events: CombatEvent[],
  action: IntentAction,
  catalogue: Catalogue
): FoldedState {
  const to = mustEntity(state, mover).position;
  if (to === null) return state;
  const wasAdjacentTo = new Set(
    state.relations
      .filter(
        (r): r is Extract<Relation, { kind: "adjacent" }> =>
          r.kind === "adjacent" && (r.a === mover || r.b === mover)
      )
      .map((r) => (r.a === mover ? r.b : r.a))
  );
  let relations = state.relations.filter(
    (r) =>
      !((r.kind === "adjacent" || r.kind === "range") && (r.a === mover || r.b === mover))
  );
  let next: FoldedState = { ...state, relations };
  for (const other of Object.values(state.entities)) {
    if (other.id === mover || other.position === null) continue;
    const feet = distanceFt(to, other.position);
    const added: Relation[] = [];
    if (feet <= REACH_FT) added.push({ kind: "adjacent", a: mover, b: other.id });
    const band = rangeBand(feet);
    if (band !== "out") added.push({ kind: "range", a: mover, b: other.id, band });
    next = { ...next, relations: [...next.relations, ...added] };
    if (feet > REACH_FT && wasAdjacentTo.has(other.id)) {
      next = openLeftReachWindow(next, events, mover, other.id, action.id, catalogue);
    }
  }
  return next;
}
```

Add `import { REACH_FT, distanceFt, rangeBand } from "./position";` (merge with the import added
in step 1) and add `Relation` to the `type { ... } from "./types"` import list if not already
present (it is, via other usages — check before adding a duplicate).

5. Add the `move` case to `runStep`'s switch, directly before `case "negate":`:

```ts
      case "move": {
        const raw = action.answers[step.to];
        const to =
          typeof raw === "object" &&
          raw !== null &&
          "x" in raw &&
          "y" in raw &&
          typeof raw.x === "number" &&
          typeof raw.y === "number"
            ? { x: raw.x, y: raw.y }
            : null;
        if (to === null) return { reason: "missing-answer", input: step.to };
        const mover = mustEntity(next, action.entity);
        const from = mover.position;
        if (from !== null) {
          const distance = distanceFt(from, to);
          const speedOverride = mover.overrides["stats.speed"];
          const budget =
            typeof speedOverride?.value === "number" ? speedOverride.value : mover.stats.speed;
          if (mover.turn.movementUsed + distance > budget) {
            return { reason: "unaffordable", cost: "movement" };
          }
          next = {
            ...next,
            entities: {
              ...next.entities,
              [action.entity]: {
                ...mover,
                position: to,
                turn: { ...mover.turn, movementUsed: mover.turn.movementUsed + distance },
              },
            },
          };
        } else {
          next = {
            ...next,
            entities: { ...next.entities, [action.entity]: { ...mover, position: to } },
          };
        }
        next = repositionRelations(next, action.entity, from, events, action, options.catalogue);
        return { stop: false };
      }
```

6. Add `Position` and `Answer` won't need a new variant — the code above reads the answer's
   shape structurally rather than through a new `Answer` union member, so **no change to the
   `Answer` type in `types.ts` is needed**. (This narrows the design doc's §2.4 sketch: rather
   than widening the closed `Answer` union — which every `assertNever`-style consumer of
   `Answer` would then need a case for — the handler duck-types the position out of `unknown`
   answer data, exactly as `answerNumber` already does for numbers. Simpler, no new touch
   points.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run tests/unit/combat/resolve.intent.test.ts tests/unit/combat/resolve.window.test.ts`
Expected: PASS — including the pre-existing `resolve.window.test.ts` case for a _declared_
departure (proves the refactor into `openLeftReachWindow` didn't change its behavior).

- [ ] **Step 5: Full combat suite and typecheck**

Run: `pnpm exec vitest run tests/unit/combat` and `pnpm exec tsc -b --noEmit`
Expected: PASS / clean (Task 6 still owes `coverage.ts`'s exhaustiveness fix if not already
green from a stale run — confirm before committing).

- [ ] **Step 6: Commit**

```bash
git add src/lib/combat/intent.ts tests/unit/combat/resolve.intent.test.ts
git commit -m "feat(combat): execute the move step; share the left-reach window with declare"
```

```markdown
---
"d20-folio": patch
---

Give the `move` step a real handler: it spends the entity's movement budget, updates its
position, and recomputes derived `adjacent`/`range` relations against every other positioned
entity — opening the same opportunity-attack window a manually declared departure already does,
through one shared helper.
```

Save as `.changeset/v2-stage-2-move-handler.md`, `git add`, amend into the same commit.

---

## Task 5: `coverage.ts` exhaustiveness and the `core:move` prototype mechanic

**Files:**

- Modify: `src/lib/combat/coverage.ts`
- Modify: `src/data/combat/prototype-catalogue.ts`
- Modify: `docs/automation-coverage.prototype.json` (regenerated, not hand-edited)

**Interfaces:**

- Produces: `export const move: Mechanic` with `id: "core:move"`, added to
  `PROTOTYPE_MECHANICS`. Later tasks' fixtures reference the mechanic id `"core:move"` and
  program id `"move"`, answer key `"to"`.

- [ ] **Step 1: Fix `coverage.ts`'s exhaustiveness**

In `src/lib/combat/coverage.ts`'s `stepStatus` switch, add `"move"` to the existing
`case "heal": case "effect-start": case "condition": case "move-mark": case "turn-claim": case "negate":`
group (it returns `"automated"` — a move needs a client-supplied destination, not a physical die
or a table ruling, so it classifies the same way `effect-start`/`condition` already do).

- [ ] **Step 2: Add the `core:move` mechanic**

In `src/data/combat/prototype-catalogue.ts`, add (after `shortsword`, before
`PROTOTYPE_MECHANICS`):

```ts
/** Movement every creature has: no action/bonus/reaction cost, gated to your own turn, budgeted
 *  against speed by the `move` step itself. */
export const move: Mechanic = {
  schema: 1,
  id: "core:move",
  source: "srd",
  active: [
    {
      id: "move",
      trigger: { kind: "invocation", economy: "free" },
      inputs: [{ id: "to", kind: "position" }],
      steps: [{ id: "step", kind: "move", to: "to" }],
    },
  ],
};
```

Add `move` to the `PROTOTYPE_MECHANICS` array.

- [ ] **Step 3: Regenerate the coverage record**

Run: `WRITE_COMBAT_COVERAGE=1 pnpm exec vitest run tests/unit/combat/coverage.guard.test.ts`
Then: `pnpm exec vitest run tests/unit/combat/coverage.guard.test.ts` (without the env var)
Expected: PASS on the second run — the committed JSON now includes `core:move/move/*` (`window`
is wrong for an invocation trigger; expect `"automated"`) and `core:move/move/step`
(`"automated"`).

- [ ] **Step 4: Full combat suite and typecheck**

Run: `pnpm exec vitest run tests/unit/combat && pnpm exec tsc -b --noEmit`
Expected: PASS / clean — this is the point where Task 4's `resolve.intent.test.ts` additions
(which reference `core:move`) go green if they were written against this catalogue entry.

- [ ] **Step 5: Commit**

```bash
git add src/lib/combat/coverage.ts src/data/combat/prototype-catalogue.ts \
  docs/automation-coverage.prototype.json
git commit -m "feat(combat): classify the move step as automated; add the core:move mechanic"
```

```markdown
---
"d20-folio": patch
---

Add the universal `core:move` mechanic to the prototype catalogue and classify the `move` step
as automated coverage, closing the exhaustiveness gap the step's addition opened.
```

Save as `.changeset/v2-stage-2-core-move-mechanic.md`, `git add`, amend into the same commit.

---

## Task 6: retire the replay runner's pre-log `relations` seed

**Files:**

- Modify: `tests/unit/combat/replays.test.ts`
- Modify: `tests/unit/combat/replays/dice-provenance.json`
- Modify: `src/lib/combat/fold.ts` (doc comment only)
- Modify: `docs/TEST_PORTFOLIO.md` (golden-replay format section)

**Interfaces:**

- Consumes: nothing new.
- Produces: the `Replay` interface in `replays.test.ts` no longer has a `relations` field; every
  replay fixture expresses relations as `declare` log entries.

- [ ] **Step 1: Convert `dice-provenance.json`**

In `tests/unit/combat/replays/dice-provenance.json`, delete the top-level `"relations": [...]`
array and prepend two `declare` entries to `"log"` (before the first `"roll"` entry):

```json
{
  "id": "declare-visible-1",
  "by": "dm",
  "kind": "declare",
  "relation": { "kind": "visible", "a": "ranger", "b": "monster-1", "value": true },
  "remove": false,
  "mover": null
},
{
  "id": "declare-visible-2",
  "by": "dm",
  "kind": "declare",
  "relation": { "kind": "visible", "a": "monster-1", "b": "ranger", "value": true },
  "remove": false,
  "mover": null
},
```

Update `"expect": { "applied": 3, ... }` to `"applied": 5` (two more applied actions).

- [ ] **Step 2: Drop the `relations` field from the runner**

In `tests/unit/combat/replays.test.ts`:

1. Remove `readonly relations?: readonly Relation[];` from the `Replay` interface, and remove
   the now-unused `Relation` import if nothing else in the file uses it (check first).
2. Change `let state: FoldedState = { ...emptyState(), relations: replay.relations ?? [] };` to
   `let state: FoldedState = emptyState();`.

- [ ] **Step 3: Run the replay suite to verify it still passes**

Run: `pnpm exec vitest run tests/unit/combat/replays.test.ts`
Expected: PASS — `dice-provenance.json` folds the same final state through two extra `declare`
actions instead of a pre-seed.

- [ ] **Step 4: Update `fold.ts`'s doc comment**

In `src/lib/combat/fold.ts`, replace the `fold` function's doc comment:

```ts
/** `start` is the state to fold on top of: `initialState()` for a fresh encounter, or a
 *  checkpoint's folded state for compaction (§5.3 of the design). */
```

- [ ] **Step 5: Update `docs/TEST_PORTFOLIO.md`**

In the "Golden replays" section, change:

> Format: `{ name, dm, entities (testEntity options), initiative, order, relations (seeded until
stage 2), log (actions without seq; the runner stamps `ms: 5000 + index`), expect: { applied,
rejections [{ action, rejection }], state { "dotted.path": value } } }`

to:

> Format: `{ name, dm, entities (testEntity options), initiative, order, log (actions without
seq; the runner stamps `ms: 5000 + index`— relations are`declare` entries here, not a
pre-log seed), expect: { applied, rejections [{ action, rejection }], state { "dotted.path":
value } } }`

- [ ] **Step 6: Commit**

```bash
git add tests/unit/combat/replays.test.ts tests/unit/combat/replays/dice-provenance.json \
  src/lib/combat/fold.ts docs/TEST_PORTFOLIO.md
git commit -m "test(combat): replay relations are declare log actions, not a pre-log seed"
```

```markdown
---
"d20-folio": patch
---

Retire the golden-replay runner's pre-log `relations` seed: `dice-provenance.json`'s visibility
facts are now `declare` actions inside the replayed log, closing the gap stage 1 left open.
```

Save as `.changeset/v2-stage-2-replay-declare-actions.md`, `git add`, amend into the same commit.

---

## Task 7: golden replay — movement drives `entity-left-reach`

**Files:**

- Create: `tests/unit/combat/replays/position-and-reach.json`

**Interfaces:**

- Consumes: `core:move` (Task 5), `srd:weapon:shortsword`'s `opportunity` program (already in
  the catalogue).

- [ ] **Step 1: Write the replay**

Create `tests/unit/combat/replays/position-and-reach.json`. Ranger and goblin start adjacent; the
goblin moves away on its turn; the ranger's shortsword opportunity-attack window opens from the
`move`, not from a `declare`; the ranger answers it and resolves.

```json
{
  "name": "position and reach — a real move (not a declare) opens the opportunity window",
  "dm": "dm",
  "entities": [
    {
      "id": "ranger",
      "kind": "pc",
      "controllerUid": "p1",
      "hp": 20,
      "ac": 15,
      "abilities": { "DEX": 3 },
      "mechanics": ["srd:weapon:shortsword", "core:move"],
      "position": { "x": 0, "y": 0 }
    },
    {
      "id": "monster-1",
      "kind": "monster",
      "controllerUid": "dm",
      "hp": 7,
      "ac": 13,
      "mechanics": ["core:move"],
      "position": { "x": 1, "y": 0 }
    }
  ],
  "initiative": { "ranger": 20, "monster-1": 10 },
  "order": ["ranger", "monster-1"],
  "log": [
    { "id": "end-1", "by": "dm", "kind": "table", "table": { "op": "end-turn" } },
    {
      "id": "leave",
      "by": "dm",
      "kind": "intent",
      "entity": "monster-1",
      "mechanic": "core:move",
      "program": "move",
      "targets": [],
      "answers": { "to": { "x": 5, "y": 0 } },
      "payment": [],
      "window": null,
      "basedOn": 0
    },
    {
      "id": "r-oa",
      "by": "p1",
      "kind": "roll",
      "roll": {
        "formula": "1d20",
        "faces": [15],
        "total": 15,
        "seed": null,
        "source": "manual",
        "hidden": false,
        "roller": "ranger",
        "purpose": "attack",
        "label": null
      }
    },
    {
      "id": "r-oa-dmg",
      "by": "p1",
      "kind": "roll",
      "roll": {
        "formula": "1d6",
        "faces": [4],
        "total": 4,
        "seed": null,
        "source": "manual",
        "hidden": false,
        "roller": "ranger",
        "purpose": "damage",
        "label": null
      }
    },
    {
      "id": "oa",
      "by": "p1",
      "kind": "intent",
      "entity": "ranger",
      "mechanic": "srd:weapon:shortsword",
      "program": "opportunity",
      "targets": ["monster-1"],
      "answers": { "roll": { "roll": "r-oa" }, "damage": { "roll": "r-oa-dmg" } },
      "payment": [],
      "window": "window-6",
      "basedOn": 0
    }
  ],
  "expect": {
    "applied": 4,
    "rejections": [],
    "state": {
      "entities.monster-1.position": { "x": 5, "y": 0 },
      "entities.monster-1.vitals.hp": 3,
      "entities.ranger.turn.reaction": 1,
      "windows": []
    }
  }
}
```

The window id `"window-6"` depends on `nextOrdinal` at the moment the `move` opens it — if the
test run reports a different id in the rejection/mismatch output, use the actual id the fold
produces (read it from the failing assertion's diff) rather than guessing; do not hand-derive it
from reading the reducer's counters.

- [ ] **Step 2: Run and adjust**

Run: `pnpm exec vitest run tests/unit/combat/replays.test.ts`
Expected: it will very likely FAIL first on the `window` id in the `oa` action, or on the
`expect.state` values — the failure diff names the actual `nextOrdinal`-derived window id and
any other mismatch. Correct the fixture's `"window"` field (and any HP/position values) to match
the diff, then rerun until green. This step is expected to take 2-3 iterations; do not guess
values analytically instead of reading the diff.

- [ ] **Step 3: Confirm final pass**

Run: `pnpm exec vitest run tests/unit/combat/replays.test.ts`
Expected: PASS, including this new file alongside `dice-provenance.json`.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/combat/replays/position-and-reach.json
git commit -m "test(combat): golden replay — a real move opens the opportunity-attack window"
```

```markdown
---
"d20-folio": patch
---

Add the position-and-reach golden replay: a real `move` (not a manually declared departure) now
proves the opportunity-attack window opens and resolves, closing case 3's map-derived half.
```

Save as `.changeset/v2-stage-2-position-replay.md`, `git add`, amend into the same commit.

---

## Task 8: docs reconciliation and the full `v2` gate

**Files:**

- Modify: `docs/superpowers/plans/2026-09-03-new-app-stage-1.md`
- Modify: `docs/PROGRAM_STATUS.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Close stage 2 in the stage-1 program plan**

In `docs/superpowers/plans/2026-09-03-new-app-stage-1.md`, under stage "2. **Positions and areas
in the aggregate.**", append a status paragraph in the same style as stages 0/1's `**Status
(2026-09-03): closed on `v2`.**` blocks, naming: `src/lib/combat/position.ts` (distance, the kept
four-band ladder, area membership for the five SRD shapes), the `move` step with its handler and
shared left-reach-window helper, the `core:move` prototype mechanic, and the replay runner's
`relations`-seed retirement (both `dice-provenance.json`'s conversion and the new
`position-and-reach.json` replay). Cite the design doc
`docs/superpowers/specs/2026-09-03-v2-stage-2-positions-areas-design.md`.

- [ ] **Step 2: Add the stage 2 section to `docs/PROGRAM_STATUS.md`**

Add a new `## `v2` — stage 2, positions and areas (2026-09-03)` section, following the exact
structure of the stage 1 section immediately above it (plan reference, what was built, the gate
numbers from Step 3 below), and update the stage 1 section's closing line ("Next: stage 2...")
to point at stage 3 instead, from the rewritten next-session handoff (final task of this plan,
outside this file).

- [ ] **Step 3: Run the full `v2` gate**

Run, in order, recording each command's wall time for the program-status entry:

```bash
just ci
pnpm test:rules
pnpm exec vite build && pnpm exec vitest run --config vitest.config.budget.ts 2>/dev/null || pnpm test:budget
```

(Use whichever budget-test invocation `package.json`'s `test:budget` script actually defines —
check `package.json` first rather than guessing the exact command; the plan's Global Constraints
already name the two commands by their documented names, `pnpm test:budget` and the `vite
build` step that must precede it.)

Expected: all green, under the 15-minute target combined (`docs/TEST_PORTFOLIO.md`). If anything
is red, stop and fix it before writing the gate numbers into `PROGRAM_STATUS.md` — never record a
gate result you have not just observed.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-09-03-new-app-stage-1.md docs/PROGRAM_STATUS.md
git commit -m "docs(combat): close stage 2 on v2 — positions and areas in the aggregate"
```

```markdown
---
"d20-folio": patch
---

Close stage 2 on `v2` in the stage plan and the program ledger: positions, the area/range
geometry module, the move step, and the replay runner's relations-as-log-actions migration, with
the gate's green receipt.
```

Save as `.changeset/v2-stage-2-closed.md`, `git add`, amend into the same commit.

---

## Self-review notes (from the plan author)

- **Spec coverage:** design doc §2.1 → Task 1; §2.2 → Task 2 (`rangeBand`); §2.3 → Task 4
  (`repositionRelations`'s replace-on-recompute, no provenance field); §2.4 → Tasks 3–5 (`move`
  step, handler, `core:move`); §2.5 → Task 2 (`areaMembership`); §3 (non-goals) → nothing builds
  a map, `TargetSpec.count: "area"`, cover/visibility derivation, terrain, or a fifth band —
  confirmed absent from every task above; §4 (touch points) → every file listed there has a task.
- **Task 4's `Answer` type note** narrows the design doc's sketch (duck-typing instead of a new
  `Answer` union member) — recorded inline in the task, not hidden; the design doc's intent
  (the destination travels through `answers`, named by the step) is unchanged.
- Independent review (a fresh reviewer, per `superpowers:requesting-code-review`) runs after
  Task 8, on the full diff, before this plan is considered done — not a task in this list because
  it produces no file changes of its own until the reviewer's findings are triaged.
