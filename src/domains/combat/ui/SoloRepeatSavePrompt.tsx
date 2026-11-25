/**
 * A repeat save due at a solo turn edge (#1333), on the player's own sheet: the
 * campaign RepeatSavePrompt's look and answers (Foundry's «save at the end of turn»),
 * for a condition the sheet holds from a known source. «Saved: end it» ends the
 * cast's conditions, «Failed: it stays» keeps them; each is one undo. The Play
 * screen shows this strip; the classic sheet shows the same strips in its own banner
 * (`SoloRepeatSaveBanner`), both read through `useSoloRepeatSaveStrips`.
 */
import { useTranslation } from "react-i18next";

import { Button } from "@/ui";

import { useSoloRepeatSaveStrips } from "./use-solo-repeat-save-strips";

/** The strips on the Play screen, in the campaign prompt's look. */
export function SoloRepeatSavePrompts() {
  const { t } = useTranslation();
  const strips = useSoloRepeatSaveStrips();
  if (strips.length === 0) return null;
  return (
    <>
      {strips.map((strip) => (
        <div
          key={strip.id}
          className="f-note f-save-due"
          data-c="cond"
          role="group"
          aria-label={strip.condition}
        >
          <p>{strip.text}</p>
          <div className="f-acts">
            <Button kind="primary" onClick={strip.saved}>
              {t("combat.repeatSaveSucceeded")}
            </Button>
            <Button kind="ghost" onClick={strip.failed}>
              {t("combat.repeatSaveFailed")}
            </Button>
          </div>
        </div>
      ))}
    </>
  );
}
