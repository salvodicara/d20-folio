/**
 * The Play screen's form picker (edge-case family M2), opened right after the use that
 * makes a form (Wild Shape, a Polymorph cast on yourself): the forms `formPool` allows,
 * found by name, each row its Challenge Rating, AC, Hit Points and speeds; pick one,
 * then Transform. The form comes with its undo toast (`useFormActions`); closing
 * changes nothing, since the use itself already happened.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formPickerView, type SpeedMode } from "@/domains/play/form-picker-view";
import { getBeast } from "@/data/beasts";
import { useFormActions } from "@/features/character/center/tabs/spells/use-form-actions";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { formSourceKind, selfFormRule } from "@/lib/polymorph";
import { localeDistance } from "@/lib/utils";
import type { CharacterDoc } from "@/types/character";
import { Button, Choice, Dialog, Field } from "@/ui";

const SPEED_KEY: Record<SpeedMode, string> = {
  walk: "polymorph.speedWalk",
  fly: "character.speed_fly",
  swim: "character.speed_swim",
  climb: "character.speed_climb",
  burrow: "character.speed_burrow",
};

export function PlayFormPicker({
  doc,
  sourceId,
  locale,
  onClose,
}: {
  doc: CharacterDoc;
  sourceId: string;
  locale: Locale;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { assume } = useFormActions();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const view = formPickerView(doc, sourceId, locale, query);
  const rows = view.groups.flatMap((g) => g.rows.map((r) => ({ ...r, cr: g.cr })));
  const pickedBeast =
    picked && rows.some((r) => r.id === picked) ? getBeast(picked) : null;
  const keepsMind = selfFormRule(sourceId).keepsMind;
  const note = [
    view.tempHp ? t("play.form.tempHp", { amount: view.tempHp }) : null,
    keepsMind ? t("polymorph.keepsMindHint") : t("polymorph.selfHint"),
  ].filter(Boolean);
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      title={localizeSrd(formSourceKind(sourceId), sourceId, "name", locale)}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            disabled={!pickedBeast}
            onClick={() => {
              if (!pickedBeast) return;
              assume(pickedBeast, sourceId);
              onClose();
            }}
          >
            {t("polymorph.transform")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        <p className="f-note" data-c="res">
          {note.join(" ")}
        </p>
      </div>
      <div className="f-ask">
        <Field
          label={t("polymorph.search")}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {rows.length === 0 ? (
          <p className="f-quiet">
            {query.trim() ? t("common.noResults") : t("polymorph.noForms")}
          </p>
        ) : (
          <div className="f-choices">
            {rows.map((r) => (
              <Choice
                key={r.id}
                color="res"
                on={picked === r.id}
                onClick={() => setPicked(r.id)}
              >
                <span className="f-choice-main">
                  <span className="f-row-t">{r.name}</span>
                  <span className="f-choice-s">
                    {[
                      t("polymorph.crShort", { cr: r.cr }),
                      `${t("character.armorClassShort")} ${String(r.ac)}`,
                      `${t("units.hp")} ${String(r.hp)}`,
                      ...r.speeds.map(
                        (s) => `${t(SPEED_KEY[s.mode])} ${localeDistance(s.ft, locale)}`
                      ),
                    ]
                      // Each fact stays on one line («Camminata 12 m»).
                      .map((fact) => fact.replace(/ /g, " "))
                      .join("\u00a0· ")}
                  </span>
                </span>
              </Choice>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
