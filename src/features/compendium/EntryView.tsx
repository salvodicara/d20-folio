/**
 * EntryView — the Compendium page's read view of ONE selected entry, set as the
 * tome's ILLUMINATED ENTRY LEAF (COMPENDIUM-LUX): a hero masthead promoting the
 * entry's identity facts — the row's own type/level seal struck larger, the
 * spec's eyebrow (type · category · level), and the title — over a gold bloom,
 * then the SAME shared detail scaffold the add-modals render
 * (`CompendiumDetailBody`), so a compendium entry and its add-modal detail stay
 * one surface (the eyebrow simply renders in the masthead here instead of the
 * scroll body). Browse is read-only (no commit footer).
 *
 * Two chromes for one leaf: on the phone model (the leaf REPLACES the index) the
 * masthead leads with a labelled Back; on the two-leaf spread (the index stays
 * beside it) the leaf closes with a quiet corner ✕ instead — "back" is a lie
 * when the list never left.
 */

import { useEffect } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Icon } from "@/components/ui/icon";
import { CompendiumDetailBody } from "./picker/detail";
import type { PickerCtx } from "./picker/types";
import type { AnyCompendiumSpec } from "./picker/specs";

interface EntryViewProps {
  spec: AnyCompendiumSpec;
  entry: unknown;
  ctx: PickerCtx;
  onBack: () => void;
  /** Rendered beside the index (the ≥1024px two-leaf spread) — corner ✕ chrome. */
  spread?: boolean;
}

export function EntryView({ spec, entry, ctx, onBack, spread = false }: EntryViewProps) {
  const { t } = useTranslation();
  // COMPENDIUM-NAV — Esc closes the leaf back to the list (the page's read view
  // behaves like every dismissible layer). A layer ABOVE owns its own Esc: skip
  // when a dialog already consumed it or holds the focus (the command palette).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (e.target instanceof HTMLElement && e.target.closest("[role='dialog']")) return;
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);
  const view = spec.detail(entry, ctx, { added: false });
  // The list row's leading seal IS the entry's mark — strike the same seal
  // larger on the masthead (one mark, every surface; no second iconography).
  const seal = spec.row(entry, ctx).leading;
  return (
    <div className="cmp-entry cmp-read flex flex-1 flex-col overflow-hidden">
      <div className="cmp-entry-head">
        {!spread && (
          <Button variant="secondary" size="sm" onClick={onBack}>
            <Icon as={ArrowLeft} size="sm" decorative />
            {t("common.back")}
          </Button>
        )}
        {seal && <span className="cmp-entry-seal">{seal}</span>}
        <div className="cmp-entry-titles">
          {view.eyebrow && <div className="cmp-entry-eyebrow">{view.eyebrow}</div>}
          <h2 className="cmp-entry-name">{spec.getName(entry, ctx)}</h2>
        </div>
        {spread && (
          <IconButton
            aria-label={t("common.close")}
            className="cmp-entry-close"
            onClick={onBack}
          >
            <Icon as={X} size="sm" decorative />
          </IconButton>
        )}
      </div>
      {/* The eyebrow moved up into the masthead — don't repeat it in the body. */}
      <CompendiumDetailBody view={{ ...view, eyebrow: undefined }} locale={ctx.locale} />
    </div>
  );
}
