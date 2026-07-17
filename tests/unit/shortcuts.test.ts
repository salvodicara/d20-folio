/**
 * shortcuts (§3.1) — the pure registry helpers. Pins the `g`-sequence stepper
 * (arm, fire, timeout, disarm-on-unmatched, re-arm) and the two DOM guards
 * (`isTypingTarget`, `inDialog`) that gate every global key.
 */
import { describe, it, expect } from "vitest";
import {
  GO_SEQUENCES,
  IDLE_SEQ,
  SEQ_WINDOW_MS,
  inDialog,
  isTypingTarget,
  nextSeqState,
} from "@/lib/shortcuts";
import { SHORTCUTS } from "@/lib/shortcuts-registry";

describe("nextSeqState — the g-prefix sequence stepper", () => {
  it("arms on `g` without firing", () => {
    const { state, fired } = nextSeqState(IDLE_SEQ, "g", 1000);
    expect(fired).toBeNull();
    expect(state).toEqual({ armed: true, armedAt: 1000 });
  });

  it("does nothing for a lone second key while idle", () => {
    const { state, fired } = nextSeqState(IDLE_SEQ, "2", 1000);
    expect(fired).toBeNull();
    expect(state).toEqual(IDLE_SEQ);
  });

  it("fires on a valid second key within the window", () => {
    const armed = nextSeqState(IDLE_SEQ, "g", 1000).state;
    const { state, fired } = nextSeqState(armed, "2", 1200);
    expect(fired).toBe("2");
    expect(state).toEqual(IDLE_SEQ);
  });

  it("resolves each realm digit + the frozen letter mnemonics", () => {
    expect(GO_SEQUENCES["1"]).toBe("/characters");
    expect(GO_SEQUENCES["2"]).toBe("/campaigns");
    expect(GO_SEQUENCES["3"]).toBe("/compendium");
    expect(GO_SEQUENCES.s).toBe("/settings");
    expect(GO_SEQUENCES.a).toBe("/admin");
  });

  it("disarms (no fire) on an unmatched second key", () => {
    const armed = nextSeqState(IDLE_SEQ, "g", 1000).state;
    const { state, fired } = nextSeqState(armed, "x", 1100);
    expect(fired).toBeNull();
    expect(state).toEqual(IDLE_SEQ);
  });

  it("disarms on Escape", () => {
    const armed = nextSeqState(IDLE_SEQ, "g", 1000).state;
    const { state, fired } = nextSeqState(armed, "Escape", 1100);
    expect(fired).toBeNull();
    expect(state).toEqual(IDLE_SEQ);
  });

  it("expires after the 1500ms window — a late second key does not fire", () => {
    const armed = nextSeqState(IDLE_SEQ, "g", 1000).state;
    const { state, fired } = nextSeqState(armed, "2", 1000 + SEQ_WINDOW_MS + 1);
    expect(fired).toBeNull();
    expect(state).toEqual(IDLE_SEQ);
  });

  it("re-arms on a repeated `g` rather than disarming", () => {
    const armed = nextSeqState(IDLE_SEQ, "g", 1000).state;
    const { state, fired } = nextSeqState(armed, "g", 1400);
    expect(fired).toBeNull();
    expect(state).toEqual({ armed: true, armedAt: 1400 });
  });
});

describe("isTypingTarget", () => {
  it("is true for input / textarea / select / contenteditable", () => {
    for (const tag of ["input", "textarea", "select"]) {
      expect(isTypingTarget(document.createElement(tag))).toBe(true);
    }
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isTypingTarget(editable)).toBe(true);
  });

  it("is false for a plain element and a null target", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("inDialog", () => {
  it("is true only inside an open dialog", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inner = document.createElement("button");
    dialog.appendChild(inner);
    expect(inDialog(inner)).toBe(true);
    expect(inDialog(document.createElement("button"))).toBe(false);
    expect(inDialog(null)).toBe(false);
  });
});

describe("SHORTCUTS registry", () => {
  it("carries the five groups the sheet renders", () => {
    expect(SHORTCUTS.map((s) => s.group)).toEqual([
      "global",
      "sheet",
      "encounter",
      "palette",
      "compendium",
    ]);
  });

  it("carries the command palette as ONE row with the `/` alias, not a separate search row", () => {
    const global = SHORTCUTS.find((s) => s.group === "global");
    // No standalone `search` row — the `/` binding is an alias on the palette row.
    expect(global?.rows.find((r) => r.id === "search")).toBeUndefined();
    const palette = global?.rows.find((r) => r.id === "palette");
    expect(palette?.keys).toEqual({ kind: "combo", mod: true, key: "K" });
    expect(palette?.altKeys).toEqual({ kind: "key", key: "/" });
  });

  it("marks the Admin sequence admin-only", () => {
    const global = SHORTCUTS.find((s) => s.group === "global");
    const admin = global?.rows.find((r) => r.id === "go-admin");
    expect(admin?.adminOnly).toBe(true);
    // No other global row is admin-gated.
    expect(global?.rows.filter((r) => r.adminOnly)).toHaveLength(1);
  });
});
