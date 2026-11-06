/**
 * «Effetti» on the Play header: the chip opens a panel with every effect on the
 * character now (`playEffectsView`) — its own buffs and what an ally left on it (Bless,
 * Warding Bond), each with who cast it and how long it lasts — so a changed number
 * always has a visible cause. The same popover as «Condizioni».
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { playEffectsView, type PlayEffectRow } from "@/domains/play/play-effects-view";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { usePartyRosterStore } from "@/features/campaigns/party-roster";
import type { Locale } from "@/lib/locale";
import type { CharacterDoc } from "@/types/character";
import { SpellArt } from "@/domains/spells/ui/SpellArt";
import { Chip, Panel } from "@/ui";
import { ActionGlyph } from "./ActionIcon";

export function PlayEffects({ doc, locale }: { doc: CharacterDoc; locale: Locale }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const rows = useCombatStatusStore((s) => s.status?.view.rows);
  const party = usePartyRosterStore((s) => s.party);
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
  if (view.count === 0) return null;
  const line = (row: PlayEffectRow) =>
    [
      row.from ? t("play.effectsFrom", { name: row.from }) : row.source,
      row.remaining
        ? "rounds" in row.remaining
          ? t("play.effectsRounds", { count: row.remaining.rounds })
          : t("play.effectsMinutes", { count: row.remaining.minutes })
        : null,
      row.concentration ? t("play.effectsConcentration") : null,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <div className="f-condwrap" ref={ref}>
      <Chip kind="buff" pressed={open} onClick={() => setOpen((o) => !o)}>
        {`✦ ${t("play.effects")}`}
        <span className="f-chip-n">{view.count}</span>
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
              </div>
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}
