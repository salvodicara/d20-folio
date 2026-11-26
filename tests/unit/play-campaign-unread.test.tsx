/**
 * The new Play screen never runs a solo fight for a character in a campaign it could
 * not read (#1217). Play finds the character's campaign with its own read
 * (`useAttachedCampaign`), and a failed read leaves it `null`: the character's own
 * document still names the campaign (`attachedCampaignId`), so the solo controls stay
 * hidden. A character whose document names no campaign keeps its solo fight. An action
 * refused for it says so in the new shell's toast, with Reload.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import i18n from "@/i18n";
import { NewToasts } from "@/app/NewToasts";
import { PlayCentre } from "@/domains/play/ui/PlayCentre";
import { unreadNotice, useCampaignsReadStore } from "@/features/campaigns/campaigns-read";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { makeCharacterDoc } from "./_helpers";

function open(attached: boolean) {
  const doc = makeCharacterDoc({});
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
    combatRound: 1,
    combatSoloFightStarted: false,
  });
  useCampaignsReadStore.setState({
    attachment: { characterId: doc.id, attached },
    failed: true,
  });
  render(
    <MemoryRouter>
      <TurnEconomyProvider renderPrompts={false}>
        {/* the campaign read failed: Play has no campaign to hand */}
        <PlayCentre doc={doc} locale="en" campaign={null} />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useCombatStatusStore.setState({ status: null });
  useCombatStore.getState().endCombat();
});

afterEach(() => {
  useCampaignsReadStore.setState({ attachment: null, failed: false });
  useCharacterStore.setState({ character: null });
  useToastStore.getState().clearAll();
});

describe("Play, when the campaign read failed", () => {
  it("a character in a campaign gets no solo fight", () => {
    open(true);
    expect(screen.queryByRole("button", { name: "Start combat" })).toBeNull();
  });

  it("a character in no campaign keeps its solo fight", () => {
    open(false);
    expect(screen.getByRole("button", { name: "Start combat" })).toBeTruthy();
  });
});

describe("the new shell's toast, when the campaign read failed", () => {
  it("says the action was not done and offers Reload, which reloads", () => {
    useCampaignsReadStore.setState({ failed: true });
    const reload = vi.fn();
    render(<NewToasts />);
    act(() => {
      useToastStore.getState().showToast(unreadNotice(i18n.t.bind(i18n), reload));
    });
    expect(
      screen.getByText(/Couldn't reach your campaign, so this wasn't done/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
