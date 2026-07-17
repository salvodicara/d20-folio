/**
 * Topbar nav active-state (#17) — with the roster canonical at `/characters`
 * (not `/`), the "Characters" hub link can realm-match cleanly. These pin that
 * "Characters" highlights across the whole /characters realm (the roster, the
 * cockpit at /characters/:id) and NOT on a sibling realm like /campaigns.
 *
 * The active class is the deep-gold `text-accent-text` (from `hubLinkClass`); the
 * resting class is the quiet `text-text-secondary`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Topbar } from "@/app/shell/Topbar";

// Topbar pulls SettingsDropdown (only rendered when signed in) which reaches
// firebase transitively; stub it so the bare nav renders in isolation.
vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, storage: {} }));

// Control the coarse-pointer media query so the ⌘K chip gating is testable.
const coarseState = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => coarseState.value,
}));

beforeEach(() => {
  coarseState.value = false;
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
