/// <reference types="node" />
/**
 * Guard: ONE button everywhere. Every pressed-brass `.btn` must be the canonical
 * `<Button>` atom (`@/components/ui/button`) — never a raw `<button className="btn …">`
 * or `className={cn("btn …")}`. ~50 raw `.btn` buttons across modals, banners, the
 * combat algorithm editor, and the HP controls were converted so the loading/type/
 * a11y/variant behaviour lives in ONE place and a fix propagates everywhere (owner
 * 2026-06-08, "dedup all the components you can"). `button.tsx` is the sole home of
 * the `.btn` class (via `cva("btn", …)`); the Google sign-in button is a distinct
 * `.btn-google` brand recipe, not part of this system.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { SRC_ROOT as SRC, srcFiles, readSrc } from "./__helpers__/src-files";

const CANONICAL = resolve(SRC, "components/ui/button.tsx");

// Matches a literal `.btn` class token in a className/cn() string: `"btn"` or
// `"btn ` (a space-separated variant list). Does NOT match `btn-google` (a hyphen
// follows) or the `cva("btn", …)` definition inside button.tsx (excluded by path).
const RAW_BTN = /["']btn(?:["']|\s)/;

describe("canonical button", () => {
  it("no source file hand-rolls a `.btn` className (use <Button>)", () => {
    const offenders = srcFiles({ exts: [".ts", ".tsx"] }).filter(
      (f) => f !== CANONICAL && RAW_BTN.test(readSrc(f))
    );
    expect(
      offenders,
      "Use <Button> from @/components/ui/button (variant/size/loading props), not a " +
        "raw `.btn` className. Offending files:\n" +
        offenders.map((f) => "  " + f.replace(SRC, "src")).join("\n")
    ).toEqual([]);
  });
});
