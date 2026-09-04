/**
 * Guard: the play sprite carries exactly the symbols the play surface renders.
 *
 * Both directions matter and for different reasons. A REFERENCED id that the sheet does not
 * carry renders an empty box in the middle of a fight — the kind of defect nobody notices until
 * a player asks what the blank square does. A CARRIED symbol nothing references is dead weight
 * in a chunk (owner, 2026-09-03: nothing ships without a reason), and the sprite is the one
 * asset on this screen big enough for that to matter.
 *
 * The sprite is built from the licensed sets outside the repository
 * (`~/.agents/state/d20-folio/design-2026-09/mockups/icons3/`, CC BY 3.0 + ISC — attribution on
 * the legal page). Adding a glyph means adding it there and here in the same motion.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SPRITE = join(ROOT, "src/assets/icons/play-sprite.svg");
const FEATURE = join(ROOT, "src/features/play");
const HARNESS = join(ROOT, "src/app/routes/play-dev.tsx");

/** Every `<symbol id="…">` the sheet defines. */
function spriteIds(): Set<string> {
  const markup = readFileSync(SPRITE, "utf8");
  return new Set(
    [...markup.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1] ?? "")
  );
}

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/**
 * Every symbol id the surface asks for. Ids reach the sprite ONLY as quoted string literals
 * (`<PlayIcon id="i-fire" />`, an entry in a table), so one pattern finds them all — and a
 * dynamically built id would be invisible to this guard, which is why the surface never builds
 * one: the tables in `tiles.ts` and `ToolRail.tsx` map to literals on purpose.
 */
function referencedIds(): Set<string> {
  const found = new Set<string>();
  for (const file of [...sources(FEATURE), HARNESS]) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/"((?:i|e)-[a-z0-9-]+)"/g)) {
      found.add(match[1] ?? "");
    }
  }
  return found;
}

describe("the play sprite", () => {
  it("carries every symbol the surface renders", () => {
    const sprite = spriteIds();
    const missing = [...referencedIds()].filter((id) => !sprite.has(id)).sort();
    expect(missing, "symbols the surface renders but the sprite does not carry").toEqual(
      []
    );
  });

  it("carries no symbol the surface never renders", () => {
    const referenced = referencedIds();
    const unused = [...spriteIds()].filter((id) => !referenced.has(id)).sort();
    expect(unused, "symbols in the sprite that nothing renders — dead weight").toEqual(
      []
    );
  });

  it("declares the two licence tiers the sets require", () => {
    const markup = readFileSync(SPRITE, "utf8");
    // Lucide's are stroked (`class="ln"`), game-icons' are filled; the sheet's own style block
    // is what makes one sprite serve both, and it must survive any rebuild.
    expect(markup).toContain("symbol.ln{fill:none;stroke:currentColor");
    expect(markup).toContain("symbol:not(.ln){fill:currentColor}");
  });
});
