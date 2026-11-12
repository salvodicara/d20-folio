/**
 * The Play screen's right column for a character in a campaign whose table has logged
 * nothing yet (walkthrough H4): the character's own report shows there, never an empty
 * column.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
vi.mock("@/domains/campaign/ui/use-party", () => ({
  usePartyNames: () => ({}),
}));
vi.mock("@/features/campaigns/useSessionReports", () => ({
  useSessionReports: () => ({ logs: [], loading: false }),
}));

import { PlayRight } from "@/domains/play/ui/PlayRight";
import { makeDevCampaign } from "@/features/campaigns/dev-fixture";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { makeCharacterDoc } from "./_helpers";

describe("PlayRight, a campaign with nothing logged", () => {
  it("shows the character's own report", () => {
    const doc = makeCharacterDoc({});
    doc.session.logEntries = [
      { id: "h", ts: 1_000, event: { kind: "hp-heal", amount: 7, current: 20, max: 30 } },
    ];
    useCharacterStore.getState().setCharacter(doc);
    useCombatStore.setState({ fightStarted: false, round: 1 });
    render(
      <MemoryRouter>
        <PlayRight campaign={makeDevCampaign("c1")} locale="en" onToast={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText("Report")).toBeTruthy();
  });
});
