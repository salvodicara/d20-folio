// @vitest-environment jsdom
/**
 * #1341 — «Your data» on the new settings: download everything, or erase the account.
 * Erasure is gated by typing the account's email; local drafts and rescue copies go
 * only after the server has erased the account, then the player is signed out. A
 * failure keeps everything and stays signed in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as string[],
  deleteFails: false,
}));
vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/lib/firestore", () => ({
  deleteUserAccount: (uid: string, email: string) => {
    h.calls.push(`delete:${uid}:${email}`);
    return h.deleteFails ? Promise.reject(new Error("internal")) : Promise.resolve();
  },
}));
vi.mock("@/lib/auth", () => ({
  signOut: () => {
    h.calls.push("signOut");
    return Promise.resolve();
  },
}));
vi.mock("@/features/account/account-export-io", () => ({
  exportMyAccount: () => {
    h.calls.push("export");
    return Promise.resolve({ characters: 3, charactersSkipped: 1, portraitsDropped: 0 });
  },
}));

import {
  deleteMyAccount,
  downloadMyData,
  emailConfirms,
} from "@/domains/account/my-data";
import { initialCreationDraft } from "@/lib/creation/draft";
import { loadCreationDraft, saveCreationDraft } from "@/lib/local-draft";

// A draft kept on this device (creation in progress): erasure must take it too.
const keepDraft = () => saveCreationDraft("u1", initialCreationDraft());

beforeEach(() => {
  localStorage.clear();
  h.calls.length = 0;
  h.deleteFails = false;
});

describe("the typed confirmation", () => {
  it("matches the account's email, ignoring case and surrounding spaces", () => {
    expect(emailConfirms(" Mara@Example.com ", "mara@example.com")).toBe(true);
    expect(emailConfirms("mara@example.co", "mara@example.com")).toBe(false);
    expect(emailConfirms("", "mara@example.com")).toBe(false);
  });
});

describe("delete my account", () => {
  it("a wrong email does nothing at all", async () => {
    expect(await deleteMyAccount("u1", "mara@example.com", "someone@else.com")).toBe(
      "mismatch"
    );
    expect(h.calls).toEqual([]);
  });

  it("erases on the server, THEN clears this device's drafts, THEN signs out", async () => {
    keepDraft();
    expect(await deleteMyAccount("u1", "mara@example.com", "mara@example.com")).toBe(
      "deleted"
    );
    expect(h.calls).toEqual(["delete:u1:mara@example.com", "signOut"]);
    expect(loadCreationDraft("u1")).toBeNull();
  });

  it("a server failure keeps everything and stays signed in", async () => {
    h.deleteFails = true;
    keepDraft();
    expect(await deleteMyAccount("u1", "mara@example.com", "mara@example.com")).toBe(
      "failed"
    );
    expect(h.calls).toEqual(["delete:u1:mara@example.com"]);
    expect(loadCreationDraft("u1")).not.toBeNull();
  });
});

describe("download my data", () => {
  it("runs the account export and reports what was skipped", async () => {
    const result = await downloadMyData({
      uid: "u1",
      email: "mara@example.com",
      displayName: "Mara",
      createdAt: new Date(0),
    });
    expect(h.calls).toEqual(["export"]);
    expect(result).toEqual({ ok: true, characters: 3, charactersSkipped: 1 });
  });
});
