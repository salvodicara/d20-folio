/**
 * MobileSignet — "The Signet": the mobile management home (owner-ratified
 * 2026-07-11). One struck-metal coin fixed above the bottom nav that blooms a
 * chain (⟲ ⟳ · ⋯ · ✎ Edit) on tap; the lit amber ✎ one-tap exit while editing.
 *
 * These pins cover the de-duplication ruling ("the edit icon is repeated
 * twice"): the IDLE coin bears the TOOLS glyph (never a pencil), the pencil lives
 * ONLY in the bloomed chain, and while EDITING the coin itself IS the sole
 * pencil — never a second one, even with the chain bloomed. jsdom matchMedia
 * reports no match, so `useBinderFobHome` is false and the Signet (the mobile
 * home) renders. Firebase is stubbed so the unit stays CI-pure.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import i18n from "@/i18n";

vi.mock("@/lib/firebase", () => ({ db: {} }));

import { MobileSignet } from "@/features/character/MobileSignet";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore, registerUndoable } from "@/stores/undoStore";
import { MOCK_CHARACTER } from "@/lib/mock";

function load(): void {
  useCharacterStore.setState({
    character: structuredClone(MOCK_CHARACTER),
    loading: false,
    error: null,
    readonly: false,
  });
}

/** Count of a lucide glyph anywhere in the document (svg carries `lucide-<name>`). */
const glyphCount = (name: string): number =>
  document.querySelectorAll(`svg.lucide-${name}`).length;

beforeEach(() => {
  useUIStore.setState({ sheetMode: "play" });
  useUndoStore.setState({ characterId: null, past: [], future: [] });
  useCharacterStore.setState({
    character: null,
    loading: false,
    error: null,
    readonly: false,
  });
});

afterEach(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
});

describe("MobileSignet — the de-duplicated mobile home", () => {
  it("IDLE: the coin bears the TOOLS glyph (never a pencil), aria 'Sheet tools', no bloomed chain", () => {
    load();
    render(<MobileSignet />);
    const coin = screen.getByRole("button", { name: /^sheet tools$/i });
    expect(coin).toHaveAttribute("aria-pressed", "false");
    expect(coin).toHaveAttribute("aria-expanded", "false");
    // The tools glyph, not the pencil — nothing reads as "edit" at rest.
    expect(coin.querySelector("svg.lucide-wrench")).not.toBeNull();
    expect(glyphCount("square-pen")).toBe(0);
    // No chain until asked.
    expect(document.querySelector(".signet-chain")).toBeNull();
  });

  it("BLOOM anatomy: a tap blooms the chain — ⋯ + ✎ Edit (and ⟲ ⟳ with history)", () => {
    load();
    // Seed history so the ⟲ ⟳ pair mounts too.
    registerUndoable({ message: "Cast Cure Wounds" }, () => () => {}, {
      turnScoped: false,
    });
    render(<MobileSignet />);
    fireEvent.click(screen.getByRole("button", { name: /^sheet tools$/i }));

    const chain = document.querySelector(".signet-chain");
    expect(chain).not.toBeNull();
    const inChain = within(chain as HTMLElement);
    // The ONE pencil is the chain's Edit coin.
    expect(inChain.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    expect((chain as HTMLElement).querySelectorAll("svg.lucide-square-pen")).toHaveLength(
      1
    );
    // ⋯ extras + the ⟲ ⟳ session pair (history present): the ⟲ coin names the
    // concrete act; the ⟳ coin mounts disabled (nothing to redo yet).
    expect(inChain.getByRole("button", { name: /more actions/i })).toBeInTheDocument();
    expect(inChain.getByRole("button", { name: /^Undo: /i })).toBeInTheDocument();
    expect(inChain.getByRole("button", { name: /^redo$/i })).toBeDisabled();
  });

  it("EDITING swap: the coin becomes the lit amber ✎ — pressed, aria 'Done editing', pencil glyph", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    render(<MobileSignet />);
    const coin = screen.getByRole("button", { name: /^done editing$/i });
    expect(coin).toHaveAttribute("data-editing", "");
    expect(coin).toHaveAttribute("aria-pressed", "true");
    // Now the coin wears the pencil (the sole one); no tools glyph while editing.
    expect(coin.querySelector("svg.lucide-square-pen")).not.toBeNull();
    expect(glyphCount("wrench")).toBe(0);
  });

  it("ONE-TAP EXIT: tapping the lit coin while editing returns to play mode", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    render(<MobileSignet />);
    fireEvent.click(screen.getByRole("button", { name: /^done editing$/i }));
    expect(useUIStore.getState().sheetMode).toBe("play");
  });

  it("NO DOUBLE PENCIL while editing-bloomed: the chain shows ⋯ (and ⟲ ⟳) but NEVER a second pencil", () => {
    load();
    registerUndoable({ message: "Cast Cure Wounds" }, () => () => {}, {
      turnScoped: false,
    });
    render(<MobileSignet />);
    // Bloom the chain in play mode…
    fireEvent.click(screen.getByRole("button", { name: /^sheet tools$/i }));
    expect(document.querySelector(".signet-chain")).not.toBeNull();
    // …then enter edit while the chain stays bloomed (the coin is now the ✎).
    act(() => {
      useUIStore.setState({ sheetMode: "edit" });
    });

    const chain = document.querySelector(".signet-chain") as HTMLElement;
    expect(chain).not.toBeNull();
    // The chain keeps ⋯ + the ⟲ ⟳ pair but drops the Edit coin — no pencil in it.
    expect(chain.querySelectorAll("svg.lucide-square-pen")).toHaveLength(0);
    expect(
      within(chain).queryByRole("button", { name: /^edit$/i })
    ).not.toBeInTheDocument();
    expect(
      within(chain).getByRole("button", { name: /more actions/i })
    ).toBeInTheDocument();
    // Exactly ONE pencil in the whole component — the lit coin itself.
    expect(glyphCount("square-pen")).toBe(1);
    const coin = screen.getByRole("button", { name: /^done editing$/i });
    expect(coin.querySelector("svg.lucide-square-pen")).not.toBeNull();
  });

  it("EN/IT aria: the seal + exit carry the words (coarse pointer = no tooltips)", async () => {
    load();
    // EN idle + editing.
    const { unmount } = render(<MobileSignet />);
    expect(screen.getByRole("button", { name: /^sheet tools$/i })).toBeInTheDocument();
    unmount();

    await act(async () => {
      await i18n.changeLanguage("it");
    });
    const { rerender } = render(<MobileSignet />);
    expect(
      screen.getByRole("button", { name: /^strumenti della scheda$/i })
    ).toBeInTheDocument();
    // IT editing → "Fine modifica".
    act(() => {
      useUIStore.setState({ sheetMode: "edit" });
    });
    rerender(<MobileSignet />);
    expect(screen.getByRole("button", { name: /^fine modifica$/i })).toBeInTheDocument();
  });

  it("GLASS CASE: a read-only sheet renders NOTHING (owner-only management chrome)", () => {
    load();
    useCharacterStore.setState({ readonly: true });
    const { container } = render(<MobileSignet />);
    expect(container.querySelector(".signet")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /sheet tools/i })
    ).not.toBeInTheDocument();
  });
});
