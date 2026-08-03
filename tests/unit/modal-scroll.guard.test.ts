/**
 * Modal-scroll guard — EVERY dialog scrolls the same way (owner, 2026-07-31:
 * "non voglio vedere che un dialog si comporta in un modo e un altro in un
 * altro" — golden-rule one-seam).
 *
 * The ONE dialog scroll primitive is `ModalScroll` (ui/modal-head.tsx): it
 * carries the edge-dissolve (rows melt before the binding-corner spandrels)
 * and inherits the frame's-margin law (`.modal .scroll-dissolve`). `ModalBody`,
 * `ModalScrollColumn`, and the picker `ResultList` compose it. A dialog body
 * hand-rolling `overflow-y-auto` gets NEITHER — a silently divergent dialog.
 *
 * This guard scans every source file that hosts dialog content and fails on a
 * raw vertical-scroll utility outside the sanctioned primitives.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOT = join(__dirname, "..", "..");

/** The primitives themselves — the only homes of a raw overflow-y utility. */
const SANCTIONED = new Set(["src/components/ui/modal-head.tsx"]);

/** Directories whose components render INSIDE dialogs (or are dialogs). */
const DIALOG_DIRS = ["src/components/sheet", "src/components/shared"];

/** Shared bodies rendered by modal hosts outside those directories. The modal hosts
 *  themselves are derived below from every `<ModalShell>` occurrence. */
const EMBEDDED_DIALOG_BODIES = [
  "src/app/shell/CommandPalette.tsx",
  "src/features/report/ReportDialog.tsx",
  "src/features/compendium/picker/CompendiumPicker.tsx",
];

/** ModalStage is deliberately narrow: these compound modal applications own an
 *  inner sanctioned ModalScroll (or a fixed crop canvas) and therefore cannot use
 *  the normal one-region ModalBody/ModalScrollColumn. Every exception is named and
 *  justified; the test below proves the allowlist and actual Stage hosts stay equal. */
const STAGE_HOSTS = new Map<string, string>([
  [
    "src/components/shared/PickerDetailModal.tsx",
    "shared compendium detail owns its scroll",
  ],
  ["src/components/shared/PortraitCropModal.tsx", "fixed crop canvas plus zoom controls"],
  ["src/components/sheet/AddItemModal.tsx", "tabbed compound picker owns result scroll"],
  [
    "src/components/sheet/BeastFormPicker.tsx",
    "search plus pinned reference and result scroll",
  ],
  ["src/components/sheet/DivineInterventionModal.tsx", "search plus spell result scroll"],
  [
    "src/components/sheet/FeatureAddModal.tsx",
    "tabbed compound picker owns result scroll",
  ],
  ["src/components/sheet/SpellAddModal.tsx", "tabbed compound picker owns result scroll"],
  ["src/features/campaigns/Party.tsx", "lazy encounter picker body owns result scroll"],
  [
    "src/features/campaigns/encounter-bestiary.tsx",
    "encounter picker owns result scroll",
  ],
  [
    "src/features/campaigns/party-encounter.tsx",
    "loader mirrors the staged statblock host",
  ],
  [
    "src/features/character/ChoiceRePicker.tsx",
    "nested compendium detail owns its scroll",
  ],
  [
    "src/features/character/companions/familiar-picker.tsx",
    "compound compendium picker owns result scroll",
  ],
]);

/** Page-side files inside the scanned dirs (not dialog content). */
const PAGE_SIDE = new Set([
  // ErrorBoundary's crash <pre> is a page surface, not a dialog body.
  "src/components/shared/ErrorBoundary.tsx",
  // The tag-picker dropdown is a POPOVER (no binding corners) — out of the
  // modal law's scope by design.
  "src/components/shared/SrdTagPicker.tsx",
]);

function tsxFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  return readdirSync(abs).flatMap((name) => {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) return tsxFiles(join(dir, name));
    return name.endsWith(".tsx") ? [join(dir, name)] : [];
  });
}

const ALL_TSX = tsxFiles("src");
const MODAL_HOSTS = ALL_TSX.filter(
  (rel) =>
    rel !== "src/components/shared/ModalShell.tsx" &&
    readFileSync(join(ROOT, rel), "utf8").includes("<ModalShell")
);

function jsxName(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  return ts.isJsxElement(node)
    ? node.openingElement.tagName.getText()
    : node.tagName.getText();
}

