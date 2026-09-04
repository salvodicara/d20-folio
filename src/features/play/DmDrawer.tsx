/**
 * The DM drawer — the ONE docked panel of the screen (UI spec rule 32).
 *
 * It opens from the right edge and SHIFTS the HUD rather than covering it: that is a layout
 * fact, so it is a flex sibling of the stage in `play.css`, not an overlay with a z-index.
 *
 * Six tabs, and every one of them is honest about what it has:
 *
 *  - **Registro** — the log as prose with the filters the DM actually asks for (everything ·
 *    rolls · wounds · DM-only · refused), Annulla per line, and Modifica opening the HP editor
 *    on the creature that line touched.
 *  - **Nascosti** — one switch row per thing the DM hides, each with a sentence beneath it:
 *    the hidden tokens, the monsters' HP numbers, the DM's own rolls.
 *  - **Nebbia** — the fog verbs (cover everything / lift it), the two fog modes, and the DM's
 *    own preview opacity, which is a per-DM comfort setting and therefore local, never logged.
 *  - **Regole** — the campaign's automation level: full auto, or log only.
 *  - **Scene** and **Note** — labelled, with one sentence each saying where they will live. No
 *    fake controls: a switch that does nothing is worse than an empty tab.
 */
import { useTranslation } from "react-i18next";
import { PlayIcon } from "./PlayIcon";
import { PlayTip } from "./PlayTip";
import { HpEditor, type HpEdit } from "./HpEditor";
import {
  DRAWER_TABS,
  LOG_FILTERS,
  filterLines,
  type DrawerTab,
  type LogFilter,
} from "./model";
import type { ActionId, EntityId } from "@/lib/combat/ids";
import type { Automation, ConditionId, Entity } from "@/lib/combat/types";
import type { LogLine } from "@/lib/views/encounter-log-view";

/** One creature the DM may hide from the players. */
export interface HiddenRow {
  readonly id: EntityId;
  readonly name: string;
  readonly hidden: boolean;
}

export interface DmDrawerProps {
  readonly tab: DrawerTab;
  readonly onTab: (tab: DrawerTab) => void;
  readonly onClose: () => void;

  readonly lines: readonly LogLine[];
  readonly filter: LogFilter;
  readonly onFilter: (filter: LogFilter) => void;
  readonly authorOf: (author: LogLine["author"]) => string;
  readonly onUndo: (action: ActionId) => void;
  /** The line the DM is correcting, and the creature its edit lands on. */
  readonly editing: { readonly line: ActionId; readonly entity: Entity } | null;
  readonly onEdit: (line: LogLine) => void;
  readonly onEditClose: () => void;
  readonly editName: string;
  readonly editConditions: readonly ConditionId[];
  readonly onHpApply: (edits: readonly HpEdit[]) => void;

  readonly tokens: readonly HiddenRow[];
  readonly onTokenHidden: (entity: EntityId, hidden: boolean) => void;
  readonly revealMonsterHp: boolean;
  readonly onRevealMonsterHp: (on: boolean) => void;
  readonly hiddenRolls: boolean;
  readonly onHiddenRolls: (on: boolean) => void;

  readonly fogCovered: boolean;
  readonly onCoverAll: () => void;
  readonly onFogOff: () => void;
  readonly fogOpacity: number;
  readonly onFogOpacity: (value: number) => void;

  readonly automation: Exclude<Automation, "propose-and-confirm">;
  readonly onAutomation: (value: Exclude<Automation, "propose-and-confirm">) => void;

  readonly round: number;
  readonly lineCount: number;
}

function Switch({
  on,
  label,
  onChange,
  testId,
}: {
  on: boolean;
  label: string;
  onChange: (on: boolean) => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="pl-switch"
      aria-checked={on}
      aria-label={label}
      data-testid={testId}
      onClick={() => onChange(!on)}
    />
  );
}

