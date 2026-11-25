/**
 * A rule word inside rules prose on the new UI (#1230, gap map E2): the inked word
 * (a condition, Advantage, Bonus Action…) is a button, and a tap opens a pane with
 * the term's plain explanation from the glossary. Pattern source: Foundry's
 * `&Reference` (a rule word in a text opens its card) and D&D Beyond's tap on a
 * condition. The pane is the same `Dialog` as the sheet's number panes: one look for
 * every explanation.
 *
 * The pane renders into the nearest `.fui` root through a portal: the word sits inside
 * a paragraph, where a `<dialog>` may not, and the new UI's styles live under `.fui`.
 */
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import type { GlossaryTermId } from "@/components/shared/GlossaryTip";
import { Dialog } from "@/ui";

export function RuleWord({
  term,
  title,
  children,
}: {
  term: GlossaryTermId;
  /** The term's name as the pane's title («Spaventato», «Vantaggio»). */
  title: string;
  /** The inked word as the prose writes it. */
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const [root, setRoot] = useState<Element | null>(null);
  // A word the glossary does not explain stays plain ink.
  if (!i18n.exists(`glossary.term.${term}`)) return <>{children}</>;
  return (
    <>
      <button
        type="button"
        className="f-rule-word"
        aria-haspopup="dialog"
        onClick={(e) => setRoot(e.currentTarget.closest(".fui") ?? document.body)}
      >
        {children}
      </button>
      {root &&
        createPortal(
          <Dialog
            open
            onClose={() => setRoot(null)}
            color="abi"
            title={title}
            closeLabel={t("common.close")}
          >
            <p className="f-rule-word-body">{t(`glossary.term.${term}`)}</p>
          </Dialog>,
          root
        )}
    </>
  );
}
