/**
 * Shared tracker-display constants (pure — no React, no Firebase).
 *
 * The subitizing threshold that decides how a resource pool is drawn: pools with
 * `total ≤ TRACKER_PIP_MAX` (and not HP-like) render as discrete pips; larger
 * pools render as a numeric "remaining / total" count. It lives in a pure module
 * so BOTH surfaces that make this call — the on-screen `Tracker` molecule
 * (`components/shared/Tracker.tsx`) and the pure PDF renderer
 * (`lib/pdf/character-pdf.ts`) — read the ONE source and can never drift (golden
 * rule 6), without dragging React into the pure PDF lib.
 */

/** Subitizing threshold: pools of ≤5 uses draw as pips, >5 as a numeric count. */
export const TRACKER_PIP_MAX = 5;
