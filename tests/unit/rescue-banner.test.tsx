/**
 * #1320 — the offer after the reload: «Unsaved changes from <date> were kept on this
 * device: Apply / Discard», on the owner's open sheet only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ applied: 0, discarded: 0, outcome: "applied" }));
vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/features/character/rescue-apply", () => ({
  applyRescueCopy: () => {
    h.applied += 1;
    return Promise.resolve(h.outcome);
  },
  discardRescueCopy: () => {
    h.discarded += 1;
  },
  upgradeRescueCopy: (copy: { schema: number }) => (copy.schema === 2 ? null : {}),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: Object.assign(
    (sel: (s: { user: { uid: string } }) => unknown) => sel({ user: { uid: "u1" } }),
    { getState: () => ({ user: { uid: "u1" } }) }
  ),
}));

import { RescueBanner } from "@/app/RescueBanner";
import { dropRescueCopy, keepRescueCopy } from "@/lib/local-draft";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";

function open(readonly = false): void {
  useCharacterStore.setState({
    character: { ...structuredClone(MOCK_CHARACTER), id: "c1" },
    readonly,
  });
}
const copy = (schema = 3) => ({
  savedAt: Date.UTC(2026, 10, 20, 18, 30),
  schema,
  playVersion: 1,
  build: {},
  state: {},
});

beforeEach(() => {
  localStorage.clear();
  h.applied = 0;
  h.discarded = 0;
  h.outcome = "applied";
  useCharacterStore.setState({ character: null, readonly: false });
});

describe("the rescue banner", () => {
  it("is absent when there is no copy", () => {
    open();
    render(<RescueBanner />);
    expect(screen.queryByRole("region", { name: /unsaved changes/i })).toBeNull();
  });

  it("offers Apply and Discard on the owner's sheet", async () => {
    keepRescueCopy("u1", "c1", copy());
    open();
    render(<RescueBanner />);
    expect(screen.getByRole("region", { name: /unsaved changes/i })).toHaveTextContent(
      /kept on this device/i
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^apply$/i }));
      await Promise.resolve();
    });
    expect(h.applied).toBe(1);
  });

  it("Discard drops it", () => {
    keepRescueCopy("u1", "c1", copy());
    open();
    render(<RescueBanner />);
    fireEvent.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(h.discarded).toBe(1);
    expect(screen.queryByRole("region", { name: /unsaved changes/i })).toBeNull();
  });

  // #1276 — a lost level-up is found once the stored sheet has loaded, after the banner
  // is already on screen; a copy that landed after all is dropped the same way.
  it("appears when a copy is kept while the sheet is open, and goes when it is dropped", () => {
    open();
    render(<RescueBanner />);
    expect(screen.queryByRole("region", { name: /unsaved changes/i })).toBeNull();
    act(() => {
      keepRescueCopy("u1", "c1", copy());
    });
    expect(screen.getByRole("region", { name: /unsaved changes/i })).toBeInTheDocument();
    act(() => dropRescueCopy("u1", "c1"));
    expect(screen.queryByRole("region", { name: /unsaved changes/i })).toBeNull();
  });

  it("never on a read-only sheet (a DM viewing a member)", () => {
    keepRescueCopy("u1", "c1", copy());
    open(true);
    render(<RescueBanner />);
    expect(screen.queryByRole("region", { name: /unsaved changes/i })).toBeNull();
  });

  it("a copy this version cannot apply offers Discard only, and says why", () => {
    keepRescueCopy("u1", "c1", copy(2));
    open();
    render(<RescueBanner />);
    expect(screen.getByRole("region", { name: /unsaved changes/i })).toHaveTextContent(
      /can.t be applied/i
    );
    expect(screen.queryByRole("button", { name: /^apply$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
  });
});
