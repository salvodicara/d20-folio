/**
 * «Scelte da completare»: a saved character whose species still owes choices
 * (a lineage, legacy or ancestry; the spellcasting ability its spells use; Keen
 * Senses, Skillful; the ability a feat's increase raised, never stored) sees them
 * named in a callout, and «Completa» opens the same
 * chips creation uses. Nothing is written until «Salva»; each choice made then
 * leaves the list. The class picks the level table gives and the build lacks
 * (invocations, cantrips, Metamagic, maneuvers, Weapon Mastery) are asked here
 * too, as the creation class step's chips. Hidden on a read-only sheet and when
 * nothing is owed.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { choiceSlotRows, toggleChoicePick } from "@/domains/creation/creation-view";
import { ChoiceRowChips } from "@/domains/creation/ui/ChoiceRowChips";
import { PickGrid } from "@/domains/spells/ui/PickGrid";
import { togglePick } from "@/lib/creation/picks";
import { EMPTY_CHOICE_PICKS, type ChoicePicks } from "@/lib/feature-choices";
import type { Locale } from "@/lib/locale";
import { pendingSpeciesChoices } from "@/lib/species-choices";
import { originFeatVMs } from "@/lib/views/feat-pick-view";
import { lineageBundleVMs } from "@/lib/views/creation-view";
import { owedClassPickRows } from "@/lib/views/owed-class-picks-view";
import {
  pendingSpeciesItems,
  speciesChoicesLine,
} from "@/lib/views/species-choices-view";
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
  return (
    <div
      className="f-note f-suggest f-species-due"
      role="group"
      aria-label={t("play.speciesChoices.title")}
    >
      <p>
        <b>{t("play.speciesChoices.title")}</b>
        {" · "}
        {speciesChoicesLine(items, t, locale)}
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
  const [featId, setFeatId] = useState<string | null>(null);
  // Each feat's answer: which ability its increase raised.
  const [featAbilities, setFeatAbilities] = useState<Record<string, AbilityCode>>({});
  const featItems = pendingSpeciesItems(doc.character, doc.session, locale).flatMap(
    (item) => (item.kind === "feat-ability" ? [item] : [])
  );
  // A Human's Versatile: any origin feat but the one its background already grants.
  const feats = pending.feat
    ? originFeatVMs(locale, new Set(doc.character.bgFeat ? [doc.character.bgFeat] : []))
    : [];
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
  // The class picks owed, answered by row key.
  const classRows = owedClassPickRows(doc.character, locale);
  const [classPicks, setClassPicks] = useState<Record<string, string[]>>({});
  const chosen =
    Object.values(classPicks).some((ids) => ids.length > 0) ||
    Object.keys(bundlePicks).length > 0 ||
    ability !== null ||
    featId !== null ||
    Object.keys(featAbilities).length > 0 ||
    rows.some((row) => row.picked.length > 0);
  const save = () => {
    const store = useCharacterStore.getState();
    for (const [key, optionId] of Object.entries(bundlePicks))
      store.setGrantBundleChoice(key, optionId);
    if (featId) store.setHumanOriginFeat(featId);
    if (ability) store.setSpeciesSpellAbility(ability);
    for (const [id, code] of Object.entries(featAbilities))
      store.setFeatAbility(id, code);
    store.resolveSpeciesChoices(picks);
    store.resolveClassPicks(
      classRows.map((row) => ({
        classId: row.classId,
        pick: row.pick,
        ids: classPicks[row.key] ?? [],
      }))
    );
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
        {pending.feat && (
          <div className="f-ask">
            <span className="f-lbl">{t("create.humanVersatileLabel")}</span>
            <p className="f-help">{t("create.humanVersatileHint")}</p>
            <PickGrid
              label={t("create.humanVersatileLabel")}
              options={feats.map((f) => ({ id: f.id, label: f.name }))}
              picked={featId ? [featId] : []}
              art="feat"
              info="feat"
              locale={locale}
              onToggle={setFeatId}
            />
          </div>
        )}
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
        {featItems.map((item) => (
          <div key={item.featId} className="f-ask">
            <span className="f-lbl">
              {t("play.speciesChoices.featAbilityLabel", { feat: item.label })}
            </span>
            <div className="f-chips">
              {item.abilities.map((code) => (
                <Chip
                  key={code}
                  pressed={featAbilities[item.featId] === code}
                  onClick={() =>
                    setFeatAbilities({ ...featAbilities, [item.featId]: code })
                  }
                >
                  {t(`abilities.${code}`)}
                </Chip>
              ))}
            </div>
          </div>
        ))}
        <ChoiceRowChips
          rows={rows}
          onToggle={(row, id) => setPicks(toggleChoicePick(picks, row, id))}
        />
        {classRows.map((row) => (
          <div key={row.key} className="f-ask">
            <span className="f-lbl">{row.source}</span>
            <p className="f-help">{row.title}</p>
            <div className="f-chips">
              {row.options.map((o) => (
                <Chip
                  key={o.id}
                  pressed={(classPicks[row.key] ?? []).includes(o.id)}
                  onClick={() =>
                    setClassPicks({
                      ...classPicks,
                      [row.key]: togglePick(classPicks[row.key] ?? [], o.id, row.owed),
                    })
                  }
                >
                  {o.name}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
