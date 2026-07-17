/**
 * useRosterSelection — the roster multi-select state machine (owner 2026-06-07).
 *
 * Pins enter / cancel / toggle / toggle-all / all-selected / count semantics so the
 * "Select → bulk action" mode can't silently regress.
 */

import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRosterSelection } from "@/features/roster/use-roster-selection";

describe("useRosterSelection", () => {
  it("starts idle (not selecting, nothing selected)", () => {
    const { result } = renderHook(() => useRosterSelection());
    expect(result.current.selecting).toBe(false);
    expect(result.current.count).toBe(0);
    expect(result.current.isSelected("a")).toBe(false);
  });

  it("enter() turns on selection mode; enter(id) also selects that id", () => {
    const { result } = renderHook(() => useRosterSelection());
    act(() => result.current.enter("a"));
    expect(result.current.selecting).toBe(true);
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.count).toBe(1);
  });

  it("toggle() adds then removes an id", () => {
    const { result } = renderHook(() => useRosterSelection());
    act(() => result.current.enter());
    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(true);
    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("cancel() leaves selection mode AND clears everything", () => {
    const { result } = renderHook(() => useRosterSelection());
    act(() => result.current.enter("a"));
    act(() => result.current.toggle("b"));
    expect(result.current.count).toBe(2);
    act(() => result.current.cancel());
    expect(result.current.selecting).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("toggleAll selects all when some are unselected, then clears them", () => {
    const { result } = renderHook(() => useRosterSelection());
    const ids = ["a", "b", "c"];
    act(() => result.current.enter("a")); // one already selected
    expect(result.current.allSelected(ids)).toBe(false);

    act(() => result.current.toggleAll(ids)); // not all selected → select all
    expect(result.current.allSelected(ids)).toBe(true);
    expect(result.current.count).toBe(3);

    act(() => result.current.toggleAll(ids)); // all selected → clear them
    expect(result.current.allSelected(ids)).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("allSelected is false for an empty id list (nothing to be 'all' of)", () => {
    const { result } = renderHook(() => useRosterSelection());
    act(() => result.current.enter());
    expect(result.current.allSelected([])).toBe(false);
  });
});
