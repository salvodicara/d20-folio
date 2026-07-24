/**
 * LeftHud — the identity-side cockpit rail: Abilities (Carved-Cartouche
 * StatCards, with the saving throw folded into each medallion), Skills, and
 * Senses. Every number comes from the engine — `compute.ts` scalars +
 * `derive-sheet-views` over the aggregated grants — never recomputed here
 * (Constitution §4.9/§4.10); proficiency state is read from the stored sheet.
 *
 * Render isolation (§7.2): the panel selects only the sheet + the session
 * slices it actually reads (scores/proficiencies + exhaustion/active-features),
 * so a center-panel HP edit or a tab switch never re-renders it; the expensive
 * grant aggregates are memoized.
 *
 * Override-first (#12): every skill bonus and saving throw is engine-computed by
 * default, and `uiStore.sheetMode === "edit"` exposes an inline override editor
 * (InlineEditable, with override indicator + reset-to-auto) that writes through
 * the shared `patchCharacter` seam into `skillBonusOverrides` /
 * `savingThrowBonusOverrides`. Play mode renders clean read-only text. Score /
 * proficiency / defense / language overrides are a later types decision.
 */

import { useMemo } from "react";
import { totalLevel } from "@/lib/classes";
import { useTranslation } from "react-i18next";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import {
  ALL_ABILITIES,
  abilityModifier,
  effectiveProficiencyBonus,
  effectiveAbilityScores,
} from "@/lib/compute";
import { localizeBreakdown } from "@/lib/views/combat-action-view";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import { BreakdownTip } from "@/components/shared/BreakdownTip";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { deriveSensesAndSpeeds } from "@/lib/views/sheet-view";
import { effectiveWalkingSpeedFt } from "@/lib/smart-tracker";
import { getEquipment } from "@/data/equipment";
import { conditionLabel } from "@/lib/views/tracker-view";
import { StatCard } from "@/components/shared/StatCard";
import { InlineEditable } from "@/components/shared/InlineEditable";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { useLocale } from "@/hooks/useLocale";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { localeDistance } from "@/lib/utils";
import { retroactiveConHpMax } from "@/lib/character-infer";
import { RailSection } from "../RailSection";
import { patchCharacter } from "../patch-character";
import type { AbilityCode } from "@/data/types";
import type { CharacterData } from "@/types/character";

type SkillProficiency = "proficient" | "expertise" | "halfProficiency";

/** Folio modifier convention: U+2212 minus, explicit + for non-negatives. */
function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

const DOT_STATE: Record<SkillProficiency, "proficient" | "expertise" | "half"> = {
  proficient: "proficient",
  expertise: "expertise",
  halfProficiency: "half",
};

