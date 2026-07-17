/**
 * useDismissOnOutside — the shared outside-dismiss primitive. The headline case is
 * the regression it fixes: a child that calls `stopPropagation` in the bubble phase
 * must NOT be able to keep the popover open (the old bubble-phase `mousedown`
 * listener could be suppressed; the capture-phase `pointerdown` cannot).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { useRef } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";

afterEach(cleanup);

function Harness({
  active,
  onDismiss,
  swallow = false,
}: {
  active: boolean;
  onDismiss: () => void;
  swallow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnOutside(active, ref, onDismiss);
  return (
    <div>
      <div ref={ref} data-testid="popover">
        <button data-testid="inside">option</button>
      </div>
      {/* An element OUTSIDE the popover that swallows bubble-phase pointerdown,
          mimicking a Radix portal / native select. */}
      <button
        data-testid="outside"
        onPointerDownCapture={swallow ? (e) => e.stopPropagation() : undefined}
      >
        outside
      </button>
    </div>
  );
}

describe("useDismissOnOutside", () => {
  it("dismisses on an outside pointerdown", () => {
    const onDismiss = vi.fn();
    render(<Harness active onDismiss={onDismiss} />);
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does NOT dismiss on a pointerdown inside the popover", () => {
    const onDismiss = vi.fn();
    render(<Harness active onDismiss={onDismiss} />);
    fireEvent.pointerDown(screen.getByTestId("inside"));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("still dismisses when a child swallows bubble-phase propagation (the regression)", () => {
    const onDismiss = vi.fn();
    render(<Harness active onDismiss={onDismiss} swallow />);
    fireEvent.pointerDown(screen.getByTestId("outside"));
    // Capture phase fires before the child's stopPropagation can suppress it.
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape", () => {
    const onDismiss = vi.fn();
    render(<Harness active onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("attaches no listeners while inactive", () => {
    const onDismiss = vi.fn();
    render(<Harness active={false} onDismiss={onDismiss} />);
    fireEvent.pointerDown(screen.getByTestId("outside"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
