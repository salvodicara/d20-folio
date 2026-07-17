/**
 * Wizard Spell Mastery (L18) + Signature Spells (L20) re-pickers — the
 * out-of-level-up counterpart to the LevelUpModal steps (U4). Both choices are
 * RAW-swappable after an 8-hour study / a rest, so an eligible wizard can re-pick
 * them on the Spells tab in edit mode (play-mode review already shows the chosen
 * spells via the `wizardSpellMastery` / `wizardSignatureSpell` badges on each row).
 *
 * Pure presentation over the existing `spell-mastery-pick` / `signature-spells-pick`
 * helpers: the current picks are DERIVED from the flags on `character.spells[]`, and
 * a change re-applies the flags through `applySpellMasteryPicks` /
 * `applySignatureSpellsPicks` (which also clear the flag on a rotated-out spell).
 */

import { useMemo } from "react";
import { totalLevel, primaryClassId } from "@/lib/classes";
import { useTranslation } from "react-i18next";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useLocale } from "@/hooks/useLocale";
import { localizeSrd } from "@/i18n/resolver";
import { OptionGrid, type OptionGridItem } from "@/components/shared/OptionGrid";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { spellIndex } from "@/data/spells";
import {
  eligibleSpellMasteryPicks,
  applySpellMasteryPicks,
} from "@/lib/spell-mastery-pick";
import {
  eligibleSignatureSpells,
  applySignatureSpellsPicks,
} from "@/lib/signature-spells-pick";

export function WizardSpellChoices() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const isEdit = useUIStore((s) => s.sheetMode === "edit");

  const cd = character?.character;
  const isWizard = cd ? primaryClassId(cd) === "wizard" : false;
  const level = cd ? totalLevel(cd) : 0;
  const hasMastery = isWizard && level >= 18;
  const hasSignature = isWizard && level >= 20;

  // The currently-flagged spells, derived from the spellbook (the single source of
  // truth) — pre-fills the pickers + drives the "n / total" counters.
  const masteryL1 = useMemo(() => srdAtLevelWithFlag(cd?.spells, 1, "mastery"), [cd]);
  const masteryL2 = useMemo(() => srdAtLevelWithFlag(cd?.spells, 2, "mastery"), [cd]);
  const signatureIds = useMemo(() => allSrdWithFlag(cd?.spells, "signature"), [cd]);

  if (!character || !cd || !isEdit || (!hasMastery && !hasSignature)) return null;

  function commitSpells(spells: ReturnType<typeof applySpellMasteryPicks>): void {
    const store = useCharacterStore.getState();
    const char = store.character;
    if (!char) return;
    store.setCharacter({ ...char, character: { ...char.character, spells } });
  }

  function optionsFor(eligible: ReadonlyArray<{ id: string }>): OptionGridItem[] {
    // `eligible` carries only SRD spell ids (custom spells are filtered upstream),
    // so the localized label resolves from the catalogue by the stable spell id.
    return eligible.map((e) => ({
      id: e.id,
      label: localizeSrd("spell", e.id, "name", locale),
    }));
  }

  const masteryOptsL1 = optionsFor(eligibleSpellMasteryPicks(cd.spells, 1));
  const masteryOptsL2 = optionsFor(eligibleSpellMasteryPicks(cd.spells, 2));
  const signatureOpts = optionsFor(eligibleSignatureSpells(cd.spells));

  return (
    <div className="mt-6 flex flex-col gap-6" data-testid="wizard-spell-choices">
      {hasMastery && (
        <section>
          <SectionHeader title={t("levelUp.chooseSpellMastery")} />
          <p className="mb-3 text-sm text-text-secondary">
            {t("levelUp.spellMasteryHint")}
          </p>
          <div className="flex flex-col gap-4">
            <OptionGrid
              single
              cols={2}
              flush
              label={t("levelUp.spellMasteryLevel", { n: 1 })}
              count={masteryL1 ? 1 : 0}
              total={1}
              options={masteryOptsL1}
              selected={masteryL1 ? [masteryL1] : []}
              onToggle={(id) =>
                commitSpells(
                  applySpellMasteryPicks(cd.spells, {
                    level1: masteryL1 === id ? undefined : id,
                    level2: masteryL2 ?? undefined,
                  })
                )
              }
              emptyMessage={t("levelUp.spellMasteryNoneAtLevel", { n: 1 })}
            />
            <OptionGrid
              single
              cols={2}
              flush
              label={t("levelUp.spellMasteryLevel", { n: 2 })}
              count={masteryL2 ? 1 : 0}
              total={1}
              options={masteryOptsL2}
              selected={masteryL2 ? [masteryL2] : []}
              onToggle={(id) =>
                commitSpells(
                  applySpellMasteryPicks(cd.spells, {
                    level1: masteryL1 ?? undefined,
                    level2: masteryL2 === id ? undefined : id,
                  })
                )
              }
              emptyMessage={t("levelUp.spellMasteryNoneAtLevel", { n: 2 })}
            />
          </div>
        </section>
      )}

      {hasSignature && (
        <section>
          <SectionHeader title={t("levelUp.chooseSignatureSpells")} />
          <p className="mb-3 text-sm text-text-secondary">
            {t("levelUp.signatureSpellsHint")}
          </p>
          <OptionGrid
            cols={2}
            flush
            label={t("levelUp.spellMasteryLevel", { n: 3 })}
            count={signatureIds.length}
            total={2}
            options={signatureOpts}
            selected={signatureIds}
            onToggle={(id) => {
              const next = signatureIds.includes(id)
                ? signatureIds.filter((s) => s !== id)
                : signatureIds.length < 2
                  ? [...signatureIds, id]
                  : signatureIds;
              commitSpells(
                applySignatureSpellsPicks(cd.spells, {
                  first: next[0],
                  second: next[1],
                })
              );
            }}
            emptyMessage={t("levelUp.signatureSpellsNotEnough")}
          />
        </section>
      )}
    </div>
  );
}

// ─── helpers (derive current picks from the spell flags) ────────────────────────

type FlagKind = "mastery" | "signature";

function flagKey(kind: FlagKind): "wizardSpellMastery" | "wizardSignatureSpell" {
  return kind === "mastery" ? "wizardSpellMastery" : "wizardSignatureSpell";
}

/** The single SRD spell id at `spellLevel` carrying the given flag (or undefined). */
function srdAtLevelWithFlag(
  spells: Parameters<typeof eligibleSpellMasteryPicks>[0] | undefined,
  spellLevel: 1 | 2,
  kind: FlagKind
): string | undefined {
  if (!spells) return undefined;
  const key = flagKey(kind);
  for (const ref of spells) {
    if ("custom" in ref) continue;
    if (ref[key] !== true) continue;
    if (spellIndex.get(ref.srdId)?.level === spellLevel) return ref.srdId;
  }
  return undefined;
}

/** All SRD spell ids carrying the given flag. */
function allSrdWithFlag(
  spells: Parameters<typeof eligibleSpellMasteryPicks>[0] | undefined,
  kind: FlagKind
): string[] {
  if (!spells) return [];
  const key = flagKey(kind);
  return spells.flatMap((ref) =>
    !("custom" in ref) && ref[key] === true ? [ref.srdId] : []
  );
}
