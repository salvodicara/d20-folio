/**
 * SituationalRules — a read-only "Rules Reference" panel at the foot of the Play
 * tab: the SRD situational-combat and exploration facts a player looks up at the
 * table (Cover, Mounted Combat, Underwater Combat, Travel Pace). Pure reference —
 * no per-character mechanic, no Grant, no dice. It renders a pre-localized
 * view-model from the presenter (`buildSituationalRulesView`, the rule-5 edge that
 * folds the inline-BiText reference tables); this component never touches BiText.
 * It is the render surface those tables were authored for — they shipped data-only
 * (guard-tested), and this closes the "display-only, i.e. VISIBLE" ledger promise
 * for all four in one place.
 *
 * Travel-pace distances localize through the D3 helpers (feet via localeDistance,
 * overland miles via localeMiles).
 */

import { useTranslation } from "react-i18next";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { InfoCard } from "@/components/shared/InfoCard";
import { useLocale } from "@/hooks/useLocale";
import { localeDistance, localeMiles } from "@/lib/utils";
import {
  buildSituationalRulesView,
  type RuleLineVM,
} from "@/lib/views/situational-rules-view";
import { COVER_TERM, type CombatTermId } from "@/components/shared/combat-glossary";
import { ReferenceSection } from "../ReferenceSection";
import { PLAY_REF_ANCHOR, type PlayRefSection } from "../play-reference";

/** This block is the persisted "rules" reference section (collapsed by default). */
const SECTION: PlayRefSection = "rules";

/** One reference topic (a heading + its name→summary rows). A row whose id has a
 *  glossary term (the cover levels) names itself as its tip. */
function TopicCard({
  title,
  rows,
  terms,
}: {
  title: string;
  rows: readonly RuleLineVM[];
  terms?: Partial<Record<string, { term: CombatTermId }>>;
}) {
  return (
    <InfoCard as="section" className="space-y-2">
      <h4 className="font-display text-sm font-semibold text-text-primary">{title}</h4>
      <dl className="space-y-1.5">
        {rows.map((r) => {
          const gloss = terms?.[r.id];
          return (
            <div key={r.id} className="text-sm">
              <dt className="font-medium text-text-primary">
                {gloss ? <GlossaryTip term={gloss.term} rubric={r.term} /> : r.term}
              </dt>
              <dd className="text-text-secondary">{r.desc}</dd>
            </div>
          );
        })}
      </dl>
    </InfoCard>
  );
}

export function SituationalRules() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const view = buildSituationalRulesView(locale);

  return (
    <ReferenceSection
      id={SECTION}
      anchorId={PLAY_REF_ANCHOR[SECTION]}
      title={t("combat.rulesReference.title")}
    >
      <p className="text-xs text-text-tertiary">{t("combat.rulesReference.hint")}</p>
      {/* `items-start`: each topic card is sized by its OWN content. Without it the
          grid's default `stretch` blew the short Cover card up to the tallest
          card's height, leaving a large empty hole in the top-left cell (both
          themes). No masonry, no bespoke component — one alignment keyword. */}
      <div className="mt-3 grid items-start gap-3 sm:grid-cols-2">
        <TopicCard
          title={t("combat.rulesReference.cover")}
          rows={view.cover}
          terms={COVER_TERM}
        />
        <TopicCard title={t("combat.rulesReference.mounted")} rows={view.mounted} />
        <TopicCard title={t("combat.rulesReference.underwater")} rows={view.underwater} />
        <InfoCard as="section" className="space-y-2">
          <h4 className="font-display text-sm font-semibold text-text-primary">
            {t("combat.rulesReference.travel")}
          </h4>
          <dl className="space-y-1.5">
            {view.travel.map((p) => (
              <div key={p.id} className="text-sm">
                <dt className="font-medium text-text-primary">{p.name}</dt>
                <dd className="text-text-secondary">
                  {[
                    t("combat.rulesReference.perMinute", {
                      dist: localeDistance(p.perMinuteFt, locale),
                    }),
                    t("combat.rulesReference.perHour", {
                      dist: localeMiles(p.perHourMiles, locale),
                    }),
                    t("combat.rulesReference.perDay", {
                      dist: localeMiles(p.perDayMiles, locale),
                    }),
                  ].join(" · ")}
                </dd>
                {p.effect && <dd className="text-xs text-text-tertiary">{p.effect}</dd>}
              </div>
            ))}
          </dl>
        </InfoCard>
      </div>
    </ReferenceSection>
  );
}
