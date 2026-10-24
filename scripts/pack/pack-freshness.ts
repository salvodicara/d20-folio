/**
 * Pack checkout freshness: the composed test lanes read the private pack through
 * the `content-pack` symlink, and a shared checkout left behind its origin/main
 * makes main look broken locally. This only reads git state already on disk (no
 * fetch, no pull); `just pack-fresh` fetches first. `PACK_FRESHNESS=off` skips it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

export interface PackCheckoutState {
  /** Current branch, or null when detached. */
  branch: string | null;
  /** Commits on origin/main the checkout doesn't have. */
  behind: number;
}

/** The instruction to stop with, or null when the checkout is fine to test against. */
export function packFreshnessProblem(state: PackCheckoutState | null): string | null {
  if (!state || state.branch !== "main" || state.behind <= 0) return null;
  const commits = state.behind === 1 ? "1 commit" : `${state.behind} commits`;
  return (
    `✗ The pack checkout is ${commits} behind its origin/main, so composed tests ` +
    `would test old pack content. fast-forward it (git -C <pack> merge --ff-only ` +
    `origin/main) and run again, or set PACK_FRESHNESS=off.`
  );
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/** Read the state of the git checkout the `content-pack` link points into. */
export function readPackCheckoutState(contentPackLink: string): PackCheckoutState | null {
  if (!existsSync(contentPackLink)) return null;
  try {
    const dir = realpathSync(contentPackLink);
    const top = git(path.dirname(dir), ["rev-parse", "--show-toplevel"]);
    const branch = git(top, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const behind = Number(git(top, ["rev-list", "--count", "HEAD..origin/main"]));
    return {
      branch: branch === "HEAD" ? null : branch,
      behind: Number.isFinite(behind) ? behind : 0,
    };
  } catch {
    return null;
  }
}
