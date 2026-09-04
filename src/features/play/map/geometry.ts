/**
 * The map surface's pure geometry: image pixels ⇄ grid cells, and the drag ruler's numbers.
 *
 * Everything the reducer knows is in cells (`src/lib/combat/map.ts`, `position.ts`); this module
 * is the only place the surface converts to and from the background image's pixel space, and it
 * is parameterised by `MapBackground` alone. No React, no DOM: tested in the fast lane.
 *
 * Design: docs/superpowers/specs/2026-09-04-v2-stage-5-minimum-map-design.md §3, §8. Ruler tones
 * follow Foundry v13's token drag ruler: within the remaining movement, reachable with a Dash
 * (one more speed), or beyond.
 */
import { cellDistance, distanceFt } from "@/lib/combat/position";
import type { MapBackground, Position } from "@/lib/combat/types";

export interface Px {
  readonly x: number;
  readonly y: number;
}

/** The grid a map without an uploaded background still draws: 30 × 20 cells of 64 px. */
export const DEFAULT_GRID = { cellPx: 64, columns: 30, rows: 20 } as const;

/** What the surface needs to draw the ground: the image (or none) and the grid over it. */
export interface Ground {
  readonly url: string | null;
  readonly width: number;
  readonly height: number;
  readonly cellPx: number;
  readonly origin: Px;
}

export function groundOf(background: MapBackground | null): Ground {
  if (background === null) {
    return {
      url: null,
      width: DEFAULT_GRID.columns * DEFAULT_GRID.cellPx,
      height: DEFAULT_GRID.rows * DEFAULT_GRID.cellPx,
      cellPx: DEFAULT_GRID.cellPx,
      origin: { x: 0, y: 0 },
    };
  }
  return {
    url: background.url,
    width: background.width,
    height: background.height,
    cellPx: background.cellPx,
    origin: background.origin,
  };
}

/** Top-left image pixel of a cell. */
export function cellToPx(ground: Ground, cell: Position): Px {
  return {
    x: ground.origin.x + cell.x * ground.cellPx,
    y: ground.origin.y + cell.y * ground.cellPx,
  };
}

/** Centre image pixel of a cell. */
export function cellCenterPx(ground: Ground, cell: Position): Px {
  const corner = cellToPx(ground, cell);
  return { x: corner.x + ground.cellPx / 2, y: corner.y + ground.cellPx / 2 };
}

/** The cell an image pixel falls in (snapping): floor, so a point on a grid line belongs to
 *  the cell to its right/below, and a negative pixel maps to a negative cell. */
export function pxToCell(ground: Ground, px: Px): Position {
  return {
    x: Math.floor((px.x - ground.origin.x) / ground.cellPx),
    y: Math.floor((px.y - ground.origin.y) / ground.cellPx),
  };
}

export type RulerTone = "ok" | "dash" | "over";

export interface Ruler {
  readonly cells: number;
  readonly feet: number;
  readonly tone: RulerTone;
}

/**
 * The drag ruler's numbers. `budget` is the mover's movement left this turn and its speed (a
 * Dash grants the speed again); `null` means no budget applies (a placement) and the tone is
 * always `ok`.
 */
export function rulerFor(
  from: Position,
  to: Position,
  budget: { readonly remainingFt: number; readonly speedFt: number } | null
): Ruler {
  const cells = cellDistance(from, to);
  const feet = distanceFt(from, to);
  if (budget === null) return { cells, feet, tone: "ok" };
  if (feet <= budget.remainingFt) return { cells, feet, tone: "ok" };
  if (feet <= budget.remainingFt + budget.speedFt) return { cells, feet, tone: "dash" };
  return { cells, feet, tone: "over" };
}

/** D&D's Italian convention: 5 ft is 1,5 m. */
export function feetToMetres(feet: number): number {
  return Math.round(feet * 0.3 * 10) / 10;
}

/** The rectangle of cells between two cells, inclusive, normalised to a positive size. */
export function cellsRect(a: Position, b: Position) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

/** The view transform: image px → screen px is `screen = image * scale + offset`. */
export interface Viewport {
  readonly scale: number;
  readonly offset: Px;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 6;

export function screenToImage(view: Viewport, screen: Px): Px {
  return {
    x: (screen.x - view.offset.x) / view.scale,
    y: (screen.y - view.offset.y) / view.scale,
  };
}

/** Zoom by `factor` keeping the image point under `anchor` (screen px) fixed. */
export function zoomAt(view: Viewport, anchor: Px, factor: number): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const under = screenToImage(view, anchor);
  return {
    scale,
    offset: { x: anchor.x - under.x * scale, y: anchor.y - under.y * scale },
  };
}

/** A viewport that fits the whole ground into `width × height` screen px, centred. */
export function fitViewport(ground: Ground, width: number, height: number): Viewport {
  const scale = Math.min(width / ground.width, height / ground.height, MAX_SCALE);
  return {
    scale,
    offset: {
      x: (width - ground.width * scale) / 2,
      y: (height - ground.height * scale) / 2,
    },
  };
}
