/**
 * i18n leak DETECTORS — the single source of truth for "is the catalogue
 * complete?" (i18n build-time LEAK-LOCK, `docs/ARCHITECTURE.md` §2.5).
 *
 * Every leak class the project guards against is decided HERE, once. The
 * BUILD gate (`check-i18n.ts` → the `vite.config.ts` plugin + the `pnpm i18n:check`
 * CLI) and the TEST-time parity/dedup guards (`tests/unit/i18n-*.test.ts`) both
 * import these functions, so the leak logic can never drift between "fails the
 * build" and "fails CI". (DRY: single-source-of-truth, golden rule 6 — one
 * detector, many callers.)
 *
 * PURE: data in → violations out. No fs, no app imports (the caller reads the
 * catalogues via `catalogue-io.ts` and passes them in), so each detector is
 * trivially unit-testable in isolation.
 *
 * The detector set:
 *   1. {@link parityViolations}   — EN↔IT key-set mismatch (either direction).
 *   2. {@link emptyValues}        — an empty / whitespace-only leaf value.
 *   3. {@link englishInItLeaks}   — an IT value byte-identical to EN that still
 *                                   reads as English (the STRONG_EN heuristic).
 *   4. {@link missingReferencedKeys} — a `t("…")` literal in `src/` whose key is
 *                                      absent from the EN UI catalogue.
 */
import { flatEntries, type Json } from "./flat.ts";

// Re-export the shared pure helpers so a caller (the unit guards) imports the WHOLE
// detector surface — flattener + leak checks + the `Json` value type — from this
// ONE module (DRY, golden rule 6).
export { flatEntries };
export type { Json };

// ── 1. EN ↔ IT key parity ────────────────────────────────────────────────────

export interface ParityViolation {
  /** Catalogue label, e.g. `"ui"` or `"srd/spells"`. */
  catalogue: string;
  /** Keys present in `a` but missing from `b`. */
  missingInB: string[];
  /** Keys present in `b` but missing from `a`. */
  missingInA: string[];
}

/**
 * Keys that exist in one locale's catalogue but not the other (both directions).
 * `a`/`b` are the two locales' (already-flattened-or-nested) catalogues.
 */
export function parityViolations(catalogue: string, a: Json, b: Json): ParityViolation {
  const aKeys = new Set(flatEntries(a).keys());
  const bKeys = new Set(flatEntries(b).keys());
  return {
    catalogue,
    missingInB: [...aKeys].filter((k) => !bKeys.has(k)).sort(),
    missingInA: [...bKeys].filter((k) => !aKeys.has(k)).sort(),
  };
}

export const hasParityViolation = (v: ParityViolation): boolean =>
  v.missingInA.length > 0 || v.missingInB.length > 0;

// ── 2. empty / whitespace-only values ────────────────────────────────────────

/** The dotted keys whose leaf value is an empty / whitespace-only string. */
export function emptyValues(cat: Json): string[] {
  return [...flatEntries(cat).entries()]
    .filter(([, v]) => typeof v === "string" && v.trim() === "")
    .map(([k]) => k)
    .sort();
}

// ── 3. English-in-IT leak (EN==IT and still reads as English) ─────────────────
//
// Parity catches a MISSING IT key; it cannot catch an IT value that is PRESENT
// but still English — a string byte-identical to its EN counterpart. A value is
// flagged ONLY when EN == IT *and* it contains strong English-only words
// (function words / giveaway phrasing that are NOT Italian cognates) — so legit
// identical proper nouns ("Blackrazor", "d20 Folio"), loanwords adopted into IT
// D&D ("Warlock", "Ranger", "Round", "Bonus") and abbreviations ("INT") never
// trip it. Deliberately CONSERVATIVE: a false positive would freeze real IT.
//
// This regex is the ONE the original `i18n-parity.test.ts` leak guard used — now
// the build gate AND that unit guard import it from HERE, so they apply the
// IDENTICAL heuristic by construction — do NOT weaken it (golden rule 6). The
// magic-items "only-shrinks" baseline lives with the unit guard
// (`tests/unit/__fixtures__/i18n-magic-item-untranslated.json`), now empty.

const STRONG_EN =
  /\b(the|and|with|your|you|when|this|that|which|creature|attack|damage|spell|saving throw|gain|gains|choose|until|while|takes|roll|must|each|within|bonus action|increase|once|long rest|short rest|magical|otherwise|instead|whenever|made of|appears|wearing|holding|hardest|substances)\b/i;

export interface EnglishLeak {
  /** The catalogue-entity id (top-level object key). */
  id: string;
  /** The field on that entity (e.g. `name`, `description`). */
  field: string;
}

/**
 * The `(id, field)` of every EN==IT leaf in an id-keyed SRD catalogue whose value
 * still reads as English. Operates on the id-keyed catalogue shape
 * (`{ <id>: { <field>: string, … } }`).
 */
