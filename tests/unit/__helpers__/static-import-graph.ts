/// <reference types="node" />
/**
 * The app's STATIC import graph, read from source: what the browser must download
 * before first paint is everything `src/main.tsx` reaches through value imports and
 * re-exports. Dynamic `import()` is a lazy door and is not an edge; `import type` /
 * `export type` (and an import whose every name is `type`) are erased and are not
 * edges either. Bare package specifiers are left out: this graph is about our own
 * modules.
 *
 * It resolves `@/` and the `@pack` seam exactly as the build does (`packAliases`),
 * so a composed checkout sees the pack and an SRD-only one sees the empty stub.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { packAliases } from "../../../scripts/content-pack-mode";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const ALIASES: [string, string][] = Object.entries({
  ...packAliases(),
  "@": join(REPO_ROOT, "src"),
}).sort((a, b) => b[0].length - a[0].length);

const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string | null = null;
  if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else
    for (const [alias, target] of ALIASES)
      if (spec === alias || spec.startsWith(alias + "/")) {
        base = target + spec.slice(alias.length);
        break;
      }
  if (base === null) return null; // a package: not our module
  const stem = base.replace(/\.js$/, "");
  for (const ext of EXTENSIONS) {
    if (isFile(stem + ext)) return stem + ext;
    if (isFile(base + ext)) return base + ext;
  }
  return null; // css, assets, generated files: no edges to follow
}

/** Value-import specifiers of one module (type-only imports are erased). */
function staticSpecifiers(file: string): string[] {
  if (!/\.(tsx?|mts)$/.test(file)) return [];
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest
  );
  const out: string[] = [];
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause?.phaseModifier === ts.SyntaxKind.TypeKeyword) continue;
      const named = clause?.namedBindings;
      const allTypes =
        clause &&
        !clause.name &&
        named &&
        ts.isNamedImports(named) &&
        named.elements.length > 0 &&
        named.elements.every((e) => e.isTypeOnly);
      if (allTypes) continue;
      out.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.isTypeOnly
    ) {
      const clause = node.exportClause;
      if (
        clause &&
        ts.isNamedExports(clause) &&
        clause.elements.length > 0 &&
        clause.elements.every((e) => e.isTypeOnly)
      )
        continue;
      out.push(node.moduleSpecifier.text);
    }
  }
  return out;
}

/** Repo-relative path → the shortest static import chain from the entry to it. */
export function eagerModules(entry = "src/main.tsx"): Map<string, string[]> {
  const start = join(REPO_ROOT, entry);
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const file = queue.shift() as string;
    for (const spec of staticSpecifiers(file)) {
      const dep = resolveSpecifier(spec, file);
      if (dep && !prev.has(dep)) {
        prev.set(dep, file);
        queue.push(dep);
      }
    }
  }
  const rel = (abs: string): string => relative(REPO_ROOT, abs).split("\\").join("/");
  const out = new Map<string, string[]>();
  for (const file of prev.keys()) {
    const chain: string[] = [];
    for (let n: string | null | undefined = file; n; n = prev.get(n))
      chain.unshift(rel(n));
    out.set(rel(file), chain);
  }
  return out;
}
