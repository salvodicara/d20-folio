import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FEATS_BY_ID } from "@/data/feats";
import { ModalShell } from "@/components/shared/ModalShell";
import { ModalBody, ModalFoot } from "@/components/ui/modal-head";
import { Button } from "@/components/ui/button";
import { FeatSpellChoicesPicker } from "@/components/sheet/FeatSpellChoicesPicker";
import {
  applySpellChoicePicks,
  isSpellChoicesComplete,
  pendingSpellChoicesForFeat,
  type SpellChoicePicks,
} from "@/lib/feat-spell-choices";
import { useCharacterStore } from "@/stores/characterStore";

export function FeatSpellChoiceRepairModal({
  featId,
  name,
  onClose,
}: {
  featId: string;
  name: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const character = useCharacterStore((state) => state.character);
  const [picks, setPicks] = useState<SpellChoicePicks>({});
  const slots = useMemo(
    () => pendingSpellChoicesForFeat(FEATS_BY_ID.get(featId) ?? {}),
    [featId]
  );
  const unavailableSpellIds = useMemo(() => {
    const ownSources = new Set(
      slots.flatMap((slot) => (slot.freeCastSource ? [slot.freeCastSource.sourceId] : []))
    );
    return new Set(
      (character?.character.spells ?? []).flatMap((spell) => {
        if ("custom" in spell || !spell.freeCastSource) return [];
        const sourceId = spell.freeCastSource.sourceId;
        const belongsHere = [...ownSources].some(
          (own) => sourceId === own || sourceId.startsWith(`${own}:`)
        );
        return belongsHere ? [] : [spell.srdId];
      })
    );
  }, [character?.character.spells, slots]);

  const save = (): void => {
    const current = useCharacterStore.getState().character;
    if (!current || !isSpellChoicesComplete(slots, picks)) return;
    const spells = applySpellChoicePicks(
      current.character.spells,
      picks,
      slots,
      current.character.abilityScores
    );
    useCharacterStore.getState().setCharacter({
      ...current,
      character: { ...current.character, spells },
    });
    onClose();
  };

  return (
    <ModalShell open onClose={onClose} title={t("featChoices.completeTitle", { name })}>
      <ModalBody>
        <FeatSpellChoicesPicker
          slots={slots}
          picks={picks}
          onChange={setPicks}
          existingSpellIds={unavailableSpellIds}
        />
      </ModalBody>
      <ModalFoot>
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={!isSpellChoicesComplete(slots, picks)}
          onClick={save}
        >
          {t("common.save")}
        </Button>
      </ModalFoot>
    </ModalShell>
  );
}
