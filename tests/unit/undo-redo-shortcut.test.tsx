/**
 * useUndoRedoShortcut — ⌘Z / ⌘⇧Z keyboard guards (UNDO_SPEC §5.4 case 10) + the
 * registry/label wiring. Driven through a tiny harness that mounts the hook.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useUndoRedoShortcut } from "@/hooks/useUndoRedoShortcut";
import { useUndoStore, registerUndoable } from "@/stores/undoStore";
import { useToastStore } from "@/stores/toastStore";
import { shortcutLabel } from "@/lib/platform";
import { SHORTCUTS } from "@/lib/shortcuts-registry";

const u = () => useUndoStore.getState();

function Harness({ readonly = false }: { readonly?: boolean }) {
  useUndoRedoShortcut(readonly);
  return (
    <div>
      <input data-testid="field" />
      <div role="dialog" data-testid="dialog">
        <button data-testid="in-dialog">x</button>
      </div>
      <button data-testid="plain">y</button>
    </div>
  );
}

/** A mock resource whose spend returns its inverse (the real execute shape). */
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

beforeEach(() => {
  useUndoStore.setState({ characterId: null, past: [], future: [] });
  useToastStore.getState().clearAll();
});
afterEach(() => vi.restoreAllMocks());

describe("useUndoRedoShortcut — guards + actions", () => {
  it("⌘Z on a plain target undoes the top and shows the Undone beat", () => {
    const r = makeResource();
    registerUndoable({ message: "Attack" }, () => r.spend(1), { turnScoped: true });
    const { getByTestId } = render(<Harness />);
    fireEvent.keyDown(getByTestId("plain"), { key: "z", metaKey: true });
    expect(r.state.value).toBe(3); // undone
    expect(u().past).toHaveLength(0);
    expect(u().future).toHaveLength(1);
    const live = useToastStore.getState().toasts;
    expect(live.some((t) => /Undone/.test(t.message ?? ""))).toBe(true);
  });

  it("⌘⇧Z redoes and shows the Redone beat", () => {
    const r = makeResource();
    registerUndoable({ message: "Attack" }, () => r.spend(1), { turnScoped: true });
    u().undo();
    const { getByTestId } = render(<Harness />);
    fireEvent.keyDown(getByTestId("plain"), { key: "z", metaKey: true, shiftKey: true });
    expect(r.state.value).toBe(2); // redone
    expect(u().past).toHaveLength(1);
    expect(
      useToastStore.getState().toasts.some((t) => /Redone/.test(t.message ?? ""))
    ).toBe(true);
  });

  it("does NOT undo while typing in an input (native text-undo wins)", () => {
    const r = makeResource();
    registerUndoable({ message: "Attack" }, () => r.spend(1), { turnScoped: true });
    const { getByTestId } = render(<Harness />);
    fireEvent.keyDown(getByTestId("field"), { key: "z", metaKey: true });
    expect(r.state.value).toBe(2); // untouched
    expect(u().past).toHaveLength(1);
  });

  it("does NOT undo when the target is inside an open dialog", () => {
    const r = makeResource();
    registerUndoable({ message: "Attack" }, () => r.spend(1), { turnScoped: true });
    const { getByTestId } = render(<Harness />);
    fireEvent.keyDown(getByTestId("in-dialog"), { key: "z", metaKey: true });
    expect(r.state.value).toBe(2);
    expect(u().past).toHaveLength(1);
  });

  it("is inert on a read-only sheet", () => {
    const r = makeResource();
    registerUndoable({ message: "Attack" }, () => r.spend(1), { turnScoped: true });
    const { getByTestId } = render(<Harness readonly />);
    fireEvent.keyDown(getByTestId("plain"), { key: "z", metaKey: true });
    expect(r.state.value).toBe(2);
    expect(u().past).toHaveLength(1);
  });

  it("does NOT preventDefault on an empty stack (never swallows the key)", () => {
    const { getByTestId } = render(<Harness />);
    const handled = fireEvent.keyDown(getByTestId("plain"), { key: "z", metaKey: true });
    // fireEvent returns false when preventDefault was called; true otherwise.
    expect(handled).toBe(true);
  });

  it("shows the can't-redo notice when the redo legally bails", () => {
    const r = makeResource(1);
    const execute = () => (r.state.value <= 0 ? null : r.spend(1));
    registerUndoable({ message: "Spend" }, execute, { turnScoped: true });
    u().undo();
    r.state.value = 0; // exhaust by hand so redo bails
    const { getByTestId } = render(<Harness />);
    fireEvent.keyDown(getByTestId("plain"), { key: "z", metaKey: true, shiftKey: true });
    expect(
      useToastStore.getState().toasts.some((t) => /Can't redo/.test(t.message ?? ""))
    ).toBe(true);
  });
});

describe("registry + label wiring", () => {
  it("the sheet group carries undo + redo rows", () => {
    const sheet = SHORTCUTS.find((s) => s.group === "sheet");
    const ids = sheet?.rows.map((r) => r.id) ?? [];
    expect(ids).toContain("undo");
    expect(ids).toContain("redo");
    const redo = sheet?.rows.find((r) => r.id === "redo");
    expect(redo?.keys).toMatchObject({ kind: "combo", mod: true, shift: true, key: "Z" });
  });

  it("shortcutLabel renders the Shift-augmented chord", () => {
    // Platform-independent: exactly one of the two forms.
    expect(["⌘⇧Z", "Ctrl Shift Z"]).toContain(shortcutLabel("Z", true));
    expect(["⌘Z", "Ctrl Z"]).toContain(shortcutLabel("Z"));
  });
});
