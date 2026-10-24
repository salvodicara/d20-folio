/**
 * The shared pack checkout must not lag its origin/main: a stale checkout made
 * three sessions read "pack tests fail on main" when main was green. The guard
 * stops a composed run with a plain instruction, and never pulls by itself.
 * Only the checkout's `main` branch is held to origin/main: a feature branch or
 * a detached probe of the pack is meant to differ.
 */
import { describe, expect, it } from "vitest";
import { packFreshnessProblem } from "@scripts/pack/pack-freshness";

describe("packFreshnessProblem", () => {
  it("passes a main checkout level with origin/main", () => {
    expect(packFreshnessProblem({ branch: "main", behind: 0 })).toBeNull();
  });

  it("stops a main checkout behind origin/main, naming the count and the fix", () => {
    const message = packFreshnessProblem({ branch: "main", behind: 6 });
    expect(message).toContain("6 commits behind");
    expect(message).toContain("fast-forward");
  });

  it("says one commit, not one commits", () => {
    expect(packFreshnessProblem({ branch: "main", behind: 1 })).toContain(
      "1 commit behind"
    );
  });

  it("leaves a feature branch or a detached probe alone", () => {
    expect(packFreshnessProblem({ branch: "feat/x", behind: 9 })).toBeNull();
    expect(packFreshnessProblem({ branch: null, behind: 9 })).toBeNull();
  });

  it("stays quiet when the state is unknown (no git, no origin/main)", () => {
    expect(packFreshnessProblem(null)).toBeNull();
  });
});
