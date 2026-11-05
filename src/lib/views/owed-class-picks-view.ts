/**
 * The class picks a saved character owes, named for «Scelte da completare»: the
 * banner's item («4 Suppliche Occulte (Warlock)») and, per owed kind, the level-up
 * picker's own pool — the eligible invocations, the unknown Metamagic and
 * maneuvers, the masterable weapons not yet mastered, the class's cantrips not
 * yet known — with its level-up rubric («Scegli 4 Suppliche Occulte»).
 */
import i18n from "i18next";

import type { Locale } from "@/lib/locale";
import {
  owedClassPicks,
  type BuildForClassPicks,
  type ClassPickKind,
} from "@/lib/owed-class-picks";
import {
  className,
  invocationOptions,
  maneuverOptions,
  metamagicOptions,
  weaponMasteryOptions,
  type LevelUpOptionVM,
} from "@/lib/views/level-up-view";
import { learnableSpellVMs } from "@/lib/views/spell-pick-view";

/** One option, shaped for the level-up pick list. */
export interface OwedPickOptionVM {
  id: string;
  name: string;
  description?: string;
  gloss?: string;
  searchText: string;
  searchDesc?: string;
}

export interface OwedClassPickRow {
  /** `<classId>:<pick>` — one row per class and kind. */
  key: string;
  classId: string;
  pick: ClassPickKind;
  owed: number;
  /** The class that asks («Warlock»). */
  source: string;
  /** The level-up rubric («Scegli 4 Suppliche Occulte»). */
  title: string;
  searchPlaceholder: string;
  options: OwedPickOptionVM[];
}

type Build = BuildForClassPicks & Pick<Required<BuildForClassPicks>, "classes">;

/** The banner's name for an owed pick: «4 Suppliche Occulte (Warlock)». */
export function owedClassPickLabel(
  pick: ClassPickKind,
  owed: number,
  classId: string,
  locale: Locale
): string {
  const t = i18n.getFixedT(locale);
  return t("play.speciesChoices.classItem", {
    what: t(`play.speciesChoices.owed.${pick}`, { count: owed }),
    className: className(classId, locale),
  });
}

function fromLevelUp(vm: LevelUpOptionVM, gloss?: string): OwedPickOptionVM {
  return {
    id: vm.id,
    name: vm.label,
    description: vm.meta,
    gloss: gloss ?? vm.note,
    searchText: `${vm.label} ${vm.searchEn}`,
    searchDesc: vm.searchDesc,
  };
}

/** Every owed class pick as a row of the level-up picker's options. */
export function owedClassPickRows(build: Build, locale: Locale): OwedClassPickRow[] {
  const t = i18n.getFixedT(locale);
  return owedClassPicks(build).map(({ classId, pick, owed }) => {
    const entry = build.classes.find((e) => e.classId === classId);
    const level = entry?.level ?? 1;
    const base = {
      key: `${classId}:${pick}`,
      classId,
      pick,
      owed,
      source: className(classId, locale),
    };
    if (pick === "invocations") {
      return {
        ...base,
        title: t("levelUp.chooseInvocations", { n: owed }),
        searchPlaceholder: t("levelUp.searchInvocations"),
        options: invocationOptions(
          level,
          entry?.invocationChoices ?? [],
          t("levelUp.asi.prerequisite"),
          locale
        ).map((vm) => fromLevelUp(vm)),
      };
    }
    if (pick === "metamagic") {
      return {
        ...base,
        title: t("levelUp.chooseMetamagic", { n: owed }),
        searchPlaceholder: t("levelUp.searchMetamagic"),
        options: metamagicOptions(new Set(entry?.metamagicChoices ?? []), "", locale)
          .filter((vm) => !vm.disabled)
          .map((vm) => fromLevelUp(vm, t("levelUp.metamagicCost", { cost: vm.cost }))),
      };
    }
    if (pick === "maneuvers") {
      return {
        ...base,
        title: t("levelUp.chooseManeuvers", { n: owed }),
        searchPlaceholder: t("levelUp.searchManeuvers"),
        options: maneuverOptions(level, entry?.maneuverChoices ?? [], locale).map((vm) =>
          fromLevelUp(vm)
        ),
      };
    }
    if (pick === "weaponMasteries") {
      const mastered = new Set(entry?.weaponMasteries ?? []);
      return {
        ...base,
        title: t("levelUp.chooseWeaponMastery", { n: owed }),
        searchPlaceholder: t("levelUp.searchWeapons"),
        options: weaponMasteryOptions(locale)
          .filter((vm) => !mastered.has(vm.id))
          .map((vm) => fromLevelUp(vm)),
      };
    }
    const known = new Set(
      (build.spells ?? []).flatMap((s) => ("custom" in s ? [] : [s.srdId]))
    );
    return {
      ...base,
      title: t("featChoices.pickClassCantrips", {
        count: owed,
        className: base.source,
      }).replace(/<\/?c>/g, ""),
      searchPlaceholder: t("levelUp.spells.searchSpells"),
      options: learnableSpellVMs(
        { classId, cantripsOnly: true, maxLevel: 0, exclude: known },
        locale
      ).map((vm) => ({
        id: vm.id,
        name: vm.name,
        description: vm.description,
        searchText: vm.searchText,
        searchDesc: vm.searchDesc,
      })),
    };
  });
}
