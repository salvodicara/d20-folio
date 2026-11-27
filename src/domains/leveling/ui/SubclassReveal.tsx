/**
 * The picked subclass, before it is confirmed: its features up to the level (a tap
 * opens each one's text) and its always-prepared spells. Shared by the level-up
 * screen and the sheet's «Scelte da completare». Pattern source: BG3's subclass
 * screen and D&D Beyond's subclass detail, which show what a pick brings next to
 * the pick.
 */
import { useTranslation } from "react-i18next";

import { InlineMarkdown } from "@/components/shared/InlineMarkdown";
import { highlightRulesText } from "@/components/shared/highlightRulesText";
import type { Locale } from "@/lib/locale";
import type { subclassReveal } from "@/lib/views/level-up-view";

export function SubclassReveal({
  reveal,
  locale,
}: {
  reveal: ReturnType<typeof subclassReveal>;
  locale: Locale;
}) {
  const { t } = useTranslation();
  if (reveal.features.length === 0 && reveal.spells.length === 0) return null;
  return (
    <div className="f-lvl-reveal">
      {reveal.features.length > 0 && (
        <>
          <h3 className="f-lbl">{t("levelUp.screen.subclassBrings")}</h3>
          {reveal.features.map((f) => (
            <details key={f.id}>
              <summary>{f.name}</summary>
              <InlineMarkdown
                text={f.description}
                className="f-lvl-reveal-text"
                highlight={highlightRulesText(locale, { tappable: true })}
              />
            </details>
          ))}
        </>
      )}
      {reveal.spells.length > 0 && (
        <>
          <h3 className="f-lbl">{t("levelUp.subclassSpellsHead")}</h3>
          <p className="f-lvl-reveal-spells">{reveal.spells.join(" · ")}</p>
        </>
      )}
    </div>
  );
}
