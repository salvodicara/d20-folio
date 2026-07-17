/**
 * Concentration storage primitives — the WRITE minters + the boundary read-normalizer
 * for the branded {@link ConcentrationRef} (golden rule 7). Deliberately TINY +
 * pure (only the spell index + the id brands) so the codec can import it without the
 * presenter / i18n graph, and so it stays off the SRD-free eager-persistence path.
 *
 * THE CODE SPEAKS ONLY IDS (golden rule 7): there is NO minter that accepts a display
 * name for an SRD spell. `concentrationValue` takes a stable id and nothing else;
 * `customConcentrationValue` takes a GENUINE custom user-authored name (a homebrew
 * spell with no SRD id) — the one sanctioned string, visibly distinct so a localized
 * SRD label can never be smuggled in.
 */
import { spellIndex } from "@/data/spells";
import type { ConcentrationRef, StoredConcentration } from "@/types/ids";
import type { LogEntry } from "@/types/character";

/** Marker prefixing a CUSTOM (non-SRD) concentration spell's user-authored name. */
export const CUSTOM_CONCENTRATION_PREFIX = "custom:";

/**
 * Stamp concentration on an SRD spell — the ONLY input is its STABLE `srdId` (golden
 * rule 7: no display string, ever). The id localizes at the render boundary.
 */
export function concentrationValue(spellId: string): ConcentrationRef {
  return spellId as ConcentrationRef;
}

/**
 * Stamp concentration on a CUSTOM (homebrew) spell that has NO SRD id — its
 * user-authored `customName` (genuine custom input, the one allowed string) behind the
 * marker. NEVER call this with a localized SRD label; use {@link concentrationValue}
 * with the id for any SRD spell.
 */
export function customConcentrationValue(customName: string): ConcentrationRef {
  return `${CUSTOM_CONCENTRATION_PREFIX}${customName}` as ConcentrationRef;
}

/**
 * Boundary read-normalization (golden rule 10 — the bounded one-way untrusted-input
 * seam): conform a RAW stored concentration value to a valid {@link StoredConcentration}
 * so a legacy bare NAME can never reach the strict resolver. "" stays "" (not
 * concentrating); a valid spell id or a `custom:`-marked value passes through; anything
 * else is marked `custom:` (shown verbatim, never crashes). The one-off migration
 * resolves legacy NAMES to their proper ids in the STORED data; this is the in-memory
 * safety net for any not-yet-migrated doc — never written back as the old shape.
 */
export function normalizeStoredConcentration(raw: unknown): StoredConcentration {
  if (typeof raw !== "string" || raw === "") return "";
  return normalizeConcentrationRef(raw);
}

/**
 * Conform a NON-EMPTY concentration ref (a `concentration-start/-end` log event's
 * `spell`, which is always set) to a valid {@link ConcentrationRef} — a valid spell id
 * or a `custom:`-marked value passes through; a legacy bare NAME is marked `custom:` so
 * it can never reach the strict resolver. Like {@link normalizeStoredConcentration} but
 * never `""` (a log event always names a spell).
 */
export function normalizeConcentrationRef(raw: string): ConcentrationRef {
  if (raw.startsWith(CUSTOM_CONCENTRATION_PREFIX)) return raw as ConcentrationRef;
  if (spellIndex.has(raw)) return raw as ConcentrationRef;
  return `${CUSTOM_CONCENTRATION_PREFIX}${raw}` as ConcentrationRef;
}

/**
 * The SRD-AWARE companion to the SRD-free {@link normalizeLogEntry} boundary: conform a
 * RESTORED combat-log entry's concentration `event.spell` (a legacy bare NAME) to a valid
 * {@link ConcentrationRef} so it can never reach the strict `concentrationLabel` resolver
 * (which renders a `⟦…⟧` sentinel in prod / throws in dev on a non-id). A no-op for any
 * non-concentration event. `normalizeLogEntry` CANNOT do this — it is SRD-free (it lives on
 * the eager-persistence path and may not pull `spellIndex`), so EVERY read path that
 * restores stored log entries (the Firestore/JSON-import codec AND the IndexedDB restore)
 * maps through this ONE helper (golden rule 6 — symmetric boundaries, no drift). One-way
 * (golden rule 10): the conformed value is never written back as the old bare name.
 */
export function normalizeLogEntryConcentration(entry: LogEntry): LogEntry {
  const ev = entry.event;
  if (ev.kind === "concentration-start" || ev.kind === "concentration-end") {
    return { ...entry, event: { ...ev, spell: normalizeConcentrationRef(ev.spell) } };
  }
  return entry;
}
