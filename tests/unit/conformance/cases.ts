/**
 * Reads the corpus and the conformance files, so the guard and the count script
 * agree on what "every case" means. Static text only: no test is executed here.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const CORPUS = path.join(ROOT, "docs/architecture/2026-11-edge-cases/corpus.md");
export const PUBLIC_DIR = path.join(ROOT, "tests/unit/conformance");
export const PACK_DIR = path.join(ROOT, "content-pack/tests/unit/conformance");

export interface CorpusCase {
  category: number;
  case: string;
}

/** Every `- **Title** —` line under a `## N. Category` heading. */
export function corpusCases(): CorpusCase[] {
  const out: CorpusCase[] = [];
  let category = 0;
  for (const line of readFileSync(CORPUS, "utf8").split("\n")) {
    const heading = /^## (\d+)\./.exec(line);
    if (heading) category = Number(heading[1]);
    const item = /^- \*\*([^*]+)\*\*/.exec(line);
    if (item?.[1] && category > 0) out.push({ category, case: item[1] });
  }
  return out;
}

export const caseKey = (c: CorpusCase): string => `${c.category}:${c.case}`;

// Group 2 is the opening quote, group 3 the title (group 1 is the category).
const STRING = String.raw`(["'\x60])((?:\\.|(?!\2)[^\\])*)\2`;
const RULE_HEADER = new RegExp(String.raw`category:\s*(\d+),\s*case:\s*` + STRING, "g");

function unescape(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

/** The cases a directory's `*.test.ts` files declare with `rule({ category, case })`. */
export function declaredCases(dir: string): Array<CorpusCase & { file: string }> {
  if (!existsSync(dir)) return [];
  const out: Array<CorpusCase & { file: string }> = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".test.ts"))) {
    const text = readFileSync(path.join(dir, file), "utf8");
    for (const m of text.matchAll(RULE_HEADER)) {
      out.push({ category: Number(m[1]), case: unescape(m[3] ?? ""), file });
    }
  }
  return out;
}
