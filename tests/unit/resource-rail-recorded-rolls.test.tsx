import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import i18n from "@/i18n";
import { MOCK_CHARACTER } from "@/lib/mock";
import { ResourceRail } from "@/features/character/molecules/ResourceRail";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import { customInstanceId } from "./__helpers__/custom-items";

function loadRecordedTracker() {
  const character = structuredClone(MOCK_CHARACTER);
  character.character.features = [
    {
      custom: true,
      title: "Foretelling",
      emoji: "",
      source: "Homebrew",
      tags: [],
      contentBlocks: [],
      trackers: [
        {
          id: "foretelling",
          label: "Foretelling",
          total: "2",
          recovery: "long-rest",
          recordedRolls: { min: 1, max: 20 },
        },
      ],
      instanceId: customInstanceId("Foretelling"),
    },
  ];
  character.session.trackers = {};
  useCharacterStore.getState().setCharacter(character);
}

describe("ResourceRail — table-recorded tracker rolls", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useUndoStore.getState().clear();
    useUIStore.setState({ sheetMode: "play" });
    loadRecordedTracker();
  });

  it("records two physical rolls, spends one exact value, and undoes it", () => {
    render(
      <MemoryRouter>
        <ResourceRail />
      </MemoryRouter>
    );

    const first = screen.getByRole("spinbutton", {
      name: "Record roll 1 for Foretelling",
    });
    const second = screen.getByRole("spinbutton", {
      name: "Record roll 2 for Foretelling",
    });
    fireEvent.change(first, { target: { value: "17" } });
    fireEvent.change(second, { target: { value: "4" } });

    expect(useCharacterStore.getState().character?.session.trackers.foretelling).toEqual({
      used: 0,
      rolls: [17, 4],
    });

    fireEvent.click(screen.getByRole("button", { name: "Use Foretelling roll 17" }));
    expect(useCharacterStore.getState().character?.session.trackers.foretelling).toEqual({
      used: 1,
      rolls: [4],
    });

    act(() => {
      useUndoStore.getState().undo();
    });
    expect(useCharacterStore.getState().character?.session.trackers.foretelling).toEqual({
      used: 0,
      rolls: [17, 4],
    });
  });
});
