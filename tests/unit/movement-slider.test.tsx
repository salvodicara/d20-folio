/**
 * MovementSlider (item d) — the segmented 5-ft-snap movement budget.
 *
 * Pins golden rule 20 for movement: every legal value is reachable THREE ways — by
 * TAPPING a segment (the fast path), by ARROW-KEYING the `role="slider"` row, and
 * by TYPING the remaining footage — and an off-grid / out-of-range value can never
 * be committed (snap to 5, clamp to [0, speed]). The IT locale edits in metres and
 * round-trips to feet through the shared speed helpers.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import i18n from "@/i18n";
import { MovementSlider } from "@/features/character/center/MovementSlider";

function renderSlider(usedFt = 0, onChange = vi.fn(), locale: "en" | "it" = "en") {
  render(
    <MovementSlider speedFt={30} usedFt={usedFt} onChange={onChange} locale={locale} />
  );
  return onChange;
}

describe("MovementSlider", () => {
  afterEach(async () => {
    if (i18n.language !== "en") {
      await act(async () => {
        await i18n.changeLanguage("en");
      });
    }
  });

  it("exposes the meter as a slider in REMAINING feet with the typed readout", () => {
    renderSlider(10); // used 10 → remaining 20 of 30
    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("aria-valuenow")).toBe("20");
    expect(slider.getAttribute("aria-valuemin")).toBe("0");
    expect(slider.getAttribute("aria-valuemax")).toBe("30");
    expect(screen.getByLabelText<HTMLInputElement>("Movement remaining").value).toBe(
      "20"
    );
    // The channel is a single left-anchored `.move-fill`, NOT nested interactive
    // children (the WCAG nested-interactive fix), so there are no segment buttons.
    expect(screen.queryAllByRole("button", { hidden: true }).length).toBe(0);
    // Its width + tick pitch derive from the track's CSS vars: remaining 20 / max 30
    // feet, over 6 five-ft segments — the fill spans remaining/max of the groove.
    const track = document.querySelector<HTMLElement>(".move-bar-track");
    expect(track?.style.getPropertyValue("--mv-rem")).toBe("20");
    expect(track?.style.getPropertyValue("--mv-max")).toBe("30");
    expect(track?.style.getPropertyValue("--mv-seg")).toBe("6");
    expect(document.querySelector(".move-fill")).not.toBeNull();
  });

  it("clicking a point on the bar sets remaining to the segment under the pointer", () => {
    const onChange = renderSlider(0);
    const bar = screen.getByRole("slider");
    // jsdom has no layout, so stub the bar's rect: 120px wide → 20px per segment.
    bar.getBoundingClientRect = () =>
      ({ left: 0, width: 120, top: 0, height: 14, right: 120, bottom: 14 }) as DOMRect;
    // Click ~1/3 across (x=40 of 120) → 2 of 6 segments remain = 10 ft → used 20.
    fireEvent.click(bar, { clientX: 40 });
    expect(onChange).toHaveBeenLastCalledWith(20);
    // Click near the far left (x=5) → 1 segment remains = 5 ft → used 25.
    fireEvent.click(bar, { clientX: 5 });
    expect(onChange).toHaveBeenLastCalledWith(25);
  });

  it("arrow keys step the remaining movement by 5 ft; Home/End jump to the bounds", () => {
    const onChange = renderSlider(0); // remaining 30
    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "ArrowLeft" }); // remaining 25 → used 5
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.keyDown(slider, { key: "Home" }); // remaining 0 → used 30
    expect(onChange).toHaveBeenLastCalledWith(30);
    fireEvent.keyDown(slider, { key: "End" }); // remaining 30 → used 0
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("typing remaining feet commits USED = speed − remaining, snapped + clamped", () => {
    const onChange = renderSlider(0);
    const field = screen.getByLabelText("Movement remaining");
    // Type 10 remaining → used 20.
    fireEvent.change(field, { target: { value: "10" } });
    expect(onChange).toHaveBeenLastCalledWith(20);
    // Off-grid (13) snaps to 15 remaining → used 15.
    fireEvent.change(field, { target: { value: "13" } });
    expect(onChange).toHaveBeenLastCalledWith(15);
    // Over the cap (99) clamps remaining to 30 → used 0.
    fireEvent.change(field, { target: { value: "99" } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("B1 — speed-0 swaps the readout to a clean struck '0' (no crimson caption, no editable field) but the bar stays interactive (override-first)", () => {
    const onChange = vi.fn();
    render(
      <MovementSlider speedFt={30} usedFt={0} onChange={onChange} locale="en" speedZero />
    );
    const tok = document.querySelector(".move-slider");
    expect(tok?.hasAttribute("data-speed-zero")).toBe(true);
    // The readout is the clean zeroed/locked treatment — a struck "0 ft", NOT the
    // editable footage field, and there is no crimson cause caption (the cause is
    // carried solely by the B3 "what's limiting you" banner — single source / DRY).
    const zero = document.querySelector(".move-num-zero");
    expect(zero).not.toBeNull();
    expect(zero?.querySelector(".move-zero-val")?.textContent).toBe("0 ft");
    expect(zero?.querySelector(".move-zero-lock")).not.toBeNull();
    expect(document.querySelector(".move-num-in")).toBeNull();
    // …yet the slider stays editable (a feature may let the player move anyway):
    // arrow-keying still commits a value, never hard-locked to 0.
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it("B1 — the zeroed readout reads '0 m' in IT with no overflowing caption", async () => {
    await act(async () => {
      await i18n.changeLanguage("it");
    });
    render(
      <MovementSlider speedFt={30} usedFt={0} onChange={vi.fn()} locale="it" speedZero />
    );
    expect(document.querySelector(".move-zero-val")?.textContent).toBe("0 m");
    // No legacy crimson caption element survives in either locale.
    expect(document.querySelector(".move-zero-note")).toBeNull();
  });

  it("B1 — the editable footage field shows + no zeroed state when no condition zeroes speed", () => {
    renderSlider(0);
    expect(document.querySelector(".move-num-zero")).toBeNull();
    expect(document.querySelector(".move-num-in")).not.toBeNull();
    expect(document.querySelector(".move-slider")?.hasAttribute("data-speed-zero")).toBe(
      false
    );
  });

  it("IT locale edits remaining in metres and round-trips to feet", async () => {
    await act(async () => {
      await i18n.changeLanguage("it");
    });
    const onChange = renderSlider(0, vi.fn(), "it");
    // 30 ft = 9 m; type 3 m remaining → 10 ft remaining → used 20 ft.
    const field = screen.getByLabelText<HTMLInputElement>("Movimento rimanente");
    expect(field.value).toBe("9");
    fireEvent.change(field, { target: { value: "3" } });
    expect(onChange).toHaveBeenLastCalledWith(20);
  });
});
