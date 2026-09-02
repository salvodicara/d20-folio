import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  planParentCutover,
  planParentCutoverSources,
  reportForParentCutover,
  verifyParentCutoverCorpus,
  type CharacterFamily,
  type ParentCutoverPlan,
} from "../../scripts/migrate-character-parents";

/** Index/find helpers: the suite asserts on entries it has just planned, and the
 *  repo forbids the non-null assertion that would otherwise carry that knowledge. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Expected ${what}`);
  return value;
}

function at<T>(list: readonly T[], index: number): T {
  return must(list[index], `index ${index}`);
}

const uid = "u1";
const charId = "c1";
const parentPath = `users/${uid}/characters/${charId}`;
const childPath = `${parentPath}/combat/state`;
/** One fixed stamp, so two plans of the same corpus stay comparable. */
const STAMP = new Timestamp(1_760_000_000, 0);

function legacyParent(
  state: Record<string, unknown>,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schema: 3,
    build: { name: "Bo", classes: [{ classId: "monk", level: 3 }] },
    state,
    cache: { name: "Bo", hpMax: 24, ac: 15 },
    status: "active",
    shared: false,
    updatedAt: 17,
    ...extra,
  };
}

function family(
  parentData: Record<string, unknown>,
  childData?: Record<string, unknown>
): CharacterFamily {
  return {
    uid,
    charId,
    parent: { path: parentPath, data: parentData },
    ...(childData ? { child: { path: childPath, data: childData } } : {}),
  };
}

function writeAt(
  plan: ParentCutoverPlan,
  path: string
): { kind: string; path: string; data: Record<string, unknown> } {
  return must(
    plan.writes.find((write) => write.path === path),
    `a planned write for ${path === parentPath ? "the parent" : "the child"}`
  );
}

describe("legacy parent cutover", () => {
  it("moves the noncombat session into combat/state.playState, empties the parent state, marks v1 and stamps revision 0", () => {
    const plan = planParentCutover(
      [
        family(
          legacyParent({
            trackers: { "monk-focus": 1 },
            usedSlots: { "1": 2 },
            notes: "n",
          }),
          {
            hp: { current: 9, temp: 0 },
            conditions: ["prone"],
            initiativeRoll: 12,
            deathSaves: { successes: 0, failures: 1 },
            round: 3,
            recentActions: [],
            bardicInspirationDie: "",
          }
        ),
      ],
      STAMP
    );
    expect(plan.issues).toEqual([]);
    const parent = writeAt(plan, parentPath);
    expect(parent).toMatchObject({
      kind: "update",
      data: { playStateVersion: 1, state: {}, revision: 0 },
    });
    // The parent write never touches `updatedAt` — the public share projection
    // compares its `sourceUpdatedAt` against exactly that field.
    expect(parent.data).not.toHaveProperty("updatedAt");
    const child = writeAt(plan, childPath);
    expect(child.kind).toBe("update");
    expect(child.data.playState).toEqual({
      version: 1,
      state: { trackers: { "monk-focus": 1 }, usedSlots: { "1": 2 }, notes: "n" },
    });
    // The trio stays exactly as stored: the child write owns `playState` + `updatedAt`.
    expect(child.data).not.toHaveProperty("hp");
    expect(child.data.updatedAt).toBe(STAMP);
    expect(plan.counts).toEqual({
      parents: 1,
      legacy: 1,
      marked: 0,
      childrenCreated: 0,
      childrenUpdated: 1,
      revisionStamped: 1,
    });
  });

  it("creates the child with full HP when a legacy parent has none", () => {
    const plan = planParentCutover([family(legacyParent({ exhaustion: 1 }))], STAMP);
    expect(plan.issues).toEqual([]);
    const child = writeAt(plan, childPath);
    expect(child.kind).toBe("create");
    expect(child.data).toMatchObject({
      hp: { current: 24, temp: 0 },
      conditions: [],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
      round: 1,
      playState: { version: 1, state: { exhaustion: 1 } },
      updatedAt: STAMP,
    });
    expect(plan.counts.childrenCreated).toBe(1);
  });

  it("a marked parent only gains revision when missing; a marked parent without a child is an issue", () => {
    const marked = legacyParent({}, { playStateVersion: 1 });
    const migratedChild = {
      hp: { current: 1, temp: 0 },
      conditions: [],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
      playState: { version: 1, state: {} },
    };
    const okPlan = planParentCutover([family(marked, migratedChild)], STAMP);
    expect(okPlan.writes).toEqual([
      { kind: "update", path: parentPath, data: { revision: 0 } },
    ]);
    expect(okPlan.counts).toMatchObject({ marked: 1, legacy: 0, revisionStamped: 1 });

    const done = planParentCutover(
      [
        {
          uid,
          charId,
          parent: { path: parentPath, data: { ...marked, revision: 4 } },
          child: must(at(okPlan.families, 0).child, "the planned child"),
        },
      ],
      STAMP
    );
    expect(done.writes).toEqual([]);
    expect(done.issues).toEqual([]);

    const bad = planParentCutover([family(marked)], STAMP);
    expect(bad.issues.map((issue) => issue.code)).toEqual([
      "marked-parent-missing-child",
    ]);
    expect(bad.writes).toEqual([]);
  });

  it("is idempotent: planning the projected corpus yields no writes", () => {
    const first = planParentCutover([family(legacyParent({ notes: "n" }))], STAMP);
    expect(first.issues).toEqual([]);
    const second = planParentCutover(first.projectedFamilies, STAMP);
    expect(second.writes).toEqual([]);
    expect(second.issues).toEqual([]);
    expect(
      verifyParentCutoverCorpus(
        second.documents.map((document) => ({
          path: document.path,
          data: document.after,
        }))
      )
    ).toEqual([]);
  });

  it("refuses a legacy parent without cache.hpMax and never invents HP", () => {
    const plan = planParentCutover(
      [family(legacyParent({}, { cache: { name: "Bo" } }))],
      STAMP
    );
    expect(plan.issues.map((issue) => issue.code)).toEqual(["missing-cache-hpmax"]);
    expect(plan.writes).toEqual([]);
  });
});

