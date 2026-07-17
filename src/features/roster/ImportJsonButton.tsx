/**
 * ImportJsonButton — roster header action that brings a character JSON export back
 * into the signed-in user's folio.
 *
 * Thin wrapper over the shared {@link useCharacterImport} hook (the importer, the
 * smart-match review modal, the toasts, and the dev-bypass guard all live there, so
 * the SAME flow can also be driven from the command palette — OWN-28d). This file is
 * just the roster's labelled entry point: render the hook's hidden `element` and a
 * Button that calls `open()`.
 */

import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useCharacterImport } from "@/features/roster/use-character-import";

export function ImportJsonButton() {
  const { t } = useTranslation();
  const { open, element } = useCharacterImport();
  return (
    <>
      {element}
      <Button variant="ghost" onClick={open}>
        <Icon as={Upload} size="sm" decorative />
        {t("roster.importJson")}
      </Button>
    </>
  );
}
