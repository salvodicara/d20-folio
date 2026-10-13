/**
 * BestiarySummonPicker — the creature chooser for a bestiary-pick summon (Planar
 * Ally, Planar Binding, Gate, Awaken). LAZY leaf, the Find Familiar picker's
 * recipe: `CompendiumPicker` driving a spec spread from the browse `monsterSpec`
 * (same rows · search · CR / size / type facets · statblock detail), its data
 * narrowed to the creatures the spell's text allows. Choosing one stores only its
 * monster id (`session.companionVariant[<spellId>]`).
 *
 * SEAM file: imports the monster corpus (`MONSTERS` + `monsterSpec`), so it is
 * lazy-only — pinned by the eager-partition sweep.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { ModalStage } from "@/components/ui/modal-head";
import { CompendiumPicker } from "@/features/compendium/picker";
import type { CompendiumPickerSpec } from "@/features/compendium/picker";
import {
  monsterSpec,
  monsterTypeFilter,
} from "@/features/compendium/picker/specs/monster";
import { MONSTERS } from "@/data/monsters";
import { bestiaryPickAllows } from "@/lib/bestiary-pick";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { localizeSrd } from "@/i18n/resolver";
import type { BestiaryPickRule, MonsterStatBlock } from "@/data/types";

export interface BestiarySummonPickerProps {
  spellId: string;
  rule: BestiaryPickRule;
  onClose: () => void;
}

export function BestiarySummonPicker({
  spellId,
  rule,
  onClose,
}: BestiarySummonPickerProps) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const [detailTitle, setDetailTitle] = useState<string | null>(null);

  const spec: CompendiumPickerSpec<MonsterStatBlock> = useMemo(
    () => ({
      ...monsterSpec,
      data: MONSTERS.filter((m) => bestiaryPickAllows(rule, m)),
      // The type facet offers only the types the spell allows.
      filters: monsterSpec.filters.map((f) =>
        f.id === "type" && rule.types ? monsterTypeFilter(rule.types) : f
      ),
      addLabel: () => t("features.pickCreatureAdd"),
      onAdd: (m: MonsterStatBlock) => {
        const name = localizeSrd("monster", m.id, "name", locale);
        registerUndoableToast(
          { message: t("features.creaturePicked", { name }) },
          () => useCharacterStore.getState().setCompanionVariant(spellId, m.id),
          { turnScoped: false }
        );
        onClose();
      },
    }),
    [rule, spellId, t, locale, onClose]
  );

  return (
    <ModalShell
      open
      onClose={onClose}
      title={detailTitle ?? localizeSrd("spell", spellId, "name", locale)}
    >
      <ModalStage>
        <CompendiumPicker
          spec={spec}
          mode="add"
          onClose={onClose}
          onDetailTitle={setDetailTitle}
          autoFocus
        />
      </ModalStage>
    </ModalShell>
  );
}
