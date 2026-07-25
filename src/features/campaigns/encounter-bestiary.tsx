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
import { MonsterStatBlockCard } from "@/components/shared/MonsterStatBlockCard";
import { CompendiumPicker } from "@/features/compendium/picker";
import { getMonster } from "@/data/monsters";
import { localizeSrd } from "@/i18n/resolver";
import { useLocale } from "@/hooks/useLocale";
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

/**
 * The DM-only statblock disclosure for a picker-added monster (§C). Mounted lazily
 * from `MonsterCard` when `srdId` is present. Titled with the COMBATANT's user-typed
 * name (what the DM clicked — "Goblin A"); the card's own `title` prints the canonical
 * localized statblock name + identity line, so a renamed combatant still shows which
 * statblock it references. A stale/unknown id (a pack monster on an SRD-only build, a
 * retired id) degrades to the quiet one-line empty state — no throw, and `localizeSrd`
 * is never called unless the monster resolved, so lock 1 cannot fire on a stale id.
 */
export function EncounterStatblockModal({
  srdId,
  combatantName,
  onClose,
}: {
  srdId: string;
  combatantName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const m = getMonster(srdId); // corpus resident: the lazy factory gates on ensureSrdKind
  return (
    <ModalShell open onClose={onClose} title={combatantName}>
      <div className="overflow-y-auto p-4">
        {m ? (
          <MonsterStatBlockCard
            monster={m}
            locale={locale}
            title={localizeSrd("monster", m.id, "name", locale)}
          />
        ) : (
          <p className="text-sm text-text-muted">
            {t("campaignHub.encounterStatblockMissing")}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
