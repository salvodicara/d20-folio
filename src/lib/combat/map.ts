/**
 * The map's pure facts: rectangle geometry over grid cells, the fog fold, and the validators the
 * `map`/`fog` table ops apply before touching state.
 *
 * Design: docs/superpowers/specs/2026-09-04-v2-stage-5-minimum-map-design.md §3–§4. Everything
 * here is cells, never pixels — the image-pixel mapping is the surface's concern — and nothing
 * here reads a clock, a random source or a document. Fog has ONE representation: when `covered`,
 * every cell is hidden except those inside a `revealed` rectangle; `hide` subtracts from the
 * revealed rectangles rather than adding a second, inverse list.
 */
import type { EntityId } from "./ids";
import { distanceFt } from "./position";
import type {
  Entity,
  EntityKind,
  FoldedState,
  LifeState,
  MapBackground,
  MapRect,
  MapState,
  Position,
} from "./types";

/** Rectangles past this count are rejected: the checkpoint's state is bounded by construction,
 *  and a DM reaches for "cover all" long before rectangles alone can express a scene this big. */
export const FOG_RECT_CAP = 256;

/** Cell coordinates outside this magnitude are rejected — a fail-closed backstop against a
 *  malformed action, not a map size (a 20,000-cell-wide map is not a thing). */
export const MAP_COORD_LIMIT = 10_000;

/** The smallest grid a background may declare, in image pixels per cell. */
export const MIN_CELL_PX = 8;

function isCoord(value: unknown): value is number {
  return Number.isInteger(value) && Math.abs(value as number) <= MAP_COORD_LIMIT;
}

