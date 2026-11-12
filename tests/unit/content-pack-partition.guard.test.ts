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
// The audited PI lexicon, shared with the PR and commit text scan.
import { PI_TERMS } from "../../scripts/private-text";

const REPO_ROOT = resolve(__dirname, "../..");
const I18N_ROOT = join(REPO_ROOT, "src/i18n");
const SRC_ROOT = join(REPO_ROOT, "src");
const DATA_ROOT = join(REPO_ROOT, "src/data");

/** Any PI term at all: a cheap first pass before the line-by-line one. */
const PI_ANY = new RegExp(
  PI_TERMS.map((t) => `\\b${t.replace(/ /g, "\\s")}\\b`).join("|"),
  "i"
);

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
      // The ONE sanctioned mention: the SrdSource provenance-union members
      // (single proper nouns as source LABELS for pack entries, no content), from
      // `export type SrdSource =` to the `;` that ends it.
      let inSourceUnion = false;
      const text = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => {
          if (line.includes("export type SrdSource =")) inSourceUnion = true;
          const keep = !inSourceUnion;
          if (inSourceUnion && line.trimEnd().endsWith(";")) inSourceUnion = false;
          return keep;
        })
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
        for (const [, re] of IDENTITY_RES) {
          if (re.test(line)) {
            // The location only: a public CI log must never carry the value.
            offenders.push(`${file.slice(REPO_ROOT.length + 1)}:${i + 1}: identity`);
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
  // ── 4. The whole public tree carries no identity value ─────────────────────
  // Live players' character names, uids, sandbox slugs and the owner's email are
  // private (owner, 2026-11-12): not in code, ids, test titles, fixtures' names or
  // changesets either, since a public CI log prints them. Names match whole-word
  // and case-blind here, so a slug such as `team-<name>-bard` is caught too. The
  // one sanctioned value is the privacy policy's data-controller contact.
  const TREE_ROOTS = ["src", "tests", "scripts", ".changeset", ".github", "docs", "e2e"];
  const TREE_EXTS = [
    ".ts",
    ".tsx",
    ".js",
    ".mjs",
    ".json",
    ".md",
    ".yml",
    ".yaml",
    ".css",
    ".html",
    ".sh",
  ];
  const SANCTIONED = new Set(["src/i18n/en/ui/legal.json", "src/i18n/it/ui/legal.json"]);
  const TREE_RES = IDENTITY_TERMS.map((t) => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return /^[A-Za-zÀ-ÿ]+$/.test(t)
      ? new RegExp(`(?<![A-Za-zÀ-ÿ])${escaped}(?![A-Za-zÀ-ÿ])`, "i")
      : new RegExp(escaped, "i");
  });

  function treeFiles(): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(REPO_ROOT)) {
      if (TREE_EXTS.some((ext) => entry.endsWith(ext))) out.push(join(REPO_ROOT, entry));
    }
    for (const root of TREE_ROOTS) {
      const dir = join(REPO_ROOT, root);
      if (existsSync(dir)) out.push(...walk(dir, TREE_EXTS));
    }
    return out;
  }

  it("no identity value appears anywhere in the public tree", () => {
    const offenders: string[] = [];
    for (const file of treeFiles()) {
      const rel = file.slice(REPO_ROOT.length + 1);
      if (SANCTIONED.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      // One pass over the whole file first: only a file with a hit is read by line.
      if (!TREE_RES.some((re) => re.test(text))) continue;
      text.split("\n").forEach((line, i) => {
        // The location only: a public CI log must never carry the value.
        if (TREE_RES.some((re) => re.test(line))) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
  // ── 5. No PI term in public code, tests, scripts or changesets ─────────────
  // The audited lexicon (public, so this runs in SRD-only PR CI too) also stays out
  // of comments, test titles and changesets, which reach the CHANGELOG. The few
  // sanctioned lines name a non-SRD id ON PURPOSE: a provenance tag's type, and the
  // checks that such content is ABSENT from the public catalogue. Pack-composed
  // corrections still keyed by pack ids are listed until they move to the pack.
  const CODE_ROOTS = ["src", "tests", "scripts", ".changeset"];
  const CODE_EXTS = [".ts", ".tsx", ".js", ".mjs", ".md", ".css", ".sh"];
  const PI_SANCTIONED: ReadonlyArray<readonly [string, RegExp]> = [
    // The provenance tags a pack entry may carry (the type, not content).
    ["src/data/types.ts", /^\s*\| "[A-Z][a-z]+"$/],
    // Non-SRD spells must be absent from the public catalogue.
    [
      "tests/unit/spell-data-integrity.test.ts",
      /getSpellById\("[a-z-]+"\)\)\.toBeUndefined\(\)/,
    ],
    // Pack-composed rows still keyed by pack ids (to move pack-side).
    ["tests/unit/reaction-trigger-structured.test.ts", /^\s*"[a-z-]+": "/],
    ["tests/unit/pack-grant-extensions.test.ts", /monsterIds/],
  ];

  it("no PI term appears in public code, tests, scripts or changesets", () => {
    const offenders: string[] = [];
    for (const root of CODE_ROOTS) {
      const dir = join(REPO_ROOT, root);
      if (!existsSync(dir)) continue;
      for (const file of walk(dir, CODE_EXTS)) {
        const rel = file.slice(REPO_ROOT.length + 1);
        // The lexicon itself: this guard and its home in the PR and commit text scan.
        if (rel === "tests/unit/content-pack-partition.guard.test.ts") continue;
        if (rel === "scripts/private-text.ts") continue;
        const text = readFileSync(file, "utf8");
        // One pass over the whole file first: only a file with a hit is read by line.
        if (!PI_ANY.test(text)) continue;
        text.split("\n").forEach((line, i) => {
          if (isAllowlistedDocLine(line)) return;
          if (PI_SANCTIONED.some(([f, re]) => f === rel && re.test(line))) return;
          for (const term of piHits(line))
            offenders.push(`${rel}:${i + 1}: PI "${term}"`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
