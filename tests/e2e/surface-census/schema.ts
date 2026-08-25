export const ATLAS_BOARDS = [
  "A00",
  "A01",
  "A02",
  "A03",
  "A04",
  "A05",
  "A06",
  "A07",
  "A08",
  "A09",
  "A10",
  "A11",
  "A12",
  "A13",
  "A14",
  "A15",
  "A16",
  "B00",
  "B01",
  "S01",
  "S02",
] as const;

export const PAIRWISE = [
  { locale: "it", theme: "dark", device: "desktop" },
  { locale: "en", theme: "light", device: "desktop" },
  { locale: "it", theme: "light", device: "mobile" },
  { locale: "en", theme: "dark", device: "mobile" },
] as const;

export const B01_MOTION_FRAMES = [
  "entry",
  "mid",
  "settled",
  "interrupted",
  "exit",
  "reduced",
] as const;

export type AtlasBoard = (typeof ATLAS_BOARDS)[number];
export type SurfaceLocale = "en" | "it";
export type SurfaceTheme = "dark" | "light";
export type SurfaceDevice = "desktop" | "mobile";
export type B01MotionFrame = (typeof B01_MOTION_FRAMES)[number];

export interface SurfaceVariant {
  readonly locale: SurfaceLocale;
  readonly theme: SurfaceTheme;
  readonly device: SurfaceDevice;
}

export interface SurfaceCensusEntry {
  /** Stable capture and review identifier. */
  readonly id: string;
  /** Tactical Codex atlas board that owns the designed state. */
  readonly board: AtlasBoard;
  /** Concrete route navigated by the test or review lane. */
  readonly route: string;
  /** Stable state within the route (resting, overlay, error, wizard step, and so on). */
  readonly state: string;
  /** Locale, theme, and viewport applicability for this state. */
  readonly variants: readonly SurfaceVariant[];
  /** Product or design fact owner for this state. */
  readonly authority: string;
  /** Runtime/specimen call site that makes the state reachable. */
  readonly callSite: string;
  /** Whether the dedicated visual lane must produce owner-review evidence. */
  readonly curatedReview: boolean;
  /** Optional B01 frame vocabulary used by motion review. */
  readonly motionFrames?: readonly B01MotionFrame[];
}

const BOARD_SET = new Set<string>(ATLAS_BOARDS);
const MOTION_FRAME_SET = new Set<string>(B01_MOTION_FRAMES);
const LOCALE_SET = new Set<string>(["en", "it"]);
const THEME_SET = new Set<string>(["dark", "light"]);
const DEVICE_SET = new Set<string>(["desktop", "mobile"]);

function requireText(value: string, field: string, id: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Surface "${id}" is missing its ${field}.`);
  }
}

/** Validate pure census data before any Playwright lane consumes it. */
export function assertSurfaceCensus(entries: readonly SurfaceCensusEntry[]): void {
  const ids = new Set<string>();

  for (const surface of entries) {
    requireText(surface.id, "id", "<unknown>");
    if (ids.has(surface.id)) {
      throw new Error(`Duplicate surface id "${surface.id}".`);
    }
    ids.add(surface.id);

    requireText(surface.route, "route", surface.id);
    requireText(surface.state, "state", surface.id);
    requireText(surface.authority, "authority", surface.id);
    requireText(surface.callSite, "call site", surface.id);

    if (!BOARD_SET.has(surface.board)) {
      throw new Error(`Surface "${surface.id}" has unknown board "${surface.board}".`);
    }
    if (surface.variants.length === 0) {
      throw new Error(`Surface "${surface.id}" has empty variant applicability.`);
    }
    for (const variant of surface.variants) {
      if (
        !LOCALE_SET.has(variant.locale) ||
        !THEME_SET.has(variant.theme) ||
        !DEVICE_SET.has(variant.device)
      ) {
        throw new Error(`Surface "${surface.id}" has invalid variant applicability.`);
      }
    }
    for (const frame of surface.motionFrames ?? []) {
      if (!MOTION_FRAME_SET.has(frame)) {
        throw new Error(
          `Surface "${surface.id}" has invalid B01 motion frame "${frame}".`
        );
      }
    }
  }
}

/** Type and validate a slice-owned census fragment without importing Playwright. */
export function defineSurfaceCensus<const T extends readonly SurfaceCensusEntry[]>(
  entries: T
): T {
  assertSurfaceCensus(entries);
  return entries;
}
