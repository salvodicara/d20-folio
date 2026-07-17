/**
 * ClassGallery — the wizard-F class step: B's plaque GALLERY + the HERO ALTAR
 * with the subclass cascade gated at the unlock level (owner round-2: ONE
 * PlaqueCard primitive serves every gallery choice; the cascade stays
 * attributed and gated — below the unlock level one quiet line says when the
 * decision will come). Supersedes the old `ClassGrid` OptionGrid tile wall.
 */
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { useLocale } from "@/hooks/useLocale";
import { asLocale } from "@/lib/locale";
import { abilityLabel } from "@/lib/views/level-up-view";
import { classGalleryVMs } from "@/lib/views/creation-view";
import {
  PlaqueCard,
  PlaqueGrid,
  WizardHero,
  WizardHeroEmpty,
} from "@/features/wizard/gallery";
import { WizardForkTab } from "@/features/wizard/chrome";
import { classRoleSeal } from "./class-roles";

export function ClassGallery({
  level,
  selectedClass,
  selectedSubclass,
  onPickClass,
  onPickSubclass,
}: {
  level: number;
  selectedClass: string;
  selectedSubclass: string;
  onPickClass: (id: string) => void;
  onPickSubclass: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { language } = useLocale();
  const locale = asLocale(language);
  const classes = classGalleryVMs(locale, t);
  const chosen = selectedClass
    ? (classes.find((c) => c.id === selectedClass) ?? null)
    : null;
  const subclassDue = chosen != null && level >= chosen.subclassLevel;
  const ChosenGlyph = chosen ? classRoleSeal(chosen.id).icon : Sparkles;
  const roleKey = (id: string) => `wizard.role_${classRoleSeal(id).role.toLowerCase()}`;

  return (
    <>
      {chosen ? (
        <WizardHero
          glyph={<Icon as={ChosenGlyph} size="md" decorative />}
          eyebrow={[
            t(roleKey(chosen.id)),
            t("wizard.hitDie", { die: chosen.hitDie }),
            t("wizard.saves", {
              list: chosen.saves.map((c) => abilityLabel(c, locale)).join(" + "),
            }),
          ].join(" · ")}
          name={chosen.name}
          body={<p className="wiz-hero-lede">{chosen.tip}</p>}
          asksHead={
            subclassDue
              ? t("wizard.asksDecision", { level: chosen.subclassLevel })
              : undefined
          }
          asks={
            subclassDue ? (
              <div>
                <p className="wiz-asks-head mb-1.5">
                  {t("wizard.chooseSubclassOf", { class: chosen.name })}
                </p>
                <div className="wiz-subclasses" role="group" aria-label={chosen.name}>
                  {chosen.subclasses.map((sc) => (
                    <WizardForkTab
                      key={sc.id}
                      active={selectedSubclass === sc.id}
                      onClick={() => onPickSubclass(sc.id)}
                    >
                      {sc.label}
                    </WizardForkTab>
                  ))}
                </div>
              </div>
            ) : undefined
          }
        />
      ) : (
        <WizardHeroEmpty />
      )}

      {/* 12 classes: small enough that search/facets would be noise. */}
      <ClassPlaques selected={chosen?.id ?? ""} onPick={onPickClass} />
      <p className="wiz-foot-note on-art tnum">
        {t("wizard.startingAtLevel", { level })}
      </p>
    </>
  );
}

/** The bare class plaque grid (quick mode reuses it without the hero). */
export function ClassPlaques({
  selected,
  onPick,
}: {
  selected: string;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { language } = useLocale();
  const locale = asLocale(language);
  return (
    <PlaqueGrid label={t("create.classLabel")}>
      {classGalleryVMs(locale, t).map((c) => {
        const Glyph = classRoleSeal(c.id).icon;
        return (
          <PlaqueCard
            key={c.id}
            glyph={<Icon as={Glyph} size="sm" decorative />}
            name={c.name}
            gloss={c.tip}
            eyebrow={t(`wizard.role_${classRoleSeal(c.id).role.toLowerCase()}`)}
            badge={`d${c.hitDie}`}
            chosen={c.id === selected}
            onClick={() => onPick(c.id)}
          />
        );
      })}
    </PlaqueGrid>
  );
}
