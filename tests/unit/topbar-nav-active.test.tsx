/**
 * Topbar nav active-state (#17) — with the roster canonical at `/characters`
 * (not `/`), the "Characters" hub link can realm-match cleanly. These pin that
 * "Characters" highlights across the whole /characters realm (the roster, the
 * cockpit at /characters/:id) and NOT on a sibling realm like /campaigns.
 *
 * The active class is the deep-gold `text-accent-text` (from `hubLinkClass`); the
 * resting class is the quiet `text-text-secondary`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Topbar } from "@/app/shell/Topbar";
import { useAuthStore } from "@/stores/authStore";

// Topbar pulls SettingsDropdown (only rendered when signed in) which reaches
// firebase transitively; stub it so the bare nav renders in isolation.
vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, storage: {} }));
// The hub tabs + palette are now the SIGNED-IN navigator, so these tests sign a user
// in; stub the signed-in-only chrome (account cluster, sync pip, combat pip) so the
// bar renders without its firebase/engine tails.
vi.mock("@/components/sheet/SettingsDropdown", () => ({
  SettingsDropdown: () => <div data-testid="acct" />,
}));
vi.mock("@/components/shared/SaveIndicator", () => ({ SaveIndicator: () => null }));
vi.mock("@/app/shell/CombatPip", () => ({ CombatPip: () => null }));

// Control the coarse-pointer media query so the ⌘K chip gating is testable.
const coarseState = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => coarseState.value,
}));

// A signed-in user is the default for the hub-nav tests below (the hub tabs + palette
// only render for a signed-in viewer now); the anon-chrome block sets it back to null.
beforeEach(() => {
  coarseState.value = false;
  useAuthStore.setState({ user: { uid: "u1" } as never });
});
afterEach(() => {
  useAuthStore.setState({ user: null });
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Topbar onOpenPalette={() => {}} />
    </MemoryRouter>
  );
}

function charactersLink() {
  return screen.getByRole("link", { name: "Characters" });
}
function campaignsLink() {
  return screen.getByRole("link", { name: "Campaigns" });
}

describe("Topbar — nav active-state (#17)", () => {
  it("highlights Characters on the roster (/characters)", () => {
    renderAt("/characters");
    expect(charactersLink().className).toContain("text-accent-text");
    expect(campaignsLink().className).not.toContain("text-accent-text");
  });

  it("keeps Characters highlighted on the cockpit (/characters/:id)", () => {
    renderAt("/characters/mock-1");
    expect(charactersLink().className).toContain("text-accent-text");
    expect(campaignsLink().className).not.toContain("text-accent-text");
  });

  it("highlights Campaigns (not Characters) on /campaigns", () => {
    renderAt("/campaigns");
    expect(campaignsLink().className).toContain("text-accent-text");
    expect(charactersLink().className).not.toContain("text-accent-text");
  });
});

describe("Topbar — ⌘K hint chip is gated off coarse pointers (§3.5)", () => {
  it("renders the kbd chip on a fine pointer (desktop)", () => {
    coarseState.value = false;
    const { container } = renderAt("/characters");
    expect(container.querySelector("kbd")).not.toBeNull();
  });

  it("hides the kbd chip on a coarse pointer (touch) — shortcuts still work", () => {
    coarseState.value = true;
    const { container } = renderAt("/characters");
    expect(container.querySelector("kbd")).toBeNull();
  });
});

describe("Topbar — anonymous-viewer chrome (public /view + /legal)", () => {
  beforeEach(() => useAuthStore.setState({ user: null }));

  it("shows ONE primary action + a quiet sign-in, all pointing at the auth entry", () => {
    renderAt("/view/owner-1/char-1");
    // Desktop primary CTA + the mobile pill both point at the real Google auth entry.
    expect(screen.getByRole("link", { name: "Create your character" })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("drops the auth-gated hub tabs + palette + account cluster — content is the hero", () => {
    renderAt("/view/owner-1/char-1");
    // The hub navigator is a signed-in affordance; an anon viewer gets none of it.
    expect(screen.queryByRole("link", { name: "Characters" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Campaigns" })).toBeNull();
    expect(screen.queryByRole("button", { name: /ask the folio/i })).toBeNull();
    expect(screen.queryByTestId("acct")).toBeNull();
    // The wordmark still anchors the left.
    expect(screen.getByRole("link", { name: "d20 Folio" })).toBeInTheDocument();
  });

  it("MUTATION PROOF — a signed-in viewer keeps the account cluster, no CTA", () => {
    useAuthStore.setState({ user: { uid: "u1" } as never });
    renderAt("/view/owner-1/char-1");
    expect(screen.getByTestId("acct")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create your character" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Get started" })).toBeNull();
  });
});
