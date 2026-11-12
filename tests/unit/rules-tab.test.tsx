/**
 * The campaign's «Regole» tab: the DM's chip writes the table rule at once with an
 * undo; players read only the rules that differ from RAW.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const io = vi.hoisted(() => ({ setCampaignTableRules: vi.fn(() => Promise.resolve()) }));
vi.mock("@/features/campaigns/campaign-io", () => io);
vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { RulesTab } from "@/domains/campaign/ui/RulesTab";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { useAuthStore } from "@/stores/authStore";
import type { CampaignDoc } from "@/types/campaign";

const campaign = (tableRules?: CampaignDoc["tableRules"]) =>
  ({
    id: "c1",
    dmUid: "dm",
    name: "C",
    ...(tableRules ? { tableRules } : {}),
  }) as CampaignDoc;

describe("RulesTab", () => {
  beforeEach(() => {
    io.setCampaignTableRules.mockClear();
  });

  it("the DM's chip writes the rule, and its undo puts RAW back", () => {
    useAuthStore.setState({ user: { uid: "dm" } as never });
    useCampaignStore.setState({ campaign: campaign() });
    const onToast = vi.fn();
    render(<RulesTab campaign={campaign()} onToast={onToast} />);
    fireEvent.click(screen.getByRole("button", { name: "Advantage" }));
    expect(io.setCampaignTableRules).toHaveBeenCalledWith("c1", {
      flanking: "advantage",
    });
    expect(useCampaignStore.getState().campaign?.tableRules).toEqual({
      flanking: "advantage",
    });
    const [message, undo] = onToast.mock.calls[0] as [string, () => void];
    expect(message).toBe("Table rule changed");
    undo();
    expect(io.setCampaignTableRules).toHaveBeenLastCalledWith("c1", {});
    expect(useCampaignStore.getState().campaign?.tableRules).toBeUndefined();
  });

  it("players read only what differs from RAW", () => {
    useAuthStore.setState({ user: { uid: "player" } as never });
    render(
      <RulesTab campaign={campaign({ potions: { drink: "action" } })} onToast={vi.fn()} />
    );
    expect(
      screen.getByText("The 2024 rules all apply as written, except these.")
    ).toBeTruthy();
    expect(screen.getByText("Drinking a potion")).toBeTruthy();
    expect(screen.queryByText("Flanking")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a table that plays RAW says so to players", () => {
    useAuthStore.setState({ user: { uid: "player" } as never });
    render(<RulesTab campaign={campaign()} onToast={vi.fn()} />);
    expect(
      screen.getByText("This table plays by the 2024 rules as written.")
    ).toBeTruthy();
  });
});
