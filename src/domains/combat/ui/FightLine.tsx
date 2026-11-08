import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { FightArt, FightRow } from "@/domains/combat/fight-rows-view";
import { monsterPortraitUrl } from "@/data/monster-art";
import { Art, Chip } from "@/ui";

/** The DM's hands on a line: its creatures' HP (a monster's numbers are the DM's own),
 *  and a tap on the HP for «Danni e cure» (D&D Beyond's tracker). */
export interface FightLineDm {
  hp: { current: number; max: number };
  label: string;
  onHp: () => void;
}

/** One line of the initiative list (the campaign's Scontro and the sheet's Iniziativa),
 *  as a grid so every line keeps the same columns (BG3's turn order, D&D Beyond's
 *  tracker): initiative, the creature's art in the Play rows' slot, name (and count) with
 *  how hurt it looks, its state («Ora», «Deve tirare»), and its HP on the right. */
export function FightLine({
  row,
  dm,
  action,
}: {
  row: FightRow;
  dm?: FightLineDm;
  /** The line's own action (the DM's area spell for the monster whose turn it is). */
  action?: ReactNode;
}) {
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
  const value = hp && (
    <>
      <span
        className="f-stat-v"
        data-hp={share > 0.5 ? "ok" : share > 0.25 ? "low" : "bad"}
      >{`${hp.current}/${hp.max}`}</span>
      <span className="f-lbl">{t("units.hp")}</span>
    </>
  );
  return (
    <div className="f-row f-fight" data-current={row.current || undefined}>
      <span className="f-init">{row.initiative ?? ""}</span>
      <span className="f-act-slot" data-painted="" aria-hidden="true">
        <LineArt art={row.art} name={row.name} />
      </span>
      <div className="f-row-main">
        <div className="f-row-t">
          {row.name}
          {row.count > 1 && (
            <span className="f-count">{"\u00a0×\u2060" + String(row.count)}</span>
          )}
        </div>
        {worst && (
          <div className="f-row-s" data-band={worst}>
            {row.bands
              .map((b) => (row.count > 1 ? `${b.count} ` : "") + bandLabel(b.band))
              .join("\u00a0· ")}
          </div>
        )}
        {row.chips.length > 0 && (
          <div className="f-chips">
            {row.chips.map((c) => (
              <Chip key={c.kind + c.label} kind={c.kind}>
                {c.label}
              </Chip>
            ))}
          </div>
        )}
        {action && <div className="f-fight-act">{action}</div>}
      </div>
      <span className="f-fight-state">
        {row.current && <span className="f-now">{t("fight.now")}</span>}
        {row.mustRoll && <span className="f-must">{t("fight.mustRoll")}</span>}
      </span>
      <span className="f-fight-hpcol">
        {value &&
          (dm?.onHp ? (
            <button
              type="button"
              className="f-stat f-fight-hp"
              aria-label={dm.label}
              onClick={dm.onHp}
            >
              {value}
            </button>
          ) : (
            <span className="f-stat">{value}</span>
          ))}
      </span>
    </div>
  );
}

/** The creature's painting, the character's portrait or crest; else its initial. */
function LineArt({ art, name }: { art: FightArt | null; name: string }) {
  const initial = <b className="f-dm-initial">{name.slice(0, 1)}</b>;
  if (!art) return initial;
  if ("url" in art)
    return <img className="f-art" src={art.url} alt="" loading="lazy" decoding="async" />;
  if (art.kind === "class") return <Art kind="class" id={art.id} fallback={initial} />;
  // A monster's own painting, cropped to its head: every creature has its own (the icon
  // set still repeats a motif across kin, e.g. goblins).
  const painting = monsterPortraitUrl(art.id);
  return painting ? <MonsterFace src={painting} /> : initial;
}

/** A creature's painting, cropped to its head (D&D Beyond's builder avatars). */
export function MonsterFace({ src }: { src: string }) {
  return (
    <img className="f-art f-dm-face" src={src} alt="" loading="lazy" decoding="async" />
  );
}
