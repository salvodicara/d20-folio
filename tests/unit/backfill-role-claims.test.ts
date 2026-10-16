/**
 * Phase 5, roles as Auth custom claims: the one-off backfill gives every EXISTING
 * account the claims its user doc grants (new writes are mirrored by the
 * `onUserRoleWritten` function). Pure planner; the apply runs in the emulator lane.
 */
import { describe, expect, it } from "vitest";

import {
  planRoleClaims,
  reportFor,
  roleClaimsFor as scriptRoleClaimsFor,
} from "../../scripts/backfill-role-claims";
import { roleClaimsFor as functionRoleClaimsFor } from "../../functions/src/role-claims";

const doc = (uid: string, data: Record<string, unknown>) => ({ uid, data });
const account = (uid: string, customClaims: Record<string, unknown> = {}) => ({
  uid,
  customClaims,
});

describe("backfill-role-claims planner", () => {
  it("plans the claims each doc grants, keeping unrelated claims", () => {
    const plan = planRoleClaims(
      [
        doc("admin", { status: "active", role: "admin" }),
        doc("blocked", { status: "blocked" }),
        doc("plain", { status: "active" }),
        doc("stale", { status: "active" }),
      ],
      [
        account("admin", { beta: true }),
        account("blocked"),
        account("plain"),
        account("stale", { role: "admin" }),
      ]
    );
    expect(plan.changes).toEqual([
      { uid: "admin", before: { beta: true }, after: { beta: true, role: "admin" } },
      { uid: "blocked", before: {}, after: { status: "blocked" } },
      { uid: "stale", before: { role: "admin" }, after: {} },
    ]);
    expect(plan.counts).toEqual({
      accounts: 4,
      userDocs: 4,
      admins: 1,
      blocked: 1,
      toChange: 3,
    });
    expect(plan.notices).toEqual([]);
  });

  it("is idempotent: accounts already carrying their claims plan nothing", () => {
    const plan = planRoleClaims(
      [doc("admin", { role: "admin" })],
      [account("admin", { role: "admin" })]
    );
    expect(plan.changes).toEqual([]);
  });

  it("an account without a doc loses stray role claims; a doc without an account is a notice", () => {
    const plan = planRoleClaims(
      [doc("ghost", { role: "admin" })],
      [account("nodoc", { role: "admin", beta: 1 })]
    );
    expect(plan.changes).toEqual([
      { uid: "nodoc", before: { role: "admin", beta: 1 }, after: { beta: 1 } },
    ]);
    expect(plan.notices.map((notice) => notice.code)).toEqual(["doc-without-account"]);
  });

  it("the report carries counts and hashes, never a uid", () => {
    const plan = planRoleClaims(
      [doc("secret-uid-1", { role: "admin" })],
      [account("secret-uid-1")]
    );
    const text = JSON.stringify(reportFor(plan));
    expect(text).not.toContain("secret-uid-1");
    expect(text).toContain('"toChange":1');
  });

  it("maps a doc exactly as the deployed function does", () => {
    for (const data of [
      undefined,
      {},
      { role: "admin" },
      { status: "blocked" },
      { role: "admin", status: "blocked" },
      { role: "Admin", status: "BLOCKED" },
      { role: 1, status: true },
    ]) {
      expect(scriptRoleClaimsFor(data)).toEqual(functionRoleClaimsFor(data));
    }
  });
});
