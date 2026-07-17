/**
 * Content-pack partition guards (docs/ARCHITECTURE.md → "The content-pack
 * seam") — the public-side licensing invariants. These live in tests/unit so
 * the future PUBLIC repo snapshot keeps enforcing them:
 *
 *  1. **PI-term denylist** — no Product-Identity term (the audited lexicon:
 *     setting names, creator names, non-SRD monster names, WotC book titles in
 *     EN + IT) appears in any public i18n VALUE or anywhere in `src/data/**`.
 *     The pack alone may carry them. Id SLUGS are exempt by construction (the possessive forms —
 *     `tashas-…` — don't match the word-bounded tokens, and values are scanned
 *     without their keys).
 *  2. **Source-tag invariant** — every `source:` tag in `src/data/**` is
 *     `"SRD"`; every non-SRD provenance tag lives in `content-pack/`.
 *  3. **Docs stay publishable** — no PI term, no live-user fixture name, no
 *     admin uid, no owner email in `docs/*.md`, the root `*.md` files, or
 *     `.github/**` (the would-be-public doc surface). The ONE sanctioned
 *     exception is the nominative "Baldur's Gate 3" design reference.
 *
 * All are pure fs scans — mode-independent (they see the same files whether
 * or not the pack is composed in).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");
const I18N_ROOT = join(REPO_ROOT, "src/i18n");
const SRC_ROOT = join(REPO_ROOT, "src");
const DATA_ROOT = join(REPO_ROOT, "src/data");

/**
 * The audited PI lexicon (Phase-0 licensing audit): terms absent from SRD
 * 5.2.1 whose presence marks non-licensed content. Multi-word phrases match
 * as written; single tokens match word-bounded.
 */
const PI_TERMS = [
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

const PI_RES = PI_TERMS.map(
  (t) => [t, new RegExp(`\\b${t.replace(/ /g, "\\s")}\\b`, "i")] as const
);

function piHits(text: string): string[] {
  return PI_RES.filter(([, re]) => re.test(text)).map(([t]) => t);
}

function walk(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

/** Every leaf string VALUE of a nested JSON catalogue (keys excluded). */
function leafValues(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) for (const v of node) leafValues(v, out);
  else if (node && typeof node === "object") {
    for (const v of Object.values(node)) leafValues(v, out);
  }
  return out;
}

describe("content-pack partition — public-side licensing invariants", () => {
  it("no PI term appears in any public i18n catalogue value", () => {
    const offenders: string[] = [];
    for (const file of walk(I18N_ROOT, [".json"])) {
      const values = leafValues(JSON.parse(readFileSync(file, "utf8")));
      for (const value of values) {
        for (const term of piHits(value)) {
          offenders.push(
            `${file.slice(REPO_ROOT.length + 1)}: "${term}" in ${JSON.stringify(value.slice(0, 80))}`
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no PI term appears anywhere in src/** (code, comments, values)", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT, [".ts", ".tsx"])) {
      const text = readFileSync(file, "utf8")
        .split("\n")
        // The ONE sanctioned mention: the SrdSource provenance-union members
        // (single proper nouns as source LABELS for pack entries, no content).
        .filter((line) => !line.includes("export type SrdSource ="))
        .join("\n");
      for (const term of piHits(text)) {
        offenders.push(`${file.slice(REPO_ROOT.length + 1)}: "${term}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // ── 3. The doc surface (docs/*.md + root *.md + .github/**) ───────────────
  // The docs partition (content-pack/docs/) keeps pack-entity discussion out of
  // the public docs; this lock makes a regression machine-caught. Identity
  // values (the admin uid, live-user fixture names, the owner email) are never
  // written down publicly — NOT EVEN HERE (a denylist carrying the secret would
  // re-leak it): the list lives pack-side (`content-pack/private-terms.json`)
  // and the scan skips it when the pack is absent (the public snapshot has
  // neither the values nor a source for them).
  const PRIVATE_TERMS_FILE = join(REPO_ROOT, "content-pack", "private-terms.json");
  const IDENTITY_TERMS: readonly string[] = existsSync(PRIVATE_TERMS_FILE)
    ? (JSON.parse(readFileSync(PRIVATE_TERMS_FILE, "utf8")) as string[])
    : [];
  // Bare personal names match word-bounded + case-sensitive (so "Dario" never
  // flags "leggendario"); uids/emails/slugs match as plain substrings.
  const IDENTITY_RES = IDENTITY_TERMS.map((t) => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [
      t,
      /^[A-Za-zÀ-ÿ]+$/.test(t)
        ? new RegExp(`(?<![A-Za-zÀ-ÿ])${escaped}(?![A-Za-zÀ-ÿ])`)
        : new RegExp(escaped),
    ] as const;
  });

  /** Sanctioned citation lines the doc scan skips. */
  function isAllowlistedDocLine(line: string): boolean {
    // The nominative design reference (owner-ratified aesthetic north star).
    return line.includes("Baldur's Gate 3");
  }

  function docSurfaceFiles(): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(REPO_ROOT)) {
      if (entry.endsWith(".md")) out.push(join(REPO_ROOT, entry));
    }
    out.push(...walk(join(REPO_ROOT, "docs"), [".md"]));
    out.push(...walk(join(REPO_ROOT, ".github"), [".yml", ".yaml", ".md"]));
    return out;
  }

  it("no PI term / identity value appears in the public doc surface", () => {
    const offenders: string[] = [];
    for (const file of docSurfaceFiles()) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (isAllowlistedDocLine(line)) return;
        for (const term of piHits(line)) {
          offenders.push(`${file.slice(REPO_ROOT.length + 1)}:${i + 1}: PI "${term}"`);
        }
        for (const [term, re] of IDENTITY_RES) {
          if (re.test(line)) {
            offenders.push(
              `${file.slice(REPO_ROOT.length + 1)}:${i + 1}: identity "${term}"`
            );
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('every source tag in src/data/** is "SRD"', () => {
    const offenders: string[] = [];
    let count = 0;
    for (const file of walk(DATA_ROOT, [".ts"])) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bsource:\s*"([A-Z][A-Za-z]*)"/g)) {
        count += 1;
        if (m[1] !== "SRD") {
          offenders.push(`${file.slice(REPO_ROOT.length + 1)}: source "${m[1] ?? ""}"`);
        }
      }
    }
    // Sanity: the crawl actually saw the tags.
    expect(count).toBeGreaterThan(700);
    expect(offenders).toEqual([]);
  });
});
