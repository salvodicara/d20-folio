/**
 * GR7 lock — every `advantage-on` / `disadvantage-on` grant's `vs` field across
 * `src/data/**` is a STABLE ID-SLUG, never an English display string.
 *
 * Why this exists: the `vs` field is metadata only — it is read by NO consumer
 * for display (the rail renders the clause's localized `description`, gated by
 * `rollType`/`mode`, never by `vs`; `hasInitiativeAdvantage` gates on `rollType`).
 * So an English literal in `vs` (e.g. `"Death Saving Throws"`, `"Charmed"`) is a
 * GR7 language LEAK by construction — a display-shaped string living in code —
 * even though it never reaches the screen today. This guard makes that
 * impossible: any future English `vs` literal fails CI here. The localized label
 * that DOES render lives in the SRD i18n catalogue (the grant's `description`),
 * resolved at the presenter boundary — never from `vs`.
 *
 * Pure string crawl over the memoized `src/**` snapshot (golden rule 13) — no
 * data import, no engine, no locale.
 *
 * The file also hosts the companion AUTHORING lock for the same grants: a clause's
 * localized `description` — the string the rail actually renders — must NOT restate
 * its own polarity, because the row already labels it "Adv." / "Disadv." (post-sweep
 * defect G: "Adv. Advantage on Initiative rolls." beside "Adv. Initiative rolls").
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { srcFiles, readSrc, SRC_ROOT } from "./__helpers__/src-files";

const DATA_ROOT = resolve(SRC_ROOT, "data");
// The content pack's data tree obeys the SAME GR7 lock (crawled via fs so the
// guard is mode-independent; absent in the public snapshot).
const PACK_DATA_ROOT = resolve(SRC_ROOT, "..", "content-pack", "data");

function packDataFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...packDataFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** A stable id-slug: lowercase letters / digits / hyphens only — no spaces, no caps. */
const SLUG = /^[a-z0-9-]+$/;

/** Match every `vs: "<value>"` literal (the field is only ever a string literal). */
const VS_RE = /\bvs:\s*"((?:[^"\\]|\\.)*)"/g;

/** The SRD i18n catalogues (public + pack when composed) — where grant `description`s live. */
const I18N_ROOTS = [
  resolve(SRC_ROOT, "i18n"),
  resolve(SRC_ROOT, "..", "content-pack", "i18n"),
].filter(existsSync);

/**
 * A grant description that OPENS with its own polarity ("Advantage on Initiative
 * rolls", "Vantaggio ai tiri di Iniziativa"). Forbidden: the rail row already
 * carries the polarity as its label, so such a description renders as a stutter —
 * "Adv. Advantage on Initiative rolls." — beside sibling rows in the terse
 * roll-naming register ("Adv. Initiative rolls"). Post-sweep defect G.
 */
const POLARITY_OPENER =
  /^(Advantage|Disadvantage) on |^(Vantaggio|Svantaggio) (ai|agli|alle|nei|nelle) /;

/** Walk `<root>/{en,it}/srd/*.json` collecting every `*.grants.*` description. */
function grantDescriptions(): Array<{ file: string; key: string; text: string }> {
  const out: Array<{ file: string; key: string; text: string }> = [];
  for (const root of I18N_ROOTS) {
    for (const locale of ["en", "it"]) {
      const dir = join(root, locale, "srd");
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        const shard = JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<
          string,
          unknown
        >;
        for (const [key, entry] of Object.entries(shard)) {
          if (!key.includes(".grants.") || typeof entry !== "object" || entry === null)
            continue;
          const text = (entry as Record<string, unknown>).description;
          if (typeof text === "string")
            out.push({ file: `${locale}/srd/${name}`, key, text });
        }
      }
    }
  }
  return out;
}

describe("grant descriptions never restate their own polarity (rail register lock)", () => {
  it("no advantage/disadvantage grant description opens with Advantage/Vantaggio", () => {
    const descriptions = grantDescriptions();
    // Sanity: the crawl actually reached the catalogues.
    expect(descriptions.length).toBeGreaterThan(50);
    const offenders = descriptions
      .filter((d) => POLARITY_OPENER.test(d.text))
      .map((d) => `${d.file} ${d.key}: "${d.text}"`);
    expect(
      offenders,
      `grant descriptions restating their polarity (the rail row already says Adv./Disadv.):\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});

describe("advantage `vs` is always a stable id-slug (GR7 lock)", () => {
  it("no `vs` literal in src/data/ is an English display string", () => {
    const offenders: Array<{ file: string; value: string }> = [];
    let count = 0;
    const sources = [
      ...srcFiles({ under: DATA_ROOT, exts: [".ts"] }).map(
        (f) => [f, readSrc(f)] as const
      ),
      ...packDataFiles(PACK_DATA_ROOT).map((f) => [f, readFileSync(f, "utf8")] as const),
    ];
    for (const [file, src] of sources) {
      for (const m of src.matchAll(VS_RE)) {
        count += 1;
        const value = m[1] ?? "";
        if (!SLUG.test(value)) {
          offenders.push({ file, value });
        }
      }
    }
    // Sanity: the crawl actually found the grants (guards against a moved field
    // silently passing with zero matches). Composition-aware floor: src/data
    // alone carries 47 `vs` literals (the SRD-only / public tree); the composed
    // tree adds the pack's on top.
    expect(count).toBeGreaterThan(existsSync(PACK_DATA_ROOT) ? 50 : 40);
    expect(
      offenders,
      `non-slug \`vs\` literals (English leak):\n${JSON.stringify(offenders, null, 2)}`
    ).toEqual([]);
  });
});
