/**
 * MobileBottomNav — the phone realm switcher (C2). Verifies it renders the three
 * hub links and marks the current realm active across its subtree (so the cockpit
 * route /characters/:id keeps Characters lit).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { MobileBottomNav } from "@/app/shell/MobileBottomNav";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MobileBottomNav />
    </MemoryRouter>
  );
}

describe("MobileBottomNav", () => {
  it("renders the three hub realms with their routes", () => {
    renderAt("/characters");
    expect(screen.getByRole("link", { name: /characters/i })).toHaveAttribute(
      "href",
      "/characters"
    );
    expect(screen.getByRole("link", { name: /campaigns/i })).toHaveAttribute(
      "href",
      "/campaigns"
    );
    expect(screen.getByRole("link", { name: /compendium/i })).toHaveAttribute(
      "href",
      "/compendium"
    );
  });

  it("keeps Characters active on a cockpit sub-route", () => {
    renderAt("/characters/mock-1");
    expect(screen.getByRole("link", { name: /characters/i }).className).toMatch(/active/);
    expect(screen.getByRole("link", { name: /campaigns/i }).className).not.toMatch(
      /active/
    );
  });
});