describe("parent cutover discovery, refusals and reporting", () => {
  it("groups a discovered parent with its combat child and refuses anything else", () => {
    const plan = planParentCutoverSources(
      [
        { path: parentPath, data: legacyParent({ notes: "n" }) },
        {
          path: childPath,
          data: {
            hp: { current: 4, temp: 0 },
            conditions: [],
            initiativeRoll: null,
            deathSaves: { successes: 0, failures: 0 },
          },
        },
        { path: "users/u1/library/index", data: { entries: [] } },
        { path: parentPath, data: legacyParent({}) },
      ],
      STAMP
    );
    expect(plan.issues.map((issue) => issue.code).sort()).toEqual([
      "duplicate-document",
      "unexpected-path",
    ]);
    // A repeated parent path quarantines its whole family; nothing is written.
    expect(plan.writes).toEqual([]);
  });

  it("groups one clean family from two discovered documents", () => {
    const plan = planParentCutoverSources(
      [
        {
          path: childPath,
          data: {
            hp: { current: 4, temp: 0 },
            conditions: [],
            initiativeRoll: null,
            deathSaves: { successes: 0, failures: 0 },
          },
        },
        { path: parentPath, data: legacyParent({ notes: "n" }) },
      ],
      STAMP
    );
    expect(plan.issues).toEqual([]);
    expect(plan.writes.map((write) => write.kind)).toEqual(["update", "update"]);
    expect(plan.counts.childrenUpdated).toBe(1);
  });

  it("refuses a malformed envelope, a bad marker, a malformed child and a marked child without a play state", () => {
    const codes = (families: CharacterFamily[]): string[] =>
      planParentCutover(families, STAMP).issues.map((issue) => issue.code);
    expect(codes([family({ ...legacyParent({}), build: "nope" })])).toEqual([
      "invalid-envelope",
    ]);
    expect(codes([family(legacyParent({}, { playStateVersion: 2 }))])).toEqual([
      "invalid-envelope",
    ]);
    expect(
      codes([family(legacyParent({}), { hp: { current: "x" }, deathSaves: {} })])
    ).toEqual(["invalid-child"]);
    expect(
      codes([
        family(legacyParent({}, { playStateVersion: 1 }), {
          hp: { current: 1, temp: 0 },
          conditions: [],
          initiativeRoll: null,
          deathSaves: { successes: 0, failures: 0 },
        }),
      ])
    ).toEqual(["invalid-play-state"]);
  });

  it("reports a combat child discovered without its parent", () => {
    const plan = planParentCutoverSources(
      [
        {
          path: childPath,
          data: {
            hp: { current: 4, temp: 0 },
            conditions: [],
            initiativeRoll: null,
            deathSaves: { successes: 0, failures: 0 },
          },
        },
      ],
      STAMP
    );
    expect(plan.issues.map((issue) => issue.code)).toEqual(["orphan-child"]);
    expect(plan.writes).toEqual([]);
  });

  it("carries a resolvable concentration ref but refuses one canonicalization would rewrite", () => {
    const kept = planParentCutover(
      [family(legacyParent({ concentration: "fireball" }))],
      STAMP
    );
    expect(kept.issues).toEqual([]);
    expect(writeAt(kept, childPath).data).toMatchObject({
      playState: { version: 1, state: { concentration: "fireball" } },
    });

    const rewritten = planParentCutover(
      [family(legacyParent({ concentration: "Palla di Fuoco" }))],
      STAMP
    );
    expect(rewritten.issues.map((issue) => issue.code)).toEqual([
      "unresolved-concentration",
    ]);
    expect(rewritten.writes).toEqual([]);
  });

  it("reports counts, path hashes and issue codes only — never a raw path or a payload", () => {
    const plan = planParentCutover([family(legacyParent({ notes: "n" }))], STAMP);
    const report = reportForParentCutover(plan);
    expect(report.format).toBe("d20-folio-parent-cutover-report-v1");
    expect(report.counts).toMatchObject({ parents: 1, legacy: 1, childrenCreated: 1 });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(parentPath);
    expect(serialized).not.toContain("playState");
    expect(at(report.writes, 0).path).toMatch(/^[0-9a-f]{16}$/);
  });

  it("verification fails while a legacy parent is still pending", () => {
    const codes = verifyParentCutoverCorpus([
      { path: parentPath, data: legacyParent({ notes: "n" }) },
    ]).map((issue) => issue.code);
    expect(new Set(codes)).toEqual(new Set(["verification-failed"]));
    expect(codes.length).toBeGreaterThan(0);
  });
});
