/**
 * «Scelte da completare»: a saved character whose species still owes choices
 * (a lineage, legacy or ancestry; the spellcasting ability its spells use; Keen
 * Senses, Skillful) sees them named in a callout, and «Completa» opens the same
 * chips creation uses. Nothing is written until «Salva»; each choice made then
 * leaves the list. Hidden on a read-only sheet and when nothing is owed.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { choiceSlotRows, toggleChoicePick } from "@/domains/creation/creation-view";
import { ChoiceRowChips } from "@/domains/creation/ui/ChoiceRowChips";
import { EMPTY_CHOICE_PICKS, type ChoicePicks } from "@/lib/feature-choices";
import type { Locale } from "@/lib/locale";
import { pendingSpeciesChoices } from "@/lib/species-choices";
import { lineageBundleVMs } from "@/lib/views/creation-view";
import { pendingSpeciesItems } from "@/lib/views/species-choices-view";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import type { AbilityCode } from "@/types/ability";
import { Button, Chip, Dialog } from "@/ui";

const ABILITIES = ["INT", "WIS", "CHA"] as const;

export function PlaySpeciesChoices({
  doc,
  locale,
  readonly,
}: {
  doc: CharacterDoc;
  locale: Locale;
  readonly: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const items = pendingSpeciesItems(doc.character, doc.session, locale);
  if (readonly || items.length === 0) return null;
  const names = items.map((item) =>
    item.kind === "ability" ? t("play.speciesChoices.ability") : item.label
  );
  const and = new Intl.ListFormat(locale, { type: "conjunction" });
  return (
    <div
      className="f-note f-suggest f-species-due"
      role="group"
      aria-label={t("play.speciesChoices.title")}
    >
      <p>
        <b>{t("play.speciesChoices.title")}</b>
        {" · "}
        {t("play.speciesChoices.body", { items: and.format(names) })}
      </p>
      <Button kind="primary" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {t("play.speciesChoices.open")}
      </Button>
      {open && (
        <SpeciesChoicesDialog doc={doc} locale={locale} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function SpeciesChoicesDialog({
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
  // Every skill stays offered: a saved character may already hold the one its
  // trait gave (added by hand back then), and picking it only records the choice.
  const owned = {
    skills: new Set<string>(),
    spells: new Set(
      doc.character.spells.flatMap((s) => ("custom" in s ? [] : [s.srdId]))
    ),
  };
  const rows = choiceSlotRows(pending.slots, picks, owned, locale);
  const chosen =
    Object.keys(bundlePicks).length > 0 ||
    ability !== null ||
    rows.some((row) => row.picked.length > 0);
  const save = () => {
    const store = useCharacterStore.getState();
    for (const [key, optionId] of Object.entries(bundlePicks))
      store.setGrantBundleChoice(key, optionId);
    if (ability) store.setSpeciesSpellAbility(ability);
    store.resolveSpeciesChoices(picks);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("play.speciesChoices.title")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" disabled={!chosen} onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        {bundles.map((b) => (
          <div key={b.bundleKey} className="f-ask">
            <span className="f-lbl">{b.label}</span>
            <div className="f-chips">
              {b.options.map((o) => (
                <Chip
                  key={o.id}
                  pressed={bundlePicks[b.bundleKey] === o.id}
                  onClick={() => setBundlePicks({ ...bundlePicks, [b.bundleKey]: o.id })}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>
        ))}
        {pending.spellAbility && (
          <div className="f-ask">
            <span className="f-lbl">{t("create.screen.speciesAbility")}</span>
            <p className="f-help">{t("create.screen.speciesAbilityHint")}</p>
            <div className="f-chips">
              {ABILITIES.map((code) => (
                <Chip
                  key={code}
                  pressed={ability === code}
                  onClick={() => setAbility(code)}
                >
                  {t(`abilities.${code}`)}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <ChoiceRowChips
          rows={rows}
          onToggle={(row, id) => setPicks(toggleChoicePick(picks, row, id))}
        />
      </div>
    </Dialog>
  );
}
