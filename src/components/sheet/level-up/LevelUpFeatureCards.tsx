/**
 * Level-up "what you gain" preview cards — the read-only summary blocks at the
 * foot of the wizard: NEW FEATURES (expandable cards), SPELL SLOTS, SCALING
 * FEATURES, and the PROFICIENCY BONUS bump. Every string is resolved through the
 * level-up presenter (`featureCardsFromChange` for the cards; `levelUpChangeArgs`
 * for the engine-emitted-id interpolation), so this surface makes ZERO direct
 * `[locale]`/BiText reads (R6+R3 slice 4).
 */

import { useState } from "react";
import { Sparkles, BookOpen, ChevronDown, Star, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineMarkdown } from "@/components/shared/InlineMarkdown";
import { useRulesTextHighlight } from "@/components/shared/highlightRulesText";
import { useClampOverflow } from "@/hooks/useClampOverflow";
import { SectionHeader } from "./LevelUpSectionHeader";
import { featureCardsFromChange, type FeatureCardVM } from "@/lib/views/level-up-view";
import type { LevelUpChange } from "@/lib/level-up";
import type { Locale } from "@/lib/locale";

interface Props {
  changes: ReadonlyArray<LevelUpChange>;
  locale: Locale;
  /** Hide the `-asi` feature card when the interactive ASI picker is shown. */
  hideAsi: boolean;
  /** Cards the ORCHESTRATOR adds beyond the engine's change list — the chosen
   *  subclass's features (the engine preview can't know an in-flight choice).
   *  Appended after the engine cards, deduped by id. */
  extraCards?: ReadonlyArray<{ id: string; name: string; description?: string }>;
  /** i18n + show/hide labels (the orchestrator passes these in). */
  labels: {
    newFeatures: string;
    spellSlots: string;
    scalingFeatures: string;
    profBonus: string;
    showMore: string;
    showLess: string;
  };
  /** Render an i18n change line (engine `i18nKey` + args). */
  renderChangeLine: (change: LevelUpChange) => string;
}

export function LevelUpFeatureCards({
  changes,
  locale,
  hideAsi,
  labels,
  renderChangeLine,
  extraCards = [],
}: Props) {
  const featureChanges = changes.filter((c) => c.type === "feature");
  const cards: FeatureCardVM[] = featureChanges.flatMap((c) =>
    featureCardsFromChange(c, hideAsi, locale)
  );
  const knownIds = new Set(cards.map((c) => c.id));
  for (const extra of extraCards) {
    if (knownIds.has(extra.id)) continue;
    knownIds.add(extra.id);
    cards.push({ id: extra.id, name: extra.name, description: extra.description });
  }
  const slotChanges = changes.filter((c) => c.type === "spellSlots");
  const scalingChanges = changes.filter((c) => c.type === "scaling");
  const profChange = changes.find((c) => c.type === "proficiency");

  return (
    <>
      {profChange && (
        <section>
          <SectionHeader icon={<Star className="h-4 w-4" />} label={labels.profBonus} />
          <p className="mt-1.5 text-sm text-text-secondary pl-1">
            {renderChangeLine(profChange)}
          </p>
        </section>
      )}

      {cards.length > 0 && (
        <section>
          <SectionHeader
            icon={<Sparkles className="h-4 w-4" />}
            label={labels.newFeatures}
          />
          <div className="mt-2 flex flex-col gap-1.5">
            {cards.map((card) => (
              <FeaturePreviewCard
                key={card.id}
                name={card.name}
                description={card.description}
                expandLabel={labels.showMore}
                collapseLabel={labels.showLess}
              />
            ))}
          </div>
        </section>
      )}

      {slotChanges.length > 0 && (
        <section>
          <SectionHeader
            icon={<BookOpen className="h-4 w-4" />}
            label={labels.spellSlots}
          />
          {slotChanges.map((c, i) => (
            <p key={i} className="mt-1.5 text-sm text-text-secondary pl-1">
              {renderChangeLine(c)}
              {/* R4 source attribution — "Wizard 5: …" badge lives in the line. */}
            </p>
          ))}
        </section>
      )}

      {scalingChanges.length > 0 && (
        <section>
          <SectionHeader
            icon={<ChevronDown className="h-4 w-4 rotate-180" />}
            label={labels.scalingFeatures}
          />
          <div className="mt-2 flex flex-col gap-1">
            {scalingChanges.map((c, i) => (
              // A REAL opaque surface (`.lvl-card`, warning-voiced) — the old
              // 10% warning tint floated transparent on the wizard's art and
              // its card-ink text washed out in light (owner round-2).
              <div key={i} className="lvl-card lvl-scaling">
                <Swords className="h-3.5 w-3.5 text-warning flex-shrink-0" />
                <span className="text-sm text-text-secondary">
                  {c.i18nKey ? renderChangeLine(c) : c.description}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function FeaturePreviewCard({
  name,
  description,
  expandLabel,
  collapseLabel,
}: {
  name: string;
  description: string | undefined;
  expandLabel: string;
  collapseLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const highlight = useRulesTextHighlight();
  // Only offer "Show more" when the 2-line clamp actually hides prose — measured
  // off the rendered element so a description that already fits shows no toggle
  // (owner, 2026-07-11: a card whose text fit still offered "Mostra tutto" that
  // revealed nothing). Paused while expanded (an unclamped box never overflows).
  const [clampRef, overflowing] = useClampOverflow<HTMLDivElement>(
    !expanded,
    description
  );
  return (
    <div className="lvl-card">
      <div className="text-sm font-semibold text-text-primary">{name}</div>
      {description && (
        <>
          {/* SRD feature prose may carry inline markdown — route through the
              ONE shared renderer (clamp + measure ref on the renderer's container). */}
          <InlineMarkdown
            ref={clampRef}
            text={description}
            className={cn("mt-0.5 text-xs text-text-muted", !expanded && "line-clamp-2")}
            highlight={highlight}
          />
          {(overflowing || expanded) && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-[0.65rem] font-semibold text-accent hover:text-accent-hover"
            >
              {expanded ? collapseLabel : expandLabel}
            </button>
          )}
        </>
      )}
    </div>
  );
}
