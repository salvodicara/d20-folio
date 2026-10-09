/**
 * core-dts-paths — make @d20-folio/core's emitted declarations self-contained: the
 * app's `@/…` and `@pack` path aliases become relative specifiers inside
 * `packages/folio-core/dist/types`, so a consumer's TypeScript resolves every type
 * without our tsconfig. Run by `pnpm core:build` after `tsc`.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../packages/folio-core/dist/types");
const src = path.join(root, "src");
const packEmpty = path.join(src, "data/pack-empty");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith(".d.ts")) yield full;
  }
}

const rel = (from, to) => {
  const r = path.relative(path.dirname(from), to).split(path.sep).join("/");
  return r.startsWith(".") ? r : `./${r}`;
};

let files = 0;
for (const file of walk(root)) {
  const before = readFileSync(file, "utf-8");
  const after = before.replace(
    /(["'])(@\/[^"']+|@pack(?:\/[^"']*)?)\1/g,
    (_m, q, spec) => {
      const target = spec.startsWith("@pack") ? packEmpty : path.join(src, spec.slice(2));
      return `${q}${rel(file, target)}${q}`;
    }
  );
  if (after !== before) {
    writeFileSync(file, after);
    files += 1;
  }
}
console.log(`core-dts-paths: rewrote aliases in ${files} declaration files`);
