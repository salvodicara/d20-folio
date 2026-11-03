/**
 * Entering and leaving a form, each with its undo toast (edge-case family M2): the
 * one way every picker assumes a form and every screen reverts it. The toast names
 * the form: "Polymorphed: Brown Bear", "Wild Shape: Wolf".
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { BeastStatBlock } from "@/data/types";
import { useLocale } from "@/hooks/useLocale";
import { localizeSrd } from "@/i18n/resolver";
import { formSourceKind, selfFormRule } from "@/lib/polymorph";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { transformFormLabel } from "./transform-form-label";

export function useFormActions() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const assumePolymorphForm = useCharacterStore((s) => s.assumePolymorphForm);
  const dropPolymorphForm = useCharacterStore((s) => s.dropPolymorphForm);

  const assume = useCallback(
    (form: BeastStatBlock, sourceId: string) => {
      const bestiary = selfFormRule(sourceId).pool === "bestiary";
      const message = transformFormLabel(
        t,
        sourceId,
        localizeSrd(bestiary ? "monster" : "beasts", form.id, "name", locale),
        localizeSrd(formSourceKind(sourceId), sourceId, "name", locale)
      );
      registerUndoableToast(
        { message },
        () => assumePolymorphForm(form.id, sourceId, bestiary ? form : undefined),
        { turnScoped: false }
      );
    },
    [assumePolymorphForm, t, locale]
  );

  const revert = useCallback(() => {
    registerUndoableToast({ message: t("polymorph.revert") }, () => dropPolymorphForm(), {
      turnScoped: false,
    });
  }, [dropPolymorphForm, t]);

  return { assume, revert };
}
