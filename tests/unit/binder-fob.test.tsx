/**
 * BinderFob — "The Binder's Fob", the sheet's DESKTOP management home. Pins:
 * the home gate (fine-pointer ≥768px only + own-sheet + not-readonly), the
 * chain anatomy (undo/redo mount ABOVE the standing ⋯ · ✎ coins only while
 * history exists; the standing coins hold their DOM place), the ACTIVATED edit
 * coin (aria-pressed + data-editing + the name flip Edit ⇄ Done editing, the
 * tooltip mirror, EN + IT), the undo/redo act-through (the same seam as ⌘Z),
 * and the glass-case hiding. Real geometry/no-reflow/toast lanes live in
 * tests/e2e/binder-fob.spec.ts (jsdom has no layout).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import i18n from "@/i18n";

// The fob's ⋯ menu hosts SnapshotsHistory → @/lib/firestore → Firebase. Stub
// Firebase so the unit suite stays CI-pure; the dialog stays closed here.
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { BinderFob } from "@/features/character/BinderFob";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore, registerUndoable } from "@/stores/undoStore";
import { useToastStore } from "@/stores/toastStore";
import { MOCK_CHARACTER } from "@/lib/mock";

const FOB_HOME = "(pointer: fine) and (min-width: 768px)";
const originalMatchMedia = window.matchMedia;

/** Make the fob-home query answer `matches` (other queries stay false). */
function stubFobHome(matches: boolean): void {
  window.matchMedia = (query: string) => ({
    matches: query === FOB_HOME && matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

function loadSheet(): void {
  useCharacterStore.setState({
    character: structuredClone(MOCK_CHARACTER),
    loading: false,
    error: null,
    readonly: false,
  });
}

/** True when `b` follows `a` in DOM order (the chain's top-to-bottom pin). */
const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

function makeResource(start = 3) {
  const state = { value: start };
  return {
    state,
    spend: (n = 1) => {
      state.value -= n;
      return () => {
        state.value += n;
      };
    },
  };
}

beforeEach(async () => {
  if (i18n.language !== "en") {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  }
  stubFobHome(true);
  useUIStore.setState({ sheetMode: "play" });
  useUndoStore.setState({ characterId: null, past: [], future: [] });
  useToastStore.getState().clearAll();
  useCharacterStore.setState({
    character: null,
    loading: false,
    error: null,
    readonly: false,
  });
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("BinderFob — the home gate", () => {
  it("renders nothing off the fob home (coarse/narrow — the masthead line's turf)", () => {
    stubFobHome(false);
    loadSheet();
    const { container } = render(<BinderFob />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing without a loaded character", () => {
    const { container } = render(<BinderFob />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing on a read-only glass-case sheet", () => {
    loadSheet();
    useCharacterStore.setState({ readonly: true });
    registerUndoable({ message: "X" }, () => makeResource().spend(1), {
      turnScoped: false,
    });
    const { container } = render(<BinderFob />);
    expect(container.firstChild).toBeNull();
  });
});

describe("BinderFob — the chain anatomy", () => {
  it("stands ⋯ + ✎ with an empty stack — no undo/redo coins, ✎ last (bottom)", () => {
    loadSheet();
    const { container } = render(<BinderFob />);
    const fob = container.querySelector(".fob");
    expect(fob).not.toBeNull();
    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /redo/i })).not.toBeInTheDocument();
    const extras = screen.getByRole("button", { name: /more actions/i });
    const edit = screen.getByRole("button", { name: /^edit$/i });
    expect(fob).toContainElement(extras);
    expect(fob).toContainElement(edit);
    // ✎ is the LAST coin — the bottom of the bottom-anchored column.
    expect(edit).toHaveClass("fob-edit");
    expect(follows(extras, edit)).toBe(true);
  });

  it("mounts the session pair ABOVE the standing coins while history exists (disabled empty side)", () => {
    loadSheet();
    registerUndoable({ message: "Attack" }, () => makeResource().spend(1), {
      turnScoped: false,
    });
    render(<BinderFob />);
    const undo = screen.getByRole("button", { name: /^Undo: /i });
    const redo = screen.getByRole("button", { name: "Redo" });
    expect(undo).not.toBeDisabled();
    // The empty side shows DISABLED — no in-pair shift while you work the stack.
    expect(redo).toBeDisabled();
    // DOM order undo → redo → ⋯ → ✎: in the bottom-anchored column the pair
    // sits ABOVE, so mounting it never moves the standing coins.
    const extras = screen.getByRole("button", { name: /more actions/i });
    const edit = screen.getByRole("button", { name: /^edit$/i });
    expect(follows(undo, redo)).toBe(true);
    expect(follows(redo, extras)).toBe(true);
    expect(follows(extras, edit)).toBe(true);
  });

  it("undo acts through the same seam as ⌘Z — reverses the act and flips the pair", () => {
    loadSheet();
    const r = makeResource();
    registerUndoable({ message: "Attack" }, () => r.spend(1), { turnScoped: false });
    expect(r.state.value).toBe(2);
    render(<BinderFob />);
    fireEvent.click(screen.getByRole("button", { name: /^Undo: /i }));
    expect(r.state.value).toBe(3);
    expect(useUndoStore.getState().past).toHaveLength(0);
    // The act is now redoable through the redo coin.
    const redo = screen.getByRole("button", { name: /^Redo: /i });
    expect(redo).not.toBeDisabled();
    fireEvent.click(redo);
    expect(r.state.value).toBe(2);
  });
});

describe("BinderFob — the activated ✎ coin (the FATTO grammar)", () => {
  it("toggles edit mode: uncolored 'Edit' at rest → lit 'Done editing' pressed, same box", () => {
    loadSheet();
    render(<BinderFob />);
    const coin = screen.getByRole("button", { name: /^edit$/i });
    expect(coin).toHaveAttribute("aria-pressed", "false");
    expect(coin).not.toHaveAttribute("data-editing");

    fireEvent.click(coin);
    expect(useUIStore.getState().sheetMode).toBe("edit");
    // The SAME control is the exit: lit (data-editing), pressed, and its
    // accessible name — the tooltip mirror — is the explicit "Done editing".
    const lit = screen.getByRole("button", { name: /^done editing$/i });
    expect(lit).toBe(coin);
    expect(lit).toHaveAttribute("aria-pressed", "true");
    expect(lit).toHaveAttribute("data-editing");

    fireEvent.click(lit);
    expect(useUIStore.getState().sheetMode).toBe("play");
    expect(screen.getByRole("button", { name: /^edit$/i })).not.toHaveAttribute(
      "data-editing"
    );
  });

  it("names the toggle in IT — 'Modifica' at rest, 'Fine modifica' lit", async () => {
    await act(async () => {
      await i18n.changeLanguage("it");
    });
    loadSheet();
    render(<BinderFob />);
    const coin = screen.getByRole("button", { name: /^modifica$/i });
    fireEvent.click(coin);
    expect(screen.getByRole("button", { name: /^fine modifica$/i })).toBe(coin);
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  it("names the concrete undo act in IT — 'Annulla: {action}'", async () => {
    await act(async () => {
      await i18n.changeLanguage("it");
    });
    loadSheet();
    registerUndoable({ message: "Attack" }, () => makeResource().spend(1), {
      turnScoped: false,
    });
    render(<BinderFob />);
    expect(screen.getByRole("button", { name: /^Annulla: /i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ripeti" })).toBeDisabled();
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });
});
