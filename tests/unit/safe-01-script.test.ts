import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Dry-run smoke test for the SAFE-01 kill-switch script (scripts/safe-01.sh).
 *
 * The script orchestrates gcloud/firebase, which we can't (and must not) invoke
 * against the real project from a test. But its SAFE01_DRY_RUN=1 mode is fully
 * hermetic — it prints every MUTATING command instead of running it and returns
 * placeholders for read-only lookups, so it needs no gcloud at all. This asserts the
 * command PLAN each verb prints, which is the contract the owner relies on. If gcloud
 * happens to be installed we still force dry-run, so this never touches billing.
 */
const script = path.resolve(__dirname, "../../scripts/safe-01.sh");

function run(verb: string): string {
  return execFileSync("bash", [script, verb], {
    encoding: "utf8",
    env: { ...process.env, SAFE01_DRY_RUN: "1" },
  });
}

describe("safe-01.sh (dry-run)", () => {
  it("arm prints the full idempotent setup plan and ends ARMED", () => {
    const out = run("arm");
    expect(out).toContain("gcloud services enable cloudbilling.googleapis.com");
    expect(out).toContain("gcloud services enable billingbudgets.googleapis.com");
    expect(out).toContain("gcloud services enable pubsub.googleapis.com");
    expect(out).toContain("gcloud pubsub topics create budget-kill");
    expect(out).toContain(
      "--notifications-rule-pubsub-topic=projects/d20-folio/topics/budget-kill"
    );
    expect(out).toContain("gcloud projects add-iam-policy-binding d20-folio");
    expect(out).toContain("--role=roles/billing.projectManager");
    expect(out).toContain("firebase deploy --only functions:onBudgetAlert");
    expect(out).toContain("ARMED");
  });

  it("restore defuses (drops the detach grant) BEFORE re-linking billing", () => {
    const out = run("restore");
    const defuseAt = out.indexOf("remove-iam-policy-binding");
    const relinkAt = out.indexOf("gcloud billing projects link");
    expect(defuseAt).toBeGreaterThan(-1);
    expect(relinkAt).toBeGreaterThan(-1);
    // Order matters: the detach capability must be removed before billing comes back.
    expect(defuseAt).toBeLessThan(relinkAt);
    expect(out).toContain("RESTORE COMPLETE");
  });

  it("status runs read-only and prints a verdict", () => {
    const out = run("status");
    expect(out).toContain("SAFE-01 STATUS");
    expect(out).toContain("verdict:");
  });

  it("an unknown verb exits non-zero", () => {
    expect(() => run("bogus")).toThrow();
  });

  it("billing_enabled() lowercases gcloud's capitalized boolean (gcloud prints 'True'/'False', every call site compares == \"true\")", () => {
    // Real `gcloud ... --format='value(billingEnabled)'` prints "True"/"False" (capitalized),
    // not "true"/"false" — a prior bug compared that raw value against lowercase literals and
    // reported a false "FIRED" verdict while billing was actually attached. Stub gcloud to
    // reproduce the real casing and assert billing_enabled() normalizes it.
    const fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe01-fakebin-"));
    const fakeGcloud = path.join(fakeBinDir, "gcloud");
    fs.writeFileSync(fakeGcloud, "#!/usr/bin/env bash\necho True\n");
    fs.chmodSync(fakeGcloud, 0o755);

    const out = execFileSync(
      "bash",
      [
        "-c",
        `PATH="${fakeBinDir}:$PATH"; source "${script}" >/dev/null 2>&1; billing_enabled`,
      ],
      { encoding: "utf8" }
    );
    expect(out.trim()).toBe("true");
  });
});
