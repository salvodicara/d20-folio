import { describe, it, expect } from "vitest";
import { relative } from "node:path";
import { srcFileMap, SRC_ROOT } from "./__helpers__/src-files";

/**
 * Guard: no source file under `src/` may contain a NUL byte (U+0000).
 *
 * A stray NUL is the signature of binary garbage smuggled into a text source —
 * git flags the file as binary, diffs become unreadable, and tooling (prettier,
 * grep, editors) misbehaves. It slipped in once as a raw `\x00` separator inside
 * a template literal (`useMemberCharacterDocs.ts` composite map key) — tsc, eslint
 * and prettier all tolerated it, so only this guard catches the class. A composite
 * key wanting a separator must use a printable, collision-free one (Firestore ids
 * cannot contain `/`), never a literal control byte.
 */
describe("no binary bytes in source", () => {
  it("no src file contains a NUL byte", () => {
    const offenders: string[] = [];
    for (const [path, content] of srcFileMap()) {
      if (content.includes("\u0000")) offenders.push(relative(SRC_ROOT, path));
    }
    expect(offenders, `NUL byte(s) found in: ${offenders.join(", ")}`).toEqual([]);
  });
});
