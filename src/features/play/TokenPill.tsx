/**
 * The token pill — the horizontal strip under the selected token (UI spec rule 34, Owlbear
 * parity ledger §10a), scoped by ownership.
 *
 * What it offers depends on who is looking: the DM sets initiative, hides the token from the
 * players and removes the creature from the table; the creature's own controller can only leave
 * the table. Nothing here is a hidden capability check on the client — the rules refuse what
 * this hides — but a control a person cannot use should not be on their screen either.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlayIcon } from "./PlayIcon";
import { PlayTip } from "./PlayTip";
import type { EntityId } from "@/lib/combat/ids";

export interface TokenPillProps {
  readonly entity: EntityId;
  readonly name: string;
  readonly initiative: number | null;
  readonly hidden: boolean;
  /** The viewer is the DM: initiative, hide and remove. */
  readonly dm: boolean;
  /** The viewer controls this creature and may leave the table with it. */
  readonly mine: boolean;
  /**
   * The creature is a player's own character (origin `character`), so the DM cannot take it off
   * the table: `remove-entity` writes nothing back to the personal `combat/state`, and the
   * fight's HP would be lost. Only its owner's "Alzati" (`leaveTable`) carries the outcome home.
   */
  readonly seatedCharacter: boolean;
  readonly onInitiative: (entity: EntityId, value: number) => void;
  readonly onHidden: (entity: EntityId, hidden: boolean) => void;
  readonly onRemove: (entity: EntityId) => void;
  readonly onLeave: (entity: EntityId) => void;
}

export function TokenPill(props: TokenPillProps) {
  const { t } = useTranslation();
  const {
    entity,
    name,
    initiative,
    hidden,
    dm,
    mine,
    seatedCharacter,
    onInitiative,
    onHidden,
    onRemove,
    onLeave,
  } = props;
  const [draft, setDraft] = useState(initiative === null ? "" : String(initiative));

  if (!dm && !mine) return null;

  const commit = () => {
    const value = Number(draft);
    if (draft !== "" && Number.isFinite(value)) onInitiative(entity, value);
  };

  return (
    <div className="pl-tokenpill pl-panel" data-testid="pl-token-pill">
      {dm ? (
        <PlayTip label={t("monster.initiative")} hint={t("play.pill.initiativeTip")}>
          <input
            className="pl-tokenpill__init"
            type="number"
            inputMode="numeric"
            value={draft}
            placeholder={t("play.pill.initiativeShort")}
            aria-label={t("monster.initiative")}
            data-testid="pl-pill-initiative"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
            }}
          />
        </PlayTip>
      ) : null}
      {dm ? (
        <>
          <span className="pl-tokenpill__sep" />
          <PlayTip
            label={hidden ? t("play.pill.show") : t("campaignHub.hideNote")}
            hint={t("play.pill.hideTip")}
          >
            <button
              type="button"
              className="pl-icon-btn pl-icon-btn--dm"
              aria-pressed={hidden}
              aria-label={hidden ? t("play.pill.show") : t("campaignHub.hideNote")}
              data-testid="pl-pill-hide"
              onClick={() => onHidden(entity, !hidden)}
            >
              <PlayIcon id={hidden ? "i-eye-off" : "i-eye"} />
            </button>
          </PlayTip>
          <PlayTip
            label={t("common.remove")}
            hint={
              seatedCharacter
                ? t("play.pill.removeSeated", { name })
                : t("play.pill.removeTip", { name })
            }
          >
            <button
              type="button"
              className="pl-icon-btn"
              aria-label={t("common.remove")}
              data-testid="pl-pill-remove"
              disabled={seatedCharacter}
              onClick={() => onRemove(entity)}
            >
              <PlayIcon id="i-trash" />
            </button>
          </PlayTip>
        </>
      ) : null}
      {mine ? (
        <PlayTip label={t("play.pill.leave")} hint={t("play.pill.leaveTip")}>
          <button
            type="button"
            className="pl-ghost"
            data-testid="pl-pill-leave"
            onClick={() => onLeave(entity)}
          >
            {t("play.pill.leave")}
          </button>
        </PlayTip>
      ) : null}
    </div>
  );
}
