/**
 * A character share link on the new frame: a link that no longer shares the character
 * says so in one tile, with the way to Folio (no dead end, no empty sheet).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
vi.mock("@/features/character/shared-character", () => ({
  loadSharedCharacter: () => Promise.resolve(null),
  useNoIndex: () => undefined,
}));

import { SharedScreen } from "@/domains/play/ui/SharedScreen";

describe("SharedScreen", () => {
  it("a link that no longer shares the character says so, with the way to Folio", async () => {
    render(
      <MemoryRouter initialEntries={["/view/u1/c1"]}>
        <Routes>
          <Route path="/view/:uid/:charId" element={<SharedScreen />} />
        </Routes>
      </MemoryRouter>
    );
    expect(
      await screen.findByRole("heading", { name: /no longer shared/i })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Folio/ })).toBeTruthy();
  });
});
