/**
 * The hotbar — the bottom edge: what I can do (UI spec rules 28–29).
 *
 * Baldur's Gate 3's grammar exactly: the portrait in its gold ring with the HP pill and the
 * level roundel, the weapon-set tiles beside it, the economy pill and the slot diamonds above
 * the bar, 44px tiles in groups split by red dividers, the pill tabs beneath, and — the one
 * solid button on the screen — the End turn ring in cyan, with the dice and reaction medallions
 * beside it.
 *
 * Two rules shape the tiles and are worth restating where they are implemented:
 *
 *  - **Unusable is never hidden** (rule 29): a tile the reducer would refuse renders at 40%
 *    with the reason in its tooltip, so the bar's geography never moves under the hand and the
 *    player learns WHY, not just that nothing happened.
 *  - **A tab with nothing in it says so** (this task's brief): an empty group renders one honest
 *    sentence, never a row of decorative empty squares.
 */
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { EconomyPill } from "./EconomyPill";
import { PlayIcon } from "./PlayIcon";
import { PlayTip } from "./PlayTip";
import { HOTBAR_TABS, type HotbarTab } from "./model";
import type { HotbarTile } from "./tiles";
import type { Entity } from "@/lib/combat/types";

export interface HotbarProps {
  readonly entity: Entity;
  readonly name: string;
  readonly portrait: string | null;
  readonly level: number | null;
  /** The DM is driving somebody else's creature: red ring and the "· DM" tag (rule 32). */
  readonly dmControlled: boolean;
  readonly acting: boolean;
  readonly tab: HotbarTab;
  readonly onTab: (tab: HotbarTab) => void;
  readonly groups: {
    readonly common: readonly HotbarTile[];
    readonly spells: readonly HotbarTile[];
    readonly items: readonly HotbarTile[];
  };
  /** Resolves a tile's label id — the engine never carries display strings. */
  readonly labelOf: (label: string) => string;
  /** Why a tile is refused, as one sentence. */
  readonly reasonOf: (tile: HotbarTile) => string | null;
  readonly selectedTile: string | null;
  readonly onTile: (tile: HotbarTile) => void;
  readonly onEndTurn: () => void;
  readonly canEndTurn: boolean;
  readonly onDice: () => void;
  readonly onReaction: () => void;
  readonly openWindows: number;
  readonly onHp: () => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function TileButton({
  tile,
  label,
  reason,
  selected,
  onTile,
}: {
  tile: HotbarTile;
  label: string;
  reason: string | null;
  selected: boolean;
  onTile: (tile: HotbarTile) => void;
}) {
  const { t } = useTranslation();
  return (
    <PlayTip
      label={label}
      hint={reason ?? t(`play.economy.${tile.economy}Cost`)}
      side="top"
    >
      <button
        type="button"
        className="pl-tile"
        data-usable={tile.usable ? "true" : "false"}
        data-spell={tile.group === "spell" ? "true" : "false"}
        data-testid={`pl-tile-${tile.key}`}
        aria-pressed={selected}
        aria-label={label}
        onClick={() => onTile(tile)}
      >
        <span className="pl-tile__eco" data-eco={tile.economy} aria-hidden="true" />
        <PlayIcon id={tile.icon} />
        {tile.level !== null ? (
          <span className="pl-tile__level">
            {tile.level === 0
              ? "·"
              : ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"][tile.level]}
          </span>
        ) : null}
        {tile.uses ? <span className="pl-tile__uses">{tile.uses.current}</span> : null}
      </button>
    </PlayTip>
  );
}

export function Hotbar(props: HotbarProps) {
  const { t } = useTranslation();
  const {
    entity,
    name,
    portrait,
    level,
    dmControlled,
    acting,
    tab,
    onTab,
    groups,
    labelOf,
    reasonOf,
    selectedTile,
    onTile,
    onEndTurn,
    canEndTurn,
    onDice,
    onReaction,
    openWindows,
    onHp,
  } = props;

  // The default tab shows the whole bar the way the rendition draws it — weapons and common
  // actions · spells · items, split by the red dividers; the other tabs narrow to one group.
  const shown: readonly (readonly HotbarTile[])[] = (
    tab === "common"
      ? [groups.common, groups.spells, groups.items]
      : tab === "spells"
        ? [groups.spells]
        : tab === "items"
          ? [groups.items]
          : []
  ).filter((group) => group.length > 0);
  // The two weapon slots the rendition puts beside the portrait: the first attacks on the bar.
  const weapons = groups.common.filter((tile) => tile.damageType !== null).slice(0, 4);

  return (
    <div className="pl-float pl-hud" data-testid="pl-hotbar">
      <div className="pl-hud__identity">
        {dmControlled ? (
          <span className="pl-portrait__tag">{t("play.hotbar.dmControlled")}</span>
        ) : null}
        <div className={cn("pl-portrait", dmControlled && "pl-portrait--foe")}>
          <div className="pl-portrait__face">
            {portrait ? <img src={portrait} alt="" /> : initials(name)}
          </div>
          {level === null ? null : <span className="pl-portrait__level">{level}</span>}
          <PlayTip label={t("play.hotbar.hp")} hint={t("play.hotbar.hpTip")}>
            <button type="button" className="pl-portrait__hp" onClick={onHp}>
              {entity.vitals.hp} / {entity.stats.maxHp}
              {entity.vitals.tempHp ? ` +${entity.vitals.tempHp.amount}` : ""}
            </button>
          </PlayTip>
        </div>
        {weapons.length > 0 ? (
          <div className="pl-weapons">
            {weapons.map((tile) => (
              <TileButton
                key={tile.key}
                tile={tile}
                label={labelOf(tile.label)}
                reason={reasonOf(tile)}
                selected={selectedTile === tile.key}
                onTile={onTile}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div
        className={cn("pl-bar pl-panel pl-panel--framed", dmControlled && "pl-bar--dm")}
      >
        <span className="pl-brackets" />
        <EconomyPill entity={entity} acting={acting} />

        {shown.length === 0 ? (
          <p className="pl-empty-line" data-testid="pl-hotbar-empty">
            {t(`play.hotbar.empty.${tab}`)}
          </p>
        ) : (
          <div className="pl-cells">
            {shown.map((group, index) => (
              <span key={index} style={{ display: "contents" }}>
                {index > 0 ? <span className="pl-divider" aria-hidden="true" /> : null}
                <div
                  className="pl-group"
                  style={
                    {
                      "--pl-cols": Math.max(1, Math.ceil(group.length / 2)),
                    } as CSSProperties
                  }
                >
                  {group.map((tile) => (
                    <TileButton
                      key={tile.key}
                      tile={tile}
                      label={labelOf(tile.label)}
                      reason={reasonOf(tile)}
                      selected={selectedTile === tile.key}
                      onTile={onTile}
                    />
                  ))}
                </div>
              </span>
            ))}
          </div>
        )}

        <div
          className="pl-bartabs pl-tabs"
          role="tablist"
          aria-label={t("play.hotbar.tabs")}
        >
          {HOTBAR_TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTab(id)}
              data-testid={`pl-tab-${id}`}
            >
              {t(`play.hotbar.tab.${id}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="pl-turn">
        <div className="pl-sidebtns">
          <PlayTip label={t("play.dice.title")} hint={t("play.dice.tip")} side="left">
            <button
              type="button"
              className="pl-medal"
              onClick={onDice}
              aria-label={t("play.dice.title")}
              data-testid="pl-dice"
            >
              <PlayIcon id="i-d20" />
            </button>
          </PlayTip>
          <PlayTip
            label={t("play.reaction.title")}
            hint={
              openWindows > 0
                ? t("play.reaction.openTip", { count: openWindows })
                : t("play.reaction.noneTip")
            }
            side="left"
          >
            <button
              type="button"
              className="pl-medal pl-medal--reaction"
              onClick={onReaction}
              disabled={openWindows === 0}
              aria-label={t("play.reaction.title")}
              data-testid="pl-reaction-medal"
            >
              <PlayIcon id="e-reaction" />
            </button>
          </PlayTip>
        </div>
        <PlayTip
          label={t("play.turn.end")}
          hint={canEndTurn ? t("play.turn.endTip") : t("play.turn.notYours")}
          hotkey="Space"
          side="left"
        >
          <button
            type="button"
            className="pl-endturn"
            onClick={onEndTurn}
            disabled={!canEndTurn}
            data-testid="pl-end-turn"
          >
            {t("play.turn.end")}
          </button>
        </PlayTip>
      </div>
    </div>
  );
}
