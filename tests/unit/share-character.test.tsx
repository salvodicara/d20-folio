/**
 * The owner side of a public character share link — the ⋯ menu affordance and the
 * one write path behind it (`useShareCharacter`).
 *
 * Pins: the link IS the document path; "Share link" turns sharing on and hands the
 * link to the platform in ONE tap; "Stop sharing" exists ONLY while the link is live
 * (its presence is the state signal) and revokes on that one tap, with NO confirm —
 * the register keeps those for destructive acts, and this one re-shares to the SAME
 * link; a failed write never leaves the sheet claiming a link that works.
 *
 * `shareOrCopy` is stubbed to its call: the native-sheet-vs-clipboard branch inside
 * it is pinned by `share-or-copy.test.ts`, so re-driving it here would test the same
 * fact twice. BLIND SPOT: jsdom cannot open a real Web Share sheet, so "the native
 * sheet actually appears on a phone" is not covered anywhere in the unit suite.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const { updateCharacterMock, shareOrCopyMock } = vi.hoisted(() => ({
  updateCharacterMock: vi.fn<() => Promise<void>>(),
  shareOrCopyMock: vi.fn<() => Promise<void>>(),
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
  copyWithToast: vi.fn(),
}));

import { SheetExtrasCoin } from "@/features/character/SheetExtrasCoin";
import { shareLinkFor } from "@/features/character/use-share-character";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useToastStore } from "@/stores/toastStore";
import { MOCK_CHARACTER } from "@/lib/mock";

function loadSheet(shared: boolean): void {
  useCharacterStore.setState({
    character: { ...structuredClone(MOCK_CHARACTER), id: "char-1", shared },
    loading: false,
    error: null,
    readonly: false,
  });
}

/** Open the ⋯ menu and click one of its items by accessible name, letting the
 *  action's awaited write settle before the assertions run. */
async function pickMenuItem(name: RegExp): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
  fireEvent.click(screen.getByRole("menuitem", { name }));
  await act(() => Promise.resolve());
}

describe("character share link — the owner affordance", () => {
  beforeEach(() => {
    updateCharacterMock.mockReset().mockResolvedValue(undefined);
    shareOrCopyMock.mockReset().mockResolvedValue(undefined);
    useAuthStore.setState({ user: { uid: "owner-1" } as never });
    useToastStore.setState({ toasts: [] });
    loadSheet(false);
  });

  it("builds the link from the document path — the unguessable id IS the secret", () => {
    expect(shareLinkFor("owner-1", "char-1")).toBe(
      `${window.location.origin}/view/owner-1/char-1`
    );
  });

  it("one tap turns sharing on AND hands the link to the platform", async () => {
    render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    await pickMenuItem(/share link/i);

    expect(updateCharacterMock).toHaveBeenCalledWith("owner-1", "char-1", {
      shared: true,
    });
    expect(useCharacterStore.getState().character?.shared).toBe(true);
    expect(shareOrCopyMock).toHaveBeenCalledWith(
      `${window.location.origin}/view/owner-1/char-1`,
      expect.objectContaining({
        title: expect.stringContaining("Lyra Voss") as string,
        // The first share is the moment the owner learns what sharing MEANS.
        copiedToast: expect.stringContaining("Anyone with it can now view") as string,
      })
    );
  });

  it("sharing an ALREADY-shared character re-offers the link without re-writing", async () => {
    loadSheet(true);
    render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    await pickMenuItem(/share link/i);

    expect(updateCharacterMock).not.toHaveBeenCalled();
    expect(shareOrCopyMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ copiedToast: "Share link copied" })
    );
  });

  it("'Stop sharing' is present ONLY while the link is live", () => {
    const { unmount } = render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    expect(screen.queryByRole("menuitem", { name: /stop sharing/i })).toBeNull();
    unmount();

    loadSheet(true);
    render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    expect(screen.getByRole("menuitem", { name: /stop sharing/i })).toBeInTheDocument();
  });

  it("revoking is ONE quiet tap — no dialog, flag off, one toast", async () => {
    loadSheet(true);
    render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    await pickMenuItem(/stop sharing/i);

    // Nothing to dismiss: no house confirm was ever opened, and no dialog is on
    // screen. Sharing again puts the same link back, so asking would be ceremony.
    expect(useConfirmStore.getState().options).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The flip happened on the tap itself.
    expect(updateCharacterMock).toHaveBeenCalledWith("owner-1", "char-1", {
      shared: false,
    });
    expect(useCharacterStore.getState().character?.shared).toBe(false);
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/no longer shared/i);
  });

  it("a failed revoke keeps the link live and says so", async () => {
    loadSheet(true);
    updateCharacterMock.mockRejectedValue(new Error("offline"));
    render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    await pickMenuItem(/stop sharing/i);

    expect(useCharacterStore.getState().character?.shared).toBe(true);
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(
      /couldn't change sharing/i
    );
  });

  it("a failed write never leaves the sheet claiming a link that works", async () => {
    updateCharacterMock.mockRejectedValue(new Error("offline"));
    render(<SheetExtrasCoin triggerClassName="fob-coin" />);
    await pickMenuItem(/share link/i);

    expect(useCharacterStore.getState().character?.shared).toBe(false);
    // No link is offered for a state that was never persisted.
    expect(shareOrCopyMock).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(
      /couldn't change sharing/i
    );
  });
});
