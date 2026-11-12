/**
 * Board 2b, D6a: «Trova famiglio» on the Play screen, as BG3's Find Familiar opens its
 * row of forms: the creature type first (2024: Celestial, Fey or Fiend instead of a
 * Beast; the last pick on a re-form), then the forms found by name, each with its
 * painted icon and the Wild Shape picker's numbers line, then «Evoca» (with its undo
 * toast, `summonFamiliarForm`).
 *
 * It reads the monster corpus (`resolveFamiliarForms`), so it is mounted lazily.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { summonFamiliarForm } from "@/domains/play/forms-defenses-view";
import type { SpeedMode } from "@/domains/play/form-picker-view";
import { ActionGlyph, ActionIcon } from "@/domains/play/ui/ActionIcon";
import { formFacts } from "@/domains/play/form-facts";
import { localizeSrd } from "@/i18n/resolver";
import { resolveFamiliarForms } from "@/lib/familiar";
import { FAMILIAR_CREATURE_TYPES, type FamiliarCreatureType } from "@/lib/familiar-ids";
import type { Locale } from "@/lib/locale";
import { matchesSearch } from "@/lib/search";
import { formatCr } from "@/lib/utils";
import { useCharacterStore } from "@/stores/characterStore";
import { Art, Button, Chip, Choice, Dialog, Field } from "@/ui";

const SPEED_MODES: readonly SpeedMode[] = ["walk", "fly", "swim", "climb", "burrow"];

export function PlayFamiliarPicker({
  formIds,
  locale,
  onClose,
  onSummoned,
}: {
  formIds: ReadonlySet<string>;
  locale: Locale;
  onClose: () => void;
  /** Called once the familiar is on the field (the cast is logged by the caller). */
  onSummoned?: () => void;
}) {
  const { t } = useTranslation();
  const current = useCharacterStore((s) => s.character?.session.familiar?.creatureType);
  const [type, setType] = useState<FamiliarCreatureType>(current ?? "fey");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const forms = useMemo(() => resolveFamiliarForms(formIds), [formIds]);
  const rows = forms
    .map((m) => ({
      id: m.id,
      hpAverage: m.hp.average,
      name: localizeSrd("monster", m.id, "name", locale),
      english: localizeSrd("monster", m.id, "name", "en"),
      cr: formatCr(m.cr),
      ac: m.ac,
      hp: m.hp.average,
      speeds: SPEED_MODES.flatMap((mode) => {
        const ft = m.speeds[mode];
        return typeof ft === "number" && ft > 0 ? [{ mode, ft }] : [];
      }),
    }))
    .filter((r) => matchesSearch(query, r.name, r.english))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const form = rows.find((r) => r.id === picked) ?? null;
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      title={localizeSrd("spell", "find-familiar", "name", locale)}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            disabled={!form}
            onClick={() => {
              if (!form) return;
              summonFamiliarForm(form, type, form.name, t);
              onSummoned?.();
              onClose();
            }}
          >
            {t("play.familiar.summon")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        <span className="f-lbl">{t("familiar.typeChoice")}</span>
        <div className="f-chips">
          {FAMILIAR_CREATURE_TYPES.map((ct) => (
            <Chip key={ct} pressed={type === ct} onClick={() => setType(ct)}>
              {t(`srd.creatureType_${ct}`)}
            </Chip>
          ))}
        </div>
      </div>
      <div className="f-ask">
        <Field
          label={t("polymorph.search")}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {rows.length === 0 ? (
          <p className="f-quiet">{t("common.noResults")}</p>
        ) : (
          <div className="f-choices">
            {rows.map((r) => (
              <Choice
                key={r.id}
                color="res"
                on={picked === r.id}
                onClick={() => setPicked(r.id)}
              >
                <ActionIcon
                  icon={{ kind: "school", id: "conjuration" }}
                  art={
                    <Art
                      kind="monster"
                      id={r.id}
                      fallback={
                        <ActionGlyph icon={{ kind: "school", id: "conjuration" }} />
                      }
                    />
                  }
                />
                <span className="f-choice-main">
                  <span className="f-row-t">{r.name}</span>
                  <span className="f-choice-s">{formFacts(r, t, locale)}</span>
                </span>
              </Choice>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default PlayFamiliarPicker;