describe("modal scroll — one primitive, every dialog", () => {
  it("no dialog-hosted file hand-rolls a vertical scroller", () => {
    expect(
      MODAL_HOSTS.length,
      "derived ModalShell host census is non-empty"
    ).toBeGreaterThan(0);
    const embeddedFiles = [
      ...new Set([...DIALOG_DIRS.flatMap(tsxFiles), ...EMBEDDED_DIALOG_BODIES]),
    ].filter((rel) => !MODAL_HOSTS.includes(rel));
    const offenders: string[] = [];
    for (const rel of embeddedFiles) {
      if (SANCTIONED.has(rel) || PAGE_SIDE.has(rel)) continue;
      const src = readFileSync(join(ROOT, rel), "utf8");
      if (/overflow-y-(auto|scroll)/.test(src)) offenders.push(rel);
    }
    // A host file can also render page-side content (party-chronicle's live feed is
    // one); inspect the DERIVED ModalShell subtrees instead of blaming unrelated UI
    // that happens to share the module.
    for (const rel of MODAL_HOSTS) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      const file = ts.createSourceFile(
        rel,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );
      const visit = (node: ts.Node): void => {
        if (
          ts.isJsxElement(node) &&
          node.openingElement.tagName.getText(file) === "ModalShell" &&
          /overflow-y-(auto|scroll)/.test(node.getText(file))
        )
          offenders.push(
            `${rel}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`
          );
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(
      offenders,
      "dialog bodies must scroll through ModalScroll / ModalBody / " +
        "ModalScrollColumn / ResultList — raw overflow-y found in: " +
        offenders.join(", ")
    ).toEqual([]);
  });

  it("every ModalShell routes through a canonical body primitive", () => {
    const offenders: string[] = [];
    for (const rel of MODAL_HOSTS) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      const file = ts.createSourceFile(
        rel,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );
      const visit = (node: ts.Node): void => {
        if (
          ts.isJsxElement(node) &&
          node.openingElement.tagName.getText(file) === "ModalShell"
        ) {
          const bodies = new Set<string>();
          const collect = (child: ts.Node): void => {
            if (
              child !== node &&
              ts.isJsxElement(child) &&
              child.openingElement.tagName.getText(file) === "ModalShell"
            )
              return;
            if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
              const name = jsxName(child);
              if (
                ["ModalBody", "ModalScroll", "ModalScrollColumn", "ModalStage"].includes(
                  name
                )
              )
                bodies.add(name);
            }
            ts.forEachChild(child, collect);
          };
          node.children.forEach(collect);
          if (bodies.size === 0) {
            const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
            offenders.push(`${rel}:${line}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(
      offenders,
      "every ModalShell needs ModalBody / ModalScroll / ModalScrollColumn / ModalStage; raw children bypass the shared frame-margin + scroll grammar: " +
        offenders.join(", ")
    ).toEqual([]);
  });

  it("ModalStage stays a reviewed compound-body exception, never a generic escape hatch", () => {
    const actual = ALL_TSX.filter((rel) =>
      readFileSync(join(ROOT, rel), "utf8").includes("<ModalStage")
    );
    expect(actual.length, "derived ModalStage host census is non-empty").toBeGreaterThan(
      0
    );
    expect(actual.sort()).toEqual([...STAGE_HOSTS.keys()].sort());
    expect([...STAGE_HOSTS.values()].every((reason) => reason.trim().length > 0)).toBe(
      true
    );
  });

  it("no file re-declares the body class raw (the padding lives on the primitive)", () => {
    // A raw `className="modal-body …"` div bypasses ModalScroll, so it gets NO
    // scroll-dissolve and NO frame's-margin padding — a zero-margin dialog (the
    // 2026-08-01 invite-link regression). The class may only ship via ModalBody.
    const offenders: string[] = [];
    for (const rel of ALL_TSX) {
      if (SANCTIONED.has(rel)) continue;
      const src = readFileSync(join(ROOT, rel), "utf8");
      if (/className=(?:"|\{cn\(")(?:modal-body|confirm-body)/.test(src))
        offenders.push(rel);
    }
    expect(
      offenders,
      "the modal body ships ONLY through the ModalBody component — raw " +
        "modal-body/confirm-body class found in: " +
        offenders.join(", ")
    ).toEqual([]);
  });

  it("the primitive carries the dissolve + the frame's-margin hook", () => {
    const src = readFileSync(join(ROOT, "src/components/ui/modal-head.tsx"), "utf8");
    expect(src).toMatch(/export function ModalScroll/);
    expect(src).toMatch(/export function ModalStage/);
    expect(src).toMatch(/useOverflowFadeY/);
    expect(src).toMatch(/scroll-dissolve/);
    const css = readFileSync(join(ROOT, "src/styles/folio.css"), "utf8");
    expect(css).toMatch(
      /\.modal \.scroll-dissolve,\n\.cmp-entry \.scroll-dissolve \{\n\s+padding: var\(--sp-3\) var\(--sp-6\) var\(--sp-6\);/
    );
  });
});
