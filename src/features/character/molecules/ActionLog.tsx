/**
 * ActionLog Component
 *
 * Displays the session's action/combat log in a compact scrollable list. The log
 * is a play NARRATIVE: each entry is a STRUCTURED {@link import("@/types/combat-log").CombatEvent}
 * (ids + numbers, locale-independent), localized to its display line + glyph + hue
 * at render by `lib/views/combat-log-view.ts`. So the SAME stored log renders fully
 * in the active language and a language switch re-localizes the whole feed (the
 * mixed-language bug's root-cause fix). Shown in the Play tab / via the More menu.
 */

import { useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useCharacterStore } from "@/stores/characterStore";
import { useLocale } from "@/hooks/useLocale";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { formatLogTime } from "@/lib/action-log-style";
import { localizeCombatLogRow, type CombatLogRow } from "@/lib/views/combat-log-view";
import { concentrationLabel, grantSourceLabel } from "@/lib/views/tracker-view";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Icon } from "@/components/ui/icon";
import { ScrollText, Trash2 } from "lucide-react";
import type { LogEntry } from "@/types/character";
import type { LocText } from "@/lib/loc-text";
import { localizeText } from "@/lib/views/srd-i18n";

export function ActionLog({ maxEntries = 50 }: { maxEntries?: number }) {
  const { t } = useTranslation();
  const { language } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const clearLog = useCharacterStore((s) => s.clearLog);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ONE presenter call per row: localize the structured event → its line + style.
  // `language` is in the deps so a locale switch re-localizes the whole feed.
  const renderRow = useCallback(
    (event: LogEntry["event"]) =>
      localizeCombatLogRow(
        event,
        t,
        (conditionId) =>
          hasSrd("condition", conditionId, "name", language)
            ? localizeSrd("condition", conditionId, "name", language)
            : conditionId,
        (sourceId) => grantSourceLabel(sourceId, language),
        // Concentration is stored as a spell id (golden rule 7) → localize it.
        (value) => concentrationLabel(value, language),
        // An action's NAME is the engine's localizable LocText reference (the SAME
        // ref `localizeAction` carried on the resolved action) → resolve it the same
        // way as a rider: `localizeText` handles every variant (an `srd` catalogue
        // id-ref localizes via the SRD store, a `lit` constant reads its bilingual
        // text, a `custom` homebrew name shows verbatim — golden rule 7).
        (loc: LocText) => localizeText(loc, language),
        // A rider's provenance is the engine's localizable LocText reference → resolve it.
        (rider: LocText) => localizeText(rider, language)
      ),
    [t, language]
  );

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [character?.session.logEntries.length]);

  if (!character) return null;

  const entries = character.session.logEntries.slice(-maxEntries);

  // The log wears the SAME section vocabulary as its Play-tab siblings (craft
  // law 6): the shared SectionHeader rubric (diamond · title · count medallion ·
  // fading rule) over a CARVED well (`--elev-recessed` — a channel you read
  // into, per the carved-in/embossed-out rule) instead of the old bespoke boxed
  // header on a flat fill. The raised `.log-row` tiles sit inside the channel.
  if (entries.length === 0) {
    return (
      <section>
        <SectionHeader tight title={t("actionLog.title")} />
        <div className="rounded-md border border-border-medium bg-[var(--bg-recessed)] p-4 text-center shadow-[var(--elev-recessed)]">
          <ScrollText className="mx-auto mb-2 h-5 w-5 text-text-secondary opacity-50" />
          <p className="text-xs text-text-secondary">{t("actionLog.empty")}</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader tight title={t("actionLog.title")} count={entries.length} />
      <div className="rounded-md border border-border-medium bg-[var(--bg-recessed)] shadow-[var(--elev-recessed)]">
        {/* role="log" + tabIndex so keyboard users can focus and scroll the feed
            (axe scrollable-region-focusable); aria-label names the region. */}
        <div
          ref={scrollRef}
          className="max-h-[200px] overflow-y-auto p-2"
          role="log"
          tabIndex={0}
          aria-label={t("actionLog.title")}
        >
          {entries.map((entry) => (
            <LogEntryRow key={entry.id} entry={entry} render={renderRow} />
          ))}
        </div>
        {/* Clear lives INSIDE the surface it clears (a header is a rubric, never
            a control — the SectionHeader doctrine), as a quiet footer verb. */}
        <div className="flex justify-end border-t border-border-subtle px-2 py-1">
          <button
            onClick={clearLog}
            className="flex min-h-6 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[length:var(--text-micro)] uppercase tracking-[0.08em] text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-error"
            title={t("actionLog.clearTitle")}
          >
            <Trash2 className="h-3 w-3" />
            {t("actionLog.clear")}
          </button>
        </div>
      </div>
    </section>
  );
}

function LogEntryRow({
  entry,
  render,
}: {
  entry: LogEntry;
  render: (event: LogEntry["event"]) => CombatLogRow;
}) {
  // GLYPH shape from the event's semantics; ROW COLOUR from the economy slot
  // (action=green, bonus=blue, reaction=red, free=grey) — the same `--at-<slot>`
  // family the cockpit cards use, resolved by the presenter from the structured
  // event. A slot-less event keeps its semantic hue. No more semantic-vs-economy
  // drift, and the line is fully localized at render.
  const { text, style } = render(entry.event);

  return (
    <div className="log-row" style={{ borderLeftColor: style.borderColor }}>
      <span className="log-glyph shrink-0" style={{ color: style.glyphColor }}>
        <Icon as={style.glyph} size="xs" decorative />
      </span>
      <span className="log-body">
        <span className="log-text leading-tight">{text}</span>
        <span className="log-ts font-mono">{formatLogTime(entry.ts)}</span>
      </span>
    </div>
  );
}
