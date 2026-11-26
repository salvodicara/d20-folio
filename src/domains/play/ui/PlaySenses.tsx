/**
 * «Sensi» on the new sheet (#1230, gap map item 6). Pattern source: D&D Beyond's
 * Senses box under the skills: the three passive scores (Perception, Insight,
 * Investigation), each a tap away from its number pane (where it comes from,
 * «Personalizza»), then the senses the character has, with their range in the
 * player's units. On a phone it sits in «Risorse e abilità», under the skills.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { PassiveId } from "@/features/character/number-overrides";
import { PASSIVE_LABEL, playNumberView } from "@/domains/play/play-number-view";
import type { Locale } from "@/lib/locale";
import { localeDistance } from "@/lib/utils";
import { deriveCharacter } from "@/lib/views/derive-character";
import type { CharacterDoc } from "@/types/character";
import { Panel } from "@/ui";

import { PlayNumberPane } from "./PlayNumberPane";

const PASSIVES: readonly PassiveId[] = ["perception", "insight", "investigation"];

export function PlaySenses({
  doc,
  locale,
  readonly,
}: {
  doc: CharacterDoc;
  locale: Locale;
  readonly: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<PassiveId | null>(null);
  const senses = deriveCharacter(doc).senses;
  return (
    <Panel color="abi" className="f-senses" title={t("character.hud.senses")}>
      {PASSIVES.map((id) => {
        const label = t(PASSIVE_LABEL[id]);
        const total = playNumberView(doc, locale, { kind: "passive", id }).total;
        return (
          <button
            key={id}
            type="button"
            className="f-skill"
            aria-haspopup="dialog"
            aria-label={`${label} ${String(total)}`}
            onClick={() => setOpen(id)}
          >
            <span className="f-skill-t">{label}</span>
            <b>{total}</b>
          </button>
        );
      })}
      {senses.length > 0 && (
        <dl className="f-prof-l">
          {senses.map((s) => (
            <div key={s.kind}>
              <dt className="f-lbl">{t(`character.sense_${s.kind}`)}</dt>
              <dd>{localeDistance(s.rangeFt, locale)}</dd>
            </div>
          ))}
        </dl>
      )}
      {open && (
        <PlayNumberPane
          key={open}
          numberKey={{ kind: "passive", id: open }}
          doc={doc}
          locale={locale}
          readonly={readonly}
          onClose={() => setOpen(null)}
        />
      )}
    </Panel>
  );
}
