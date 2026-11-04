/**
 * «Scelte da completare» on the classic sheet: the species choices a saved
 * character still owes (a lineage, legacy or ancestry; the spellcasting ability its
 * species spells use; Keen Senses, Skillful), named in a banner whose «Completa»
 * opens them with the sheet's own pickers. Nothing is written until «Salva»; each
 * choice made then leaves the list. The new UI's twin is `PlaySpeciesChoices`;
 * both read `pendingSpeciesItems` and write through the same store actions.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FeatureChoicesSection } from "@/components/sheet/FeatureChoicesSection";
import { ModalShell } from "@/components/shared/ModalShell";
import { Button } from "@/components/ui/button";
import { ModalBody, ModalFoot } from "@/components/ui/modal-head";
import { useLocale } from "@/hooks/useLocale";
import { EMPTY_CHOICE_PICKS, type ChoicePicks } from "@/lib/feature-choices";
import { asLocale, type Locale } from "@/lib/locale";
import { pendingSpeciesChoices } from "@/lib/species-choices";
import { lineageBundleVMs } from "@/lib/views/creation-view";
import {
  pendingSpeciesItems,
  speciesChoicesLine,
} from "@/lib/views/species-choices-view";
import { useCharacterStore } from "@/stores/characterStore";
import type { AbilityCode } from "@/types/ability";
import type { CharacterDoc } from "@/types/character";

const ABILITIES = ["INT", "WIS", "CHA"] as const;
const NONE: ReadonlySet<string> = new Set();

export function SpeciesChoicesBanner() {
  const doc = useCharacterStore((s) => s.character);
  const readonly = useCharacterStore((s) => s.readonly);
  const { t } = useTranslation();
  const locale = asLocale(useLocale().language);
  const [open, setOpen] = useState(false);
  if (!doc || readonly) return null;
  const items = pendingSpeciesItems(doc.character, doc.session, locale);
  if (items.length === 0) return null;
  return (
    <div
      className="conc-banner conc-banner-prompt"
      role="group"
      aria-label={t("play.speciesChoices.title")}
    >
      <span className="conc-banner-mark" aria-hidden />
      <span className="conc-banner-text">
        <b>{t("play.speciesChoices.title")}</b>
        {" · "}
        {speciesChoicesLine(items, t, locale)}
      </span>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t("play.speciesChoices.open")}
      </Button>
      {open && (
        <SpeciesChoicesModal doc={doc} locale={locale} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function SpeciesChoicesModal({
  doc,
  locale,
  onClose,
}: {
  doc: CharacterDoc;
  locale: Locale;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const pending = pendingSpeciesChoices(doc.character, doc.session);
  const bundles = lineageBundleVMs(doc.character.race, locale).filter((b) =>
    pending.bundleKeys.includes(b.bundleKey)
  );
  // The answers, held here until «Salva».
  const [bundlePicks, setBundlePicks] = useState<Record<string, string>>({});
  const [ability, setAbility] = useState<AbilityCode | null>(null);
  const [picks, setPicks] = useState<ChoicePicks>(EMPTY_CHOICE_PICKS);
  const chosen =
    Object.keys(bundlePicks).length > 0 ||
    ability !== null ||
    Object.values(picks).some((byId: Record<string, ReadonlyArray<string>>) =>
      Object.values(byId).some((ids) => ids.length > 0)
    );
  const save = () => {
    const store = useCharacterStore.getState();
    for (const [key, optionId] of Object.entries(bundlePicks))
      store.setGrantBundleChoice(key, optionId);
    if (ability) store.setSpeciesSpellAbility(ability);
    store.resolveSpeciesChoices(picks);
    onClose();
  };
  return (
    <ModalShell open onClose={onClose} title={t("play.speciesChoices.title")} compact>
      <ModalBody>
        <div className="flex flex-col gap-4">
          {bundles.map((b) => (
            <div key={b.bundleKey} className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-text-secondary">{b.label}</span>
              {b.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={bundlePicks[b.bundleKey] === o.id}
                  onClick={() => setBundlePicks({ ...bundlePicks, [b.bundleKey]: o.id })}
                  className="fchip fchip-sm"
                >
                  {o.label}
                </button>
              ))}
            </div>
          ))}
          {pending.spellAbility && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-text-secondary">
                {t("create.screen.speciesAbility")}
              </span>
              {ABILITIES.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={ability === code}
                  onClick={() => setAbility(code)}
                  className="fchip fchip-sm"
                >
                  {t(`abilities.${code}`)}
                </button>
              ))}
            </div>
          )}
          {/* Every skill stays offered: picking one already held only records it. */}
          <FeatureChoicesSection
            slots={pending.slots}
            picks={picks}
            onChange={setPicks}
            existingSkillIds={NONE}
            existingSpellIds={NONE}
            proficientSkillIds={NONE}
          />
        </div>
      </ModalBody>
      <ModalFoot>
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" disabled={!chosen} onClick={save}>
          {t("common.save")}
        </Button>
      </ModalFoot>
    </ModalShell>
  );
}
