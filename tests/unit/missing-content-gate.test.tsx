/**
 * The sheet's "content not available" gate (CockpitView, shared by the owner
 * cockpit, the campaign member sheet and the public share link).
 *
 * Without the private pack, a character built with it shows the notice and never
 * the sheet, so nothing stripped can be edited and saved. With nothing missing
 * the sheet renders as before. The detector itself is `missing-content.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "@/i18n";

const { missingContentMock } = vi.hoisted(() => ({ missingContentMock: vi.fn() }));
vi.mock("@/data/missing-content", () => ({
  packLoaded: false,
  missingContent: missingContentMock,
}));
vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { CockpitView } from "@/features/character/CharacterCockpit";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";

function renderSheet() {
  return render(
    <MemoryRouter>
      <CockpitView />
    </MemoryRouter>
  );
}

describe("content not available", () => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    useUIStore.setState({ sheetMode: "play" });
    useCharacterStore.setState({
      character: { ...MOCK_CHARACTER },
      loading: false,
      error: null,
      readonly: true,
    });
  });

  it("shows the notice, not the sheet, when the character names missing content", () => {
    missingContentMock.mockReturnValue([{ kind: "subclass", id: "mercy" }]);
    renderSheet();
    expect(screen.getByText("Content not available")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("says it in Italian too", async () => {
    missingContentMock.mockReturnValue([{ kind: "spell", id: "x" }]);
    await act(async () => {
      await i18n.changeLanguage("it");
    });
    renderSheet();
    expect(screen.getByText("Contenuto non disponibile")).toBeInTheDocument();
  });

  it("renders the sheet when nothing is missing", () => {
    missingContentMock.mockReturnValue([]);
    renderSheet();
    expect(screen.queryByText("Content not available")).toBeNull();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});
