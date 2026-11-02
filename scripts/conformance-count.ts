/**
 * Prints the rules conformance count from a Vitest JSON report:
 *   pnpm exec vitest run --project fast tests/unit/conformance content-pack/tests/unit/conformance \
 *     --reporter=json --outputFile=conformance.json
 *   node --import ./scripts/alias-loader.mjs scripts/conformance-count.ts conformance.json
 * A case counts when its test is tagged `[works]` and passed. The total is the
 * corpus. With GITHUB_STEP_SUMMARY set, the line is added to the job summary.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { corpusCases } from "../tests/unit/conformance/cases";

interface JsonReport {
  testResults: Array<{ assertionResults: Array<{ title: string; status: string }> }>;
}

const report = JSON.parse(
  readFileSync(process.argv[2] ?? "conformance.json", "utf8")
) as JsonReport;
const results = report.testResults.flatMap((f) => f.assertionResults);
const works = results.filter((r) => r.title.endsWith("[works]"));
const green = works.filter((r) => r.status === "passed").length;
const broken = works.filter((r) => r.status === "failed").map((r) => r.title);
const pending = results.filter((r) => /\[(M\d+|data)\]$/.test(r.title)).length;
const total = corpusCases().length;

const line = `conformance ${green}/${total} (${pending} pending, ${total - green - pending} without a test)`;
console.log(line);
for (const t of broken) console.log(`  regressed: ${t}`);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
process.exit(broken.length > 0 ? 1 : 0);
