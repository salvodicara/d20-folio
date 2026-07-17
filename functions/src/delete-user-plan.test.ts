import { describe, it, expect } from "vitest";
import {
  planCampaignUpdate,
  coMemberAclTargets,
  emailMatches,
  type CampaignLike,
} from "./delete-user-plan";

function camp(over: Partial<CampaignLike> = {}): CampaignLike {
  return {
    members: ["dm", "alice", "bob"],
    dmUid: "dm",
    memberDetails: {
      dm: { role: "dm", characterId: "dm-char" },
      alice: { role: "player", characterId: "alice-char" },
      bob: { role: "player", characterId: null },
    },
    ...over,
  };
}

describe("planCampaignUpdate — membership + DM-orphaning", () => {
  it("removes a plain member from members + memberDetails, DM unchanged", () => {
    const plan = planCampaignUpdate(camp(), "alice");
    expect(plan.kind).toBe("update");
    if (plan.kind !== "update") return;
    expect(plan.members).toEqual(["dm", "bob"]);
    expect(plan.memberDetails).not.toHaveProperty("alice");
    expect(plan.dmUid).toBe("dm");
    expect(plan.memberDetails.dm.role).toBe("dm");
  });

  it("PROMOTES the first remaining member when the DM is deleted (DM-orphaning)", () => {
    const plan = planCampaignUpdate(camp(), "dm");
    expect(plan.kind).toBe("update");
    if (plan.kind !== "update") return;
    expect(plan.members).toEqual(["alice", "bob"]);
    expect(plan.dmUid).toBe("alice");
    expect(plan.memberDetails.alice.role).toBe("dm"); // promoted
    expect(plan.memberDetails).not.toHaveProperty("dm");
  });

  it("DELETES the campaign when the leaver was the only member", () => {
    const solo = camp({
      members: ["dm"],
      memberDetails: { dm: { role: "dm", characterId: "dm-char" } },
    });
    expect(planCampaignUpdate(solo, "dm")).toEqual({ kind: "delete" });
  });

  it("is idempotent — removing a non-member yields a harmless no-op update", () => {
    const plan = planCampaignUpdate(camp(), "ghost");
    expect(plan.kind).toBe("update");
    if (plan.kind !== "update") return;
    expect(plan.members).toEqual(["dm", "alice", "bob"]);
    expect(plan.dmUid).toBe("dm");
  });
});

describe("coMemberAclTargets — cross-user ACL cleanup set", () => {
  it("lists every OTHER member's ATTACHED character (skips the leaver + unattached)", () => {
    const targets = coMemberAclTargets(camp(), "dm");
    // alice has a char; bob has none; dm is the leaver → excluded.
    expect(targets).toEqual([{ ownerUid: "alice", charId: "alice-char" }]);
  });

  it("excludes the leaver's own character", () => {
    const targets = coMemberAclTargets(camp(), "alice");
    expect(targets.find((t) => t.ownerUid === "alice")).toBeUndefined();
    expect(targets).toContainEqual({ ownerUid: "dm", charId: "dm-char" });
  });
});

describe("emailMatches — typed-confirm guard", () => {
  it("matches case/whitespace-insensitively", () => {
    expect(emailMatches("Foo@Bar.com", "  foo@bar.com ")).toBe(true);
  });
  it("rejects a mismatch", () => {
    expect(emailMatches("a@b.com", "c@d.com")).toBe(false);
  });
  it("rejects empty/missing on either side (never confirm a blank)", () => {
    expect(emailMatches("", "")).toBe(false);
    expect(emailMatches(undefined, "x@y.com")).toBe(false);
    expect(emailMatches("x@y.com", null)).toBe(false);
  });
});
