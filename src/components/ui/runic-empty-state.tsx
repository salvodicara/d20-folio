/**
 * RunicEmptyState — folio empty-state hero (§ .es + .runic).
 *
 * One component for the ~8 empty surfaces (no characters, empty spellbook, no
 * gear, no features, no algorithm, Phase-2 stubs…). A slow-rotating runic sigil
 * (two rings + gem markers) around a lucide glyph, an eyebrow, a serif title
 * (with optional emphasised <em> via the `titleEmphasis` slot), a body blurb,
 * and an optional CTA row. Honest-blank friendly: render it when a list is empty
 * rather than an empty container.
 */

import type { ComponentType, ReactNode, SVGProps } from "react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

export interface RunicEmptyStateProps {
  /** A lucide icon component for the central glyph. */
  glyph: ComponentType<SVGProps<SVGSVGElement>>;
  title: ReactNode;
  /** When `title` is a string, the first occurrence of this word is wrapped in
   *  the gold-rubric `<em>` slot (`.es-title em`) — e.g. "Your **folio** awaits".
   *  Locale-safe (matches the already-translated title). */
  titleEmphasis?: string;
  blurb?: ReactNode;
  eyebrow?: ReactNode;
  /** CTA buttons / links. */
  actions?: ReactNode;
  /** Small footnote under the actions. */
  note?: ReactNode;
  /** Compact padding variant for in-card empties. */
  size?: "md" | "sm";
  /** Override the sigil accent color (raw CSS color/token). */
  color?: string;
  className?: string;
}

/** Wrap the first case-insensitive occurrence of `emphasis` in `title` in an
 *  `<em>` so the gold-rubric `.es-title em` slot lights up. No-op unless `title`
 *  is a plain string that contains the word. */
function renderTitle(title: ReactNode, emphasis?: string): ReactNode {
  if (typeof title !== "string" || !emphasis) return title;
  const idx = title.toLowerCase().indexOf(emphasis.toLowerCase());
  if (idx < 0) return title;
  return (
    <>
      {title.slice(0, idx)}
      <em>{title.slice(idx, idx + emphasis.length)}</em>
      {title.slice(idx + emphasis.length)}
    </>
  );
}

export function RunicEmptyState({
  glyph,
  title,
  titleEmphasis,
  blurb,
  eyebrow,
  actions,
  note,
  size = "md",
  color,
  className,
}: RunicEmptyStateProps) {
  const style: CSSProperties | undefined = color
    ? { ["--es-c" as string]: color }
    : undefined;
  return (
    <div className={cn("es", size === "sm" && "sm", className)} style={style}>
      <div className="runic">
        <span className="runic-ring" aria-hidden="true" />
        <span className="runic-ring inner" aria-hidden="true" />
        <span className="runic-gem top" aria-hidden="true" />
        <span className="runic-gem bot" aria-hidden="true" />
        <span className="runic-glyph">
          <Icon as={glyph} size="lg" decorative />
        </span>
      </div>
      {eyebrow ? <span className="es-eyebrow">{eyebrow}</span> : null}
      <h2 className="es-title">{renderTitle(title, titleEmphasis)}</h2>
      {blurb ? <p className="es-blurb">{blurb}</p> : null}
      {actions ? <div className="es-cta-row">{actions}</div> : null}
      {note ? <span className="es-note">{note}</span> : null}
    </div>
  );
}
