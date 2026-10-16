import { describe, expect, it } from "vitest";
import {
  roleClaimsFor,
  sameClaims,
  syncRoleClaims,
  withRoleClaims,
  type ClaimsAuth,
} from "./role-claims";

describe("roleClaimsFor — the user doc's role and status, as token claims", () => {
  it.each([
    [undefined, {}],
    [{}, {}],
    [{ status: "active" }, {}],
    [{ status: "active", role: "admin" }, { role: "admin" }],
    [{ status: "blocked" }, { status: "blocked" }],
    [
      { status: "blocked", role: "admin" },
      { role: "admin", status: "blocked" },
    ],
    // Only the exact values the rules check count; anything else is a normal player.
    [{ role: "Admin", status: "BLOCKED" }, {}],
    [{ role: true, status: 1 }, {}],
  ])("%j → %j", (doc, claims) => {
    expect(roleClaimsFor(doc)).toEqual(claims);
  });
});

describe("withRoleClaims — sets ours, keeps every other claim", () => {
  it("adds, replaces and removes only role and status", () => {
    expect(withRoleClaims({ beta: true, role: "admin" }, { status: "blocked" })).toEqual({
      beta: true,
      status: "blocked",
    });
    expect(withRoleClaims(undefined, {})).toEqual({});
  });

  it("sameClaims ignores key order", () => {
    expect(sameClaims({ a: 1, role: "admin" }, { role: "admin", a: 1 })).toBe(true);
    expect(sameClaims({ role: "admin" }, {})).toBe(false);
  });
});

function fakeAuth(claims: Record<string, unknown> | undefined, exists = true) {
  const calls: string[] = [];
  const auth: ClaimsAuth = {
    getUser: (uid) => {
      calls.push(`get ${uid}`);
      if (!exists) {
        return Promise.reject(
          Object.assign(new Error("no user"), { code: "auth/user-not-found" })
        );
      }
      return Promise.resolve(claims ? { customClaims: claims } : {});
    },
    setCustomUserClaims: (uid, next) => {
      calls.push(`set ${uid} ${JSON.stringify(next)}`);
      return Promise.resolve();
    },
    revokeRefreshTokens: (uid) => {
      calls.push(`revoke ${uid}`);
      return Promise.resolve();
    },
  };
  return { auth, calls };
}

describe("syncRoleClaims — the users/{uid} trigger", () => {
  it("skips a write that changes neither role nor status (the sign-in telemetry bump)", async () => {
    const { auth, calls } = fakeAuth({});
    const result = await syncRoleClaims(
      auth,
      "u1",
      { status: "active", lastActiveAt: 1 },
      { status: "active", lastActiveAt: 2 }
    );
    expect(result).toBe("unchanged");
    expect(calls).toEqual([]);
  });

  it("grants the admin claim, keeping other claims", async () => {
    const { auth, calls } = fakeAuth({ beta: true });
    expect(
      await syncRoleClaims(
        auth,
        "u1",
        { status: "active" },
        { status: "active", role: "admin" }
      )
    ).toBe("updated");
    expect(calls).toEqual(["get u1", 'set u1 {"beta":true,"role":"admin"}']);
  });

  it("blocking also revokes the refresh tokens", async () => {
    const { auth, calls } = fakeAuth({});
    await syncRoleClaims(auth, "u1", { status: "active" }, { status: "blocked" });
    expect(calls).toEqual(["get u1", 'set u1 {"status":"blocked"}', "revoke u1"]);
  });

  it("unblocking clears the claim without revoking", async () => {
    const { auth, calls } = fakeAuth({ status: "blocked" });
    await syncRoleClaims(auth, "u1", { status: "blocked" }, { status: "active" });
    expect(calls).toEqual(["get u1", "set u1 {}"]);
  });

  it("a new doc without role or status writes nothing", async () => {
    const { auth, calls } = fakeAuth(undefined);
    expect(await syncRoleClaims(auth, "u1", undefined, { status: "active" })).toBe(
      "unchanged"
    );
    expect(calls).toEqual([]);
  });

  it("does nothing when the claims already match (a retried event)", async () => {
    const { auth, calls } = fakeAuth({ role: "admin" });
    expect(await syncRoleClaims(auth, "u1", {}, { role: "admin" })).toBe("unchanged");
    expect(calls).toEqual(["get u1"]);
  });

  it("tolerates an account already gone from Auth (the deleteUser cascade)", async () => {
    const { auth, calls } = fakeAuth(undefined, false);
    expect(await syncRoleClaims(auth, "u1", { role: "admin" }, undefined)).toBe(
      "no-account"
    );
    expect(calls).toEqual(["get u1"]);
  });
});
