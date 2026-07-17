/// <reference types="node" />
/**
 * Guard: ONE `.input` field family. Every form field must be the shared `<Input>`
 * / `<Textarea>` (`@/components/ui/input`), never a hand-rolled
 * `<input className="input …">` / `<textarea className="input …">`. ~58 raw fields
 * across the sheet tabs, creation forms, and modals were converted so the carved
 * `.input` recipe + `error`/`aria-invalid` handling live in one place (owner
 * 2026-06-08, "dedup all the components you can").
 *
 * Allowed: the input-LAYER primitives that implement the `.input` surface directly
 * (siblings of `<Input>`, with their own added behaviour — not feature consumers):
 *   · ui/input.tsx          (Input/Textarea/SearchInput/NumberStepper themselves)
 *   · shared/InlineEditable (auto-resize inline edit fields, ref-driven)
 *   · shared/SearchField + shared/CollapsibleSearch (search chrome over the field)
 */
import { describe, expect, it } from "vitest";
import { relative } from "node:path";
import { SRC_ROOT as SRC, srcFiles, readSrc } from "./__helpers__/src-files";

const ALLOW = new Set([
  "components/ui/input.tsx",
  "components/shared/InlineEditable.tsx",
  "components/shared/SearchField.tsx",
  "components/shared/CollapsibleSearch.tsx",
]);

// A literal `.input` class token in a className string (`"input"` or `"input …`).
const RAW_INPUT = /className="input(?:["'\s])/;

describe("canonical input", () => {
  it("no feature/sheet file hand-rolls a `.input` field (use <Input>/<Textarea>)", () => {
    const offenders = srcFiles({ exts: [".tsx"] }).filter((f) => {
      const rel = relative(SRC, f);
      return !ALLOW.has(rel) && RAW_INPUT.test(readSrc(f));
    });
    expect(
      offenders,
      "Use <Input> / <Textarea> from @/components/ui/input, not a raw `.input` field. " +
        "Offending files:\n" +
        offenders.map((f) => "  " + f.replace(SRC, "src")).join("\n")
    ).toEqual([]);
  });
});
