/**
 * Creation steps 3 (Specie) and 4 (Caratteristiche), approved prototypes create-3/4.
 * Species: every species with three of its traits, searchable, then every choice it
 * owes, read from the engine: its lineage, legacy or ancestry, the spellcasting
 * ability its spells use, its traits' picks (Keen Senses, Skillful), and for a
 * Human the Versatile origin feat with that feat's own picks. Abilities: how they're set (suggested, point
 * buy, rolled at the table), six tiles with the score's breakdown, and the
 * background's +2/+1 (or +1/+1/+1) placed on its three abilities.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  abilityTiles,
  choiceSlotRows,
  signed,
  speciesRows,
  toggleChoicePick,
  type ChoiceSlotRow,
} from "@/domains/creation/creation-view";
import type {
  CreationDraft,
  CreationDraftAction,
  CreationFacts,
} from "@/lib/creation/draft";
import { lineageBundleVMs } from "@/lib/views/creation-view";
import { originFeatVMs } from "@/lib/views/feat-pick-view";
import type { Locale } from "@/lib/locale";
import type { AbilityCode } from "@/types/ability";
import { Chip, Choice, Field, Stepper } from "@/ui";

export type AbilityMethod = "suggested" | "pointBuy" | "rolled";

/** The three abilities a species' spells may use. */
const SPECIES_SPELL_ABILITIES = ["INT", "WIS", "CHA"] as const;

