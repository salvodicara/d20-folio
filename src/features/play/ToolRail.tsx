/**
 * The tool rail — the left edge (UI spec rule 28) in Owlbear's own form (rule 34, ledger §10a):
 * a vertical strip of flat icon buttons, and the ACTIVE tool's options as a horizontal
 * sub-toolbar beside it, so the top-centre stays the initiative strip.
 *
 * Five tools exist in this stage, and only five are offered — a rail advertising a pen that
 * draws nothing would be worse than a rail that says what it has. Draw, pointer, text and
 * scenes are named in the ledger and land later; nothing here pretends otherwise.
 */
import { useTranslation } from "react-i18next";
import { PlayIcon } from "./PlayIcon";
import { PlayTip } from "./PlayTip";
import type { PlayTool } from "./tools";

export interface ToolRailProps {
  readonly tool: PlayTool;
  readonly onTool: (tool: PlayTool) => void;
  readonly dm: boolean;
  /** Fog verbs, DM only: cover everything, or lift the fog entirely. */
  readonly onCoverAll: () => void;
  readonly onFogOff: () => void;
}

interface RailItem {
  readonly id: PlayTool;
  readonly icon: string;
  readonly hotkey: string;
  readonly dmOnly?: boolean;
}

const RAIL: readonly RailItem[] = [
  { id: "select", icon: "i-pointer", hotkey: "V" },
  { id: "pan", icon: "i-hand", hotkey: "H" },
  { id: "ruler", icon: "i-ruler", hotkey: "R" },
  { id: "add", icon: "i-user-plus", hotkey: "A", dmOnly: true },
  { id: "fog-reveal", icon: "i-fog", hotkey: "F", dmOnly: true },
];

export function ToolRail({ tool, onTool, dm, onCoverAll, onFogOff }: ToolRailProps) {
  const { t } = useTranslation();
  const fogging = tool === "fog-reveal" || tool === "fog-hide";
  return (
    <>
      <div
        className="pl-float pl-tools pl-panel"
        role="toolbar"
        aria-orientation="vertical"
        aria-label={t("play.tools.aria")}
        data-testid="pl-tools"
      >
        {RAIL.filter((item) => dm || !item.dmOnly).map((item, index) => (
          <span key={item.id}>
            {index === 3 ? <span className="pl-tools__sep" /> : null}
            <PlayTip
              label={t(`play.tools.${item.id}`)}
              hint={t(`play.tools.${item.id}Tip`)}
              hotkey={item.hotkey}
              side="right"
            >
              <button
                type="button"
                className="pl-icon-btn"
                aria-pressed={item.id === "fog-reveal" ? fogging : tool === item.id}
                aria-label={t(`play.tools.${item.id}`)}
                onClick={() => onTool(item.id)}
                data-testid={`pl-tool-${item.id}`}
              >
                <PlayIcon id={item.icon} />
              </button>
            </PlayTip>
          </span>
        ))}
      </div>

      {/* The active tool's own options, beside the rail (rule 34). */}
      {tool === "ruler" ? (
        <div className="pl-float pl-subbar pl-panel" data-testid="pl-subbar">
          <span className="pl-subbar__name">{t("play.tools.ruler")}</span>
          <span className="pl-subbar__hint">{t("play.tools.rulerHint")}</span>
        </div>
      ) : null}
      {fogging ? (
        <div className="pl-float pl-subbar pl-panel" data-testid="pl-subbar">
          <span className="pl-subbar__name">{t("play.fog.title")}</span>
          <span className="pl-dmtag">{t("play.role.dm")}</span>
          <button
            type="button"
            className="pl-icon-btn"
            aria-pressed={tool === "fog-reveal"}
            onClick={() => onTool("fog-reveal")}
          >
            {t("play.fog.reveal")}
          </button>
          <button
            type="button"
            className="pl-icon-btn"
            aria-pressed={tool === "fog-hide"}
            onClick={() => onTool("fog-hide")}
          >
            {t("play.fog.hide")}
          </button>
          <span className="pl-subbar__sep" />
          <button type="button" className="pl-ghost" onClick={onCoverAll}>
            {t("play.fog.coverAll")}
          </button>
          <button type="button" className="pl-ghost" onClick={onFogOff}>
            {t("play.fog.off")}
          </button>
        </div>
      ) : null}
    </>
  );
}
