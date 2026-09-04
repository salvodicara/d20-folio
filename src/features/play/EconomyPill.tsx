/**
 * The action-economy pill and the spell-slot diamonds — the line above the hotbar (UI spec
 * rules 5, 29; information code §4).
 *
 * Shape AND colour, never colour alone: action = teal circle, bonus = orange triangle,
 * reaction = magenta hexagon, movement = blue square. Spent is the SAME shape, hollow — which
 * is what makes the pill readable in greyscale and to a colour-blind player, and why each sign
 * is a sprite symbol rather than a coloured dot.
 *
 * Every sign carries its explain (component 8): "what does the triangle mean" must have an
 * answer on the screen where the triangle is.
 */
import { useTranslation } from "react-i18next";
import { PlayIcon } from "./PlayIcon";
import { PlayExplain, PlayTip } from "./PlayTip";
import { slotPools } from "./model";
import type { Entity } from "@/lib/combat/types";
import { movementBudget, remainingMovement } from "@/lib/combat/map";
import { feetToMetres } from "./map/geometry";

const SIGNS = [
  { id: "action", icon: "e-action" },
  { id: "bonus", icon: "e-bonus" },
  { id: "reaction", icon: "e-reaction" },
] as const;

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

export interface EconomyPillProps {
  readonly entity: Entity;
  /** The entity is the one acting right now; otherwise the pill reads as its next turn's. */
  readonly acting: boolean;
}

export function EconomyPill({ entity, acting }: EconomyPillProps) {
  const { t, i18n } = useTranslation();
  const pools = slotPools(entity);
  const metres = (feet: number): string =>
    feetToMetres(feet).toLocaleString(i18n.language, { maximumFractionDigits: 1 });
  const left = acting ? remainingMovement(entity) : movementBudget(entity);
  return (
    <div className="pl-ecoline" data-testid="pl-economy">
      <div className="pl-ecopill" aria-label={t("play.economy.aria")}>
        {SIGNS.map((sign) => {
          const spent = entity.turn[sign.id] > 0;
          return (
            <PlayTip
              key={sign.id}
              label={t(`play.economy.${sign.id}`)}
              hint={t(spent ? "play.economy.spent" : `play.economy.${sign.id}Tip`)}
            >
              <span
                className="pl-eco"
                data-eco={sign.id}
                data-spent={spent ? "true" : "false"}
                data-testid={`pl-eco-${sign.id}`}
                tabIndex={0}
                role="img"
                aria-label={t(
                  spent ? "play.economy.signSpent" : "play.economy.signLeft",
                  { sign: t(`play.economy.${sign.id}`) }
                )}
              >
                <PlayIcon id={sign.icon} />
              </span>
            </PlayTip>
          );
        })}
        <span className="pl-ecopill__move">
          <span className="pl-eco" data-eco="movement" aria-hidden="true">
            <PlayIcon id="e-move" />
          </span>
          {t("play.economy.movement", {
            left: metres(left),
            total: metres(movementBudget(entity)),
          })}
        </span>
      </div>

      {pools.length > 0 ? (
        <div className="pl-slots" data-testid="pl-slots">
          <PlayIcon id="i-spell-slot" />
          <PlayExplain
            term={t("play.explain.slots.abbr")}
            label={t("play.explain.slots.label")}
            hint={t("play.explain.slots.hint")}
          />
          {pools.map((pool) => (
            <span key={`${pool.pool}-${pool.level}`} style={{ display: "contents" }}>
              <span className="pl-slots__level">
                {pool.pool === "pact" ? t("play.slots.pact") : (ROMAN[pool.level] ?? "")}
              </span>
              {Array.from({ length: pool.max }, (_, index) => (
                <i key={index} data-spent={index >= pool.current ? "true" : "false"} />
              ))}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
