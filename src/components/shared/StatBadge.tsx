/**
 * StatBadge — the ONE stat tile/chip atom shared by every surface that renders a
 * character/combatant statistic: the cockpit hero bar, the roster card, the
 * campaign party card, and the monster combatant row. It encodes the SINGLE
 * content format — a leading muted ICON + an uppercase ACRONYM + the VALUE — so
 * the same stat reads identically everywhere (golden rule 6: one idea modeled in
 * three places is one component). The `density` prop is the only thing that
 * varies: `tile` is the carved column the cockpit uses; `chip` is the compact
 * horizontal row every other surface uses. The full term lives only in the hover
 * title / aria-label — it never widens the badge.
 *
 * HP and initiative carry extra structure (a slim Liquid-Mercury bar; a roll /
 * edit affordance), so they get dedicated companions — {@link HpBadge},
 * {@link InitBadge} — that share this atom's icon-label vocabulary + `.vital` CSS.
 * Those return the INNER content so the calling surface owns the interactive
 * wrapper (a popover trigger, a roll button) while the markup stays single-source
 * (golden rule 10 — no parallel per-surface badge markup).
 *
 * The atom renders the proven carved `.vital` chrome (folio.css), gated by
 * `data-density`; bare `.vital` (no `data-density`) stays the legacy
 * creation/level-up tile, untouched.
 */

import type { ComponentType, ReactNode, SVGProps } from "react";
import { Heart } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type StatDensity = "tile" | "chip";
type Glyph = ComponentType<SVGProps<SVGSVGElement>>;

/** The icon + uppercase acronym pair every stat badge shares: a muted glyph
 *  inline-left of the acronym (CSS uppercases + tracks the acronym). The single
 *  source for "an icon on every stat" — Shield/Heart/Dices/Footprints/Eye/Award. */
export function StatLabel({ icon, acronym }: { icon: Glyph; acronym: ReactNode }) {
  return (
    <span className="v-lbl">
      <Icon as={icon} size="xs" decorative className="v-ico" />
      <span className="v-acr">{acronym}</span>
    </span>
  );
}

export interface StatBadgeProps {
  /** The muted leading glyph — one canonical icon per stat. */
  icon: Glyph;
  /** The uppercase acronym (CA/INIZ/VEL/PP/BC in IT, AC/INIT/SPD/PP/PB in EN).
   *  May be a `GlossaryTip` trigger. */
  acronym: ReactNode;
  /** The value — a number/string, or an `InlineEditable` / `BreakdownTip` node. */
  value: ReactNode;
  /** The full term — hover title + aria-label; never rendered inline. */
  fullLabel: string;
  /** Plain-text value for the aria-label readout. Omit when `value` is interactive
   *  and already carries its own accessible name (the cockpit InlineEditable). */
  valueText?: string | number;
  density?: StatDensity;
  /** Optional top-right slot (e.g. the initiative-advantage mark). */
  corner?: ReactNode;
  className?: string;
}

export function StatBadge({
  icon,
  acronym,
  value,
  fullLabel,
  valueText,
  density = "tile",
  corner,
  className,
}: StatBadgeProps) {
  return (
    <span
      className={cn("vital", corner && "relative", className)}
      data-density={density}
      title={fullLabel}
      aria-label={valueText != null ? `${fullLabel}: ${valueText}` : undefined}
    >
      <span className="v-val">{value}</span>
      <StatLabel icon={icon} acronym={acronym} />
      {corner}
    </span>
  );
}

export interface HpBarProps {
  /** Base fill percentage (current/max, already clamped by the caller). */
  pct: number;
  /** Temp HP — drawn as the lapis overlay segment stacked after the base fill. */
  temp: number;
  /** Effective max HP — sizes the temp segment. */
  max: number;
  /** The `hpState` tier — drives the bar colour via `data-state`. */
  state: string;
  className?: string;
}

