/**
 * Options to pick as a grid of painted icons (owner's pick 2026-11-05, the level-up
 * «Momento BG3»): BG3's feat and subclass lists (an icon per option, a gold frame and a
 * tick when chosen, an «Inspect» card) and D&D Beyond's builder (a name filter and level
 * chips on a long spell list). Spells show their school's art and level, and the last
 * one touched opens below: effect, «In breve», facts, and the full text on request.
 * Shared by the level-up, creation and «Scelte da completare».
 */
import { createElement, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import { FolioFeatIcon } from "@/components/shared/folio-icons";
import { spells as allSpells } from "@/data/spells";
import {
  filterSpellRows,
  spellPickRows,
  SPELL_FILTER_FROM,
  type SpellPickRow,
} from "@/domains/spells/spell-pick-rows";
import { SpellArt } from "@/domains/spells/ui/SpellArt";
import type { Locale } from "@/lib/locale";
import { tieLast, tieTails } from "@/lib/text-ties";
import { Art, Button, Chip, Field, type ArtKind } from "@/ui";

const SCHOOL = new Map(allSpells.map((s) => [s.id, s.school]));

export function PickGrid({
  label,
  options,
  picked,
  spells,
  art,
  locale,
  onToggle,
}: {
  label: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  picked: readonly string[];
  /** The options are spells: school art, level badge, filters, inspect card. */
  spells?: boolean;
  /** The catalogue whose painted art the (non-spell) options wear. */
  art?: ArtKind;
  locale: Locale;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const spellRows = useMemo(
    () =>
      spells
        ? spellPickRows(
            options.map((o) => o.id),
            locale
          )
        : [],
    [spells, options, locale]
  );
  const byId = new Map(spellRows.map((s) => [s.id, s]));
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const filtering = spellRows.length > SPELL_FILTER_FROM;
  const levels = [...new Set(spellRows.map((r) => r.level))].sort((a, b) => a - b);
  // A long list narrows by name and level; the picks stay on top whatever the filter.
  const shown = filtering
    ? [
        ...options.filter((o) => picked.includes(o.id)),
        ...filterSpellRows(spellRows, query, level)
          .filter((r) => !picked.includes(r.id))
          .map((r) => ({ id: r.id, label: r.name })),
      ]
    : options;
  const levelName = (n: number) =>
    n === 0 ? t("spells.cantrip") : t("spells.level", { level: n });
  const inspected =
    (focus && byId.get(focus)) ?? (picked[0] ? byId.get(picked[0]) : undefined);
  return (
    <>
      {filtering && (
        <div className="f-lvl-tools">
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
      {/* BG3 shows the inspect card beside the list: a side column on a wide screen. */}
      <div className="f-pick" data-inspect={inspected ? "" : undefined}>
        <div className="f-lvl-grid" role="group" aria-label={label}>
          {shown.map((o) => {
            const on = picked.includes(o.id);
            const spell = byId.get(o.id);
            const school = SCHOOL.get(o.id);
            return (
              <button
                key={o.id}
                type="button"
                className="f-lvl-opt"
                aria-pressed={on}
                onClick={() => {
                  onToggle(o.id);
                  if (spell) setFocus(o.id);
                }}
              >
                {spell && school ? (
                  <SpellArt id={o.id} school={school} />
                ) : art ? (
                  <span className="f-lvl-opt-art">
                    <Art
                      kind={art}
                      id={o.id}
                      fallback={createElement(FolioFeatIcon, { "aria-hidden": true })}
                    />
                  </span>
                ) : null}
                {spell && (
                  <span className="f-lvl-opt-lv">
                    {spell.level === 0 ? "T" : spell.level}
                  </span>
                )}
                {on && (
                  <span className="f-lvl-tick" aria-hidden="true">
                    ✓
                  </span>
                )}
                <span className="f-lvl-opt-n">
                  {tieLast(o.label).replace(/\//g, "/​")}
                </span>
              </button>
            );
          })}
        </div>
        {inspected && <Inspect key={inspected.id} spell={inspected} />}
      </div>
    </>
  );
}

/** The spell touched last: art, level and school, effect, gist, facts; full text on request. */
function Inspect({ spell }: { spell: SpellPickRow }) {
  const { t } = useTranslation();
  const [full, setFull] = useState(false);
  const school = SCHOOL.get(spell.id);
  return (
    <article className="f-lvl-inspect">
      {school && <SpellArt id={spell.id} school={school} size="lg" />}
      <div>
        <h3>{spell.name}</h3>
        <p className="f-row-s">
          {spell.level === 0
            ? t("spells.cantrip")
            : t("spells.level", { level: spell.level })}
          {" · "}
          {spell.school}
        </p>
        {spell.effect && <p className="f-lvl-effect">{spell.effect}</p>}
        {spell.gist && (
          <p className="f-lvl-gist">
            <span className="f-lbl">{t("levelUp.screen.gist")}</span>
            {tieLast(spell.gist)}
          </p>
        )}
        <p className="f-lvl-facts">
          <span>{spell.castingTime}</span>
          <span>{spell.range}</span>
          {spell.concentration && <span>{t("play.concentration")}</span>}
          {spell.ritual && <span>{t("spells.pick.ritual")}</span>}
        </p>
        <Button kind="quiet" aria-expanded={full} onClick={() => setFull(!full)}>
          {full ? t("common.showLess") : t("levelUp.screen.readAll")}
        </Button>
        {full && <BlockMarkdown className="f-prose" text={tieTails(spell.description)} />}
      </div>
    </article>
  );
}
