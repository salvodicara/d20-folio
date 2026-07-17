/**
 * CmpSeal — the codex seal medallion a Compendium row wears in its leading slot.
 * It wraps a per-type lucide glyph in the SAME carved gilt-socket vocabulary the
 * spell level-seal uses (`.cmp-seal` recipe), so a feat / item / maneuver row
 * reads as a real struck seal on the tome leaf, not a bare icon floating in the
 * gutter. The pigment is set inline via `--seal` (a domain hue), with an optional
 * `--seal-ink` AA-safe variant for the glyph colour.
 *
 * Specs put this in their `row().leading`; the cockpit add-modals reuse the very
 * same specs, so the seal shows there too — one mark, every surface. Spells keep
 * their chromatic `.lvl-seal` (the digit IS the seal) and don't use this.
 */

import type { ComponentType, SVGProps } from "react";
import { Icon } from "@/components/ui/icon";

export function CmpSeal({
  icon,
  tone,
  toneInk,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** The `--seal` graphic hue (border + gem tint). Defaults to gold leaf. */
  tone?: string;
  /** The `--seal-ink` glyph colour (AA-safe). Defaults to the gold accent text. */
  toneInk?: string;
}) {
  const style: Record<string, string> = {};
  if (tone) style["--seal"] = tone;
  if (toneInk) style["--seal-ink"] = toneInk;
  return (
    <span className="cmp-seal" style={style} aria-hidden>
      <Icon as={icon} decorative />
    </span>
  );
}
