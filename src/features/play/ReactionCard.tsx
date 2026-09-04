/**
 * The reaction window (component 10; UI spec rule 32) — the card that appears on the map beside
 * the creature that MAY react, for the person who controls it.
 *
 * It renders from `state.windows`: the reducer opened the window, named who is eligible, and is
 * holding the triggering action open until somebody answers. Two answers exist and both are log
 * actions, never local state: "Attacca" appends the reaction intent carrying `window: id`;
 * "Lascia andare" appends `resolve`, which closes the window and lets the held action through.
 *
 * The card names WHOSE decision the table is waiting on, because at a remote table the silence
 * is otherwise unreadable.
 */
import { useTranslation } from "react-i18next";
import { PlayIcon } from "./PlayIcon";
import type { WindowId } from "@/lib/combat/ids";

export interface ReactionOffer {
  readonly window: WindowId;
  /** The creature that may react, already named. */
  readonly actor: string;
  /** What happened, as one sentence from the log presenter. */
  readonly trigger: string;
  /** The reaction on offer, already named; `null` when the creature has none to spend. */
  readonly mechanic: { readonly key: string; readonly label: string } | null;
  /** Who the table is waiting on. */
  readonly waitingOn: string;
  /** This viewer controls the creature and may answer. */
  readonly mine: boolean;
}

export interface ReactionCardProps {
  readonly offer: ReactionOffer | null;
  readonly onReact: (offer: ReactionOffer) => void;
  readonly onPass: (offer: ReactionOffer) => void;
}

export function ReactionCard({ offer, onReact, onPass }: ReactionCardProps) {
  const { t } = useTranslation();
  if (!offer) return null;
  return (
    <section
      className="pl-float pl-reaction pl-panel pl-panel--framed"
      data-testid="pl-reaction"
    >
      <span className="pl-brackets" />
      <div className="pl-reaction__head">
        <PlayIcon id="e-reaction" />
        <b>{t("play.reaction.canReact", { name: offer.actor })}</b>
        <span>{offer.waitingOn}</span>
      </div>
      <p>{offer.trigger}</p>
      {offer.mine ? (
        <div className="pl-reaction__opts">
          <button
            type="button"
            className="pl-typed"
            disabled={offer.mechanic === null}
            onClick={() => onReact(offer)}
            data-testid="pl-reaction-take"
          >
            {offer.mechanic?.label ?? t("play.reaction.none")}
          </button>
          <button
            type="button"
            className="pl-ghost"
            onClick={() => onPass(offer)}
            data-testid="pl-reaction-pass"
          >
            {t("play.reaction.pass")}
          </button>
        </div>
      ) : (
        <p className="pl-note">{t("play.reaction.waiting", { who: offer.waitingOn })}</p>
      )}
    </section>
  );
}
