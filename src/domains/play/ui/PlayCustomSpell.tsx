/**
 * «Incantesimo personalizzato», reached from the «Aggiungi» tab of «Gestisci
 * incantesimi» (#1230). Pattern source: D&D Beyond's homebrew spell fields (name,
 * level, school, casting time, range, components, duration, Concentration, Ritual,
 * description) and Foundry's spell item sheet (the same facts, as toggles). The
 * spell is the classic sheet's homebrew spell (`customSpellFromDraft`, its one
 * rule: a name), added through the shared create move with the 5 s undo.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ALL_SPELL_SCHOOLS } from "@/data/types";
import { addCustomSpellUndoable } from "@/features/character/custom-entry-commands";
import {
  CUSTOM_SPELL_CASTING_TIMES,
  customSpellDraft,
  customSpellFromDraft,
  type CustomSpellDraft,
} from "@/lib/custom-spell";
import type { Locale } from "@/lib/locale";
import { Button, Chip, Field, TextArea } from "@/ui";

const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
/** Each component letter's full name, for a screen reader. */
const COMPONENT_LABEL = {
  v: "glossary.name.verbal",
  s: "glossary.name.somatic",
  m: "spells.material",
} as const;

export function PlayCustomSpell({
  locale,
  onDone,
}: {
  locale: Locale;
  /** Back to the list, after adding or without. */
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() =>
    customSpellDraft({
      range: t("spells.defaultRange"),
      duration: t("spells.instantaneous"),
    })
  );
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<CustomSpellDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const out = customSpellFromDraft(draft, locale);
  const nameError = tried && !out.ok ? t("common.nameRequired") : undefined;
  const add = () => {
    setTried(true);
    if (!out.ok) return;
    addCustomSpellUndoable(
      out.spell,
      t("play.spells.addedToast", { name: draft.name.trim() }),
      t
    );
    onDone();
  };
  const group = (label: string, children: ReactNode) => (
    <div className="f-field">
      <span className="f-lbl">{label}</span>
      <div className="f-chips" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
  return (
    <form
      className="f-stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <Button kind="quiet" onClick={onDone}>
        {t("play.spells.customBack")}
      </Button>
      <Field
        label={t("common.name")}
        autoComplete="off"
        required
        value={draft.name}
        error={nameError}
        onChange={(e) => set({ name: e.target.value })}
      />
      {group(
        t("common.level"),
        LEVELS.map((level) => (
          <Chip
            key={level}
            pressed={draft.level === level}
            ariaLabel={level === 0 ? undefined : t("spells.level", { level })}
            onClick={() => set({ level, ...(level === 0 ? { ritual: false } : {}) })}
          >
            {level === 0 ? t("spells.cantrip") : String(level)}
          </Chip>
        ))
      )}
      {group(
        t("spells.school"),
        ALL_SPELL_SCHOOLS.map((school) => (
          <Chip
            key={school}
            pressed={draft.school === school}
            onClick={() => set({ school })}
          >
            {t(`srd.school_${school}`)}
          </Chip>
        ))
      )}
      {group(
        t("spells.castingTime"),
        CUSTOM_SPELL_CASTING_TIMES.map((castingTime) => (
          <Chip
            key={castingTime}
            pressed={draft.castingTime === castingTime}
            onClick={() => set({ castingTime })}
          >
            {t(`srd.castingTime_${castingTime}`)}
          </Chip>
        ))
      )}
      <div className="f-form-pair">
        <Field
          label={t("spells.range")}
          autoComplete="off"
          value={draft.range}
          onChange={(e) => set({ range: e.target.value })}
        />
        <Field
          label={t("spells.duration")}
          autoComplete="off"
          value={draft.duration}
          onChange={(e) => set({ duration: e.target.value })}
        />
      </div>
      {group(
        t("spells.components"),
        (["v", "s", "m"] as const).map((c) => (
          <Chip
            key={c}
            pressed={draft[c]}
            ariaLabel={t(COMPONENT_LABEL[c])}
            onClick={() => set({ [c]: !draft[c] })}
          >
            {c.toUpperCase()}
          </Chip>
        ))
      )}
      {draft.m && (
        <Field
          label={t("spells.material")}
          autoComplete="off"
          value={draft.material}
          onChange={(e) => set({ material: e.target.value })}
        />
      )}
      {group(
        t("spells.properties"),
        <>
          <Chip
            pressed={draft.concentration}
            onClick={() => set({ concentration: !draft.concentration })}
          >
            {t("spells.concentration")}
          </Chip>
          {draft.level > 0 && (
            <Chip pressed={draft.ritual} onClick={() => set({ ritual: !draft.ritual })}>
              {t("spells.ritual")}
            </Chip>
          )}
        </>
      )}
      <TextArea
        label={t("common.description")}
        rows={4}
        value={draft.description}
        onChange={(e) => set({ description: e.target.value })}
      />
      <Button kind="primary" type="submit">
        {t("play.spells.customAdd")}
      </Button>
    </form>
  );
}