/** Each slot as a titled row of chips; a tap adds, removes or replaces the oldest. */
function SlotChips({
  rows,
  draft,
  dispatch,
}: {
  rows: readonly ChoiceSlotRow[];
  draft: CreationDraft;
  dispatch: (action: CreationDraftAction) => void;
}) {
  return rows.map((row) => (
    <div key={row.slotId} className="f-ask">
      <span className="f-lbl">{row.title}</span>
      <div className="f-chips">
        {row.options.map((o) => (
          <Chip
            key={o.id}
            pressed={row.picked.includes(o.id)}
            onClick={() =>
              dispatch({
                type: "setChoicePicks",
                picks: toggleChoicePick(draft.choicePicks, row, o.id),
              })
            }
          >
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  ));
}

/** Lower case without accents, for a forgiving search. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function SpeciesStep({
  draft,
  facts,
  picked,
  locale,
  onPick,
  dispatch,
}: {
  draft: CreationDraft;
  facts: CreationFacts;
  picked: boolean;
  locale: Locale;
  onPick: (raceId: string) => void;
  dispatch: (action: CreationDraftAction) => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => speciesRows(locale), [locale]);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return q
      ? rows.filter((r) => fold([r.name, ...r.traits].join(" ")).includes(q))
      : rows;
  }, [rows, query]);
  const current = picked ? rows.find((r) => r.id === draft.raceId) : undefined;
  const bundles = picked ? lineageBundleVMs(draft.raceId, locale) : [];
  const feats = useMemo(
    () =>
      facts.isHuman
        ? originFeatVMs(
            locale,
            new Set(facts.backgroundFeat ? [facts.backgroundFeat] : [])
          )
        : [],
    [facts.isHuman, facts.backgroundFeat, locale]
  );
  const owned = {
    skills: new Set([...facts.backgroundSkillIds, ...draft.classSkills]),
    spells: new Set([...draft.cantrips, ...draft.spells]),
  };
  const speciesSlots = picked
    ? choiceSlotRows(facts.speciesChoiceSlots, draft.choicePicks, owned, locale)
    : [];
  const featSlots = picked
    ? choiceSlotRows(facts.humanFeatSlots, draft.choicePicks, owned, locale)
    : [];
  return (
    <div className="f-ask">
      <Field
        label={t("create.screen.searchSpecies")}
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="f-choices f-create-list f-create-two">
        {shown.map((r) => (
          <Choice
            key={r.id}
            on={picked && draft.raceId === r.id}
            onClick={() => onPick(r.id)}
          >
            <span className="f-row-main">
              <span className="f-row-t">{r.name}</span>
              <span className="f-row-s">{r.traits.join("\u00a0· ")}</span>
            </span>
          </Choice>
        ))}
      </div>
      {current && (
        <blockquote className="f-create-pitch">
          <b>{current.name}</b>
          <p>{t("create.screen.speciesNote")}</p>
        </blockquote>
      )}
      {bundles.map((b) => (
        <div key={b.bundleKey} className="f-ask">
          <span className="f-lbl">{b.label}</span>
          <div className="f-chips">
            {b.options.map((o) => (
              <Chip
                key={o.id}
                pressed={draft.lineageChoices[b.bundleKey] === o.id}
                onClick={() =>
                  dispatch({
                    type: "setLineageChoice",
                    bundleKey: b.bundleKey,
                    optionId: o.id,
                  })
                }
              >
                {o.label}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      {picked && facts.needsSpeciesSpellAbility && (
        <div className="f-ask">
          <span className="f-lbl">{t("create.screen.speciesAbility")}</span>
          <p className="f-help">{t("create.screen.speciesAbilityHint")}</p>
          <div className="f-chips">
            {SPECIES_SPELL_ABILITIES.map((code) => (
              <Chip
                key={code}
                pressed={draft.speciesSpellAbility === code}
                onClick={() =>
                  dispatch({ type: "setSpeciesSpellAbility", ability: code })
                }
              >
                {t(`abilities.${code}`)}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <SlotChips rows={speciesSlots} draft={draft} dispatch={dispatch} />
      {picked && facts.isHuman && (
        <div className="f-ask">
          <span className="f-lbl">{t("create.humanVersatileLabel")}</span>
          <p className="f-help">{t("create.humanVersatileHint")}</p>
          <div className="f-choices f-create-list">
            {feats.map((f) => (
              <Choice
                key={f.id}
                on={draft.humanFeat === f.id}
                onClick={() => dispatch({ type: "setHumanFeat", featId: f.id })}
              >
                <span className="f-row-main">
                  <span className="f-row-t">{f.name}</span>
                  {f.halfFeat && <span className="f-row-s">{f.halfFeat}</span>}
                </span>
              </Choice>
            ))}
          </div>
          <SlotChips rows={featSlots} draft={draft} dispatch={dispatch} />
        </div>
      )}
    </div>
  );
}

export function AbilitiesStep({
  draft,
  facts,
  method,
  className,
  backgroundName,
  onMethod,
  dispatch,
}: {
  draft: CreationDraft;
  facts: CreationFacts;
  method: AbilityMethod;
  className: string;
  backgroundName: string;
  onMethod: (method: AbilityMethod) => void;
  dispatch: (action: CreationDraftAction) => void;
}) {
  const { t } = useTranslation();
  const tiles = abilityTiles(draft, facts);
  const eligible: ReadonlyArray<AbilityCode> = facts.backgroundData?.abilityOptions ?? [];
  const setScore = (code: AbilityCode, value: number) =>
    dispatch({
      type: "setAbilityScores",
      abilityScores: { ...draft.abilityScores, [code]: value },
    });
  const bonusHint =
    draft.bgAsiMode === "+1/+1/+1"
      ? t("create.bgAsiSelect3")
      : Object.values(draft.bgAsiChoices).includes(2)
        ? t("create.bgAsiSelectSecond")
        : t("create.bgAsiSelectFirst");
  return (
    <div className="f-ask">
      <span className="f-lbl">{t("create.screen.howTitle")}</span>
      <div className="f-chips">
        {(["suggested", "pointBuy", "rolled"] as const).map((m) => (
          <Chip key={m} pressed={method === m} onClick={() => onMethod(m)}>
            {t(
              m === "suggested"
                ? "create.screen.methodSuggested"
                : m === "pointBuy"
                  ? "create.pointBuy"
                  : "create.screen.methodRolled"
            )}
          </Chip>
        ))}
      </div>
      <div className="f-abil-grid" data-edit={method !== "suggested" || undefined}>
        {tiles.map((tile) => (
          <div
            key={tile.code}
            className="f-abil-tile"
            data-primary={
              facts.classTable?.primaryAbility.includes(tile.code) || undefined
            }
          >
            <span className="f-lbl">{t(`abilities.${tile.code}`)}</span>
            <b className="f-abil-mod">{signed(tile.mod)}</b>
            <span className="f-abil-sum">
              {tile.bonus > 0
                ? `${String(tile.base)} + ${String(tile.bonus)} = ${String(tile.score)}`
                : String(tile.score)}
            </span>
            {method !== "suggested" && (
              <Stepper
                value={tile.base}
                min={method === "pointBuy" ? 8 : 3}
                max={method === "pointBuy" ? 15 : 18}
                label={t("create.abilityScoreInput", {
                  ability: t(`abilities.${tile.code}`),
                })}
                less={t("common.decrease")}
                more={t("common.increase")}
                onChange={(v) => setScore(tile.code, v)}
              />
            )}
          </div>
        ))}
      </div>
      {method === "pointBuy" && (
        <p className="f-help" role="status">
          {`${t("create.screen.pointsLeft", { count: facts.pointsRemaining })} · ${t("create.screen.pointBuyHint")}`}
        </p>
      )}
      {method === "rolled" && <p className="f-help">{t("create.screen.rolledHint")}</p>}
      {method === "suggested" && (
        <blockquote className="f-create-pitch">
          <b>
            {t("create.screen.suggestedTitle", {
              values: Object.values(draft.abilityScores)
                .sort((a, b) => b - a)
                .join(", "),
            })}
          </b>
          <p>{t("create.screen.suggestedHint", { class: className })}</p>
        </blockquote>
      )}
      {facts.backgroundData && (
        <div className="f-ask">
          <span className="f-lbl">{t("create.titleBgAsi")}</span>
          <p className="f-help">
            {t("create.bgAsiEligible", {
              background: backgroundName,
              a: t(`abilities.${eligible[0] ?? "STR"}`),
              b: t(`abilities.${eligible[1] ?? "DEX"}`),
              c: t(`abilities.${eligible[2] ?? "CON"}`),
            })}
          </p>
          <div className="f-chips" role="group" aria-label={t("create.bgAsiModeLabel")}>
            {(["+2/+1", "+1/+1/+1"] as const).map((mode) => (
              <Chip
                key={mode}
                pressed={draft.bgAsiMode === mode}
                onClick={() => dispatch({ type: "switchAbilityBonusMode", mode })}
              >
                {t(mode === "+2/+1" ? "create.bgAsiMode21" : "create.bgAsiMode111")}
              </Chip>
            ))}
          </div>
          <div className="f-chips">
            {eligible.map((code) => {
              const bonus = draft.bgAsiChoices[code] ?? 0;
              return (
                <Chip
                  key={code}
                  pressed={bonus > 0}
                  onClick={() => dispatch({ type: "toggleAbilityBonus", code })}
                >
                  {bonus > 0
                    ? `${t(`abilities.${code}`)} ${signed(bonus)}`
                    : t(`abilities.${code}`)}
                </Chip>
              );
            })}
          </div>
          {!facts.abilityBonusValid && <p className="f-help">{bonusHint}</p>}
        </div>
      )}
    </div>
  );
}
