// @vitest-environment jsdom
/**
 * A sign-in waits for the player's profile before the protected screens show (#1233).
 * The profile carries «Try the new interface», so showing a screen before it arrives
 * would paint the classic interface, then swap. On a cold start `initialized` is false
 * until the profile is read; after a sign-out it was already true, so a sign-in must
 * clear it again until this account's profile is in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  authCb: null as null | ((user: unknown) => void),
  profileDoc: { resolve: null as null | ((snap: unknown) => void) },
}));

vi.mock("@/lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("firebase/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/auth")>()),
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    h.authCb = cb;
    return () => {};
  },
}));
vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  doc: () => ({}),
  getDoc: () =>
    new Promise((resolve) => {
      h.profileDoc.resolve = resolve;
    }),
}));

import { initAuthListener } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";

const stored = {
  exists: () => true,
  data: () => ({
    uid: "u2",
    email: "",
    displayName: "",
    photoURL: null,
    status: "active",
    createdAt: null,
    lastActiveAt: null,
    settings: null,
    newUi: true,
  }),
};

beforeEach(() => {
  useAuthStore.getState().reset();
});

describe("a sign-in waits for its profile", () => {
  it("after a sign-out, the next sign-in is not ready until its profile is read", async () => {
    initAuthListener();
    h.authCb?.(null);
    expect(useAuthStore.getState().initialized).toBe(true);
    h.authCb?.({ uid: "u2" });
    expect(useAuthStore.getState().initialized).toBe(false);
    h.profileDoc.resolve?.(stored);
    await vi.waitFor(() => expect(useAuthStore.getState().initialized).toBe(true));
    expect(useAuthStore.getState().profile?.newUi).toBe(true);
  });
});
