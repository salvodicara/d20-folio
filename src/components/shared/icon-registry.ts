/**
 * Folio icon registry — the ONE icon-authoring vocabulary (non-component module so
 * the `IconPicker` component file can stay fast-refresh-clean).
 *
 * A FIXED subset of lucide glyphs is the only authoring + rendering vocabulary for
 * any user-chosen icon (combat-algorithm steps AND custom features). The engine
 * field stays a string, but we never paint a raw OS emoji: every stored value
 * resolves to one of these glyphs (legacy emoji seeds + the stable ids both map
 * here, so old data renders without a migration; unknown → the default burst).
 */

import {
  Music,
  HeartPulse,
  Swords,
  Shield,
  Zap,
  Sparkles,
  Wind,
  Target,
  Skull,
  ListChecks,
  type LucideIcon,
} from "lucide-react";

export interface AlgoIcon {
  /** Stable key + the string persisted into the `emoji` field. */
  id: string;
  glyph: LucideIcon;
}

/** `burst` (Zap) is the neutral fallback + new-step / new-feature seed. */
export const DEFAULT_ALGO_ICON: AlgoIcon = { id: "burst", glyph: Zap };

export const ALGO_ICONS: readonly AlgoIcon[] = [
  { id: "control", glyph: Music },
  { id: "support", glyph: HeartPulse },
  { id: "melee", glyph: Swords },
  { id: "defend", glyph: Shield },
  DEFAULT_ALGO_ICON,
  { id: "magic", glyph: Sparkles },
  { id: "move", glyph: Wind },
  { id: "focus", glyph: Target },
  { id: "danger", glyph: Skull },
  { id: "checklist", glyph: ListChecks },
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
