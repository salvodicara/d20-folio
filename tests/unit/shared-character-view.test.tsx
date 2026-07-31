/**
 * SharedCharacterView — the PUBLIC read-only sheet behind a character share link.
 *
 * Pins the three things the route itself owns (the sheet body is the already-covered
 * `CockpitView`, stubbed here): which documents it agrees to render, what a dead link
 * shows, and the noindex tag. The rules-level half of the feature — that an anonymous
 * client is ALLOWED to read the document at all — is pinned in the emulator suite
 * (`tests/rules/firestore-rules.test.ts` → "public share links"); this file cannot see
 * it, because the fetch is mocked here by construction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import type { CharacterDoc } from "@/types/character";

const { getFullCharacterMock, navigateMock, loadReadonlyMock } = vi.hoisted(() => ({
  getFullCharacterMock: vi.fn<(uid: string, charId: string) => Promise<unknown>>(),
  navigateMock: vi.fn(),
  loadReadonlyMock: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firestore", () => ({ getFullCharacter: getFullCharacterMock }));
// Exercise the PRODUCTION path: the dev-bypass branch is a preview seam, not the
// behaviour that ships.
vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/features/campaigns/useMemberCharacterDocs", () => ({
  resolveDevDoc: vi.fn(),
}));
vi.mock("@/features/character/CharacterCockpit", () => ({
  CockpitView: () => <div data-testid="cockpit">sheet body</div>,
}));
vi.mock("@/stores/characterStore", () => ({
  useCharacterStore: { getState: () => ({ loadReadonly: loadReadonlyMock }) },
}));
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

import { SharedCharacterView } from "@/features/character/SharedCharacterView";

/** The only fields this route reads off the doc; the body is stubbed. */
function doc(shared: boolean): CharacterDoc {
  return { id: "c1", shared } as CharacterDoc;
}

function renderAt(uid: string, charId: string) {
  return render(
    <MemoryRouter initialEntries={[`/view/${uid}/${charId}`]}>
      <Routes>
        <Route path="/view/:uid/:charId" element={<SharedCharacterView />} />
      </Routes>
    </MemoryRouter>
  );
}

const robotsTag = () => document.head.querySelector('meta[name="robots"]');

describe("SharedCharacterView", () => {
  beforeEach(() => {
    getFullCharacterMock.mockReset();
    navigateMock.mockReset();
    loadReadonlyMock.mockReset();
  });

  it("renders the read-only sheet for a shared character", async () => {
    getFullCharacterMock.mockResolvedValue(doc(true));
    renderAt("owner-1", "char-1");
    expect(await screen.findByTestId("cockpit")).toBeInTheDocument();
    // Loaded READ-ONLY — the flag every mutating affordance self-gates on.
    expect(loadReadonlyMock).toHaveBeenCalledWith(doc(true));
    expect(getFullCharacterMock).toHaveBeenCalledWith("owner-1", "char-1");
  });

  it("shows the quiet dead-link page when the character is not shared", async () => {
    // The OWNER's own read arm still returns the document, so the client re-check is
    // what makes an owner opening their revoked link see what a stranger sees.
    getFullCharacterMock.mockResolvedValue(doc(false));
    renderAt("owner-1", "char-1");
    expect(
      await screen.findByText("This character is no longer shared")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("cockpit")).not.toBeInTheDocument();
    expect(loadReadonlyMock).not.toHaveBeenCalledWith(doc(false));
  });

  it("shows the same page for a deleted character and for a DENIED read", async () => {
    getFullCharacterMock.mockResolvedValue(null);
    renderAt("owner-1", "gone");
    expect(
      await screen.findByText("This character is no longer shared")
    ).toBeInTheDocument();

    // A revoked link REJECTS with a permission error — the expected outcome for a
    // dead link, never an unhandled crash or a stuck spinner.
    getFullCharacterMock.mockRejectedValue(new Error("permission-denied"));
    renderAt("owner-1", "revoked");
    await waitFor(() => {
      expect(screen.getAllByText("This character is no longer shared")).toHaveLength(2);
    });
  });

  it("holds a loading state until the fetch settles (never a flash of dead-link)", () => {
    getFullCharacterMock.mockReturnValue(new Promise(() => {}));
    renderAt("owner-1", "char-1");
    expect(screen.queryByText("This character is no longer shared")).toBeNull();
    expect(screen.queryByTestId("cockpit")).toBeNull();
  });

  it("marks the page noindex while mounted and removes the tag on unmount", async () => {
    expect(robotsTag()).toBeNull();
    getFullCharacterMock.mockResolvedValue(doc(true));
    const { unmount } = renderAt("owner-1", "char-1");
    await screen.findByTestId("cockpit");
    expect(robotsTag()?.getAttribute("content")).toBe("noindex, nofollow");
    unmount();
    expect(robotsTag()).toBeNull();
  });

  it("clears the stranger's character out of the store on unmount", async () => {
    getFullCharacterMock.mockResolvedValue(doc(true));
    const { unmount } = renderAt("owner-1", "char-1");
    await screen.findByTestId("cockpit");
    unmount();
    expect(loadReadonlyMock).toHaveBeenLastCalledWith(null);
  });
});
