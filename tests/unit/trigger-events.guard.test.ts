/**
 * Every event the trigger grammar accepts has a runtime reader (edge-case family M8):
 * an authored trigger never sits in the data with nothing to fire it. An event joins
 * the grammar together with its reader, here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { classFeatures } from "@/data/classes";
import { SRD_FEATS as feats } from "@/data/feats";
import { spells } from "@/data/spells";
import type { Grant } from "@/lib/grants";

const ROOT = join(__dirname, "..", "..", "src");

/** Each event, the call that reads it, and the file it lives in. */
const READERS = {
  initiative: ['firedTriggerRestores(character, "initiative")', "lib/smart-tracker.ts"],
  "short-rest": ['firedTriggerRestores(character, "short-rest")', "lib/play/rests.ts"],
  "reduced-to-zero": [
    'firedTriggerOffers(doc, "reduced-to-zero"',
    "lib/play/mark-offers.ts",
  ],
  "cast-spell": ["firedCastTriggers(", "lib/play/on-cast.ts"],
} as const;

function triggersIn(grants: ReadonlyArray<Grant> | undefined): string[] {
  return (grants ?? []).flatMap((grant): string[] => {
    if (grant.type === "trigger") return [grant.on];
    if (grant.type === "while-active") return triggersIn(grant.grants);
    if (grant.type === "choice-grant-bundle")
      return grant.options.flatMap((option) => triggersIn(option.grants));
    return [];
  });
}

describe("trigger events", () => {
  it("each event in the grammar has its reader in the code", () => {
    for (const [, [call, file]] of Object.entries(READERS)) {
      expect(readFileSync(join(ROOT, file), "utf8"), `${file} reads ${call}`).toContain(
        call
      );
    }
  });

  it("every authored trigger names an event with a reader", () => {
    const authored = new Set([
      ...[...feats, ...classFeatures, ...spells, ...SRD_MAGIC_ITEMS].flatMap((entry) =>
        triggersIn(entry.grants)
      ),
    ]);
    for (const event of authored) expect(Object.keys(READERS)).toContain(event);
  });
});
