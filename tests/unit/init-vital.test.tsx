/**
 * InitVital — the `.vital-init` roll-to-total chip focus/scroll guard (B27).
 *
 * The edit input's mount effect calls `inputRef.current?.focus()`. Without
 * `{ preventScroll: true }`, focusing a chip that morphs into an input partly outside
 * the viewport (a tap near the bottom on mobile) yanks the page to bring it fully into
 * view — an abrupt jump. jsdom doesn't model scroll position, so this is a guard test
 * on the wiring (the actual `focus()` call), not the resulting scroll — the tightest
 * proof available without a real browser.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { InitVital } from "@/features/campaigns/init-vital";

describe("InitVital — the edit input focuses without scrolling the page (B27)", () => {
  it("calls focus with { preventScroll: true } when mounting straight into edit mode", () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    render(
      <InitVital
        value={null}
        bonus={2}
        canEdit
        name="Mara"
        onCommit={() => {}}
        autoEdit
      />
    );
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });
});
