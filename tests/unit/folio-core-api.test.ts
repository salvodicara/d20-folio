/// <reference types="node" />
/**
 * The public surface of the rules core (`@d20-folio/core`): exactly the names its entry
 * re-exports, nothing deeper (`package.json` exports only "."). The list lives in
 * `packages/folio-core/api.txt`, so adding, renaming or dropping a public name shows in
 * the diff as a change to that file, never by accident. To accept a deliberate change:
 * `pnpm exec vitest run tests/unit/folio-core-api.test.ts -u`, then update the README.
 *
 * What the surface may reach is fenced separately (`folio-core-imports.guard.test.ts`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import * as core from "../../packages/folio-core/index";
import { REPO_ROOT } from "./__helpers__/static-import-graph";

const ENTRY = join(REPO_ROOT, "packages/folio-core/index.ts");
const source = ts.createSourceFile(
  ENTRY,
  readFileSync(ENTRY, "utf8"),
  ts.ScriptTarget.Latest,
  true
);

/** Every public name, "value x" or "type X", sorted. */
function publicNames(): string[] {
  const names: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause) continue;
    if (!ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) {
      const kind = statement.isTypeOnly || element.isTypeOnly ? "type" : "value";
      names.push(`${kind} ${element.name.text}`);
    }
  }
  return names.sort((a, b) => a.localeCompare(b));
}

describe("the rules core's public surface", () => {
  it("is exactly the names in packages/folio-core/api.txt", async () => {
    await expect(`${publicNames().join("\n")}\n`).toMatchFileSnapshot(
      "../../packages/folio-core/api.txt"
    );
  });

  it("names only what the entry really exports at runtime", () => {
    const values = publicNames()
      .filter((line) => line.startsWith("value "))
      .map((line) => line.slice("value ".length));
    expect(values.filter((name) => !(name in core))).toEqual([]);
    expect(Object.keys(core).sort()).toEqual([...values].sort());
  });

  it("the entry only re-exports: every public name is visible in one file", () => {
    const other = source.statements.filter(
      (statement) =>
        !(
          ts.isExportDeclaration(statement) &&
          statement.moduleSpecifier !== undefined &&
          statement.exportClause !== undefined &&
          ts.isNamedExports(statement.exportClause)
        )
    );
    expect(other.map((statement) => statement.getText().slice(0, 60))).toEqual([]);
  });

  it("offers the turn rule the app asks: who may move the turn", () => {
    expect(publicNames()).toContain("value mayStepTurn");
  });
});
