/**
 * ImportCharacterHost — mounts the shared character-import flow at the SHELL level so
 * the "Ask the Folio" command palette can launch it from anywhere (OWN-28d). It owns
 * the hidden file input + review modal via {@link useCharacterImport}, and registers
 * its picker-opener in the {@link import-trigger} bridge for the palette to call.
 *
 * Rendered once, globally (AppShell). It draws nothing visible — only the hook's
 * hidden `element`.
 */

import { useEffect } from "react";
import { useCharacterImport } from "@/features/roster/use-character-import";
import { registerImportTrigger } from "@/features/roster/import-trigger";

export function ImportCharacterHost() {
  const { open, element } = useCharacterImport();
  useEffect(() => {
    registerImportTrigger(open);
    return () => registerImportTrigger(null);
  }, [open]);
  return element;
}