/**
 * HpBar — the ONE Liquid-Mercury bar (recessed channel + gradient fill), shared
 * by the HP badge tiles/chips and the HP-edit popover so the markup can't fork.
 * Temp HP renders as the recipe's lapis OVERLAY SEGMENT stacked after the base
 * fill (DESIGN.md §5 "Health + resource bars"), clamped to the channel — the
 * buffer reads on the bar itself, not only as the "+N" text.
 */
export function HpBar({ pct, temp, max, state, className }: HpBarProps) {
  const tempPct =
    max > 0 && temp > 0
      ? Math.max(0, Math.min(100 - pct, Math.round((temp / max) * 100)))
      : 0;
  return (
    <span className={cn("hp-bar", className)} data-state={state} aria-hidden>
      <span className="hp-fill" style={{ ["--w" as string]: `${pct}%` }} />
      {tempPct > 0 && (
        <span
          className="hp-fill-temp"
          style={{ ["--w" as string]: `${pct}%`, ["--tw" as string]: `${tempPct}%` }}
        />
      )}
    </span>
  );
}

export interface HpBadgeProps {
  density?: StatDensity;
  current: number;
  max: number;
  temp: number;
  /** The `hpState` tier — drives the bar colour via `data-state`. */
  state: string;
  pct: number;
  /** The HP acronym (HP / PF). */
  hpLabel: string;
  /** The bloodied mark element (or null) — passed in so the shared atom needn't
   *  import the feature-layer `BloodiedMark`. */
  bloodiedMark?: ReactNode;
}

/**
 * HpBadge — the HP value/max(+temp) readout + the slim Liquid-Mercury bar + the
 * Heart icon-label, in the shared stat-badge vocabulary. Returns the INNER content
 * only; the caller wraps it in the interactive element it needs (the cockpit's
 * popover-trigger button, a static span, the party HP popover trigger). In `tile`
 * density the value, the slim bar, and the icon-label stack as one compact,
 * vertically-centred group (value → bar → acronym) so HP and the non-HP tiles read
 * as one aligned, gap-free family; in `chip` density the icon + acronym + value/max
 * sit inline with the slim bar BELOW on the same stat line (the owner's explicit ask).
 */
export function HpBadge({
  density = "tile",
  current,
  max,
  temp,
  state,
  pct,
  hpLabel,
  bloodiedMark,
}: HpBadgeProps) {
  const valInner = (
    <span className="vhp-val">
      <span>{current}</span>
      <span className="vhp-sep">/ {max}</span>
      {temp > 0 && <span className="vhp-temp">+{temp}</span>}
      {bloodiedMark}
    </span>
  );
  const bar = <HpBar pct={pct} temp={temp} max={max} state={state} />;

  if (density === "chip") {
    return (
      <>
        <span className="vhp-line">
          <Icon as={Heart} size="xs" decorative className="v-ico" />
          <span className="v-acr">{hpLabel}</span>
          {valInner}
        </span>
        {bar}
      </>
    );
  }

  return (
    <>
      {valInner}
      {bar}
      <StatLabel icon={Heart} acronym={hpLabel} />
    </>
  );
}

export interface InitBadgeProps {
  /** The displayed initiative value — a number, a dash, or a roll affordance. */
  value: ReactNode;
  /** The INIT / INIZ acronym (may be a `GlossaryTip`). */
  acronym: ReactNode;
  /** The Dices glyph — defaults to the canonical initiative icon. */
  icon: Glyph;
}

/**
 * InitBadge — the initiative value + the Dices icon-label, in the shared
 * stat-badge vocabulary. Returns the INNER content only so the caller owns the
 * wrapper (a roll-to-total button vs a static read), since the campaign init tile
 * is a click-to-roll affordance the no-dice rules keep entirely user-typed.
 */
export function InitBadge({ value, acronym, icon }: InitBadgeProps) {
  return (
    <>
      <span className="v-val">{value}</span>
      <StatLabel icon={icon} acronym={acronym} />
    </>
  );
}
