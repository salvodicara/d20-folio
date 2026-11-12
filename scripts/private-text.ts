/**
 * The private-text scan: what a PR title, a PR body or a commit message must not carry
 * before it is published (GitHub keeps every revision; only the owner can delete one).
 *
 * - The audited licensed-setting lexicon (Phase-0 licensing audit): terms absent from
 *   SRD 5.2.1 whose presence marks non-licensed content. Public, shared with
 *   tests/unit/content-pack-partition.guard.test.ts.
 * - The identity values (uids, live players' names, the owner's email): pack-side only,
 *   in content-pack/private-terms.json, never written down here.
 *
 * A hit names its place ("body:12: identity value"), never the term: the refusal is
 * printed to a terminal or a log. CLI: `node scripts/private-text.ts <label>=<file>...`
 * exits 0 when clean, 1 on a hit, 2 when the identity list is absent and `--need-pack`
 * was given (the PR wrapper needs it; the commit-msg hook scans the lexicon alone).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const PI_TERMS = [
  "slaad",
  "beholder",
  "githyanki",
  "githzerai",
  "kuo-toa",
  "mind flayer",
  "illithid",
  "umber hulk",
  "displacer beast",
  "carrion crawler",
  "banderhobb",
  "meazel",
  "quickling",
  "faerun",
  "faerûn",
  "waterdeep",
  "baldur",
  "strahd",
  "ravenloft",
  "barovia",
  "greyhawk",
  "forgotten realms",
  "sword coast",
  "phandelver",
  "phandalin",
  "sunless citadel",
  "eberron",
  "dragonlance",
  "krynn",
  "exandria",
  "wildemount",
  "theros",
  "ravnica",
  "red wizard",
  "menzoberranzan",
  "drizzt",
  "mordenkainen",
  "tasha",
  "bigby",
  "otiluke",
  "leomund",
  "melf",
  "evard",
  "nystul",
  "tenser",
  "drawmij",
  "elminster",
  "simbul",
  "laeral",
  "jallarzi",
  "hadar",
  "silverquill",
  "witchlight",
  "strixhaven",
  "radiant citadel",
  "netheril",
  "halruaa",
  "candlekeep",
  "shadar-kai",
  "dragonmark",
  "siberys",
  "aasimar",
  "warforged",
  "kalashtar",
  "khoravar",
  "zhentarim",
  "battle master",
  "deck of many things",
  "monster manual",
  "player['’]s handbook",
  "dungeon master['’]s guide",
  "manuale dei mostri",
  "manuale del giocatore",
  "guida del dungeon master",
] as const;

const LEXICON = PI_TERMS.map((t) => new RegExp(`\\b${t.replace(/ /g, "\\s+")}\\b`, "i"));

/** Sanctioned lines: the nominative design reference (owner-ratified north star). */
const sanctioned = (line: string) => line.includes("Baldur's Gate 3");

const identityRe = (t: string) => {
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Bare names match whole words, case-blind (a slug such as team-<name>-bard too).
  return /^[A-Za-zÀ-ÿ]+$/.test(t)
    ? new RegExp(`(?<![A-Za-zÀ-ÿ])${escaped}(?![A-Za-zÀ-ÿ])`, "i")
    : new RegExp(escaped, "i");
};

/** Where each part carries a private term: "<label>:<line>: <kind>", in order. */
export function privateTextHits(
  parts: Readonly<Record<string, string>>,
  identity: readonly string[]
): string[] {
  const ids = identity.map(identityRe);
  const hits: string[] = [];
  for (const [label, text] of Object.entries(parts)) {
    text.split("\n").forEach((line, i) => {
      if (sanctioned(line)) return;
      if (LEXICON.some((re) => re.test(line)))
        hits.push(`${label}:${i + 1}: licensed-setting term`);
      if (ids.some((re) => re.test(line))) hits.push(`${label}:${i + 1}: identity value`);
    });
  }
  return hits;
}

/** The pack-side identity list, or null when the pack is not linked. */
export function identityTerms(repoRoot: string): string[] | null {
  const file = join(repoRoot, "content-pack", "private-terms.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as string[]) : null;
}

if (import.meta.url === `file://${resolve(process.argv[1] ?? "")}`) {
  const args = process.argv.slice(2);
  const needPack = args.includes("--need-pack");
  const parts: Record<string, string> = {};
  for (const arg of args.filter((a) => a !== "--need-pack")) {
    const at = arg.indexOf("=");
    // What git strips from a commit message is left out, line numbers kept: its comment
    // lines, and everything below the scissors line (`git commit -v` puts the diff there).
    const raw = readFileSync(arg.slice(at + 1), "utf8").split("\n");
    const cut = raw.findIndex((l) => l.startsWith("# ------------------------ >8"));
    const text = (cut < 0 ? raw : raw.slice(0, cut))
      .map((l) => (l.startsWith("#") ? "" : l))
      .join("\n");
    parts[arg.slice(0, at)] = text;
  }
  const identity = identityTerms(resolve(import.meta.dirname, ".."));
  if (!identity && needPack) {
    console.error(
      "private-text: content-pack is not linked, so the identity values cannot be checked. Link the pack (scripts/program-supervisor/bootstrap-worktree.sh) and run again."
    );
    process.exit(2);
  }
  const hits = privateTextHits(parts, identity ?? []);
  if (hits.length > 0) {
    console.error("private-text: refused. Private terms at:");
    for (const h of hits) console.error(`  ${h}`);
    console.error("Reword those lines (the terms are not printed here) and run again.");
    process.exit(1);
  }
}
