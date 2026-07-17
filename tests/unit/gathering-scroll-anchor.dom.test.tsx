/**
 * useGatheringScrollAnchor — WIRING GUARD for B23 (owner-reported "jumps to a weird
 * place"). jsdom cannot lay out or scroll, so this does NOT prove the visual result —
 * it MOCKS each row's before/after top and asserts the hook computes the right
 * `window.scrollBy` delta on a gathering re-sort and stays inert when disabled / when
 * nothing re-sorted. The actual viewport behaviour MUST be verified by the owner in real
 * Chromium.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { render } from "@testing-library/react";
import {
  initiativeChangeAnchor,
  useGatheringScrollAnchor,
} from "@/features/campaigns/gathering-scroll-anchor";

// Mocked viewport tops keyed by each row's data-id — the hook reads these through the
// getBoundingClientRect stub, so a "re-sort" is just a swap of these numbers.
const positions = new Map<string, number>();

beforeAll(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
    this: Element
  ): DOMRect {
    const id = (this as HTMLElement).dataset.id;
    const top = id !== undefined ? (positions.get(id) ?? 0) : 0;
    return {
      top,
      bottom: top,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: top,
      toJSON: () => ({}),
    };
  });
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
});

// The scrollBy + getBoundingClientRect stubs persist across the file (restored in
// afterAll); each test only needs the call log cleared (beforeEach).
const scrollBySpy = () => vi.mocked(window.scrollBy);
beforeEach(() => {
  positions.clear();
  scrollBySpy().mockClear();
});

function Harness({
  enabled,
  rows,
}: {
  enabled: boolean;
  rows: { id: string; init: number | null }[];
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const rowIds = rows.map((r) => r.id);
  const initByRowId = new Map(rows.map((r) => [r.id, r.init] as const));
  useGatheringScrollAnchor({ enabled, rowIds, initByRowId, listRef });
  return (
    <ul ref={listRef}>
      {rows.map((r) => (
        <li key={r.id} data-id={r.id}>
          {r.id}
        </li>
      ))}
    </ul>
  );
}

describe("initiativeChangeAnchor (pure)", () => {
  it("returns the id whose initiative CHANGED (the just-committed card)", () => {
    const prev = new Map<string, number | null>([
      ["pc-a", 10],
      ["monster-1", null],
      ["pc-b", 7],
    ]);
    const next = new Map<string, number | null>([
      ["pc-a", 10],
      ["monster-1", 18],
      ["pc-b", 7],
    ]);
    expect(initiativeChangeAnchor(prev, next)).toBe("monster-1");
  });

  it("returns null when nothing changed (no re-sort to follow)", () => {
    const same = new Map<string, number | null>([
      ["pc-a", 10],
      ["monster-1", 18],
    ]);
    expect(initiativeChangeAnchor(same, new Map(same))).toBeNull();
  });

  it("ignores a row absent from the previous snapshot (a new reinforcement, not a re-sort)", () => {
    const prev = new Map<string, number | null>([["pc-a", 10]]);
    const next = new Map<string, number | null>([
      ["pc-a", 10],
      ["monster-1", 18],
    ]);
    expect(initiativeChangeAnchor(prev, next)).toBeNull();
  });
});

describe("useGatheringScrollAnchor (wiring guard — NOT a visual proof)", () => {
  it("scrolls by the moved anchor's delta so the just-committed row stays put", () => {
    // Baseline frame: the DM scrolled down; monster-1 (blank) sits at viewport top 100.
    positions.set("pc-a", 0);
    positions.set("monster-1", 100);
    positions.set("pc-b", 200);
    const before = [
      { id: "pc-a", init: 10 },
      { id: "monster-1", init: null },
      { id: "pc-b", init: 7 },
    ];
    const { rerender } = render(<Harness enabled rows={before} />);
    expect(scrollBySpy()).not.toHaveBeenCalled(); // first frame captures the baseline only

    // The DM commits monster-1 = 18 → it re-sorts to the TOP (new viewport top 0), pushing
    // the others down. Without compensation the viewport would now show different content.
    positions.set("monster-1", 0);
    positions.set("pc-a", 100);
    positions.set("pc-b", 200);
    rerender(
      <Harness
        enabled
        rows={[
          { id: "monster-1", init: 18 },
          { id: "pc-a", init: 10 },
          { id: "pc-b", init: 7 },
        ]}
      />
    );
    // delta = newTop(0) − prevTop(100) = −100 → scroll UP 100px so monster-1 lands back
    // under the user's eye. INSTANT (no smooth-behaviour arg).
    expect(scrollBySpy()).toHaveBeenCalledTimes(1);
    expect(scrollBySpy()).toHaveBeenCalledWith(0, -100);
  });

  it("does NOTHING when disabled (turns begun → frozen order, no live re-sort)", () => {
    positions.set("pc-a", 0);
    positions.set("monster-1", 100);
    const { rerender } = render(
      <Harness
        enabled={false}
        rows={[
          { id: "pc-a", init: 10 },
          { id: "monster-1", init: null },
        ]}
      />
    );
    positions.set("monster-1", 0);
    positions.set("pc-a", 100);
    rerender(
      <Harness
        enabled={false}
        rows={[
          { id: "monster-1", init: 18 },
          { id: "pc-a", init: 10 },
        ]}
      />
    );
    expect(scrollBySpy()).not.toHaveBeenCalled();
  });

  it("does NOTHING when no initiative changed (no re-sort to follow)", () => {
    positions.set("pc-a", 0);
    positions.set("monster-1", 100);
    const rows = [
      { id: "pc-a", init: 10 },
      { id: "monster-1", init: 18 },
    ];
    const { rerender } = render(<Harness enabled rows={rows} />);
    // Re-render with the SAME inits (e.g. a monster HP tick) — nothing sorts, no scroll.
    rerender(<Harness enabled rows={[...rows]} />);
    expect(scrollBySpy()).not.toHaveBeenCalled();
  });
});
