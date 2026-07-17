/**
 * E2E: locale-sweep render assertion — i18n completeness LOCK 5
 * (`docs/ARCHITECTURE.md` §2.5).
 *
 * Drives EVERY surface in the shared `SURFACES` model in BOTH locales (en + it),
 * navigate-only (no axe, no pixel-diff — CHEAP, always-on), and fails the moment
 * an untranslated string leaks. With LOCK 2 (the throwing missing-key handler +
 * `parseMissingKeyHandler` ⟦…⟧ sentinel + no dev/test `fallbackLng`) and LOCK 3
 * (no inline `defaultValue`), a missing key can no longer silently render English —
 * it surfaces as a sentinel/raw key here. This is the FUNCTIONAL companion to the
 * pixel-only `visual-full.spec.ts` sweep: it fails on EVERY CI run, not just the
 * non-blocking pixel matrix.
 *
 * It fails on:
 *   (a) any raw i18n key visible    — `<namespace>.<dotted.path>` rendered literally;
 *   (b) the ⟦…⟧ missing-key sentinel — emitted by `parseMissingKeyHandler`;
 *   (c) English-in-IT               — a curated denylist of distinctly-English UI
 *       tokens that must never appear in the IT render (each has a different IT
 *       translation in the catalogue, so its presence means an EN string leaked).
 *
 * Self-enforcing coverage: a new surface in `surface-manifest.ts` is swept here
 * automatically (no per-page wiring), so i18n coverage can't rot as pages are added.
 */

import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { SURFACES, seedUI, seedLang, type Locale } from "./surfaces";

const LOCALES: Locale[] = ["en", "it"];

/**
 * A raw-key leak = visible text that is a literal catalogue path, e.g.
 * `character.hud.cycleSaveProf`. Built from the ACTUAL top-level namespaces so it
 * can't false-positive on unrelated dotted text (filenames, versions, urls).
 *
 * SLICE 8: `common.json` is split into per-domain `ui/<group>.json` shards. The
 * shard FILE NAME is exactly the top-level namespace, so the namespace list is the
 * `ui/` directory listing (no monolith to import).
 */
const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/i18n/en/ui");
const NAMESPACES = readdirSync(UI_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));
const RAW_KEY_RE = new RegExp(
  `\\b(?:${NAMESPACES.join("|")})(?:\\.[a-zA-Z][a-zA-Z0-9_]*){1,}\\b`
);

/** The missing-key sentinel emitted by i18n `parseMissingKeyHandler`. */
const SENTINEL_RE = /⟦[^⟧]+⟧/;

/**
 * Curated English-in-IT denylist. Each token is a whole-word English UI string
 * whose IT translation in the catalogue is DIFFERENT — so seeing it in the IT
 * render means an English string leaked. Proper nouns (Lyra Voss, Starless
 * Keep, d20 Folio) and EN≈IT cognates (e.g. "Status") are deliberately excluded.
 */
const ENGLISH_IN_IT = [
  "Characters",
  "Settings",
  "Add to character",
  "Cancel",
  "Delete",
  "Save changes",
  "Long Rest",
  "Short Rest",
  "Spells",
  "Features",
  "Inventory",
  "Skills",
  "No results found",
  "Already added",
  // HEAL-SEAM P1 — the class-level heal-chip leak. The Second Wind chip read
  // "1d10 + Fighter level HP" in IT because the amount was regex-extracted from
  // the EN prose; the fix makes it declarative + presenter-localized ("livello da
  // Guerriero"). This phrase (and any other class's "<Class> level") must never
  // render in IT — the `fighter-second-wind-chip` surface renders the chip.
  "Fighter level",
  "Paladin level",
  "Cleric level",
  "Ranger level",
  "Warlock level",
];
const ENGLISH_IN_IT_RE = new RegExp(
  `\\b(?:${ENGLISH_IN_IT.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`
);

