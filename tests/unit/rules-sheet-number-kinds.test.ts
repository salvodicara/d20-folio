/**
 * The passive sheet-number Grant kinds compile to Rules (ADR-0010, M1, #1431): an
 * Unarmed Strike's alternative damage type. Its reader takes the folded rules, not a
 * bespoke list.
 */
import { describe, expect, it } from "vitest";

import type { Grant } from "@/lib/grant-schema";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { compileGrant, ruleFlagIds } from "@/lib/rules";

const source = (id: string, grants: Grant[]): GrantSource => ({ id, grants });

describe("unarmed-strike-damage-type-option", () => {
  it("compiles to a flag per damage type, deduped in grant order", () => {
    expect(
      compileGrant({ type: "unarmed-strike-damage-type-option", toType: "force" })
    ).toEqual([{ op: "flag", target: "unarmed:damage-type:force" }]);
    const option = (toType: "force" | "piercing") =>
      source(toType, [{ type: "unarmed-strike-damage-type-option", toType }]);
    const values = evaluateGrants([
      option("piercing"),
      option("force"),
      option("piercing"),
    ]).values;
    expect(ruleFlagIds(values, "unarmed:damage-type:")).toEqual(["piercing", "force"]);
  });
});
