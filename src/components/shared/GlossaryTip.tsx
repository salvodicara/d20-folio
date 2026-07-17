/**
 * GlossaryTip — the ONE plain-language glossary primitive (P2, golden rule 20:
 * beginner-friendly, expert-capable).
 *
 * Wraps a visible D&D term (a stat label, a section rubric, a word inside a
 * wizard hint) in a quiet dotted-underline trigger; tapping/clicking it opens
 * the branded folio Popover with a one-breath plain-language explanation.
 * Strictly progressive disclosure: nothing is visible by default, experts can
 * ignore it entirely, and a tap anywhere else (or Esc) dismisses it. Click-to-
 * open works identically with mouse, keyboard, and touch (a hover tooltip would
 * exclude phones), and the trigger's hit area is padded outward so the tiny
 * labels stay comfortably tappable without shifting layout.
 *
 * ONE catalogue: bodies live in `src/i18n/{en,it}/ui/glossary.json` under
 * `glossary.term.<id>` (id-keyed, EN + IT). The popover RUBRIC (the term's full
 * display name) is passed by the caller from the term's EXISTING canonical key
 * (`character.vitals.acFull`, `spells.concentration`, …) — never re-declared in
 * the glossary shard (golden rule 6: one string, one key). Coverage grows by
 * adding a catalogue entry + wrapping the label; no new code paths.
 *
 * Works as a `<Trans components={{ g: <GlossaryTip … /> }}>` slot too: i18next
 * supplies the children (the marked words inside the localized sentence).
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** The glossary catalogue ids — typed off the EN shard (type-only, not bundled). */
type GlossaryCatalogue =
  (typeof import("@/i18n/en/ui/glossary.json"))["glossary"]["term"];
export type GlossaryTermId = keyof GlossaryCatalogue;

export interface GlossaryTipProps {
  /** Catalogue id — resolves the body via `glossary.term.<id>`. */
  term: GlossaryTermId;
  /** The term's full localized display name (from its existing canonical key). */
  rubric: string;
  /** The visible label the trigger wraps (Trans supplies it when used as a slot). */
  children?: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
}

export function GlossaryTip({
  term,
  rubric,
  children,
  side = "top",
  align = "center",
  className,
}: GlossaryTipProps) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("glossary-term", className)}
          aria-label={t("glossary.whatIs", { term: rubric })}
        >
          {children ?? rubric}
        </button>
      </PopoverTrigger>
      <PopoverContent
        rubric={rubric}
        side={side}
        align={align}
        collisionPadding={12}
        className="glossary-pop"
        aria-label={rubric}
      >
        {t(`glossary.term.${term}`)}
      </PopoverContent>
    </Popover>
  );
}
