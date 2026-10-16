/**
 * check-public-bundle — prove a production build carries none of the private pack.
 *
 *   node scripts/pack/check-public-bundle.ts <distDir> <emittedPackDir>
 *
 * Reads the emitted pack (`emit-pack.ts`) and fails if any of its long text
 * (every string of 40+ characters: descriptions, restored names in context) or
 * any of its portraits (byte-identical files) appears in the build. Text the
 * public source also carries (`src/`: a shared SRD sentence, an id the engine
 * names) is public already and does not count.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

function longStrings(value: unknown, out: Set<string>): Set<string> {
  if (typeof value === "string") {
    if (value.length >= 40 && !value.startsWith("https://")) out.add(value);
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) longStrings(child, out);
  }
  return out;
}

export function findLeaks(distDir: string, packDir: string, publicDir: string): string[] {
  const version = readFileSync(path.join(packDir, "version.txt"), "utf8").trim();
  const packFiles = files(path.join(packDir, "content-pack", version));
  const texts = new Set<string>();
  for (const file of packFiles)
    longStrings(JSON.parse(readFileSync(file, "utf8")), texts);

  const sha = (file: string) =>
    createHash("sha256").update(readFileSync(file)).digest("hex");
  const artDir = path.join(packDir, "content-pack", "art");
  const artHashes = new Set(
    statSync(artDir, { throwIfNoEntry: false })?.isDirectory()
      ? files(artDir).map(sha)
      : []
  );

  const publicText = files(publicDir)
    .filter((file) => /\.(ts|tsx|json)$/.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const inBody = (body: string, text: string) =>
    body.includes(text) || body.includes(JSON.stringify(text).slice(1, -1));
  const isPrivate = (text: string) => !inBody(publicText, text);

  const leaks: string[] = [];
  for (const file of files(distDir)) {
    const rel = path.relative(distDir, file);
    if (/\.(js|css|html|json|webmanifest|txt)$/.test(file)) {
      const body = readFileSync(file, "utf8");
      // JS string literals escape quotes and newlines; compare on JSON-escaped text too.
      for (const text of texts) {
        if (inBody(body, text) && isPrivate(text)) {
          leaks.push(`${rel}: "${text.slice(0, 60)}…"`);
          break;
        }
      }
    } else if (artHashes.has(sha(file))) {
      leaks.push(`${rel}: a private portrait`);
    }
  }
  return leaks;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [distDir, packDir] = process.argv.slice(2);
  if (!distDir || !packDir) {
    console.error("usage: check-public-bundle.ts <distDir> <emittedPackDir>");
    process.exit(1);
  }
  const leaks = findLeaks(distDir, packDir, path.join(import.meta.dirname, "../../src"));
  if (leaks.length > 0) {
    console.error(`✗ the build carries private pack content (${leaks.length} files):`);
    for (const leak of leaks.slice(0, 20)) console.error(`  ${leak}`);
    process.exit(1);
  }
  console.log("✓ the build carries no private pack content");
}
