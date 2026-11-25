// @vitest-environment jsdom
/**
 * The shared fight and the campaign clock need the network (they are transactions,
 * which always fail offline). Before #1277 both failed in silence: End Turn left the
 * player's turn as it was with only a console error, and a rest's clock step only
 * logged a warning, so the table's clock drifted. Now each says what did not happen
 * and why, in plain words.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  advance: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", () => ({ advanceEncounterTurn: h.advance }));

import { advanceSharedTurn } from "@/features/character/center/turn-state";
import { reportClockNotMoved } from "@/features/character/clock-notice";
import { localizeToastIntent } from "@/lib/views/toast-intent";
import { useToastStore } from "@/stores/toastStore";

let online = true;
beforeEach(() => {
  online = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  useToastStore.setState({ toasts: [] });
  h.advance.mockReset();
});

const lastIntent = () => useToastStore.getState().toasts.at(-1)?.intent;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("End Turn that cannot reach the shared fight", () => {
  it("offline, says the turn did not end because the fight needs the network", async () => {
    online = false;
    h.advance.mockRejectedValue(new Error("unavailable"));
    advanceSharedTurn("camp-1", "pc-u1", "pc-u1");
    await settle();
    expect(lastIntent()).toEqual({ kind: "turn-not-ended", offline: true });
  });

  it("online, a refused End Turn says so too", async () => {
    h.advance.mockRejectedValue(new Error("aborted"));
    advanceSharedTurn("camp-1", "pc-u1", "pc-u1");
    await settle();
    expect(lastIntent()).toEqual({ kind: "turn-not-ended", offline: false });
  });

  it("a turn that ends says nothing", async () => {
    h.advance.mockResolvedValue(undefined);
    advanceSharedTurn("camp-1", "pc-u1", "pc-u1");
    await settle();
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});

describe("a rest whose campaign clock step fails", () => {
  it("says the rest is saved but the clock did not move", () => {
    online = false;
    reportClockNotMoved(new Error("unavailable"));
    expect(lastIntent()).toEqual({ kind: "clock-not-moved", offline: true });
  });
});

describe("the notices read plainly", () => {
  const t = (key: string) => key;
  const none = (v: string) => v;
  it.each([
    [{ kind: "turn-not-ended", offline: true } as const, "combat.turnNotEndedOffline"],
    [{ kind: "turn-not-ended", offline: false } as const, "combat.turnNotEnded"],
    [{ kind: "clock-not-moved", offline: true } as const, "combat.clockNotMovedOffline"],
    [{ kind: "clock-not-moved", offline: false } as const, "combat.clockNotMoved"],
  ])("%o → %s", (intent, key) => {
    expect(localizeToastIntent(intent, t, none, none)).toBe(key);
  });
});
