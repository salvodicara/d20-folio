/// <reference types="node" />
/**
 * Guard: ONE checkbox everywhere. Every selectable checkbox must be the canonical
 * brass `Checkbox` / `CheckboxField` (the `.cb` recipe on Radix), never a raw native
 * `<input type="checkbox">` — those rendered the OS-default box (a green/grey tick on
 * a parchment app), the inconsistency the owner flagged. ~16 native inputs were
 * converted; this pins that none come back (owner 2026-06-08).
 */
import { describe, expect, it } from "vitest";
import { SRC_ROOT as SRC, srcFiles, readSrc } from "./__helpers__/src-files";

describe("canonical checkbox", () => {
  it('no source file renders a raw native <input type="checkbox">', () => {
    const offenders = srcFiles({ exts: [".ts", ".tsx"] }).filter((f) =>
      /type=["']checkbox["']/.test(readSrc(f))
    );
    expect(
      offenders,
      "Use <Checkbox> / <CheckboxField> from @/components/ui/selection (the brass `.cb` " +
        "recipe), not a native checkbox. Offending files:\n" +
        offenders.map((f) => "  " + f.replace(SRC, "src")).join("\n")
    ).toEqual([]);
  });
});
