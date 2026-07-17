/**
 * d20-icosahedron — a tiny, dependency-free 3D renderer for the gilt d20 loader.
 *
 * The 12 vertices + 20 triangular faces of a regular icosahedron, plus `drawD20`,
 * which rotates the solid, culls back-faces, shades each visible facet with a single
 * directional light mapped onto the gilt-gold ramp, and paints a fixed number on each
 * face — so the die reads as a SOLID, three-dimensional object tumbling in space (the
 * "thrown roll", owner-approved 2B), not a flat sprite. Pure canvas math (no React,
 * no deps); the caller owns the canvas, DPR scaling, and the animation loop.
 */

const PHI = (1 + Math.sqrt(5)) / 2;

// 12 vertices: cyclic permutations of (0, ±1, ±φ), normalized to the unit sphere.
const RAW: ReadonlyArray<readonly [number, number, number]> = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
];
const VNORM = Math.hypot(1, PHI, 0);
const VERTS: ReadonlyArray<readonly [number, number, number]> = RAW.map(
  (v) => [v[0] / VNORM, v[1] / VNORM, v[2] / VNORM] as const
);

// The 20 faces (vertex-index triples) of the icosahedron.
const FACES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];
// Face labels (purely cosmetic — a plausible d20 spread; 20 leads).
const FACE_NUMS = [20, 8, 14, 2, 17, 5, 11, 9, 16, 7, 1, 13, 19, 3, 15, 4, 18, 6, 12, 10];

// One directional light (upper-left, toward viewer) so facets read three-dimensional.
const LM = Math.hypot(-0.32, -0.5, 0.8);
const LIGHT: readonly [number, number, number] = [-0.32 / LM, -0.5 / LM, 0.8 / LM];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Map a 0..1 brightness onto the gilt ramp: deep gold → mid → bright leaf. */
function gold(b: number): string {
  const x = Math.max(0, Math.min(1, b));
  const stops: [number, number, number][] = [
    [99, 76, 30],
    [196, 154, 64],
    [247, 232, 188],
  ];
  const seg = x < 0.5 ? 0 : 1;
  const t = x < 0.5 ? x / 0.5 : (x - 0.5) / 0.5;
  const c1 = stops[seg];
  const c2 = stops[seg + 1];
  if (!c1 || !c2) return "rgb(196,154,64)";
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
}

interface ProjectedFace {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
  nz: number;
  lam: number;
  cz: number;
  num: number;
}

/**
 * Draw one frame of the gilt d20 at rotation (ax, ay) into a `size`×`size` box. The
 * 2D context must already be DPR-scaled by the caller.
 */
export function drawD20(
  ctx: CanvasRenderingContext2D,
  size: number,
  ax: number,
  ay: number
): void {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.4;
  const ca = Math.cos(ax);
  const sa = Math.sin(ax);
  const cb = Math.cos(ay);
  const sb = Math.sin(ay);

  // Rotate every vertex: rotateX(ax) then rotateY(ay).
  const rv: [number, number, number][] = VERTS.map(([x, y, z]) => {
    const y1 = y * ca - z * sa;
    const z1 = y * sa + z * ca;
    return [x * cb + z1 * sb, y1, -x * sb + z1 * cb];
  });

  const faces: ProjectedFace[] = [];
  for (let i = 0; i < FACES.length; i++) {
    const tri = FACES[i];
    if (!tri) continue;
    const a = rv[tri[0]];
    const b = rv[tri[1]];
    const c = rv[tri[2]];
    if (!a || !b || !c) continue;
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    if (nz <= 0) continue; // back-face cull (convex solid → no front overlap)
    faces.push({
      x0: cx + a[0] * R,
      y0: cy + a[1] * R,
      x1: cx + b[0] * R,
      y1: cy + b[1] * R,
      x2: cx + c[0] * R,
      y2: cy + c[1] * R,
      mx: cx + ((a[0] + b[0] + c[0]) / 3) * R,
      my: cy + ((a[1] + b[1] + c[1]) / 3) * R,
      nz,
      lam: nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2],
      cz: (a[2] + b[2] + c[2]) / 3,
      num: FACE_NUMS[i] ?? 0,
    });
  }
  faces.sort((p, q) => p.cz - q.cz); // far → near (painter's order)

  const edge = Math.max(0.8, size * 0.012);
  for (const f of faces) {
    ctx.beginPath();
    ctx.moveTo(f.x0, f.y0);
    ctx.lineTo(f.x1, f.y1);
    ctx.lineTo(f.x2, f.y2);
    ctx.closePath();
    ctx.fillStyle = gold(0.34 + 0.66 * Math.max(0, f.lam));
    ctx.fill();
    ctx.lineWidth = edge;
    ctx.strokeStyle = "rgba(61,47,18,0.9)";
    ctx.stroke();

    ctx.fillStyle = `rgba(38,28,12,${0.3 + 0.6 * f.nz})`;
    ctx.font = `800 ${size * (0.06 + f.nz * 0.1)}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(f.num), f.mx, f.my);
  }
}

/** Exposed for tests/static render: a pleasing resting 3/4 angle (used under reduced-motion). */
export const D20_REST = { ax: 0.5, ay: 0.6 } as const;
