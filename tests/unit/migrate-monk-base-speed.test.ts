/**
 * The monk base-speed migration planner (scripts/migrate-monk-base-speed.ts): pure.
 * A stored base Speed that already counts Unarmored Movement (species base + the
 * Monk level's bonus, SRD 5.2.1 Monk Features table) goes back to the species base,
 * because the sheet now adds the bonus itself. Anything else is an issue, never a
 * guess.
 */
import { describe, expect, it } from "vitest";
import {
  planMonkBaseSpeed,
  reportForMonkBaseSpeed,
  verifyMonkBaseSpeedCorpus,
  writesForMonkBaseSpeed,
} from "../../scripts/migrate-monk-base-speed";

const CHAR = (n: number) => `users/u${n}/characters/c${n}`;
const doc = (n: number, race: string, classes: unknown[], speed: string) => ({
  path: CHAR(n),
  data: { schema: 3, build: { name: `C${n}`, race, classes, speed } },
});
const monk = (level: number) => ({ classId: "monk", level });

describe("migrate-monk-base-speed", () => {
  const sources = [
    doc(1, "human", [monk(3)], "40"), // 30 + 10: counted the bonus → 30
    doc(2, "human", [monk(6)], "45"), // 30 + 15 → 30
    doc(3, "human", [monk(3)], "30"), // already the species base: unchanged
    doc(4, "human", [{ classId: "fighter", level: 5 }], "40"), // no Monk: out of scope
    doc(5, "human", [monk(1)], "30"), // Monk 1: no bonus yet, unchanged
    doc(6, "human", [monk(3)], "35"), // neither pattern: an issue, untouched
  ];

  it("resets only a base that counted the bonus, and reports the rest", () => {
    const plan = planMonkBaseSpeed(sources);
    expect(plan.changedDocuments.map((d) => d.path)).toEqual([CHAR(1), CHAR(2)]);
    expect(plan.changedDocuments[0]?.after).toMatchObject({ build: { speed: "30" } });
    expect(plan.issues).toEqual([
      expect.objectContaining({ path: CHAR(6), code: "unexpected-speed" }),
    ]);
    expect(plan.counts).toEqual({ characters: 6, monks: 5, toReset: 2, alreadyBase: 2 });
  });

  it("writes the base speed field only", () => {
    const [first] = planMonkBaseSpeed(sources).changedDocuments;
    if (!first) throw new Error("expected a change");
    expect(writesForMonkBaseSpeed(first)).toEqual({
      kind: "update",
      data: { "build.speed": "30" },
    });
  });

  it("is idempotent: after the reset nothing is left but the issue", () => {
    const after = planMonkBaseSpeed(sources).documents.map((d) => ({
      path: d.path,
      data: d.after,
    }));
    expect(verifyMonkBaseSpeedCorpus(after).map((i) => i.code)).toEqual([
      "unexpected-speed",
    ]);
    expect(planMonkBaseSpeed(after).changedDocuments).toEqual([]);
  });

  it("an unknown species or an unreadable speed is an issue", () => {
    const plan = planMonkBaseSpeed([
      doc(7, "no-such-species", [monk(3)], "40"),
      doc(8, "human", [monk(3)], "fast"),
    ]);
    expect(plan.issues.map((i) => i.code)).toEqual([
      "unknown-species",
      "unreadable-speed",
    ]);
    expect(plan.changedDocuments).toEqual([]);
  });

  it("reports counts and hashes, never a path or a name", () => {
    const text = JSON.stringify(reportForMonkBaseSpeed(planMonkBaseSpeed(sources)));
    expect(text).not.toMatch(/users\/|C1|human/);
  });
});
