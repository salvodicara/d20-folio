/**
 * SpellCard — the presentational spell row (folio §5.7). Renders ONE
 * `SpellCardVM` from the {@link buildSpellsViewModel} presenter: a
 * `UniversalCard mode="with-prep"|"library"` carrying the chromatic level seal,
 * the full state matrix (concentration / prepared / always-prepared / ritual /
 * mastery / signature / per-spell ability-override), a single outcome-forward
 * verdict chip, the facts grid, description, higher-levels callout, tag list, and
 * the cast CTAs.
 *
 * SRD CONTENT (name / range / duration / description / higher-levels / effect
 * word) arrives PRE-LOCALIZED on the VM — this component reads ZERO BiText /
 * `[locale]`. The only `t(...)` here resolves APP strings (school / casting-time
 * labels, verdict words, facts labels, prep hints) + raw-number formatting, via
 * the pure {@link ./spell-card-helpers} (the presenter↔edge split,
 * docs/ARCHITECTURE.md).
 *
 * Both SRD and custom (homebrew) spells route through this ONE card: the custom
 * branch swaps the body for the inline {@link CustomSpellEditForm} in edit mode
 * and tags the verdict "Custom". Memoized — the orchestrator passes a STABLE VM +
 * stable callbacks, so a search keystroke bails the still-visible rows.
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import {
  UniversalCard,
  UniversalCardFacts,
  UniversalCardDesc,
  UniversalCardHigher,
  UniversalCardFoot,
} from "@/components/shared/UniversalCard";
import type { SpellCardVM } from "@/lib/views/spells-view";
import type { CustomSpell } from "@/types/character";
import { POLYMORPH_SPELL_IDS } from "@/lib/polymorph";
import { CustomSpellEditForm } from "./CustomSpellEditForm";
import {
  buildVerdict,
  buildGloss,
  buildFacts,
  buildMaterialCostTag,
  spellVerdictOutcome,
  spellCardSlot,
} from "./spell-card-helpers";

export interface SpellCardCallbacks {
  onToggle: (key: string, open: boolean) => void;
  onCast: (vm: SpellCardVM) => void;
  onCastRitual: (vm: SpellCardVM) => void;
  /** S7 — open the Beast-form picker for a Polymorph / True Polymorph spell. */
  onTransform: (vm: SpellCardVM) => void;
  onTogglePrepared: (idx: number) => void;
  onDelete: (idx: number) => void;
  onUpdateField: (idx: number, field: string, value: string | null) => void;
  onUpdateComponent: (
    idx: number,
    key: "v" | "s" | "m" | "material",
    value: boolean | string
  ) => void;
}

export interface SpellCardProps extends SpellCardCallbacks {
  vm: SpellCardVM;
  isEdit: boolean;
  /** Remaining slots at this spell's level (cast-disabled / library gate). */
  slotsRemaining: number;
  expanded: boolean;
}

