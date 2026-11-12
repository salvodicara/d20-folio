/**
 * The campaign header on a tab page past the landing one is marked compact: on a phone
 * it shrinks to the crest and the name, so the tab's content starts on the first screen.
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

describe("campaign Header: compact on the tab pages", () => {
  it("the landing tab keeps the full header", () => {
    const { container } = render(
      <Header
        campaign={makeDevCampaign("c1")}
        locale="en"
        onCopyInvite={() => undefined}
      />
    );
    expect(container.querySelector(".f-hero[data-compact]")).toBeNull();
  });

  it("a tab page marks it compact", () => {
    const { container } = render(
      <Header
        campaign={makeDevCampaign("c1")}
        locale="en"
        onCopyInvite={() => undefined}
        compact
      />
    );
    expect(container.querySelector(".f-hero[data-compact]")).toBeTruthy();
  });
});
