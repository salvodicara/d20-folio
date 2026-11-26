/**
 * «Gestisci incantesimi» on the Play screen: the levelled spells a prepared caster
 * chooses among, by level, each a choice that flips prepared (`togglePrepared`, the
 * one rule), with how many are prepared against the most. A spell a subclass always
 * prepares stays on and says so; going over the limit is allowed and noted.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  canFlipInStep,
  prepareSheetTitle,
  type LongRestChange,
} from "@/domains/play/long-rest-change";

import { prepareList } from "@/domains/play/play-spells-view";
import { ActionGlyph } from "@/domains/play/ui/ActionIcon";
import { PlayCantripSwap } from "@/domains/play/ui/PlayCantripSwap";
import { PlayFormSwap } from "@/domains/play/ui/PlayFormSwap";
import { spellPickRows } from "@/domains/spells/spell-pick-rows";
import { SpellArt } from "@/domains/spells/ui/SpellArt";
import type { Locale } from "@/lib/locale";
import { setViaClass, togglePrepared } from "@/lib/play/spell-prep";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { Button, Chip, Choice, Dialog, Tabs } from "@/ui";

import { PlayAddSpell } from "./PlayAddSpell";

export function PlayPrepare({
  doc,
  locale,
  onClose,
  longRest,
  afterLongRest,
}: {
  doc: CharacterDoc;
  locale: Locale;
  onClose: () => void;
  /** After a Long Rest: «Cambia incantesimi preparati», within the class's limit. */
  longRest?: LongRestChange;
  /** The step after a Long Rest: also a cantrip the lineage lets you replace, and a
   *  Druid's known Wild Shape form. */
  afterLongRest?: boolean;
}) {
  const { t } = useTranslation();
  const list = prepareList(doc, locale);
  // D&D Beyond's «Manage Spells»: prepare and add in one window (not in a rest step)
  const canAdd = !longRest && !afterLongRest;
  // «Prepared spells», or «After the Long Rest» when the sheet holds more than spells:
  // then each change has its own section heading (D&D Beyond's Long Rest dialog).
  const title = prepareSheetTitle(doc, {
    ...(longRest ? { longRest } : {}),
    ...(afterLongRest ? { afterLongRest } : {}),
  });
  const sections = title === "play.rest.afterTitle";
  const [tab, setTab] = useState<"prepared" | "add">("prepared");
  // the homebrew spell form is open: its own add and back are the only way on
  const [customOpen, setCustomOpen] = useState(false);
  // each spell's level line and effect tag, as the spell picks show them
  const pick = new Map(
    spellPickRows(
      list.levels.flatMap((g) => g.spells.flatMap((x) => (x.spellId ? [x.spellId] : []))),
      locale
    ).map((r) => [
      r.id,
      {
        levelLine: `${r.level === 0 ? t("spells.cantrip") : t("spells.level", { level: r.level })} · ${r.school}`,
        effect: r.effect,
      },
    ])
  );
  const preparedNow = new Set(
    list.levels.flatMap((g) =>
      g.spells.filter((s) => s.prepared && !s.always).map((s) => s.idx)
    )
  );
  // the prepared spells the step opened with: the limit counts changes against them
  const [start] = useState(preparedNow);
  const canFlip = (idx: number) =>
    !longRest || canFlipInStep(longRest, start, preparedNow, idx);
  const flip = (idx: number) => {
    const store = useCharacterStore.getState();
    const live = store.character;
    const next = live ? togglePrepared(live, idx) : null;
    if (next) store.setCharacter(next);
  };
  // «Tieni così»: the prepared spells go back to how the step found them
  const keep = () => {
    for (const idx of [...start, ...preparedNow])
      if (start.has(idx) !== preparedNow.has(idx)) flip(idx);
    onClose();
  };
  const via = (idx: number, classId: string) => {
    const store = useCharacterStore.getState();
    const live = store.character;
    const next = live ? setViaClass(live, idx, classId) : null;
    if (next) store.setCharacter(next);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      title={t(title)}
      closeLabel={t("common.close")}
      actions={
        tab === "add" && customOpen ? undefined : (
          <>
            {longRest && (
              <Button kind="quiet" onClick={keep}>
                {t("play.rest.keepPrepared")}
              </Button>
            )}
            <Button kind="primary" onClick={onClose}>
              {t("common.done")}
            </Button>
          </>
        )
      }
    >
      {canAdd && (
        <Tabs
          label={t("play.spells.manage")}
          items={[
            { id: "prepared", label: t("create.screen.preparedSpells") },
            { id: "add", label: t("common.add") },
          ]}
          value={tab}
          onChange={(next) => {
            setTab(next);
            setCustomOpen(false);
          }}
        />
      )}
      {tab === "add" ? (
        <PlayAddSpell locale={locale} onCustomChange={setCustomOpen} />
      ) : (
        preparedList()
      )}
    </Dialog>
  );

  function preparedList() {
    return (
      <>
        {afterLongRest && <PlayCantripSwap doc={doc} locale={locale} />}
        {afterLongRest && <PlayFormSwap doc={doc} locale={locale} />}
        {sections && list.levels.length > 0 && (
          <h3 className="f-act-gh">{t("create.screen.preparedSpells")}</h3>
        )}
        {/* the limit, then the count against the most (the level-up's «1/1») */}
        {list.levels.length > 0 && (
          <div className="f-pick-title f-prep-head" role="status">
            <span className="f-help">
              {longRest
                ? t(longRest === "one" ? "play.rest.changeOne" : "play.rest.changeAny")
                : t("create.screen.preparedSpells")}
              {list.overLimit ? ` ${t("play.spells.overLimit")}` : ""}
            </span>
            <span
              className="f-lvl-count"
              data-state={list.overLimit ? undefined : "done"}
              aria-label={t("play.spells.prepared", { count: list.count, max: list.max })}
            >
              {`${String(list.count)}/${String(list.max)}`}
            </span>
          </div>
        )}
        {list.levels.map(({ level, spells }) => (
          <div key={level} className="f-ask">
            <span className="f-lbl">{t("spells.level", { level })}</span>
            <div className="f-choices">
              {spells.map((s) => (
                <div key={s.idx} className="f-prep">
                  <Choice
                    on={s.prepared}
                    disabled={s.always || !canFlip(s.idx)}
                    onClick={() => flip(s.idx)}
                  >
                    <span className="f-act-slot" data-painted="" aria-hidden="true">
                      {s.spellId && s.school ? (
                        <SpellArt id={s.spellId} school={s.school} size="fill" />
                      ) : (
                        <ActionGlyph icon={{ kind: "spell" }} />
                      )}
                    </span>
                    <span className="f-choice-main">
                      <span className="f-row-t">{s.name}</span>
                      <span className="f-choice-s">
                        {pick.get(s.spellId ?? "")?.levelLine}
                      </span>
                      {s.always && (
                        <span className="f-choice-s">{t("play.spells.always")}</span>
                      )}
                    </span>
                    {pick.get(s.spellId ?? "")?.effect && (
                      <span className="f-prep-eff">
                        {pick.get(s.spellId ?? "")?.effect}
                      </span>
                    )}
                  </Choice>
                  {/* A spell two of the classes share: which one it comes through (its
                    casting ability). None picked: the sheet decides. */}
                  {s.via && (
                    <div
                      className="f-chips"
                      role="group"
                      aria-label={`${t("play.spells.via")}: ${s.name}`}
                    >
                      <span className="f-lbl">{t("play.spells.via")}</span>
                      {s.via.options.map((o) => (
                        <Chip
                          key={o.classId}
                          pressed={s.via?.current === o.classId}
                          onClick={() => via(s.idx, o.classId)}
                        >
                          {o.label}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </>
    );
  }
}
