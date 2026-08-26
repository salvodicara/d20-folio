import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSafeTaskRootCandidate,
  assertPhysicalTaskRoot,
  resolveTaskRoot,
  resolveWorktreePath,
} from "../../scripts/program-supervisor/worktree";

describe("program supervisor worktree coordinates", () => {
  it("places every task below the stable Codex workspace", () => {
    expect(resolveTaskRoot("/Users/owner")).toBe("/Users/owner/Workspace/Codex");
    expect(resolveWorktreePath("/Users/owner", "d20-folio", "automation-k2")).toBe(
      "/Users/owner/Workspace/Codex/d20-folio-automation-k2"
    );
  });

  it.each(["../escape", "UI Wave", "", "a/b", ".hidden"])(
    "rejects unsafe slug %j",
    (slug) => {
      expect(() => resolveWorktreePath("/Users/owner", "d20-folio", slug)).toThrow(
        "safe lowercase slug"
      );
    }
  );

  it("rejects a logical task root symlinked into Documents", () => {
    const home = mkdtempSync(join(tmpdir(), "d20-home-"));
    try {
      mkdirSync(join(home, "Documents", "Codex"), { recursive: true });
      mkdirSync(join(home, "Workspace"), { recursive: true });
      symlinkSync(join(home, "Documents", "Codex"), join(home, "Workspace", "Codex"));
      expect(() => assertPhysicalTaskRoot(resolveTaskRoot(home))).toThrow(
        "synchronized directory"
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("rejects an absent task root below a symlinked ancestor before mkdir", () => {
    const home = mkdtempSync(join(tmpdir(), "d20-home-"));
    try {
      mkdirSync(join(home, "Documents", "Workspace"), { recursive: true });
      symlinkSync(join(home, "Documents", "Workspace"), join(home, "Workspace"));
      expect(() => assertSafeTaskRootCandidate(resolveTaskRoot(home))).toThrow(
        "synchronized directory"
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
