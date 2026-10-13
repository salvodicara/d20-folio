import { useEffect, useReducer } from "react";
import { ensureSrdKind } from "@/i18n";
import { hasSrdKind, type LazySrdKind } from "@/i18n/srd-en";
import { useLocale } from "./useLocale";

/**
 * Load a lazy SRD catalogue (the bestiary's names) when `needed`, and say whether
 * it is ready for the current locale. True when it is not needed at all, so a
 * caller only waits for a catalogue it will actually read.
 */
export function useLazySrdKind(kind: LazySrdKind, needed: boolean): boolean {
  const { language } = useLocale();
  const resident = hasSrdKind(language, kind);
  const [, loaded] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (needed && !resident) void ensureSrdKind(kind).then(loaded);
  }, [kind, needed, resident]);
  return !needed || resident;
}
