/**
 * Guard for the issue #24 resilience model (supersedes the f375edbc
 * `<html translate="no">` ban, REMOVED per golden rule 10).
 *
 * The app must stay OPEN to browser machine translation — a user whose language
 * is neither EN nor IT translating the page is a capability, not a bug. The
 * crash class translation used to trigger (translator-injected `<font>`
 * wrappers breaking React's `removeChild`/`insertBefore`) is absorbed by the
 * DOM-resilience boundary adapters (`src/lib/dom-resilience.ts`), which
 * `src/main.tsx` must install BEFORE the first React render.
 *
 * This guard fails if anyone re-introduces a blanket translation ban, drops the
 * `<html lang>` ↔ active-locale sync (which lets translators skip same-language
 * pages), or unhooks the adapter from the entry point.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

const indexHtml = read("index.html");
const mainTsx = read("src/main.tsx");
const i18nIndex = read("src/i18n/index.ts");

describe("translation stays ALLOWED (issue #24 resilience model)", () => {
  it("the <html> root carries NO translate ban", () => {
    const htmlTag = indexHtml.match(/<html\b[\s\S]*?>/)?.[0] ?? "";
    expect(htmlTag).not.toMatch(/\btranslate=/);
  });

  it('no <meta name="google" content="notranslate"> blanket ban', () => {
    expect(indexHtml).not.toMatch(
      /<meta[^>]*name=["']google["'][^>]*content=["']notranslate["']/
    );
  });

  it("main.tsx installs the DOM-resilience adapters before the first render", () => {
    const install = mainTsx.indexOf("installDomResilience()");
    // The render CALL site (not the `createRoot` import specifier).
    const firstRender = mainTsx.indexOf("createRoot(");
    expect(install).toBeGreaterThan(-1);
    expect(firstRender).toBeGreaterThan(-1);
    expect(install).toBeLessThan(firstRender);
  });

  it("the <html lang> ↔ active-locale sync is wired (honest tagging)", () => {
    expect(i18nIndex).toContain("document.documentElement.lang");
    expect(i18nIndex).toContain('i18n.on("languageChanged"');
  });
});
