import { useTranslation } from "react-i18next";

import type { FightRow } from "@/domains/combat/fight-rows-view";
import { Chip } from "@/ui";

/** The DM's hands on a line: its creatures' HP (a monster's numbers are the DM's own),
 *  and either a tap on the HP (variant A: D&D Beyond's tracker) or a tap on the line
 *  to choose it as a target (variant B: BG3's targets, dnd5e's apply tray). */
export interface FightLineDm {
  hp: { current: number; max: number };
  label: string;
  onHp?: () => void;
  selected?: boolean;
  onSelect?: () => void;
}

/** One line of the initiative list (the campaign's Scontro and the sheet's Iniziativa):
 *  initiative, name (and count), how hurt it looks or its HP, «Ora», «Deve tirare». */
export function FightLine({ row, dm }: { row: FightRow; dm?: FightLineDm }) {
  const { t } = useTranslation();
  const hp = dm?.hp ?? row.hp;
  const share = hp && hp.max > 0 ? hp.current / hp.max : 1;
  const bandLabel = (band: FightRow["bands"][number]["band"]) =>
    band === "down"
      ? t("fight.down")
      : band === "bloodied"
        ? t("character.health.bloodied")
        : t(`campaignHub.hpBand.${band}`);
  // The worst state colours the line; each state is counted when the row is a group.
  const worst = row.bands.at(-1)?.band;
  return (
    <div
      className="f-row f-fight"
      data-current={row.current || undefined}
      data-picked={dm?.selected || undefined}
    >
      {dm?.onSelect && (
        <button
          type="button"
          className="f-fight-pick"
          aria-pressed={dm.selected ?? false}
          aria-label={dm.label}
          onClick={dm.onSelect}
        />
      )}
      <span className="f-init">{row.initiative ?? ""}</span>
      <div className="f-row-main">
        <div className="f-row-t">
          {row.name}
          {row.count > 1 && (
            <span className="f-count">{`\u00a0×\u2060${row.count}`}</span>
          )}
        </div>
        {worst && (
          <div className="f-row-s" data-band={worst}>
            {row.bands
              .map((b) => (row.count > 1 ? `${b.count} ` : "") + bandLabel(b.band))
              .join("\u00a0· ")}
          </div>
        )}
      </div>
      {row.current && <span className="f-now">{t("fight.now")}</span>}
      {row.mustRoll && <span className="f-must">{t("fight.mustRoll")}</span>}
      {row.chips.length > 0 && (
        <div className="f-chips">
          {row.chips.map((c) => (
            <Chip key={c.kind + c.label} kind={c.kind}>
              {c.label}
            </Chip>
          ))}
        </div>
      )}
      {hp && (
        <div className="f-row-end">
          {dm?.onHp ? (
            <button
              type="button"
              className="f-stat f-fight-hp"
              aria-label={dm.label}
              onClick={dm.onHp}
            >
              <span
                className="f-stat-v"
                data-hp={share > 0.5 ? "ok" : share > 0.25 ? "low" : "bad"}
              >{`${hp.current}/${hp.max}`}</span>
              <span className="f-lbl">{t("units.hp")}</span>
            </button>
          ) : (
            <div className="f-stat">
              <div
                className="f-stat-v"
                data-hp={share > 0.5 ? "ok" : share > 0.25 ? "low" : "bad"}
              >{`${hp.current}/${hp.max}`}</div>
              <div className="f-lbl">{t("units.hp")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
