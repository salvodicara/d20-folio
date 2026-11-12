/**
 * The Play screen's right column for a character in no campaign (coordinator,
 * 2026-11-12): «Resoconto» from its own sheet log, and «Iniziativa» with the round of
 * the fight it started itself. Before anything is logged and with no fight, the column
 * stays empty, as it does in a campaign with no fight.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayRight } from "@/domains/play/ui/PlayRight";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { makeCharacterDoc } from "./_helpers";

function mount() {
  return render(
    <MemoryRouter>
      <PlayRight campaign={null} locale="en" onToast={() => {}} />
    </MemoryRouter>
  );
}

describe("PlayRight, no campaign", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(makeCharacterDoc({}));
    useCharacterStore.setState({ readonly: false });
    useCombatStore.setState({ fightStarted: false, round: 1 });
  });

  it("is empty with nothing logged and no fight", () => {
    mount();
    expect(screen.queryByRole("heading", { name: "Report" })).toBeNull();
    expect(screen.queryByText(/^Initiative/)).toBeNull();
  });

  it("tells the character's own log as «Report»", () => {
    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("no character");
    doc.session.logEntries = [
      { id: "h", ts: 1_000, event: { kind: "hp-heal", amount: 7, current: 20, max: 30 } },
    ];
    useCharacterStore.setState({ character: { ...doc } });
    mount();
    expect(screen.getByText("Report")).toBeTruthy();
  });

  it("a line from a fight of its own sits under that fight, not exploration", () => {
    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("no character");
    doc.session.logEntries = [
      { id: "s", ts: 1_000, event: { kind: "fight-start" } },
      {
        id: "h",
        ts: 2_000,
        event: { kind: "hp-damage", amount: 4, current: 16, max: 30 },
      },
      { id: "e", ts: 3_000, event: { kind: "fight-end" } },
    ];
    useCharacterStore.setState({ character: { ...doc } });
    mount();
    expect(screen.getByText(/^Fight/)).toBeTruthy();
    expect(screen.queryByText(/^Exploration/)).toBeNull();
  });

  it("shows the round of a fight of its own", () => {
    useCombatStore.setState({ fightStarted: true, round: 3 });
    mount();
    expect(screen.getByText("Initiative · round 3")).toBeTruthy();
  });
});
