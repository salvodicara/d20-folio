/**
 * Gruppo's fight card (#1434): a running fight is the first thing on the page, with one
 * action that opens it; with no fight the card only says how one starts.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { FightCard } from "@/domains/campaign/ui/CampaignScreen";

describe("Gruppo's fight card", () => {
  it("a running fight leads the page and opens with one tap", () => {
    const onOpen = vi.fn();
    const { container } = render(<FightCard round={2} onOpen={onOpen} />);
    expect(container.querySelector("[data-live]")).not.toBeNull();
    expect(screen.getByText(/round 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open combat" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("with no fight there is nothing to open", () => {
    const { container } = render(<FightCard round={null} onOpen={() => undefined} />);
    expect(container.querySelector("[data-live]")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
