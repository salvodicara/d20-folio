/**
 * Payment Picker Modal — folio chrome. The same dialog also asks «Su quale arma?»
 * on the classic sheet (a weapon per row, `title` + row `tag`).
 *
 * Opens when a resolved action offers MORE THAN ONE legal way to pay (a primary
 * cost PLUS a declared `alternateCost` — e.g. a Psi Warrior maneuver: spend the
 * primary tracker OR a Psionic Energy Die; Wild Companion: a Wild Shape use OR a
 * spell slot). It lists every payment as a chromatic option row (reusing the SAME
 * `.cl-opts` / `.cl-opt` recipe the {@link CastLevelModal} uses, golden rule 3),
 * with a semantic `cl-payment-primary` treatment for the declared default. Each
 * row is disabled when its resource is unaffordable (constrained input — golden
 * rule 20). Choosing one resolves with that payment index; cancelling resolves
 * null. The parent commits the chosen `CostSpec` through the cost-engine with undo.
 *
 * If only ONE payment is legal, callers should skip the modal and commit directly
 * — this component does not auto-confirm.
 */
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** One render-ready payment row (pre-localized; affordability pre-resolved). */
export interface PaymentRow {
  /** Stable index into the engine's `getActionCostOptions` result. */
  index: number;
  /** Localized label ("Psionic Energy Die", "Spell slot (1+)"). */
  label: string;
  /** Localized remaining-resource hint ("3/6"), or null when not applicable. */
  remaining: string | null;
  /** Whether this payment is affordable right now (disabled otherwise). */
  affordable: boolean;
  /** Whether this is the action's primary (default) cost — gets the gold tint. */
  primary: boolean;
  /** The row's tag in place of Primary / Alternate (a weapon's "in hand"). */
  tag?: string;
}

export interface PaymentPickerModalProps {
  request: {
    /** Localized action name for the header. */
    actionName: string;
    /** The legal payment rows (≥ 2 when the modal opens). */
    rows: PaymentRow[];
    /** The same dialog asking another "which one?" (Which weapon?): its title, and
     *  the action named above it. Absent: the payment question. */
    title?: string;
  } | null;
  onConfirm: (index: number) => void;
  onCancel: () => void;
}

export function PaymentPickerModal({
  request,
  onConfirm,
  onCancel,
}: PaymentPickerModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={request != null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      {request && (
        <DialogContent
          size="sm"
          rubric={request.title ? request.actionName : t("combat.paymentPickerHint")}
          title={
            request.title ?? t("combat.paymentPickerTitle", { name: request.actionName })
          }
          description={request.title ?? t("combat.paymentPickerHint")}
          closeLabel={t("common.cancel")}
        >
          <DialogBody>
            <div className="cl-opts">
              {request.rows.map((row) => (
                <button
                  key={row.index}
                  type="button"
                  className={`cl-opt${row.primary ? " cl-payment-primary" : ""}`}
                  disabled={!row.affordable}
                  onClick={() => onConfirm(row.index)}
                >
                  <span className="cl-tag">
                    {row.tag ??
                      (row.primary
                        ? t("combat.paymentPrimary")
                        : t("combat.paymentAlternate"))}
                  </span>
                  <span className="cl-name">{row.label}</span>
                  {row.remaining && <span className="cl-count">{row.remaining}</span>}
                </button>
              ))}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" block onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
