import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
import { effectiveMaxHp } from "@/lib/aggregate-character";
import { parseCombatState } from "@/lib/combat-state-codec";
import { MOCK_CHARACTER } from "@/lib/mock";
import {
  packCompositionRefusal,
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

/** A REAL envelope: the migration hydrates through `parseCharacterEnvelope` exactly
 *  as the client does, so a synthetic build would prove nothing. */
const MOCK_ENVELOPE = serializeCharacterEnvelope(MOCK_CHARACTER);
/** The full HP the migration must give a character with no stored combat child: the
 *  app's own `effectiveMaxHp` over the HYDRATED build+state pair, so an hp-flat grant
 *  that is active in the stored session counts exactly as it does in the app. */
function fullHpFor(state: Record<string, unknown>): number {
  const parsed = parseCharacterEnvelope(structuredClone(MOCK_ENVELOPE.build), state);
  if (!parsed.ok) throw new Error(`Expected a hydratable envelope: ${parsed.error}`);
  return effectiveMaxHp(parsed.character, parsed.session);
}

function legacyParent(
  state: Record<string, unknown>,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schema: 3,
    build: structuredClone(MOCK_ENVELOPE.build),
    state,
    cache: { name: "Bo", ac: 15 },
    status: "active",
    shared: false,
    updatedAt: 17,
    ...extra,
  };
}

