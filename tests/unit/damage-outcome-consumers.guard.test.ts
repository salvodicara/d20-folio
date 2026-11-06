/// <reference types="node" />
/**
 * Every outcome the damage rule returns for SOMEONE ELSE has a consumer. A hit can
 * owe damage to another creature (Warding Bond's share, Armor of Agathys' cold); the
 * rule computes it, and an entry point must hand it on. Twice a refactor deleted the
 * consumer as "unreachable" and the rule kept computing a result nobody delivered
 * (633a9d669 took the Warding Bond share; rehearsal 2026-11-06 #4).
 *
 * The fields of `PcDamageTransitionResult` are read from source, so a new field must be
 * classified here: LOCAL (the hit's own sheet uses it) or OUTBOUND (owed to another
 * creature), and an outbound one names the files that deliver it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./__helpers__/static-import-graph";

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf8");

const LOCAL = new Set([
  "state",
  "resolvedDamage",
  "targetDamage",
  "crossedZero",
  "instantDeath",
  "events",
  "consumedEffectIds",
  "consumedStateKeys",
  "changed",
]);

/** Outbound fields and the files that hand them on (`transition.<field>`). */
const OUTBOUND: Record<string, string[]> = {
  transfers: ["src/stores/characterStore.ts", "src/lib/play/peer-damage.ts"],
  retaliations: [],
};

/** Outbound fields still waiting for a consumer (each an open, reported gap). */
const KNOWN_GAPS = new Set(["retaliations"]);

function resultFields(): string[] {
  const src = read("src/lib/combat-transition.ts");
  const body = src.match(
    /export interface PcDamageTransitionResult \{([\s\S]*?)\n\}/
  )?.[1];
  if (!body) throw new Error("PcDamageTransitionResult not found");
  return [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1] as string);
}

describe("the damage rule's outcomes for others are delivered", () => {
  const fields = resultFields();

  it("reads the result's fields from source", () => {
    expect(fields).toContain("transfers");
    expect(fields.length).toBeGreaterThan(5);
  });

  it("classifies every field as local or outbound", () => {
    const unclassified = fields.filter((f) => !LOCAL.has(f) && !(f in OUTBOUND));
    expect(unclassified, "classify the new field in this guard").toEqual([]);
  });

  for (const [field, consumers] of Object.entries(OUTBOUND)) {
    const check = KNOWN_GAPS.has(field) ? it.fails : it;
    check(`${field} is handed on by an entry point`, () => {
      expect(consumers.length).toBeGreaterThan(0);
      for (const file of consumers) {
        expect(read(file), `${file} reads transition.${field}`).toMatch(
          new RegExp(`transition\\.${field}\\b`)
        );
      }
    });
  }
});
