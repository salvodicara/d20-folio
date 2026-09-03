/// <reference types="node" />
/**
 * The admin-script module loader (`scripts/alias-loader.mjs` +
 * `scripts/alias-hooks.mjs`) must make the app's COMPOSED module graph loadable by a
 * plain `node` process, so a one-off migration reuses the real engine instead of
 * replicating it (golden rule 17).
 *
 * Two things only a real `node` child can prove, and neither is reachable from inside
 * Vitest (which resolves `import.meta.glob` itself):
 *
 *  - `import.meta.glob(...)` is expanded at load time, in all three option shapes this
 *    repository uses (lazy JSON namespace, lazy `?raw` string, eager `?url` string);
 *  - the `@pack` ↔ `@/i18n/srd-en` module cycle no longer dies in its temporal dead
 *    zone, so the play codec, the SRD aggregate and the character codec all import.
 *
 * Each case spawns `node --import ./scripts/alias-loader.mjs` and asserts on stdout.
 */
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { contentPackEnabled } from "../../scripts/content-pack-mode";
import { expandImportMetaGlob } from "../../scripts/alias-hooks.mjs";

const run = promisify(execFile);
/** The pack-composed cases assert a private corpus is present; the SRD-only lane
 *  legitimately has none, so they are skipped there rather than failing. */
const withPack = it.skipIf(!contentPackEnabled());
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = `${pathToFileURL(ROOT).href}/`;

/** Evaluate one expression under the real loader and return its stdout. */
async function underLoader(body: string, env: NodeJS.ProcessEnv = {}): Promise<string> {
  const { stdout } = await run(
    process.execPath,
    ["--import", "./scripts/alias-loader.mjs", "--input-type=module", "-e", body],
    { cwd: ROOT, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 }
  );
  return stdout.trim();
}

describe("admin-script module loader", () => {
  it("loads the composed play codec, SRD aggregate and character codec under plain node", async () => {
    const out = await underLoader(`
      const R = ${JSON.stringify(REPO)};
      const codec = await import(R + "src/lib/session-state-codec.ts");
      const aggregate = await import(R + "src/lib/aggregate-character.ts");
      const character = await import(R + "src/lib/character-codec.ts");
      const spells = await import(R + "src/data/spells.ts");
      console.log(JSON.stringify({
        stateToSession: typeof codec.stateToSession,
        effectiveMaxHp: typeof aggregate.effectiveMaxHp,
        parseCharacterEnvelope: typeof character.parseCharacterEnvelope,
        spells: spells.spellIndex.size,
      }));
    `);
    const result = JSON.parse(out) as Record<string, unknown>;
    expect(result).toMatchObject({
      stateToSession: "function",
      effectiveMaxHp: "function",
      parseCharacterEnvelope: "function",
    });
    expect(result.spells).toBeGreaterThan(0);
  }, 60_000);

  it("expands the lazy JSON glob so a locale's SRD/UI shards actually load", async () => {
    const out = await underLoader(`
      const loaders = await import(${JSON.stringify(REPO)} + "src/i18n/loaders.ts");
      const ui = await loaders.loadUiResources("it");
      const srd = await loaders.loadSrdCatalogues("it");
      console.log(JSON.stringify({ ui: Object.keys(ui).length, spells: Object.keys(srd.spell).length }));
    `);
    const result = JSON.parse(out) as { ui: number; spells: number };
    expect(result.ui).toBeGreaterThan(0);
    expect(result.spells).toBeGreaterThan(0);
  }, 60_000);

  it("expands the eager ?url glob over the public asset tree", async () => {
    const out = await underLoader(`
      const art = await import(${JSON.stringify(REPO)} + "src/data/monster-art.ts");
      console.log(JSON.stringify({ art: Object.keys(art.MONSTER_ART).length }));
    `);
    expect((JSON.parse(out) as { art: number }).art).toBeGreaterThan(0);
  }, 60_000);

  withPack(
    "expands the lazy ?raw glob into readable file contents",
    async () => {
      const out = await underLoader(`
      const fixtures = await import(${JSON.stringify(REPO)} + "content-pack/fixtures.ts");
      const names = Object.keys(fixtures.packFixtures);
      const raw = await fixtures.packFixtures[names[0]]();
      console.log(JSON.stringify({
        fixtures: names.length,
        raw: typeof raw,
        schema: JSON.parse(raw).schema,
      }));
    `);
      const result = JSON.parse(out) as Record<string, unknown>;
      expect(result.fixtures).toBeGreaterThan(0);
      expect(result).toMatchObject({ raw: "string", schema: 3 });
    },
    60_000
  );

  withPack(
    "composes the private catalogue, and the VITE_CONTENT_PACK=0 opt-out removes it",
    async () => {
      const size = async (env: NodeJS.ProcessEnv = {}): Promise<number> =>
        Number(
          await underLoader(
            `const s = await import(${JSON.stringify(REPO)} + "src/data/spells.ts"); console.log(s.spellIndex.size);`,
            env
          )
        );
      const composed = await size();
      const srdOnly = await size({ VITE_CONTENT_PACK: "0" });
      expect(srdOnly).toBeGreaterThan(0);
      // STRICT: an equal count would mean the pack silently failed to compose —
      // exactly the condition the migration refuses to plan under.
      expect(composed).toBeGreaterThan(srdOnly);
    },
    60_000
  );
});

describe("import.meta.glob expansion", () => {
  const url = `${REPO}src/i18n/loaders.ts`;

  it("leaves a source without the token untouched", () => {
    expect(expandImportMetaGlob("export const x = 1;\n", url)).toBe(
      "export const x = 1;\n"
    );
  });

  it("keys a lazy glob by the path relative to the importing module", () => {
    const expanded = expandImportMetaGlob(
      `const G = import.meta.glob<JsonModule>("./*/ui/*.json");`,
      url
    );
    expect(expanded).toContain(`"./it/ui/`);
    expect(expanded).toContain(`{ with: { type: "json" } }`);
    expect(expanded).not.toContain("import.meta.glob");
  });

  it("applies ! negations from an array pattern", () => {
    const kept = expandImportMetaGlob(`import.meta.glob(["./*/ui/*.json"]);`, url);
    const filtered = expandImportMetaGlob(
      `import.meta.glob(["./*/ui/*.json", "!./en/**"]);`,
      url
    );
    expect(kept).toContain(`"./en/ui/`);
    expect(filtered).not.toContain(`"./en/ui/`);
    expect(filtered).toContain(`"./it/ui/`);
  });

  it("leaves the token alone inside a comment — documentation is not a call site", () => {
    const documented = [
      "/**",
      ' * Expands import.meta.glob("./*/ui/*.json") at load time.',
      " */",
      "// TODO: import.meta.glob(",
      "export const x = 1;",
      "",
    ].join("\n");
    expect(expandImportMetaGlob(documented, url)).toBe(documented);
  });

  it("expands a real call while a comment above it merely names one", () => {
    const expanded = expandImportMetaGlob(
      `// see import.meta.glob("./nope/*.json")\nconst G = import.meta.glob("./*/ui/*.json");`,
      url
    );
    expect(expanded).toContain(`// see import.meta.glob("./nope/*.json")`);
    expect(expanded).toContain(`"./it/ui/`);
    expect(expanded).not.toContain('import.meta.glob("./*/ui/*.json")');
  });

  it("refuses an option combination it cannot faithfully reproduce", () => {
    expect(() =>
      expandImportMetaGlob(`import.meta.glob("./*/ui/*.json", { eager: true });`, url)
    ).toThrow(/unsupported import.meta.glob options/);
  });
});
