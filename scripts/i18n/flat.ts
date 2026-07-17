/**
 * i18n catalogue PURE helpers — the catalogue value types + the one flattener,
 * with ZERO node/fs imports (i18n build-time LEAK-LOCK, `docs/ARCHITECTURE.md`
 * §2.5).
 *
 * Split out of {@link ./catalogue-io.ts} (which DOES read the disk) so the pure
 * leak DETECTORS (`leak-detectors.ts`) — and therefore the TEST-time parity/dedup
 * guards under `tests/` that import them — depend ONLY on this fs-free module. The
 * tests live in the `tsconfig.app.json` project (no `node` types); pulling in
 * `node:fs` through `catalogue-io.ts` would break their typecheck, so the shared
 * detector chain bottoms out HERE, not in the fs reader. The build gate reads the
 * catalogues via `catalogue-io.ts` and passes the parsed JSON into the detectors.
 */

export type Locale = "en" | "it";
/** The locales the lock asserts over. Add a 3rd here to extend the lock to it. */
export const LOCALES: readonly Locale[] = ["en", "it"];

/** A JSON catalogue: nested objects bottoming out in string / string[] leaves. */
export type Json = { [k: string]: string | Json | string[] };

/**
 * Flatten a catalogue to a `dottedKey -> value` map (leaf string / string[] only).
 * The single flattener the guards + detectors + codegen share.
 */
export function flatEntries(obj: Json, prefix = ""): Map<string, string | string[]> {
  const out = new Map<string, string | string[]>();
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [kk, vv] of flatEntries(v, key)) out.set(kk, vv);
    } else {
      out.set(key, v);
    }
  }
  return out;
}
