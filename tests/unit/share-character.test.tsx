/**
 * The owner side of a public character share link — the ⋯ menu's ONE "Share" entry,
 * the popover behind it, and the single write path underneath (`useShareCharacter`).
 *
 * Pins the Docs/Notion shape the owner ratified: the popover's visibility SWITCH is
 * share-and-revoke (instant, no confirm, no second menu item), the link and its
 * actions exist only while the switch is on, Copy puts the link on the clipboard with
 * a quiet toast, the native-share button appears only where the platform has a share
 * sheet, and a failed write never leaves the sheet claiming a link that works.
 *
 * `copyWithToast` / `shareOrCopy` are stubbed to their calls: the clipboard and the
 * native-sheet-vs-clipboard branch inside them are pinned by `share-or-copy.test.ts`,
 * so re-driving them here would test the same fact twice. BLIND SPOT: jsdom cannot
 * open a real Web Share sheet, so "the native sheet actually appears on a phone" is
 * not covered anywhere in the unit suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const { updateCharacterMock, shareOrCopyMock, copyWithToastMock } = vi.hoisted(() => ({
  updateCharacterMock: vi.fn<() => Promise<void>>(),
  shareOrCopyMock: vi.fn<() => Promise<void>>(),
  copyWithToastMock: vi.fn<() => void>(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firestore", () => ({
  updateCharacter: updateCharacterMock,
  // SnapshotsHistory (hosted by the same coin) pulls these; the dialog stays shut.
  listCharacterSnapshots: vi.fn(() => Promise.resolve([])),
  saveCharacterSnapshot: vi.fn(() => Promise.resolve("snap-1")),
  restoreCharacterSnapshot: vi.fn(),
  deleteCharacterSnapshot: vi.fn(),
}));
vi.mock("@/components/shared/copy-to-clipboard", () => ({
  shareOrCopy: shareOrCopyMock,
  copyWithToast: copyWithToastMock,
}));

import { SheetExtrasCoin } from "@/features/character/SheetExtrasCoin";
import { shareLinkFor } from "@/features/character/use-share-character";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useToastStore } from "@/stores/toastStore";
import { MOCK_CHARACTER } from "@/lib/mock";

const LINK = `${window.location.origin}/view/owner-1/char-1`;

function loadSheet(shared: boolean): void {
  useCharacterStore.setState({
    character: { ...structuredClone(MOCK_CHARACTER), id: "char-1", shared },
    loading: false,
    error: null,
    readonly: false,
  });
}

/** Open the ⋯ menu and pick "Share", which is what opens the popover. */
function openSharePopover(): void {
  fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
  fireEvent.click(screen.getByRole("menuitem", { name: /^share$/i }));
}

/** Flip the popover's visibility switch, letting the awaited write settle. */
async function flipVisibility(): Promise<void> {
  fireEvent.click(screen.getByRole("switch", { name: /anyone with the link can view/i }));
  // The write is persist-then-reflect, so let both microtask hops settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("character share link — the owner affordance", () => {
  beforeEach(() => {
    updateCharacterMock.mockReset().mockResolvedValue(undefined);
    shareOrCopyMock.mockReset().mockResolvedValue(undefined);
    copyWithToastMock.mockReset();
    useAuthStore.setState({ user: { uid: "owner-1" } as never });
    useToastStore.setState({ toasts: [] });
    loadSheet(false);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("builds the link from the document path — the unguessable id IS the secret", () => {
    expect(shareLinkFor("owner-1", "char-1")).toBe(LINK);
  });

  it("ONE menu entry opens the share popover — no second 'stop' item to find", () => {
    render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    expect(screen.getByRole("menuitem", { name: /^share$/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /stop sharing/i })).toBeNull();
  });

  it("the switch OFF is the whole popover — no link to copy that nobody can open", () => {
    render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    openSharePopover();

    const toggle = screen.getByRole("switch", {
      name: /anyone with the link can view/i,
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText(LINK)).toBeNull();
    expect(screen.queryByRole("button", { name: /copy link/i })).toBeNull();
  });

  it("flipping it ON shares, and the link appears with its actions", async () => {
    render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    openSharePopover();
    await flipVisibility();

    expect(updateCharacterMock).toHaveBeenCalledWith("owner-1", "char-1", {
      shared: true,
    });
    expect(useCharacterStore.getState().character?.shared).toBe(true);
    expect(screen.getByText(LINK)).toBeInTheDocument();
    // No confirm anywhere: the switch IS the control and the popover IS the feedback.
    // (`queryByRole("dialog")` would match the popover itself — Radix gives its
    // content that role — so the house confirm store is what gets asserted.)
    expect(useConfirmStore.getState().open).toBe(false);
    expect(useConfirmStore.getState().options).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    expect(copyWithToastMock).toHaveBeenCalledWith(LINK, "Share link copied");
  });

  it("flipping it OFF revokes, and the link goes with it", async () => {
    loadSheet(true);
    render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    openSharePopover();
    expect(screen.getByText(LINK)).toBeInTheDocument();

    await flipVisibility();

    expect(updateCharacterMock).toHaveBeenCalledWith("owner-1", "char-1", {
      shared: false,
    });
    expect(useCharacterStore.getState().character?.shared).toBe(false);
    expect(screen.queryByText(LINK)).toBeNull();
    // Instantly, with nothing to dismiss and nothing to confirm.
    expect(useConfirmStore.getState().open).toBe(false);
    expect(useConfirmStore.getState().options).toBeNull();
  });

  it("the native-share button shows up ONLY where the platform has a share sheet", () => {
    // jsdom has no `navigator.share`, so Copy would otherwise be offered twice.
    loadSheet(true);
    const { unmount } = render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    openSharePopover();
    expect(screen.queryByRole("button", { name: /^share$/i })).toBeNull();
    unmount();

    // A real `Navigator` cannot be spread (it would lose its prototype), so hang the
    // one method jsdom lacks straight off the live object and take it back after.
    vi.stubGlobal("navigator", Object.create(navigator, { share: { value: vi.fn() } }));
    render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    openSharePopover();
    fireEvent.click(screen.getByRole("button", { name: /^share$/i }));
    expect(shareOrCopyMock).toHaveBeenCalledWith(
      LINK,
      expect.objectContaining({
        title: expect.stringContaining("Lyra Voss") as string,
      })
    );
  });

  it("a failed write never leaves the sheet claiming a link that works", async () => {
    updateCharacterMock.mockRejectedValue(new Error("offline"));
    render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    openSharePopover();
    await flipVisibility();

    expect(useCharacterStore.getState().character?.shared).toBe(false);
    expect(screen.queryByText(LINK)).toBeNull();
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(
      /couldn't change sharing/i
    );
  });
});
