/**
 * The fight in the top bar (the classic CombatPip; D&D Beyond's player-view initiative
 * flags, BG3's active portrait): while my character is in a campaign fight, the round
 * and whose turn it is, with that creature's art; gold when it is mine. A tap opens my
 * character's Play screen. Nothing shows outside a fight.
 */
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

import { fightRows } from "@/domains/combat/fight-rows-view";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { useLocale } from "@/hooks/useLocale";
import { monsterPortraitUrl } from "@/data/monster-art";
import { Art } from "@/ui";

export function CombatPip() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const status = useCombatStatusStore((s) => s.status);
  if (!status) return null;
  const rows = fightRows(status.view.rows, status.view.currentId, {}, locale);
  const current = rows.find((r) => r.current);
  const art = current?.art ?? null;
  const label = status.gathering
    ? t("play.pip.gathering")
    : status.isMyTurn
      ? t("play.pip.mine", { round: status.round })
      : t("play.pip.theirs", { round: status.round, name: current?.name ?? "" });
  return (
    <Link
      className="f-pip"
      data-mine={status.isMyTurn || undefined}
      to={`/characters/${status.characterId}`}
      aria-label={label}
    >
      <span className="f-act-slot" data-painted="" aria-hidden="true">
        {art && "url" in art ? (
          <img className="f-art" src={art.url} alt="" />
        ) : art?.kind === "monster" && monsterPortraitUrl(art.id) ? (
          <img
            className="f-art f-dm-face"
            src={monsterPortraitUrl(art.id) ?? ""}
            alt=""
          />
        ) : art?.kind === "class" ? (
          <Art kind="class" id={art.id} fallback={null} />
        ) : (
          <b className="f-dm-initial">{(current?.name ?? "?").slice(0, 1)}</b>
        )}
      </span>
      <span className="f-pip-t">{label}</span>
    </Link>
  );
}