export function LeftHud() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  // T4 — read-only (a DM viewing a member's sheet): never editable, and the
  // play-mode controls (save-dot cycling, etc.) go inert below.
  const readonly = useSheetReadonly();
  const isEdit = useUIStore((s) => (readonly ? false : s.sheetMode === "edit"));

  // Narrow selectors — the Left HUD reads the sheet + a couple of session
  // slices, NOT the whole doc, so a center HP/round change can't re-render it.
  const characterDoc = useCharacterStore((s) => s.character);
  const charData = useCharacterStore((s) => s.character?.character);
  const exhaustion = useCharacterStore((s) => s.character?.session.exhaustion ?? 0);
  const activeFeatures = useCharacterStore((s) => s.character?.session.activeFeatures);
  // B1 — active conditions feed the single self-side resolver. The save medallions
  // are the one LeftHud consumer (auto-fail mark); the slider + concentration
  // banner consume the SAME resolver in ThisTurnTracker (one function, no
  // per-surface re-derivation — shared-seam "resolveConditionEffects single
  // consumer").
  const conditions = useCharacterStore((s) => s.character?.session.conditions);
  // Chosen lineage/circle bundles — feeds the FULL aggregate so a picked Elven
  // Lineage's darkvision/spells/resistances reach the Senses rail (#90).
  const grantBundleChoices = useCharacterStore(
    (s) => s.character?.session.grantBundleChoices
  );

  // Full aggregate → ability-score floors + senses/speeds (grants), threading the
  // chosen grant-bundle so a picked lineage's senses/floors apply. The save /
  // skill / passive ROW math lives in the SHARED, locale-free `deriveSavesAndChecks`
  // builder (golden rule 6 — the ONE home of that math; this rail is its sole
  // consumer, so its display can never drift from the engine).
  const fullAggregate = useMemo(
    () =>
      charData
        ? aggregateCharacterGrants(charData, { activeFeatures, grantBundleChoices })
        : null,
    [charData, activeFeatures, grantBundleChoices]
  );
  const savesChecks = useMemo(
    () =>
      charData
        ? deriveSavesAndChecks(charData, {
            exhaustion,
            activeFeatures,
            conditions,
            grantBundleChoices,
          })
        : null,
    [charData, exhaustion, activeFeatures, conditions, grantBundleChoices]
  );

  if (!charData || !fullAggregate || !savesChecks) return null;

  const level = totalLevel(charData);
  const pb = effectiveProficiencyBonus(level, charData.proficiencyBonusOverride);
  const effectiveScores = effectiveAbilityScores(
    charData.abilityScores,
    fullAggregate.abilityScoreFloors,
    fullAggregate.itemAbilityScoreBonus,
    fullAggregate.itemAbilityScoreCap
  );
  // The per-save row keyed for the medallion loop (bonus + breakdown + auto-fail
  // cause + proficiency all come from the shared builder).
  const saveByCode = new Map(savesChecks.saves.map((s) => [s.id, s]));
  const castAbility = charData.spellcasting?.ability ?? null;

  // Override-first set helpers: write through the shared sheet seam. `set`
  // merges the new entry; `clear` deletes the key so the value reverts to auto.
  const setSkillOverride = (id: string, value: number) =>
    patchCharacter({
      skillBonusOverrides: { ...(charData.skillBonusOverrides ?? {}), [id]: value },
    });
  const clearSkillOverride = (id: string) => {
    const next = Object.fromEntries(
      Object.entries(charData.skillBonusOverrides ?? {}).filter(([key]) => key !== id)
    );
    patchCharacter({ skillBonusOverrides: next });
  };
  const setSaveOverride = (code: AbilityCode, value: number) =>
    patchCharacter({
      savingThrowBonusOverrides: {
        ...(charData.savingThrowBonusOverrides ?? {}),
        [code]: value,
      },
    });
  const clearSaveOverride = (code: AbilityCode) => {
    const next = Object.fromEntries(
      Object.entries(charData.savingThrowBonusOverrides ?? {}).filter(
        ([key]) => key !== code
      )
    ) as Partial<Record<AbilityCode, number>>;
    patchCharacter({ savingThrowBonusOverrides: next });
  };

  // #79/U3 — proficiency DOT editing in edit mode. Edits the BASE
  // `charData.skills` / `charData.savingThrows`; the effective dot the row shows is
  // still `max(base, GRANTED)`, so a class/feat-granted dot is a floor (you can add
  // or upgrade, never drop a granted proficiency below — full removal would need a
  // grant-suppression field, out of scope). The bonus override beside it still wins
  // the NUMBER; the dot only drives the auto computation.
  const cycleSkillDot = (id: string) => {
    const base = charData.skills[id];
    const next: SkillProficiency | undefined =
      base === "proficient"
        ? "expertise"
        : base === "expertise"
          ? undefined
          : "proficient";
    const skills = Object.fromEntries(
      Object.entries(charData.skills).filter(([k]) => k !== id)
    ) as Record<string, SkillProficiency>;
    if (next) skills[id] = next;
    patchCharacter({ skills });
  };
  const cycleSaveDot = (code: AbilityCode) => {
    const has = charData.savingThrows.includes(code);
    patchCharacter({
      savingThrows: has
        ? charData.savingThrows.filter((c) => c !== code)
        : [...charData.savingThrows, code],
    });
  };

  // Rows come from the SHARED builder (golden rule 6); the rail adds only the
  // localized label + the locale-aware skill sort. `displayBonus` is the raw
  // override the edit field shows (`override ?? auto`) — the medallion's at-rest
  // save number is `saveRow.bonus` (the override-applied value).
  const skillRows = savesChecks.skills
    .map((skill) => ({
      id: skill.id,
      ability: skill.ability,
      proficiency: skill.proficiency,
      auto: skill.auto,
      displayBonus: skill.bonus,
      name: t(`skills.${skill.id}`),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  // Saving-throw override rows (edit-mode set affordance). The medallion folds
  // the save in for play-mode glance; the override editor lives here because the
  // StatCard is a <button> and can't nest an input.
  const saveRows = savesChecks.saves.map((save) => ({
    code: save.id,
    proficient: save.proficient,
    auto: save.auto,
    displayBonus: save.override ?? save.auto,
    name: t(`abilities.${save.id}`),
  }));

  // S13 — the non-walking speed sentinels (fly/swim = `equal-to-walking` /
  // `twice-walking`) resolve against the EFFECTIVE walking Speed (override +
  // grants + Boots × exhaustion − armor penalty), so a doubled/penalized walking
  // Speed flows through to the derived swim/fly/climb ranges (rule 6).
  const walkingSpeedFt = characterDoc
    ? (charData.speedOverride ?? effectiveWalkingSpeedFt(characterDoc, getEquipment))
    : 0;
  const { senses, speeds } = deriveSensesAndSpeeds(fullAggregate, walkingSpeedFt);
  // #68 — passive scores are override-first: the computed value is the default, an
  // explicit override replaces it (reset returns to computed). Numbers + breakdown
  // come from the SHARED builder; the rail localizes the label + the tip lines.
  const passiveRows = savesChecks.passives.map((p) => ({
    key: p.id,
    label: t(p.labelKey),
    computed: p.computed,
    breakdown: localizeBreakdown(p.breakdownParts, locale),
    field: p.field,
    override: p.override,
  }));

  return (
    <div
      className="folio-panel flex flex-col gap-6 p-4"
      {...(readonly ? { inert: true } : {})}
    >
      <RailSection
        rubric={
          // P2 — the rubric glosses what ability scores/modifiers ARE (the
          // medallions below are the first thing a new player tries to read).
          <GlossaryTip term="abilityScores" rubric={t("character.abilityScores")}>
            {t("character.hud.abilities")}
          </GlossaryTip>
        }
      >
        {/* D48 — 2 columns of FATTER cards (was a narrow 3-col grid that read slim
            & tall). Each card is now wider (fat) with the modifier + score on one
            row (short), so the medallions read as substantial DDB/BG3 stat blocks. */}
        <div className="grid grid-cols-2 gap-2">
          {ALL_ABILITIES.map(({ code }) => {
            const score = effectiveScores[code];
            const mod = abilityModifier(score);
            // Save number + proficiency + breakdown + auto-fail cause all come
            // from the shared builder (golden rule 6). Override-first: `bonus` is
            // the override-applied at-rest number the medallion shows.
            const saveRow = saveByCode.get(code);
            const isProficient = saveRow?.proficient ?? false;
            const stb = saveRow?.bonus ?? 0;
            // The save's per-source composition for the carved-base disclosure —
            // the SAME `BreakdownTip` register every value rides (golden rule 3),
            // but rendered in the medallion's OWN carved base (it already has a
            // disclosure; a popover on top would duplicate it — rule 19). Empty
            // under a manual override; the base falls back to the terse math then.
            const saveBreakdown = saveRow?.breakdownParts
              ? localizeBreakdown(saveRow.breakdownParts, locale)
              : [];
            const isCaster = castAbility === code;
            // B1 — auto-fail mark: the gating condition for this save (if any).
            const autoFailConditionId = saveRow?.autoFailCause;
            return (
              <StatCard
                key={code}
                autoFail={autoFailConditionId != null}
                autoFailLabel={t("abilities.autoFail")}
                autoFailTitle={
                  autoFailConditionId != null
                    ? t("abilities.autoFailSaveTitle", {
                        ability: t(`abilities.${code}`),
                        condition: conditionLabel(autoFailConditionId, locale),
                      })
                    : undefined
                }
                saveBreakdown={saveBreakdown}
                label={t(`abilities.${code}_short`)}
                ariaLabel={t("abilities.abilityScoreAria", {
                  ability: t(`abilities.${code}`),
                  modifier: fmtMod(mod),
                  score,
                  saveBonus: fmtMod(stb),
                  saveState: isProficient
                    ? t("abilities.proficientLabel")
                    : t("abilities.notProficientLabel"),
                })}
                modifier={mod}
                score={score}
                saveBonus={stb}
                saveProficient={isProficient}
                proficiencyBonus={pb}
                caster={isCaster}
                casterLabel={t("abilities.caster")}
                saveLabel={t("abilities.save")}
                baseHead={t("abilities.savingThrowHead")}
                proficientStateLabel={t("abilities.proficientLabel")}
                notProficientStateLabel={t("abilities.notProficientLabel")}
              />
            );
          })}
        </div>
      </RailSection>

      {/* Ability-score editing — edit-mode only (#68). The medallions show the
          EFFECTIVE score (base + grant floors); this edits the BASE score directly
          in the cockpit (previously only the creation/level-up wizards could), and
          every derived value (mods, saves, skills, AC, passives) recomputes live; a
          CON edit also retro-adjusts the stored max HP across every level (RA-22,
          2024 RAW). */}
      {isEdit && (
        <RailSection rubric={t("character.abilityScores")}>
          <ul className="flex flex-col gap-1">
            {ALL_ABILITIES.map(({ code }) => (
              <li key={code} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-text-primary">
                  {t(`abilities.${code}`)}
                </span>
                <InlineEditable
                  type="number"
                  editable={isEdit}
                  value={charData.abilityScores[code]}
                  min={1}
                  max={30}
                  onChange={(v) => {
                    const patch: Partial<CharacterData> = {
                      abilityScores: { ...charData.abilityScores, [code]: v },
                    };
                    // RA-22 — a CON change retro-adjusts max HP across every level
                    // (2024 RAW), the same rebake the level-up ASI path does, so the
                    // stored base never goes stale from a sheet edit (rises AND
                    // decreases; a pinned/rolled max shifts by the delta, never reset).
                    if (code === "CON")
                      patch.hp = { max: retroactiveConHpMax(charData, v) };
                    patchCharacter(patch);
                  }}
                  ariaLabel={t(`abilities.${code}`)}
                />
              </li>
            ))}
          </ul>
        </RailSection>
      )}

      {/* Saving-throw overrides — edit-mode only. Play mode keeps the saves
          folded into the medallions above (override-first read), so this set
          affordance appears only when the sheet is being edited. */}
      {isEdit && (
        <RailSection
          rubric={<GlossaryTip term="savingThrow" rubric={t("character.savingThrows")} />}
        >
          <ul className="flex flex-col gap-1">
            {saveRows.map((save) => (
              <li key={save.code} className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  className="pr-dot"
                  data-state={save.proficient ? "proficient" : "none"}
                  aria-pressed={save.proficient}
                  onClick={() => cycleSaveDot(save.code)}
                  aria-label={t("character.hud.cycleSaveProf", {
                    ability: save.name,
                  })}
                />
                <span className="min-w-0 flex-1 truncate text-text-primary">
                  {save.name}
                </span>
                <InlineEditable
                  type="number"
                  editable={isEdit}
                  value={save.displayBonus}
                  computedValue={save.auto}
                  min={-20}
                  max={40}
                  format={fmtMod}
                  onChange={(v) => setSaveOverride(save.code, v)}
                  onReset={() => clearSaveOverride(save.code)}
                  ariaLabel={t("character.hud.saveBonusAria", {
                    ability: save.name,
                  })}
                  valueClassName="font-mono tabular-nums"
                />
              </li>
            ))}
          </ul>
        </RailSection>
      )}

      <RailSection
        rubric={
          // P2 — glosses what a skill check is + what the proficiency dots mean.
          <GlossaryTip term="skillCheck" rubric={t("character.skills")}>
            {t("character.hud.skills")}
          </GlossaryTip>
        }
      >
        <ul className="flex flex-col gap-1">
          {skillRows.map((skill) => (
            <li key={skill.id} className="flex items-center gap-2 text-sm">
              {isEdit ? (
                <button
                  type="button"
                  className="pr-dot"
                  data-state={skill.proficiency ? DOT_STATE[skill.proficiency] : "none"}
                  onClick={() => cycleSkillDot(skill.id)}
                  aria-label={t("character.hud.cycleSkillProf", {
                    skill: skill.name,
                  })}
                />
              ) : (
                <span
                  className="pr-dot"
                  data-state={skill.proficiency ? DOT_STATE[skill.proficiency] : "none"}
                  aria-hidden
                />
              )}
              <span className="min-w-0 flex-1 truncate text-text-primary">
                {skill.name}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">
                {t(`abilities.${skill.ability}_short`)}
              </span>
              <InlineEditable
                type="number"
                editable={isEdit}
                value={skill.displayBonus}
                computedValue={skill.auto}
                min={-20}
                max={40}
                format={fmtMod}
                onChange={(v) => setSkillOverride(skill.id, v)}
                onReset={() => clearSkillOverride(skill.id)}
                ariaLabel={t("character.hud.skillBonusAria", {
                  skill: skill.name,
                })}
                valueClassName="font-mono tabular-nums"
              />
            </li>
          ))}
        </ul>
      </RailSection>

      <RailSection rubric={t("character.hud.senses")}>
        <div className="flex flex-col gap-1 text-sm">
          {passiveRows.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-2">
              <span className="text-text-secondary">
                {/* P2 — one shared gloss explains how every passive score works. */}
                <GlossaryTip term="passiveScore" rubric={p.label} />
              </span>
              <span className="font-mono tabular-nums text-text-primary">
                {!isEdit && p.override == null && p.breakdown.length > 1 ? (
                  <BreakdownTip label={String(p.computed)} lines={p.breakdown} />
                ) : (
                  <InlineEditable
                    type="number"
                    editable={isEdit}
                    value={p.override ?? p.computed}
                    computedValue={p.computed}
                    min={0}
                    max={50}
                    onChange={(v) => patchCharacter({ [p.field]: v })}
                    onReset={() => patchCharacter({ [p.field]: null })}
                    ariaLabel={p.label}
                  />
                )}
              </span>
            </div>
          ))}
          {senses.map((sense) => {
            const override = charData.senseRangeOverrides?.[sense.kind];
            const rangeFt = override ?? sense.rangeFt;
            return (
              <div key={sense.kind} className="flex items-center justify-between gap-2">
                <span className="text-text-secondary">
                  {t(`character.sense_${sense.kind}`)}
                </span>
                <span className="font-mono tabular-nums text-text-primary">
                  <InlineEditable
                    type="number"
                    editable={isEdit}
                    value={rangeFt}
                    computedValue={sense.rangeFt}
                    min={0}
                    max={600}
                    format={(n) => localeDistance(n, locale)}
                    onChange={(v) =>
                      patchCharacter({
                        senseRangeOverrides: {
                          ...(charData.senseRangeOverrides ?? {}),
                          [sense.kind]: v,
                        },
                      })
                    }
                    onReset={() =>
                      patchCharacter({
                        senseRangeOverrides: Object.fromEntries(
                          Object.entries(charData.senseRangeOverrides ?? {}).filter(
                            ([k]) => k !== sense.kind
                          )
                        ),
                      })
                    }
                    ariaLabel={t(`character.sense_${sense.kind}`)}
                  />
                </span>
              </div>
            );
          })}
          {/* Non-walking speeds (#68) — fly/swim/climb were computed by the engine
              but DROPPED here; now surfaced + overridable (the walking speed is the
              editable header vital). Honest blank when the character has none. */}
          {speeds.map((speed) => {
            const override = charData.speedOverrides?.[speed.kind];
            const rangeFt = override ?? speed.rangeFt;
            return (
              <div key={speed.kind} className="flex items-center justify-between gap-2">
                <span className="text-text-secondary">
                  {t(`character.speed_${speed.kind}`)}
                </span>
                <span className="font-mono tabular-nums text-text-primary">
                  <InlineEditable
                    type="number"
                    editable={isEdit}
                    value={rangeFt}
                    computedValue={speed.rangeFt}
                    min={0}
                    max={600}
                    format={(n) => localeDistance(n, locale)}
                    onChange={(v) =>
                      patchCharacter({
                        speedOverrides: {
                          ...(charData.speedOverrides ?? {}),
                          [speed.kind]: v,
                        },
                      })
                    }
                    onReset={() =>
                      patchCharacter({
                        speedOverrides: Object.fromEntries(
                          Object.entries(charData.speedOverrides ?? {}).filter(
                            ([k]) => k !== speed.kind
                          )
                        ),
                      })
                    }
                    ariaLabel={t(`character.speed_${speed.kind}`)}
                  />
                </span>
              </div>
            );
          })}
        </div>
      </RailSection>
    </div>
  );
}
