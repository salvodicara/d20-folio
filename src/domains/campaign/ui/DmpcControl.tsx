/**
 * The DM plays a character too (the classic DM tile's «Collega un personaggio
 * (facoltativo)»): from the Gruppo panel the DM picks one of their own characters from
 * the shared menu, or lets an attached one go. Nothing changes mid-fight (the fight
 * holds the character), as for every member (`attachChoices`).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { RosterCharacterDoc } from "@/lib/character-cache";
import { Button, Menu } from "@/ui";

export function DmpcControl({
  characterId,
  name,
  roster,
  inCombat,
  onAttach,
}: {
  characterId: string | null;
  /** The attached character's name (the detach says whom). */
  name?: string;
  roster: readonly RosterCharacterDoc[];
  inCombat: boolean;
  /** The chosen character's id; "" lets the attached one go. */
  onAttach: (characterId: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (inCombat) return null;
  if (characterId)
    return (
      <Button kind="quiet" onClick={() => onAttach("")}>
        {name
          ? t("campaignScreen.dmpcDetach", { name })
          : t("campaignHub.detachCharacter")}
      </Button>
    );
  return (
    <>
      <Button kind="quiet" icon="u-add" onClick={() => setOpen(true)}>
        {t("campaignHub.encounterAttachDmpc")}
      </Button>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        title={t("campaignHub.attachCharacter")}
      >
        {roster.map((c) => (
          <button
            key={c.id}
            type="button"
            className="f-menu-it"
            onClick={() => {
              setOpen(false);
              onAttach(c.id);
            }}
          >
            {c.character.name}
          </button>
        ))}
        {roster.length === 0 && <p className="f-quiet">{t("campaignHub.attachNone")}</p>}
      </Menu>
    </>
  );
}
