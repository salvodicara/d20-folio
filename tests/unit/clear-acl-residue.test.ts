/** The ACL-residue clean-up planner (scripts/clear-acl-residue.ts): pure, no Firebase. */
import { describe, expect, it } from "vitest";
import {
  planAclResidue,
  reportForAclResidue,
  verifyAclResidueCorpus,
  writesForAclResidue,
} from "../../scripts/clear-acl-residue";

const CHAR = (n: number) => `users/u${n}/characters/c${n}`;
const sources = [
  { path: CHAR(1), data: { name: "A", dmReaders: ["dm"], campaignReaders: ["p"] } },
  { path: CHAR(2), data: { name: "B", dmReaders: ["dm"] } },
  { path: CHAR(3), data: { name: "C" } },
];

describe("clear-acl-residue", () => {
  it("plans to drop only the two dead fields, counting each", () => {
    const plan = planAclResidue(sources);
    expect(plan.counts).toEqual({
      characters: 3,
      withResidue: 2,
      withDmReaders: 2,
      withCampaignReaders: 1,
    });
    expect(plan.changedDocuments.map((d) => d.path)).toEqual([CHAR(1), CHAR(2)]);
    expect(plan.changedDocuments[0]?.after).toEqual({ name: "A" });
    expect(plan.issues).toEqual([]);
  });

  it("writes a delete for exactly the fields a character has", () => {
    const [first, second] = planAclResidue(sources).changedDocuments;
    if (!first || !second) throw new Error("expected two changes");
    expect(Object.keys(writesForAclResidue(first).data)).toEqual([
      "dmReaders",
      "campaignReaders",
    ]);
    expect(Object.keys(writesForAclResidue(second).data)).toEqual(["dmReaders"]);
  });

  it("is idempotent: a clean corpus plans nothing and verifies", () => {
    const clean = planAclResidue(sources).documents.map((d) => ({
      path: d.path,
      data: d.after,
    }));
    expect(planAclResidue(clean).changedDocuments).toEqual([]);
    expect(verifyAclResidueCorpus(clean)).toEqual([]);
    expect(verifyAclResidueCorpus(sources).map((i) => i.code)).toEqual([
      "residue-left",
      "residue-left",
    ]);
  });

  it("refuses anything that is not a character document", () => {
    const plan = planAclResidue([{ path: "campaigns/x", data: { dmReaders: [] } }]);
    expect(plan.issues.map((i) => i.code)).toEqual(["unexpected-path"]);
    expect(plan.changedDocuments).toEqual([]);
  });

  it("reports counts, hashes and field names, never a raw path or a value", () => {
    const report = JSON.stringify(reportForAclResidue(planAclResidue(sources)));
    expect(report).not.toContain("users/");
    expect(report).not.toContain('"dm"');
    expect(report).toContain('"toClear":2');
  });
});
