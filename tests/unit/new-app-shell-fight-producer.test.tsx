/**
 * The fight producer (`GlobalCombatMount`) in the new UI's frame. On a character sheet
 * it starts at once: the Play screen reads the live fight, and the session-log recorder
 * stamps each line with the round it sees, so the sheet must never run without it. On
 * every other screen it waits for the page's load and an idle moment, so the screen's
 * own code and data download first on a slow phone. It reads the stored campaigns when
 * it starts (`global-combat.test.tsx`), so a fight that began meanwhile is not missed.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/features/campaigns/global-combat", () => ({
  GlobalCombatMount: () => <i data-testid="fight-producer" />,
}));
vi.mock("@/features/account/library-mount", () => ({ LibraryMount: () => null }));

import { NewAppShell } from "@/app/NewAppShell";

function at(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<NewAppShell />}>
          <Route path="*" element={<p>screen</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  // The page is still loading: only the sheet may start the producer now.
  vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
});

describe("the new frame's fight producer", () => {
  it("starts at once on a character sheet", async () => {
    at("/characters/hero-1");
    expect(
      await screen.findByTestId("fight-producer", {}, { timeout: 5000 })
    ).toBeTruthy();
  });

  it("waits for the page to load on the character list", async () => {
    at("/characters");
    await screen.findByText("screen");
    expect(screen.queryByTestId("fight-producer")).toBeNull();
  });
});
