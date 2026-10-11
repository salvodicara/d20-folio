/**
 * The 10px legibility floor (PRODUCT.md "No user-facing text below a 10px legibility
 * floor"): every absolute font-size the stylesheets declare, and every SVG fontSize the
 * components hard-code, is at least 10px. Cases are read from the files themselves.
 * Blind spot: relative `em` sizes and sizes computed at runtime (the browser sweep).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const FLOOR_PX = 10;

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, ext) : ext.test(name) ? [path] : [];
  });
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

describe("text legibility floor", () => {
  it("no stylesheet declares a font-size under 10px", () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const file of files("src", /\.css$/)) {
      const css = readFileSync(file, "utf8");
      for (const m of css.matchAll(/font-size:\s*([0-9.]+)(px|rem)\b/g)) {
        seen += 1;
        const px = Number(m[1]) * (m[2] === "rem" ? 16 : 1);
        if (px < FLOOR_PX) offenders.push(`${file}:${lineOf(css, m.index)} ${m[0]}`);
      }
    }
    expect(seen).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });

  it("no component hard-codes an SVG fontSize under 10", () => {
    const offenders: string[] = [];
    for (const file of files("src", /\.tsx$/)) {
      const tsx = readFileSync(file, "utf8");
      for (const m of tsx.matchAll(/fontSize=["{]?\s*"?([0-9.]+)/g)) {
        if (Number(m[1]) < FLOOR_PX) offenders.push(`${file}:${lineOf(tsx, m.index)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
