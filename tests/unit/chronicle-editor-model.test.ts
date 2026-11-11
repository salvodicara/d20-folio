/**
 * The Chronicle editor model: who wrote what (the viewer reads «you»), the version
 * rows, and the save (optimistic text, one atomic commit, a toast and `false` when
 * refused). Shared by the classic Chronicle and the new campaign screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";

vi.mock("@/lib/firebase", () => ({ db: {} }));
const commit =
  vi.fn<(id: string, edit: { text: string; editedBy: string }) => Promise<void>>();
vi.mock("@/features/campaigns/campaign-io", () => ({
  commitChronicleEdit: (id: string, edit: { text: string; editedBy: string }) =>
    commit(id, edit),
}));

import {
  chronicleByline,
  chronicleVersionRows,
  saveChronicle,
} from "@/domains/chronicle/chronicle-editor";
import { useChronicleStore } from "@/features/campaigns/chronicleStore";
import { useToastStore } from "@/stores/toastStore";

const t = ((key: string, args?: Record<string, unknown>) =>
  args ? `${key} ${JSON.stringify(args)}` : key) as unknown as TFunction;
const members = { me: { displayName: "Salvo" }, ana: { displayName: "Ana" } };
const at = new Date("2026-11-10T20:00:00Z");

describe("chronicleByline", () => {
  it("names the viewer «you» and another member by name, with the time", () => {
    const base = { text: "x", lastEditedAt: at, versions: [] };
    expect(
      chronicleByline({ ...base, lastEditedBy: "me" }, "me", members, "en", t)
    ).toContain('"name":"campaignHub.chronicleAuthorSelf"');
    expect(
      chronicleByline({ ...base, lastEditedBy: "ana" }, "me", members, "en", t)
    ).toContain('"name":"Ana"');
  });

  it("is empty before anyone wrote", () => {
    expect(chronicleByline(null, "me", members, "en", t)).toBe("");
    expect(
      chronicleByline(
        { text: "", lastEditedBy: "", lastEditedAt: at, versions: [] },
        "me",
        members,
        "en",
        t
      )
    ).toBe("");
  });

  it("falls back to «unnamed» for a member who left", () => {
    const line = chronicleByline(
      { text: "x", lastEditedBy: "gone", lastEditedAt: at, versions: [] },
      "me",
      members,
      "en",
      t
    );
    expect(line).toContain('"name":"campaignHub.unnamedPlayer"');
  });
});

describe("chronicleVersionRows", () => {
  it("the viewer's own edit reads «you»; another keeps the name stored with it", () => {
    const rows = chronicleVersionRows(
      [
        { timestamp: at, editedBy: "me", editedByName: "Old me", textSnapshot: "a" },
        { timestamp: at, editedBy: "gone", editedByName: "Bo", textSnapshot: "b" },
        { timestamp: at, editedBy: "ana", editedByName: "", textSnapshot: "c" },
      ],
      "me",
      members,
      "en",
      t
    );
    expect(rows.map((r) => r.author)).toEqual([
      "campaignHub.chronicleAuthorSelf",
      "Bo",
      "Ana",
    ]);
    expect(rows[1]?.text).toBe("b");
    expect(rows[0]?.when).toMatch(/2026/);
  });
});

describe("saveChronicle", () => {
  beforeEach(() => {
    commit.mockReset();
    useChronicleStore.setState({
      chronicle: { text: "old", lastEditedBy: "ana", lastEditedAt: at, versions: [] },
    });
    useToastStore.setState({ toasts: [] } as never);
  });

  it("shows the text at once, commits it, and keeps the replaced text as a version", async () => {
    commit.mockResolvedValue();
    const ok = await saveChronicle(
      { campaignId: "c1", uid: "me", next: "new", members },
      t
    );
    expect(ok).toBe(true);
    expect(commit).toHaveBeenCalledWith("c1", { text: "new", editedBy: "me" });
    const chronicle = useChronicleStore.getState().chronicle;
    expect(chronicle?.text).toBe("new");
    expect(chronicle?.versions[0]).toMatchObject({
      editedByName: "Ana",
      textSnapshot: "old",
    });
  });

  it("a refused save says so and returns false, so the editor stays open", async () => {
    commit.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const show = vi.spyOn(useToastStore.getState(), "showToast");
    const ok = await saveChronicle(
      { campaignId: "c1", uid: "me", next: "new", members },
      t
    );
    expect(ok).toBe(false);
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({ message: "campaignHub.chronicleSaveFailed" })
    );
  });
});
