/**
 * «Privilegi e tratti» and «Competenze e addestramento» on the Play screen, read-only
 * (D&D Beyond's Features & Traits and Proficiencies & Training). Features come grouped
 * by origin; each row says its name, where it comes from and the uses left, and a tap
 * opens its rules text, where rule words open the glossary. Proficiencies are D&D
 * Beyond's four comma lists: armor, weapons, tools, languages.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { InlineMarkdown } from "@/components/shared/InlineMarkdown";
import { highlightRulesText } from "@/components/shared/highlightRulesText";
import {
  playFeaturesView,
  playProficienciesView,
  type PlayFeatureRow,
} from "@/domains/play/play-features-view";
import type { Locale } from "@/lib/locale";
import type { FeatureGroup } from "@/lib/views/feature-list";
import type { CharacterDoc } from "@/types/character";
import { Icon, Panel } from "@/ui";

const MAX_PIPS = 8;

const GROUP_KEY: Record<FeatureGroup, string> = {
  class: "features.classFeatures",
  subclass: "features.subclassFeatures",
  race: "play.features.species",
  feat: "features.feats",
  custom: "features.custom",
};

export function PlayFeatures({ doc, locale }: { doc: CharacterDoc; locale: Locale }) {
  const { t } = useTranslation();
  const view = playFeaturesView(doc, locale);
  const [open, setOpen] = useState<string | null>(null);
  const highlight = highlightRulesText(locale, { tappable: true });
  if (view.groups.length === 0)
    return <p className="f-note">{t("play.features.none")}</p>;
  return (
    <div className="f-feats">
      {view.groups.map(({ group, rows }) => (
        <section key={group} className="f-act-group" data-group={group}>
          <h3 className="f-act-gh">{t(GROUP_KEY[group])}</h3>
          {rows.map((row) => (
            <FeatureRow
              key={row.id}
              row={row}
              open={open === row.id}
              onToggle={() => setOpen(open === row.id ? null : row.id)}
              highlight={highlight}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function FeatureRow({
  row,
  open,
  onToggle,
  highlight,
}: {
  row: PlayFeatureRow;
  open: boolean;
  onToggle: () => void;
  highlight: (plain: string) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const source = row.featCategory
    ? t(`feats.category_${row.featCategory}`)
    : (row.source ?? "");
  const recovery =
    row.uses?.recovery === "short"
      ? t("features.recoverShortRest")
      : row.uses?.recovery === "long"
        ? t("features.recoverLongRest")
        : null;
  const meta = [source, recovery].filter(Boolean).join(" · ");
  const head = (
    <>
      <span className="f-feat-t">
        <b>{row.name}</b>
        {meta && <span className="f-feat-m">{meta}</span>}
      </span>
      {row.uses && (
        <span
          className="f-feat-uses"
          aria-label={t("play.features.uses", { left: row.uses.left, max: row.uses.max })}
        >
          {row.uses.max <= MAX_PIPS && (
            <span className="f-pips" aria-hidden="true">
              {Array.from({ length: row.uses.max }, (_, i) => (
                <i key={i} data-on={(row.uses && i < row.uses.left) || undefined} />
              ))}
            </span>
          )}
          <span className="f-res-n" aria-hidden="true">
            {`${String(row.uses.left)}/${String(row.uses.max)}`}
          </span>
        </span>
      )}
    </>
  );
  // A feature with no rules text in the catalogue has nothing to open.
  if (!row.description) return <div className="f-feat">{head}</div>;
  return (
    <div className="f-feat" data-open={open || undefined}>
      <button type="button" className="f-feat-h" aria-expanded={open} onClick={onToggle}>
        {head}
        <Icon name="u-expand" />
      </button>
      {open && (
        <InlineMarkdown
          text={row.description}
          className="f-feat-d f-cmp-prose"
          highlight={highlight}
        />
      )}
    </div>
  );
}

/** D&D Beyond's Proficiencies & Training: four labelled comma lists. */
export function PlayProficiencies({
  doc,
  locale,
}: {
  doc: CharacterDoc;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const view = playProficienciesView(doc, locale);
  const weapons =
    view.weapons && view.weaponMastery
      ? `${view.weapons} · ${t("abilities.weaponMastery")}`
      : view.weapons;
  const rows = [
    ["abilities.armorProfs", view.armor],
    ["abilities.weaponProfs", weapons],
    ["abilities.toolProfs", view.tools],
    ["abilities.languages", view.languages],
  ] as const;
  return (
    <Panel color="abi" className="f-prof" title={t("play.sections.proficiencies")}>
      <dl className="f-prof-l">
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt className="f-lbl">{t(key)}</dt>
            <dd>{value || t("play.features.noneShort")}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
