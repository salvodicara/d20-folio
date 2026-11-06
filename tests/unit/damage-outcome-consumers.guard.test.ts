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

/** Outbound fields: the files that hand them on (`transition.<field>`), and the file
 *  that delivers them with the named function (it must call it, not only define it). */
const OUTBOUND: Record<
  string,
  { readers: string[]; delivery: { file: string; call: string } }
> = {
  transfers: {
    readers: ["src/stores/characterStore.ts", "src/lib/play/peer-damage.ts"],
    delivery: {
      file: "src/hooks/useCharacterSubscription.ts",
      call: "deliverDamageTransfers",
    },
  },
  retaliations: {
    readers: ["src/lib/play/peer-damage.ts"],
    delivery: {
      file: "src/features/campaigns/encounter-monster-actions.tsx",
      call: "landRetaliations",
    },
  },
};

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

  for (const [field, { readers, delivery }] of Object.entries(OUTBOUND)) {
    it(`${field} is handed on by an entry point and delivered`, () => {
      expect(readers.length).toBeGreaterThan(0);
      for (const file of readers) {
        expect(read(file), `${file} reads transition.${field}`).toMatch(
          new RegExp(`transition\\.${field}\\b`)
        );
      }
      expect(read(delivery.file), `${delivery.file} calls ${delivery.call}`).toMatch(
        new RegExp(`\\b${delivery.call}\\(`)
      );
    });
  }
});
