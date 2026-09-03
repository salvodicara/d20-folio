/**
 * The codec-loss audit (stage 0 of the stage-1 program): every stored document family
 * is run through its real reader and writer, and the verdict names what a round-trip
 * would lose. The detector is proven NON-vacuous by the codec's documented one-way
 * seam (`state.round`, dropped on re-export), never by a synthetic drop.
 */
import { describe, expect, it } from "vitest";
import {
  auditDocument,
  auditPortableExport,
  classifyPath,
  diffPaths,
} from "../../scripts/lib/codec-loss-audit";
import { MOCK_CHARACTER } from "@/lib/mock";
import { serializeCharacter, serializeCharacterEnvelope } from "@/lib/character-codec";
import { customInstanceId } from "./__helpers__/custom-items";

type Env = {
  schema: number;
  build: Record<string, unknown>;
  state: Record<string, unknown>;
};
const envelope = (): Env => structuredClone(serializeCharacterEnvelope(MOCK_CHARACTER));
/** A stored parent: the envelope plus the metadata the codec does not own. */
const parentDoc = (env: Env): Record<string, unknown> => ({
  ...env,
  revision: 3,
  cache: { name: "cached" },
  updatedAt: "meta",
});

describe("classifyPath", () => {
  it("maps the four stored families and nothing else", () => {
    expect(classifyPath("users/u/characters/c")).toBe("parent");
    expect(classifyPath("users/u/characters/c/snapshots/s")).toBe("snapshot");
    expect(classifyPath("users/u/characters/c/combat/state")).toBe("combat-state");
    expect(classifyPath("users/u/library/index")).toBe("library");
    expect(classifyPath("users/u/characters/c/public/sheet")).toBeUndefined();
  });
});

describe("diffPaths", () => {
  it("names every path present in before and missing or different in after", () => {
    expect(
      diffPaths({ a: 1, b: { c: [1, 2], d: "x" }, e: null }, { a: 1, b: { c: [1] } })
    ).toEqual(["b.c[1]", "b.d", "e"]);
    expect(diffPaths({ a: 1 }, { a: 1, z: 2 })).toEqual([]);
  });
});

describe("auditDocument — parent and snapshot envelopes", () => {
  it("a canonical parent with unknown keys at every level is equal (zero loss)", () => {
    const env = envelope();
    env.build.zz_future = { deep: [true] };
    env.state.zz_state = 1;
    const [firstItem] = env.build.equipment as Record<string, unknown>[];
    if (!firstItem) throw new Error("the mock character carries equipment");
    firstItem.zz_entry = "kept";
    expect(auditDocument("parent", parentDoc(env))).toEqual({ verdict: "equal" });
    expect(auditDocument("snapshot", { ...env, reason: "level-up" })).toEqual({
      verdict: "equal",
    });
  });

  it("a one-way normalization is reported as loss with the exact path", () => {
    const env = envelope();
    env.state.round = 5; // the documented one-way boundary (dropped on re-export)
    expect(auditDocument("parent", parentDoc(env))).toEqual({
      verdict: "loss",
      lost: ["state.round"],
      added: [],
    });
  });

  it("a hostile entry quarantines with the typed code and path", () => {
    const env = envelope();
    (env.build.equipment as unknown[]).push({
      instanceId: customInstanceId("bad"),
      name: 42,
    });
    const verdict = auditDocument("parent", parentDoc(env));
    expect(verdict.verdict).toBe("quarantine");
    if (verdict.verdict !== "quarantine") return;
    expect(verdict.code).toBe("malformed-entry");
    expect(verdict.path).toMatch(/^build\.equipment\[\d+\]/);
  });

  it("a parent without build or state is a quarantine, never a crash", () => {
    expect(auditDocument("parent", { schema: 3 }).verdict).toBe("quarantine");
  });
});

describe("auditDocument — combat state", () => {
  const stored = {
    hp: { current: 10, temp: 0 },
    conditions: [],
    initiativeRoll: null,
    deathSaves: { successes: 0, failures: 0 },
    round: 1,
    recentActions: [],
    bardicInspirationDie: "",
    playState: { version: 1, state: {} },
    updatedAt: "server",
  };
  it("a v1 child with only known keys is equal", () => {
    expect(auditDocument("combat-state", stored)).toEqual({ verdict: "equal" });
  });
  it("a key the reader ignores is a loss", () => {
    expect(auditDocument("combat-state", { ...stored, effectOps: [] })).toEqual({
      verdict: "loss",
      lost: ["effectOps"],
      added: [],
    });
  });
  it("a refused child is a quarantine with the reader's reason", () => {
    expect(auditDocument("combat-state", { hp: {} })).toEqual({
      verdict: "quarantine",
      code: "invalid-combat-state",
    });
  });
});

describe("auditDocument — library", () => {
  const entry = {
    id: customInstanceId("blade"),
    savedAt: 1,
    kind: "weapon",
    item: { instanceId: customInstanceId("blade"), name: "Blade", zz: true },
  };
  it("a stored library round-trips equal, unknown item keys included", () => {
    expect(auditDocument("library", { entries: [entry] })).toEqual({ verdict: "equal" });
    expect(auditDocument("library", {})).toEqual({ verdict: "equal" });
  });
  it("an entry-level key the parser drops is a loss", () => {
    expect(auditDocument("library", { entries: [{ ...entry, zz: 1 }] })).toEqual({
      verdict: "loss",
      lost: ["entries[0].zz"],
      added: [],
    });
  });
  it("a malformed entry quarantines with its path", () => {
    expect(auditDocument("library", { entries: [{ id: "x" }] })).toMatchObject({
      verdict: "quarantine",
      path: expect.stringMatching(/^entries\[0\]/) as string,
    });
  });
});

describe("auditPortableExport", () => {
  it("the canonical export is byte-identical; a reordered one is equal", () => {
    const canonical = serializeCharacter(MOCK_CHARACTER);
    expect(auditPortableExport(canonical)).toEqual({ verdict: "byte-identical" });
    const parsed = JSON.parse(canonical) as Env;
    expect(
      auditPortableExport(
        JSON.stringify({
          state: parsed.state,
          schema: parsed.schema,
          build: parsed.build,
        })
      )
    ).toEqual({ verdict: "equal" });
  });
  it("invalid JSON and a pre-v3 file are quarantines", () => {
    expect(auditPortableExport("{").verdict).toBe("quarantine");
    expect(
      auditPortableExport(JSON.stringify({ schema: 2, build: {}, state: {} }))
    ).toEqual({ verdict: "quarantine", code: "schema-2-unsupported" });
  });
});
