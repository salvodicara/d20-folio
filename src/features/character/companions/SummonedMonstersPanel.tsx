/**
 * SummonedMonstersPanel — the rail rows for a spell that raises several bestiary
 * creatures (Animate Dead's Skeletons or Zombies, Create Undead's Ghouls…) and
 * their shared stat-block modal (LAZY leaf).
 *
 * SEAM file: imports the monster corpus (`getMonster`), so it is lazy-only (the
 * eager-partition sweep pins it). The rail mounts it only when the character has
 * such a spell, so everyone else downloads zero corpus bytes.
 *
 * One row per creature, numbered like the encounter's grouped monsters ("Skeleton
 * 1", "Skeleton 2"), each with its own HP (`companionHp["<spellId>#<n>"]`). One tap
 * opens the modal: which creature the spell raised (a Segmented when it offers
 * several), how many, the Bonus Action command, and the printed stat block.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { ModalScroll } from "@/components/ui/modal-head";
import { Segmented } from "@/components/ui/segmented";
import { MonsterStatBlockCard } from "@/components/shared/MonsterStatBlockCard";
import { monsterIdentity } from "@/components/shared/monster-identity";
import { CompanionHpStepper } from "@/components/shared/CompanionHpStepper";
import { SummonCountStepper } from "@/components/shared/SummonCountStepper";
import { getMonster } from "@/data/monsters";
import { summonInstanceKey } from "@/lib/summon-count";
import type { SummonedMonsterGroup } from "@/lib/views/companion-row-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { localizeSrd } from "@/i18n/resolver";

export interface SummonedMonstersPanelProps {
  group: SummonedMonsterGroup;
}

export function SummonedMonstersPanel({ group }: SummonedMonstersPanelProps) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const sheetMode = useUIStore((s) => s.sheetMode);
  const setCompanionHp = useCharacterStore((s) => s.setCompanionHp);
  const [statOpen, setStatOpen] = useState(false);

  const monster = getMonster(group.monsterId);
  if (!monster) return null;
  const play = sheetMode === "play";
  const name = localizeSrd("monster", monster.id, "name", locale);
  const maxHp = monster.hp.average;

  const changeCreature = (monsterId: string) => {
    const label = localizeSrd("monster", monsterId, "name", locale);
    registerUndoableToast(
      { message: t("features.variantSwitched", { name: label }) },
      () => useCharacterStore.getState().setCompanionVariant(group.spellId, monsterId),
      { turnScoped: false }
    );
  };
  const changeCount = (count: number) => {
    useCharacterStore
      .getState()
      .dispatch({ kind: "set-companion-count", groupId: group.spellId, count });
  };

  return (
    <>
      {group.current.map((stored, i) => {
        const label = group.count > 1 ? `${name} ${i + 1}` : name;
        const key = summonInstanceKey(group.spellId, i + 1);
        return (
          <li key={key} className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setStatOpen(true)}
              className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-left"
            >
              <span className="text-text-primary">{label}</span>
              <span className="text-[0.68rem] text-text-secondary">
                {t("stats.ac")}{" "}
                <span className="font-mono text-text-primary">{monster.ac}</span>
              </span>
            </button>
            <CompanionHpStepper
              label={label}
              current={stored ?? maxHp}
              max={maxHp}
              onChange={play ? (next) => setCompanionHp(key, next) : undefined}
            />
          </li>
        );
      })}

      <ModalShell
        open={statOpen}
        onClose={() => setStatOpen(false)}
        title={name}
        rubric={localizeSrd("spell", group.spellId, "name", locale)}
        subtitle={monsterIdentity(monster, t)}
        size="md"
      >
        <ModalScroll className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {group.options.length > 1 &&
              (play ? (
                <Segmented
                  aria-label={t("features.variantLabel")}
                  value={group.monsterId}
                  onChange={changeCreature}
                  options={group.options.map((id) => ({
                    value: id,
                    label: localizeSrd("monster", id, "name", locale),
                  }))}
                />
              ) : null)}
            <SummonCountStepper
              label={name}
              count={group.count}
              onChange={play ? changeCount : undefined}
            />
          </div>
          <p className="text-[0.72rem] text-text-secondary">
            {t("features.summonCommand")}
          </p>
          <MonsterStatBlockCard monster={monster} locale={locale} />
        </ModalScroll>
      </ModalShell>
    </>
  );
}
