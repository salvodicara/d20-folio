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
import { useAuthStore } from "@/stores/authStore";

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
    getFullCharacterMock.mockResolvedValue(doc(false));
    renderAt("owner-1", "char-1");
    expect(
      await screen.findByText("Questo personaggio non è più condiviso")
    ).toBeInTheDocument();
    // MUTATION PROOF — the EN string is ABSENT, so it is the viewer locale (not a
    // hardcoded English fallback) that drives the chrome.
    expect(screen.queryByText("This character is no longer shared")).toBeNull();
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

/**
 * The post-view conversion CTA (this ships the "post-view signup CTA" candidate) —
 * the ONE benefit-line moment allowed on a share surface, and only for an ANONYMOUS
 * viewer. Gated on the same `!user` fact as the topbar's anon chrome; a signed-in
 * viewer (owner previewing, DM) already has an account and sees just the sheet.
 */
describe("SharedCharacterView — the post-view conversion CTA", () => {
  beforeEach(() => useAuthStore.setState({ user: null }));
  afterEach(async () => {
    useAuthStore.setState({ user: null });
    if (i18n.language !== "en") await i18n.changeLanguage("en");
  });

  it("an anonymous viewer gets the CTA after the sheet, routing to the auth entry", async () => {
    getFullCharacterMock.mockResolvedValue(doc(true));
    renderAt("owner-1", "char-1");
    await screen.findByTestId("cockpit");
    expect(
      screen.getByText("Like this hero? Create your own on d20 Folio.")
    ).toBeInTheDocument();
    // A real link to the existing Google sign-in route (never an invented auth flow).
    expect(screen.getByRole("link", { name: "Create your character" })).toHaveAttribute(
      "href",
      "/login"
    );
    // The quiet passive brand loop.
    expect(screen.getByText("Built with d20 Folio")).toBeInTheDocument();
  });

  it("MUTATION PROOF — a SIGNED-IN viewer gets just the sheet, no CTA", async () => {
    useAuthStore.setState({ user: { uid: "someone" } as never });
    getFullCharacterMock.mockResolvedValue(doc(true));
    renderAt("owner-1", "char-1");
    await screen.findByTestId("cockpit");
    expect(
      screen.queryByText("Like this hero? Create your own on d20 Folio.")
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Create your character" })).toBeNull();
  });

  it("never shows the CTA on a dead link — there is no sheet to convert on", async () => {
    getFullCharacterMock.mockResolvedValue(doc(false));
    renderAt("owner-1", "char-1");
    await screen.findByText("This character is no longer shared");
    expect(screen.queryByRole("link", { name: "Create your character" })).toBeNull();
  });

  it("follows the VIEWER's active locale (IT) — the invitation is bilingual", async () => {
    await act(async () => {
      await i18n.changeLanguage("it");
    });
    getFullCharacterMock.mockResolvedValue(doc(true));
    renderAt("owner-1", "char-1");
    await screen.findByTestId("cockpit");
    expect(
      screen.getByText("Ti piace questo eroe? Crea il tuo su d20 Folio.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Crea il tuo personaggio" })
    ).toBeInTheDocument();
    expect(screen.getByText("Creato con d20 Folio")).toBeInTheDocument();
  });
});
