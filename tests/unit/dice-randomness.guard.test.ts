/**
 * Randomness for dice exists only in the dice seam (golden rule 32, ADR-0010). Every other
 * call to a random source in `src/` is an id or a non-dice seed, pinned here so a new one is
 * a deliberate decision, never an accident. It is a tripwire on call syntax, not an
 * adversarial gate: an aliased or bracket-accessed call would pass it (reviews catch those).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SRC = join(ROOT, "src");
const CALL = /\b(?:Math\.random|crypto\.getRandomValues|crypto\.randomUUID)\s*\(/;

/** Every production file that calls a random source, with the reason it may. */
const ALLOWED: Readonly<Record<string, string>> = {
  "src/lib/dice.ts": "the dice seam (ADR-0010)",
  "src/lib/quickbuild-random.ts": "character-generation seed, never a roll of the game",
  "src/features/campaigns/campaign-io.ts": "invite-code token",
  "src/lib/diagnostics-io.ts": "diagnostics report id and its fallback",
  "src/stores/characterStore.ts": "action and entity ids",
  "src/features/character/center/CombatResolver.tsx":
    "ids (old play surface, dies at stage 6)",
  "src/features/character/center/ItemResourceCommandProvider.tsx":
    "ids (old surface, dies at stage 6)",
  "src/features/character/molecules/ResourceConversions.tsx":
    "ids (old surface, dies at stage 6)",
  "src/features/character/molecules/use-hp-controls.ts":
    "ids (old surface, dies at stage 6)",
  "src/features/campaigns/SharedNotes.tsx": "note ids",
  "src/lib/sanitize-session.ts": "replacement ids",
  "src/lib/item-resources.ts": "item instance ids",
  "src/lib/library.ts": "monster instance ids",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("randomness — dice only through the seam", () => {
  it("pins every file that calls a random source", () => {
    const callers = walk(SRC)
      .filter((file) => CALL.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file))
      .sort();
    expect(
      callers,
      "a new random source in src/ is a decision: dice go through src/lib/dice.ts, ids are named here"
    ).toEqual(Object.keys(ALLOWED).sort());
  });
});
