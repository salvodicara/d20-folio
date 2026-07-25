/**
 * FamiliarFormPicker — the Find Familiar form chooser (LAZY leaf; picker doctrine
 * §2.7). Reuses `CompendiumPicker` driving a DERIVED spec spread from the browse
 * `monsterSpec` (same rows · search · statblock detail — read-then-choose), so
 * there is no bespoke browser (golden rule 3). Committing a form runs the 2024 type
 * swap (Celestial / Fey / Fiend) chosen in a footer `Segmented` and calls
 * `summonFamiliar` with the form's printed max HP (the store stays corpus-free).
 *
 * SEAM file: it imports the monster corpus (via `resolveFamiliarForms` +
 * `monsterSpec`), so it is lazy-only — pinned by the eager-partition sweep. Mounted
 * from BOTH the Spells-tab affordance and the Companions rail (Change form / Re-
 * summon) via `React.lazy(Promise.all([import(…), ensureSrdKind("monster")]))`.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { Segmented } from "@/components/ui/segmented";
import { CompendiumPicker } from "@/features/compendium/picker";
import type { CompendiumPickerSpec } from "@/features/compendium/picker";
import { MonsterStatBlockCard } from "@/components/shared/MonsterStatBlockCard";
import { monsterIdentity } from "@/components/shared/monster-identity";
import { monsterSpec } from "@/features/compendium/picker/specs/monster";
import { resolveFamiliarForms } from "@/lib/familiar";
import { FAMILIAR_CREATURE_TYPES, type FamiliarCreatureType } from "@/lib/familiar-ids";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { localizeSrd } from "@/i18n/resolver";
import type { MonsterStatBlock } from "@/data/types";

export interface FamiliarFormPickerProps {
  /** The eligible special-form ids from the aggregate (`familiarFormIds`). */
  formIds: ReadonlySet<string>;
  /** The current familiar's type — preselected when re-forming (never ask twice). */
  currentType?: FamiliarCreatureType;
  onClose: () => void;
}

export function FamiliarFormPicker({
  formIds,
  currentType,
  onClose,
}: FamiliarFormPickerProps) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  // A default MUST exist (a disabled CTA for a mostly-flavor choice is friction —
  // golden rule 20); "fey" is the default on first summon, the prior pick on a re-form.
  //
  // RAW ambiguity (chosen deliberately): the type swap ("a Celestial, Fey, or Fiend
  // instead of a Beast") applies to EVERY chosen form, including the Pact-of-the-Chain
  // special forms that are already non-Beasts (Imp = Fiend, Sprite = Fey, Skeleton =
  // Undead). Whether the swap re-types a non-Beast special form is genuinely under-
  // specified in the SRD; we take the simplest consistent reading — the player's
  // Celestial/Fey/Fiend choice always wins — so the picker offers the swap uniformly.
  const [creatureType, setCreatureType] = useState<FamiliarCreatureType>(
    currentType ?? "fey"
  );
  const [detailTitle, setDetailTitle] = useState<string | null>(null);

  const forms = useMemo(() => resolveFamiliarForms(formIds), [formIds]);

  const spec: CompendiumPickerSpec<MonsterStatBlock> = useMemo(
    () => ({
      ...monsterSpec,
      data: forms,
      // Prune the facets: CR is uniformly 0 and the pool is all Beasts (+ a handful
      // of specials), so a facet over one value is decoration — search alone (§2.7).
      filters: [],
      addLabel: () => t("familiar.summon"),
      onAdd: (m: MonsterStatBlock) => {
        const name = localizeSrd("monster", m.id, "name", locale);
        registerUndoableToast(
          { message: t("familiar.summoned", { name }) },
          () =>
            useCharacterStore.getState().summonFamiliar(m.id, creatureType, m.hp.average),
          { turnScoped: false }
        );
        onClose();
      },
      detail: (m, ctx, state) => ({
        ...monsterSpec.detail(m, ctx, state),
        // The identity line reflects the SWAP (Tiny Fey, not Tiny Beast).
        eyebrow: monsterIdentity(
          { ...m, type: creatureType, typeTags: undefined },
          ctx.t
        ),
        extras: (
          <>
            {/* The type swap is the object spread — statistics unchanged, type + tags
                overridden — so MonsterStatBlockCard prints "Tiny Fey" naturally. */}
            <MonsterStatBlockCard
              monster={{ ...m, type: creatureType, typeTags: undefined }}
              locale={ctx.locale}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[length:var(--text-micro)] uppercase tracking-wider text-text-tertiary">
                {t("familiar.typeChoice")}
              </span>
              <Segmented<FamiliarCreatureType>
                aria-label={t("familiar.typeChoice")}
                value={creatureType}
                onChange={setCreatureType}
                options={FAMILIAR_CREATURE_TYPES.map((ct) => ({
                  value: ct,
                  label: t(`srd.creatureType_${ct}`),
                }))}
              />
            </div>
          </>
        ),
      }),
    }),
    [forms, creatureType, t, locale, onClose]
  );

  return (
    <ModalShell open onClose={onClose} title={detailTitle ?? t("familiar.pickTitle")}>
      <CompendiumPicker
        spec={spec}
        mode="add"
        onClose={onClose}
        onDetailTitle={setDetailTitle}
        autoFocus
      />
    </ModalShell>
  );
}
