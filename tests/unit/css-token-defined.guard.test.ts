import { describe, it, expect } from "vitest";
import { extname } from "node:path";
import { srcFiles, readSrc } from "./__helpers__/src-files";

/**
 * D63 regression — every `var(--token)` used WITHOUT a fallback must reference a
 * custom property that is actually DEFINED (in a `.css` file) or INJECTED at
 * runtime (a `"--token"` string literal in a `.ts`/`.tsx` inline style /
 * `setProperty` call). An undefined `var()` with no fallback makes the WHOLE
 * declaration "invalid at computed-value time", so the property silently falls
 * back to its inherited/initial value — painting nothing.
 *
 * This is the class of bug behind #48 (light-theme skill proficiency dots were
 * invisible because the fill referenced an undefined `--gold-leaf-400`), plus the
 * broken wizard-step seals (`--bg-tertiary`/`--border`), the temp-HP tint
 * (`--info`), the session-delete hover (`--danger`), the option-detail reveal
 * animation (`--m-base`), and the carved scrollbar track (`--bg-primary`). One
 * guard pins them all so a stale/typo'd token reference can never ship invisible UI.
 */
/** Strip CSS block comments so a `var()` inside one is never mistaken for a use. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("css custom-property references resolve (no invisible-UI tokens)", () => {
  const files = srcFiles();
  const css = stripCssComments(
    files
      .filter((f) => extname(f) === ".css")
      .map((f) => readSrc(f))
      .join("\n")
  );
  const code = files
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => readSrc(f))
    .join("\n");

  // Defined: any `--name:` declaration (includes the @theme `--color-*` maps).
  const defined = new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
  // Runtime-injected: a `"--name"` / `'--name'` / `` `--name` `` literal in TS/TSX
  // (inline `style` objects, `element.style.setProperty(...)`).
  const injected = new Set(
    [...code.matchAll(/["'`](--[a-zA-Z0-9-]+)["'`]/g)].map((m) => m[1])
  );
  // Tailwind v4 emits its own `--tw-*` internals outside our source.
  const isExternal = (name: string): boolean => name.startsWith("--tw-");

  it("every var(--x) without a fallback is defined or injected somewhere", () => {
    const missing = new Map<string, number>();
    // `var( --x )` followed immediately by `)` = no fallback; `,` = has fallback.
    for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*([),])/g)) {
      const name = m[1];
      const sep = m[2];
      if (name === undefined || sep === undefined) continue;
      if (sep === ",") continue; // has a fallback → never invalid
      if (defined.has(name) || injected.has(name) || isExternal(name)) continue;
      missing.set(name, (missing.get(name) ?? 0) + 1);
    }
    expect(
      [...missing.entries()].map(([t, n]) => `${t} (×${n})`),
      "undefined CSS custom properties referenced without a fallback — these render as transparent/initial"
    ).toEqual([]);
  });
});
