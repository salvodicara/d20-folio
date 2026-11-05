/**
 * Options to pick, each saying what it does (owner's pick 2026-11-05, the level-up
 * «Momento BG3»; owner 2026-11-05: «like BG3's tooltips, so the choice is
 * informed»):
 *
 *   - BG3's feat and subclass lists: an icon per option, a gold frame and a tick when
 *     chosen, and the inspect card beside the list, updated on hover;
 *   - D&D Beyond's builder: a name filter and level chips on a long spell list.
 *
 * The card (`optionInfo`) shows the name, subtitle, effect, «In breve», chips and the
 * text: on a wide screen beside the grid with the full text open, scrolling inside
 * the card; on a phone under the grid after a tap, the full text behind «Leggi tutto».
 * Options without art (skills, tools) are chips with the same card.
 * Shared by the level-up, creation and «Scelte da completare».
 */
import { createElement, Fragment, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { BlockMarkdown } from "@/components/shared/BlockMarkdown";
import { FolioFeatIcon } from "@/components/shared/folio-icons";
import { spells as allSpells } from "@/data/spells";
import { optionInfo, type InfoKind } from "@/domains/spells/option-info";
import {
  filterSpellRows,
  spellPickRows,
  SPELL_FILTER_FROM,
} from "@/domains/spells/spell-pick-rows";
import { SpellArt } from "@/domains/spells/ui/SpellArt";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { Locale } from "@/lib/locale";
import { tieLast, tieTails } from "@/lib/text-ties";
import { Art, Button, Chip, Field, type ArtKind } from "@/ui";

const SCHOOL = new Map(allSpells.map((s) => [s.id, s.school]));

/** Which painted art an option kind wears on its card. */
const CARD_ART: Partial<Record<InfoKind, ArtKind>> = {
  feat: "feat",
  weapon: "equipment",
};

export function PickGrid({
  label,
  options,
  picked,
  spells,
  art,
  info,
  chips,
  locale,
  onToggle,
}: {
  label: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  picked: readonly string[];
  /** The options are spells: school art, level badge, filters. */
  spells?: boolean;
  /** The catalogue whose painted art the (non-spell) options wear. */
  art?: ArtKind;
  /** What the card reads the options as (spells imply "spell"); none = no card. */
  info?: InfoKind;
  /** Draw the options as chips (skills, tools, languages): no art, same card. */
  chips?: boolean;
  locale: Locale;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const wide = useMediaQuery("(min-width: 1101px)");
  const kind: InfoKind | undefined = spells ? "spell" : info;
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
  const inspectedId = focus ?? picked[0] ?? null;
  const card = kind && inspectedId ? optionInfo(kind, inspectedId, locale) : null;
  // Hover reads an option on a wide screen (BG3's tooltip); a tap reads it on a phone.
  const reads = (id: string) => ({
    onMouseEnter: wide && kind ? () => setFocus(id) : undefined,
    onFocus: kind ? () => setFocus(id) : undefined,
  });
  const toggle = (id: string) => {
    onToggle(id);
    if (kind) setFocus(id);
  };
  // DDB opens the card in place: on a phone it sits right under the option tapped.
  const inspectCard =
    card && kind && inspectedId ? (
      <Inspect
        key={`${inspectedId}:${String(wide)}`}
        card={card}
        art={
          kind === "spell" && SCHOOL.get(inspectedId) ? (
            <SpellArt
              id={inspectedId}
              school={SCHOOL.get(inspectedId) ?? "evocation"}
              size="lg"
            />
          ) : CARD_ART[kind] ? (
            <span className="f-spellart" data-size="lg">
              <Art
                kind={CARD_ART[kind] ?? "feat"}
                id={inspectedId}
                fallback={createElement(FolioFeatIcon, { "aria-hidden": true })}
              />
            </span>
          ) : null
        }
        open={wide}
      />
    ) : null;
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
      <div className="f-pick" data-inspect={card ? "" : undefined}>
        {chips ? (
          <div className="f-chips" role="group" aria-label={label}>
            {shown.map((o) => (
              <span key={o.id} {...reads(o.id)}>
                <Chip pressed={picked.includes(o.id)} onClick={() => toggle(o.id)}>
                  {o.label}
                </Chip>
              </span>
            ))}
          </div>
        ) : (
          <div className="f-lvl-grid" role="group" aria-label={label}>
            {shown.map((o) => {
              const on = picked.includes(o.id);
              const spell = byId.get(o.id);
              const school = SCHOOL.get(o.id);
              return (
                <Fragment key={o.id}>
                  <button
                    type="button"
                    className="f-lvl-opt"
                    aria-pressed={on}
                    onClick={() => toggle(o.id)}
                    {...reads(o.id)}
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
                      {tieLast(o.label).replace(/\//g, "/\u200b")}
                    </span>
                  </button>
                  {!wide && o.id === inspectedId && inspectCard}
                </Fragment>
              );
            })}
          </div>
        )}
        {(wide || chips) && inspectCard}
      </div>
    </>
  );
}

/** The option read last: art, subtitle, effect, «In breve», chips, the text. */
function Inspect({
  card,
  art,
  open,
}: {
  card: NonNullable<ReturnType<typeof optionInfo>>;
  art: ReactNode;
  /** The full text starts open (the wide screen's side card). */
  open: boolean;
}) {
  const { t } = useTranslation();
  const [full, setFull] = useState(open);
  return (
    <article className="f-lvl-inspect" aria-live="polite">
      {art}
      <div>
        <h3>{tieLast(card.name)}</h3>
        <p className="f-row-s">{card.sub}</p>
        {card.effect && <p className="f-lvl-effect">{card.effect}</p>}
        {card.gist && (
          <p className="f-lvl-gist">
            <span className="f-lbl">{t("levelUp.screen.gist")}</span>
            {tieLast(card.gist)}
          </p>
        )}
        {card.chips.length > 0 && (
          <p className="f-lvl-facts">
            {card.chips.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </p>
        )}
        {card.text &&
          (open ? (
            <BlockMarkdown className="f-prose" text={tieTails(card.text)} />
          ) : (
            <>
              <Button kind="quiet" aria-expanded={full} onClick={() => setFull(!full)}>
                {full ? t("common.showLess") : t("levelUp.screen.readAll")}
              </Button>
              {full && <BlockMarkdown className="f-prose" text={tieTails(card.text)} />}
            </>
          ))}
      </div>
    </article>
  );
}
