/**
 * MC-CAUSE — the filtered-absence cause line for the level-up class fork
 * (Constitution §2.7.3). The Picker Doctrine FILTERS RAW-illegal classes out
 * of the multiclass pool (never greyed) — but when that hides most of a
 * category a player expects, the silence reads as a missing feature. So the
 * absence carries ONE quiet line in the fork's register, and the per-class
 * detail (each filtered class with its unmet 13+ floor and the character's
 * offending score) waits behind progressive disclosure in a `.cause-block`,
 * the wizard's caused-by vocabulary. Ids-first: the engine reports
 * `multiclassFilterReport` causes as ids + numbers; THIS view localizes.
 */
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import type { Locale } from "@/lib/locale";
import type { FilteredClassCause, MulticlassFilterReport } from "@/lib/multiclass";
import { className as classDisplayName } from "@/lib/views/level-up-view";

export function MulticlassFilteredCause({
  report,
  eligibleCount,
  locale,
}: {
  report: MulticlassFilterReport;
  /** How many NEW classes ARE offered — 0 switches to the "closed" wording. */
  eligibleCount: number;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const count = report.filtered.length;
  if (count === 0) return null; // every class qualifies — nothing to explain (rule 19)

  // Own-class blockers FIRST (RAW "both ways" — one row explains why EVERYTHING
  // is closed), then each filtered class with its own unmet floor. A class
  // closed ONLY by an own-class blocker carries no row — the blocker row
  // already explains it once (golden rule 19: one attribution, never two).
  const rows = [...report.ownUnmet, ...report.filtered.filter((c) => c.unmet.length > 0)];
  const partsFor = (c: FilteredClassCause) =>
    c.unmet
      .map((u) =>
        t("levelUp.mcReqPart", {
          ability: t(`abilities.${u.ability}_short`),
          needed: u.needed,
          has: u.has,
        })
      )
      .join(` ${t(c.mode === "any" ? "common.or" : "common.and")} `);

  const gloss = <GlossaryTip term="multiclass" rubric={t("levelUp.multiclassing")} />;
  return (
    <div className="text-center">
      <p className="wiz-asks-quiet on-art">
        {eligibleCount > 0 ? (
          <Trans
            i18nKey="levelUp.mcFilteredCause"
            count={count}
            components={{ g: gloss }}
          />
        ) : (
          <Trans i18nKey="levelUp.mcClosedCause" components={{ g: gloss }} />
        )}{" "}
        <button
          type="button"
          className="cause-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {t("common.more")}
          <Icon
            as={ChevronDown}
            size="xs"
            decorative
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </p>
      {open && (
        <ul className="cause-block mx-auto max-w-[560px] space-y-1.5 text-left text-xs text-text-muted">
          {rows.map((c) => (
            <li key={c.classId}>
              <span className="font-medium text-text-secondary">
                {classDisplayName(c.classId, locale)}
              </span>
              {": "}
              {t("levelUp.mcReq", { parts: partsFor(c) })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
