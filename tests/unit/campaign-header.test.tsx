/**
 * The campaign page's header: a next session already past is not a next session; it
 * reads «not set» until the DM sets a new one (no stale date on the page).
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { Header } from "@/domains/campaign/ui/CampaignScreen";
import { makeDevCampaign } from "@/features/campaigns/dev-fixture";

const DAY = 24 * 60 * 60 * 1000;

describe("campaign Header: the next session", () => {
  it("a date in the future shows", () => {
    const c = { ...makeDevCampaign("c1"), nextSessionAt: Date.now() + 3 * DAY };
    const { container } = render(
      <Header campaign={c} locale="en" onCopyInvite={() => undefined} />
    );
    expect(container.querySelector(".f-kv b")?.textContent ?? "").toMatch(/\d/);
  });

  it("a date already past reads as not set", () => {
    const c = { ...makeDevCampaign("c1"), nextSessionAt: Date.now() - 6 * DAY };
    const { container } = render(
      <Header campaign={c} locale="en" onCopyInvite={() => undefined} />
    );
    expect(container.querySelector(".f-kv b")?.textContent).toBe("not set");
  });
});
