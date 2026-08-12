/**
 * Folio icon registry — the ONE icon-authoring vocabulary (non-component module so
 * the `IconPicker` component file can stay fast-refresh-clean).
 *
 * A FIXED subset of filled fantasy glyphs is the only authoring + rendering vocabulary
 * for any user-chosen icon (combat-algorithm steps AND custom features). The engine
 * field stays a string, but we never paint a raw OS emoji: every stored value
 * resolves to one of these glyphs (legacy emoji seeds + the stable ids both map
 * here, so old data renders without a migration; unknown → the default burst).
 */

import type { ComponentType, SVGProps } from "react";
import {
  ClassSorcererIcon,
  FolioBurstIcon,
  FolioChecklistIcon,
  FolioCombatIcon,
  FolioControlIcon,
  FolioDangerIcon,
  FolioDefendIcon,
  FolioFocusIcon,
  FolioMoveIcon,
  FolioSupportIcon,
} from "./folio-icons";

export interface AlgoIcon {
  /** Stable key + the string persisted into the `emoji` field. */
  id: string;
  glyph: ComponentType<SVGProps<SVGSVGElement>>;
}

/** `burst` is the neutral fallback + new-step / new-feature seed. */
export const DEFAULT_ALGO_ICON: AlgoIcon = { id: "burst", glyph: FolioBurstIcon };

export const ALGO_ICONS: readonly AlgoIcon[] = [
  { id: "control", glyph: FolioControlIcon },
  { id: "support", glyph: FolioSupportIcon },
  { id: "melee", glyph: FolioCombatIcon },
  { id: "defend", glyph: FolioDefendIcon },
  DEFAULT_ALGO_ICON,
  { id: "magic", glyph: ClassSorcererIcon },
  { id: "move", glyph: FolioMoveIcon },
  { id: "focus", glyph: FolioFocusIcon },
  { id: "danger", glyph: FolioDangerIcon },
  { id: "checklist", glyph: FolioChecklistIcon },
] as const;

const LEGACY_EMOJI_MAP: Record<string, string> = {
  "🎵": "control",
  "🎶": "control",
  "🎼": "support",
  "🩹": "support",
  "❤️": "support",
  "⚔️": "melee",
  "⚔": "melee",
  "🗡️": "melee",
  "🛡️": "defend",
  "🛡": "defend",
  "⚡": "burst",
  "✨": "magic",
  "💨": "move",
  "🎯": "focus",
  "💀": "danger",
};

/**
 * Map any stored emoji/id string onto a folio glyph. Legacy emoji seeds (🎵, ⚔️,
 * 🎼, …) and the new stable ids both resolve here so old characters render
 * correctly without an engine migration.
 */
export function resolveAlgoIcon(stored: string): AlgoIcon {
  const byId = ALGO_ICONS.find((i) => i.id === stored);
  if (byId) return byId;
  const legacy = LEGACY_EMOJI_MAP[stored];
  if (legacy) {
    const mapped = ALGO_ICONS.find((i) => i.id === legacy);
    if (mapped) return mapped;
  }
  return DEFAULT_ALGO_ICON;
}
