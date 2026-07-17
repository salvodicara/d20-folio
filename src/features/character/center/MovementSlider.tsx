/**
 * MovementSlider — the turn-meter movement budget (item d). Movement is spent in
 * 5-ft increments, so this is a SEGMENTED meter where every legal value is reached
 * three complementary ways (golden rule 20 — and an off-grid / out-of-range value
 * can never be entered):
 *
 *  1. TAP a segment to set remaining movement to that boundary (the fast path —
 *     the SAME tap-a-pip gesture the exhaustion track + tracker pips use, so it's
 *     consistent and a single tap, never a fiddly drag);
 *  2. ARROW-KEY / Home / End — the segment row is a real `role="slider"`, so
 *     keyboard + screen-reader users step it by 5 ft with `aria-valuetext`;
 *  3. TYPE the remaining footage in the field beside it.
 *
 * The track is a slim carved CHANNEL: a single left-anchored GOLD `.move-fill`
 * whose width = remaining / max, draining from its leading (right) edge as movement
 * is spent ("golden steps" — gold at every level, deep at the anchored end and
 * brighter toward the leading edge, so it reads as movement, never health). A warm
 * dot marks the leading edge; engraved 5-ft ticks sit above it. The whole channel is
 * still ONE `role="slider"` (click anywhere / arrow-key / type) — the fill is decoration.
 *
 * Feet is the canonical unit (the same plain number `speed` is stored in). The
 * typed field edits the player's DISPLAYED unit (EN feet / IT metres) and converts
 * through the shared `speedFromLocaleValue` / `speedToLocaleValue` helpers — the
 * SAME round-trip the speed editor uses — so units never mix and the IT
 * metre↔foot snap stays consistent. Pure presentation + a single `onChange(usedFt)`;
 * the ThisTurnTracker owns the combat-store binding.
 */

