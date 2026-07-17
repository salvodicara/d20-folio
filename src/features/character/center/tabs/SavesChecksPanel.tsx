/**
 * SavesChecksPanel — the in-combat "Saves & Checks" read-out (workstream B).
 *
 * The save/skill/passive math is fully computed and rendered in the identity-side
 * cockpit rail (`LeftHud`), but on a phone that whole rail collapses behind the
 * "Stats" disclosure ABOVE the Play tab — so a player can't read "what's my DEX
 * save?" mid-combat without leaving the action board. This is a compact,
 * collapsed-by-default panel on the Play surface that surfaces the SAME numbers
 * from the SAME shared builder (`deriveSavesAndChecks` — golden rule 6): the six
 * save modifiers, the skill list, and the three passives, each with the on-demand
 * `BreakdownTip` disclosure and the crimson auto-fail mark under a condition.
 *
 * HONESTY (golden rule 21 — the app NEVER rolls dice): this shows ONLY the
 * modifier + its breakdown ("DEX save +5", "Stealth +7"). There is NO roll
 * button, NO d20, NO DC field, NO target/enemy — the player rolls their own die.
 *
 * Progressive disclosure: collapsed by default (the at-a-glance is the turn meter
 * + action cards; this is on-demand reference). Render isolation: the panel reads
 * the sheet + the narrow session slices the derivation needs, so a center HP/round
 * change never re-renders it.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCharacterStore } from "@/stores/characterStore";
import { useLocale } from "@/hooks/useLocale";
import { formatModifier } from "@/lib/utils";
import { localizeBreakdown } from "@/lib/views/combat-action-view";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import { conditionLabel } from "@/lib/views/tracker-view";
import { BreakdownTip } from "@/components/shared/BreakdownTip";
import type { RawBreakdownPart } from "@/lib/value-breakdown";
import type { Locale } from "@/lib/locale";
import type { TFunction } from "i18next";

/** A number cell: the on-demand `BreakdownTip` when the value has ≥2 sources
 *  (golden rule 19 — a single-component value earns no tip), else plain text. */
function ValueCell({
  bonus,
  parts,
  locale,
  format = formatModifier,
}: {
  bonus: number;
  parts: RawBreakdownPart[] | null;
  locale: Locale;
  format?: (n: number) => string;
}) {
  const label = format(bonus);
  if (parts && parts.length > 1) {
    return (
      <BreakdownTip
        label={label}
        lines={localizeBreakdown(parts, locale)}
        className="font-mono tabular-nums"
      />
    );
  }
  return <span className="font-mono tabular-nums text-text-primary">{label}</span>;
}

/** One labelled row: name (+ optional short-ability tag) · value · auto-fail mark. */
function Row({
  name,
  tag,
  children,
}: {
  name: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="scp-row">
      <span className="scp-row-name">{name}</span>
      {tag && <span className="scp-row-tag">{tag}</span>}
      {children}
    </li>
  );
}

export function SavesChecksPanel() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();

  // Narrow selectors → render isolation (§7.2): the panel reads the sheet + the
  // session slices the derivation needs, NOT the whole doc, so a center HP/round
  // change can't re-render it (mirrors LeftHud).
  const charData = useCharacterStore((s) => s.character?.character);
  const exhaustion = useCharacterStore((s) => s.character?.session.exhaustion ?? 0);
  const activeFeatures = useCharacterStore((s) => s.character?.session.activeFeatures);
  const conditions = useCharacterStore((s) => s.character?.session.conditions);
  const grantBundleChoices = useCharacterStore(
    (s) => s.character?.session.grantBundleChoices
  );

  const data = useMemo(
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

  // Skills read best alphabetically by localized name (the rail's order).
  const skills = useMemo(
    () =>
      (data?.skills ?? [])
        .map((s) => ({ ...s, name: t(`skills.${s.id}`) }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [data, t, locale]
  );

  if (!data) return null;

  return (
    <details className="saves-checks folio-panel">
      <summary className="scp-summary">
        <span className="scp-diamond" aria-hidden />
        <span className="scp-title">{t("combat.savesChecksTitle")}</span>
        {/* HONESTY (golden rule 21) — the panel shows your modifiers only; you
            roll your own physical die. This hint keeps that contract visible. */}
        <span className="scp-hint">{t("combat.savesChecksHint")}</span>
        <span className="scp-chevron" aria-hidden />
      </summary>
      <div className="scp-body">
        {/* Saves — the six ability modifiers, each with its auto-fail mark. */}
        <section className="scp-col">
          <h4 className="scp-subhead">{t("character.savingThrows")}</h4>
          <ul className="scp-list">
            {data.saves.map((s) => (
              <Row key={s.id} name={t(`abilities.${s.id}`)}>
                <ValueCell bonus={s.bonus} parts={s.breakdownParts} locale={locale} />
                {s.autoFailCause && (
                  <AutoFailMark
                    cause={s.autoFailCause}
                    ability={s.id}
                    t={t}
                    locale={locale}
                  />
                )}
              </Row>
            ))}
          </ul>
        </section>

        {/* Skills — the full list, each with its short-ability tag. */}
        <section className="scp-col">
          <h4 className="scp-subhead">{t("character.skills")}</h4>
          <ul className="scp-list">
            {skills.map((s) => (
              <Row key={s.id} name={s.name} tag={t(`abilities.${s.ability}_short`)}>
                <ValueCell bonus={s.bonus} parts={s.breakdownParts} locale={locale} />
              </Row>
            ))}
          </ul>
        </section>

        {/* Passives — the three passive scores (plain integers, no sign). */}
        <section className="scp-col">
          <h4 className="scp-subhead">{t("abilities.sensesLabel")}</h4>
          <ul className="scp-list">
            {data.passives.map((p) => (
              <Row key={p.id} name={t(p.labelKey)}>
                <ValueCell
                  bonus={p.bonus}
                  parts={p.override == null ? p.breakdownParts : null}
                  locale={locale}
                  format={String}
                />
              </Row>
            ))}
          </ul>
        </section>
      </div>
    </details>
  );
}

/** The crimson "auto-fail" mark (reuses the LeftHud/StatCard `.sc-autofail`
 *  recipe) — informational only; the modifier still reads (the player owns
 *  whether the gate applies). No number is altered. */
function AutoFailMark({
  cause,
  ability,
  t,
  locale,
}: {
  cause: string;
  ability: string;
  t: TFunction;
  locale: Locale;
}) {
  return (
    <span
      className="sc-autofail"
      title={t("abilities.autoFailSaveTitle", {
        ability: t(`abilities.${ability}`),
        condition: conditionLabel(cause, locale),
      })}
    >
      {t("abilities.autoFail")}
    </span>
  );
}
