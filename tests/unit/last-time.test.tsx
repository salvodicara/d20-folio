/**
 * LastTime — the Live tab's "Last time…" card: the newest session's notes, and the
 * date of the next session (the DM sets it; everyone sees it while it is upcoming).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CampaignDoc } from "@/types/campaign";

const { listMock, setNextMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  setNextMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listSessions: listMock,
  setNextSession: setNextMock,
}));

import { LastTime } from "@/features/campaigns/LastTime";
import { useCampaignStore } from "@/features/campaigns/campaignStore";

const NOW = Date.now();
const HOUR = 3_600_000;

function seed(nextSessionAt?: number | null): void {
  useCampaignStore.setState({
    campaign: { id: "c1", nextSessionAt } as unknown as CampaignDoc,
  });
}

beforeEach(() => {
  listMock.mockReset().mockResolvedValue([]);
  setNextMock.mockClear();
});

const renderCard = (canManage: boolean) =>
  render(
    <LastTime campaignId="c1" visible canManage={canManage} onOpenJournal={() => {}} />
  );

describe("LastTime — next session", () => {
  it("shows an upcoming date to everyone", async () => {
    seed(NOW + 72 * HOUR);
    renderCard(false);
    expect(await screen.findByText(/next session/i)).toBeInTheDocument();
    const when = new Date(NOW + 72 * HOUR).getDate();
    expect(screen.getByText(/next session/i).parentElement).toHaveTextContent(
      new RegExp(`\\b${when}\\b`)
    );
  });

  it("keeps tonight's date up during the evening, hides it the day after", async () => {
    seed(NOW - 2 * HOUR);
    const { unmount } = renderCard(false);
    expect(await screen.findByText(/next session/i)).toBeInTheDocument();
    unmount();
    seed(NOW - 30 * HOUR);
    renderCard(false);
    await screen.findByText(/no sessions logged yet/i);
    expect(screen.queryByText(/next session/i)).not.toBeInTheDocument();
  });

  it("lets the DM set the date; players get no editor", async () => {
    seed(null);
    const { unmount } = renderCard(false);
    await screen.findByText(/no sessions logged yet/i);
    expect(screen.queryByRole("button", { name: /set the next session/i })).toBeNull();
    unmount();

    renderCard(true);
    fireEvent.click(await screen.findByRole("button", { name: /set the next session/i }));
    fireEvent.change(screen.getByLabelText(/date and time of the next session/i), {
      target: { value: "2099-10-12T20:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(setNextMock).toHaveBeenCalledWith(
        "c1",
        new Date(2099, 9, 12, 20, 30).getTime()
      )
    );
    expect(useCampaignStore.getState().campaign?.nextSessionAt).toBe(
      new Date(2099, 9, 12, 20, 30).getTime()
    );
  });
});
