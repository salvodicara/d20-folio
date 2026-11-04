/**
 * «Quale incantesimo è su questa pergamena?»: picks the spell a Spell Scroll holds
 * (stored on that copy, `scrollSpell`), found by name, the reader's own lists first.
 * Picked, the scroll reads from the actions list (#652), undoable.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { scrollPickView } from "@/domains/play/scroll-pick-view";
import type { Locale } from "@/lib/locale";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { Button, Choice, Dialog, Field } from "@/ui";

export function PlayScrollPick({
  doc,
  index,
  current,
  locale,
  onClose,
}: {
  doc: CharacterDoc;
  index: number;
  current: string | null;
  locale: Locale;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(current);
  const choices = scrollPickView(doc, query, locale);
  const save = () => {
    if (!picked) return;
    const name = choices.find((c) => c.id === picked)?.name ?? picked;
    registerUndoableToast(
      { message: t("play.scroll.set", { spell: name }) },
      () => {
        const store = useCharacterStore.getState();
        const char = store.character;
        const ref = char?.character.equipment[index];
        if (!char || !ref || "custom" in ref) return null;
        const set = (scrollSpell: string | undefined) => {
          const live = useCharacterStore.getState().character;
          if (!live) return;
          const equipment = [...live.character.equipment];
          const row = equipment[index];
          if (!row || "custom" in row) return;
          const { scrollSpell: _old, ...rest } = row;
          void _old;
          equipment[index] = scrollSpell ? { ...rest, scrollSpell } : rest;
          useCharacterStore.getState().setCharacter({
            ...live,
            character: { ...live.character, equipment },
          });
        };
        const before = ref.scrollSpell;
        set(picked);
        return () => set(before);
      },
      { turnScoped: false }
    );
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      title={t("play.scroll.which")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" disabled={!picked} onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <Field
        label={t("play.scroll.search")}
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="f-choices f-scroll-list">
        {choices.map((c) => (
          <Choice key={c.id} on={c.id === picked} onClick={() => setPicked(c.id)}>
            <span className="f-choice-main">
              <span className="f-row-t">{c.name}</span>
              <span className="f-choice-s">
                {[
                  c.level === 0
                    ? t("spells.cantrip")
                    : t("play.spellLevel", { level: c.level }),
                  c.onList ? t("play.scroll.onList") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </Choice>
        ))}
        {choices.length === 0 && <p className="f-quiet">{t("play.scroll.noMatch")}</p>}
      </div>
    </Dialog>
  );
}
