/**
 * An ability tile's saving throw on the Play header (D&D Beyond's saving-throw block):
 * «TS +6» under the modifier whenever the classic tile shows it (proficient, or
 * something moves the save off the modifier, such as an ally's aura). A tap opens the
 * save's pane, as every other number on the sheet does: where the total comes from
 * (the modifier, proficiency, «Aura di Bren +3») and «Personalizza».
 */
import { useTranslation } from "react-i18next";

import type { PlayHeaderView } from "@/domains/play/play-header-view";

type Ability = PlayHeaderView["abilities"][number];

const signed = (n: number) => (n >= 0 ? `+${String(n)}` : `−${String(Math.abs(n))}`);

export function PlayAbilitySave({
  ability,
  onOpen,
}: {
  ability: Ability;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  if (!ability.showSave) return null;
  const title = `${t("abilities.savingThrowHead")} · ${t(`abilities.${ability.id}`)}`;
  return (
    <dd className="f-ab-save" data-prof={ability.save || undefined}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`${title} ${signed(ability.saveTotal)}`}
        onClick={onOpen}
      >
        {`${t("abilities.save")} ${signed(ability.saveTotal)}`}
      </button>
    </dd>
  );
}
