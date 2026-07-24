/**
 * The Inventory toolbar chips disclose through the app's ONE info-popover recipe,
 * never a native `title=`.
 *
 * REGRESSION (post-sweep C): the carrying-capacity chip carried its push/drag/lift
 * line (RA-27) as an HTML `title` attribute — Chromium paints that outside the
 * page and touch has no gesture for it at all, so on a phone the number was
 * literally unreachable. Every sibling number on the sheet uses the branded
 * `Popover` + `.glossary-pop` recipe (BreakdownTip / GlossaryTip / ActionRiders);
 * these chips now do too, tap-to-open on every device. The attunement chip beside
 * it had the same defect and rides the same fix.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { InventoryTab } from "@/features/character/center/tabs/InventoryTab";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import { buildInventoryViewModel } from "@/lib/views/inventory-view";
import type { CharacterDoc } from "@/types/character";

function load(doc: CharacterDoc = structuredClone(MOCK_CHARACTER)): void {
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

function renderTab() {
  return render(
    <MemoryRouter>
      <InventoryTab />
    </MemoryRouter>
  );
}

describe("Inventory toolbar chips — on-demand hints (no native title)", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
    useToastStore.setState({ toasts: [], timers: {} });
  });

  it("the capacity chip is a real trigger, and NO chip hides its hint in a title attribute", () => {
    load();
    const { container } = renderTab();
    const chips = [...container.querySelectorAll(".toolbar-chip")];
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip.tagName).toBe("BUTTON");
      expect(chip.hasAttribute("title")).toBe(false);
    }
  });

  it("tapping the capacity chip reveals the push/drag/lift number in the folio popover", () => {
    load();
    renderTab();
    const enc = buildInventoryViewModel(
      structuredClone(MOCK_CHARACTER),
      "en"
    ).encumbrance;
    if (!enc) throw new Error("encumbrance VM missing"); // narrows; no non-null `!`
    // Reached the way a player reaches it — by its READING. The accessible name
    // must CONTAIN the visible numbers (WCAG 2.5.3): a bare `aria-label="Carrying
    // Capacity"` would replace them, and a screen reader would hear the rubric
    // and never the data.
    const reading = `${enc.carried} lb / ${enc.capacity} lb`;
    const chip = screen.getByRole("button", { name: `Carrying Capacity: ${reading}` });
    expect(chip).toHaveTextContent(reading);
    // …and a chip that already names itself is NOT made to stutter: the
    // attunement chip's own text ("Attuned 2 / 3") IS its accessible name.
    expect(
      screen.getByRole("button", { name: /^Attuned \d+ \/ \d+$/ })
    ).toBeInTheDocument();
    // Nothing is disclosed until the player asks (progressive disclosure).
    expect(screen.queryByText(/push, drag, or lift/i)).toBeNull();
    fireEvent.click(chip);
    const body = screen.getByText(/push, drag, or lift/i);
    expect(body).toBeInTheDocument();
    // The actual RA-27 number rides the sentence (STR 8 → 240 lb).
    expect(body.textContent).toContain(`${enc.pushDragLift} lb`);
    // It is the branded folio popover, not a bespoke widget.
    expect(body.closest(".popover")).not.toBeNull();
  });
});
