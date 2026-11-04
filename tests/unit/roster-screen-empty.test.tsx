/**
 * The new roster with no character yet (prototype chars-empty): three ways in —
 * the guided creation, the quick one (straight into «Creazione rapida»), an import.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const { navigateMock, importMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  importMock: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/hooks/useCharacters", () => ({
  useCharacters: () => ({ characters: [], loading: false }),
}));
vi.mock("@/features/campaigns/campaign-io", () => ({
  listSharedCampaigns: () => Promise.resolve([]),
}));
vi.mock("@/features/roster/import-trigger", () => ({
  triggerCharacterImport: importMock,
}));
vi.mock("@/features/roster/ImportCharacterHost", () => ({
  ImportCharacterHost: () => null,
}));
vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

import { RosterScreen } from "@/domains/roster/ui/RosterScreen";

describe("RosterScreen, empty", () => {
  it("offers guided creation, the quick build and an import", () => {
    render(
      <MemoryRouter>
        <RosterScreen />
      </MemoryRouter>
    );
    expect(screen.getByText("Already have a sheet?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "A character in a minute" }));
    expect(navigateMock).toHaveBeenCalledWith("/characters/new?rapid=1");
    const imports = screen.getAllByRole("button", { name: /^Import$/ });
    fireEvent.click(imports[imports.length - 1] as HTMLElement);
    expect(importMock).toHaveBeenCalled();
  });
});