export function DmDrawer(props: DmDrawerProps) {
  const { t } = useTranslation();
  const {
    tab,
    onTab,
    onClose,
    lines,
    filter,
    onFilter,
    authorOf,
    onUndo,
    editing,
    onEdit,
    onEditClose,
    editName,
    editConditions,
    onHpApply,
    tokens,
    onTokenHidden,
    revealMonsterHp,
    onRevealMonsterHp,
    hiddenRolls,
    onHiddenRolls,
    fogCovered,
    onCoverAll,
    onFogOff,
    fogOpacity,
    onFogOpacity,
    automation,
    onAutomation,
    round,
    lineCount,
  } = props;

  const shown = filterLines(lines, filter);

  return (
    <aside
      className="pl-drawer"
      data-testid="pl-drawer"
      aria-label={t("play.drawer.title")}
    >
      <div className="pl-drawer__head">
        <b>{t("play.drawer.title")}</b>
        <PlayTip label={t("play.drawer.close")} hint={t("play.drawer.closeTip")}>
          <button
            type="button"
            className="pl-icon-btn"
            onClick={onClose}
            aria-label={t("play.drawer.close")}
            data-testid="pl-drawer-close"
          >
            <PlayIcon id="i-chevron-right" />
          </button>
        </PlayTip>
      </div>

      <div className="pl-dtabs" role="tablist" aria-label={t("play.drawer.tabs")}>
        {DRAWER_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            data-testid={`pl-dtab-${id}`}
          >
            {t(`play.drawer.tab.${id}`)}
          </button>
        ))}
      </div>

      <div className="pl-drawer__body">
        {tab === "log" ? (
          <>
            <div
              className="pl-filters"
              role="group"
              aria-label={t("play.drawer.filters")}
            >
              {LOG_FILTERS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  onClick={() => onFilter(id)}
                  data-testid={`pl-filter-${id}`}
                >
                  {t(`play.drawer.filter.${id}`)}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="pl-note">{t("play.drawer.logEmpty")}</p>
            ) : (
              <ul className="pl-register">
                {shown.map((line) => (
                  <li key={line.id} data-kind={line.kind}>
                    <span className="pl-register__who">{authorOf(line.author)}</span>
                    <span className="pl-register__text">{line.text}</span>
                    {line.verdict !== null ? (
                      <button type="button" onClick={() => onEdit(line)}>
                        {t("play.drawer.edit")}
                      </button>
                    ) : null}
                    {line.undoable ? (
                      <button
                        type="button"
                        onClick={() => onUndo(line.id)}
                        data-testid={`pl-undo-${line.id}`}
                      >
                        {t("play.drawer.undo")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {editing ? (
              <HpEditor
                // A different creature is a different editor: the fields start from it and are
                // never re-synced while the DM is typing into them.
                key={editing.entity.id}
                entity={editing.entity}
                name={editName}
                conditions={editConditions}
                onApply={onHpApply}
                onClose={onEditClose}
              />
            ) : null}
            <div className="pl-drawer__foot">
              {t("play.drawer.foot", { round, count: lineCount })}
            </div>
          </>
        ) : null}

        {tab === "hidden" ? (
          <>
            <div className="pl-sec">
              <span>
                {t("play.drawer.hiddenTokens")}
                <small>{tokens.filter((row) => row.hidden).length}</small>
              </span>
            </div>
            {tokens.length === 0 ? (
              <p className="pl-note">{t("play.drawer.noTokens")}</p>
            ) : (
              tokens.map((row) => (
                <div className="pl-switch-row" key={row.id}>
                  <span className="pl-switch-row__name">
                    {row.name}
                    <small>
                      {row.hidden
                        ? t("play.drawer.tokenHidden")
                        : t("play.drawer.tokenVisible")}
                    </small>
                  </span>
                  <Switch
                    on={row.hidden}
                    label={t("play.drawer.hideToken", { name: row.name })}
                    onChange={(on) => onTokenHidden(row.id, on)}
                    testId={`pl-hide-${row.id}`}
                  />
                </div>
              ))
            )}
            <div className="pl-sec">
              <span>{t("play.drawer.secrets")}</span>
            </div>
            <div className="pl-switch-row">
              <span className="pl-switch-row__name">
                {t("play.drawer.monsterHp")}
                <small>{t("play.drawer.monsterHpTip")}</small>
              </span>
              <Switch
                on={revealMonsterHp}
                label={t("play.drawer.monsterHp")}
                onChange={onRevealMonsterHp}
                testId="pl-reveal-hp"
              />
            </div>
            <div className="pl-switch-row">
              <span className="pl-switch-row__name">
                {t("play.drawer.hiddenRolls")}
                <small>{t("play.drawer.hiddenRollsTip")}</small>
              </span>
              <Switch
                on={hiddenRolls}
                label={t("play.drawer.hiddenRolls")}
                onChange={onHiddenRolls}
                testId="pl-hidden-rolls"
              />
            </div>
          </>
        ) : null}

        {tab === "fog" ? (
          <>
            <div className="pl-sec">
              <span>{t("play.fog.title")}</span>
            </div>
            <p className="pl-note">
              {fogCovered ? t("play.fog.onNote") : t("play.fog.offNote")}
            </p>
            <div className="pl-hpedit__row">
              <button
                type="button"
                className="pl-ghost"
                onClick={onCoverAll}
                data-testid="pl-fog-cover"
              >
                {t("play.fog.coverAll")}
              </button>
              <button
                type="button"
                className="pl-ghost"
                onClick={onFogOff}
                data-testid="pl-fog-off"
              >
                {t("play.fog.off")}
              </button>
            </div>
            <div className="pl-switch-row">
              <span className="pl-switch-row__name">
                {t("play.fog.opacity")}
                <small>{t("play.fog.opacityTip")}</small>
              </span>
              <input
                type="range"
                min={20}
                max={100}
                value={Math.round(fogOpacity * 100)}
                aria-label={t("play.fog.opacity")}
                data-testid="pl-fog-opacity"
                onChange={(event) => onFogOpacity(Number(event.target.value) / 100)}
              />
            </div>
          </>
        ) : null}

        {tab === "rules" ? (
          <>
            <div className="pl-sec">
              <span>{t("play.rules.title")}</span>
            </div>
            {(["full-auto", "log-only"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                className="pl-option"
                aria-checked={automation === value}
                onClick={() => onAutomation(value)}
                data-testid={`pl-automation-${value}`}
              >
                <span className="pl-option__radio" />
                <span className="pl-option__name">
                  {t(`play.rules.${value}`)}
                  <small>{t(`play.rules.${value}Tip`)}</small>
                </span>
              </button>
            ))}
            <p className="pl-note">{t("play.rules.note")}</p>
          </>
        ) : null}

        {tab === "scene" ? (
          <>
            <div className="pl-sec">
              <span>{t("play.drawer.tab.scene")}</span>
            </div>
            <p className="pl-note">{t("play.drawer.sceneEmpty")}</p>
          </>
        ) : null}

        {tab === "notes" ? (
          <>
            <div className="pl-sec">
              <span>{t("play.drawer.tab.notes")}</span>
            </div>
            <p className="pl-note">{t("play.drawer.notesEmpty")}</p>
          </>
        ) : null}
      </div>
    </aside>
  );
}
