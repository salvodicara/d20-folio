/**
 * Action-log row STYLE — the per-row glyph + colour resolver (pure, framework-
 * light: only the lucide icon components, no React state).
 *
 * Extracted from `ActionLog.tsx` so the component file exports only a component
 * (React Fast-Refresh) AND so the resolver is unit-testable in isolation — see
 * `tests/unit/action-log-style.test.ts`.
 *
 * TWO AXES, kept separate:
 *   - GLYPH SHAPE follows the semantic `LogType` (Sparkles for a spell, Sword
 *     for an attack, Heart for a heal, Diamond for a feature/tracker…), so a
 *     row reads at a glance what KIND of thing happened.
 *   - ROW COLOUR follows the action-economy SLOT it consumed (`action`=green,
 *     `bonus`=blue, `reaction`=red, `free`=grey) — the SAME `--at-<slot>` family
 *     the cockpit action cards use (data-slot → `--at-*`). So a weapon attack (an
 *     Action) reads green, a bonus-action spell reads blue, and Counterspell (a
 *     Reaction) reads red — the log and the economy strip can never disagree.
 *
 * Glyph + border are still drawn from ONE family per row, so the icon and the
 * 3px left border can never drift onto two different hues:
 *   - `glyphColor`  → the deep `--at-*` / `--semantic-*` token (AA-safe as ink),
 *   - `borderColor` → the `--at-*-vivid` token (the bright graphic border).
 * The light theme keeps its deep-ink-text / vivid-graphic-border split; the dark
 * theme reads its already-bright base for both.
 *
 * FALLBACK: an entry with no slot — a non-action event (a thrown save, a death
 * save, a rest) or a legacy/seeded row — keeps its SEMANTIC hue (death-save red,
 * save amber, rest grey). Every runtime action commit carries a slot, so colour-
 * by-economy is what players actually see.
 */

import type { ComponentType, SVGProps } from "react";
import {
  Sparkles,
  Sword,
  Heart,
  Moon,
  AlertTriangle,
  Check,
  Diamond,
  Skull,
  ArrowRight,
  Dot,
  ShieldAlert,
  Hourglass,
} from "lucide-react";
import type { ActionType } from "@/data/types";

export type LucideGlyph = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Format a Unix-ms timestamp for the log row's trailing time (HH:MM, local). Pure
 * + locale-trivial (the 24-h clock reads identically in EN + IT), so it lives with
 * the row style rather than the localizing presenter.
 */
export function formatLogTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * The hue FAMILY a row belongs to. The invariant the row depends on: the glyph
 * colour and the border colour are derived from the SAME family, so they can
 * never visually clash. Asserted in the unit test.
 */
export type LogHueFamily =
  | "magic"
  | "reaction"
  | "action"
  | "bonus"
  | "warning"
  | "free"
  | "neutral";

export interface LogStyle {
  /** The icon component for this row (from the semantic type). */
  glyph: LucideGlyph;
  /** Glyph ink colour — deep `--at-*` / semantic token (CSS var string). */
  glyphColor: string;
  /** Left-border colour — vivid graphic token (CSS var string). */
  borderColor: string;
  /** Which hue family both colours belong to (test invariant + semantics). */
  hueFamily: LogHueFamily;
}

// Per-family colour pair: deep ink (glyph) + vivid graphic (border). Both read
// from the same family so a row is always internally consistent. The economy
// families (action/bonus/reaction/free) mirror the cockpit's `--at-*` palette.
const FAMILY_COLORS: Record<LogHueFamily, { glyph: string; border: string }> = {
  magic: { glyph: "var(--at-magic)", border: "var(--at-magic-vivid)" },
  reaction: { glyph: "var(--at-reaction)", border: "var(--at-reaction-vivid)" },
  action: { glyph: "var(--at-action)", border: "var(--at-action-vivid)" },
  bonus: { glyph: "var(--at-bonus)", border: "var(--at-bonus-vivid)" },
  warning: { glyph: "var(--semantic-warning)", border: "var(--semantic-warning)" },
  free: { glyph: "var(--at-free)", border: "var(--at-free-vivid)" },
  neutral: { glyph: "var(--text-secondary)", border: "var(--border-medium)" },
};

/**
 * The economy SLOT → hue family — the row's COLOUR axis. One-to-one with the
 * `--at-<slot>` tokens the cockpit cards paint with (action=verdigris green,
 * bonus=lapis blue, reaction=vermilion red, free=neutral grey).
 */
const SLOT_FAMILY: Record<ActionType, LogHueFamily> = {
  action: "action",
  bonus: "bonus",
  reaction: "reaction",
  free: "free",
};

const GENERIC_ICON: LucideGlyph = Dot;

// Semantic type → { icon, FALLBACK hue family }. The glyph is always taken from
// here (the SHAPE axis). The family is used ONLY when the entry carries no
// economy slot (non-action events / legacy rows). Covers every LogType the
// engine emits plus the mock/aliases.
const TYPE_STYLE: Record<string, { glyph: LucideGlyph; family: LogHueFamily }> = {
  "spell-cast": { glyph: Sparkles, family: "magic" },
  spell: { glyph: Sparkles, family: "magic" },
  damage: { glyph: Sword, family: "reaction" },
  attack: { glyph: Sword, family: "reaction" },
  heal: { glyph: Heart, family: "action" },
  rest: { glyph: Moon, family: "free" },
  save: { glyph: ShieldAlert, family: "warning" },
  "condition-add": { glyph: AlertTriangle, family: "warning" },
  "condition-remove": { glyph: Check, family: "action" },
  "tracker-use": { glyph: Diamond, family: "bonus" },
  "death-save": { glyph: Skull, family: "reaction" },
  "turn-end": { glyph: ArrowRight, family: "neutral" },
  "effect-expired": { glyph: Hourglass, family: "neutral" },
  generic: { glyph: GENERIC_ICON, family: "neutral" },
  other: { glyph: GENERIC_ICON, family: "neutral" },
};

/**
 * Resolve a log entry to its full row style. The GLYPH comes from the semantic
 * `type`; the COLOUR comes from the economy `slot` when present (action/bonus/
 * reaction/free → the matching `--at-*` family), else falls back to the type's
 * semantic hue. Glyph + border always share the resolved family, so a row can
 * never show two clashing hues. Unknown/legacy types fall back to the neutral
 * generic glyph — never an undefined palette.
 */
export function resolveLogStyle(type: string, slot?: ActionType): LogStyle {
  const typeStyle = TYPE_STYLE[type] ?? TYPE_STYLE.generic;
  // `generic` is always present, so `typeStyle` is defined; narrow for strict mode.
  const { glyph, family: semanticFamily } = typeStyle ?? {
    glyph: GENERIC_ICON,
    family: "neutral",
  };
  // Colour axis: economy slot wins; semantic hue is the slot-less fallback.
  const family: LogHueFamily = slot ? SLOT_FAMILY[slot] : semanticFamily;
  const colors = FAMILY_COLORS[family];
  return {
    glyph,
    glyphColor: colors.glyph,
    borderColor: colors.border,
    hueFamily: family,
  };
}

/** Every semantic type with an explicit glyph (for the coverage invariant test). */
export const STYLED_LOG_TYPES = Object.keys(TYPE_STYLE);
