/**
 * CunningStrikeOptions — the per-attack Rogue **Cunning Strike** picker strip,
 * rendered on a weapon attack card beside the on-hit rider strip (it reuses the
 * SAME `.rider-strip` / `.rider-chip` register the {@link ActionRiders} component
 * uses, so the two read as siblings, never a forked recipe — golden rule 3).
 *
 * Each option (Poison / Trip / Withdraw, and the L11/L14/subclass adders) is a
 * tappable chip carrying its dice cost; a LEGAL option (the Sneak Attack use is
 * unspent AND the dice cost fits the Rogue's Sneak Attack dice) commits on a tap
 * — the explicit immediate-commit-with-undo that debits the once-per-turn Sneak
 * Attack use (never auto-spent, override-first). An illegal option renders
 * disabled (constrained input — golden rule 20). The popover carries the save DC,
 * the imposed condition, and the full description (progressive disclosure).
 *
 * The VM arrives PRE-LOCALIZED from `buildCunningStrikeOptions`; the only `t(...)`
 * here resolves APP strings (the strip label, the "DC"/save/cost words).
 */
import { useTranslation } from "react-i18next";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { CunningStrikeVM } from "@/lib/views/cunning-strike-view";

export interface CunningStrikeOptionsProps {
  options: ReadonlyArray<CunningStrikeVM>;
  /**
   * Apply a Cunning Strike option (debit the Sneak Attack use + undo toast).
   * Passed ONLY on the combat surface; the engine never auto-applies.
   */
  onApply: (option: CunningStrikeVM) => void;
}

export function CunningStrikeOptions({ options, onApply }: CunningStrikeOptionsProps) {
  const { t } = useTranslation();
  if (options.length === 0) return null;

  return (
    <div className="rider-strip">
      <span className="rider-strip-label">{t("combat.cunningStrike")}</span>
      <div className="rider-tokens">
        {options.map((option) => (
          <CunningStrikeToken key={option.optionId} option={option} onApply={onApply} />
        ))}
      </div>
    </div>
  );
}

type TranslateFn = ReturnType<typeof useTranslation>["t"];

/** Compose the option's tooltip / aria detail — cost, save, condition, blurb. */
function optionDetail(option: CunningStrikeVM, t: TranslateFn): string {
  const parts: string[] = [t("combat.cunningStrikeCost", { count: option.cost })];
  if (option.save) {
    parts.push(
      t("combat.cunningStrikeSave", { ability: option.save.ability, dc: option.save.dc })
    );
  }
  if (option.condition) parts.push(option.condition);
  parts.push(option.description);
  return parts.join(" · ");
}

/** ONE Cunning Strike token — a tappable chip when legal, a static chip otherwise. */
function CunningStrikeToken({
  option,
  onApply,
}: {
  option: CunningStrikeVM;
  onApply: (option: CunningStrikeVM) => void;
}) {
  const { t } = useTranslation();
  const detail = optionDetail(option, t);
  // The chip text keeps the dice cost at a glance ("Trip −1d6").
  const chip = (
    <span className="uc-verdict rider-chip" data-o="neutral" translate="no">
      {`${option.name} −${option.cost}d6`}
    </span>
  );

  if (option.legal) {
    return (
      <button
        type="button"
        className="rider-token rider-token-spend"
        onClick={(e) => {
          e.stopPropagation();
          onApply(option);
        }}
        title={detail}
        aria-label={t("combat.cunningStrikeApplyAria", { name: option.name, detail })}
      >
        {chip}
        <span className="rider-spend-cue" aria-hidden>
          {t("combat.apply")}
        </span>
      </button>
    );
  }

  // Illegal (no Sneak Attack use, or cost exceeds the dice budget): a static chip
  // + a quiet info popover for the details (progressive disclosure).
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rider-token rider-token-info"
          onClick={(e) => e.stopPropagation()}
          aria-label={t("combat.cunningStrikeInfoAria", { name: option.name })}
        >
          {chip}
        </button>
      </PopoverTrigger>
      <PopoverContent
        rubric={option.name}
        side="top"
        align="center"
        collisionPadding={12}
        className="glossary-pop"
        aria-label={option.name}
      >
        {detail}
      </PopoverContent>
    </Popover>
  );
}
