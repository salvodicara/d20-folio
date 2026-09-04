/**
 * Canonical ordering of the two derived lists that reach persisted state.
 *
 * `subscribersFor` feeds `windows[].eligible` and `dueAt` feeds the order of `effect-ended`
 * events, and both used to follow record ENUMERATION order. Every client folding the same
 * document agreed, so convergence was never at risk — but compaction rewrites the document
 * through the codec, which sorts every record's keys canonically, so a pre-compaction and a
 * post-compaction fold agreed only UP TO those array orders. Sorting both outputs by id makes
 * "a compacted document folds to exactly the state the uncompacted one folds to" a literal
 * deep-equality property.
 */
import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { dueAt } from "@/lib/combat/effects";
import { subscribersFor } from "@/lib/combat/windows";
import type { Mechanic } from "@/lib/combat/mechanic";
import type { Effect, FoldedState } from "@/lib/combat/types";
import { emptyState } from "./__helpers__/state";
import { testEntity } from "./__helpers__/entities";

/** A reaction anyone may take to any declared attack — the prototype catalogue has no
 *  many-subscriber trigger, and one subscriber cannot show an ordering. */
const BYSTANDER: Mechanic = {
  schema: 1,
  id: "test:bystander",
  source: "homebrew",
  active: [
    {
      id: "gawk",
      trigger: {
        kind: "event",
        event: { kind: "attack-declared", target: "any" },
        scope: "self",
        window: true,
      },
      cost: [{ kind: "turn", claim: "reaction" }],
      inputs: [],
      steps: [
        {
          id: "brace",
          kind: "effect-start",
          effect: {
            kind: "standing",
            to: "$self",
            acBonus: 1,
            lifetime: { kind: "turn-edge", entity: "$self", edge: "start" },
          },
        },
      ],
    },
  ],
};

describe("subscribersFor — the eligible list is sorted, not enumeration-ordered", () => {
  it("returns the subscribers by id whatever order the entity record holds them in", () => {
    const { catalogue } = buildCatalogue([BYSTANDER]);
    const entities = ["zara", "mira", "bors"].map((id) =>
      testEntity({ id, mechanics: [BYSTANDER.id] })
    );
    const state: FoldedState = {
      ...emptyState(),
      // Inserted in REVERSE order on purpose: this is what compaction re-sorts.
      entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
    };
    expect(Object.keys(state.entities)).toEqual(["zara", "mira", "bors"]);
    expect(
      subscribersFor(state, catalogue, {
        kind: "attack-declared",
        attacker: "ogre",
        target: "hero",
        action: "a1",
      })
    ).toEqual(["bors", "mira", "zara"]);
  });
});

describe("dueAt — the due list is sorted, not enumeration-ordered", () => {
  it("returns the effect ids sorted whatever order the effect record holds them in", () => {
    const effect = (id: string): Effect => ({
      id,
      source: {
        entity: "hero",
        mechanic: "test:bystander",
        action: "a1",
        castLevel: null,
      },
      target: "hero",
      payload: { kind: "condition", condition: "poisoned" },
      lifetime: { kind: "rounds", remaining: 1 },
      concentration: false,
    });
    const state: FoldedState = {
      ...emptyState(),
      effects: {
        "e-zulu": effect("e-zulu"),
        "e-mike": effect("e-mike"),
        "e-alfa": effect("e-alfa"),
      },
    };
    expect(Object.keys(state.effects)).toEqual(["e-zulu", "e-mike", "e-alfa"]);
    expect(dueAt(state, () => true)).toEqual(["e-alfa", "e-mike", "e-zulu"]);
  });
});
