/**
 * Boot splash guard (app-shell pattern). The cold-start splash must stay INSIDE
 * `#root` so React replaces it automatically on first paint (no removal JS, no flash),
 * and it must be inline in index.html so it renders before any CSS/JS loads. This guards
 * against an accidental removal or it drifting outside #root (which would orphan it).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Vitest runs from the project root, so index.html sits at cwd.
const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

describe("index.html boot splash", () => {
  it("ships an inline boot splash INSIDE #root (so React auto-removes it on mount)", () => {
    const rootIdx = html.indexOf('id="root"');
    const splashIdx = html.indexOf('class="boot-splash"');
    const closeRoot = html.indexOf("</script>", rootIdx); // markup before the module script
    expect(rootIdx).toBeGreaterThan(-1);
    expect(splashIdx).toBeGreaterThan(rootIdx);
    // The splash opens before the closing of the #root region (it's nested in #root).
    expect(splashIdx).toBeLessThan(closeRoot);
  });

  it("inlines the gilt d20 mark (no extra network request on cold start)", () => {
    expect(html).toContain("<svg");
    expect(html.indexOf('class="boot-splash"')).toBeLessThan(html.lastIndexOf("</svg>"));
  });

  it("defines the boot-splash styles inline (renders before the stylesheet loads)", () => {
    expect(html).toContain(".boot-splash {");
    // The breath animation must be gated to no-preference (reduced-motion → static).
    expect(html).toContain("prefers-reduced-motion: no-preference");
  });
});
