/**
 * The campaign's sessions on the new campaign screen (headless), from the classic
 * journal and «Last time» card: create a session (it opens ready to write in), rename,
 * delete; the next session, still «tonight» for a few hours after it starts; the latest
 * session's notes as the recap.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";

const io = vi.hoisted(() => ({
  createSession: vi.fn(() => Promise.resolve("s-new")),
  updateSession: vi.fn(() => Promise.resolve()),
  deleteSession: vi.fn(() => Promise.resolve()),
  setNextSession: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

import {
  addSession,
  lastTimeView,
  nextSessionView,
  removeSession,
  renameSession,
  saveNextSession,
  sortSessions,
} from "@/domains/chronicle/session-moves";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import type { CampaignDoc, SessionLogDoc } from "@/types/campaign";

const t = ((key: string, args?: { n?: number }) =>
  args?.n !== undefined ? `${key}:${args.n}` : key) as unknown as TFunction;

const session = (id: string, day: number, notes = ""): SessionLogDoc =>
  ({ id, label: id, date: new Date(2026, 10, day), notes }) as SessionLogDoc;

const HOUR = 3_600_000;

beforeEach(() => {
  vi.clearAllMocks();
  useCampaignStore
    .getState()
    .setCampaign({ id: "camp-1", nextSessionAt: null } as unknown as CampaignDoc);
});

describe("sessions", () => {
  it("a new session is numbered after the others and starts empty", async () => {
    const date = new Date(2026, 10, 10);
    const created = await addSession("camp-1", 2, t, date);
    expect(io.createSession).toHaveBeenCalledWith("camp-1", {
      label: "campaignHub.sessionN:3",
      date,
    });
    expect(created).toMatchObject({
      id: "s-new",
      label: "campaignHub.sessionN:3",
      notes: "",
    });
  });

  it("a refused create gives nothing (the next load shows the truth)", async () => {
    io.createSession.mockRejectedValueOnce(new Error("offline"));
    expect(await addSession("camp-1", 0, t)).toBeNull();
  });

  it("newest first", () => {
    expect(
      sortSessions([session("a", 1), session("c", 3), session("b", 2)]).map((s) => s.id)
    ).toEqual(["c", "b", "a"]);
  });

  it("rename and delete write through", () => {
    renameSession("camp-1", "a", "The cave");
    expect(io.updateSession).toHaveBeenCalledWith("camp-1", "a", { label: "The cave" });
    removeSession("camp-1", "a");
    expect(io.deleteSession).toHaveBeenCalledWith("camp-1", "a");
  });
});

describe("next session and «Last time»", () => {
  it("the next session stays upcoming until six hours after it starts", () => {
    const at = Date.UTC(2026, 10, 10, 20);
    expect(nextSessionView(at, at - HOUR)).toEqual({ at, upcoming: true });
    expect(nextSessionView(at, at + 5 * HOUR)).toEqual({ at, upcoming: true });
    expect(nextSessionView(at, at + 7 * HOUR)).toEqual({ at, upcoming: false });
    expect(nextSessionView(null, at)).toEqual({ at: null, upcoming: false });
  });

  it("the DM sets or clears it on the campaign", () => {
    saveNextSession(1234);
    expect(useCampaignStore.getState().campaign?.nextSessionAt).toBe(1234);
    expect(io.setNextSession).toHaveBeenCalledWith("camp-1", 1234);
    saveNextSession(null);
    expect(useCampaignStore.getState().campaign?.nextSessionAt).toBeNull();
  });

  it("«Last time» is the latest session's notes, trimmed", () => {
    const view = lastTimeView([
      session("b", 2, "  We met the dragon.  "),
      session("a", 1),
    ]);
    expect(view.latest?.id).toBe("b");
    expect(view.notes).toBe("We met the dragon.");
    expect(lastTimeView([])).toEqual({ latest: null, notes: "" });
  });
});
