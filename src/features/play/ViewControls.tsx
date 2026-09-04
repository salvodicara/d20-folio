/**
 * View controls — top-right (UI spec rule 28): zoom in, zoom out, recentre, and the DM's
 * "player view" eye, which renders the map exactly as a spectator sees it.
 *
 * Flat icon buttons, the tool-rail kind (rule 39), each with a rule-40 tooltip. There is no
 * minimap: the rule names it as a thing this screen does not have.
 */
import { useTranslation } from "react-i18next";
import { PlayIcon } from "./PlayIcon";
import { PlayTip } from "./PlayTip";

export interface ViewControlsProps {
  readonly onZoom: (factor: number) => void;
  readonly onFit: () => void;
  /** The DM's preview switch; `null` for anyone who is not the DM. */
  readonly playerView: boolean | null;
  readonly onPlayerView: (on: boolean) => void;
}

export function ViewControls({
  onZoom,
  onFit,
  playerView,
  onPlayerView,
}: ViewControlsProps) {
  const { t } = useTranslation();
  return (
    <div
      className="pl-view pl-panel"
      role="toolbar"
      aria-label={t("play.view.aria")}
      data-testid="pl-view"
    >
      <PlayTip
        label={t("play.view.zoomIn")}
        hint={t("play.view.zoomInTip")}
        side="bottom"
      >
        <button
          type="button"
          className="pl-icon-btn"
          onClick={() => onZoom(1.2)}
          aria-label={t("play.view.zoomIn")}
        >
          <PlayIcon id="i-plus" />
        </button>
      </PlayTip>
      <PlayTip
        label={t("play.view.zoomOut")}
        hint={t("play.view.zoomOutTip")}
        side="bottom"
      >
        <button
          type="button"
          className="pl-icon-btn"
          onClick={() => onZoom(1 / 1.2)}
          aria-label={t("play.view.zoomOut")}
        >
          <PlayIcon id="i-minus" />
        </button>
      </PlayTip>
      <PlayTip label={t("play.view.fit")} hint={t("play.view.fitTip")} side="bottom">
        <button
          type="button"
          className="pl-icon-btn"
          onClick={onFit}
          aria-label={t("play.view.fit")}
        >
          <PlayIcon id="i-locate" />
        </button>
      </PlayTip>
      {playerView === null ? null : (
        <PlayTip
          label={t("play.view.player")}
          hint={t("play.view.playerTip")}
          side="bottom"
        >
          <button
            type="button"
            className="pl-icon-btn pl-icon-btn--dm"
            aria-pressed={playerView}
            aria-label={t("play.view.player")}
            onClick={() => onPlayerView(!playerView)}
            data-testid="pl-player-view"
          >
            <PlayIcon id={playerView ? "i-eye-off" : "i-eye"} />
          </button>
        </PlayTip>
      )}
    </div>
  );
}
