/**
 * Vitest global setup: in pack mode, refuse to run against a pack checkout that
 * lags its origin/main (see `pack-freshness.ts`). Reads git state only; never
 * pulls. `PACK_FRESHNESS=off` skips the check.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contentPackEnabled } from "../content-pack-mode";
import { packFreshnessProblem, readPackCheckoutState } from "./pack-freshness";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export default function setup(): void {
  if (process.env.PACK_FRESHNESS === "off" || !contentPackEnabled()) return;
  const problem = packFreshnessProblem(
    readPackCheckoutState(path.join(ROOT, "content-pack"))
  );
  if (problem) throw new Error(problem);
}
