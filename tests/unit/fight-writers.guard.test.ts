/// <reference types="node" />
/**
 * Guard: one writer for the fight. The campaign's autosave no longer writes `encounter`
 * (#1027), so a fight change made in the store alone is never saved. Every change to
 * the fight must therefore go through:
 *
 * - the DM's edit log (`encounter-edit-sync.ts`: shown at once, one transaction
 *   replayed onto the server's newest fight), or
 * - a move that writes the server itself (a transaction or an immediate write in
 *   `campaign-io.ts` / `combat-lifecycle-io.ts`).
 *
 * The test reads every source file's syntax (comments and strings in prose don't count)
 * and fails on a write to the fight from anywhere else. A store write that rides its own
 * server write is listed below with that write; anything new needs the same.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./__helpers__/static-import-graph";

/** The modules that write the fight to Firestore. */
const SERVER_WRITERS = [
  "src/features/campaigns/campaign-io.ts",
  "src/features/campaigns/combat-lifecycle-io.ts",
];

/** Store writes of the fight, each with the server write that carries it. */
const STORE_WRITERS: Record<string, string> = {
  "src/features/campaigns/encounter-edit-sync.ts": "the edit log itself",
  "src/features/campaigns/campaign-io.ts":
    "local development only (dev-bypass branches, then writeDevFight)",
  "src/features/campaigns/Party.tsx":
    "classic start and end, with persistStartEncounter / persistEndEncounter",
  "src/domains/campaign/campaign-admin.ts":
    "a removed member's row, with removeMember's transaction",
  "src/features/campaigns/useCampaignSubscription.ts":
    "the server's snapshot, the edit log's waiting edits over it",
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = sourceFiles(join(REPO_ROOT, "src")).map((full) => ({
  path: relative(REPO_ROOT, full),
  ast: ts.createSourceFile(
    full,
    readFileSync(full, "utf8"),
    ts.ScriptTarget.Latest,
    true
  ),
}));

/** Whether any node under `node` (itself included) matches. */
function some(node: ts.Node, match: (node: ts.Node) => boolean): boolean {
  return (
    match(node) ||
    (node.forEachChild((child) => some(child, match) || undefined) ?? false)
  );
}

const propertyName = (node: ts.Node): string | undefined =>
  ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)
    ? node.name.getText().replace(/^["']|["']$/g, "")
    : undefined;

/** Whether a node (an argument, an object) sets the `encounter` field anywhere inside. */
function setsEncounter(node: ts.Node): boolean {
  return some(node, (inner) => propertyName(inner) === "encounter");
}

/** Files writing the fight to Firestore: they import Firestore and name the field in a
 *  write (`encounter: …` or a dotted `"encounter.x"` path). */
function serverWriters(): string[] {
  return FILES.filter(({ ast }) => {
    const firestore = ast.statements.some(
      (statement) =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === "firebase/firestore"
    );
    if (!firestore) return false;
    return some(ast, (node) => {
      const name = propertyName(node);
      return (
        name === "encounter" ||
        name?.startsWith("encounter.") === true ||
        (ts.isStringLiteral(node) && node.text.startsWith("encounter."))
      );
    });
  }).map(({ path }) => path);
}

/** Files changing the fight in the campaign store: `setEncounter(…)`, or `setCampaign(…)`
 *  with an `encounter` in its argument. */
function storeWriters(): string[] {
  return FILES.filter(({ path, ast }) => {
    if (path === "src/features/campaigns/campaignStore.ts") return false;
    return some(ast, (node) => {
      if (!ts.isCallExpression(node)) return false;
      const callee = node.expression;
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ts.isIdentifier(callee)
          ? callee.text
          : undefined;
      return (
        name === "setEncounter" ||
        (name === "setCampaign" && node.arguments.some(setsEncounter))
      );
    });
  }).map(({ path }) => path);
}

describe("one writer for the fight", () => {
  it("only the fight's I/O modules write it to Firestore", () => {
    expect(serverWriters().sort()).toEqual([...SERVER_WRITERS].sort());
  });

  it("a fight change in the store rides the edit log or its own server write", () => {
    expect(storeWriters().sort()).toEqual(Object.keys(STORE_WRITERS).sort());
  });
});
