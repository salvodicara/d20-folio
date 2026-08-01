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

const ROOT = join(__dirname, "..", "..");

/** The primitives themselves — the only homes of a raw overflow-y utility. */
const SANCTIONED = new Set(["src/components/ui/modal-head.tsx"]);

/** Directories whose components render INSIDE dialogs (or are dialogs). */
const DIALOG_DIRS = ["src/components/sheet", "src/components/shared"];

/** Single files that host dialog bodies outside those directories. */
const DIALOG_FILES = [
  "src/app/shell/CommandPalette.tsx",
  "src/features/character/RestModal.tsx",
  "src/features/character/ChoiceRePicker.tsx",
  "src/features/character/companions/FamiliarPanel.tsx",
  "src/features/character/companions/familiar-picker.tsx",
  "src/features/campaigns/CreateCampaignModal.tsx",
  "src/features/campaigns/JoinCampaignModal.tsx",
  "src/features/campaigns/encounter-bestiary.tsx",
  "src/features/report/ReportDialog.tsx",
  "src/features/compendium/picker/CompendiumPicker.tsx",
];

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

describe("modal scroll — one primitive, every dialog", () => {
  it("no dialog-hosted file hand-rolls a vertical scroller", () => {
    const files = [...DIALOG_DIRS.flatMap(tsxFiles), ...DIALOG_FILES];
    const offenders: string[] = [];
    for (const rel of files) {
      if (SANCTIONED.has(rel) || PAGE_SIDE.has(rel)) continue;
      const src = readFileSync(join(ROOT, rel), "utf8");
      if (/overflow-y-(auto|scroll)/.test(src)) offenders.push(rel);
    }
    expect(
      offenders,
      "dialog bodies must scroll through ModalScroll / ModalBody / " +
        "ModalScrollColumn / ResultList — raw overflow-y found in: " +
        offenders.join(", ")
    ).toEqual([]);
  });

  it("no file re-declares the body class raw (the padding lives on the primitive)", () => {
    // A raw `className="modal-body …"` div bypasses ModalScroll, so it gets NO
    // scroll-dissolve and NO frame's-margin padding — a zero-margin dialog (the
    // 2026-08-01 invite-link regression). The class may only ship via ModalBody.
    const offenders: string[] = [];
    for (const rel of tsxFiles("src")) {
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
    expect(src).toMatch(/useOverflowFadeY/);
    expect(src).toMatch(/scroll-dissolve/);
    const css = readFileSync(join(ROOT, "src/styles/folio.css"), "utf8");
    expect(css).toMatch(
      /\.modal \.scroll-dissolve \{\n\s+padding: var\(--sp-3\) var\(--sp-6\) var\(--sp-6\);/
    );
  });
});
