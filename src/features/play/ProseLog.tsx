/**
 * The prose log — the right edge: what happened (UI spec rules 28, 31).
 *
 * Prose, not a table: sentences over the map with the author in grey at the end. The lines are
 * the presenter's (`buildLogLines`), so nothing is formatted here that the drawer's Registro tab
 * would format differently — one presenter, two densities.
 *
 * It is `pointer-events: none` on purpose: this is the ambient record, and every verb it could
 * offer (undo, edit) lives in the DM drawer, where there is room to say what it does.
 */
import { useTranslation } from "react-i18next";
import type { LogLine } from "@/lib/views/encounter-log-view";

export interface ProseLogProps {
  readonly lines: readonly LogLine[];
  /** How many of the newest lines to keep on the map. */
  readonly limit?: number;
  /** uid → display name, for a line another member authored. */
  readonly authorOf: (author: LogLine["author"]) => string;
}

export function ProseLog({ lines, limit = 5, authorOf }: ProseLogProps) {
  const { t } = useTranslation();
  const shown = lines.slice(-limit);
  if (shown.length === 0) return null;
  return (
    <div
      className="pl-float pl-log"
      role="log"
      aria-live="polite"
      aria-label={t("play.log.aria")}
      data-testid="pl-log"
    >
      {shown.map((line) => (
        <p key={line.id} data-kind={line.kind}>
          {line.text}
          <span className="pl-log__author">{authorOf(line.author)}</span>
        </p>
      ))}
    </div>
  );
}
