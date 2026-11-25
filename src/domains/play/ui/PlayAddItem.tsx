/**
 * «Aggiungi oggetto» on the Play inventory (#1230). Pattern source: D&D Beyond's
 * «Manage Inventory» (search the catalogue, Add per row). The catalogue, its search
 * and the write are the Compendium's own (`itemsSpec` in add mode, as the classic
 * Add Item picker): mundane equipment and magic items in one list, one tap adds one
 * (stacking onto a twin; body armor goes on worn), with the 5 s undo. How many and
 * whether it is worn are then the item pane's.
 */
import { useTranslation } from "react-i18next";

import { compendiumArt } from "@/domains/compendium/compendium-art";
import { itemsSpec } from "@/features/compendium/picker";
import { useCompendiumPicker } from "@/features/compendium/picker/useCompendiumPicker";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { Art, Button, Dialog, Field } from "@/ui";

/** A long list stays light: the first rows, and the search narrows the rest. */
const SHOWN = 60;

export function PlayAddItem({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const picker = useCompendiumPicker(itemsSpec, { mode: "add" });
  // the localized name first (the spec's search candidates)
  const nameOf = (entry: (typeof picker.filtered)[number]) =>
    itemsSpec.nameText(entry, picker.ctx).find(Boolean) ?? "";
  const add = (entry: (typeof picker.filtered)[number]) => {
    const name = nameOf(entry);
    registerUndoableToast(
      { message: t("play.inv.addedToast", { name }) },
      () => {
        const before = useCharacterStore.getState().character;
        if (!before) return null;
        picker.add(entry);
        // Undo puts the two lists back as they were before the add.
        return () => {
          const now = useCharacterStore.getState().character;
          if (!now) return;
          useCharacterStore.getState().setCharacter({
            ...now,
            character: {
              ...now.character,
              weapons: before.character.weapons,
              equipment: before.character.equipment,
            },
          });
        };
      },
      { turnScoped: false }
    );
  };
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      title={t("play.inv.add")}
      closeLabel={t("common.close")}
    >
      <div className="f-stack">
        <Field
          label={t("play.inv.searchItems")}
          type="search"
          autoComplete="off"
          value={picker.query}
          onChange={(e) => picker.setQuery(e.target.value)}
        />
        <div className="f-add-list">
          {picker.filtered.slice(0, SHOWN).map((entry) => {
            const name = nameOf(entry);
            const verdict = itemsSpec.verdict?.(entry, picker.ctx);
            const art = compendiumArt(itemsSpec.id, entry);
            return (
              <div key={itemsSpec.getId(entry)} className="f-act f-add-row">
                <span className="f-act-slot" data-painted="" aria-hidden="true">
                  {art && !("spell" in art) ? (
                    <Art kind={art.kind} id={art.id} fallback={null} />
                  ) : null}
                </span>
                <span className="f-row-main">
                  <span className="f-row-t">{name}</span>
                  {verdict && <span className="f-row-s">{verdict.label}</span>}
                </span>
                <Button
                  kind="ghost"
                  aria-label={`${t("common.add")}: ${name}`}
                  onClick={() => add(entry)}
                >
                  {t("common.add")}
                </Button>
              </div>
            );
          })}
          {picker.count === 0 && <p className="f-quiet">{t("play.inv.noMatch")}</p>}
        </div>
      </div>
    </Dialog>
  );
}
