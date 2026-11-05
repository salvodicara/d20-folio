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
  classChoiceSections,
  creationReview,
  previewArmorClass,
  toggleCount,
  signed,
  speciesRows,
  toggleChoicePick,
  type ChoiceSlotRow,
} from "@/domains/creation/creation-view";
import {
  missingCreationRequirements,
  type CreationDraft,
  type CreationDraftAction,
  type CreationFacts,
} from "@/lib/creation/draft";
import { ChoiceRowChips } from "@/domains/creation/ui/ChoiceRowChips";
import { PickGrid } from "@/domains/spells/ui/PickGrid";
import {
  classStartingEquipment,
  lineageBundleVMs,
  REQUIREMENT_LABEL_KEYS,
  startingEquipmentOptions,
  type StartingOptionVM,
} from "@/lib/views/creation-view";
import { originFeatVMs } from "@/lib/views/feat-pick-view";
import type { Locale } from "@/lib/locale";
import type { AbilityCode } from "@/types/ability";
import { Chip, Choice, Field, Stepper } from "@/ui";

export type AbilityMethod = "suggested" | "pointBuy" | "rolled";

/** The three abilities a species' spells may use. */
const SPECIES_SPELL_ABILITIES = ["INT", "WIS", "CHA"] as const;

/** The draft's slots as chip rows; a tap toggles the pick in the draft. */
function SlotChips({
  rows,
  draft,
  dispatch,
}: {
  rows: readonly ChoiceSlotRow[];
  draft: CreationDraft;
  dispatch: (action: CreationDraftAction) => void;
}) {
  return (
    <ChoiceRowChips
      rows={rows}
      onToggle={(row, id) =>
        dispatch({
          type: "setChoicePicks",
          picks: toggleChoicePick(draft.choicePicks, row, id),
        })
      }
    />
  );
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
          <PickGrid
            label={t("create.humanVersatileLabel")}
            options={feats.map((f) => ({ id: f.id, label: f.name }))}
            picked={draft.humanFeat ? [draft.humanFeat] : []}
            art="feat"
            locale={locale}
            onToggle={(featId) => dispatch({ type: "setHumanFeat", featId })}
          />
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

/** One package per row; the gold-only one says its purse. */
function packageRows(
  options: readonly StartingOptionVM[],
  t: (key: string, args?: Record<string, string | number>) => string
) {
  const gp = t("equipment.currencyAbbr.gp");
  return options.map((opt) => {
    const items = opt.items.map((item) =>
      item.placeholder
        ? t(`create.equipToolChoice_${item.placeholder}`)
        : item.quantity > 1
          ? `${item.label} ×${String(item.quantity)}`
          : item.label
    );
    return {
      label: opt.label,
      title:
        opt.items.length === 0
          ? t("create.equipOptionGold", { label: opt.label, gold: opt.gold, gp })
          : t("create.equipOption", { label: opt.label }),
      line: [
        ...items,
        ...(opt.gold > 0 && items.length > 0 ? [`${String(opt.gold)} ${gp}`] : []),
      ].join(", "),
    };
  });
}

/** Step 5: the class's package and the background's, then what the Armor Class comes to. */
export function EquipmentStep({
  draft,
  facts,
  locale,
  backgroundName,
  dispatch,
}: {
  draft: CreationDraft;
  facts: CreationFacts;
  locale: Locale;
  backgroundName: string;
  dispatch: (action: CreationDraftAction) => void;
}) {
  const { t } = useTranslation();
  const classRows = packageRows(
    classStartingEquipment(draft.classId, locale, facts.classToolChoice),
    t
  );
  const bgRows = packageRows(
    startingEquipmentOptions(
      facts.backgroundEquipmentOptions,
      locale,
      facts.bgToolChoice
    ),
    t
  );
  const group = (
    heading: string,
    rows: ReturnType<typeof packageRows>,
    chosen: string,
    choose: (label: string) => void
  ) =>
    rows.length > 0 && (
      <div className="f-ask">
        <span className="f-lbl">{heading}</span>
        <div className="f-choices">
          {rows.map((row) => (
            <Choice
              key={row.label}
              on={chosen === row.label}
              onClick={() => choose(row.label)}
            >
              <span className="f-row-main">
                <span className="f-row-t">{row.title}</span>
                {row.line && <span className="f-row-s">{row.line}</span>}
              </span>
            </Choice>
          ))}
        </div>
      </div>
    );
  const sections = classChoiceSections(draft, facts, locale);
  return (
    <div className="f-ask">
      {/* The class's own level-1 choices first (Divine Order, Fighting Style,
          Weapon Mastery…): they can change the armor it wears and its attacks. */}
      {sections.map((section) => (
        <div
          key={section.kind === "bundle" ? section.bundleKey : section.kind}
          className="f-ask"
        >
          <span className="f-lbl">{section.title}</span>
          <div className="f-chips">
            {section.options.map((o) =>
              section.kind === "bundle" ? (
                <Chip
                  key={o.id}
                  pressed={section.picked === o.id}
                  onClick={() =>
                    dispatch({
                      type: "setLineageChoice",
                      bundleKey: section.bundleKey,
                      optionId: o.id,
                    })
                  }
                >
                  {o.label}
                </Chip>
              ) : (
                <Chip
                  key={o.id}
                  pressed={section.picked.includes(o.id)}
                  onClick={() =>
                    dispatch({
                      type: "setClassPick",
                      kind: section.kind,
                      ids: toggleCount(section.picked, o.id, section.count),
                    })
                  }
                >
                  {o.label}
                </Chip>
              )
            )}
          </div>
        </div>
      ))}
      {group(t("create.equipFromClass"), classRows, facts.classEquipLabel, (label) =>
        dispatch({ type: "setClassEquipment", label })
      )}
      {group(
        `${t("create.equipFromBackground")} (${backgroundName})`,
        bgRows,
        facts.bgEquipLabel,
        (label) => dispatch({ type: "setBackgroundEquipment", label })
      )}
      <blockquote className="f-create-pitch">
        <b>{t("create.screen.acTitle", { ac: previewArmorClass(draft, facts) })}</b>
        <p>{t("create.screen.acHint")}</p>
      </blockquote>
    </div>
  );
}

/** Step 6: the name, then what the character is made of, and anything still owed. */
export function ReviewStep({
  draft,
  facts,
  locale,
  identity,
  dispatch,
}: {
  draft: CreationDraft;
  facts: CreationFacts;
  locale: Locale;
  /** «Chierico 1 · Nano · Accolito». */
  identity: string;
  dispatch: (action: CreationDraftAction) => void;
}) {
  const { t } = useTranslation();
  const review = creationReview(draft, facts, locale);
  const missing = missingCreationRequirements(draft, facts);
  const and = new Intl.ListFormat(locale, { type: "conjunction" });
  const row = (title: string, detail?: string) => (
    <div className="f-row">
      <span className="f-row-main">
        <span className="f-row-t">{title}</span>
        {detail && <span className="f-row-s">{detail}</span>}
      </span>
    </div>
  );
  return (
    <div className="f-ask">
      <Field
        label={t("create.nameLabel")}
        placeholder={t("create.namePlaceholder")}
        autoComplete="off"
        value={draft.name}
        onChange={(e) => dispatch({ type: "setName", name: e.target.value })}
        data-autofocus
      />
      <div className="f-create-review">
        {row(
          identity,
          review.subclassLevel === null
            ? undefined
            : t("create.screen.subclassAt", { level: review.subclassLevel })
        )}
        {row(
          [
            `${t("play.hpTitle")} ${String(review.hp)}`,
            t("create.screen.acTitle", { ac: review.ac }),
            `${t("character.speed")} ${review.speed}`,
          ].join(" · ")
        )}
        {review.cantrips.length > 0 &&
          row(
            `${t("spells.cantrips")} ${String(review.cantrips.length)}`,
            and.format(review.cantrips)
          )}
        {review.spells.length > 0 &&
          row(
            `${t("create.screen.preparedSpells")} ${String(review.spells.length)}`,
            and.format(review.spells)
          )}
        {row(t("character.skills"), and.format(review.skills))}
        {row(t("create.stepLanguages"), and.format(review.languages))}
      </div>
      {missing.length > 0 ? (
        <div className="f-note" role="status">
          <b>{t("create.missingTitle")}</b>{" "}
          {missing.map((m) => t(REQUIREMENT_LABEL_KEYS[m.key])).join(" · ")}
        </div>
      ) : (
        <p className="f-help">{t("create.screen.rulesNote")}</p>
      )}
    </div>
  );
}