/**
 * Raw engine DATA tokens — the sibling of `RAW_KEY_RE`, checked in BOTH locale
 * passes: a stable id token (a `Recovery` code) rendered verbatim instead of via
 * its presenter (`localizeTrackerRecovery`) is a leak in EVERY locale, not just
 * English-in-IT — the compendium feature-detail leak showed "Long-Rest" in EN
 * and IT alike (CSS-capitalized, so the DOM text is the lowercase token; a
 * word-cased denylist entry could never match it). A raw token never passes
 * through `t()`, so no key-based lock can fire — only a rendered-text check.
 * (`long-rest` also matches inside `short-or-long-rest`; hyphens are word
 * boundaries, so a legitimate prose "short rest" never trips it.)
 */
const RAW_TOKEN_RE = /\b(?:long-rest|short-rest)\b/;

/**
 * Weapon Mastery property tokens — the raw English FACT (`WeaponMastery`) must
 * NEVER render in an IT surface (the picker, weapon cards, the compendium facet);
 * each has a distinct official IT SRD 5.2.1 name (Doppio Fendente, Colpo di
 * Striscio, Graffio, Spinta, Fiaccare, Lentezza, Rovesciamento, Vessazione). This
 * is the exact leak the owner caught.
 *
 * Checked CASE-INSENSITIVELY and separately from the generic denylist because the
 * picker/card CSS `text-transform: uppercase`s the property note — so a leak shows
 * as "TOPPLE", not "Topple", and a case-sensitive match would miss it. The IT names
 * are not English words, so this never false-positives on a correctly-localized row.
 */
const MASTERY_TOKEN_RE = /\b(?:Cleave|Graze|Nick|Push|Sap|Slow|Topple|Vex)\b/i;

for (const surface of SURFACES) {
  for (const locale of LOCALES) {
    test(`i18n-sweep: ${surface.slug} [${locale}] — no untranslated string`, async ({
      page,
    }) => {
      // The dev server runs in DEV mode, so LOCK 2's `missingKeyHandler` THROWS on a
      // missing key. A throw during render is caught by the app's error boundary (so the
      // DOM may show a recovery UI, not the raw key) — capture the thrown/logged i18n
      // error directly so the sweep fails on it, not just on visible-text leaks.
      const i18nErrors: string[] = [];
      const record = (msg: string): void => {
        if (msg.includes("[i18n] missing key")) i18nErrors.push(msg);
      };
      page.on("pageerror", (err) => record(err.message));
      page.on("console", (m) => {
        if (m.type() === "error") record(m.text());
      });

      await seedUI(page, "dark", surface.edit ? "edit" : "play");
      await seedLang(page, locale);
      await page.goto(surface.route, { waitUntil: "domcontentloaded" });
      await surface.ready(page);
      if (surface.prepare) await surface.prepare(page);

      const text = await page.evaluate(() => document.body.innerText);

      expect(
        i18nErrors,
        `i18n missing-key error(s) thrown on ${surface.slug} [${locale}]:\n${i18nErrors.join("\n")}`
      ).toEqual([]);

      const sentinel = SENTINEL_RE.exec(text);
      expect(
        sentinel,
        `missing-key sentinel rendered on ${surface.slug} [${locale}]: ${sentinel?.[0] ?? ""}`
      ).toBeNull();

      const rawKey = RAW_KEY_RE.exec(text);
      expect(
        rawKey,
        `raw i18n key visible on ${surface.slug} [${locale}]: ${rawKey?.[0] ?? ""}`
      ).toBeNull();

      const rawToken = RAW_TOKEN_RE.exec(text);
      expect(
        rawToken,
        `raw engine data token rendered on ${surface.slug} [${locale}]: ${rawToken?.[0] ?? ""}`
      ).toBeNull();

      if (locale === "it") {
        const leak = ENGLISH_IN_IT_RE.exec(text);
        expect(
          leak,
          `English string leaked into the IT render of ${surface.slug}: ${leak?.[0] ?? ""}`
        ).toBeNull();

        // A raw Weapon Mastery property token (case-insensitive — the picker/card
        // uppercases it) must never appear in an IT surface; it has a distinct IT
        // catalogue name. Caught the owner's "TOPPLE/VEX in the IT picker" leak.
        const masteryLeak = MASTERY_TOKEN_RE.exec(text);
        expect(
          masteryLeak,
          `raw English Weapon Mastery token leaked into the IT render of ${surface.slug}: ${masteryLeak?.[0] ?? ""}`
        ).toBeNull();
      }
    });
  }
}
