/**
 * encounter-bestiary — the campaigns-side COMPONENT module for the bestiary surface,
 * loaded via `React.lazy(Promise.all([import(…), ensureSrdKind("monster")]))` from
 * `Party.tsx` / `party-encounter.tsx`, so the app's eager closure and the campaign
 * chunk gain ZERO corpus bytes (the eager-partition tripwire pins this). Two doors,
 * ONE lazy chunk: the DM's Add-monster modal (Bestiary + Custom tabs) and the monster
 * card's DM statblock disclosure both resolve through it. The corpus reaches this
 * chunk through two sibling seam files it (and only it) imports:
 * `encounter-monster-spec.ts` (the derived spec via `monsterSpec`) and, for the
 * disclosure, `@/data/monsters` (`getMonster`) — both tripwired.
 *
 * The picker itself is `CompendiumPicker` driving a DERIVED add-mode spec
 * (`makeEncounterMonsterSpec` spreads the browse `monsterSpec`), so search /
 * facets / the CR-seal rows / the statblock detail leaf are reused verbatim — no
 * bespoke browser, no picker-core fork (golden rule 3).
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { ModalTabSwitcher } from "@/components/shared/ModalTabSwitcher";
import { CompendiumPicker } from "@/features/compendium/picker";
import { AddMonsterForm } from "./party-encounter";
import { makeEncounterMonsterSpec } from "./encounter-monster-spec";
import type { MonsterInput } from "./encounter";

/**
 * The DM's Add-monster modal — two tabs: Bestiary (the shared picker) and Custom
 * (the surviving manual `AddMonsterForm`). Both commit through the ONE `onAdd`
 * handler; the shell owns dismissal. `closeOnAdd` stays unset — assembling an
 * encounter is N picks without reopening (matching the spell modal).
 */
export function EncounterAddMonsterModal({
  onAdd,
  onClose,
}: {
  onAdd: (input: MonsterInput) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"srd" | "custom">("srd");
  // The picker reports the open entry's name so the shell title reflects it.
  const [detailTitle, setDetailTitle] = useState<string | null>(null);
  const spec = useMemo(() => makeEncounterMonsterSpec(onAdd, t), [onAdd, t]);

  return (
    <ModalShell
      open
      onClose={onClose}
      title={detailTitle ?? t("campaignHub.encounterAddForm")}
    >
      <ModalTabSwitcher
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setDetailTitle(null);
        }}
        labels={{
          srd: t("campaignHub.encounterBestiaryTab"),
          custom: t("campaignHub.encounterCustomTab"),
        }}
      />
      {activeTab === "custom" ? (
        <AddMonsterForm onAdd={onAdd} />
      ) : (
        <CompendiumPicker
          spec={spec}
          mode="add"
          onDetailTitle={setDetailTitle}
          autoFocus
        />
      )}
    </ModalShell>
  );
}
