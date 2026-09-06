import { describe, it, expect, vi } from "vitest";
import {
  createIdentityRepository,
  dryRunMigration,
  parseCharacter,
  parseCampaign,
  SessionController,
} from "@/lib/identity";
import type { Firestore } from "firebase/firestore";
const original =
  '{"schema":3,"build":{"name":"One","race":"elf","classes":[{"classId":"wizard","level":1}]},"state":{}}';
describe("untrusted identity and asynchronous import scope", () => {
  it.each([undefined, null, 1, {}, []])("rejects non-string identity %j", (value) => {
    const c = {
      ...dryRunMigration(original, { ownerUid: "owner", id: "one" }).character,
      ownerUid: value,
    };
    expect(() => parseCharacter(c)).toThrow();
    expect(() =>
      parseCampaign({
        schema: 1,
        id: value,
        name: "Campaign",
        dmUid: "owner",
        members: ["owner"],
        revision: 0,
        archived: false,
        joinOpen: true,
      })
    ).toThrow();
  });
  it.each([undefined, null, 1, {}])(
    "rejects non-string assignment identity %j",
    (value) => {
      const c = {
        ...dryRunMigration(original, { ownerUid: "owner", id: "one" }).character,
        currentAssignment: { campaignId: value, assignmentId: "one", version: 1 },
      };
      expect(() => parseCharacter(c)).toThrow();
    }
  );
  it("does not import a selected private file into a changed account after hashing", async () => {
    let finish!: (value: ArrayBuffer) => void;
    const hash = vi.spyOn(crypto.subtle, "digest").mockImplementation(
      () =>
        new Promise<ArrayBuffer>((resolve) => {
          finish = resolve;
        })
    );
    try {
      const session = new SessionController();
      session.transition({ uid: "a", campaignId: null, activeCharacterId: null });
      const repo = createIdentityRepository({} as Firestore, session);
      const pending = repo.importLegacy(original);
      session.transition({ uid: "b", campaignId: null, activeCharacterId: null });
      session.transition({ uid: "a", campaignId: null, activeCharacterId: null });
      finish(new ArrayBuffer(32));
      await expect(pending).rejects.toThrow("stale-session");
    } finally {
      hash.mockRestore();
    }
  });
});
