/**
 * The scene header — top-left, the smallest panel on the screen (UI spec rule 28: the top edge
 * says who acts). Scene name, round number, and whose turn it is; the DM's own turn carries the
 * DM's tone so nobody at the table has to ask who is acting.
 */
import { useTranslation } from "react-i18next";

export interface SceneHeaderProps {
  readonly title: string;
  readonly round: number;
  /** The acting creature's name, or `null` before turn order is set. */
  readonly current: string | null;
  /** The acting creature is run by the DM. */
  readonly currentIsDm: boolean;
}

export function SceneHeader({ title, round, current, currentIsDm }: SceneHeaderProps) {
  const { t } = useTranslation();
  return (
    <header
      className="pl-float pl-scene pl-panel pl-panel--framed"
      data-testid="pl-scene"
    >
      <span className="pl-brackets" />
      <span className="pl-scene__title">{title}</span>
      <span className="pl-scene__round">
        {current === null ? (
          t("play.scene.notStarted")
        ) : (
          <>
            {t("play.scene.roundLabel")} <b>{round}</b>
            {" · "}
            {t("play.scene.turnOf", { name: current })}
          </>
        )}
      </span>
      {currentIsDm ? <span className="pl-scene__dm">{t("play.role.dm")}</span> : null}
    </header>
  );
}