import {
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { localeDistance, speedFromLocaleValue, speedToLocaleValue } from "@/lib/utils";
import type { Locale } from "@/lib/locale";

export interface MovementSliderProps {
  /** Total walking speed this turn, in feet (already exhaustion-adjusted). */
  speedFt: number;
  /** Movement already used this turn, in feet (clamped to [0, speedFt]). */
  usedFt: number;
  /** Commit a new USED value (already snapped + clamped) in feet. */
  onChange: (usedFt: number) => void;
  locale: Locale;
  /**
   * B1 — `true` when an active condition (Grappled / Restrained / the Paralyzed
   * family) zeroes the character's speed. Informational + override-first: the
   * slider stays manually editable (a player may move via a feature that ignores
   * speed-0), so this only DIMS the track + renders the readout as a struck "0"
   * with a lock glyph. The CAUSE is NOT re-stated here — it is carried solely by
   * the "what's limiting you this turn" banner (single source / DRY).
   */
  speedZero?: boolean;
}

/** Snap to the nearest 5-ft increment and clamp into [0, max]. */
function snapClamp(ft: number, max: number): number {
  const snapped = Math.round(ft / 5) * 5;
  return Math.max(0, Math.min(max, snapped));
}

export function MovementSlider({
  speedFt,
  usedFt,
  onChange,
  locale,
  speedZero,
}: MovementSliderProps) {
  const { t } = useTranslation();
  // While the readout is focused, a local draft string lets the player clear /
  // partially type without the controlled value snapping back each keystroke.
  const [draft, setDraft] = useState<string | null>(null);

  const used = snapClamp(usedFt, speedFt);
  const remainingFt = speedFt - used;
  const segments = Math.max(0, Math.round(speedFt / 5));
  const remainingSegments = segments - Math.round(used / 5);

  const valueText = t("combat.movementRemaining", {
    remaining: localeDistance(remainingFt, locale),
    total: localeDistance(speedFt, locale),
  });

  // Commit a REMAINING value in feet (snapped + clamped) as USED = speed − rem.
  const commitRemainingFt = (remFt: number): void =>
    onChange(speedFt - snapClamp(remFt, speedFt));

  // Tap (or click) ANYWHERE on the bar to set remaining to that point — position-
  // precise, snapped to the 5-ft segment under the pointer. Computed from the
  // click X within the track so the meter stays a SINGLE interactive control
  // (`role="slider"`); nesting clickable segment-buttons inside the slider would be
  // a WCAG nested-interactive violation. Tapping the current boundary frees that
  // last segment (the immediate, reversible feel the old cycle had).
  const onTrackClick = (e: MouseEvent<HTMLDivElement>): void => {
    if (segments <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    const wantRemaining = Math.min(
      segments,
      Math.max(1, Math.ceil(frac * segments) || 1)
    );
    const next = wantRemaining === remainingSegments ? wantRemaining - 1 : wantRemaining;
    commitRemainingFt(next * 5);
  };

  // Keyboard slider semantics on the bar (Left/Down −5 ft remaining, etc).
  const onSliderKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const KEY_DELTAS: Record<string, number | "min" | "max"> = {
      ArrowRight: 5,
      ArrowUp: 5,
      ArrowLeft: -5,
      ArrowDown: -5,
      Home: "min",
      End: "max",
    };
    const action = KEY_DELTAS[e.key];
    if (action === undefined) return;
    e.preventDefault();
    const next = action === "min" ? 0 : action === "max" ? speedFt : remainingFt + action;
    commitRemainingFt(next);
  };

  // The field shows REMAINING in the displayed unit (feet / metres). On input we
  // convert the locale number → feet, snap+clamp, and commit USED = speed − rem.
  const commitField = (raw: string): void => {
    if (raw.trim() === "") return; // empty draft → keep current (revert on blur)
    commitRemainingFt(Number(speedFromLocaleValue(raw, locale)));
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    // IT uses a comma decimal separator, so allow digits + one comma/period.
    const cleaned = e.target.value.replace(/[^\d.,]/g, "");
    setDraft(cleaned);
    commitField(cleaned);
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>): void => {
    setDraft(null);
    commitField(e.target.value);
  };

  return (
    <div
      className="econ-tok move-slider"
      data-kind="move"
      data-state={used >= speedFt && speedFt > 0 ? "spent" : "open"}
      data-speed-zero={speedZero ? "" : undefined}
      data-move-empty={remainingFt <= 0 ? "" : undefined}
    >
      {/* The carved channel IS the slider — one interactive control: click
          anywhere to set remaining to that point, arrow-keys to step. The fill +
          ticks are pure decoration, so the slider has no nested interactive
          children (WCAG nested-interactive). The fill width + tick pitch derive
          from the CSS vars (remaining / max feet + the 5-ft segment count). */}
      <div
        className="move-bar move-slider-bar"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={speedFt}
        aria-valuenow={remainingFt}
        aria-valuetext={valueText}
        aria-label={t("combat.movementSpend")}
        onKeyDown={onSliderKey}
        onClick={onTrackClick}
      >
        <span
          className="move-bar-track"
          aria-hidden
          style={
            {
              "--mv-rem": remainingFt,
              "--mv-max": Math.max(1, speedFt),
              "--mv-seg": Math.max(1, segments),
            } as CSSProperties
          }
        >
          <span className="move-fill" />
        </span>
      </div>
      <span className="econ-cap">{t("combat.movement")}</span>
      {speedZero ? (
        // B1 — a condition zeroes speed. The readout reads a clean, dimmed +
        // struck "0 <unit>" with a lock glyph — no contradictory footage, no
        // wrapping crimson caption (the CAUSE is carried solely by the "what's
        // limiting you this turn" banner — single source / DRY). Override-first:
        // the segmented bar + arrow-keys stay interactive, so a player whose
        // feature ignores speed-0 can still spend movement.
        <span className="move-num move-num-zero" role="status">
          <Icon as={Lock} decorative className="move-zero-lock" />
          <span className="move-zero-val">{localeDistance(0, locale)}</span>
          <span className="sr-only">{t("combat.speedZeroShort")}</span>
        </span>
      ) : (
        <span className="move-num">
          {/* Typeable REMAINING readout in the displayed unit (digit-filtered, snaps
              to 5 ft, clamped). The total beside it carries the unit, so the value
              is never shown unitless. */}
          <input
            type="text"
            inputMode="numeric"
            className="move-num-in"
            value={draft ?? speedToLocaleValue(remainingFt, locale)}
            aria-label={t("combat.movementRemainingField")}
            onFocus={(e) => {
              setDraft(speedToLocaleValue(remainingFt, locale));
              e.target.select();
            }}
            onChange={handleChange}
            onBlur={handleBlur}
          />{" "}
          / {localeDistance(speedFt, locale)}
        </span>
      )}
    </div>
  );
}
