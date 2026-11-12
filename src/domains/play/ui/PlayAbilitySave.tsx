/**
 * An ability tile's saving throw on the Play header (D&D Beyond's saving-throw block,
 * its tap-for-breakdown): «TS +6» under the modifier whenever the classic tile shows
 * it (proficient, or something moves the save off the modifier, such as an ally's
 * aura); a tap opens where the total comes from (the modifier, proficiency, «Aura di
 * Bren +3»), in the hero chips' popover.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { renderBreakdownLineLabel } from "@/components/shared/breakdown-line";
import type { PlayHeaderView } from "@/domains/play/play-header-view";
import { Panel } from "@/ui";

type Ability = PlayHeaderView["abilities"][number];

const signed = (n: number) => (n >= 0 ? `+${String(n)}` : `−${String(Math.abs(n))}`);

export function PlayAbilitySave({ ability }: { ability: Ability }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!ability.showSave) return null;
  const name = t(`abilities.${ability.id}`);
  const title = `${t("abilities.savingThrowHead")} · ${name}`;
  return (
    <dd className="f-ab-save f-condwrap" data-prof={ability.save || undefined} ref={ref}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${title} ${signed(ability.saveTotal)}`}
        onClick={() => setOpen((o) => !o)}
      >
        {`${t("abilities.save")} ${signed(ability.saveTotal)}`}
      </button>
      {open && (
        <div className="f-condpop" role="dialog" aria-label={title}>
          <Panel color="abi" title={`${title} ${signed(ability.saveTotal)}`}>
            <ul className="f-ab-parts">
              {ability.saveParts.map((line, i) => (
                <li key={i}>
                  <span>{renderBreakdownLineLabel(line, t)}</span>
                  <b>{line.value}</b>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </dd>
  );
}