export const SpellCard = memo(function SpellCard({
  vm,
  isEdit,
  slotsRemaining,
  expanded,
  onToggle,
  onCast,
  onCastRitual,
  onTransform,
  onTogglePrepared,
  onDelete,
  onUpdateField,
  onUpdateComponent,
}: SpellCardProps) {
  const { t } = useTranslation();
  const isCustom = vm.kind === "custom";
  // S7 — a Polymorph / True Polymorph card carries a "Transform" affordance that
  // opens the Beast-form picker (self-swap or read-only reference card).
  const canTransform =
    !isCustom && vm.data != null && POLYMORPH_SPELL_IDS.includes(vm.data.id);

  const gloss = buildGloss(vm, t);
  const verdict = buildVerdict(vm, t);
  const verdictOutcome = spellVerdictOutcome(vm);
  const facts = buildFacts(vm, t);

  // Detail tags (material cost / ritual note / recurrence cadence / ability-override /
  // MASTERY / SIGNATURE / Custom).
  const tags: string[] = [];
  // RA-23 — a priced Material (M) component ("M: 300 gp, consumed"), leading the
  // tag row since it is a hard resource the cast spends. null for unpriced/custom.
  const materialTag = buildMaterialCostTag(vm, t);
  if (materialTag) tags.push(materialTag);
  // RA-24 — the ritual-cast trade-off, paired with the Ritual affordance (SRD
  // "Ritual": +10 minutes, spends no slot). Gated on `vm.canRitual` so the note
  // shows exactly when the Ritual cast button does.
  if (vm.canRitual) tags.push(t("spells.ritualNote"));
  // G24 — a self-side cadence note for a spell whose damage RE-APPLIES (Moonbeam /
  // Spirit Guardians per-turn area save, Flaming Sphere bonus-action move, Call
  // Lightning re-fire). The token localizes to a short "when it recurs" chip.
  if (vm.data?.recurrence) tags.push(t(`spells.recurrence_${vm.data.recurrence}`));
  if (vm.overrideAbility) tags.push(`${t("spells.ability")} · ${vm.overrideAbility}`);
  if (vm.wizardMastery) tags.push(t("spellPrep.spellMasteryBadge"));
  if (vm.wizardSignature) tags.push(t("spellPrep.signatureSpellBadge"));
  if (isCustom) tags.push(t("custom.label"));

  // sr-only summary (the aria-hidden seal/marks folded for AT).
  const srSummary = isCustom
    ? undefined
    : [
        vm.isCantrip ? t("spells.cantrip") : t("spells.levelN", { level: vm.level }),
        vm.concentration ? t("spells.requiresConcentration") : null,
        vm.ritual ? t("spells.ritual") : null,
        vm.showPrep
          ? vm.prepLocked
            ? t("spellPrep.alwaysPrepared")
            : vm.isPrepared
              ? t("spellPrep.prepared")
              : t("spellPrep.notPrepared")
          : null,
        verdict,
      ]
        .filter(Boolean)
        .join(", ");

  // Cast CTA gating: an un-prepared (and not always-prepared) prepared-caster
  // leveled spell can't be cast; no remaining slots disables it too.
  const unpreparedBlock = !isCustom && vm.showPrep && !vm.isPrepared && !vm.prepLocked;
  const castDisabled = slotsRemaining === 0 || unpreparedBlock;
  // Verb + object (DESIGN.md §7 hard ban on verb-less buttons): the primary CTA
  // reads "Cast · Lv 3", never the bare slot-row label "Level 3 (base)".
  const castLabelText = vm.isCantrip
    ? t("spells.cast")
    : t("spells.castAtLevel", { level: vm.level });

  return (
    <UniversalCard
      mode={vm.showPrep ? "with-prep" : "library"}
      kind="spell"
      spellLevel={vm.level}
      cantripSealLabel={t("spells.cantripSeal")}
      slot={spellCardSlot(vm)}
      name={vm.name}
      concentration={vm.concentration}
      concentrationTitle={t("spells.requiresConcentration")}
      ritual={vm.ritual}
      gloss={gloss}
      verdict={verdict}
      verdictOutcome={verdictOutcome}
      prepared={vm.isPrepared || vm.prepLocked}
      prepLocked={vm.prepLocked}
      unprepared={vm.dimmed}
      active={vm.concentratingNow}
      onTogglePrepared={
        vm.showPrep && !vm.prepLocked ? () => onTogglePrepared(vm.idx) : undefined
      }
      ariaPreparedLabel={
        isCustom
          ? t("custom.label")
          : vm.prepLocked
            ? t("spellPrep.alwaysPrepared")
            : vm.isPrepared
              ? t("spellPrep.prepared")
              : t("spellPrep.notPrepared")
      }
      preparedTitle={
        isCustom
          ? undefined
          : vm.prepLocked
            ? t("spellPrep.alwaysPreparedHint")
            : vm.isPrepared
              ? t("spellPrep.preparedHint")
              : t("spellPrep.notPreparedHint")
      }
      ariaExpandLabel={t("common.expand")}
      isEdit={isEdit}
      editAction={
        isEdit ? (
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            className="icon-danger"
            onClick={() => onDelete(vm.idx)}
          >
            <Icon as={Trash2} size="sm" decorative />
            <span className="sr-only">
              {t("common.delete")} {vm.name}
            </span>
          </Button>
        ) : undefined
      }
      open={expanded}
      onOpenChange={(open) => onToggle(vm.key, open)}
      srSummary={srSummary}
    >
      {isCustom && isEdit ? (
        <CustomSpellEditForm
          spell={vm.ref as CustomSpell}
          onUpdateField={(field, value) =>
            onUpdateField(vm.idx, field, value as string | null)
          }
          onUpdateComponent={(key, value) => onUpdateComponent(vm.idx, key, value)}
        />
      ) : (
        <>
          <UniversalCardFacts facts={facts} />
          <UniversalCardDesc>{vm.description}</UniversalCardDesc>
          {vm.higherLevels && (
            <UniversalCardHigher title={t("spells.atHigherLevels")}>
              {vm.higherLevels}
            </UniversalCardHigher>
          )}
          {!isCustom &&
            (isEdit ? (
              <Textarea
                style={{ marginTop: "var(--sp-2)", minHeight: 56, resize: "vertical" }}
                placeholder={t("common.notesPlaceholder")}
                rows={2}
                defaultValue={vm.ref.notes ?? ""}
                onBlur={(e) => onUpdateField(vm.idx, "notes", e.target.value)}
                aria-label={t("common.notesPlaceholder")}
              />
            ) : vm.ref.notes ? (
              <p className="uc-note">{vm.ref.notes}</p>
            ) : null)}
          {isCustom && vm.ref.notes && <p className="uc-note">{vm.ref.notes}</p>}
        </>
      )}

      {!isEdit && (
        <UniversalCardFoot tags={tags.length > 0 ? tags : undefined}>
          <span style={{ display: "inline-flex", gap: "var(--sp-2)" }}>
            {canTransform && (
              <Button size="sm" variant="secondary" onClick={() => onTransform(vm)}>
                {t("polymorph.transform")}
              </Button>
            )}
            {vm.canRitual && (
              <Button size="sm" variant="secondary" onClick={() => onCastRitual(vm)}>
                {t("spells.castRitual")}
              </Button>
            )}
            {!vm.isCantrip && (
              <Button
                size="sm"
                onClick={() => onCast(vm)}
                disabled={castDisabled}
                title={
                  castDisabled && unpreparedBlock
                    ? t("spellPrep.notPreparedHint")
                    : castDisabled && slotsRemaining === 0
                      ? t("spells.noSlotsLeft")
                      : undefined
                }
              >
                {castDisabled && unpreparedBlock
                  ? t("spells.prepareToCast")
                  : castDisabled && slotsRemaining === 0
                    ? t("spells.noSlotsLeft")
                    : castLabelText}
              </Button>
            )}
            {vm.isCantrip && (
              <Button size="sm" onClick={() => onCast(vm)}>
                {t("spells.cast")}
              </Button>
            )}
          </span>
        </UniversalCardFoot>
      )}
      {isEdit && tags.length > 0 && <UniversalCardFoot tags={tags} />}
    </UniversalCard>
  );
});