function isPositiveInt(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

/** A grid cell with integer coordinates within `MAP_COORD_LIMIT` — the shape an `override` of
 *  `position` must carry. */
export function isMapCell(value: unknown): value is Position {
  if (typeof value !== "object" || value === null) return false;
  const cell = value as Record<string, unknown>;
  return isCoord(cell.x) && isCoord(cell.y);
}

/** Integer cells, `w,h ≥ 1`, every coordinate within `MAP_COORD_LIMIT`. Tested, never asserted:
 *  a persisted action may carry any JSON. */
export function isMapRect(value: unknown): value is MapRect {
  if (typeof value !== "object" || value === null) return false;
  const rect = value as Record<string, unknown>;
  return (
    isCoord(rect.x) &&
    isCoord(rect.y) &&
    isPositiveInt(rect.w) &&
    isPositiveInt(rect.h) &&
    rect.w <= MAP_COORD_LIMIT &&
    rect.h <= MAP_COORD_LIMIT
  );
}

/** A background whose numbers make sense: finite positive integers, a cell of at least
 *  `MIN_CELL_PX`, an image at least one cell wide and tall, a non-negative size. The origin may be
 *  negative (the grid's first line can sit off the image's edge) but must be integer. */
export function isMapBackground(value: unknown): value is MapBackground {
  if (typeof value !== "object" || value === null) return false;
  const bg = value as Record<string, unknown>;
  const origin = bg.origin as Record<string, unknown> | null | undefined;
  return (
    typeof bg.path === "string" &&
    bg.path.length > 0 &&
    typeof bg.url === "string" &&
    bg.url.length > 0 &&
    isPositiveInt(bg.cellPx) &&
    bg.cellPx >= MIN_CELL_PX &&
    isPositiveInt(bg.width) &&
    isPositiveInt(bg.height) &&
    bg.width >= bg.cellPx &&
    bg.height >= bg.cellPx &&
    Number.isInteger(bg.bytes) &&
    (bg.bytes as number) >= 0 &&
    typeof origin === "object" &&
    origin !== null &&
    Number.isInteger(origin.x) &&
    Number.isInteger(origin.y)
  );
}

/** Whether `inner` lies entirely inside `outer`. */
export function rectContains(outer: MapRect, inner: MapRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/** Whether the two rectangles share at least one cell. */
export function rectIntersects(a: MapRect, b: MapRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectContainsCell(rect: MapRect, cell: Position): boolean {
  return (
    cell.x >= rect.x &&
    cell.x < rect.x + rect.w &&
    cell.y >= rect.y &&
    cell.y < rect.y + rect.h
  );
}

/**
 * `a` minus `b`, as at most four rectangles (the band above `b`, the band below, and the strips
 * left and right of it within `b`'s vertical span). Disjoint → `[a]`; `b` covers `a` → `[]`.
 */
export function subtractRect(a: MapRect, b: MapRect): MapRect[] {
  if (!rectIntersects(a, b)) return [a];
  const pieces: MapRect[] = [];
  const top = a.y;
  const bottom = a.y + a.h;
  const cutTop = Math.max(top, b.y);
  const cutBottom = Math.min(bottom, b.y + b.h);
  if (cutTop > top) pieces.push({ x: a.x, y: top, w: a.w, h: cutTop - top });
  if (bottom > cutBottom)
    pieces.push({ x: a.x, y: cutBottom, w: a.w, h: bottom - cutBottom });
  const left = a.x;
  const right = a.x + a.w;
  const cutLeft = Math.max(left, b.x);
  const cutRight = Math.min(right, b.x + b.w);
  const span = cutBottom - cutTop;
  if (span > 0) {
    if (cutLeft > left) pieces.push({ x: left, y: cutTop, w: cutLeft - left, h: span });
    if (right > cutRight)
      pieces.push({ x: cutRight, y: cutTop, w: right - cutRight, h: span });
  }
  return pieces;
}

/** Append a revealed rectangle: one already inside another is dropped, and the ones the new
 *  rectangle swallows are replaced by it — a cheap normalisation, not a union. Returns `null`
 *  when the result would exceed `FOG_RECT_CAP`. */
export function revealRect(
  revealed: readonly MapRect[],
  rect: MapRect
): readonly MapRect[] | null {
  if (revealed.some((existing) => rectContains(existing, rect))) return revealed;
  const kept = revealed.filter((existing) => !rectContains(rect, existing));
  if (kept.length + 1 > FOG_RECT_CAP) return null;
  return [...kept, rect];
}

/** Subtract a rectangle from every revealed rectangle. Returns `null` when the pieces would
 *  exceed `FOG_RECT_CAP`. */
export function hideRect(
  revealed: readonly MapRect[],
  rect: MapRect
): readonly MapRect[] | null {
  const next = revealed.flatMap((existing) => subtractRect(existing, rect));
  return next.length > FOG_RECT_CAP ? null : next;
}

/** A cell is under fog when fog is on and no revealed rectangle contains it. */
export function cellUnderFog(fog: MapState["fog"], cell: Position): boolean {
  if (!fog.covered) return false;
  return !fog.revealed.some((rect) => rectContainsCell(rect, cell));
}

// ── The drop policy (design addendum §5) ─────────────────────────────────────

export interface MapActor {
  readonly uid: string;
  /** The campaign's DM or the admin — DM-level on the table. */
  readonly dm: boolean;
}

export type DropPlan =
  | { readonly kind: "move"; readonly to: Position; readonly feet: number }
  | { readonly kind: "place"; readonly to: Position }
  | {
      readonly kind: "refused";
      readonly reason: "unknown" | "control" | "turn" | "movement";
    };

/** Movement left this turn: `stats.speed` (or its `stats.speed` override, the same seam the
 *  `move` step reads) minus what the turn already spent. Never negative. */
export function remainingMovement(entity: Entity): number {
  const speedOverride = entity.overrides["stats.speed"];
  const budget =
    typeof speedOverride?.value === "number" ? speedOverride.value : entity.stats.speed;
  return Math.max(0, budget - entity.turn.movementUsed);
}

/**
 * Which action a dropped token becomes. Read top to bottom; the first row that matches wins:
 *
 * 1. an unknown entity, or an actor who neither controls it nor is the DM → refused;
 * 2. the controller, turns running, its turn, not `log-only`, within the budget → `move`
 *    (an `intent` of `core:move`, budgeted, opens opportunity-attack windows);
 * 3. the DM, in every other case → `place` (an `override` of `position`);
 * 4. the controller while turns are not running → `place`;
 * 5. the controller on a `log-only` table → `place` (the reducer withholds `move` there);
 * 6. the controller out of turn → refused;
 * 7. the controller, its turn, over the budget → refused (the surface snaps the token back).
 *
 * A first placement (`position === null`) costs nothing, as in the `move` step.
 */
export function planDrop(
  state: FoldedState,
  args: { readonly entity: EntityId; readonly to: Position; readonly actor: MapActor }
): DropPlan {
  const entity = state.entities[args.entity];
  if (!entity) return { kind: "refused", reason: "unknown" };
  const controls = entity.controllerUid === args.actor.uid;
  if (!controls && !args.actor.dm) return { kind: "refused", reason: "control" };
  const turns = state.clock.phase === "turns";
  const itsTurn = turns && state.clock.current === entity.id;
  const feet = entity.position === null ? 0 : distanceFt(entity.position, args.to);
  if (
    controls &&
    itsTurn &&
    state.settings.automation !== "log-only" &&
    feet <= remainingMovement(entity)
  ) {
    return { kind: "move", to: args.to, feet };
  }
  if (args.actor.dm) return { kind: "place", to: args.to };
  if (!turns) return { kind: "place", to: args.to };
  if (state.settings.automation === "log-only") return { kind: "place", to: args.to };
  if (!itsTurn) return { kind: "refused", reason: "turn" };
  return { kind: "refused", reason: "movement" };
}

// ── What each viewer sees (design addendum §6) ───────────────────────────────

export interface MapToken {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly label: string;
  readonly position: Position;
  readonly controllerUid: string;
  /** `reveal.token === false` — the DM (and the controller) render it dashed. */
  readonly hidden: boolean;
  readonly current: boolean;
  readonly life: LifeState;
  /** The bar everyone sees, 0..1 of max HP. */
  readonly hpRatio: number;
  /** The number, only where the viewer may read it: own and allied PCs, the DM, or a monster
   *  whose HP the table reveals (`reveal.hp` or `settings.revealMonsterHp`). */
  readonly hp: number | null;
  readonly maxHp: number | null;
}

export interface MapView {
  readonly background: MapBackground | null;
  readonly fog: MapState["fog"];
  readonly tokens: readonly MapToken[];
}

/**
 * The one projection the surface renders from. The raw document carries everything (the trust
 * posture of ADR-0005); this is where concealment happens: a hidden token is listed only for the
 * DM and its controller; under fog, a player also loses every token but their own; HP numbers
 * follow the table's reveal flags. Tokens are sorted by id so the view is deterministic.
 */
export function mapView(state: FoldedState, viewer: MapActor): MapView {
  const tokens: MapToken[] = [];
  for (const entity of Object.values(state.entities)) {
    if (entity.position === null) continue;
    const own = entity.controllerUid === viewer.uid;
    const privileged = viewer.dm || own;
    const hidden = !entity.reveal.token;
    if (hidden && !privileged) continue;
    if (!privileged && cellUnderFog(state.map.fog, entity.position)) continue;
    const readsHp =
      privileged ||
      entity.kind === "pc" ||
      entity.reveal.hp ||
      state.settings.revealMonsterHp;
    const maxHp = Math.max(1, entity.stats.maxHp);
    tokens.push({
      id: entity.id,
      kind: entity.kind,
      label: entity.label,
      position: entity.position,
      controllerUid: entity.controllerUid,
      hidden,
      current: state.clock.current === entity.id,
      life: entity.vitals.life,
      hpRatio: Math.min(1, Math.max(0, entity.vitals.hp / maxHp)),
      hp: readsHp ? entity.vitals.hp : null,
      maxHp: readsHp ? entity.stats.maxHp : null,
    });
  }
  tokens.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { background: state.map.background, fog: state.map.fog, tokens };
}
