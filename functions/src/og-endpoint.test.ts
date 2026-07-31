/**
 * The `ogImage` route is anonymously reachable (its `*.run.app` URL + the `/og/**`
 * Hosting rewrite) and does real per-request raster work, so it carries a per-function
 * `maxInstances` cap — the DoS/cost ceiling on a zero-budget project, and the belt that
 * keeps the app UP without reaching for the SAFE-01 billing kill-switch. Asserted on the
 * built endpoint manifest (`__endpoint`), which is where the option lands. The override
 * must apply to THIS route only — the sibling functions keep the package default.
 */
import { describe, expect, it } from "vitest";
import { ogImage, ogShell } from "./index";

/** The scaling config the SDK bakes onto the exported handler. */
function maxInstances(fn: unknown): unknown {
  return (fn as { __endpoint?: { maxInstances?: unknown } }).__endpoint?.maxInstances;
}

describe("ogImage endpoint carries the DoS/cost cap", () => {
  it("declares maxInstances=3 on the export", () => {
    expect(maxInstances(ogImage)).toBe(3);
  });

  it("caps ONLY ogImage — the override does not leak to sibling functions", () => {
    // `ogShell` sets no per-function cap, so it inherits the (uncapped) global — never 3.
    expect(maxInstances(ogShell)).not.toBe(3);
  });
});
