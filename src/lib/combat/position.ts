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

// SRD 2024 "Areas of Effect": a cone is as wide at a given point as that point is distant from
// the origin, i.e. a symmetric 90°-wide cone (±45° off the aim direction). A grid-aligned point
// often lands exactly on that boundary (e.g. a 45° diagonal), so the comparison below tolerates
// floating-point rounding at the edge rather than excluding a mathematically-included cell.
const HALF_CONE_COS = Math.SQRT1_2; // cos(45°)
const EPSILON = 1e-9;

function inShape(shape: AreaShape, at: Position): boolean {
  const p = toFeet(at);
  const o = toFeet(shape.origin);
  switch (shape.kind) {
    case "sphere":
    case "cylinder":
      return length(sub(p, o)) <= shape.radiusFt + EPSILON;
    case "cube": {
      const v = sub(p, o);
      return (
        v.x >= -EPSILON &&
        v.x <= shape.sizeFt + EPSILON &&
        v.y >= -EPSILON &&
        v.y <= shape.sizeFt + EPSILON
      );
    }
    case "cone": {
      const dir = sub(toFeet(shape.aim), o);
      const dirLen = length(dir);
      if (dirLen === 0) return false;
      const v = sub(p, o);
      const dist = length(v);
      if (dist === 0) return true; // the origin point itself is inside its own cone
      if (dist > shape.lengthFt + EPSILON) return false;
      const cos = (v.x * dir.x + v.y * dir.y) / (dist * dirLen);
      return cos >= HALF_CONE_COS - EPSILON;
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
      return (
        along >= -EPSILON &&
        along <= shape.lengthFt + EPSILON &&
        across <= shape.widthFt / 2 + EPSILON
      );
    }
    default:
      return assertNever(shape, "area shape");
  }
}

export interface Positioned {
  readonly id: EntityId;
  readonly position: Position | null;
}

export function areaMembership(
  shape: AreaShape,
  candidates: readonly Positioned[]
): EntityId[] {
  return candidates
    .filter((c): c is Positioned & { position: Position } => c.position !== null)
    .filter((c) => inShape(shape, c.position))
    .map((c) => c.id);
}
