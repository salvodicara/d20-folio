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
import { Switch } from "@/components/ui/selection";
import { CompendiumPicker } from "@/features/compendium/picker";
import { getMonster } from "@/data/monsters";
import { localizeSrd } from "@/i18n/resolver";
import { useLocale } from "@/hooks/useLocale";
import { fmtXp } from "@/lib/utils";
import { monsterXp } from "@/lib/monster";
import { AddMonsterForm, EncounterBudgetReadout, type ApplyFn } from "./party-encounter";
import { makeEncounterMonsterSpec } from "./encounter-monster-spec";
import { setMonsterXp, type MonsterInput } from "./encounter";
import type { EncounterBudgetView } from "./encounter-view";

/**
 * The DM's Add-monster modal — two tabs: Bestiary (the shared picker) and Custom
 * (the surviving manual `AddMonsterForm`). Both commit through the ONE `onAdd`
 * handler; the shell owns dismissal. `closeOnAdd` stays unset — assembling an
 * encounter is N picks without reopening (matching the spell modal).
 */
export function EncounterAddMonsterModal({
  onAdd,
  budget,
  onClose,
}: {
  onAdd: (input: MonsterInput) => void;
  /** The DM XP-budget grading (§D.1 mount 2) — a live strip under the tab switcher
   *  so the DM sees the running total WHILE picking (the modal hides the round bar on
   *  mobile; SRD Step 3 is literally "deduct as you add"). Each add re-renders the
   *  caller → a fresh prop → this strip ticks live. */
  budget: EncounterBudgetView;
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
      {/* SRD Step 3 at a glance while picking (§D.1) — the same readout the round bar
          shows, both tabs. */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <EncounterBudgetReadout budget={budget} />
      </div>
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
  combatantId,
  currentXp,
  apply,
  onClose,
}: {
  srdId: string;
  combatantName: string;
  /** This combatant's id — the target of the lair-XP toggle's `setMonsterXp`. */
  combatantId: string;
  /** This combatant's currently-stored per-token XP — the toggle is checked ⇔ it
   *  equals `xpInLair` (derived, no new field). */
  currentXp?: number;
  /** The DM optimistic-write seam — present only for the DM; when absent (a player,
   *  though players never reach the disclosure) the lair toggle is not rendered. */
  apply?: ApplyFn;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const m = getMonster(srdId); // corpus resident: the lazy factory gates on ensureSrdKind
  return (
    <ModalShell open onClose={onClose} title={combatantName}>
      <div className="overflow-y-auto p-4">
        {m ? (
          <>
            {/* Lair XP (§D.5) — one Switch, ONLY when the statblock prints a lair
                alternative (27 corpus entries) and the DM can write. Checked ⇔ the
                combatant carries the lair value; toggling rewrites the seeded XP
                between the base and lair prints through the DM `apply`. Discoverable
                exactly where the "or N in lair" print lives; invisible for the other
                300+ monsters. */}
            {apply && m.xpInLair != null && (
              <div className="mb-3 flex items-center justify-between gap-3">
                <label
                  htmlFor={`lair-xp-${combatantId}`}
                  className="text-sm text-text-secondary"
                >
                  {t("campaignHub.encounterLairXp", { xp: fmtXp(m.xpInLair, locale) })}
                </label>
                <Switch
                  id={`lair-xp-${combatantId}`}
                  checked={currentXp === m.xpInLair}
                  onCheckedChange={(checked) =>
                    apply((e) =>
                      setMonsterXp(
                        e,
                        combatantId,
                        checked ? (m.xpInLair ?? monsterXp(m)) : monsterXp(m)
                      )
                    )
                  }
                />
              </div>
            )}
            <MonsterStatBlockCard
              monster={m}
              locale={locale}
              title={localizeSrd("monster", m.id, "name", locale)}
            />
          </>
        ) : (
          <p className="text-sm text-text-muted">
            {t("campaignHub.encounterStatblockMissing")}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
