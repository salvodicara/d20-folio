/// <reference types="node" />
/**
 * Guard: ONE `.hdr-icon` ghost-icon control. Every small icon-only inline action
 * (toast dismiss, banner close, ledger edit/remove) must be the shared
 * `<IconButton>` (`components/ui/icon-button`), never a raw
 * `<button className="hdr-icon">`. The 5 raw sites (Chronicle, Treasury×2,
 * PWABanner, UndoToasts) were converted so the recipe + `type="button"` + the
 * required `aria-label` a11y live in one place (owner 2026-06-08).
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { SRC_ROOT as SRC, srcFiles, readSrc } from "./__helpers__/src-files";

const CANONICAL = resolve(SRC, "components/ui/icon-button.tsx");

describe("canonical icon button", () => {
  it('no source file hand-rolls `className="hdr-icon"` (use <IconButton>)', () => {
    const offenders = srcFiles({ exts: [".tsx"] }).filter(
      (f) => f !== CANONICAL && /className="hdr-icon/.test(readSrc(f))
    );
    expect(
      offenders,
      "Use <IconButton> from @/components/ui/icon-button, not a raw `.hdr-icon` " +
        "button. Offending files:\n" +
        offenders.map((f) => "  " + f.replace(SRC, "src")).join("\n")
    ).toEqual([]);
  });
});
