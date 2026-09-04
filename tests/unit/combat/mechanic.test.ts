import { describe, expect, it } from "vitest";
import {
  conformMechanic,
  type Mechanic,
  type Program,
  type Step,
} from "@/lib/combat/mechanic";

const castProgram: Program = {
  id: "cast",
  trigger: { kind: "invocation", economy: "bonus" },
  cost: [{ kind: "slot", level: 1, upcast: true }, { kind: "concentration" }],
  targets: {
    count: 1,
    eligibility: { relation: "visible", between: ["$self", "$target"], value: true },
  },
  inputs: [],
  steps: [
    {
      id: "mark",
      kind: "effect-start",
      effect: {
        kind: "mark",
        to: "$target",
        concentration: true,
        lifetime: {
          kind: "seconds",
          remaining: { byLevel: { 1: 3600, 3: 28800, 5: 86400 } },
        },
        riders: [{ dice: "1d6", type: "force", on: "weapon-hit", vs: { mark: "self" } }],
        advantage: false,
      },
    },
  ],
};

const huntersMark: Mechanic = {
  schema: 1,
  id: "srd:spell:hunters-mark",
  source: "srd",
  active: [castProgram],
};

/** A mechanic whose only program is `castProgram` with the given patch applied. */
function withCast(patch: Partial<Program>): unknown {
  return { ...huntersMark, active: [{ ...castProgram, ...patch }] };
}

describe("conformMechanic — the authoring contract", () => {
  it("accepts a well-formed data-only mechanic", () => {
    const result = conformMechanic(huntersMark);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mechanic.id).toBe("srd:spell:hunters-mark");
  });

  it("accepts a `dash` step and still rejects an unknown step kind", () => {
    expect(conformMechanic(withCast({ steps: [{ id: "dash", kind: "dash" }] })).ok).toBe(
      true
    );
    expect(
      conformMechanic(
        withCast({ steps: [{ id: "x", kind: "teleport" } as unknown as Step] })
      )
    ).toEqual({ ok: false, rule: "unknown-step-kind", path: "active[0].steps[0].kind" });
  });

  it("rejects a `when` that references an input the program never asks, with a path", () => {
    const mark = castProgram.steps[0] as Step;
    const broken = { ...mark, when: { answer: "roll", equals: 20 } } as Step;
    const result = conformMechanic(withCast({ steps: [broken] }));
    expect(result).toEqual({
      ok: false,
      rule: "input-referenced-by-when",
      path: "active[0].steps[0].when",
    });
  });

  it("rejects an unknown top-level key with its path", () => {
    const result = conformMechanic({ ...huntersMark, bogus: 1 });
    expect(result).toEqual({ ok: false, rule: "unknown-key", path: "bogus" });
  });

  it("rejects a reaction-costed program on an invocation trigger that is not a reaction", () => {
    const result = conformMechanic(
      withCast({ cost: [{ kind: "turn", claim: "reaction" }] })
    );
    expect(result).toEqual({
      ok: false,
      rule: "cost-claim-matches-trigger",
      path: "active[0].cost[0]",
    });
  });

  it("rejects a once-per-turn claim without a key", () => {
    const result = conformMechanic(
      withCast({
        steps: [
          ...castProgram.steps,
          { id: "gate", kind: "turn-claim", claim: "once", key: "" },
        ],
      })
    );
    expect(result).toEqual({
      ok: false,
      rule: "once-per-turn-needs-key",
      path: "active[0].steps[1]",
    });
  });

  it("accepts a move step whose `to` names a declared position input", () => {
    const result = conformMechanic({
      schema: 1,
      id: "core:move",
      source: "srd",
      active: [
        {
          id: "move",
          trigger: { kind: "invocation", economy: "free" },
          inputs: [{ id: "to", kind: "position" }],
          steps: [{ id: "step", kind: "move", to: "to" }],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a move step whose `to` names an input the program never declares", () => {
    const result = conformMechanic({
      schema: 1,
      id: "core:move",
      source: "srd",
      active: [
        {
          id: "move",
          trigger: { kind: "invocation", economy: "free" },
          inputs: [],
          steps: [{ id: "step", kind: "move", to: "to" }],
        },
      ],
    });
    expect(result).toEqual({
      ok: false,
      rule: "move-input-declared",
      path: "active[0].steps[0].to",
    });
  });
});

describe("conformMechanic — area targeting", () => {
  const base = {
    schema: 1 as const,
    id: "test:area",
    source: "homebrew" as const,
  };

  it("accepts count: 'area' with an area shape", () => {
    const result = conformMechanic({
      ...base,
      active: [
        {
          id: "cast",
          trigger: { kind: "invocation", economy: "action" },
          targets: {
            count: "area",
            eligibility: { all: [] },
            area: { kind: "sphere", origin: "origin", radiusFt: 20 },
          },
          inputs: [{ id: "origin", kind: "position" }],
          steps: [],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects count: 'area' without an area shape", () => {
    const result = conformMechanic({
      ...base,
      active: [
        {
          id: "cast",
          trigger: { kind: "invocation", economy: "action" },
          targets: { count: "area", eligibility: { all: [] } },
          inputs: [],
          steps: [],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rule).toBe("area-required-by-count");
  });

  it("rejects a numeric count carrying a stray area shape", () => {
    const result = conformMechanic({
      ...base,
      active: [
        {
          id: "cast",
          trigger: { kind: "invocation", economy: "action" },
          targets: {
            count: 1,
            eligibility: { all: [] },
            area: { kind: "sphere", origin: "origin", radiusFt: 20 },
          },
          inputs: [],
          steps: [],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rule).toBe("area-requires-area-count");
  });

  it("rejects an area shape whose origin names an input the program never declares", () => {
    const result = conformMechanic({
      ...base,
      active: [
        {
          id: "cast",
          trigger: { kind: "invocation", economy: "action" },
          targets: {
            count: "area",
            eligibility: { all: [] },
            area: { kind: "sphere", origin: "origin", radiusFt: 20 },
          },
          inputs: [],
          steps: [],
        },
      ],
    });
    expect(result).toEqual({
      ok: false,
      rule: "area-input-declared",
      path: "active[0].targets.area",
    });
  });
});