export function englishInItLeaks(enCat: Json, itCat: Json): EnglishLeak[] {
  const out: EnglishLeak[] = [];
  for (const id of Object.keys(enCat)) {
    const e = enCat[id];
    const iEntry = itCat[id];
    if (!e || typeof e !== "object" || Array.isArray(e)) continue;
    const i =
      iEntry && typeof iEntry === "object" && !Array.isArray(iEntry) ? iEntry : {};
    for (const field of Object.keys(e)) {
      const ev = (e as Record<string, unknown>)[field];
      if (typeof ev !== "string") continue;
      if (ev !== (i as Record<string, unknown>)[field]) continue; // IT differs → fine
      if (ev.trim().length < 3) continue;
      if (!STRONG_EN.test(ev)) continue;
      out.push({ id, field });
    }
  }
  return out;
}

// ── 4. referenced-key existence (a `t("…")` key missing from the catalogue) ───
//
// A STATIC `t("group.key")` literal whose key is absent from the EN UI catalogue
// is a guaranteed leak — the runtime throwing `missingKeyHandler` would surface it
// only once that surface renders, so the build gate catches it at COMPILE time
// instead. It also covers the `i18n.t(...)` member form. DYNAMIC keys (template
// literals with `${}`, or a variable) are skipped — they cannot be resolved
// statically, are covered by the runtime throwing `missingKeyHandler` + the
// locale-sweep render test, and a typo in their STATIC prefix is still caught here.

/**
 * Strip line comments and block comments from a source so docstring EXAMPLES of
 * `t("…")` (which are documentation, not real calls) aren't scanned. String/
 * template literals are left intact (a `//` inside a string is rare in our `t()`
 * keys and would only cause a benign over-trim of that one line's tail).
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments (incl. JSDoc)
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // line comments (skip `://` in urls)
}

/**
 * Extract the STATIC string-literal first argument of every `t("…")` /
 * `i18n.t("…")` / `.t("…")` call in a source file. Comments are stripped first
 * (docstring examples don't count); template literals containing `${` (dynamic)
 * and non-literal args are skipped (returns only resolvable keys). A light regex
 * scan — fast, and good enough since it only needs to find the literal keys
 * (dynamic ones are intentionally out of scope).
 */
export function staticTKeys(source: string): string[] {
  const keys: string[] = [];
  const code = stripComments(source);
  // `t("…")` or `t('…')` or `t(`…`)` — first arg only, capture the literal body.
  const re = /\bt\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const quote = m[1];
    const body = m[2];
    if (body === undefined) continue; // no captured body (regex can't actually reach this)
    // Template literal with interpolation → dynamic → skip.
    if (quote === "`" && body.includes("${")) continue;
    keys.push(body);
  }
  return keys;
}

/** i18next plural-category suffixes — a `count`-keyed `t()` resolves to one of these. */
const PLURAL_SUFFIXES = ["zero", "one", "two", "few", "many", "other"];

/**
 * Is `key` present in the catalogue key set — directly, or as an i18next PLURAL
 * (`t("x.count", { count })` resolves to `x.count_one` / `x.count_other` / …, so
 * the BARE key is legitimately absent while a `_<category>` variant exists)?
 */
function keyPresent(key: string, known: Set<string>): boolean {
  if (known.has(key)) return true;
  return PLURAL_SUFFIXES.some((s) => known.has(`${key}_${s}`));
}

export interface MissingKeyRef {
  file: string;
  key: string;
}

/**
 * The `t("…")` literals across the given `{ file, source }` set whose key is NOT
 * present in the EN UI catalogue. `enUi` is the merged EN UI catalogue.
 */
export function missingReferencedKeys(
  files: { file: string; source: string }[],
  enUi: Json
): MissingKeyRef[] {
  const known = new Set(flatEntries(enUi).keys());
  const out: MissingKeyRef[] = [];
  for (const { file, source } of files) {
    for (const key of staticTKeys(source)) {
      // Only assert UI-namespace keys (a dotted path whose head is a known UI
      // namespace). `srd:`/`srd.*` token keys and bare interpolation fragments are
      // out of scope (those resolve through the dynamic srd path / are not keys).
      if (!key.includes(".")) continue;
      if (key.includes(" ") || key.includes("{")) continue;
      const head = key.split(".")[0];
      if (head === undefined || !UI_HEADS.has(head)) continue;
      if (!keyPresent(key, known)) out.push({ file, key });
    }
  }
  return out;
}

/**
 * The UI namespace heads a static `t()` key may legitimately address. Populated
 * by the caller from `uiNamespaces()` (we keep it module-level so the regex check
 * stays a cheap Set membership). Set via {@link setUiHeads} before calling
 * {@link missingReferencedKeys}.
 */
let UI_HEADS = new Set<string>();
export function setUiHeads(heads: string[]): void {
  UI_HEADS = new Set(heads);
}
