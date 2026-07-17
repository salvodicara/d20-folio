/**
 * useEditModeShortcut (#101) — the ⌘E / Ctrl+E accelerator for the cockpit edit
 * toggle. Pins the contract: the combo toggles the SAME `uiStore.sheetMode` flag
 * the header pill drives; it is a NO-OP while typing in a field, a NO-OP on a
 * read-only sheet, and tears its listener down on unmount (no leak).
 *
 * Also pins the platform-correct shortcut LABEL the discoverability tooltip shows
 * (⌘E on Mac, Ctrl E elsewhere) — derived from the shared `shortcutLabel`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { useEditModeShortcut } from "@/hooks/useEditModeShortcut";
import { useUIStore } from "@/stores/uiStore";
import { shortcutLabel } from "@/lib/platform";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  // Each test starts in play mode (the toggle's "before" state).
  useUIStore.setState({ sheetMode: "play" });
});

function Harness({ readonly = false }: { readonly?: boolean }) {
  useEditModeShortcut(readonly);
  return (
    <div>
      <input data-testid="field" />
      <textarea data-testid="area" />
      <div data-testid="editable" contentEditable suppressContentEditableWarning />
    </div>
  );
}

/** The platform command modifier + E (no Shift/Alt). */
function pressEditCombo(target: Document | HTMLElement = document): void {
  fireEvent.keyDown(target, { key: "e", metaKey: true });
}

describe("useEditModeShortcut (#101)", () => {
  it("toggles sheetMode play↔edit on ⌘/Ctrl+E", () => {
    render(<Harness />);
    expect(useUIStore.getState().sheetMode).toBe("play");
    pressEditCombo();
    expect(useUIStore.getState().sheetMode).toBe("edit");
    pressEditCombo();
    expect(useUIStore.getState().sheetMode).toBe("play");
  });

  it("toggles on the Ctrl variant too (Windows/Linux)", () => {
    render(<Harness />);
    fireEvent.keyDown(document, { key: "E", ctrlKey: true });
    expect(useUIStore.getState().sheetMode).toBe("edit");
  });

  it("ignores a bare E and modifier-augmented chords (Shift/Alt)", () => {
    render(<Harness />);
    fireEvent.keyDown(document, { key: "e" }); // no command modifier
    fireEvent.keyDown(document, { key: "e", metaKey: true, shiftKey: true });
    fireEvent.keyDown(document, { key: "e", ctrlKey: true, altKey: true });
    expect(useUIStore.getState().sheetMode).toBe("play");
  });

  it("is a NO-OP while typing in an input / textarea / contenteditable", () => {
    const { getByTestId } = render(<Harness />);
    pressEditCombo(getByTestId("field"));
    pressEditCombo(getByTestId("area"));
    pressEditCombo(getByTestId("editable"));
    expect(useUIStore.getState().sheetMode).toBe("play");
  });

  it("is a NO-OP when the sheet is read-only (DM viewer)", () => {
    render(<Harness readonly />);
    pressEditCombo();
    expect(useUIStore.getState().sheetMode).toBe("play");
  });

  it("removes its keydown listener on unmount (no leak)", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Harness />);
    const keydownAdds = add.mock.calls.filter(([type]) => type === "keydown").length;
    expect(keydownAdds).toBeGreaterThan(0);
    unmount();
    const keydownRemoves = remove.mock.calls.filter(
      ([type]) => type === "keydown"
    ).length;
    expect(keydownRemoves).toBe(keydownAdds);
    // After teardown the combo is inert.
    pressEditCombo();
    expect(useUIStore.getState().sheetMode).toBe("play");
  });

  it("prevents default only on a handled press", () => {
    render(<Harness />);
    const handled = new KeyboardEvent("keydown", {
      key: "e",
      metaKey: true,
      cancelable: true,
      bubbles: true, // real keyboard events bubble to the window listener
    });
    document.dispatchEvent(handled);
    expect(handled.defaultPrevented).toBe(true);

    const ignored = new KeyboardEvent("keydown", {
      key: "x",
      cancelable: true,
      bubbles: true,
    });
    document.dispatchEvent(ignored);
    expect(ignored.defaultPrevented).toBe(false);
  });
});

describe("edit-mode shortcut label", () => {
  it("shows ⌘E on macOS", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel", userAgent: "" });
    expect(shortcutLabel("E")).toBe("⌘E");
  });

  it("shows Ctrl E on Windows/Linux", () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "" });
    expect(shortcutLabel("E")).toBe("Ctrl E");
  });
});
