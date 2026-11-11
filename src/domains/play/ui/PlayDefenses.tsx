/**
 * Board 2b, D4c + D6b: «Difese» at the foot of «Danni e cure», as D&D Beyond's Hit
 * Points panel carries its Defenses. One group per kind the character has; the build's
 * own defenses are plain chips, a chosen resistance (Fiendish Resilience) is a chip that
 * opens its options in place, and a temporary one (a potion, a spell) reads
 * «· temporanea» with × to take it off. «+ Aggiungi» asks the kind, then the type
 * (D&D Beyond's kind + type pair); one already held is offered disabled.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  addDefenseOptions,
  addTemporaryDefense,
  defenseKindViews,
} from "@/domains/play/forms-defenses-view";
import {
  choiceResistanceView,
  pickChoiceResistance,
  type ChoiceResistanceSlot,
} from "@/domains/play/reactions-resistance-view";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import type { Locale } from "@/lib/locale";
import { conditionLabel } from "@/lib/views/tracker-view";
import { localizeText } from "@/lib/views/srd-i18n";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc, SessionDefenseKind } from "@/types/character";
import { Button, Chip, Icon } from "@/ui";

const KINDS: readonly SessionDefenseKind[] = [
  "resistance",
  "immunity",
  "vulnerability",
  "conditionImmunity",
];

const GROUP_KEY: Record<SessionDefenseKind, string> = {
  resistance: "abilities.resistancesLabel",
  immunity: "abilities.immunitiesLabel",
  vulnerability: "abilities.vulnerabilitiesLabel",
  conditionImmunity: "abilities.conditionImmunitiesLabel",
};

export function PlayDefenses({ doc, locale }: { doc: CharacterDoc; locale: Locale }) {
  const { t } = useTranslation();
  const readonly = useSheetReadonly();
  const views = defenseKindViews(doc);
  const slots = choiceResistanceView(doc);
  const [adding, setAdding] = useState(false);
  const label = (kind: SessionDefenseKind, id: string) =>
    kind === "conditionImmunity" ? conditionLabel(id, locale) : t(`srd.damage_${id}`);
  const chosen = new Set<string>(slots.flatMap((s) => s.picked));
  const groups = KINDS.filter(
    (kind) =>
      views[kind].effective.length > 0 || (kind === "resistance" && slots.length > 0)
  );
  if (groups.length === 0 && readonly) return null;
  return (
    <div className="f-ask">
      <span className="f-lbl">{t("character.hud.defenses")}</span>
      {groups.map((kind) => {
        const { permanent, session } = views[kind];
        const fixed = permanent.filter(
          (id) => !(kind === "resistance" && chosen.has(id))
        );
        return (
          <div key={kind} role="group" aria-label={t(GROUP_KEY[kind])} className="f-ask">
            <p className="f-help">{t(GROUP_KEY[kind])}</p>
            <div className="f-chips">
              {fixed.map((id) => (
                <Chip key={id}>{label(kind, id)}</Chip>
              ))}
              {kind === "resistance" &&
                slots.map((slot) => (
                  <ChosenResistance
                    key={slot.choiceKey}
                    slot={slot}
                    readonly={readonly}
                  />
                ))}
              {session.map((id) =>
                readonly ? (
                  <Chip key={id}>
                    {`${label(kind, id)} · ${t("play.defense.temporary")}`}
                  </Chip>
                ) : (
                  <Chip
                    key={id}
                    ariaLabel={t("play.defense.remove", { name: label(kind, id) })}
                    onClick={() =>
                      useCharacterStore.getState().removeSessionDefense(kind, id)
                    }
                  >
                    {`${label(kind, id)} · ${t("play.defense.temporary")}`}
                    <Icon name="u-close" />
                  </Chip>
                )
              )}
            </div>
            {kind === "resistance" &&
              slots.map((slot) => (
                <p key={slot.choiceKey} className="f-help">
                  {`${localizeText(slot.label, locale)}: ${t("character.choiceResistanceHint")}`}
                </p>
              ))}
          </div>
        );
      })}
      {!readonly &&
        (adding ? (
          <AddDefense doc={doc} locale={locale} onDone={() => setAdding(false)} />
        ) : (
          <div className="f-chips">
            <Chip pressed={false} onClick={() => setAdding(true)}>
              <Icon name="u-add" />
              {t("play.defense.add")}
            </Chip>
          </div>
        ))}
    </div>
  );
}

/** A chosen resistance: its pick as a chip; pressed, its options open in place. */
function ChosenResistance({
  slot,
  readonly,
}: {
  slot: ChoiceResistanceSlot;
  readonly: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const picked = slot.picked.map((d) => t(`srd.damage_${d}`)).join(", ");
  if (readonly) return picked ? <Chip>{picked}</Chip> : null;
  return (
    <>
      <Chip pressed={open} onClick={() => setOpen(!open)}>
        {picked || t("play.defense.choose")}
        <Icon name="u-expand" />
      </Chip>
      {open && (
        <div className="f-note" data-c="ini" role="group">
          <div className="f-chips">
            {slot.options.map((d) => (
              <Chip
                key={d}
                pressed={slot.picked.includes(d)}
                onClick={() => {
                  pickChoiceResistance(slot, d);
                  // one to pick: it closes like a select
                  if (slot.amount === 1) setOpen(false);
                }}
              >
                {t(`srd.damage_${d}`)}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** «Difesa temporanea»: the kind, then the type, then «Aggiungi». */
function AddDefense({
  doc,
  locale,
  onDone,
}: {
  doc: CharacterDoc;
  locale: Locale;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<SessionDefenseKind>("resistance");
  const [id, setId] = useState<string | null>(null);
  const options = addDefenseOptions(doc, kind, locale, t);
  return (
    <div
      className="f-note"
      data-c="ini"
      role="group"
      aria-label={t("play.defense.addTitle")}
    >
      <span className="f-lbl">{t("play.defense.addTitle")}</span>
      <div className="f-chips">
        {KINDS.map((k) => (
          <Chip
            key={k}
            pressed={kind === k}
            onClick={() => {
              setKind(k);
              setId(null);
            }}
          >
            {t(`play.defense.kind.${k}`)}
          </Chip>
        ))}
      </div>
      <div className="f-chips">
        {options.map((o) => (
          <Chip
            key={o.id}
            pressed={id === o.id}
            disabled={o.already}
            onClick={() => setId(o.id)}
          >
            {o.label}
          </Chip>
        ))}
      </div>
      <p className="f-help">{t("play.defense.addHelp")}</p>
      <div className="f-acts">
        <Button kind="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button
          kind="primary"
          disabled={!id}
          onClick={() => {
            if (!id) return;
            addTemporaryDefense(kind, id);
            onDone();
          }}
        >
          {t("play.defense.add")}
        </Button>
      </div>
    </div>
  );
}
