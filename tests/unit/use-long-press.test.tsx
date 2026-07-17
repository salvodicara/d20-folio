/**
 * useLongPress — the press-and-hold gesture that enters roster selection on touch.
 *
 * Pins: it fires after the hold delay; a drag beyond tolerance cancels it; `consume()`
 * reports the just-fired press exactly once (so the trailing click is swallowed); and
 * it is a no-op when disabled.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useLongPress } from "@/hooks/useLongPress";

function press(x = 0, y = 0, over: Partial<ReactPointerEvent> = {}): ReactPointerEvent {
  return {
    pointerType: "touch",
    button: 0,
    clientX: x,
    clientY: y,
    ...over,
  } as ReactPointerEvent;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useLongPress", () => {
  it("fires after the hold delay and consume() returns true exactly once", () => {
    const onLong = vi.fn();
    const { result } = renderHook(() => useLongPress(onLong, { delayMs: 470 }));

    act(() => result.current.handlers.onPointerDown(press()));
    expect(onLong).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(480));
    expect(onLong).toHaveBeenCalledTimes(1);

    expect(result.current.consume()).toBe(true); // swallow the trailing click
    expect(result.current.consume()).toBe(false); // only once
  });

  it("a drag beyond tolerance cancels the press", () => {
    const onLong = vi.fn();
    const { result } = renderHook(() =>
      useLongPress(onLong, { delayMs: 470, moveTolerance: 10 })
    );
    act(() => result.current.handlers.onPointerDown(press(0, 0)));
    act(() => result.current.handlers.onPointerMove(press(40, 0)));
    act(() => void vi.advanceTimersByTime(480));
    expect(onLong).not.toHaveBeenCalled();
  });

  it("pointer up before the delay cancels it", () => {
    const onLong = vi.fn();
    const { result } = renderHook(() => useLongPress(onLong, { delayMs: 470 }));
    act(() => result.current.handlers.onPointerDown(press()));
    act(() => result.current.handlers.onPointerUp());
    act(() => void vi.advanceTimersByTime(480));
    expect(onLong).not.toHaveBeenCalled();
  });

  it("is a no-op when disabled", () => {
    const onLong = vi.fn();
    const { result } = renderHook(() =>
      useLongPress(onLong, { delayMs: 470, enabled: false })
    );
    act(() => result.current.handlers.onPointerDown(press()));
    act(() => void vi.advanceTimersByTime(480));
    expect(onLong).not.toHaveBeenCalled();
    expect(result.current.consume()).toBe(false);
  });

  it("ignores a non-primary mouse button", () => {
    const onLong = vi.fn();
    const { result } = renderHook(() => useLongPress(onLong, { delayMs: 470 }));
    act(() =>
      result.current.handlers.onPointerDown(
        press(0, 0, { pointerType: "mouse", button: 2 })
      )
    );
    act(() => void vi.advanceTimersByTime(480));
    expect(onLong).not.toHaveBeenCalled();
  });
});
