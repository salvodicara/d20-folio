/**
 * The «Aggiungi» tab of «Gestisci incantesimi» (#1230). Pattern source: D&D Beyond's
 * «Manage Spells», the one window where a caster both learns and prepares. The list,
 * its search and the write are the Compendium's own (`spellSpec` in add mode, as the
 * classic Add Spell picker): the character's own class list first, a spell already on
 * the sheet marked «Già tra i tuoi», only the levels it can cast, one tap adds it
 * with the 5 s undo. Preparing it
 * is then the other tab's. «Incantesimo personalizzato» opens the homebrew spell form
 * in its place (`PlayCustomSpell`).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { spellSpec } from "@/features/compendium/picker";
import { useCompendiumPicker } from "@/features/compendium/picker/useCompendiumPicker";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { Locale } from "@/lib/locale";
import { Button, Field } from "@/ui";

import { SpellArt } from "@/domains/spells/ui/SpellArt";

import { PlayCustomSpell } from "./PlayCustomSpell";

/** A long list stays light: the first rows, and the search narrows the rest. */
const SHOWN = 60;

export function PlayAddSpell({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const picker = useCompendiumPicker(spellSpec, { mode: "add" });
  const [custom, setCustom] = useState(false);
  type Spell = (typeof picker.filtered)[number];
  // D&D Beyond's «Manage Spells» lists up to the highest level you can cast: the
  // highest level with a slot (pact slots included); cantrips always.
  const maxLevel = Math.max(
    0,
    ...(picker.ctx.character?.character.spellSlots ?? [])
      .filter((slot) => slot.total > 0)
      .map((slot) => slot.level)
  );
  const castable = picker.filtered.filter((s) => s.level <= maxLevel);
  const nameOf = (s: Spell) => spellSpec.nameText(s, picker.ctx).find(Boolean) ?? s.id;
  const add = (s: Spell) =>
    registerUndoableToast(
      { message: t("play.spells.addedToast", { name: nameOf(s) }) },
      () => {
        const before = useCharacterStore.getState().character;
        if (!before) return null;
        picker.add(s);
        // Undo puts the spell list back as it was before the add.
        return () => {
          const now = useCharacterStore.getState().character;
          if (!now) return;
          useCharacterStore.getState().setCharacter({
            ...now,
            character: { ...now.character, spells: before.character.spells },
          });
        };
      },
      { turnScoped: false }
    );
  if (custom) return <PlayCustomSpell locale={locale} onDone={() => setCustom(false)} />;
  return (
    <div className="f-stack">
      <Field
        label={t("spells.pick.search")}
        type="search"
        autoComplete="off"
        value={picker.query}
        onChange={(e) => picker.setQuery(e.target.value)}
      />
      {maxLevel > 0 && (
        <p className="f-help">{t("play.spells.upToLevel", { level: maxLevel })}</p>
      )}
      <div className="f-add-list">
        {castable.slice(0, SHOWN).map((s) => {
          const name = nameOf(s);
          const added = picker.isAdded(s);
          return (
            <div key={s.id} className="f-act f-add-row">
              <span className="f-act-slot" data-painted="" aria-hidden="true">
                <SpellArt id={s.id} school={s.school} size="fill" />
              </span>
              <span className="f-row-main">
                <span className="f-row-t">{name}</span>
                <span className="f-row-s">
                  {s.level === 0
                    ? t("spells.cantrip")
                    : t("spells.level", { level: s.level })}
                </span>
              </span>
              {added ? (
                <span className="f-quiet">{t("play.spells.alreadyYours")}</span>
              ) : (
                <Button
                  kind="ghost"
                  aria-label={`${t("common.add")}: ${name}`}
                  onClick={() => add(s)}
                >
                  {t("common.add")}
                </Button>
              )}
            </div>
          );
        })}
        {castable.length === 0 && <p className="f-quiet">{t("spells.pick.none")}</p>}
      </div>
      {/* D&D Beyond: a homebrew spell beside the catalogue's */}
      <Button kind="ghost" onClick={() => setCustom(true)}>
        {t("play.spells.customOpen")}
      </Button>
    </div>
  );
}
