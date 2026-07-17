/**
 * useIsAdmin — the single shared admin gate (owner-ratified, data-driven admin —
 * CLAUDE.md → Firebase essentials).
 *
 * Proves the gate is closed by default and opens ONLY when the signed-in user's
 * loaded profile carries `role: "admin"`, so admin-only affordances (e.g. the
 * roster's "Load example character" button) never leak to a normal player or a
 * not-yet-loaded session. The auth store is mocked so the hook is tested in
 * isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const { authState, bypassState } = vi.hoisted(() => ({
  authState: { profile: null as { role?: "admin" } | null },
  bypassState: { value: false },
}));

// `authStore` carries a type-only `import type { User } from "firebase/auth"`. It
// is erased at runtime (and fully mocked below), but the CI-safety pure-modules
// guard scans the static source and flags any `firebase/*` reach — declare the
// documented exemption mock.
vi.mock("@/lib/firebase", () => ({ db: {} }));
// Mock dev-bypass so the role-logic cases are hermetic (the real value depends on
// `.env.local`, which a unit test must never read); flip it for the bypass case.
vi.mock("@/lib/dev-bypass", () => ({
  get DEV_BYPASS_AUTH() {
    return bypassState.value;
  },
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: { profile: { role?: "admin" } | null }) => unknown) =>
    selector({ profile: authState.profile }),
}));

import { useIsAdmin } from "@/hooks/useIsAdmin";

beforeEach(() => {
  authState.profile = null;
  bypassState.value = false;
});

describe("useIsAdmin", () => {
  it("is true only when the loaded profile has role 'admin'", () => {
    authState.profile = { role: "admin" };
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(true);
  });

  it("is false for a normal player (profile without a role)", () => {
    authState.profile = {};
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(false);
  });

  it("is false when signed out / profile not yet loaded", () => {
    authState.profile = null;
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(false);
  });

  it("ADMIN1 — opens for everyone under dev-bypass (local superuser), no role needed", () => {
    bypassState.value = true;
    authState.profile = null; // not even signed in / no role…
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toBe(true); // …yet the gate is open in dev-bypass
  });
});
