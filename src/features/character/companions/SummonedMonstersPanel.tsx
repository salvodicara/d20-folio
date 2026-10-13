/**
 * SummonedMonstersPanel — the rail rows for a spell that raises several bestiary
 * creatures (Animate Dead's Skeletons or Zombies, Create Undead's Ghouls…) and
 * their shared stat-block modal (LAZY leaf). A bestiary-pick spell (Planar Ally,
 * Gate…) fields the one creature the player chose: a "Choose a creature" row until
 * then, and Change creature / Release in its modal.
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

import { Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/shared/ModalShell";
import { ModalScroll } from "@/components/ui/modal-head";
import { Segmented } from "@/components/ui/segmented";
import { MonsterStatBlockCard } from "@/components/shared/MonsterStatBlockCard";
import { monsterIdentity } from "@/components/shared/monster-identity";
import { CompanionHpStepper } from "@/components/shared/CompanionHpStepper";
import { SummonCountStepper } from "@/components/shared/SummonCountStepper";
import { getMonster } from "@/data/monsters";
import { bestiaryPickAllows } from "@/lib/bestiary-pick";
import { summonInstanceKey } from "@/lib/summon-count";
import type { SummonedMonsterGroup } from "@/lib/views/companion-row-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { localizeSrd } from "@/i18n/resolver";
import { ensureSrdKind } from "@/i18n";

// The bestiary picker rides the same lazy recipe as the familiar's form picker.
const BestiarySummonPicker = lazy(() =>
  Promise.all([import("./bestiary-summon-picker"), ensureSrdKind("monster")]).then(
    ([m]) => ({ default: m.BestiarySummonPicker })
  )
);

export interface SummonedMonstersPanelProps {
  group: SummonedMonsterGroup;
}

export function SummonedMonstersPanel({ group }: SummonedMonstersPanelProps) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const sheetMode = useUIStore((s) => s.sheetMode);
  const setCompanionHp = useCharacterStore((s) => s.setCompanionHp);
  const [statOpen, setStatOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const play = sheetMode === "play";
  const pick = group.pick;
  const found = group.monsterId ? getMonster(group.monsterId) : undefined;
  // A stored pick the spell no longer allows (or an unknown id) reads as unpicked.
  const monster = found && (!pick || bestiaryPickAllows(pick, found)) ? found : undefined;
  const spellName = localizeSrd("spell", group.spellId, "name", locale);
  const picker = pick && pickerOpen && (
    <Suspense fallback={null}>
      <BestiarySummonPicker
        spellId={group.spellId}
        rule={pick}
        onClose={() => setPickerOpen(false)}
      />
    </Suspense>
  );

  if (!monster) {
    if (!pick) return null;
    return (
      <>
        <li className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 text-text-primary">{spellName}</span>
          {play && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="text-[0.68rem] text-text-secondary underline hover:text-accent"
            >
              {t("features.pickCreature")}
            </button>
          )}
        </li>
        {picker}
      </>
    );
  }

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
  const release = () => {
    setStatOpen(false);
    registerUndoableToast(
      { message: t("features.creatureReleased", { name }) },
      () =>
        useCharacterStore
          .getState()
          .dispatch({ kind: "release-companion", featureId: group.spellId }),
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
        subtitle={monsterIdentity(monster, t)}
        size="md"
      >
        <ModalScroll className="flex min-h-0 flex-1 flex-col gap-3">
          {!pick && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {group.options.length > 1 &&
                (play ? (
                  <Segmented
                    aria-label={t("features.variantLabel")}
                    value={monster.id}
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
          )}
          {!pick && (
            <p className="text-[0.72rem] text-text-secondary">
              {t("features.summonCommand")}
            </p>
          )}
          {pick && play && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setStatOpen(false);
                  setPickerOpen(true);
                }}
              >
                {t("features.changeCreature")}
              </Button>
              <Button size="sm" variant="ghost" className="icon-danger" onClick={release}>
                {t("features.releaseCreature")}
              </Button>
            </div>
          )}
          <MonsterStatBlockCard monster={monster} locale={locale} />
        </ModalScroll>
      </ModalShell>
      {picker}
    </>
  );
}
