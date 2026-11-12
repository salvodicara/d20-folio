/**
 * «Effetti» on the Play header: the chip opens a panel with every effect on the
 * character now (`playEffectsView`) — its own buffs and what an ally left on it (Bless,
 * Warding Bond), each with who cast it and how long it lasts — so a changed number
 * always has a visible cause. The same popover as «Condizioni». A party paladin's Aura
 * of Protection is one of them, with «Fuori dall'aura» for a character standing outside
 * it (the classic aura chip's toggle; it clears on any rest).
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { playEffectsView, type PlayEffectRow } from "@/domains/play/play-effects-view";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { usePartyRosterStore } from "@/features/campaigns/party-roster";
import { usePartyAuraOffers } from "@/features/campaigns/use-party-aura";
import { outOfAuraKey } from "@/lib/play/aura-of-protection";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { Locale } from "@/lib/locale";
import type { CharacterDoc } from "@/types/character";
import { SpellArt } from "@/domains/spells/ui/SpellArt";
import { Button, Chip, Panel } from "@/ui";
import { effectRowAction, runEffectRowAction } from "@/domains/play/concentration-model";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { ActionGlyph } from "./ActionIcon";

export function PlayEffects({ doc, locale }: { doc: CharacterDoc; locale: Locale }) {
  const { t } = useTranslation();
  const readonly = useSheetReadonly();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const rows = useCombatStatusStore((s) => s.status?.view.rows);
  const party = usePartyRosterStore((s) => s.party);
  const auras = usePartyAuraOffers((s) => s.offers);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const nameOf = (id: string) =>
    rows?.find((r) => r.id === id)?.name ||
    party?.members.find((m) => m.ref.combatantId === id)?.name ||
    "";
  const view = playEffectsView(doc, locale, nameOf);
  const count = view.count + auras.length;
  if (count === 0) return null;
  // The paladin by first name; the full name is in the toggle's tooltip.
  const short = (name: string) => name.split(" ")[0] ?? name;
  const toggleAura = (characterId: string, name: string, on: boolean) =>
    registerUndoableToast(
      { message: t(on ? "play.aura.outToast" : "play.aura.inToast", { name }) },
      () => {
        const key = outOfAuraKey(characterId);
        useCharacterStore.getState().setActiveFeature(key, on);
        return () => useCharacterStore.getState().setActiveFeature(key, !on);
      },
      { turnScoped: false }
    );
  const line = (row: PlayEffectRow) =>
    [
      row.from ? t("play.effectsFrom", { name: row.from }) : row.source,
      row.remaining
        ? "rounds" in row.remaining
          ? t("play.effectsRounds", { count: row.remaining.rounds })
          : t("equipment.armorTimeMinutes", { count: row.remaining.minutes })
        : null,
      row.concentration ? t("play.effectsConcentration") : null,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <div className="f-condwrap" ref={ref}>
      <Chip kind="buff" pressed={open} onClick={() => setOpen((o) => !o)}>
        {`✦ ${t("play.effects")}`}
        <span className="f-chip-n">{count}</span>
      </Chip>
      {open && (
        <div className="f-condpop" role="dialog" aria-label={t("play.effects")}>
          <Panel color="res" title={t("play.effects")}>
            {view.rows.map((row) => (
              <div key={row.id} className="f-cond-row f-fx-row">
                <span className="f-act-slot" data-painted="" aria-hidden="true">
                  {row.spell ? (
                    <SpellArt id={row.spell.id} school={row.spell.school} size="fill" />
                  ) : (
                    <ActionGlyph icon={{ kind: "feature" }} />
                  )}
                </span>
                <div className="f-cond-main">
                  <span className="f-row-t">{row.name}</span>
                  {row.gist && <span className="f-fx-gist">{row.gist}</span>}
                  {line(row) && <span className="f-row-s">{line(row)}</span>}
                </div>
                {(() => {
                  const action = readonly ? null : effectRowAction(row);
                  return (
                    action && (
                      <Button kind="quiet" onClick={() => runEffectRowAction(action)}>
                        {t("combat.maintainedEndAction")}
                      </Button>
                    )
                  );
                })()}
              </div>
            ))}
            {auras.map((aura) => (
              <div key={`aura-${aura.characterId}`} className="f-cond-row f-fx-row">
                <span className="f-act-slot" data-painted="" aria-hidden="true">
                  <ActionGlyph icon={{ kind: "feature" }} />
                </span>
                <div className="f-cond-main">
                  <span className="f-row-t">
                    {aura.on
                      ? t("play.aura.chip", { name: short(aura.name), bonus: aura.bonus })
                      : t("play.aura.outToast", { name: short(aura.name) })}
                  </span>
                  <span className="f-row-s">{t("play.aura.group")}</span>
                </div>
                {!readonly && (
                  <Button
                    kind="quiet"
                    aria-pressed={!aura.on}
                    title={t(aura.on ? "play.aura.onHint" : "play.aura.offHint", {
                      name: aura.name,
                    })}
                    onClick={() =>
                      toggleAura(aura.characterId, short(aura.name), aura.on)
                    }
                  >
                    {t(aura.on ? "play.aura.outside" : "play.aura.backIn")}
                  </Button>
                )}
              </div>
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}
