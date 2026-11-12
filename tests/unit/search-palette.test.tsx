/**
 * ⌘K on the new UI: type, the hits come grouped by kind; ↓ and Enter open the
 * highlighted one; a rule with no page of its own shows its «In breve» in place.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
vi.mock("@/features/campaigns/campaign-io", () => ({
  listSharedCampaigns: () => Promise.resolve([]),
}));
vi.mock("@/hooks/useCharacters", () => ({
  useCharacters: () => ({ characters: [], loading: false }),
}));

import SearchPalette from "@/domains/search/ui/SearchPalette";

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function mount() {
  render(
    <MemoryRouter initialEntries={["/characters"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <SearchPalette open onClose={() => {}} />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
  return screen.getByRole("combobox");
}

describe("SearchPalette", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    localStorage.clear();
  });

  it("finds a spell under «Compendium», and ↓ Enter opens it", async () => {
    const field = mount();
    fireEvent.change(field, { target: { value: "fireball" } });
    const group = await screen.findByRole(
      "group",
      { name: "Compendium" },
      { timeout: 20_000 }
    );
    expect(within(group).getAllByRole("option")[0]?.textContent).toMatch(/Fireball/);
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field.getAttribute("aria-activedescendant")).toBeTruthy();
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByTestId("where").textContent).toMatch(/^\/compendium/)
    );
  }, 30_000);

  it("a condition shows its «In breve» in place", async () => {
    const field = mount();
    fireEvent.change(field, { target: { value: "prone" } });
    const rules = await screen.findByRole(
      "group",
      { name: "Reference" },
      { timeout: 20_000 }
    );
    const option = within(rules).getAllByRole("option", { name: /^Prone/ })[0];
    if (!option) throw new Error("no Prone rule");
    fireEvent.click(option);
    expect(screen.getByTestId("where").textContent).toBe("/characters");
    expect(document.querySelector(".f-pal-gist")?.textContent).toBeTruthy();
  }, 30_000);
});
