/**
 * The «Aggiungi» tab of «Gestisci incantesimi» (#1230). Pattern source: D&D Beyond's
 * «Manage Spells», the one window where a caster both learns and prepares. The list,
 * its search and the write are the Compendium's own (`spellSpec` in add mode, as the
 * classic Add Spell picker): the character's own class list first, a spell already on
 * the sheet marked «Già tra i tuoi», only the levels it can cast, one tap adds it
 * with the 5 s undo. Preparing it
 * is then the other tab's. «Incantesimo personalizzato» opens the homebrew spell form
 * in its place (`PlayCustomSpell`).
 *
 * A Wizard whose book holds its free picks copies a Wizard spell in instead (SRD
 * «Expanding the Book», `spellbookEntry`): the row says the cost (2 hours and 50 gp a
 * spell level), «Copia» asks once, and the confirm pays from the gold, with the undo
 * giving back the spell and the coins. A purse that falls short says so and can copy
 * without paying (the table settles it).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { spellSpec } from "@/features/compendium/picker";
import { useCompendiumPicker } from "@/features/compendium/picker/useCompendiumPicker";
import { copyIntoSpellbook, spellbookEntry } from "@/lib/wizard-spellbook";
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
  // the spell whose copy is being confirmed
  const [asking, setAsking] = useState<string | null>(null);
  const doc = picker.ctx.character;
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
  const copy = (s: Spell, pay: boolean) => {
    setAsking(null);
    registerUndoableToast(
      { message: t("play.spells.copiedToast", { name: nameOf(s) }) },
      () => {
        const store = useCharacterStore.getState();
        const before = store.character;
        const next = before ? copyIntoSpellbook(before, s.id, { pay }) : null;
        if (!before || !next) return null;
        store.setCharacter(next);
        // Undo puts back the spell list and the coins as they were.
        return () => {
          const now = useCharacterStore.getState().character;
          if (!now) return;
          useCharacterStore.getState().setCharacter({
            ...now,
            character: { ...now.character, spells: before.character.spells },
            session: { ...now.session, currency: before.session.currency },
          });
        };
      },
      { turnScoped: false }
    );
  };
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
          const entry = doc && !added ? spellbookEntry(doc, s.id) : null;
          const copyCost = entry?.kind === "copy" ? entry : null;
          const levelLine =
            s.level === 0 ? t("spells.cantrip") : t("spells.level", { level: s.level });
          return (
            <div key={s.id} className="f-add-item">
              <div className="f-act f-add-row">
                <span className="f-act-slot" data-painted="" aria-hidden="true">
                  <SpellArt id={s.id} school={s.school} size="fill" />
                </span>
                <span className="f-row-main">
                  <span className="f-row-t">{name}</span>
                  <span className="f-row-s">
                    {copyCost
                      ? `${levelLine} · ${t("play.spells.copyCost", copyCost)}`
                      : levelLine}
                  </span>
                </span>
                {added ? (
                  <span className="f-quiet">{t("play.spells.alreadyYours")}</span>
                ) : copyCost ? (
                  <Button
                    kind="ghost"
                    aria-label={t("play.spells.copyLabel", { name })}
                    aria-expanded={asking === s.id}
                    onClick={() => setAsking(asking === s.id ? null : s.id)}
                  >
                    {t("common.copy")}
                  </Button>
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
              {copyCost && asking === s.id && (
                <div
                  className="f-copy-ask"
                  role="group"
                  aria-label={t("play.spells.copyLabel", { name })}
                >
                  <p className="f-help">
                    {t("play.spells.copyAsk", {
                      name,
                      hours: copyCost.hours,
                      gp: copyCost.gp,
                    })}
                  </p>
                  {!copyCost.affordable && (
                    <p className="f-help">{t("play.spells.copyShort")}</p>
                  )}
                  <div className="f-copy-acts">
                    {copyCost.affordable ? (
                      <Button kind="primary" onClick={() => copy(s, true)}>
                        {t("play.spells.copyPay", { gp: copyCost.gp })}
                      </Button>
                    ) : (
                      <Button kind="ghost" onClick={() => copy(s, false)}>
                        {t("play.spells.copyUnpaid")}
                      </Button>
                    )}
                    <Button kind="quiet" onClick={() => setAsking(null)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
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
