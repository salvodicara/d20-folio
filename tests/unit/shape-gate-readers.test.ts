/**
 * #1320 — a reader that passes no "too new" handler (the DM's view of a member's
 * sheet, a one-shot read) must not go silent on a newer shape: the subscription
 * closes the shape gate itself, so this client stops writing and asks for a reload.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ data: {} }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: () => ({}),
  serverTimestamp: () => "ts",
  onSnapshot: (_ref: unknown, _opts: unknown, next: (snap: unknown) => void) => {
    next({
      id: "c1",
      exists: () => true,
      data: () => h.data,
      metadata: { hasPendingWrites: false },
    });
    return () => {};
  },
}));
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/dev-bypass", () => ({
  DEV_BYPASS_AUTH: false,
  devBypassEnabled: () => false,
}));
vi.mock("@/lib/storage", () => ({
  deletePortrait: vi.fn(),
  deleteBugReportScreenshot: vi.fn(),
}));
vi.mock("@/lib/log-persistence", () => ({ clearLogFromIDB: vi.fn() }));

import { subscribeToCharacter } from "@/lib/firestore";
import { subscribeCombatState } from "@/lib/combat-state-io";
import { resetShapeGateForTests, shapeGateState } from "@/lib/shape-gate";

beforeEach(() => resetShapeGateForTests());

describe("readers without a too-new handler", () => {
  it("a newer character schema closes the gate", () => {
    h.data = { schema: 99, build: {}, state: {}, revision: 1 };
    const cb = vi.fn();
    subscribeToCharacter("u1", "c1", cb, vi.fn());
    expect(cb).not.toHaveBeenCalled();
    expect(shapeGateState()).toEqual({ closed: true, rescue: "none" });
  });

  it("a newer play version closes the gate", () => {
    h.data = { playState: { version: 99, state: {} } };
    const cb = vi.fn();
    subscribeCombatState("u1", "c1", cb, vi.fn());
    expect(cb).not.toHaveBeenCalled();
    expect(shapeGateState()).toEqual({ closed: true, rescue: "none" });
  });

  it("a handler, when given, decides instead", () => {
    h.data = { schema: 99 };
    const onTooNew = vi.fn();
    subscribeToCharacter("u1", "c1", vi.fn(), vi.fn(), onTooNew);
    expect(onTooNew).toHaveBeenCalledTimes(1);
    expect(shapeGateState()).toEqual({ closed: false });
  });
});
