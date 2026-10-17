/**
 * Anti-FOUC boot-background sync guard (#59 / no-flicker).
 *
 * index.html paints a pre-paint page background on `<html>` BEFORE the stylesheet
 * hydrates, so the user never sees the wrong field flash then restyle. That only
 * works if the hard-coded hex stays equal to the real `--bg-page` token in
 * index.css. The app is dark only (owner 2026-10-16).
 *
 * This static guard reads both files and fails if the boot background (and the
 * `theme-color` meta) drift from the token, so the flash can't come back unnoticed.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../../src/index.css"), "utf8");
const html = readFileSync(resolve(here, "../../index.html"), "utf8");

// The first `--bg-page` declaration in index.css is the :root (dark) token.
const bgPages = [...css.matchAll(/--bg-page\s*:\s*(#[0-9a-fA-F]{3,8})/g)].map((m) =>
  (m[1] ?? "").toLowerCase()
);

describe("anti-FOUC boot background stays in sync with --bg-page (#59)", () => {
  expect(bgPages.length, "a --bg-page token").toBeGreaterThanOrEqual(1);
  const darkPage = bgPages[0] ?? "";

  it("the dark <html> pre-paint background equals the dark --bg-page token", () => {
    // `html { background-color: #...; }` (the dark default) in index.html's <style>.
    const m = html.match(/html\s*\{\s*background-color:\s*(#[0-9a-fA-F]{3,8})/i);
    expect(m?.[1]?.toLowerCase(), "dark boot bg present").toBe(darkPage);
  });

  it("the dark theme-color meta equals the dark --bg-page token", () => {
    const m = html.match(/name="theme-color"\s+content="(#[0-9a-fA-F]{3,8})"/i);
    expect(m?.[1]?.toLowerCase(), "theme-color meta present").toBe(darkPage);
  });
});
