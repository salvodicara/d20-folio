/**
 * Anti-FOUC boot-background sync guard (#59 / no-flicker).
 *
 * index.html paints a pre-paint page background on `<html>` (dark default) and
 * `html[data-theme="light"]` BEFORE the stylesheet/store hydrate, so a theme'd user
 * never sees the wrong field flash then restyle. That only works if those hard-coded
 * hexes stay equal to the real `--bg-page` tokens in index.css — when the light field
 * was deepened (#dcc995) the stale `#efe5c8` boot bg silently reintroduced a flash.
 *
 * This static guard reads both files and fails if the boot backgrounds (and the dark
 * `theme-color` meta) drift from the tokens, so the flash can't come back unnoticed.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../../src/index.css"), "utf8");
const html = readFileSync(resolve(here, "../../index.html"), "utf8");

// The two `--bg-page` declarations in index.css, in source order: [0] = the dark
// default (:root), [1] = the light override ([data-theme="light"]). Reading them
// positionally is robust against the surrounding comments/blocks.
const bgPages = [...css.matchAll(/--bg-page\s*:\s*(#[0-9a-fA-F]{3,8})/g)].map((m) =>
  (m[1] ?? "").toLowerCase()
);

describe("anti-FOUC boot background stays in sync with --bg-page (#59)", () => {
  expect(bgPages.length, "two --bg-page tokens (dark + light)").toBeGreaterThanOrEqual(2);
  const darkPage = bgPages[0] ?? "";
  const lightPage = bgPages[1] ?? "";

  it("the dark <html> pre-paint background equals the dark --bg-page token", () => {
    // `html { background-color: #...; }` (the dark default) in index.html's <style>.
    const m = html.match(/html\s*\{\s*background-color:\s*(#[0-9a-fA-F]{3,8})/i);
    expect(m?.[1]?.toLowerCase(), "dark boot bg present").toBe(darkPage);
  });

  it("the light pre-paint background equals the light --bg-page token", () => {
    const m = html.match(
      /html\[data-theme="light"\]\s*\{\s*background-color:\s*(#[0-9a-fA-F]{3,8})/i
    );
    expect(m?.[1]?.toLowerCase(), "light boot bg present").toBe(lightPage);
  });

  it("the dark theme-color meta equals the dark --bg-page token", () => {
    const m = html.match(/name="theme-color"\s+content="(#[0-9a-fA-F]{3,8})"/i);
    expect(m?.[1]?.toLowerCase(), "theme-color meta present").toBe(darkPage);
  });
});
