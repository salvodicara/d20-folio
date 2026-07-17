/**
 * Wizard F SPELL SWAP — the level-up "replace one known spell" step (B5),
 * rebuilt on the F read-then-choose family (the old dark-row SpellPicker pair
 * was superseded → deleted, golden rule 10).
 *
 * Two phases, both F morph lists, the second expanding inline UNDER its cause:
 *  1. the spell being REPLACED — read-then-choose in the vermilion `removing`
 *     voice (the chosen row paints danger: it is being dropped);
 *  2. the REPLACEMENT — read-then-Learn over the same-level class pool (the
 *     2024 rule: the replacement matches the removed spell's level), appearing
 *     ONLY once a removal is chosen, with the level filter SAID out loud.
 *
 * The step is optional: both empty = skip; both filled = swap; the half-filled
 * state is what `isSwapIncomplete` flags (the wizard gates Continue on it).
 */
import { useTranslation } from "react-i18next";
import { spells as allSpells } from "@/data/spells";
import { isSwapIncomplete, type SpellSwapChoice } from "@/lib/spell-swap";
import type { SrdSpellRef } from "@/types/character";
import { spellPickVM, type SpellPickVM } from "@/lib/views/spell-pick-view";
import { spellName } from "@/lib/views/level-up-view";
import { asLocale } from "@/lib/locale";
import { SpellLevelSeal } from "./seals";
import { WizardPickList, type WizardPickOption } from "./pick-list";
import { WizardFold } from "./fold";

export function WizardSpellSwap({
  classId,
  allowedLists,
  knownSpells,
  value,
  onChange,
}: {
  /** Class id — the default replacement-pool list (stable id, golden rule 7). */
  classId: string;
  /**
   * The exact spell lists the replacement may draw from — a spell qualifies if
   * it is on ANY. Supplied when the class's pool is WIDENED beyond its own list
   * (Bard "Magical Secrets" L10+ allows replacing a prepared spell with one from
   * bard∪cleric∪druid∪wizard), derived from the grants. Absent = the single
   * `classId` list (the historic, unwidened behavior).
   */
  allowedLists?: ReadonlySet<string>;
  /** The character's known non-cantrip SRD spells. */
  knownSpells: ReadonlyArray<SrdSpellRef>;
  value: SpellSwapChoice;
  onChange: (choice: SpellSwapChoice) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = asLocale(i18n.language);

  function toPickOption(vm: SpellPickVM): WizardPickOption {
    const meta = [
      vm.level === 0 ? t("spells.cantrip") : t("spells.level", { level: vm.level }),
      t(`srd.school_${vm.school}`),
      ...(vm.ritual ? [t("spells.ritual")] : []),
      ...(vm.concentration ? [t("spells.concentration")] : []),
    ].join(" · ");
    return {
      id: vm.id,
      name: vm.name,
      eyebrow: meta,
      description: vm.description,
      seal: <SpellLevelSeal level={vm.level} />,
      searchText: vm.searchText,
      searchDesc: vm.searchDesc,
    };
  }

  const removable = knownSpells
    .flatMap((ref) => {
      const s = allSpells.find((sp) => sp.id === ref.srdId);
      return s && s.level > 0 ? [spellPickVM(s, locale)] : [];
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, locale));

  const removeLevel =
    value.removeId != null
      ? (removable.find((s) => s.id === value.removeId)?.level ?? null)
      : null;
  const knownIds = new Set(knownSpells.map((s) => s.srdId));
  const allowed = allowedLists ?? new Set([classId.toLowerCase()]);
  const replacements =
    removeLevel != null
      ? allSpells
          .filter(
            (s) =>
              s.classes.some((c) => allowed.has(c)) &&
              s.level === removeLevel &&
              !knownIds.has(s.id)
          )
          .map((s) => spellPickVM(s, locale))
      : [];

  const incomplete = isSwapIncomplete(value);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
      <WizardPickList
        removing
        options={removable.map(toPickOption)}
        selected={value.removeId ? [value.removeId] : []}
        total={1}
        label={t("levelUp.swap.removeLabel")}
        onToggle={(id) =>
          onChange(
            value.removeId === id
              ? { removeId: null, replaceId: null }
              : { removeId: id, replaceId: null }
          )
        }
        chooseLabel={(name) => t("levelUp.swap.replaceThis", { name })}
        searchPlaceholder={t("wizard.searchSpells")}
      />

      <WizardFold open={value.removeId != null}>
        <div>
          <WizardPickList
            options={replacements.map(toPickOption)}
            selected={value.replaceId ? [value.replaceId] : []}
            total={1}
            label={
              <>
                {t("levelUp.swap.replaceLabel")}
                {removeLevel != null && (
                  <span className="wiz-pick-filter">
                    {t("levelUp.swap.levelFilter", { level: removeLevel })}
                  </span>
                )}
              </>
            }
            onToggle={(id) =>
              onChange({ ...value, replaceId: value.replaceId === id ? null : id })
            }
            chooseLabel={(name) => t("wizard.learn", { name })}
            searchPlaceholder={t("wizard.searchSpells")}
          />
        </div>
      </WizardFold>

      {incomplete && (
        <p className="on-art text-center text-xs text-warning">
          {t("levelUp.swap.incompleteWarning")}
        </p>
      )}
      {value.removeId != null && value.replaceId != null && (
        <p className="wiz-asks-quiet on-art text-center">
          {t("levelUp.swap.summary", {
            old: spellName(value.removeId, locale),
            new: spellName(value.replaceId, locale),
          })}
        </p>
      )}
    </div>
  );
}
