/**
 * «Gestisci la campagna» on the new campaign screen (the classic DM tools and invite
 * card): the DM renames the campaign, locks or reopens the invite link, hands the DM
 * role to a player, or removes one, each of the last two only after a confirmation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/campaigns/campaign-io")>()),
  setJoinsLocked: () => Promise.resolve(),
  yieldDmRole: () => Promise.resolve(),
  removeMember: () => Promise.resolve(),
  updateCampaign: () => Promise.resolve(),
}));

import { ManageCampaignDialog } from "@/domains/campaign/ui/ManageCampaignDialog";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { useToastStore } from "@/stores/toastStore";
import type { CampaignDoc } from "@/types/campaign";

const campaign = {
  id: "camp",
  name: "The Starless Keep",
  dmUid: "dm",
  members: ["dm", "ana"],
  inviteCode: "ABC123",
  memberDetails: {
    dm: { displayName: "Otto", characterId: null, role: "dm" },
    ana: { displayName: "Ana", characterId: null, role: "player" },
  },
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

const open = () => render(<ManageCampaignDialog uid="dm" onClose={() => {}} />);
const store = () => useCampaignStore.getState().campaign;

describe("managing the campaign", () => {
  it("the DM renames it", () => {
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Campaign name" }), {
      target: { value: "The Lantern Road" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(store()?.name).toBe("The Lantern Road");
  });

  it("the DM locks the invite link", () => {
    open();
    expect(screen.getByText("Anyone with the link can join.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Lock new members/ }));
    expect(store()?.joinsLocked).toBe(true);
    expect(
      screen.getByText("The link lets nobody new in; the players here stay.")
    ).toBeInTheDocument();
  });

  it("locking joins can be undone from its toast", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Lock new members/ }));
    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast?.onUndo).toBeDefined();
    toast?.onUndo?.();
    expect(store()?.joinsLocked).toBe(false);
  });

  it("handing the DM role over asks first", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Hand over the DM role: Ana/ }));
    expect(store()?.dmUid).toBe("dm");
    expect(
      screen.getByText(
        "You can't undo this yourself: only the new DM can hand the role back."
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make DM" }));
    await vi.waitFor(() => expect(store()?.dmUid).toBe("ana"));
  });

  it("removing a player asks first", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Remove: Ana/ }));
    expect(store()?.memberDetails.ana).toBeDefined();
    expect(
      screen.getByText(
        "This can't be undone here: to come back, the player joins again with the invite link and attaches their character. Their character is not deleted."
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    await vi.waitFor(() => expect(store()?.memberDetails.ana).toBeUndefined());
  });
});
