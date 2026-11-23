/**
 * A combat state the reader refuses is reported with WHERE it was refused (a check and a
 * field name, never a value). Production had one `combat-state.invalid` with only its
 * reason (2026-11-22): the report could not say which field (coordinator).
 */
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  log: vi.fn(),
  snapshot: null as null | ((snap: unknown) => void),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/diagnostics", () => ({ diagnosticsLog: h.log }));
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  doc: () => ({}),
  onSnapshot: (_ref: unknown, _opts: unknown, next: (snap: unknown) => void) => {
    h.snapshot = next;
    return () => undefined;
  },
}));

import { subscribeCombatState } from "@/lib/combat-state-io";

describe("an unreadable combat state", () => {
  it("is reported with its reason and where it was refused", () => {
    const onError = vi.fn();
    subscribeCombatState("u1", "c1", () => undefined, onError);
    h.snapshot?.({
      exists: () => true,
      data: () => ({ hp: "not a number", playState: { schema: 1, state: {} } }),
      metadata: { hasPendingWrites: false },
    });
    expect(onError).toHaveBeenCalled();
    const [level, event, data] = h.log.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect([level, event]).toEqual(["error", "combat-state.invalid"]);
    expect(data.reason).toBe("invalid-combat-state");
    expect(typeof data.where).toBe("string");
    expect(String(data.where)).not.toContain("not a number");
  });
});
