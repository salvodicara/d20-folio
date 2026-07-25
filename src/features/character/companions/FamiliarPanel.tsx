/**
 * FamiliarPanel — the Find Familiar rail row + its stat-block modal (LAZY leaf).
 *
 * SEAM file: imports the monster corpus (`getMonster`) + the form picker, so it is
 * lazy-only (the eager-partition sweep pins it). Mounted by the Companions rail
 * ONLY when `session.familiar` exists, so a character without a familiar downloads
 * zero corpus bytes.
 *
 * The row = the DM-question facts (name · AC · HP ± steppers · pocket-dimension
 * chip); one tap opens the modal: the chosen form's stat block with the 2024 type
 * swap (`{ ...form, type }` — statistics verbatim, rendered by
 * `MonsterStatBlockCard`, never re-scaled), the familiar rules, and the Investment-
 * of-the-Chain-Master enhancements when present. A 0-HP familiar shows the honest
 * "disappears" state with Dismiss / Re-summon (never auto-deleted — the app never
 * destroys unconfirmed state).
 */

import { Suspense, lazy, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Minus } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/shared/ModalShell";
import { MonsterStatBlockCard } from "@/components/shared/MonsterStatBlockCard";
import { InfoCard } from "@/components/shared/InfoCard";
import { FamiliarEnhancementsCard } from "@/components/shared/FamiliarEnhancementsCard";
import { getMonster } from "@/data/monsters";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { FIND_FAMILIAR_SPELL_ID } from "@/lib/familiar-ids";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { localizeSrd } from "@/i18n/resolver";
import { ensureSrdKind } from "@/i18n";

// The form picker rides the SAME lazy chunk (both SEAM files) — the corpus is
// already resident when this panel renders, but keep the catalogue gate for the
// locale-switch case.
const FamiliarFormPicker = lazy(() =>
  Promise.all([import("./familiar-picker"), ensureSrdKind("monster")]).then(([m]) => ({
    default: m.FamiliarFormPicker,
  }))
);

export function FamiliarPanel() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const sheetMode = useUIStore((s) => s.sheetMode);
  const setCompanionHp = useCharacterStore((s) => s.setCompanionHp);
  const [statOpen, setStatOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const familiar = character?.session.familiar;
  const formIds = useMemo(
    () =>
      character
        ? aggregateCharacterGrants(character.character, character.session).familiarFormIds
        : new Set<string>(),
    [character]
  );

  if (!character || !familiar) return null;

  const form = getMonster(familiar.monsterId);
  const play = sheetMode === "play";
  const name = form ? localizeSrd("monster", form.id, "name", locale) : null;
  const maxHp = form?.hp.average ?? 0;
  const cur = character.session.companionHp?.[FIND_FAMILIAR_SPELL_ID]?.current ?? maxHp;
  const vanished = form != null && cur === 0;

  const reSummon = () => {
    setStatOpen(false);
    setPickerOpen(true);
  };
  const dismissForever = () => {
    setStatOpen(false);
    registerUndoableToast(
      { message: t("familiar.dismissForever") },
      () => useCharacterStore.getState().dismissFamiliar(),
      { turnScoped: false }
    );
  };
  const toggleDismissed = (dismissed: boolean) =>
    useCharacterStore.getState().setFamiliarDismissed(dismissed);

  return (
    <>
      <li className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => form && setStatOpen(true)}
          className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-left"
          disabled={!form}
        >
          <span className="text-[length:var(--text-micro)] uppercase tracking-wider text-text-tertiary">
            {t("familiar.eyebrow")}
          </span>
          <span className="text-text-primary">{name ?? t("familiar.unknownForm")}</span>
          {familiar.dismissed && (
            <span className="text-[length:var(--text-micro)] italic text-text-secondary">
              {t("familiar.dismissedChip")}
            </span>
          )}
          {form && !vanished && (
            <span className="text-[0.68rem] text-text-secondary">
              {t("stats.ac")}{" "}
              <span className="font-mono text-text-primary">{form.ac}</span>
            </span>
          )}
        </button>

        {form && vanished ? (
          <span className="inline-flex items-center gap-2 text-[0.68rem]">
            <span className="text-text-tertiary">{t("familiar.vanished")}</span>
            <button
              type="button"
              onClick={dismissForever}
              className="text-text-secondary underline hover:text-danger"
            >
              {t("familiar.dismissForever")}
            </button>
            <button
              type="button"
              onClick={reSummon}
              className="text-text-secondary underline hover:text-accent"
            >
              {t("familiar.summon")}
            </button>
          </span>
        ) : form ? (
          <span className="inline-flex items-center gap-1 text-[0.68rem] text-text-secondary">
            {play && (
              <button
                type="button"
                onClick={() => setCompanionHp(FIND_FAMILIAR_SPELL_ID, cur - 1)}
                className="flex h-4 w-4 items-center justify-center rounded border border-border text-text-secondary hover:border-danger hover:text-danger"
                aria-label={`−1 HP ${name ?? ""}`}
              >
                <Icon as={Minus} size="sm" decorative />
              </button>
            )}
            <span className="font-mono font-semibold text-text-primary">
              {cur} / {maxHp}
            </span>
            {play && (
              <button
                type="button"
                onClick={() =>
                  setCompanionHp(FIND_FAMILIAR_SPELL_ID, Math.min(maxHp, cur + 1))
                }
                className="flex h-4 w-4 items-center justify-center rounded border border-border text-text-secondary hover:border-success hover:text-success"
                aria-label={`+1 HP ${name ?? ""}`}
              >
                <Icon as={Plus} size="sm" decorative />
              </button>
            )}
          </span>
        ) : (
          <button
            type="button"
            onClick={reSummon}
            className="text-[0.68rem] text-text-secondary underline hover:text-accent"
          >
            {t("familiar.summon")}
          </button>
        )}
      </li>

      {/* The familiar stat block — the printed form with the 2024 type swap, the
          familiar rules, and (Pact of the Chain) the Chain-Master enhancements. */}
      <ModalShell
        open={statOpen && form != null}
        onClose={() => setStatOpen(false)}
        title={name ?? ""}
        size="md"
      >
        {form && (
          <div className="flex flex-col gap-3">
            <MonsterStatBlockCard
              monster={{ ...form, type: familiar.creatureType, typeTags: undefined }}
              locale={locale}
            />

            <InfoCard>
              <div className="mb-2 text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
                {t("familiar.rules")}
              </div>
              <ul className="flex flex-col gap-1 text-[0.72rem] text-text-secondary">
                <li>{t("familiar.ruleTelepathy")}</li>
                <li>{t("familiar.ruleSenses")}</li>
                <li>{t("familiar.ruleTouch")}</li>
                <li>{t("familiar.ruleNoAttack")}</li>
              </ul>
            </InfoCard>

            <FamiliarEnhancementsCard character={character} locale={locale} />

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {familiar.dismissed ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => toggleDismissed(false)}
                >
                  {t("familiar.recall")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => toggleDismissed(true)}
                >
                  {t("familiar.dismissTemp")}
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={reSummon}>
                {t("familiar.changeForm")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="icon-danger"
                onClick={dismissForever}
              >
                {t("familiar.dismissForever")}
              </Button>
            </div>
          </div>
        )}
      </ModalShell>

      {pickerOpen && (
        <Suspense fallback={null}>
          <FamiliarFormPicker
            formIds={formIds}
            currentType={familiar.creatureType}
            onClose={() => setPickerOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