function legacyChild(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hp: { current: 9, temp: 0 },
    conditions: ["prone"],
    initiativeRoll: 12,
    deathSaves: { successes: 0, failures: 1 },
    round: 3,
    recentActions: [],
    bardicInspirationDie: "",
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

function projectedChild(plan: ParentCutoverPlan): Record<string, unknown> {
  return must(
    plan.documents.find((document) => document.role === "child"),
    "a planned child document"
  ).after;
}

describe("legacy parent cutover", () => {
  it("moves the noncombat session into combat/state.playState, empties the parent state, marks v1 and stamps revision 0", () => {
    const plan = planParentCutover(
      [family(legacyParent({ usedSlots: { "1": 2 }, notes: "n" }), legacyChild())],
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
    expect(parent.data).not.toHaveProperty("build");
    const child = writeAt(plan, childPath);
    expect(child.kind).toBe("update");
    expect(child.data.playState).toMatchObject({
      version: 1,
      state: { usedSlots: { "1": 2 }, notes: "n" },
    });
    // The trio stays exactly as stored: the child write never mentions it.
    expect(child.data).not.toHaveProperty("hp");
    expect(child.data).not.toHaveProperty("conditions");
    expect(child.data.updatedAt).toBe(STAMP);
    expect(plan.counts).toEqual({
      parents: 1,
      legacy: 1,
      marked: 0,
      childrenCreated: 0,
      childrenUpdated: 1,
      revisionStamped: 1,
      logIdsStamped: 0,
    });
  });

  it("creates the child at the app's own effective max HP when a legacy parent has none", () => {
    const plan = planParentCutover([family(legacyParent({ exhaustion: 1 }))], STAMP);
    expect(plan.issues).toEqual([]);
    const child = writeAt(plan, childPath);
    expect(child.kind).toBe("create");
    const expected = fullHpFor({ exhaustion: 1 });
    expect(expected).toBeGreaterThan(0);
    expect(child.data).toMatchObject({
      hp: { current: expected, temp: 0 },
      conditions: [],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
      round: 1,
      playState: { version: 1, state: { exhaustion: 1 } },
      updatedAt: STAMP,
    });
    expect(plan.counts.childrenCreated).toBe(1);
  });

  it("proves every projected child against the strict v1 reader the app loads it with", () => {
    for (const planned of [
      planParentCutover([family(legacyParent({ notes: "n" }), legacyChild())], STAMP),
      planParentCutover([family(legacyParent({ notes: "n" }))], STAMP),
    ]) {
      expect(planned.issues).toEqual([]);
      // The STRICT reader accepts it only when it carries a valid v1 `playState`.
      expect(parseCombatState(projectedChild(planned)).ok).toBe(true);
    }
  });

  it("canonicalizes the peer collections the strict reader would reject, and drops the ones that empty out", () => {
    const plan = planParentCutover(
      [
        family(
          legacyParent({ notes: "n" }),
          legacyChild({
            // A malformed ring the lenient reader conforms to a shorter list.
            recentActions: [
              { id: "1", targetIds: ["t"], outcome: "hit", round: 2 },
              { nope: true },
            ],
            // Junk that conforms to nothing at all → the field must go away.
            activeEffects: [{ garbage: true }],
          })
        ),
      ],
      STAMP
    );
    expect(plan.issues).toEqual([]);
    const child = writeAt(plan, childPath);
    expect(child.data.recentActions).toEqual([
      { id: "1", targetIds: ["t"], outcome: "hit", round: 2 },
    ]);
    // The client's next overwrite sheds an empty collection; so does the migration.
    expect(child.data.activeEffects).toBeDefined();
    expect(projectedChild(plan)).not.toHaveProperty("activeEffects");
    const parsed = parseCombatState(projectedChild(plan));
    expect(parsed.ok).toBe(true);
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

  it("refuses a marked parent whose state still carries a play session — and writes nothing", () => {
    // The deployed client's read gate (`parseStoredCharacter`) throws
    // `parent-state-not-empty` on exactly this document, so `--check` must not call a
    // corpus containing it migrated just because the marker is there.
    const plan = planParentCutover(
      [
        family(legacyParent({ notes: "n" }, { playStateVersion: 1, revision: 2 }), {
          hp: { current: 1, temp: 0 },
          conditions: [],
          initiativeRoll: null,
          deathSaves: { successes: 0, failures: 0 },
          playState: { version: 1, state: {} },
        }),
      ],
      STAMP
    );
    expect(plan.issues.map((issue) => issue.code)).toEqual([
      "marked-parent-state-not-empty",
    ]);
    expect(plan.writes).toEqual([]);
    expect(plan.counts.marked).toBe(0);
  });

  it("refuses a marked parent whose build the codec will not hydrate — proof only, no writes", () => {
    const plan = planParentCutover(
      [
        family(
          legacyParent(
            {},
            { playStateVersion: 1, revision: 2, build: { classes: "nope" } }
          ),
          {
            hp: { current: 1, temp: 0 },
            conditions: [],
            initiativeRoll: null,
            deathSaves: { successes: 0, failures: 0 },
            playState: { version: 1, state: {} },
          }
        ),
      ],
      STAMP
    );
    const issue = at(plan.issues, 0);
    expect(issue.code).toBe("invalid-envelope");
    // CODE only: the codec's `<code>:<path>` can embed a stored map key.
    expect(issue.detail).toMatch(/^Character codec refusal: [a-z-]+$/);
    expect(issue.detail).not.toContain("classes");
    expect(plan.writes).toEqual([]);
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

  it("is deterministic: a stored log row without an id gets the same id on every run", () => {
    const withLog = (): CharacterFamily =>
      family(
        legacyParent({
          notes: "n",
          log: [
            { event: { kind: "legacy", text: "a" }, ts: 1 },
            { event: { kind: "legacy", text: "b" }, ts: 2, id: "keep-me" },
          ],
        })
      );
    const first = planParentCutover([withLog()], STAMP);
    const second = planParentCutover([withLog()], STAMP);
    expect(first.issues).toEqual([]);
    expect(first.counts.logIdsStamped).toBe(1);
    expect(second.changedDocuments.map((d) => d.afterHash)).toEqual(
      first.changedDocuments.map((d) => d.afterHash)
    );
    const log = (
      (projectedChild(first).playState as { state: { log?: { id: string }[] } }).state
        .log ?? []
    ).map((row) => row.id);
    expect(log).toHaveLength(2);
    expect(at(log, 0)).toMatch(/^lg-[0-9a-f]{32}$/);
    expect(at(log, 1)).toBe("keep-me");
  });

  it("carries a resolvable concentration ref but refuses one canonicalization would rewrite", () => {
    const kept = planParentCutover(
      [family(legacyParent({ concentration: "fireball" }))],
      STAMP
    );
    expect(kept.issues).toEqual([]);
    expect(writeAt(kept, childPath).data.playState).toMatchObject({
      state: { concentration: "fireball" },
    });

    // A legacy bare NAME is not a spell id in ANY composition: persisting the
    // in-memory `custom:` net would silently rewrite the spell a player is holding.
    const rewritten = planParentCutover(
      [family(legacyParent({ concentration: "Palla di Fuoco" }))],
      STAMP
    );
    expect(rewritten.issues.map((issue) => issue.code)).toEqual([
      "unresolved-concentration",
    ]);
    expect(rewritten.writes).toEqual([]);
  });

  it("names the codec refusal by CODE only — a codec path can embed a stored map key", () => {
    const plan = planParentCutover(
      [family(legacyParent({}, { build: { classes: "nope" } }))],
      STAMP
    );
    const issue = at(plan.issues, 0);
    expect(issue.code).toBe("invalid-envelope");
    // The codec's own message is `<code>:<path>`; only the stable code survives.
    expect(issue.detail).toMatch(/^Character codec refusal: [a-z-]+$/);
    expect(issue.detail).not.toContain("classes");
  });

  it("refuses an envelope the character codec will not hydrate, and never invents HP", () => {
    const plan = planParentCutover(
      [family(legacyParent({}, { build: { classes: "nope" } }))],
      STAMP
    );
    expect(plan.issues.map((issue) => issue.code)).toEqual(["invalid-envelope"]);
    expect(plan.writes).toEqual([]);
  });
});

describe("composition proof", () => {
  it("refuses to plan unless the content pack both should and did compose", () => {
    const message =
      "Refusing: content pack not composed — the plan would rewrite pack-only references";
    // The migration hydrates through the SRD-AWARE codec: an SRD-only process would
    // see a pack-only spell id as unknown and rewrite a held concentration.
    expect(packCompositionRefusal(false, 12)).toBe(message);
    expect(packCompositionRefusal(true, 0)).toBe(message);
    expect(packCompositionRefusal(false, 0)).toBe(message);
    expect(packCompositionRefusal(true, 12)).toBeUndefined();
  });
});

describe("parent cutover discovery, refusals and reporting", () => {
  it("groups a discovered parent with its combat child and refuses anything else", () => {
    const plan = planParentCutoverSources(
      [
        { path: parentPath, data: legacyParent({ notes: "n" }) },
        { path: childPath, data: legacyChild() },
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
        { path: childPath, data: legacyChild() },
        { path: parentPath, data: legacyParent({ notes: "n" }) },
      ],
      STAMP
    );
    expect(plan.issues).toEqual([]);
    expect(plan.writes.map((write) => write.kind)).toEqual(["update", "update"]);
    expect(plan.counts.childrenUpdated).toBe(1);
  });

  it("reports a combat child discovered without its parent", () => {
    const plan = planParentCutoverSources(
      [{ path: childPath, data: legacyChild() }],
      STAMP
    );
    expect(plan.issues.map((issue) => issue.code)).toEqual(["orphan-child"]);
    expect(plan.writes).toEqual([]);
  });

  it("refuses a bad marker, a malformed child and a marked child without a play state", () => {
    const codes = (families: CharacterFamily[]): string[] =>
      planParentCutover(families, STAMP).issues.map((issue) => issue.code);
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

  it("reports the mode, counts, path hashes and issue codes only — never a raw path or a payload", () => {
    const plan = planParentCutover([family(legacyParent({ notes: "n" }))], STAMP);
    const report = reportForParentCutover(plan, "fixtures");
    expect(report.format).toBe("d20-folio-parent-cutover-report-v1");
    expect(report.mode).toBe("fixtures");
    expect(reportForParentCutover(plan).mode).toBe("firestore");
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
