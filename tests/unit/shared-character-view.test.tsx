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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import i18n from "@/i18n";
import type { CharacterDoc } from "@/types/character";

const { getPublicCharacterMock, navigateMock, loadReadonlyMock } = vi.hoisted(() => ({
  getPublicCharacterMock: vi.fn<(uid: string, charId: string) => Promise<unknown>>(),
  navigateMock: vi.fn(),
  loadReadonlyMock: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firestore", () => ({
  getPublicCharacter: getPublicCharacterMock,
}));
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

/** The projection parser guarantees a shared read-only document. */
function doc(): CharacterDoc {
  return { id: "c1", shared: true } as CharacterDoc;
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
    getPublicCharacterMock.mockReset();
    navigateMock.mockReset();
    loadReadonlyMock.mockReset();
  });

  afterEach(async () => {
    // Some tests switch the UI locale; restore EN so the rest stay deterministic.
    if (i18n.language !== "en") await i18n.changeLanguage("en");
  });

  // The public view is client-rendered in the VIEWER's browser, so — unlike the OG
  // card, which keys off the OWNER's locale — it follows the VIEWER's active locale
  // (the app's existing navigator/localStorage i18n bootstrap). Proven by flipping the
  // active locale and asserting the dead-link chrome renders in it.
  it("renders the dead-link page in the VIEWER's active locale (IT)", async () => {
    await act(async () => {
      await i18n.changeLanguage("it");
    });
    getPublicCharacterMock.mockResolvedValue(null);
    renderAt("owner-1", "char-1");
    expect(
      await screen.findByText("Questo personaggio non è più condiviso")
    ).toBeInTheDocument();
    // MUTATION PROOF — the EN string is ABSENT, so it is the viewer locale (not a
    // hardcoded English fallback) that drives the chrome.
    expect(screen.queryByText("This character is no longer shared")).toBeNull();
  });

  it("renders the read-only sheet for a shared character", async () => {
    getPublicCharacterMock.mockResolvedValue(doc());
    renderAt("owner-1", "char-1");
    expect(await screen.findByTestId("cockpit")).toBeInTheDocument();
    // Loaded READ-ONLY — the flag every mutating affordance self-gates on.
    expect(loadReadonlyMock).toHaveBeenCalledWith(doc());
    expect(getPublicCharacterMock).toHaveBeenCalledWith("owner-1", "char-1");
  });

  it("shows the quiet dead-link page after the projection is revoked", async () => {
    getPublicCharacterMock.mockResolvedValue(null);
    renderAt("owner-1", "char-1");
    expect(
      await screen.findByText("This character is no longer shared")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("cockpit")).not.toBeInTheDocument();
    expect(loadReadonlyMock).not.toHaveBeenCalled();
  });

  it("shows the same page for a deleted character and for a DENIED read", async () => {
    getPublicCharacterMock.mockResolvedValue(null);
    renderAt("owner-1", "gone");
    expect(
      await screen.findByText("This character is no longer shared")
    ).toBeInTheDocument();

    // A revoked link REJECTS with a permission error — the expected outcome for a
    // dead link, never an unhandled crash or a stuck spinner.
    getPublicCharacterMock.mockRejectedValue(new Error("permission-denied"));
    renderAt("owner-1", "revoked");
    await waitFor(() => {
      expect(screen.getAllByText("This character is no longer shared")).toHaveLength(2);
    });
  });

  it("holds a loading state until the fetch settles (never a flash of dead-link)", () => {
    getPublicCharacterMock.mockReturnValue(new Promise(() => {}));
    renderAt("owner-1", "char-1");
    expect(screen.queryByText("This character is no longer shared")).toBeNull();
    expect(screen.queryByTestId("cockpit")).toBeNull();
  });

  it("marks the page noindex while mounted and removes the tag on unmount", async () => {
    expect(robotsTag()).toBeNull();
    getPublicCharacterMock.mockResolvedValue(doc());
    const { unmount } = renderAt("owner-1", "char-1");
    await screen.findByTestId("cockpit");
    expect(robotsTag()?.getAttribute("content")).toBe("noindex, nofollow");
    unmount();
    expect(robotsTag()).toBeNull();
  });

  it("clears the stranger's character out of the store on unmount", async () => {
    getPublicCharacterMock.mockResolvedValue(doc());
    const { unmount } = renderAt("owner-1", "char-1");
    await screen.findByTestId("cockpit");
    unmount();
    expect(loadReadonlyMock).toHaveBeenLastCalledWith(null);
  });
});
