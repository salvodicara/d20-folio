#!/usr/bin/env node
/**
 * Print the Cloud Functions the built source exports, sorted, space-separated:
 * the set deploy.yml requires ACTIVE after a deploy. Read from `functions/lib`
 * (built by the deploy's predeploy step) the way the Firebase CLI finds them,
 * by their `__endpoint`, so adding or removing a function never needs a
 * hand-kept list.
 *
 *   node scripts/functions-expected.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const exported = require("../functions/lib/index.js");
const names = Object.keys(exported).filter((name) => exported[name]?.__endpoint);
if (names.length === 0) {
  console.error("functions-expected: no Cloud Functions found in functions/lib (built?)");
  process.exit(1);
}
console.log(names.sort().join(" "));
