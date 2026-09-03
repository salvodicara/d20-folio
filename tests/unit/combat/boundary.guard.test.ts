/**
 * Boundary guards for the pure combat engine: no React, Firebase, Zustand, i18n, feature or
 * component imports; no clock; no RNG. Payment cannot be bypassed: every costed program that
 * applies reports what it paid.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { resolve } from "@/lib/combat/resolve";
import { initialState } from "@/lib/combat/fold";
import type { Action, FoldedState } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import { nextActionId, openingActions, seqFactory } from "./__helpers__/state";

const MODULE_DIR = resolvePath(process.cwd(), "src/lib/combat");
const FORBIDDEN = [
  /from\s+["']react/,
  /from\s+["']firebase/,
  /from\s+["']zustand/,
  /from\s+["']@\/i18n/,
  /from\s+["']@\/features/,
  /from\s+["']@\/components/,
  /from\s+["']@\/stores/,
  /\bDate\.now\b/,
  /\bnew Date\b/,
  /\bMath\.random\b/,
  /\bcrypto\.getRandomValues\b/,
  /\bcrypto\.randomUUID\b/,
];

describe("boundary — src/lib/combat is pure", () => {
  it("imports nothing from the UI, persistence, i18n, clock or RNG", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(MODULE_DIR)) {
      if (!file.endsWith(".ts")) continue;
      const text = readFileSync(resolvePath(MODULE_DIR, file), "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(text)) offenders.push(`${file}: ${pattern.source}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("payment — a costed program cannot apply without paying", () => {
  const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);
  const seq = seqFactory("p1");
  const hero = testEntity({
    id: "hero",
    kind: "pc",
    controllerUid: "p1",
    hp: 30,
    ac: 15,
    abilities: { DEX: 3 },
    mechanics: PROTOTYPE_MECHANICS.map((m) => m.id),
    resources: { "slot-1": { current: 9, max: 9, recharge: "long" } },
  });
  const foe = testEntity({
    id: "monster-1",
    kind: "monster",
    controllerUid: "dm",
    hp: 50,
    ac: 10,
  });

  function opened(): FoldedState {
    let state = initialState();
    for (const action of openingActions(
      "dm",
      seq,
      [hero, foe],
      { hero: 20, "monster-1": 1 },
      ["hero", "monster-1"]
    )) {
      const result = resolve(state, action, catalogue);
      if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
      state = result.state;
    }
    return {
      ...state,
      relations: [
        { kind: "visible", a: "hero", b: "monster-1", value: true },
        { kind: "adjacent", a: "hero", b: "monster-1" },
      ],
    };
  }

  it("every invocation program with a cost reports a non-empty `paid` when it applies", () => {
    const unpaid: string[] = [];
    for (const mechanic of PROTOTYPE_MECHANICS) {
      for (const program of mechanic.active ?? []) {
        if (
          program.trigger.kind !== "invocation" ||
          !program.cost ||
          program.cost.length === 0
        )
          continue;
        const action: Action = {
          kind: "intent",
          id: nextActionId("g"),
          seq: seq(),
          by: "p1",
          entity: "hero",
          mechanic: mechanic.id,
          program: program.id,
          targets: program.targets ? ["monster-1"] : [],
          answers: { roll: 15, damage: 3, "save:monster-1": 1 },
          payment: [{ kind: "slot", level: 1, pool: "standard" }],
          window: null,
          basedOn: 0,
        };
        const result = resolve(opened(), action, catalogue);
        if (result.kind === "applied" && result.receipt.paid.length === 0) {
          unpaid.push(`${mechanic.id}/${program.id}`);
        }
        if (result.kind === "rejected") {
          unpaid.push(
            `${mechanic.id}/${program.id}: ${JSON.stringify(result.rejection)}`
          );
        }
      }
    }
    expect(unpaid).toEqual([]);
  });
});
