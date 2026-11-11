/**
 * Board 2b, D4: the reaction extras on the Play screen. The readied spell waits under
 * the turn strip as a note with its one action, «Rilascia · Reazione» (BG3's reaction
 * ask), and «Altra reazione» closes the Reactions group as a row like the others
 * (D&D Beyond's Actions › Reaction section): a reaction resolved at the table, marked
 * so the round's Reaction reads as spent. Both go through the classic economy, undoable.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { reactionExtrasView } from "@/domains/play/reactions-resistance-view";
import { ActionIcon } from "@/domains/play/ui/ActionIcon";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import type { Locale } from "@/lib/locale";
import { offListReactionAction } from "@/lib/views/off-list-reaction";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { Button } from "@/ui";

function useReactionTurn() {
  const reactionUsed = useCombatStore((s) => s.reactionUsed);
  const reactionUsedId = useCombatStore((s) => s.reactionUsedId);
  return { reactionUsed, reactionUsedId };
}

/** The readied spell, under the turn strip, while it is held. */
export function ReadiedNote({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const doc = useCharacterStore((s) => s.character);
  const readonly = useSheetReadonly();
  const turn = useReactionTurn();
  const { releaseReadiedSpell } = useTurnEconomy();
  const readied = doc ? reactionExtrasView(doc, turn, locale).readied : null;
  if (!readied) return null;
  return (
    <div className="f-note f-save-due" data-c="res" role="group">
      <p>
        <b>{`${t("combat.readiedSpellName", { name: readied.name })}.`}</b>{" "}
        {t("combat.readiedSpellGloss")}
      </p>
      {!readonly && (
        <div className="f-acts">
          <Button
            kind="primary"
            disabled={readied.disabled}
            onClick={releaseReadiedSpell}
          >
            {`${t("combat.releaseReadiedSpell")} · ${t("combat.reaction")}`}
          </Button>
        </div>
      )}
    </div>
  );
}

/** «Altra reazione», the last row of the Reactions group. */
export function OtherReactionRow() {
  const { t } = useTranslation();
  const readonly = useSheetReadonly();
  const turn = useReactionTurn();
  const { executeAction } = useTurnEconomy();
  const action = useMemo(() => offListReactionAction(t), [t]);
  const name = t("combat.otherReactionName");
  return (
    <div className="f-act">
      <ActionIcon icon={{ kind: "base", id: "other-reaction" }} />
      <div className="f-row-main">
        <div className="f-row-t">{name}</div>
        <div className="f-row-s">{t("combat.otherReactionGloss")}</div>
      </div>
      <span className="f-act-c" />
      <span className="f-act-c" />
      <span className="f-act-c f-act-e" />
      {!readonly && (
        <Button
          kind="ghost"
          disabled={turn.reactionUsed}
          aria-label={`${turn.reactionUsedId === action.id ? t("combat.used") : t("combat.markReactionUsed")}: ${name}`}
          onClick={() => executeAction(action)}
        >
          {turn.reactionUsedId === action.id
            ? t("combat.used")
            : t("combat.markReactionUsed")}
        </Button>
      )}
    </div>
  );
}
