/**
 * `useAfterLoad` holds a background job (the fight producer) until the page has loaded
 * and the browser is idle, so the screen's own code and data download first on a slow
 * phone. It fires once, and at once when the page had already loaded.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAfterLoad } from "@/app/use-after-load";

let readyState: DocumentReadyState = "loading";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "readyState", "get").mockImplementation(() => readyState);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useAfterLoad", () => {
  it("waits for the page's load event, then for an idle moment", () => {
    readyState = "loading";
    const { result } = renderHook(() => useAfterLoad());
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(false);

    readyState = "complete";
    act(() => {
      window.dispatchEvent(new Event("load"));
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(true);
  });

  it("starts at once (after an idle moment) when the page had already loaded", () => {
    readyState = "complete";
    const { result } = renderHook(() => useAfterLoad());
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(true);
  });
});
