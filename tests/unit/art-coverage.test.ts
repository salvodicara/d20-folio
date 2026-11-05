/**
 * The release gate's art coverage (`pnpm art:coverage`): a catalogue entry with its
 * painted icon on disk is not listed, one without it is.
 */
import { existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { missingArt } from "../../scripts/art/coverage";

describe("art coverage", () => {
  it("lists exactly the entries with no painted icon", () => {
    const icon = resolve(__dirname, "../../public/assets/art/spell/fireball.webp");
    expect(existsSync(icon)).toBe(true);
    expect(missingArt().spell).not.toContain("fireball");
    renameSync(icon, `${icon}.off`);
    try {
      expect(missingArt().spell).toContain("fireball");
    } finally {
      renameSync(`${icon}.off`, icon);
    }
  });
});
