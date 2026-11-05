/**
 * Spells to pick from, as rows that say what each one is (D&D Beyond's list,
 * the classic wizard's search, the sheet's spell rows): the name with its
 * Concentration / Ritual marks, «Livello 3 · Invocazione · Azione · 45 metri»,
 * its effect («8d6 Fuoco»), and a button for the full text. No prose in the
 * row. Past `SPELL_FILTER_FROM` options a search field and a filter by spell
 * level narrow the list. A tap on a row picks or unpicks it.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import {
  filterSpellRows,
  spellPickRows,
  SPELL_FILTER_FROM,
  type SpellPickRow,
} from "@/domains/spells/spell-pick-rows";
import type { Locale } from "@/lib/locale";
import { Button, Chip, Choice, Dialog, Field, Icon } from "@/ui";

export function SpellPickList({
  ids,
  picked,
  locale,
  onToggle,
}: {
  ids: readonly string[];
  picked: readonly string[];
  locale: Locale;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const rows = spellPickRows(ids, locale);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<number | null>(null);
  const [open, setOpen] = useState<SpellPickRow | null>(null);
  const filtering = rows.length > SPELL_FILTER_FROM;
  const levels = [...new Set(rows.map((r) => r.level))].sort((a, b) => a - b);
  const shown = filtering ? filterSpellRows(rows, query, level) : rows;
  const levelName = (n: number) =>
    n === 0 ? t("spells.cantrip") : t("spells.level", { level: n });
  const facts = (r: SpellPickRow) =>
    [levelName(r.level), r.school, r.castingTime, r.range].filter(Boolean).join(" · ");

  return (
    <div className="f-spellpick">
      {filtering && (
        <div className="f-spellpick-tools">
          <Field
            label={t("spells.pick.search")}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {levels.length > 1 && (
            <div className="f-chips" role="group" aria-label={t("spells.pick.byLevel")}>
              <Chip pressed={level === null} onClick={() => setLevel(null)}>
                {t("common.all")}
              </Chip>
              {levels.map((n) => (
                <Chip
                  key={n}
                  pressed={level === n}
                  onClick={() => setLevel(level === n ? null : n)}
                >
                  {levelName(n)}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="f-choices">
        {shown.map((r) => (
          <div key={r.id} className="f-spellpick-row">
            <Choice on={picked.includes(r.id)} onClick={() => onToggle(r.id)}>
              <span className="f-row-main">
                <span className="f-row-t">
                  {/* A long name wraps without leaving its last word alone. */}
                  {r.name.replace(/ (\S+)$/, "\u00a0$1")}
                  {r.concentration && (
                    <Chip kind="conc">{t("spells.concentration")}</Chip>
                  )}
                  {r.ritual && <Chip>{t("spells.ritual")}</Chip>}
                </span>
                <span className="f-row-s">{facts(r)}</span>
                {r.effect && (
                  <span className="f-row-s f-spellpick-effect">{r.effect}</span>
                )}
              </span>
            </Choice>
            <button
              type="button"
              className="f-spellpick-more"
              aria-haspopup="dialog"
              aria-label={t("spells.pick.details", { name: r.name })}
              onClick={() => setOpen(r)}
            >
              <Icon name="u-expand" size={20} />
            </button>
          </div>
        ))}
        {shown.length === 0 && <p className="f-help">{t("spells.pick.none")}</p>}
      </div>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(null)}
          title={open.name}
          color="res"
          closeLabel={t("common.close")}
          actions={
            <Button
              kind="primary"
              onClick={() => {
                onToggle(open.id);
                setOpen(null);
              }}
            >
              {picked.includes(open.id) ? t("spells.pick.unpick") : t("rePick.choose")}
            </Button>
          }
        >
          <p className="f-row-s">{facts(open)}</p>
          <BlockMarkdown className="f-prose" text={open.description} />
        </Dialog>
      )}
    </div>
  );
}
