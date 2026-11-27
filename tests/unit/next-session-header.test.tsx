/**
 * The new campaign header's next session (the classic «Ultima volta» editor): the DM
 * sets, changes or clears the date and time; a player only reads it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/campaigns/campaign-io")>()),
  setNextSession: () => Promise.resolve(),
}));

import { Header } from "@/domains/campaign/ui/CampaignScreen";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import type { CampaignDoc } from "@/types/campaign";

const campaign = {
  id: "camp",
  name: "The Starless Keep",
  dmUid: "dm",
  memberDetails: { dm: { displayName: "Otto", characterId: null, role: "dm" } },
  nextSessionAt: null,
} as unknown as CampaignDoc;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
  useCampaignStore.setState({ campaign });
});

const header = (isDm: boolean) =>
  render(
    <MemoryRouter>
      <Header
        campaign={useCampaignStore.getState().campaign ?? campaign}
        locale="en"
        isDm={isDm}
        onCopyInvite={() => {}}
      />
    </MemoryRouter>
  );

describe("the next session on the new campaign header", () => {
  it("the DM sets it", () => {
    header(true);
    fireEvent.click(screen.getByRole("button", { name: "Set the next session" }));
    fireEvent.change(screen.getByLabelText("Date and time of the next session"), {
      target: { value: "2030-03-14T20:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const at = useCampaignStore.getState().campaign?.nextSessionAt;
    expect(at).toBe(new Date(2030, 2, 14, 20, 30).getTime());
  });

  it("the DM clears a date already set", () => {
    useCampaignStore.setState({
      campaign: { ...campaign, nextSessionAt: new Date(2030, 2, 14, 20, 30).getTime() },
    });
    header(true);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(useCampaignStore.getState().campaign?.nextSessionAt).toBeNull();
  });

  it("a date already past reads as none: nothing to clear", () => {
    useCampaignStore.setState({
      campaign: { ...campaign, nextSessionAt: new Date(2020, 0, 1).getTime() },
    });
    header(true);
    fireEvent.click(screen.getByRole("button", { name: "Set the next session" }));
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    expect(screen.getByLabelText("Date and time of the next session")).toHaveValue("");
  });

  it("a player only reads it", () => {
    header(false);
    expect(screen.queryByRole("button", { name: "Set the next session" })).toBeNull();
  });
});
